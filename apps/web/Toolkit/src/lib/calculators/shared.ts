export class SectorConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SectorConfigError';
  }
}

/** True when no sector is set (unit tests) or sector is explicitly RCOGP Generic. */
export function allowsRcogpDefaults(sector?: string, scorecardType?: string): boolean {
  if (!sector) return true;
  const code = sector.toUpperCase();
  const type = scorecardType ?? 'Generic';
  return code === 'RCOGP' && type === 'Generic';
}

function formatSectorLabel(sector: string, scorecardType?: string): string {
  return `${sector.toUpperCase()} ${scorecardType ?? 'Generic'}`;
}

function hasPillarData(value: unknown): boolean {
  if (value == null || typeof value !== 'object') return false;
  return Object.values(value as Record<string, unknown>).some(v => v != null);
}

/**
 * Require pillar-specific config for non-RCOGP sectors.
 * RCOGP Generic (or unset sector in tests) may use embedded RCOGP defaults.
 */
export function requireSectorConfig<T extends Record<string, unknown>>(
  sector: string | undefined,
  pillar: string,
  config: T | undefined | null,
  scorecardType?: string,
): T {
  if (allowsRcogpDefaults(sector, scorecardType)) {
    return (config ?? {}) as T;
  }
  if (!hasPillarData(config)) {
    throw new SectorConfigError(
      `missing ${pillar} config for sector ${formatSectorLabel(sector!, scorecardType)}`,
    );
  }
  return config as T;
}

export function resolveSectorContext(config?: {
  sectorCode?: string;
  scorecardType?: string;
}): { sectorCode?: string; scorecardType?: string } {
  return {
    sectorCode: config?.sectorCode,
    scorecardType: config?.scorecardType,
  };
}

export const BLACK_RACES = ['African', 'Coloured', 'Indian'] as const;

export type BlackRace = (typeof BLACK_RACES)[number];

export type WorkbookRace = BlackRace | 'White';

const RACE_SYNONYM_MAP: Record<string, WorkbookRace> = {
  african: 'African',
  black: 'African',
  blackafrican: 'African',
  coloured: 'Coloured',
  colored: 'Coloured',
  indian: 'Indian',
  white: 'White',
};

function normRaceKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Canonical workbook race label used by calculators and the input layer.
 * Maps B-BBEE umbrella "Black" and common import variants to African/Coloured/Indian.
 */
export function normalizeRace(raw: string | null | undefined): WorkbookRace | '' {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '';
  const mapped = RACE_SYNONYM_MAP[normRaceKey(trimmed)];
  if (mapped) return mapped;
  for (const race of [...BLACK_RACES, 'White'] as const) {
    if (trimmed.toLowerCase() === race.toLowerCase()) return race;
  }
  return trimmed as WorkbookRace;
}

export function isBlackRace(race: string | null | undefined): boolean {
  const normalized = normalizeRace(race);
  return BLACK_RACES.includes(normalized as BlackRace);
}

/** Workbook designation labels → calculator designation enums. */
const WORKBOOK_TO_DESIGNATION: Record<string, string> = {
  'Executive Director': 'Executive Director',
  'Non-executive Director': 'Board',
  'Other Executive Manager': 'Other Executive Management',
  'Senior Manager': 'Senior',
  'Middle Manager': 'Middle',
  'Junior Manager': 'Junior',
  'Semi-skilled': 'Semi-skilled',
  Unskilled: 'Unskilled',
  Board: 'Board',
  Executive: 'Executive',
  'Other Executive Management': 'Other Executive Management',
  Senior: 'Senior',
  Middle: 'Middle',
  Junior: 'Junior',
  'Skilled Technical': 'Skilled Technical',
};

/**
 * Map workbook / import designation labels to calculator band keys.
 * Fixes exco rows stored as "Other Executive Manager" scoring as zero.
 */
export function normalizeDesignationForScoring(raw: string | null | undefined): string {
  const trimmed = String(raw ?? '').trim();
  // A blank designation matches NO band in the workbook (every MC Scorecard band
  // is a COUNTIFS on Designation.calcs = an exact band label), so it must score
  // nowhere — not default to Junior, which silently inflated the junior band's
  // count/denominator for any dataset with empty designation cells.
  // 'Unclassified' is not read by any band in management.ts. (ledger rcogp/generic D-01)
  if (!trimmed) return 'Unclassified';
  const exact = WORKBOOK_TO_DESIGNATION[trimmed];
  if (exact) return exact;

  const lower = trimmed.toLowerCase();
  if (lower.includes('non-executive') || lower.includes('non executive') || lower === 'director') {
    return 'Board';
  }
  if (lower.includes('executive director')) return 'Executive Director';
  if (lower.includes('other executive')) return 'Other Executive Management';
  if (lower.includes('senior')) return 'Senior';
  if (lower.includes('middle')) return 'Middle';
  if (lower.includes('junior')) return 'Junior';
  if (lower.includes('semi-skilled') || lower.includes('semi skilled')) return 'Semi-skilled';
  if (lower.includes('unskilled')) return 'Unskilled';
  if (lower.includes('skilled technical')) return 'Skilled Technical';
  if (lower.includes('executive') || lower.includes('ceo') || lower.includes('managing director')) {
    return 'Executive Director';
  }
  if (lower.includes('manager') || lower.includes('supervisor')) return 'Middle';
  return trimmed;
}

export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function safeRatio(value: number, target: number, maxPoints: number): number {
  if (target <= 0 || !Number.isFinite(value)) return 0;
  return clampScore((value / target) * maxPoints, maxPoints);
}

export function clampScore(score: number, max: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.min(Math.max(score, 0), max);
}

/**
 * Round a number to 2 decimal places
 * CRITICAL: All score displays must use this for consistency
 */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * Normalize a spend target to a fraction (0.035 = 3.5%).
 * SectorConfig stores percentages as 3.5; calculator config may store either
 * 3.5 (percent points) or 0.035 (fraction). Values above 0.15 are treated as
 * percent points and divided by 100.
 */
export function normalizeSpendFraction(value: number | undefined | null, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return value > 0.15 ? value / 100 : Math.max(0, value);
}

/**
 * Format a number as a percentage string with 2 decimal places
 */
export function formatPercent(value: number, decimals = 2): string {
  return `${round2(value * 100).toFixed(decimals)}%`;
}

/**
 * Format a number as a score with 2 decimal places
 */
export function formatScore(score: number): string {
  return round2(score).toFixed(2);
}
