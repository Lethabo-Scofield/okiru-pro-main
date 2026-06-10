import type { ParserDataType } from '../schemas/document_types.js';

const LEVEL_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
};

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
  for (const [word, level] of Object.entries(LEVEL_WORDS)) {
    if (raw.includes(word)) return level;
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

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
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
