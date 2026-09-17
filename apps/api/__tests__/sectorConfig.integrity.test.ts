/**
 * Sector config integrity — pillar totals and sub-element sums must match
 * docs/SECTOR_TRUTH_LEDGER.md for all 11 implemented sectors.
 */
import { describe, it, expect } from 'vitest';
import {
  getSectorConfig,
  listSectorConfigs,
  sumPillarMaxPoints as sumConfigPillarMaxPoints,
} from '../pipeline/sectorConfig.js';
import {
  CONSTRUCTION_QSE_SCORECARD,
  CONSTRUCTION_CONTRACTOR_SCORECARD,
  CONSTRUCTION_BEP_SCORECARD,
} from '../pipeline/constructionIndicators.js';
import { LEDGER_GRAND_TOTALS, sectorSubElementKey } from '../pipeline/sectorSubElements.js';

const ALL_SECTORS = listSectorConfigs();

/**
 * Delegates to the production implementation. This file used to carry its own
 * copy, which silently drifted: it ignored `electiveGroupSizes` and `basePoints`
 * and so reported 28 for Transport QSE (the largest single element) instead of
 * 100. Duplicating the rule is what let it drift — there is now one.
 */
function sumPillarMaxPoints(sectorCode: string, scorecardType: string): number {
  return sumConfigPillarMaxPoints(getSectorConfig(sectorCode, scorecardType));
}

function sumSubElements(sectorCode: string, scorecardType: string, pillarKey: string): number {
  const config = getSectorConfig(sectorCode, scorecardType);
  const pillar = config.pillarConfigs[pillarKey as keyof typeof config.pillarConfigs];
  if (!pillar?.subElements?.length) return 0;
  return pillar.subElements.reduce((s, el) => s + el.points, 0);
}

function sumConstructionIndicators(entityFilter: (el: string) => boolean): number {
  const cards = [
    CONSTRUCTION_QSE_SCORECARD,
    CONSTRUCTION_CONTRACTOR_SCORECARD,
    CONSTRUCTION_BEP_SCORECARD,
  ];
  return cards
    .flatMap((c) => c.indicators)
    .filter((i) => entityFilter(i.element))
    .reduce((s, i) => s + i.weight, 0);
}

describe('sectorConfig integrity vs SECTOR_TRUTH_LEDGER', () => {
  it('lists exactly 17 sectors', () => {
    // RCOGP G/Q, ICT G/Q, AGRI G, TRANSPORT, FSC G + Banks/LTI/STI, CONSTRUCTION
    // QSE/Contractor/BEP = 14. (Was 11 before the construction + FSC sub-variants
    // were added; updated to match the registry — each is validated per-sector below.)
    expect(ALL_SECTORS).toHaveLength(17) // +FSC QSFI (GG 41287 §8.2, shipped 2026-07-26);
  });

  for (const { code, type, totalPoints } of ALL_SECTORS) {
    const key = sectorSubElementKey(code, type);

    it(`${key} totalMaxPoints matches ledger (${totalPoints})`, () => {
      const config = getSectorConfig(code, type);
      expect(config.totalMaxPoints).toBe(LEDGER_GRAND_TOTALS[key]);
      expect(sumPillarMaxPoints(code, type)).toBeCloseTo(config.totalMaxPoints, 1);
    });
  }

  const genericSectors = ALL_SECTORS.filter((s) => s.code !== 'CONSTRUCTION');

  for (const { code, type } of genericSectors) {
    it(`${code}:${type} sub-element sums match pillar headers (non-Construction)`, () => {
      const config = getSectorConfig(code, type);
      for (const [pillarKey, pillar] of Object.entries(config.pillarConfigs)) {
        if (!pillar || pillar.maxPoints <= 0) continue;
        const subSum = sumSubElements(code, type, pillarKey);
        if (subSum === 0) continue;
        expect(subSum).toBeCloseTo(pillar.maxPoints, 1);
      }
    });
  }

  it('Construction QSE indicator weights sum to 110', () => {
    const total = CONSTRUCTION_QSE_SCORECARD.indicators.reduce((s, i) => s + i.weight, 0);
    expect(total).toBe(110);
  });

  it('Construction Contractor indicator weights sum to 123', () => {
    const total = CONSTRUCTION_CONTRACTOR_SCORECARD.indicators.reduce((s, i) => s + i.weight, 0);
    expect(total).toBe(123);
  });

  it('Construction BEP indicator weights sum to 123', () => {
    const total = CONSTRUCTION_BEP_SCORECARD.indicators.reduce((s, i) => s + i.weight, 0);
    expect(total).toBe(123);
  });

  it('Transport Large has separate MC (11) and EE (18) pillars', () => {
    const config = getSectorConfig('TRANSPORT', 'Generic');
    expect(config.pillarConfigs.managementControl?.maxPoints).toBe(11);
    expect(config.pillarConfigs.employmentEquity?.maxPoints).toBe(18);
  });

  it('Transport QSE elective pillars share chooseOneGroup', () => {
    const config = getSectorConfig('TRANSPORT', 'QSE');
    const electives = ['skillsDevelopment', 'preferentialProcurement', 'enterpriseDevelopment', 'socioEconomicDevelopment'] as const;
    for (const key of electives) {
      expect(config.pillarConfigs[key]?.chooseOneGroup).toBe('transport_qse_elective');
    }
  });
});
