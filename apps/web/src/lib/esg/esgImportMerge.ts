/**
 * How an import lands on a workbook that already holds data.
 *
 * WHY THIS EXISTS
 *
 * The import confirm used to do `wb.sections[key] = { cells }`: every section
 * the import touched was REPLACED by whatever the import carried. Both writes
 * go through that endpoint — the Excel import and the document parser's "Add
 * documents" inside a workbook — so a diesel report that placed two figures in
 * the environmental section erased every monthly figure already captured there,
 * and a template filled in for one pillar wiped every register its untouched
 * sheets carried (an empty register sheet still arrives as `_row_count: 0`).
 * All the while the preview promised "an import never blanks a cell". This is
 * the write keeping that promise.
 *
 * The rules:
 *  - A value cell: the import's value wins when it has one. An empty value in
 *    the import never blanks one already captured.
 *  - A register (fleet, waste, ISO tracker …): each row the import carries is
 *    matched to the register by what identifies it — a vehicle by its
 *    registration, a King V principle by its number (REGISTER_ROW_KEYS). A
 *    match UPDATES that row (its empty fields never blank captured ones); no
 *    match ADDS a row; a row with no identifier is added unless an identical
 *    one is already there. So re-importing an exported, corrected workbook
 *    corrects it, uploading the same file twice changes nothing, and rows the
 *    import does not mention stay. An import with no rows leaves the register
 *    exactly as it was.
 *  - Cells that share a register's section but are not rows (the waste
 *    scorecard figures, King V's derived total) follow the value-cell rule.
 *
 * Nothing here deletes. Removing captured data is something a person does in
 * the editor, on purpose.
 */
import { ESG_GRID_SECTIONS, isEsgGridSection, type EsgGridSectionId } from "./esgGridSections";
import { readEsgGridRows, refFor, writeEsgGridCells, type EsgGridRow } from "./esgGridRows";

type CellValue = string | number | boolean | null;
export type EsgCells = Record<string, unknown>;

const ROWS_KEY = "_rows";
const ROW_COUNT_KEY = "_row_count";

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

function asCellValue(value: unknown): CellValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return String(value);
}

/**
 * The row numbers a register's rows physically occupy, decided the way the
 * reader decides: the pipeline's own `_row_count` stamp when there is one,
 * otherwise the contiguous block from the register's first row.
 */
function rowRegion(sectionId: EsgGridSectionId, cells: EsgCells): { start: number; end: number } {
  const def = ESG_GRID_SECTIONS[sectionId];
  const stamped = Number(cells[ROW_COUNT_KEY]);
  if (Number.isFinite(stamped) && stamped >= 0) {
    return { start: def.startRow, end: def.startRow + stamped };
  }
  const letters = new Set(def.columns.map((col, i) => refFor(def, col, i)));
  const occupied = new Set<number>();
  for (const ref of Object.keys(cells)) {
    const m = ref.match(/^([A-Z]+)(\d+)$/);
    if (m && letters.has(m[1])) occupied.add(Number(m[2]));
  }
  let end = def.startRow;
  while (occupied.has(end)) end += 1;
  return { start: def.startRow, end };
}

/** A register section's cells that are NOT its rows — and not the row bookkeeping. */
export function nonRowCells(sectionId: EsgGridSectionId, cells: EsgCells): EsgCells {
  const def = ESG_GRID_SECTIONS[sectionId];
  const letters = new Set(def.columns.map((col, i) => refFor(def, col, i)));
  const { start, end } = rowRegion(sectionId, cells);
  const out: EsgCells = {};
  for (const [ref, value] of Object.entries(cells)) {
    if (ref === ROWS_KEY || ref === ROW_COUNT_KEY) continue;
    const m = ref.match(/^([A-Z]+)(\d+)$/);
    if (m && letters.has(m[1])) {
      const row = Number(m[2]);
      if (row >= start && row < end) continue;
    }
    out[ref] = value;
  }
  return out;
}

/**
 * What makes two rows "the same row" in each register, most specific first.
 * Lists are keyed by what a person would call the thing (a vehicle's
 * registration, a supplier's name); checklists by their fixed item (a King V
 * principle's number, an IFRS requirement). A register not listed here is
 * matched only by an identical row.
 */
const REGISTER_ROW_KEYS: Record<string, string[][]> = {
  fleet: [["reg"]],
  waste: [["month", "depot", "wasteType"]],
  "driver-debrief": [["date", "driver", "route"]],
  "iso-tracker": [["requirement", "clause"], ["requirement"]],
  king5: [["num"], ["principle"]],
  ifrs: [["requirement"]],
  garp: [["risk"]],
  saq: [["supplier"]],
  "s-data-ofo": [["ofoCode", "programme"]],
  "s-data-csi": [["initiative", "month"]],
};

function normalise(value: unknown): string {
  if (isEmpty(value)) return "";
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : String(value).trim().toLowerCase().replace(/\s+/g, " ");
}

/** Two rows are the same row when every column holds the same value. */
function rowSignature(sectionId: EsgGridSectionId, row: EsgGridRow): string {
  return ESG_GRID_SECTIONS[sectionId].columns.map((col) => normalise(row[col.key])).join("\u0001");
}

/** The row's identity under the first key whose columns it fills, or null. */
function rowKey(sectionId: EsgGridSectionId, row: EsgGridRow): string | null {
  const keySets = REGISTER_ROW_KEYS[sectionId] ?? [];
  for (let i = 0; i < keySets.length; i++) {
    const parts = keySets[i].map((col) => normalise(row[col]));
    if (parts.every((p) => p !== "")) return `${i}\u0002${parts.join("\u0001")}`;
  }
  return null;
}

/**
 * The incoming row's filled fields over the captured row's. A field that only
 * differs in case, spacing or "1200" vs 1200 keeps the captured spelling.
 */
function updateRow(existing: EsgGridRow, incoming: EsgGridRow, sectionId: EsgGridSectionId): EsgGridRow {
  const out: EsgGridRow = { ...existing };
  for (const col of ESG_GRID_SECTIONS[sectionId].columns) {
    const v = incoming[col.key];
    if (isEmpty(v) || normalise(v) === normalise(existing[col.key])) continue;
    out[col.key] = v;
  }
  return out;
}

/** Value cells: the import's non-empty values over what is already there. */
function mergeValueCells(existing: EsgCells, incoming: EsgCells): Record<string, CellValue> {
  const out: Record<string, CellValue> = {};
  for (const [ref, value] of Object.entries(existing)) {
    if (ref === ROWS_KEY || value === undefined) continue;
    out[ref] = asCellValue(value);
  }
  for (const [ref, value] of Object.entries(incoming)) {
    if (ref === ROWS_KEY || isEmpty(value)) continue;
    out[ref] = asCellValue(value);
  }
  return out;
}

export interface EsgRegisterMergeOutcome {
  sectionId: EsgGridSectionId;
  /** Rows the workbook held before. */
  existing: number;
  /** Rows the import carried. */
  incoming: number;
  /** Rows the import adds. */
  added: number;
  /** Rows already in the register that the import changes. */
  updated: number;
  /** Rows the import carried that were already there unchanged. */
  alreadyThere: number;
}

export interface EsgSectionMergeResult {
  cells: Record<string, CellValue>;
  /** Set for a register section. */
  register?: EsgRegisterMergeOutcome;
}

/** One section: what the workbook holds after this import, by the rules above. */
export function mergeImportIntoSection(
  sectionId: string,
  existingCells: EsgCells | undefined,
  incomingCells: EsgCells | undefined,
): EsgSectionMergeResult {
  const existing = existingCells ?? {};
  const incoming = incomingCells ?? {};

  if (!isEsgGridSection(sectionId)) {
    return { cells: mergeValueCells(existing, incoming) };
  }

  const existingRows = readEsgGridRows(existing, sectionId);
  const incomingRows = readEsgGridRows(incoming, sectionId);
  const scalars = mergeValueCells(nonRowCells(sectionId, existing), nonRowCells(sectionId, incoming));

  if (incomingRows.length === 0) {
    // Nothing to add: the rows stay exactly as stored, stamp included.
    const kept: Record<string, CellValue> = mergeValueCells(existing, {});
    for (const [ref, value] of Object.entries(scalars)) kept[ref] = value;
    return {
      cells: kept,
      register: { sectionId, existing: existingRows.length, incoming: 0, added: 0, updated: 0, alreadyThere: 0 },
    };
  }

  const rows: EsgGridRow[] = existingRows.map((row) => ({ ...row }));
  const byKey = new Map<string, number>();
  rows.forEach((row, i) => {
    const key = rowKey(sectionId, row);
    if (key && !byKey.has(key)) byKey.set(key, i);
  });
  const signatures = new Set(rows.map((row) => rowSignature(sectionId, row)));
  const changed = new Set<number>();
  let added = 0;
  let alreadyThere = 0;

  for (const row of incomingRows) {
    const key = rowKey(sectionId, row);
    const at = key ? byKey.get(key) : undefined;
    if (at !== undefined) {
      const before = rowSignature(sectionId, rows[at]);
      rows[at] = updateRow(rows[at], row, sectionId);
      if (rowSignature(sectionId, rows[at]) === before) alreadyThere += 1;
      else changed.add(at);
      continue;
    }
    const sig = rowSignature(sectionId, row);
    if (signatures.has(sig)) {
      alreadyThere += 1;
      continue;
    }
    signatures.add(sig);
    rows.push(row);
    if (key) byKey.set(key, rows.length - 1);
    added += 1;
  }

  return {
    cells: writeEsgGridCells(sectionId, rows, scalars),
    register: {
      sectionId,
      existing: existingRows.length,
      incoming: incomingRows.length,
      added,
      updated: Array.from(changed).filter((i) => i < existingRows.length).length,
      alreadyThere,
    },
  };
}

/** Every section an import carries, merged into the workbook's current sections. */
export function mergeImportIntoSections(
  current: Record<string, { cells?: EsgCells } | undefined> | undefined,
  incoming: Record<string, { cells?: EsgCells } | undefined>,
): Record<string, EsgSectionMergeResult> {
  const out: Record<string, EsgSectionMergeResult> = {};
  for (const [sectionId, section] of Object.entries(incoming)) {
    out[sectionId] = mergeImportIntoSection(sectionId, current?.[sectionId]?.cells, section?.cells);
  }
  return out;
}
