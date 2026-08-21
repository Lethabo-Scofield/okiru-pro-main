import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "fs";
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
    // Six levels up: __tests__ → esg → lib → src → web → apps → repo root.
    // This was five, which resolved to apps/docs/… — the ENOENT was then
    // swallowed by the catch below, so the test passed while asserting nothing.
    const path = resolve(
      import.meta.dirname,
      "../../../../../../docs/esg/Okiru_ESG_Toolkit_v1_7_SG_Consumer_LiveData.xlsx",
    );
    if (!existsSync(path)) {
      // Genuinely absent (e.g. a checkout without the docs fixtures) — skip.
      return;
    }
    // Present but unreadable/unparseable is a real failure, not a skip:
    // no try/catch here on purpose.
    const preview = parseEsgWorkbookXlsx(readFileSync(path));
    expect(Object.keys(preview.sections).length).toBeGreaterThan(0);
    expect(preview.sections.assumptions?.cells).toBeDefined();
  });
});
