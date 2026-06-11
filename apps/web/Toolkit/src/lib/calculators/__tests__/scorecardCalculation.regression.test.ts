import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { calculateSkillsScore } from '../skills';
import { calculateProcurementScore } from '../procurement';
import { calculateEsdScore, calculateSedScore } from '../esd-sed';
import { makeCalculatorConfig } from '../../../test/makeCalculatorConfig';
import type { SkillsData, ProcurementData, ESDData, SEDData } from '../../types';

// Silence the calculators' [SCORING-TRACE] console noise for a clean run.
beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterAll(() => {
  vi.restoreAllMocks();
});

const NPAT = 1_000_000;

function skillsData(): SkillsData {
  return {
    id: '',
    clientId: 'c1',
    leviableAmount: 1_000_000,
    yesCandidatesCount: 0,
    yesAbsorbedCount: 0,
    trainingPrograms: [
      {
        id: 't1',
        name: 'SETA Programme',
        category: 'short_course',
        cost: 50_000,
        employeeId: null,
        isEmployed: true,
        isBlack: true,
      } as any,
      {
        id: 't2',
        name: 'Bursary',
        category: 'bursary',
        cost: 30_000,
        employeeId: null,
        isEmployed: false,
        isBlack: true,
      } as any,
    ],
  };
}

function procurementData(): ProcurementData {
  return {
    id: '',
    clientId: 'c1',
    tmps: 1_000_000,
    suppliers: [
      {
        id: 's1',
        name: 'Empowered Supplier',
        beeLevel: 1,
        blackOwnership: 0.6,
        blackWomenOwnership: 0.35,
        youthOwnership: 0,
        disabledOwnership: 0,
        enterpriseType: 'generic',
        isEmpoweringSupplier: true,
        isSupplierDevRecipient: false,
        hasThreeYearContract: false,
        spend: 1_000_000,
      } as any,
    ],
  };
}

function esdData(): ESDData {
  return {
    id: '',
    clientId: 'c1',
    graduationBonus: false,
    jobsCreatedBonus: false,
    contributions: [
      { id: 'e1', beneficiary: 'A', type: 'grant', amount: 30_000, category: 'supplier_development' } as any,
      { id: 'e2', beneficiary: 'B', type: 'grant', amount: 15_000, category: 'enterprise_development' } as any,
    ],
  };
}

function sedData(): SEDData {
  return {
    id: '',
    clientId: 'c1',
    contributions: [
      { id: 'sd1', beneficiary: 'School', type: 'grant', amount: 20_000, category: 'socio_economic' } as any,
    ],
  };
}

describe('scorecard calculation — valid CalculatorConfig drives non-zero pillar scores', () => {
  const config = makeCalculatorConfig();

  it('Skills: qualifying spend produces a non-zero score', () => {
    const result = calculateSkillsScore(skillsData(), config);
    expect(result.total).toBeGreaterThan(0);
    expect(result.learningProgrammes).toBeGreaterThan(0);
    expect(result.bursaries).toBeGreaterThan(0);
  });

  it('Procurement: qualifying spend produces a non-zero score', () => {
    const result = calculateProcurementScore(procurementData(), config);
    expect(result.total).toBeGreaterThan(0);
    expect(result.recognisedSpend).toBeGreaterThan(0);
  });

  it('ESD: SD + ED contributions produce non-zero SD and ED scores', () => {
    const result = calculateEsdScore(esdData(), NPAT, config);
    expect(result.sdTotal).toBeGreaterThan(0);
    expect(result.edTotal).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(0);
  });

  it('SED: qualifying contribution produces a non-zero score', () => {
    const result = calculateSedScore(sedData(), NPAT, config);
    expect(result.total).toBeGreaterThan(0);
  });

  it('recompute is deterministic (refresh-equivalent stays stable)', () => {
    const first = calculateProcurementScore(procurementData(), config);
    const second = calculateProcurementScore(procurementData(), config);
    expect(second.total).toBe(first.total);
    expect(second.recognisedSpend).toBe(first.recognisedSpend);
  });
});

describe('CalculatorConfig baseline (#4) — valid shape, and why bare-config tests threw', () => {
  it('the baseline config carries every pillar cap and a positive total', () => {
    const config = makeCalculatorConfig();
    const pc = config.pillarConfigs!;
    expect(config.totalMaxPoints).toBeGreaterThan(0);
    expect(pc.ownership!.maxPoints).toBeGreaterThan(0);
    expect(pc.managementControl!.maxPoints).toBeGreaterThan(0);
    expect(pc.skillsDevelopment!.maxPoints).toBeGreaterThan(0);
    expect(pc.preferentialProcurement!.maxPoints).toBeGreaterThan(0);
    expect(config.esd.supplierDevMax).toBeGreaterThan(0);
    expect(config.esd.enterpriseDevMax).toBeGreaterThan(0);
    expect(config.sed.maxPoints).toBeGreaterThan(0);
  });

  it('procurement THROWS without a config — the documented cause of bare-config failures', () => {
    expect(() => calculateProcurementScore(procurementData(), undefined as any)).toThrow();
  });

  it('skills still scores without a config via its RCOGP Generic defaults', () => {
    const result = calculateSkillsScore(skillsData());
    expect(result.total).toBeGreaterThan(0);
  });
});
