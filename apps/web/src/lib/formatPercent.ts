/**
 * Percentages, written the way South Africa writes them.
 *
 * The decimal separator here is a COMMA. Everything in this product that
 * formats a date or an amount already says so — `toLocaleString("en-ZA")`
 * appears in sixty-odd places and produces "R 1 250 000,50". Percentages were
 * the exception, because `toFixed` is not locale-aware and always emits a full
 * stop: a scorecard could show "R 1 250 000,50 spend" beside "26.4% black
 * ownership" on the same card.
 *
 * On a B-BBEE certificate that inconsistency is not cosmetic. Ownership
 * percentages are the number a verification agency signs off on, and a document
 * that punctuates them like an American spreadsheet reads as though it came
 * from one.
 */

/** en-ZA gives "," for the decimal and a space for thousands. */
const LOCALE = "en-ZA";

export interface PercentFormatOptions {
  /** Decimal places. Default 1 below ten, 0 at or above it — small holdings are where the decimal matters. */
  decimals?: number;
  /** What to render when there is no number. Default "Missing". */
  fallback?: string;
  /** Append the % sign. Default true. */
  withSymbol?: boolean;
}

/**
 * Format a percentage already expressed in percent (26.4 → "26,4%").
 *
 * Null, undefined and NaN return the fallback rather than "NaN%" — an absent
 * ownership figure must never render as though it were a measured zero.
 */
export function formatPercent(
  value: number | null | undefined,
  options: PercentFormatOptions = {},
): string {
  const { fallback = "Missing", withSymbol = true } = options;
  if (value == null || !Number.isFinite(value)) return fallback;

  const decimals = options.decimals ?? (Math.abs(value) < 10 ? 1 : 0);
  const text = value.toLocaleString(LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return withSymbol ? `${text}%` : text;
}

/**
 * The same, for a value stored as a fraction (0.264 → "26,4%").
 *
 * Both shapes are in the data: the registry stores ownership out of 100, the
 * toolkit's shareholder records store it out of 1. Converting at the call site
 * is where a hundredfold error gets introduced, so it is done here instead.
 */
export function formatPercentFromFraction(
  value: number | null | undefined,
  options: PercentFormatOptions = {},
): string {
  if (value == null || !Number.isFinite(value)) {
    return options.fallback ?? "Missing";
  }
  return formatPercent(value * 100, options);
}
