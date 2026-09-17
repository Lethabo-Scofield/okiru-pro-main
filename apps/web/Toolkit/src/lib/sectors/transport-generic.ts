/**
 * Transport Sector Code — LARGE enterprise CalculatorConfig for Toolkit scoring.
 * Derived from TRANSPORT_GENERIC in apps/api/pipeline/sectorConfig.ts, which
 * encodes docs/Transport Codes.xlsx "Road Freight Large":
 *   Ownership 24 + MC 11 + EE 18 + Skills 15 + PP 20 + SD 15 + SED 5 = 108.
 *
 * MC/EE/Skills score via the mirrored Transport Large calculators in
 * calculators/transport.ts (the generic MC calculator's EAP-band model does
 * NOT apply to Transport Large — see pipeline calcTransportLarge*).
 * Ownership/PP/ESD/SED score via the generic calculators using the targets
 * mapped below.
 */
import {
  TRANSPORT_GENERIC,
  type SectorConfig,
} from '../../../../../api/pipeline/sectorConfig';
import type { CalculatorConfig } from '../../../../shared/schema';

export const TRANSPORT_GENERIC_SECTOR_CODE = 'TRANSPORT' as const;
export const TRANSPORT_GENERIC_SCORECARD_TYPE = 'Generic' as const;

/** Convert verified Transport Large SectorConfig → CalculatorConfig. */
export function sectorConfigToTransportGenericCalculatorConfig(sc: SectorConfig): CalculatorConfig {
  const t = sc.targets;
  const own = t.ownership;
  const mc = t.managementControl;
  const ee = t.employmentEquity;
  const sk = t.skills;
  const pr = t.procurement;
  const esd = t.esd;
  const sed = t.sed;
  const pc = sc.pillarConfigs;

  // PP base = every scored line (Transport Large has no PP bonus line):
  // allSuppliers 12 + QSE 3 + BO51 3 + BWO30 2 = 20.
  const procBaseMax =
    pr.allSuppliersMaxPts + pr.qseMaxPts + pr.emeMaxPts + pr.bo51MaxPts + pr.bwo30MaxPts;

  return {
    sectorCode: sc.sectorCode,
    scorecardType: sc.scorecardType,
    totalMaxPoints: sc.totalMaxPoints, // 108
    ownership: {
      votingRightsMax: own.votingRightsMaxPts,             // 3
      // Split from the old conflated 4: the 2 ESOP/BBOS bonus points require
      // an employee-ownership scheme and must never ride on women-voting alone.
      womenBonusMax: 2,                                    // women voting @10%
      esopBonusMaxPts: 2,                                  // ESOP/BBOS scheme bonus — needs scheme rows
      economicInterestMax: own.economicInterestMaxPts,     // 4
      netValueMax: own.netValueMaxPts,                     // 7
      targetEconomicInterest: own.economicInterestTarget,  // 0.25
      subMinNetValue: 0,                                   // no ownership sub-minimum (hasSubMinimum: false)
      votingRightsTarget: own.votingRightsTarget,          // 0.25
      womenVotingTarget: own.womenVotingTarget,            // 0.10
      womenEIMax: own.womenEIMaxPts,                       // 2
      womenEITarget: own.womenEITarget,                    // 0.10
      newEntrantsMax: own.newEntrantsMaxPts,               // 3 (2 new-entrants + 1 ownership fulfilment)
      designatedGroupsMax: own.economicInterestDesignatedGroupMaxPts ?? 1,
      designatedGroupsTarget: own.economicInterestDesignatedGroupTarget ?? 0.025,
    },
    management: {
      boardBlackTarget: mc.boardBlackTarget,               // 0.50
      boardBlackPoints: mc.boardBlackMaxPts,               // 1.5
      boardWomenTarget: mc.boardBWTarget,                  // 0.25
      boardWomenPoints: mc.boardBWMaxPts,                  // 1.5
      execBlackTarget: mc.execBlackTarget,                 // 0.50
      execBlackPoints: mc.execBlackMaxPts,                 // 1
      execWomenTarget: mc.execBWTarget,                    // 0.25
      execWomenPoints: mc.execBWMaxPts,                    // 1
      disabledTarget: ee.disabledTarget,                   // 0.02
      execBWTarget: mc.execBWTarget,
      execBWMaxPts: mc.execBWMaxPts,
    },
    managementControl: {
      maxPoints: pc.managementControl.maxPoints,           // 11
      subMinimumPercent: pc.managementControl.subMinimumPercent, // 0
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
    },
    employmentEquity: {
      maxPoints: pc.employmentEquity?.maxPoints ?? 18,     // 18
      disabledTarget: ee.disabledTarget,                   // 0.02
      disabledMaxPts: ee.disabledMaxPts,                   // 1
      disabledWomenTarget: ee.disabledWomenTarget ?? 0.01, // 0.01
      disabledWomenMaxPts: ee.disabledWomenMaxPts ?? 1,    // 1
      semiUnskilledWomenMaxPts: ee.semiUnskilledWomenMaxPts ?? 2, // 2
      eapBonusMaxPts: ee.eapBonusMaxPts ?? 3,              // 3 (bonus when every band target met)
    },
    skills: {
      generalMax: sk.learningProgrammesMaxPts,             // 3
      bursaryMax: sk.bursaryMaxPts,                        // 3
      overallTarget: sk.overallSpendPercent / 100,         // 0.03
      bursaryTarget: sk.bursarySpendPercent / 100,         // 0.015
      subMinThreshold: 0,                                  // no Skills sub-minimum
      overallSpendPercent: sk.overallSpendPercent / 100,   // 0.03
      bursarySpendPercent: sk.bursarySpendPercent / 100,   // 0.015
      disabledSpendPercent: sk.disabledSpendPercent / 100, // 0.0045
      learningProgrammesMaxPts: sk.learningProgrammesMaxPts, // 3
      bursaryMaxPts: sk.bursaryMaxPts,                     // 3
      disabledLearningMaxPts: sk.disabledLearningMaxPts,   // 3
      learnershipsMaxPts: sk.learnershipsMaxPts,           // 3 (black in B/C/D @5% headcount)
      absorptionMaxPts: sk.absorptionMaxPts,               // 3 (BW in B/C/D @2.5% headcount — NOT absorption)
      learnershipTargetPercent: sk.learnershipTargetPercent, // 5.0
      absorptionTargetPercent: sk.absorptionTargetPercent,   // 2.5
    },
    procurement: {
      baseMax: procBaseMax,                                // 20
      bonusMax: pr.dgMaxPts,                               // 0
      tmpsTarget: 0,
      subMinThreshold: 0,                                  // no PP sub-minimum
      blackOwnedThreshold: pr.bo51Target,                  // inert — procurement.ts hardcodes ≥51%
      blackWomenThreshold: 0.30,
      allSuppliersTarget: pr.allSuppliersTarget,           // 0.50
      allSuppliersMaxPts: pr.allSuppliersMaxPts,           // 12
      qseTarget: pr.qseTarget,                             // 0.10
      qseMaxPts: pr.qseMaxPts,                             // 3
      emeTarget: pr.emeTarget,                             // 0
      emeMaxPts: pr.emeMaxPts,                             // 0
      bo51Target: pr.bo51Target,                           // 0.09
      bo51MaxPts: pr.bo51MaxPts,                           // 3
      bwo30Target: pr.bwo30Target,                         // 0.06
      bwo30MaxPts: pr.bwo30MaxPts,                         // 2
      dgTarget: pr.dgTarget,                               // 0
      dgMaxPts: pr.dgMaxPts,                               // 0
    },
    esd: {
      supplierDevMax: esd.sdMaxPts,                        // 15
      enterpriseDevMax: esd.edMaxPts,                      // 0
      supplierDevTarget: esd.sdPercent / 100,              // 0.03 (3% NPAT)
      enterpriseDevTarget: esd.edPercent / 100,            // 0
      edGraduationBonusMax: esd.edGraduationBonus,         // 0
      edJobsBonusMax: esd.edJobsBonus,                     // 0
    },
    sed: {
      maxPoints: sed.maxPts,                               // 5
      npatTarget: sed.spendPercent / 100,                  // 0.01 (1% NPAT)
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
      ownership: { maxPoints: pc.ownership.maxPoints, basePoints: pc.ownership.basePoints, subMinimumPercent: pc.ownership.subMinimumPercent },       // 24
      managementControl: { maxPoints: pc.managementControl.maxPoints, basePoints: pc.managementControl.basePoints, subMinimumPercent: pc.managementControl.subMinimumPercent }, // 11
      employmentEquity: { maxPoints: pc.employmentEquity?.maxPoints ?? 18, basePoints: pc.employmentEquity?.basePoints }, // 18 = 15 base + 3 EAP bonus
      skillsDevelopment: { maxPoints: pc.skillsDevelopment.maxPoints, basePoints: pc.skillsDevelopment.basePoints, subMinimumPercent: pc.skillsDevelopment.subMinimumPercent }, // 15
      preferentialProcurement: { maxPoints: pc.preferentialProcurement.maxPoints, basePoints: pc.preferentialProcurement.basePoints, subMinimumPercent: pc.preferentialProcurement.subMinimumPercent }, // 20
      supplierDevelopment: { maxPoints: pc.supplierDevelopment.maxPoints, basePoints: pc.supplierDevelopment.basePoints, subMinimumPercent: pc.supplierDevelopment.subMinimumPercent }, // 15
      enterpriseDevelopment: { maxPoints: pc.enterpriseDevelopment.maxPoints, basePoints: pc.enterpriseDevelopment.basePoints, subMinimumPercent: pc.enterpriseDevelopment.subMinimumPercent }, // 0
      socioEconomicDevelopment: { maxPoints: pc.socioEconomicDevelopment.maxPoints },                            // 5
      yesInitiative: { maxPoints: pc.yesInitiative?.maxPoints ?? 0 },                                            // 0
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

/** Complete Transport Large config — use for scorecard, tests, and explicit sector wiring. */
export const TRANSPORT_GENERIC_CALCULATOR_CONFIG: CalculatorConfig =
  sectorConfigToTransportGenericCalculatorConfig(TRANSPORT_GENERIC);
