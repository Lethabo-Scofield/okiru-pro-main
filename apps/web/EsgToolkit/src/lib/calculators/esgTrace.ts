/**
 * How each number was made (E2).
 *
 * Every scorecard row used to be a bare number of points — "6.2" — and its
 * "Actual" column printed those same points again. Nobody (the consultant, the
 * client, an assurer) could see what had been measured, against what target,
 * from which cells, or by what rule. So each scorer now records, as it computes,
 * the trace of every indicator: the value measured in the indicator's own unit,
 * the target and where that target came from, the cells it read with the values
 * it got, and the rule that turns them into points — in words.
 *
 * Recording is optional and observes only: the scorers compute exactly what
 * they computed before, and `esgTrace.test.ts` holds that by scoring real
 * workbooks with and without a recorder.
 */

export type EsgTraceUnit =
  | "ratio"
  | "litres"
  | "kWh"
  | "kL"
  | "kg"
  | "tCO2e"
  | "count"
  | "year"
  | "answer"
  | "rating"
  | "rate"
  | "hours"
  | "rand";

export type EsgTraceValue = string | number | boolean | null;

export interface EsgTraceInput {
  /** Where the value lives, as the workbook names it: `E_Data!L19`. */
  ref: string;
  label: string;
  value: EsgTraceValue;
}

export interface EsgIndicatorTrace {
  key: string;
  /** What was measured — the row's "Actual". Null when nothing could be. */
  measured: { value: EsgTraceValue; unit: EsgTraceUnit; label: string } | null;
  /** What it was measured against, and where that number came from. */
  target: { value: EsgTraceValue; unit: EsgTraceUnit; source: string } | null;
  inputs: EsgTraceInput[];
  /** How measured and target become points, in words. */
  rule: string;
}

export type EsgPillarTraces = Record<string, EsgIndicatorTrace>;

/** Collects traces while a scorer runs. Pass one in `EsgScoringOptions.trace`. */
export class EsgTraceRecorder {
  readonly traces: EsgPillarTraces = {};

  record(trace: EsgIndicatorTrace): void {
    this.traces[trace.key] = trace;
  }
}

/** One input cell, named the way the workbook names it. */
export function cell(sheet: string, ref: string, label: string, value: unknown): EsgTraceInput {
  return { ref: `${sheet}!${ref}`, label, value: traceValue(value) };
}

function traceValue(value: unknown): EsgTraceValue {
  if (value == null) return null;
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") return value;
  return String(value);
}

const points = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const percent = (x: number) => `${Math.round(x * 1000) / 10}%`;

/** `pr()` in words — the banded ratio every target-based indicator uses. */
export function bandedRule(max: number, floor: number, what: string): string {
  return `${points(max)} points when ${what} reaches the target. Below it, points in proportion to how close it came, down to ${percent(floor)} of the target; nothing below that.`;
}

/** `prLtifr()` in words — lower is better. */
export function inverseBandedRule(max: number, floor: number, what: string): string {
  return `${points(max)} points when ${what} is at or below the target. Above it, points fall away until ${what} is the target divided by ${percent(floor)}; nothing beyond that, and nothing when no rate is recorded.`;
}

/** A row that pays for having the data at all. */
export function presentRule(max: number, what: string): string {
  return `${points(max)} points when ${what} is recorded; nothing when it is not.`;
}

/** `yesPartialNo()` in words. */
export function answerRule(max: number, what: string): string {
  return `${what}: Yes earns ${points(max)} points, Partial ${points(max / 2)}, No or no answer nothing.`;
}

/** A 0–5 maturity rating scaled to the row's points. */
export function ratingRule(max: number, what: string): string {
  return `${what} is rated 0 to 5; the row earns that rating's share of ${points(max)} points.`;
}

/** Where a target came from, in words a report can print. */
export function targetSource(
  kind: "company" | "bbbee-stated" | "bbbee-default" | "workbook" | "workbook-default" | "sector",
  ref?: string,
): string {
  switch (kind) {
    case "company":
      return `The company's own target${ref ? ` (${ref})` : ""}.`;
    case "bbbee-stated":
      return `The B-BBEE / Employment Equity target the company elected, as it stated it${ref ? ` (${ref})` : ""}.`;
    case "bbbee-default":
      return "The B-BBEE / Employment Equity target the company elected (the code's figure; it stated none).";
    case "workbook":
      return `The client workbook's own figure${ref ? ` (${ref})` : ""} — workbook-parity scoring.`;
    case "workbook-default":
      return "The workbook template's default — workbook-parity scoring.";
    case "sector":
      return "The sector benchmark — not a target the company set.";
  }
}
