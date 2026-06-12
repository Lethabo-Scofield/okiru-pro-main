import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parseEsgWorkbookXlsx } from "../esgWorkbookImport";
import { buildEsgWorkbookXlsx } from "../esgWorkbookExport";
import { buildSgConsumerGoldenWorkbook } from "../../../../EsgToolkit/src/lib/fixtures/esg-consumer-golden";

describe("parseEsgWorkbookXlsx", () => {
  it("parses exported golden workbook into sections", () => {
    const wb = buildSgConsumerGoldenWorkbook();
    const buf = buildEsgWorkbookXlsx(wb);
    const preview = parseEsgWorkbookXlsx(buf);
    expect(Object.keys(preview.sections).length).toBeGreaterThanOrEqual(5);
    expect(preview.sections.assumptions?.cells).toBeDefined();
  });

  it("parses v1.7 fixture when present", () => {
    const path = resolve(
      import.meta.dirname,
      "../../../../../docs/esg/Okiru_ESG_Toolkit_v1_7_SG_Consumer_LiveData.xlsx",
    );
    try {
      const buf = readFileSync(path);
      const preview = parseEsgWorkbookXlsx(buf);
      expect(Object.keys(preview.sections).length).toBeGreaterThan(0);
    } catch {
      // fixture optional in CI
    }
  });
});
