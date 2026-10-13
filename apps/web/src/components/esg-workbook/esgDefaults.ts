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
  /** Reporting month column headers, in column order (C onwards). */
  months: string[];
  /**
   * The company reports as ONE row ("Company wide"): every site's figures add
   * up into row 0 rather than each site having a row of its own.
   */
  companyWide?: boolean;
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
  return { depots, months, ...(partial?.companyWide ? { companyWide: true } : {}) };
}

/** The most months one grid carries: columns C…Z. */
export const ESG_MAX_REPORTING_MONTHS = 24;

/**
 * Where a workbook keeps its OWN axes: E_Data cells beside the scope
 * ("Per site / depot" | "Company wide") it always had. A workbook that never
 * set them reports on the fallbacks above — the axes every workbook had before
 * they could be set — so the cells it saved keep their meaning.
 */
export const ESG_AXIS_CELLS = {
  scope: "eScope",
  sites: "eSites",
  firstMonth: "eFirstMonth",
  monthCount: "eMonthCount",
} as const;

export const ESG_COMPANY_WIDE_SCOPE = "Company wide";

/** "BLOEM, CPT\nDBN" → ["BLOEM", "CPT", "DBN"]. A repeat, in any case, is dropped. */
export function parseEsgSites(value: unknown): string[] {
  const list = Array.isArray(value) ? value : String(value ?? "").split(/[\n,;]+/);
  const seen = new Set<string>();
  const sites: string[] = [];
  for (const raw of list) {
    const site = String(raw ?? "").trim();
    if (!site || seen.has(site.toUpperCase())) continue;
    seen.add(site.toUpperCase());
    sites.push(site);
  }
  return sites;
}

/** What a workbook's E_Data cells say about its axes — only what they say. */
export type EsgAxisSettings = {
  depots?: string[];
  months?: string[];
  /** Absent when the workbook has not said whether it reports per site. */
  companyWide?: boolean;
};

export function esgAxisSettings(eData?: Record<string, unknown> | null): EsgAxisSettings {
  const cells = eData ?? {};
  const depots = parseEsgSites(cells[ESG_AXIS_CELLS.sites]);
  const first = String(cells[ESG_AXIS_CELLS.firstMonth] ?? "").trim();
  const stated = Number(cells[ESG_AXIS_CELLS.monthCount]);
  const count = Number.isFinite(stated) && stated > 0 ? Math.min(Math.floor(stated), ESG_MAX_REPORTING_MONTHS) : 12;
  const months = /^[A-Za-z]{3}-\d{2}$/.test(first) ? buildEsgReportingMonths(first, count) : [];
  const scope = String(cells[ESG_AXIS_CELLS.scope] ?? "").trim();
  return {
    ...(depots.length ? { depots } : {}),
    ...(months.length ? { months } : {}),
    ...(scope ? { companyWide: scope === ESG_COMPANY_WIDE_SCOPE } : {}),
  };
}

/** The axes a workbook reports on, from its own E_Data cells. */
export function esgWorkbookAxes(eData?: Record<string, unknown> | null): EsgReportingAxes {
  return resolveEsgReportingAxes(esgAxisSettings(eData));
}

/** The E_Data cells that record `axes` — written with the first figures placed on them. */
export function esgAxisCells(axes: EsgReportingAxes): Record<string, string | number> {
  return {
    [ESG_AXIS_CELLS.sites]: axes.depots.join("\n"),
    [ESG_AXIS_CELLS.firstMonth]: axes.months[0] ?? "",
    [ESG_AXIS_CELLS.monthCount]: axes.months.length,
    ...(axes.companyWide ? { [ESG_AXIS_CELLS.scope]: ESG_COMPANY_WIDE_SCOPE } : {}),
  };
}

/** Month labels a reporting year can start on: three years back to one ahead of `now`. */
export function esgReportingMonthOptions(now: Date = new Date()): string[] {
  const year = now.getFullYear();
  return buildEsgReportingMonths(`Jan-${String((year - 3) % 100).padStart(2, "0")}`, 60);
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
