/**
 * FSC Generic (Others sub-sector) — authoritative CalculatorConfig for Toolkit scoring.
 * Derived from apps/api/pipeline/sectorConfig.ts FSC_GENERIC (Excel v1.0).
 *
 * Key FSC Generic (Others) differences from RCOGP Generic:
 * - Grand total: 120 (same nominal total, but scaled level thresholds)
 * - MC: 21 pts — Other Executive Management carries 10+4 = 14 pts;
 *   Senior/Middle/Junior = 0 pts ("Not Available"); board 2+1; exec 2+1; disabled 1.
 * - Skills: 23 pts — per-management-level targets (Senior 2, Middle 2, Junior 3,
 *   Non-mgmt 4, Unemployed 4, Disabled 1, LAI 4, Absorption bonus 3).
 *   NOTE: calculateSkillsScore uses a single-rate model; per-level rates are approximated.
 * - PP: 24 pts — QSE 18%, EME 12%, BO51 30%, BWO30 10% (all different from RCOGP);
 *   3 bonus row types (intermediated + stockbrokers + DG) capped at 4 pts bonus.
 * - SD: 10 pts / 2% NPAT (same as RCOGP)
 * - ED: 9 pts — 5 base + 1 grad + 1 jobs + 2 stockbrokers bonus
 * - SED+CE: 8 pts — SED 3 pts (0.6% NPAT) + CE 2 pts (0.4% NPAT) + 3 bonus
 * - Level thresholds: scaled non-integer (L1=95.5 … L8=38.2)
 * - Empowerment Financing: N/A for Others sub-sector
 * - Access to Financial Services: N/A for Others sub-sector
 *
 * TODO (Bug #6): Banks (FS701), Long-Term Insurers (FS702), Short-Term Insurers (FS703)
 * sub-variants require a sub-sector picker UI + separate SectorConfig entries.
 * Implement fsc-banks.ts, fsc-lti.ts, fsc-sti.ts when the sub-sector picker is built.
 *
 * @see docs/domain/sectors/fsc/generic/sls.md
 */
import {
  FSC_GENERIC,
  type SectorConfig,
} from '../../../../../api/pipeline/sectorConfig';
import type { CalculatorConfig } from '../../../../shared/schema';

export const FSC_GENERIC_SECTOR_CODE = 'FSC' as const;
export const FSC_GENERIC_SCORECARD_TYPE = 'Generic' as const;

/**
 * FSC Skills per-management-level targets (confirmed SLS §6.3 / TOOLKIT-RESOLVED.md
 * Q39, Q40). Each management band has its own spend target as a percentage of the
 * leviable amount APPLICABLE TO THAT LEVEL, plus an African sub-indicator scored
 * against the provincial EAP-derived African target.
 *
 * The aggregate `calculateSkillsScore` model maps the four managed-level Black +
 * Black-women sub-totals onto the single `learningProgrammesMaxPts` (11 pts). Full
 * per-level / African computation requires the per-trainee management band and an
 * EAP-African target on each `TrainingProgram`, which are not present in the current
 * Toolkit input model (owned by the workbook/import worker). These verified targets
 * are encoded here as the authoritative reference for that future wiring.
 */
export const FSC_SKILLS_PER_LEVEL_TARGETS = {
  seniorExec: { subTotalPts: 2, blackTargetPct: 0.02, blackPts: 1, blackWomenTargetPct: 0.01, blackWomenPts: 0.5, africanPts: 0.5 },
  middle: { subTotalPts: 2, blackTargetPct: 0.03, blackPts: 1, blackWomenTargetPct: 0.015, blackWomenPts: 0.5, africanPts: 0.5 },
  junior: { subTotalPts: 3, blackTargetPct: 0.05, blackPts: 1, blackWomenTargetPct: 0.025, blackWomenPts: 1, africanPts: 1 },
  nonManagement: { subTotalPts: 4, blackTargetPct: 0.08, blackPts: 2, blackWomenTargetPct: 0.04, blackWomenPts: 1, africanPts: 1 },
  /** African sub-indicators (2.x.3) use the provincial EAP-derived African target, not a fixed %. */
  africanTargetSource: 'EAP Targets [Africans]' as const,
} as const;

/** Convert verified FSC Generic SectorConfig → CalculatorConfig. */
export function sectorConfigToFscCalculatorConfig(sc: SectorConfig): CalculatorConfig {
  const t = sc.targets;
  const own = t.ownership;
  const mc = t.managementControl;
  const ee = t.employmentEquity;
  const sk = t.skills;
  const pr = t.procurement;
  const esd = t.esd;
  const sed = t.sed;
  const pc = sc.pillarConfigs;

  const pOwn = pc.ownership;
  const pMc = pc.managementControl;
  const pSk = pc.skillsDevelopment;
  const pPp = pc.preferentialProcurement;
  const pSd = pc.supplierDevelopment;
  const pEd = pc.enterpriseDevelopment;
  const pSed = pc.socioEconomicDevelopment;
  const pYes = pc.yesInitiative ?? { maxPoints: 0 };

  // Ownership priority sub-minimum applies to the NET VALUE element only (8 pts),
  // not the whole 25-pt pillar. Verified: every toolkit YES sheet shows
  // "Ownership net value | 8 | 3.2" (40% × 8). The ownership calculator compares
  // net-value points (max 8) against this threshold, so 40% × 25 = 10 was
  // mathematically unreachable. (TOOLKIT-RESOLVED.md Q2)
  // FSC PP base = allSuppliers(5) + qse(3) + eme(2) + bo51(7) + bwo30(3) = 20; bonus = 4
  const procBaseMax =
    pr.allSuppliersMaxPts +
    pr.qseMaxPts +
    pr.emeMaxPts +
    pr.bo51MaxPts +
    pr.bwo30MaxPts;

  // Sub-minimums on BASE points (TOOLKIT-RESOLVED.md S1/S7/Q41/Q45): Skills excludes
  // the 3-pt absorption bonus (40% × 20 = 8), PP excludes the 4-pt bonus rows
  // (40% × 20 = 8).
  const ownershipSubMin = pOwn.hasSubMinimum
    ? (pOwn.subMinimumPercent / 100) * own.netValueMaxPts
    : 3.2;
  const skillsSubMin = pSk.hasSubMinimum
    ? (pSk.subMinimumPercent / 100) * (pSk.maxPoints - (sk.absorptionMaxPts ?? 0))
    : 8;
  const procSubMin = pPp.hasSubMinimum
    ? (pPp.subMinimumPercent / 100) * procBaseMax
    : 8;
  const sdSubMin = pSd.hasSubMinimum
    ? (pSd.subMinimumPercent / 100) * pSd.maxPoints
    : 4;

  const cw = sc.categoryWeightings ?? [];
  const catE = cw.find((c) => c.code === 'E');
  const catF = cw.find((c) => c.code === 'F');

  return {
    sectorCode: sc.sectorCode,
    scorecardType: sc.scorecardType,
    totalMaxPoints: sc.totalMaxPoints,

    ownership: {
      votingRightsMax: own.votingRightsMaxPts,
      womenBonusMax: own.womenVotingMaxPts,
      economicInterestMax: own.economicInterestMaxPts,
      netValueMax: own.netValueMaxPts,
      targetEconomicInterest: own.economicInterestTarget,
      subMinNetValue: ownershipSubMin,
      votingRightsTarget: own.votingRightsTarget,
      womenVotingTarget: own.womenVotingTarget,
      womenEIMax: own.womenEIMaxPts,
      womenEITarget: own.womenEITarget,
      newEntrantsMax: own.newEntrantsMaxPts ?? 2,
      designatedGroupsMax: own.economicInterestDesignatedGroupMaxPts ?? 3,
      designatedGroupsTarget: own.economicInterestDesignatedGroupTarget ?? 0.03,
    },

    management: {
      // FSC: Other Executive Management band carries the bulk of points (10+4 pts at 75%/38%).
      // Board and Executive Director bands are standard (2+1, 2+1).
      // Senior/Middle/Junior bands score 0 pts ("Not Available" in FSC).
      boardBlackTarget: mc.boardBlackTarget,
      boardBlackPoints: mc.boardBlackMaxPts,
      boardWomenTarget: mc.boardBWTarget,
      boardWomenPoints: mc.boardBWMaxPts,
      execBlackTarget: mc.execBlackTarget,
      execBlackPoints: mc.execBlackMaxPts,
      execWomenTarget: mc.execBWTarget,
      execWomenPoints: mc.execBWMaxPts,
      disabledTarget: ee.disabledTarget,
      execBWTarget: mc.execBWTarget,
      execBWMaxPts: mc.execBWMaxPts,
    },

    managementControl: {
      maxPoints: pMc.maxPoints,
      subMinimumPercent: pMc.subMinimumPercent ?? 0,
      boardBlackTarget: mc.boardBlackTarget,
      boardBlackMaxPts: mc.boardBlackMaxPts,
      boardBWTarget: mc.boardBWTarget,
      boardBWMaxPts: mc.boardBWMaxPts,
      execBlackTarget: mc.execBlackTarget,
      execBlackMaxPts: mc.execBlackMaxPts,
      execBWTarget: mc.execBWTarget,
      execBWMaxPts: mc.execBWMaxPts,
      // FSC Other Executive Management: 75% target / 10 pts Black, 38% / 4 pts BWO
      otherExecBlackTarget: mc.otherExecBlackTarget,    // 0.75
      otherExecBlackMaxPts: mc.otherExecBlackMaxPts,   // 10
      otherExecBWTarget: mc.otherExecBWTarget,          // 0.38
      otherExecBWMaxPts: mc.otherExecBWMaxPts,          // 4
      // FSC: Senior/Middle/Junior = 0 pts ("Not Available")
      seniorMaxPts: mc.seniorMaxPts ?? 0,
      seniorBWMaxPts: mc.seniorBWMaxPts ?? 0,
      middleMaxPts: mc.middleMaxPts ?? 0,
      middleBWMaxPts: mc.middleBWMaxPts ?? 0,
      juniorMaxPts: mc.juniorMaxPts ?? 0,
      juniorBWMaxPts: mc.juniorBWMaxPts ?? 0,
      // FSC disabled: 1 pt (NOT 0 or 2)
      disabledTarget: ee.disabledTarget,
      disabledMaxPts: ee.disabledMaxPts,
    },

    // FSC has no separate Employment Equity pillar; merged into MC above.
    employmentEquity: {
      maxPoints: 0,
      disabledTarget: ee.disabledTarget,
      disabledMaxPts: ee.disabledMaxPts,
    },

    skills: {
      // FSC uses per-management-level spend targets (not a single aggregate rate).
      // The calculator approximates this using the standard RCOGP model.
      // learningProgrammesMaxPts = managed-levels sub-total (11 pts: Senior+Middle+Junior+Non-mgmt).
      // bursaryMaxPts = unemployed Black people spend (4 pts, 1.5% leviable).
      // NOTE: overallSpendPercent / bursarySpendPercent are approximations only;
      // true FSC scoring requires per-level payroll breakdowns not available in current schema.
      generalMax: sk.learningProgrammesMaxPts,        // 11
      bursaryMax: sk.bursaryMaxPts,                   // 4 (unemployed)
      overallTarget: sk.overallSpendPercent / 100,    // ~0.035 (approximation)
      bursaryTarget: sk.bursarySpendPercent / 100,    // 0.015 (1.5% leviable)
      subMinThreshold: skillsSubMin,                  // R13: 8.0 pts = 40% × 20 base (maxPoints 23 − 3-pt absorption bonus); the old "9.2 (40%×23)" wrongly counted the bonus in the base
      overallSpendPercent: sk.overallSpendPercent / 100,
      bursarySpendPercent: sk.bursarySpendPercent / 100,
      disabledSpendPercent: sk.disabledSpendPercent / 100,  // 0.003 (0.3% leviable)
      categoryECap: catE?.cap,
      categoryFCap: catF?.cap,
      learningProgrammesMaxPts: sk.learningProgrammesMaxPts,  // 11
      bursaryMaxPts: sk.bursaryMaxPts,                        // 4
      disabledLearningMaxPts: sk.disabledLearningMaxPts,      // 1
      learnershipsMaxPts: sk.learnershipsMaxPts,              // 4 (LAI headcount 5%)
      absorptionMaxPts: sk.absorptionMaxPts,                  // 3 (bonus)
      learnershipTargetPercent: sk.learnershipTargetPercent,  // 5.0
      absorptionTargetPercent: sk.absorptionTargetPercent,  // R7: whole-percent (100); skills.ts single /100 → 1.0 = 100%
    },

    procurement: {
      baseMax: procBaseMax,                   // 20 (base rows only)
      bonusMax: pr.dgMaxPts,                  // 4 (combined bonus rows)
      tmpsTarget: 0,
      subMinThreshold: procSubMin,            // 9.6 pts (40% × 24)
      // FSC-specific targets (different from RCOGP):
      blackOwnedThreshold: pr.bo51Target,     // 0.30 (30% — not RCOGP's 50%)
      blackWomenThreshold: pr.bwo30Target,    // 0.10 (10% — not RCOGP's 12%)
      allSuppliersTarget: pr.allSuppliersTarget,  // 0.80
      allSuppliersMaxPts: pr.allSuppliersMaxPts,  // 5
      qseTarget: pr.qseTarget,                // 0.18 (18% — not RCOGP's 15%)
      qseMaxPts: pr.qseMaxPts,                // 3
      emeTarget: pr.emeTarget,                // 0.12 (12% — not RCOGP's 15%)
      emeMaxPts: pr.emeMaxPts,                // 2
      bo51Target: pr.bo51Target,              // 0.30
      bo51MaxPts: pr.bo51MaxPts,              // 7
      bwo30Target: pr.bwo30Target,            // 0.10
      bwo30MaxPts: pr.bwo30MaxPts,            // 3
      // dgMaxPts combines 3 FSC bonus rows: intermediated (2) + stockbrokers (2) + DG (2) → capped at 4
      dgTarget: pr.dgTarget,                  // 0.02
      dgMaxPts: pr.dgMaxPts,                  // 4
    },

    esd: {
      supplierDevMax: esd.sdMaxPts,                   // 10
      enterpriseDevMax: esd.edMaxPts,                 // 5 (base); pillar total 9 incl bonuses
      supplierDevTarget: esd.sdPercent / 100,         // 0.02
      enterpriseDevTarget: esd.edPercent / 100,       // 0.01
      edGraduationBonusMax: esd.edGraduationBonus,    // 1
      // FSC ED bonuses are split into 1-pt jobs + a SEPARATE 2-pt stockbroker slot
      // (0.5% NPAT). The shared config keeps edJobsBonus=3 as the API's combined
      // jobs+stockbroker value; the Toolkit models them as distinct indicators.
      // (TOOLKIT-RESOLVED.md Q42; FSC ESD Scorecard r12.)
      edJobsBonusMax: 1,
      edStockbrokerBonusMax: 2,
      edStockbrokerTarget: 0.005,
    },

    sed: {
      // FSC SED+CE: SED rows (3 pts @ 0.6%) + CE meta (2 @ 0.4%) + bonuses.
      maxPoints: sed.maxPts,                          // 8
      npatTarget: sed.spendPercent / 100,             // 0.01 combined reference
      sedBaseMaxPts: 3,
      sedNpatTarget: 0.006,
      ceMaxPts: 2,
      ceNpatTarget: 0.004,
      ceBonusMaxPts: 1,
      ceBonusNpatTarget: 0.001,
      fundisaMaxPts: 2,
      fundisaNpatTarget: 0.002,
    },

    yes: {
      tier1Points: 1.5,
      tier2Points: 1,
      tier3Points: 0.5,
      tier1Multiplier: 2.0,
      tier2Multiplier: 1.5,
      tier3Multiplier: 1,
      headcountTarget5: 0.025,
      headcountTarget10: 0.015,
      headcountTarget15: 0.01,
      blackYouthPercent: 55,
    },

    discounting: { dropLevels: 1, maxDropLevel: 8 },

    recognitionTable: sc.recognitionTable.map((r) => ({
      level: r.beeLevel,
      multiplier: r.multiplier,
    })),

    // FSC uses scaled non-integer level thresholds (not standard RCOGP 100/95/90/80/75/70/55/40)
    levelThresholds: sc.levelThresholds.map((lt) => ({
      level: lt.level,
      minPoints: lt.minPoints,
      recognition: lt.recognition,
    })),

    pillarConfigs: {
      ownership: {
        maxPoints: pOwn.maxPoints, basePoints: pOwn.basePoints,
        subMinimumPercent: pOwn.subMinimumPercent,
      },
      managementControl: {
        maxPoints: pMc.maxPoints, basePoints: pMc.basePoints,
        subMinimumPercent: pMc.subMinimumPercent ?? 0,
      },
      employmentEquity: { maxPoints: 0 },
      skillsDevelopment: {
        maxPoints: pSk.maxPoints, basePoints: pSk.basePoints,
        subMinimumPercent: pSk.subMinimumPercent,
      },
      preferentialProcurement: {
        maxPoints: pPp.maxPoints, basePoints: pPp.basePoints,
        subMinimumPercent: pPp.subMinimumPercent,
      },
      supplierDevelopment: {
        maxPoints: pSd.maxPoints, basePoints: pSd.basePoints,
        subMinimumPercent: pSd.subMinimumPercent,
      },
      enterpriseDevelopment: {
        maxPoints: pEd.maxPoints, basePoints: pEd.basePoints,
        subMinimumPercent: pEd.subMinimumPercent ?? 0,
      },
      socioEconomicDevelopment: { maxPoints: pSed.maxPoints },
      yesInitiative: { maxPoints: pYes.maxPoints },
    },

    benefitFactors: sc.benefitFactors.map((bf) => ({
      type: bf.contributionType,
      factor: bf.sdFactor,
    })),

    industryNorms: sc.industryNorms.map((n) => ({
      name: n.industry,
      norm: String(n.normPercent),
    })),
  };
}

/** Complete FSC Generic (Others) config — use for scorecard, tests, and explicit sector wiring. */
export const FSC_GENERIC_CALCULATOR_CONFIG: CalculatorConfig =
  sectorConfigToFscCalculatorConfig(FSC_GENERIC);

export function isFscGenericSector(
  sectorCode: string,
  scorecardType: string,
): boolean {
  return (
    sectorCode.toUpperCase() === FSC_GENERIC_SECTOR_CODE &&
    scorecardType === FSC_GENERIC_SCORECARD_TYPE
  );
}
