import { createLogger } from '../src/logger.js';
import type { OntologyRepository } from '../graph/ontology_models.js';
import { InMemoryOntologyRepository } from '../graph/ontology_queries.js';
import type { ParserOutput, RawExtractionInput } from '../schemas/parser_output.js';
import { parserOutputSchema } from '../schemas/parser_output.js';
import { classifyDocument } from './classify_document.js';
import { mapCalculatorPayload } from './calculator_mapper.js';
import { extractFields } from './extract_fields.js';
import { extractSupplierRows, extractMeasuredProcurementSpend } from './extract_supplier_rows.js';
import { parseRawExtractionInput } from './ingest.js';
import { validateExtractedFields } from './validate.js';
import type { AdjudicationCandidate, DocumentTypeAdjudicator } from './type_adjudicator.js';
import type { DocumentClassification } from '../schemas/document_types.js';

const logger = createLogger('ParserService');

export interface ParserServiceOptions {
  /**
   * A reader consulted when the lexical classifier cannot decide. Optional:
   * without one the lexical decision stands — and extraction still runs.
   */
  adjudicator?: DocumentTypeAdjudicator;
}

/** Matches the classifier's PASS_CONFIDENCE — above it, no review flag for type. */
const ADJUDICATED_PASS = 0.85;

export class ParserService {
  private readonly adjudicator?: DocumentTypeAdjudicator;

  constructor(
    private repository: OntologyRepository = new InMemoryOntologyRepository(),
    options: ParserServiceOptions = {},
  ) {
    this.adjudicator = options.adjudicator;
  }

  /**
   * Let a reader settle what the lexical classifier could not.
   *
   * Only the undecided outcomes go to the model — a confident lexical
   * classification is never second-guessed, and a compendium (many types at
   * once) is not a single-type question. The model chooses from the lexical
   * SHORTLIST, so it can only ever land on a type the ontology knows.
   */
  private async adjudicate(
    input: RawExtractionInput,
    classification: DocumentClassification,
  ): Promise<DocumentClassification> {
    if (!this.adjudicator) return classification;
    if (classification.status !== 'low_confidence' && classification.status !== 'ambiguous') return classification;
    const shortlist = (classification.candidates ?? []).filter((c) => c.confidence > 0);
    if (shortlist.length === 0) return classification;

    const descriptions = new Map<string, string>();
    try {
      for (const doc of await this.repository.listDocumentTypes()) descriptions.set(doc.name.toLowerCase(), doc.description);
    } catch {
      // Descriptions are an enrichment; the adjudicator has the matrix too.
    }
    const candidates: AdjudicationCandidate[] = shortlist.map((c) => ({
      name: c.document_type,
      pillar: c.pillar,
      lexicalConfidence: c.confidence,
      description: descriptions.get(c.document_type.toLowerCase()) ?? c.document_type,
      expectedFields: [],
    }));

    let verdict: Awaited<ReturnType<DocumentTypeAdjudicator>> = null;
    try {
      verdict = await this.adjudicator(
        { filename: input.filename, raw_text: input.raw_text, markdown: input.markdown },
        candidates,
      );
    } catch (err) {
      logger.warn('Type adjudication threw — lexical classification stands', {
        fileId: input.file_id, reason: (err as Error).message,
      });
      return classification;
    }
    if (!verdict) return classification;

    const chosen = shortlist.find((c) => c.document_type.toLowerCase() === verdict!.documentType.toLowerCase());
    if (!chosen) return classification;

    const confident = verdict.confidence >= ADJUDICATED_PASS;
    logger.info('Document type adjudicated', {
      fileId: input.file_id,
      from: classification.document_type,
      to: chosen.document_type,
      lexical: classification.confidence,
      confidence: verdict.confidence,
    });
    return {
      ...classification,
      document_type: chosen.document_type,
      pillar: chosen.pillar,
      confidence: verdict.confidence,
      matched_evidence: chosen.matched_evidence,
      status: confident ? 'classified' : 'ambiguous',
      margin: verdict.confidence - Math.max(0, ...shortlist.filter((c) => c !== chosen).map((c) => c.confidence)),
      reason: confident
        ? `Read as ${chosen.document_type}: ${verdict.reason || 'distinctive features present'}`
        : `Read as ${chosen.document_type} with some doubt: ${verdict.reason || 'purpose clear, layout unusual'}`,
    };
  }

  /** The honest empty result: nothing identified, nothing read, why. */
  private nothingRead(input: RawExtractionInput, classification: DocumentClassification): ParserOutput {
    return parserOutputSchema.parse({
      file_id: input.file_id,
      filename: input.filename,
      document_type: classification.document_type,
      pillar: classification.pillar,
      overall_confidence: classification.confidence,
      status: 'failed',
      extracted_fields: {},
      calculator_payload: {},
      validation: {
        passed: false,
        warnings: [],
        errors: [classification.reason || 'Unsupported or low-confidence document type'],
        missing_fields: [],
      },
      audit_trail: {
        source_file: input.filename,
        matched_patterns: classification.matched_evidence,
        rules_applied: [],
        graph_version: 'v1',
        requires_human_review: true,
        classification_candidates: classification.candidates ?? [],
        classification_reason: classification.reason,
      },
    });
  }

  async resolve(raw: unknown): Promise<ParserOutput> {
    const input: RawExtractionInput = parseRawExtractionInput(raw);
    logger.info('Parser resolve started', { fileId: input.file_id, filename: input.filename });

    const lexical = await classifyDocument(input, this.repository);
    logger.info('Document classified', {
      fileId: input.file_id,
      documentType: lexical.document_type,
      confidence: lexical.confidence,
      classificationStatus: lexical.status,
      margin: lexical.margin,
    });
    const classification = await this.adjudicate(input, lexical);

    const fallbackRepository = new InMemoryOntologyRepository();
    const knowledge = await this.repository.getDocumentKnowledge(classification.document_type)
      ?? await fallbackRepository.getDocumentKnowledge(classification.document_type);
    // The ONLY reasons to return nothing: no ontology type matched at all, or
    // the type has no knowledge record to extract against. A LOW score for the
    // correct type used to land here too, and that gate threw away every SETA
    // certificate, EEA1 declaration, supplier affidavit and graduation invoice
    // in a real pack — the classifier's top pick was RIGHT in all of them, just
    // scored 0.1–0.5 by keyword overlap. Doubt is a review flag, not a bin.
    if (!knowledge || classification.status === 'unsupported') {
      return this.nothingRead(input, classification);
    }

    // NOTE: neither 'ambiguous' nor 'low_confidence' short-circuits. Both used
    // to return early with `extracted_fields: {}`, which meant any document the
    // keyword scorer was unsure about was reported with NOTHING read out of it.
    //
    // An uncertain document type is a reason to SHOW the user what we found and
    // flag it, not to discard the evidence. Extraction and validation run; the
    // classification doubt is carried into the warnings below, and the
    // calculator-payload gate further down is unchanged — an unresolved
    // document still contributes nothing to scoring.
    //
    // One discipline for the still-undecided case (low score, no reader to
    // settle it): the document must identify ITSELF. Heuristics are off (the
    // name/date/money guessers would read a "beneficiary" out of a lunch menu),
    // and the read only stands if the document literally names at least two of
    // the type's fields — "SETA name:", "Registration date:". A type's own
    // regex patterns are not enough on their own: some are loose enough to
    // match "Chicken sandwich: R85". Two self-labelled fields is the document
    // speaking the type's language; anything less is honestly nothing read.
    const undecided = classification.status === 'low_confidence';
    const extracted = extractFields(input, knowledge.fields, { labelledOnly: undecided });
    logger.info('Fields extracted', { fileId: input.file_id, fields: Object.keys(extracted).length });
    if (undecided) {
      const selfLabelled = Object.entries(extracted)
        .filter(([name, field]) => field.matched_patterns.includes(name)).length;
      if (selfLabelled < 2) return this.nothingRead(input, classification);
    }

    const validation = validateExtractedFields(knowledge.fields, extracted, classification.confidence);
    logger.info('Parser validation completed', {
      fileId: input.file_id,
      passed: validation.passed,
      warnings: validation.warnings.length,
      errors: validation.errors.length,
    });

    const requiresReview = !validation.passed || classification.confidence < 0.85;
    const status = validation.errors.length > 0 && classification.confidence < 0.6
      ? 'failed'
      : requiresReview
        ? 'review_required'
        : 'passed';
    // Safety gate: the calculator payload is produced ONLY for a fully passed
    // document. review_required and failed always return an empty payload — a
    // single safe field must never leak into calculation while the document as
    // a whole is unresolved.
    const mapping = status === 'passed'
      ? mapCalculatorPayload(knowledge.fields, extracted, validation.safe_fields)
      : { payload: {}, rejected: [] as Array<{ key: string; reason: string }> };
    const calculatorPayload = mapping.payload;
    if (mapping.rejected.length > 0) {
      logger.warn('Rejected calculator keys outside allowlist', {
        fileId: input.file_id,
        rejected: mapping.rejected,
      });
    }

    const extractedFields = Object.fromEntries(
      Object.entries(extracted).map(([key, value]) => {
        const { matched_patterns: _matchedPatterns, ...field } = value;
        return [key, field];
      }),
    );

    const matchedPatterns = Array.from(new Set([
      ...classification.matched_evidence,
      ...Object.values(extracted).flatMap((field) => field.matched_patterns),
    ]));

    // Supplier spend schedules list many suppliers; extract each as its own
    // calculator-ready row. Only attempted for schedule documents.
    const isSchedule = /supplier\s+spend\s+schedule/i.test(knowledge.document.name);
    const supplierRows = isSchedule
      ? extractSupplierRows({ raw_text: input.raw_text, tables: input.tables })
      : [];
    // TMPS (procurement denominator) — only from an explicit labelled total.
    const measuredProcurementSpend = isSchedule
      ? extractMeasuredProcurementSpend({ raw_text: input.raw_text })
      : null;

    return parserOutputSchema.parse({
      file_id: input.file_id,
      filename: input.filename,
      document_type: knowledge.document.name,
      pillar: knowledge.document.pillar_code,
      overall_confidence: classification.confidence,
      status,
      extracted_fields: extractedFields,
      calculator_payload: calculatorPayload,
      supplier_rows: supplierRows,
      measured_procurement_spend: measuredProcurementSpend,
      validation: {
        passed: validation.passed,
        // Doubt about the document TYPE is surfaced alongside field-level
        // warnings, so an uncertain classification is visible to the user
        // rather than silently costing them their extracted values. Applies
        // to a low lexical score too, now that it no longer discards the file.
        warnings: classification.status === 'ambiguous' || classification.status === 'low_confidence'
          ? [classification.reason || 'Document type requires human review', ...validation.warnings]
          : validation.warnings,
        errors: validation.errors,
        missing_fields: validation.missing_fields,
      },
      audit_trail: {
        source_file: input.filename,
        matched_patterns: matchedPatterns,
        rules_applied: validation.rules_applied,
        graph_version: knowledge.document.graph_version,
        requires_human_review: requiresReview,
        classification_candidates: classification.candidates ?? [],
        classification_reason: classification.reason,
        rejected_calculator_keys: mapping.rejected,
      },
    });
  }
}
