/**
 * Quarterly injury counts, from an incident register's rows.
 *
 * The parser reads a SHE incident register one row per incident and, on
 * purpose, never counts them (the skill says so: "the code counts the rows by
 * their classification"). Nothing did. The rows were reported as evidence the
 * scorecard does not consume, so S_Data's quarterly H&S block stayed empty, and
 * with it "Zero fatalities" (S d18) and the LTIFR's numerator.
 *
 * The rules, each from the standard practice the toolkit implements:
 *   - A row is counted under the register's OWN classification, as printed. A
 *     fatality is a fatality first; then a lost-time injury (classified so, or
 *     the row states lost time); then a medical-treatment case. Anything else
 *     (first aid, near miss, property, a vehicle incident with no injury) is
 *     not an injury in these three rows. A row the register does not classify
 *     is counted nowhere, and said so — never guessed from its description.
 *   - Third parties and members of the public are not the company's workers
 *     and are not counted. Employees and contractors working under its
 *     control are (GRI 403-9 counts both).
 *   - A quarter is the calendar quarter the S_Data block names (C = Jul–Sep,
 *     D = Oct–Dec, E = Jan–Mar, F = Apr–Jun), within the reporting year. A row
 *     dated outside the year, or undated, is not counted.
 *   - A zero is an assertion. It is written only for a quarter the register
 *     demonstrably covers: wholly inside the period the register states, or —
 *     where it states none — a quarter it lists at least one incident in.
 *   - LTIFR is not computed here: it needs hours worked (per 1 000 000 hours,
 *     the expert ruling) and `esgDeriveSummary` computes it only when they exist.
 *
 * The counts are a derivation, not a printed figure, so they are placed as a
 * question to confirm: the outcome says what was counted, and the ESG
 * verification checks list them as needs-you.
 */
import { esgReportingYear, parseEsgDate } from "./esgFactPeriod";
import type { EsgReportingAxes } from "@/components/esg-workbook/esgDefaults";

export const INCIDENT_ROWS_FIELD = "incident_rows";

export type EsgInjuryClass = "fatality" | "lti" | "mti";

/** The S_Data row each class fills. */
export const ESG_INJURY_ROWS: Readonly<Record<EsgInjuryClass, number>> = { fatality: 28, lti: 29, mti: 30 };

export interface EsgIncidentRowLike {
  cells: Record<string, unknown>;
  sourceFiles?: string[];
}

export interface EsgIncidentCounts {
  /** cellRef (`C29`) → count, for every covered quarter. */
  cells: Record<string, number>;
  /** Count per class over the year. */
  totals: Record<EsgInjuryClass, number>;
  /** Columns the register covers. */
  quarters: string[];
  /** Rows counted under a class. */
  counted: number;
  /** Rows read but counted nowhere, with why. */
  skipped: { unclassified: number; notAnInjury: number; notAWorker: number; outsideYear: number };
  /** One plain sentence for the review. */
  summary: string;
}

/** The register's classification → a class, or why it is none. */
export function esgInjuryClass(cells: Record<string, unknown>): EsgInjuryClass | "not_an_injury" | "unclassified" {
  const text = String(cells["hs.incident_classification"] ?? "").toLowerCase();
  const lostTime = cells["hs.incident_lost_time"];
  if (/\bfatal|\bdeath\b|\bdied\b/.test(text)) return "fatality";
  // "No lost time" and "non-lost-time" state the opposite.
  if (/\bltis?\b|(?<!\bno\s|\bnon[\s-])\blost[\s-]*time\b/.test(text) || lostTime === true) return "lti";
  if (/\bmedical\b|\bmtcs?\b|\bmtis?\b/.test(text)) return "mti";
  if (text.trim()) return "not_an_injury";
  return "unclassified";
}

/** True for a third party or a member of the public: not a worker. */
function notAWorker(cells: Record<string, unknown>): boolean {
  const who = String(cells["hs.injured_party_category"] ?? "").toLowerCase();
  return /\bthird[\s-]*party\b|\bpublic\b|\bvisitor\b|\bpassenger\b|\bpedestrian\b/.test(who);
}

const QUARTER_OF_MONTH = (month: number): string => (month >= 7 && month <= 9 ? "C" : month >= 10 ? "D" : month <= 3 ? "E" : "F");

/** Each reporting-year month as `YYYY-MM`. */
function yearMonths(start: string, end: string): string[] {
  const out: string[] = [];
  let [y, m] = start.split("-").map(Number);
  const last = end.slice(0, 7);
  for (let i = 0; i < 24; i++) {
    const ym = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
    out.push(ym);
    if (ym >= last) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/**
 * Count a register's rows into the quarterly block.
 *
 * `periods` is each source file's own stated period (`hs.period_start/end`
 * read from that file), when it states one. Null when no reporting year can
 * be resolved: without a year there is no quarter to place a count in.
 */
export function esgIncidentCounts(
  rows: readonly EsgIncidentRowLike[],
  axes: Pick<EsgReportingAxes, "months">,
  periods: ReadonlyMap<string, { start: string | null; end: string | null }> = new Map(),
): EsgIncidentCounts | null {
  const year = esgReportingYear(axes);
  if (!year || rows.length === 0) return null;
  const months = yearMonths(year.start, year.end);
  const columns = ["C", "D", "E", "F"];
  /** Each column's months inside the reporting year. */
  const monthsOf = new Map(columns.map((c) => [c, months.filter((ym) => QUARTER_OF_MONTH(Number(ym.slice(5))) === c)]));

  const covered = new Set<string>();
  const counts = new Map<string, number>();
  const totals: Record<EsgInjuryClass, number> = { fatality: 0, lti: 0, mti: 0 };
  const skipped = { unclassified: 0, notAnInjury: 0, notAWorker: 0, outsideYear: 0 };
  let counted = 0;

  // Quarters wholly inside a period a register states.
  for (const period of periods.values()) {
    const start = period.start ? parseEsgDate(period.start, "start") : null;
    const end = period.end ? parseEsgDate(period.end, "end") : null;
    if (!start || !end) continue;
    for (const [column, ms] of monthsOf) {
      if (ms.length > 0 && ms.every((ym) => ym >= start.slice(0, 7) && ym <= end.slice(0, 7))) covered.add(column);
    }
  }

  for (const row of rows) {
    const date = parseEsgDate(row.cells["hs.incident_date"], "start");
    if (!date || date < year.start || date > year.end) {
      skipped.outsideYear += 1;
      continue;
    }
    const column = QUARTER_OF_MONTH(Number(date.slice(5, 7)));
    // A register that lists an incident in a quarter covers that quarter.
    const statesPeriod = (row.sourceFiles ?? []).some((f) => periods.has(f));
    if (!statesPeriod) covered.add(column);
    if (notAWorker(row.cells)) {
      skipped.notAWorker += 1;
      continue;
    }
    const cls = esgInjuryClass(row.cells);
    if (cls === "unclassified") {
      skipped.unclassified += 1;
      continue;
    }
    if (cls === "not_an_injury") {
      skipped.notAnInjury += 1;
      continue;
    }
    const ref = `${column}${ESG_INJURY_ROWS[cls]}`;
    counts.set(ref, (counts.get(ref) ?? 0) + 1);
    totals[cls] += 1;
    counted += 1;
  }

  const quarters = columns.filter((c) => covered.has(c));
  const cells: Record<string, number> = {};
  for (const column of quarters) {
    for (const row of Object.values(ESG_INJURY_ROWS)) {
      cells[`${column}${row}`] = counts.get(`${column}${row}`) ?? 0;
    }
  }
  // A count in a quarter not covered cannot happen (listing an incident covers
  // its quarter) unless the register's stated period excludes the incident's
  // date; such a count is still the register's own row, so it is kept.
  for (const [ref, n] of counts) if (!(ref in cells)) cells[ref] = n;

  const parts = [
    `${totals.lti} lost-time injur${totals.lti === 1 ? "y" : "ies"}`,
    `${totals.mti} medical-treatment case${totals.mti === 1 ? "" : "s"}`,
    `${totals.fatality} fatalit${totals.fatality === 1 ? "y" : "ies"}`,
  ];
  const notes: string[] = [];
  if (skipped.unclassified) notes.push(`${skipped.unclassified} the register does not classify`);
  if (skipped.notAnInjury) notes.push(`${skipped.notAnInjury} that are not injuries (first aid, near miss, property, vehicle)`);
  if (skipped.notAWorker) notes.push(`${skipped.notAWorker} involving third parties or the public`);
  if (skipped.outsideYear) notes.push(`${skipped.outsideYear} dated outside the reporting year or undated`);
  const summary =
    `Counted from the incident register's ${rows.length} row${rows.length === 1 ? "" : "s"}: ${parts.join(", ")}` +
    (quarters.length ? `, over ${quarters.length} quarter${quarters.length === 1 ? "" : "s"} the register covers` : "") +
    "." +
    (notes.length ? ` Not counted: ${notes.join("; ")}.` : "") +
    " Please confirm these counts against the register.";
  return { cells, totals, quarters, counted, skipped, summary };
}
