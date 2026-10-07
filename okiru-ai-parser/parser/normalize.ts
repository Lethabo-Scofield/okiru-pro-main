import type { ParserDataType } from '../schemas/document_types.js';

/** B-BBEE levels as certificates write them in words ("LEVEL ONE CONTRIBUTOR"). */
export const LEVEL_WORDS: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
};

/** `one|two|…|eight`, for patterns that read a level written in words. */
export const LEVEL_WORD_ALTERNATION = Object.keys(LEVEL_WORDS).join('|');

export function normalizeMoney(value: unknown): number | null {
  if (value == null) return null;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return null;
  const multiplier = raw.includes('bn') || /\bbillion\b/.test(raw)
    ? 1_000_000_000
    : raw.includes('m') || /\bmillion\b/.test(raw)
      ? 1_000_000
      : raw.includes('k') || /\bthousand\b/.test(raw)
        ? 1_000
        : 1;
  const numeric = raw.replace(/r|zar|vat|incl|excl|,|\s/g, '').replace(/bn|billion|million|m|thousand|k/g, '');
  const amount = Number(numeric);
  return Number.isFinite(amount) ? Math.round(amount * multiplier * 100) / 100 : null;
}

export function normalizePercentage(value: unknown): number | null {
  if (value == null) return null;
  const match = String(value).replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const percent = Number(match[0]);
  return Number.isFinite(percent) ? percent : null;
}

export function normalizeBeeLevel(value: unknown): number | null {
  if (value == null) return null;
  const raw = String(value).trim().toLowerCase();
  const numeric = raw.match(/\b([1-8])\b/);
  if (numeric) return Number(numeric[1]);
  // Whole words: "none" is not level one.
  for (const [word, level] of Object.entries(LEVEL_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(raw)) return level;
  }
  return null;
}

export function normalizeBoolean(value: unknown): boolean | null {
  if (value == null) return null;
  const raw = String(value).trim().toLowerCase();
  if (['yes', 'true', 'y', '1'].includes(raw)) return true;
  if (['no', 'false', 'n', '0'].includes(raw)) return false;
  return null;
}

export function normalizeDate(value: unknown): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return raw;

  const slash = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (slash) {
    const day = slash[1].padStart(2, '0');
    const month = slash[2].padStart(2, '0');
    return `${slash[3]}-${month}-${day}`;
  }

  const named = raw.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
  if (named) {
    const monthIndex = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec']
      .findIndex((m) => named[2].toLowerCase().startsWith(m));
    if (monthIndex >= 0) {
      const adjusted = monthIndex > 8 ? monthIndex : monthIndex + 1;
      return `${named[3]}-${String(adjusted).padStart(2, '0')}-${named[1].padStart(2, '0')}`;
    }
  }

  // Last resort: whatever the engine can parse ("July 14, 2023"). A bare
  // number is not a date (an Excel serial or a lone figure comes back as some
  // year), nor is anything placed outside the years a document can mean.
  if (/^[\d\s.,]+$/.test(raw)) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  // The engine parses a written date as LOCAL midnight; reading it back in UTC
  // (toISOString) moved every such date a day earlier east of Greenwich.
  const year = parsed.getFullYear();
  if (year < 1900 || year > 2100) return null;
  return `${year}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

export function normalizeValue(value: unknown, dataType: ParserDataType): unknown | null {
  switch (dataType) {
    case 'money':
      return normalizeMoney(value);
    case 'percentage':
      return normalizePercentage(value);
    case 'date':
      return normalizeDate(value);
    case 'boolean':
      return normalizeBoolean(value);
    case 'bee_level':
      return normalizeBeeLevel(value);
    case 'number': {
      const n = Number(String(value ?? '').replace(/,/g, ''));
      return Number.isFinite(n) ? n : null;
    }
    case 'string':
    default:
      return value == null ? null : String(value).trim();
  }
}
