import { describe, it, expect } from "vitest";
import {
  resolveNpatForTargets,
  extractPriorYearsFromMeta,
  marginPercent,
  isBelowIndustryNormQuarterThreshold,
} from "../npatDeemedCalculation";

// The Empower toolkit's deemed NPAT ('Financials'!C11:C17): base = MAX(average
// of current + up to 4 prior years, current); below revenue × norm/4 it becomes
// MAX(smallest qualifying margin × revenue, revenue × norm/4).
describe("resolveNpatForTargets — Empower toolkit rule", () => {
  const industryNorm = 8; // 8% industry norm → quarter = 2% of revenue

  it("uses actual NPAT when it reaches a quarter of the industry norm", () => {
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

  it("uses the average of the current and prior years when it is higher than the current NPAT", () => {
    // average (50k + 400k) / 2 = 225k ≥ 200k (2% of 10M) → the average stands.
    const result = resolveNpatForTargets({
      currentRevenue: 10_000_000,
      currentNpat: 50_000,
      industryNormPercent: industryNorm,
      priorYears: [{ yearLabel: "2024", revenue: 8_000_000, npat: 400_000 }],
    });
    expect(result.method).toBe("five-year-average");
    expect(result.effectiveNpat).toBeCloseTo(225_000);
  });

  it("averages at most the current year and four prior years", () => {
    const result = resolveNpatForTargets({
      currentRevenue: 10_000_000,
      currentNpat: 1_000_000,
      industryNormPercent: industryNorm,
      priorYears: [
        { revenue: 1, npat: 1_000_000 },
        { revenue: 1, npat: 1_000_000 },
        { revenue: 1, npat: 1_000_000 },
        { revenue: 1, npat: 1_000_000 },
        { revenue: 1, npat: 99_000_000 }, // year -5 is outside the toolkit's average
      ],
    });
    expect(result.effectiveNpat).toBe(1_000_000);
  });

  it("deems NPAT from the SMALLEST margin strictly above a quarter of the norm", () => {
    // base = MAX(avg(-1m, 400k, 180k) = -140k, -1m) = -140k < 200k.
    // Qualifying margins 5% and 3% → smallest 3% × 10M = 300k.
    const result = resolveNpatForTargets({
      currentRevenue: 10_000_000,
      currentNpat: -1_000_000,
      industryNormPercent: industryNorm,
      priorYears: [
        { yearLabel: "2024", revenue: 8_000_000, npat: 400_000 },
        { yearLabel: "2023", revenue: 6_000_000, npat: 180_000 },
      ],
    });
    expect(result.method).toBe("leibrandt");
    expect(result.effectiveNpat).toBeCloseTo(300_000);
    expect(result.qualifyingYearLabel).toBe("2023");
  });

  it("falls back to revenue × a quarter of the norm when no year qualifies", () => {
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
    expect(result.effectiveNpat).toBeCloseTo(200_000);
  });

  it("applies the same quarter-norm floor with no prior-year history, flagged for review", () => {
    const result = resolveNpatForTargets({
      currentRevenue: 10_000_000,
      currentNpat: 50_000,
      industryNormPercent: industryNorm,
      priorYears: [],
    });
    expect(result.method).toBe("industry-norm-deemed");
    expect(result.priorYearsMissing).toBe(true);
    expect(result.effectiveNpat).toBeCloseTo(200_000);
  });

  it("always honours a manual deemed NPAT, with or without prior years", () => {
    for (const priorYears of [[], [{ yearLabel: "2024", revenue: 1, npat: 1 }]]) {
      const result = resolveNpatForTargets({
        currentRevenue: 10_000_000,
        currentNpat: 50_000,
        industryNormPercent: industryNorm,
        priorYears,
        deemedNpatOverride: 900_000,
      });
      expect(result.method).toBe("override");
      expect(result.effectiveNpat).toBe(900_000);
    }
  });
});

// Transport has no toolkit; its verified certificates deem NPAT off the FULL
// industry norm (BE13609). That practice is kept behind fallbackBasis 'fullNorm'.
describe("resolveNpatForTargets — full-norm fallback (Transport)", () => {
  const industryNorm = 8;
  const fullNorm = { fallbackBasis: "fullNorm" as const };

  it("applies Leibrandt when current margin is low but a prior year qualifies", () => {
    const result = resolveNpatForTargets({
      currentRevenue: 10_000_000,
      currentNpat: 50_000,
      industryNormPercent: industryNorm,
      priorYears: [{ yearLabel: "2024", revenue: 8_000_000, npat: 400_000 }],
      ...fullNorm,
    });
    expect(result.method).toBe("leibrandt");
    expect(result.effectiveNpat).toBeCloseTo((400_000 / 8_000_000) * 10_000_000);
  });

  it("deems revenue × the full norm when nothing qualifies or there is no history", () => {
    const result = resolveNpatForTargets({
      currentRevenue: 10_000_000,
      currentNpat: 50_000,
      industryNormPercent: industryNorm,
      priorYears: [],
      ...fullNorm,
    });
    expect(result.method).toBe("industry-norm-deemed");
    expect(result.priorYearsMissing).toBe(true);
    expect(result.effectiveNpat).toBe(10_000_000 * (industryNorm / 100));
  });

  it("rejects a deemed override without prior-year rows", () => {
    const result = resolveNpatForTargets({
      currentRevenue: 10_000_000,
      currentNpat: 50_000,
      industryNormPercent: industryNorm,
      priorYears: [],
      deemedNpatOverride: 800_000,
      ...fullNorm,
    });
    expect(result.method).toBe("actual");
    expect(result.priorYearsMissing).toBe(true);
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

  it("keeps marginPercent as NPAT over revenue", () => {
    expect(marginPercent(400_000, 8_000_000)).toBe(5);
  });
});
