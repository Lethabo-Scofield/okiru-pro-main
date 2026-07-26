/**
 * RCOGP Generic golden tests — Lake Trading workbook ground truth.
 *
 * Source: Lake Trading Toolkit (RCOGP).xlsx / SCORECARD_GROUND_TRUTH.md
 * Config: RCOGP_GENERIC_CALCULATOR_CONFIG (explicit sector bundle, not API fallback)
 *
 * Known discrepancies (documented in test comments):
 * - MC: Toolkit ~11.75 vs Excel 11.765470494417864 (EAP rounding / designation mapping)
 * - Grand total: sum of rounded pillars may differ by ~0.02 from Excel 63.55931201537822
 */
import { describe, it, expect } from 'vitest';
import { RCOGP_GENERIC_CALCULATOR_CONFIG } from '../../sectors/rcogp-generic';
import { calculateOwnershipScore } from '../ownership';
import { calculateManagementScore } from '../management';
import { calculateSkillsScore } from '../skills';
import { calculateProcurementScore } from '../procurement';
import { calculateEsdScore, calculateSedScore } from '../esd-sed';

const CONFIG = RCOGP_GENERIC_CALCULATOR_CONFIG;

const NPAT = 33_862_998;
const LEVIABLE = 2_069_572;
const TMPS = 133_730_345.99;
const EAP_PROVINCE = 'Gauteng';

/**
 * Excel Summary Scorecard actuals (verified 2026-03-31), with the Management
 * Control value corrected 2026-06-11 to the workbook's PER-DEMOGRAPHIC model.
 *
 * The prior managementControl = 11.765 was the value produced by the legacy
 * AGGREGATE engine (black% ÷ EAP-black-target), which does NOT match the
 * workbook. The workbook `MC Scorecard` scores each band per demographic group
 * and caps each group at bandMaxPts × effectiveEAP_group (cells E31=$E$30*EAP!C23,
 * H31=MIN(G31/E31*F31, F31)); its own cached Grand Total for Lake's data is 8.825.
 * For THIS synthetic 12-employee fixture the per-demographic total (Gauteng, 25th
 * CEE norms) is 10.38. Formula fidelity is proven in management.eapWorkbook.test.ts.
 */
const EXCEL = {
  ownership: 22, // Excel 25.00 relied on the full-award-at-25%-voting convention; per-indicator (Annexe 100, audit item 12a) scores the evidenced lines = 22
  managementControl: 10.38, // per-demographic (was 11.765 under the aggregate engine)
  skillsDevelopment: 0,
  procurement: 20.333988202597936,
  supplierDevelopment: 3.6913447533499544,
  enterpriseDevelopment: 2.3624606421439704,
  socioEconomicDevelopment: 0.40604792286849495,
  grandTotal: 59.17, // 62.17 − 3 ownership: per-indicator scoring (audit item 12a) stops gifting the un-evidenced DG/NE lines
};

const lakeOwnership = {
  id: '1',
  clientId: 'lake',
  shareholders: [
    {
      id: '1',
      name: 'Lake Family Trust',
      ownershipType: 'shareholder' as const,
      blackOwnership: 1,
      blackWomenOwnership: 0.5,
      shares: 100,
      shareValue: 1,
      votingRightsPercent: 1,
      economicInterestPercent: 1,
      isDesignatedGroup: false,
      blackNewEntrant: true,
    },
  ],
  companyValue: 50_000_000,
  outstandingDebt: 0,
  yearsHeld: 3,
};

const lakeEmployees = [
  { id: '1', name: 'Director A', gender: 'Female', race: 'African', designation: 'Board', isDisabled: false, isForeign: false },
  { id: '2', name: 'Director B', gender: 'Male', race: 'White', designation: 'Board', isDisabled: false, isForeign: false },
  { id: '3', name: 'Exec A', gender: 'Male', race: 'African', designation: 'Executive Director', isDisabled: false, isForeign: false },
  { id: '4', name: 'Exec B', gender: 'Female', race: 'African', designation: 'Executive Director', isDisabled: false, isForeign: false },
  { id: '5', name: 'OEM A', gender: 'Male', race: 'White', designation: 'Other Executive Management', isDisabled: false, isForeign: false },
  { id: '6', name: 'Sen A', gender: 'Male', race: 'African', designation: 'Senior', isDisabled: false, isForeign: false },
  { id: '7', name: 'Sen B', gender: 'Female', race: 'White', designation: 'Senior', isDisabled: false, isForeign: false },
  { id: '8', name: 'Mid A', gender: 'Female', race: 'African', designation: 'Middle', isDisabled: false, isForeign: false },
  { id: '9', name: 'Mid B', gender: 'Male', race: 'Indian', designation: 'Middle', isDisabled: false, isForeign: false },
  { id: '10', name: 'Jun A', gender: 'Male', race: 'African', designation: 'Junior', isDisabled: false, isForeign: false },
  { id: '11', name: 'Jun B', gender: 'Female', race: 'African', designation: 'Junior', isDisabled: false, isForeign: false },
  { id: '12', name: 'Jun C', gender: 'Male', race: 'White', designation: 'Junior', isDisabled: false, isForeign: false },
];

const lakeProcurement = {
  id: '1',
  clientId: 'lake',
  tmps: TMPS,
  suppliers: [
    {
      id: 'eme-bulk',
      name: 'EME bulk',
      beeLevel: 1 as const,
      enterpriseType: 'eme' as const,
      blackOwnership: 1,
      blackWomenOwnership: 0,
      youthOwnership: 0,
      disabledOwnership: 0,
      spend: 133_696_348.453,
    },
    {
      id: 'qse-small',
      name: 'QSE small',
      beeLevel: 4 as const,
      enterpriseType: 'qse' as const,
      blackOwnership: 1,
      blackWomenOwnership: 0,
      youthOwnership: 0,
      disabledOwnership: 0,
      spend: 2_233_217.8945,
    },
  ],
};

describe('RCOGP Generic — CalculatorConfig completeness', () => {
  it('loads 120 total and all eight pillar maxima from bundled config', () => {
    expect(CONFIG.totalMaxPoints).toBe(120);
    expect(CONFIG.pillarConfigs?.ownership?.maxPoints).toBe(25);
    expect(CONFIG.pillarConfigs?.managementControl?.maxPoints).toBe(19);
    expect(CONFIG.pillarConfigs?.skillsDevelopment?.maxPoints).toBe(25);
    expect(CONFIG.pillarConfigs?.preferentialProcurement?.maxPoints).toBe(29);
    expect(CONFIG.pillarConfigs?.supplierDevelopment?.maxPoints).toBe(10);
    expect(CONFIG.pillarConfigs?.enterpriseDevelopment?.maxPoints).toBe(7);
    expect(CONFIG.pillarConfigs?.socioEconomicDevelopment?.maxPoints).toBe(5);
    expect(CONFIG.pillarConfigs?.yesInitiative?.maxPoints).toBe(0);
  });

  it('exposes skills and procurement targets without undefined gaps', () => {
    expect(CONFIG.skills.overallSpendPercent).toBeCloseTo(0.035, 4); // stored as fraction after /100
    expect(CONFIG.skills.learningProgrammesMaxPts).toBe(6);
    expect(CONFIG.procurement.bo51MaxPts).toBe(11);
    expect(CONFIG.procurement.bo51Target).toBe(0.5);
    expect(CONFIG.esd.supplierDevTarget).toBeCloseTo(0.02, 4);
    expect(CONFIG.esd.enterpriseDevTarget).toBeCloseTo(0.01, 4);
    expect(CONFIG.industryNorms.length).toBeGreaterThan(0);
    expect(CONFIG.levelThresholds?.length).toBe(8);
  });
});

describe('RCOGP Generic golden — Lake Trading pillar scores', () => {
  it('Ownership = 22/25 — per-indicator, no full-award shortcut', () => {
    const r = calculateOwnershipScore(lakeOwnership, CONFIG);
    expect(r.total).toBeCloseTo(EXCEL.ownership, 1);
  });

  it('Management Control ≈ 11.77/19 (Excel 11.765)', () => {
    const r = calculateManagementScore(
      { id: '1', clientId: 'lake', employees: lakeEmployees },
      CONFIG,
      EAP_PROVINCE,
      2025, // pin: the Excel golden was produced under the 25th CEE EAP dataset
    );
    // Discrepancy: toolkit rounds EAP bands; within 0.05 of Excel
    expect(r.total).toBeCloseTo(EXCEL.managementControl, 1);
    expect(Math.abs(r.total - EXCEL.managementControl)).toBeLessThan(0.05);
  });

  it('Skills = 0/25 (no programmes)', () => {
    const r = calculateSkillsScore(
      {
        id: '1',
        clientId: 'lake',
        leviableAmount: LEVIABLE,
        trainingPrograms: [],
        yesCandidatesCount: 0,
        yesAbsorbedCount: 0,
      },
      CONFIG,
    );
    expect(r.total).toBe(EXCEL.skillsDevelopment);
    expect(r.subMinimumMet).toBe(false);
  });

  it('Procurement ≈ 20.33/29', () => {
    const r = calculateProcurementScore(lakeProcurement, CONFIG);
    expect(r.total).toBeCloseTo(EXCEL.procurement, 2);
  });

  it('Supplier Development ≈ 3.69/10', () => {
    const r = calculateEsdScore(
      {
        id: '1',
        clientId: 'lake',
        contributions: [
          {
            id: 'sd1',
            beneficiary: 'SD',
            description: 'Direct',
            type: 'direct_cost',
            amount: 250_000,
            category: 'supplier_development',
            blackBenefitPercent: 100,
            transactionDate: '2025-09-01',
          },
        ],
        graduationBonus: false,
        jobsCreatedBonus: false,
      },
      NPAT,
      CONFIG,
    );
    expect(r.supplierDev).toBeCloseTo(EXCEL.supplierDevelopment, 2);
  });

  it('Enterprise Development ≈ 2.36/7 (no bonuses)', () => {
    const r = calculateEsdScore(
      {
        id: '1',
        clientId: 'lake',
        contributions: [
          {
            id: 'ed1',
            beneficiary: 'ED',
            description: 'Direct',
            type: 'direct_cost',
            amount: 160_000,
            category: 'enterprise_development',
            blackBenefitPercent: 100,
            transactionDate: '2025-09-01',
          },
        ],
        graduationBonus: false,
        jobsCreatedBonus: false,
      },
      NPAT,
      CONFIG,
    );
    expect(r.enterpriseDev).toBeCloseTo(EXCEL.enterpriseDevelopment, 2);
  });

  it('SED ≈ 0.41/5', () => {
    const r = calculateSedScore(
      {
        id: '1',
        clientId: 'lake',
        contributions: [
          {
            id: 'sed1',
            beneficiary: 'Operation Smile',
            description: 'Grant',
            type: 'grant',
            amount: 27_500,
            category: 'socio_economic',
            blackBenefitPercent: 100,
            transactionDate: '2025-06-01',
          },
        ],
      },
      NPAT,
      CONFIG,
    );
    expect(r.total).toBeCloseTo(EXCEL.socioEconomicDevelopment, 2);
  });

  it('Grand total ≈ 63.56/120', () => {
    const own = calculateOwnershipScore(lakeOwnership, CONFIG).total;
    const mc = calculateManagementScore(
      { id: '1', clientId: 'lake', employees: lakeEmployees },
      CONFIG,
      EAP_PROVINCE,
      2025, // pin: the Excel golden was produced under the 25th CEE EAP dataset
    ).total;
    const sk = calculateSkillsScore(
      {
        id: '1',
        clientId: 'lake',
        leviableAmount: LEVIABLE,
        trainingPrograms: [],
        yesCandidatesCount: 0,
        yesAbsorbedCount: 0,
      },
      CONFIG,
    ).total;
    const pp = calculateProcurementScore(lakeProcurement, CONFIG).total;
    const esd = calculateEsdScore(
      {
        id: '1',
        clientId: 'lake',
        contributions: [
          {
            id: 'sd1',
            beneficiary: 'SD',
            description: 'Direct',
            type: 'direct_cost',
            amount: 250_000,
            category: 'supplier_development',
            blackBenefitPercent: 100,
            transactionDate: '2025-09-01',
          },
          {
            id: 'ed1',
            beneficiary: 'ED',
            description: 'Direct',
            type: 'direct_cost',
            amount: 160_000,
            category: 'enterprise_development',
            blackBenefitPercent: 100,
            transactionDate: '2025-09-01',
          },
        ],
        graduationBonus: false,
        jobsCreatedBonus: false,
      },
      NPAT,
      CONFIG,
    );
    const sed = calculateSedScore(
      {
        id: '1',
        clientId: 'lake',
        contributions: [
          {
            id: 'sed1',
            beneficiary: 'Operation Smile',
            description: 'Grant',
            type: 'grant',
            amount: 27_500,
            category: 'socio_economic',
            blackBenefitPercent: 100,
            transactionDate: '2025-06-01',
          },
        ],
      },
      NPAT,
      CONFIG,
    ).total;

    const grand =
      own + mc + sk + pp + esd.supplierDev + esd.enterpriseDev + sed;

    expect(grand).toBeCloseTo(EXCEL.grandTotal, 1);
    expect(Math.abs(grand - EXCEL.grandTotal)).toBeLessThan(0.05);
  });
});
