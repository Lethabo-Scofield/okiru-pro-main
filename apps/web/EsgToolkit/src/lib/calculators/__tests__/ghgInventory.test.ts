/**
 * The GHG inventory must report tonnes, not the workbook's mixed-unit sum.
 *
 * `E_Data!L75:L82` is labelled tCO₂e and holds raw ACTIVITY — litres, kWh,
 * kilolitres — because the source workbook's summary block copies the activity
 * rows and adds them up. `esgDeriveSummary` reproduces that faithfully for
 * regression parity, so anything reading those cells as emissions (Carbon Tax,
 * Net Zero) inherits a figure ~1000x too large. This calculator does the real
 * arithmetic from the same monthly grids instead, and these tests pin the
 * difference using the actual SG Consumer figures.
 */
import { describe, expect, it } from "vitest";
import { computeGhgInventory } from "../ghgInventory";
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";

/** SG Consumer FY 2025/26 year-to-date activity (Jul-25 → Mar-26). */
const SG_ACTIVITY = {
  fleetDieselLitres: 589_465.53,
  generatorDieselLitres: 2_181.14,
  lpgKg: 2_280,
  petrolLitres: 1_053.82,
  electricityKwh: 2_589_578.44,
  waterKl: 4_356.41,
};

function workbook(cells: Record<string, unknown>, sector = "FMCG / Distribution"): EsgWorkbookData {
  return {
    companyId: "C-TEST",
    ownerUserId: "u",
    ownerOrganizationId: null,
    updatedAt: new Date().toISOString(),
    sections: {
      "company-reporting-setup": { cells: { sector, entity: "SG Consumer" } },
      "e-data": { cells },
      assumptions: { cells: { B111: 9 } },
    },
  } as EsgWorkbookData;
}

/** The totals rows, as an imported workbook carries them. */
const SG_TOTALS = workbook({
  L19: SG_ACTIVITY.fleetDieselLitres,
  L28: SG_ACTIVITY.generatorDieselLitres,
  L32: SG_ACTIVITY.lpgKg,
  L37: SG_ACTIVITY.petrolLitres,
  L46: SG_ACTIVITY.electricityKwh,
  L63: SG_ACTIVITY.waterKl,
});

describe("computeGhgInventory", () => {
  it("reports SG Consumer's real Scope 1 + 2 in tonnes", () => {
    const ghg = computeGhgInventory(SG_TOTALS);
    // 589,465.53 L × 2.68 / 1000 = 1,579.77  (+ generator, LPG, petrol)
    expect(ghg.scope1).toBeCloseTo(1_591.49, 1);
    // 2,589,578.44 kWh × 0.82 / 1000 = 2,123.45
    expect(ghg.scope2).toBeCloseTo(2_123.45, 1);
    expect(ghg.scope1And2).toBeCloseTo(3_714.94, 1);
  });

  it("does NOT inherit the workbook's mixed-unit summary total", () => {
    const ghg = computeGhgInventory(SG_TOTALS);
    // The workbook's own L84 "total" is ~3,188,915 — litres + kWh + kL added up.
    expect(ghg.total).toBeLessThan(10_000);
    expect(ghg.total).toBeGreaterThan(3_000);
  });

  it("keeps Scope 3 to the water it actually measures", () => {
    const ghg = computeGhgInventory(SG_TOTALS);
    expect(ghg.scope3).toBeCloseTo(1.5, 1);
    expect(ghg.lines.find((l) => l.scope === 3)?.label).toContain("partial");
  });

  it("reads the monthly grid when it is present, in preference to the totals row", () => {
    const monthly = workbook({
      s1a_C14: 100_000, s1a_D14: 100_000,
      L19: 999_999, // stale totals row must lose to real monthly data
    });
    const ghg = computeGhgInventory(monthly);
    expect(ghg.scope1).toBeCloseTo((200_000 * 2.68) / 1000, 2);
  });

  it("credits solar at the avoided difference, never the full grid factor", () => {
    const withSolar = computeGhgInventory(workbook({
      L46: 1_000_000,
      solar_C50: 100_000,
    }));
    const withoutSolar = computeGhgInventory(workbook({ L46: 1_000_000 }));
    // 100,000 kWh × (0.82 − 0.025) / 1000 = 79.5 avoided — not 82.
    expect(withoutSolar.scope2 - withSolar.scope2).toBeCloseTo(79.5, 1);
  });

  it("says it has no data rather than reporting a confident zero", () => {
    const empty = computeGhgInventory(workbook({}));
    expect(empty.hasData).toBe(false);
    expect(empty.scope1And2).toBe(0);
  });

  it("carries the months of coverage so a YTD figure is never read as a full year", () => {
    expect(computeGhgInventory(SG_TOTALS).dataMonths).toBe(9);
  });
});
