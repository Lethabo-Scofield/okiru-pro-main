/**
 * ESG workbook validation rules.
 *
 * Two invariants govern this file — both were violated before the 2026-08 pass,
 * and between them they made submit permanently impossible:
 *
 *  1. **A rule may only read a cell something writes.** Every ref below is
 *     either a user input (`esgSectionConfigs.ts`), a cell derived by
 *     `esgDeriveSummary.ts`, or a grid roll-up written by
 *     `esgGridRows.ts#syncDerivedFields`. Rules that read export-only cells
 *     (`E_/S_/G_Scorecard!D30/D28/D26`) or display-only cells (`G_Data!F26`,
 *     which `EsgMaturityGrid` renders and captions "stored at F26" but never
 *     persists) can never pass and are forbidden.
 *  2. **A rule must be able to fail.** A predicate that returns a constant is
 *     not a rule — implement it or delete it.
 *
 * Severity contract: `error` = submit blocker, `warning` = advisory gap.
 * Warnings are NOT promoted to blockers on submit (see `evaluateEsgRules`);
 * that promotion is what turned every advisory gap into a hard block.
 */
import { readEsgCell, readEsgText, type EsgWorkbookData } from "./esgWorkbookStorage";
import { countFleetRegisterRows, countKing5Principles, readEsgGridRows } from "./esgGridRows";
import {
  ESG_GRID_SECTIONS,
  ESG_GRID_SECTION_IDS,
  type EsgGridSectionId,
} from "./esgGridSections";
import { computeEsgScorecard } from "../../../EsgToolkit/src/lib/calculators";

export type EsgTouchedState = Record<string, Record<string, true>>;

export type EsgRuleSeverity = "warning" | "error";
export type EsgRuleScope = "field" | "section" | "workbook";
export type EsgRuleTrigger = "always" | "touched" | "submit";

export type EsgPillarKey = "environmental" | "social" | "governance";

/**
 * Per-evaluation context. `pillarScore` runs the real pillar calculators once
 * and memoises the result, so the pillar-total rules assert the number the user
 * actually sees on the dashboard. Deliberately NOT a cell lookup: the scorecard
 * totals only exist inside the XLSX export, and binding to any newly-derived
 * cell would couple this file to in-flight work in `esgDeriveSummary.ts`.
 */
export type EsgRuleContext = {
  pillarScore: (pillar: EsgPillarKey) => number | null;
};

export type EsgRule = {
  id: string;
  scope: EsgRuleScope;
  sectionId: string;
  fieldRef?: string;
  severity: EsgRuleSeverity;
  trigger: EsgRuleTrigger;
  message: string;
  evaluate: (
    workbook: EsgWorkbookData,
    touched: EsgTouchedState,
    ctx: EsgRuleContext,
  ) => boolean;
  /**
   * Optional: what is actually wrong, in words, when the rule fails. Rendered
   * as the issue's `actual`, so the panel says "row 3: Reg missing" instead of
   * "No" — a rule the user cannot act on teaches them to ignore the panel.
   */
  detail?: (workbook: EsgWorkbookData) => string;
};

export type EsgRuleEvaluation = {
  id: string;
  message: string;
  severity: EsgRuleSeverity;
  sectionId: string;
  fieldRef?: string;
  pass: boolean;
  pending: boolean;
  expected: string;
  actual: string;
};

export type EsgRulesMode = "live" | "submit" | "silent";

/* -------------------------------------------------------------------------- */
/* Tunable gates                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Every threshold a rule compares against, in one place.
 *
 * Anything the workbook itself carries is read from its Assumptions cell first
 * and only falls back to the constant here, so a client with a different fiscal
 * year or risk appetite overrides it in their own workbook rather than in code.
 * The constants are the SG Consumer v1.7 template defaults
 * (docs/esg/ESG_FORMULA_LEDGER.md Part 2D / 4.5).
 */
export const ESG_RULE_TUNABLES = {
  /**
   * `Assumptions!B111` (code `ENT_MOS`) — months of data in the reporting
   * window. 9 is one client's fiscal year (Jul-25 → Mar-26) and the width of
   * `EsgMonthlyGrid`'s default month set; it is not a universal truth. Any
   * workbook carrying B111 overrides it (imports do; `ASSUMPTIONS_FIELDS` does
   * not expose it as a field yet).
   */
  reportingMonthsCell: "B111",
  defaultReportingMonths: 9,
  /** `Assumptions!B55` (`THR_LTIFR`) — max Lost Time Injury Frequency Rate. */
  ltifrThresholdCell: "B55",
  defaultLtifrThreshold: 2,
  /**
   * King IV/V defines exactly 17 principles. Structural to the code, not a
   * client preference — hardcoded on purpose; do not make this configurable.
   */
  king5PrincipleCount: 17,
  /**
   * Baseline-year sanity window. Was a fixed `2018..2030`, which silently
   * expires: from 2031 every legitimate baseline year would be flagged. Now a
   * rolling window anchored on the current year.
   */
  baselineYearMin: 2000,
  baselineYearsAhead: 10,
} as const;

/** Upper bound of the baseline-year window, resolved once at module load. */
export const ESG_BASELINE_YEAR_MAX =
  new Date().getFullYear() + ESG_RULE_TUNABLES.baselineYearsAhead;

export const KING5_PRINCIPLE_COUNT = ESG_RULE_TUNABLES.king5PrincipleCount;

/** Scoring stance vocabulary — the `Assumptions!B8` data-validation list. */
export const ESG_STANCE_OPTIONS = ["Lean", "Standard", "Strict"] as const;

/** Input sections that feed each pillar's calculator. */
export const ESG_PILLAR_INPUT_SECTIONS: Record<EsgPillarKey, readonly string[]> = {
  environmental: ["e-data", "fleet", "waste", "iso-tracker"],
  social: ["s-data", "ee", "s-data-ofo", "s-data-csi", "driver-debrief", "saq"],
  governance: ["g-data", "king5", "ifrs", "garp"],
};

/* -------------------------------------------------------------------------- */
/* Readers                                                                    */
/* -------------------------------------------------------------------------- */

function isTouched(touched: EsgTouchedState, sectionId: string, fieldRef?: string): boolean {
  if (!fieldRef) return Boolean(touched[sectionId] && Object.keys(touched[sectionId]).length > 0);
  return Boolean(touched[sectionId]?.[fieldRef]);
}

function assumption(workbook: EsgWorkbookData, cell: string, fallback: number): number {
  const v = readEsgCell(workbook, "assumptions", cell);
  return v == null || !Number.isFinite(v) ? fallback : v;
}

/** Months the reporting window is expected to cover (`Assumptions!B111`). */
export function esgReportingMonths(workbook: EsgWorkbookData): number {
  const rounded = Math.round(
    assumption(
      workbook,
      ESG_RULE_TUNABLES.reportingMonthsCell,
      ESG_RULE_TUNABLES.defaultReportingMonths,
    ),
  );
  return rounded >= 1 && rounded <= 12 ? rounded : ESG_RULE_TUNABLES.defaultReportingMonths;
}

function hasAnyCells(workbook: EsgWorkbookData, sectionIds: readonly string[]): boolean {
  for (const id of sectionIds) {
    const cells = workbook.sections?.[id]?.cells;
    if (!cells) continue;
    for (const v of Object.values(cells)) {
      if (v !== null && v !== undefined && v !== "") return true;
    }
  }
  return false;
}

function sumCells(workbook: EsgWorkbookData, sectionId: string, refs: string[]): number {
  let total = 0;
  for (const ref of refs) total += readEsgCell(workbook, sectionId, ref) ?? 0;
  return total;
}

/* -------------------------------------------------------------------------- */
/* E_Data monthly series                                                      */
/* -------------------------------------------------------------------------- */

type EsgMonthSeries = {
  /** `EsgMonthlyGrid` cellPrefix — cells are `${prefix}_${col}${row}`. */
  prefix: string;
  /** Roll-up total derived by `esgDeriveSummary.ts` (Σ of the prefix's cells). */
  totalRef: string;
  label: string;
};

/**
 * The three activity series the E scorecard reads. Each rule below owns exactly
 * one of them.
 *
 * They previously shared one helper that probed the *unprefixed* refs
 * `C14`/`C44`/`C61`. No writer in the app produces those — `EsgMonthlyGrid`
 * writes `s1a_C14`, `s2_C41`, `water_C14`… — so the helper only ever returned
 * the legacy `_months_C_K` override, and all three rules reported the same
 * number under three different messages.
 */
export const ESG_MONTH_SERIES = {
  diesel: { prefix: "s1a", totalRef: "L19", label: "fleet diesel" },
  electricity: { prefix: "s2", totalRef: "L46", label: "electricity" },
  water: { prefix: "water", totalRef: "L63", label: "water" },
} as const satisfies Record<string, EsgMonthSeries>;

/** Distinct month columns carrying a positive value for one series. */
function monthColumnsCaptured(workbook: EsgWorkbookData, series: EsgMonthSeries): number {
  const cells = workbook.sections?.["e-data"]?.cells ?? {};
  const re = new RegExp(`^${series.prefix}_([C-N])\\d+$`);
  const cols = new Set<string>();
  for (const [ref, raw] of Object.entries(cells)) {
    const m = re.exec(ref);
    if (!m) continue;
    const n = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(n) && n > 0) cols.add(m[1]);
  }
  return cols.size;
}

function seriesTotal(workbook: EsgWorkbookData, series: EsgMonthSeries): number {
  return readEsgCell(workbook, "e-data", series.totalRef) ?? 0;
}

/**
 * Months of data captured for one series.
 *
 * Monthly detail wins. When only the year-to-date roll-up survived (an XLSX
 * import — or the golden fixture, which carries `L63` but no `water_*` cells)
 * the legacy `e-data!_months_C_K` marker records how many months that roll-up
 * covers. That marker is now only honoured for a series that actually has a
 * total, so it can no longer make an empty series look reported.
 */
export function esgSeriesMonths(workbook: EsgWorkbookData, series: EsgMonthSeries): number {
  const detail = monthColumnsCaptured(workbook, series);
  if (detail > 0) return detail;
  if (seriesTotal(workbook, series) > 0) {
    return readEsgCell(workbook, "e-data", "_months_C_K") ?? 0;
  }
  return 0;
}

function seriesComplete(workbook: EsgWorkbookData, series: EsgMonthSeries): boolean {
  return esgSeriesMonths(workbook, series) >= esgReportingMonths(workbook);
}

/* -------------------------------------------------------------------------- */
/* Values the grids display but never persist                                 */
/* -------------------------------------------------------------------------- */

/**
 * `G_Data!F26 = SUM(F5:F24)` — the governance maturity total.
 *
 * `EsgMaturityGrid` computes and renders this total but never writes it, so
 * reading F26 alone was unsatisfiable for every manually-captured workbook.
 * Recompute it from the F-cells `esgDeriveSummary.ts` does write; an explicit
 * (imported) F26 still wins.
 */
export function esgGovernanceMaturityTotal(workbook: EsgWorkbookData): number {
  const explicit = readEsgCell(workbook, "g-data", "F26");
  if (explicit != null) return explicit;
  let total = 0;
  for (let row = 5; row <= 24; row++) {
    total += readEsgCell(workbook, "g-data", `F${row}`) ?? 0;
  }
  return total;
}

/**
 * `S_Data!G35 = IF(SUM(C27:F27)>0, SUM(C29:F29)*1000000/SUM(C27:F27), "…")`.
 *
 * G35 is offered as a manual number field but holds the string "Awaiting hours
 * worked" in every real workbook, so `readEsgCell` returns null. Fall back to
 * the workbook's own formula over the quarterly H&S cells that ARE captured.
 * Returns null when LTIFR is genuinely not computable — callers must not read
 * that as "compliant" (`s-data.hours-worked` reports it instead).
 */
export function esgLtifr(workbook: EsgWorkbookData): number | null {
  const direct = readEsgCell(workbook, "s-data", "G35");
  if (direct != null) return direct;
  const hours = sumCells(workbook, "s-data", ["C27", "D27", "E27", "F27"]);
  if (hours <= 0) return null;
  const lti = sumCells(workbook, "s-data", ["C29", "D29", "E29", "F29"]);
  return (lti * 1_000_000) / hours;
}

/** First 4-digit year in a free-text fiscal-year label ("FY 2025/26" → 2025). */
function parseFourDigitYear(raw: string): number | null {
  const m = /\b(\d{4})\b/.exec(raw);
  return m ? Number(m[1]) : null;
}

/**
 * A pillar counts as scored when the calculators produce points AND at least
 * one of that pillar's input sections holds data. The second clause matters:
 * `scoreGovernance` awards 5 free points for `d25` when `G_Data!B25` is absent
 * (a documented workbook defect — that row does not exist), so the score alone
 * would let a completely untouched governance pillar pass.
 */
function pillarScored(
  workbook: EsgWorkbookData,
  ctx: EsgRuleContext,
  pillar: EsgPillarKey,
): boolean {
  if (!hasAnyCells(workbook, ESG_PILLAR_INPUT_SECTIONS[pillar])) return false;
  return (ctx.pillarScore(pillar) ?? 0) > 0;
}

/* -------------------------------------------------------------------------- */
/* Register hygiene                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Row-level problems in one register: required columns left empty, and
 * dropdown columns holding a value outside their vocabulary.
 *
 * This is what "the validator ignored required fields" was: `required` marked
 * cells in the GRID, but no rule ever counted them, so an import full of
 * banner text and transposed matrices passed validation untouched. Each
 * problem names its row and column so the panel is actionable, not a tally.
 */
export function esgRegisterRowProblems(
  workbook: EsgWorkbookData,
  sectionId: EsgGridSectionId,
): string[] {
  const def = ESG_GRID_SECTIONS[sectionId];
  const rows = readEsgGridRows(workbook.sections?.[sectionId]?.cells, sectionId);
  const problems: string[] = [];
  rows.forEach((row, i) => {
    const rowHasData = def.columns.some((col) => {
      const v = row[col.key];
      return v !== undefined && v !== null && String(v).trim() !== "";
    });
    if (!rowHasData) return;
    for (const col of def.columns) {
      const v = row[col.key];
      const blank = v === undefined || v === null || String(v).trim() === "";
      if (col.required && blank) {
        problems.push(`row ${i + 1}: ${col.label} missing`);
        continue;
      }
      if (col.type === "select" && !blank && col.options?.length) {
        const text = String(v).trim().toLowerCase();
        if (!col.options.some((o) => o.trim().toLowerCase() === text)) {
          problems.push(`row ${i + 1}: ${col.label} "${String(v)}" is not an expected value`);
        }
      }
    }
  });
  return problems;
}

function registerHygieneRule(sectionId: EsgGridSectionId): EsgRule {
  const label = ESG_GRID_SECTIONS[sectionId].description;
  return {
    id: `${sectionId}.rows-valid`,
    scope: "section",
    sectionId,
    severity: "warning",
    // "always", not "touched": the rows most likely to be malformed arrive by
    // IMPORT, which touches nothing. An empty register passes vacuously.
    trigger: "always",
    message: `Register rows valid — ${label}`,
    evaluate: (wb) => esgRegisterRowProblems(wb, sectionId).length === 0,
    detail: (wb) => {
      const problems = esgRegisterRowProblems(wb, sectionId);
      const shown = problems.slice(0, 3).join("; ");
      return problems.length > 3 ? `${shown}; +${problems.length - 3} more` : shown;
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Rules                                                                      */
/* -------------------------------------------------------------------------- */

export const ESG_PHASE1_RULES: EsgRule[] = [
  {
    id: "company-reporting-setup.entity-required",
    scope: "field",
    sectionId: "company-reporting-setup",
    fieldRef: "entity",
    severity: "warning",
    trigger: "submit",
    message: "Entity name required",
    evaluate: (wb) =>
      Boolean(
        readEsgText(wb, "company-reporting-setup", "entity") ||
          readEsgText(wb, "cover", "entity"),
      ),
  },
  {
    id: "company-reporting-setup.period-required",
    scope: "field",
    sectionId: "company-reporting-setup",
    fieldRef: "period",
    severity: "warning",
    trigger: "submit",
    message: "Reporting period required",
    evaluate: (wb) =>
      Boolean(
        readEsgText(wb, "company-reporting-setup", "period") ||
          readEsgText(wb, "cover", "period"),
      ),
  },
  {
    id: "company-reporting-setup.baseline-year-valid",
    scope: "field",
    sectionId: "company-reporting-setup",
    fieldRef: "baselineYear",
    severity: "warning",
    trigger: "touched",
    message: `Baseline year should be between ${ESG_RULE_TUNABLES.baselineYearMin} and ${ESG_BASELINE_YEAR_MAX}`,
    // Read as TEXT: the field accepts fiscal-year labels ("FY 2025/26") as well
    // as a bare year, and readEsgCell number-coerces those to null — which made
    // every labelled baseline year skip the check entirely.
    evaluate: (wb) => {
      const raw =
        readEsgText(wb, "company-reporting-setup", "baselineYear") ||
        readEsgText(wb, "cover", "baselineYear");
      if (!raw) return true; // unset — the required-field rules own that gap
      const year = parseFourDigitYear(raw);
      if (year == null) return false; // "next year", "TBC" — not a baseline year
      return year >= ESG_RULE_TUNABLES.baselineYearMin && year <= ESG_BASELINE_YEAR_MAX;
    },
  },
  {
    id: "assumptions.sector-required",
    scope: "field",
    sectionId: "assumptions",
    // Assumptions!B10 = "Sector" (was B8, which is the scoring stance).
    fieldRef: "B10",
    severity: "warning",
    trigger: "submit",
    message: "Pick a sector before submit",
    evaluate: (wb) => Boolean(readEsgText(wb, "assumptions", "B10")),
  },
  {
    id: "assumptions.stance-valid",
    scope: "field",
    sectionId: "assumptions",
    // Assumptions!B8 = "Scoring stance" (was B6, a stale pre-migration address
    // that nothing writes any more).
    fieldRef: "B8",
    severity: "warning",
    trigger: "submit",
    message: `Scoring stance must be ${ESG_STANCE_OPTIONS.join(", ")}`,
    // Replaces `assumptions.stance-required`, whose body was
    // `void readEsgText(...); return true` — a rule that could not fail. Unset
    // is legitimate (the calculators default to Standard / floor 0.5); an
    // out-of-vocabulary value is not, and imports can carry one.
    evaluate: (wb) => {
      const stance = readEsgText(wb, "assumptions", "B8");
      if (!stance) return true;
      return ESG_STANCE_OPTIONS.some((o) => o.toLowerCase() === stance.toLowerCase());
    },
  },
  {
    // Advisory, not a blocker: a per-fuel hard gate is unsatisfiable for any
    // client without that stream (an office with no fleet could never submit).
    // The `e-score` pillar gate already guarantees some E evidence exists.
    id: "e-diesel",
    scope: "section",
    sectionId: "e-data",
    fieldRef: "scope1A.months",
    severity: "warning",
    trigger: "submit",
    message: "Fleet diesel: monthly litres incomplete for the reporting window",
    evaluate: (wb) => seriesComplete(wb, ESG_MONTH_SERIES.diesel),
  },
  {
    id: "e-electricity",
    scope: "section",
    sectionId: "e-data",
    fieldRef: "scope2.months",
    severity: "warning",
    trigger: "submit",
    message: "Electricity: monthly kWh incomplete for the reporting window",
    evaluate: (wb) => seriesComplete(wb, ESG_MONTH_SERIES.electricity),
  },
  {
    id: "e-water",
    scope: "section",
    sectionId: "e-data",
    fieldRef: "water.months",
    severity: "warning",
    trigger: "submit",
    message: "Water: monthly kL incomplete for the reporting window",
    evaluate: (wb) => seriesComplete(wb, ESG_MONTH_SERIES.water),
  },
  {
    id: "e-data.baseline-set",
    scope: "field",
    sectionId: "e-data",
    fieldRef: "B90",
    severity: "warning",
    trigger: "submit",
    message: "Net-Zero baseline (tCO₂e) not set",
    evaluate: (wb) => (readEsgCell(wb, "e-data", "B90") ?? 0) > 0,
  },
  {
    id: "s-data.headcount-positive",
    scope: "field",
    sectionId: "s-data",
    fieldRef: "L12",
    severity: "warning",
    trigger: "submit",
    // s-data!L12 is derived from the hc_r_c headcount grid by esgDeriveSummary.
    message: "EE total headcount must be > 0",
    evaluate: (wb) => (readEsgCell(wb, "s-data", "L12") ?? 0) > 0,
  },
  {
    id: "s-data.hours-worked",
    scope: "field",
    sectionId: "s-data",
    fieldRef: "C27",
    severity: "warning",
    trigger: "submit",
    message: "Hours worked not captured — LTIFR cannot be computed",
    // Splits the "missing input" case out of s-data.ltifr-threshold, which used
    // to swallow it as `?? 0` and report an uncomputable LTIFR as compliant.
    evaluate: (wb) => sumCells(wb, "s-data", ["C27", "D27", "E27", "F27"]) > 0,
  },
  {
    id: "s-data.ltifr-threshold",
    scope: "field",
    sectionId: "s-data",
    fieldRef: "G35",
    severity: "warning",
    trigger: "touched",
    message: "LTIFR exceeds Assumptions threshold",
    evaluate: (wb) => {
      const ltifr = esgLtifr(wb);
      if (ltifr == null) return true; // not computable — s-data.hours-worked reports it
      return (
        ltifr <=
        assumption(
          wb,
          ESG_RULE_TUNABLES.ltifrThresholdCell,
          ESG_RULE_TUNABLES.defaultLtifrThreshold,
        )
      );
    },
  },
  {
    id: "s-data.wsp-submitted",
    scope: "field",
    sectionId: "s-data",
    fieldRef: "B45",
    severity: "warning",
    trigger: "submit",
    message: "WSP submission status unknown",
    evaluate: (wb) => Boolean(readEsgText(wb, "s-data", "B45")),
  },
  {
    id: "g-data.code-of-ethics",
    scope: "field",
    sectionId: "g-data",
    fieldRef: "B15",
    severity: "warning",
    trigger: "submit",
    message: "Code of ethics flag not set",
    evaluate: (wb) => Boolean(readEsgText(wb, "g-data", "B15")),
  },
  {
    id: "g-data.popia-io",
    scope: "field",
    sectionId: "g-data",
    fieldRef: "B17",
    severity: "warning",
    trigger: "submit",
    message: "POPIA Information Officer flag not set",
    evaluate: (wb) => Boolean(readEsgText(wb, "g-data", "B17")),
  },
  {
    id: "g-data.score-positive",
    scope: "field",
    sectionId: "g-data",
    // Anchored on the first governance input rather than the display-only F26.
    fieldRef: "B5",
    severity: "warning",
    trigger: "submit",
    message: "Governance total score is 0",
    evaluate: (wb) => esgGovernanceMaturityTotal(wb) > 0,
  },
  {
    id: "ee.ee-plan",
    scope: "field",
    sectionId: "ee",
    fieldRef: "B9",
    severity: "warning",
    trigger: "submit",
    message: "EE plan submission status not set",
    evaluate: (wb) => Boolean(readEsgText(wb, "ee", "B9")),
  },
  {
    id: "fleet.has-rows",
    scope: "section",
    sectionId: "fleet",
    fieldRef: "_rows",
    severity: "warning",
    trigger: "submit",
    message: "Fleet register is empty",
    // `_rows` is stripped on save (`mergeEsgSectionCells`) and the rows land as
    // flat A4/B4… refs, so reading `cells._rows` only ever saw unsaved drafts.
    evaluate: (wb) => countFleetRegisterRows(wb) > 0,
  },
  {
    id: "ifrs.disclosures-started",
    scope: "section",
    sectionId: "ifrs",
    fieldRef: "_yes_count",
    severity: "warning",
    trigger: "submit",
    message: "No IFRS S1/S2 disclosures marked Disclosed",
    evaluate: (wb) => (readEsgCell(wb, "ifrs", "_yes_count") ?? 0) > 0,
  },
  {
    id: "king5-principles",
    scope: "section",
    sectionId: "king5",
    fieldRef: "_principles_filled",
    severity: "error",
    trigger: "submit",
    message: `King V requires all ${KING5_PRINCIPLE_COUNT} principle statuses`,
    // Either path is real evidence: the 17 statuses captured in the grid, or an
    // imported workbook carrying King5_Scorecard!E21 — the weighted total the
    // governance calculator actually scores — without the per-principle rows.
    // Requiring the grid alone blocked every imported workbook forever.
    evaluate: (wb) =>
      countKing5Principles(wb) >= KING5_PRINCIPLE_COUNT ||
      (readEsgCell(wb, "king5", "E21") ?? 0) > 0,
  },
  ...ESG_GRID_SECTION_IDS.map(registerHygieneRule),
];

/**
 * Submit gate — the minimum for a workbook to be scoreable at all.
 *
 * These evaluate the COMPUTED pillar totals. They used to read
 * `e-data!D30` / `s-data!D28` / `g-data!D26`, i.e.
 * `E_/S_/G_Scorecard!D30/D28/D26`: `esgWorkbookExport.ts` writes those into the
 * exported XLSX, but no section ever stores them, so all three were permanently
 * 0 and submit was impossible for every workbook — including a perfect one.
 *
 * Kept separate from ESG_PHASE1_RULES because they are submit-only: running the
 * calculators on every keystroke in live mode buys nothing.
 */
const ESG_SUBMIT_GATE_RULES: EsgRule[] = [
  {
    id: "e-score",
    scope: "section",
    sectionId: "e-data",
    severity: "error",
    trigger: "submit",
    message: "Capture environmental data — fuel, electricity or water",
    evaluate: (wb, _touched, ctx) => pillarScored(wb, ctx, "environmental"),
  },
  {
    id: "s-score",
    scope: "section",
    sectionId: "s-data",
    severity: "error",
    trigger: "submit",
    message: "Capture social data — employment equity, training or health & safety",
    evaluate: (wb, _touched, ctx) => pillarScored(wb, ctx, "social"),
  },
  {
    id: "g-score",
    scope: "section",
    sectionId: "g-data",
    severity: "error",
    trigger: "submit",
    message: "Capture governance data — board composition, policies or King V",
    evaluate: (wb, _touched, ctx) => pillarScored(wb, ctx, "governance"),
  },
];

function makeRuleContext(workbook: EsgWorkbookData): EsgRuleContext {
  let computed: ReturnType<typeof computeEsgScorecard> | undefined;
  return {
    pillarScore(pillar) {
      if (computed === undefined) {
        try {
          computed = computeEsgScorecard(workbook);
        } catch {
          computed = null;
        }
      }
      return computed ? computed[pillar].score : null;
    },
  };
}

export function evaluateEsgRules(
  workbook: EsgWorkbookData | null,
  touched: EsgTouchedState = {},
  mode: EsgRulesMode = "live",
): EsgRuleEvaluation[] {
  if (mode === "silent") {
    return [];
  }

  if (!workbook) {
    return [
      {
        id: "no-workbook",
        message: "Workbook data loaded",
        severity: "error",
        sectionId: "workbook",
        pass: false,
        pending: false,
        expected: "Saved sections",
        actual: "None",
      },
    ];
  }

  const rules =
    mode === "submit" ? [...ESG_PHASE1_RULES, ...ESG_SUBMIT_GATE_RULES] : ESG_PHASE1_RULES;
  const ctx = makeRuleContext(workbook);
  const seen = new Set<string>();

  return rules
    .filter((rule) => {
      if (seen.has(rule.id)) return false;
      seen.add(rule.id);
      return true;
    })
    .map((rule) => {
      const shouldRun =
        rule.trigger === "always" ||
        rule.trigger === "submit" && mode === "submit" ||
        rule.trigger === "touched" && isTouched(touched, rule.sectionId, rule.fieldRef);

      const pending = !shouldRun && mode === "live";
      const pass = shouldRun ? rule.evaluate(workbook, touched, ctx) : true;

      // Severity is the rule's own. It used to be promoted to "error" for any
      // failing warning in submit mode, which made "warning" meaningless and
      // turned every advisory gap (empty fleet register, no IFRS disclosure
      // yet, net-zero baseline still 0) into a hard submit blocker.
      return {
        id: rule.id,
        message: rule.message,
        severity: rule.severity,
        sectionId: rule.sectionId,
        fieldRef: rule.fieldRef,
        pass,
        pending,
        expected:
          rule.trigger === "submit"
            ? "Pass on submit"
            : rule.trigger === "always"
              ? "Pass"
              : "Pass when touched",
        actual: pass ? "Yes" : pending ? "Pending" : rule.detail?.(workbook) ?? "No",
      };
    });
}
