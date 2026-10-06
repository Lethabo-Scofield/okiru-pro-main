/**
 * Site × month figures from dashboard tables → the environmental grids.
 *
 * The rules a dashboard upload stands on: the measure picks the grid, the site
 * picks the company's OWN depot row, the month picks its OWN column; figures
 * for one cell add up within a document and must agree between documents.
 * Synthetic figures throughout.
 */
import { describe, expect, it } from "vitest";
import { mapEsgCalculatorToWorkbook, type EsgCalculatorRowLike } from "../esgParserToWorkbook";
import { esgDepotRowIndex } from "../esgParserFieldBridge";

const AXES = {
  depots: ["ALDER", "BKT", "DRN", "FENWICK", "GH"],
  months: ["Jul-25", "Aug-25", "Sep-25", "Oct-25", "Nov-25", "Dec-25", "Jan-26", "Feb-26", "Mar-26"],
};

function fact(measure: string, site: string | null, periodEnd: string, value: number, source = "Dashboard.xlsx › fuel"): EsgCalculatorRowLike {
  return {
    grid: "esg_monthly_rows",
    cells: {
      "monthly.measure": measure,
      ...(site === null ? {} : { "monthly.site": site }),
      "monthly.period_end": periodEnd,
      "monthly.value": value,
      "monthly.unit": "L",
    },
    sourceFiles: [source],
  };
}

const place = (rows: EsgCalculatorRowLike[]) => mapEsgCalculatorToWorkbook({ rows }, { axes: AXES });

describe("esgDepotRowIndex — a document's site name on the workbook's own axis", () => {
  it("matches the ways documents actually name a depot", () => {
    expect(esgDepotRowIndex("ALDER", AXES)).toBe(0);
    expect(esgDepotRowIndex("ACME CONSUMER - ALDERWOOD", AXES)).toBe(0);
    expect(esgDepotRowIndex("Acme Consumer - Brook Town", AXES)).toBe(1);
    expect(esgDepotRowIndex("ACME CONSUMER - DARWIN", AXES)).toBe(2);
    expect(esgDepotRowIndex("ACME CONSUMER - FENWICK", AXES)).toBe(3);
    expect(esgDepotRowIndex("ACME CONSUMER - GREEN HARBOUR", AXES)).toBe(4);
    expect(esgDepotRowIndex("DRN WAREHOUSE", AXES)).toBe(2);
  });

  it("names nothing it cannot name uniquely — a guess credits one depot with another's use", () => {
    expect(esgDepotRowIndex("ACME CONSUMER - HOLLOWAY", AXES)).toBeNull();
    expect(esgDepotRowIndex("", AXES)).toBeNull();
    // "GH" must not match a word that merely starts with G and H.
    expect(esgDepotRowIndex("GHENTFIELD", AXES)).toBeNull();
    // Two depots in one label is two candidates.
    expect(esgDepotRowIndex("ALDER / DRN shared yard", AXES)).toBeNull();
  });

  it("works the other way round, for a workbook that spells its sites out", () => {
    const spelled = { ...AXES, depots: ["Alderwood", "Brook Town", "Darwin"] };
    expect(esgDepotRowIndex("BKT", spelled)).toBe(1);
    expect(esgDepotRowIndex("DRN", spelled)).toBe(2);
    expect(esgDepotRowIndex("ALDER", spelled)).toBe(0);
  });
});

describe("monthly figures → grids", () => {
  it("files each figure by measure, depot and month", () => {
    const { patches, outcomes } = place([
      fact("fleet.diesel_litres", "ACME CONSUMER - ALDERWOOD", "2025-07-31", 18250.4),
      fact("fleet.diesel_litres", "ACME CONSUMER - BROOK TOWN", "2026-03-31", 6105),
      fact("energy.electricity_kwh", "ACME CONSUMER - DARWIN", "2025-08-31", 81230),
      fact("water.kl", "ACME CONSUMER - FENWICK", "2025-09-30", 263),
    ]);
    expect(patches["e-data"].cells).toEqual({
      s1a_C14: 18250.4,
      s1a_K15: 6105,
      s2_D16: 81230,
      water_E17: 263,
    });
    expect(outcomes.esg_monthly_rows.status).toBe("placed");
  });

  it("puts one-row blocks (LPG, business cars) on their only row, company-wide lines included", () => {
    const { patches } = place([
      fact("energy.lpg_kg", "DRN WAREHOUSE", "2025-08-31", 615),
      fact("fleet.business_car_petrol_litres", null, "2025-07-31", 152.36),
    ]);
    expect(patches["e-data"].cells).toEqual({ s1c_D14: 615, s1d_C14: 152.36 });
  });

  it("adds up two lines for the same depot and month within one document", () => {
    const { patches } = place([
      fact("energy.electricity_kwh", "ACME CONSUMER - GREEN HARBOUR", "2025-07-31", 10000, "Bills.xlsx › meters"),
      fact("energy.electricity_kwh", "GH", "2025-07-31", 2050, "Bills.xlsx › meters"),
    ]);
    expect(patches["e-data"].cells.s2_C18).toBe(12050);
  });

  it("lets two documents that agree fill a cell once, and turns a disagreement into a conflict", () => {
    const agreed = place([
      fact("fleet.diesel_litres", "ACME CONSUMER - ALDERWOOD", "2026-03-31", 6140, "Dashboard.xlsx › fuel"),
      fact("fleet.diesel_litres", "Alderwood", "2026-03-31", 6140, "DIESEL LOG.xlsx › Daily Summary"),
    ]);
    expect(agreed.patches["e-data"].cells.s1a_K14).toBe(6140);
    expect(agreed.conflicts).toHaveLength(0);

    const disputed = place([
      fact("fleet.diesel_litres", "ACME CONSUMER - ALDERWOOD", "2026-03-31", 6140, "Dashboard.xlsx › fuel"),
      fact("fleet.diesel_litres", "ALDER", "2026-03-31", 6702, "Other.xlsx › fuel"),
    ]);
    expect(disputed.patches["e-data"]?.cells.s1a_K14).toBeUndefined();
    expect(disputed.conflicts.map((c) => c.cellRef)).toContain("s1a_K14");
  });

  it("reports diesel issued to outside vehicles without gridding it, and holds back the same litres booked as generator fuel", () => {
    const { patches, outcomes } = place([
      // The depot's fuel report: 640 L into a truck outside the fleet.
      fact("fleet.external_diesel_issued_litres", "Alderwood", "2026-03-31", 640, "DIESEL LOG.xlsx › External Issues"),
      // The dashboard books exactly those litres as generator fuel.
      fact("energy.generator_diesel_litres", "ACME CONSUMER - ALDERWOOD", "2026-03-31", 640, "Dashboard.xlsx › fuel"),
      // A real generator figure elsewhere still lands.
      fact("energy.generator_diesel_litres", "ACME CONSUMER - ALDERWOOD", "2025-07-31", 685, "Dashboard.xlsx › fuel"),
    ]);
    expect(patches["e-data"].cells).toEqual({ s1b_C14: 685 });
    const reason = outcomes.esg_monthly_rows.reason ?? "";
    expect(reason).toMatch(/640 L of diesel was issued to vehicles outside the fleet/);
    expect(reason).toMatch(/road diesel, not generator fuel/);
  });

  it("treats one external issue stated by two documents as one — never 1,280 L", () => {
    const { patches, outcomes } = place([
      fact("fleet.external_diesel_issued_litres", "Acme Group Alderwood", "2026-03-31", 640, "DIESEL LOG.xlsx › External Issues"),
      fact("fleet.external_diesel_issued_litres", "Alderwood", "2026-03-31", 640, "ext-detail.xlsx › ext"),
      fact("energy.generator_diesel_litres", "ACME CONSUMER - ALDERWOOD", "2026-03-31", 640, "Dashboard.xlsx › fuel"),
    ]);
    expect(patches["e-data"]).toBeUndefined();
    const reason = outcomes.esg_monthly_rows.reason ?? "";
    expect(reason.match(/issued to vehicles outside the fleet\. It is not written/g)).toHaveLength(1);
    expect(reason).toMatch(/road diesel, not generator fuel/);
  });

  it("never files a company-wide line on a depot row, nor a month outside the reporting year", () => {
    const { patches, outcomes } = place([
      fact("energy.electricity_kwh", null, "2025-07-31", 3),
      fact("fleet.diesel_litres", "ACME CONSUMER - ALDERWOOD", "2024-07-31", 17000),
      fact("fleet.diesel_litres", "ACME CONSUMER - HOLLOWAY", "2025-07-31", 900),
      fact("fleet.distance_km", "ACME CONSUMER - ALDERWOOD", "2025-07-31", 68420),
    ]);
    expect(patches["e-data"]).toBeUndefined();
    const reason = outcomes.esg_monthly_rows.reason ?? "";
    expect(outcomes.esg_monthly_rows.status).toBe("unplaced");
    expect(reason).toMatch(/HOLLOWAY/);
    expect(reason).toMatch(/2024-07/);
    expect(reason).toMatch(/company-wide/);
    expect(reason).toMatch(/fleet\.distance_km/);
  });
});
