/**
 * ESG scoring — workbook v1.7 SG Consumer is source of truth.
 * ESG_Dashboard!D9 = avg(E_pts/100, S_pts/100, G_pts/100).
 */

/** Pillar scorecard maxima (display); overall D9 divides each pillar by 100, not by these maxima. */
export const ESG_PILLAR_MAX = { environmental: 108, social: 100, governance: 92 } as const;

/** ESG_Dashboard D9 divisor per pillar — not HTML 40/30/30, not ÷292. */
export const ESG_D9_PILLAR_DIVISOR = 100;

/** Workbook v1.7 SG Consumer live golden values (E_Scorecard D30, S_Scorecard D28, G_Scorecard D26). */
export const ESG_GOLDEN_SG_CONSUMER = {
  environmentalPoints: 36,
  socialPoints: 33,
  governancePoints: 64.8529411765,
  overallPercent: 0.4461764706,
} as const;

/** G_Data column F maturity scale (0–5). */
export const ESG_G_DATA_MATURITY_SCALE = { min: 0, max: 5 } as const;

/** Assumptions!B55 — THR_LTIFR default in v1.7 SG Consumer workbook. */
export const ESG_THR_LTIFR = 2.0;

/** ISO_14083 is reporting-only; excluded from E_Data GHG totals until product says otherwise. */
export const ESG_ISO_14083_REPORTING_ONLY = true;

export function esgOverallPercent(ePoints: number, sPoints: number, gPoints: number): number {
  const parts = [ePoints, sPoints, gPoints].map((p) => p / ESG_D9_PILLAR_DIVISOR);
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

/** @deprecated use esgOverallPercent */
export const esgOverallPercentPlaceholder = esgOverallPercent;

/**
 * S_Scorecard row 17 — LTIFR points.
 * Workbook: IF(S_Data!G35=0, 0, …) — empty or zero hours → 0 points.
 */
export function esgLtifrPoints(
  ltifr: number | null | undefined,
  maxPoints = 8,
  thrLtifr = ESG_THR_LTIFR,
): number {
  if (ltifr == null || ltifr === 0 || Number.isNaN(ltifr)) return 0;
  if (ltifr <= thrLtifr) return maxPoints;
  // Simplified inverse band — full formula uses Assumptions B9 stance; Phase 1 stub.
  if (ltifr <= thrLtifr * 2) {
    return Math.max(0, maxPoints * (1 + thrLtifr - ltifr / thrLtifr));
  }
  return 0;
}

export type EsgPillarScores = {
  environmental: number;
  social: number;
  governance: number;
  overallPercent: number;
};

export function esgScoresFromPillars(
  ePoints: number,
  sPoints: number,
  gPoints: number,
): EsgPillarScores {
  return {
    environmental: ePoints,
    social: sPoints,
    governance: gPoints,
    overallPercent: esgOverallPercent(ePoints, sPoints, gPoints),
  };
}
