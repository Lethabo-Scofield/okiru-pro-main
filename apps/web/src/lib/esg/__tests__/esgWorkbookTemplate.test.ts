import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  buildEsgWorkbookTemplateXlsx,
  ESG_BULK_TEMPLATE_SHEETS,
} from "../esgWorkbookTemplate";
import { parseEsgWorkbookXlsx } from "../esgWorkbookImport";
import { buildSgConsumerGoldenWorkbook } from "../../../../EsgToolkit/src/lib/fixtures/esg-consumer-golden";
import { buildEsgWorkbookXlsx } from "../esgWorkbookExport";

describe("esgWorkbookTemplate", () => {
  it("includes bulk input sheets with G_Data structure", () => {
    const buf = buildEsgWorkbookTemplateXlsx();
    const book = XLSX.read(buf, { type: "buffer" });
    for (const name of ESG_BULK_TEMPLATE_SHEETS) {
      expect(book.SheetNames).toContain(name);
    }
    const gSheet = book.Sheets.G_Data;
    expect(gSheet?.B4?.v).toBe("Current Value");
    expect(gSheet?.A12?.v).toContain("Risk committee");
  });

  it("round-trips golden g-data through template-shaped export import", () => {
    const wb = buildSgConsumerGoldenWorkbook();
    const exported = buildEsgWorkbookXlsx(wb);
    const preview = parseEsgWorkbookXlsx(exported);
    expect(preview.sections["g-data"]?.cells?.B12).toBe("Yes");
    expect(preview.sections["e-data"]?.cells).toBeDefined();
    expect(preview.sections["s-data"]?.cells).toBeDefined();
  });
});
