import { describe, expect, it } from "vitest";
import { ESG_SECTION_IDS } from "../../src/lib/esgSections";

describe("esgWorkbookRoutes section keys", () => {
  it("includes all Phase 1 section ids", () => {
    expect(ESG_SECTION_IDS).toContain("e-data");
    expect(ESG_SECTION_IDS).toContain("ee");
    expect(ESG_SECTION_IDS).toContain("king5");
    expect(ESG_SECTION_IDS.length).toBeGreaterThanOrEqual(10);
  });
});
