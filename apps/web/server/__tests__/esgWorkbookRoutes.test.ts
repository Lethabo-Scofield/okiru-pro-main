import { describe, expect, it } from "vitest";
import { ESG_GRID_SECTION_IDS } from "../../src/lib/esgGridSections";
import { ESG_SECTION_IDS } from "../../src/lib/esgSections";
import { validateEsgWorkbookForSubmit } from "../../src/lib/esgValidation";
import { buildSgConsumerGoldenWorkbook } from "../../EsgToolkit/src/lib/fixtures/esg-consumer-golden";

describe("esgWorkbookRoutes section keys", () => {
  it("includes all Phase 1 section ids", () => {
    expect(ESG_SECTION_IDS).toContain("e-data");
    expect(ESG_SECTION_IDS).toContain("ee");
    expect(ESG_SECTION_IDS).toContain("king5");
    expect(ESG_SECTION_IDS.length).toBeGreaterThanOrEqual(10);
  });

  it("register sections use grid editor ids", () => {
    expect(ESG_GRID_SECTION_IDS).toContain("fleet");
    expect(ESG_GRID_SECTION_IDS).toContain("king5");
    expect(ESG_GRID_SECTION_IDS).toContain("ifrs");
  });
});

describe("esg submit validation", () => {
  it("golden workbook fails King5 gate until 17 statuses entered", () => {
    const wb = buildSgConsumerGoldenWorkbook();
    expect(validateEsgWorkbookForSubmit(wb).ok).toBe(false);
  });
});
