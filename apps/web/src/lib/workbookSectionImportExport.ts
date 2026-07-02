import * as XLSX from "xlsx";
import { v4 as uuidv4 } from "uuid";
import type { ColumnDef } from "@/components/workbook/sections";
import { coerceCellValue, mapHeaderToKey } from "@/lib/workbookGridParse";

export type WorkbookGridRow = Record<string, unknown> & { _id: string };

export type SectionImportDiff = {
  added: WorkbookGridRow[];
  updated: Array<{ before: WorkbookGridRow; after: WorkbookGridRow; index: number }>;
  removed: WorkbookGridRow[];
  unchanged: number;
};

export function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const row = rows[i] || [];
    const filled = row.filter((c) => c !== null && c !== undefined && String(c).trim() !== "").length;
    if (filled >= 2) return i;
  }
  return 0;
}

function parseGridMatrix(matrix: unknown[][], columns: ColumnDef[]): WorkbookGridRow[] {
  if (matrix.length < 1) return [];
  const headerIdx = findHeaderRow(matrix);
  const headers = (matrix[headerIdx] as unknown[]).map((h) => String(h ?? "").trim());
  const keyByCol = headers.map((h) => mapHeaderToKey(h, columns));

  const out: WorkbookGridRow[] = [];
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const vals = matrix[i] as unknown[];
    if (!vals || vals.every((v) => v === null || v === undefined || String(v).trim() === "")) continue;
    const row: WorkbookGridRow = { _id: uuidv4() };
    let hasData = false;
    keyByCol.forEach((key, colIdx) => {
      if (!key) return;
      const col = columns.find((c) => c.key === key);
      const val = coerceCellValue(key, col, vals[colIdx]);
      // Explicit boolean (e.g. a Yes/No cell set to "No") counts as data.
      if (typeof val === "boolean" || (val !== "" && val !== null && val !== undefined)) hasData = true;
      row[key] = val;
    });
    for (const col of columns) {
      if (row[col.key] === undefined) row[col.key] = col.type === "boolean" ? false : "";
    }
    if (hasData) out.push(row);
  }
  return out;
}

/** Read the first sheet (or CSV) of a section file into a raw 2D matrix. */
export async function readSectionMatrix(file: File): Promise<unknown[][]> {
  const buffer = await file.arrayBuffer();
  const name = file.name.toLowerCase();

  if (name.endsWith(".csv")) {
    const text = new TextDecoder().decode(buffer);
    return text
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => line.split(",").map((c) => c.trim()));
  }

  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" }) as unknown[][];
}

export async function parseSectionFile(
  file: File,
  columns: ColumnDef[],
): Promise<WorkbookGridRow[]> {
  const matrix = await readSectionMatrix(file);
  return parseGridMatrix(matrix, columns);
}

export function exportSectionToXlsx(
  sectionLabel: string,
  columns: ColumnDef[],
  rows: WorkbookGridRow[],
): void {
  const headers = columns.map((c) => c.label);
  const aoa: unknown[][] = [
    [sectionLabel, ...Array(headers.length - 1).fill("")],
    headers,
    ...rows.map((r) => columns.map((c) => r[c.key] ?? "")),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }];
  ws["!cols"] = columns.map((c) => ({ wch: Math.min(Math.max((c.width ?? 120) / 8, 10), 36) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sectionLabel.slice(0, 31));
  const safeName = sectionLabel.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 40);
  XLSX.writeFile(wb, `${safeName || "section"}.xlsx`);
}

function rowSignature(row: WorkbookGridRow, columns: ColumnDef[]): string {
  const parts = columns.slice(0, 3).map((c) => String(row[c.key] ?? "").trim().toLowerCase());
  return parts.join("|");
}

export function diffSectionImport(
  existing: WorkbookGridRow[],
  incoming: WorkbookGridRow[],
  columns: ColumnDef[],
): SectionImportDiff {
  const added: WorkbookGridRow[] = [];
  const updated: SectionImportDiff["updated"] = [];
  const matchedExisting = new Set<number>();

  for (const inc of incoming) {
    const sig = rowSignature(inc, columns);
    let matchIdx = -1;
    if (sig.replace(/\|/g, "").length > 0) {
      matchIdx = existing.findIndex(
        (ex, i) => !matchedExisting.has(i) && rowSignature(ex, columns) === sig,
      );
    }
    if (matchIdx >= 0) {
      matchedExisting.add(matchIdx);
      const before = existing[matchIdx];
      const after: WorkbookGridRow = { ...inc, _id: before._id };
      const changed = columns.some((c) => String(before[c.key] ?? "") !== String(after[c.key] ?? ""));
      if (changed) updated.push({ before, after, index: matchIdx });
    } else {
      added.push(inc);
    }
  }

  const removed = existing.filter((_, i) => !matchedExisting.has(i) && incoming.length > 0);
  const unchanged = existing.length - updated.length - removed.length;

  return { added, updated, removed, unchanged };
}

export function mergeSectionImport(
  existing: WorkbookGridRow[],
  incoming: WorkbookGridRow[],
  mode: "append" | "replace",
  diff: SectionImportDiff,
): WorkbookGridRow[] {
  if (mode === "replace") {
    return incoming.map((r) => ({ ...r, _id: r._id || uuidv4() }));
  }

  const next = existing.map((r) => ({ ...r }));
  for (const u of diff.updated) {
    next[u.index] = u.after;
  }
  return [...next, ...diff.added];
}
