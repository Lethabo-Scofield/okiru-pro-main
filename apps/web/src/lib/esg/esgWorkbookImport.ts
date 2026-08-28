import * as XLSX from "xlsx";
import { ESG_SECTION_IDS } from "./esgSections";
import { readEsgGridRows, writeEsgGridCells, refFor, type EsgGridRow } from "./esgGridRows";
import {
  ESG_GRID_SECTIONS,
  esgGridRowRange,
  esgGridSectionsOnSheet,
  isEsgGridSection,
  type EsgGridSectionId,
} from "./esgGridSections";

const SHEET_TO_SECTION: Record<string, string> = {
  Cover: "company-reporting-setup",
  cover: "company-reporting-setup",
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
  // The section's OWN row window. `row >= startRow` alone made s-data-ofo (59)
  // claim every CSI row at 72+ as if they were training interventions.
  const { startRow, endRow } = esgGridRowRange(sectionId);
  const rows: EsgGridRow[] = [];
  const rowNums = new Set<number>();
  for (const ref of Object.keys(cells)) {
    const m = ref.match(/^([A-Z]+)(\d+)$/);
    if (!m) continue;
    const row = parseInt(m[2], 10);
    if (row >= startRow && row <= endRow) rowNums.add(row);
  }
  for (const rowNum of [...rowNums].sort((a, b) => a - b)) {
    const row: EsgGridRow = { _id: `imp_${rowNum}` };
    def.columns.forEach((col, colIdx) => {
      /*
       * `refFor`, NOT bare positional `colLetter(colIdx)`.
       *
       * `esgGridRows` learned this and the import never did: ISO_Tracker and
       * IFRS_S1_S2 start at column B and reserve E for the sheet's own derived
       * `Score /5`, so they declare `columnLetters`. Reading them positionally
       * shifted every field by one — `status` came from the Pillar column, and
       * since the scorers count `status === "Disclosed"` an imported IFRS
       * tracker scored zero no matter what the client had filled in.
       */
      const ref = `${refFor(def, col, colIdx)}${rowNum}`;
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
    const raw = sheetToCellMap(sheet);

    let cells = raw;
    if (isEsgGridSection(sectionId)) {
      cells = importGridSection(raw, sectionId);
    }
    if (Object.keys(cells).length > 0) {
      sections[sectionId] = { cells };
    } else {
      warnings.push(`Sheet ${sheetName} had no importable cells`);
    }

    /*
     * A sheet can carry MORE than one register.
     *
     * `SHEET_TO_SECTION` is one sheet to one section, so `S_Data` resolved to
     * the flat `s-data` section and stopped. The two registers that also live
     * on that sheet — `s-data-ofo` (training by OFO code, row 59) and
     * `s-data-csi` (community investment, row 72) — were never read as rows by
     * ANY import. They stayed empty behind an import that reported success, and
     * `s-data-csi` feeds `S_Scorecard!C23`, where a missing count scores zero.
     * So a client whose workbook was full of CSI initiatives lost those points
     * silently.
     *
     * Each register is read from its own row window, so they cannot swallow
     * each other's rows.
     */
    for (const gridId of esgGridSectionsOnSheet(sheetName)) {
      if (gridId === sectionId) continue;
      const gridCells = importGridSection(raw, gridId);
      if (Object.keys(gridCells).length > 0) sections[gridId] = { cells: gridCells };
    }
  }

  // Sector is Assumptions!B10 ("Sector", code SECTOR). B8 is the scoring stance —
  // writing a sector there would overwrite the stance and, through the derived B9
  // banding floor, silently re-band every quantitative indicator.
  const reporting = sections["company-reporting-setup"] ?? sections.cover;
  if (reporting && sections.assumptions?.cells?.B10 == null) {
    const sector = reporting.cells.sector ?? reporting.cells.C11;
    if (sector) {
      sections.assumptions = sections.assumptions ?? { cells: {} };
      sections.assumptions.cells.B10 = sector;
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
