/**
 * Sector-Specific B-BBEE Configuration
 *
 * Each sector code (RCOGP, ICT, FSC, AGRI, etc.) defines its own
 * pillar weightings, compliance targets, sub-minimum thresholds,
 * and level determination tables.
 *
 * Reference: B-BBEE Act 53 of 2003, Amended Codes of Good Practice,
 * and Sector-Specific Codes (ICT, FSC, AgriBEE, etc.)
 */

export interface PillarConfig {
  maxPoints: number;
  hasSubMinimum: boolean;
  subMinimumPercent: number;
}

export interface OwnershipTargets {
  votingRightsTarget: number;
  votingRightsMaxPts: number;
  womenVotingTarget: number;
  womenVotingMaxPts: number;
  economicInterestTarget: number;
  economicInterestMaxPts: number;
  womenEITarget: number;
  womenEIMaxPts: number;
  netValueMaxPts: number;
  newEntrantsMaxPts: number;
}

export interface MCTargets {
  boardBlackTarget: number;
  boardBlackMaxPts: number;
  boardBWTarget: number;
  boardBWMaxPts: number;
  execBlackTarget: number;           // Executive Directors Black: 50% (NOT 60%)
  execBlackMaxPts: number;
  execBWTarget: number;              // Executive Directors Women: 25% (NOT 30%)
  execBWMaxPts: number;
  otherExecBlackTarget: number;      // Other Exec Black: 60%
  otherExecBlackMaxPts: number;
  otherExecBWTarget: number;         // Other Exec Women: 30%
  otherExecBWMaxPts: number;
  seniorMaxPts: number;
  seniorBWMaxPts: number;
  middleMaxPts: number;
  middleBWMaxPts: number;
  juniorMaxPts: number;
  juniorBWMaxPts: number;
}

export interface EETargets {
  seniorMaxPts: number;
  middleMaxPts: number;
  juniorMaxPts: number;
  disabledMaxPts: number;
  disabledTarget: number;
}

export interface SkillsTargets {
  overallSpendPercent: number;
  overallMaxPts: number;
  bursarySpendPercent: number;
  bursaryMaxPts: number;
}

export interface ProcurementTargets {
  allSuppliersTarget: number;
  allSuppliersMaxPts: number;
  qseTarget: number;
  qseMaxPts: number;
  emeTarget: number;
  emeMaxPts: number;
  bo51Target: number;
  bo51MaxPts: number;
  bwo30Target: number;
  bwo30MaxPts: number;
  dgTarget: number;      // Designated Group target (bonus row)
  dgMaxPts: number;      // Designated Group max points
  // NOTE: Procurement has NO bonus points - bonuses are ED only
}

export interface EsdTargets {
  sdPercent: number;
  sdMaxPts: number;
  edPercent: number;
  edMaxPts: number;              // Base ED points (5 for RCOGP Generic)
  edGraduationBonus: number;     // ED Bonus 1: graduation
  edJobsBonus: number;           // ED Bonus 2: jobs created
  // NOTE: Bonuses are ED-only. Procurement does NOT have graduation/jobs bonuses.
}

export interface SedTargets {
  spendPercent: number;
  maxPts: number;
}

export interface SectorConfig {
  sectorCode: string;
  sectorName: string;
  scorecardType: 'Generic' | 'QSE' | 'EME';
  pillarConfigs: {
    ownership: PillarConfig;
    managementControl: PillarConfig;        // Combined MC + EE (19 pts for RCOGP Generic)
    employmentEquity?: PillarConfig;      // Optional - included in MC for most codes
    skillsDevelopment: PillarConfig;
    preferentialProcurement: PillarConfig;
    supplierDevelopment: PillarConfig;      // Separated from combined ESD
    enterpriseDevelopment: PillarConfig;    // Separated from combined ESD (includes 2 bonus pts)
    socioEconomicDevelopment: PillarConfig;
  };
  targets: {
    ownership: OwnershipTargets;
    managementControl: MCTargets;          // Board + Exec targets (50% Black / 25% Women for exec directors)
    employmentEquity: EETargets;           // Senior/Middle/Junior/Disabled (EAP-based)
    skills: SkillsTargets;
    procurement: ProcurementTargets;       // Includes DG 2% bonus row
    esd: EsdTargets;                       // SD + ED targets (ED includes graduation/jobs bonuses)
    sed: SedTargets;
  };
  levelThresholds: Array<{ level: number; minPoints: number; recognition: number }>;
}

// ---------------------------------------------------------------------------
// Standard level thresholds (used by most codes)
// ---------------------------------------------------------------------------

const STANDARD_LEVELS = [
  { level: 1, minPoints: 100, recognition: 135 },
  { level: 2, minPoints: 95, recognition: 125 },
  { level: 3, minPoints: 90, recognition: 110 },
  { level: 4, minPoints: 80, recognition: 100 },
  { level: 5, minPoints: 75, recognition: 80 },
  { level: 6, minPoints: 70, recognition: 60 },
  { level: 7, minPoints: 55, recognition: 50 },
  { level: 8, minPoints: 40, recognition: 10 },
];

// ---------------------------------------------------------------------------
// RCOGP Generic (Revised Codes of Good Practice)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// RCOGP Generic (Revised Codes of Good Practice)
// VERIFIED AGAINST: BBBEE Toolkit (RCOGP)_Template_v.1.4.xlsx
// Grand Total: 120 points (NOT 111, NOT 132)
// MC: 19 combined (NOT 8+11 split)
// PP: 29 (BO51=11 at 50%, DG=2 at 2% - bonus row)
// ESD: SD=10 + ED=7 (5 base + 2 bonuses)
// ---------------------------------------------------------------------------

export const RCOGP_GENERIC: SectorConfig = {
  sectorCode: 'RCOGP',
  sectorName: 'Revised Codes of Good Practice (Generic)',
  scorecardType: 'Generic',
  pillarConfigs: {
    ownership: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    managementControl: { maxPoints: 19, hasSubMinimum: false, subMinimumPercent: 0 },  // FIXED: was 8
    skillsDevelopment: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    preferentialProcurement: { maxPoints: 29, hasSubMinimum: true, subMinimumPercent: 40 },  // FIXED: was 27
    supplierDevelopment: { maxPoints: 10, hasSubMinimum: true, subMinimumPercent: 40 },  // NEW: separated from ESD
    enterpriseDevelopment: { maxPoints: 7, hasSubMinimum: false, subMinimumPercent: 0 },  // NEW: 5 base + 2 bonuses
    socioEconomicDevelopment: { maxPoints: 5, hasSubMinimum: false, subMinimumPercent: 0 },
    // NOTE: employmentEquity is INCLUDED in managementControl (19 pts combined)
  },
  targets: {
    ownership: {
      votingRightsTarget: 0.25, votingRightsMaxPts: 4,
      womenVotingTarget: 0.10, womenVotingMaxPts: 2,
      economicInterestTarget: 0.25, economicInterestMaxPts: 8,
      womenEITarget: 0.10, womenEIMaxPts: 2,
      netValueMaxPts: 8, newEntrantsMaxPts: 1,
    },
    managementControl: {
      // Board representation
      boardBlackTarget: 0.50, boardBlackMaxPts: 2,   // FIXED: was 1
      boardBWTarget: 0.25, boardBWMaxPts: 1,
      // Executive Directors (the critical fix!)
      execBlackTarget: 0.50, execBlackMaxPts: 2,   // FIXED: was 0.60
      execBWTarget: 0.25, execBWMaxPts: 1,        // FIXED: was 0.30 (was 2 pts)
      // Other Executives
      otherExecBlackTarget: 0.60, otherExecBlackMaxPts: 2,
      otherExecBWTarget: 0.30, otherExecBWMaxPts: 1,
      // Senior/Middle/Junior - these are used with EAP-based targets from separate lookup
      seniorMaxPts: 2, seniorBWMaxPts: 1,
      middleMaxPts: 2, middleBWMaxPts: 1,
      juniorMaxPts: 1, juniorBWMaxPts: 1,
    },
    employmentEquity: {
      // These max pts are part of the 19 total in managementControl
      seniorMaxPts: 2, middleMaxPts: 2, juniorMaxPts: 1,
      disabledMaxPts: 2, disabledTarget: 0.03,  // 3% of headcount
    },
    skills: {
      overallSpendPercent: 3.5, overallMaxPts: 6,   // FIXED: was 20
      bursarySpendPercent: 2.5, bursaryMaxPts: 4,  // FIXED: was 5
    },
    procurement: {
      allSuppliersTarget: 0.80, allSuppliersMaxPts: 5,
      qseTarget: 0.15, qseMaxPts: 3,
      emeTarget: 0.15, emeMaxPts: 4,
      bo51Target: 0.50, bo51MaxPts: 11,   // FIXED: was 0.40, 10
      bwo30Target: 0.12, bwo30MaxPts: 4,   // FIXED: was 5
      dgTarget: 0.02, dgMaxPts: 2,          // NEW: Designated Group bonus row (was missing!)
      // NOTE: NO procurement bonuses - bonuses are ED-only
    },
    esd: {
      sdPercent: 2.0, sdMaxPts: 10,
      edPercent: 1.0, edMaxPts: 5,        // Base ED points
      edGraduationBonus: 1,               // Bonus 1 for graduations
      edJobsBonus: 1,                     // Bonus 2 for jobs created
    },
    sed: { spendPercent: 1.0, maxPts: 5 },
  },
  levelThresholds: STANDARD_LEVELS,
};
// Grand total verification: 25+19+25+29+10+7+5 = 120

// ---------------------------------------------------------------------------
// ICT Generic (Information & Communication Technology)
// TODO: Verify against ICT Sector Code toolkit Excel
// ---------------------------------------------------------------------------

export const ICT_GENERIC: SectorConfig = {
  sectorCode: 'ICT',
  sectorName: 'ICT Sector Code (Generic)',
  scorecardType: 'Generic',
  pillarConfigs: {
    ownership: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    managementControl: { maxPoints: 23, hasSubMinimum: false, subMinimumPercent: 0 },  // 8+15 combined
    employmentEquity: { maxPoints: 15, hasSubMinimum: false, subMinimumPercent: 0 },
    skillsDevelopment: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    preferentialProcurement: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    supplierDevelopment: { maxPoints: 10, hasSubMinimum: true, subMinimumPercent: 40 },
    enterpriseDevelopment: { maxPoints: 5, hasSubMinimum: false, subMinimumPercent: 0 },
    socioEconomicDevelopment: { maxPoints: 5, hasSubMinimum: false, subMinimumPercent: 0 },
  },
  targets: {
    ownership: {
      votingRightsTarget: 0.25, votingRightsMaxPts: 4,
      womenVotingTarget: 0.10, womenVotingMaxPts: 2,
      economicInterestTarget: 0.25, economicInterestMaxPts: 8,
      womenEITarget: 0.10, womenEIMaxPts: 2,
      netValueMaxPts: 8, newEntrantsMaxPts: 1,
    },
    managementControl: {
      boardBlackTarget: 0.50, boardBlackMaxPts: 2,
      boardBWTarget: 0.25, boardBWMaxPts: 1,
      execBlackTarget: 0.50, execBlackMaxPts: 3,
      execBWTarget: 0.25, execBWMaxPts: 2,
      otherExecBlackTarget: 0.60, otherExecBlackMaxPts: 2,
      otherExecBWTarget: 0.30, otherExecBWMaxPts: 1,
      seniorMaxPts: 6, seniorBWMaxPts: 3,
      middleMaxPts: 5, middleBWMaxPts: 2,
      juniorMaxPts: 2, juniorBWMaxPts: 1,
    },
    employmentEquity: {
      seniorMaxPts: 6, middleMaxPts: 5, juniorMaxPts: 2,
      disabledMaxPts: 2, disabledTarget: 0.02,
    },
    skills: {
      overallSpendPercent: 3.5, overallMaxPts: 20,
      bursarySpendPercent: 2.5, bursaryMaxPts: 5,
    },
    procurement: {
      allSuppliersTarget: 0.80, allSuppliersMaxPts: 5,
      qseTarget: 0.15, qseMaxPts: 3,
      emeTarget: 0.15, emeMaxPts: 4,
      bo51Target: 0.50, bo51MaxPts: 9,
      bwo30Target: 0.12, bwo30MaxPts: 4,
      dgTarget: 0.02, dgMaxPts: 2,
    },
    esd: { sdPercent: 2.0, sdMaxPts: 10, edPercent: 1.0, edMaxPts: 5, edGraduationBonus: 0, edJobsBonus: 0 },
    sed: { spendPercent: 1.0, maxPts: 5 },
  },
  levelThresholds: STANDARD_LEVELS,
};

// ---------------------------------------------------------------------------
// FSC Generic (Financial Sector Code)
// TODO: Verify against FSC Sector Code toolkit Excel
// ---------------------------------------------------------------------------

export const FSC_GENERIC: SectorConfig = {
  sectorCode: 'FSC',
  sectorName: 'Financial Sector Code (Generic)',
  scorecardType: 'Generic',
  pillarConfigs: {
    ownership: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    managementControl: { maxPoints: 20, hasSubMinimum: false, subMinimumPercent: 0 },  // 8+12 combined
    employmentEquity: { maxPoints: 12, hasSubMinimum: false, subMinimumPercent: 0 },
    skillsDevelopment: { maxPoints: 20, hasSubMinimum: true, subMinimumPercent: 40 },
    preferentialProcurement: { maxPoints: 20, hasSubMinimum: true, subMinimumPercent: 40 },
    supplierDevelopment: { maxPoints: 10, hasSubMinimum: true, subMinimumPercent: 40 },
    enterpriseDevelopment: { maxPoints: 5, hasSubMinimum: false, subMinimumPercent: 0 },
    socioEconomicDevelopment: { maxPoints: 5, hasSubMinimum: false, subMinimumPercent: 0 },
  },
  targets: {
    ownership: {
      votingRightsTarget: 0.25, votingRightsMaxPts: 4,
      womenVotingTarget: 0.10, womenVotingMaxPts: 2,
      economicInterestTarget: 0.25, economicInterestMaxPts: 8,
      womenEITarget: 0.10, womenEIMaxPts: 2,
      netValueMaxPts: 8, newEntrantsMaxPts: 1,
    },
    managementControl: {
      boardBlackTarget: 0.50, boardBlackMaxPts: 2,
      boardBWTarget: 0.25, boardBWMaxPts: 1,
      execBlackTarget: 0.50, execBlackMaxPts: 3,
      execBWTarget: 0.25, execBWMaxPts: 2,
      otherExecBlackTarget: 0.60, otherExecBlackMaxPts: 2,
      otherExecBWTarget: 0.30, otherExecBWMaxPts: 1,
      seniorMaxPts: 5, seniorBWMaxPts: 2,
      middleMaxPts: 4, middleBWMaxPts: 2,
      juniorMaxPts: 2, juniorBWMaxPts: 1,
    },
    employmentEquity: {
      seniorMaxPts: 5, middleMaxPts: 4, juniorMaxPts: 2,
      disabledMaxPts: 1, disabledTarget: 0.03,
    },
    skills: {
      overallSpendPercent: 3.5, overallMaxPts: 15,
      bursarySpendPercent: 2.5, bursaryMaxPts: 5,
    },
    procurement: {
      allSuppliersTarget: 0.80, allSuppliersMaxPts: 5,
      qseTarget: 0.10, qseMaxPts: 3,
      emeTarget: 0.12, emeMaxPts: 3,
      bo51Target: 0.30, bo51MaxPts: 5,
      bwo30Target: 0.10, bwo30MaxPts: 4,
      dgTarget: 0.02, dgMaxPts: 2,
    },
    esd: { sdPercent: 2.0, sdMaxPts: 10, edPercent: 1.0, edMaxPts: 5, edGraduationBonus: 0, edJobsBonus: 0 },
    sed: { spendPercent: 1.0, maxPts: 5 },
  },
  levelThresholds: STANDARD_LEVELS,
};

// ---------------------------------------------------------------------------
// Agri Generic (Agriculture / AgriBEE)
// TODO: Verify against AgriBEE Sector Code toolkit Excel
// ---------------------------------------------------------------------------

export const AGRI_GENERIC: SectorConfig = {
  sectorCode: 'AGRI',
  sectorName: 'AgriBEE Sector Code (Generic)',
  scorecardType: 'Generic',
  pillarConfigs: {
    ownership: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    managementControl: { maxPoints: 19, hasSubMinimum: false, subMinimumPercent: 0 },  // 8+11 combined
    employmentEquity: { maxPoints: 11, hasSubMinimum: false, subMinimumPercent: 0 },
    skillsDevelopment: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    preferentialProcurement: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    supplierDevelopment: { maxPoints: 10, hasSubMinimum: true, subMinimumPercent: 40 },
    enterpriseDevelopment: { maxPoints: 5, hasSubMinimum: false, subMinimumPercent: 0 },
    socioEconomicDevelopment: { maxPoints: 5, hasSubMinimum: false, subMinimumPercent: 0 },
  },
  targets: {
    ownership: {
      votingRightsTarget: 0.25, votingRightsMaxPts: 4,
      womenVotingTarget: 0.10, womenVotingMaxPts: 2,
      economicInterestTarget: 0.25, economicInterestMaxPts: 8,
      womenEITarget: 0.10, womenEIMaxPts: 2,
      netValueMaxPts: 8, newEntrantsMaxPts: 1,
    },
    managementControl: {
      boardBlackTarget: 0.50, boardBlackMaxPts: 2,
      boardBWTarget: 0.25, boardBWMaxPts: 1,
      execBlackTarget: 0.50, execBlackMaxPts: 2,
      execBWTarget: 0.25, execBWMaxPts: 1,
      otherExecBlackTarget: 0.60, otherExecBlackMaxPts: 2,
      otherExecBWTarget: 0.30, otherExecBWMaxPts: 1,
      seniorMaxPts: 5, seniorBWMaxPts: 2,
      middleMaxPts: 4, middleBWMaxPts: 2,
      juniorMaxPts: 4, juniorBWMaxPts: 2,
    },
    employmentEquity: {
      seniorMaxPts: 5, middleMaxPts: 4, juniorMaxPts: 4,
      disabledMaxPts: 2, disabledTarget: 0.02,
    },
    skills: {
      overallSpendPercent: 3.5, overallMaxPts: 20,
      bursarySpendPercent: 2.5, bursaryMaxPts: 5,
    },
    procurement: {
      allSuppliersTarget: 0.80, allSuppliersMaxPts: 5,
      qseTarget: 0.15, qseMaxPts: 3,
      emeTarget: 0.15, emeMaxPts: 4,
      bo51Target: 0.50, bo51MaxPts: 9,
      bwo30Target: 0.12, bwo30MaxPts: 4,
      dgTarget: 0.02, dgMaxPts: 2,
    },
    esd: { sdPercent: 2.0, sdMaxPts: 10, edPercent: 1.0, edMaxPts: 5, edGraduationBonus: 0, edJobsBonus: 0 },
    sed: { spendPercent: 1.0, maxPts: 5 },
  },
  levelThresholds: STANDARD_LEVELS,
};

// ---------------------------------------------------------------------------
// QSE Scorecard (for Qualifying Small Enterprises, R10m-R50m turnover)
// TODO: Verify against QSE toolkit Excel
// ---------------------------------------------------------------------------

export const RCOGP_QSE: SectorConfig = {
  sectorCode: 'RCOGP',
  sectorName: 'Revised Codes (QSE)',
  scorecardType: 'QSE',
  pillarConfigs: {
    ownership: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    managementControl: { maxPoints: 19, hasSubMinimum: false, subMinimumPercent: 0 },
    skillsDevelopment: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    preferentialProcurement: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    supplierDevelopment: { maxPoints: 15, hasSubMinimum: true, subMinimumPercent: 40 },  // Combined higher for QSE
    enterpriseDevelopment: { maxPoints: 10, hasSubMinimum: false, subMinimumPercent: 0 },
    socioEconomicDevelopment: { maxPoints: 5, hasSubMinimum: false, subMinimumPercent: 0 },
    // NOTE: employmentEquity is INCLUDED in managementControl for QSE
  },
  targets: {
    ownership: {
      votingRightsTarget: 0.25, votingRightsMaxPts: 4,
      womenVotingTarget: 0.10, womenVotingMaxPts: 2,
      economicInterestTarget: 0.25, economicInterestMaxPts: 8,
      womenEITarget: 0.10, womenEIMaxPts: 2,
      netValueMaxPts: 8, newEntrantsMaxPts: 1,
    },
    managementControl: {
      boardBlackTarget: 0.50, boardBlackMaxPts: 3,
      boardBWTarget: 0.25, boardBWMaxPts: 2,
      execBlackTarget: 0.50, execBlackMaxPts: 4,
      execBWTarget: 0.25, execBWMaxPts: 4,
      otherExecBlackTarget: 0.60, otherExecBlackMaxPts: 3,
      otherExecBWTarget: 0.30, otherExecBWMaxPts: 2,
      seniorMaxPts: 0, seniorBWMaxPts: 0,
      middleMaxPts: 0, middleBWMaxPts: 0,
      juniorMaxPts: 0, juniorBWMaxPts: 0,
    },
    employmentEquity: {
      seniorMaxPts: 0, middleMaxPts: 0, juniorMaxPts: 0,
      disabledMaxPts: 2, disabledTarget: 0.02,
    },
    skills: {
      overallSpendPercent: 3.5, overallMaxPts: 20,
      bursarySpendPercent: 2.5, bursaryMaxPts: 5,
    },
    procurement: {
      allSuppliersTarget: 0.80, allSuppliersMaxPts: 5,
      qseTarget: 0.15, qseMaxPts: 3,
      emeTarget: 0.15, emeMaxPts: 4,
      bo51Target: 0.50, bo51MaxPts: 9,
      bwo30Target: 0.12, bwo30MaxPts: 4,
      dgTarget: 0.02, dgMaxPts: 2,
    },
    esd: { sdPercent: 2.0, sdMaxPts: 15, edPercent: 1.0, edMaxPts: 10, edGraduationBonus: 0, edJobsBonus: 0 },
    sed: { spendPercent: 1.0, maxPts: 5 },
  },
  levelThresholds: STANDARD_LEVELS,
};

// ---------------------------------------------------------------------------
// ICT QSE (Information & Communication Technology - Qualifying Small Enterprise)
// TODO: Verify against ICT QSE toolkit Excel
// ---------------------------------------------------------------------------

export const ICT_QSE: SectorConfig = {
  sectorCode: 'ICT',
  sectorName: 'ICT Sector Code (QSE)',
  scorecardType: 'QSE',
  pillarConfigs: {
    ownership: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    managementControl: { maxPoints: 19, hasSubMinimum: false, subMinimumPercent: 0 },
    skillsDevelopment: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    preferentialProcurement: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    supplierDevelopment: { maxPoints: 15, hasSubMinimum: true, subMinimumPercent: 40 },
    enterpriseDevelopment: { maxPoints: 10, hasSubMinimum: false, subMinimumPercent: 0 },
    socioEconomicDevelopment: { maxPoints: 5, hasSubMinimum: false, subMinimumPercent: 0 },
  },
  targets: {
    ownership: {
      votingRightsTarget: 0.25, votingRightsMaxPts: 4,
      womenVotingTarget: 0.10, womenVotingMaxPts: 2,
      economicInterestTarget: 0.25, economicInterestMaxPts: 8,
      womenEITarget: 0.10, womenEIMaxPts: 2,
      netValueMaxPts: 8, newEntrantsMaxPts: 1,
    },
    managementControl: {
      boardBlackTarget: 0.50, boardBlackMaxPts: 3,
      boardBWTarget: 0.25, boardBWMaxPts: 2,
      execBlackTarget: 0.50, execBlackMaxPts: 4,
      execBWTarget: 0.25, execBWMaxPts: 4,
      otherExecBlackTarget: 0.60, otherExecBlackMaxPts: 3,
      otherExecBWTarget: 0.30, otherExecBWMaxPts: 2,
      seniorMaxPts: 0, seniorBWMaxPts: 0,
      middleMaxPts: 0, middleBWMaxPts: 0,
      juniorMaxPts: 0, juniorBWMaxPts: 0,
    },
    employmentEquity: {
      seniorMaxPts: 0, middleMaxPts: 0, juniorMaxPts: 0,
      disabledMaxPts: 2, disabledTarget: 0.02,
    },
    skills: {
      overallSpendPercent: 3.5, overallMaxPts: 20,
      bursarySpendPercent: 2.5, bursaryMaxPts: 5,
    },
    procurement: {
      allSuppliersTarget: 0.80, allSuppliersMaxPts: 5,
      qseTarget: 0.15, qseMaxPts: 3,
      emeTarget: 0.15, emeMaxPts: 4,
      bo51Target: 0.50, bo51MaxPts: 9,
      bwo30Target: 0.12, bwo30MaxPts: 4,
      dgTarget: 0.02, dgMaxPts: 2,
    },
    esd: { sdPercent: 2.0, sdMaxPts: 15, edPercent: 1.0, edMaxPts: 10, edGraduationBonus: 0, edJobsBonus: 0 },
    sed: { spendPercent: 1.0, maxPts: 5 },
  },
  levelThresholds: STANDARD_LEVELS,
};

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

const ALL_CONFIGS: SectorConfig[] = [
  RCOGP_GENERIC, ICT_GENERIC, FSC_GENERIC, AGRI_GENERIC, RCOGP_QSE, ICT_QSE,
];

export function getSectorConfig(sectorCode: string, scorecardType: string = 'Generic'): SectorConfig {
  const match = ALL_CONFIGS.find(c =>
    c.sectorCode.toLowerCase() === sectorCode.toLowerCase() &&
    c.scorecardType.toLowerCase() === scorecardType.toLowerCase()
  );
  return match || RCOGP_GENERIC;
}

export function detectSectorFromName(nameOrSector: string): SectorConfig {
  const lower = (nameOrSector || '').toLowerCase();
  const hasICT = /ict|information.*communic|technology|telecom|software|digital/i.test(lower);
  const hasQSE = /qse|qualifying\s*small/i.test(lower);
  if (hasICT && hasQSE) return ICT_QSE;
  if (hasICT) return ICT_GENERIC;
  if (/fsc|financial\s*sector|banking|insurance|investment/i.test(lower)) return FSC_GENERIC;
  if (/agri|agriculture|farming|agribee/i.test(lower)) return AGRI_GENERIC;
  if (hasQSE) return RCOGP_QSE;
  return RCOGP_GENERIC;
}

export function listSectorConfigs(): Array<{ code: string; name: string; type: string }> {
  return ALL_CONFIGS.map(c => ({ code: c.sectorCode, name: c.sectorName, type: c.scorecardType }));
}
