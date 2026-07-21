/**
 * Dependency-free fuzzy matching for supplier / entity names.
 *
 * OCR and free-typed schedules spell the same company many ways ("ABC Traders
 * (PTY) LTD", "ABC Traders Pty Ltd", "ABC  Traders"). Matching an extracted name
 * against a known reference list (an org's existing suppliers, prior uploads)
 * collapses those variants so spend aggregates to one supplier instead of three.
 *
 * The reference list lives in the app layer, so this module is the shared matcher
 * both the parser and the app import; the app supplies the candidates.
 */

/** Common SA legal-entity suffixes stripped before comparison. */
const LEGAL_SUFFIXES = /\b(proprietary limited|pty\.? ?ltd\.?|pty|ltd\.?|limited|incorporated|inc\.?|cc|npc|soc|trust)\b/gi;

/**
 * Canonicalize a name for comparison: lowercase, strip legal suffixes and
 * punctuation, collapse whitespace. Not for display — only for matching.
 */
export function canonicalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(LEGAL_SUFFIXES, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Levenshtein edit distance (iterative, two-row — O(n) memory). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * Similarity in [0,1] between two names after canonicalization: 1 = identical,
 * 0 = completely different. Based on edit distance over the longer length.
 */
export function nameSimilarity(a: string, b: string): number {
  const ca = canonicalizeName(a);
  const cb = canonicalizeName(b);
  if (!ca && !cb) return 1;
  if (!ca || !cb) return 0;
  if (ca === cb) return 1;
  const distance = levenshtein(ca, cb);
  const longest = Math.max(ca.length, cb.length);
  return longest === 0 ? 1 : 1 - distance / longest;
}

export interface FuzzyMatch<T> {
  candidate: T;
  score: number;
}

/**
 * Best match for `query` among `candidates`, or null if none clears `threshold`
 * (default 0.82 — tolerant of suffix/spacing/OCR noise, strict enough to avoid
 * merging genuinely different companies). `keyOf` maps a candidate to its name.
 */
export function bestMatch<T>(
  query: string,
  candidates: readonly T[],
  keyOf: (c: T) => string,
  threshold = 0.82,
): FuzzyMatch<T> | null {
  let best: FuzzyMatch<T> | null = null;
  for (const candidate of candidates) {
    const score = nameSimilarity(query, keyOf(candidate));
    if (score >= threshold && (!best || score > best.score)) {
      best = { candidate, score };
    }
  }
  return best;
}
