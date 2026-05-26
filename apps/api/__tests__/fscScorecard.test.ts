/**
 * Regression — FSC scorecard configuration (Task #4 audit).
 */
import { describe, expect, it } from 'vitest';
import { FSC_GENERIC, getSectorConfig } from '../pipeline/sectorConfig';
import { SECTOR_PILLAR_SUB_ELEMENTS } from '../pipeline/sectorSubElements';

describe('FSC_GENERIC — Others sub-sector pillar weights', () => {
  it('sums to 120 (25+21+23+24+10+9+8)', () => {
    const p = FSC_GENERIC.pillarConfigs;
    const total =
      p.ownership.maxPoints +
      p.managementControl.maxPoints +
      p.employmentEquity.maxPoints +
      p.skillsDevelopment.maxPoints +
      p.preferentialProcurement.maxPoints +
      p.supplierDevelopment.maxPoints +
      p.enterpriseDevelopment.maxPoints +
      p.socioEconomicDevelopment.maxPoints;
    expect(total).toBe(120);
    expect(FSC_GENERIC.totalMaxPoints).toBe(120);
  });

  it('matches the per-pillar caps documented in sectorConfig.ts', () => {
    const p = FSC_GENERIC.pillarConfigs;
    expect(p.ownership.maxPoints).toBe(25);
    expect(p.managementControl.maxPoints).toBe(21);
    expect(p.employmentEquity.maxPoints).toBe(0);
    expect(p.skillsDevelopment.maxPoints).toBe(23);
    expect(p.preferentialProcurement.maxPoints).toBe(24);
    expect(p.supplierDevelopment.maxPoints).toBe(10);
    expect(p.enterpriseDevelopment.maxPoints).toBe(9);
    expect(p.socioEconomicDevelopment.maxPoints).toBe(8);
  });
});

describe("SECTOR_PILLAR_SUB_ELEMENTS['FSC:Generic'] row totals", () => {
  const fsc = SECTOR_PILLAR_SUB_ELEMENTS['FSC:Generic'];
  // Sum non-bonus rows only — bonus rows are documented additions that don't
  // count toward the pillar cap.
  const sumNonBonus = (rows: { points: number; isBonus?: boolean }[]) =>
    rows.filter((r) => !r.isBonus).reduce((acc, r) => acc + r.points, 0);

  it('Ownership base rows sum to 23 (+2 bonus new-entrants = 25 pillar cap)', () => {
    // FSC:Generic ownership rows: 4+2+4+2+8+3 base = 23, +2 bonus = 25.
    expect(sumNonBonus(fsc.ownership)).toBe(23);
    const total = fsc.ownership.reduce((a, r) => a + r.points, 0);
    expect(total).toBe(25);
  });
  it('Management Control rows sum to 21', () => {
    expect(sumNonBonus(fsc.managementControl)).toBe(21);
  });
  it('Skills Development rows sum to 23', () => {
    expect(sumNonBonus(fsc.skillsDevelopment)).toBe(23);
  });
  it('Preferential Procurement rows sum to 22 (non-bonus; +2 bonus = 24 cap)', () => {
    // The PP rows include one explicitly-flagged bonus designated-group row.
    // 5+3+2+7+3+2 = 22 base; +2 bonus = 24 (the pillar cap).
    expect(sumNonBonus(fsc.preferentialProcurement)).toBe(22);
    const total = fsc.preferentialProcurement.reduce((a, r) => a + r.points, 0);
    expect(total).toBe(24);
  });
  it('Supplier Development rows sum to 10', () => {
    expect(sumNonBonus(fsc.supplierDevelopment)).toBe(10);
  });
  it('Enterprise Development base rows sum to 5 (+1 +3 bonus = 9 cap)', () => {
    expect(sumNonBonus(fsc.enterpriseDevelopment)).toBe(5);
    const total = fsc.enterpriseDevelopment.reduce((a, r) => a + r.points, 0);
    expect(total).toBe(9);
  });
  it('Socio-Economic Development base rows sum to 5 (+3 bonus = 8 cap)', () => {
    expect(sumNonBonus(fsc.socioEconomicDevelopment)).toBe(5);
    const total = fsc.socioEconomicDevelopment.reduce((a, r) => a + r.points, 0);
    expect(total).toBe(8);
  });
});

describe('FSC sub-sector variants — current state', () => {
  it('exposes the Generic sub-sector via getSectorConfig', () => {
    const cfg = getSectorConfig('FSC', 'Generic');
    expect(cfg.sectorCode).toBe('FSC');
    expect(cfg.totalMaxPoints).toBe(120);
  });

  // TODO (follow-up Task #10): implement Banks / Long-Term Insurers /
  // Short-Term Insurers sub-variants. The May 2026 audit documented these
  // as not yet modelled. This test pins the *current* state honestly so we
  // can flip it when Task #10 lands. See `.local/tasks/task-10.md`.
  it.skip('FSC Banks sub-variant is configured (Task #10 follow-up)', () => {
    expect(() => getSectorConfig('FSC', 'Banks')).not.toThrow();
  });
  it.skip('FSC Long-Term Insurers sub-variant is configured (Task #10 follow-up)', () => {
    expect(() => getSectorConfig('FSC', 'Long-Term Insurers')).not.toThrow();
  });
  it.skip('FSC Short-Term Insurers sub-variant is configured (Task #10 follow-up)', () => {
    expect(() => getSectorConfig('FSC', 'Short-Term Insurers')).not.toThrow();
  });
});

describe('Negative — removing a FSC pillar produces an inconsistent total', () => {
  it('a copy of FSC_GENERIC missing SED no longer sums to 120', () => {
    // Build a "broken" copy by zeroing the SED pillar; the validator we use
    // is just the arithmetic identity asserted above. This guards against
    // accidental future regression where a pillar drops to 0 silently.
    const p = { ...FSC_GENERIC.pillarConfigs };
    const broken = { ...p, socioEconomicDevelopment: { ...p.socioEconomicDevelopment, maxPoints: 0 } };
    const total = Object.values(broken).reduce((acc, c) => acc + c.maxPoints, 0);
    expect(total).not.toBe(120);
    expect(total).toBe(112);
  });
});
