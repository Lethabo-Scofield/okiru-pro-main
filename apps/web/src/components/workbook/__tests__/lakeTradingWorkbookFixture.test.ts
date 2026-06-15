import { describe, it, expect } from "vitest";
import { validateWorkbook } from "../workbookValidation";
import { buildLakeTradingWorkbookSections } from "@/lib/lakeTradingWorkbookFixture";
import { lakeTradingExpectedScores } from "@/lib/lakeTradingDemo";

describe("lakeTradingWorkbookFixture", () => {
  it("builds sections that pass workbook validation", () => {
    const sections = buildLakeTradingWorkbookSections();
    const issues = validateWorkbook(sections);
    expect(issues).toHaveLength(0);
  });

  it("includes RCOGP Generic company meta and financials", () => {
    const sections = buildLakeTradingWorkbookSections();
    expect(sections["company-information"]?.meta?.industrySector).toBe("RCOGP");
    expect(sections["company-information"]?.meta?.scorecardType).toBe("Generic");
    expect(sections["financial-information"]?.meta?.tmps).toBeGreaterThan(0);
    expect(sections["financial-information"]?.meta?.revenue).toBeGreaterThan(0);
  });

  it("includes ownership, employees, procurement, ESD, and SED rows", () => {
    const sections = buildLakeTradingWorkbookSections();
    expect(sections.ownership?.rows?.length).toBeGreaterThan(0);
    expect(sections["management-control"]?.rows?.length).toBe(12);
    expect(sections.procurement?.rows?.length).toBe(2);
    expect(sections.esd?.rows?.length).toBe(2);
    expect(sections.sed?.rows?.length).toBe(1);
    expect(sections["skills-development"]?.rows?.length).toBe(0);
  });

  it("documents expected ground-truth totals", () => {
    expect(lakeTradingExpectedScores.total).toBe(62.17); // per-demographic MC (was 63.56)
    expect(lakeTradingExpectedScores.level).toBe(7);
    expect(lakeTradingExpectedScores.discountedLevel).toBe(8);
  });
});
