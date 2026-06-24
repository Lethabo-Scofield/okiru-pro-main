import { describe, it, expect } from 'vitest';
import { resolveConstructionEntityType } from '../pipeline/constructionIndicators';

/**
 * M2 foundation: the (sub-sector × size) → engine entity-type resolver. The
 * Construction engine already has Contractor/BEP/QSE scorecards (from the docx);
 * this maps the clean two-axis UI model onto them and stays backward-compatible
 * with the legacy single scorecardType field.
 */
describe('resolveConstructionEntityType', () => {
  it('maps any QSE-size entity to the QSE scorecard (sub-sector-agnostic)', () => {
    expect(resolveConstructionEntityType('Contractor', 'QSE')).toBe('construction_qse');
    expect(resolveConstructionEntityType('BEP', 'QSE')).toBe('construction_qse');
  });

  it('maps Generic + sub-sector to the right scorecard', () => {
    expect(resolveConstructionEntityType('Contractor', 'Generic')).toBe('construction_contractor');
    expect(resolveConstructionEntityType('BEP', 'Generic')).toBe('construction_bep');
    expect(resolveConstructionEntityType('Built Environment Professional', 'Generic')).toBe('construction_bep');
  });

  it('accepts legacy single scorecardType values', () => {
    expect(resolveConstructionEntityType(undefined, 'Contractor')).toBe('construction_contractor');
    expect(resolveConstructionEntityType(undefined, 'BEP')).toBe('construction_bep');
    expect(resolveConstructionEntityType(undefined, 'QSE')).toBe('construction_qse');
  });

  it('defaults to contractor when ambiguous', () => {
    expect(resolveConstructionEntityType(undefined, 'Generic')).toBe('construction_contractor');
    expect(resolveConstructionEntityType('', '')).toBe('construction_contractor');
  });
});
