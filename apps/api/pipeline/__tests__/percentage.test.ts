/**
 * The percentage unit contract.
 *
 * Two things are pinned here, and the second is why this module can be adopted
 * across fourteen call sites without a review of every score in the system:
 *
 *   1. CORRECTNESS — a stated unit is honoured, so `"0.5%"` is half a percent
 *      and not half of everything.
 *   2. BEHAVIOUR PRESERVATION — on every input the old `n > 1 ? n / 100 : n`
 *      ternary could receive, `toFraction` returns exactly what the ternary
 *      returned. Adopting the module moves nothing on its own; it only makes
 *      the remaining guess visible.
 */
import { describe, it, expect } from 'vitest';
import {
  readPercent,
  toFraction,
  toPercent,
  toFractionOrZero,
  headerStatesPercent,
  ambiguityWarning,
} from '../units/percentage.js';

/** The heuristic this module replaces, kept verbatim as the baseline oracle. */
const legacyTernary = (n: number): number => (n > 1 ? n / 100 : n);

describe('a stated unit is honoured', () => {
  it('reads a percent sign in the value as percent, however small', () => {
    expect(toFraction('0.5%')).toBe(0.005);
    expect(toFraction('1%')).toBe(0.01);
    expect(toFraction('51%')).toBe(0.51);
    expect(toFraction('100%')).toBe(1);
  });

  it('is the case the old ternary got wrong', () => {
    // "0.5%" stripped to 0.5, failed `> 1`, and passed through as HALF.
    expect(legacyTernary(0.5)).toBe(0.5);
    expect(toFraction('0.5%')).toBe(0.005);
  });

  it('reads a percent column header as percent for bare numbers', () => {
    expect(toFraction(1, { header: 'Black Ownership %' })).toBe(0.01);
    expect(toFraction(0.5, { header: 'Black Ownership (percent)' })).toBe(0.005);
    expect(toFraction(0.5, { header: 'Black Ownership' })).toBe(0.5);
  });

  it('lets a caller declare its own format', () => {
    expect(toFraction(0.51, { assume: 'fraction' })).toBe(0.51);
    expect(toFraction(0.51, { assume: 'percent' })).toBe(0.0051);
  });

  it('lets an explicit % in the value outrank the caller assumption', () => {
    // The assumption describes the source; the sign describes THIS cell.
    expect(toFraction('0.5%', { assume: 'fraction' })).toBe(0.005);
  });

  it('records how the unit was settled', () => {
    expect(readPercent('51%').unitSource).toBe('value');
    expect(readPercent(51, { header: 'Share %' }).unitSource).toBe('header');
    expect(readPercent(0.51, { assume: 'fraction' }).unitSource).toBe('declared');
    expect(readPercent(51).unitSource).toBe('magnitude');
    expect(readPercent(0).unitSource).toBe('zero');
    expect(readPercent(0.51).unitSource).toBe('assumed');
  });
});

describe('the ambiguous band is flagged, not silently guessed', () => {
  it('flags a bare value strictly between 0 and 1', () => {
    for (const n of [0.005, 0.1, 0.5, 0.99, 1]) {
      expect(readPercent(n).ambiguous).toBe(true);
    }
  });

  it('does not flag anything a unit settled', () => {
    expect(readPercent('0.5%').ambiguous).toBe(false);
    expect(readPercent(0.5, { header: '% held' }).ambiguous).toBe(false);
    expect(readPercent(0.5, { assume: 'fraction' }).ambiguous).toBe(false);
    expect(readPercent(51).ambiguous).toBe(false);
  });

  it('does not flag zero — both conventions agree', () => {
    expect(readPercent(0).ambiguous).toBe(false);
    expect(readPercent(0).fraction).toBe(0);
    expect(readPercent(0).percent).toBe(0);
  });

  it('does not flag a missing value — nothing was guessed', () => {
    for (const v of [null, undefined, '', '   ', 'n/a', {}]) {
      const r = readPercent(v);
      expect(r.ambiguous).toBe(false);
      expect(r.fraction).toBeNull();
    }
  });

  it('describes an ambiguous reading for a warnings channel', () => {
    const warning = ambiguityWarning(readPercent(1), 'Supplier black ownership');
    expect(warning).toContain('Supplier black ownership');
    expect(warning).toContain('100x');
    expect(ambiguityWarning(readPercent('1%'), 'x')).toBeNull();
  });
});

describe('behaviour preservation: identical to the ternary it replaces', () => {
  /**
   * Every non-negative value the ternary could receive. Negatives are excluded
   * ON PURPOSE and covered separately below — the module is deliberately
   * different there, and better.
   */
  const inputs = [
    0, 0.0001, 0.03, 0.1, 0.3, 0.5, 0.51, 0.999, 1,
    1.0001, 1.35, 2, 25, 30, 35, 51, 75, 100, 100.5, 101, 135, 1000,
  ];

  it('matches the old ternary on every bare number', () => {
    for (const n of inputs) {
      expect(toFraction(n)).toBeCloseTo(legacyTernary(n), 12);
    }
  });

  it('matches on the numeric strings the ternary saw after stripping', () => {
    for (const n of inputs) {
      expect(toFraction(String(n))).toBeCloseTo(legacyTernary(n), 12);
    }
  });

  it('deliberately diverges on negatives, where the ternary was nonsense', () => {
    // `-51 > 1` is false, so the ternary returned -51 AS A FRACTION: minus five
    // thousand one hundred percent. Magnitude is what decides the convention,
    // so a negative reads like its positive twin and a sign error stays a sign
    // error instead of becoming a magnitude error on top.
    expect(legacyTernary(-51)).toBe(-51);
    expect(toFraction(-51)).toBeCloseTo(-0.51, 12);
    expect(toFraction(-0.51)).toBeCloseTo(-0.51, 12);
  });

  it('keeps the 51%% ownership threshold on both conventions', () => {
    expect(toFraction(51)).toBe(0.51);
    expect(toFraction(0.51)).toBe(0.51);
    expect(toFraction('51%')).toBe(0.51);
  });
});

describe('values are not clamped', () => {
  it('keeps a recognition multiplier above 100%', () => {
    expect(toPercent(135)).toBe(135);
    expect(toFraction(135)).toBeCloseTo(1.35, 12);
  });

  it('keeps a share register that oversums, so reconciliation can catch it', () => {
    expect(toPercent('101%')).toBe(101);
  });

  it('keeps a negative, so a sign error surfaces rather than hides', () => {
    expect(toPercent('-5%')).toBe(-5);
  });
});

describe('the two conventions are both reported', () => {
  it('gives fraction and percent for the same reading', () => {
    const r = readPercent('51%');
    expect(r.fraction).toBe(0.51);
    expect(r.percent).toBe(51);
  });

  it('inverts cleanly, replacing the backwards aiEntityMapper heuristic', () => {
    // `normalizePercent` was `num > 1 ? num : num * 100` — the mirror image of
    // the other thirteen sites. Both directions now come from one reading.
    expect(toPercent(51)).toBe(51);
    expect(toPercent(0.51)).toBe(51);
    expect(toPercent('51%')).toBe(51);
  });
});

describe('messy real-world cells', () => {
  it('strips currency noise, separators and spaces', () => {
    expect(toFraction('51 %')).toBe(0.51);
    expect(toFraction(' 51% ')).toBe(0.51);
    expect(toFraction('1,000')).toBe(10);
    expect(toPercent('−5%')).toBe(-5); // unicode minus
  });

  it('floors a missing value at zero only where the caller asks', () => {
    expect(toFraction(null)).toBeNull();
    expect(toFractionOrZero(null)).toBe(0);
  });

  it('recognises percent headers without matching unrelated words', () => {
    expect(headerStatesPercent('Black Ownership %')).toBe(true);
    expect(headerStatesPercent('Percentage held')).toBe(true);
    expect(headerStatesPercent('Pct')).toBe(true);
    expect(headerStatesPercent('Supplier Name')).toBe(false);
    expect(headerStatesPercent(undefined)).toBe(false);
  });
});
