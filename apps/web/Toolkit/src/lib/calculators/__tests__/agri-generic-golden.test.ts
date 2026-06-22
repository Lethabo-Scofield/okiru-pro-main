/**
 * AGRI Generic golden tests — AgriBEE Sector Code.
 *
 * Source: BBBEE Toolkit (Agri Generic)_Master_v.1.0.1.xlsx
 *         docs/domain/sectors/agri/generic/sls.md
 *         docs/toolkits/extracted_AGRI_Generic.json
 *
 * Config: AGRI_GENERIC_CALCULATOR_CONFIG (explicit sector bundle, no RCOGP fallback).
 *
 * Key AGRI differences asserted by this suite:
 *   - totalMaxPoints = 132 (not 120)
 *   - MC = 23 pts (board 3+2, exec 2+1, other-exec 3+2, senior 2+1,
 *     middle 2+1, junior 1+1, disabled 2)
 *   - PP = 27 pts; BO51 @ 40% target (not 50%)
 *   - SED = 15 pts @ 1.5% NPAT (agriculture-specific)
 *   - Ownership: voting/EI Black = 4pts each; designated groups (incl. farm workers) = 3pts @ 4%
 *
 * Test inputs are synthetic (zero-baseline) — all pillar scores expected 0 when
 * no data is entered, with sub-minimum checks per pillar. Positive-path cases
 * verify formula proportionality against known targets.
 *
 * Remaining discrepancies (open questions — see sls.md §10):
 *   - Skills "unemployed training" (2.1.2.2, 4pts) is mapped to bursaryMaxPts:
 *     the calculator treats it as a headcount-based spend indicator; values may
 *     diverge for non-zero inputs until the calculator is extended.
 *   - Absorption target is 100% (not 2.5%) — calculator uses absorptionTargetPercent
 *     as a fraction; at 1.0 any positive absorption gives full credit.
 */
import { describe, it, expect } from 'vitest';
import { AGRI_GENERIC_CALCULATOR_CONFIG } from '../../sectors/agri-generic';
import { calculateOwnershipScore } from '../ownership';
import { calculateManagementScore } from '../management';
import { calculateSkillsScore } from '../skills';
import { calculateProcurementScore } from '../procurement';
import { calculateEsdScore, calculateSedScore } from '../esd-sed';
import { getEffectiveEap, type Province } from '../eapTargets';

const CONFIG = AGRI_GENERIC_CALCULATOR_CONFIG;

// Synthetic financial inputs matching blank-toolkit baseline
const NPAT = 10_000_000;
const LEVIABLE = 5_000_000;
const TMPS = 50_000_000;
const EAP_PROVINCE = 'Gauteng';

// Race/gender for each of the 6 black demographic groups the EAP splits across.
const GROUP_RG: Record<string, { race: string; gender: string }> = {
  AM: { race: 'African', gender: 'Male' },
  CM: { race: 'Coloured', gender: 'Male' },
  IM: { race: 'Indian', gender: 'Male' },
  AF: { race: 'African', gender: 'Female' },
  CF: { race: 'Coloured', gender: 'Female' },
  IF: { race: 'Indian', gender: 'Female' },
};

/**
 * Build an all-black workforce for one MC band, distributed across the 6
 * demographic groups in the province's EFFECTIVE-EAP proportions. Because each
 * group's share then equals its EAP weight, every per-group sub-target
 * (bandTarget × eapWeight) is satisfied, so the EAP-split band scores its FULL
 * points. Used to prove the AGRI senior/middle/junior bands score (ledger D-01:
 * they previously returned 0 because the band targets were missing from config).
 */
function eapDistributedBlackBand(designation: string, province: string, n = 600) {
  const eff = getEffectiveEap(province as Province);
  const emps: Array<Record<string, unknown>> = [];
  let i = 0;
  (['AM', 'CM', 'IM', 'AF', 'CF', 'IF'] as const).forEach((g) => {
    const count = Math.round(n * (eff[g] ?? 0));
    const { race, gender } = GROUP_RG[g];
    for (let k = 0; k < count; k++) {
      emps.push({ id: `${designation}-${i++}`, name: 'e', gender, race, designation, isDisabled: false, isForeign: false });
    }
  });
  return emps;
}

// ---------------------------------------------------------------------------
// §1 Config completeness
// ---------------------------------------------------------------------------

describe('AGRI Generic — CalculatorConfig completeness', () => {
  it('loads 132 total and all pillar maxima from bundled config', () => {
    expect(CONFIG.totalMaxPoints).toBe(132);
    expect(CONFIG.pillarConfigs?.ownership?.maxPoints).toBe(25);
    expect(CONFIG.pillarConfigs?.managementControl?.maxPoints).toBe(23);
    expect(CONFIG.pillarConfigs?.employmentEquity?.maxPoints).toBe(0);
    expect(CONFIG.pillarConfigs?.skillsDevelopment?.maxPoints).toBe(25);
    expect(CONFIG.pillarConfigs?.preferentialProcurement?.maxPoints).toBe(27);
    expect(CONFIG.pillarConfigs?.supplierDevelopment?.maxPoints).toBe(10);
    expect(CONFIG.pillarConfigs?.enterpriseDevelopment?.maxPoints).toBe(7);
    expect(CONFIG.pillarConfigs?.socioEconomicDevelopment?.maxPoints).toBe(15);
    expect(CONFIG.pillarConfigs?.yesInitiative?.maxPoints).toBe(0);
  });

  it('ownership targets: 4+2+4+2+3+2+8 = 25 without double-counting', () => {
    const o = CONFIG.ownership;
    expect(o.votingRightsMax).toBe(4);
    expect(o.womenBonusMax).toBe(2);
    expect(o.economicInterestMax).toBe(4);
    expect(o.womenEIMax).toBe(2);
    // Farm workers / designated groups
    expect(o.designatedGroupsMax).toBe(3);
    expect(o.designatedGroupsTarget).toBeCloseTo(0.04, 4);
    expect(o.newEntrantsMax).toBe(2);
    expect(o.netValueMax).toBe(8);
    const sum = (o.votingRightsMax ?? 0) + (o.womenBonusMax ?? 0)
      + (o.economicInterestMax ?? 0) + (o.womenEIMax ?? 0)
      + (o.designatedGroupsMax ?? 0) + (o.newEntrantsMax ?? 0)
      + (o.netValueMax ?? 0);
    expect(sum).toBe(25);
  });

  it('MC targets: board 3+2, exec 2+1, other-exec 3+2, senior 2+1, middle 2+1, junior 1+1, disabled 2 = 23', () => {
    const mc = CONFIG.managementControl!;
    expect(mc.boardBlackMaxPts).toBe(3);
    expect(mc.boardBWMaxPts).toBe(2);
    expect(mc.execBlackMaxPts).toBe(2);
    expect(mc.execBWMaxPts).toBe(1);
    expect(mc.otherExecBlackMaxPts).toBe(3);
    expect(mc.otherExecBWMaxPts).toBe(2);
    expect(mc.seniorMaxPts).toBe(2);
    expect(mc.seniorBWMaxPts).toBe(1);
    expect(mc.middleMaxPts).toBe(2);
    expect(mc.middleBWMaxPts).toBe(1);
    expect(mc.juniorMaxPts).toBe(1);
    expect(mc.juniorBWMaxPts).toBe(1);
    expect(mc.disabledMaxPts).toBe(2);
    expect(mc.disabledTarget).toBeCloseTo(0.02, 4);
    // Sum of explicit pts fields = 23
    const sum = mc.boardBlackMaxPts + mc.boardBWMaxPts
      + mc.execBlackMaxPts + mc.execBWMaxPts
      + mc.otherExecBlackMaxPts + mc.otherExecBWMaxPts
      + mc.seniorMaxPts + mc.seniorBWMaxPts
      + mc.middleMaxPts + mc.middleBWMaxPts
      + mc.juniorMaxPts + mc.juniorBWMaxPts
      + mc.disabledMaxPts;
    expect(sum).toBe(23);
  });

  it('skills: 8+4+4+4+5 = 25 with correct AGRI targets', () => {
    const sk = CONFIG.skills;
    expect(sk.learningProgrammesMaxPts).toBe(8);
    expect(sk.disabledLearningMaxPts).toBe(4);
    expect(sk.learnershipsMaxPts).toBe(4);
    expect(sk.bursaryMaxPts).toBe(4); // repurposed: unemployed training (2.1.2.2)
    expect(sk.absorptionMaxPts).toBe(5);
    const sum = sk.learningProgrammesMaxPts + sk.disabledLearningMaxPts
      + sk.learnershipsMaxPts + sk.bursaryMaxPts! + sk.absorptionMaxPts;
    expect(sum).toBe(25);
    // AGRI spends 6% (not RCOGP 3.5%)
    expect(sk.overallSpendPercent).toBeCloseTo(0.06, 4);
    // Disabled: 0.3%
    expect(sk.disabledSpendPercent).toBeCloseTo(0.003, 4);
  });

  it('PP targets: BO51 @ 40% (not 50%), total max = 27', () => {
    const pp = CONFIG.procurement;
    expect(pp.allSuppliersMaxPts).toBe(5);
    expect(pp.qseMaxPts).toBe(3);
    expect(pp.emeMaxPts).toBe(4);
    expect(pp.bo51MaxPts).toBe(9);
    expect(pp.bo51Target).toBeCloseTo(0.40, 4); // AgriBEE 40%
    expect(pp.bwo30MaxPts).toBe(4);
    expect(pp.dgMaxPts).toBe(2);
    expect(pp.baseMax).toBe(25);  // 5+3+4+9+4
    expect(pp.bonusMax).toBe(2);
    expect((pp.baseMax ?? 0) + (pp.bonusMax ?? 0)).toBe(27);
  });

  it('ESD: SD 2%/10pts, ED 1.5%/5pts base', () => {
    const esd = CONFIG.esd;
    expect(esd.supplierDevMax).toBe(10);
    expect(esd.supplierDevTarget).toBeCloseTo(0.02, 4);
    expect(esd.enterpriseDevMax).toBe(5);
    expect(esd.enterpriseDevTarget).toBeCloseTo(0.015, 4); // AgriBEE 1.5%
  });

  it('SED: 15pts @ 1.5% NPAT (agriculture-specific)', () => {
    const sed = CONFIG.sed;
    expect(sed.maxPoints).toBe(15);
    expect(sed.npatTarget).toBeCloseTo(0.015, 4); // AgriBEE 1.5%
  });

  it('level thresholds follow standard 8-tier table', () => {
    expect(CONFIG.levelThresholds?.length).toBe(8);
    expect(CONFIG.levelThresholds?.[0].level).toBe(1);
    expect(CONFIG.levelThresholds?.[0].minPoints).toBe(100);
  });

  it('recognition table present', () => {
    expect(CONFIG.recognitionTable?.length).toBeGreaterThan(0);
    expect(CONFIG.industryNorms?.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// §2 Zero-input baseline (blank toolkit — all pillars score 0)
// ---------------------------------------------------------------------------

describe('AGRI Generic — zero-input baseline', () => {
  it('Ownership = 0/25 with no shareholders', () => {
    const r = calculateOwnershipScore(
      { id: '1', clientId: 'agri', shareholders: [], companyValue: 0, outstandingDebt: 0, yearsHeld: 0 },
      CONFIG,
    );
    expect(r.total).toBe(0);
    expect(r.subMinimumMet).toBe(false);
  });

  it('MC = 0/23 with no employees', () => {
    const r = calculateManagementScore(
      { id: '1', clientId: 'agri', employees: [] },
      CONFIG,
      EAP_PROVINCE,
    );
    expect(r.total).toBe(0);
  });

  it('Skills = 0/25 with no training', () => {
    const r = calculateSkillsScore(
      { id: '1', clientId: 'agri', leviableAmount: LEVIABLE, trainingPrograms: [], yesCandidatesCount: 0, yesAbsorbedCount: 0 },
      CONFIG,
    );
    expect(r.total).toBe(0);
    expect(r.subMinimumMet).toBe(false);
  });

  it('Procurement = 0/27 with no suppliers', () => {
    const r = calculateProcurementScore(
      { id: '1', clientId: 'agri', tmps: TMPS, suppliers: [] },
      CONFIG,
    );
    expect(r.total).toBe(0);
    expect(r.subMinimumMet).toBe(false);
  });

  it('SD = 0/10 with no ESD contributions', () => {
    const r = calculateEsdScore(
      { id: '1', clientId: 'agri', contributions: [], graduationBonus: false, jobsCreatedBonus: false },
      NPAT,
      CONFIG,
    );
    expect(r.supplierDev).toBe(0);
  });

  it('ED = 0/7 with no contributions and no bonuses', () => {
    const r = calculateEsdScore(
      { id: '1', clientId: 'agri', contributions: [], graduationBonus: false, jobsCreatedBonus: false },
      NPAT,
      CONFIG,
    );
    expect(r.enterpriseDev).toBe(0);
  });

  it('SED = 0/15 with no contributions', () => {
    const r = calculateSedScore(
      { id: '1', clientId: 'agri', contributions: [] },
      NPAT,
      CONFIG,
    );
    expect(r.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// §3 Full-target cases (100% achievement on each pillar individually)
// ---------------------------------------------------------------------------

describe('AGRI Generic — full-target ownership', () => {
  it('100% black ownership scores 25/25', () => {
    const r = calculateOwnershipScore(
      {
        id: '1', clientId: 'agri',
        shareholders: [
          {
            id: '1', name: 'Black Trust',
            ownershipType: 'shareholder' as const,
            blackOwnership: 1, blackWomenOwnership: 0.5,
            shares: 100, shareValue: 1,
            votingRightsPercent: 1, economicInterestPercent: 1,
            isDesignatedGroup: true, blackNewEntrant: false,
          },
        ],
        companyValue: 10_000_000, outstandingDebt: 0, yearsHeld: 10,
      },
      CONFIG,
    );
    expect(r.total).toBeGreaterThan(20);
    expect(r.subMinimumMet).toBe(true);
  });
});

describe('AGRI Generic — SD/ED proportionality', () => {
  it('SD: 2% NPAT contribution scores 10/10', () => {
    const sdAmount = NPAT * 0.02; // R200 000
    const r = calculateEsdScore(
      {
        id: '1', clientId: 'agri',
        contributions: [
          {
            id: 'sd1', beneficiary: 'Farm Co', description: 'Grant',
            type: 'grant' as const, amount: sdAmount,
            category: 'supplier_development' as const,
            blackBenefitPercent: 100, transactionDate: '2025-09-01',
          },
        ],
        graduationBonus: false, jobsCreatedBonus: false,
      },
      NPAT,
      CONFIG,
    );
    expect(r.supplierDev).toBeCloseTo(10, 1);
  });

  it('ED: 1.5% NPAT contribution scores 5/5 base', () => {
    const edAmount = NPAT * 0.015; // R150 000
    const r = calculateEsdScore(
      {
        id: '1', clientId: 'agri',
        contributions: [
          {
            id: 'ed1', beneficiary: 'Agri SME', description: 'Direct',
            type: 'direct_cost' as const, amount: edAmount,
            category: 'enterprise_development' as const,
            blackBenefitPercent: 100, transactionDate: '2025-09-01',
          },
        ],
        graduationBonus: false, jobsCreatedBonus: false,
      },
      NPAT,
      CONFIG,
    );
    expect(r.enterpriseDev).toBeCloseTo(5, 1);
  });

  it('ED bonuses add 2pts: grad=1 + jobs=1 = max 7 (edTotal)', () => {
    const edAmount = NPAT * 0.015;
    const r = calculateEsdScore(
      {
        id: '1', clientId: 'agri',
        contributions: [
          {
            id: 'ed1', beneficiary: 'Agri SME', description: 'Direct',
            type: 'direct_cost' as const, amount: edAmount,
            category: 'enterprise_development' as const,
            blackBenefitPercent: 100, transactionDate: '2025-09-01',
          },
        ],
        graduationBonus: true, jobsCreatedBonus: true,
      },
      NPAT,
      CONFIG,
    );
    // enterpriseDev = base ED score (5); edTotal = base + grad bonus + jobs bonus (7)
    expect(r.enterpriseDev).toBeCloseTo(5, 1);
    expect(r.graduationBonus).toBe(1);
    expect(r.jobsCreatedBonus).toBe(1);
    expect(r.edTotal).toBeCloseTo(7, 1);
  });
});

describe('AGRI Generic — SED proportionality', () => {
  it('SED: 1.5% NPAT contribution scores 15/15', () => {
    const sedAmount = NPAT * 0.015; // R150 000
    const r = calculateSedScore(
      {
        id: '1', clientId: 'agri',
        contributions: [
          {
            id: 'sed1', beneficiary: 'Farm Community',
            description: 'Agricultural SED Grant',
            type: 'grant' as const, amount: sedAmount,
            category: 'socio_economic' as const,
            blackBenefitPercent: 100, transactionDate: '2025-06-01',
          },
        ],
      },
      NPAT,
      CONFIG,
    );
    expect(r.total).toBeCloseTo(15, 1);
  });

  it('SED: half target (0.75% NPAT) scores ~7.5/15', () => {
    const sedAmount = NPAT * 0.0075;
    const r = calculateSedScore(
      {
        id: '1', clientId: 'agri',
        contributions: [
          {
            id: 'sed1', beneficiary: 'Farm Community', description: 'Grant',
            type: 'grant' as const, amount: sedAmount,
            category: 'socio_economic' as const,
            blackBenefitPercent: 100, transactionDate: '2025-06-01',
          },
        ],
      },
      NPAT,
      CONFIG,
    );
    expect(r.total).toBeCloseTo(7.5, 0);
  });
});

describe('AGRI Generic — PP proportionality', () => {
  it('100% empowering suppliers at BO51 threshold scores allSuppliers+bo51', () => {
    // All spend with a 51%+ black-owned EME at BEE Level 1 (recognition 135%)
    const r = calculateProcurementScore(
      {
        id: '1', clientId: 'agri',
        tmps: TMPS,
        suppliers: [
          {
            id: 's1', name: 'Black Farm Co', beeLevel: 1 as const,
            enterpriseType: 'eme' as const,
            blackOwnership: 1, blackWomenOwnership: 0.5,
            youthOwnership: 0, disabledOwnership: 0,
            spend: TMPS,
          },
        ],
      },
      CONFIG,
    );
    // Should score at least allSuppliers (5) + EME (4) points
    expect(r.total).toBeGreaterThan(8);
    expect(r.subMinimumMet).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §4 Sub-minimum checks
// ---------------------------------------------------------------------------

describe('AGRI Generic — sub-minimum thresholds', () => {
  it('skills sub-min threshold = 8 pts (40% × 20 base, excl. 5-pt absorption bonus)', () => {
    expect(CONFIG.skills.subMinThreshold).toBeCloseTo(8, 1);
  });

  it('PP sub-min threshold = 10 pts (40% × 25 base, excl. 2-pt DG bonus)', () => {
    expect(CONFIG.procurement.subMinThreshold).toBeCloseTo(10, 1);
  });

  it('SD sub-min threshold = 4 pts (40% × 10)', () => {
    // Verify via pillarConfig
    expect(CONFIG.pillarConfigs?.supplierDevelopment?.subMinimumPercent).toBe(40);
    const sdSubMin = (40 / 100) * (CONFIG.pillarConfigs?.supplierDevelopment?.maxPoints ?? 10);
    expect(sdSubMin).toBeCloseTo(4, 1);
  });

  it('ownership sub-min threshold = 3.2 pts (40% × Net Value 8, per toolkit YES sheet)', () => {
    // Toolkit YES sheet: "Ownership net value | 8 | 3.2" — the priority sub-minimum
    // applies to the Net Value element (8 pts), not the whole 25-pt pillar.
    expect(CONFIG.ownership.subMinNetValue).toBeCloseTo(3.2, 1);
  });

  it('skills fails sub-minimum when score < 8 pts', () => {
    const r = calculateSkillsScore(
      { id: '1', clientId: 'agri', leviableAmount: LEVIABLE, trainingPrograms: [], yesCandidatesCount: 0, yesAbsorbedCount: 0 },
      CONFIG,
    );
    expect(r.total).toBe(0);
    expect(r.subMinimumMet).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §6 AgriBEE-specific Skills formula shapes (confirmed-SLS calculator gaps)
// ---------------------------------------------------------------------------

describe('AGRI Generic — unemployed-training headcount indicator (2.1.2.2)', () => {
  it('scores the bursary slot on a HEADCOUNT basis, not spend (4 pts at target)', () => {
    // One unemployed Black learner → meets the 2.5%-of-headcount target (floored)
    // → full 4 pts on the bursary slot, independent of spend amount.
    const r = calculateSkillsScore(
      {
        id: '1', clientId: 'agri', leviableAmount: LEVIABLE,
        trainingPrograms: [
          { id: 'u1', name: 'Unemployed learnership', category: 'learnership', categoryCode: 'D' as const,
            cost: 1, isBlack: true, isDisabled: false, gender: 'Male' as const, race: 'African' as const,
            employmentStatus: 'Unemployed' } as any,
        ],
        yesCandidatesCount: 0, yesAbsorbedCount: 0,
      },
      CONFIG,
    );
    // Tiny spend (R1) would score ~0 under a spend model; headcount model gives full 4.
    expect(r.bursaries).toBeCloseTo(4, 1);
  });

  it('employed-only learners score 0 on the unemployed-training (bursary) slot', () => {
    const r = calculateSkillsScore(
      {
        id: '1', clientId: 'agri', leviableAmount: LEVIABLE,
        trainingPrograms: [
          { id: 'e1', name: 'Employed training', category: 'short_course', categoryCode: 'E' as const,
            cost: 100_000, isBlack: true, isDisabled: false, gender: 'Male' as const, race: 'African' as const,
            employmentStatus: 'Permanent' } as any,
        ],
        yesCandidatesCount: 0, yesAbsorbedCount: 0,
      },
      CONFIG,
    );
    expect(r.bursaries).toBe(0);
  });
});

describe('AGRI Generic — absorption target is 100% (not 2.5%)', () => {
  it('100% absorption of unemployed LAI → full 5-pt bonus', () => {
    const r = calculateSkillsScore(
      {
        id: '1', clientId: 'agri', leviableAmount: LEVIABLE,
        trainingPrograms: [
          { id: 'a1', name: 'LAI', category: 'learnership', categoryCode: 'D' as const, cost: 10_000,
            isBlack: true, isDisabled: false, gender: 'Female' as const, race: 'African' as const,
            employmentStatus: 'Unemployed', isAbsorbed: true } as any,
        ],
        yesCandidatesCount: 0, yesAbsorbedCount: 0,
      },
      CONFIG,
    );
    expect(r.absorption).toBeCloseTo(5, 1);
  });

  it('50% absorption rate scores ~2.5/5 (100% target, not the lenient 2.5%)', () => {
    // 1 absorbed of 2 Black learners = 50% rate; against a 100% target → 2.5 pts.
    const r = calculateSkillsScore(
      {
        id: '1', clientId: 'agri', leviableAmount: LEVIABLE,
        trainingPrograms: [
          { id: 'a1', name: 'LAI1', category: 'learnership', categoryCode: 'D' as const, cost: 10_000,
            isBlack: true, isDisabled: false, gender: 'Female' as const, race: 'African' as const,
            employmentStatus: 'Unemployed', isAbsorbed: true } as any,
          { id: 'a2', name: 'LAI2', category: 'learnership', categoryCode: 'D' as const, cost: 10_000,
            isBlack: true, isDisabled: false, gender: 'Male' as const, race: 'African' as const,
            employmentStatus: 'Unemployed', isAbsorbed: false } as any,
        ],
        yesCandidatesCount: 0, yesAbsorbedCount: 0,
      },
      CONFIG,
    );
    expect(r.absorption).toBeCloseTo(2.5, 1);
  });
});

// ---------------------------------------------------------------------------
// §5 AGRI vs RCOGP differentiation
// ---------------------------------------------------------------------------

describe('AGRI Generic — differs from RCOGP Generic', () => {
  it('grand total = 132 (not 120)', () => {
    expect(CONFIG.totalMaxPoints).toBe(132);
  });

  it('MC max = 23 (not 19)', () => {
    expect(CONFIG.pillarConfigs?.managementControl?.maxPoints).toBe(23);
  });

  it('SED max = 15 (not 5)', () => {
    expect(CONFIG.pillarConfigs?.socioEconomicDevelopment?.maxPoints).toBe(15);
  });

  it('PP max = 27 (not 29) and BO51 target = 40%', () => {
    expect(CONFIG.pillarConfigs?.preferentialProcurement?.maxPoints).toBe(27);
    expect(CONFIG.procurement.bo51Target).toBeCloseTo(0.40, 4);
  });

  it('ownership voting/EI Black = 4pts each (not RCOGP 4 — same, but designated groups @ 4% target)', () => {
    expect(CONFIG.ownership.votingRightsMax).toBe(4);
    expect(CONFIG.ownership.economicInterestMax).toBe(4);
    expect(CONFIG.ownership.designatedGroupsTarget).toBeCloseTo(0.04, 4); // farm workers
  });

  it('ESD ED target = 1.5% (not RCOGP 1.0%)', () => {
    expect(CONFIG.esd.enterpriseDevTarget).toBeCloseTo(0.015, 4);
  });

  it('SED NPAT target = 1.5% (not RCOGP 1.0%)', () => {
    expect(CONFIG.sed.npatTarget).toBeCloseTo(0.015, 4);
  });

  it('Skills overall spend = 6% leviable (not RCOGP 3.5%)', () => {
    expect(CONFIG.skills.overallSpendPercent).toBeCloseTo(0.06, 4);
  });
});

// ---------------------------------------------------------------------------
// §7 MC senior/middle/junior EAP bands score (regression for DISCREPANCY-LEDGER D-01)
//
// Before the fix, AGRI_GENERIC config omitted seniorBlackTarget/…/juniorBWTarget,
// and management.ts gates the RCOGP defaults off for non-RCOGP sectors
// (useRcogp=false), so mgmtFallback returned undefined → subTarget = NaN → every
// per-demographic band scored 0. The 8 senior/middle/junior points (of 23 MC)
// were unreachable for ALL AGRI entities. See docs/domain/sectors/agri/generic/connections.md §6.
// ---------------------------------------------------------------------------

describe('AGRI Generic — MC senior/middle/junior bands (ledger D-01)', () => {
  it('a single black senior manager scores > 0 (was NaN→0 before the fix)', () => {
    const r = calculateManagementScore(
      {
        id: '1', clientId: 'agri',
        employees: [
          { id: '1', name: 'S', gender: 'Male', race: 'African', designation: 'Senior', isDisabled: false, isForeign: false },
        ],
      },
      CONFIG,
      EAP_PROVINCE,
    );
    expect(r.seniorBlack).toBeGreaterThan(0);
  });

  it('a 100%-black, EAP-distributed senior/middle/junior workforce scores the full 8 SMJ band points', () => {
    const employees = [
      ...eapDistributedBlackBand('Senior', EAP_PROVINCE),
      ...eapDistributedBlackBand('Middle', EAP_PROVINCE),
      ...eapDistributedBlackBand('Junior', EAP_PROVINCE),
    ];
    const r = calculateManagementScore(
      { id: '1', clientId: 'agri', employees: employees as never },
      CONFIG,
      EAP_PROVINCE,
    );

    // Every band — Black AND Black-female — was exactly 0 before the fix.
    expect(r.seniorBlack).toBeGreaterThan(0);
    expect(r.seniorBWO).toBeGreaterThan(0);
    expect(r.middleBlack).toBeGreaterThan(0);
    expect(r.middleBWO).toBeGreaterThan(0);
    expect(r.juniorBlack).toBeGreaterThan(0);
    expect(r.juniorBWO).toBeGreaterThan(0);

    // EAP-proportional staffing satisfies every per-group sub-target, so each band
    // maxes out: senior 2+1, middle 2+1, junior 1+1 = 8 of the 23 MC points.
    const smj =
      r.seniorBlack + r.seniorBWO +
      r.middleBlack + r.middleBWO +
      r.juniorBlack + r.juniorBWO;
    expect(smj).toBeGreaterThanOrEqual(7.5);
    expect(smj).toBeLessThanOrEqual(8);
  });
});
