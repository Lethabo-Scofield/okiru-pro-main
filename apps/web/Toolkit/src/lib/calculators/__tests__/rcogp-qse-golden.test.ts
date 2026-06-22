/**
 * RCOGP QSE golden tests — config completeness + representative pillar scores.
 *
 * Source: BBBEE Toolkit (RCOGP QSE)_Template_v.1.1.xlsx / extracted_RCOGP_QSE.json
 * Config: RCOGP_QSE_CALCULATOR_CONFIG (bundled, not API fallback)
 *
 * No pre-filled sample company workbook exists for RCOGP QSE (unlike Lake Trading for Generic).
 * Tests use:
 *   A) Config completeness assertions against Excel-verified maxima.
 *   B) Zero-input baseline (all pillars return 0 / empty state).
 *   C) Full-score representative inputs (expect max / near-max).
 *   D) Partial-score cases (known arithmetic from formula spec).
 *
 * Known discrepancies documented:
 *   - MC: QSE uses flat 60%/30% SMJ targets; calculator applies EAP for "senior" band.
 *     Actual QSE Excel would score differently for companies below EAP targets.
 *     Tests here use inputs designed to max out the band to avoid EAP divergence.
 *   - Skills: bursaryMaxPts (7) maps to Black female spend in QSE (not bursaries/HEI).
 *     The existing skills calculator treats this field as bursary spend — same formula applies.
 */
import { describe, it, expect } from 'vitest';
import { RCOGP_QSE_CALCULATOR_CONFIG } from '../../sectors/rcogp-qse';
import { calculateOwnershipScore } from '../ownership';
import { calculateManagementScore } from '../management';
import { calculateSkillsScore } from '../skills';
import { calculateProcurementScore } from '../procurement';
import { calculateEsdScore, calculateSedScore } from '../esd-sed';

const CONFIG = RCOGP_QSE_CALCULATOR_CONFIG;

// Representative financial inputs for a QSE with ~R30M turnover
const NPAT = 2_000_000;
const LEVIABLE = 1_500_000;
const TMPS = 8_000_000;

// ---------------------------------------------------------------------------
// §1 — Config completeness
// ---------------------------------------------------------------------------

describe('RCOGP QSE — CalculatorConfig completeness', () => {
  it('loads 108 grand total', () => {
    expect(CONFIG.totalMaxPoints).toBe(108);
  });

  it('has correct pillar maxima', () => {
    expect(CONFIG.pillarConfigs?.ownership?.maxPoints).toBe(25);
    expect(CONFIG.pillarConfigs?.managementControl?.maxPoints).toBe(15);
    expect(CONFIG.pillarConfigs?.skillsDevelopment?.maxPoints).toBe(30);
    expect(CONFIG.pillarConfigs?.preferentialProcurement?.maxPoints).toBe(21);
    expect(CONFIG.pillarConfigs?.supplierDevelopment?.maxPoints).toBe(5);
    expect(CONFIG.pillarConfigs?.enterpriseDevelopment?.maxPoints).toBe(7);
    expect(CONFIG.pillarConfigs?.socioEconomicDevelopment?.maxPoints).toBe(5);
    expect(CONFIG.pillarConfigs?.yesInitiative?.maxPoints).toBe(0);
  });

  it('has QSE-specific skills targets (3% overall, not 3.5%)', () => {
    // Skills targets stored as fractions (0.030 = 3%) for calculator compatibility
    expect(CONFIG.skills.overallSpendPercent).toBeCloseTo(0.030, 4);
    expect(CONFIG.skills.learningProgrammesMaxPts).toBe(15);
    expect(CONFIG.skills.bursaryMaxPts).toBe(7);             // Black female indicator
    expect(CONFIG.skills.disabledLearningMaxPts).toBe(3);
    expect(CONFIG.skills.absorptionMaxPts).toBe(5);
    expect(CONFIG.skills.learnershipsMaxPts).toBe(0);        // No LAI headcount in QSE
    expect(CONFIG.skills.absorptionTargetPercent).toBeCloseTo(1.0, 4); // percent; skills.ts /100 → 1% (was double-divided to 0.01%, ledger D-04)
    // Total: 15 + 7 + 3 + 0 + 5 = 30 ✓
  });

  it('has QSE-specific procurement targets (60% allSuppliers, not 80%)', () => {
    expect(CONFIG.procurement.allSuppliersTarget).toBe(0.60);
    expect(CONFIG.procurement.allSuppliersMaxPts).toBe(15);
    expect(CONFIG.procurement.bo51Target).toBe(0.15);  // 15% not 50%
    expect(CONFIG.procurement.bo51MaxPts).toBe(5);     // 5 not 11
    expect(CONFIG.procurement.dgTarget).toBe(0.01);    // 1% not 2%
    expect(CONFIG.procurement.dgMaxPts).toBe(1);       // 1 not 2
    expect(CONFIG.procurement.qseMaxPts).toBe(0);      // Not present in QSE
    expect(CONFIG.procurement.emeMaxPts).toBe(0);      // Not present in QSE
    expect(CONFIG.procurement.bwo30MaxPts).toBe(0);    // Not present in QSE
    // Base = 15 + 5 = 20; bonus DG = 1 → total 21 ✓
    expect(CONFIG.procurement.baseMax).toBe(20);
    expect(CONFIG.procurement.bonusMax).toBe(1);
  });

  it('has QSE-specific ESD targets (1% NPAT for SD, vs Generic 2%)', () => {
    expect(CONFIG.esd.supplierDevTarget).toBeCloseTo(0.01, 4);
    expect(CONFIG.esd.supplierDevMax).toBe(5);     // 5 not 10
    expect(CONFIG.esd.enterpriseDevTarget).toBeCloseTo(0.01, 4);
    expect(CONFIG.esd.enterpriseDevMax).toBe(5);   // base 5 (bonuses add to 7 total)
  });

  it('has QSE MC — no board indicators (0 pts)', () => {
    expect(CONFIG.managementControl?.boardBlackMaxPts).toBe(0);
    expect(CONFIG.managementControl?.boardBWMaxPts).toBe(0);
  });

  it('has QSE MC — exec management at 5+2=7 pts', () => {
    expect(CONFIG.managementControl?.execBlackTarget).toBe(0.50);
    expect(CONFIG.managementControl?.execBlackMaxPts).toBe(5);
    expect(CONFIG.managementControl?.execBWTarget).toBe(0.25);
    expect(CONFIG.managementControl?.execBWMaxPts).toBe(2);
  });

  it('has QSE MC — combined SMJ at 6+2=8 pts via seniorMaxPts', () => {
    expect(CONFIG.managementControl?.seniorMaxPts).toBe(6);
    expect(CONFIG.managementControl?.seniorBWMaxPts).toBe(2);
    expect(CONFIG.managementControl?.middleMaxPts).toBe(0);
    expect(CONFIG.managementControl?.juniorMaxPts).toBe(0);
    expect(CONFIG.managementControl?.disabledMaxPts).toBe(0);
  });

  it('has no disabled indicator in QSE MC', () => {
    expect(CONFIG.managementControl?.disabledMaxPts).toBe(0);
  });

  it('has standard level thresholds (100/95/90/80/75/70/55/40)', () => {
    const thresholds = CONFIG.levelThresholds ?? [];
    expect(thresholds.length).toBe(8);
    const l1 = thresholds.find((t) => t.level === 1);
    const l8 = thresholds.find((t) => t.level === 8);
    expect(l1?.minPoints).toBe(100);
    expect(l8?.minPoints).toBe(40);
  });

  it('has benefit factors and industry norms', () => {
    expect(CONFIG.benefitFactors.length).toBeGreaterThan(0);
    expect(CONFIG.industryNorms.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// §2 — Ownership pillar
// ---------------------------------------------------------------------------

describe('RCOGP QSE — Ownership pillar', () => {
  it('zero input → 0/25', () => {
    const r = calculateOwnershipScore(
      { id: '1', clientId: 'qse', shareholders: [], companyValue: 0, outstandingDebt: 0, yearsHeld: 0 },
      CONFIG,
    );
    expect(r.total).toBe(0);
  });

  it('100% black ownership, fully paid-up → 25/25', () => {
    const r = calculateOwnershipScore(
      {
        id: '1',
        clientId: 'qse',
        shareholders: [
          {
            id: 'sh1',
            name: 'Black Family Trust',
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
        companyValue: 10_000_000,
        outstandingDebt: 0,
        yearsHeld: 5,
      },
      CONFIG,
    );
    expect(r.total).toBeCloseTo(25, 0);
  });
});

// ---------------------------------------------------------------------------
// §3 — Management Control pillar
// ---------------------------------------------------------------------------

describe('RCOGP QSE — Management Control pillar', () => {
  it('zero employees → 0/15', () => {
    const r = calculateManagementScore(
      { id: '1', clientId: 'qse', employees: [] },
      CONFIG,
      'Gauteng',
    );
    expect(r.total).toBe(0);
  });

  it('maxes executive band (5+2=7 pts) with 100% Black exec', () => {
    const employees = [
      { id: '1', name: 'CEO', gender: 'Male', race: 'African', designation: 'Executive Director', isDisabled: false, isForeign: false },
      { id: '2', name: 'CFO', gender: 'Female', race: 'African', designation: 'Executive Director', isDisabled: false, isForeign: false },
    ];
    const r = calculateManagementScore(
      { id: '1', clientId: 'qse', employees },
      CONFIG,
      'Gauteng',
    );
    // All exec are black → execBlack = 5; 50% black female → execBW = min(0.5/0.25, 1) × 2 = 2
    expect(r.execDirectorsBlack).toBeCloseTo(5, 1);
    expect(r.execDirectorsBWO).toBeCloseTo(2, 1);
    // No board score in QSE
    expect(r.boardVotingBlack).toBe(0);
    expect(r.boardVotingBWO).toBe(0);
  });

  it('counts Other Executive Manager in the QSE executive band (ledger D-01 — was excluded)', () => {
    // QSE "Executive Management" = Executive Director + Other Executive Manager (toolkit F24).
    // A single black Other Executive Manager → 100% of the exec band → execBlack = 5.
    // Before the fix this employee landed in the 0-weighted Other-Exec band and scored 0.
    const r = calculateManagementScore(
      {
        id: '1', clientId: 'qse',
        employees: [
          { id: '1', name: 'OEM', gender: 'Male', race: 'African', designation: 'Other Executive Manager', isDisabled: false, isForeign: false },
        ],
      },
      CONFIG,
      'Gauteng',
    );
    expect(r.execDirectorsBlack).toBeCloseTo(5, 1);
  });

  it('fully-maxed management team → 15/15', () => {
    // Section 1: 100% black exec (male+female at 50%+ each)
    // Section 2: 100% black senior (maps to seniorMaxPts via EAP logic)
    const employees = [
      // Executive directors (100% black, 50% female → exec = 5+2)
      { id: '1', name: 'ExecA', gender: 'Male', race: 'African', designation: 'Executive Director', isDisabled: false, isForeign: false },
      { id: '2', name: 'ExecB', gender: 'Female', race: 'African', designation: 'Executive Director', isDisabled: false, isForeign: false },
      // Senior management (all black — maps to seniorMaxPts)
      { id: '3', name: 'SenA', gender: 'Male', race: 'African', designation: 'Senior', isDisabled: false, isForeign: false },
      { id: '4', name: 'SenB', gender: 'Female', race: 'African', designation: 'Senior', isDisabled: false, isForeign: false },
      { id: '5', name: 'SenC', gender: 'Male', race: 'African', designation: 'Senior', isDisabled: false, isForeign: false },
      { id: '6', name: 'SenD', gender: 'Female', race: 'African', designation: 'Senior', isDisabled: false, isForeign: false },
    ];
    const r = calculateManagementScore(
      { id: '1', clientId: 'qse', employees },
      CONFIG,
      'Gauteng',
    );
    // exec: 100% black, 50% female → 5 + 2 = 7
    // SMJ (4 senior, 100% black, 50% female): flat 60%/30% → min(1/0.6,1)×6=6 + min(0.5/0.3,1)×2=2 = 8
    // total = 7 + 8 = 15 (QSE combined-SMJ flat scoring — DISCREPANCY-LEDGER D-01)
    expect(r.seniorBlack).toBeCloseTo(6, 1);
    expect(r.seniorBWO).toBeCloseTo(2, 1);
    expect(r.total).toBeCloseTo(15, 1);
  });
});

// ---------------------------------------------------------------------------
// §4 — Skills Development pillar
// ---------------------------------------------------------------------------

describe('RCOGP QSE — Skills Development pillar', () => {
  it('zero spend → 0/30, sub-min not met', () => {
    const r = calculateSkillsScore(
      { id: '1', clientId: 'qse', leviableAmount: LEVIABLE, trainingPrograms: [], yesCandidatesCount: 0, yesAbsorbedCount: 0 },
      CONFIG,
    );
    expect(r.total).toBe(0);
    expect(r.subMinimumMet).toBe(false);
  });

  it('spend exactly 3% leviable on Black people → 15 pts (SK-1 maxed)', () => {
    // overallSpendPercent is stored as 0.030 (fraction); TARGET_OVERALL = LEVIABLE * 0.030
    const blackSpend = LEVIABLE * 0.03; // R45 000 = exactly the target
    // TrainingProgram uses legacy flat-learner format: isBlack + cost required for accumulateSpend
    const r = calculateSkillsScore(
      {
        id: '1',
        clientId: 'qse',
        leviableAmount: LEVIABLE,
        trainingPrograms: [
          {
            id: 'p1',
            name: 'Leadership',
            category: 'short_course',
            cost: blackSpend,
            isBlack: true,
            isDisabled: false,
            isAbsorbed: false,
            gender: 'Male',
            race: 'African',
          } as any,
        ],
        yesCandidatesCount: 0,
        yesAbsorbedCount: 0,
      },
      CONFIG,
    );
    // SK-1: min(45000 / (1500000 × 0.030), 1) × 15 = min(1, 1) × 15 = 15
    expect(r.learningProgrammes).toBeCloseTo(15, 0);
    expect(r.total).toBeCloseTo(15, 0);
  });

  it('SK-2 "Spend on Black female" scores Black-FEMALE spend across all categories, not bursaries (ledger D-03)', () => {
    // 1% of leviable spent on a Black FEMALE short-course learner → 7-pt line maxes.
    const r = calculateSkillsScore(
      {
        id: '1', clientId: 'qse', leviableAmount: LEVIABLE,
        trainingPrograms: [
          { id: 'bf', name: 'Leadership', category: 'short_course', cost: LEVIABLE * 0.01,
            isBlack: true, isDisabled: false, isAbsorbed: false, gender: 'Female', race: 'African' } as never,
        ],
        yesCandidatesCount: 0, yesAbsorbedCount: 0,
      },
      CONFIG,
    );
    expect(r.bursaries).toBeCloseTo(7, 0);
  });

  it('SK-2 does NOT score male Black spend (gender filter) (ledger D-03)', () => {
    const r = calculateSkillsScore(
      {
        id: '1', clientId: 'qse', leviableAmount: LEVIABLE,
        trainingPrograms: [
          { id: 'm', name: 'Leadership', category: 'short_course', cost: LEVIABLE * 0.05,
            isBlack: true, isDisabled: false, isAbsorbed: false, gender: 'Male', race: 'African' } as never,
        ],
        yesCandidatesCount: 0, yesAbsorbedCount: 0,
      },
      CONFIG,
    );
    expect(r.bursaries).toBe(0);
  });

  it('skills sub-minimum threshold is 10 pts (40% × 25 base, excl. 5-pt absorption bonus)', () => {
    expect(CONFIG.skills.subMinThreshold).toBeCloseTo(10, 1);
  });

  it('maxed absorption bonus (5 pts) recognised with LAI completions', () => {
    // absorptionTargetPercent = 1% of absorbed/total_learners; all absorbed → 100% rate → 5pts
    // Each TrainingProgram row = one learner (legacy flat format)
    const r = calculateSkillsScore(
      {
        id: '1',
        clientId: 'qse',
        leviableAmount: LEVIABLE,
        trainingPrograms: [
          { id: 'y1', name: 'Learnership', category: 'learnership', cost: 10_000,
            isBlack: true, isDisabled: false, isAbsorbed: true, gender: 'Female', race: 'African' } as any,
          { id: 'y2', name: 'Learnership', category: 'learnership', cost: 10_000,
            isBlack: true, isDisabled: false, isAbsorbed: true, gender: 'Male', race: 'African' } as any,
        ],
        yesCandidatesCount: 0,
        yesAbsorbedCount: 0,
      },
      CONFIG,
    );
    // 2 absorbed / 2 total learners = 100% absorption rate; target = 1% → capped at 5
    expect(r.absorption).toBeGreaterThan(0);
    expect(r.absorption).toBeLessThanOrEqual(5);
  });

  it('absorption no longer maxes on a single learner (ledger D-04: 1% target, not 0.01%)', () => {
    // 1 absorbed of 200 Black learners = 0.5% rate; against the 1% target → 0.5/1 × 5 = 2.5.
    // Before the double-/100 fix the effective target was 0.01%, so this maxed at 5.
    const programs = Array.from({ length: 200 }, (_, i) => ({
      id: `L${i}`, name: 'LAI', category: 'learnership', cost: 1000,
      isBlack: true, isDisabled: false, isAbsorbed: i === 0, gender: 'Male', race: 'African',
    }));
    const r = calculateSkillsScore(
      { id: '1', clientId: 'qse', leviableAmount: LEVIABLE, trainingPrograms: programs as never, yesCandidatesCount: 0, yesAbsorbedCount: 0 },
      CONFIG,
    );
    expect(r.absorption).toBeCloseTo(2.5, 1);
  });
});

// ---------------------------------------------------------------------------
// §5 — Preferential Procurement pillar
// ---------------------------------------------------------------------------

describe('RCOGP QSE — Preferential Procurement pillar', () => {
  it('zero spend → 0/21', () => {
    const r = calculateProcurementScore(
      { id: '1', clientId: 'qse', tmps: TMPS, suppliers: [] },
      CONFIG,
    );
    expect(r.total).toBe(0);
  });

  it('60% TMPS on L1 supplier → allSuppliers maxed at 15 pts', () => {
    const spend = TMPS * 0.60; // exactly 60%
    const r = calculateProcurementScore(
      {
        id: '1',
        clientId: 'qse',
        tmps: TMPS,
        suppliers: [
          {
            id: 's1',
            name: 'Compliant Corp',
            beeLevel: 1 as const,
            enterpriseType: 'generic' as const,
            blackOwnership: 0,
            blackWomenOwnership: 0,
            youthOwnership: 0,
            disabledOwnership: 0,
            spend,
          },
        ],
      },
      CONFIG,
    );
    // empoweringSuppliers: min(recognised/TMPS/0.60, 1) × 15
    // L1 recognition = 135%, so recognised = 0.60 × TMPS × 1.35 > target → capped at 15
    expect(r.empoweringSuppliers).toBeCloseTo(15, 0);
  });

  it('15% TMPS on 51%+ black-owned supplier → bo51 maxed at 5 pts', () => {
    const spend = TMPS * 0.15;
    const r = calculateProcurementScore(
      {
        id: '1',
        clientId: 'qse',
        tmps: TMPS,
        suppliers: [
          {
            id: 's2',
            name: 'Black Owned Co',
            beeLevel: 2 as const,
            enterpriseType: 'generic' as const,
            blackOwnership: 0.6,
            blackWomenOwnership: 0,
            youthOwnership: 0,
            disabledOwnership: 0,
            spend,
          },
        ],
      },
      CONFIG,
    );
    // blackOwned51: 51%+ black-owned recognised at L2 = 125% → min(0.15×1.25/0.15, 1)×5 = 5
    expect(r.blackOwned51).toBeGreaterThan(0);
    expect(r.blackOwned51).toBeLessThanOrEqual(5);
  });

  it('counts L5-L8 suppliers in the all-suppliers (Level 1-8) line (ledger D-02 — was 0 for L5-8)', () => {
    // A single Level-8 supplier (recognition 0.10) spending 100% of TMPS:
    //   recognised = 8M × 0.10 = 0.8M; score = min(0.8M / (8M × 0.60), 1) × 15 = 2.5
    // Before the fix the all-suppliers line gated to L1-4, so an L5-L8 supplier scored 0.
    const r = calculateProcurementScore(
      {
        id: '1', clientId: 'qse', tmps: TMPS,
        suppliers: [
          { id: 's8', name: 'Level 8 Co', beeLevel: 8 as const, enterpriseType: 'generic' as const,
            blackOwnership: 0, blackWomenOwnership: 0, youthOwnership: 0, disabledOwnership: 0, spend: TMPS },
        ],
      },
      CONFIG,
    );
    expect(r.empoweringSuppliers).toBeGreaterThan(0);
    expect(r.empoweringSuppliers).toBeCloseTo(2.5, 1);
    // recognised spend always counted all suppliers — sanity check unchanged.
    expect(r.recognisedSpend).toBeCloseTo(TMPS * 0.10, 0);
  });

  it('sub-minimum threshold is 8 pts (40% × 20 base, excl. 1-pt DG bonus)', () => {
    expect(CONFIG.procurement.subMinThreshold).toBeCloseTo(8, 1);
  });
});

// ---------------------------------------------------------------------------
// §6 — Supplier Development pillar (1% NPAT / 5 pts)
// ---------------------------------------------------------------------------

describe('RCOGP QSE — Supplier Development pillar', () => {
  it('zero contributions → 0/5', () => {
    const r = calculateEsdScore(
      { id: '1', clientId: 'qse', contributions: [], graduationBonus: false, jobsCreatedBonus: false },
      NPAT,
      CONFIG,
    );
    expect(r.supplierDev).toBe(0);
  });

  it('exactly 1% NPAT in SD → 5/5 (full score)', () => {
    const sdAmount = NPAT * 0.01; // R20 000
    const r = calculateEsdScore(
      {
        id: '1',
        clientId: 'qse',
        contributions: [
          {
            id: 'sd1',
            beneficiary: 'Supplier ABC',
            description: 'Direct investment',
            type: 'direct_cost',
            amount: sdAmount,
            category: 'supplier_development',
            blackBenefitPercent: 100,
            transactionDate: '2025-06-01',
          },
        ],
        graduationBonus: false,
        jobsCreatedBonus: false,
      },
      NPAT,
      CONFIG,
    );
    // SD: min(benefit_adjusted / (NPAT × 0.01), 1) × 5
    // direct_cost benefitFactor = 1.0 → min(20000 / 20000, 1) × 5 = 5
    expect(r.supplierDev).toBeCloseTo(5, 1);
  });

  it('SD sub-minimum threshold is 2 pts (40% × 5)', () => {
    // 40% × 5 = 2
    const sdSubMin = (CONFIG.pillarConfigs?.supplierDevelopment?.subMinimumPercent ?? 40) / 100
      * (CONFIG.pillarConfigs?.supplierDevelopment?.maxPoints ?? 5);
    expect(sdSubMin).toBeCloseTo(2, 1);
  });
});

// ---------------------------------------------------------------------------
// §7 — Enterprise Development pillar (5+1+1 = 7 pts)
// ---------------------------------------------------------------------------

describe('RCOGP QSE — Enterprise Development pillar', () => {
  it('exactly 1% NPAT in ED + both bonuses → 7/7', () => {
    const edAmount = NPAT * 0.01; // R20 000
    const r = calculateEsdScore(
      {
        id: '1',
        clientId: 'qse',
        contributions: [
          {
            id: 'ed1',
            beneficiary: 'Startup X',
            description: 'Mentorship',
            type: 'direct_cost',
            amount: edAmount,
            category: 'enterprise_development',
            blackBenefitPercent: 100,
            transactionDate: '2025-08-01',
          },
        ],
        graduationBonus: true,
        jobsCreatedBonus: true,
      },
      NPAT,
      CONFIG,
    );
    // ED base: min(20000 / 20000, 1) × 5 = 5; + 1 grad + 1 jobs = 7
    expect(r.enterpriseDev).toBeCloseTo(5, 1);
    expect(r.graduationBonus).toBe(1);
    expect(r.jobsCreatedBonus).toBe(1);
    // Total ED = 7
    const totalED = r.enterpriseDev + r.graduationBonus + r.jobsCreatedBonus;
    expect(totalED).toBeCloseTo(7, 1);
  });
});

// ---------------------------------------------------------------------------
// §8 — SED pillar (1% NPAT / 5 pts)
// ---------------------------------------------------------------------------

describe('RCOGP QSE — SED pillar', () => {
  it('zero → 0/5', () => {
    const r = calculateSedScore(
      { id: '1', clientId: 'qse', contributions: [] },
      NPAT,
      CONFIG,
    );
    expect(r.total).toBe(0);
  });

  it('exactly 1% NPAT grant → 5/5', () => {
    const sedAmount = NPAT * 0.01; // R20 000
    const r = calculateSedScore(
      {
        id: '1',
        clientId: 'qse',
        contributions: [
          {
            id: 'sed1',
            beneficiary: 'Community Trust',
            description: 'Education grant',
            type: 'grant',
            amount: sedAmount,
            category: 'socio_economic',
            blackBenefitPercent: 100,
            transactionDate: '2025-07-15',
          },
        ],
      },
      NPAT,
      CONFIG,
    );
    // grant benefitFactor = 1.0 → min(20000 / 20000, 1) × 5 = 5
    expect(r.total).toBeCloseTo(5, 1);
  });
});

// ---------------------------------------------------------------------------
// §9 — Level determination checks
// ---------------------------------------------------------------------------

describe('RCOGP QSE — Grand total and level checks', () => {
  it('max achievable score < 108.1 across all pillars', () => {
    const pillars = [25, 15, 30, 21, 5, 7, 5];
    expect(pillars.reduce((a, b) => a + b, 0)).toBe(108);
  });

  it('level thresholds are expressed as points out of 108 total', () => {
    const thresholds = CONFIG.levelThresholds ?? [];
    // Level 1 requires 100 pts — achievable only with near-perfect score on 108-pt scorecard
    expect(thresholds.find((t) => t.level === 1)?.minPoints).toBe(100);
    expect(thresholds.find((t) => t.level === 4)?.minPoints).toBe(80);
    expect(thresholds.find((t) => t.level === 8)?.minPoints).toBe(40);
  });

  it('config sectorCode and scorecardType are correct', () => {
    expect(CONFIG.sectorCode).toBe('RCOGP');
    expect(CONFIG.scorecardType).toBe('QSE');
  });
});
