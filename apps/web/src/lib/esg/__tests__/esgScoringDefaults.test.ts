import { describe, expect, it } from "vitest";
import {
  ESG_GOLDEN_SG_CONSUMER,
  ESG_PILLAR_MAX,
  esgLtifrPoints,
  esgOverallPercent,
} from "../esgScoringDefaults";

/** Workbook v1.7 SG Consumer: E=36, S=33, G≈64.8529 → D9 ≈ 44.6176% */
describe("esgOverallPercent (D9 formula)", () => {
  it("averages pillar points divided by 100 (not ÷292, not 40/30/30)", () => {
    const pct = esgOverallPercent(
      ESG_GOLDEN_SG_CONSUMER.environmentalPoints,
      ESG_GOLDEN_SG_CONSUMER.socialPoints,
      ESG_GOLDEN_SG_CONSUMER.governancePoints,
    );
    expect(pct).toBeCloseTo(ESG_GOLDEN_SG_CONSUMER.overallPercent, 4);
    expect(ESG_PILLAR_MAX.environmental).toBe(108);
    expect(ESG_PILLAR_MAX.social).toBe(100);
    // Sum of G_Scorecard column B (25+5+5+10+5+8+5+5+5+8+5+4+5+5), and the
    // value the workbook hardcodes at ESG_Dashboard!C8.
    expect(ESG_PILLAR_MAX.governance).toBe(100);
  });
});

describe("esgLtifrPoints (S_Scorecard row 17)", () => {
  it("returns 0 when LTIFR is null, empty, or zero", () => {
    expect(esgLtifrPoints(null)).toBe(0);
    expect(esgLtifrPoints(undefined)).toBe(0);
    expect(esgLtifrPoints(0)).toBe(0);
  });

  it("returns max points when LTIFR ≤ threshold", () => {
    expect(esgLtifrPoints(1.5)).toBe(8);
    expect(esgLtifrPoints(2.0)).toBe(8);
  });
});
