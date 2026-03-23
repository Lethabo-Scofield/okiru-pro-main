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
