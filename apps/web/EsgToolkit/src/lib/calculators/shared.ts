/** Scoring primitives — workbook v1.7 (Assumptions B9 stance floor). */

export type EsgStance = "lean" | "standard" | "strict";

export const STANCE_FLOOR: Record<EsgStance, number> = {
  lean: 0.3,
  standard: 0.5,
  strict: 0.7,
};

export function stanceFloor(stance: EsgStance = "standard"): number {
  return STANCE_FLOOR[stance];
}

export function minCap(score: number, max: number): number {
  return Math.min(Math.max(0, score), max);
}

/** Pro-rata with stance floor (Assumptions B9). */
export function pr(
  actual: number,
  target: number,
  maxPts: number,
  floor = STANCE_FLOOR.standard,
): number {
  if (!target || target <= 0 || !Number.isFinite(actual)) return 0;
  const ratio = actual / target;
  if (ratio >= 1) return maxPts;
  if (ratio >= floor) return minCap((ratio * maxPts * 100) / 100, maxPts);
  return 0;
}

/** S_Scorecard row 17 — LTIFR inverse band. */
export function prLtifr(
  ltifr: number | null | undefined,
  target: number,
  maxPts: number,
  floor = STANCE_FLOOR.standard,
): number {
  if (ltifr == null || ltifr === 0 || Number.isNaN(ltifr)) return 0;
  if (ltifr <= target) return maxPts;
  if (ltifr <= target / floor) {
    return Math.max(0, maxPts * (1 + floor - ltifr / target));
  }
  return 0;
}

export function yesPartialNo(value: unknown, maxPts: number): number {
  const v = String(value ?? "").toLowerCase();
  if (v === "yes" || v === "true") return maxPts;
  if (v === "partial") return maxPts * 0.5;
  return 0;
}

export function governanceMaturity(f: number, maxPts: number): number {
  if (!Number.isFinite(f) || f <= 0) return 0;
  return minCap((f / 5) * maxPts, maxPts);
}
