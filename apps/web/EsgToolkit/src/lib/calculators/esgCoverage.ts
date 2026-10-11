/**
 * How much of a monthly grid is actually filled in: the share of the
 * workbook's sites × months that hold a figure.
 *
 * Several Environmental rows are worded as COVERAGE — "electricity tracked
 * monthly at every site", "water … at every site", "Scope 1 baseline
 * established & tracked" — but the workbook scores them `IF(total > 0)`: one
 * site's one month earns the same points as every site's every month. A
 * workbook with three of its five depots blank scored them in full.
 *
 * The axes are the workbook's own (`esgWorkbookAxes`): its sites, and its
 * reporting months up to the last month any site has reported — a year in
 * progress is not penalised for the months still to come, but a site with no
 * figures, or a month a site skipped, is a gap.
 */
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { esgWorkbookAxes } from "@/components/esg-workbook/esgDefaults";

export type EsgGridCoverage = {
  /** Site rows the grid should hold (1 for a company-wide workbook). */
  sites: number;
  /** Months up to and including the last month any site reported. */
  months: number;
  /** Site × month cells holding a figure (a stated 0 is a figure). */
  filled: number;
  /** filled ÷ (sites × months), 0–1. */
  share: number;
  /** Sites with no figure in any reported month, as the axes name them. */
  missingSites: string[];
};

const FIRST_ROW = 14;
/** The reference sheet's first row of each block (`esgDeriveSummary`'s E_MONTHLY_BLOCKS). */
const SHEET_FIRST_ROW: Record<string, number> = { s1a: 14, s1b: 23, s1c: 32, s1d: 37, s2: 41, solar: 50, water: 58 };
const FIRST_MONTH_COLUMN = 67; // "C"

function present(value: unknown): boolean {
  if (value === undefined || value === null || value === "" || typeof value === "boolean") return false;
  return Number.isFinite(typeof value === "number" ? value : Number(value));
}

/** Coverage of the monthly grid `prefix` (s1a, s2, water, …), or null when it holds no figure at all. */
export function esgGridCoverage(workbook: EsgWorkbookData, prefix: string): EsgGridCoverage | null {
  const cells = (workbook.sections?.["e-data"]?.cells ?? {}) as Record<string, unknown>;
  const axes = esgWorkbookAxes(cells);
  const siteNames = axes.companyWide ? ["Company wide"] : axes.depots;
  const sites = Math.max(1, siteNames.length);
  const monthCount = Math.max(1, axes.months.length);
  /*
   * The app addresses every block from row 14; a workbook stored under its
   * sheet's own rows (an import not yet re-saved) uses the sheet's first row
   * for the block. Whichever the cells use is the base.
   */
  const rowsUsed = new Set<number>();
  const pattern = new RegExp(`^${prefix}_[C-Z](\\d+)$`);
  for (const key of Object.keys(cells)) {
    const m = pattern.exec(key);
    if (m) rowsUsed.add(Number(m[1]));
  }
  const appBase = Array.from(rowsUsed).some((r) => r >= FIRST_ROW && r < FIRST_ROW + sites);
  const base = appBase ? FIRST_ROW : (SHEET_FIRST_ROW[prefix] ?? FIRST_ROW);
  const ref = (row: number, month: number) => `${prefix}_${String.fromCharCode(FIRST_MONTH_COLUMN + month)}${base + row}`;

  let lastMonth = -1;
  for (let row = 0; row < sites; row += 1) {
    for (let month = 0; month < monthCount; month += 1) {
      if (present(cells[ref(row, month)]) && month > lastMonth) lastMonth = month;
    }
  }
  if (lastMonth < 0) return null;

  const months = lastMonth + 1;
  let filled = 0;
  const missingSites: string[] = [];
  for (let row = 0; row < sites; row += 1) {
    let siteFilled = 0;
    for (let month = 0; month < months; month += 1) {
      if (present(cells[ref(row, month)])) siteFilled += 1;
    }
    filled += siteFilled;
    if (siteFilled === 0) missingSites.push(siteNames[row] ?? `Site ${row + 1}`);
  }
  return { sites, months, filled, share: filled / (sites * months), missingSites };
}
