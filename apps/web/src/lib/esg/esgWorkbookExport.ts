/**
 * ESG workbook XLSX export — v1.7 sheet names, cell layout, computed scorecard values.
 */
import * as XLSX from "xlsx";
import { computeEsgScorecard } from "../../../EsgToolkit/src/lib/calculators";
import { ESG_SECTION_IDS } from "./esgSections";
import { countKing5Principles } from "./esgGridRows";
import type { EsgWorkbookData } from "./esgWorkbookStorage";

/** All sheets from workbook_inventory.json v1.7. */
export const ESG_V17_SHEET_NAMES = [
  "Cover",
  "Assumptions",
  "Audit_Log",
  "ESG_Dashboard",
  "E_Data",
  "Fleet_Register",
  "ISO_14083",
  "Waste_Register",
  "Driver_Debrief",
  "S_Data",
  "G_Data",
  "EE_Scorecard",
  "E_Scorecard",
  "S_Scorecard",
  "G_Scorecard",
  "King5_Scorecard",
  "IFRS_S1_S2",
  "GARP_GRAP",
  "ISO_Tracker",
  "SAQ_Supplier",
  "NetZero_Roadmap",
  "B_BBEE_ESG",
  "Materiality_Matrix",
  "Carbon_Tax",
  "Standards_Map",
  "Glossary",
  "Validation",
  "Data_Status",
] as const;

const INPUT_SHEET_BY_SECTION: Record<string, string> = {
  assumptions: "Assumptions",
  "e-data": "E_Data",
  "s-data": "S_Data",
  "g-data": "G_Data",
  ee: "EE_Scorecard",
  fleet: "Fleet_Register",
  waste: "Waste_Register",
  "driver-debrief": "Driver_Debrief",
  "iso-tracker": "ISO_Tracker",
  king5: "King5_Scorecard",
  ifrs: "IFRS_S1_S2",
  garp: "GARP_GRAP",
  saq: "SAQ_Supplier",
  // Both registers live INSIDE S_Data — the OFO training register at row 59 and
  // the CSI register at row 72 — rather than on sheets of their own. They were
  // simply absent from this map, so anything a user entered in either grid was
  // dropped on export, the mirror of the import that never read them. Their row
  // windows do not overlap `s-data`'s own cells, so all three write into the
  // one sheet without colliding.
  "s-data-ofo": "S_Data",
  "s-data-csi": "S_Data",
};

const GRID_HEADERS: Partial<Record<string, { row: number; headers: string[] }>> = {
  Fleet_Register: {
    row: 3,
    headers: [
      "Reg",
      "Depot",
      "Model/Category",
      "GVM (kg)",
      "Tare (kg)",
      "Carry (kg)",
      "Fuel Cap (L)",
      "Tracking",
      "Monthly km",
      "Monthly Litres",
      "L/100km Actual",
      "L/100km Norm",
      "Monthly tCO₂e",
      "Service Status",
      "Licence Expiry",
    ],
  },
  Waste_Register: {
    row: 4,
    headers: ["Month", "Depot", "Waste Type", "Total kg", "Recycled kg", "Landfill kg", "Diverted %", "Landfill tCO₂e"],
  },
  Driver_Debrief: {
    row: 3,
    headers: ["Date", "Depot", "Driver Name", "Vehicle Reg", "Route", "Cust Hit%", "Plan Stops", "Act Stops"],
  },
  King5_Scorecard: {
    row: 3,
    headers: ["#", "Principle", "Status", "Weight", "Score", "Weighted Score", "Evidence Required", "Current Status"],
  },
  IFRS_S1_S2: {
    row: 4,
    headers: [
      "Disclosure Requirement",
      "Pillar",
      "Status",
      "Score /5",
      "Data Source",
      "Current Status / Evidence",
      "Action Required",
    ],
  },
  ISO_Tracker: {
    row: 4,
    headers: ["Requirement", "Clause", "Status", "Score /5", "Weight", "Evidence Needed", "Current Evidence", "Net-Zero Link"],
  },
  GARP_GRAP: {
    row: 4,
    headers: [
      "Risk / Requirement",
      "Description",
      "Data Source",
      "Severity",
      "Control Status",
      "Current Control / Evidence",
      "Improvement Action",
      "Likelihood (1-5)",
    ],
  },
  SAQ_Supplier: {
    row: 4,
    headers: [
      "Supplier Name",
      "On-Time Del",
      "Quality",
      "H&S",
      "Environmental",
      "Food Safety",
      "Correct Invoicing",
      "Backup Support",
    ],
  },
};

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

function writeSectionCells(sheet: XLSX.WorkSheet, cells: Record<string, unknown>): void {
  for (const [ref, value] of Object.entries(cells)) {
    if (ref.startsWith("_")) continue;
    setCell(sheet, ref, value);
  }
}

function writeGridHeaders(sheet: XLSX.WorkSheet, sheetName: string): void {
  const hdr = GRID_HEADERS[sheetName];
  if (!hdr) return;
  hdr.headers.forEach((label, i) => {
    const col = String.fromCharCode(65 + i);
    setCell(sheet, `${col}${hdr.row}`, label);
  });
}

function rowNumFromKey(key: string): number | null {
  const m = key.match(/^d(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

export function buildEsgWorkbookXlsx(wb: EsgWorkbookData): Buffer {
  const book = XLSX.utils.book_new();
  book.SheetNames = [];
  book.Sheets = {};

  for (const name of ESG_V17_SHEET_NAMES) {
    ensureSheet(book, name);
    writeGridHeaders(book.Sheets[name]!, name);
  }

  for (const sectionId of ESG_SECTION_IDS) {
    const sheetName = INPUT_SHEET_BY_SECTION[sectionId];
    if (!sheetName) continue;
    const cells = wb.sections?.[sectionId]?.cells ?? {};
    writeSectionCells(ensureSheet(book, sheetName), cells);
  }

  const scorecard = computeEsgScorecard(wb);
  if (scorecard) {
    const eSheet = ensureSheet(book, "E_Scorecard");
    for (const [key, pts] of Object.entries(scorecard.environmentalRows)) {
      const row = rowNumFromKey(key);
      if (row) setCell(eSheet, `D${row}`, pts);
    }
    setCell(eSheet, "D30", scorecard.environmental.score);

    const sSheet = ensureSheet(book, "S_Scorecard");
    for (const [key, pts] of Object.entries(scorecard.socialRows)) {
      const row = rowNumFromKey(key);
      if (row) setCell(sSheet, `D${row}`, pts);
    }
    setCell(sSheet, "D28", scorecard.social.score);

    const gSheet = ensureSheet(book, "G_Scorecard");
    for (const [key, pts] of Object.entries(scorecard.governanceRows)) {
      const row = rowNumFromKey(key);
      if (row) setCell(gSheet, `D${row}`, pts);
    }
    setCell(gSheet, "D26", scorecard.governance.score);

    const dash = ensureSheet(book, "ESG_Dashboard");
    setCell(dash, "D9", scorecard.overallPercent);
    setCell(dash, "B10", scorecard.environmental.score);
    setCell(dash, "B11", scorecard.social.score);
    setCell(dash, "B12", scorecard.governance.score);

    const validation = ensureSheet(book, "Validation");
    setCell(validation, "C12", countKing5Principles(wb));
  }

  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
