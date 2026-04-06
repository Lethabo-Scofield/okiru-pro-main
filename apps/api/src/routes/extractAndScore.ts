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
import { buildManifest, getAllEntities, toExtractionRequest } from '../../pipeline/extraction/entityManifest.js';
import { LLMExtractor } from '../../pipeline/extraction/llmExtractor.js';
import type { LLMExtractionRequest } from '../../pipeline/extraction/llmExtractor.js';
import {
  entityResultsToParseResult,
  buildConfidenceReport,
} from '../../pipeline/extraction/entityToParseResult.js';
import { buildPipelineResult } from '../../pipeline/buildResult.js';
import { generateScorecardSummary } from '../../pipeline/scorecardSummaryGenerator.js';

const router = Router();

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
    const confidence = buildConfidenceReport(extractionResults, requiredRoles);

    return res.json({
      success: true,
      scorecard,
      scorecardSummary,
      confidence,
      extractedEntities: extractionResults.filter(
        (r) => r.extractedValue !== null,
      ).length,
      totalEntities: extractionResults.length,
      sectorCode,
      scorecardType,
      clientName: clientName ?? parseResult.client.name,
    });
  } catch (err) {
    console.error('[extract-and-score] Error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Extraction failed',
    });
  }
});

export default router;
