/**
 * Blank ESG bulk-input template — E/S/G data sections + setup sheets.
 * Import via POST /api/esg/workbook/:companyId/import (same parser as full workbook export).
 */
import * as XLSX from "xlsx";
import {
  ASSUMPTIONS_FIELDS,
  COVER_FIELDS,
  G_DATA_MATURITY_ROWS,
  S_DATA_HS_FIELDS,
  S_DATA_PAYROLL_FIELDS,
  S_DATA_TRAINING_FIELDS,
} from "../../components/esg-workbook/esgSectionConfigs";
import { ESG_DEFAULT_DEPOTS, ESG_DEFAULT_MONTHS } from "../../components/esg-workbook/esgDefaults";

export const ESG_BULK_TEMPLATE_SHEETS = [
  "Instructions",
  "Cover",
  "Assumptions",
  "E_Data",
  "S_Data",
  "G_Data",
] as const;

function cellRefToCoords(ref: string): { c: number; r: number } | null {
  const m = ref.match(/^([A-Z]+)(\d+)$/);
  if (!m) return null;
  const letters = m[1];
  let col = 0;
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 64);
  }
  return { c: col - 1, r: parseInt(m[2], 10) - 1 };
}

function updateSheetRange(sheet: XLSX.WorkSheet, addr: string): void {
  const range = sheet["!ref"]
    ? XLSX.utils.decode_range(sheet["!ref"])
    : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
  const cell = XLSX.utils.decode_cell(addr);
  if (cell.r < range.s.r) range.s.r = cell.r;
  if (cell.c < range.s.c) range.s.c = cell.c;
  if (cell.r > range.e.r) range.e.r = cell.r;
  if (cell.c > range.e.c) range.e.c = cell.c;
  sheet["!ref"] = XLSX.utils.encode_range(range);
}

function setCell(sheet: XLSX.WorkSheet, ref: string, value: unknown): void {
  const coords = cellRefToCoords(ref);
  if (!coords) return;
  const addr = XLSX.utils.encode_cell(coords);
  if (value === undefined || value === null || value === "") return;
  sheet[addr] = {
    t: typeof value === "number" ? "n" : "s",
    v: value,
  };
  updateSheetRange(sheet, addr);
}

function ensureSheet(book: XLSX.WorkBook, name: string): XLSX.WorkSheet {
  if (!book.Sheets[name]) {
    book.SheetNames.push(name);
    book.Sheets[name] = {};
  }
  return book.Sheets[name]!;
}

function writeInstructions(sheet: XLSX.WorkSheet): void {
  const lines = [
    "Okiru ESG Bulk Input Template (v1.7)",
    "",
    "1. Fill the grey-labelled cells on Cover, Assumptions, E_Data, S_Data, and G_Data.",
    "2. In Okiru: ESG Workbook → Import / bulk upload → select this file.",
    "3. Review the preview, then confirm to populate all matched sections at once.",
    "",
    "Included sections:",
    "  • Cover — entity, period, sector",
    "  • Assumptions — scoring stance, reporting standard, currency",
    "  • E_Data — monthly environmental inputs (diesel, electricity, water)",
    "  • S_Data — headcount, H&S, training, payroll",
    "  • G_Data — governance maturity (Yes / Partial / No or numeric)",
    "",
    "Extension point: additional register sheets (Fleet, King5, etc.) can be added",
    "using the same cell addresses as the full workbook export.",
    "",
    "AI completion: pre-fill from annual reports / policies by mapping extracted",
    "values to the Cell Ref column on each sheet, then import.",
  ];
  lines.forEach((line, i) => setCell(sheet, `A${i + 1}`, line));
  setCell(sheet, "A1", lines[0]);
}

function writeFieldGuide(
  sheet: XLSX.WorkSheet,
  fields: { cell: string; label: string; helpText?: string }[],
  startRow = 1,
): void {
  setCell(sheet, `A${startRow}`, "Cell Ref");
  setCell(sheet, `B${startRow}`, "Field");
  setCell(sheet, `C${startRow}`, "Value (fill in)");
  setCell(sheet, `D${startRow}`, "Notes");
  fields.forEach((f, i) => {
    const row = startRow + 1 + i;
    setCell(sheet, `A${row}`, f.cell);
    setCell(sheet, `B${row}`, f.label);
    if (f.helpText) setCell(sheet, `D${row}`, f.helpText);
  });
}

function writeGDataTemplate(sheet: XLSX.WorkSheet): void {
  setCell(sheet, "A4", "Metric");
  setCell(sheet, "B4", "Current Value");
  setCell(sheet, "F4", "Score /5 (auto)");
  G_DATA_MATURITY_ROWS.forEach((row) => {
    const rowNum = parseInt(row.cell.replace(/\D/g, ""), 10);
    setCell(sheet, `A${rowNum}`, row.label);
    if (row.kind === "yn") {
      setCell(sheet, `C${rowNum}`, "Yes | Partial | No");
    }
  });
}

function writeEDataTemplate(sheet: XLSX.WorkSheet): void {
  setCell(sheet, "A12", "Environmental monthly data — enter values at row 14+ using depot columns.");
  setCell(sheet, "A13", "Depot");
  ESG_DEFAULT_DEPOTS.forEach((depot, i) => setCell(sheet, `A${14 + i}`, depot));
  setCell(sheet, "B13", "Unit");
  setCell(sheet, "C12", "Months (Jul-25 … Mar-26)");
  ESG_DEFAULT_MONTHS.forEach((m, i) => {
    const col = String.fromCharCode(67 + i);
    setCell(sheet, `${col}13`, m);
  });
}

function writeSDataTemplate(sheet: XLSX.WorkSheet): void {
  setCell(sheet, "A1", "Social data — fill cells listed below (same refs as web editor).");
  const allFields = [
    ...S_DATA_PAYROLL_FIELDS,
    ...S_DATA_TRAINING_FIELDS,
    ...S_DATA_HS_FIELDS.slice(0, 8),
  ];
  writeFieldGuide(sheet, allFields, 3);
}

export function buildEsgWorkbookTemplateXlsx(): Buffer {
  const book = XLSX.utils.book_new();
  book.SheetNames = [];
  book.Sheets = {};

  writeInstructions(ensureSheet(book, "Instructions"));
  writeFieldGuide(ensureSheet(book, "Cover"), COVER_FIELDS);
  writeFieldGuide(ensureSheet(book, "Assumptions"), ASSUMPTIONS_FIELDS);
  writeEDataTemplate(ensureSheet(book, "E_Data"));
  writeSDataTemplate(ensureSheet(book, "S_Data"));
  writeGDataTemplate(ensureSheet(book, "G_Data"));

  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
