/**
 * RCOGP Generic — authoritative CalculatorConfig for Toolkit scoring.
 * Derived from apps/api/pipeline/sectorConfig.ts RCOGP_GENERIC (Excel v1.4).
 * Do not rely on API fallbacks or hardcoded ?? defaults for this sector.
 */
import {
  RCOGP_GENERIC,
  type SectorConfig,
} from '../../../../../api/pipeline/sectorConfig';
import type { CalculatorConfig } from '../../../../shared/schema';

export const RCOGP_GENERIC_SECTOR_CODE = 'RCOGP' as const;
export const RCOGP_GENERIC_SCORECARD_TYPE = 'Generic' as const;

/** Convert verified SectorConfig → CalculatorConfig (mirrors apps/api/src/routes/scorecard.ts). */
export function sectorConfigToCalculatorConfig(sc: SectorConfig): CalculatorConfig {
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
  const procBaseMax =
    pr.allSuppliersMaxPts +
    pr.qseMaxPts +
    pr.emeMaxPts +
    pr.bo51MaxPts +
    pr.bwo30MaxPts;

  // Priority-element sub-minimums are measured on BASE points per the toolkit YES
  // sheet (TOOLKIT-RESOLVED.md S1/S7): Skills excludes the absorption bonus, PP
  // excludes the designated-group bonus.
  const ownershipSubMin = pOwn.hasSubMinimum
    ? (pOwn.subMinimumPercent / 100) * own.netValueMaxPts
    : 3.2;
  const skillsSubMin = pSk.hasSubMinimum
    ? (pSk.subMinimumPercent / 100) * (pSk.maxPoints - (sk.absorptionMaxPts ?? 0))
    : 8;
  const procSubMin = pPp.hasSubMinimum
    ? (pPp.subMinimumPercent / 100) * procBaseMax
    : 10.8;
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
      seniorMaxPts: mc.seniorMaxPts,
      seniorBWMaxPts: mc.seniorBWMaxPts,
      middleMaxPts: mc.middleMaxPts,
      middleBWMaxPts: mc.middleBWMaxPts,
      juniorMaxPts: mc.juniorMaxPts,
      juniorBWMaxPts: mc.juniorBWMaxPts,
      disabledTarget: ee.disabledTarget,
      disabledMaxPts: ee.disabledMaxPts,
    },
    employmentEquity: {
      maxPoints: pEe.maxPoints,
      disabledTarget: ee.disabledTarget,
      disabledMaxPts: ee.disabledMaxPts,
    },
    skills: {
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
      enterpriseDevMax: esd.edMaxPts,
      supplierDevTarget: esd.sdPercent / 100,
      enterpriseDevTarget: esd.edPercent / 100,
      edGraduationBonusMax: esd.edGraduationBonus,
      edJobsBonusMax: esd.edJobsBonus,
    },
    sed: {
      maxPoints: sed.maxPts,
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

/** Complete RCOGP Generic config — use for scorecard, tests, and explicit sector wiring. */
export const RCOGP_GENERIC_CALCULATOR_CONFIG: CalculatorConfig =
  sectorConfigToCalculatorConfig(RCOGP_GENERIC);

export function isRcogpGenericSector(
  sectorCode: string,
  scorecardType: string,
): boolean {
  return (
    sectorCode.toUpperCase() === RCOGP_GENERIC_SECTOR_CODE &&
    scorecardType === RCOGP_GENERIC_SCORECARD_TYPE
  );
}
