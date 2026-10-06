import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildSgConsumerGoldenWorkbook } from "../../../../EsgToolkit/src/lib/fixtures/esg-consumer-golden";
import { buildEsgWorkbookXlsx, ESG_V17_SHEET_NAMES } from "../esgWorkbookExport";
import { parseEsgWorkbookXlsx } from "../esgWorkbookImport";

describe("esgWorkbookExport", () => {
  it("includes all v1.7 sheet names and computed E_Scorecard total", () => {
    const wb = buildSgConsumerGoldenWorkbook();
    const buf = buildEsgWorkbookXlsx(wb);
    const book = XLSX.read(buf, { type: "buffer" });
    for (const name of ESG_V17_SHEET_NAMES) {
      expect(book.SheetNames).toContain(name);
    }
    const eSheet = book.Sheets.E_Scorecard;
    expect(eSheet).toBeDefined();
    const d30 = eSheet.D30?.v;
    expect(typeof d30).toBe("number");
    expect(d30).toBeCloseTo(36, 0);
  });

  it("round-trips what a person entered under names, not cells: the company setup and the headcount matrix", () => {
    const wb = buildSgConsumerGoldenWorkbook();
    wb.sections!["company-reporting-setup"]!.cells.boundary = "Operational control";
    const back = parseEsgWorkbookXlsx(buildEsgWorkbookXlsx(wb));

    const setup = wb.sections!["company-reporting-setup"]!.cells;
    for (const key of ["entity", "period", "boundary", "baselineYear", "netZeroTargetYear", "sector"]) {
      expect(String(back.sections["company-reporting-setup"]?.cells[key]), key).toBe(String(setup[key]));
    }
    const headcount = Object.entries(wb.sections!["s-data"]!.cells).filter(([ref]) => ref.startsWith("hc_"));
    expect(headcount).toHaveLength(70);
    for (const [ref, value] of headcount) {
      expect(back.sections["s-data"]?.cells[ref], ref).toBe(Number(value));
    }
  });
});
