/**
 * The Scope 1 + 2 figure states its factor basis beside itself.
 *
 * The grid factor every company without its own gets (the reference workbook's
 * 0.82 kgCO₂e/kWh, cited "Eskom NERSA 2024") was applied silently: a client
 * system using another factor states a different total on identical activity,
 * and nothing said why. The figure is NOT changed here — it carries where each
 * factor comes from and whether an ESG expert has signed it off for the year.
 * Every value is invented.
 */
import { describe, expect, it } from "vitest";
import { computeGhgInventory } from "../ghgInventory";
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";

function workbook(cells: Record<string, unknown>): EsgWorkbookData {
  return {
    companyId: "C-ACME",
    ownerUserId: "u",
    ownerOrganizationId: null,
    updatedAt: "",
    sections: {
      "company-reporting-setup": { cells: { sector: "FMCG / Distribution", entity: "Acme Consumer" } },
      "e-data": { cells },
      assumptions: { cells: { B111: 6 } },
    },
  } as EsgWorkbookData;
}

describe("the factor basis beside Scope 1 + 2", () => {
  const ghg = computeGhgInventory(workbook({ L19: 12_345.67, L46: 100_000 }));

  it("leaves the figure as it was: 100 000 kWh at the base grid factor", () => {
    expect(ghg.scope2).toBeCloseTo(82, 6);
  });

  it("names every factor the figure uses, its value, unit and citation", () => {
    const grid = ghg.factorBasis.sources.find((s) => s.factor === "electricityScope2");
    expect(grid).toMatchObject({ value: 0.82, unit: "kgCO₂e/kWh", signedOff: false });
    expect(grid?.source).toMatch(/not yet reconciled with DFFE/);
    expect(ghg.factorBasis.sources.map((s) => s.factor)).toEqual(
      expect.arrayContaining(["dieselScope1", "petrolBusinessCars", "lpg", "electricityScope2"]),
    );
    // No solar activity: no solar factor in the basis.
    expect(ghg.factorBasis.sources.some((s) => s.factor === "solarOnsite")).toBe(false);
  });

  it("says plainly that no factor is signed off yet, and what that means", () => {
    expect(ghg.factorBasis.signedOff).toBe(false);
    expect(ghg.factorBasis.statement).toMatch(/^Factor basis: grid electricity 0\.82 kgCO₂e\/kWh/);
    expect(ghg.factorBasis.statement).toMatch(/Not yet signed off by an ESG expert/);
    expect(ghg.factorBasis.statement).toMatch(/other factors will state a different total on the same activity/);
  });
});
