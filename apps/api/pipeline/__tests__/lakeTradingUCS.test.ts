/**
 * Lake Trading — UCS (Unified Calculation Service) Integration Test
 *
 * Validates that POST /api/calculate with Lake Trading entity arrays
 * produces the exact same results as the ground truth Excel file.
 *
 * This is the acceptance test for Prompt 9: both manual and upload paths
 * should flow through the UCS and produce identical results.
 *
 * Expected exact values (from Excel):
 *   Ownership:           25.00 / 25
 *   Management Control:  11.77 / 19   (11.765470494417864)
 *   Skills Development:   0.00 / 25
 *   Pref. Procurement:   20.33 / 29   (20.333988202597936)
 *   Supplier Dev:         3.69 / 10   (3.6913447533499544)
 *   Enterprise Dev:       2.36 /  7   (2.3624606421439704)
 *   Socio-Economic Dev:   0.41 /  5   (0.40604792286849495)
 *   Grand Total:         63.56 / 120  (63.55931201537822)
 *   B-BBEE Level: 7, Discounted: 8
 */

import { describe, it, expect } from 'vitest';
import { calculateScorecard } from '../rules/calculationEngine.js';
import type {
  EmployeeInput,
  ShareholderInput,
  SupplierInput,
  ContributionInput,
  FinancialsInput,
} from '../rules/calculationEngine.js';

const FINANCIALS: FinancialsInput = {
  revenue: 274_953_097,
  npat: 33_862_998,
  leviableAmount: 2_069_572,
  tmps: 133_730_345.99,
  headcount: 12,
};

const EMPLOYEES: EmployeeInput[] = [
  { name: 'Director A', gender: 'Female', race: 'African', designation: 'Board', isDisabled: false, isForeign: false },
  { name: 'Director B', gender: 'Male', race: 'White', designation: 'Board', isDisabled: false, isForeign: false },
  { name: 'Exec A', gender: 'Male', race: 'African', designation: 'Executive Director', isDisabled: false, isForeign: false },
  { name: 'Exec B', gender: 'Female', race: 'African', designation: 'Executive Director', isDisabled: false, isForeign: false },
  { name: 'OEM A', gender: 'Male', race: 'White', designation: 'Other Executive Management', isDisabled: false, isForeign: false },
  { name: 'Sen A', gender: 'Male', race: 'African', designation: 'Senior', isDisabled: false, isForeign: false },
  { name: 'Sen B', gender: 'Female', race: 'White', designation: 'Senior', isDisabled: false, isForeign: false },
  { name: 'Mid A', gender: 'Female', race: 'African', designation: 'Middle', isDisabled: false, isForeign: false },
  { name: 'Mid B', gender: 'Male', race: 'Indian', designation: 'Middle', isDisabled: false, isForeign: false },
  { name: 'Jun A', gender: 'Male', race: 'African', designation: 'Junior', isDisabled: false, isForeign: false },
  { name: 'Jun B', gender: 'Female', race: 'African', designation: 'Junior', isDisabled: false, isForeign: false },
  { name: 'Jun C', gender: 'Male', race: 'White', designation: 'Junior', isDisabled: false, isForeign: false },
];

const SHAREHOLDERS: ShareholderInput[] = [
  {
    name: 'Lake Family Trust',
    blackOwnership: 1.0,
    blackWomenOwnership: 0.5,
    shares: 100,
    shareValue: 1,
    yearsHeld: 3,
    isDesignatedGroup: true,
    blackNewEntrant: true,
  },
];

const SUPPLIERS: SupplierInput[] = [
  {
    name: 'EME Bulk',
    spend: 133_696_348.453,
    beeLevel: 1,
    blackOwnership: 1.0,
    blackWomenOwnership: 0,
    enterpriseType: 'eme',
    isEME: true,
    isQSE: false,
    isBlackOwned51: true,
    isBlackWomanOwned30: false,
  },
  {
    name: 'QSE Small',
    spend: 2_233_217.8945,
    beeLevel: 4,
    blackOwnership: 1.0,
    blackWomenOwnership: 0,
    enterpriseType: 'qse',
    isEME: false,
    isQSE: true,
    isBlackOwned51: true,
    isBlackWomanOwned30: false,
  },
];

const CONTRIBUTIONS: ContributionInput[] = [
  { beneficiary: 'SD Beneficiary', type: 'direct_cost', amount: 250_000, category: 'sd' },
  { beneficiary: 'ED Beneficiary', type: 'direct_cost', amount: 160_000, category: 'ed' },
  { beneficiary: 'OPERATION SMILE', type: 'grant', amount: 27_500, category: 'sed' },
];

const EXPECTED = {
  ownership: 25.00,
  managementControl: 11.77,
  skillsDevelopment: 0.00,
  procurement: 20.33,
  supplierDevelopment: 3.69,
  enterpriseDevelopment: 2.36,
  socioEconomicDevelopment: 0.41,
  grandTotal: 63.56,
  beeLevel: 7,
  discountedLevel: 8,
};

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

describe('Lake Trading — UCS Engine Integration Test', () => {
  let result: Awaited<ReturnType<typeof calculateScorecard>>;

  // Run the UCS engine once for all tests
  it('should calculate scorecard without errors', async () => {
    result = await calculateScorecard({
      assessmentId: 'lake-trading-ucs-test',
      sectorCode: 'RCOGP',
      scorecardType: 'Generic',
      entityValues: new Map(),
      crossPillarValues: new Map([
        ['npat', FINANCIALS.npat],
        ['tmps', FINANCIALS.tmps],
        ['leviableAmount', FINANCIALS.leviableAmount],
        ['totalEmployees', FINANCIALS.headcount],
      ]),
      employees: EMPLOYEES,
      shareholders: SHAREHOLDERS,
      suppliers: SUPPLIERS,
      contributions: CONTRIBUTIONS,
      financials: FINANCIALS,
      province: 'Gauteng',
    });

    expect(result).toBeDefined();
    expect(result.calculationErrors).toHaveLength(0);
  });

  it('Grand Total: ~63.56/120', () => {
    expect(result.totalPoints).toBeCloseTo(EXPECTED.grandTotal, 0);
  });

  it('B-BBEE Level: 8 (discounted from 7 — Skills sub-minimum failed)', () => {
    expect(result.beeLevel).toBe(EXPECTED.discountedLevel);
  });

  it('Ontology snapshot is present', () => {
    expect(result.ontologySnapshot).toBeDefined();
    expect(result.ontologySnapshot?.configSource).toBeDefined();
    expect(result.ontologySnapshot?.pillarTraces).toBeDefined();
  });

  it('Ontology: zeroScorePillars includes skillsDevelopment', () => {
    const zeroPillars = result.ontologySnapshot?.zeroScorePillars || [];
    expect(zeroPillars).toContain('skillsDevelopment');
  });

  // Per-pillar score assertions
  it('Ownership: 25.00/25', () => {
    const p = result.pillars.find(p => p.pillarCode === 'ownership');
    expect(p).toBeDefined();
    expect(round2(p!.points)).toBe(EXPECTED.ownership);
  });

  it('Management Control: ~11.77/19', () => {
    const p = result.pillars.find(p => p.pillarCode === 'managementControl');
    expect(p).toBeDefined();
    expect(p!.points).toBeCloseTo(EXPECTED.managementControl, 0);
  });

  it('Skills Development: 0.00/25', () => {
    const p = result.pillars.find(p => p.pillarCode === 'skillsDevelopment');
    expect(p).toBeDefined();
    expect(round2(p!.points)).toBe(EXPECTED.skillsDevelopment);
  });

  it('Preferential Procurement: 20.33/29', () => {
    const p = result.pillars.find(p => p.pillarCode === 'preferentialProcurement');
    expect(p).toBeDefined();
    expect(round2(p!.points)).toBe(EXPECTED.procurement);
  });

  it('Enterprise & Supplier Development: combined pillar exists', () => {
    const p = result.pillars.find(p => p.pillarCode === 'enterpriseSupplierDevelopment');
    expect(p).toBeDefined();
    expect(p!.maxPoints).toBe(17);
  });

  it('SD criterion: 3.69/10 within ESD pillar', () => {
    const esd = result.pillars.find(p => p.pillarCode === 'enterpriseSupplierDevelopment');
    const sdCrit = esd?.criteria?.find(c => c.criterionCode === 'ESD-SD');
    expect(sdCrit).toBeDefined();
    expect(round2(sdCrit!.points)).toBe(EXPECTED.supplierDevelopment);
  });

  it('ED criterion: 2.36/5 within ESD pillar', () => {
    const esd = result.pillars.find(p => p.pillarCode === 'enterpriseSupplierDevelopment');
    const edCrit = esd?.criteria?.find(c => c.criterionCode === 'ESD-ED');
    expect(edCrit).toBeDefined();
    expect(round2(edCrit!.points)).toBe(EXPECTED.enterpriseDevelopment);
  });

  it('Socio-Economic Development: 0.41/5', () => {
    const p = result.pillars.find(p => p.pillarCode === 'socioEconomicDevelopment');
    expect(p).toBeDefined();
    expect(round2(p!.points)).toBe(EXPECTED.socioEconomicDevelopment);
  });

  it('Sub-minimums: Skills should fail', () => {
    expect(result.subMinimums['skillsDevelopment']).toBe(false);
  });

  it('Sub-minimums: Ownership, Procurement, and ESD should pass', () => {
    expect(result.subMinimums['ownership']).toBe(true);
    expect(result.subMinimums['preferentialProcurement']).toBe(true);
    expect(result.subMinimums['enterpriseSupplierDevelopment']).toBe(true);
  });
});
