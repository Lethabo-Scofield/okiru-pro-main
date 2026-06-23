/**
 * Shared tabular normalization + column-mapping + validation engine.
 *
 * This is the deterministic core used by every "data into a scorecard" flow:
 *   1. Spreadsheet paste into the grid (SpreadsheetGrid.applyPasteToRows)
 *   2. "Import from Excel" section upload (SectionWorkbookEditor)
 *   3. Full toolkit workbook import (excelImport.ts)
 *
 * It is intentionally dependency-light and DOM-free so it can run on both the
 * browser and the Node server (the AI mapping endpoints reuse it for the
 * deterministic fast-path + validation, then only call the LLM when headers
 * cannot be matched confidently).
 *
 * Pipeline contract: ALWAYS normalize, THEN validate. Never silently drop a
 * source column or cell — unmapped columns and uncertain cells are surfaced to
 * the user via the mapping/preview UI instead.
 */
import { v4 as uuidv4 } from "uuid";
import {
  parseWorkbookDate,
  SUPPLIER_SIZE_MAP,
  OCC_LEVEL_MAP,
  BBBEE_LEVEL_MAP,
  DESIGNATION_MAP,
  ESD_CATEGORY_MAP,
  type ColumnDef,
} from "@/components/workbook/sections";
import { coerceYesNo, yesNoToSelectValue } from "@/lib/yesNoValue";
import {
  buildFieldMapping,
  headerSimilarity,
  matchHeaderToField,
  norm as normKey,
  type FieldMapping,
  type FieldMappingMethod,
  type TargetField,
} from "@/lib/columnMatch";
import {
  formatDidYouMeanMessage,
  suggestSelectOption,
  FUZZY_SELECT_ACCEPT,
} from "@/lib/selectOptionMatch";

export type WorkbookGridRow = Record<string, unknown> & { _id: string };

export type CellFlagLevel = "error" | "warning";

export interface CellFlag {
  level: CellFlagLevel;
  message: string;
}

export type MappingMethod = FieldMappingMethod;
export type ColumnMapping = FieldMapping;

/** Adapt a ColumnDef to the generic TargetField shape used by columnMatch. */
export function columnToTargetField(col: ColumnDef): TargetField {
  return { key: col.key, label: col.label, type: col.type, options: col.options, aliases: col.aliases };
}

export function columnsToTargetFields(columns: ColumnDef[]): TargetField[] {
  return columns.map(columnToTargetField);
}

export interface NormalizedCell {
  raw: unknown;
  value: unknown;
  /** True when normalization changed the value (used to highlight in preview). */
  changed: boolean;
  flag?: CellFlag;
}

export interface NormalizedRow {
  _id: string;
  cells: Record<string, NormalizedCell>;
}

export interface NormalizationResult {
  mapping: ColumnMapping[];
  rows: NormalizedRow[];
  headerRowDetected: boolean;
  unmappedHeaders: string[];
  stats: { rowCount: number; mappedColumns: number; flaggedCells: number };
}

const RACE_MAP: Record<string, string> = {
  african: "African",
  black: "African",
  coloured: "Coloured",
  colored: "Coloured",
  indian: "Indian",
  white: "White",
};

const GENDER_MAP: Record<string, string> = {
  male: "Male",
  m: "Male",
  female: "Female",
  f: "Female",
  woman: "Female",
  women: "Female",
  man: "Male",
  men: "Male",
};

// Shared Yes/No synonym sets — the single source of truth for boolean coercion
// across paste, file-import and the grid (keep normalization consistently smart).
export const BOOLEAN_TRUE = new Set([
  "true",
  "yes",
  "y",
  "1",
  "t",
  "✓",
  "x",
  "checked",
  "compliant",
  "yebo",
  "applicable",
  "present",
]);
export const BOOLEAN_FALSE = new Set([
  "false",
  "no",
  "n",
  "0",
  "f",
  "",
  "-",
  "unchecked",
  "non-compliant",
  "na",
  "n/a",
  "none",
  "not applicable",
]);

const PLACEHOLDER_VALUES = new Set([
  "",
  "-",
  "—",
  "n/a",
  "na",
  "none",
  "null",
  "nil",
  "tbc",
  "tbd",
  ".",
]);

export const norm = normKey;

function isPlaceholder(s: string): boolean {
  return PLACEHOLDER_VALUES.has(s.trim().toLowerCase());
}

/**
 * Best deterministic match of a single header string to a target column.
 * Returns null when no column scores above the fuzzy floor.
 */
export function matchHeaderToColumn(
  header: string,
  columns: ColumnDef[],
): { targetKey: string; confidence: number; method: MappingMethod } | null {
  return matchHeaderToField(header, columnsToTargetFields(columns));
}

/**
 * Build a deterministic source-column → target-field mapping. Each target key
 * is assigned to at most one source column (the highest-confidence one).
 */
export function buildDeterministicMapping(
  headers: string[],
  columns: ColumnDef[],
): ColumnMapping[] {
  return buildFieldMapping(headers, columnsToTargetFields(columns));
}

/** Heuristic: does this column hold a percentage value? */
export function isPercentColumn(col: ColumnDef): boolean {
  if (col.type !== "number") return false;
  const hay = `${col.key} ${col.label}`.toLowerCase();
  return (
    hay.includes("percent") ||
    hay.includes("%") ||
    hay.includes("ownership") ||
    hay.includes("voting") ||
    hay.includes("economic interest") ||
    hay.includes("shareholding") ||
    hay.includes("benefiting")
  );
}

export function parseNumberLoose(raw: string): number | null {
  // Handle accounting negatives: (1 000.00) → -1000.00
  const s = raw.trim();
  const negative = /^\(.*\)$/.test(s) || s.trim().startsWith("-");
  // Strip currency symbols, spaces (incl non-breaking), thousands separators.
  let cleaned = s
    .replace(/[()]/g, "")
    .replace(/[rR]\s*(?=[\d.,])/, "")
    .replace(/[^\d.,-]/g, "");
  // Normalize thousands/decimal separators.
  if (cleaned.includes(",") && cleaned.includes(".")) {
    // Last separator is the decimal one.
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (cleaned.includes(",")) {
    // Treat comma as thousands unless it looks like a decimal (single comma, ≤2 trailing digits).
    const parts = cleaned.split(",");
    if (parts.length === 2 && parts[1].length <= 2) cleaned = `${parts[0]}.${parts[1]}`;
    else cleaned = cleaned.replace(/,/g, "");
  }
  cleaned = cleaned.replace(/-/g, "");
  if (cleaned === "" || cleaned === ".") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

function dateToIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const MONTHS: Record<string, string> = {
  jan: "01", january: "01", feb: "02", february: "02", mar: "03", march: "03",
  apr: "04", april: "04", may: "05", jun: "06", june: "06", jul: "07", july: "07",
  aug: "08", august: "08", sep: "09", sept: "09", september: "09", oct: "10",
  october: "10", nov: "11", november: "11", dec: "12", december: "12",
};

function parseDateLoose(raw: unknown): string | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return dateToIso(raw);
  const s = String(raw ?? "").trim();
  if (!s) return null;

  const viaWorkbook = parseWorkbookDate(s);
  if (viaWorkbook) {
    const y = viaWorkbook.getUTCFullYear();
    const m = String(viaWorkbook.getUTCMonth() + 1).padStart(2, "0");
    const d = String(viaWorkbook.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // "15 March 2024" / "March 15, 2024" / "Mon, March 15, 2024"
  const dmy = /(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})/.exec(s);
  if (dmy) {
    const mo = MONTHS[dmy[2].toLowerCase()];
    if (mo) return `${dmy[3]}-${mo}-${String(Number(dmy[1])).padStart(2, "0")}`;
  }
  const mdy = /([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(s);
  if (mdy) {
    const mo = MONTHS[mdy[1].toLowerCase()];
    if (mo) return `${mdy[3]}-${mo}-${String(Number(mdy[2])).padStart(2, "0")}`;
  }
  // dd-mm-yyyy or dd.mm.yyyy or mm/dd/yyyy ambiguity: assume dd/mm/yyyy (SA convention).
  const numeric = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/.exec(s);
  if (numeric) {
    let [, dd, mm, yy] = numeric;
    let year = Number(yy);
    if (yy.length === 2) year += year < 70 ? 2000 : 1900;
    let day = Number(dd);
    let month = Number(mm);
    if (month > 12 && day <= 12) [day, month] = [month, day];
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  return null;
}

function matchSelectOption(raw: string, col: ColumnDef): string | null {
  const n = norm(raw);
  if (!n) return null;
  // Field-specific synonym maps first.
  if (col.key === "race") {
    const r = RACE_MAP[n];
    if (r) return r;
  }
  if (col.key === "gender") {
    const g = GENDER_MAP[n];
    if (g) return g;
  }
  if (col.key === "designation") {
    const d = DESIGNATION_MAP[n];
    if (d && (col.options ?? []).includes(d)) return d;
  }
  if (col.key === "currentSize" || /size/.test(col.key.toLowerCase())) {
    const s = SUPPLIER_SIZE_MAP[n];
    if (s && (col.options ?? []).includes(s)) return s;
  }
  if (/level/.test(col.key.toLowerCase()) && col.key !== "occupationalLevel") {
    const lvl = BBBEE_LEVEL_MAP[n];
    if (lvl && (col.options ?? []).includes(lvl)) return lvl;
  }
  if (col.key === "occupationalLevel") {
    const occ = OCC_LEVEL_MAP[n];
    if (occ && (col.options ?? []).includes(occ)) return occ;
  }
  if (col.key === "esdCategory") {
    const cat = ESD_CATEGORY_MAP[n];
    if (cat && (col.options ?? []).includes(cat)) return cat;
  }
  if (!col.options?.length) return null;
  const fuzzy = suggestSelectOption(raw, col.options, col.key);
  if (fuzzy.suggestion && fuzzy.confidence >= FUZZY_SELECT_ACCEPT) {
    return fuzzy.suggestion;
  }
  return null;
}

/**
 * Normalize a single raw cell to the target column's type, returning the new
 * value plus a validation flag when the value is bad or uncertain.
 */
export function normalizeCellForColumn(raw: unknown, col: ColumnDef): NormalizedCell {
  const blankValue = col.type === "boolean" || col.yesNoBoolean ? false : "";
  if (raw === null || raw === undefined) {
    return { raw, value: blankValue, changed: false };
  }
  const rawStr = raw instanceof Date ? raw.toISOString() : String(raw);

  if (col.yesNoBoolean && col.type === "select") {
    const n = norm(rawStr);
    if (BOOLEAN_TRUE.has(n)) {
      return { raw, value: true, changed: raw !== true };
    }
    if (BOOLEAN_FALSE.has(n)) {
      return { raw, value: false, changed: raw !== false };
    }
    const display = yesNoToSelectValue(raw);
    if (display === "Yes" || display === "No") {
      return { raw, value: coerceYesNo(display), changed: coerceYesNo(raw) !== raw };
    }
    return {
      raw,
      value: false,
      changed: true,
      flag: { level: "warning", message: `"${rawStr}" isn't a clear Yes/No — defaulted to No.` },
    };
  }

  if (col.type === "boolean") {
    const n = norm(rawStr);
    if (BOOLEAN_TRUE.has(n) || BOOLEAN_TRUE.has(rawStr.trim().toLowerCase())) {
      return { raw, value: true, changed: raw !== true };
    }
    if (BOOLEAN_FALSE.has(n) || rawStr.trim() === "" || BOOLEAN_FALSE.has(rawStr.trim().toLowerCase())) {
      return { raw, value: false, changed: raw !== false };
    }
    return {
      raw,
      value: false,
      changed: true,
      flag: { level: "warning", message: `"${rawStr}" isn’t a clear Yes/No — defaulted to No.` },
    };
  }

  if (isPlaceholder(rawStr)) {
    return { raw, value: blankValue, changed: rawStr.trim() !== "" };
  }

  if (col.type === "number") {
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return { raw, value: raw, changed: false };
    }
    let n = parseNumberLoose(rawStr);
    if (n === null) {
      return {
        raw,
        value: "",
        changed: true,
        flag: { level: "error", message: `"${rawStr}" is not a number.` },
      };
    }
    let changed = rawStr.trim() !== String(n);
    if (isPercentColumn(col)) {
      const hadPercent = rawStr.includes("%");
      if (!hadPercent && n > 0 && n < 1) {
        n = Math.round(n * 10000) / 100; // 0.15 → 15
        changed = true;
      }
      if (n < 0 || n > 100) {
        return {
          raw,
          value: n,
          changed: true,
          flag: { level: "warning", message: `${n}% is outside the 0–100 range.` },
        };
      }
    }
    return { raw, value: n, changed };
  }

  if (col.type === "date") {
    const iso = parseDateLoose(raw);
    if (iso) return { raw, value: iso, changed: iso !== rawStr.trim() };
    return {
      raw,
      value: rawStr.trim(),
      changed: false,
      flag: { level: "warning", message: `"${rawStr}" could not be parsed as a date.` },
    };
  }

  if (col.type === "select") {
    const matched = matchSelectOption(rawStr, col);
    if (matched) {
      const value = col.yesNoBoolean ? coerceYesNo(matched) : matched;
      return { raw, value, changed: matched !== rawStr.trim() || value !== raw };
    }
    if (col.options?.length) {
      const hint = suggestSelectOption(rawStr, col.options, col.key);
      const didYouMean =
        hint.suggestion && hint.suggestion !== rawStr.trim()
          ? formatDidYouMeanMessage(rawStr.trim(), hint.suggestion)
          : `"${rawStr}" is not one of: ${col.options.join(", ")}.`;
      return {
        raw,
        value: rawStr.trim(),
        changed: false,
        flag: {
          level: "warning",
          message: didYouMean,
        },
      };
    }
    return { raw, value: rawStr.trim(), changed: rawStr !== rawStr.trim() };
  }

  if (col.type === "id") {
    const digits = rawStr.replace(/\s/g, "");
    return { raw, value: digits, changed: digits !== rawStr };
  }

  // text
  const trimmed = rawStr.trim();
  return { raw, value: trimmed, changed: trimmed !== rawStr };
}

/** Run the column ColumnDef.validate hook (if any) on a normalized value. */
export function validateColumnValue(value: unknown, col: ColumnDef): CellFlag | undefined {
  if (col.validate) {
    const err = col.validate(value);
    if (err) return { level: "error", message: err };
  }
  return undefined;
}

function looksLikeHeaderRow(row: string[], columns: ColumnDef[]): boolean {
  const nonEmpty = row.filter((c) => String(c ?? "").trim());
  // Single-cell / single-column pastes are data rows, not headers.
  if (nonEmpty.length < 2) return false;

  let matches = 0;
  let numericCells = 0;
  for (const cell of nonEmpty) {
    const s = String(cell ?? "").trim();
    if (parseNumberLoose(s) !== null && /^[\d\s.,()rR%-]+$/.test(s)) numericCells++;
    const match = matchHeaderToColumn(s, columns);
    // Only treat as header when the cell closely matches a field label/alias,
    // not a fuzzy match on a select option value (e.g. "Senior Manager").
    if (match && match.confidence >= 0.85 && (match.method === "exact" || match.method === "alias")) {
      matches++;
    }
  }
  return (
    matches >= 1 &&
    matches >= Math.ceil(nonEmpty.length * 0.4) &&
    numericCells === 0
  );
}

export interface NormalizeMatrixOptions {
  /** Force/forbid treating the first row as a header. Auto-detected when omitted. */
  hasHeaderRow?: boolean;
  /** When header-less, paste starts at this target column index (grid anchor). */
  startColIndex?: number;
  /** Optional explicit mapping (e.g. from AI) that overrides deterministic matching. */
  mappingOverride?: ColumnMapping[];
}

/**
 * Normalize a raw 2D matrix against a section's columns. Detects the header
 * row, builds the column mapping, normalizes every cell, and attaches
 * validation flags. Never drops source columns or rows silently.
 */
export function normalizeMatrix(
  matrix: unknown[][],
  columns: ColumnDef[],
  options: NormalizeMatrixOptions = {},
): NormalizationResult {
  if (matrix.length === 0) {
    return {
      mapping: [],
      rows: [],
      headerRowDetected: false,
      unmappedHeaders: [],
      stats: { rowCount: 0, mappedColumns: 0, flaggedCells: 0 },
    };
  }

  const firstRow = (matrix[0] ?? []).map((c) => String(c ?? "").trim());
  const width = Math.max(...matrix.map((r) => r.length), firstRow.length);
  const startCol = options.startColIndex ?? 0;
  // Column-vector pastes from Excel should never be treated as a header row.
  const forceDataRows = width <= 1 && startCol >= 0;
  const headerRowDetected = forceDataRows
    ? false
    : (options.hasHeaderRow ?? looksLikeHeaderRow(firstRow, columns));

  let mapping: ColumnMapping[];
  if (options.mappingOverride && options.mappingOverride.length > 0) {
    mapping = options.mappingOverride;
  } else if (headerRowDetected) {
    mapping = buildDeterministicMapping(firstRow, columns);
  } else {
    // Header-less paste: map by position from the grid anchor column.
    mapping = Array.from({ length: width }, (_, i) => {
      const col = columns[startCol + i];
      return {
        sourceIndex: i,
        sourceHeader: "",
        targetKey: col?.key ?? null,
        confidence: col ? 0.5 : 0,
        method: (col ? "position" : "unmapped") as MappingMethod,
      };
    });
  }

  const dataStart = headerRowDetected ? 1 : 0;
  const colByKey = new Map(columns.map((c) => [c.key, c] as const));
  const rows: NormalizedRow[] = [];
  let flaggedCells = 0;

  for (let r = dataStart; r < matrix.length; r++) {
    const line = matrix[r] ?? [];
    if (line.every((c) => c === null || c === undefined || String(c).trim() === "")) continue;

    const cells: Record<string, NormalizedCell> = {};
    let hasData = false;
    for (const m of mapping) {
      if (!m.targetKey) continue;
      const col = colByKey.get(m.targetKey);
      if (!col) continue;
      const cell = normalizeCellForColumn(line[m.sourceIndex], col);
      const validateFlag = !cell.flag ? validateColumnValue(cell.value, col) : undefined;
      if (validateFlag) cell.flag = validateFlag;
      if (cell.flag) flaggedCells++;
      const v = cell.value;
      // NB: normalizeCellForColumn returns false for BOTH "No" and an empty
      // yes/no cell, so we cannot count boolean-false as data here (it would keep
      // all-empty rows). Source-empty rows are already skipped above.
      if (v !== "" && v !== null && v !== undefined && v !== false) hasData = true;
      cells[m.targetKey] = cell;
    }
    // Ensure every column key exists so downstream rows are complete.
    for (const col of columns) {
      if (!cells[col.key]) {
        cells[col.key] = { raw: undefined, value: col.type === "boolean" ? false : "", changed: false };
      }
    }
    if (hasData) rows.push({ _id: uuidv4(), cells });
  }

  const mappedColumns = mapping.filter((m) => m.targetKey).length;
  const unmappedHeaders = mapping
    .filter((m) => !m.targetKey && m.sourceHeader.trim())
    .map((m) => m.sourceHeader);

  return {
    mapping,
    rows,
    headerRowDetected,
    unmappedHeaders,
    stats: { rowCount: rows.length, mappedColumns, flaggedCells },
  };
}

/** Flatten a NormalizationResult into plain grid rows ready for the store. */
export function toGridRows(result: NormalizationResult, columns: ColumnDef[]): WorkbookGridRow[] {
  return result.rows.map((nr) => {
    const row: WorkbookGridRow = { _id: nr._id };
    for (const col of columns) {
      row[col.key] = nr.cells[col.key]?.value ?? (col.type === "boolean" ? false : "");
    }
    return row;
  });
}

/** Collect per-row cell flags keyed by row id then column key (for inline highlights). */
export function collectFlags(result: NormalizationResult): Record<string, Record<string, CellFlag>> {
  const out: Record<string, Record<string, CellFlag>> = {};
  for (const nr of result.rows) {
    const rowFlags: Record<string, CellFlag> = {};
    for (const [key, cell] of Object.entries(nr.cells)) {
      if (cell.flag) rowFlags[key] = cell.flag;
    }
    if (Object.keys(rowFlags).length) out[nr._id] = rowFlags;
  }
  return out;
}
