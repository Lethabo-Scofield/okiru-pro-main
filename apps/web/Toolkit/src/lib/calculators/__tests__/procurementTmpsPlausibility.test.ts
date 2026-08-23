/**
 * An impossible TMPS scores nothing, and says why.
 *
 * Thandanani, live: tmps = 23 — the supplier schedule's ROW COUNT, not a Rand
 * amount — beside 45 suppliers summing to R3.17m. Every target line divided by
 * 23, ran ~138,000x over target, and clamped to full marks: a whole pillar
 * minted by a misplaced denominator, then handed to the elective as the "best"
 * element. The invariant is arithmetic, not a heuristic: a total can never be
 * smaller than one of its own parts.
 */
import { describe, expect, it } from "vitest";
import { calculateProcurementScore } from "../procurement";

function supplier(name: string, spend: number) {
  return {
    name,
    spend,
    beeLevel: 1,
    blackOwnership: 0,
    blackWomenOwnership: 0,
    enterpriseType: "generic",
  } as never;
}

const THANDANANI_LIKE = {
  suppliers: [supplier("BP Edenvale", 412_797.4), supplier("Engen", 250_000)],
  tmps: 23,
} as never;

describe("TMPS plausibility", () => {
  it("scores 0 off a TMPS smaller than a single supplier, and flags it", () => {
    const result = calculateProcurementScore(THANDANANI_LIKE);
    expect(result.total).toBe(0);
    expect(result.dataFlags).toHaveLength(1);
    expect(result.dataFlags[0]).toContain("R23");
    expect(result.dataFlags[0]).toContain("scores 0");
  });

  it("scores normally when TMPS can contain its schedule", () => {
    const result = calculateProcurementScore({
      suppliers: [supplier("BP Edenvale", 412_797.4)],
      tmps: 5_000_000,
    } as never);
    expect(result.dataFlags).toEqual([]);
    expect(result.total).toBeGreaterThan(0);
  });

  it("does not flag a merely missing TMPS — that is a gap, not a misplacement", () => {
    const result = calculateProcurementScore({
      suppliers: [supplier("BP Edenvale", 412_797.4)],
      tmps: 0,
    } as never);
    expect(result.dataFlags).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("does not flag when there are no suppliers to compare against", () => {
    const result = calculateProcurementScore({ suppliers: [], tmps: 23 } as never);
    expect(result.dataFlags).toEqual([]);
  });
});
