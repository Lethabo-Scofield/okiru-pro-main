/**
 * Transport Sector Code — QSE CalculatorConfig for Toolkit scoring.
 * Derived from TRANSPORT_QSE in apps/api/pipeline/sectorConfig.ts, which
 * encodes docs/Transport Codes.xlsx "Road Freight QSE":
 *   Any FOUR of the seven elements, each weighted 25 → denominator 100.
 *   Bonus points are earnable on top, so a score may exceed 100.
 *
 * MC/EE score via calculateTransportQseManagement / ...QseEmploymentEquity
 * (calculators/transport.ts). Electives score via the generic calculators;
 * the store's resolveChooseOneElectives keeps the best four members of
 * chooseOneGroup 'transport_qse_elective' — which for this sector is all seven
 * elements, none of them compulsory.
 */
import {
  TRANSPORT_QSE,
  type SectorConfig,
} from '../../../../../api/pipeline/sectorConfig';
import type { CalculatorConfig } from '../../../../shared/schema';

export const TRANSPORT_QSE_SECTOR_CODE = 'TRANSPORT' as const;
export const TRANSPORT_QSE_SCORECARD_TYPE = 'QSE' as const;

/** Convert verified Transport QSE SectorConfig → CalculatorConfig. */
export function sectorConfigToTransportQseCalculatorConfig(sc: SectorConfig): CalculatorConfig {
  const t = sc.targets;
  const own = t.ownership;
  const mc = t.managementControl;
  const ee = t.employmentEquity;
  const sk = t.skills;
  const pr = t.procurement;
  const esd = t.esd;
  const sed = t.sed;
  const pc = sc.pillarConfigs;

  return {
    sectorCode: sc.sectorCode,
    scorecardType: sc.scorecardType,
    totalMaxPoints: sc.totalMaxPoints, // 100 (any four elements × 25)
    electiveGroupSizes: sc.electiveGroupSizes, // { transport_qse_elective: 4 }
    ownership: {
      votingRightsMax: own.votingRightsMaxPts,             // 6
      womenBonusMax: own.womenVotingMaxPts,                // 2 (bonus: black women 10%)
      // The two Transport QSE bonus indicators. pillarConfigs.ownership declares
      // basePoints 25 / maxPoints 28 — these flags are what let the scorecard
      // show that 25/3 split instead of one merged 28-pt weight.
      womenVotingIsBonus: true,
      womenEIIsBonus: true,
      economicInterestMax: own.economicInterestMaxPts,     // 9
      netValueMax: own.netValueMaxPts,                     // 9
      targetEconomicInterest: own.economicInterestTarget,  // 0.25
      subMinNetValue: 0,                                   // no ownership sub-minimum
      votingRightsTarget: own.votingRightsTarget,          // 0.25
      womenVotingTarget: own.womenVotingTarget,            // 0.10
      womenEIMax: own.womenEIMaxPts,                       // 1 (bonus: ESOP/BBOS/co-ops)
      womenEITarget: own.womenEITarget,                    // 0.10
      newEntrantsMax: own.newEntrantsMaxPts,               // 1 (ownership fulfilment)
      // Transport QSE ownership is exactly six indicators summing to the 28-pt
      // cap (voting 6 + women-voting 2 + EI 9 + womenEI 1 + newEntrants 1 +
      // netValue 9). It has NO separate "designated groups" line — pin it to 0
      // so the calculator does not fall back to its generic default of 3, which
      // put a phantom 7th line into the breakdown (Σ 31 > 28 cap).
      designatedGroupsMax: 0,
      designatedGroupsTarget: 0,
    },
    management: {
      boardBlackTarget: mc.boardBlackTarget,               // 0
      boardBlackPoints: mc.boardBlackMaxPts,               // 0
      boardWomenTarget: mc.boardBWTarget,                  // 0.25 (bonus BW at top mgmt)
      boardWomenPoints: mc.boardBWMaxPts,                  // 2
      execBlackTarget: mc.execBlackTarget,                 // 0.501 (top mgmt black)
      execBlackPoints: mc.execBlackMaxPts,                 // 25
      execWomenTarget: mc.execBWTarget,                    // 0
      execWomenPoints: mc.execBWMaxPts,                    // 0
      disabledTarget: ee.disabledTarget,                   // 0
    },
    managementControl: {
      maxPoints: pc.managementControl.maxPoints,           // 27
      subMinimumPercent: pc.managementControl.subMinimumPercent, // 0
      boardBWTarget: mc.boardBWTarget,
      boardBWMaxPts: mc.boardBWMaxPts,
      execBlackTarget: mc.execBlackTarget,
      execBlackMaxPts: mc.execBlackMaxPts,
    },
    employmentEquity: {
      maxPoints: pc.employmentEquity?.maxPoints ?? 27,     // 27 (7.5+7.5+5+5 + EAP bonus 2)
    },
    // Skills elective: 2% leviable → 12.5 pts + 1% black women → 12.5 pts.
    // bursaryIsBlackFemale: the second line is "learning-programme spend on
    // Black women", not bursaries — same semantics the generic skills
    // calculator implements for that flag.
    skills: {
      generalMax: sk.learningProgrammesMaxPts,             // 12.5
      bursaryMax: sk.bursaryMaxPts,                        // 12.5
      overallTarget: sk.overallSpendPercent / 100,         // 0.02
      bursaryTarget: sk.bursarySpendPercent / 100,         // 0.01
      subMinThreshold: 0,
      overallSpendPercent: sk.overallSpendPercent / 100,   // 0.02
      bursarySpendPercent: sk.bursarySpendPercent / 100,   // 0.01
      disabledSpendPercent: 0,
      learningProgrammesMaxPts: sk.learningProgrammesMaxPts, // 12.5
      bursaryMaxPts: sk.bursaryMaxPts,                     // 12.5
      disabledLearningMaxPts: 0,
      learnershipsMaxPts: 0,
      absorptionMaxPts: 0,
      learnershipTargetPercent: 0,
      absorptionTargetPercent: 0,
      bursaryIsBlackFemale: true,
    },
    // PP elective: 40% B-BBEE spend → 25 pts (single indicator).
    procurement: {
      baseMax: pr.allSuppliersMaxPts,                      // 25
      bonusMax: 0,
      tmpsTarget: 0,
      subMinThreshold: 0,
      blackOwnedThreshold: pr.bo51Target,                  // 0 (line unused)
      blackWomenThreshold: 0.30,
      allSuppliersTarget: pr.allSuppliersTarget,           // 0.40
      allSuppliersMaxPts: pr.allSuppliersMaxPts,           // 25
      qseTarget: 0, qseMaxPts: 0,
      emeTarget: 0, emeMaxPts: 0,
      bo51Target: 0, bo51MaxPts: 0,
      bwo30Target: 0, bwo30MaxPts: 0,
      dgTarget: 0, dgMaxPts: 0,
    },
    // ED elective: 2% NPAT → 25 pts.
    esd: {
      supplierDevMax: esd.sdMaxPts,                        // 0
      enterpriseDevMax: esd.edMaxPts,                      // 25
      supplierDevTarget: esd.sdPercent / 100,              // 0
      enterpriseDevTarget: esd.edPercent / 100,            // 0.02
      edGraduationBonusMax: esd.edGraduationBonus,         // 0
      edJobsBonusMax: esd.edJobsBonus,                     // 0
    },
    // SED elective: 1% NPAT → 25 pts.
    sed: {
      maxPoints: sed.maxPts,                               // 25
      npatTarget: sed.spendPercent / 100,                  // 0.01
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
      // Transport QSE is "any FOUR of the seven elements" — so ownership, MC and
      // EE are ELECTIVES too, not compulsory pillars. The source TRANSPORT_QSE
      // marks all seven with chooseOneGroup; this conversion must carry it onto
      // ownership/MC/EE as well, or the store's elective selector never lets them
      // into the best-four total and they silently score 0 (Thandanani: Ownership
      // 25 + MC 27 dropped → 50 instead of 102).
      ownership: { maxPoints: pc.ownership.maxPoints, basePoints: pc.ownership.basePoints, chooseOneGroup: pc.ownership.chooseOneGroup },                       // 28
      managementControl: { maxPoints: pc.managementControl.maxPoints, basePoints: pc.managementControl.basePoints, chooseOneGroup: pc.managementControl.chooseOneGroup }, // 27
      employmentEquity: { maxPoints: pc.employmentEquity?.maxPoints ?? 0, basePoints: pc.employmentEquity?.basePoints, chooseOneGroup: pc.employmentEquity?.chooseOneGroup }, // 27
      // Electives — the store's resolveChooseOneElectives keeps the best one.
      skillsDevelopment: { maxPoints: pc.skillsDevelopment.maxPoints, basePoints: pc.skillsDevelopment.basePoints, chooseOneGroup: pc.skillsDevelopment.chooseOneGroup },                 // 25
      preferentialProcurement: { maxPoints: pc.preferentialProcurement.maxPoints, basePoints: pc.preferentialProcurement.basePoints, chooseOneGroup: pc.preferentialProcurement.chooseOneGroup }, // 25
      supplierDevelopment: { maxPoints: pc.supplierDevelopment.maxPoints },    // 0
      enterpriseDevelopment: { maxPoints: pc.enterpriseDevelopment.maxPoints, basePoints: pc.enterpriseDevelopment.basePoints, chooseOneGroup: pc.enterpriseDevelopment.chooseOneGroup },     // 25
      socioEconomicDevelopment: { maxPoints: pc.socioEconomicDevelopment.maxPoints, basePoints: pc.socioEconomicDevelopment.basePoints, chooseOneGroup: pc.socioEconomicDevelopment.chooseOneGroup }, // 25
      yesInitiative: { maxPoints: pc.yesInitiative?.maxPoints ?? 0 },          // 0
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

/** Complete Transport QSE config — use for scorecard, tests, and explicit sector wiring. */
export const TRANSPORT_QSE_CALCULATOR_CONFIG: CalculatorConfig =
  sectorConfigToTransportQseCalculatorConfig(TRANSPORT_QSE);
