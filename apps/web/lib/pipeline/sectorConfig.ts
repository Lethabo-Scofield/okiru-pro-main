export interface SectorConfig {
  code: string;
  name: string;
  description: string;
  scorecardTypes: string[];
}

export const RCOGP_GENERIC: SectorConfig = {
  code: 'RCOGP_GENERIC',
  name: 'Retail, Construction, Oil & Gas, Property (Generic)',
  description: 'Generic scorecard for RCOGP sectors',
  scorecardTypes: ['generic', 'qse', 'eme'],
};

export const ICT_GENERIC: SectorConfig = {
  code: 'ICT_GENERIC',
  name: 'Information & Communication Technology (Generic)',
  description: 'ICT sector generic scorecard',
  scorecardTypes: ['generic', 'qse', 'eme'],
};

export const FSC_GENERIC: SectorConfig = {
  code: 'FSC_GENERIC',
  name: 'Financial Sector Code (Generic)',
  description: 'Financial sector generic scorecard',
  scorecardTypes: ['generic', 'qse', 'eme'],
};

export const AGRI_GENERIC: SectorConfig = {
  code: 'AGRI_GENERIC',
  name: 'Agriculture (Generic)',
  description: 'Agriculture sector generic scorecard',
  scorecardTypes: ['generic', 'qse', 'eme'],
};

export const RCOGP_QSE: SectorConfig = {
  code: 'RCOGP_QSE',
  name: 'Retail, Construction, Oil & Gas, Property (QSE)',
  description: 'QSE scorecard for RCOGP sectors',
  scorecardTypes: ['qse'],
};

export const ICT_QSE: SectorConfig = {
  code: 'ICT_QSE',
  name: 'Information & Communication Technology (QSE)',
  description: 'QSE scorecard for ICT sector',
  scorecardTypes: ['qse'],
};

export const TRANSPORT_GENERIC: SectorConfig = {
  code: 'TRANSPORT_GENERIC',
  name: 'Transport Sector Code (Large Enterprise)',
  description: 'Large-enterprise Transport Sector scorecard (Integrated Transport)',
  scorecardTypes: ['generic'],
};

export const TRANSPORT_QSE: SectorConfig = {
  code: 'TRANSPORT_QSE',
  name: 'Transport Sector Code (QSE)',
  description: 'QSE Transport — sheet2 element weights; exactly four elements measured per assessment (engine default quartet caps at 107 pts)',
  scorecardTypes: ['qse'],
};

const ALL_CONFIGS: SectorConfig[] = [
  RCOGP_GENERIC,
  ICT_GENERIC,
  FSC_GENERIC,
  AGRI_GENERIC,
  TRANSPORT_GENERIC,
  RCOGP_QSE,
  ICT_QSE,
  TRANSPORT_QSE,
];

export function getSectorConfig(code: string): SectorConfig | undefined {
  return ALL_CONFIGS.find(c => c.code === code);
}

export function detectSectorFromName(name: string): SectorConfig | undefined {
  const lower = name.toLowerCase();
  if (lower.includes('ict') || lower.includes('information') || lower.includes('communication') || lower.includes('technology')) {
    return ICT_GENERIC;
  }
  if (lower.includes('fsc') || lower.includes('financial')) {
    return FSC_GENERIC;
  }
  if (lower.includes('agri')) {
    return AGRI_GENERIC;
  }
  if (lower.includes('transport') || lower.includes('freight') || lower.includes('logistics')) {
    return TRANSPORT_GENERIC;
  }
  return RCOGP_GENERIC;
}

export function listSectorConfigs(): SectorConfig[] {
  return ALL_CONFIGS;
}
