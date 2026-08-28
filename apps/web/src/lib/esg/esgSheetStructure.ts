/**
 * Sheet-address → app-address translation for the ESG workbook.
 *
 * WHY THIS EXISTS
 *
 * The XLSX import stored E_Data exactly as the sheet spells it — `C14`, `D41`,
 * `K62` — while every consumer in the app speaks the grid convention
 * (`s1a_C14`, `s2_C41`, `water_C14`, `hc_2_5`). The result was the worst kind
 * of bug: the sidebar counted 788 imported cells, the store faithfully HELD all
 * of them, and every monthly grid rendered empty because it was reading
 * addresses nothing had written. Data held but not structured is data lost.
 *
 * This module is the one place that knows both spellings. It is used by
 *  - the XLSX import, so imported workbooks land in the cells the grids read;
 *  - `deriveEsgSummaryCells`, so scoring sees imported data without waiting
 *    for anyone to open an editor; and
 *  - the section editors, so workbooks imported before this fix display
 *    (and re-persist, on next save) correctly.
 *
 * Merging rule everywhere: translations NEVER overwrite an existing app-address
 * cell. A user's typed value always beats a translation of the sheet.
 */
import { ESG_DEFAULT_DEPOTS } from "./esgAxes";

type Cells = Record<string, unknown>;

/**
 * The E_Data monthly blocks, by SHEET row — v1.7 layout, same table as
 * `esgDeriveSummary.ts#E_MONTHLY_BLOCKS` reads by prefix.
 *
 * The app's `EsgMonthlyGrid` addresses every block from row base 14
 * (`${prefix}_${col}${14 + rowIndex}`) regardless of where the block sits on
 * the sheet, so translation maps sheet row → block ordinal → grid row.
 */
const E_DATA_SHEET_BLOCKS: ReadonlyArray<{
  prefix: string;
  firstRow: number;
  rowCount: number;
}> = [
  { prefix: "s1a", firstRow: 14, rowCount: 5 }, // Scope 1A road-freight diesel
  { prefix: "s1b", firstRow: 23, rowCount: 5 }, // Scope 1B generator diesel
  { prefix: "s1c", firstRow: 32, rowCount: 1 }, // Scope 1C LPG forklifts
  { prefix: "s1d", firstRow: 37, rowCount: 1 }, // Scope 1D business cars
  { prefix: "s2", firstRow: 41, rowCount: 5 }, // Scope 2 electricity
  { prefix: "solar", firstRow: 50, rowCount: 5 }, // Solar generation
  { prefix: "water", firstRow: 58, rowCount: 5 }, // Scope 3 water
  { prefix: "waste", firstRow: 67, rowCount: 1 }, // % waste recycled monthly row
];

/** Month columns C…K, as both the sheet and the grid spell them. */
const MONTH_COLS = ["C", "D", "E", "F", "G", "H", "I", "J", "K"] as const;

const GRID_ROW_BASE = 14;

function isNumberLike(v: unknown): boolean {
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v !== "string" || v.trim() === "") return false;
  return Number.isFinite(Number(v.replace(/[\s,]/g, "")));
}

/**
 * Which grid row a sheet row belongs to.
 *
 * For the five-row per-depot blocks, the row label (column A) is matched
 * against the depot axis by name, because the source workbook does not keep one
 * depot order: its solar block runs ISANDO, DBN, CPT, BLOEM, PE while its
 * electricity block runs BLOEM, CPT, DBN, ISANDO, PE. Ordinal mapping would
 * silently hand ISANDO's solar generation to BLOEM. Ordinal is the fallback
 * when the label names no known depot.
 */
function gridIndexFor(
  raw: Cells,
  sheetRow: number,
  ordinal: number,
  rowCount: number,
): number {
  if (rowCount === 1) return 0;
  const label = String(raw[`A${sheetRow}`] ?? "").toUpperCase();
  if (label) {
    const hit = ESG_DEFAULT_DEPOTS.findIndex((depot) => label.includes(depot.toUpperCase()));
    if (hit >= 0) return hit;
  }
  return ordinal;
}

/**
 * The `s1a_C14`-style cells implied by an E_Data sheet's raw cell map.
 *
 * Returns ONLY the translated cells — callers decide merge precedence. Cells
 * that already exist under a prefixed address in `raw` are never produced, so
 * `{...translated, ...stored}` and `{...stored, ...translated}` are both safe.
 */
export function eDataCellsFromSheetRefs(raw: Cells): Cells {
  const out: Cells = {};
  for (const block of E_DATA_SHEET_BLOCKS) {
    for (let ordinal = 0; ordinal < block.rowCount; ordinal++) {
      const sheetRow = block.firstRow + ordinal;
      const gridRow = GRID_ROW_BASE + gridIndexFor(raw, sheetRow, ordinal, block.rowCount);
      for (const col of MONTH_COLS) {
        const ref = `${block.prefix}_${col}${gridRow}`;
        if (raw[ref] !== undefined) continue; // an app-address value always wins
        const v = raw[`${col}${sheetRow}`];
        if (isNumberLike(v)) out[ref] = typeof v === "number" ? v : Number(String(v).replace(/[\s,]/g, ""));
      }
      // Column N — "Source File", shown in the grid's Source column.
      const srcRef = `${block.prefix}_src_${gridRow - GRID_ROW_BASE}`;
      const src = raw[`N${sheetRow}`];
      if (raw[srcRef] === undefined && typeof src === "string" && src.trim() !== "") {
        out[srcRef] = src;
      }
    }
  }
  return out;
}

/** `S_Data!B5:K11` — the EEA2 headcount matrix the grid spells `hc_{row}_{col}`. */
const HEADCOUNT_SHEET_COLS = ["B", "C", "D", "E", "F", "G", "H", "I", "J", "K"] as const;
const HEADCOUNT_SHEET_FIRST_ROW = 5;
const HEADCOUNT_LEVELS = 7;

/**
 * The `hc_r_c` cells implied by an S_Data sheet's raw headcount matrix.
 *
 * Produces nothing when ANY `hc_` cell already exists: a half-translated matrix
 * mixing app entries with sheet values would double-count nobody can see.
 */
export function headcountCellsFromSheetRefs(raw: Cells): Cells {
  for (const ref of Object.keys(raw)) {
    if (ref.startsWith("hc_")) return {};
  }
  const out: Cells = {};
  for (let r = 0; r < HEADCOUNT_LEVELS; r++) {
    for (let c = 0; c < HEADCOUNT_SHEET_COLS.length; c++) {
      const v = raw[`${HEADCOUNT_SHEET_COLS[c]}${HEADCOUNT_SHEET_FIRST_ROW + r}`];
      if (isNumberLike(v)) out[`hc_${r}_${c}`] = typeof v === "number" ? v : Number(v);
    }
  }
  return out;
}

/**
 * One section's cells with sheet-address data made visible to the app.
 *
 * Stored cells always win — this only ADDS the app-address spelling of values
 * that exist solely under their sheet address.
 */
export function hydrateEsgSectionCells(sectionId: string, cells: Cells): Cells {
  if (sectionId === "e-data") {
    const translated = eDataCellsFromSheetRefs(cells);
    return Object.keys(translated).length ? { ...translated, ...cells } : cells;
  }
  if (sectionId === "s-data") {
    const translated = headcountCellsFromSheetRefs(cells);
    return Object.keys(translated).length ? { ...translated, ...cells } : cells;
  }
  return cells;
}

/** Workbook-shaped wrapper for the derive layer; clones only when needed. */
export function hydrateEsgWorkbookSections<
  T extends { sections?: Record<string, { cells?: Cells } | undefined> },
>(workbook: T): T {
  const sections = workbook.sections ?? {};
  let changed = false;
  const next: Record<string, { cells?: Cells } | undefined> = { ...sections };
  for (const id of ["e-data", "s-data"]) {
    const cells = sections[id]?.cells;
    if (!cells) continue;
    const hydrated = hydrateEsgSectionCells(id, cells);
    if (hydrated !== cells) {
      next[id] = { ...sections[id], cells: hydrated };
      changed = true;
    }
  }
  return changed ? { ...workbook, sections: next } : workbook;
}
