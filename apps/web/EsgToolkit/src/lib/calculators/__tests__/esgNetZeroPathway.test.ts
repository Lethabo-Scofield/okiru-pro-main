/**
 * "SBTi is clear that companies must determine their own baseline year, own
 * target year, and the reduction pathway, and then measure against that."
 * — Z. Mnanzana, Q21, 14 September 2026.
 *
 * The toolkit held every company to one fixed calendar ladder lifted from the
 * pilot client's workbook — 5% by 2026, 20% by 2028, 50% by 2030, 90% by 2045.
 * A company with a 2019 baseline got no credit for reductions already made, and
 * a company targeting 2040 was measured against a 2050 curve.
 */
import { describe, expect, it } from "vitest";
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { companyReductionAt, computeNetZeroRoadmap, netZeroReductionAt } from "../netZero";

function wb(sections: Record<string, Record<string, unknown>>): EsgWorkbookData {
  const out: EsgWorkbookData["sections"] = {};
  for (const [id, cells] of Object.entries(sections)) {
    out[id] = { cells: cells as EsgWorkbookData["sections"][string]["cells"] };
  }
  return { companyId: "t", sections: out, updatedAt: "2026-09-16T00:00:00.000Z" };
}

describe("the company's own pathway", () => {
  it("runs linearly from its base year to its target year", () => {
    // 2020 base, 2050 target, 90% terminal: half way is 2035 at 45%.
    expect(companyReductionAt(2020, 2020, 2050, 0.9)).toBe(0);
    expect(companyReductionAt(2035, 2020, 2050, 0.9)).toBeCloseTo(0.45, 9);
    expect(companyReductionAt(2050, 2020, 2050, 0.9)).toBeCloseTo(0.9, 9);
  });

  it("credits a company that started earlier, instead of restarting the clock", () => {
    // Two companies, same target year, different base years. By 2030 the one
    // that started in 2019 is expected to be further along than the 2025 one.
    const early = companyReductionAt(2030, 2019, 2050, 0.9)!;
    const late = companyReductionAt(2030, 2025, 2050, 0.9)!;
    expect(early).toBeGreaterThan(late);
  });

  it("holds a company with a nearer target to a steeper curve", () => {
    const near = companyReductionAt(2030, 2020, 2040, 0.9)!;
    const far = companyReductionAt(2030, 2020, 2050, 0.9)!;
    expect(near).toBeGreaterThan(far);
  });

  it("clamps outside the span rather than extrapolating", () => {
    expect(companyReductionAt(2010, 2020, 2050, 0.9)).toBe(0);
    expect(companyReductionAt(2060, 2020, 2050, 0.9)).toBeCloseTo(0.9, 9);
  });

  it("refuses to invent a pathway where the years do not make one", () => {
    expect(companyReductionAt(2030, 2050, 2020, 0.9)).toBeNull(); // target before base
    expect(companyReductionAt(2030, 2020, 2020, 0.9)).toBeNull(); // same year
    expect(companyReductionAt(2030, Number.NaN, 2050, 0.9)).toBeNull();
  });
});

describe("the roadmap", () => {
  const emissions = { "e-data": { B90: 1000, s1b_C23: 1000 } };

  it("uses the company's own span when it has declared both years", () => {
    const r = computeNetZeroRoadmap(
      wb({ ...emissions, assumptions: { B107: 2050, _nzBaselineYear: 2020 } }),
    );
    expect(r.pathwayIsOwn).toBe(true);
    expect(r.baselineYear).toBe(2020);
  });

  it("says so when it has to fall back to the source client's calendar ladder", () => {
    // No base year declared. The milestones still render — but the caller is
    // told they are not this company's pathway, so nothing is passed off as
    // a schedule the company chose.
    const r = computeNetZeroRoadmap(wb({ ...emissions, assumptions: { B107: 2050 } }));
    expect(r.pathwayIsOwn).toBe(false);
    expect(r.baselineYear).toBe(0);
  });

  it("does not treat the pathway as the company's own without a target year", () => {
    const r = computeNetZeroRoadmap(wb({ ...emissions, assumptions: { _nzBaselineYear: 2020 } }));
    expect(r.pathwayIsOwn).toBe(false);
  });

  it("keeps the fixed ladder available for parity, and only for parity", () => {
    // The ladder is one client's schedule; it is retained so the original
    // workbook stays reproducible, never as a default for anyone else.
    expect(netZeroReductionAt(2028)).toBeCloseTo(0.2, 9);
    const parity = computeNetZeroRoadmap(
      wb({ ...emissions, assumptions: { B107: 2050, _nzBaselineYear: 2020 } }),
      { mode: "workbook-parity" },
    );
    expect(parity.pathwayIsOwn).toBe(false);
  });
});
