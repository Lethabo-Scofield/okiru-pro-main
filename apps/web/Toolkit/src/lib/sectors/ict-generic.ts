/**
 * ICT Generic — authoritative CalculatorConfig for Toolkit scoring.
 *
 * Verified against: BBBEE Toolkit (ICT Generic)_Template_v.1.4.xlsx
 * Grand total: 140 pts (25 OWN + 23 MC + 25 SK + 27 PP + 10 SD + 18 ED + 12 SED)
 *
 * Key ICT differences from RCOGP Generic:
 * - Grand total 140 (not 120)
 * - MC = 23 pts (combined MC+EE; no separate EE pillar; includes senior/middle/junior bands)
 * - Skills = 25 pts: 8 pts all-spend @ 6%, no bursary, 4 pts disabled, 4 pts LAI +
 *   4 pts unemployed training, 5 pts absorption bonus
 * - PP = 27 pts: BO51 target 40% (not 50%), BO51 = 9 pts
 * - SD = 10 pts @ 2% NPAT (same as RCOGP)
 * - ED = 18 pts: 15 base @ 3% NPAT + 1 graduation + 2 jobs-bonus (current calculator
 *   gives max 17; ≥11% jobs tier = 2 pts not yet in engine — open gap)
 * - SED = 12 pts @ 1.5% NPAT "ICT Specific Initiatives"
 * - Level scale: L1=120, L2=115, L3=110, L4=100, L5=95, L6=90, L7=75, L8=55
 *
 * @see docs/domain/sectors/ict/generic/sls.md
 */
import {
  ICT_GENERIC,
  type SectorConfig,
} from '../../../../../api/pipeline/sectorConfig';
import type { CalculatorConfig } from '../../../../shared/schema';

export const ICT_GENERIC_SECTOR_CODE = 'ICT' as const;
export const ICT_GENERIC_SCORECARD_TYPE = 'Generic' as const;

/**
 * Convert verified ICT SectorConfig → CalculatorConfig.
 *
 * Mirrors the RCOGP Generic converter but handles ICT-specific field differences:
 * - No EE pillar (maxPoints=0)
 * - MC includes senior/middle/junior bands in the combined 23-pt total
 * - Skills overallSpendPercent = 6.0 (stored as percentage, not fraction)
 * - ED enterpriseDevTarget = 0.03 (3% NPAT)
 * - SED npatTarget = 0.015 (1.5% NPAT)
 */
export function ictSectorConfigToCalculatorConfig(sc: SectorConfig): CalculatorConfig {
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
  const pEe = pc.employmentEquity ?? { maxPoints: 0 };
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
  const ownershipSubMin = pOwn.hasSubMinimum
    ? (pOwn.subMinimumPercent / 100) * own.netValueMaxPts
    : 3.2;

  // Skills sub-min: 40% × base (excluding 5-pt absorption bonus) = 40% × 20 = 8
  const skillsSubMin = pSk.hasSubMinimum
    ? (pSk.subMinimumPercent / 100) * (pSk.maxPoints - (sk.absorptionMaxPts ?? 0))
    : 8;

  // PP sub-min: 40% × base (excluding 2-pt DG bonus) = 40% × 25 = 10
  const procSubMin = pPp.hasSubMinimum
    ? (pPp.subMinimumPercent / 100) * (pPp.maxPoints - (pr.dgMaxPts ?? 0))
    : 10;

  const sdSubMin = pSd.hasSubMinimum
    ? (pSd.subMinimumPercent / 100) * pSd.maxPoints
    : 4;

  // PP base excludes DG bonus: 5+3+4+9+4 = 25
  const procBaseMax =
    pr.allSuppliersMaxPts +
    pr.qseMaxPts +
    pr.emeMaxPts +
    pr.bo51MaxPts +
    pr.bwo30MaxPts;

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
      newEntrantsMax: own.newEntrantsMaxPts,
      designatedGroupsMax: own.economicInterestDesignatedGroupMaxPts ?? 3,
      designatedGroupsTarget: own.economicInterestDesignatedGroupTarget ?? 0.03,
    },
    management: {
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
      subMinimumPercent: pMc.subMinimumPercent,
      boardBlackTarget: mc.boardBlackTarget,
      boardBlackMaxPts: mc.boardBlackMaxPts,
      boardBWTarget: mc.boardBWTarget,
      boardBWMaxPts: mc.boardBWMaxPts,
      execBlackTarget: mc.execBlackTarget,
      execBlackMaxPts: mc.execBlackMaxPts,
      execBWTarget: mc.execBWTarget,
      execBWMaxPts: mc.execBWMaxPts,
      otherExecBlackTarget: mc.otherExecBlackTarget,
      otherExecBlackMaxPts: mc.otherExecBlackMaxPts,
      otherExecBWTarget: mc.otherExecBWTarget,
      otherExecBWMaxPts: mc.otherExecBWMaxPts,
      // ICT: senior/middle/junior bands are part of the combined 23-pt MC+EE total
      seniorMaxPts: mc.seniorMaxPts,
      seniorBWMaxPts: mc.seniorBWMaxPts,
      middleMaxPts: mc.middleMaxPts,
      middleBWMaxPts: mc.middleBWMaxPts,
      juniorMaxPts: mc.juniorMaxPts,
      juniorBWMaxPts: mc.juniorBWMaxPts,
      disabledTarget: ee.disabledTarget,
      disabledMaxPts: ee.disabledMaxPts,
    },
    // ICT: no separate EE pillar (MC+EE combined at 23)
    employmentEquity: {
      maxPoints: pEe.maxPoints, // 0
      disabledTarget: ee.disabledTarget,
      disabledMaxPts: ee.disabledMaxPts,
    },
    skills: {
      // ICT Skills mapping:
      // generalMax → 2.1.1.1 all-spend Black (8 pts, 6% leviable)
      // bursaryMax → 0 (no separate bursary in ICT)
      // disabledLearningMaxPts → 2.1.1.2 disabled Black (4 pts, 0.3% leviable)
      // learnershipsMaxPts → 2.1.2.1 LAI + 2.1.2.2 unemployed training (4+4=8 pts, 2.5% headcount each)
      // absorptionMaxPts → 2.1.3 absorption bonus (5 pts)
      generalMax: sk.learningProgrammesMaxPts,
      bursaryMax: sk.bursaryMaxPts,
      overallTarget: sk.overallSpendPercent,
      bursaryTarget: sk.bursarySpendPercent,
      subMinThreshold: skillsSubMin,
      overallSpendPercent: sk.overallSpendPercent,
      bursarySpendPercent: sk.bursarySpendPercent,
      disabledSpendPercent: sk.disabledSpendPercent,
      categoryECap: catE?.cap,
      categoryFCap: catF?.cap,
      learningProgrammesMaxPts: sk.learningProgrammesMaxPts,
      bursaryMaxPts: sk.bursaryMaxPts,
      disabledLearningMaxPts: sk.disabledLearningMaxPts,
      learnershipsMaxPts: sk.learnershipsMaxPts,
      absorptionMaxPts: sk.absorptionMaxPts,
      learnershipTargetPercent: sk.learnershipTargetPercent,
      absorptionTargetPercent: sk.absorptionTargetPercent,
    },
    procurement: {
      baseMax: procBaseMax,
      bonusMax: pr.dgMaxPts,
      tmpsTarget: 0,
      subMinThreshold: procSubMin,
      // ICT: BO51 threshold = 40% (not 50%)
      blackOwnedThreshold: pr.bo51Target,
      blackWomenThreshold: pr.bwo30Target,
      allSuppliersTarget: pr.allSuppliersTarget,
      allSuppliersMaxPts: pr.allSuppliersMaxPts,
      qseTarget: pr.qseTarget,
      qseMaxPts: pr.qseMaxPts,
      emeTarget: pr.emeTarget,
      emeMaxPts: pr.emeMaxPts,
      bo51Target: pr.bo51Target,
      bo51MaxPts: pr.bo51MaxPts,
      bwo30Target: pr.bwo30Target,
      bwo30MaxPts: pr.bwo30MaxPts,
      dgTarget: pr.dgTarget,
      dgMaxPts: pr.dgMaxPts,
    },
    esd: {
      supplierDevMax: esd.sdMaxPts,
      // ICT: ED base = 15 pts; bonuses bring the pillar to 18 (15 + 1 grad + 2 jobs≥11%)
      enterpriseDevMax: esd.edMaxPts,
      supplierDevTarget: esd.sdPercent / 100,
      // ICT: ED target = 3% NPAT (not 1% as in RCOGP)
      enterpriseDevTarget: esd.edPercent / 100,
      edGraduationBonusMax: esd.edGraduationBonus, // 1
      // ICT two-tier jobs bonus: ≤10% → 1pt, ≥11% → 2pts (edJobsBonus = 2)
      edJobsBonusMax: esd.edJobsBonus,             // 2
    },
    sed: {
      maxPoints: sed.maxPts,
      // ICT: SED target = 1.5% NPAT (not 1%)
      npatTarget: sed.spendPercent / 100,
    },
    yes: {
      tier1Points: 1.5,
      tier2Points: 1,
      tier3Points: 0.5,
      tier1Multiplier: 2.5,
      tier2Multiplier: 1.5,
      tier3Multiplier: 1,
      headcountTarget5: 0.025,
      headcountTarget10: 0.015,
      headcountTarget15: 0.01,
      blackYouthPercent: 0.55,
    },
    discounting: { dropLevels: 1, maxDropLevel: 8 },
    recognitionTable: sc.recognitionTable.map((r) => ({
      level: r.beeLevel,
      multiplier: r.multiplier,
    })),
    levelThresholds: sc.levelThresholds.map((lt) => ({
      level: lt.level,
      minPoints: lt.minPoints,
      recognition: lt.recognition,
    })),
    pillarConfigs: {
      ownership: {
        maxPoints: pOwn.maxPoints,
        subMinimumPercent: pOwn.subMinimumPercent,
      },
      managementControl: {
        maxPoints: pMc.maxPoints,
        subMinimumPercent: pMc.subMinimumPercent,
      },
      // ICT: EE merged into MC; maxPoints = 0 suppresses separate EE row in UI
      employmentEquity: { maxPoints: pEe.maxPoints },
      skillsDevelopment: {
        maxPoints: pSk.maxPoints,
        subMinimumPercent: pSk.subMinimumPercent,
      },
      preferentialProcurement: {
        maxPoints: pPp.maxPoints,
        subMinimumPercent: pPp.subMinimumPercent,
      },
      supplierDevelopment: {
        maxPoints: pSd.maxPoints,
        subMinimumPercent: pSd.subMinimumPercent,
      },
      enterpriseDevelopment: {
        maxPoints: pEd.maxPoints,
        subMinimumPercent: pEd.subMinimumPercent,
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

/** Complete ICT Generic config — zero RCOGP fallbacks, use for scorecard, tests, and sector wiring. */
export const ICT_GENERIC_CALCULATOR_CONFIG: CalculatorConfig =
  ictSectorConfigToCalculatorConfig(ICT_GENERIC);

export function isIctGenericSector(
  sectorCode: string,
  scorecardType: string,
): boolean {
  return (
    sectorCode.toUpperCase() === ICT_GENERIC_SECTOR_CODE &&
    scorecardType === ICT_GENERIC_SCORECARD_TYPE
  );
}
