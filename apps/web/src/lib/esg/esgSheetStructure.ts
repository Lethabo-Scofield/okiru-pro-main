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
 * `Cover` — the one section the app addresses by NAME rather than by cell.
 *
 * `COVER_FIELDS` keys its fields `entity`, `period`, `boundary`,
 * `baselineYear`, `netZeroTargetYear`, `sector`; there is no `B4` about it. The
 * import, meanwhile, stores every sheet by A1 address, so a Cover sheet arrived
 * as `{A1:"Entity", B1:"Acme (Pty) Ltd", …}` and not one of those keys was ever
 * produced. Company & Reporting Setup was therefore UNFILLABLE from Excel: the
 * import reported success, the sidebar counted the cells, and the section
 * stayed blank. The organisational boundary is a mandatory GHG Protocol
 * disclosure, so that is not a cosmetic gap.
 *
 * The bridge is the label. Each row's first text cell is matched against the
 * field labels (case and punctuation ignored) and the next non-empty cell on
 * that row becomes the value. That reads the generated template and a client's
 * own cover sheet alike, because writing the label beside the value is the only
 * thing a cover sheet ever does.
 */
const COVER_LABEL_TO_KEY: ReadonlyArray<{ key: string; labels: readonly string[] }> = [
  { key: "entity", labels: ["entity", "entity name", "company", "company name", "legal entity"] },
  { key: "period", labels: ["reporting period", "period", "financial year", "reporting year"] },
  { key: "boundary", labels: ["organisational boundary", "organizational boundary", "boundary"] },
  { key: "baselineYear", labels: ["baseline year", "base year"] },
  {
    key: "netZeroTargetYear",
    labels: ["net zero target year", "net zero year", "net zero target"],
  },
  { key: "sector", labels: ["sector", "industry", "industry sector"] },
];

/** Case, punctuation and spacing all ignored: "Net-Zero  Target Year" → "net zero target year". */
function normaliseLabel(raw: unknown): string {
  return typeof raw === "string"
    ? raw.replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase()
    : "";
}

/**
 * `S_Data!_hsTracking` — "does the company record H&S incidents?".
 *
 * Also a named key with no cell, and also scored: `social.ts` reads it to tell
 * a clean year apart from an untracked one (expert Q14), which decides four
 * points and whether `d20` is excluded at all. Same bridge, same reason.
 */
const S_DATA_LABEL_TO_KEY: ReadonlyArray<{ key: string; labels: readonly string[] }> = [
  {
    key: "_hsTracking",
    labels: [
      "does the company record health and safety incidents",
      "health and safety incidents recorded",
      "h s incident register in place",
      "incident register in place",
    ],
  },
];

const LABEL_COLUMN_SCAN = ["A", "B", "C", "D", "E", "F"] as const;

/**
 * Values for named (cell-less) fields, read from `label | value` rows.
 *
 * Scans each row left to right for a recognised label and takes the next
 * non-empty cell on that row as the value. A key already present in `raw` is
 * never overwritten — a typed value always beats a label match.
 */
function namedFieldsFromSheetLabels(
  raw: Cells,
  table: ReadonlyArray<{ key: string; labels: readonly string[] }>,
): Cells {
  const out: Cells = {};
  const rows = new Set<number>();
  for (const ref of Object.keys(raw)) {
    const m = /^[A-Z]+([1-9]\d*)$/.exec(ref);
    if (m) rows.add(Number(m[1]));
  }

  for (const row of rows) {
    for (let i = 0; i < LABEL_COLUMN_SCAN.length; i++) {
      const label = normaliseLabel(raw[`${LABEL_COLUMN_SCAN[i]}${row}`]);
      if (!label) continue;
      const field = table.find((f) => f.labels.includes(label));
      // The row's first text cell is not a field label — this row is prose.
      if (!field) break;
      if (raw[field.key] !== undefined || out[field.key] !== undefined) break;
      for (let j = i + 1; j < LABEL_COLUMN_SCAN.length; j++) {
        const value = raw[`${LABEL_COLUMN_SCAN[j]}${row}`];
        if (value === undefined || value === null || String(value).trim() === "") continue;
        out[field.key] = value;
        break;
      }
      break;
    }
  }
  return out;
}

export function coverCellsFromSheetRefs(raw: Cells): Cells {
  return namedFieldsFromSheetLabels(raw, COVER_LABEL_TO_KEY);
}

export function sDataNamedCellsFromSheetRefs(raw: Cells): Cells {
  return namedFieldsFromSheetLabels(raw, S_DATA_LABEL_TO_KEY);
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
    const translated = {
      ...headcountCellsFromSheetRefs(cells),
      ...sDataNamedCellsFromSheetRefs(cells),
    };
    return Object.keys(translated).length ? { ...translated, ...cells } : cells;
  }
  if (sectionId === "company-reporting-setup") {
    const translated = coverCellsFromSheetRefs(cells);
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
  for (const id of ["e-data", "s-data", "company-reporting-setup"]) {
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
