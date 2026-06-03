import { describe, expect, it } from "vitest";
import { ESG_GRID_SECTION_IDS } from "../../src/lib/esgGridSections";
import { ESG_SECTION_IDS } from "../../src/lib/esgSections";
import { validateEsgWorkbookForSubmit } from "../../src/lib/esgValidation";
import { buildSgConsumerGoldenWorkbook } from "../../EsgToolkit/src/lib/fixtures/esg-consumer-golden";
import { buildGoldenSections } from "../esgGoldenFixture";
import { countGoldenCells } from "../../EsgToolkit/src/lib/fixtures/esg-consumer-golden";

/** Registered HTTP paths (must match esgWorkbookRoutes.ts and ingress /api/esg → web). */
export const ESG_API_ROUTE_PATHS = [
  "GET /api/esg/access",
  "GET /api/esg/workbook/:companyId",
  "PUT /api/esg/workbook/:companyId/section/:sectionKey",
  "POST /api/esg/workbook/:companyId/validate",
  "POST /api/esg/workbook/:companyId/submit",
  "POST /api/esg/workbook/:companyId/seed-demo",
  "POST /api/esg/workbook/:companyId/import",
  "GET /api/esg/workbook/:companyId/scores",
  "GET /api/esg/workbook/:companyId/export",
] as const;

describe("esgWorkbookRoutes section keys", () => {
  it("documents canonical API paths", () => {
    expect(ESG_API_ROUTE_PATHS.length).toBe(9);
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

describe("esgGoldenFixture", () => {
  it("seeds all phase-1 sections atomically", () => {
    const sections = buildGoldenSections();
    expect(Object.keys(sections).length).toBeGreaterThanOrEqual(9);
    expect(sections["e-data"]?.cells).toBeDefined();
    expect(sections.king5?.cells).toBeDefined();
    expect(countGoldenCells()).toBeGreaterThan(200);
  });

  it("seed-demo headcount matrix sums to L12 total", () => {
    const cells = buildGoldenSections()["s-data"]?.cells ?? {};
    let matrixSum = 0;
    for (let ri = 0; ri < 7; ri++) {
      for (let ci = 0; ci < 10; ci++) {
        const v = cells[`hc_${ri}_${ci}`];
        if (typeof v === "number") matrixSum += v;
      }
    }
    const l12 = Number(cells.L12 ?? 0);
    expect(matrixSum).toBe(l12);
  });
});

describe("esg submit validation", () => {
  it("golden workbook fails King5 gate until 17 statuses entered", () => {
    const wb = buildSgConsumerGoldenWorkbook();
    expect(validateEsgWorkbookForSubmit(wb).ok).toBe(false);
  });
});
