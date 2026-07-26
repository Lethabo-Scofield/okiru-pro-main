/**
 * ICT QSE golden tests — config completeness + representative pillar scores.
 *
 * Source: BBBEE Toolkit (ICT QSE)_Template_v.1.1.xlsx / extracted_ICT_QSE.json
 * Config: ICT_QSE_CALCULATOR_CONFIG (bundled, not API fallback)
 *
 * @see docs/domain/sectors/ict/qse/sls.md
 *
 * Key ICT QSE differences from RCOGP QSE (all tested below):
 *   A) Grand total: 116 (not 108)
 *   B) Ownership voting/EI target: 30% (not 25%)
 *   C) SED: 12 pts (not 5)
 *   D) ED: max 8 pts (5 base + 1 grad + 2-pt tiered jobs bonus)
 *        Calculator gap: jobsCreatedBonus always gives +1 (not +2 for ≥11% tier)
 *        Max achievable via calculator = 7 pts (documented gap)
 *   E) Level thresholds: standard RCOGP 8-band (100/95/90/80/75/70/55/40)
 *
 * Tests use:
 *   A) Config completeness assertions against Excel-verified maxima.
 *   B) Zero-input baseline (all pillars return 0 / empty state).
 *   C) Full-score representative inputs (expect max / near-max).
 *   D) Partial-score cases (known arithmetic from formula spec).
 *
 * Known gaps documented:
 *   - ED tiered jobs bonus (2 pts for ≥11%) not modelled; test expects 7 pts max.
 *   - MC QSE uses fixed 60%/30% SMJ targets; EAP lookup may differ. Tests use
 *     100% black inputs to max the band regardless of EAP variance.
 */
import { describe, it, expect } from 'vitest';
import { ICT_QSE_CALCULATOR_CONFIG } from '../../sectors/ict-qse';
import { calculateOwnershipScore } from '../ownership';
import { calculateManagementScore } from '../management';
import { calculateSkillsScore } from '../skills';
import { calculateProcurementScore } from '../procurement';
import { calculateEsdScore, calculateSedScore } from '../esd-sed';

const CONFIG = ICT_QSE_CALCULATOR_CONFIG;

// Representative financial inputs for a QSE with ~R30M turnover
const NPAT = 2_000_000;
const LEVIABLE = 1_500_000;
const TMPS = 8_000_000;

// ---------------------------------------------------------------------------
// §1 — Config completeness
// ---------------------------------------------------------------------------

describe('ICT QSE — CalculatorConfig completeness', () => {
  it('loads 116 grand total', () => {
    expect(CONFIG.totalMaxPoints).toBe(116);
  });

  it('has correct pillar maxima', () => {
    expect(CONFIG.pillarConfigs?.ownership?.maxPoints).toBe(25);
    expect(CONFIG.pillarConfigs?.managementControl?.maxPoints).toBe(15);
    expect(CONFIG.pillarConfigs?.skillsDevelopment?.maxPoints).toBe(30);
    expect(CONFIG.pillarConfigs?.preferentialProcurement?.maxPoints).toBe(21);
    expect(CONFIG.pillarConfigs?.supplierDevelopment?.maxPoints).toBe(5);
    expect(CONFIG.pillarConfigs?.enterpriseDevelopment?.maxPoints).toBe(8);
    expect(CONFIG.pillarConfigs?.socioEconomicDevelopment?.maxPoints).toBe(12);
    expect(CONFIG.pillarConfigs?.yesInitiative?.maxPoints).toBe(0);
  });

  it('has ICT-specific ownership targets (30% voting, not 25%)', () => {
    expect(CONFIG.ownership?.votingRightsTarget).toBe(0.30);
    expect(CONFIG.ownership?.votingRightsMax).toBe(5);
    expect(CONFIG.ownership?.economicInterestMax).toBe(5);
    // Women targets unchanged
    expect(CONFIG.ownership?.womenBonusMax).toBe(2);
    expect(CONFIG.ownership?.womenEIMax).toBe(2);
    expect(CONFIG.ownership?.netValueMax).toBe(8);
  });

  it('has QSE-specific skills targets (3% overall, 1% bursary, 0.15% disabled, 1% absorption)', () => {
    expect(CONFIG.skills.overallSpendPercent).toBeCloseTo(0.030, 4);
    expect(CONFIG.skills.learningProgrammesMaxPts).toBe(15);
    expect(CONFIG.skills.bursarySpendPercent).toBeCloseTo(0.010, 4);
    expect(CONFIG.skills.bursaryMaxPts).toBe(7);           // Black women indicator
    expect(CONFIG.skills.disabledSpendPercent).toBeCloseTo(0.0015, 5);
    expect(CONFIG.skills.disabledLearningMaxPts).toBe(3);
    expect(CONFIG.skills.absorptionMaxPts).toBe(5);
    expect(CONFIG.skills.learnershipsMaxPts).toBe(0);      // No LAI headcount in QSE
    expect(CONFIG.skills.absorptionTargetPercent).toBe(100); // R22: whole-percent 100 → /100 → 1.0 = 100% target (Excel Skills Calcs!J28 = MIN(absorbed/completers × 5, 5), no % divisor). Was 1.0 (=1%); mirror of R8.
    // Total: 15 + 7 + 3 + 0 + 5 = 30 ✓
    const skillsMax =
      CONFIG.skills.learningProgrammesMaxPts +
      CONFIG.skills.bursaryMaxPts +
      CONFIG.skills.disabledLearningMaxPts +
      CONFIG.skills.learnershipsMaxPts +
      CONFIG.skills.absorptionMaxPts;
    expect(skillsMax).toBe(30);
  });

  it('has QSE-specific procurement targets (60% allSuppliers/15pts, no QSE/EME/BWO30)', () => {
    expect(CONFIG.procurement.allSuppliersTarget).toBe(0.60);
    expect(CONFIG.procurement.allSuppliersMaxPts).toBe(15);
    expect(CONFIG.procurement.bo51Target).toBe(0.15);
    expect(CONFIG.procurement.bo51MaxPts).toBe(5);
    expect(CONFIG.procurement.dgTarget).toBe(0.01);
    expect(CONFIG.procurement.dgMaxPts).toBe(1);
    expect(CONFIG.procurement.qseMaxPts).toBe(0);
    expect(CONFIG.procurement.emeMaxPts).toBe(0);
    expect(CONFIG.procurement.bwo30MaxPts).toBe(0);
    // Base = 15 + 5 = 20; bonus DG = 1 → total 21 ✓
    expect(CONFIG.procurement.baseMax).toBe(20);
    expect(CONFIG.procurement.bonusMax).toBe(1);
    // Sub-min on base points (excl. 1-pt DG bonus): 40% × 20 = 8
    expect(CONFIG.procurement.subMinThreshold).toBeCloseTo(8, 1);
  });

  it('has QSE-specific ESD targets (2% NPAT for SD and ED base — AICT604, audit item 4)', () => {
    expect(CONFIG.esd.supplierDevTarget).toBeCloseTo(0.02, 4);
    expect(CONFIG.esd.supplierDevMax).toBe(5);
    expect(CONFIG.esd.enterpriseDevTarget).toBeCloseTo(0.02, 4);
    expect(CONFIG.esd.enterpriseDevMax).toBe(5); // base; total 8 with bonuses (7 via calculator)
  });

  it('has ICT QSE SED at 12 pts (not 5)', () => {
    expect(CONFIG.sed.maxPoints).toBe(12);
    expect(CONFIG.sed.npatTarget).toBeCloseTo(0.01, 4);
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

  it('has standard level thresholds (100/95/90/80/75/70/55/40) — NOT ICT Generic scale', () => {
    const thresholds = CONFIG.levelThresholds ?? [];
    expect(thresholds.length).toBe(8);
    expect(thresholds.find((t) => t.level === 1)?.minPoints).toBe(100);
    expect(thresholds.find((t) => t.level === 4)?.minPoints).toBe(80);
    expect(thresholds.find((t) => t.level === 7)?.minPoints).toBe(55);
    expect(thresholds.find((t) => t.level === 8)?.minPoints).toBe(40);
    // Verify NOT ICT Generic (which would have L1=120, L4=100)
    expect(thresholds.find((t) => t.level === 1)?.minPoints).not.toBe(120);
    expect(thresholds.find((t) => t.level === 4)?.minPoints).not.toBe(100);
  });

  it('has correct sectorCode and scorecardType', () => {
    expect(CONFIG.sectorCode).toBe('ICT');
    expect(CONFIG.scorecardType).toBe('QSE');
  });

  it('has benefit factors and industry norms', () => {
    expect(CONFIG.benefitFactors.length).toBeGreaterThan(0);
    expect(CONFIG.industryNorms.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// §2 — Ownership pillar
// ---------------------------------------------------------------------------

describe('ICT QSE — Ownership pillar', () => {
  it('zero input → 0/25', () => {
    const r = calculateOwnershipScore(
      { id: '1', clientId: 'ict-qse', shareholders: [], companyValue: 0, outstandingDebt: 0, yearsHeld: 0 },
      CONFIG,
    );
    expect(r.total).toBe(0);
  });

  it('30% black voting + 30% black EI → voting and EI maxed (5+5=10 pts)', () => {
    const r = calculateOwnershipScore(
      {
        id: '1',
        clientId: 'ict-qse',
        shareholders: [
          {
            id: 'sh1',
            name: 'ICT Black Founders Trust',
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
    // 100% black ownership → far above 30% target → both voting and EI maxed
    expect(r.total).toBeCloseTo(25, 0);
  });

  it('exactly 30% black voting → full 5 pts (ICT-specific target)', () => {
    const r = calculateOwnershipScore(
      {
        id: '1',
        clientId: 'ict-qse',
        shareholders: [
          {
            id: 'sh1',
            name: 'Exact Target Co',
            ownershipType: 'shareholder' as const,
            blackOwnership: 0.30,
            blackWomenOwnership: 0,
            shares: 100,
            shareValue: 1,
            votingRightsPercent: 0.30,
            economicInterestPercent: 0.30,
            isDesignatedGroup: false,
            blackNewEntrant: false,
          },
        ],
        companyValue: 5_000_000,
        outstandingDebt: 0,
        yearsHeld: 3,
      },
      CONFIG,
    );
    // At exactly 30% voting: min(0.30/0.30, 1) × 5 = 5
    expect(r.votingRightsBlack).toBeCloseTo(5, 1);
    // At exactly 30% EI: min(0.30/0.30, 1) × 5 = 5
    expect(r.economicInterestBlack).toBeCloseTo(5, 1);
  });

  it('25% black voting → only 4.17/5 pts (ICT 30% target not met)', () => {
    const r = calculateOwnershipScore(
      {
        id: '1',
        clientId: 'ict-qse',
        shareholders: [
          {
            id: 'sh1',
            name: 'Below Target',
            ownershipType: 'shareholder' as const,
            blackOwnership: 0.25,
            blackWomenOwnership: 0,
            shares: 100,
            shareValue: 1,
            votingRightsPercent: 0.25,
            economicInterestPercent: 0.25,
            isDesignatedGroup: false,
            blackNewEntrant: false,
          },
        ],
        companyValue: 5_000_000,
        outstandingDebt: 0,
        yearsHeld: 3,
      },
      CONFIG,
    );
    // 25% vs 30% target: min(0.25/0.30, 1) × 5 ≈ 4.17
    expect(r.votingRightsBlack).toBeCloseTo(25 / 30 * 5, 1);
  });

  it('sub-minimum threshold is 10 pts (40% × 25)', () => {
    const subMin = (CONFIG.pillarConfigs?.ownership?.subMinimumPercent ?? 40) / 100
      * (CONFIG.pillarConfigs?.ownership?.maxPoints ?? 25);
    expect(subMin).toBeCloseTo(10, 1);
  });
});

// ---------------------------------------------------------------------------
// §3 — Management Control pillar
// ---------------------------------------------------------------------------

describe('ICT QSE — Management Control pillar', () => {
  it('zero employees → 0/15', () => {
    const r = calculateManagementScore(
      { id: '1', clientId: 'ict-qse', employees: [] },
      CONFIG,
      'Gauteng',
    );
    expect(r.total).toBe(0);
  });

  it('maxes executive band (5+2=7 pts) with 100% black exec', () => {
    const employees = [
      { id: '1', name: 'CEO', gender: 'Male', race: 'African', designation: 'Executive Director', isDisabled: false, isForeign: false },
      { id: '2', name: 'CFO', gender: 'Female', race: 'African', designation: 'Executive Director', isDisabled: false, isForeign: false },
    ];
    const r = calculateManagementScore(
      { id: '1', clientId: 'ict-qse', employees },
      CONFIG,
      'Gauteng',
    );
    expect(r.execDirectorsBlack).toBeCloseTo(5, 1);
    expect(r.execDirectorsBWO).toBeCloseTo(2, 1);
    // No board score in QSE
    expect(r.boardVotingBlack).toBe(0);
    expect(r.boardVotingBWO).toBe(0);
  });

  it('counts Other Executive Manager in the QSE executive band (ledger D-01 — was excluded)', () => {
    // QSE "Executive Management" = Executive Director + Other Executive Manager (toolkit F24).
    // A single black Other Executive Manager → 100% of the exec band → execBlack = 5 (was 0).
    const r = calculateManagementScore(
      {
        id: '1', clientId: 'ict-qse',
        employees: [
          { id: '1', name: 'OEM', gender: 'Male', race: 'African', designation: 'Other Executive Manager', isDisabled: false, isForeign: false },
        ],
      },
      CONFIG,
      'Gauteng',
    );
    expect(r.execDirectorsBlack).toBeCloseTo(5, 1);
  });

  it('fully-maxed management team → approaches 15/15', () => {
    const employees = [
      // Executive (100% black, 50% female → exec = 5+2)
      { id: '1', name: 'ExecA', gender: 'Male', race: 'African', designation: 'Executive Director', isDisabled: false, isForeign: false },
      { id: '2', name: 'ExecB', gender: 'Female', race: 'African', designation: 'Executive Director', isDisabled: false, isForeign: false },
      // Senior management — all black (maps to seniorMaxPts)
      { id: '3', name: 'SenA', gender: 'Male', race: 'African', designation: 'Senior', isDisabled: false, isForeign: false },
      { id: '4', name: 'SenB', gender: 'Female', race: 'African', designation: 'Senior', isDisabled: false, isForeign: false },
      { id: '5', name: 'SenC', gender: 'Male', race: 'African', designation: 'Senior', isDisabled: false, isForeign: false },
      { id: '6', name: 'SenD', gender: 'Female', race: 'African', designation: 'Senior', isDisabled: false, isForeign: false },
    ];
    const r = calculateManagementScore(
      { id: '1', clientId: 'ict-qse', employees },
      CONFIG,
      'Gauteng',
    );
    // exec 7 + combined-SMJ flat 60/30 (6+2) = 15 (DISCREPANCY-LEDGER D-02)
    expect(r.seniorBlack).toBeCloseTo(6, 1);
    expect(r.seniorBWO).toBeCloseTo(2, 1);
    expect(r.total).toBeCloseTo(15, 1);
  });
});

// ---------------------------------------------------------------------------
// §4 — Skills Development pillar
// ---------------------------------------------------------------------------

describe('ICT QSE — Skills Development pillar', () => {
  it('zero spend → 0/30, sub-min not met', () => {
    const r = calculateSkillsScore(
      { id: '1', clientId: 'ict-qse', leviableAmount: LEVIABLE, trainingPrograms: [], yesCandidatesCount: 0, yesAbsorbedCount: 0 },
      CONFIG,
    );
    expect(r.total).toBe(0);
    expect(r.subMinimumMet).toBe(false);
  });

  it('spend exactly 3% leviable on Black people → 15 pts (SK-1 maxed)', () => {
    const blackSpend = LEVIABLE * 0.03;
    const r = calculateSkillsScore(
      {
        id: '1',
        clientId: 'ict-qse',
        leviableAmount: LEVIABLE,
        trainingPrograms: [
          {
            id: 'p1',
            name: 'Digital Leadership',
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
    // SK-1: min(45000 / (1500000 × 0.030), 1) × 15 = 15
    expect(r.learningProgrammes).toBeCloseTo(15, 0);
    expect(r.total).toBeCloseTo(15, 0);
  });

  it('spend exactly 1% leviable as bursary (Black women) → 7 pts (SK-2 maxed)', () => {
    const bwoSpend = LEVIABLE * 0.01;
    const r = calculateSkillsScore(
      {
        id: '1',
        clientId: 'ict-qse',
        leviableAmount: LEVIABLE,
        trainingPrograms: [
          {
            id: 'p2',
            name: 'ICT Digital Skills',
            // In QSE the bursaryMaxPts field maps to Black women spend (SK-2).
            // The skills calculator counts category='bursary' in the bursary bucket.
            category: 'bursary',
            cost: bwoSpend,
            isBlack: true,
            isDisabled: false,
            isAbsorbed: false,
            gender: 'Female',
            race: 'African',
          } as any,
        ],
        yesCandidatesCount: 0,
        yesAbsorbedCount: 0,
      },
      CONFIG,
    );
    // SK-2: min(blackFemaleSpend / (LEVIABLE × 0.01), 1) × 7 = 7
    expect(r.bursaries).toBeCloseTo(7, 0);
  });

  it('SK-2 credits Black-female spend in ANY category, not just bursaries (ledger D-03)', () => {
    // A Black woman's short-course spend (not a bursary) now scores the 7-pt line; was 0.
    const r = calculateSkillsScore(
      {
        id: '1', clientId: 'ict-qse', leviableAmount: LEVIABLE,
        trainingPrograms: [
          { id: 'bf', name: 'Course', category: 'short_course', cost: LEVIABLE * 0.01,
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
        id: '1', clientId: 'ict-qse', leviableAmount: LEVIABLE,
        trainingPrograms: [
          { id: 'm', name: 'Course', category: 'short_course', cost: LEVIABLE * 0.05,
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

  it('maxed absorption bonus (5 pts) at 100% absorption (Excel Skills Calcs!J28)', () => {
    // R22: target is 100% absorption (absorbed/completers = 1.0). All absorbed → 5 pts.
    const r = calculateSkillsScore(
      {
        id: '1',
        clientId: 'ict-qse',
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
    // 2 absorbed / 2 total learners = 100% rate × 5 = 5 (maxed only at 100%, not 1%)
    expect(r.absorption).toBeCloseTo(5, 1);
  });

  it('R22: partial absorption scores pro-rata BELOW 5 (100% target, not 1%)', () => {
    // Excel `Skills Calcs!J28 = MIN(absorbed/completers × 5, 5)` — full pts need 100% absorbed.
    // 1 absorbed of 2 Black learners = 50% rate → 0.5 × 5 = 2.5 (strictly < 5).
    const r = calculateSkillsScore(
      {
        id: '1', clientId: 'ict-qse', leviableAmount: LEVIABLE,
        trainingPrograms: [
          { id: 'a', name: 'LAI', category: 'learnership', cost: 1000,
            isBlack: true, isDisabled: false, isAbsorbed: true, gender: 'Male', race: 'African' } as never,
          { id: 'b', name: 'LAI', category: 'learnership', cost: 1000,
            isBlack: true, isDisabled: false, isAbsorbed: false, gender: 'Female', race: 'African' } as never,
        ],
        yesCandidatesCount: 0, yesAbsorbedCount: 0,
      },
      CONFIG,
    );
    expect(r.absorption).toBeCloseTo(2.5, 1);
    expect(r.absorption).toBeLessThan(5);
  });

  it('R22: a single absorbed learner among many no longer maxes (was 2.5 under the wrong 1% target)', () => {
    // 1 absorbed of 200 Black learners = 0.5% rate. Under the corrected 100% target:
    // 0.005 × 5 = 0.025 ≈ 0 (was 2.5 when the target was misread as 1%, ledger D-04).
    const programs = Array.from({ length: 200 }, (_, i) => ({
      id: `L${i}`, name: 'LAI', category: 'learnership', cost: 1000,
      isBlack: true, isDisabled: false, isAbsorbed: i === 0, gender: 'Male', race: 'African',
    }));
    const r = calculateSkillsScore(
      { id: '1', clientId: 'ict-qse', leviableAmount: LEVIABLE, trainingPrograms: programs as never, yesCandidatesCount: 0, yesAbsorbedCount: 0 },
      CONFIG,
    );
    expect(r.absorption).toBeLessThan(0.1);
  });
});

// ---------------------------------------------------------------------------
// §5 — Preferential Procurement pillar
// ---------------------------------------------------------------------------

describe('ICT QSE — Preferential Procurement pillar', () => {
  it('zero spend → 0/21', () => {
    const r = calculateProcurementScore(
      { id: '1', clientId: 'ict-qse', tmps: TMPS, suppliers: [] },
      CONFIG,
    );
    expect(r.total).toBe(0);
  });

  it('60% TMPS on L1 supplier → allSuppliers maxed at 15 pts', () => {
    const spend = TMPS * 0.60;
    const r = calculateProcurementScore(
      {
        id: '1',
        clientId: 'ict-qse',
        tmps: TMPS,
        suppliers: [
          {
            id: 's1',
            name: 'Compliant Tech Corp',
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
    // L1 recognition = 135% → recognised > TMPS × 0.60 → capped at 15
    expect(r.empoweringSuppliers).toBeCloseTo(15, 0);
  });

  it('counts L5-L8 suppliers in the all-suppliers (Level 1-8) line (ledger D-02 — was 0 for L5-8)', () => {
    // Level-8 supplier (recognition 0.10) at 100% of TMPS:
    //   score = min((TMPS × 0.10) / (TMPS × 0.60), 1) × 15 = 2.5 (was 0 before the fix).
    const r = calculateProcurementScore(
      {
        id: '1', clientId: 'ict-qse', tmps: TMPS,
        suppliers: [
          { id: 's8', name: 'Level 8 Tech Co', beeLevel: 8 as const, enterpriseType: 'generic' as const,
            blackOwnership: 0, blackWomenOwnership: 0, youthOwnership: 0, disabledOwnership: 0, spend: TMPS },
        ],
      },
      CONFIG,
    );
    expect(r.empoweringSuppliers).toBeGreaterThan(0);
    expect(r.empoweringSuppliers).toBeCloseTo(2.5, 1);
  });

  it('15% TMPS on 51%+ black-owned supplier → bo51 maxed at 5 pts', () => {
    const spend = TMPS * 0.15;
    const r = calculateProcurementScore(
      {
        id: '1',
        clientId: 'ict-qse',
        tmps: TMPS,
        suppliers: [
          {
            id: 's2',
            name: 'Black ICT Co',
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
    expect(r.blackOwned51).toBeGreaterThan(0);
    expect(r.blackOwned51).toBeLessThanOrEqual(5);
  });

  it('sub-minimum threshold is 8 pts (40% × 20 base, excl. 1-pt DG bonus)', () => {
    expect(CONFIG.procurement.subMinThreshold).toBeCloseTo(8, 1);
  });
});

// ---------------------------------------------------------------------------
// §6 — Supplier Development pillar (2% NPAT / 5 pts — AICT604)
// ---------------------------------------------------------------------------

describe('ICT QSE — Supplier Development pillar', () => {
  it('zero contributions → 0/5', () => {
    const r = calculateEsdScore(
      { id: '1', clientId: 'ict-qse', contributions: [], graduationBonus: false, jobsCreatedBonus: false },
      NPAT,
      CONFIG,
    );
    expect(r.supplierDev).toBe(0);
  });

  it('exactly 2% NPAT in SD → 5/5 (full score)', () => {
    const sdAmount = NPAT * 0.02; // 2% NPAT = the AICT604 target (audit item 4)
    const r = calculateEsdScore(
      {
        id: '1',
        clientId: 'ict-qse',
        contributions: [
          {
            id: 'sd1',
            beneficiary: 'ICT Supplier',
            description: 'Direct SD investment',
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
    expect(r.supplierDev).toBeCloseTo(5, 1);
  });

  it('SD sub-minimum threshold is 2 pts (40% × 5)', () => {
    const sdSubMin = (CONFIG.pillarConfigs?.supplierDevelopment?.subMinimumPercent ?? 40) / 100
      * (CONFIG.pillarConfigs?.supplierDevelopment?.maxPoints ?? 5);
    expect(sdSubMin).toBeCloseTo(2, 1);
  });
});

// ---------------------------------------------------------------------------
// §7 — Enterprise Development pillar (5+1+1=7 via calculator; actual max 8)
// ---------------------------------------------------------------------------

describe('ICT QSE — Enterprise Development pillar (tiered jobs bonus)', () => {
  const edContribution = {
    id: 'ed1',
    beneficiary: 'ICT Startup',
    description: 'ED mentorship',
    type: 'direct_cost' as const,
    amount: NPAT * 0.02, // 2% NPAT = the AICT604 target (audit item 4)
    category: 'enterprise_development' as const,
    blackBenefitPercent: 100,
    transactionDate: '2025-08-01',
  };

  it('2% NPAT + graduation + jobs ≤10% → 7/8 (lower jobs tier = 1 pt)', () => {
    const r = calculateEsdScore(
      {
        id: '1', clientId: 'ict-qse', contributions: [edContribution],
        graduationBonus: true, jobsCreatedBonus: true, jobsCreatedPercent: 0.05,
      },
      NPAT,
      CONFIG,
    );
    expect(r.enterpriseDev).toBeCloseTo(5, 1);
    expect(r.graduationBonus).toBe(1);
    expect(r.jobsCreatedBonus).toBe(1); // ≤10% → lower tier
    expect(r.edTotal).toBeCloseTo(7, 1);
  });

  it('2% NPAT + graduation + jobs ≥11% → 8/8 (upper jobs tier = 2 pts)', () => {
    const r = calculateEsdScore(
      {
        id: '1', clientId: 'ict-qse', contributions: [edContribution],
        graduationBonus: true, jobsCreatedBonus: true, jobsCreatedPercent: 0.15,
      },
      NPAT,
      CONFIG,
    );
    expect(r.jobsCreatedBonus).toBe(2); // ≥11% → upper tier
    expect(r.edTotal).toBeCloseTo(8, 1);
  });

  it('jobsCreatedBonus without a percentage defaults to the lower (1-pt) tier', () => {
    const r = calculateEsdScore(
      {
        id: '1', clientId: 'ict-qse', contributions: [edContribution],
        graduationBonus: true, jobsCreatedBonus: true,
      },
      NPAT,
      CONFIG,
    );
    expect(r.jobsCreatedBonus).toBe(1);
    expect(r.edTotal).toBeCloseTo(7, 1);
  });

  it('pillar max is 8 pts and the calculator can now reach it (≥11% jobs tier)', () => {
    expect(CONFIG.pillarConfigs?.enterpriseDevelopment?.maxPoints).toBe(8);
    // enterpriseDevMax(5) + graduation(1) + jobs upper tier(2) = 8
    expect(CONFIG.esd.edJobsBonusMax).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// §8 — SED pillar (1% NPAT / 12 pts — ICT QSE specific)
// ---------------------------------------------------------------------------

describe('ICT QSE — SED pillar (12 pts)', () => {
  it('zero → 0/12', () => {
    const r = calculateSedScore(
      { id: '1', clientId: 'ict-qse', contributions: [] },
      NPAT,
      CONFIG,
    );
    expect(r.total).toBe(0);
  });

  it('exactly 1% NPAT in SED → 12/12 (ICT max, not 5)', () => {
    const sedAmount = NPAT * 0.01;
    const r = calculateSedScore(
      {
        id: '1',
        clientId: 'ict-qse',
        contributions: [
          {
            id: 'sed1',
            beneficiary: 'ICT Community Trust',
            description: 'Digital literacy grant',
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
    // grant benefitFactor = 1.0 → min(20000 / 20000, 1) × 12 = 12
    expect(r.total).toBeCloseTo(12, 1);
  });

  it('50% of SED target → 6/12 (proportional)', () => {
    const halfTarget = (NPAT * 0.01) / 2;
    const r = calculateSedScore(
      {
        id: '1',
        clientId: 'ict-qse',
        contributions: [
          {
            id: 'sed2',
            beneficiary: 'ICT Community Trust',
            description: 'Partial grant',
            type: 'grant',
            amount: halfTarget,
            category: 'socio_economic',
            blackBenefitPercent: 100,
            transactionDate: '2025-07-15',
          },
        ],
      },
      NPAT,
      CONFIG,
    );
    // min(10000 / 20000, 1) × 12 = 6
    expect(r.total).toBeCloseTo(6, 1);
  });
});

// ---------------------------------------------------------------------------
// §9 — Grand total and level checks
// ---------------------------------------------------------------------------

describe('ICT QSE — Grand total and level checks', () => {
  it('pillar max sum equals 116', () => {
    // 25 + 15 + 30 + 21 + 5 + 8 + 12 = 116
    const pillars = [25, 15, 30, 21, 5, 8, 12];
    expect(pillars.reduce((a, b) => a + b, 0)).toBe(116);
  });

  it('level 1 requires 100 pts out of 116 (standard 8-band thresholds)', () => {
    const thresholds = CONFIG.levelThresholds ?? [];
    expect(thresholds.find((t) => t.level === 1)?.minPoints).toBe(100);
    expect(thresholds.find((t) => t.level === 8)?.minPoints).toBe(40);
  });

  it('config sectorCode=ICT, scorecardType=QSE', () => {
    expect(CONFIG.sectorCode).toBe('ICT');
    expect(CONFIG.scorecardType).toBe('QSE');
  });

  it('ICT QSE SED (12) differs from RCOGP QSE SED (5)', () => {
    // Regression check: ICT QSE SED should not be 5
    expect(CONFIG.sed.maxPoints).not.toBe(5);
    expect(CONFIG.sed.maxPoints).toBe(12);
  });

  it('ICT QSE ED pillar max (8) differs from RCOGP QSE (7)', () => {
    expect(CONFIG.pillarConfigs?.enterpriseDevelopment?.maxPoints).toBe(8);
    expect(CONFIG.pillarConfigs?.enterpriseDevelopment?.maxPoints).not.toBe(7);
  });

  it('ICT QSE ownership voting target (0.30) differs from RCOGP QSE (0.25)', () => {
    expect(CONFIG.ownership?.votingRightsTarget).toBe(0.30);
    expect(CONFIG.ownership?.votingRightsTarget).not.toBe(0.25);
  });
});
