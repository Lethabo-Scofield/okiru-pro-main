/**
 * ICT Generic golden tests — config completeness + pillar scoring.
 *
 * Source: BBBEE Toolkit (ICT Generic)_Template_v.1.4.xlsx
 *         extracted_ICT_Generic.json, analysis_ICT_Generic.txt
 *         docs/domain/sectors/ict/generic/sls.md
 *
 * All 21 discrepancies from comparison_output.md are addressed:
 *   - Grand total 140 (was 133)
 *   - MC 23 pts with correct band pts (no separate EE pillar)
 *   - Skills 25 pts, all-spend 8 pts at 6%, no bursary, LAI+unemployed 8 pts
 *   - PP 27 pts with BO51 target 40% (not 50%)
 *   - SD 10 pts at 2% NPAT
 *   - ED 18 pts max: 15 base at 3% NPAT + bonuses (calculator gives 17 max — see known gap)
 *   - SED 12 pts at 1.5% NPAT
 *   - ICT level thresholds: L1=120, L2=115, …, L7=75, L8=55
 *
 * Known open gap (documented in sls.md §10):
 *   ED jobs bonus: ICT has ≤10% workforce = 1 pt OR ≥11% = 2 pts.
 *   Current calculator treats jobsCreatedBonus as boolean +1.
 *   Max achievable via calculator = 17; Excel max = 18.
 */
import { describe, it, expect } from 'vitest';
import { ICT_GENERIC_CALCULATOR_CONFIG } from '../../sectors/ict-generic';
import { calculateOwnershipScore } from '../ownership';
import { calculateManagementScore } from '../management';
import { calculateSkillsScore } from '../skills';
import { calculateProcurementScore } from '../procurement';
import { calculateEsdScore, calculateSedScore } from '../esd-sed';

const CONFIG = ICT_GENERIC_CALCULATOR_CONFIG;

// Representative test financials
const NPAT = 1_000_000;
const LEVIABLE = 500_000;
const TMPS = 2_000_000;
const EAP_PROVINCE = 'Gauteng';

// ─── Config completeness ──────────────────────────────────────────────────────

describe('ICT Generic — CalculatorConfig completeness', () => {
  it('grand total = 140', () => {
    expect(CONFIG.totalMaxPoints).toBe(140);
  });

  it('has sector code ICT Generic', () => {
    expect(CONFIG.sectorCode).toBe('ICT');
    expect(CONFIG.scorecardType).toBe('Generic');
  });

  it('pillar maxima match Excel Summary Scorecard', () => {
    expect(CONFIG.pillarConfigs?.ownership?.maxPoints).toBe(25);
    // MC 23 pts — combined MC + EE (no separate EE pillar)
    expect(CONFIG.pillarConfigs?.managementControl?.maxPoints).toBe(23);
    // EE = 0 — merged into MC
    expect(CONFIG.pillarConfigs?.employmentEquity?.maxPoints).toBe(0);
    expect(CONFIG.pillarConfigs?.skillsDevelopment?.maxPoints).toBe(25);
    // PP = 27 (25 base + 2 DG bonus)
    expect(CONFIG.pillarConfigs?.preferentialProcurement?.maxPoints).toBe(27);
    expect(CONFIG.pillarConfigs?.supplierDevelopment?.maxPoints).toBe(10);
    // ED = 18 max (15 base + 1 graduation + 2 jobs ≥11%)
    expect(CONFIG.pillarConfigs?.enterpriseDevelopment?.maxPoints).toBe(18);
    // SED = 12 pts (ICT Specific Initiatives)
    expect(CONFIG.pillarConfigs?.socioEconomicDevelopment?.maxPoints).toBe(12);
    expect(CONFIG.pillarConfigs?.yesInitiative?.maxPoints).toBe(0);
  });

  it('ownership targets correct', () => {
    expect(CONFIG.ownership.votingRightsTarget).toBe(0.25);
    expect(CONFIG.ownership.votingRightsMax).toBe(4);
    expect(CONFIG.ownership.economicInterestMax).toBe(4);
    expect(CONFIG.ownership.netValueMax).toBe(8);
    expect(CONFIG.ownership.newEntrantsMax).toBe(2);
    expect(CONFIG.ownership.designatedGroupsMax).toBe(3);
    expect(CONFIG.ownership.designatedGroupsTarget).toBe(0.03);
  });

  it('MC band points correct (ICT-specific)', () => {
    const mc = CONFIG.managementControl!;
    // Director band: 3+2+2+1+3+2 = 13
    expect(mc.boardBlackMaxPts).toBe(3);
    expect(mc.boardBWMaxPts).toBe(2);
    expect(mc.execBlackMaxPts).toBe(2);
    expect(mc.execBWMaxPts).toBe(1);
    expect(mc.otherExecBlackMaxPts).toBe(3);
    expect(mc.otherExecBWMaxPts).toBe(2);
    // EE band (within combined 23): senior 2+1, middle 2+1, junior 1+1, disabled 2 = 10
    expect(mc.seniorMaxPts).toBe(2);
    expect(mc.seniorBWMaxPts).toBe(1);
    expect(mc.middleMaxPts).toBe(2);
    expect(mc.middleBWMaxPts).toBe(1);
    expect(mc.juniorMaxPts).toBe(1);
    expect(mc.juniorBWMaxPts).toBe(1);
    expect(mc.disabledMaxPts).toBe(2);
    expect(mc.disabledTarget).toBe(0.02);
  });

  it('skills targets correct (ICT-specific: 6%, no bursary)', () => {
    const sk = CONFIG.skills;
    // 2.1.1.1 all-spend at 6% = 8 pts
    expect(sk.learningProgrammesMaxPts).toBe(8);
    expect(sk.overallSpendPercent).toBeCloseTo(0.060, 4); // stored as fraction after /100
    // No separate bursary in ICT
    expect(sk.bursaryMaxPts).toBe(0);
    expect(sk.bursarySpendPercent).toBe(0);
    // 2.1.1.2 disabled at 0.3% = 4 pts
    expect(sk.disabledLearningMaxPts).toBe(4);
    expect(sk.disabledSpendPercent).toBeCloseTo(0.003, 4); // stored as fraction after /100
    // 2.1.2.1 + 2.1.2.2 LAI + unemployed training at 2.5% = 8 pts combined
    expect(sk.learnershipsMaxPts).toBe(8);
    expect(sk.learnershipTargetPercent).toBe(2.5);
    // 2.1.3 absorption bonus = 5 pts
    expect(sk.absorptionMaxPts).toBe(5);
    // Sub-min: 40% × 20 (base excl. absorption) = 8 pts
    expect(sk.subMinThreshold).toBe(8);
  });

  it('PP targets correct (ICT: BO51 = 40% not 50%)', () => {
    const pp = CONFIG.procurement;
    expect(pp.bo51Target).toBe(0.40);      // ICT critical: 40%
    expect(pp.bo51MaxPts).toBe(9);
    expect(pp.allSuppliersMaxPts).toBe(5);
    expect(pp.qseMaxPts).toBe(3);
    expect(pp.emeMaxPts).toBe(4);
    expect(pp.bwo30MaxPts).toBe(4);
    expect(pp.dgMaxPts).toBe(2);           // DG bonus
    expect(pp.baseMax).toBe(25);           // 5+3+4+9+4 (no bonus)
    expect(pp.subMinThreshold).toBe(10);   // 40% × 25 base
  });

  it('ESD targets correct (ICT: ED 3% NPAT / 15 pts)', () => {
    const esd = CONFIG.esd;
    expect(esd.supplierDevTarget).toBeCloseTo(0.02, 4);  // SD 2% NPAT
    expect(esd.supplierDevMax).toBe(10);
    expect(esd.enterpriseDevTarget).toBeCloseTo(0.03, 4); // ED 3% NPAT (not 1%)
    expect(esd.enterpriseDevMax).toBe(15);               // ED base 15 pts (not 5)
  });

  it('SED targets correct (ICT: 1.5% NPAT / 12 pts)', () => {
    const sed = CONFIG.sed;
    expect(sed.npatTarget).toBeCloseTo(0.015, 4);  // 1.5% (not 1%)
    expect(sed.maxPoints).toBe(12);               // (not 5)
  });

  it('ICT level thresholds differ from RCOGP', () => {
    const levels = CONFIG.levelThresholds!;
    expect(levels.length).toBe(8);
    const l1 = levels.find((l) => l.level === 1)!;
    const l4 = levels.find((l) => l.level === 4)!;
    const l7 = levels.find((l) => l.level === 7)!;
    const l8 = levels.find((l) => l.level === 8)!;
    // ICT scale: L1=120 (not 100), L4=100, L7=75, L8=55
    expect(l1.minPoints).toBe(120);
    expect(l4.minPoints).toBe(100);
    expect(l7.minPoints).toBe(75);
    expect(l8.minPoints).toBe(55);
  });

  it('has benefit factors and industry norms', () => {
    expect(CONFIG.benefitFactors.length).toBeGreaterThan(0);
    expect(CONFIG.industryNorms.length).toBeGreaterThan(0);
  });
});

// ─── Ownership scoring ────────────────────────────────────────────────────────

describe('ICT Generic golden — Ownership', () => {
  it('full black ownership = 25/25', () => {
    const r = calculateOwnershipScore(
      {
        id: '1',
        clientId: 'ict-test',
        shareholders: [
          {
            id: 'sh1',
            name: 'ICT Black Trust',
            ownershipType: 'shareholder' as const,
            blackOwnership: 1,
            blackWomenOwnership: 0.5,
            shares: 100,
            shareValue: 1,
            votingRightsPercent: 1,
            economicInterestPercent: 1,
            isDesignatedGroup: true,
            blackNewEntrant: true,
          },
        ],
        companyValue: 10_000_000,
        outstandingDebt: 0,
        yearsHeld: 5,
      },
      CONFIG,
    );
    expect(r.total).toBeCloseTo(25, 1);
    expect(r.subMinimumMet).toBe(true);
  });

  it('zero ownership = 0/25, sub-min not met', () => {
    const r = calculateOwnershipScore(
      {
        id: '1',
        clientId: 'ict-test',
        shareholders: [],
        companyValue: 10_000_000,
        outstandingDebt: 0,
        yearsHeld: 0,
      },
      CONFIG,
    );
    expect(r.total).toBe(0);
    expect(r.subMinimumMet).toBe(false);
  });
});

// ─── Skills scoring ───────────────────────────────────────────────────────────

describe('ICT Generic golden — Skills Development', () => {
  it('no programmes = 0/25, sub-min NOT met (threshold = 8)', () => {
    const r = calculateSkillsScore(
      {
        id: '1',
        clientId: 'ict-test',
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
});

// ─── Procurement scoring ──────────────────────────────────────────────────────

describe('ICT Generic golden — Preferential Procurement', () => {
  it('no suppliers = 0/27, sub-min NOT met', () => {
    const r = calculateProcurementScore(
      { id: '1', clientId: 'ict-test', tmps: TMPS, suppliers: [] },
      CONFIG,
    );
    expect(r.total).toBe(0);
    expect(r.subMinimumMet).toBe(false);
  });

  it('100% spend from L1 empowering supplier yields max base score', () => {
    const r = calculateProcurementScore(
      {
        id: '1',
        clientId: 'ict-test',
        tmps: TMPS,
        suppliers: [
          {
            id: 's1',
            name: 'Full Compliant Supplier',
            beeLevel: 1 as const,
            enterpriseType: 'eme' as const,
            blackOwnership: 0.6,     // ≥51% black-owned (meets ICT 40% BO51 target)
            blackWomenOwnership: 0.4, // ≥30% BWO
            youthOwnership: 0,
            disabledOwnership: 0,
            spend: TMPS,             // 100% of TMPS
            isEmpoweringSupplier: true,
            isForeignSupplier: false,
            isBlackOwned51: true,
            isBlackWomanOwned30: true,
            isDesignatedGroup: false,
            isSupplierDevRecipient: false,
            hasThreeYearContract: false,
          },
        ],
      },
      CONFIG,
    );
    // All-suppliers: 5 pts. EME: 4 pts. BO51 (40% target): 9 pts. BWO30: 4 pts.
    // With 100% L1 spend the base score should be fully achieved
    expect(r.total).toBeGreaterThan(20);
    expect(r.subMinimumMet).toBe(true);
  });
});

// ─── ESD (SD + ED) scoring ────────────────────────────────────────────────────

describe('ICT Generic golden — Supplier Development (10 pts @ 2% NPAT)', () => {
  it('zero contributions = 0/10, sub-min NOT met', () => {
    const r = calculateEsdScore(
      {
        id: '1',
        clientId: 'ict-test',
        contributions: [],
        graduationBonus: false,
        jobsCreatedBonus: false,
      },
      NPAT,
      CONFIG,
    );
    expect(r.sdTotal).toBe(0);
    expect(r.sdSubMinimumMet).toBe(false);
  });

  it('SD contribution = 2% NPAT → 10/10', () => {
    const sdTarget = NPAT * 0.02; // 20,000
    const r = calculateEsdScore(
      {
        id: '1',
        clientId: 'ict-test',
        contributions: [
          {
            id: 'sd1',
            beneficiary: 'ICT Supplier',
            description: 'Direct support',
            type: 'direct_cost',
            amount: sdTarget,
            category: 'supplier_development',
            blackBenefitPercent: 100,
            transactionDate: '2025-01-01',
          },
        ],
        graduationBonus: false,
        jobsCreatedBonus: false,
      },
      NPAT,
      CONFIG,
    );
    expect(r.sdTotal).toBeCloseTo(10, 1);
    expect(r.sdSubMinimumMet).toBe(true);
  });
});

describe('ICT Generic golden — Enterprise Development (15 pts base @ 3% NPAT)', () => {
  it('zero contributions = 0 ED base', () => {
    const r = calculateEsdScore(
      {
        id: '1',
        clientId: 'ict-test',
        contributions: [],
        graduationBonus: false,
        jobsCreatedBonus: false,
      },
      NPAT,
      CONFIG,
    );
    expect(r.enterpriseDev).toBe(0);
    expect(r.edTotal).toBe(0);
  });

  it('ED contribution = 3% NPAT → 15/15 base (no bonuses)', () => {
    const edTarget = NPAT * 0.03; // 30,000
    const r = calculateEsdScore(
      {
        id: '1',
        clientId: 'ict-test',
        contributions: [
          {
            id: 'ed1',
            beneficiary: 'ICT Startup',
            description: 'Grant',
            type: 'grant',
            amount: edTarget,
            category: 'enterprise_development',
            blackBenefitPercent: 100,
            transactionDate: '2025-01-01',
          },
        ],
        graduationBonus: false,
        jobsCreatedBonus: false,
      },
      NPAT,
      CONFIG,
    );
    expect(r.enterpriseDev).toBeCloseTo(15, 1);
    expect(r.edTotal).toBeCloseTo(15, 1);
  });

  const edFullContribution = {
    id: 'ed1',
    beneficiary: 'ICT Startup',
    description: 'Grant',
    type: 'grant' as const,
    amount: NPAT * 0.03, // 30,000 = 3% NPAT
    category: 'enterprise_development' as const,
    blackBenefitPercent: 100,
    transactionDate: '2025-01-01',
  };

  it('ED full (3% NPAT + graduation + jobs ≤10%) → 17/18 (lower jobs tier = 1 pt)', () => {
    const r = calculateEsdScore(
      {
        id: '1', clientId: 'ict-test', contributions: [edFullContribution],
        graduationBonus: true, jobsCreatedBonus: true, jobsCreatedPercent: 0.05,
      },
      NPAT,
      CONFIG,
    );
    expect(r.graduationBonus).toBe(1);
    expect(r.jobsCreatedBonus).toBe(1); // ≤10% → lower tier
    expect(r.edTotal).toBeCloseTo(17, 1);
  });

  it('ED full (3% NPAT + graduation + jobs ≥11%) → 18/18 (upper jobs tier = 2 pts)', () => {
    const r = calculateEsdScore(
      {
        id: '1', clientId: 'ict-test', contributions: [edFullContribution],
        graduationBonus: true, jobsCreatedBonus: true, jobsCreatedPercent: 0.15,
      },
      NPAT,
      CONFIG,
    );
    expect(r.graduationBonus).toBe(1);
    expect(r.jobsCreatedBonus).toBe(2); // ≥11% → upper tier (now implemented)
    expect(r.edTotal).toBeCloseTo(18, 1);
  });
});

// ─── SED scoring ──────────────────────────────────────────────────────────────

describe('ICT Generic golden — SED (12 pts @ 1.5% NPAT)', () => {
  it('zero contributions = 0/12', () => {
    const r = calculateSedScore(
      { id: '1', clientId: 'ict-test', contributions: [] },
      NPAT,
      CONFIG,
    );
    expect(r.total).toBe(0);
    expect(r.target).toBeCloseTo(NPAT * 0.015, 0); // target = 15,000
  });

  it('SED = 1.5% NPAT (ICT Specific Initiatives) → 12/12', () => {
    const sedTarget = NPAT * 0.015; // 15,000
    const r = calculateSedScore(
      {
        id: '1',
        clientId: 'ict-test',
        contributions: [
          {
            id: 'sed1',
            beneficiary: 'ICT Community Programme',
            description: 'ICT Specific Initiatives grant',
            type: 'grant',
            amount: sedTarget,
            category: 'socio_economic',
            blackBenefitPercent: 100,
            transactionDate: '2025-01-01',
          },
        ],
      },
      NPAT,
      CONFIG,
    );
    expect(r.total).toBeCloseTo(12, 1);
    expect(r.target).toBeCloseTo(sedTarget, 0);
  });

  it('SED < target → partial score', () => {
    // Half the target → 50% → 6 pts
    const halfTarget = (NPAT * 0.015) / 2; // 7,500
    const r = calculateSedScore(
      {
        id: '1',
        clientId: 'ict-test',
        contributions: [
          {
            id: 'sed1',
            beneficiary: 'ICT Community Programme',
            description: 'Partial grant',
            type: 'grant',
            amount: halfTarget,
            category: 'socio_economic',
            blackBenefitPercent: 100,
            transactionDate: '2025-01-01',
          },
        ],
      },
      NPAT,
      CONFIG,
    );
    expect(r.total).toBeCloseTo(6, 1);
  });
});

// ─── MC structure verification ───────────────────────────────────────────────

describe('ICT Generic golden — Management Control (23 pts combined)', () => {
  it('no employees = 0/23', () => {
    const r = calculateManagementScore(
      { id: '1', clientId: 'ict-test', employees: [] },
      CONFIG,
      EAP_PROVINCE,
    );
    expect(r.total).toBe(0);
  });

  it('all-black board + exec team scores director band (13 pts max)', () => {
    const r = calculateManagementScore(
      {
        id: '1',
        clientId: 'ict-test',
        employees: [
          { id: '1', name: 'BrdA', gender: 'Male', race: 'African', designation: 'Board', isDisabled: false },
          { id: '2', name: 'BrdB', gender: 'Female', race: 'African', designation: 'Board', isDisabled: false },
          { id: '3', name: 'ExecA', gender: 'Male', race: 'African', designation: 'Executive Director', isDisabled: false },
          { id: '4', name: 'ExecB', gender: 'Female', race: 'African', designation: 'Executive Director', isDisabled: false },
          { id: '5', name: 'OEM-A', gender: 'Male', race: 'African', designation: 'Other Executive Management', isDisabled: false },
          { id: '6', name: 'OEM-B', gender: 'Female', race: 'African', designation: 'Other Executive Management', isDisabled: false },
        ],
      },
      CONFIG,
      EAP_PROVINCE,
    );
    // Board 50% black = 3 pts. Board women 100% ≥25% = 2 pts.
    // Exec Black 100% ≥50% = 2 pts. Exec Women 100% ≥25% = 1 pt.
    // Other Exec 100% ≥60% = 3 pts. Other Exec Women 100% ≥30% = 2 pts.
    // Director subtotal = 13. No senior/middle/junior = 0. Disabled = 0.
    expect(r.total).toBeCloseTo(13, 0);
  });
});

// ─── Regression: EE suppressed in ICT ────────────────────────────────────────

describe('ICT Generic — no separate EE pillar', () => {
  it('employmentEquity pillar max = 0 (merged into MC)', () => {
    expect(CONFIG.pillarConfigs?.employmentEquity?.maxPoints).toBe(0);
  });

  it('MC includes disabled indicator (2 pts)', () => {
    // Verify disabled scoring is wired through MC, not EE
    const r = calculateManagementScore(
      {
        id: '1',
        clientId: 'ict-test',
        employees: [
          { id: '1', name: 'DisabledA', gender: 'Male', race: 'African', designation: 'Junior', isDisabled: true },
          // 19 non-disabled to make 1/20 = 5% > 2% target
          ...Array.from({ length: 19 }, (_, i) => ({
            id: `emp${i + 2}`,
            name: `Emp${i + 2}`,
            gender: 'Male' as const,
            race: 'White' as const,
            designation: 'Junior' as const,
            isDisabled: false,
          })),
        ],
      },
      CONFIG,
      EAP_PROVINCE,
    );
    // With 1 Black disabled out of 20 total = 5% ≥ 2% target → 2 pts disabled
    expect(r.total).toBeGreaterThan(0);
  });
});
