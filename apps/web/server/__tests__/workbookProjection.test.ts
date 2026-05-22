/**
 * Lake Trading — workbook submit → projection → calculators end-to-end.
 *
 * Verifies that `projectWorkbookToClient` writes every field the scoring
 * calculators read, after the fixes in `docs/LAKE_TRADING_FIX_PLAN.md`.
 * The umbrella assertion is that the sum of pillar scores for the Lake
 * Trading demo workbook is ≈ 63.56 (Excel ground truth).
 */
import { describe, it, expect } from 'vitest';
import type { WorkbookData } from '../workbookRoutes';
import { projectWorkbookToClient } from '../workbookRoutes';
import { buildLakeTradingWorkbookSections } from '../../src/lib/lakeTradingWorkbookFixture';
import {
  LAKE_NPAT,
  LAKE_TMPS,
  lakeTradingOwnership,
} from '../../src/lib/lakeTradingDemo';
import { calculateOwnershipScore } from '@toolkit/lib/calculators/ownership';
import { calculateManagementScore } from '@toolkit/lib/calculators/management';
import { calculateProcurementScore } from '@toolkit/lib/calculators/procurement';
import { calculateEsdScore, calculateSedScore } from '@toolkit/lib/calculators/esd-sed';
import type { CalculatorConfig } from '../../shared/schema';

// Hand-built CalculatorConfig mirroring the RCOGP Generic SectorConfig fields
// that the calculators read. This avoids spinning up the API and keeps the
// projection test focused on the data-flow fix.
const RCOGP_GENERIC_CONFIG: CalculatorConfig = {
  totalMaxPoints: 120,
  ownership: {
    votingRightsMax: 4,
    womenBonusMax: 2,
    economicInterestMax: 4,
    netValueMax: 8,
    targetEconomicInterest: 0.25,
    subMinNetValue: 3.2,
  },
  management: {
    boardBlackTarget: 0.50,
    boardBlackPoints: 2,
    boardWomenTarget: 0.25,
    boardWomenPoints: 1,
    execBlackTarget: 0.50,
    execBlackPoints: 2,
    execWomenTarget: 0.25,
    execWomenPoints: 1,
    disabledTarget: 0.02,
    execBWTarget: 0.25,
    execBWMaxPts: 1,
  },
  managementControl: {
    maxPoints: 19,
    subMinimumPercent: 0,
    boardBlackTarget: 0.50,
    boardBlackMaxPts: 2,
    boardBWTarget: 0.25,
    boardBWMaxPts: 1,
    execBlackTarget: 0.50,
    execBlackMaxPts: 2,
    execBWTarget: 0.25,
    execBWMaxPts: 1,
    otherExecBlackTarget: 0.60,
    otherExecBlackMaxPts: 2,
    otherExecBWTarget: 0.30,
    otherExecBWMaxPts: 1,
    seniorMaxPts: 2,
    seniorBWMaxPts: 1,
    middleMaxPts: 2,
    middleBWMaxPts: 1,
    juniorMaxPts: 1,
    juniorBWMaxPts: 1,
    disabledTarget: 0.02,
    disabledMaxPts: 2,
  },
  employmentEquity: {
    maxPoints: 0,
    disabledTarget: 0.02,
    disabledMaxPts: 2,
  },
  skills: {
    generalMax: 6,
    bursaryMax: 4,
    overallTarget: 3.5,
    bursaryTarget: 2.5,
    subMinThreshold: 10,
    learningProgrammesMaxPts: 6,
    bursaryMaxPts: 4,
    disabledLearningMaxPts: 4,
    learnershipsMaxPts: 6,
    absorptionMaxPts: 5,
    learnershipTargetPercent: 5.0,
    absorptionTargetPercent: 2.5,
    overallSpendPercent: 3.5,
    bursarySpendPercent: 2.5,
    disabledSpendPercent: 0.3,
  },
  procurement: {
    baseMax: 27,
    bonusMax: 2,
    tmpsTarget: 0,
    subMinThreshold: 10.8,
    blackOwnedThreshold: 0.50,
    blackWomenThreshold: 0.30,
    allSuppliersTarget: 0.80,
    allSuppliersMaxPts: 5,
    qseTarget: 0.15,
    qseMaxPts: 3,
    emeTarget: 0.15,
    emeMaxPts: 4,
    bo51Target: 0.50,
    bo51MaxPts: 11,
    bwo30Target: 0.12,
    bwo30MaxPts: 4,
    dgTarget: 0.02,
    dgMaxPts: 2,
  },
  esd: {
    supplierDevMax: 10,
    enterpriseDevMax: 5,
    supplierDevTarget: 0.02,
    enterpriseDevTarget: 0.01,
  },
  sed: {
    maxPoints: 5,
    npatTarget: 0.01,
  },
  discounting: { dropLevels: 1, maxDropLevel: 8 },
  pillarConfigs: {
    ownership: { maxPoints: 25, subMinimumPercent: 40 },
    managementControl: { maxPoints: 19, subMinimumPercent: 0 },
    employmentEquity: { maxPoints: 0 },
    skillsDevelopment: { maxPoints: 25, subMinimumPercent: 40 },
    preferentialProcurement: { maxPoints: 29, subMinimumPercent: 40 },
    supplierDevelopment: { maxPoints: 10, subMinimumPercent: 40 },
    enterpriseDevelopment: { maxPoints: 7, subMinimumPercent: 0 },
    socioEconomicDevelopment: { maxPoints: 5 },
    yesInitiative: { maxPoints: 0 },
  },
  benefitFactors: [],
  industryNorms: [],
};

function buildWorkbook(): WorkbookData {
  return {
    companyId: 'C-LAKE-DEMO',
    ownerOrganizationId: null,
    ownerUserId: 'test-user',
    sections: buildLakeTradingWorkbookSections() as any,
    updatedAt: new Date().toISOString(),
  };
}

describe('Lake Trading — projectWorkbookToClient → calculators', () => {
  const wb = buildWorkbook();
  const projection = projectWorkbookToClient(wb);

  it('shareholders carry every scoring field (Lake Trading Fix Plan Bug 1)', () => {
    expect(projection.shareholders.length).toBeGreaterThan(0);
    const sh = projection.shareholders[0] as any;
    expect(sh.blackOwnership).toBeCloseTo(1, 2);
    expect(sh.blackWomenOwnership).toBeCloseTo(0.5, 2);
    expect(sh.blackNewEntrant).toBe(true);
    expect(sh.shares).toBeGreaterThan(0);
  });

  it('employees use the calculator-side designation enum (Lake Trading Fix Plan Bug 2)', () => {
    const allowed = new Set([
      'Board',
      'Executive',
      'Executive Director',
      'Other Executive Management',
      'Senior',
      'Middle',
      'Junior',
      'Skilled Technical',
      'Semi-skilled',
      'Unskilled',
    ]);
    for (const emp of projection.employees as any[]) {
      expect(allowed.has(emp.designation)).toBe(true);
    }
  });

  it('suppliers expose enterpriseType + fraction blackOwnership + numeric beeLevel (Lake Trading Fix Plan Bug 3 + 7)', () => {
    const sups = projection.suppliers as any[];
    expect(sups.length).toBe(2);
    const types = sups.map((s) => s.enterpriseType).sort();
    expect(types).toEqual(['eme', 'qse']);
    for (const s of sups) {
      expect(s.blackOwnership).toBeLessThanOrEqual(1);
      expect(typeof s.beeLevel).toBe('number');
    }
  });

  it('ESD contributions carry category (SD / ED) and a snake_case type (Lake Trading Fix Plan Bug 4)', () => {
    const esd = projection.esdContributions as any[];
    expect(esd.length).toBe(2);
    const cats = esd.map((c) => c.category).sort();
    expect(cats).toEqual(['enterprise_development', 'supplier_development']);
    for (const c of esd) {
      expect(c.type).toMatch(/^[a-z_]+$/);
    }
  });

  it('Ownership ≈ 25/25 after projection', () => {
    const result = calculateOwnershipScore(
      {
        ...lakeTradingOwnership,
        shareholders: projection.shareholders as any,
      } as any,
      RCOGP_GENERIC_CONFIG,
    );
    expect(result.total).toBeCloseTo(25, 1);
  });

  it('Management Control ≈ 11.77/19 after projection (Gauteng EAP)', () => {
    const result = calculateManagementScore(
      { id: '', clientId: '', employees: projection.employees as any },
      RCOGP_GENERIC_CONFIG,
      'Gauteng',
    );
    expect(result.total).toBeCloseTo(11.77, 0);
  });

  it('Preferential Procurement ≈ 20.33/29 after projection', () => {
    const result = calculateProcurementScore(
      {
        id: '',
        clientId: '',
        tmps: LAKE_TMPS,
        suppliers: projection.suppliers as any,
      } as any,
      RCOGP_GENERIC_CONFIG,
    );
    expect(result.total).toBeCloseTo(20.33, 0);
  });

  it('Supplier Development ≈ 3.69, Enterprise Development ≈ 2.36 after projection', () => {
    const result = calculateEsdScore(
      {
        id: '',
        clientId: '',
        contributions: projection.esdContributions as any,
        graduationBonus: false,
        jobsCreatedBonus: false,
      } as any,
      LAKE_NPAT,
      RCOGP_GENERIC_CONFIG,
    );
    expect(result.sdTotal).toBeCloseTo(3.69, 1);
    expect(result.edTotal).toBeCloseTo(2.36, 1);
  });

  it('Socio-Economic Development ≈ 0.41 after projection', () => {
    const result = calculateSedScore(
      {
        id: '',
        clientId: '',
        contributions: projection.sedContributions as any,
      } as any,
      LAKE_NPAT,
      RCOGP_GENERIC_CONFIG,
    );
    expect(result.total).toBeCloseTo(0.41, 1);
  });

  it('Grand total ≈ 63.56 (Lake Trading Excel ground truth)', () => {
    const own = calculateOwnershipScore(
      {
        ...lakeTradingOwnership,
        shareholders: projection.shareholders as any,
      } as any,
      RCOGP_GENERIC_CONFIG,
    );
    const mgmt = calculateManagementScore(
      { id: '', clientId: '', employees: projection.employees as any },
      RCOGP_GENERIC_CONFIG,
      'Gauteng',
    );
    const proc = calculateProcurementScore(
      {
        id: '',
        clientId: '',
        tmps: LAKE_TMPS,
        suppliers: projection.suppliers as any,
      } as any,
      RCOGP_GENERIC_CONFIG,
    );
    const esd = calculateEsdScore(
      {
        id: '',
        clientId: '',
        contributions: projection.esdContributions as any,
        graduationBonus: false,
        jobsCreatedBonus: false,
      } as any,
      LAKE_NPAT,
      RCOGP_GENERIC_CONFIG,
    );
    const sed = calculateSedScore(
      {
        id: '',
        clientId: '',
        contributions: projection.sedContributions as any,
      } as any,
      LAKE_NPAT,
      RCOGP_GENERIC_CONFIG,
    );
    const grand = own.total + mgmt.total + 0 /* skills */ + proc.total + esd.sdTotal + esd.edTotal + sed.total;
    expect(grand).toBeCloseTo(63.56, 0);
  });
});
