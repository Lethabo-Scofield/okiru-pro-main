/**
 * The dashboard's headline tiles say what their labels say: Scope 1 and 2 in
 * tonnes (not litres and kilowatt-hours), waste diversion as a percentage
 * (not "0.911%"), the LTIFR per million hours.
 */
import { describe, expect, it } from "vitest";
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { computeEsgDashboard } from "../dashboard";
import { computeGhgInventory } from "../ghgInventory";

const workbook = {
  sections: {
    "e-data": { cells: { s1a_C14: 10_000, s1a_D15: 5_000, s2_C14: 100_000 } },
    waste: { cells: { B16: 0.911 } },
    "s-data": { cells: { C27: 500_000, D27: 500_000, C29: 1, D29: 1 } },
  },
} as unknown as EsgWorkbookData;

const tile = (id: string) => computeEsgDashboard(workbook).kpis.find((k) => k.id === id)!;

describe("dashboard tiles", () => {
  it("state Scope 1 and Scope 2 in tonnes, from the inventory", () => {
    const ghg = computeGhgInventory(workbook);
    const dash = computeEsgDashboard(workbook);
    expect(dash.scope1Tco2e).toBeCloseTo(ghg.scope1, 6);
    expect(dash.scope2Tco2e).toBeCloseTo(ghg.scope2, 6);
    // 15,000 litres of diesel is ~40 tonnes — never "15 000 tCO₂e".
    expect(dash.scope1Tco2e!).toBeLessThan(100);
    expect(tile("scope1").value).not.toBe("15 000");
  });

  it("shows waste diversion as a percentage", () => {
    expect(tile("waste").value).toBe("91.1%");
  });

  it("shows the LTIFR the derive layer computes, per million hours", () => {
    // 2 lost-time injuries over 1,000,000 hours → 2.
    expect(computeEsgDashboard(workbook).ltifr).toBeCloseTo(2, 6);
    expect(tile("ltifr").value).toBe("2");
  });

  it("asks for a baseline rather than inventing a net-zero gap", () => {
    expect(tile("nz-gap").value).toBe("—");
    expect(tile("nz-gap").sub).toMatch(/Set a baseline/);
  });
});

/** E2/E3 — each headline opens onto how it was made, and the parts add up to the tile. */
describe("each headline carries its calculation", () => {
  const dash = computeEsgDashboard(workbook);

  it("gives every tile a rule in words", () => {
    for (const k of dash.kpis) {
      expect(k.calc, k.id).toBeTruthy();
      expect(k.calc!.rule.length, k.id).toBeGreaterThan(20);
    }
  });

  it("lists Scope 1 fuel by fuel, and the lines add up to the tile", () => {
    const calc = tile("scope1").calc!;
    expect(calc.rule).toMatch(/quantity .* emission factor/);
    const sum = calc.inputs.reduce((a, i) => a + Number(i.value), 0);
    expect(sum).toBeCloseTo(dash.scope1Tco2e!, 1);
    // Each line says what was multiplied by what.
    expect(calc.inputs[0]!.label).toMatch(/×/);
  });

  it("shows the LTIFR's injuries and hours, not just the rate", () => {
    const values = Object.fromEntries(tile("ltifr").calc!.inputs.map((i) => [i.ref, i.value]));
    expect(values["S_Data!C29:F29"]).toBe(2);
    expect(values["S_Data!C27:F27"]).toBe(1_000_000);
    expect(values["S_Data!G35"]).toBeCloseTo(2, 6);
  });

  it("explains the overall score pillar by pillar", () => {
    const calc = tile("overall").calc!;
    expect(calc.rule).toMatch(/average of the three pillars/);
    expect(calc.inputs.map((i) => i.ref)).toEqual(["Environmental", "Social", "Governance"]);
  });

  it("says why there is no carbon tax figure when the screen is unanswered", () => {
    expect(tile("carbon-tax").calc!.rule).toMatch(/activity, not by emissions/);
  });
});
