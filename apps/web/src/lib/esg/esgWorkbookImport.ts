import * as XLSX from "xlsx";
import { ESG_SECTION_IDS } from "./esgSections";
import { readEsgGridRows, writeEsgGridCells, type EsgGridRow } from "./esgGridRows";
import { ESG_GRID_SECTIONS, isEsgGridSection, type EsgGridSectionId } from "./esgGridSections";

const SHEET_TO_SECTION: Record<string, string> = {
  cover: "cover",
  assumptions: "assumptions",
  edata: "e-data",
  sdata: "s-data",
  gdata: "g-data",
  eescorecard: "ee",
  fleetregister: "fleet",
  wasteregister: "waste",
  driverdebrief: "driver-debrief",
  isotracker: "iso-tracker",
  king5scorecard: "king5",
  ifrss1s2: "ifrs",
  garpgrap: "garp",
  saqsupplier: "saq",
};

function normSheetName(name: string): string {
  return name.replace(/[\s_]/g, "").toLowerCase();
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

function sheetToCellMap(sheet: XLSX.WorkSheet): Record<string, unknown> {
  const cells: Record<string, unknown> = {};
  const ref = sheet["!ref"];
  if (!ref) return cells;
  const range = XLSX.utils.decode_range(ref);
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[addr];
      if (!cell || cell.v === undefined || cell.v === null) continue;
      const cellRef = `${colLetter(c)}${r + 1}`;
      cells[cellRef] = cell.v;
    }
  }
  return cells;
}

function importGridSection(
  cells: Record<string, unknown>,
  sectionId: EsgGridSectionId,
): Record<string, unknown> {
  const def = ESG_GRID_SECTIONS[sectionId];
  const rows: EsgGridRow[] = [];
  const rowNums = new Set<number>();
  for (const ref of Object.keys(cells)) {
    const m = ref.match(/^([A-Z]+)(\d+)$/);
    if (!m) continue;
    const row = parseInt(m[2], 10);
    if (row >= def.startRow) rowNums.add(row);
  }
  for (const rowNum of [...rowNums].sort((a, b) => a - b)) {
    const row: EsgGridRow = { _id: `imp_${rowNum}` };
    def.columns.forEach((col, colIdx) => {
      const ref = `${colLetter(colIdx)}${rowNum}`;
      if (cells[ref] !== undefined) row[col.key] = cells[ref];
    });
    if (Object.keys(row).length > 1) rows.push(row);
  }
  return writeEsgGridCells(sectionId, rows, {});
}

export type EsgImportPreview = {
  sections: Record<string, { cells: Record<string, unknown> }>;
  warnings: string[];
  unmatchedSheets: string[];
};

export function parseEsgWorkbookXlsx(buffer: ArrayBuffer | Buffer): EsgImportPreview {
  const book = XLSX.read(buffer, { type: "buffer" });
  const sections: Record<string, { cells: Record<string, unknown> }> = {};
  const warnings: string[] = [];
  const unmatchedSheets: string[] = [];

  for (const sheetName of book.SheetNames) {
    const sectionId = SHEET_TO_SECTION[normSheetName(sheetName)];
    if (!sectionId || !ESG_SECTION_IDS.includes(sectionId)) {
      if (!["escorecard", "sscorecard", "gscorecard", "esgdashboard", "validation", "auditlog", "glossary", "standardsmap", "datastatus", "carbontax", "netzeroroadmap", "materialitymatrix", "bbbeeesg", "iso14083"].includes(normSheetName(sheetName))) {
        unmatchedSheets.push(sheetName);
      }
      continue;
    }
    const sheet = book.Sheets[sheetName];
    if (!sheet) continue;
    let cells = sheetToCellMap(sheet);
    if (isEsgGridSection(sectionId)) {
      cells = importGridSection(cells, sectionId);
    }
    if (Object.keys(cells).length > 0) {
      sections[sectionId] = { cells };
    } else {
      warnings.push(`Sheet ${sheetName} had no importable cells`);
    }
  }

  if (sections.cover && sections.assumptions?.cells?.B8 == null) {
    const sector = sections.cover.cells.sector ?? sections.cover.cells.C11;
    if (sector) {
      sections.assumptions = sections.assumptions ?? { cells: {} };
      sections.assumptions.cells.B8 = sector;
    }
  }

  return { sections, warnings, unmatchedSheets };
}

/** Read grid rows from imported flat cells (for tests). */
export function importGridRowsFromCells(
  cells: Record<string, unknown>,
  sectionId: EsgGridSectionId,
): EsgGridRow[] {
  return readEsgGridRows(cells, sectionId);
}
