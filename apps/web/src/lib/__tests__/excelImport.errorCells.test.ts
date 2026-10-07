/**
 * The InformationRequest import must not invent a TMPS.
 *
 * Measured on the client's updated gathering workbook:
 *   - its Finance!C76 TMPS formula is `#REF!`, which SheetJS stores as the
 *     error code 23;
 *   - its Imports sheet says "Total Procurement Expenditure from foreign
 *     suppliers (Per the schedule below)" with R312,345 beside it. The bare
 *     "total procurement" synonym matched that line, and R312,345 of foreign
 *     spend was offered as the entity's TMPS.
 * The import must take neither. It should leave TMPS for a workbook that states it.
 */
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { extractBeeGatheringBuffer } from "../excelImport";

const REF: XLSX.CellObject = { t: "e", v: 23, w: "#REF!" };

function gatheringWorkbook(options: { tmps: number | "REF"; imports: number; turnoverRef?: boolean }): ArrayBuffer {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([
      ["Measured Entity Name:", "Acme Transport"],
      ["Industry Sector:", "Transport"],
    ]),
    "Instructions",
  );

  const finance = XLSX.utils.aoa_to_sheet([
    ["FINANCIAL INFORMATION", "Year 0", "Year -1"],
    ["Turnover", 12345678],
    ["NPAT", -27124],
  ]);
  XLSX.utils.sheet_add_aoa(finance, [["TOTAL MEASURED PROCUREMENT SPEND"], ["Inclusions", "", "", "", "Exclusions"]], { origin: "A51" });
  XLSX.utils.sheet_add_aoa(finance, [["", "", 9200000, "", "", "", "", 4076543.22]], { origin: "A74" });
  XLSX.utils.sheet_add_aoa(finance, [["Total Measured Procurement Spend  ", "", options.tmps === "REF" ? 0 : options.tmps]], { origin: "A76" });
  if (options.tmps === "REF") finance.C76 = { ...REF };
  if (options.turnoverRef) finance.B2 = { ...REF };
  XLSX.utils.book_append_sheet(book, finance, "Finance");

  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Shareholder", "Black Voting Rights"], ["A Owner", 1]]), "Ownership");
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Name", "Race", "Gender"], ["A Person", "African", "Female"]]), "Employment Equity");
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([
      ["", "Measured Entity: Acme Transport"],
      [],
      ["", "Summary"],
      ["", "Value of Imports Procurement that can be excluded from Total Measured Procurement Spend (TMPS):", "", "", 0],
      ["", "Total Procurement Expenditure from foreign suppliers (Per the schedule below):", "", "", options.imports],
    ]),
    "Imports",
  );
  book.Workbook = { Names: [{ Name: "Turnover", Ref: "'Finance'!$B$2" }] };
  const out = XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return out;
}

describe("extractBeeGatheringBuffer — error cells and the Imports sheet", () => {
  it("reads no TMPS from a #REF! cell and none from the Imports sheet", () => {
    const result = extractBeeGatheringBuffer(gatheringWorkbook({ tmps: "REF", imports: 312345 }));
    expect(result.isBeeGatheringFormat).toBe(true);
    expect(result.data.totalProcurement).not.toBe(312345);
    expect(result.data.totalProcurement).not.toBe(23);
    expect(result.data.totalProcurement ?? 0).toBe(0);
  });

  it("still reads a stated TMPS off the Finance sheet", () => {
    const result = extractBeeGatheringBuffer(gatheringWorkbook({ tmps: 5123456.78, imports: 312345 }));
    // The display text loses cents (R 5,123,457); the figure is still the stated one.
    expect(Math.round(Number(result.data.totalProcurement))).toBe(5123457);
    expect(String(result.fieldSources?.totalProcurement)).toMatch(/^Finance/);
  });

  it("never takes a named range's error code as its figure", () => {
    const result = extractBeeGatheringBuffer(gatheringWorkbook({ tmps: 5123456.78, imports: 0, turnoverRef: true }));
    expect(result.data.revenue).not.toBe(23);
    expect(result.fieldSources?.revenue ?? "").not.toMatch(/named range/);
  });
});
