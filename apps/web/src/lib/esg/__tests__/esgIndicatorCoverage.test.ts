/**
 * The score behind the number: every indicator's points, status and what it
 * still needs — "missing" only when the scorer had nothing to work with.
 */
import { describe, expect, it } from "vitest";
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { computeEsgIndicatorCoverage } from "../esgIndicatorCoverage";
import { ESG_DEFAULT_DEPOTS } from "@/components/esg-workbook/esgDefaults";
import { SCORECARD_INDICATORS, esgIndicatorLabel } from "../esgScorecardDefinitions";

const wb = (sections: Record<string, Record<string, unknown>>): EsgWorkbookData =>
  ({ sections: Object.fromEntries(Object.entries(sections).map(([k, cells]) => [k, { cells }])) }) as unknown as EsgWorkbookData;

/**
 * A company that has set its own environmental targets. Without a declared
 * basis the target-based E indicators leave the total (D5), and these tests are
 * about what happens once a target exists.
 */
const OWN_TARGETS = { _targetBasis: "Company's own targets", B43: 0.1, B44: 0.2 };

const find = (result: ReturnType<typeof computeEsgIndicatorCoverage>, pillar: string, key: string) =>
  result.pillars.find((p) => p.pillar === pillar)!.indicators.find((x) => x.key === key)!;

describe("computeEsgIndicatorCoverage", () => {
  it("covers every scorecard indicator, each with a plain-English meaning", () => {
    const result = computeEsgIndicatorCoverage(wb({}));
    for (const pillar of ["environmental", "social", "governance"] as const) {
      const keys = result.pillars.find((p) => p.pillar === pillar)!.indicators.map((x) => x.key);
      expect(keys).toEqual(SCORECARD_INDICATORS[pillar].map((d) => d.key));
      for (const x of result.pillars.find((p) => p.pillar === pillar)!.indicators) {
        expect(x.meaning, `${pillar} ${x.key}`).not.toBe("");
      }
    }
  });

  it("on an empty workbook, says what each indicator is waiting for", () => {
    const result = computeEsgIndicatorCoverage(wb({}));
    expect(result.counts.full).toBe(0);
    expect(find(result, "environmental", "d5")).toMatchObject({
      status: "missing",
      missing: ["Monthly fleet diesel (litres), Scope 1A"],
      topic: { id: "e-ghg" },
    });
    expect(find(result, "governance", "d25").missing).toEqual([
      "Material regulatory penalties in the period (enter 0 for none)",
    ]);
    expect(result.pointsAwaitingData).toBeGreaterThan(0);
  });

  it("tells a final exclusion from one the company can resolve", () => {
    const result = computeEsgIndicatorCoverage(wb({}));
    const grant = find(result, "social", "d15");
    expect(grant.status).toBe("excluded");
    expect(grant.excludedFixable).toBe(false);
    const blackEmployees = find(result, "social", "d5");
    expect(blackEmployees.status).toBe("excluded");
    expect(blackEmployees.excludedFixable).toBe(true);
  });

  it("moves an indicator from missing to scored as its inputs arrive", () => {
    const fuel = computeEsgIndicatorCoverage(wb({ "e-data": { s1a_C14: 1_000 }, assumptions: OWN_TARGETS }));
    expect(find(fuel, "environmental", "d5")).toMatchObject({ status: "full", points: 5, missing: [] });
    // A baseline is still needed for the reduction indicator.
    expect(find(fuel, "environmental", "d6")).toMatchObject({ status: "missing", missing: ["A Scope 1 + 2 baseline in tCO₂e"] });

    const answered = computeEsgIndicatorCoverage(wb({ "g-data": { B25: 0 } }));
    expect(find(answered, "governance", "d25")).toMatchObject({ status: "full", points: 5 });
  });

  it("shows every indicator in generic words — no client's depots, systems or fixed targets", () => {
    for (const pillar of ["environmental", "social", "governance"] as const) {
      for (const def of SCORECARD_INDICATORS[pillar]) {
        const label = esgIndicatorLabel(pillar, def.key);
        expect(label, `${pillar} ${def.key}`).not.toMatch(/Cority|IMS-T|depots|≥|≤|\d+\s?%|\d+ hours|2\.0/);
      }
    }
    // The explanations and the "needed" lines are read by every client too.
    for (const x of computeEsgIndicatorCoverage(wb({})).pillars.flatMap((p) => p.indicators)) {
      const shown = [x.meaning, ...x.missing, ...x.optional, x.excludedReason ?? ""].join(" | ");
      expect(shown, `${x.pillar} ${x.key}`).not.toMatch(/Cority|IMS-T/);
      // Nor a site of the workbook the fallback axes were taken from.
      for (const site of ESG_DEFAULT_DEPOTS) expect(shown, `${x.pillar} ${x.key}`).not.toMatch(new RegExp(`\\b${site}\\b`));
    }
  });

  it("calls a zero on present data a result, not a gap", () => {
    // Grid electricity recorded, no solar: the renewable share is a real zero.
    const result = computeEsgIndicatorCoverage(wb({ "e-data": { s2_C14: 100_000 }, assumptions: OWN_TARGETS }));
    const solarShare = find(result, "environmental", "d13");
    expect(solarShare.status).toBe("zero");
    expect(solarShare.missing).toEqual([]);
    expect(solarShare.optional[0]).toMatch(/solar generation/);
  });
});
