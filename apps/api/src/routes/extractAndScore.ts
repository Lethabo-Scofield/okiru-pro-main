/**
 * POST /api/extract-and-score
 *
 * End-to-end pipeline:
 *   documentTexts[] + sectorCode + scorecardType + clientName
 *   → buildManifestForSector()
 *   → Groq LLM extraction (LLMExtractor.extractBatch)
 *   → entityToParseResult()
 *   → buildPipelineResult()
 *   → { scorecard: PipelineResult, confidence: PillarConfidence[], extractedEntities: count }
 */

import { Router } from 'express';
import { createLogger } from '../logger.js';
import { buildManifest, getAllEntities, toExtractionRequest } from '../../pipeline/extraction/entityManifest.js';

const logger = createLogger("ExtractAndScore");
import { LLMExtractor } from '../../pipeline/extraction/llmExtractor.js';
import type { LLMExtractionRequest } from '../../pipeline/extraction/llmExtractor.js';
import {
  entityResultsToParseResult,
  buildConfidenceReport,
} from '../../pipeline/extraction/entityToParseResult.js';
import { buildPipelineResult } from '../../pipeline/buildResult.js';
import { generateScorecardSummary } from '../../pipeline/scorecardSummaryGenerator.js';
import { resolveCaseWithParser, type ParserRawExtractionInput } from '../services/parserClient.js';
import { isTrustedParserSector, mapParserCaseToSectorInput } from '../services/parserSectorAdapter.js';

const router = Router();

/**
 * Deterministic supplier-evidence extraction via the okiru-ai-parser service.
 * Runs alongside the LLM and returns calculator-ready supplier inputs
 * (supplier.name / bee_level / black_ownership / spend) plus a per-document
 * review breakdown. Non-fatal: if the parser is unavailable the scorecard is
 * returned unchanged. This never overrides the LLM/scorecard — it augments the
 * response with a safe, auditable supplier-evidence layer.
 */
async function buildSupplierEvidence(
  documentTexts: string[],
  clientName: string | undefined,
  sectorCode: string,
  scorecardType: string,
): Promise<Record<string, unknown> | null> {
  if (process.env.PARSER_SUPPLIER_EVIDENCE_ENABLED === 'false') return null;

  const documents: ParserRawExtractionInput[] = documentTexts
    .map((text, index) => ({
      file_id: `doc_${index + 1}`,
      filename: `scorecard_document_${index + 1}.txt`,
      mime_type: 'text/plain',
      raw_text: text,
    }))
    .filter((doc) => doc.raw_text && doc.raw_text.trim().length > 0);

  if (documents.length === 0) return null;

  const outcome = await resolveCaseWithParser(documents, clientName ? `scorecard_${clientName}` : undefined);
  if (!outcome.ok || !outcome.result) {
    return { available: false, reason: outcome.error ?? 'parser_unavailable' };
  }

  const caseResult = outcome.result;

  // Sector-aware calculator input DRAFT — only for audited target sectors
  // (RCOGP/Generic, ICT/Generic). Maps passed parser output into the real
  // scorecard input shape where it can be mapped safely, and reports gaps.
  // This is a DRAFT for review, not live scoring input.
  let sectorScorecardInputDraft: Record<string, unknown> | null = null;
  if (isTrustedParserSector(sectorCode, scorecardType)) {
    const adapted = mapParserCaseToSectorInput(sectorCode, scorecardType, caseResult);
    sectorScorecardInputDraft = {
      sectorCode: adapted.sectorCode,
      scorecardType: adapted.scorecardType,
      suppliers: adapted.scorecardInputDraft.suppliers,
      contributions: adapted.scorecardInputDraft.contributions,
      tmps: adapted.scorecardInputDraft.tmps,
      mappedPillars: adapted.mappedPillars,
      unmappedPillars: adapted.unmappedPillars,
      rejectedKeys: adapted.rejectedKeys,
      procurementReadiness: adapted.procurementReadiness,
      procurementBlockers: adapted.procurementBlockers,
      audit: adapted.audit,
    };
  }

  return {
    available: true,
    status: caseResult.status,
    // Calculator-ready inputs, produced only from documents that fully passed
    // the parser's safety gate. review_required/failed contribute nothing here.
    calculatorInputs: caseResult.calculator_payload,
    // Per-supplier rows from any supplier spend schedule — the full procurement
    // supplier list, each row individually validated + allowlisted.
    supplierRows: caseResult.supplier_rows ?? [],
    // Sector-mapped DRAFT input (null for non-target sectors). Advisory only.
    sectorScorecardInputDraft,
    missingRequiredDocuments: caseResult.missing_required_documents,
    documentsNeedingReview: caseResult.documents_needing_review,
    documentsDetected: caseResult.documents_detected,
    auditTrail: caseResult.audit_trail,
  };
}

interface ExtractAndScoreBody {
  documentTexts: string[];            // raw text from each uploaded document
  sectorCode: string;                 // "RCOGP" | "ICT" | "FSC" | "AGRI"
  scorecardType: string;              // "Generic" | "QSE" | "EME"
  clientName?: string;
}

router.post('/extract-and-score', async (req, res) => {
  const body = req.body as ExtractAndScoreBody;
  const { documentTexts, sectorCode, scorecardType, clientName } = body;

  if (
    !Array.isArray(documentTexts) ||
    documentTexts.length === 0 ||
    !sectorCode ||
    !scorecardType
  ) {
    return res.status(400).json({
      error:
        'Body must include: documentTexts (non-empty array), sectorCode, scorecardType',
    });
  }

  if (!process.env.GROQ_API_KEY) {
    return res.status(503).json({
      error: 'GROQ_API_KEY is not configured on this server',
    });
  }

  try {
    // 1 — Build sector entity manifest
    const manifest = await buildManifest(
      sectorCode.toUpperCase(),
      scorecardType,
    );

    // 2 — Concatenate all document texts (with page separators)
    const combinedText = documentTexts
      .map((t, i) => `--- Document ${i + 1} ---\n${t}`)
      .join('\n\n');

    // 3 — Build LLM extraction requests: one per entity in the manifest
    const allFields = getAllEntities(manifest);
    const requests: LLMExtractionRequest[] = allFields.map((field) =>
      toExtractionRequest(field, combinedText, 'combined') as LLMExtractionRequest,
    );

    // 4 — Run Groq extraction
    const extractor = new LLMExtractor();
    const extractionResults = await extractor.extractBatch(requests);

    const validEntitiesCount = extractionResults.filter(r => r.extractedValue !== null).length;
    
    if (validEntitiesCount === 0 && requests.length > 0) {
      return res.status(422).json({
        error: "Document contains insufficient B-BBEE data. The system could not extract any required scorecard fields from the text."
      });
    }

    const completenessRatio = requests.length > 0 ? validEntitiesCount / requests.length : 0;
    if (completenessRatio < 0.1) {
      return res.status(422).json({
        error: `Insufficient data structure (${Math.round(completenessRatio * 100)}% parsed). A valid B-BBEE scorecard cannot be generated from this document's content.`
      });
    }

    // 5 — Map to ParseResult
    const parseResult = entityResultsToParseResult(extractionResults, {
      clientName: clientName ?? 'Unnamed Entity',
      industrySector: sectorCode,
      applicableScorecard: scorecardType,
    });

    // 6 — Run sector-aware scorecard calculation
    const filename = `${sectorCode}_${scorecardType}_${clientName ?? 'entity'}`;
    const scorecard = buildPipelineResult(parseResult, filename);

    // 6.5 — Generate formatted scorecard summary
    const scorecardSummary = generateScorecardSummary(scorecard);

    // 7 — Build confidence report for the UI
    const requiredRoles = allFields.map((f) => f.name);
    const fieldToPillar: Record<string, string> = {};
    for (const f of allFields) {
      fieldToPillar[f.name] = f.pillarCode;
    }
    const confidence = buildConfidenceReport(extractionResults, requiredRoles, fieldToPillar);

    // 8 — Deterministic supplier-evidence layer (parser). Non-fatal augmentation.
    const supplierEvidence = await buildSupplierEvidence(documentTexts, clientName, sectorCode, scorecardType);

    return res.json({
      success: true,
      scorecard,
      scorecardSummary,
      confidence,
      supplierEvidence,
      extractedEntities: extractionResults.filter(
        (r) => r.extractedValue !== null,
      ).length,
      totalEntities: extractionResults.length,
      sectorCode,
      scorecardType,
      clientName: clientName ?? parseResult.client.name,
    });
  } catch (err) {
    logger.error('Extraction failed', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Extraction failed',
    });
  }
});

export default router;
