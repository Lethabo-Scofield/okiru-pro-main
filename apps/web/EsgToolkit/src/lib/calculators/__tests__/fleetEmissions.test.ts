/**
 * Fleet emissions by vehicle: fuel where the litres are recorded, distance ×
 * size where only the kilometres are, and a plain list of what is missing —
 * never a guess.
 */
import { describe, expect, it } from "vitest";
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { computeFleetEmissions, fleetSizeClass } from "../fleetEmissions";

const workbook = (rows: Array<Record<string, unknown>>): EsgWorkbookData =>
  ({ sections: { fleet: { cells: { _rows: rows } } } }) as unknown as EsgWorkbookData;

describe("fleetSizeClass — the licence class by GVM", () => {
  it("classes by GVM, and by an unmistakable body type when there is none", () => {
    expect(fleetSizeClass(3_500, "")).toBe("light");
    expect(fleetSizeClass(16_000, "HINO 500 1627")).toBe("medium");
    expect(fleetSizeClass(26_000, "HINO 500 1627")).toBe("heavy");
    expect(fleetSizeClass(null, "Toyota Hilux 2.4 GD-6 bakkie")).toBe("light");
    expect(fleetSizeClass(null, "Volvo FH truck tractor")).toBe("heavy");
    expect(fleetSizeClass(null, "HINO 500 1627")).toBe("unknown");
  });
});

describe("computeFleetEmissions", () => {
  const rows = [
    // Three heavy trucks with fuel: they set the heavy class's measured rate (30, 35 and 40 L/100 km).
    { reg: "AA11BBGP", depot: "BFN", model: "HINO 500 1627", gvm: 26_000, monthlyKm: 4_000, monthlyLitres: 1_200 },
    { reg: "AA22BBGP", depot: "BFN", model: "HINO 500 1627", gvm: 26_000, monthlyKm: 2_000, monthlyLitres: 800 },
    { reg: "AA66BBGP", depot: "BFN", model: "HINO 500 1627", gvm: 26_000, monthlyKm: 2_000, monthlyLitres: 700 },
    // A heavy truck with only kilometres: estimated at the class median, 35 L/100 km.
    { reg: "AA33BBGP", depot: "CPT", model: "HINO 500 1627", gvm: 26_000, monthlyKm: 1_000 },
    // A medium truck with its own norm: estimated at 20 L/100 km.
    { reg: "AA44BBGP", depot: "CPT", model: "HINO 300", gvm: 8_500, monthlyKm: 2_000, l100Norm: 20 },
    // Nothing recorded.
    { reg: "AA55BBGP", depot: "CPT", model: "Unknown", gvm: 26_000 },
    // Electric.
    { reg: "EV01GP", depot: "CPT", model: "eCanter", gvm: 7_500, monthlyKm: 1_500, isEv: "Yes" },
  ];

  it("counts each vehicle by the best method its data allows", () => {
    const fleet = computeFleetEmissions(workbook(rows));
    const byReg = Object.fromEntries(fleet.vehicles.map((v) => [v.reg, v]));
    const ef = fleet.factor;

    expect(byReg.AA11BBGP).toMatchObject({ method: "fuel", sizeClass: "heavy", lPer100km: 30 });
    expect(byReg.AA11BBGP.tco2e).toBeCloseTo((1_200 * ef) / 1000, 6);

    expect(fleet.classRates.heavy).toEqual({ lPer100km: 35, basis: 3 });
    expect(byReg.AA33BBGP).toMatchObject({ method: "distance", rateSource: "size-class", lPer100km: 35, litresUsed: 350 });
    expect(byReg.AA33BBGP.tco2e).toBeCloseTo((350 * ef) / 1000, 6);

    expect(byReg.AA44BBGP).toMatchObject({ method: "distance", rateSource: "vehicle-norm", litresUsed: 400 });
    expect(byReg.AA55BBGP.method).toBe("missing");
    expect(byReg.AA55BBGP.missing).toMatch(/Neither litres nor kilometres/);
    expect(byReg.EV01GP).toMatchObject({ method: "electric", tco2e: 0 });
  });

  it("adds up by size and by depot, keeping measured and estimated apart", () => {
    const fleet = computeFleetEmissions(workbook(rows));
    const ef = fleet.factor;
    expect(fleet.totals).toMatchObject({ vehicles: 7, measured: 3, estimated: 2, electric: 1, missing: 1 });
    expect(fleet.totals.litres).toBeCloseTo(1_200 + 800 + 700 + 350 + 400, 6);
    expect(fleet.totals.fuelTco2e).toBeCloseTo((2_700 * ef) / 1000, 6);
    expect(fleet.totals.distanceTco2e).toBeCloseTo((750 * ef) / 1000, 6);
    expect(fleet.byClass.map((g) => g.key)).toEqual(["heavy", "medium"]);
    expect(fleet.byDepot.map((g) => g.key)).toEqual(["BFN", "CPT"]);
    expect(fleet.byDepot[0].tco2e).toBeCloseTo((2_700 * ef) / 1000, 6);
  });

  it("never estimates from nothing: with no measured vehicle, kilometres alone are missing data", () => {
    const fleet = computeFleetEmissions(workbook([{ reg: "ZZ01GP", gvm: 26_000, monthlyKm: 3_000 }]));
    expect(fleet.vehicles[0].method).toBe("missing");
    expect(fleet.vehicles[0].missing).toMatch(/fewer than 3 vehicles of its size have both litres and kilometres/);
    expect(fleet.totals.tco2e).toBe(0);
  });

  it("does not let one or two vehicles stand for a whole size class", () => {
    const fleet = computeFleetEmissions(workbook([
      { reg: "A", gvm: 26_000, monthlyKm: 1_000, monthlyLitres: 300 },
      { reg: "B", gvm: 26_000, monthlyKm: 1_000, monthlyLitres: 400 },
      { reg: "C", gvm: 26_000, monthlyKm: 1_000 },
    ]));
    expect(fleet.classRates.heavy).toEqual({ lPer100km: null, basis: 2 });
    expect(fleet.vehicles[2].method).toBe("missing");
  });

  it("refuses an odometer reading as a month's distance, and a date as a month's litres — and says so", () => {
    const fleet = computeFleetEmissions(workbook([
      { reg: "ODO1", gvm: 26_000, monthlyKm: 433_425 },
      { reg: "SERIAL", gvm: 26_000, monthlyKm: 1_575, monthlyLitres: 45_227, fuelCap: 400 },
      { reg: "SLIP", gvm: 26_000, monthlyKm: 100_000, monthlyLitres: 10 },
    ]));
    const [odo, serial] = fleet.vehicles;
    expect(odo.method).toBe("missing");
    expect(odo.missing).toMatch(/433.425 km is more than one vehicle drives in a month — it reads like an odometer reading/);
    expect(serial.litres).toBeNull();
    expect(serial.missing).toMatch(/45.227 L cannot be one vehicle's month of diesel \(its tank holds 400 L\)/);
    // With its odometer reading set aside, the third vehicle's 10 L stands on its own: counted from fuel.
    expect(fleet.vehicles[2]).toMatchObject({ method: "fuel", km: null, litres: 10 });
    expect(fleet.totals.tco2e).toBeCloseTo((10 * fleet.factor) / 1000, 6);
  });

  it("reconciles the fleet against the diesel the depots bought", () => {
    const fleet = computeFleetEmissions({
      sections: {
        fleet: { cells: { _rows: rows } },
        "e-data": { cells: { s1a_C14: 1_000, s1a_D14: 2_000, s1a_C15: 1_000 } },
      },
    } as unknown as EsgWorkbookData);
    // Two months of depot diesel: 4,000 L → 2,000 L a month; the fleet accounts for 3,450 L.
    expect(fleet.reconciliation).toMatchObject({ depotLitresPerMonth: 2_000, depotMonths: 2 });
    expect(fleet.reconciliation!.ratio).toBeCloseTo(3_450 / 2_000, 6);
  });
});
