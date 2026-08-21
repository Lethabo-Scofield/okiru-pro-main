/**
 * Reporting axes for the ESG workbook grids — depots (rows) and months (columns).
 *
 * These are FALLBACK defaults, not a closed vocabulary. The reference workbook
 * (`docs/esg/Okiru_ESG_Toolkit_v1_7_SG_Consumer_LiveData.xlsx`) happens to carry five
 * sites and a nine-month reporting year, so those shapes are kept as the default to
 * preserve cell-for-cell parity with it — but every consumer now takes the axis as a
 * parameter, so an entity with three sites or a twelve-month year is expressible
 * without editing this file.
 *
 * ── Row/column-count warning ──────────────────────────────────────────────────────
 * `EsgMonthlyGrid` addresses cells as `${prefix}_${col}${14 + rowIndex}` with month
 * columns C…K. The LENGTH of each axis therefore decides which cell a value lands in.
 * Changing an axis length is safe only for a workbook that has not been filled yet;
 * a per-entity axis must be persisted alongside the workbook, never swapped underneath
 * saved data. Axis ORDER is likewise load-bearing: row index, not label, is the key.
 */

/** Fallback reporting months (reference workbook FY: 9 months). Columns C…K. */
export const ESG_DEFAULT_MONTHS = [
  "Jul-25",
  "Aug-25",
  "Sep-25",
  "Oct-25",
  "Nov-25",
  "Dec-25",
  "Jan-26",
  "Feb-26",
  "Mar-26",
];

/**
 * Fallback site/depot axis (reference workbook: 5 sites). Rows 14…18 per grid prefix.
 * Ordering matches the workbook's Scope 1A / Scope 2 / Water blocks
 * (`E_Data!A14:A18`, `A41:A45`, `A58:A62`), which are all alphabetical.
 */
export const ESG_DEFAULT_DEPOTS = ["BLOEM", "CPT", "DBN", "ISANDO", "PE"];

export type EsgReportingAxes = {
  /** Site/depot row labels, in row order. */
  depots: string[];
  /** Reporting month column headers, in column order (C…K). */
  months: string[];
};

export const ESG_FALLBACK_REPORTING_AXES: EsgReportingAxes = {
  depots: ESG_DEFAULT_DEPOTS,
  months: ESG_DEFAULT_MONTHS,
};

/**
 * Merge a partial (per-entity) axis over the fallbacks. Empty arrays fall back too,
 * so a half-configured entity still renders a usable grid instead of an empty one.
 */
export function resolveEsgReportingAxes(partial?: Partial<EsgReportingAxes> | null): EsgReportingAxes {
  const depots = partial?.depots?.length ? [...partial.depots] : [...ESG_DEFAULT_DEPOTS];
  const months = partial?.months?.length ? [...partial.months] : [...ESG_DEFAULT_MONTHS];
  return { depots, months };
}

const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Build a reporting-month axis from a start month and a length, e.g.
 * `buildEsgReportingMonths("Apr-26", 12)` → `["Apr-26", … , "Mar-27"]`.
 * Falls back to {@link ESG_DEFAULT_MONTHS} when the start month is unparseable,
 * so a bad value degrades to the reference axis rather than an empty grid.
 */
export function buildEsgReportingMonths(startMonth: string, count: number): string[] {
  const m = /^([A-Za-z]{3})-(\d{2})$/.exec(String(startMonth ?? "").trim());
  let idx = m ? MONTH_ABBR.findIndex((x) => x.toLowerCase() === m[1].toLowerCase()) : -1;
  if (!m || idx < 0 || !Number.isFinite(count) || count <= 0) return [...ESG_DEFAULT_MONTHS];
  let year = Number(m[2]);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(`${MONTH_ABBR[idx]}-${String(year).padStart(2, "0")}`);
    idx += 1;
    if (idx === 12) {
      idx = 0;
      year = (year + 1) % 100;
    }
  }
  return out;
}
