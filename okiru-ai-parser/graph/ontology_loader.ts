import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import { createLogger } from '../src/logger.js';
import type { FieldKnowledge, OntologyRecord, OntologyRepository } from './ontology_models.js';
import { defaultDocumentKnowledge } from './ontology_queries.js';

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

function inferDataType(text: string): FieldKnowledge['field']['data_type'] {
  const lower = text.toLowerCase();
  if (/(amount|spend|value|cost|rand|revenue|turnover|npat)/.test(lower)) return 'money';
  if (/(percent|percentage|ownership|benefit|margin|%)$/.test(lower) || /percent|percentage|ownership|benefit|margin/.test(lower)) return 'percentage';
  if (/(date|expiry|issued|signed|appointment|incorporation|registration|period|year)/.test(lower)) return 'date';
  if (/(level|status level)/.test(lower)) return 'bee_level';
  if (/yes|no|true|false|bool|present|confirmed|matches|within|covered|signed|legible|accredited|met|applied|included|excludes|vested|disabled/.test(lower)) return 'boolean';
  return 'string';
}

function extractJsonFieldNames(instruction: string): string[] {
  const matches = [
    ...instruction.matchAll(/Return\s+(?:a\s+)?JSON(?:\s+object)?(?:\s+with(?:\s+fields)?)?\s*:\s*([\s\S]+)/gi),
    ...instruction.matchAll(/Extract\s+(?:and\s+return\s+)?JSON\s*:\s*([\s\S]+)/gi),
    ...instruction.matchAll(/with\s+columns\s*:\s*([\s\S]+)/gi),
    ...instruction.matchAll(/with\s*:\s*([\s\S]+)/gi),
  ];
  const source = matches[0]?.[1] || instruction;
  const cleaned = source
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\bwith fields\b/gi, '')
    .replace(/\bper\b.*$/gi, '');

  const fields = cleaned
    .split(/,|;|\band\b|\n/)
    .map((part) => part.trim())
    .map((part) => part.match(/[a-z][a-z0-9_]*(?:\s*→\s*[a-z0-9_]+)?/i)?.[0] || '')
    .map((part) => part.replace(/\s*→\s*/g, '_').toLowerCase())
    .filter((part) => /^[a-z][a-z0-9_]{2,64}$/.test(part))
    .filter((part) => !['return', 'json', 'object', 'fields', 'list', 'bool', 'date', 'amount'].includes(part));

  return Array.from(new Set(fields));
}

function splitExpectedFields(expectedData: string, auditorChecks: string, instruction: string): string[] {
  const jsonFields = extractJsonFieldNames(instruction);
  if (jsonFields.length > 0) return jsonFields;

  const source = [expectedData, auditorChecks, instruction].filter(Boolean).join('\n');
  const candidates = source
    .split(/\n|;|\u2022|, (?=[A-Z])/)
    .map((part) => part.replace(/^[\-\d.)\s]+/, '').trim())
    .filter((part) => part.length > 2 && part.length < 100)
    .map(fieldNameFromLabel);
  return Array.from(new Set(candidates.length > 0 ? candidates.slice(0, 8) : ['primary_evidence']));
}

function fieldNameFromLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/b-bbee|bbee|broad based black economic empowerment/g, 'bee')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64) || 'primary_evidence';
}

function fieldRequired(fieldName: string): boolean {
  return !/(exceptions?|flags?|list|notes?|reasoning|assessment|summary|mismatch|risk)/i.test(fieldName);
}

function fieldLabelRegex(fieldName: string): string {
  return `${fieldName.replace(/_/g, '(?:\\s|_|/|-)+')}\\s*[:\\-]?\\s*([^\\n\\r;]+)`;
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
      const fieldLabels = canonical ? [] : splitExpectedFields(expectedData, auditorChecks, instruction);
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

      records.push({
        pillar: { name: sheetName, code, graph_version: GRAPH_VERSION },
        document: {
          name: documentName,
          description: auditorChecks || instruction || documentName,
          aliases: mergeAliases(documentName, canonical),
          required: true,
          pillar_code: code,
          graph_version: GRAPH_VERSION,
        },
        fields: canonical?.fields ?? fields,
      });
    }
  }

  logger.info('Built parser ontology records from workbook', {
    workbookPath: path.normalize(workbookPath),
    sheets: workbook.SheetNames.length,
    records: records.length,
  });
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
