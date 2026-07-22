/**
 * Regression: Management Control scored 0 for an entity with a Black top manager.
 *
 * Two causes, both measured on the real Thandanani Management Control sheet,
 * whose single row is "Venugopal Lutchman, Naidoo | Executive Management |
 * Member | Indian | Male":
 *
 *  1. The sheet carries BOTH a job title ("Member") and an occupational level
 *     ("Executive Management"). Projection took `designation` first, so the JOB
 *     TITLE landed in the scoring field and matched no band.
 *
 *  2. Workbooks use two vocabularies. The occupational-level list yields "Top
 *     Management" (EEA wording); the scoring normaliser only knew the
 *     designation list ("Executive Director"). Senior/Middle/Junior already fell
 *     through correctly — "Top Management" was the one gap.
 *
 * Together: one Black top manager, 0 of 27 points.
 */
import { describe, expect, it } from 'vitest';
import {
  isScoringDesignation,
  normalizeDesignationForScoring,
} from '../../Toolkit/src/lib/calculators/shared';

describe('occupational-level vocabulary', () => {
  it('maps "Top Management" to a band the scorecard counts', () => {
    expect(normalizeDesignationForScoring('Top Management')).toBe('Executive');
    expect(isScoringDesignation('Top Management')).toBe(true);
  });

  it('already handled the other management levels — these must not change', () => {
    expect(normalizeDesignationForScoring('Senior Management')).toBe('Senior');
    expect(normalizeDesignationForScoring('Middle Management')).toBe('Middle');
    expect(normalizeDesignationForScoring('Junior Management')).toBe('Junior');
  });

  it('keeps the designation vocabulary working exactly as before', () => {
    expect(normalizeDesignationForScoring('Executive Director')).toBe('Executive Director');
    expect(normalizeDesignationForScoring('Non-executive Director')).toBe('Board');
    expect(normalizeDesignationForScoring('Other Executive Manager')).toBe('Other Executive Management');
    expect(normalizeDesignationForScoring('Senior Manager')).toBe('Senior');
    expect(normalizeDesignationForScoring('Semi-skilled')).toBe('Semi-skilled');
  });

  it('still scores a blank designation nowhere', () => {
    // Guarded elsewhere too: defaulting blanks to Junior silently inflated that
    // band's denominator for every dataset with empty cells.
    expect(normalizeDesignationForScoring('')).toBe('Unclassified');
    expect(isScoringDesignation('')).toBe(false);
  });
});

describe('choosing between a job title and an occupational level', () => {
  it('recognises the occupational level and rejects the job title', () => {
    // The real row: only one of these two cells can score.
    expect(isScoringDesignation('Member')).toBe(false);
    expect(isScoringDesignation('Code 14 Driver/ Panelbeater')).toBe(false);
    expect(isScoringDesignation('Executive Management')).toBe(true);
  });

  it('treats "Executive Management" as top management, not middle', () => {
    // It contains neither "executive director" nor "manager", so before the fix
    // it fell through to the generic branches and landed nowhere useful.
    expect(normalizeDesignationForScoring('Executive Management')).toBe('Executive Director');
  });
});
