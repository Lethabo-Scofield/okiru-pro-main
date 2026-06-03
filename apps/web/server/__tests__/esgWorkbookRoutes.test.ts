import { describe, expect, it } from "vitest";
import { ESG_GRID_SECTION_IDS } from "../../src/lib/esgGridSections";
import { ESG_SECTION_IDS } from "../../src/lib/esgSections";
import { validateEsgWorkbookForSubmit } from "../../src/lib/esgValidation";
import { buildSgConsumerGoldenWorkbook } from "../../EsgToolkit/src/lib/fixtures/esg-consumer-golden";

/** Registered HTTP paths (must match esgWorkbookRoutes.ts and ingress /api/esg → web). */
export const ESG_API_ROUTE_PATHS = [
  "GET /api/esg/access",
  "GET /api/esg/workbook/:companyId",
  "PUT /api/esg/workbook/:companyId/section/:sectionKey",
  "POST /api/esg/workbook/:companyId/validate",
  "POST /api/esg/workbook/:companyId/submit",
  "GET /api/esg/workbook/:companyId/scores",
  "GET /api/esg/workbook/:companyId/export",
] as const;

describe("esgWorkbookRoutes section keys", () => {
  it("documents canonical API paths", () => {
    expect(ESG_API_ROUTE_PATHS.length).toBe(7);
    expect(ESG_API_ROUTE_PATHS.join(" ")).toContain("/api/esg/");
  });
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
