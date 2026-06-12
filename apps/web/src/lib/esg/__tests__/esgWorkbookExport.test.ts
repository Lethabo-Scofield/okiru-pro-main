import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildSgConsumerGoldenWorkbook } from "../../../../EsgToolkit/src/lib/fixtures/esg-consumer-golden";
import { buildEsgWorkbookXlsx, ESG_V17_SHEET_NAMES } from "../esgWorkbookExport";

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
});
