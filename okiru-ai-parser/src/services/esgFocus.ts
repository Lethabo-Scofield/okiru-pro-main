/**
 * The element a person filed an upload under (C1).
 *
 * The upload screen sorts files into element batches — Fleet, Waste, Health &
 * safety — and until now that was presentation: the parser never heard it, and
 * a fleet fuel report dropped into "Fleet" was routed by keyword like any other
 * file. Now the batch travels with the file, as `focus_elements`, and the
 * reader uses it where it has nothing better.
 *
 * It is a hint, not an order. A document the classifier recognises with
 * confidence is read as what it is: the person's filing does not turn an
 * electricity bill into a fleet record. Below that, the person's word beats a
 * keyword guess.
 */
import type { EsgElement } from '../../schemas/esg_document_matrix.js';

export const ESG_ELEMENTS: readonly EsgElement[] = [
  'GHG_ENERGY',
  'FLEET',
  'WASTE',
  'WATER',
  'ISO_ENVIRONMENTAL',
  'EMPLOYMENT_EQUITY',
  'HEALTH_SAFETY',
  'TRAINING',
  'COMMUNITY_CSI',
  'SUPPLIER_ESG',
  'BOARD_GOVERNANCE',
  'ETHICS_COMPLIANCE',
  'RISK_ASSURANCE',
  'FINANCIAL',
];

const MAX_FIELD_LENGTH = 50_000;
const MAX_FILE_NAME = 300;

/**
 * The `focus_elements` form field — `{ "<file name>": "<ELEMENT>" }` — with
 * anything malformed or unknown dropped. Never throws: a bad hint is no hint.
 */
export function parseEsgFocus(raw: unknown): Record<string, EsgElement> {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_FIELD_LENGTH) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: Record<string, EsgElement> = {};
  for (const [file, element] of Object.entries(parsed as Record<string, unknown>)) {
    if (!file || file.length > MAX_FILE_NAME) continue;
    if (typeof element !== 'string' || !(ESG_ELEMENTS as readonly string[]).includes(element)) continue;
    out[file] = element as EsgElement;
  }
  return out;
}

/** The element an input's upload was filed under — a split workbook's sheets share their file's. */
export function focusForInput(
  filename: string,
  focus: Readonly<Record<string, EsgElement>> | undefined,
): EsgElement | undefined {
  if (!focus) return undefined;
  return focus[filename] ?? focus[filename.split(' › ')[0] ?? filename];
}
