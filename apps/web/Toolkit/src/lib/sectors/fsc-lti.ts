/**
 * FSC Long-Term Insurers (FS702) — CalculatorConfig for Toolkit scoring.
 *
 * Key differences from FSC Generic (Others):
 * - Grand total: 132 pts (120 Others + 12 AFS)
 * - Empowerment Financing pillar: EF Targeted Investments + Transaction Financing (0 pts Q44)
 * - SD target: 1.8% NPAT (vs 2% Others)
 * - ED target: 0.2% NPAT (vs 1% Others); plus stockbroker bonus (0.5% NPAT / 2 pts)
 * - AFS: 12 pts — Appropriate Products (3 pts) + Market Penetration (7 pts) + Transactional Access (80% / 2 pts)
 *
 * EF evidence: "EF & ESD Scorecard - Long Term" PDF (rendered 2026-06-01):
 *   Applicable Sub-Sector Codes = Others → all EF point cells = 0.
 *   SD 1.80%, ED 0.20%, ED stockbrokers 0.50% (confirmed % targets).
 *   EF Targeted Investments and Transaction Financing points not available (Q44).
 *
 * AFS evidence: "AFS Scorecard - Long Term" PDF (rendered 2026-06-01):
 *   Appropriate Products: 3 pts (ratio of compliant/total products)
 *   Market Penetration: 7 pts (on-book policies / SAIA communicated)
 *   Transactional Accesses: 80% target / 2 pts
 *   Total = 12 ✓
 *
 * @see docs/domain/sectors/fsc/generic/sls.md §6.9, §6.11, §12
 */
import {
  FSC_LTI,
  type SectorConfig,
} from '../../../../../api/pipeline/sectorConfig';
import type { CalculatorConfig } from '../../../../shared/schema';
import { FSC_SKILLS_PER_LEVEL_TARGETS } from './fsc-generic';
import { normalizeFscSubSector } from './fsc-utils';

export const FSC_LTI_SECTOR_CODE = 'FSC' as const;
export const FSC_LTI_SCORECARD_TYPE = 'Generic' as const;
export const FSC_LTI_SUB_SECTOR = 'LTI' as const;

/** Convert FSC_LTI SectorConfig → CalculatorConfig. */
export function sectorConfigToFscLtiCalculatorConfig(sc: SectorConfig): CalculatorConfig {
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
  const pEf = pc.empowermentFinancing;
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
      alwaysPassSubMin: true,
    },

    esd: {
      supplierDevMax: esd.sdMaxPts,            // 10
      enterpriseDevMax: esd.edMaxPts,          // 5 base
      supplierDevTarget: esd.sdPercent / 100,  // 0.018 (1.8% NPAT)
      enterpriseDevTarget: esd.edPercent / 100, // 0.002 (0.2% NPAT)
      edGraduationBonusMax: esd.edGraduationBonus,
      edJobsBonusMax: 1,
      // LTI stockbroker bonus (0.5% NPAT / 2 pts) — from EF&ESD Long Term sheet
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
      ownership: { maxPoints: pOwn.maxPoints, subMinimumPercent: pOwn.subMinimumPercent },
      managementControl: { maxPoints: pMc.maxPoints, subMinimumPercent: pMc.subMinimumPercent ?? 0 },
      employmentEquity: { maxPoints: 0 },
      skillsDevelopment: { maxPoints: pSk.maxPoints, subMinimumPercent: pSk.subMinimumPercent },
      preferentialProcurement: { maxPoints: pPp.maxPoints, subMinimumPercent: pPp.subMinimumPercent },
      supplierDevelopment: { maxPoints: pSd.maxPoints, subMinimumPercent: pSd.subMinimumPercent },
      enterpriseDevelopment: { maxPoints: pEd.maxPoints, subMinimumPercent: pEd.subMinimumPercent ?? 0 },
      socioEconomicDevelopment: { maxPoints: pSed.maxPoints },
      yesInitiative: { maxPoints: pYes.maxPoints },
      empowermentFinancing: { maxPoints: pEf?.maxPoints ?? 0 },
      accessToFinancialServices: { maxPoints: pAfs?.maxPoints ?? 0 },
    },

    /**
     * Empowerment Financing config for LTI (Q44 RESOLVED 2026-07-05).
     * The old 0-pts placeholder was the template's default-"Others" formula
     * artifact. The Long-Term sheet pins: Targeted Investments 12 (C13,
     * FSC_Generic.md L16020) + Transaction Financing 3 (C14, L16030).
     * SD 7 @ 1.8% NPAT (C16), ED 3 base @ 0.2% (C18) and the stockbroker bonus
     * 2 @ 0.5% (C22) score via the ESD pillar.
     */
    empowermentFinancing: {
      maxPoints: pEf?.maxPoints ?? 15,
      targetedInvestmentMaxPts: 12,
      transactionFinancingMaxPts: 3,
      sdMaxPts: esd.sdMaxPts,
      sdTarget: esd.sdPercent / 100,
      edMaxPts: esd.edMaxPts,
      edTarget: esd.edPercent / 100,
      graduationBonusMaxPts: esd.edGraduationBonus,
      jobsBonusMaxPts: 1,
      stockbrokerBonusMaxPts: 2,
      stockbrokerTarget: 0.005,
    },

    /**
     * AFS Long-Term Insurers — 12 pts (verified from AFS Scorecard - Long Term PDF).
     * Appropriate Products (3 pts) + Market Penetration (7 pts) + Transactional Access (2 pts at 80%).
     */
    accessToFinancialServices: {
      subSector: 'LTI',
      maxPoints: pAfs?.maxPoints ?? 12,
      appropriateProductsMaxPts: 3,
      marketPenetrationMaxPts: 7,
      transactionalAccessTarget: 0.80,
      transactionalAccessMaxPts: 2,
    },

    benefitFactors: sc.benefitFactors.map((bf) => ({ type: bf.contributionType, factor: bf.sdFactor })),
    industryNorms: sc.industryNorms.map((n) => ({ name: n.industry, norm: String(n.normPercent) })),
  };
}

/** Complete FSC Long-Term Insurers (FS702) config. */
export const FSC_LTI_CALCULATOR_CONFIG: CalculatorConfig =
  sectorConfigToFscLtiCalculatorConfig(FSC_LTI);

export { FSC_SKILLS_PER_LEVEL_TARGETS as FSC_LTI_SKILLS_PER_LEVEL_TARGETS };

export function isFscLtiSector(sectorCode: string, fscSubSector?: string): boolean {
  return sectorCode.toUpperCase() === 'FSC' && normalizeFscSubSector(fscSubSector) === 'LTI';
}
