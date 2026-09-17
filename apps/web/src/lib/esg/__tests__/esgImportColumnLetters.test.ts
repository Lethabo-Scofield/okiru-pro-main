/**
 * Import must read a grid section from the SAME columns the app writes it to.
 *
 * `esgGridRows` honours a section's `columnLetters` override; `esgWorkbookImport`
 * did not, and read every grid positionally from column A. For the two sections
 * that declare an override this shifted every field by one column:
 *
 *   IFRS_S1_S2 is  B=Requirement C=Pillar D=Status  … G=Evidence H=Action
 *   positional read  A=requirement B=pillar  C=status  D=evidence E=action
 *
 * so `status` was populated from the PILLAR column. The scorers count
 * `status === "Disclosed"`, and "Governance" is not "Disclosed", so an imported
 * IFRS tracker scored zero however completely the client had filled it in.
 *
 * Round-tripping is the test that catches it: what the app writes, the import
 * must read back.
 */
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseEsgWorkbookXlsx } from "../esgWorkbookImport";
import { buildEsgWorkbookXlsx } from "../esgWorkbookExport";
import { readEsgGridRows, writeEsgGridCells } from "../esgGridRows";
import { ESG_GRID_SECTIONS, esgGridRowRange } from "../esgGridSections";

/** Build a one-sheet workbook from an { A1: value } cell map. */
function workbookFrom(sheetName: string, cells: Record<string, string | number>): Buffer {
  const sheet: XLSX.WorkSheet = {};
  for (const [ref, v] of Object.entries(cells)) {
    sheet[ref] = { t: typeof v === "number" ? "n" : "s", v };
  }
  // The range must actually COVER the cells: the ESG registers live at rows 59
  // and 72, so a hardcoded window silently hid them from the importer.
  const refs = Object.keys(cells);
  if (refs.length === 0) {
    sheet["!ref"] = "A1";
  } else {
    let maxRow = 0;
    let maxCol = 0;
    for (const ref of refs) {
      const { r, c } = XLSX.utils.decode_cell(ref);
      maxRow = Math.max(maxRow, r);
      maxCol = Math.max(maxCol, c);
    }
    sheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } });
  }
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName);
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("a section with columnLetters is imported from its declared columns", () => {
  it("reads IFRS status from D, not from C", () => {
    const def = ESG_GRID_SECTIONS.ifrs;
    const row = def.startRow;
    const buffer = workbookFrom("IFRS_S1_S2", {
      [`B${row}`]: "Governance of climate risk",
      [`C${row}`]: "Governance",
      [`D${row}`]: "Disclosed",
      [`E${row}`]: 5, // the sheet's own derived Score /5 — never a grid field
      [`G${row}`]: "Board charter s4.2",
    });

    const preview = parseEsgWorkbookXlsx(buffer);
    const rows = readEsgGridRows(preview.sections.ifrs?.cells, "ifrs");

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("Disclosed");
    expect(rows[0].pillar).toBe("Governance");
    expect(rows[0].requirement).toBe("Governance of climate risk");
  });

  it("does not let the Pillar column masquerade as the status", () => {
    // The exact failure: positional reading put "Governance" into `status`.
    const def = ESG_GRID_SECTIONS.ifrs;
    const buffer = workbookFrom("IFRS_S1_S2", {
      [`B${def.startRow}`]: "Requirement",
      [`C${def.startRow}`]: "Strategy",
      [`D${def.startRow}`]: "Disclosed",
    });
    const rows = readEsgGridRows(parseEsgWorkbookXlsx(buffer).sections.ifrs?.cells, "ifrs");
    expect(rows[0].status).not.toBe("Strategy");
  });

  it("reads the ISO tracker from B/C/D/H/I", () => {
    const def = ESG_GRID_SECTIONS["iso-tracker"];
    const row = def.startRow;
    const buffer = workbookFrom("ISO_Tracker", {
      [`B${row}`]: "Context of the organisation",
      [`C${row}`]: "4.1",
      [`D${row}`]: "Fully Compliant",
      [`E${row}`]: 5,
      [`H${row}`]: "Context register v3",
    });
    const rows = readEsgGridRows(
      parseEsgWorkbookXlsx(buffer).sections["iso-tracker"]?.cells,
      "iso-tracker",
    );
    expect(rows[0].status).toBe("Fully Compliant");
    expect(rows[0].clause).toBe("4.1");
    expect(rows[0].evidence).toBe("Context register v3");
  });
});

describe("export → import round-trips for every grid section", () => {
  it("reads back what the app wrote, whatever the column layout", () => {
    for (const [sectionId, def] of Object.entries(ESG_GRID_SECTIONS)) {
      const textCol = def.columns.find((c) => c.type === "text" || c.type === "select");
      if (!textCol) continue;
      const value = textCol.type === "select" ? textCol.options?.[0] : "round-trip";
      if (!value) continue;

      const written = writeEsgGridCells(sectionId as never, [
        { _id: "x", [textCol.key]: value } as never,
      ]);
      const cells: Record<string, string | number> = {};
      for (const [ref, v] of Object.entries(written)) {
        if (/^[A-Z]+\d+$/.test(ref) && (typeof v === "string" || typeof v === "number")) {
          cells[ref] = v;
        }
      }
      if (Object.keys(cells).length === 0) continue;

      const preview = parseEsgWorkbookXlsx(workbookFrom(def.sheet, cells));
      const rows = readEsgGridRows(preview.sections[sectionId]?.cells, sectionId as never);
      expect(rows[0]?.[textCol.key], `${sectionId}.${textCol.key} did not round-trip`).toBe(value);
    }
  });

});

/**
 * `S_Data` carries THREE sections: the flat `s-data` cells, the OFO training
 * register at row 59 and the CSI register at row 72. `SHEET_TO_SECTION` mapped
 * the sheet to one section and stopped, so neither register was ever read —
 * and `s-data-csi` feeds `S_Scorecard!C23`, where a missing count scores zero.
 * A client whose workbook was full of CSI initiatives lost those points behind
 * an import that reported success.
 */
describe("a sheet carrying several registers imports all of them", () => {
  const OFO = ESG_GRID_SECTIONS["s-data-ofo"];
  const CSI = ESG_GRID_SECTIONS["s-data-csi"];

  const sDataSheet = () =>
    workbookFrom("S_Data", {
      // flat s-data cells (headcount block / payroll) — must survive untouched
      B5: 12,
      B43: 4_000_000,
      // OFO training register, row 59
      [`A${OFO.startRow}`]: "2019-121201",
      [`B${OFO.startRow}`]: "Truck Driver",
      [`C${OFO.startRow}`]: 8,
      // CSI register, row 72
      [`A${CSI.startRow}`]: "Mobile clinic",
      [`B${CSI.startRow}`]: "March",
      [`D${CSI.startRow}`]: 250_000,
    });

  it("imports the OFO training register", () => {
    const rows = readEsgGridRows(
      parseEsgWorkbookXlsx(sDataSheet()).sections["s-data-ofo"]?.cells,
      "s-data-ofo",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].ofoCode).toBe("2019-121201");
    expect(rows[0].occupation).toBe("Truck Driver");
    expect(rows[0].learners).toBe(8);
  });

  it("imports the CSI register — the one that scores S_Scorecard!C23", () => {
    const rows = readEsgGridRows(
      parseEsgWorkbookXlsx(sDataSheet()).sections["s-data-csi"]?.cells,
      "s-data-csi",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].initiative).toBe("Mobile clinic");
    expect(rows[0].spend).toBe(250_000);
  });

  it("does not let the OFO register swallow the CSI rows", () => {
    // `row >= startRow` with no upper bound made s-data-ofo (59) claim every
    // CSI row at 72+ as if they were training interventions.
    const ofo = readEsgGridRows(
      parseEsgWorkbookXlsx(sDataSheet()).sections["s-data-ofo"]?.cells,
      "s-data-ofo",
    );
    expect(ofo.every((r) => r.ofoCode !== "Mobile clinic")).toBe(true);
    expect(ofo).toHaveLength(1);
  });

  it("still imports the flat s-data cells alongside both registers", () => {
    const sections = parseEsgWorkbookXlsx(sDataSheet()).sections;
    expect(sections["s-data"]?.cells.B5).toBe(12);
    expect(sections["s-data"]?.cells.B43).toBe(4_000_000);
  });

  it("gives each register a row window that stops at the next one", () => {
    expect(esgGridRowRange("s-data-ofo")).toEqual({
      startRow: OFO.startRow,
      endRow: CSI.startRow - 1,
    });
    // The last register on a sheet runs to the end.
    expect(esgGridRowRange("s-data-csi").endRow).toBe(Number.POSITIVE_INFINITY);
  });

  it("leaves single-register sheets with an unbounded window", () => {
    expect(esgGridRowRange("fleet").endRow).toBe(Number.POSITIVE_INFINITY);
  });

  it("survives a real export → import round trip", () => {
    // The export side had the mirror defect: `INPUT_SHEET_BY_SECTION` had no
    // entry for either register, so anything a user typed into those grids was
    // dropped on the way OUT as well as on the way in.
    const workbook = {
      sections: {
        "s-data-ofo": {
          cells: writeEsgGridCells("s-data-ofo", [
            { _id: "a", ofoCode: "2019-121201", occupation: "Truck Driver", learners: 8 },
          ]),
        },
        "s-data-csi": {
          cells: writeEsgGridCells("s-data-csi", [
            { _id: "b", initiative: "Mobile clinic", spend: 250_000 },
          ]),
        },
      },
    };

    const exported = buildEsgWorkbookXlsx(workbook as never);
    const sections = parseEsgWorkbookXlsx(exported).sections;

    const ofo = readEsgGridRows(sections["s-data-ofo"]?.cells, "s-data-ofo");
    const csi = readEsgGridRows(sections["s-data-csi"]?.cells, "s-data-csi");
    expect(ofo[0]?.occupation).toBe("Truck Driver");
    expect(csi[0]?.initiative).toBe("Mobile clinic");
    expect(csi[0]?.spend).toBe(250_000);
  });
});
