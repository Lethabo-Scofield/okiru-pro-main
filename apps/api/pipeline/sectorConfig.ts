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
  execBlackTarget: number;
  execBlackMaxPts: number;
  execBWTarget: number;
  execBWMaxPts: number;
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
  bonusMaxPts: number;
}

export interface EsdTargets {
  sdPercent: number;
  sdMaxPts: number;
  edPercent: number;
  edMaxPts: number;
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
    managementControl: PillarConfig;
    employmentEquity: PillarConfig;
    skillsDevelopment: PillarConfig;
    preferentialProcurement: PillarConfig;
    enterpriseSupplierDevelopment: PillarConfig;
    socioEconomicDevelopment: PillarConfig;
  };
  targets: {
    ownership: OwnershipTargets;
    managementControl: MCTargets;
    employmentEquity: EETargets;
    skills: SkillsTargets;
    procurement: ProcurementTargets;
    esd: EsdTargets;
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

export const RCOGP_GENERIC: SectorConfig = {
  sectorCode: 'RCOGP',
  sectorName: 'Revised Codes of Good Practice (Generic)',
  scorecardType: 'Generic',
  pillarConfigs: {
    ownership: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    managementControl: { maxPoints: 8, hasSubMinimum: false, subMinimumPercent: 0 },
    employmentEquity: { maxPoints: 11, hasSubMinimum: false, subMinimumPercent: 0 },
    skillsDevelopment: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    preferentialProcurement: { maxPoints: 27, hasSubMinimum: true, subMinimumPercent: 40 },
    enterpriseSupplierDevelopment: { maxPoints: 15, hasSubMinimum: false, subMinimumPercent: 0 },
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
      boardBlackTarget: 0.50, boardBlackMaxPts: 1,
      boardBWTarget: 0.25, boardBWMaxPts: 1,
      execBlackTarget: 0.60, execBlackMaxPts: 2,
      execBWTarget: 0.30, execBWMaxPts: 2,
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
      bo51Target: 0.40, bo51MaxPts: 10,
      bwo30Target: 0.12, bwo30MaxPts: 5,
      bonusMaxPts: 2,
    },
    esd: { sdPercent: 2.0, sdMaxPts: 10, edPercent: 1.0, edMaxPts: 5 },
    sed: { spendPercent: 1.0, maxPts: 5 },
  },
  levelThresholds: STANDARD_LEVELS,
};

// ---------------------------------------------------------------------------
// ICT Generic (Information & Communication Technology)
// ---------------------------------------------------------------------------

export const ICT_GENERIC: SectorConfig = {
  sectorCode: 'ICT',
  sectorName: 'ICT Sector Code (Generic)',
  scorecardType: 'Generic',
  pillarConfigs: {
    ownership: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    managementControl: { maxPoints: 8, hasSubMinimum: false, subMinimumPercent: 0 },
    employmentEquity: { maxPoints: 15, hasSubMinimum: false, subMinimumPercent: 0 },
    skillsDevelopment: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    preferentialProcurement: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    enterpriseSupplierDevelopment: { maxPoints: 15, hasSubMinimum: false, subMinimumPercent: 0 },
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
      execBlackTarget: 0.60, execBlackMaxPts: 3,
      execBWTarget: 0.30, execBWMaxPts: 2,
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
      bo51Target: 0.40, bo51MaxPts: 9,
      bwo30Target: 0.12, bwo30MaxPts: 4,
      bonusMaxPts: 2,
    },
    esd: { sdPercent: 2.0, sdMaxPts: 10, edPercent: 1.0, edMaxPts: 5 },
    sed: { spendPercent: 1.0, maxPts: 5 },
  },
  levelThresholds: STANDARD_LEVELS,
};

// ---------------------------------------------------------------------------
// FSC Generic (Financial Sector Code)
// ---------------------------------------------------------------------------

export const FSC_GENERIC: SectorConfig = {
  sectorCode: 'FSC',
  sectorName: 'Financial Sector Code (Generic)',
  scorecardType: 'Generic',
  pillarConfigs: {
    ownership: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    managementControl: { maxPoints: 8, hasSubMinimum: false, subMinimumPercent: 0 },
    employmentEquity: { maxPoints: 12, hasSubMinimum: false, subMinimumPercent: 0 },
    skillsDevelopment: { maxPoints: 20, hasSubMinimum: true, subMinimumPercent: 40 },
    preferentialProcurement: { maxPoints: 20, hasSubMinimum: true, subMinimumPercent: 40 },
    enterpriseSupplierDevelopment: { maxPoints: 15, hasSubMinimum: false, subMinimumPercent: 0 },
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
      execBlackTarget: 0.60, execBlackMaxPts: 3,
      execBWTarget: 0.30, execBWMaxPts: 2,
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
      bonusMaxPts: 2,
    },
    esd: { sdPercent: 2.0, sdMaxPts: 10, edPercent: 1.0, edMaxPts: 5 },
    sed: { spendPercent: 1.0, maxPts: 5 },
  },
  levelThresholds: STANDARD_LEVELS,
};

// ---------------------------------------------------------------------------
// Agri Generic (Agriculture / AgriBEE)
// ---------------------------------------------------------------------------

export const AGRI_GENERIC: SectorConfig = {
  sectorCode: 'AGRI',
  sectorName: 'AgriBEE Sector Code (Generic)',
  scorecardType: 'Generic',
  pillarConfigs: {
    ownership: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    managementControl: { maxPoints: 8, hasSubMinimum: false, subMinimumPercent: 0 },
    employmentEquity: { maxPoints: 11, hasSubMinimum: false, subMinimumPercent: 0 },
    skillsDevelopment: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    preferentialProcurement: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    enterpriseSupplierDevelopment: { maxPoints: 15, hasSubMinimum: false, subMinimumPercent: 0 },
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
      boardBlackTarget: 0.50, boardBlackMaxPts: 1,
      boardBWTarget: 0.25, boardBWMaxPts: 1,
      execBlackTarget: 0.60, execBlackMaxPts: 2,
      execBWTarget: 0.30, execBWMaxPts: 2,
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
      bo51Target: 0.40, bo51MaxPts: 9,
      bwo30Target: 0.12, bwo30MaxPts: 4,
      bonusMaxPts: 2,
    },
    esd: { sdPercent: 2.0, sdMaxPts: 10, edPercent: 1.0, edMaxPts: 5 },
    sed: { spendPercent: 1.0, maxPts: 5 },
  },
  levelThresholds: STANDARD_LEVELS,
};

// ---------------------------------------------------------------------------
// QSE Scorecard (for Qualifying Small Enterprises, R10m-R50m turnover)
// ---------------------------------------------------------------------------

export const RCOGP_QSE: SectorConfig = {
  sectorCode: 'RCOGP',
  sectorName: 'Revised Codes (QSE)',
  scorecardType: 'QSE',
  pillarConfigs: {
    ownership: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    managementControl: { maxPoints: 19, hasSubMinimum: false, subMinimumPercent: 0 },
    employmentEquity: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 },
    skillsDevelopment: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    preferentialProcurement: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    enterpriseSupplierDevelopment: { maxPoints: 25, hasSubMinimum: false, subMinimumPercent: 0 },
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
      execBlackTarget: 0.60, execBlackMaxPts: 4,
      execBWTarget: 0.30, execBWMaxPts: 4,
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
      bo51Target: 0.40, bo51MaxPts: 9,
      bwo30Target: 0.12, bwo30MaxPts: 4,
      bonusMaxPts: 2,
    },
    esd: { sdPercent: 2.0, sdMaxPts: 15, edPercent: 1.0, edMaxPts: 10 },
    sed: { spendPercent: 1.0, maxPts: 5 },
  },
  levelThresholds: STANDARD_LEVELS,
};

// ---------------------------------------------------------------------------
// ICT QSE (Information & Communication Technology - Qualifying Small Enterprise)
// ---------------------------------------------------------------------------

export const ICT_QSE: SectorConfig = {
  sectorCode: 'ICT',
  sectorName: 'ICT Sector Code (QSE)',
  scorecardType: 'QSE',
  pillarConfigs: {
    ownership: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    managementControl: { maxPoints: 19, hasSubMinimum: false, subMinimumPercent: 0 },
    employmentEquity: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 },
    skillsDevelopment: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    preferentialProcurement: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    enterpriseSupplierDevelopment: { maxPoints: 25, hasSubMinimum: false, subMinimumPercent: 0 },
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
      execBlackTarget: 0.60, execBlackMaxPts: 4,
      execBWTarget: 0.30, execBWMaxPts: 4,
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
      bo51Target: 0.40, bo51MaxPts: 9,
      bwo30Target: 0.12, bwo30MaxPts: 4,
      bonusMaxPts: 2,
    },
    esd: { sdPercent: 2.0, sdMaxPts: 15, edPercent: 1.0, edMaxPts: 10 },
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
