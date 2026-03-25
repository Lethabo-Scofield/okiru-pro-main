export interface SectorCfg {
  sectorCode: string;
  sectorName: string;
  scorecardType: 'Generic' | 'QSE';
  ownership:    { votingMaxPts: number; womenVotingMaxPts: number; eiMaxPts: number; womenEIMaxPts: number; netValueMaxPts: number; maxPoints: number; votingTarget: number; womenVotingTarget: number; eiTarget: number; womenEITarget: number; subMinPct: number; };
  mc:           { boardBlackMaxPts: number; boardBWMaxPts: number; execBlackMaxPts: number; execBWMaxPts: number; boardBlackTarget: number; boardBWTarget: number; execBlackTarget: number; execBWTarget: number; maxPoints: number; };
  ee:           { seniorMaxPts: number; middleMaxPts: number; juniorMaxPts: number; disabledMaxPts: number; disabledTarget: number; maxPoints: number; };
  skills:       { overallSpendPct: number; overallMaxPts: number; bursarySpendPct: number; bursaryMaxPts: number; maxPoints: number; subMinPct: number; };
  procurement:  { allMaxPts: number; qseMaxPts: number; emeMaxPts: number; bo51MaxPts: number; bwo30MaxPts: number; bonusMaxPts: number; maxPoints: number; subMinPct: number; allTarget: number; qseTarget: number; emeTarget: number; bo51Target: number; bwo30Target: number; };
  esd:          { sdPct: number; sdMaxPts: number; edPct: number; edMaxPts: number; maxPoints: number; };
  sed:          { spendPct: number; maxPoints: number; };
  yes:          { maxPoints: number; };
  levels:       Array<{ minPoints: number; label: string; recognition: number; level: number }>;
}

const STANDARD_LEVELS = [
  { level: 1, minPoints: 100, label: 'Level 1', recognition: 1.35 },
  { level: 2, minPoints: 95, label: 'Level 2', recognition: 1.25 },
  { level: 3, minPoints: 90, label: 'Level 3', recognition: 1.10 },
  { level: 4, minPoints: 80, label: 'Level 4', recognition: 1.00 },
  { level: 5, minPoints: 75, label: 'Level 5', recognition: 0.80 },
  { level: 6, minPoints: 70, label: 'Level 6', recognition: 0.60 },
  { level: 7, minPoints: 55, label: 'Level 7', recognition: 0.50 },
  { level: 8, minPoints: 40, label: 'Level 8', recognition: 0.10 },
];

export const RCOGP_GENERIC_CFG: SectorCfg = {
  sectorCode: 'RCOGP',
  sectorName: 'Revised Codes of Good Practice (Generic)',
  scorecardType: 'Generic',
  ownership:   { votingMaxPts: 4, womenVotingMaxPts: 2, eiMaxPts: 8, womenEIMaxPts: 2, netValueMaxPts: 8, maxPoints: 25, votingTarget: 0.25, womenVotingTarget: 0.10, eiTarget: 0.25, womenEITarget: 0.10, subMinPct: 0.40 },
  mc:          { boardBlackMaxPts: 1, boardBWMaxPts: 1, execBlackMaxPts: 2, execBWMaxPts: 2, boardBlackTarget: 0.50, boardBWTarget: 0.25, execBlackTarget: 0.60, execBWTarget: 0.30, maxPoints: 8 },
  ee:          { seniorMaxPts: 5, middleMaxPts: 4, juniorMaxPts: 4, disabledMaxPts: 2, disabledTarget: 0.02, maxPoints: 11 }, // Total 19 when combined with MC
  skills:      { overallSpendPct: 0.035, overallMaxPts: 20, bursarySpendPct: 0.025, bursaryMaxPts: 5, maxPoints: 25, subMinPct: 0.40 },
  procurement: { allMaxPts: 5, qseMaxPts: 3, emeMaxPts: 4, bo51MaxPts: 10, bwo30MaxPts: 5, bonusMaxPts: 2, maxPoints: 27, subMinPct: 0.40, allTarget: 0.80, qseTarget: 0.15, emeTarget: 0.15, bo51Target: 0.40, bwo30Target: 0.12 },
  esd:         { sdPct: 0.02, sdMaxPts: 10, edPct: 0.01, edMaxPts: 5, maxPoints: 15 },
  sed:         { spendPct: 0.01, maxPoints: 5 },
  yes:         { maxPoints: 5 },
  levels:      STANDARD_LEVELS,
};

export const RCOGP_QSE_CFG: SectorCfg = {
  sectorCode: 'RCOGP',
  sectorName: 'Revised Codes of Good Practice (QSE)',
  scorecardType: 'QSE',
  ownership:   { votingMaxPts: 4, womenVotingMaxPts: 2, eiMaxPts: 8, womenEIMaxPts: 2, netValueMaxPts: 8, maxPoints: 25, votingTarget: 0.25, womenVotingTarget: 0.10, eiTarget: 0.25, womenEITarget: 0.10, subMinPct: 0.40 },
  mc:          { boardBlackMaxPts: 3, boardBWMaxPts: 2, execBlackMaxPts: 4, execBWMaxPts: 4, boardBlackTarget: 0.50, boardBWTarget: 0.25, execBlackTarget: 0.60, execBWTarget: 0.30, maxPoints: 19 },
  ee:          { seniorMaxPts: 0, middleMaxPts: 0, juniorMaxPts: 0, disabledMaxPts: 0, disabledTarget: 0.0, maxPoints: 0 }, // Merged
  skills:      { overallSpendPct: 0.035, overallMaxPts: 20, bursarySpendPct: 0.025, bursaryMaxPts: 5, maxPoints: 25, subMinPct: 0.40 },
  procurement: { allMaxPts: 10, qseMaxPts: 0, emeMaxPts: 0, bo51MaxPts: 10, bwo30MaxPts: 5, bonusMaxPts: 0, maxPoints: 25, subMinPct: 0.40, allTarget: 0.60, qseTarget: 0, emeTarget: 0, bo51Target: 0.15, bwo30Target: 0.15 },
  esd:         { sdPct: 0.02, sdMaxPts: 15, edPct: 0.01, edMaxPts: 10, maxPoints: 25 },
  sed:         { spendPct: 0.01, maxPoints: 5 },
  yes:         { maxPoints: 5 },
  levels:      STANDARD_LEVELS,
};

export const ICT_GENERIC_CFG: SectorCfg = {
  sectorCode: 'ICT',
  sectorName: 'ICT Sector Code (Generic)',
  scorecardType: 'Generic',
  ownership:   { votingMaxPts: 4, womenVotingMaxPts: 2, eiMaxPts: 8, womenEIMaxPts: 2, netValueMaxPts: 8, maxPoints: 25, votingTarget: 0.25, womenVotingTarget: 0.10, eiTarget: 0.25, womenEITarget: 0.10, subMinPct: 0.40 },
  mc:          { boardBlackMaxPts: 2, boardBWMaxPts: 1, execBlackMaxPts: 3, execBWMaxPts: 2, boardBlackTarget: 0.50, boardBWTarget: 0.25, execBlackTarget: 0.60, execBWTarget: 0.30, maxPoints: 8 },
  ee:          { seniorMaxPts: 6, middleMaxPts: 5, juniorMaxPts: 2, disabledMaxPts: 2, disabledTarget: 0.02, maxPoints: 15 },
  skills:      { overallSpendPct: 0.035, overallMaxPts: 20, bursarySpendPct: 0.025, bursaryMaxPts: 5, maxPoints: 25, subMinPct: 0.40 },
  procurement: { allMaxPts: 5, qseMaxPts: 3, emeMaxPts: 4, bo51MaxPts: 9, bwo30MaxPts: 4, bonusMaxPts: 2, maxPoints: 25, subMinPct: 0.40, allTarget: 0.80, qseTarget: 0.15, emeTarget: 0.15, bo51Target: 0.50, bwo30Target: 0.12 },
  esd:         { sdPct: 0.02, sdMaxPts: 10, edPct: 0.01, edMaxPts: 5, maxPoints: 15 },
  sed:         { spendPct: 0.01, maxPoints: 5 },
  yes:         { maxPoints: 5 },
  levels:      STANDARD_LEVELS,
};

export const FSC_GENERIC_CFG: SectorCfg = {
  sectorCode: 'FSC',
  sectorName: 'Financial Sector Code (Generic)',
  scorecardType: 'Generic',
  ownership:   { votingMaxPts: 4, womenVotingMaxPts: 2, eiMaxPts: 8, womenEIMaxPts: 2, netValueMaxPts: 8, maxPoints: 25, votingTarget: 0.25, womenVotingTarget: 0.10, eiTarget: 0.25, womenEITarget: 0.10, subMinPct: 0.40 },
  mc:          { boardBlackMaxPts: 2, boardBWMaxPts: 1, execBlackMaxPts: 3, execBWMaxPts: 2, boardBlackTarget: 0.50, boardBWTarget: 0.25, execBlackTarget: 0.60, execBWTarget: 0.30, maxPoints: 8 },
  ee:          { seniorMaxPts: 5, middleMaxPts: 4, juniorMaxPts: 2, disabledMaxPts: 1, disabledTarget: 0.03, maxPoints: 12 },
  skills:      { overallSpendPct: 0.035, overallMaxPts: 15, bursarySpendPct: 0.025, bursaryMaxPts: 5, maxPoints: 20, subMinPct: 0.40 },
  procurement: { allMaxPts: 5, qseMaxPts: 3, emeMaxPts: 4, bo51MaxPts: 5, bwo30MaxPts: 3, bonusMaxPts: 2, maxPoints: 20, subMinPct: 0.40, allTarget: 0.80, qseTarget: 0.15, emeTarget: 0.15, bo51Target: 0.40, bwo30Target: 0.12 },
  esd:         { sdPct: 0.02, sdMaxPts: 10, edPct: 0.01, edMaxPts: 5, maxPoints: 15 },
  sed:         { spendPct: 0.01, maxPoints: 5 },
  yes:         { maxPoints: 5 },
  levels:      STANDARD_LEVELS,
};

export const AGRI_GENERIC_CFG: SectorCfg = {
  sectorCode: 'AGRI',
  sectorName: 'Agriculture Sector (Generic)',
  scorecardType: 'Generic',
  ownership:   { votingMaxPts: 4, womenVotingMaxPts: 2, eiMaxPts: 8, womenEIMaxPts: 2, netValueMaxPts: 8, maxPoints: 25, votingTarget: 0.25, womenVotingTarget: 0.10, eiTarget: 0.25, womenEITarget: 0.10, subMinPct: 0.40 },
  mc:          { boardBlackMaxPts: 1, boardBWMaxPts: 1, execBlackMaxPts: 2, execBWMaxPts: 2, boardBlackTarget: 0.50, boardBWTarget: 0.25, execBlackTarget: 0.60, execBWTarget: 0.30, maxPoints: 8 },
  ee:          { seniorMaxPts: 5, middleMaxPts: 4, juniorMaxPts: 4, disabledMaxPts: 2, disabledTarget: 0.02, maxPoints: 11 },
  skills:      { overallSpendPct: 0.035, overallMaxPts: 20, bursarySpendPct: 0.025, bursaryMaxPts: 5, maxPoints: 25, subMinPct: 0.40 },
  procurement: { allMaxPts: 5, qseMaxPts: 3, emeMaxPts: 4, bo51MaxPts: 10, bwo30MaxPts: 5, bonusMaxPts: 2, maxPoints: 25, subMinPct: 0.40, allTarget: 0.80, qseTarget: 0.15, emeTarget: 0.15, bo51Target: 0.40, bwo30Target: 0.12 },
  esd:         { sdPct: 0.02, sdMaxPts: 10, edPct: 0.01, edMaxPts: 5, maxPoints: 15 },
  sed:         { spendPct: 0.01, maxPoints: 5 },
  yes:         { maxPoints: 5 },
  levels:      STANDARD_LEVELS,
};

const ALL_CONFIGS = [RCOGP_GENERIC_CFG, RCOGP_QSE_CFG, ICT_GENERIC_CFG, FSC_GENERIC_CFG, AGRI_GENERIC_CFG];

export function getSectorConfig(sectorCode: string, scorecardType: string): SectorCfg {
  // Try to find exact match
  const codeNormal = sectorCode.toUpperCase();
  const typeNormal = scorecardType.toUpperCase() === 'EME' ? 'QSE' : scorecardType.toUpperCase() === 'QSE' ? 'QSE' : 'Generic';
  
  const match = ALL_CONFIGS.find(c => c.sectorCode === codeNormal && c.scorecardType === typeNormal);
  if (match) return match;
  
  // Fallback to RCOGP generic if combination doesn't exist
  return RCOGP_GENERIC_CFG;
}

export function listSectorConfigs() {
  return ALL_CONFIGS.map(c => ({
    code: c.sectorCode,
    name: c.sectorName,
    scorecardTypes: [c.scorecardType]
  }));
}

export function detectSectorFromName(name: string): Pick<SectorCfg, 'sectorCode' | 'scorecardType'> {
  const lower = name.toLowerCase();
  
  let code = 'RCOGP';
  if (lower.includes('ict') || lower.includes('information') || lower.includes('technology')) code = 'ICT';
  else if (lower.includes('fsc') || lower.includes('financial')) code = 'FSC';
  else if (lower.includes('agri')) code = 'AGRI';
  
  let type = 'Generic';
  if (lower.includes('qse')) type = 'QSE';
  else if (lower.includes('eme')) type = 'EME';
  
  return { sectorCode: code, scorecardType: type as any };
}
