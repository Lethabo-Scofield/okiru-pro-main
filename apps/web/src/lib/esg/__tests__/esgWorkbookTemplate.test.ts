/**
 * The template's only real promise: fill it in, import it, and the values land
 * on the cells the scorers read.
 *
 * The previous version of this file asserted the shape of a FIELD GUIDE
 * (`G_Data!B4 === "Current Value"`) — the heading of a column the user was
 * asked to type into, and which the importer then stored at `B4` as though it
 * were governance data. It passed for as long as the template was unusable,
 * because it pinned the layout instead of the round trip. These tests do the
 * opposite: they write values into the template exactly as a client would, and
 * assert they come back addressed the way the app reads them.
 */
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  buildEsgWorkbookTemplateXlsx,
  ESG_BULK_TEMPLATE_SHEETS,
  ESG_TEMPLATE_REGISTER_IDS,
} from "../esgWorkbookTemplate";
import { parseEsgWorkbookXlsx } from "../esgWorkbookImport";
import { ESG_GRID_SECTIONS } from "../esgGridSections";
import { esgColumnRef } from "../esgGridRows";
import { buildSgConsumerGoldenWorkbook } from "../../../../EsgToolkit/src/lib/fixtures/esg-consumer-golden";
import { buildEsgWorkbookXlsx } from "../esgWorkbookExport";

/** Type a value into a sheet the way a client filling the template would. */
function fill(book: XLSX.WorkBook, sheetName: string, ref: string, value: string | number): void {
  const sheet = book.Sheets[sheetName];
  if (!sheet) throw new Error(`template has no sheet ${sheetName}`);
  sheet[ref] = { t: typeof value === "number" ? "n" : "s", v: value };
  const range = XLSX.utils.decode_range(String(sheet["!ref"] ?? "A1"));
  const cell = XLSX.utils.decode_cell(ref);
  range.e.r = Math.max(range.e.r, cell.r);
  range.e.c = Math.max(range.e.c, cell.c);
  sheet["!ref"] = XLSX.utils.encode_range(range);
}

function reimport(book: XLSX.WorkBook) {
  return parseEsgWorkbookXlsx(XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer);
}

describe("esgWorkbookTemplate", () => {
  it("carries a sheet for every input section, registers included", () => {
    const book = XLSX.read(buildEsgWorkbookTemplateXlsx(), { type: "buffer" });
    for (const name of ESG_BULK_TEMPLATE_SHEETS) {
      expect(book.SheetNames).toContain(name);
    }
    // Every register needs somewhere to be filled in. Twelve of the seventeen
    // input sections previously had none at all.
    for (const id of ESG_TEMPLATE_REGISTER_IDS) {
      expect(book.SheetNames).toContain(ESG_GRID_SECTIONS[id].sheet);
    }
  });

  it("puts each label beside an EMPTY cell at the address the app reads", () => {
    const book = XLSX.read(buildEsgWorkbookTemplateXlsx(), { type: "buffer" });
    const gData = book.Sheets.G_Data!;
    // `B12` is "Risk committee active": the label belongs in column A, and the
    // value cell itself must be blank and waiting for an answer.
    expect(String(gData.A12?.v)).toContain("Risk committee");
    expect(gData.B12).toBeUndefined();
  });

  it("round-trips scalar answers onto their own addresses", () => {
    const book = XLSX.read(buildEsgWorkbookTemplateXlsx(), { type: "buffer" });

    fill(book, "G_Data", "B12", "Yes"); // Risk committee active
    fill(book, "G_Data", "B25", 0); // Material regulatory penalties — a nil return
    fill(book, "E_Data", "B92", 412_000); // Prior-year electricity (kWh)
    fill(book, "E_Data", "B94", "Yes"); // Water efficiency initiative active
    fill(book, "Assumptions", "B43", 0.05); // GHG YoY reduction threshold

    const preview = reimport(book);
    expect(preview.sections["g-data"]?.cells.B12).toBe("Yes");
    expect(preview.sections["g-data"]?.cells.B25).toBe(0);
    expect(preview.sections["e-data"]?.cells.B92).toBe(412_000);
    expect(preview.sections["e-data"]?.cells.B94).toBe("Yes");
    expect(preview.sections.assumptions?.cells.B43).toBe(0.05);
  });

  it("round-trips the Cover sheet onto its NAMED keys, not its addresses", () => {
    const book = XLSX.read(buildEsgWorkbookTemplateXlsx(), { type: "buffer" });
    const cover = book.Sheets.Cover!;

    // Cover is keyed by name (`entity`, `boundary`), never by cell, so
    // answering beside the label is the only path in. Find each label's row.
    const rowOfLabel = (needle: string): number => {
      for (const ref of Object.keys(cover)) {
        if (!/^A[1-9]\d*$/.test(ref)) continue;
        if (String(cover[ref].v).toLowerCase().includes(needle)) return Number(ref.slice(1));
      }
      throw new Error(`Cover has no label containing "${needle}"`);
    };

    fill(book, "Cover", `B${rowOfLabel("entity")}`, "Acme Distribution (Pty) Ltd");
    fill(book, "Cover", `B${rowOfLabel("boundary")}`, "Financial control");
    fill(book, "Cover", `B${rowOfLabel("baseline year")}`, 2023);

    const cells = reimport(book).sections["company-reporting-setup"]?.cells;
    expect(cells?.entity).toBe("Acme Distribution (Pty) Ltd");
    expect(cells?.boundary).toBe("Financial control");
    expect(cells?.baselineYear).toBe(2023);
  });

  it("round-trips a register row through its own column letters", () => {
    const book = XLSX.read(buildEsgWorkbookTemplateXlsx(), { type: "buffer" });

    // SAQ_Supplier feeds the two supplier indicators: health & safety is
    // column D and food safety column F, both resolved by `esgColumnRef`.
    const saq = ESG_GRID_SECTIONS.saq;
    const colOf = (key: string) =>
      esgColumnRef("saq", saq.columns.findIndex((c) => c.key === key));

    fill(book, "SAQ_Supplier", `${colOf(saq.columns[0].key)}${saq.startRow}`, "Cold Chain Co");
    fill(book, "SAQ_Supplier", `${colOf("healthSafety")}${saq.startRow}`, "4");
    fill(book, "SAQ_Supplier", `${colOf("foodSafety")}${saq.startRow}`, "5");

    // Stored as STRINGS because the column is a select — `readEsgCell`
    // number-coerces them downstream, which is what the supplier indicators
    // read. What matters here is the ADDRESS: D and F, not C and E.
    const cells = reimport(book).sections.saq?.cells ?? {};
    expect(cells[`${colOf("healthSafety")}${saq.startRow}`]).toBe("4");
    expect(cells[`${colOf("foodSafety")}${saq.startRow}`]).toBe("5");
    expect(colOf("healthSafety")).toBe("D");
    expect(colOf("foodSafety")).toBe("F");
  });

  it("does not import its own headers as data", () => {
    // A blank template is a blank workbook: nothing but furniture, so no
    // register may report a single row.
    const preview = parseEsgWorkbookXlsx(buildEsgWorkbookTemplateXlsx());
    for (const id of ESG_TEMPLATE_REGISTER_IDS) {
      const count = Number(preview.sections[id]?.cells?._row_count ?? 0);
      expect(`${id}:${count}`).toBe(`${id}:0`);
    }
  });

  it("round-trips golden g-data through the full workbook export", () => {
    const wb = buildSgConsumerGoldenWorkbook();
    const preview = parseEsgWorkbookXlsx(buildEsgWorkbookXlsx(wb));
    expect(preview.sections["g-data"]?.cells?.B12).toBe("Yes");
    expect(preview.sections["e-data"]?.cells).toBeDefined();
    expect(preview.sections["s-data"]?.cells).toBeDefined();
  });
});
