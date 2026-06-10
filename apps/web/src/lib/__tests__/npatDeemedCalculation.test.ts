import { describe, it, expect } from "vitest";
import {
  resolveNpatForTargets,
  extractPriorYearsFromMeta,
  marginPercent,
  isBelowIndustryNormQuarterThreshold,
} from "../npatDeemedCalculation";

describe("resolveNpatForTargets", () => {
  const industryNorm = 8; // 8% industry norm → 25% threshold = 2%

  it("uses actual NPAT when margin meets 25% of industry norm", () => {
    const result = resolveNpatForTargets({
      currentRevenue: 10_000_000,
      currentNpat: 500_000,
      industryNormPercent: industryNorm,
      priorYears: [],
    });
    expect(result.method).toBe("actual");
    expect(result.deemedNpatUsed).toBe(false);
    expect(result.effectiveNpat).toBe(500_000);
  });

  it("applies Leibrandt when current margin is low but a prior year qualifies", () => {
    const result = resolveNpatForTargets({
      currentRevenue: 10_000_000,
      currentNpat: 50_000,
      industryNormPercent: industryNorm,
      priorYears: [{ yearLabel: "2024", revenue: 8_000_000, npat: 400_000 }],
    });
    expect(result.method).toBe("leibrandt");
    expect(result.deemedNpatUsed).toBe(true);
    expect(marginPercent(400_000, 8_000_000)).toBeGreaterThanOrEqual(industryNorm / 4);
    expect(result.effectiveNpat).toBeCloseTo((400_000 / 8_000_000) * 10_000_000);
  });

  it("uses industry norm deemed when no qualifying year in 5-year history", () => {
    const result = resolveNpatForTargets({
      currentRevenue: 10_000_000,
      currentNpat: 50_000,
      industryNormPercent: industryNorm,
      priorYears: [
        { yearLabel: "2024", revenue: 8_000_000, npat: 80_000 },
        { yearLabel: "2023", revenue: 7_000_000, npat: 70_000 },
      ],
    });
    expect(result.method).toBe("industry-norm-deemed");
    expect(result.effectiveNpat).toBe(10_000_000 * (industryNorm / 100));
  });

  it("does not apply deemed NPAT without prior-year history", () => {
    const result = resolveNpatForTargets({
      currentRevenue: 10_000_000,
      currentNpat: 50_000,
      industryNormPercent: industryNorm,
      priorYears: [],
    });
    expect(result.method).toBe("actual");
    expect(result.priorYearsMissing).toBe(true);
    expect(result.effectiveNpat).toBe(50_000);
  });

  it("rejects deemed override without prior-year rows", () => {
    const result = resolveNpatForTargets({
      currentRevenue: 10_000_000,
      currentNpat: 50_000,
      industryNormPercent: industryNorm,
      priorYears: [],
      deemedNpatOverride: 800_000,
    });
    expect(result.method).toBe("actual");
    expect(result.priorYearsMissing).toBe(true);
  });

  it("accepts deemed override when prior years exist", () => {
    const result = resolveNpatForTargets({
      currentRevenue: 10_000_000,
      currentNpat: 50_000,
      industryNormPercent: industryNorm,
      priorYears: [{ yearLabel: "2024", revenue: 1, npat: 1 }],
      deemedNpatOverride: 900_000,
    });
    expect(result.method).toBe("override");
    expect(result.effectiveNpat).toBe(900_000);
  });
});

describe("isBelowIndustryNormQuarterThreshold", () => {
  it("is false when margin meets 25% of norm", () => {
    expect(isBelowIndustryNormQuarterThreshold(10_000_000, 500_000, 8)).toBe(false);
  });

  it("is true when margin is below 25% of norm", () => {
    expect(isBelowIndustryNormQuarterThreshold(10_000_000, 50_000, 8)).toBe(true);
  });
});

describe("extractPriorYearsFromMeta", () => {
  it("reads up to 5 prior year fields from financial meta", () => {
    const years = extractPriorYearsFromMeta({
      priorYear1Revenue: 5_000_000,
      priorYear1Npat: 250_000,
      priorYear2Revenue: 4_000_000,
      priorYear2Npat: 200_000,
    });
    expect(years).toHaveLength(2);
    expect(years[0].revenue).toBe(5_000_000);
  });
});
