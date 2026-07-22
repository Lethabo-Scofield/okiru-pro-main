/**
 * Verification pass — is each extracted value actually IN the document?
 *
 * Confidence scores do not catch a confident hallucination: a model that
 * invents "Level 4" reports the same confidence as one that read it. The only
 * reliable check is to go back to the source text and look.
 *
 * WHY THIS IS MOSTLY FREE: the extraction prompt instructs the model to copy
 * values exactly as they appear ("do not convert currencies, dates or
 * percentages"). So a correctly-extracted value is nearly always present in the
 * source VERBATIM, and a string search settles it — no second model call, no
 * cost, no latency. Only the values that fail to ground literally are ambiguous
 * enough to be worth asking about.
 *
 * WHAT THIS IS NOT: it does not check that a value is CORRECT, only that the
 * document says it. A document can state a wrong number; that is what the
 * auditor-test validation layer is for. This catches fabrication, which is a
 * different and more dangerous failure — a wrong number a human can dispute
 * versus a number that was never written down at all.
 */
import { createLogger } from '../logger.js';

const logger = createLogger('ExtractionGrounding');

export type GroundingVerdict =
  /** Found verbatim (or near enough) in the source. */
  | 'grounded'
  /** Not found in the source — the value may be fabricated. */
  | 'ungrounded'
  /** Not checkable this way (booleans, computed flags, free prose). */
  | 'not_applicable';

export interface GroundedValue {
  field: string;
  value: unknown;
  verdict: GroundingVerdict;
}

/** Strip formatting a document and a model can legitimately differ on. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    // Currency symbols, thousands separators and whitespace vary freely.
    .replace(/[r$€£\s,]/g, '')
    // Trailing decimal zeros: 1030806.68 vs 1030806.680
    .replace(/(\.\d*?)0+\b/g, '$1')
    .replace(/\.\b/g, '');
}

/**
 * Values that cannot be grounded by string search, and must not be reported as
 * ungrounded for it. A boolean the model derived ("certification_within_3_months")
 * is a JUDGEMENT about the document, not a quotation from it.
 */
function isCheckable(value: unknown): boolean {
  if (typeof value === 'boolean') return false;
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return false;
  if (typeof value === 'object') return false;

  const text = String(value).trim();
  if (text.length === 0) return false;
  // Very short values ("4", "Yes") appear in almost any document by chance, so
  // grounding them proves nothing and would only manufacture false confidence.
  return text.length >= 4;
}

/**
 * Is this value present in the source?
 *
 * Tries verbatim, then normalised (currency/separator/whitespace differences),
 * then — for dates only — the common re-orderings, since a model asked not to
 * convert a date will still occasionally normalise one.
 */
export function isGrounded(value: unknown, source: string): boolean {
  const raw = String(value).trim();
  if (source.includes(raw)) return true;

  const haystack = normalise(source);
  const needle = normalise(raw);
  if (needle.length >= 3 && haystack.includes(needle)) return true;

  // ISO date extracted from a document written "14 March 2027" and similar.
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const [, year, month, day] = iso;
    const months = ['january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december'];
    const monthName = months[Number(month) - 1];
    const dayNum = String(Number(day));
    const lower = source.toLowerCase();
    if (monthName && lower.includes(monthName) && lower.includes(year)
      && (lower.includes(`${dayNum} ${monthName}`) || lower.includes(`${day} ${monthName}`))) {
      return true;
    }
    // dd/mm/yyyy and yyyy/mm/dd forms.
    if (haystack.includes(normalise(`${day}/${month}/${year}`))
      || haystack.includes(normalise(`${year}/${month}/${day}`))) return true;
  }

  return false;
}

/**
 * Check every extracted value against the source text.
 *
 * Returns a verdict per value. Callers decide what to do with `ungrounded` —
 * this module never drops a value, because a grounding miss is evidence for a
 * reviewer, not proof of fabrication.
 */
export function groundValues(
  values: Array<{ field: string; value: unknown }>,
  source: string,
  context: { file: string; document: string },
): GroundedValue[] {
  const results = values.map(({ field, value }): GroundedValue => {
    if (!isCheckable(value)) return { field, value, verdict: 'not_applicable' };
    return { field, value, verdict: isGrounded(value, source) ? 'grounded' : 'ungrounded' };
  });

  const ungrounded = results.filter((r) => r.verdict === 'ungrounded');
  if (ungrounded.length > 0) {
    logger.warn('Extracted values not found in the source document', {
      file: context.file,
      document: context.document,
      fields: ungrounded.map((r) => r.field),
    });
  }

  return results;
}
