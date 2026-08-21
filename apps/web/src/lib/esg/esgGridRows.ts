/**
 * ESG register rows ↔ flat cell refs (A4, B4, …) for API storage and XLSX export.
 */
import type { ColumnDef } from "@/components/workbook/sections";
import {
  ESG_GRID_SECTIONS,
  type EsgGridSectionDef,
  type EsgGridSectionId,
  isEsgGridSection,
} from "./esgGridSections";

export type EsgGridRow = Record<string, unknown> & { _id: string };

const ROWS_KEY = "_rows";

function colLetter(index: number): string {
  let n = index;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

function makeId(): string {
  return `esg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Excel column for a grid column: the section's explicit `columnLetters`
 * override when present, else positional (index 0 → A).
 *
 * ISO_Tracker and IFRS_S1_S2 start at B and reserve E for a sheet-derived
 * "Score /5", so positional mapping put Status in C while every scorecard
 * formula reads D.
 */
function refFor(def: EsgGridSectionDef, col: ColumnDef, colIdx: number): string {
  return def.columnLetters?.[col.key] ?? colLetter(colIdx);
}

export function readEsgGridRows(
  cells: Record<string, unknown> | undefined,
  sectionId: EsgGridSectionId,
): EsgGridRow[] {
  const stored = cells?.[ROWS_KEY];
  if (Array.isArray(stored) && stored.length > 0) {
    return stored.map((r) => {
      const row = { ...(r as Record<string, unknown>) };
      if (!row._id) row._id = makeId();
      return row as EsgGridRow;
    });
  }
  return rowsFromFlatCells(cells ?? {}, sectionId);
}

function rowsFromFlatCells(
  cells: Record<string, unknown>,
  sectionId: EsgGridSectionId,
): EsgGridRow[] {
  const def = ESG_GRID_SECTIONS[sectionId];
  const rowNums = new Set<number>();
  for (const ref of Object.keys(cells)) {
    if (ref === ROWS_KEY || ref.startsWith("_")) continue;
    const m = ref.match(/^([A-Z]+)(\d+)$/);
    if (!m) continue;
    const row = parseInt(m[2], 10);
    if (row >= def.startRow) rowNums.add(row);
  }
  const sorted = [...rowNums].sort((a, b) => a - b);
  const out: EsgGridRow[] = [];
  for (const rowNum of sorted) {
    const row: EsgGridRow = { _id: makeId() };
    def.columns.forEach((col, colIdx) => {
      const ref = `${refFor(def, col, colIdx)}${rowNum}`;
      if (cells[ref] !== undefined) row[col.key] = cells[ref];
    });
    if (hasRowData(row, def.columns)) out.push(row);
  }
  return out;
}

function hasRowData(row: EsgGridRow, columns: ColumnDef[]): boolean {
  for (const col of columns) {
    const v = row[col.key];
    if (v === undefined || v === null || v === "") continue;
    if (col.type === "boolean" && v === false) continue;
    return true;
  }
  return false;
}

export function writeEsgGridCells(
  sectionId: EsgGridSectionId,
  rows: EsgGridRow[],
  preserveMeta: Record<string, unknown> = {},
): Record<string, string | number | boolean | null> {
  const def = ESG_GRID_SECTIONS[sectionId];
  const cells: Record<string, string | number | boolean | null> = { ...preserveMeta };

  const cleanRows = rows.filter((r) => hasRowData(r, def.columns));

  for (let i = 0; i < cleanRows.length; i++) {
    const rowNum = def.startRow + i;
    const row = cleanRows[i];
    def.columns.forEach((col, colIdx) => {
      const v = row[col.key];
      if (v === undefined || v === null || v === "") return;
      cells[`${refFor(def, col, colIdx)}${rowNum}`] =
        typeof v === "boolean" ? (v ? 1 : 0) : (v as string | number);
    });
  }

  syncDerivedFields(sectionId, cells, cleanRows);
  return cells;
}

function syncDerivedFields(
  sectionId: EsgGridSectionId,
  cells: Record<string, string | number | boolean | null>,
  rows: EsgGridRow[],
): void {
  if (sectionId === "king5") {
    const filled = rows.filter((r) => String(r.status ?? "").trim() !== "").length;
    cells["_principles_filled"] = filled;
    let total = 0;
    for (const r of rows) {
      const status = String(r.status ?? "");
      const weight = Number(r.weight) || 0;
      const score =
        status === "Applied"
          ? 10
          : status === "Explained"
            ? 7
            : status === "Partially Applied"
              ? 5
              : 0;
      total += (score * weight) / 10;
    }
    if (rows.length > 0) cells.E21 = Math.round(total * 100) / 100;
  }

  if (sectionId === "ifrs") {
    const withStatus = rows.filter((r) => String(r.status ?? "").trim() !== "");
    const disclosed = withStatus.filter((r) => r.status === "Disclosed").length;
    cells._yes_count = disclosed;
    cells._total = withStatus.length || 10;
  }

  if (sectionId === "driver-debrief") {
    const active = rows.some((r) => String(r.driver ?? r.date ?? "").trim() !== "") ? 1 : 0;
    cells._active = active;
  }
}

/** COUNTA(King5!C4:C30) — non-blank principle status cells. */
export function countKing5Principles(workbook: {
  sections?: Record<string, { cells?: Record<string, unknown> }>;
} | null): number {
  if (!workbook) return 0;
  const cells = workbook.sections?.king5?.cells ?? {};
  const meta = cells._principles_filled;
  if (typeof meta === "number") return meta;

  const rows = readEsgGridRows(cells, "king5");
  if (rows.length > 0) {
    return rows.filter((r) => String(r.status ?? "").trim() !== "").length;
  }

  let count = 0;
  for (let row = 4; row <= 30; row++) {
    const v = cells[`C${row}`];
    if (v != null && String(v).trim() !== "") count++;
  }
  return count;
}

export function countDriverDebriefRows(workbook: {
  sections?: Record<string, { cells?: Record<string, unknown> }>;
} | null): number {
  const cells = workbook?.sections?.["driver-debrief"]?.cells ?? {};
  if (cells._active === 1) return 1;
  const rows = readEsgGridRows(cells, "driver-debrief");
  return rows.filter((r) => String(r.driver ?? r.date ?? "").trim() !== "").length;
}

export function countFleetRegisterRows(workbook: {
  sections?: Record<string, { cells?: Record<string, unknown> }>;
} | null): number {
  const cells = workbook?.sections?.fleet?.cells ?? {};
  const rows = readEsgGridRows(cells, "fleet");
  if (rows.length > 0) return rows.length;
  let count = 0;
  for (let row = 4; row <= 30; row++) {
    const v = cells[`A${row}`];
    if (v != null && String(v).trim() !== "") count++;
  }
  return count;
}

export function stripRowsFromCells(
  cells: Record<string, unknown>,
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(cells)) {
    if (k === ROWS_KEY) continue;
    if (v === undefined) continue;
    out[k] =
      typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null
        ? v
        : String(v);
  }
  return out;
}

export function mergeEsgSectionCells(
  sectionId: string,
  rows: EsgGridRow[],
  existing?: Record<string, unknown>,
): Record<string, string | number | boolean | null> {
  if (!isEsgGridSection(sectionId)) {
    return stripRowsFromCells(existing ?? {});
  }
  const meta = { ...existing };
  delete meta[ROWS_KEY];
  return writeEsgGridCells(sectionId, rows, stripRowsFromCells(meta));
}
