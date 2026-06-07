import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { createLogger } from '../src/logger.js';
import type { FieldKnowledge, OntologyRecord, OntologyRepository } from './ontology_models.js';

const logger = createLogger('ParserOntologyLoader');

export const DEFAULT_ONTOLOGY_MATRIX_PATH = '/mnt/data/BBBEE_Verification_Document_Matrix_v3 (1).xlsx';
const GRAPH_VERSION = 'v1';

function slugCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/&/g, 'AND')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24) || 'PILLAR';
}

function getCell(row: Record<string, unknown>, candidates: string[]): string {
  const entries = Object.entries(row);
  for (const candidate of candidates) {
    const found = entries.find(([key]) => key.toLowerCase().replace(/[^a-z0-9]/g, '').includes(candidate));
    if (found && found[1] != null) return String(found[1]).trim();
  }
  return '';
}

function inferDataType(text: string): FieldKnowledge['field']['data_type'] {
  const lower = text.toLowerCase();
  if (/(amount|spend|value|cost|rand|revenue|turnover|npat)/.test(lower)) return 'money';
  if (/(percent|percentage|ownership|benefit|%)$/.test(lower) || /percent|percentage|ownership|benefit/.test(lower)) return 'percentage';
  if (/(date|expiry|valid|period)/.test(lower)) return 'date';
  if (/(level|status level)/.test(lower)) return 'bee_level';
  if (/yes|no|true|false|empowering|disabled/.test(lower)) return 'boolean';
  return 'string';
}

function splitExpectedFields(expectedData: string, auditorChecks: string, instruction: string): string[] {
  const source = [expectedData, auditorChecks, instruction].filter(Boolean).join('\n');
  const candidates = source
    .split(/\n|;|\u2022|, (?=[A-Z])/)
    .map((part) => part.replace(/^[\-\d.)\s]+/, '').trim())
    .filter((part) => part.length > 2 && part.length < 100);
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

export function buildOntologyRecordsFromWorkbook(workbookPath: string): OntologyRecord[] {
  if (!fs.existsSync(workbookPath)) {
    throw new Error(`Ontology matrix not found at ${workbookPath}`);
  }

  const workbook = XLSX.readFile(workbookPath);
  const records: OntologyRecord[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    const pillarCode = slugCode(sheetName);

    for (const row of rows) {
      const documentName = getCell(row, ['documentrequired', 'document', 'evidence']);
      if (!documentName) continue;

      const auditorChecks = getCell(row, ['whatauditortests', 'auditor', 'looksfor', 'checks']);
      const expectedData = getCell(row, ['exampleofexpecteddata', 'expecteddata', 'example']);
      const instruction = getCell(row, ['prompttemplate', 'extractioninstruction', 'instruction']);
      const code = getCell(row, ['pillarcode', 'code']) || pillarCode;
      const fieldLabels = splitExpectedFields(expectedData, auditorChecks, instruction);
      const fields: FieldKnowledge[] = fieldLabels.map((label) => {
        const fieldName = fieldNameFromLabel(label);
        const dataType = inferDataType(label);
        const calculatorKey = `${slugCode(sheetName).toLowerCase()}.${fieldName}`;
        return {
          field: {
            name: fieldName,
            data_type: dataType,
            required: true,
            description: label,
            calculator_key: calculatorKey,
            graph_version: GRAPH_VERSION,
          },
          rules: [
            {
              name: `required_${fieldName}`,
              rule_type: 'required',
              severity: 'error',
              logic: 'required',
              failure_message: `${label} not found`,
              graph_version: GRAPH_VERSION,
            },
          ],
          patterns: [
            {
              name: label,
              pattern_type: 'semantic',
              examples: expectedData ? [expectedData] : [],
              regex: undefined,
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
          aliases: [documentName],
          required: true,
          pillar_code: code,
          graph_version: GRAPH_VERSION,
        },
        fields,
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
