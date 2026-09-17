/**
 * Scoring primitives — workbook v1.7 (`Assumptions!B9` stance floor).
 *
 * SOURCE OF TRUTH: `docs/esg/ESG_FORMULA_LEDGER.md` Part 1 (verbatim formulas)
 * and `docs/esg/extracted/*.json`. Deviations from the workbook are catalogued
 * in `docs/esg/ESG_SCORING_DELTA.md`.
 */

export {
  STANCE_FLOOR,
  type EsgStanceKey as EsgStance,
  stanceFloorFromWorkbook,
} from "../esgConfig/consumer-goods";

import { STANCE_FLOOR, type EsgStanceKey } from "../esgConfig/consumer-goods";

/**
 * Which calculation a scorer runs.
 *
 * * `corrected` — **the live calculation.** The workbook's genuine defects are
 *   fixed: dead cell references are repointed at the cells that exist, and the
 *   three indicators that awarded points to an empty workbook now require real
 *   evidence.
 * * `workbook-parity` — the client workbook reproduced **verbatim, defects
 *   included**, so the original numbers (E 36 / S 33 / G 64.8529411765) stay
 *   provable as an audit trail. Reference only; never used by the live app.
 *
 * The modes branch on seven indicators only:
 *   · three defect fixes  — `E d7`, `S d18`, `G d25`
 *   · four MANUAL_ZEROs the workbook never computed and the corrected
 *     calculation now scores from newly-added inputs — `E d12`, `E d24`,
 *     `S d22`, `S d24` (parity keeps the workbook's literal 0).
 * Every other indicator shares one code path, so parity can never silently rot.
 */
export type EsgScoringMode = "corrected" | "workbook-parity";

export const ESG_DEFAULT_SCORING_MODE: EsgScoringMode = "corrected";

export type EsgScoringOptions = {
  mode?: EsgScoringMode;
};

export function scoringMode(options?: EsgScoringOptions): EsgScoringMode {
  return options?.mode ?? ESG_DEFAULT_SCORING_MODE;
}

/* ------------------------------------------------------------------ *
 * Workbook-sourced denominators
 *
 * These are the two scorecard divisors that used to sit inline as bare
 * literals. They are NOT invented: each is the sheet's own max, and each is
 * only a FALLBACK — when the corresponding grid has been filled,
 * `esgDeriveSummary.ts` publishes the real `_max_score` (which scales with the
 * number of rows actually present) and that wins.
 * ------------------------------------------------------------------ */

/**
 * King V maximum raw score — 17 principles × 10 points.
 * `G_Scorecard!C5 = =King5_Scorecard!E21/170*25` and
 * `King5_Scorecard!E22 = =IFERROR(E21/170,0)` both hardcode 170.
 * Superseded by `king5!_max_score` whenever the King V grid has rows.
 */
export const KING5_MAX_SCORE = 170;

/**
 * IFRS S1/S2 maximum score — 22 requirement rows × 5 points.
 * `IFRS_S1_S2!E30 = =IFERROR(E29/110,0)`.
 * Superseded by `ifrs!_max_score` whenever the IFRS grid has rows.
 */
export const IFRS_MAX_SCORE = 110;

export function minCap(score: number, max: number): number {
  return Math.min(Math.max(0, score), max);
}

/**
 * The workbook's universal quantitative band, verbatim:
 *
 *     IF(actual >= target,            max,
 *     IF(actual >= target * floor,    max * actual / target,
 *                                     0))
 *
 * `floor` is `Assumptions!B9` (`STANCE_FLR`) — see `Assumptions!B87:B89`,
 * "No partial credit below 50%".
 */
export function pr(
  actual: number,
  target: number,
  maxPts: number,
  floor = STANCE_FLOOR.standard,
): number {
  if (!target || target <= 0 || !Number.isFinite(actual)) return 0;
  const ratio = actual / target;
  if (ratio >= 1) return maxPts;
  if (ratio >= floor) return minCap(ratio * maxPts, maxPts);
  return 0;
}

/**
 * `S_Scorecard!C17` — LTIFR inverse band (lower is better), verbatim:
 *
 *     IF(G35 = 0,               0,
 *     IF(G35 <= B55,            8,
 *     IF(G35 <= B55 / B9,       MAX(0, 8 * (1 + B9 - G35 / B55)),
 *                               0)))
 *
 * THE SINGLE LTIFR IMPLEMENTATION. `esgScoringDefaults.esgLtifrPoints` is a
 * self-described "Phase 1 stub" that hardcodes the stance floor as a doubling
 * (`ltifr <= thrLtifr * 2`) and ignores `Assumptions!B9`; it is exported but
 * has no production caller. See `docs/esg/ESG_SCORING_DELTA.md` § Follow-ups.
 */
export function prLtifr(
  ltifr: number | null | undefined,
  target: number,
  maxPts: number,
  floor = STANCE_FLOOR.standard,
): number {
  if (ltifr == null || ltifr === 0 || Number.isNaN(ltifr)) return 0;
  if (!target || target <= 0 || !floor || floor <= 0) return 0;
  if (ltifr <= target) return maxPts;
  if (ltifr <= target / floor) {
    return Math.max(0, maxPts * (1 + floor - ltifr / target));
  }
  return 0;
}

/** Excel `IF(x="Yes",max,IF(x="Partial",max/2,0))`. */
export function yesPartialNo(value: unknown, maxPts: number): number {
  const v = String(value ?? "").toLowerCase().trim();
  if (v === "yes" || v === "true") return maxPts;
  if (v === "partial") return maxPts * 0.5;
  return 0;
}

export function governanceMaturity(f: number, maxPts: number): number {
  if (!Number.isFinite(f) || f <= 0) return 0;
  return minCap((f / 5) * maxPts, maxPts);
}

export function stanceFloor(stance: EsgStanceKey = "standard"): number {
  return STANCE_FLOOR[stance];
}
