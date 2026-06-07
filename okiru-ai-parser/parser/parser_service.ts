import { createLogger } from '../src/logger.js';
import type { OntologyRepository } from '../graph/ontology_models.js';
import { InMemoryOntologyRepository } from '../graph/ontology_queries.js';
import type { ParserOutput, RawExtractionInput } from '../schemas/parser_output.js';
import { parserOutputSchema } from '../schemas/parser_output.js';
import { classifyDocument } from './classify_document.js';
import { buildCalculatorPayload } from './calculator_mapper.js';
import { extractFields } from './extract_fields.js';
import { parseRawExtractionInput } from './ingest.js';
import { validateExtractedFields } from './validate.js';

const logger = createLogger('ParserService');

export class ParserService {
  constructor(private repository: OntologyRepository = new InMemoryOntologyRepository()) {}

  async resolve(raw: unknown): Promise<ParserOutput> {
    const input: RawExtractionInput = parseRawExtractionInput(raw);
    logger.info('Parser resolve started', { fileId: input.file_id, filename: input.filename });

    const classification = await classifyDocument(input, this.repository);
    logger.info('Document classified', {
      fileId: input.file_id,
      documentType: classification.document_type,
      confidence: classification.confidence,
    });

    const knowledge = await this.repository.getDocumentKnowledge(classification.document_type);
    if (!knowledge || classification.confidence < 0.6) {
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
          errors: ['Unsupported or low-confidence document type'],
          missing_fields: [],
        },
        audit_trail: {
          source_file: input.filename,
          matched_patterns: classification.matched_evidence,
          rules_applied: [],
          graph_version: 'v1',
          requires_human_review: true,
        },
      });
    }

    const extracted = extractFields(input, knowledge.fields);
    logger.info('Fields extracted', { fileId: input.file_id, fields: Object.keys(extracted).length });

    const validation = validateExtractedFields(knowledge.fields, extracted, classification.confidence);
    logger.info('Parser validation completed', {
      fileId: input.file_id,
      passed: validation.passed,
      warnings: validation.warnings.length,
      errors: validation.errors.length,
    });

    const calculatorPayload = buildCalculatorPayload(knowledge.fields, extracted, validation.safe_fields);
    const requiresReview = !validation.passed || classification.confidence < 0.85;
    const status = validation.errors.length > 0 && classification.confidence < 0.6
      ? 'failed'
      : requiresReview
        ? 'review_required'
        : 'passed';

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

    return parserOutputSchema.parse({
      file_id: input.file_id,
      filename: input.filename,
      document_type: knowledge.document.name,
      pillar: knowledge.document.pillar_code,
      overall_confidence: classification.confidence,
      status,
      extracted_fields: extractedFields,
      calculator_payload: status === 'passed' ? calculatorPayload : calculatorPayload,
      validation: {
        passed: validation.passed,
        warnings: validation.warnings,
        errors: validation.errors,
        missing_fields: validation.missing_fields,
      },
      audit_trail: {
        source_file: input.filename,
        matched_patterns: matchedPatterns,
        rules_applied: validation.rules_applied,
        graph_version: knowledge.document.graph_version,
        requires_human_review: requiresReview,
      },
    });
  }
}
