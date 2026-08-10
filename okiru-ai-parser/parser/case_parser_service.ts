import type { OntologyRepository } from '../graph/ontology_models.js';
import { InMemoryOntologyRepository } from '../graph/ontology_queries.js';
import type { ParserCaseOutput, ParserOutput, RawExtractionInput } from '../schemas/parser_output.js';
import { parserCaseOutputSchema, parserOutputSchema } from '../schemas/parser_output.js';
import { ParserService } from './parser_service.js';

export interface RequiredDocumentGroup {
  key: string;
  label: string;
  /** Any non-failed document of one of these types satisfies the group. */
  types: string[];
  /** Pillar this evidence feeds (OWN/MAC/SKL/ESD/SED/FIN/SECTOR). */
  pillar?: string;
  /** True when the group is required for the case to be complete (default true). */
  required?: boolean;
  /**
   * True when the parser has an extractor that pulls values from this document
   * type (feeds the workbook/score). False = evidence the verifier needs but
   * the parser cannot yet read (user still uploads it / captures it manually).
   */
  autoExtract?: boolean;
  /** Short guidance shown under the checklist row. */
  note?: string;
}

/**
 * Case-level required-document groups. Exported so the UI can render the
 * preset "documents expected to be uploaded" checklist from the same source
 * the case parser enforces (GET /api/parser/document-types).
 */
export const REQUIRED_DOCUMENT_GROUPS: RequiredDocumentGroup[] = [
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

export interface CalculatorFieldConflict {
  key: string;
  values: unknown[];
  sources: string[];
}

/**
 * Combines calculator payloads across a case, but only from fully PASSED
 * documents (review_required/failed carry no payload). When two passed
 * documents disagree on the same calculator key, the value is withheld and the
 * conflict is surfaced — one passed document must never silently overwrite
 * another. Conflicting keys never enter the merged payload.
 */
function mergeCalculatorPayload(documents: ParserOutput[]): {
  payload: Record<string, unknown>;
  conflicts: CalculatorFieldConflict[];
} {
  const seen = new Map<string, { value: unknown; sources: string[] }[]>();

  for (const document of documents) {
    if (document.status !== 'passed') continue;
    for (const [key, value] of Object.entries(document.calculator_payload)) {
      const bucket = seen.get(key) ?? [];
      const existing = bucket.find((entry) => sameValue(entry.value, value));
      if (existing) existing.sources.push(document.filename);
      else bucket.push({ value, sources: [document.filename] });
      seen.set(key, bucket);
    }
  }

  const payload: Record<string, unknown> = {};
  const conflicts: CalculatorFieldConflict[] = [];
  for (const [key, bucket] of seen.entries()) {
    if (bucket.length === 1) {
      payload[key] = bucket[0].value;
    } else {
      conflicts.push({
        key,
        values: bucket.map((entry) => entry.value),
        sources: bucket.flatMap((entry) => entry.sources),
      });
    }
  }

  return { payload, conflicts };
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
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

function resolveCaseStatus(
  documents: ParserOutput[],
  missingDocuments: string[],
  conflicts: CalculatorFieldConflict[],
): ParserCaseOutput['status'] {
  if (documents.length === 0 || documents.every((document) => document.status === 'failed')) return 'failed';
  if (
    missingDocuments.length > 0
    || conflicts.length > 0
    || documents.some((document) => document.status !== 'passed')
  ) return 'review_required';
  return 'passed';
}

export class CaseParserService {
  private parser: ParserService;

  constructor(repository: OntologyRepository = new InMemoryOntologyRepository()) {
    this.parser = new ParserService(repository);
  }

  async resolveCase(rawInputs: RawExtractionInput[], caseId = caseIdFromInputs(rawInputs)): Promise<ParserCaseOutput> {
    // Per-input failure isolation: one unreadable input becomes a FAILED
    // document entry the user can see — it must never kill a paid case whose
    // other 16 files just extracted. (A generic-mime workbook's split sheet did
    // exactly that: the whole stream ended with a zod error and no result.)
    const documents = await Promise.all(rawInputs.map(async (input) => {
      try {
        return await this.parser.resolve(input);
      } catch (error) {
        const filename = typeof (input as { filename?: unknown })?.filename === 'string' && (input as { filename: string }).filename
          ? (input as { filename: string }).filename
          : 'unknown file';
        const fileId = typeof (input as { file_id?: unknown })?.file_id === 'string' && (input as { file_id: string }).file_id
          ? (input as { file_id: string }).file_id
          : `unreadable_${filename.replace(/\W+/g, '_')}`;
        return parserOutputSchema.parse({
          file_id: fileId,
          filename,
          document_type: 'Unreadable document',
          pillar: 'UNKNOWN',
          overall_confidence: 0,
          status: 'failed',
          extracted_fields: {},
          calculator_payload: {},
          validation: {
            passed: false,
            warnings: [],
            errors: [error instanceof Error ? error.message : String(error)],
            missing_fields: [],
          },
          audit_trail: {
            source_file: filename,
            matched_patterns: [],
            rules_applied: [],
            graph_version: 'v1',
            requires_human_review: true,
          },
        });
      }
    }));
    const missingDocuments = missingRequiredDocuments(documents);
    const { payload: mergedPayload, conflicts } = mergeCalculatorPayload(documents);
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
      status: resolveCaseStatus(documents, missingDocuments, conflicts),
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
        parser_output: document,
      })),
      fields_extracted: Object.fromEntries(
        documents.map((document) => [document.filename, document.extracted_fields]),
      ),
      calculator_payload: mergedPayload,
      supplier_rows: documents.flatMap((document) => (
        (document.supplier_rows ?? []).map((row) => ({ ...row, source_file: document.filename }))
      )),
      // TMPS denominator: first document that stated an explicit total wins.
      measured_procurement_spend: documents
        .map((document) => document.measured_procurement_spend)
        .find((value): value is number => typeof value === 'number' && value > 0) ?? null,
      missing_required_documents: missingDocuments,
      documents_needing_review: documentsNeedingReview,
      audit_trail: {
        document_count: documents.length,
        passed_documents: documents.filter((document) => document.status === 'passed').length,
        review_required_documents: documents.filter((document) => document.status === 'review_required').length,
        failed_documents: documents.filter((document) => document.status === 'failed').length,
        source_files: documents.map((document) => document.filename),
        notes: [
          ...(missingDocuments.length > 0
            ? [`Missing required document groups: ${missingDocuments.join(', ')}`]
            : []),
          ...conflicts.map((conflict) => (
            `Conflicting values for ${conflict.key} across documents (${conflict.sources.join(', ')}); value withheld from calculator payload`
          )),
        ],
        conflicting_fields: conflicts,
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
