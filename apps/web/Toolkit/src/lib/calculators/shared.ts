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

export function isBlackRace(race: string): boolean {
  return BLACK_RACES.includes(race as BlackRace);
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
