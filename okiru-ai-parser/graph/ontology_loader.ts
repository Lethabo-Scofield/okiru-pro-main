import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import { createLogger } from '../src/logger.js';
import type { FieldKnowledge, OntologyRecord, OntologyRepository } from './ontology_models.js';
import { defaultDocumentKnowledge } from './ontology_queries.js';
import { borrowedCanonicalFields } from './matrix_ontology.js';
import { asksForOneRecordPerItem, findDocumentForWorkbookRow } from '../schemas/verification_document_matrix.js';

const logger = createLogger('ParserOntologyLoader');

export const DEFAULT_ONTOLOGY_MATRIX_PATH = 'ontology/BBBEE_Verification_Document_Matrix_v3.xlsx';
const GRAPH_VERSION = 'v1';

function slugCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/&/g, 'AND')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24) || 'PILLAR';
}

export function inferDataType(text: string): FieldKnowledge['field']['data_type'] {
  const lower = text.toLowerCase();
  // An identifier or a person is text, whatever else the name mentions:
  // registration_number is not a date because it says "registration", and
  // signed_by names a signatory, not the day of signing.
  if (/(^|[\s_])(number|no|nr|id|code|reference)$|_by$/.test(lower)) return 'string';
  if (/(amount|spend|value|cost|rand|revenue|turnover|npat)/.test(lower)) return 'money';
  if (/(percent|percentage|ownership|benefit|margin|%)$/.test(lower) || /percent|percentage|ownership|benefit|margin/.test(lower)) return 'percentage';
  if (/(date|expiry|issued|signed|appointment|incorporation|registration|period|year)/.test(lower)) return 'date';
  if (/(level|status level)/.test(lower)) return 'bee_level';
  if (/yes|no|true|false|bool|present|confirmed|matches|within|covered|signed|legible|accredited|met|applied|included|excludes|vested|disabled/.test(lower)) return 'boolean';
  return 'string';
}

/**
 * The fields a workbook row's document is read for: the generated matrix's
 * `expectedFields` (parsed once, by scripts/generate-document-matrix.mjs), so
 * the deterministic path and the AI path ask for the same fields.
 *
 * This loader used to re-parse the prompt with its own regex, which missed
 * "Return JSON per employee: …" / "per payment:" / "per certificate:" and left
 * 28 types — EEA1, SED proof of payment, the supplier ledger, the supplier
 * certificate, COR39 — with nothing but a placeholder to look for.
 *
 * A row the matrix does not know (a different workbook passed via
 * ONTOLOGY_MATRIX_PATH) returns null and gets one honest placeholder, never
 * prose mined into fields — an invented field becomes a "missing" line in the
 * user's review.
 *
 * A spec that asks for one record per item ("per payment", "per employee")
 * describes a document holding many records, so its fields are read from labels
 * only (see ExtractionFieldNode.labelled_only).
 */
function matrixFieldsFor(sheetName: string, documentName: string): { names: string[]; labelledOnly: boolean } | null {
  const doc = findDocumentForWorkbookRow(sheetName, documentName);
  if (!doc || doc.expectedFields.length === 0) return null;
  return { names: [...doc.expectedFields], labelledOnly: asksForOneRecordPerItem(doc) };
}

/**
 * The matrix names are already snake_case; only case is folded, so the
 * deterministic path reports the same key the AI path asks for. (A rewrite of
 * "bbee" to "bee", meant for prose labels, turned total_bbbee_suppliers into
 * total_bee_suppliers.)
 */
function fieldNameFromLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64) || 'primary_evidence';
}

function fieldRequired(fieldName: string): boolean {
  return !/(exceptions?|flags?|list|notes?|reasoning|assessment|summary|mismatch|risk)/i.test(fieldName);
}

/**
 * "<field label>: value". The value stops at the end of its line, at a `;`, or
 * at the next table cell (`|`, tab): a register's header row read as text is
 * one cell per pipe, and the next cell is a different column. extract_fields
 * guards what this captures further (whole-word label, tags, other labels,
 * length).
 *
 * The label is deliberately NOT word-bounded here: classification scores a
 * type by whether these patterns hit the text, so bounding them would move
 * every type's keyword score (and the adjudicator's recorded prompts). The
 * whole-word rule is applied where a value is taken instead.
 */
export function fieldLabelRegex(fieldName: string): string {
  return `${fieldName.replace(/_/g, '(?:\\s|_|/|-)+')}\\s*[:\\-]?\\s*([^\\n\\r;|\\t]+)`;
}

function cellText(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

function findHeaderIndex(rows: unknown[][]): number {
  return rows.findIndex((row) => row.some((cell) => cellText(cell).toLowerCase() === 'document required'));
}

function valueAt(row: unknown[], index: number): string {
  return index >= 0 ? cellText(row[index]) : '';
}

type CanonicalKnowledge = ReturnType<typeof defaultDocumentKnowledge>[number];

const canonicalKnowledge = defaultDocumentKnowledge();

function findCanonicalKnowledge(documentName: string): CanonicalKnowledge | null {
  const normalized = documentName.toLowerCase();
  if (/(full\s+supplier\s+schedule|supplier\s+spend\s+schedule|all\s+b-?bee\s+suppliers|supplier.*total\s+spend)/i.test(normalized)) {
    return canonicalKnowledge.find((knowledge) => knowledge.document.name === 'Supplier Spend Schedule') ?? null;
  }
  if (/(sworn\s+affidavit|b-?bee\s+affidavit|bee\s+affidavit)/i.test(normalized)) {
    return canonicalKnowledge.find((knowledge) => knowledge.document.name === 'B-BBEE Sworn Affidavit') ?? null;
  }
  if (/(b-?bee\s+certificate|bbbee\s+certificate|bee\s+certificate)/i.test(normalized)) {
    return canonicalKnowledge.find((knowledge) => knowledge.document.name === 'B-BBEE Certificate') ?? null;
  }
  return null;
}

function mergeAliases(documentName: string, canonical: CanonicalKnowledge | null): string[] {
  return Array.from(new Set([
    documentName,
    ...(canonical?.document.aliases ?? []),
    canonical?.document.name,
  ].filter((alias): alias is string => Boolean(alias))));
}

export function buildOntologyRecordsFromWorkbook(workbookPath: string): OntologyRecord[] {
  if (!fs.existsSync(workbookPath)) {
    throw new Error(`Ontology matrix not found at ${workbookPath}`);
  }

  const workbook = XLSX.readFile(workbookPath);
  const records: OntologyRecord[] = [];
  const unmatchedRows: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
    const headerIndex = findHeaderIndex(rows);
    if (headerIndex < 0) continue;

    const headers = rows[headerIndex].map((cell) => cellText(cell).toLowerCase().replace(/[^a-z0-9]+/g, ''));
    const documentIndex = headers.findIndex((header) => header === 'documentrequired');
    const checksIndex = headers.findIndex((header) => header.includes('whattheauditortests') || header.includes('looksfor'));
    const exampleIndex = headers.findIndex((header) => header.includes('exampleofwhatthedatashouldlooklike') || header.includes('example'));
    const instructionIndex = headers.findIndex((header) => header.includes('prompttemplate') || header.includes('extraction'));
    const pillarCode = slugCode(sheetName);

    for (const row of rows.slice(headerIndex + 1)) {
      const documentName = valueAt(row, documentIndex);
      if (!documentName) continue;

      const auditorChecks = valueAt(row, checksIndex);
      const expectedData = valueAt(row, exampleIndex);
      const instruction = valueAt(row, instructionIndex);
      const code = pillarCode;
      const canonical = findCanonicalKnowledge(documentName);
      const matrix = canonical ? null : matrixFieldsFor(sheetName, documentName);
      if (!canonical && !matrix) unmatchedRows.push(`${sheetName}: ${documentName}`);
      const fieldLabels = canonical ? [] : matrix?.names ?? ['primary_evidence'];
      const fields: FieldKnowledge[] = fieldLabels.map((label) => {
        const fieldName = fieldNameFromLabel(label);
        const dataType = inferDataType(label);
        const calculatorKey = `${slugCode(sheetName).toLowerCase()}.${fieldName}`;
        const required = fieldRequired(fieldName);
        return {
          field: {
            name: fieldName,
            data_type: dataType,
            required,
            ...(matrix?.labelledOnly ? { labelled_only: true as const } : {}),
            description: label,
            calculator_key: calculatorKey,
            graph_version: GRAPH_VERSION,
          },
          rules: required
            ? [{
              name: `required_${fieldName}`,
              rule_type: 'required',
              severity: 'error',
              logic: 'required',
              failure_message: `${label} not found`,
              graph_version: GRAPH_VERSION,
            }]
            : [],
          patterns: [
            {
              name: label,
              pattern_type: 'label',
              examples: expectedData ? [expectedData] : [],
              regex: fieldLabelRegex(fieldName),
              semantic_hint: instruction || auditorChecks || label,
              graph_version: GRAPH_VERSION,
            },
          ],
          calculator_requirements: [
            {
              key: calculatorKey,
              expected_type: dataType,
              destination: 'manual_workbook',
              workbook_field: calculatorKey,
              manual_flow_mapping: calculatorKey,
              graph_version: GRAPH_VERSION,
            },
          ],
        };
      });

      // When an Excel row maps to a canonical document type, reuse the canonical
      // NAME so the row reinforces the canonical type instead of creating a
      // near-duplicate document node. Duplicates would otherwise collide during
      // classification, shrinking the confidence margin and pushing genuine
      // matches into "ambiguous" review. Non-canonical rows keep their own name.
      const resolvedName = canonical?.document.name ?? documentName;
      records.push({
        pillar: { name: sheetName, code, graph_version: GRAPH_VERSION },
        document: {
          name: resolvedName,
          description: auditorChecks || instruction || documentName,
          aliases: mergeAliases(documentName, canonical),
          required: true,
          pillar_code: canonical?.document.pillar_code ?? code,
          graph_version: GRAPH_VERSION,
        },
        // A non-canonical row keeps its own fields, plus any the canonical
        // ownership type used to read for it (see borrowedCanonicalFields).
        fields: canonical?.fields ?? [
          ...fields,
          ...borrowedCanonicalFields(documentName, canonicalKnowledge, fields.map((f) => f.field.name)),
        ],
      });
    }
  }

  logger.info('Built parser ontology records from workbook', {
    workbookPath: path.normalize(workbookPath),
    sheets: workbook.SheetNames.length,
    records: records.length,
  });
  if (unmatchedRows.length > 0) {
    logger.warn('Workbook rows not in the generated matrix carry only a placeholder field; run pnpm gen:matrix against this workbook', {
      count: unmatchedRows.length,
      rows: unmatchedRows.slice(0, 10),
    });
  }
  return records;
}

export async function loadOntologyFromWorkbook(
  repository: OntologyRepository,
  workbookPath = DEFAULT_ONTOLOGY_MATRIX_PATH,
): Promise<{ graph_version: string; records: number; nodes: number; relationships: number }> {
  const records = buildOntologyRecordsFromWorkbook(workbookPath);
  const result = await repository.upsertOntology(records);
  return {
    graph_version: GRAPH_VERSION,
    records: records.length,
    nodes: result.nodes,
    relationships: result.relationships,
  };
}
