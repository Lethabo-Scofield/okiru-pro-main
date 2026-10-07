/**
 * The verification document matrix — what a B-BBEE auditor actually asks for.
 *
 * The parser previously knew 7 document types. A verification asks for 109. That
 * gap is why real client folders came back with almost nothing recognised: the
 * documents were fine, we simply had no concept of most of them.
 *
 * Each entry carries the four things extraction needs, all authored by the
 * verification expert rather than inferred by us:
 *   - `auditorTests`      what the auditor checks → the validation layer
 *   - `exampleData`       what good data looks like → grounding for extraction
 *   - `extractionPrompt`  the instruction to run against the document
 *   - `expectedFields`    the JSON keys that prompt asks for → output schema
 *
 * The data lives in `verification_document_matrix.generated.ts`, produced from
 * the source workbook by `pnpm gen:matrix`. This module holds the types and the
 * lookup helpers so the generated file stays pure data.
 */
import { VERIFICATION_DOCUMENT_MATRIX } from './verification_document_matrix.generated.js';

/** Amended-codes element. Legacy seven-element sectors map these per sector. */
export type VerificationElement =
  | 'OWNERSHIP'
  | 'MANAGEMENT_CONTROL'
  | 'SKILLS_DEVELOPMENT'
  | 'ESD'
  | 'SED';

export interface VerificationDocument {
  /** Stable id, `element__document_name`. Safe to persist against. */
  id: string;
  element: VerificationElement;
  /** The document's name as the expert wrote it. */
  name: string;
  /**
   * Strings a classifier can match in the document itself. Includes statutory
   * form codes (COR14.3, EEA2, EMP201) — usually the only text that reliably
   * appears in the document, since documents rarely restate their own title.
   */
  aliases: string[];
  /** What the auditor tests for. Drives review flags and the validation layer. */
  auditorTests: string;
  /** A worked example of correct data for this document. */
  exampleData: string;
  /** The expert's extraction instruction, verbatim. */
  extractionPrompt: string;
  /** JSON keys the prompt asks for. Empty where the prompt is prose-only. */
  expectedFields: string[];
}

export { VERIFICATION_DOCUMENT_MATRIX };

/** Every document required for an element. */
export function documentsForElement(element: VerificationElement): VerificationDocument[] {
  return VERIFICATION_DOCUMENT_MATRIX.filter((doc) => doc.element === element);
}

export function findDocumentById(id: string): VerificationDocument | null {
  return VERIFICATION_DOCUMENT_MATRIX.find((doc) => doc.id === id) ?? null;
}

/**
 * Source-workbook sheet → element. Mirrors SHEET_TO_ELEMENT in
 * scripts/generate-document-matrix.mjs (a plain .mjs script, so it cannot import
 * this); the ontology loader test fails if the two drift apart.
 */
export const MATRIX_SHEET_ELEMENTS: Readonly<Record<string, VerificationElement>> = {
  'Ownership': 'OWNERSHIP',
  'Management Control': 'MANAGEMENT_CONTROL',
  'Skills Development': 'SKILLS_DEVELOPMENT',
  'Enterprise & Supplier Dev': 'ESD',
  'Socio-Economic Development': 'SED',
};

/**
 * Does the spec ask for one record PER item — "Return JSON per payment: …",
 * "Extract a list of all current directors with: …", "a JSON table by
 * management level: …"? Read from the words between the verb and the colon
 * that opens the field list (the same marker the generator parses fields after).
 */
export function asksForOneRecordPerItem(doc: Pick<VerificationDocument, 'extractionPrompt'>): boolean {
  const marker = doc.extractionPrompt.match(/\b(?:Return|Extract)\b([^:]{0,80}):/i)?.[1] ?? '';
  return /\b(?:per|each|list|table|by)\b/i.test(marker);
}

const rowKey = (name: string) => name.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * The matrix entry for one row of the source workbook — how the runtime
 * ontology loader reads the generator's field list instead of re-parsing the
 * prompt itself. Matched on the element plus the document name; on a sheet the
 * generator does not know, on the name alone when exactly one entry has it.
 */
export function findDocumentForWorkbookRow(sheetName: string, documentName: string): VerificationDocument | null {
  const key = rowKey(documentName);
  const element = MATRIX_SHEET_ELEMENTS[sheetName.trim()];
  const byName = VERIFICATION_DOCUMENT_MATRIX.filter((doc) => rowKey(doc.name) === key);
  if (element) return byName.find((doc) => doc.element === element) ?? null;
  return byName.length === 1 ? byName[0] : null;
}

/** Element → its documents, for building a "what we need from you" request. */
export function documentsByElement(): Record<VerificationElement, VerificationDocument[]> {
  const grouped = {} as Record<VerificationElement, VerificationDocument[]>;
  for (const doc of VERIFICATION_DOCUMENT_MATRIX) {
    (grouped[doc.element] ??= []).push(doc);
  }
  return grouped;
}

/**
 * Alias → document, longest alias first.
 *
 * Longest-first matters: "COR14.3 CIPC registration" must win over the bare
 * "SETA" that appears in half the Skills documents, otherwise a specific
 * document is claimed by a generic one.
 */
let aliasIndexCache: Array<{ alias: string; lower: string; doc: VerificationDocument }> | null = null;

export function aliasIndex(): Array<{ alias: string; lower: string; doc: VerificationDocument }> {
  if (aliasIndexCache) return aliasIndexCache;
  const entries: Array<{ alias: string; lower: string; doc: VerificationDocument }> = [];
  for (const doc of VERIFICATION_DOCUMENT_MATRIX) {
    for (const alias of doc.aliases) {
      entries.push({ alias, lower: alias.toLowerCase(), doc });
    }
  }
  entries.sort((a, b) => b.alias.length - a.alias.length);
  aliasIndexCache = entries;
  return entries;
}
