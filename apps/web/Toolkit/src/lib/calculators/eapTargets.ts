/**
 * EAP (Economically Active Population) Targets
 * 
 * EAP targets are used for Management Control calculations at Senior, Middle, and Junior levels.
 * These are province-specific demographic targets based on StatsSA data.
 * 
 * Reference: B-BBEE Commission EAP tables
 * Last updated: 2026-03-31
 */

export type Province =
  | 'National'
  | 'Western Cape'
  | 'Eastern Cape'
  | 'Northern Cape'
  | 'Free State'
  | 'KwaZulu-Natal'
  | 'North West'
  | 'Gauteng'
  | 'Mpumalanga'
  | 'Limpopo';

export type OccupationalLevel = 'Senior' | 'Middle' | 'Junior';

export interface EAPValues {
  blackTarget: number;
  blackWomenTarget: number;
}

// National EAP (default when no province specified)
const NATIONAL_EAP: Record<OccupationalLevel, EAPValues> = {
  Senior: { blackTarget: 0.731, blackWomenTarget: 0.341 },
  Middle: { blackTarget: 0.786, blackWomenTarget: 0.425 },
  Junior: { blackTarget: 0.845, blackWomenTarget: 0.512 },
};

// Provincial EAP tables
const PROVINCIAL_EAP: Record<Province, Record<OccupationalLevel, EAPValues>> = {
  National: NATIONAL_EAP,
  'Western Cape': {
    Senior: { blackTarget: 0.551, blackWomenTarget: 0.311 },
    Middle: { blackTarget: 0.654, blackWomenTarget: 0.422 },
    Junior: { blackTarget: 0.743, blackWomenTarget: 0.526 },
  },
  'Eastern Cape': {
    Senior: { blackTarget: 0.868, blackWomenTarget: 0.454 },
    Middle: { blackTarget: 0.902, blackWomenTarget: 0.501 },
    Junior: { blackTarget: 0.932, blackWomenTarget: 0.558 },
  },
  'Northern Cape': {
    Senior: { blackTarget: 0.611, blackWomenTarget: 0.324 },
    Middle: { blackTarget: 0.705, blackWomenTarget: 0.418 },
    Junior: { blackTarget: 0.798, blackWomenTarget: 0.509 },
  },
  'Free State': {
    Senior: { blackTarget: 0.852, blackWomenTarget: 0.461 },
    Middle: { blackTarget: 0.884, blackWomenTarget: 0.492 },
    Junior: { blackTarget: 0.921, blackWomenTarget: 0.534 },
  },
  'KwaZulu-Natal': {
    Senior: { blackTarget: 0.863, blackWomenTarget: 0.421 },
    Middle: { blackTarget: 0.895, blackWomenTarget: 0.467 },
    Junior: { blackTarget: 0.928, blackWomenTarget: 0.523 },
  },
  'North West': {
    Senior: { blackTarget: 0.881, blackWomenTarget: 0.435 },
    Middle: { blackTarget: 0.908, blackWomenTarget: 0.479 },
    Junior: { blackTarget: 0.936, blackWomenTarget: 0.531 },
  },
  Gauteng: {
    Senior: { blackTarget: 0.733, blackWomenTarget: 0.359 },
    Middle: { blackTarget: 0.794, blackWomenTarget: 0.442 },
    Junior: { blackTarget: 0.861, blackWomenTarget: 0.545 },
  },
  Mpumalanga: {
    Senior: { blackTarget: 0.894, blackWomenTarget: 0.418 },
    Middle: { blackTarget: 0.917, blackWomenTarget: 0.462 },
    Junior: { blackTarget: 0.941, blackWomenTarget: 0.527 },
  },
  Limpopo: {
    Senior: { blackTarget: 0.938, blackWomenTarget: 0.465 },
    Middle: { blackTarget: 0.951, blackWomenTarget: 0.498 },
    Junior: { blackTarget: 0.963, blackWomenTarget: 0.542 },
  },
};

/**
 * Get EAP targets for a specific province and occupational level
 * @param province - The province (defaults to 'National')
 * @param level - The occupational level (Senior, Middle, Junior)
 * @returns EAP targets for Black and Black Women
 */
export function getEAPTargets(province: Province = 'National', level: OccupationalLevel): EAPValues {
  const provinceData = PROVINCIAL_EAP[province] || NATIONAL_EAP;
  return provinceData[level];
}

/**
 * Get all EAP targets for a province
 * @param province - The province (defaults to 'National')
 * @returns All EAP targets for Senior, Middle, and Junior levels
 */
export function getAllEAPTargets(province: Province = 'National'): Record<OccupationalLevel, EAPValues> {
  return PROVINCIAL_EAP[province] || NATIONAL_EAP;
}

/**
 * List all available provinces
 */
export function getProvinces(): Province[] {
  return [
    'National',
    'Western Cape',
    'Eastern Cape',
    'Northern Cape',
    'Free State',
    'KwaZulu-Natal',
    'North West',
    'Gauteng',
    'Mpumalanga',
    'Limpopo',
  ];
}

/**
 * Validate province name
 */
export function isValidProvince(province: string): province is Province {
  return getProvinces().includes(province as Province);
}

/**
 * Normalize province name (handle variations)
 */
export function normalizeProvince(input: string): Province {
  const normalized = input.trim();
  if (isValidProvince(normalized)) return normalized;
  
  // Handle common variations
  const variations: Record<string, Province> = {
    'wc': 'Western Cape',
    'w cape': 'Western Cape',
    'ec': 'Eastern Cape',
    'e cape': 'Eastern Cape',
    'nc': 'Northern Cape',
    'n cape': 'Northern Cape',
    'fs': 'Free State',
    'kzn': 'KwaZulu-Natal',
    'kwazulu natal': 'KwaZulu-Natal',
    'kwazulu-natal': 'KwaZulu-Natal',
    'nw': 'North West',
    'n west': 'North West',
    'gp': 'Gauteng',
    'mp': 'Mpumalanga',
    'lp': 'Limpopo',
  };
  
  const lower = normalized.toLowerCase();
  return variations[lower] || 'National';
}
