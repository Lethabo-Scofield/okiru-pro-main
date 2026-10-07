/**
 * The ESG information-gathering workbook a client fills in and imports back.
 *
 * WHAT WAS WRONG WITH THE OLD ONE
 *
 * It wrote a FIELD GUIDE — a four-column table of `Cell Ref | Field | Value
 * (fill in) | Notes` starting at A1 — and the importer reads a sheet by its own
 * A1 addresses. So the guide's own headings imported as workbook cells (`A1`,
 * `B1`, `C1`…), and a value typed in the "Value (fill in)" column landed at,
 * say, `Assumptions!C12` while every scorer reads `Assumptions!B43`.
 * Downloading the template, completing it and importing it produced a workbook
 * full of column headings and not one real figure — silently, because an
 * import that stores cells reports success.
 *
 * It also covered five sheets. Twelve of the seventeen input sections — every
 * register, Employment Equity, Waste — had nowhere to be filled at all.
 *
 * WHAT THIS ONE DOES
 *
 * The value cell IS the address the app reads. Labels go in column A, which no
 * ESG section scores from, exactly as the live v1.7 workbook lays its sheets
 * out. Registers get their real header row at `startRow - 1` using their own
 * column letters from `ESG_GRID_SECTIONS`, so a filled row imports into the
 * register it belongs to.
 *
 * Nothing here hardcodes a layout: sheets, addresses, headers, row windows and
 * dropdown vocabularies all come from the SAME definitions the importer and the
 * scorers use, so the template cannot drift away from what the product accepts.
 * `esgWorkbookTemplate.test.ts` holds that by importing what this writes and
 * asserting the values come back on the cells the scorers read.
 */
import * as XLSX from "xlsx";
import {
  ASSUMPTIONS_FIELDS,
  COVER_FIELDS,
  EE_MATURITY_ROWS,
  E_DATA_ENERGY_BASELINE_FIELDS,
  E_DATA_SUMMARY_FIELDS,
  E_DATA_WATER_INITIATIVE_FIELDS,
  G_DATA_MATURITY_ROWS,
  S_DATA_HS_FIELDS,
  S_DATA_PAYROLL_FIELDS,
  S_DATA_SCALAR_FIELDS,
  S_DATA_TRAINING_FIELDS,
  WASTE_SCALAR_FIELDS,
} from "@/components/esg-workbook/esgSectionConfigs";
import { ESG_DEFAULT_DEPOTS, ESG_DEFAULT_MONTHS } from "@/components/esg-workbook/EsgMonthlyGrid";
import {
  ESG_GRID_SECTIONS,
  ESG_GRID_SECTION_IDS,
  type EsgGridSectionId,
} from "./esgGridSections";
import { esgColumnRef } from "./esgGridRows";

export const ESG_BULK_TEMPLATE_SHEETS = [
  "Instructions",
  "Cover",
  "Assumptions",
  "E_Data",
  "S_Data",
  "G_Data",
  "EE_Scorecard",
  "Waste_Register",
  "Fleet_Register",
  "Driver_Debrief",
  "ISO_Tracker",
  "King5_Scorecard",
  "IFRS_S1_S2",
  "GARP_GRAP",
  "SAQ_Supplier",
] as const;

/** How many blank rows a register offers before the user adds their own. */
const REGISTER_BLANK_ROWS = 20;

type ScalarField = {
  cell: string;
  label: string;
  helpText?: string;
  type?: string;
  options?: readonly string[];
};

/* -------------------------------------------------------------------------- */
/* Sheet primitives                                                           */
/* -------------------------------------------------------------------------- */

function setCell(sheet: XLSX.WorkSheet, ref: string, value: unknown): void {
  if (value === undefined || value === null || value === "") return;
  sheet[ref] = { t: typeof value === "number" ? "n" : "s", v: value };
}

/**
 * `!ref` recomputed from the cells actually written.
 *
 * Declared once at the end rather than grown per cell. A sheet whose `!ref`
 * overstates it is exactly the shape that used to hang the importer for hours
 * (see `esgImportDimensionBomb.test.ts`), so this file will not produce one.
 */
function sealSheet(sheet: XLSX.WorkSheet): XLSX.WorkSheet {
  let minR = Infinity;
  let minC = Infinity;
  let maxR = 0;
  let maxC = 0;
  let any = false;
  for (const ref of Object.keys(sheet)) {
    if (ref.startsWith("!")) continue;
    const { r, c } = XLSX.utils.decode_cell(ref);
    any = true;
    if (r < minR) minR = r;
    if (c < minC) minC = c;
    if (r > maxR) maxR = r;
    if (c > maxC) maxC = c;
  }
  sheet["!ref"] = any
    ? XLSX.utils.encode_range({ s: { r: minR, c: minC }, e: { r: maxR, c: maxC } })
    : "A1";
  return sheet;
}

function newSheet(): XLSX.WorkSheet {
  return {};
}

function appendSheet(book: XLSX.WorkBook, name: string, sheet: XLSX.WorkSheet): void {
  XLSX.utils.book_append_sheet(book, sealSheet(sheet), name);
}

/* -------------------------------------------------------------------------- */
/* Scalar blocks — label in column A, value at its real address               */
/* -------------------------------------------------------------------------- */

/** The numeric row of an A1 address, or null for a named key like `entity`. */
function rowOf(cell: string): number | null {
  const m = /^[A-Z]+([1-9]\d*)$/.exec(cell);
  return m ? Number(m[1]) : null;
}

/** The column `offset` places right of an A1 address's own column. */
function nextColumn(cell: string, offset: number): string {
  const { c } = XLSX.utils.decode_cell(cell);
  return XLSX.utils.encode_col(c + offset);
}

/**
 * Fields that live at a real address.
 *
 * The label goes in column A of the field's own row and the value cell is left
 * EMPTY at its own address — that empty cell is the whole point of the file.
 * Dropdown vocabularies sit two columns right of the value: far enough not to
 * be mistaken for the answer, near enough to read while typing it. SheetJS
 * cannot write Excel data validation, so a list beside the cell is the best
 * available — the same compromise the B-BBEE template makes.
 */
function writeAddressedFields(sheet: XLSX.WorkSheet, fields: readonly ScalarField[]): void {
  for (const field of fields) {
    const row = rowOf(field.cell);
    if (row == null) continue; // a named key — `writeNamedFields` handles it
    setCell(sheet, `A${row}`, field.label);
    if (field.options?.length) {
      setCell(
        sheet,
        `${nextColumn(field.cell, 2)}${row}`,
        `Choose one: ${field.options.join(" · ")}`,
      );
    }
  }
}

/**
 * Fields the app keys by NAME rather than by cell (`entity`, `sector`,
 * `_hsTracking`).
 *
 * Written as `label | value` pairs, which is what `esgSheetStructure`'s label
 * bridge reads back. Returns the next free row, so a sheet can carry a named
 * block and an addressed one without colliding.
 */
function writeNamedFields(
  sheet: XLSX.WorkSheet,
  fields: readonly ScalarField[],
  firstRow: number,
): number {
  let row = firstRow;
  for (const field of fields) {
    if (rowOf(field.cell) != null) continue; // addressed — handled elsewhere
    setCell(sheet, `A${row}`, field.label);
    if (field.options?.length) {
      setCell(sheet, `D${row}`, `Choose one: ${field.options.join(" · ")}`);
    } else if (field.helpText) {
      setCell(sheet, `D${row}`, field.helpText);
    }
    row++;
  }
  return row;
}

/* -------------------------------------------------------------------------- */
/* Register blocks — the real header row, the real column letters             */
/* -------------------------------------------------------------------------- */

/**
 * One register's header, on the row immediately above its first data row.
 *
 * Column letters come from `esgColumnRef`, the same resolver the importer uses,
 * so a sheet whose data does not start at column A (`ISO_Tracker` and
 * `IFRS_S1_S2` both start at B) is written where it will be read.
 *
 * Writing the labels verbatim is deliberate: `classifyEsgGridRow` recognises a
 * row whose cells equal their own column labels as a `header-echo` and skips
 * it, so the header cannot import as a supplier named "Supplier".
 */
function writeRegisterHeader(sheet: XLSX.WorkSheet, sectionId: EsgGridSectionId): void {
  const def = ESG_GRID_SECTIONS[sectionId];
  const headerRow = def.startRow - 1;
  def.columns.forEach((col, idx) => {
    setCell(sheet, `${esgColumnRef(sectionId, idx)}${headerRow}`, col.label);
  });
}

/**
 * The dropdown vocabularies for one register, printed below its data window.
 *
 * Introduced by a lone all-caps banner, which `classifyEsgGridRow` reads as
 * "the register has ended", so the reference block cannot be imported as data
 * however far down the sheet a reader runs.
 *
 * The banner goes in the register's OWN first data column, not blindly in A.
 * `ISO_Tracker` and `IFRS_S1_S2` start at column B, so a banner in A is
 * invisible to the row reader — it looked at an empty row, carried on, and
 * imported the vocabulary line below as a clause. The banner only ends a
 * register if the register can see it.
 */
function writeRegisterValueGuide(
  sheet: XLSX.WorkSheet,
  sectionId: EsgGridSectionId,
  firstRow: number,
): void {
  const def = ESG_GRID_SECTIONS[sectionId];
  const withOptions = def.columns.filter((c) => c.type === "select" && c.options?.length);
  if (withOptions.length === 0) return;

  const firstCol = esgColumnRef(sectionId, 0);
  setCell(sheet, `${firstCol}${firstRow}`, "ALLOWED VALUES BELOW - DO NOT TYPE IN THIS BLOCK");
  withOptions.forEach((col, i) => {
    setCell(sheet, `${firstCol}${firstRow + 1 + i}`, col.label);
    setCell(sheet, `${nextColumn(`${firstCol}1`, 1)}${firstRow + 1 + i}`, (col.options ?? []).join(" · "));
  });
}

/* -------------------------------------------------------------------------- */
/* Sheets                                                                     */
/* -------------------------------------------------------------------------- */

function instructionsSheet(): XLSX.WorkSheet {
  const sheet = newSheet();
  const lines = [
    "Okiru ESG information request",
    "",
    "HOW TO USE THIS FILE",
    "1. Fill in the blank cell to the RIGHT of each label. Do not move, rename or re-order rows -",
    "   every cell address in this file is the address Okiru reads it back from.",
    "2. On the register sheets, type one record per row underneath the header row.",
    "   Leave rows you have no data for empty; blank rows are ignored.",
    "3. Where a cell says 'Choose one', type one of those values exactly as written.",
    "4. In Okiru: ESG -> Import Excel workbook -> select this file. You will see a preview of",
    "   everything matched before anything is saved.",
    "",
    "WHAT EACH SHEET COLLECTS",
    "  Cover            Entity, reporting period, organisational boundary, sector, baseline year",
    "  Assumptions      Scoring stance, reporting standard and the scoring thresholds",
    "  E_Data           Monthly diesel, electricity, solar and water by site; annual GHG totals",
    "  S_Data           Headcount, health and safety, training, payroll, OFO codes, CSI",
    "  G_Data           Governance maturity, board composition, penalties, policies",
    "  EE_Scorecard     Employment equity",
    "  Waste_Register   One row per waste stream per month, plus the annual totals",
    "  Fleet_Register   One row per vehicle",
    "  Driver_Debrief   One row per trip",
    "  ISO_Tracker      ISO 14001 clause-by-clause status",
    "  King5_Scorecard  The 17 King V principles",
    "  IFRS_S1_S2       IFRS S1/S2 disclosure readiness",
    "  GARP_GRAP        ESG risk register",
    "  SAQ_Supplier     Supplier self-assessment, 1-5 per criterion",
    "",
    "Leaving something blank is not the same as entering a zero. A blank means 'not reported'",
    "and scores nothing; an explicit 0 is an assertion, and some indicators award points for it.",
  ];
  lines.forEach((line, i) => setCell(sheet, `A${i + 1}`, line));
  sheet["!cols"] = [{ wch: 110 }];
  return sheet;
}

function coverSheet(): XLSX.WorkSheet {
  const sheet = newSheet();
  setCell(sheet, "A1", "COMPANY AND REPORTING SETUP");
  writeNamedFields(sheet, COVER_FIELDS as ScalarField[], 3);
  sheet["!cols"] = [{ wch: 34 }, { wch: 40 }, { wch: 4 }, { wch: 80 }];
  return sheet;
}

function assumptionsSheet(): XLSX.WorkSheet {
  const sheet = newSheet();
  setCell(sheet, "A1", "ASSUMPTIONS AND SCORING THRESHOLDS");
  writeAddressedFields(sheet, ASSUMPTIONS_FIELDS as ScalarField[]);
  sheet["!cols"] = [{ wch: 56 }, { wch: 18 }, { wch: 4 }, { wch: 70 }];
  return sheet;
}

/**
 * `E_Data` — the monthly grids plus the annual scalars.
 *
 * The monthly blocks sit at the SHEET rows `esgSheetStructure` translates from
 * (`s1a` 14, `s1b` 23, `s1c` 32, `s1d` 37, `s2` 41, `solar` 50, `water` 58),
 * because that translation is what makes an imported month appear in the grid
 * and reach the scorer. Months run C…K, one column each.
 */
const E_DATA_BLOCKS: ReadonlyArray<{ title: string; firstRow: number; rows: number }> = [
  { title: "SCOPE 1A - ROAD FREIGHT DIESEL (LITRES)", firstRow: 14, rows: 5 },
  { title: "SCOPE 1B - GENERATOR DIESEL (LITRES)", firstRow: 23, rows: 5 },
  { title: "SCOPE 1C - LPG FORKLIFTS (KG)", firstRow: 32, rows: 1 },
  { title: "SCOPE 1D - BUSINESS CARS (LITRES)", firstRow: 37, rows: 1 },
  { title: "SCOPE 2 - GRID ELECTRICITY (KWH)", firstRow: 41, rows: 5 },
  { title: "SOLAR GENERATION (KWH)", firstRow: 50, rows: 5 },
  { title: "SCOPE 3 - WATER (KILOLITRES)", firstRow: 58, rows: 5 },
];

const E_DATA_MONTH_COLS = ["C", "D", "E", "F", "G", "H", "I", "J", "K"] as const;

function eDataSheet(): XLSX.WorkSheet {
  const sheet = newSheet();
  setCell(sheet, "A1", "ENVIRONMENTAL DATA - MONTHLY BY SITE");

  for (const block of E_DATA_BLOCKS) {
    setCell(sheet, `A${block.firstRow - 2}`, block.title);
    const headerRow = block.firstRow - 1;
    setCell(sheet, `A${headerRow}`, "Site / depot");
    E_DATA_MONTH_COLS.forEach((col, i) => {
      setCell(sheet, `${col}${headerRow}`, ESG_DEFAULT_MONTHS[i] ?? `Month ${i + 1}`);
    });
    setCell(sheet, `N${headerRow}`, "Source file");
    for (let r = 0; r < block.rows; r++) {
      const label = block.rows === 1 ? "Company wide" : ESG_DEFAULT_DEPOTS[r];
      setCell(sheet, `A${block.firstRow + r}`, label ?? `Site ${r + 1}`);
    }
  }

  setCell(sheet, "A73", "ANNUAL TOTALS AND BASELINES");
  writeAddressedFields(sheet, [
    ...E_DATA_SUMMARY_FIELDS,
    ...E_DATA_ENERGY_BASELINE_FIELDS,
    ...E_DATA_WATER_INITIATIVE_FIELDS,
  ] as ScalarField[]);

  sheet["!cols"] = [{ wch: 34 }, { wch: 14 }];
  return sheet;
}

/** `S_Data!B5:K11` — the EEA2 matrix, in the order `headcountCellsFromSheetRefs` reads. */
const HEADCOUNT_LEVELS = [
  "Top management",
  "Senior management",
  "Professionally qualified",
  "Skilled technical",
  "Semi-skilled",
  "Unskilled",
  "Temporary employees",
] as const;

const HEADCOUNT_COLUMNS = [
  "African male",
  "African female",
  "Coloured male",
  "Coloured female",
  "Indian male",
  "Indian female",
  "White male",
  "White female",
  "Foreign male",
  "Foreign female",
] as const;

/**
 * `S_Data` — the headcount matrix, the scalars, then the two registers that
 * share the sheet (`s-data-ofo` from row 59, `s-data-csi` from row 72).
 *
 * The all-caps banner at row 70 is load-bearing, not decoration. The OFO
 * register's window runs to row 71, and `classifyEsgGridRow` treats a lone
 * all-caps text cell as the end of a register — so the banner is what stops
 * OFO reading the CSI header row as one of its own.
 */
function sDataSheet(): XLSX.WorkSheet {
  const sheet = newSheet();
  setCell(sheet, "A1", "SOCIAL DATA");

  setCell(sheet, "A3", "EMPLOYMENT EQUITY HEADCOUNT (EEA2)");
  setCell(sheet, "A4", "Occupational level");
  HEADCOUNT_COLUMNS.forEach((label, i) => {
    setCell(sheet, `${XLSX.utils.encode_col(1 + i)}4`, label);
  });
  HEADCOUNT_LEVELS.forEach((level, i) => setCell(sheet, `A${5 + i}`, level));

  writeAddressedFields(sheet, [
    ...S_DATA_HS_FIELDS,
    ...S_DATA_TRAINING_FIELDS,
    ...S_DATA_PAYROLL_FIELDS,
    ...S_DATA_SCALAR_FIELDS,
  ] as ScalarField[]);

  // The named (cell-less) social fields, on rows the addressed block leaves free.
  setCell(sheet, "A56", "HEALTH AND SAFETY REPORTING BASIS");
  writeNamedFields(sheet, S_DATA_HS_FIELDS as ScalarField[], 57);

  setCell(sheet, "A58", "OFO CODES - TRAINING INTERVENTIONS");
  writeRegisterHeader(sheet, "s-data-ofo");

  setCell(sheet, "A70", "COMMUNITY AND SOCIAL INVESTMENT");
  writeRegisterHeader(sheet, "s-data-csi");
  writeRegisterValueGuide(sheet, "s-data-csi", 72 + REGISTER_BLANK_ROWS + 1);

  sheet["!cols"] = [{ wch: 46 }, { wch: 16 }];
  return sheet;
}

function maturitySheet(
  title: string,
  rows: ReadonlyArray<{ cell: string; label: string; options?: readonly string[] }>,
): XLSX.WorkSheet {
  const sheet = newSheet();
  setCell(sheet, "A1", title);
  setCell(sheet, "A3", "Metric");
  setCell(sheet, "B3", "Value");
  setCell(sheet, "D3", "Allowed values");
  writeAddressedFields(sheet, rows as ScalarField[]);
  sheet["!cols"] = [{ wch: 52 }, { wch: 16 }, { wch: 4 }, { wch: 40 }];
  return sheet;
}

function registerSheet(sectionId: EsgGridSectionId): XLSX.WorkSheet {
  const sheet = newSheet();
  const def = ESG_GRID_SECTIONS[sectionId];
  setCell(sheet, "A1", def.description.toUpperCase());
  writeRegisterHeader(sheet, sectionId);
  writeRegisterValueGuide(
    sheet,
    sectionId,
    def.startRow + (def.maxRows ?? REGISTER_BLANK_ROWS) + 1,
  );
  sheet["!cols"] = def.columns.map((c) => ({
    wch: Math.max(12, Math.round((c.width ?? 110) / 8)),
  }));
  return sheet;
}

/** `Waste_Register` carries a register AND the three annual totals at L68:L70. */
function wasteSheet(): XLSX.WorkSheet {
  const sheet = registerSheet("waste");
  setCell(sheet, "A66", "ANNUAL WASTE TOTALS");
  writeAddressedFields(sheet, WASTE_SCALAR_FIELDS as ScalarField[]);
  return sheet;
}

/* -------------------------------------------------------------------------- */

/** Registers that get a plain sheet of their own, in workbook order. */
const STANDALONE_REGISTERS: ReadonlyArray<EsgGridSectionId> = [
  "fleet",
  "driver-debrief",
  "iso-tracker",
  "king5",
  "ifrs",
  "garp",
  "saq",
];

export function buildEsgWorkbookTemplateXlsx(): Buffer {
  const book = XLSX.utils.book_new();

  appendSheet(book, "Instructions", instructionsSheet());
  appendSheet(book, "Cover", coverSheet());
  appendSheet(book, "Assumptions", assumptionsSheet());
  appendSheet(book, "E_Data", eDataSheet());
  appendSheet(book, "S_Data", sDataSheet());
  appendSheet(book, "G_Data", maturitySheet("GOVERNANCE DATA", G_DATA_MATURITY_ROWS));
  appendSheet(book, "EE_Scorecard", maturitySheet("EMPLOYMENT EQUITY", EE_MATURITY_ROWS));
  appendSheet(book, "Waste_Register", wasteSheet());
  for (const id of STANDALONE_REGISTERS) {
    appendSheet(book, ESG_GRID_SECTIONS[id].sheet, registerSheet(id));
  }

  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/** Every register the template must reach — asserted by the tests. */
export const ESG_TEMPLATE_REGISTER_IDS: ReadonlyArray<EsgGridSectionId> = ESG_GRID_SECTION_IDS;
