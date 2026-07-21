/**
 * Generate the verification document matrix from the expert's workbook.
 *
 * SOURCE: docs/testdocs/BBBEE_Verification_Document_Matrix_v3 (1) (1).xlsx —
 * Chengetai's per-element document matrix. Each row is one document a verifier
 * asks for, and carries four things we need:
 *   - what the auditor tests           → validation rules / review prompts
 *   - what good data looks like        → few-shot example for extraction
 *   - the extraction prompt template   → the AI instruction, already written
 *   - the JSON fields that prompt asks for → the extraction schema
 *
 * The parser is built from its own directory (see Dockerfile), so it cannot read
 * docs/ at runtime. This script commits the matrix INTO the package as generated
 * TypeScript. Re-run with `pnpm gen:matrix` when the workbook changes.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(here, '../../docs/testdocs/BBBEE_Verification_Document_Matrix_v3 (1) (1).xlsx');
const OUT = join(here, '../schemas/verification_document_matrix.generated.ts');

/** Sheet name → the pillar code the rest of the system uses. */
const SHEET_TO_ELEMENT = {
  'Ownership': 'OWNERSHIP',
  'Management Control': 'MANAGEMENT_CONTROL',
  'Skills Development': 'SKILLS_DEVELOPMENT',
  'Enterprise & Supplier Dev': 'ESD',
  'Socio-Economic Development': 'SED',
};

/** Split on commas that are NOT inside parentheses. */
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const char of text) {
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
}

/**
 * Pull the expected output fields out of the prompt.
 *
 * The expert writes the field list several ways — "Return JSON: a, b (bool)",
 * "Return a JSON object with fields: ...", "Extract JSON: ...", "Extract a list
 * of all current directors with: ..." — so match on the verb plus the colon that
 * introduces the list, and take the FIRST such marker (a prompt may later say
 * "return a reconciliation table:", which is not the schema).
 *
 * Field names are snake_case, so a chunk yielding no snake_case head is prose
 * and ends the list.
 */
function parseExpectedFields(prompt) {
  const match = prompt.match(/\b(?:Return|Extract)\b[^:]{0,80}:\s*([\s\S]+)$/i);
  if (!match) return [];

  const fields = [];
  for (const chunk of splitTopLevel(match[1])) {
    // Drop trailing prose after the field's own sentence.
    const head = chunk
      .split(/\.\s+[A-Z]/)[0]
      .replace(/\([^)]*\)/g, ' ')
      // "…, and a holdings_table with columns: …" — the connective is not a field.
      .replace(/^\s*(?:and|plus|also|then)\b\s*/i, '')
      .replace(/^\s*(?:a|an|the)\b\s*/i, '')
      .trim();
    const name = head.match(/^([A-Za-z][A-Za-z0-9_]{2,})/);
    // Accept an all-lowercase word ("exceptions") or anything snake_cased
    // ("ID_number_last_4"). A capitalised word without an underscore is prose
    // ("Then compare against...") and ends the list.
    if (!name || !(/^[a-z][a-z0-9_]*$/.test(name[1]) || name[1].includes('_'))) break;
    fields.push(name[1]);
  }
  return [...new Set(fields)];
}

/**
 * Aliases the classifier can match on. The document NAME is rarely what appears
 * in the document; the form codes inside it usually are (COR14.3, EEA2, EMP201),
 * as are the segments of a "X / Y" name.
 */
function deriveAliases(name) {
  const aliases = new Set();
  const cleaned = name.replace(/\s+/g, ' ').trim();
  aliases.add(cleaned);

  // "SA ID document / certified copy — black shareholders" → the part before the dash
  const beforeDash = cleaned.split(/\s+[—–-]\s+/)[0];
  if (beforeDash !== cleaned) aliases.add(beforeDash.trim());

  // Slash-separated alternatives, but not inside parentheses.
  for (const part of beforeDash.replace(/\([^)]*\)/g, '').split('/')) {
    const trimmed = part.trim();
    if (trimmed.length >= 4) aliases.add(trimmed);
  }

  // Statutory form codes are the highest-signal identifiers in the document.
  for (const code of cleaned.match(/\b(?:COR\d+(?:\.\d+)?|EEA\d|EMP\d{3}|SAQA|SETA|WSP|ATR|AFS|MOI|UIF|VAT|NPAT|TMPS|SDL|ESOP|BBOS|EME|QSE|SED|ESD)\b/g) ?? []) {
    aliases.add(code);
  }
  return [...aliases].filter(Boolean);
}

function slugify(element, name) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return `${element.toLowerCase()}__${base}`;
}

const workbook = XLSX.readFile(SOURCE);
const documents = [];

for (const [sheet, element] of Object.entries(SHEET_TO_ELEMENT)) {
  if (!workbook.Sheets[sheet]) throw new Error(`Missing expected sheet: ${sheet}`);
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { header: 1, blankrows: false });

  for (const row of rows.slice(3)) {
    if (!row[1] || !/^\d+$/.test(String(row[0]))) continue;
    const name = String(row[1]).replace(/\s+/g, ' ').trim();
    const prompt = String(row[4] ?? '').replace(/\s+/g, ' ').trim();

    documents.push({
      id: slugify(element, name),
      element,
      name,
      aliases: deriveAliases(name),
      auditorTests: String(row[2] ?? '').replace(/\s+/g, ' ').trim(),
      exampleData: String(row[3] ?? '').replace(/\s+/g, ' ').trim(),
      extractionPrompt: prompt,
      expectedFields: parseExpectedFields(prompt),
    });
  }
}

const withFields = documents.filter((d) => d.expectedFields.length > 0).length;
const duplicateIds = documents.map((d) => d.id).filter((id, i, all) => all.indexOf(id) !== i);
if (duplicateIds.length > 0) throw new Error(`Duplicate document ids: ${duplicateIds.join(', ')}`);

const banner = `/**
 * GENERATED FILE — DO NOT EDIT BY HAND.
 * Run \`pnpm gen:matrix\` after changing the source workbook.
 *
 * Source: docs/testdocs/BBBEE_Verification_Document_Matrix_v3 (1) (1).xlsx
 * Generated: ${documents.length} documents across ${Object.keys(SHEET_TO_ELEMENT).length} elements,
 * ${withFields} of them carrying a parsed extraction schema.
 *
 * The matrix is organised by the AMENDED five-element codes. Sectors on the
 * legacy seven-element framework (e.g. Transport) split Management Control and
 * Employment Equity, so consumers must map ELEMENT → pillar per sector rather
 * than assuming a 1:1 correspondence.
 */
import type { VerificationDocument } from './verification_document_matrix.js';

export const VERIFICATION_DOCUMENT_MATRIX: readonly VerificationDocument[] = ${JSON.stringify(documents, null, 2)} as const;
`;

writeFileSync(OUT, banner, 'utf8');
console.log(`Wrote ${documents.length} documents → ${OUT}`);
console.log(`  extraction schemas parsed: ${withFields}/${documents.length}`);
for (const [sheet, element] of Object.entries(SHEET_TO_ELEMENT)) {
  const count = documents.filter((d) => d.element === element).length;
  console.log(`  ${element.padEnd(20)} ${count}`);
}
