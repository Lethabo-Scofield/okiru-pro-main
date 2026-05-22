import { v4 as uuidv4 } from "uuid";
import { parseWorkbookDate, type ColumnDef } from "@/components/workbook/sections";

export type WorkbookGridRow = Record<string, unknown> & { _id: string };

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
};

function norm(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function buildColumnAliases(col: ColumnDef): string[] {
  const aliases = [col.key, col.label];
  const label = col.label.replace(/\*+$/, "").trim();
  aliases.push(label);
  if (label.includes("—")) aliases.push(label.split("—")[0].trim());
  if (label.includes("(")) aliases.push(label.split("(")[0].trim());
  return aliases;
}

export function mapHeaderToKey(header: string, columns: ColumnDef[]): string | null {
  const h = norm(header);
  if (!h) return null;
  for (const col of columns) {
    for (const alias of buildColumnAliases(col)) {
      const a = norm(alias);
      if (h === a || h.includes(a) || a.includes(h)) return col.key;
    }
  }
  return null;
}

export function coerceCellValue(key: string, col: ColumnDef | undefined, raw: unknown): unknown {
  if (raw === null || raw === undefined || raw === "") return col?.type === "boolean" ? false : "";
  if (col?.type === "boolean") {
    const s = String(raw).trim().toLowerCase();
    return s === "yes" || s === "true" || s === "1" || s === "y";
  }
  if (col?.type === "number") {
    if (typeof raw === "number") return raw;
    const n = parseFloat(String(raw).replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : "";
  }
  if (col?.type === "date") {
    if (raw instanceof Date) {
      const y = raw.getFullYear();
      const m = String(raw.getMonth() + 1).padStart(2, "0");
      const d = String(raw.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    const parsed = parseWorkbookDate(raw);
    if (parsed) {
      const y = parsed.getUTCFullYear();
      const m = String(parsed.getUTCMonth() + 1).padStart(2, "0");
      const d = String(parsed.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    return String(raw).trim();
  }
  if (col?.type === "select") {
    const s = String(raw).trim();
    if (col.key === "race") {
      const mapped = RACE_MAP[norm(s)];
      if (mapped) return mapped;
    }
    if (col.key === "gender") {
      const mapped = GENDER_MAP[norm(s)];
      if (mapped) return mapped;
    }
    if (col.options?.length) {
      const match = col.options.find((o) => norm(o) === norm(s));
      if (match) return match;
    }
    return s;
  }
  return String(raw).trim();
}

/** Parse TSV/CSV clipboard text into a 2D string matrix. */
export function parseClipboardMatrix(text: string): string[][] {
  const trimmed = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!trimmed.trim()) return [];

  const delimiter = trimmed.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    const next = trimmed[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }

  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

export function matrixToRowsByPosition(
  matrix: string[][],
  columns: ColumnDef[],
  startRow: number,
  startCol: number,
  mapHeaders = false,
): WorkbookGridRow[] {
  if (matrix.length === 0) return [];

  let dataStart = 0;
  let colKeys = columns.map((c) => c.key);
  let colOffset = startCol;

  if (mapHeaders && matrix.length > 0) {
    const headers = matrix[0];
    const mapped = headers.map((h) => mapHeaderToKey(h, columns));
    if (mapped.some(Boolean)) {
      colKeys = mapped.map((k, i) => k ?? columns[startCol + i]?.key ?? "");
      dataStart = 1;
      colOffset = 0;
    }
  }

  const out: WorkbookGridRow[] = [];
  for (let r = dataStart; r < matrix.length; r++) {
    const line = matrix[r];
    if (!line || line.every((c) => c.trim() === "")) continue;

    const row: WorkbookGridRow = { _id: uuidv4() };
    let hasData = false;

    for (let c = 0; c < line.length; c++) {
      const colIdx = mapHeaders ? c : startCol + c;
      const key = mapHeaders ? colKeys[c] : columns[colIdx]?.key;
      if (!key) continue;
      const col = columns.find((x) => x.key === key);
      const val = coerceCellValue(key, col, line[c]);
      if (val !== "" && val !== null && val !== undefined && val !== false) hasData = true;
      row[key] = val;
    }

    for (const col of columns) {
      if (row[col.key] === undefined) {
        row[col.key] = col.type === "boolean" ? false : "";
      }
    }

    if (hasData) out.push(row);
  }

  return out;
}

export function applyPasteToRows(
  existingRows: WorkbookGridRow[],
  columns: ColumnDef[],
  matrix: string[][],
  anchor: { row: number; col: number },
  mapHeaders = false,
): WorkbookGridRow[] {
  const pasted = matrixToRowsByPosition(matrix, columns, anchor.row, anchor.col, mapHeaders);
  if (pasted.length === 0) return existingRows;

  const next = existingRows.map((r) => ({ ...r }));
  const needed = anchor.row + pasted.length;
  while (next.length < needed) {
    const empty: WorkbookGridRow = { _id: uuidv4() };
    for (const c of columns) empty[c.key] = c.type === "boolean" ? false : "";
    next.push(empty);
  }

  for (let i = 0; i < pasted.length; i++) {
    const targetIdx = anchor.row + i;
    const src = pasted[i];
    const target = { ...next[targetIdx] };
    const preserveId = target._id;

    if (mapHeaders) {
      Object.assign(target, src);
      target._id = preserveId;
    } else {
      for (let c = 0; c < (matrix[i]?.length || 0); c++) {
        const col = columns[anchor.col + c];
        if (!col) break;
        target[col.key] = src[col.key];
      }
    }
    next[targetIdx] = target;
  }

  return next;
}
