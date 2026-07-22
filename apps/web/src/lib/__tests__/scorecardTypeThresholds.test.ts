/**
 * Scorecard-type inference from revenue.
 *
 * Getting this wrong puts an entity on the WRONG SCORECARD ENTIRELY — different
 * elements, weightings and level bands — so it is worth more than the one line
 * of code suggests.
 *
 * Two bugs are pinned here:
 *
 *  1. Sector codes set their own thresholds. The generic bands were applied to
 *     every sector, so a Transport entity on R40m was classified QSE when the
 *     Integrated Transport Sector Code makes it Large above R35m. Thandanani
 *     (R10.8m) is QSE under both sets, which is exactly why nobody noticed —
 *     the one case we had did not discriminate.
 *
 *  2. The old inference could only ever return QSE or Generic, so every EME was
 *     mis-typed as a QSE and measured on a scorecard it is exempt from.
 */
import { describe, expect, it } from 'vitest';
import { inferScorecardTypeFromRevenue } from '../excelImport';

describe('Transport Sector Code bands (EME < R5m, QSE R5m–R35m, Large > R35m)', () => {
  it('classifies across the Transport bands', () => {
    expect(inferScorecardTypeFromRevenue(4_000_000, 'TRANSPORT')).toBe('EME');
    expect(inferScorecardTypeFromRevenue(5_000_000, 'TRANSPORT')).toBe('QSE');
    expect(inferScorecardTypeFromRevenue(10_826_271, 'TRANSPORT')).toBe('QSE'); // Thandanani
    expect(inferScorecardTypeFromRevenue(34_999_999, 'TRANSPORT')).toBe('QSE');
    expect(inferScorecardTypeFromRevenue(35_000_000, 'TRANSPORT')).toBe('Generic');
  });
});

describe('amended Codes bands (EME < R10m, QSE R10m–R50m, Generic > R50m)', () => {
  it('classifies across the generic bands', () => {
    expect(inferScorecardTypeFromRevenue(9_999_999)).toBe('EME');
    expect(inferScorecardTypeFromRevenue(10_000_000)).toBe('QSE');
    expect(inferScorecardTypeFromRevenue(49_999_999)).toBe('QSE');
    expect(inferScorecardTypeFromRevenue(50_000_000)).toBe('Generic');
  });

  it('falls back to the generic bands for an unknown sector', () => {
    expect(inferScorecardTypeFromRevenue(40_000_000, 'SOMETHING_ELSE')).toBe('QSE');
    expect(inferScorecardTypeFromRevenue(40_000_000, undefined)).toBe('QSE');
  });
});

describe('the band where the two codes disagree — this was the bug', () => {
  it('puts a R40m Transport entity on the Large scorecard, not QSE', () => {
    expect(inferScorecardTypeFromRevenue(40_000_000, 'TRANSPORT')).toBe('Generic');
    expect(inferScorecardTypeFromRevenue(40_000_000)).toBe('QSE');
    // The whole point: sector changes the answer in R35m–R50m.
    expect(inferScorecardTypeFromRevenue(40_000_000, 'TRANSPORT'))
      .not.toBe(inferScorecardTypeFromRevenue(40_000_000));
  });

  it('agrees below R35m, which is why Thandanani never exposed it', () => {
    expect(inferScorecardTypeFromRevenue(10_826_271, 'TRANSPORT'))
      .toBe(inferScorecardTypeFromRevenue(10_826_271));
  });
});

describe('EME', () => {
  it('classifies an EME as an EME, not as a small QSE', () => {
    // The old inference had no EME branch at all.
    expect(inferScorecardTypeFromRevenue(3_000_000, 'TRANSPORT')).toBe('EME');
    expect(inferScorecardTypeFromRevenue(3_000_000)).toBe('EME');
  });
});

describe('edge cases', () => {
  it('infers nothing without revenue rather than guessing a type', () => {
    expect(inferScorecardTypeFromRevenue(undefined)).toBeUndefined();
    expect(inferScorecardTypeFromRevenue(undefined, 'TRANSPORT')).toBeUndefined();
  });

  it('treats zero revenue as an EME, not as missing data', () => {
    expect(inferScorecardTypeFromRevenue(0)).toBe('EME');
  });

  it('is case-insensitive about the sector code', () => {
    expect(inferScorecardTypeFromRevenue(40_000_000, 'transport')).toBe('Generic');
  });
});
