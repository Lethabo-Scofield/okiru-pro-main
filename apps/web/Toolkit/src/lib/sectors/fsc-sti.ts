/**
 * FSC Short-Term Insurers (FS703) — CalculatorConfig for Toolkit scoring.
 *
 * Key differences from FSC Generic (Others):
 * - Grand total: 132 pts (120 Others + 12 AFS)
 * - No Empowerment Financing (EF = N/A for STI per SLS §2)
 * - Standard SD/ED targets (same as Others: SD 2% NPAT, ED 1% NPAT + bonuses)
 * - AFS: 12 pts — Commercial Products (2 pts, 6 lines × 0.333) + Insurance Policies (100% / 10 pts)
 *
 * AFS evidence: "AFS Scorecard - Short Term" PDF (rendered 2026-06-01):
 *   Commercial Products: 6 lines (Equipment/Liability/Property/Agriculture/Livestock/Other), each 100% target
 *   Sub-total commercial = 2.00 pts; Insurance Policies = 10.00 pts; Grand-total = 12.00 ✓
 *
 * @see docs/domain/sectors/fsc/generic/sls.md §6.12, §12
 */
import {
  FSC_STI,
  type SectorConfig,
} from '../../../../../api/pipeline/sectorConfig';
import type { CalculatorConfig } from '../../../../shared/schema';
import { FSC_SKILLS_PER_LEVEL_TARGETS } from './fsc-generic';
import { normalizeFscSubSector } from './fsc-utils';

export const FSC_STI_SECTOR_CODE = 'FSC' as const;
export const FSC_STI_SCORECARD_TYPE = 'Generic' as const;
export const FSC_STI_SUB_SECTOR = 'STI' as const;

/** Convert FSC_STI SectorConfig → CalculatorConfig. */
export function sectorConfigToFscStiCalculatorConfig(sc: SectorConfig): CalculatorConfig {
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
  const pAfs = pc.accessToFinancialServices;

  const procBaseMax =
    pr.allSuppliersMaxPts + pr.qseMaxPts + pr.emeMaxPts + pr.bo51MaxPts + pr.bwo30MaxPts;

  const ownershipSubMin = pOwn.hasSubMinimum ? (pOwn.subMinimumPercent / 100) * own.netValueMaxPts : 3.2;
  const skillsSubMin = pSk.hasSubMinimum ? (pSk.subMinimumPercent / 100) * (pSk.maxPoints - (sk.absorptionMaxPts ?? 0)) : 8;
  const procSubMin = pPp.hasSubMinimum ? (pPp.subMinimumPercent / 100) * procBaseMax : 8;
  const sdSubMin = pSd.hasSubMinimum ? (pSd.subMinimumPercent / 100) * pSd.maxPoints : 4;

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
      otherExecBlackTarget: mc.otherExecBlackTarget,
      otherExecBlackMaxPts: mc.otherExecBlackMaxPts,
      otherExecBWTarget: mc.otherExecBWTarget,
      otherExecBWMaxPts: mc.otherExecBWMaxPts,
      seniorMaxPts: mc.seniorMaxPts ?? 0,
      seniorBWMaxPts: mc.seniorBWMaxPts ?? 0,
      middleMaxPts: mc.middleMaxPts ?? 0,
      middleBWMaxPts: mc.middleBWMaxPts ?? 0,
      juniorMaxPts: mc.juniorMaxPts ?? 0,
      juniorBWMaxPts: mc.juniorBWMaxPts ?? 0,
      disabledTarget: ee.disabledTarget,
      disabledMaxPts: ee.disabledMaxPts,
    },

    employmentEquity: { maxPoints: 0, disabledTarget: ee.disabledTarget, disabledMaxPts: ee.disabledMaxPts },

    skills: {
      generalMax: sk.learningProgrammesMaxPts,
      bursaryMax: sk.bursaryMaxPts,
      overallTarget: sk.overallSpendPercent / 100,
      bursaryTarget: sk.bursarySpendPercent / 100,
      subMinThreshold: skillsSubMin,
      overallSpendPercent: sk.overallSpendPercent / 100,
      bursarySpendPercent: sk.bursarySpendPercent / 100,
      disabledSpendPercent: sk.disabledSpendPercent / 100,
      categoryECap: catE?.cap,
      categoryFCap: catF?.cap,
      learningProgrammesMaxPts: sk.learningProgrammesMaxPts,
      bursaryMaxPts: sk.bursaryMaxPts,
      disabledLearningMaxPts: sk.disabledLearningMaxPts,
      learnershipsMaxPts: sk.learnershipsMaxPts,
      absorptionMaxPts: sk.absorptionMaxPts,
      learnershipTargetPercent: sk.learnershipTargetPercent,
      absorptionTargetPercent: sk.absorptionTargetPercent,  // R7: whole-percent; skills.ts single /100
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
      supplierDevTarget: esd.sdPercent / 100,    // 0.02 (2% NPAT — same as Others)
      enterpriseDevTarget: esd.edPercent / 100,  // 0.01 (1% NPAT — same as Others)
      edGraduationBonusMax: esd.edGraduationBonus,
      edJobsBonusMax: 1,
      edStockbrokerBonusMax: 2,
      edStockbrokerTarget: 0.005,
    },

    sed: {
      maxPoints: sed.maxPts,
      npatTarget: sed.spendPercent / 100,
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
      tier1Points: 1.5, tier2Points: 1, tier3Points: 0.5,
      tier1Multiplier: 2.0, tier2Multiplier: 1.5, tier3Multiplier: 1,
      headcountTarget5: 0.025, headcountTarget10: 0.015, headcountTarget15: 0.01,
      blackYouthPercent: 55,
    },

    discounting: { dropLevels: 1, maxDropLevel: 8 },

    recognitionTable: sc.recognitionTable.map((r) => ({ level: r.beeLevel, multiplier: r.multiplier })),
    levelThresholds: sc.levelThresholds.map((lt) => ({ level: lt.level, minPoints: lt.minPoints, recognition: lt.recognition })),

    pillarConfigs: {
      ownership: { maxPoints: pOwn.maxPoints, basePoints: pOwn.basePoints, subMinimumPercent: pOwn.subMinimumPercent },
      managementControl: { maxPoints: pMc.maxPoints, basePoints: pMc.basePoints, subMinimumPercent: pMc.subMinimumPercent ?? 0 },
      employmentEquity: { maxPoints: 0 },
      skillsDevelopment: { maxPoints: pSk.maxPoints, basePoints: pSk.basePoints, subMinimumPercent: pSk.subMinimumPercent },
      preferentialProcurement: { maxPoints: pPp.maxPoints, basePoints: pPp.basePoints, subMinimumPercent: pPp.subMinimumPercent },
      supplierDevelopment: { maxPoints: pSd.maxPoints, basePoints: pSd.basePoints, subMinimumPercent: pSd.subMinimumPercent },
      enterpriseDevelopment: { maxPoints: pEd.maxPoints, basePoints: pEd.basePoints, subMinimumPercent: pEd.subMinimumPercent ?? 0 },
      socioEconomicDevelopment: { maxPoints: pSed.maxPoints },
      yesInitiative: { maxPoints: pYes.maxPoints },
      empowermentFinancing: { maxPoints: 0 },
      accessToFinancialServices: { maxPoints: pAfs?.maxPoints ?? 0 },
    },

    /**
     * AFS Short-Term Insurers — 12 pts (verified from AFS Scorecard - Short Term PDF).
     * Commercial Products: 6 lines × 0.333 pts each = 2 pts total.
     * Insurance Policies: 100% target = 10 pts.
     */
    accessToFinancialServices: {
      subSector: 'STI',
      maxPoints: pAfs?.maxPoints ?? 12,
      commercialProductsMaxPts: 2,
      commercialLinesCount: 6,
      insurancePoliciesTarget: 1.0,
      insurancePoliciesMaxPts: 10,
    },

    benefitFactors: sc.benefitFactors.map((bf) => ({ type: bf.contributionType, factor: bf.sdFactor })),
    industryNorms: sc.industryNorms.map((n) => ({ name: n.industry, norm: String(n.normPercent) })),
  };
}

/** Complete FSC Short-Term Insurers (FS703) config. */
export const FSC_STI_CALCULATOR_CONFIG: CalculatorConfig =
  sectorConfigToFscStiCalculatorConfig(FSC_STI);

export { FSC_SKILLS_PER_LEVEL_TARGETS as FSC_STI_SKILLS_PER_LEVEL_TARGETS };

export function isFscStiSector(sectorCode: string, fscSubSector?: string): boolean {
  return sectorCode.toUpperCase() === 'FSC' && normalizeFscSubSector(fscSubSector) === 'STI';
}
