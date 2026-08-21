/**
 * `G_Scorecard` rows 5–25 — Governance pillar.
 *
 * Ledger: `docs/esg/ESG_FORMULA_LEDGER.md` Part 1C. Divergences from the client
 * workbook are catalogued in `docs/esg/ESG_SCORING_DELTA.md`.
 *
 * Every `G_Data!F*` cell is the sheet's own 0–5 maturity score, derived by
 * `esgDeriveSummary.deriveGData` from the `B*` Yes/Partial/No inputs.
 */
import { readEsgCell, type EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { PILLAR_MAX_GOVERNANCE } from "../esgConfig/consumer-goods";
import {
  IFRS_MAX_SCORE,
  KING5_MAX_SCORE,
  minCap,
  scoringMode,
  type EsgScoringOptions,
} from "./shared";

export type GovernanceScoreResult = {
  score: number;
  max: number;
  rows: Record<string, number>;
};

function fCell(wb: EsgWorkbookData, ref: string): number {
  return readEsgCell(wb, "g-data", ref) ?? 0;
}

export function scoreGovernance(
  workbook: EsgWorkbookData,
  options?: EsgScoringOptions,
): GovernanceScoreResult {
  const mode = scoringMode(options);

  /*
   * C5 = =King5_Scorecard!E21/170*25
   *
   * The `170` divisor is no longer an inline literal: `king5!_max_score` is
   * derived as `10 × max(17, rowsPresent)` so a grid with more than 17
   * principles scales its own denominator. `KING5_MAX_SCORE` (17 × 10, the
   * workbook's own figure in `King5_Scorecard!E22`) is the fallback for a
   * workbook whose King V total was imported without the underlying grid.
   */
  const king5 = readEsgCell(workbook, "king5", "E21") ?? 0;
  const king5Max = readEsgCell(workbook, "king5", "_max_score") ?? KING5_MAX_SCORE;
  const d5 = king5Max > 0 ? minCap((king5 / king5Max) * 25, 25) : 0;

  // C6 = =G_Data!F13, C7 = =G_Data!F14
  const d6 = minCap(fCell(workbook, "F13"), 5);
  const d7 = minCap(fCell(workbook, "F14"), 5);

  /*
   * C9 = =IFERROR(10*COUNTIF(IFRS_S1_S2!D4:D40,"Yes")
   *        /MAX(1,COUNTA(A4:A40)-COUNTBLANK(A4:A40)),0)
   *
   * CORRECTED. The workbook counts the literal "Yes" in a column whose data
   * validation offers only `Disclosed / Partially Disclosed / Not Disclosed /
   * N/A`, so the numerator is 0 for every company forever; the denominator
   * collapses to `MAX(1,-33) = 1`. The sheet already scores itself —
   * `E5:E28 = IF(D="Disclosed",5,IF(D="Partially Disclosed",3,IF(D="N/A",5,0)))`,
   * `E29 = SUMIF(E5:E28,"<>0",E5:E28)`, out of `110` (`E30 = E29/110`) — so the
   * corrected indicator is `10 * E29 / 110`.
   *
   * The previous `readEsgCell(...,"ifrs","_total") ?? 10` denominator was
   * fabricated: `10` matched neither the sheet's 110 nor the formula's 1.
   */
  let d9: number;
  if (mode === "workbook-parity") {
    const yesCount = readEsgCell(workbook, "ifrs", "_yes_count") ?? 0;
    const parityDenominator = readEsgCell(workbook, "ifrs", "_total") ?? 1;
    d9 = minCap(10 * (yesCount / Math.max(1, parityDenominator)), 10);
  } else {
    const ifrsScore = readEsgCell(workbook, "ifrs", "E29") ?? 0;
    const ifrsMax = readEsgCell(workbook, "ifrs", "_max_score") ?? IFRS_MAX_SCORE;
    d9 = ifrsMax > 0 ? minCap((10 * ifrsScore) / ifrsMax, 10) : 0;
  }

  // C10 = =G_Data!F23
  const d10 = minCap(fCell(workbook, "F23"), 5);

  // C12 = =IF(G_Data!F21>0,IF(G_Data!F23>0,8,4),0)
  const f21 = fCell(workbook, "F21");
  const f23 = fCell(workbook, "F23");
  const d12 = f21 > 0 ? (f23 > 0 ? 8 : 4) : 0;

  // C14 = =IF(G_Data!F5>0,5,0)
  const d14 = fCell(workbook, "F5") > 0 ? 5 : 0;
  // C16 = =G_Data!F17, C17 = =G_Data!F18
  const d16 = minCap(fCell(workbook, "F17"), 5);
  const d17 = minCap(fCell(workbook, "F18"), 5);
  // C19 = =G_Data!F20*8/5
  const d19 = minCap((fCell(workbook, "F20") * 8) / 5, 8);
  // C20 = =G_Data!F19
  const d20 = minCap(fCell(workbook, "F19"), 5);
  // C22 = =(G_Data!F15+G_Data!F16)/2*4/5
  const d22 = minCap(((fCell(workbook, "F15") + fCell(workbook, "F16")) / 2) * (4 / 5), 4);
  // C24 = =G_Data!F21
  const d24 = minCap(fCell(workbook, "F21"), 5);

  /*
   * C25 = =IF(G_Data!B25="",5,IF(G_Data!B25=0,5,0))
   *
   * CORRECTED (unconditional score removed). `G_Data` has no row 25 at all —
   * row 24 is "Anti-corruption training" and row 26 is the total — so `B25` is
   * permanently blank and the first branch hands 5 free points to every
   * company, including one that has never opened the workbook.
   *
   * Corrected rule: the company must assert a penalty count. An explicit 0
   * ("no material regulatory penalties in the period") scores 5; any positive
   * count scores 0; an absent assertion scores 0.
   */
  const penalties = readEsgCell(workbook, "g-data", "B25");
  const d25 =
    mode === "workbook-parity"
      ? penaltiesParity(workbook)
      : penalties === 0
        ? 5
        : 0;

  const rows = { d5, d6, d7, d9, d10, d12, d14, d16, d17, d19, d20, d22, d24, d25 };
  const score = Object.values(rows).reduce((a, b) => a + b, 0);
  return { score: minCap(score, PILLAR_MAX_GOVERNANCE), max: PILLAR_MAX_GOVERNANCE, rows };
}

/** `IF(B25="",5,IF(B25=0,5,0))` verbatim — blank earns the points. */
function penaltiesParity(workbook: EsgWorkbookData): number {
  const raw = workbook.sections?.["g-data"]?.cells?.["B25"];
  if (raw == null || raw === "") return 5;
  return Number(raw) === 0 ? 5 : 0;
}
