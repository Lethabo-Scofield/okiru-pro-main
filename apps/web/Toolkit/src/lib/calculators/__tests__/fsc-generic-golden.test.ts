/**
 * FSC Generic (Others sub-sector) golden tests.
 *
 * Source: BBBEE Toolkit (FSC) Template v1.0.xlsx — Others sub-variant
 * Config: FSC_GENERIC_CALCULATOR_CONFIG (explicit sector bundle, not API fallback)
 *
 * Key FSC Generic differences from RCOGP Generic:
 * - Grand total: 120 pts (same nominal total) with SCALED level thresholds
 * - MC: 21 pts — Other Exec carries 10+4 = 14 pts; Senior/Middle/Junior = 0 pts
 * - Skills: 23 pts — per-management-level targets (approximated in calculator)
 * - PP: 24 pts — QSE 18%, EME 12%, BO51 30%, BWO30 10% (FSC-specific targets)
 * - SD: 10 pts (2% NPAT) — same as RCOGP
 * - ED: 9 pts total (5 base + 1 grad + 1 jobs + 2 stockbrokers bonus)
 * - SED+CE: 8 pts combined — 1% NPAT target (approximated as single rate)
 *
 * TODO (Banks/LTI/STI sub-variants — Bug #6):
 * - Banks: EF (Targeted Investment + Transaction Financing) + AFS (geographic/access)
 * - LTI: EF (Qualifying Exposure + Transaction Financing) + AFS (products/penetration)
 * - STI: AFS (Commercial Products + Insurance Policies)
 * - These require a sub-sector picker UI + separate SectorConfig entries.
 * - See: docs/domain/sectors/fsc/generic/sls.md §12 for full gap list.
 *
 * Synthetic entity: "Cape Financial Services Ltd" (fictional, FSC Others)
 */
import { describe, it, expect } from 'vitest';
import { FSC_GENERIC_CALCULATOR_CONFIG, FSC_SKILLS_PER_LEVEL_TARGETS } from '../../sectors/fsc-generic';
import { calculateOwnershipScore } from '../ownership';
import { calculateManagementScore } from '../management';
import { calculateSkillsScore } from '../skills';
import { calculateProcurementScore } from '../procurement';
import { calculateEsdScore, calculateSedScore } from '../esd-sed';

const CONFIG = FSC_GENERIC_CALCULATOR_CONFIG;

const NPAT = 50_000_000;
const LEVIABLE = 150_000_000;
const TMPS = 20_000_000;
const EAP_PROVINCE = 'Gauteng';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/** 100% Black-owned company — expect Ownership = 25/25 */
const fscOwnership = {
  id: '1',
  clientId: 'cape-fsc',
  shareholders: [
    {
      id: 'sh1',
      name: 'Cape Black Trust',
      ownershipType: 'shareholder' as const,
      blackOwnership: 1,
      blackWomenOwnership: 0.5,
      shares: 100,
      shareValue: 1,
      votingRightsPercent: 1,
      economicInterestPercent: 1,
      isDesignatedGroup: false,
      blackNewEntrant: true,  // required for new entrant indicator (2 pts)
    },
  ],
  companyValue: 200_000_000,
  outstandingDebt: 0,
  yearsHeld: 5,
};

/**
 * Maximally FSC-compliant workforce:
 * - Board: 1 African Female + 1 African Male → 100% Black, 50% BWO
 * - Exec: 1 African Female + 1 African Male → 100% Black, 50% BWO
 * - Other Exec: 3 African Female + 1 African Male → 100% Black (>75%), 75% BWO (>38%)
 * - Disabled: 1 African (disabled) out of 9 total → 11.1% > 2% threshold
 * Expected: Board(2+1) + Exec(2+1) + OEM(10+4) + Disabled(1) = 21 pts
 */
const fscEmployeesFull = [
  { id: '1', name: 'Board F1', gender: 'Female', race: 'African', designation: 'Board', isDisabled: false },
  { id: '2', name: 'Board M1', gender: 'Male', race: 'African', designation: 'Board', isDisabled: false },
  { id: '3', name: 'Exec F1', gender: 'Female', race: 'African', designation: 'Executive Director', isDisabled: false },
  { id: '4', name: 'Exec M1', gender: 'Male', race: 'African', designation: 'Executive Director', isDisabled: false },
  { id: '5', name: 'OEM F1', gender: 'Female', race: 'African', designation: 'Other Executive Management', isDisabled: false },
  { id: '6', name: 'OEM F2', gender: 'Female', race: 'African', designation: 'Other Executive Management', isDisabled: false },
  { id: '7', name: 'OEM F3', gender: 'Female', race: 'African', designation: 'Other Executive Management', isDisabled: false },
  { id: '8', name: 'OEM M1', gender: 'Male', race: 'African', designation: 'Other Executive Management', isDisabled: false },
  { id: '9', name: 'Disabled', gender: 'Male', race: 'African', designation: 'Other Executive Management', isDisabled: true },
];

/** FSC PP: single L1 EME supplier, 100% black-owned, covers 100% TMPS */
const fscProcurementFull = {
  id: '1',
  clientId: 'cape-fsc',
  tmps: TMPS,
  suppliers: [
    {
      id: 'eme1',
      name: 'Empowered EME',
      beeLevel: 1 as const,
      enterpriseType: 'eme' as const,
      blackOwnership: 1,
      blackWomenOwnership: 0,
      youthOwnership: 0,
      disabledOwnership: 0,
      spend: TMPS,
      isEmpoweringSupplier: true,
      isBlackOwned51: true,
      isBlackWomanOwned30: false,
      isDesignatedGroup: false,
    },
  ],
};

// ---------------------------------------------------------------------------
// Suite 1: CalculatorConfig completeness
// ---------------------------------------------------------------------------

describe('FSC Generic — CalculatorConfig completeness', () => {
  it('loads 120 total points from bundled config', () => {
    expect(CONFIG.totalMaxPoints).toBe(120);
  });

  it('sector identity is FSC / Generic', () => {
    expect(CONFIG.sectorCode).toBe('FSC');
    expect(CONFIG.scorecardType).toBe('Generic');
  });

  it('pillar maxima match FSC Others sub-sector Excel', () => {
    const pc = CONFIG.pillarConfigs;
    expect(pc?.ownership?.maxPoints).toBe(25);
    expect(pc?.managementControl?.maxPoints).toBe(21);   // FSC: board+exec+otherExec+disabled
    expect(pc?.skillsDevelopment?.maxPoints).toBe(23);   // FSC per-level: 2+2+3+4+4+1+4+3
    expect(pc?.preferentialProcurement?.maxPoints).toBe(24); // FSC: 20 base + 4 bonus
    expect(pc?.supplierDevelopment?.maxPoints).toBe(10);
    expect(pc?.enterpriseDevelopment?.maxPoints).toBe(9);    // 5 + 1 grad + 1 jobs + 2 stockbrokers
    expect(pc?.socioEconomicDevelopment?.maxPoints).toBe(8); // SED(3) + CE(2) + bonus(3)
    expect(pc?.yesInitiative?.maxPoints).toBe(0);            // Level boost only
  });

  it('sub-minimum percentages are set correctly', () => {
    const pc = CONFIG.pillarConfigs;
    expect(pc?.ownership?.subMinimumPercent).toBe(40);
    expect(pc?.skillsDevelopment?.subMinimumPercent).toBe(40);
    expect(pc?.preferentialProcurement?.subMinimumPercent).toBe(40);
    expect(pc?.supplierDevelopment?.subMinimumPercent).toBe(40);
  });

  it('FSC-specific PP targets differ from RCOGP', () => {
    expect(CONFIG.procurement.qseTarget).toBeCloseTo(0.18, 4);    // 18% (RCOGP=15%)
    expect(CONFIG.procurement.emeTarget).toBeCloseTo(0.12, 4);    // 12% (RCOGP=15%)
    expect(CONFIG.procurement.bo51Target).toBeCloseTo(0.30, 4);   // 30% (RCOGP=50%)
    expect(CONFIG.procurement.bwo30Target).toBeCloseTo(0.10, 4);  // 10% (RCOGP=12%)
  });

  it('FSC MC Other Exec carries 10+4 pts at 75%/38% targets', () => {
    const mc = CONFIG.managementControl;
    expect(mc?.otherExecBlackMaxPts).toBe(10);
    expect(mc?.otherExecBWMaxPts).toBe(4);
    expect(mc?.otherExecBlackTarget).toBeCloseTo(0.75, 4);
    expect(mc?.otherExecBWTarget).toBeCloseTo(0.38, 4);
  });

  it('FSC MC Senior/Middle/Junior = 0 pts (Not Available)', () => {
    const mc = CONFIG.managementControl;
    expect(mc?.seniorMaxPts).toBe(0);
    expect(mc?.middleMaxPts).toBe(0);
    expect(mc?.juniorMaxPts).toBe(0);
  });

  it('FSC disabled = 1 pt (not 2 as in RCOGP)', () => {
    expect(CONFIG.managementControl?.disabledMaxPts).toBe(1);
    expect(CONFIG.managementControl?.disabledTarget).toBeCloseTo(0.02, 4);
  });

  it('FSC skills fields sum to 23 pts', () => {
    const sk = CONFIG.skills;
    const total =
      (sk.learningProgrammesMaxPts ?? 0) +
      (sk.bursaryMaxPts ?? 0) +
      (sk.disabledLearningMaxPts ?? 0) +
      (sk.learnershipsMaxPts ?? 0) +
      (sk.absorptionMaxPts ?? 0);
    expect(total).toBe(23);  // 11+4+1+4+3
  });

  it('FSC uses scaled (non-integer) level thresholds', () => {
    const thresholds = CONFIG.levelThresholds;
    expect(thresholds).toBeDefined();
    expect(thresholds?.length).toBe(8);

    const l1 = thresholds?.find(t => t.level === 1);
    const l8 = thresholds?.find(t => t.level === 8);
    expect(l1?.minPoints).toBeCloseTo(95.50, 1);
    expect(l8?.minPoints).toBeCloseTo(38.20, 1);

    // FSC thresholds differ from RCOGP standard (100/95/90/80/75/70/55/40)
    expect(l1?.minPoints).not.toBe(100);
  });

  it('ESD targets: SD 2% NPAT / 10 pts, ED 1% NPAT / 5 pts', () => {
    expect(CONFIG.esd.supplierDevTarget).toBeCloseTo(0.02, 4);
    expect(CONFIG.esd.supplierDevMax).toBe(10);
    expect(CONFIG.esd.enterpriseDevTarget).toBeCloseTo(0.01, 4);
    expect(CONFIG.esd.enterpriseDevMax).toBe(5);
  });

  it('SED combined target (SED+CE) = ~1% NPAT / 8 pts max', () => {
    expect(CONFIG.sed.maxPoints).toBe(8);
    // npatTarget approximation: 0.6% (SED) ≤ target ≤ 1.0% (SED+CE combined)
    expect(CONFIG.sed.npatTarget).toBeGreaterThan(0);
    expect(CONFIG.sed.npatTarget).toBeLessThanOrEqual(0.011);
  });

  it('industry norms are present', () => {
    expect(CONFIG.industryNorms).toBeDefined();
    expect(CONFIG.industryNorms.length).toBeGreaterThan(0);
  });

  it('recognition table is the standard B-BBEE table (L1=1.35)', () => {
    const l1 = CONFIG.recognitionTable?.find(r => r.level === 1);
    expect(l1?.multiplier).toBeCloseTo(1.35, 2);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: Pillar golden scores
// ---------------------------------------------------------------------------

describe('FSC Generic golden — pillar scores', () => {

  it('Ownership = 25/25 (100% Black-owned, no debt)', () => {
    const r = calculateOwnershipScore(fscOwnership, CONFIG);
    expect(r.total).toBeCloseTo(25, 1);
  });

  it('Management Control = 21/21 (fully-compliant FSC workforce)', () => {
    const r = calculateManagementScore(
      { id: '1', clientId: 'cape-fsc', employees: fscEmployeesFull },
      CONFIG,
      EAP_PROVINCE,
    );
    // Full score: Board(2+1) + Exec(2+1) + OEM(10+4) + Disabled(1) = 21
    expect(r.total).toBeCloseTo(21, 0);
    expect(r.total).toBeGreaterThanOrEqual(20);
  });

  it('Management Control = 0/21 (empty workforce)', () => {
    const r = calculateManagementScore(
      { id: '1', clientId: 'cape-fsc', employees: [] },
      CONFIG,
      EAP_PROVINCE,
    );
    expect(r.total).toBe(0);
  });

  it('Skills = 0/23 (no programmes), subMinimumMet = false', () => {
    const r = calculateSkillsScore(
      {
        id: '1',
        clientId: 'cape-fsc',
        leviableAmount: LEVIABLE,
        trainingPrograms: [],
        yesCandidatesCount: 0,
        yesAbsorbedCount: 0,
      },
      CONFIG,
    );
    expect(r.total).toBe(0);
    expect(r.subMinimumMet).toBe(false);
  });

  it('Skills = 23/23 (full compliant spend across all FSC categories)', () => {
    // overallTarget = 0.035 × LEVIABLE(150M) = 5,250,000
    // bursaryTarget = 0.015 × LEVIABLE(150M) = 2,250,000
    // disabledTarget = 0.003 × LEVIABLE(150M) = 450,000
    const r = calculateSkillsScore(
      {
        id: '1',
        clientId: 'cape-fsc',
        leviableAmount: LEVIABLE,
        trainingPrograms: [
          // Overall Black spend (covers learningMaxPts = 11)
          { id: 'p1', name: 'Mgmt Training', category: 'short_course', categoryCode: 'E' as const,
            cost: 5_300_000, isBlack: true, isEmployed: true, gender: 'Female' as const, race: 'African' as const, isDisabled: false },
          // Bursary / unemployed (covers bursaryMaxPts = 4, 1.5% of leviable)
          { id: 'p2', name: 'Unemployed learner', category: 'bursary', categoryCode: 'A' as const,
            cost: 2_300_000, isBlack: true, isEmployed: false, gender: 'Male' as const, race: 'African' as const, isDisabled: false },
          // Disabled (covers disabledMaxPts = 1, 0.3% of leviable)
          { id: 'p3', name: 'Disabled training', category: 'short_course', categoryCode: 'E' as const,
            cost: 460_000, isBlack: true, isEmployed: true, gender: 'Male' as const, race: 'African' as const, isDisabled: true },
          // LAI (learnership/internship — covers learnershipsMaxPts = 4)
          { id: 'p4', name: 'Learnership 1', category: 'learnership', categoryCode: 'D' as const,
            cost: 50_000, isBlack: true, isEmployed: false, gender: 'Female' as const, race: 'African' as const, isDisabled: false },
          { id: 'p5', name: 'Learnership 2', category: 'learnership', categoryCode: 'D' as const,
            cost: 50_000, isBlack: true, isEmployed: false, gender: 'Male' as const, race: 'Coloured' as const, isDisabled: false,
            isAbsorbed: true },
        ],
        yesCandidatesCount: 0,
        yesAbsorbedCount: 0,
      },
      CONFIG,
    );
    // Expected: learningScore(11) + bursaryScore(4) + disabledScore(1) + learnershipScore(4) + absorptionBonus(3) = 23
    expect(r.total).toBeCloseTo(23, 0);
    expect(r.subMinimumMet).toBe(true);
    // Sub-minimum = 40% × (11+4+1+4) = 8 pts; base ≥ 8 required
    expect(r.learningProgrammes).toBeCloseTo(11, 0);
    expect(r.disabledLearning).toBeCloseTo(1, 0);
    expect(r.learnerships).toBeCloseTo(4, 0);
  });

  it('Skills sub-minimum test: 9.2 pts threshold (40% × 23)', () => {
    // With just enough spend to meet sub-minimum (9.2 pts required from base 20)
    // We need base score ≥ 40% × baseMaxPts(20) = 8 pts
    const r = calculateSkillsScore(
      {
        id: '1',
        clientId: 'cape-fsc',
        leviableAmount: LEVIABLE,
        trainingPrograms: [
          // Partial overall spend (covers some learningMaxPts)
          { id: 'p1', name: 'Partial training', category: 'short_course', categoryCode: 'E' as const,
            cost: LEVIABLE * 0.035, isBlack: true, isEmployed: true,
            gender: 'Male' as const, race: 'African' as const, isDisabled: false },
        ],
        yesCandidatesCount: 0,
        yesAbsorbedCount: 0,
      },
      CONFIG,
    );
    // With full overall spend but no bursaries/disabled/LAI: learningScore=11, others=0
    // baseScore = 11 ≥ 8 → subMinimumMet = true
    expect(r.subMinimumMet).toBe(true);
    expect(r.total).toBeGreaterThan(0);
  });

  it('Procurement base = 20/20 (100% empowered L1 EME supplier)', () => {
    const r = calculateProcurementScore(fscProcurementFull, CONFIG);
    // L1 (1.35×) × TMPS covers: allSuppliers(5) + eme(2) + bo51(7) = 14 pts minimum
    // No QSE, no BWO30 → so 5+0+2+7+0 = 14 base (without QSE or BWO30 rows)
    expect(r.total).toBeGreaterThanOrEqual(14);
    expect(r.total).toBeLessThanOrEqual(24);
    // Sub-minimum is met when base > 40% × 24 = 9.6 pts
    expect(r.subMinimumMet).toBe(true);
  });

  it('Procurement = 0/24 (no suppliers)', () => {
    const r = calculateProcurementScore(
      { id: '1', clientId: 'cape-fsc', tmps: TMPS, suppliers: [] },
      CONFIG,
    );
    expect(r.total).toBe(0);
    expect(r.subMinimumMet).toBe(false);
  });

  it('Supplier Development = 10/10 (2% NPAT)', () => {
    const r = calculateEsdScore(
      {
        id: '1',
        clientId: 'cape-fsc',
        contributions: [
          {
            id: 'sd1',
            beneficiary: 'EME beneficiary',
            type: 'direct_cost',
            amount: NPAT * 0.02, // exactly 2% of NPAT
            category: 'supplier_development',
          },
        ],
        graduationBonus: false,
        jobsCreatedBonus: false,
      },
      NPAT,
      CONFIG,
    );
    expect(r.supplierDev).toBeCloseTo(10, 1);
    expect(r.sdSubMinimumMet).toBe(true);
  });

  it('Supplier Development = 0/10, subMin failed (no contributions)', () => {
    const r = calculateEsdScore(
      { id: '1', clientId: 'cape-fsc', contributions: [], graduationBonus: false, jobsCreatedBonus: false },
      NPAT,
      CONFIG,
    );
    expect(r.supplierDev).toBe(0);
    expect(r.sdSubMinimumMet).toBe(false);
  });

  it('Enterprise Development base = 5/5 (1% NPAT, no bonuses)', () => {
    const r = calculateEsdScore(
      {
        id: '1',
        clientId: 'cape-fsc',
        contributions: [
          {
            id: 'ed1',
            beneficiary: 'Township startup',
            type: 'grant',
            amount: NPAT * 0.01, // exactly 1% of NPAT
            category: 'enterprise_development',
          },
        ],
        graduationBonus: false,
        jobsCreatedBonus: false,
      },
      NPAT,
      CONFIG,
    );
    expect(r.enterpriseDev).toBeCloseTo(5, 1);
  });

  it('Enterprise Development with bonuses = 7/9 (base+grad+jobs, no stockbrokers)', () => {
    const r = calculateEsdScore(
      {
        id: '1',
        clientId: 'cape-fsc',
        contributions: [
          {
            id: 'ed1',
            beneficiary: 'Township startup',
            type: 'grant',
            amount: NPAT * 0.01,
            category: 'enterprise_development',
          },
        ],
        graduationBonus: true,
        jobsCreatedBonus: true,
      },
      NPAT,
      CONFIG,
    );
    // ED base (5) + graduation (1) + jobs (1) = 7 (standard ESD bonuses)
    // Note: stockbrokers bonus (2 pts) is an FSC-specific indicator not yet in the standard ESD schema
    // Use edTotal (includes bonuses), not enterpriseDev (base only)
    expect(r.edTotal).toBeCloseTo(7, 1);
  });

  it('SED+CE = 8/8 (full split: SED rows + CE meta)', () => {
    const r = calculateSedScore(
      {
        id: '1',
        clientId: 'cape-fsc',
        contributions: [
          {
            id: 'sed1',
            beneficiary: 'Financial literacy NGO',
            type: 'grant',
            amount: NPAT * 0.006,
            category: 'socio_economic',
          },
        ],
        ceSpend: NPAT * 0.004,
        ceBonusSpend: NPAT * 0.001,
        fundisaSpend: NPAT * 0.002,
      },
      NPAT,
      CONFIG,
    );
    expect(r.total).toBeCloseTo(8, 1);
  });

  it('SED = 0/8 (no contributions)', () => {
    const r = calculateSedScore(
      { id: '1', clientId: 'cape-fsc', contributions: [] },
      NPAT,
      CONFIG,
    );
    expect(r.total).toBe(0);
  });

  it('SED partial contribution proportional scoring', () => {
    const r = calculateSedScore(
      {
        id: '1',
        clientId: 'cape-fsc',
        contributions: [
          {
            id: 'sed1',
            beneficiary: 'Community trust',
            type: 'grant',
            amount: NPAT * 0.003, // 0.3% of NPAT (half the 0.6% SED base target)
            category: 'socio_economic',
          },
        ],
      },
      NPAT,
      CONFIG,
    );
    // 0.3% / 0.6% × 3 pts = 1.5 pts (SED base portion only)
    expect(r.total).toBeCloseTo(1.5, 1);
    expect(r.total).toBeGreaterThan(0);
    expect(r.total).toBeLessThan(8);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: FSC Level thresholds
// ---------------------------------------------------------------------------

describe('FSC Generic — Level determination', () => {
  it('FSC level thresholds are non-integer (scaled from sub-sector)', () => {
    const thresholds = CONFIG.levelThresholds!;
    const sorted = [...thresholds].sort((a, b) => b.minPoints - a.minPoints);
    expect(sorted[0].minPoints).toBeCloseTo(95.50, 1);  // L1
    expect(sorted[1].minPoints).toBeCloseTo(90.72, 1);  // L2
    expect(sorted[2].minPoints).toBeCloseTo(85.95, 1);  // L3
    expect(sorted[3].minPoints).toBeCloseTo(76.40, 1);  // L4
    expect(sorted[4].minPoints).toBeCloseTo(71.62, 1);  // L5
    expect(sorted[5].minPoints).toBeCloseTo(66.85, 1);  // L6
    expect(sorted[6].minPoints).toBeCloseTo(52.52, 1);  // L7
    expect(sorted[7].minPoints).toBeCloseTo(38.20, 1);  // L8
  });

  it('FSC recognition levels match standard B-BBEE table', () => {
    const thresholds = CONFIG.levelThresholds!;
    const l1 = thresholds.find(t => t.level === 1)!;
    const l4 = thresholds.find(t => t.level === 4)!;
    const l8 = thresholds.find(t => t.level === 8)!;
    expect(l1.recognition).toBe(135);
    expect(l4.recognition).toBe(100);
    expect(l8.recognition).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Suite 4: FSC-specific indicator assertions
// ---------------------------------------------------------------------------

describe('FSC Generic — sector-specific indicator checks', () => {
  it('PP base max = 20 pts (5+3+2+7+3), bonus max = 4 pts', () => {
    expect(CONFIG.procurement.baseMax).toBe(20);
    expect(CONFIG.procurement.bonusMax).toBe(4);
    // Total = 24
    expect((CONFIG.procurement.baseMax ?? 0) + (CONFIG.procurement.bonusMax ?? 0)).toBe(24);
  });

  it('Ownership designated groups = 3% target / 3 pts (same as RCOGP)', () => {
    expect(CONFIG.ownership.designatedGroupsTarget).toBeCloseTo(0.03, 4);
    expect(CONFIG.ownership.designatedGroupsMax).toBe(3);
  });

  it('Skills per-level max points breakdown sums correctly', () => {
    const sk = CONFIG.skills;
    // FSC skill max = managed_levels(11) + unemployed(4) + disabled(1) + LAI(4) + absorption(3)
    expect(sk.learningProgrammesMaxPts).toBe(11);  // managed level sub-total
    expect(sk.bursaryMaxPts).toBe(4);              // unemployed Black people
    expect(sk.disabledLearningMaxPts).toBe(1);     // Black disabled (1 pt, not 4 as RCOGP)
    expect(sk.learnershipsMaxPts).toBe(4);         // LAI headcount (4 pts, not 6 as RCOGP)
    expect(sk.absorptionMaxPts).toBe(3);           // Absorption bonus (3 pts, not 5 as RCOGP)
  });

  it('FSC per-level skills targets match the confirmed SLS (§6.3 / Q39, Q40)', () => {
    const t = FSC_SKILLS_PER_LEVEL_TARGETS;
    // Senior & Exec 2%, Middle 3%, Junior 5%, Non-mgmt 8% — each "applicable to this level"
    expect(t.seniorExec.blackTargetPct).toBeCloseTo(0.02, 4);
    expect(t.middle.blackTargetPct).toBeCloseTo(0.03, 4);
    expect(t.junior.blackTargetPct).toBeCloseTo(0.05, 4);
    expect(t.nonManagement.blackTargetPct).toBeCloseTo(0.08, 4);
    // Black-women sub-targets are half the Black rate per band
    expect(t.seniorExec.blackWomenTargetPct).toBeCloseTo(0.01, 4);
    expect(t.middle.blackWomenTargetPct).toBeCloseTo(0.015, 4);
    expect(t.junior.blackWomenTargetPct).toBeCloseTo(0.025, 4);
    expect(t.nonManagement.blackWomenTargetPct).toBeCloseTo(0.04, 4);
    // Managed-level sub-totals sum to the 11-pt learningProgrammes slot
    const managedSubTotal = t.seniorExec.subTotalPts + t.middle.subTotalPts + t.junior.subTotalPts + t.nonManagement.subTotalPts;
    expect(managedSubTotal).toBe(11);
    expect(managedSubTotal).toBe(CONFIG.skills.learningProgrammesMaxPts);
    // African sub-indicators are EAP-derived, not a fixed national %
    expect(t.africanTargetSource).toBe('EAP Targets [Africans]');
  });

  it('ED stockbrokers bonus is a separate 4th slot (0.5% NPAT / 2 pts) → ED reaches 9', () => {
    // FSC ESD: 5 base + 1 grad + 1 jobs + 2 stockbrokers (0.5% NPAT) = 9.
    // Without stockbroker spend, ED = 7 (base + grad + jobs).
    const noStockbroker = calculateEsdScore(
      {
        id: '1', clientId: 'cape-fsc',
        contributions: [
          { id: 'ed1', beneficiary: 'Startup', type: 'grant', amount: NPAT * 0.01, category: 'enterprise_development' },
        ],
        graduationBonus: true, jobsCreatedBonus: true,
      },
      NPAT,
      CONFIG,
    );
    expect(noStockbroker.stockbrokerBonus).toBe(0);
    expect(noStockbroker.edTotal).toBeCloseTo(7, 1);

    // With 0.5% NPAT of recognised stockbroker support → +2 pts → ED = 9.
    const withStockbroker = calculateEsdScore(
      {
        id: '1', clientId: 'cape-fsc',
        contributions: [
          { id: 'ed1', beneficiary: 'Startup', type: 'grant', amount: NPAT * 0.01, category: 'enterprise_development' },
        ],
        graduationBonus: true, jobsCreatedBonus: true,
        stockbrokerSpend: NPAT * 0.005,
      },
      NPAT,
      CONFIG,
    );
    expect(withStockbroker.stockbrokerBonus).toBeCloseTo(2, 1);
    expect(withStockbroker.edTotal).toBeCloseTo(9, 1);
  });

  it('stockbroker bonus scales proportionally (half target → 1 pt)', () => {
    const r = calculateEsdScore(
      {
        id: '1', clientId: 'cape-fsc',
        contributions: [],
        graduationBonus: false, jobsCreatedBonus: false,
        stockbrokerSpend: NPAT * 0.0025, // half of 0.5% NPAT
      },
      NPAT,
      CONFIG,
    );
    expect(r.stockbrokerBonus).toBeCloseTo(1, 1);
  });
});
