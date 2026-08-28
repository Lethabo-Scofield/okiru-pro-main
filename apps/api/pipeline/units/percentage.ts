/**
 * Percentages that carry their unit.
 *
 * THE BUG THIS EXISTS TO KILL
 *
 * Fourteen places in this repo wrote some spelling of:
 *
 *     const fraction = n > 1 ? n / 100 : n;
 *
 * It is a guess, and it is wrong in a way that moves money. A supplier holding
 * ONE PERCENT black ownership arrives as `1`, fails `n > 1`, and is passed
 * through as the fraction `1.0` — a hundred percent. That supplier then lands
 * in the 51%-black-owned spend bucket and earns preferential-procurement points
 * it is not entitled to. The comment on the old `reconcileEntity.pctCell` said
 * the quiet part out loud: `100→1.0, 1→1.0`.
 *
 * Worse, the guess was not applied consistently. `aiEntityMapper` ran it
 * BACKWARDS (`num > 1 ? num : num * 100`), so the same ambiguous cell was
 * normalised in opposite directions depending on which path read it.
 *
 * THE FIX IS NOT A BETTER GUESS
 *
 * There is no better guess. `0.5` genuinely means 50% on one share register and
 * 0.5% on another, and no amount of cleverness recovers which. The fix is to
 * stop throwing the unit away, and — where it is genuinely absent — to say so
 * instead of silently inventing one.
 *
 * So a reading reports three things, not one:
 *
 *   - the VALUE, in both conventions, so no caller has to convert;
 *   - the UNIT THE SOURCE STATED, or null when the source stated none;
 *   - whether the answer required a GUESS.
 *
 * `okiru-ai-parser/src/services/sheetCellValues.ts` is the other half of this
 * and came first: it keeps a percent-formatted Excel cell as its display text
 * (`"32%"`) so the unit survives the read at all. This module is what consumes
 * that, plus every other channel a unit can arrive on.
 *
 * WHAT COUNTS AS THE SOURCE STATING A UNIT
 *
 *   1. A literal `%` in the value.          `"51%"`, `"51 %"`.
 *   2. A `%` / "percent" / "pct" in the      A `Black Ownership %` column means
 *      COLUMN HEADER it came from.          its cells are percentages.
 *   3. A caller that knows its own format.   `{ assume: 'fraction' }`.
 *   4. Magnitude above 1.                    `51` cannot be a fraction of a
 *                                            whole; only percent reads.
 *
 * Rule 4 is not a guess: it is the one case where the two conventions cannot
 * both be true. Everything strictly between 0 and 1 with no signal from rules
 * 1-3 IS a guess, and is marked `ambiguous`.
 *
 * WHY THE AMBIGUOUS CASE STILL RETURNS A NUMBER
 *
 * Because refusing to score is its own kind of wrong answer, and because the
 * fallback preserves what this codebase already did, so adopting this module
 * cannot move an existing score on its own. The difference is that the guess is
 * now VISIBLE: `ambiguous` is true, and callers with a warnings channel report
 * it so a human resolves the unit instead of a ternary doing it in silence.
 *
 * Values are never clamped. A 135% procurement recognition multiplier and a
 * share register that sums to 101% are both real; truncating them here would
 * hide a data problem the reconciliation layer exists to catch.
 */

/** The two conventions a percentage travels in. */
export type PercentUnit = 'percent' | 'fraction';

/** How a reading arrived at its unit — for logs, review UI and tests. */
export type PercentUnitSource =
  /** A literal `%` in the value itself. */
  | 'value'
  /** The column header said so. */
  | 'header'
  /** The caller declared its own format. */
  | 'declared'
  /** Above 1, so only one convention can read it. */
  | 'magnitude'
  /** Exactly 0 — identical under both conventions. */
  | 'zero'
  /** Nothing said. `ambiguous` is true and the fallback applied. */
  | 'assumed';

export interface PercentReading {
  /** 0-1 convention (`0.51` for 51%). Null when the input is not a number. */
  fraction: number | null;
  /** 0-100 convention (`51` for 51%). Null when the input is not a number. */
  percent: number | null;
  /** The unit the SOURCE stated, or null when it stated none. */
  unit: PercentUnit | null;
  /** How the unit was determined. */
  unitSource: PercentUnitSource;
  /** True when no signal settled the unit and the fallback had to guess. */
  ambiguous: boolean;
}

export interface ReadPercentOptions {
  /**
   * The column header this value came from. A header carrying `%`, "percent"
   * or "pct" states the unit for every cell beneath it.
   */
  header?: string;
  /**
   * The unit the CALLER knows its own data is in — for a source whose format is
   * fixed and documented. Overridden by an explicit `%` in the value, which is
   * evidence about this particular cell rather than about the source in general.
   */
  assume?: PercentUnit;
  /**
   * What to fall back to when nothing states a unit. Defaults to `'fraction'`,
   * which is what every `n > 1 ? n / 100 : n` in this repo already did — so a
   * call site can adopt this module without moving a single score.
   */
  fallback?: PercentUnit;
}

const EMPTY: PercentReading = {
  fraction: null,
  percent: null,
  unit: null,
  unitSource: 'assumed',
  ambiguous: false,
};

/** Does a column header declare its cells to be percentages? */
export function headerStatesPercent(header: string | undefined): boolean {
  if (!header) return false;
  return /%|percent(age)?|\bpct\b/i.test(header);
}

/**
 * Strip everything that is not part of the number. Handles `R`, non-breaking
 * and thin spaces, thousands separators, percent signs and unicode minus.
 */
function toNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (text === '') return null;
  const cleaned = text
    .replace(/−/g, '-')
    .replace(/[\s ,]/g, '')
    .replace(/%/g, '')
    .replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

/**
 * Read a percentage, reporting its unit and whether that unit had to be guessed.
 *
 * Never throws. A value that is not a number at all reads as null in both
 * conventions with `ambiguous: false` — nothing was guessed, there was simply
 * nothing there.
 */
export function readPercent(raw: unknown, options: ReadPercentOptions = {}): PercentReading {
  const num = toNumber(raw);
  if (num === null) return EMPTY;

  const text = typeof raw === 'string' ? raw : '';
  const fallback = options.fallback ?? 'fraction';

  let unit: PercentUnit;
  let unitSource: PercentUnitSource;

  if (text.includes('%')) {
    // The cell says `%`. Evidence about THIS value, so it outranks any
    // assumption made about the source as a whole.
    unit = 'percent';
    unitSource = 'value';
  } else if (headerStatesPercent(options.header)) {
    unit = 'percent';
    unitSource = 'header';
  } else if (options.assume) {
    unit = options.assume;
    unitSource = 'declared';
  } else if (num === 0) {
    // Zero is zero under both conventions — nothing was guessed.
    unit = fallback;
    unitSource = 'zero';
  } else if (Math.abs(num) > 1) {
    // Only percent can read above 1, so this is settled, not assumed.
    unit = 'percent';
    unitSource = 'magnitude';
  } else {
    // Strictly between 0 and 1 with nothing to go on: the genuine ambiguity.
    return {
      fraction: fallback === 'percent' ? num / 100 : num,
      percent: fallback === 'percent' ? num : num * 100,
      unit: null,
      unitSource: 'assumed',
      ambiguous: true,
    };
  }

  return {
    fraction: unit === 'percent' ? num / 100 : num,
    percent: unit === 'percent' ? num : num * 100,
    unit,
    unitSource,
    ambiguous: false,
  };
}

/**
 * The 0-1 form, or null when there is no number.
 *
 * Drop-in for `n > 1 ? n / 100 : n` — identical on every input that ternary
 * handled, and correct on the ones it did not (`"0.5%"` is half a percent, not
 * half of everything).
 */
export function toFraction(raw: unknown, options: ReadPercentOptions = {}): number | null {
  return readPercent(raw, options).fraction;
}

/** The 0-100 form, or null when there is no number. */
export function toPercent(raw: unknown, options: ReadPercentOptions = {}): number | null {
  return readPercent(raw, options).percent;
}

/**
 * The 0-1 form with a floor of 0, for the many call sites whose contract is
 * "a number, always" and which treated a missing value as nothing held.
 */
export function toFractionOrZero(raw: unknown, options: ReadPercentOptions = {}): number {
  return toFraction(raw, options) ?? 0;
}

/** The 0-100 form with a floor of 0. */
export function toPercentOrZero(raw: unknown, options: ReadPercentOptions = {}): number {
  return toPercent(raw, options) ?? 0;
}

/**
 * Describe an ambiguous reading for a warnings channel.
 *
 * Returns null when nothing was guessed, so a caller can append the result
 * unconditionally and only ever report real ambiguity.
 */
export function ambiguityWarning(reading: PercentReading, label: string): string | null {
  if (!reading.ambiguous) return null;
  const asFraction = Number((reading.fraction ?? 0).toFixed(6));
  const asPercent = Number((reading.percent ?? 0).toFixed(6));
  return (
    `${label} is ${asFraction} with no unit stated — read as ${asPercent}%. ` +
    `If the source meant ${asFraction}%, the figure is 100x too high. ` +
    `Add a % sign, or a "%" column header, to settle it.`
  );
}
