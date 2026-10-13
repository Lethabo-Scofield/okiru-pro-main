import { ESG_D9_PILLAR_DIVISOR } from "@/lib/esgScoringDefaults";
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
import {
  applicableMaxFor,
  exclude,
  mergeExclusions,
  readDeclaredExclusions,
  type EsgPillarResult,
} from "./esgApplicability";
import { cell as traceCell, presentRule, ratingRule } from "./esgTrace";

export type GovernanceScoreResult = EsgPillarResult;

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

  /* ----------------------- How each row was made (E2) ---------------------- */
  // Observes the values above; computes nothing the score depends on.
  const trace = options?.trace;
  if (trace) {
    const parity = mode === "workbook-parity";
    const G = "G_Data";
    const record = trace.record.bind(trace);
    /** A Yes / Partial / No answer and the 0–5 maturity derived from it. */
    const maturity = (key: string, row: number, max: number, label: string) => {
      const rating = fCell(workbook, `F${row}`);
      record({
        key,
        measured: { value: rating, unit: "rating", label: `${label} (maturity 0–5)` },
        target: null,
        inputs: [
          traceCell(G, `B${row}`, label, workbook.sections?.["g-data"]?.cells?.[`B${row}`]),
          traceCell(G, `F${row}`, "Maturity, derived from the answer (0–5)", rating),
        ],
        rule: ratingRule(max, label),
      });
    };

    record({
      key: "d5",
      measured: king5Max > 0 ? { value: king5 / king5Max, unit: "ratio", label: "King V principles applied, share of the maximum" } : null,
      target: null,
      inputs: [traceCell("King5_Scorecard", "E21", "King V score across the 17 principles", king5), traceCell("King5_Scorecard", "max", "Highest score available", king5Max)],
      rule: "25 points × the King V score as a share of the highest score the 17 principles allow.",
    });
    maturity("d6", 13, 5, "Social & Ethics committee active");
    maturity("d7", 14, 5, "ESG linked to executive remuneration");
    const ifrsScore = readEsgCell(workbook, "ifrs", parity ? "_yes_count" : "E29") ?? 0;
    const ifrsMax = parity
      ? Math.max(1, readEsgCell(workbook, "ifrs", "_total") ?? 1)
      : readEsgCell(workbook, "ifrs", "_max_score") ?? IFRS_MAX_SCORE;
    record({
      key: "d9",
      measured: ifrsMax > 0 ? { value: ifrsScore / ifrsMax, unit: "ratio", label: "IFRS S1 / S2 readiness, share of the maximum" } : null,
      target: null,
      inputs: parity
        ? [traceCell("IFRS_S1_S2", "Yes", "Disclosures answered Yes", ifrsScore), traceCell("IFRS_S1_S2", "rows", "Disclosures listed", ifrsMax)]
        : [traceCell("IFRS_S1_S2", "E29", "Readiness score across the disclosures", ifrsScore), traceCell("IFRS_S1_S2", "max", "Highest score available", ifrsMax)],
      rule: parity
        ? "Workbook-parity scoring: 10 points × the share of disclosures answered Yes."
        : "10 points × the readiness score as a share of the highest score the disclosures allow.",
    });
    maturity("d10", 23, 5, "Climate risk in the risk register");
    record({
      key: "d12",
      measured: { value: f21 > 0 ? (f23 > 0 ? "Risk register with climate risk" : "Risk register, no climate risk") : "No risk register", unit: "answer", label: "Risk management in place" },
      target: null,
      inputs: [traceCell(G, "F21", "Risk register maturity (0–5)", f21), traceCell(G, "F23", "Climate risk in the register, maturity (0–5)", f23)],
      rule: "8 points when the risk register is live and covers climate risk; 4 when only the register is live; nothing without one.",
    });
    record({
      key: "d14",
      measured: { value: fCell(workbook, "F5"), unit: "count", label: "Board members" },
      target: null,
      inputs: [traceCell(G, "B5", "Board members (total)", workbook.sections?.["g-data"]?.cells?.B5), traceCell(G, "F5", "Board recorded", fCell(workbook, "F5"))],
      rule: presentRule(5, "a board"),
    });
    maturity("d16", 17, 5, "POPIA Information Officer appointed");
    maturity("d17", 18, 5, "POPIA impact assessment done");
    maturity("d19", 20, 8, "Integrated report published");
    maturity("d20", 19, 5, "External assurance of the ESG report");
    record({
      key: "d22",
      measured: { value: (fCell(workbook, "F15") + fCell(workbook, "F16")) / 2, unit: "rating", label: "Ethics: code and whistleblowing, average maturity (0–5)" },
      target: null,
      inputs: [
        traceCell(G, "F15", "Code of ethics in place, maturity (0–5)", fCell(workbook, "F15")),
        traceCell(G, "F16", "Whistleblower hotline active, maturity (0–5)", fCell(workbook, "F16")),
      ],
      rule: ratingRule(4, "The average of the code of ethics and the whistleblower hotline"),
    });
    maturity("d24", 21, 5, "Risk register updated");
    record({
      key: "d25",
      measured: penalties == null ? null : { value: penalties, unit: "count", label: "Material regulatory penalties this period" },
      target: null,
      inputs: [traceCell(G, "B25", "Material regulatory penalties (0 for none)", penalties)],
      rule: parity
        ? "Workbook-parity scoring: the client workbook's own penalty rule."
        : "5 points when the company reports no material penalties (an explicit 0); nothing when it reports one, or reports nothing.",
    });
  }

  const rows = { d5, d6, d7, d9, d10, d12, d14, d16, d17, d19, d20, d22, d24, d25 };
  const score = Object.values(rows).reduce((a, b) => a + b, 0);

  const ifrsApplicable = readEsgCell(workbook, "ifrs", "_applicable_count");
  const ifrsStated = readEsgCell(workbook, "ifrs", "_not_applicable_count");
  const derivedExclusions =
    ifrsApplicable === 0 && (ifrsStated ?? 0) > 0
      ? [
          exclude(
            "governance",
            "d9",
            "Every IFRS S1/S2 disclosure requirement is marked not applicable to this business, so there is nothing to assess readiness against.",
          ),
        ]
      : [];

  /*
   * Exclusions leave the numerator and the denominator together. Parity mode
   * takes none: it reproduces the client's spreadsheet, which has no concept of
   * an indicator that does not apply.
   */
  const excluded =
    mode === "workbook-parity"
      ? []
      : mergeExclusions(readDeclaredExclusions(workbook, "governance"), derivedExclusions);
  const scored = Object.entries(rows)
    .filter(([key]) => !excluded.some((x) => x.key === key))
    .reduce((a, [, v]) => a + v, 0);
  const scoringDenominator =
    mode === "workbook-parity"
      ? ESG_D9_PILLAR_DIVISOR
      : applicableMaxFor(ESG_D9_PILLAR_DIVISOR, excluded);

  return {
    score: minCap(mode === "workbook-parity" ? score : scored, PILLAR_MAX_GOVERNANCE),
    max: PILLAR_MAX_GOVERNANCE,
    scoringDenominator,
    rows,
    excluded,
  };
}

/** `IF(B25="",5,IF(B25=0,5,0))` verbatim — blank earns the points. */
function penaltiesParity(workbook: EsgWorkbookData): number {
  const raw = workbook.sections?.["g-data"]?.cells?.["B25"];
  if (raw == null || raw === "") return 5;
  return Number(raw) === 0 ? 5 : 0;
}
