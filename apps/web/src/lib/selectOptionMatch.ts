/**
 * Fuzzy matching for workbook select / enum fields.
 * Used by cell normalization, "did you mean" popups, and the suggest-value API.
 */
import {
  BBBEE_LEVEL_MAP,
  OCC_LEVEL_MAP,
  SUPPLIER_SIZE_MAP,
} from "@/components/workbook/sections";
import { headerSimilarity, levenshtein, norm } from "@/lib/columnMatch";

const RACE_SYNONYM_MAP: Record<string, string> = {
  black: "African",
  african: "African",
  coloured: "Coloured",
  colored: "Coloured",
  indian: "Indian",
  white: "White",
};

const DESIGNATION_SYNONYM_MAP: Record<string, string> = {
  snrmanagement: "Senior Manager",
  seniormanagement: "Senior Manager",
  seniormanager: "Senior Manager",
  seniormanagers: "Senior Manager",
};

const ESD_CATEGORY_SYNONYM_MAP: Record<string, string> = {};

export interface SelectMatchResult {
  suggestion: string | null;
  confidence: number;
  reason?: string;
}

const FIELD_SYNONYM_MAPS: Record<string, Record<string, string>> = {
  designation: DESIGNATION_SYNONYM_MAP,
  occupationalLevel: OCC_LEVEL_MAP,
  currentSize: SUPPLIER_SIZE_MAP,
  esdCategory: ESD_CATEGORY_SYNONYM_MAP,
};

/** Minimum score to show a "did you mean" hint. */
export const FUZZY_SELECT_HINT = 0.58;
/** Minimum score to auto-normalize a select value. */
export const FUZZY_SELECT_ACCEPT = 0.72;

function stripParentheses(s: string): string {
  const wrapped = /^\s*\(([^)]+)\)\s*$/.exec(s);
  if (wrapped) return wrapped[1].trim();
  return s.replace(/[()]/g, "").trim();
}

function tokenSet(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1),
  );
}

function tokenOverlapScore(a: string, b: string): number {
  const ta = tokenSet(a);
  const tb = tokenSet(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const t of ta) {
    if (tb.has(t)) overlap++;
  }
  return overlap / Math.max(ta.size, tb.size);
}

function levenshteinRatio(a: string, b: string): number {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return 0;
  const maxLen = Math.max(na.length, nb.length);
  return maxLen === 0 ? 0 : 1 - levenshtein(na, nb) / maxLen;
}

/**
 * Best match for a raw user value against a list of allowed select options.
 * Handles synonyms, parenthetical labels, typos, and partial phrases
 * (e.g. "Senior management" → "Senior Manager").
 */
export function suggestSelectOption(
  raw: string,
  options: string[],
  fieldKey?: string,
): SelectMatchResult {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed || options.length === 0) return { suggestion: null, confidence: 0 };

  const n = norm(trimmed);
  const stripped = stripParentheses(trimmed);
  const nStripped = norm(stripped);

  const synonymMap = fieldKey === "race"
    ? RACE_SYNONYM_MAP
    : fieldKey
      ? FIELD_SYNONYM_MAPS[fieldKey]
      : undefined;
  if (synonymMap) {
    const mapped = synonymMap[n] ?? synonymMap[nStripped];
    if (mapped && options.includes(mapped)) {
      return { suggestion: mapped, confidence: 1, reason: "synonym" };
    }
  }

  if (fieldKey === "bbbeeLevel" || /level/.test(fieldKey ?? "")) {
    const lvl = BBBEE_LEVEL_MAP[n] ?? BBBEE_LEVEL_MAP[nStripped];
    if (lvl && options.includes(lvl)) {
      return { suggestion: lvl, confidence: 1, reason: "synonym" };
    }
  }

  for (const opt of options) {
    if (opt === trimmed || norm(opt) === n) {
      return { suggestion: opt, confidence: 1, reason: "exact" };
    }
    const optStripped = stripParentheses(opt);
    if (norm(optStripped) === n || norm(optStripped) === nStripped) {
      return { suggestion: opt, confidence: 0.98, reason: "exact-stripped" };
    }
  }

  let best: { option: string; score: number } | null = null;
  for (const opt of options) {
    const optStripped = stripParentheses(opt);
    const scores = [
      headerSimilarity(trimmed, opt),
      headerSimilarity(stripped, optStripped),
      tokenOverlapScore(trimmed, opt) * 0.9 + headerSimilarity(trimmed, opt) * 0.1,
      levenshteinRatio(trimmed, opt),
      levenshteinRatio(stripped, optStripped),
    ];
    const score = Math.max(...scores);
    if (!best || score > best.score) best = { option: opt, score };
  }

  if (best && best.score >= FUZZY_SELECT_ACCEPT) {
    return { suggestion: best.option, confidence: best.score, reason: "fuzzy" };
  }
  if (best && best.score >= FUZZY_SELECT_HINT) {
    return { suggestion: best.option, confidence: best.score, reason: "fuzzy-hint" };
  }
  return { suggestion: null, confidence: best?.score ?? 0 };
}

/** Format a did-you-mean message for validation flags. */
export function formatDidYouMeanMessage(raw: string, suggestion: string): string {
  return `"${raw}" is not allowed. Did you mean "${suggestion}"?`;
}
