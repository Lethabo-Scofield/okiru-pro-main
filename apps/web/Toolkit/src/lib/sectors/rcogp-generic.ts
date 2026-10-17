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
import { EMPOWER_TOOLKIT_ESD_FACTOR_OVERRIDES } from '../../../../../api/pipeline/rules/benefitFactors';

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
    // Carried through so elective groups keep their size (Transport QSE elects
    // four of seven). Dropping it silently degrades every group to "choose one".
    electiveGroupSizes: sc.electiveGroupSizes,
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
      // SectorConfig stores spend targets as percentages (3.5 = 3.5%), but the skills
      // calculator multiplies leviableAmount * target directly (expects a fraction like
      // 0.035, not 3.5). Divide by 100 to match the calculator's expectation.
      overallTarget: sk.overallSpendPercent / 100,         // 3.5% → 0.035
      bursaryTarget: sk.bursarySpendPercent / 100,         // 2.5% → 0.025
      subMinThreshold: skillsSubMin,
      overallSpendPercent: sk.overallSpendPercent / 100,   // 0.035 (fraction)
      bursarySpendPercent: sk.bursarySpendPercent / 100,   // 0.025 (fraction)
      disabledSpendPercent: sk.disabledSpendPercent / 100, // 0.003 (fraction)
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
      // The supplier QUALIFIES at >30% black-female ownership (the line's own
      // name; Procurement Data[BWO Spend] tests ≥30%). bwo30Target (12%) is the
      // SPEND target — feeding it here let 12-29% BWO suppliers count.
      // Same fix as AgriBEE R12.
      blackWomenThreshold: 0.30,
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
        subMinimumPercent: pMc.subMinimumPercent,
      },
      employmentEquity: { maxPoints: pEe.maxPoints },
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

/**
 * Where RCOGP Generic follows its Empower toolkit (v1.4, the reference for
 * this sector) and the rule is that template's own — another template, or the
 * Codes, reads it differently. Each is a method choice, flagged:
 *   - the all-empowering-suppliers line counts every supplier's recognised
 *     spend; the toolkit never reads "Empowering Supplier? (Yes/No)"
 *     (the Codes speak of EMPOWERING suppliers);
 *   - the 1.2 recognition factor on the flow-through rule (the other templates
 *     award it to ≥51% black-owned QSE/EME SD beneficiaries / 3-year contracts);
 *   - a Generic supplier first procured as a QSE/EME still counts on that line
 *     for five years (no other template has this);
 *   - an ESD contribution counts only for a qualifying beneficiary
 *     ('ESD Data'[Recognised Amount]; RCOGP QSE / ICT / AgriBEE do not gate);
 *   - guarantees are recognised at 50% of the guarantee (the Codes: 3%; every
 *     Empower template we hold uses 50%).
 *   - Skills by the toolkit's own method (EAP split with per-group caps, the
 *     F&G and other-cost caps against all training spend, absorption against
 *     headcount).
 * Also here, though the Codes impose it too: the ED sub-minimum, 40% of the
 * 5-point BASE line (Summary Scorecard H61 = F62 ≥ 40% × C62). RCOGP_GENERIC
 * in apps/api still says 0 — the server-side engine reading it (being
 * removed) tests ED on base + bonuses, and would fail entities the toolkit
 * passes.
 */
function withEmpowerToolkitMethod(cfg: CalculatorConfig): CalculatorConfig {
  const pc = cfg.pillarConfigs ?? {};
  return {
    ...cfg,
    pillarConfigs: {
      ...pc,
      enterpriseDevelopment: {
        ...(pc.enterpriseDevelopment ?? { maxPoints: 7 }),
        subMinimumPercent: 40,
      },
    },
    procurement: {
      ...cfg.procurement,
      allSuppliersIgnoreEmpoweringFlag: true,
      enhancedRecognitionRule: 'flow_through',
      countGraduatedSuppliersAsSmall: true,
    },
    esd: { ...cfg.esd, applyBeneficiaryQualification: true },
    // Skills as the toolkit scores it, including the absorption bonus against
    // 5% of headcount (replaces the 100%-of-learners basis of the July audit,
    // item 2, for this sector only).
    skills: {
      ...cfg.skills,
      method: 'toolkit',
      absorptionBasis: 'headcount',
      absorptionTargetPercent: 5,
    },
    benefitFactors: cfg.benefitFactors.map((bf) =>
      Object.prototype.hasOwnProperty.call(EMPOWER_TOOLKIT_ESD_FACTOR_OVERRIDES, bf.type)
        ? { ...bf, factor: EMPOWER_TOOLKIT_ESD_FACTOR_OVERRIDES[bf.type] }
        : bf,
    ),
  };
}

/**
 * RCOGP Generic on the Codes' reading alone, without the toolkit's method
 * choices above — the base a sector that merely borrows RCOGP's calculator
 * plumbing (Construction) builds on.
 */
export const RCOGP_GENERIC_CODES_CALCULATOR_CONFIG: CalculatorConfig =
  sectorConfigToCalculatorConfig(RCOGP_GENERIC);

/**
 * The RCOGP skills block WITHOUT the toolkit method. Construction borrows the
 * RCOGP pillar config only to harvest the calculators' rawStats, and its mapper
 * reads them in the original method's terms.
 */
export const RCOGP_GENERIC_ORIGINAL_SKILLS_CONFIG: CalculatorConfig['skills'] = RCOGP_GENERIC_CODES_CALCULATOR_CONFIG.skills;

/** Complete RCOGP Generic config — use for scorecard, tests, and explicit sector wiring. */
export const RCOGP_GENERIC_CALCULATOR_CONFIG: CalculatorConfig =
  withEmpowerToolkitMethod(RCOGP_GENERIC_CODES_CALCULATOR_CONFIG);

export function isRcogpGenericSector(
  sectorCode: string,
  scorecardType: string,
): boolean {
  return (
    sectorCode.toUpperCase() === RCOGP_GENERIC_SECTOR_CODE &&
    scorecardType === RCOGP_GENERIC_SCORECARD_TYPE
  );
}
