/**
 * M2 — Construction sub-sector model. Verifies the UI re-model that splits the
 * sub-sector (Contractor/BEP) from the size axis (scorecardType = Generic/QSE),
 * addressing the expert feedback that "scorecard type shows Contractor/BEP when
 * that should be sub-sector; the contractor scorecard must still allow Generic vs
 * QSE". (Scoring integration to the construction engine is held for review.)
 */
import { describe, it, expect } from 'vitest';
import { getCompanyInfoMetaFields, getScorecardTypeOptions, resolveScorecardTypeForSector } from '@/components/workbook/sections';

describe('construction sub-sector model (M2)', () => {
  it('scorecardType is the size axis (Generic/QSE), not the sub-sector', () => {
    expect(getScorecardTypeOptions('CONSTRUCTION')).toEqual(['Generic', 'QSE']);
  });

  it('exposes a required constructionSubSector (Contractor|BEP) field', () => {
    const meta = getCompanyInfoMetaFields('CONSTRUCTION');
    const sub = meta.find((f) => f.key === 'constructionSubSector');
    expect(sub).toBeTruthy();
    expect(sub?.required).toBe(true);
    expect(sub?.options).toEqual(['Contractor', 'BEP']);
    const st = meta.find((f) => f.key === 'scorecardType');
    expect(st?.options).toEqual(['Generic', 'QSE']);
  });

  it('migrates legacy Contractor/BEP scorecardType to the Generic size', () => {
    expect(resolveScorecardTypeForSector('CONSTRUCTION', 'Contractor')).toBe('Generic');
    expect(resolveScorecardTypeForSector('CONSTRUCTION', 'BEP')).toBe('Generic');
    expect(resolveScorecardTypeForSector('CONSTRUCTION', 'QSE')).toBe('QSE');
  });

  it('does not add the sub-sector field for non-construction sectors', () => {
    expect(getCompanyInfoMetaFields('RCOGP').some((f) => f.key === 'constructionSubSector')).toBe(false);
    expect(getCompanyInfoMetaFields('FSC').some((f) => f.key === 'constructionSubSector')).toBe(false);
  });
});
