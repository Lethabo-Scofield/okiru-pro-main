/**
 * Construction Sector ΓÇö indicator scoring tests.
 *
 * Verifies element totals match the source documents, missing-data handling
 * is graceful, NPAT/leviable/TMPS-based calculations work, bonus indicators
 * cap their parent element, and all three entity types behave correctly.
 *
 * Run: pnpm --filter @okiru/api exec vitest run __tests__/construction.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  CONSTRUCTION_QSE_SCORECARD,
  CONSTRUCTION_CONTRACTOR_SCORECARD,
  CONSTRUCTION_BEP_SCORECARD,
  getConstructionScorecard,
  listConstructionEntityTypes,
} from '../pipeline/constructionIndicators.js';
import {
  calculateConstructionScorecard,
  validateConstructionPayload,
} from '../pipeline/constructionScoring.js';

describe('Construction sector configs', () => {
  it('QSE element weights sum to 110', () => {
    const c = CONSTRUCTION_QSE_SCORECARD;
    expect(Object.values(c.elementMaxPoints).reduce((a, b) => a + b, 0)).toBe(110);
    expect(c.totalMaxPoints).toBe(110);
  });

  it('Contractor element weights sum to 123', () => {
    const c = CONSTRUCTION_CONTRACTOR_SCORECARD;
    expect(Object.values(c.elementMaxPoints).reduce((a, b) => a + b, 0)).toBe(123);
    expect(c.totalMaxPoints).toBe(123);
  });

  it('BEP element weights sum to 123', () => {
    const c = CONSTRUCTION_BEP_SCORECARD;
    expect(Object.values(c.elementMaxPoints).reduce((a, b) => a + b, 0)).toBe(123);
    expect(c.totalMaxPoints).toBe(123);
  });

  it('every indicator weight in each scorecard sums to its element max (within bonus tolerance)', () => {
    for (const cfg of [CONSTRUCTION_QSE_SCORECARD, CONSTRUCTION_CONTRACTOR_SCORECARD, CONSTRUCTION_BEP_SCORECARD]) {
      const sums: Record<string, { main: number; bonus: number }> = {};
      for (const ind of cfg.indicators) {
        if (!sums[ind.element]) sums[ind.element] = { main: 0, bonus: 0 };
        sums[ind.element][ind.category] += ind.weight;
      }
      for (const el of Object.keys(cfg.elementMaxPoints)) {
        const totalIncludingBonus = (sums[el]?.main ?? 0) + (sums[el]?.bonus ?? 0);
        // Indicator weights (main + bonus) must equal the element max ΓÇö bonus
        // points are the headroom that lets shortfalls in main rows still hit
        // the element ceiling.
        expect(totalIncludingBonus).toBeCloseTo(cfg.elementMaxPoints[el as keyof typeof cfg.elementMaxPoints], 2);
      }
    }
  });

  it('BEP scorecard has no Junior Management row in Management Control (per source)', () => {
    const hasJuniorMC = CONSTRUCTION_BEP_SCORECARD.indicators.some(
      i => i.element === 'managementControl' && /junior/i.test(i.name)
    );
    expect(hasJuniorMC).toBe(false);
  });

  it('Contractor scorecard does include Junior Management in Management Control', () => {
    const hasJuniorMC = CONSTRUCTION_CONTRACTOR_SCORECARD.indicators.some(
      i => i.element === 'managementControl' && /junior management/i.test(i.name)
    );
    expect(hasJuniorMC).toBe(true);
  });

  it('listConstructionEntityTypes returns all three entity types', () => {
    const list = listConstructionEntityTypes();
    expect(list.map(e => e.value).sort()).toEqual(['construction_bep', 'construction_contractor', 'construction_qse']);
  });

  it('getConstructionScorecard throws on unknown entity type', () => {
    expect(() => getConstructionScorecard('not_a_real_thing')).toThrow();
  });
});

describe('Construction scoring engine', () => {
  it('returns an empty scorecard with all indicators marked missing_data when given no input', () => {
    const out = calculateConstructionScorecard('construction_qse', { indicators: {}, financials: {} });
    expect(out.totalScore).toBe(0);
    expect(out.totalAvailable).toBe(110);
    expect(out.indicators.every(i => i.status === 'missing_data')).toBe(true);
    expect(out.missingFieldSummary.length).toBeGreaterThan(0);
  });

  it('does not throw on missing financials ΓÇö marks dependent indicators missing_data', () => {
    const out = calculateConstructionScorecard('construction_contractor', {
      indicators: { supplierDevelopmentSpend: 100000 },
      financials: {},
    });
    const sd = out.indicators.find(i => i.code === 'contractor.esd.supplier_dev_contributions');
    expect(sd?.status).toBe('missing_data');
    expect(sd?.missingFields).toContain('financials.npat');
  });

  it('scores a percentage indicator correctly (full points when actual >= target)', () => {
    const out = calculateConstructionScorecard('construction_qse', {
      indicators: { votingRightsBlackPercent: 30 },
      financials: {},
    });
    const ind = out.indicators.find(i => i.code === 'qse.ownership.voting_rights_black')!;
    expect(ind.status).toBe('met');
    expect(ind.achievedPoints).toBe(5.5);
  });

  it('scores partial when actual is below target', () => {
    const out = calculateConstructionScorecard('construction_qse', {
      indicators: { votingRightsBlackPercent: 15 },
      financials: {},
    });
    const ind = out.indicators.find(i => i.code === 'qse.ownership.voting_rights_black')!;
    expect(ind.status).toBe('partial');
    expect(ind.achievedPoints).toBeCloseTo(2.75, 2);
    expect(ind.gap).toBeCloseTo(2.75, 2);
  });

  it('scores percentage_of_npat correctly', () => {
    // 1% of NPAT 10,000,000 = 100,000 target. Actual = 100,000 ΓåÆ full 7 pts.
    const out = calculateConstructionScorecard('construction_qse', {
      indicators: { supplierDevelopmentSpend: 100000 },
      financials: { npat: 10_000_000 },
    });
    const ind = out.indicators.find(i => i.code === 'qse.esd.supplier_development')!;
    expect(ind.status).toBe('met');
    expect(ind.achievedPoints).toBe(7);
  });

  it('scores percentage_of_leviable correctly', () => {
    // 1.5% of leviable 1,000,000 = 15,000. Actual = 7,500 ΓåÆ 50% ΓåÆ 7 pts of 14.
    const out = calculateConstructionScorecard('construction_qse', {
      indicators: { skillsSpendBlackOverall: 7500 },
      financials: { leviableAmount: 1_000_000 },
    });
    const ind = out.indicators.find(i => i.code === 'qse.skills.spend_black_overall')!;
    expect(ind.achievedPoints).toBeCloseTo(7, 2);
  });

  it('scores percentage_of_tmps correctly', () => {
    // 60% of TMPS 1,000,000 = 600,000. Actual = 600,000 ΓåÆ full 13.
    const out = calculateConstructionScorecard('construction_qse', {
      indicators: { ppAllEmpoweringSpend: 600000 },
      financials: { totalMeasuredProcurementSpend: 1_000_000 },
    });
    const ind = out.indicators.find(i => i.code === 'qse.esd.pp_all_empowering')!;
    expect(ind.status).toBe('met');
    expect(ind.achievedPoints).toBe(13);
  });

  it('bonus_threshold awards full weight only at/above target, zero otherwise', () => {
    const above = calculateConstructionScorecard('construction_contractor', {
      indicators: { votingRightsBlackPercent: 76 },
      financials: {},
    });
    const below = calculateConstructionScorecard('construction_contractor', {
      indicators: { votingRightsBlackPercent: 70 },
      financials: {},
    });
    const aboveBonus = above.indicators.find(i => i.code === 'contractor.ownership.bonus_voting_above_75')!;
    const belowBonus = below.indicators.find(i => i.code === 'contractor.ownership.bonus_voting_above_75')!;
    expect(aboveBonus.achievedPoints).toBe(2);
    expect(belowBonus.achievedPoints).toBe(0);
    expect(belowBonus.status).toBe('failed');
  });

  it('evidence indicator: true awards full weight, false awards 0', () => {
    const yes = calculateConstructionScorecard('construction_contractor', {
      indicators: { mentorshipProgrammeImplemented: true },
      financials: {},
    });
    const no = calculateConstructionScorecard('construction_contractor', {
      indicators: { mentorshipProgrammeImplemented: false },
      financials: {},
    });
    const yesInd = yes.indicators.find(i => i.code === 'contractor.skills.mentorship')!;
    const noInd = no.indicators.find(i => i.code === 'contractor.skills.mentorship')!;
    expect(yesInd.achievedPoints).toBe(3);
    expect(noInd.achievedPoints).toBe(0);
  });

  it('caps element scores at the element maximum even with bonus indicators', () => {
    // Saturate every Ownership indicator including bonuses. Total weights sum
    // to the element max (31), so caps shouldn't kick in unless we feed
    // overflow inputs ΓÇö verify the cap logic anyway with very high values.
    const out = calculateConstructionScorecard('construction_contractor', {
      indicators: {
        votingRightsBlackPercent: 100,
        votingRightsBlackWomenPercent: 100,
        economicInterestBlackPercent: 100,
        economicInterestBlackWomenPercent: 100,
        economicInterestDesignatedPercent: 100,
        newEntrantsPercent: 100,
        netValueRealisation: 1, // factor 100% of weight
      },
      financials: {},
    });
    expect(out.elementScores.ownership.achievedPoints).toBeLessThanOrEqual(31);
  });

  it('produces standard scorecard shape with elementScores, indicators, totals', () => {
    const out = calculateConstructionScorecard('construction_bep', { indicators: {}, financials: {} });
    expect(out).toMatchObject({
      sectorCode: 'CONSTRUCTION',
      scorecardType: 'BEP',
      entityType: 'construction_bep',
      totalAvailable: 123,
    });
    expect(Object.keys(out.elementScores).sort()).toEqual([
      'enterpriseSupplierDevelopment',
      'managementControl',
      'ownership',
      'skillsDevelopment',
      'socioEconomicDevelopment',
    ]);
    for (const e of Object.values(out.elementScores)) {
      expect(typeof e.availablePoints).toBe('number');
      expect(Array.isArray(e.indicators)).toBe(true);
    }
    for (const ind of out.indicators) {
      expect(ind).toHaveProperty('achievedPoints');
      expect(ind).toHaveProperty('availablePoints');
      expect(ind).toHaveProperty('gap');
      expect(ind).toHaveProperty('status');
      expect(ind).toHaveProperty('missingFields');
      expect(ind).toHaveProperty('evidenceRequired');
    }
  });
});

describe('Construction payload validator', () => {
  it('rejects missing entityType', () => {
    const r = validateConstructionPayload({ indicators: {}, financials: {} });
    expect(r.valid).toBe(false);
  });

  it('accepts a valid payload', () => {
    const r = validateConstructionPayload({
      entityType: 'construction_qse',
      indicators: { votingRightsBlackPercent: 25 },
      financials: { npat: 1_000_000 },
    });
    expect(r.valid).toBe(true);
  });

  it('rejects non-object payload', () => {
    expect(validateConstructionPayload(null).valid).toBe(false);
    expect(validateConstructionPayload('hi').valid).toBe(false);
  });
});
