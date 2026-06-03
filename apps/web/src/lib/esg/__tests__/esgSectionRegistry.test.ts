import { describe, expect, it } from "vitest";
import {
  E_SCORECARD_INDICATORS,
  G_SCORECARD_INDICATORS,
  S_SCORECARD_INDICATORS,
} from "../esgScorecardDefinitions";
import { E_DATA_SUBTABS, ESG_SECTION_REGISTRY, parityStats } from "../esgSectionRegistry";

describe("esgSectionRegistry", () => {
  it("covers all 28 workbook sheets", () => {
    expect(ESG_SECTION_REGISTRY).toHaveLength(28);
  });

  it("E_Data has 10 scope/subtab blocks", () => {
    expect(E_DATA_SUBTABS).toHaveLength(10);
  });

  it("parity is majority complete", () => {
    const stats = parityStats();
    expect(stats.total).toBe(28);
    expect(stats.complete).toBeGreaterThanOrEqual(23);
  });
});

describe("esgScorecardDefinitions", () => {
  it("extracts all E/S/G scoring rows from golden JSON", () => {
    expect(E_SCORECARD_INDICATORS.length).toBeGreaterThanOrEqual(18);
    expect(S_SCORECARD_INDICATORS.length).toBeGreaterThanOrEqual(17);
    expect(G_SCORECARD_INDICATORS.length).toBeGreaterThanOrEqual(12);
  });

  it("row keys align with calculator d-row convention", () => {
    expect(E_SCORECARD_INDICATORS[0]?.key).toMatch(/^d\d+$/);
  });
});
