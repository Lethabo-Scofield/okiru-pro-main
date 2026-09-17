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

/**
 * The weight a King IV principle carries when the sheet does not say.
 *
 * `G_Scorecard!C5 = King5_Scorecard!E21 / 170 * 25`, and 170 is 17 principles
 * times 10 points — so 10 is the standard per-principle weight the workbook
 * assumes. Mirrors KING5_POINTS_PER_PRINCIPLE in esgDeriveSummary.ts.
 */
const KING5_STANDARD_WEIGHT = 10;

/**
 * The weight to score a King IV principle at.
 *
 * Exported because `esgDeriveSummary.deriveKing5` computes the SAME weighted
 * total from the same rows — two copies of one rule, which is how the blank
 * weight came to be handled correctly in one and not the other. One function
 * now, called from both.
 */
export function king5Weight(raw: unknown): number {
  const typed = Number(raw);
  if (!Number.isFinite(typed)) return KING5_STANDARD_WEIGHT;
  return String(raw ?? "").trim() === "" ? KING5_STANDARD_WEIGHT : typed;
}

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
export function refFor(def: EsgGridSectionDef, col: ColumnDef, colIdx: number): string {
  return def.columnLetters?.[col.key] ?? colLetter(colIdx);
}

/** The Excel column letter for one grid column of a section. */
export function esgColumnRef(sectionId: EsgGridSectionId, colIdx: number): string {
  const def = ESG_GRID_SECTIONS[sectionId];
  const col = def.columns[colIdx];
  return col ? refFor(def, col, colIdx) : colLetter(colIdx);
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

/**
 * What a candidate register row actually IS.
 *
 * The live client workbooks lay banners ("FLEET SUMMARY"), the sheet's own
 * TOTAL rows, repeated header rows and transposed matrices inside the same
 * column window as the register. Both the XLSX import and this reader classify
 * before accepting, so none of that furniture ever renders as data — and
 * workbooks that were imported before the import learned this heal on read.
 */
export type EsgGridRowKind = "data" | "furniture" | "aggregate" | "header-echo" | "artifact";

/**
 * Text that reads like a sheet banner rather than a value: instruction arrows,
 * "add new/more rows", the block names the live workbook uses (summary,
 * scorecard, recycling, investment blocks), or a multi-word ALL-CAPS heading.
 */
function looksLikeBanner(raw: string): boolean {
  const text = raw.trim();
  if (/^[→↓•■]/.test(text)) return true;
  if (/\badd\s+(new|more)\b/i.test(text)) return true;
  if (/\b(summary|scorecard|recycling|investment)\b/i.test(text)) return true;
  // "FLEET SUMMARY", "OFO CODES — TRAINING", "SANULAC / LACTALIS
  // SUSTAINABILITY DATA [Source: …]" — the live sheets annotate banners with
  // mixed-case source notes in brackets, so strip those before the caps test.
  const head = text.replace(/\[[^\]]*\]|\([^)]*\)/g, "").trim();
  return head.length >= 8 && /\s/.test(head) && head === head.toUpperCase() && /[A-Z]/.test(head);
}

export function classifyEsgGridRow(def: EsgGridSectionDef, row: EsgGridRow): EsgGridRowKind {
  const filled = def.columns
    .map((col) => ({ col, value: row[col.key] }))
    .filter(({ value }) => value !== undefined && value !== null && String(value).trim() !== "");

  // A lone text cell that READS like a banner ("FLEET SUMMARY", "CORITY
  // CARDBOARD RECYCLING", "→ ADD NEW DEBRIEFS…") announces that the register
  // has ENDED. The wording test matters: a row holding only its identity so
  // far (a reg typed a moment ago, autosaved mid-entry) is DATA, and dropping
  // it here would silently delete the row on the next save.
  if (filled.length === 1 && typeof filled[0].value === "string" && looksLikeBanner(filled[0].value)) {
    return "furniture";
  }

  // The sheet's own aggregate. Importing it doubles every number below it.
  if (
    filled.some(
      ({ value }) =>
        typeof value === "string" && /^(grand\s+)?(sub\s*)?total\b/i.test(value.trim()),
    )
  ) {
    return "aggregate";
  }

  // A header row echoed mid-sheet ("Month | Depot | Waste Type").
  if (
    def.columns.some((col) => {
      const v = row[col.key];
      return typeof v === "string" && v.trim().toLowerCase() === col.label.trim().toLowerCase();
    })
  ) {
    return "header-echo";
  }

  // Two or more TEXT columns holding numbers is a transposed matrix landing in
  // the wrong window (the Cority % row put 0.107 in Depot and 0.111 in Waste
  // Type). ONE numeric text column is normal — OFO codes are numeric strings.
  const numericTextCells = filled.filter(
    ({ col, value }) =>
      col.type === "text" &&
      (typeof value === "number" ||
        (typeof value === "string" && value.trim() !== "" && isFinite(Number(value)))),
  );
  if (numericTextCells.length >= 2) return "artifact";

  return "data";
}

function rowsFromFlatCells(
  cells: Record<string, unknown>,
  sectionId: EsgGridSectionId,
): EsgGridRow[] {
  const def = ESG_GRID_SECTIONS[sectionId];

  /*
   * Trust the pipeline's own stamp first. `writeEsgGridCells` records exactly
   * how many rows it wrote, so those rows are read back VERBATIM — no
   * classification, which exists to heal data stored before the import learned
   * regions, and must never second-guess a row the app itself saved.
   */
  const stampedCount = Number(cells["_row_count"]);
  if (Number.isFinite(stampedCount) && stampedCount >= 0) {
    const out: EsgGridRow[] = [];
    for (let i = 0; i < stampedCount; i++) {
      const rowNum = def.startRow + i;
      const row: EsgGridRow = { _id: makeId() };
      def.columns.forEach((col, colIdx) => {
        const ref = `${refFor(def, col, colIdx)}${rowNum}`;
        if (cells[ref] !== undefined) row[col.key] = cells[ref];
      });
      if (hasRowData(row, def.columns)) out.push(row);
    }
    return out;
  }

  const rowNums = new Set<number>();
  for (const ref of Object.keys(cells)) {
    if (ref === ROWS_KEY || ref.startsWith("_")) continue;
    const m = ref.match(/^([A-Z]+)(\d+)$/);
    if (!m) continue;
    const row = parseInt(m[2], 10);
    if (row >= def.startRow) rowNums.add(row);
  }
  const sorted = [...rowNums].sort((a, b) => a - b);
  /*
   * Register rows are CONTIGUOUS FROM startRow — both the app's save path
   * (`mergeEsgSectionCells` compacts on every write) and the import write them
   * that way. Cells that begin later are a different structure sharing the
   * section: the waste scorecard scalars at B16–B19, King V's derived E21.
   * Reading those as rows is how the waste grid once showed four phantom
   * streams built out of its own scorecard.
   */
  if (sorted.length > 0 && sorted[0] !== def.startRow) return [];
  const out: EsgGridRow[] = [];
  let prev: number | null = null;
  for (const rowNum of sorted) {
    // …and a GAP marks the end of the register and the start of whatever
    // shares the sheet below it (the fleet summary matrix at 21+, the Cority
    // block at 12+). Reading past one is how "FLEET SUMMARY" became a vehicle.
    if (prev != null && rowNum > prev + 1) break;
    prev = rowNum;
    const row: EsgGridRow = { _id: makeId() };
    def.columns.forEach((col, colIdx) => {
      const ref = `${refFor(def, col, colIdx)}${rowNum}`;
      if (cells[ref] !== undefined) row[col.key] = cells[ref];
    });
    if (!hasRowData(row, def.columns)) continue;
    const kind = classifyEsgGridRow(def, row);
    if (kind === "furniture") break;
    if (kind !== "data") continue;
    out.push(row);
    if (def.maxRows && out.length >= def.maxRows) break;
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

  // How many rows this write REALLY holds. The reader trusts this over its own
  // furniture/gap heuristics, so a legitimate row that merely LOOKS like a
  // banner ("ENGEN BLOEMFONTEIN" as the only cell typed so far) can never be
  // dropped once it has been saved by this pipeline. Legacy sections without
  // the stamp fall back to the healing heuristics.
  cells["_row_count"] = cleanRows.length;

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
      // A BLANK weight is not a weight of zero. See king5Weight above.
      const weight = king5Weight(r.weight);
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
