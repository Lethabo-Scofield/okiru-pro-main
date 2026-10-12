/**
 * Is a document's fact about THIS reporting year?
 *
 * A document states its own period — an Employment Equity return its
 * reporting period, an EE plan its start and end dates, a contractor report
 * its month. Nothing compared that with the year the workbook reports on, so a
 * 2023 EE return's 505 employees became this year's workforce, and an EE plan
 * that expired two months into the year still earned "EE forum consulted" and
 * "numerical targets set and tracked".
 *
 * The rule, the same one B-BBEE verification applies to the measurement
 * period: a fact whose own document covers an EARLIER period is out of period.
 *   - its period ended before the reporting year began; or
 *   - it began before the reporting year and ended before the year did — an
 *     earlier cycle (a plan, a return) that lapsed during the year, so it says
 *     nothing about the year as a whole.
 * Such a fact is held, with the dates, and earns nothing until a person
 * accepts it. Monthly figures are not judged here: they are placed by their
 * own month, and a month outside the year has no column.
 */
import type { EsgReportingAxes } from "@/components/esg-workbook/esgDefaults";

export interface EsgReportingYear {
  /** ISO date, inclusive. */
  start: string;
  /** ISO date, inclusive. */
  end: string;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const iso = (y: number, m: number, d: number) =>
  `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const fullYear = (y: number) => (y < 100 ? 2000 + y : y);

function monthIndex(word: string): number | null {
  const i = MONTHS.indexOf(word.slice(0, 3).toLowerCase());
  return i >= 0 ? i + 1 : null;
}

/**
 * A printed date as ISO. Day-first, as South African documents print it
 * ("30/11/2023", "31/03/26"); "1 July 2025"; a bare month ("JUNE 2026",
 * "Mar-26") is its first or last day by `edge`.
 */
export function parseEsgDate(raw: unknown, edge: "start" | "end" = "end"): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(text);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return iso(fullYear(Number(m[3])), mo, d);
  }
  m = /^(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{4})$/.exec(text);
  if (m) {
    const mo = monthIndex(m[2]);
    return mo ? iso(Number(m[3]), mo, Number(m[1])) : null;
  }
  m = /^([A-Za-z]{3,})[\s-]+(\d{2}|\d{4})$/.exec(text);
  if (m) {
    const mo = monthIndex(m[1]);
    if (!mo) return null;
    const y = fullYear(Number(m[2]));
    return iso(y, mo, edge === "start" ? 1 : lastDay(y, mo));
  }
  return null;
}

/**
 * The year the workbook reports on: from its first reporting month, twelve
 * months — or to its last month, when it carries more than twelve.
 */
export function esgReportingYear(axes: Pick<EsgReportingAxes, "months">): EsgReportingYear | null {
  const first = parseEsgDate(axes.months[0], "start");
  if (!first) return null;
  const [y, m] = first.split("-").map(Number);
  const endMonth = m + 11;
  const endYear = y + Math.floor((endMonth - 1) / 12);
  const endMon = ((endMonth - 1) % 12) + 1;
  let end = iso(endYear, endMon, lastDay(endYear, endMon));
  const last = parseEsgDate(axes.months[axes.months.length - 1], "end");
  if (last && last > end) end = last;
  return { start: first, end };
}

/** Fields that state the period a document as a whole covers. Bills' months are not among them. */
const PERIOD_START = /^(?:[a-z0-9]+_)?(?:reporting_period|plan)_start(?:_date)?$/;
const PERIOD_END = /^(?:[a-z0-9]+_)?(?:reporting_period|plan)_end(?:_date)?$/;

export interface EsgDocumentPeriod {
  start: string | null;
  end: string;
}

/** The period one document states for itself, or null when it states none. */
export function esgDocumentPeriod(values: ReadonlyArray<{ field?: string; value?: unknown }>): EsgDocumentPeriod | null {
  let start: string | null = null;
  let end: string | null = null;
  for (const v of values) {
    const field = String(v?.field ?? "");
    if (!end && PERIOD_END.test(field)) end = parseEsgDate(v.value, "end");
    if (!start && PERIOD_START.test(field)) start = parseEsgDate(v.value, "start");
  }
  return end ? { start, end } : null;
}

/** Why a document's period puts its facts outside the reporting year, or null when it does not. */
export function esgOutOfPeriodReason(period: EsgDocumentPeriod | null, year: EsgReportingYear | null): string | null {
  if (!period || !year) return null;
  const covers = period.start ? `${period.start} to ${period.end}` : `the period ending ${period.end}`;
  if (period.end < year.start) {
    return `Its document covers ${covers}, which ended before the reporting year (${year.start} to ${year.end}) began. ` +
      "It is held out of the score until you accept it as evidence for this year.";
  }
  if (period.start && period.start < year.start && period.end < year.end) {
    return `Its document covers ${covers}: an earlier cycle that lapsed during the reporting year (${year.start} to ${year.end}). ` +
      "It is held out of the score until you accept it as evidence for this year, or add the current one.";
  }
  return null;
}
