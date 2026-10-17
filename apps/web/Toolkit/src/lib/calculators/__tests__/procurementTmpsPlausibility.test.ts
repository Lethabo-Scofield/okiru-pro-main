/**
 * An impossible TMPS scores nothing, and says why.
 *
 * A real client pack, live: tmps = 23 — not a Rand amount but SheetJS's error code for
 * a #REF! cell (long mistaken for the supplier schedule's row count) — beside
 * 45 suppliers summing to R3.17m. Every target line divided by
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

const SCHEDULE_TOTAL = 412_797.4 + 250_000;

describe("TMPS plausibility", () => {
  it("cannot mint points off a TMPS smaller than a single supplier: the listing is the denominator, and it is flagged", () => {
    // The toolkit divides by MAX(TMPS, supplier listing), so the misplaced 23
    // never reaches the denominator — the pack scores exactly as it would
    // against its own schedule, not 138,000x over target.
    const result = calculateProcurementScore(THANDANANI_LIKE);
    const againstSchedule = calculateProcurementScore({
      suppliers: [supplier("BP Edenvale", 412_797.4), supplier("Engen", 250_000)],
      tmps: SCHEDULE_TOTAL,
    } as never);
    expect(result.denominator).toBeCloseTo(SCHEDULE_TOTAL, 2);
    expect(result.total).toBe(againstSchedule.total);
    expect(result.dataFlags).toHaveLength(1);
    expect(result.dataFlags[0]).toContain("R23");
    expect(result.dataFlags[0]).toContain("supplier listing");
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
    // Measured against the listing instead, and said so in the coverage notes.
    expect(result.denominator).toBeCloseTo(412_797.4, 2);
    expect(result.coverageNotes?.join(" ")).toContain("not set");
  });

  it("does not flag when there are no suppliers to compare against", () => {
    const result = calculateProcurementScore({ suppliers: [], tmps: 23 } as never);
    expect(result.dataFlags).toEqual([]);
  });
});
