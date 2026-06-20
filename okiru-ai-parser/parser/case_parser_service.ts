import type { OntologyRepository } from '../graph/ontology_models.js';
import { InMemoryOntologyRepository } from '../graph/ontology_queries.js';
import type { ParserCaseOutput, ParserOutput, RawExtractionInput } from '../schemas/parser_output.js';
import { parserCaseOutputSchema } from '../schemas/parser_output.js';
import { ParserService } from './parser_service.js';

const REQUIRED_DOCUMENT_GROUPS = [
  {
    key: 'supplier_bbee_evidence',
    label: 'B-BBEE Certificate or Sworn Affidavit',
    types: ['B-BBEE Certificate', 'B-BBEE Sworn Affidavit'],
  },
  {
    key: 'supplier_spend_schedule',
    label: 'Supplier Spend Schedule',
    types: ['Supplier Spend Schedule'],
  },
];

function caseIdFromInputs(inputs: RawExtractionInput[]): string {
  const explicit = inputs
    .map((input) => input.metadata?.case_id)
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
  return explicit ?? `case_${Date.now()}`;
}

function mergeCalculatorPayload(documents: ParserOutput[]): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const document of documents) {
    if (document.status === 'failed') continue;
    Object.assign(payload, document.calculator_payload);
  }
  return payload;
}

function reviewReasons(document: ParserOutput): string[] {
  return [
    ...document.validation.errors,
    ...document.validation.warnings,
    ...document.validation.missing_fields.map((field) => `${field} missing`),
  ].filter((reason, index, all) => reason && all.indexOf(reason) === index);
}

function missingRequiredDocuments(documents: ParserOutput[]): string[] {
  return REQUIRED_DOCUMENT_GROUPS
    .filter((group) => !documents.some((document) => (
      document.status !== 'failed' && group.types.includes(document.document_type)
    )))
    .map((group) => group.label);
}

function resolveCaseStatus(documents: ParserOutput[], missingDocuments: string[]): ParserCaseOutput['status'] {
  if (documents.length === 0 || documents.every((document) => document.status === 'failed')) return 'failed';
  if (missingDocuments.length > 0 || documents.some((document) => document.status !== 'passed')) return 'review_required';
  return 'passed';
}

export class CaseParserService {
  private parser: ParserService;

  constructor(repository: OntologyRepository = new InMemoryOntologyRepository()) {
    this.parser = new ParserService(repository);
  }

  async resolveCase(rawInputs: RawExtractionInput[], caseId = caseIdFromInputs(rawInputs)): Promise<ParserCaseOutput> {
    const documents = await Promise.all(rawInputs.map((input) => this.parser.resolve(input)));
    const missingDocuments = missingRequiredDocuments(documents);
    const documentsNeedingReview = documents
      .filter((document) => document.status !== 'passed')
      .map((document) => ({
        filename: document.filename,
        document_type: document.document_type,
        status: document.status,
        reasons: reviewReasons(document),
      }));

    const output: ParserCaseOutput = {
      case_id: caseId,
      status: resolveCaseStatus(documents, missingDocuments),
      documents_detected: documents.map((document) => ({
        file_id: document.file_id,
        filename: document.filename,
        document_type: document.document_type,
        status: document.status,
        overall_confidence: document.overall_confidence,
        extracted_fields: document.extracted_fields,
        calculator_payload: document.calculator_payload,
        validation: {
          warnings: document.validation.warnings,
          errors: document.validation.errors,
          missing_fields: document.validation.missing_fields,
        },
      })),
      fields_extracted: Object.fromEntries(
        documents.map((document) => [document.filename, document.extracted_fields]),
      ),
      calculator_payload: mergeCalculatorPayload(documents),
      missing_required_documents: missingDocuments,
      documents_needing_review: documentsNeedingReview,
      audit_trail: {
        document_count: documents.length,
        passed_documents: documents.filter((document) => document.status === 'passed').length,
        review_required_documents: documents.filter((document) => document.status === 'review_required').length,
        failed_documents: documents.filter((document) => document.status === 'failed').length,
        source_files: documents.map((document) => document.filename),
        notes: missingDocuments.length > 0
          ? [`Missing required document groups: ${missingDocuments.join(', ')}`]
          : [],
        document_audits: documents.map((document) => ({
          filename: document.filename,
          document_type: document.document_type,
          matched_patterns: document.audit_trail.matched_patterns,
          classification_reason: document.audit_trail.classification_reason,
          requires_human_review: document.audit_trail.requires_human_review,
        })),
      },
    };

    return parserCaseOutputSchema.parse(output);
  }
}
