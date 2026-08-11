/**
 * ICT QSE — authoritative CalculatorConfig for Toolkit scoring.
 * Derived from ICT_QSE in apps/api/pipeline/sectorConfig.ts (Excel v1.1).
 *
 * Key ICT QSE differences from RCOGP QSE:
 * - Grand total: 108 → 116 (SED 5 → 12; ED max 7 → 8)
 * - Ownership: voting rights target 25% → 30%; EI target 25% → 30%
 * - ED: tiered jobs bonus (1 pt ≤10% or 2 pts ≥11% of workforce). Calculator
 *   currently only models the 1-pt tier; 2-pt tier is a known gap — see §10 SLS.
 * - SED: 1% NPAT / 12 pts (ICT-specific initiatives), vs 5 pts in RCOGP QSE
 * - Level thresholds: standard RCOGP 8-band table (100/95/90/80/75/70/55/40)
 *   NOT the ICT Generic 140-pt scale (ICT_LEVELS)
 *
 * Identical to RCOGP QSE:
 * - MC: 15 pts, exec 5+2=7, SMJ 6+2=8, no board, no disabled
 * - Skills: 3%/15 + 1%/7 + 0.15%/3 + 1%-absorption/5 = 30 pts
 * - PP: all-suppliers 60%/15 + BO51 15%/5 + DG bonus 1%/1 = 21 pts
 * - SD: 1% NPAT / 5 pts
 *
 * @see docs/domain/sectors/ict/qse/sls.md
 */
import {
  ICT_QSE,
  type SectorConfig,
} from '../../../../../api/pipeline/sectorConfig';
import type { CalculatorConfig } from '../../../../shared/schema';

export const ICT_QSE_SECTOR_CODE = 'ICT' as const;
export const ICT_QSE_SCORECARD_TYPE = 'QSE' as const;

/** Convert verified ICT QSE SectorConfig → CalculatorConfig (QSE-specific mapping). */
export function sectorConfigToIctQseCalculatorConfig(sc: SectorConfig): CalculatorConfig {
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
  // ICT QSE PP base = allSuppliers (15) + BO51 (5) only; bonus = DG (1)
  const procBaseMax = pr.allSuppliersMaxPts + pr.bo51MaxPts;

  // Sub-minimums on BASE points (TOOLKIT-RESOLVED.md S1): Skills excludes the
  // absorption bonus (40% × 25 = 10), PP excludes the DG bonus (40% × 20 = 8).
  const ownershipSubMin = pOwn.hasSubMinimum
    ? (pOwn.subMinimumPercent / 100) * own.netValueMaxPts
    : 3.2;
  const skillsSubMin = pSk.hasSubMinimum
    ? (pSk.subMinimumPercent / 100) * (pSk.maxPoints - (sk.absorptionMaxPts ?? 0))
    : 10;
  const procSubMin = pPp.hasSubMinimum
    ? (pPp.subMinimumPercent / 100) * procBaseMax
    : 8;
  const sdSubMin = pSd.hasSubMinimum
    ? (pSd.subMinimumPercent / 100) * pSd.maxPoints
    : 2;

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
      // ICT QSE: voting rights target = 30% (not 25%)
      votingRightsTarget: own.votingRightsTarget,
      womenVotingTarget: own.womenVotingTarget,
      womenEIMax: own.womenEIMaxPts,
      womenEITarget: own.womenEITarget,
      // QSE: single combined "Black New Entrants OR Designated Groups" indicator
      // (3 pts @ 2%); new-entrants slot = 0, combined flag drives the OR-logic.
      newEntrantsMax: own.newEntrantsMaxPts ?? 0,
      designatedGroupsMax: own.economicInterestDesignatedGroupMaxPts ?? 3,
      designatedGroupsTarget: own.economicInterestDesignatedGroupTarget ?? 0.02,
      combinedNewEntrantsDesignated: true,
    },
    management: {
      // QSE MC Section 1: Executive Management (no board indicators)
      boardBlackTarget: mc.boardBlackTarget ?? 0,
      boardBlackPoints: mc.boardBlackMaxPts ?? 0,
      boardWomenTarget: mc.boardBWTarget ?? 0,
      boardWomenPoints: mc.boardBWMaxPts ?? 0,
      execBlackTarget: mc.execBlackTarget,
      execBlackPoints: mc.execBlackMaxPts,
      execWomenTarget: mc.execBWTarget,
      execWomenPoints: mc.execBWMaxPts,
      // No disabled indicator in QSE MC
      disabledTarget: ee.disabledTarget ?? 0,
      execBWTarget: mc.execBWTarget,
      execBWMaxPts: mc.execBWMaxPts,
    },
    managementControl: {
      maxPoints: pMc.maxPoints,
      subMinimumPercent: pMc.subMinimumPercent ?? 0,
      // QSE: no board indicators
      boardBlackTarget: mc.boardBlackTarget ?? 0,
      boardBlackMaxPts: mc.boardBlackMaxPts ?? 0,
      boardBWTarget: mc.boardBWTarget ?? 0,
      boardBWMaxPts: mc.boardBWMaxPts ?? 0,
      // QSE MC Section 1: Executive Management (5+2=7 pts)
      execBlackTarget: mc.execBlackTarget,
      execBlackMaxPts: mc.execBlackMaxPts,
      execBWTarget: mc.execBWTarget,
      execBWMaxPts: mc.execBWMaxPts,
      // QSE: no "Other Executive Management" band
      otherExecBlackTarget: mc.otherExecBlackTarget ?? 0,
      otherExecBlackMaxPts: mc.otherExecBlackMaxPts ?? 0,
      otherExecBWTarget: mc.otherExecBWTarget ?? 0,
      otherExecBWMaxPts: mc.otherExecBWMaxPts ?? 0,
      // QSE MC Section 2: combined SMJ (6+2=8 pts, fixed 60%/30% targets).
      // Scored as one flat band for QSE (management.ts isQse branch); without
      // these targets the 8 SMJ points score 0. (DISCREPANCY-LEDGER D-02)
      seniorBlackTarget: mc.seniorBlackTarget ?? 0.60,
      seniorBWTarget: mc.seniorBWTarget ?? 0.30,
      seniorMaxPts: mc.seniorMaxPts ?? 6,
      seniorBWMaxPts: mc.seniorBWMaxPts ?? 2,
      middleMaxPts: mc.middleMaxPts ?? 0,
      middleBWMaxPts: mc.middleBWMaxPts ?? 0,
      juniorMaxPts: mc.juniorMaxPts ?? 0,
      juniorBWMaxPts: mc.juniorBWMaxPts ?? 0,
      // No disabled indicator in QSE MC
      disabledTarget: ee.disabledTarget ?? 0,
      disabledMaxPts: ee.disabledMaxPts ?? 0,
    },
    // QSE has no separate Employment Equity pillar
    employmentEquity: {
      maxPoints: 0,
      disabledTarget: ee.disabledTarget ?? 0,
      disabledMaxPts: ee.disabledMaxPts ?? 0,
    },
    skills: {
      // QSE Skills: learningProgrammesMaxPts = all-Black spend (15); bursaryMaxPts = Black women spend (7)
      // NOTE: SectorConfig stores spend targets as percentages (3.0 = 3%),
      // but the skills calculator multiplies leviableAmount * target directly (expects fraction).
      // We divide by 100 here to match the calculator's expectation.
      generalMax: sk.learningProgrammesMaxPts,
      bursaryMax: sk.bursaryMaxPts,
      overallTarget: sk.overallSpendPercent / 100,       // 3.0% → 0.030
      bursaryTarget: sk.bursarySpendPercent / 100,       // 1.0% → 0.010
      subMinThreshold: skillsSubMin,
      overallSpendPercent: sk.overallSpendPercent / 100,   // 0.030 (fraction)
      bursarySpendPercent: sk.bursarySpendPercent / 100,   // 0.010 (fraction)
      disabledSpendPercent: sk.disabledSpendPercent / 100, // 0.0015 (fraction)
      categoryECap: catE?.cap,
      categoryFCap: catF?.cap,
      learningProgrammesMaxPts: sk.learningProgrammesMaxPts,
      bursaryMaxPts: sk.bursaryMaxPts,
      disabledLearningMaxPts: sk.disabledLearningMaxPts,
      learnershipsMaxPts: sk.learnershipsMaxPts,   // 0 for QSE
      absorptionMaxPts: sk.absorptionMaxPts,
      learnershipTargetPercent: sk.learnershipTargetPercent, // 0 for QSE
      // QSE Skills SK-2 "Spend on Black women" (bursaryMaxPts=7 @ 1% leviable) measures
      // Black-female learning spend across all categories, not bursary spend. (ledger D-03)
      bursaryIsBlackFemale: true,
      // Pass the whole-percent through (skills.ts divides by 100 once). Config is now
      // 100 → 1.0 = 100% absorption target, matching Excel `Skills Calcs!J28 =
      // MIN(absorbed/completers × 5, 5)` (no % divisor → full pts need 100% absorbed).
      // R22 corrected the config 1.0→100; the earlier D-04 fix only removed the double
      // /100 but left the value at 1.0 (=1%), still under the 100% Excel target. The
      // absorbed÷completers vs ÷black-learners basis is the open expert item Q-E/R18.
      absorptionTargetPercent: sk.absorptionTargetPercent, // 100 (percent) → skills.ts /100 = 1.0 = 100%
    },
    procurement: {
      baseMax: procBaseMax,               // 15 + 5 = 20
      bonusMax: pr.dgMaxPts,              // 1
      tmpsTarget: 0,
      subMinThreshold: procSubMin,        // 40% × 21 = 8.4
      blackOwnedThreshold: pr.bo51Target, // 0.15
      blackWomenThreshold: 0,             // No BWO30 in QSE
      allSuppliersTarget: pr.allSuppliersTarget,  // 0.60
      allSuppliersMaxPts: pr.allSuppliersMaxPts,  // 15
      qseTarget: 0,
      qseMaxPts: 0,
      emeTarget: 0,
      emeMaxPts: 0,
      bo51Target: pr.bo51Target,          // 0.15
      bo51MaxPts: pr.bo51MaxPts,          // 5
      bwo30Target: 0,
      bwo30MaxPts: 0,
      dgTarget: pr.dgTarget,              // 0.01
      dgMaxPts: pr.dgMaxPts,              // 1
    },
    esd: {
      supplierDevMax: esd.sdMaxPts,            // 5
      enterpriseDevMax: esd.edMaxPts,          // 5 base; pillar total 8 with bonuses
      supplierDevTarget: esd.sdPercent / 100,  // 0.01
      enterpriseDevTarget: esd.edPercent / 100, // 0.01
      edGraduationBonusMax: esd.edGraduationBonus, // 1
      // ICT QSE two-tier jobs bonus: ≤10% → 1pt, ≥11% → 2pts (edJobsBonus = 2),
      // so the full ED pillar reaches 5 + 1 + 2 = 8. (TOOLKIT-RESOLVED.md S6.)
      edJobsBonusMax: esd.edJobsBonus,         // 2
    },
    sed: {
      maxPoints: sed.maxPts,              // 12 (ICT QSE-specific)
      npatTarget: sed.spendPercent / 100, // 0.01
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

/** Complete ICT QSE config — authoritative for scorecard, tests, and sector wiring. */
export const ICT_QSE_CALCULATOR_CONFIG: CalculatorConfig =
  sectorConfigToIctQseCalculatorConfig(ICT_QSE);

export function isIctQseSector(
  sectorCode: string,
  scorecardType: string,
): boolean {
  return (
    sectorCode.toUpperCase() === ICT_QSE_SECTOR_CODE &&
    scorecardType === ICT_QSE_SCORECARD_TYPE
  );
}
