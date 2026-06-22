/**
 * AGRI Generic — authoritative CalculatorConfig for Toolkit scoring.
 * Derived from AGRI_GENERIC in apps/api/pipeline/sectorConfig.ts (Excel v1.0.1).
 *
 * Key AGRI Generic differences from RCOGP Generic:
 * - Grand total: 132 (vs 120) — driven by MC 23, PP 27, SED 15
 * - MC: 23 pts combined — board 3+2 (not 2+1), other-exec 3+2 (not 2+1),
 *   senior 2+1, middle 2+1, junior 1+1 (all EAP-based), disabled 2 @ 2%
 * - Ownership: voting/EI Black = 4pts each (not 5); designated groups incl.
 *   farm workers = 3pts @ 4% target; new entrants = 2pts (not 3)
 * - Skills: 25pts — general 8@6%, disabled 4@0.3%, LAI 4@2.5%,
 *   unemployed-training 4@2.5% (bursaryMaxPts repurposed), absorption 5@100%
 * - PP: 27pts — BO51 at 40% target (not 50%); same 5+3+4+9+4+2 structure
 * - ESD: SD 2%/10pts; ED 1.5%/5pts base + 1 grad + 1 jobs
 * - SED: 15pts @ 1.5% NPAT ("Socioeconomic Development Contributions — Agricultural Industry")
 *
 * @see docs/domain/sectors/agri/generic/sls.md
 */
import {
  AGRI_GENERIC,
  type SectorConfig,
} from '../../../../../api/pipeline/sectorConfig';
import type { CalculatorConfig } from '../../../../shared/schema';

export const AGRI_GENERIC_SECTOR_CODE = 'AGRI' as const;
export const AGRI_GENERIC_SCORECARD_TYPE = 'Generic' as const;

/** Convert verified AGRI Generic SectorConfig → CalculatorConfig. */
export function sectorConfigToAgriGenericCalculatorConfig(sc: SectorConfig): CalculatorConfig {
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
  // AGRI PP base = allSuppliers + QSE + EME + BO51 + BWO30 (bonus = DG)
  const procBaseMax =
    pr.allSuppliersMaxPts +
    pr.qseMaxPts +
    pr.emeMaxPts +
    pr.bo51MaxPts +
    pr.bwo30MaxPts;

  // Sub-minimums on BASE points (TOOLKIT-RESOLVED.md S1/S7): Skills excludes the
  // absorption bonus (40% × 20 = 8), PP excludes the DG bonus (40% × 25 = 10).
  const ownershipSubMin = pOwn.hasSubMinimum
    ? (pOwn.subMinimumPercent / 100) * own.netValueMaxPts
    : 3.2;
  const skillsSubMin = pSk.hasSubMinimum
    ? (pSk.subMinimumPercent / 100) * (pSk.maxPoints - (sk.absorptionMaxPts ?? 0))
    : 8;
  const procSubMin = pPp.hasSubMinimum
    ? (pPp.subMinimumPercent / 100) * procBaseMax
    : 10;
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
      votingRightsMax: own.votingRightsMaxPts,        // 4
      womenBonusMax: own.womenVotingMaxPts,            // 2
      economicInterestMax: own.economicInterestMaxPts, // 4
      netValueMax: own.netValueMaxPts,                 // 8
      targetEconomicInterest: own.economicInterestTarget, // 0.25
      subMinNetValue: ownershipSubMin,                 // 3.2 (40% × Net Value 8 — toolkit YES sheet)
      votingRightsTarget: own.votingRightsTarget,      // 0.25
      womenVotingTarget: own.womenVotingTarget,        // 0.10
      womenEIMax: own.womenEIMaxPts,                   // 2
      womenEITarget: own.womenEITarget,                // 0.10
      newEntrantsMax: own.newEntrantsMaxPts,           // 2
      // AGRI: designated groups includes farm workers (5th category) @ 4% target
      designatedGroupsMax: own.economicInterestDesignatedGroupMaxPts ?? 3,
      designatedGroupsTarget: own.economicInterestDesignatedGroupTarget ?? 0.04,
    },
    management: {
      boardBlackTarget: mc.boardBlackTarget,           // 0.50
      boardBlackPoints: mc.boardBlackMaxPts,           // 3
      boardWomenTarget: mc.boardBWTarget,              // 0.25
      boardWomenPoints: mc.boardBWMaxPts,              // 2
      execBlackTarget: mc.execBlackTarget,             // 0.50
      execBlackPoints: mc.execBlackMaxPts,             // 2
      execWomenTarget: mc.execBWTarget,                // 0.25
      execWomenPoints: mc.execBWMaxPts,                // 1
      disabledTarget: ee.disabledTarget,               // 0.02
      execBWTarget: mc.execBWTarget,
      execBWMaxPts: mc.execBWMaxPts,
    },
    managementControl: {
      maxPoints: pMc.maxPoints,                        // 23
      subMinimumPercent: pMc.subMinimumPercent,        // 0
      boardBlackTarget: mc.boardBlackTarget,           // 0.50
      boardBlackMaxPts: mc.boardBlackMaxPts,           // 3
      boardBWTarget: mc.boardBWTarget,                 // 0.25
      boardBWMaxPts: mc.boardBWMaxPts,                 // 2
      execBlackTarget: mc.execBlackTarget,             // 0.50
      execBlackMaxPts: mc.execBlackMaxPts,             // 2
      execBWTarget: mc.execBWTarget,                   // 0.25
      execBWMaxPts: mc.execBWMaxPts,                   // 1
      otherExecBlackTarget: mc.otherExecBlackTarget,   // 0.60
      otherExecBlackMaxPts: mc.otherExecBlackMaxPts,   // 3
      otherExecBWTarget: mc.otherExecBWTarget,         // 0.30
      otherExecBWMaxPts: mc.otherExecBWMaxPts,         // 2
      // AGRI: senior/middle/junior bands with EAP-based targets
      seniorMaxPts: mc.seniorMaxPts,                   // 2
      seniorBWMaxPts: mc.seniorBWMaxPts,               // 1
      middleMaxPts: mc.middleMaxPts,                   // 2
      middleBWMaxPts: mc.middleBWMaxPts,               // 1
      juniorMaxPts: mc.juniorMaxPts,                   // 1
      juniorBWMaxPts: mc.juniorBWMaxPts,               // 1
      // Per-band Black/BW targets required by the EAP-split scorer. Without them
      // AGRI (useRcogp=false) scores the 8 SMJ band points as 0 (mgmtFallback
      // returns undefined → subTarget NaN). The `?? default` keeps the band
      // scoring intact even if these ever drop out of sectorConfig. (ledger D-01)
      seniorBlackTarget: mc.seniorBlackTarget ?? 0.60,
      seniorBWTarget: mc.seniorBWTarget ?? 0.30,
      middleBlackTarget: mc.middleBlackTarget ?? 0.75,
      middleBWTarget: mc.middleBWTarget ?? 0.38,
      juniorBlackTarget: mc.juniorBlackTarget ?? 0.88,
      juniorBWTarget: mc.juniorBWTarget ?? 0.44,
      disabledTarget: ee.disabledTarget,               // 0.02
      disabledMaxPts: ee.disabledMaxPts,               // 2
    },
    employmentEquity: {
      maxPoints: pEe.maxPoints,                        // 0 — folded into MC
      disabledTarget: ee.disabledTarget,               // 0.02
      disabledMaxPts: ee.disabledMaxPts,               // 2
    },
    skills: {
      // AGRI Skills: 8+4+4+4+5 = 25
      // generalMax → 2.1.1.1 general learning spend (8pts @ 6%)
      // bursaryMax → 2.1.2.2 unemployed training headcount (4pts @ 2.5%) — repurposed field
      // overallSpendPercent → 6% of leviable (AgriBEE is 6%, not RCOGP 3.5%)
      // bursarySpendPercent → unemployed training headcount target (2.5%)
      generalMax: sk.learningProgrammesMaxPts,         // 8
      bursaryMax: sk.bursaryMaxPts,                    // 4 (unemployed training)
      overallTarget: sk.overallSpendPercent / 100,     // 0.060
      bursaryTarget: sk.bursarySpendPercent / 100,     // 0.025 (2.5% headcount)
      subMinThreshold: skillsSubMin,                   // 8 (40% × 20 base, excl. 5-pt absorption bonus)
      overallSpendPercent: sk.overallSpendPercent / 100,   // 0.060
      bursarySpendPercent: sk.bursarySpendPercent / 100,   // 0.025
      disabledSpendPercent: sk.disabledSpendPercent / 100, // 0.003 (0.3%)
      categoryECap: catE?.cap,
      categoryFCap: catF?.cap,
      learningProgrammesMaxPts: sk.learningProgrammesMaxPts, // 8
      bursaryMaxPts: sk.bursaryMaxPts,                 // 4 (unemployed training)
      disabledLearningMaxPts: sk.disabledLearningMaxPts,  // 4
      learnershipsMaxPts: sk.learnershipsMaxPts,       // 4 (LAI @ 2.5%)
      absorptionMaxPts: sk.absorptionMaxPts,           // 5
      // learnership/absorption targets are passed as PERCENTAGES — the skills
      // calculator divides them by 100 (LAI 2.5% headcount; absorption 100%).
      learnershipTargetPercent: sk.learnershipTargetPercent,       // 2.5 → 2.5% headcount
      absorptionTargetPercent: sk.absorptionTargetPercent,         // 100 → 100% absorption
      // AgriBEE 2.1.2.2: "unemployed Black people in training" is headcount-based
      // (2.5% of headcount), not spend-based. (TOOLKIT-RESOLVED.md Q13.)
      bursaryIsHeadcount: true,
    },
    procurement: {
      baseMax: procBaseMax,                            // 5+3+4+9+4 = 25
      bonusMax: pr.dgMaxPts,                           // 2
      tmpsTarget: 0,
      subMinThreshold: procSubMin,                     // 10 (40% × 25 base, excl. 2-pt DG bonus)
      blackOwnedThreshold: pr.bo51Target,              // 0.40
      blackWomenThreshold: pr.bwo30Target,             // 0.12
      allSuppliersTarget: pr.allSuppliersTarget,       // 0.80
      allSuppliersMaxPts: pr.allSuppliersMaxPts,       // 5
      qseTarget: pr.qseTarget,                         // 0.15
      qseMaxPts: pr.qseMaxPts,                         // 3
      emeTarget: pr.emeTarget,                         // 0.15
      emeMaxPts: pr.emeMaxPts,                         // 4
      bo51Target: pr.bo51Target,                       // 0.40 (AgriBEE 40%, not 50%)
      bo51MaxPts: pr.bo51MaxPts,                       // 9
      bwo30Target: pr.bwo30Target,                     // 0.12
      bwo30MaxPts: pr.bwo30MaxPts,                     // 4
      dgTarget: pr.dgTarget,                           // 0.02
      dgMaxPts: pr.dgMaxPts,                           // 2
    },
    esd: {
      supplierDevMax: esd.sdMaxPts,                    // 10
      enterpriseDevMax: esd.edMaxPts,                  // 5 base (total 7 incl. bonuses)
      supplierDevTarget: esd.sdPercent / 100,          // 0.02 (2% NPAT)
      enterpriseDevTarget: esd.edPercent / 100,        // 0.015 (1.5% NPAT — AgriBEE)
      edGraduationBonusMax: esd.edGraduationBonus,     // 1
      edJobsBonusMax: esd.edJobsBonus,                 // 1 (single-tier jobs bonus)
    },
    sed: {
      maxPoints: sed.maxPts,                           // 15
      npatTarget: sed.spendPercent / 100,              // 0.015 (1.5% NPAT — AgriBEE)
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
        maxPoints: pOwn.maxPoints,                     // 25
        subMinimumPercent: pOwn.subMinimumPercent,     // 40
      },
      managementControl: {
        maxPoints: pMc.maxPoints,                      // 23
        subMinimumPercent: pMc.subMinimumPercent,      // 0
      },
      employmentEquity: { maxPoints: pEe.maxPoints },  // 0
      skillsDevelopment: {
        maxPoints: pSk.maxPoints,                      // 25
        subMinimumPercent: pSk.subMinimumPercent,      // 40
      },
      preferentialProcurement: {
        maxPoints: pPp.maxPoints,                      // 27
        subMinimumPercent: pPp.subMinimumPercent,      // 40
      },
      supplierDevelopment: {
        maxPoints: pSd.maxPoints,                      // 10
        subMinimumPercent: pSd.subMinimumPercent,      // 40
      },
      enterpriseDevelopment: {
        maxPoints: pEd.maxPoints,                      // 7
        subMinimumPercent: pEd.subMinimumPercent,      // 0
      },
      socioEconomicDevelopment: { maxPoints: pSed.maxPoints }, // 15
      yesInitiative: { maxPoints: pYes.maxPoints },    // 0
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

/** Complete AGRI Generic config — use for scorecard, tests, and explicit sector wiring. */
export const AGRI_GENERIC_CALCULATOR_CONFIG: CalculatorConfig =
  sectorConfigToAgriGenericCalculatorConfig(AGRI_GENERIC);

export function isAgriGenericSector(
  sectorCode: string,
  scorecardType: string,
): boolean {
  return (
    sectorCode.toUpperCase() === AGRI_GENERIC_SECTOR_CODE &&
    scorecardType === AGRI_GENERIC_SCORECARD_TYPE
  );
}
