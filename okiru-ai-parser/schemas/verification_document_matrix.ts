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
