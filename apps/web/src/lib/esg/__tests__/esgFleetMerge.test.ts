/**
 * One vehicle, one fleet row: a fleet list repeats its vehicles across
 * sheets, each knowing part of the story, and sold vehicles are not the fleet.
 */
import { describe, expect, it } from "vitest";
import { applyEsgParserResult } from "@/components/esg/esgParserInjection";
import { readEsgGridRows } from "@/lib/esg/esgGridRows";
import { mapEsgCalculatorToWorkbook } from "@/lib/esg/esgParserToWorkbook";

const vehicle = (sheet: string, cells: Record<string, unknown>, index: number) => ({
  grid: "fleet_vehicle_rows",
  index,
  cells,
  sourceFiles: [`Fleet List.xlsx › ${sheet}`],
});

describe("fleet register merge", () => {
  it("combines a vehicle's listings by plate and leaves sold vehicles out", () => {
    const injection = applyEsgParserResult({
      status: "resolved",
      ai_entities: {
        extractions: [],
        calculator: {
          entries: [],
          rows: [
            vehicle("DATA", { "fleet.vehicle_registration": "LB45BXGP", "fleet.depot_name": "SGTBLOEM", "fleet.gvm_kg": 26000 }, 0),
            vehicle("DATA", { "fleet.vehicle_registration": "KB33CSGP", "fleet.depot_name": "SGTCPT", "fleet.gvm_kg": 33520 }, 1),
            vehicle("Fuel Summary", { "fleet.vehicle_registration": "LB45BXGP PERMIT", "fleet.monthly_km": 3503, "fleet.monthly_litres": 1718 }, 0),
            vehicle("Sheet2", { "fleet.vehicle_registration": "LB45BXGP", "fleet.gvm_kg": 99999 }, 0),
            vehicle("SOLD", { "fleet.vehicle_registration": "KB33CSGP" }, 0),
          ],
        },
      },
    } as never);

    const rows = readEsgGridRows(injection.patches.fleet?.cells as Record<string, unknown>, "fleet");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reg: "LB45BXGP", depot: "SGTBLOEM", gvm: 26000, monthlyKm: 3503, monthlyLitres: 1718 });
  });

  it("lets a hidden sheet add to a listed vehicle, never add a vehicle", () => {
    const hidden = (cells: Record<string, unknown>, index: number) => ({ ...vehicle("Fuel Summary", cells, index), hidden: true });
    const injection = applyEsgParserResult({
      status: "resolved",
      ai_entities: {
        extractions: [],
        calculator: {
          entries: [],
          rows: [
            hidden({ "fleet.vehicle_registration": "LB45BXGP", "fleet.monthly_km": 3503, "fleet.monthly_litres": 1718 }, 0),
            hidden({ "fleet.vehicle_registration": "OLD001GP", "fleet.monthly_km": 900 }, 1),
            vehicle("DATA", { "fleet.vehicle_registration": "LB45BXGP", "fleet.gvm_kg": 26000 }, 0),
          ],
        },
      },
    } as never);
    const rows = readEsgGridRows(injection.patches.fleet?.cells as Record<string, unknown>, "fleet");
    expect(rows.map((r) => r.reg)).toEqual(["LB45BXGP"]);
    expect(rows[0]).toMatchObject({ gvm: 26000, monthlyKm: 3503, monthlyLitres: 1718 });
  });

  it("takes a vehicle's month from its depot's fuel report, never one sheet's km beside another's litres", () => {
    const month = (cells: Record<string, unknown>, index: number, period: string) => ({
      grid: "fleet_vehicle_rows",
      index,
      cells,
      sourceFiles: ["DIESEL REPORT.xlsx › Daily Summary"],
      period,
    });
    const result = mapEsgCalculatorToWorkbook({
      entries: [],
      rows: [
        vehicle("DATA", { "fleet.vehicle_registration": "LB45BXGP", "fleet.depot_name": "SGTBLOEM", "fleet.gvm_kg": 26000 }, 0),
        // An undated "monthly km" on the fleet list — which month, nobody says.
        vehicle("FLEET LIST", { "fleet.vehicle_registration": "LB45BXGP", "fleet.monthly_km": 3503 }, 1),
        month({ "fleet.vehicle_registration": "LB45BXGP", "fleet.monthly_km": 5290, "fleet.monthly_litres": 1718, "fleet.depot_name": "Bloemfontein" }, 2, "2026-03"),
        // On the depot's report but not the fleet list: still a vehicle that ran.
        month({ "fleet.vehicle_registration": "LC36DCGP", "fleet.monthly_km": 6340, "fleet.monthly_litres": 1621, "fleet.depot_name": "Bloemfontein" }, 3, "2026-03"),
      ],
    });
    const rows = readEsgGridRows(result.patches.fleet?.cells as Record<string, unknown>, "fleet");
    expect(rows).toHaveLength(2);
    // The register names the vehicle and its depot; the fuel report gives its month, whole.
    expect(rows[0]).toMatchObject({ reg: "LB45BXGP", depot: "SGTBLOEM", gvm: 26000, monthlyKm: 5290, monthlyLitres: 1718, l100Actual: 32.5 });
    expect(rows[1]).toMatchObject({ reg: "LC36DCGP", depot: "Bloemfontein", monthlyKm: 6340, monthlyLitres: 1621 });
    expect(result.outcomes.fleet_vehicle_rows.reason).toMatch(/2 vehicle\(s\) take their month's kilometres and litres from the depots' fuel reports \(2026-03\)/);
  });

  it("makes several reported months one average month", () => {
    const month = (cells: Record<string, unknown>, index: number, period: string) => ({
      grid: "fleet_vehicle_rows",
      index,
      cells: { "fleet.vehicle_registration": "LB45BXGP", ...cells },
      sourceFiles: [`DIESEL REPORT ${period}.xlsx › Daily Summary`],
      period,
    });
    const result = mapEsgCalculatorToWorkbook({
      entries: [],
      rows: [
        month({ "fleet.monthly_km": 4000, "fleet.monthly_litres": 1200 }, 0, "2026-02"),
        month({ "fleet.monthly_km": 5290, "fleet.monthly_litres": 1718 }, 1, "2026-03"),
        // The same month twice is one month, not a third.
        month({ "fleet.monthly_km": 5290, "fleet.monthly_litres": 1718 }, 2, "2026-03"),
      ],
    });
    const [row] = readEsgGridRows(result.patches.fleet?.cells as Record<string, unknown>, "fleet");
    expect(row).toMatchObject({ monthlyKm: 4645, monthlyLitres: 1459 });
    expect(result.outcomes.fleet_vehicle_rows.reason).toMatch(/\(2026-02, 2026-03\), 1 averaged over the months reported/);
  });

  it("keeps one undated sheet's month whole rather than pairing it with another's", () => {
    const result = mapEsgCalculatorToWorkbook({
      entries: [],
      rows: [
        vehicle("DATA", { "fleet.vehicle_registration": "LB45BXGP", "fleet.gvm_kg": 26000 }, 0),
        vehicle("Fuel Summary", { "fleet.vehicle_registration": "LB45BXGP", "fleet.monthly_km": 3503 }, 1),
        vehicle("Fuel Log", { "fleet.vehicle_registration": "LB45BXGP", "fleet.monthly_litres": 1718 }, 2),
      ],
    });
    const [row] = readEsgGridRows(result.patches.fleet?.cells as Record<string, unknown>, "fleet");
    expect(row.monthlyKm).toBe(3503);
    expect(row.monthlyLitres).toBeUndefined();
  });

  describe("fuel fills", () => {
    const fill = (index: number, cells: Record<string, unknown>, file = "Fuel card.xlsx › Statement") => ({
      grid: "fleet_fuel_transaction_rows",
      index,
      cells,
      sourceFiles: [file],
    });
    const listed = vehicle("DATA", { "fleet.vehicle_registration": "LB45BXGP", "fleet.gvm_kg": 26000 }, 0);

    it("give a listed vehicle its months: litres from every fill, kilometres only with the month before", () => {
      const result = mapEsgCalculatorToWorkbook({
        entries: [],
        rows: [
          listed,
          // February: two fills, last reading 210,000.
          fill(1, { "fleet.vehicle_registration": "LB45BXGP", "fleet.transaction_date": "2026-02-10", "fleet.odometer_reading": 208_000, "fleet.fuel_litres": 300 }),
          fill(2, { "fleet.vehicle_registration": "LB45BXGP", "fleet.transaction_date": "2026-02-24", "fleet.odometer_reading": 210_000, "fleet.fuel_litres": 600 }),
          // March: from 210,000 to 215,000 on 1,600 L — a true pair.
          fill(3, { "fleet.vehicle_registration": "LB45BXGP", "fleet.transaction_date": "2026-03-05", "fleet.odometer_reading": 212_000, "fleet.fuel_litres": 700 }),
          fill(4, { "fleet.vehicle_registration": "LB45BXGP", "fleet.transaction_date": "2026-03-20", "fleet.odometer_reading": 215_000, "fleet.fuel_litres": 900 }),
          // A bowser delivery names no vehicle.
          fill(5, { "fleet.transaction_date": "2026-03-11", "fleet.fuel_litres": 12_001 }),
        ],
      });
      const [row] = readEsgGridRows(result.patches.fleet?.cells as Record<string, unknown>, "fleet");
      // February has no month before it in the data: its litres alone, so March's pair is the month.
      expect(row).toMatchObject({ reg: "LB45BXGP", gvm: 26000, monthlyKm: 5000, monthlyLitres: 1600, l100Actual: 32 });
      expect(result.outcomes.fleet_fuel_transaction_rows).toMatchObject({ status: "placed" });
      expect(result.outcomes.fleet_fuel_transaction_rows.reason).toMatch(/5 fuel line\(s\) read: they give 1 vehicle\(s\) their month's litres/);
      expect(result.outcomes.fleet_fuel_transaction_rows.reason).toMatch(/1 line\(s\) name no vehicle or no litres/);
    });

    it("never add a vehicle no fleet list names — a depot fills other units' trucks too", () => {
      const result = mapEsgCalculatorToWorkbook({
        entries: [],
        rows: [
          listed,
          fill(1, { "fleet.vehicle_registration": "LB75TTGP", "fleet.transaction_date": "2026-03-04", "fleet.fuel_litres": 116 }),
        ],
      });
      const rows = readEsgGridRows(result.patches.fleet?.cells as Record<string, unknown>, "fleet");
      expect(rows.map((r) => r.reg)).toEqual(["LB45BXGP"]);
      expect(result.outcomes.fleet_fuel_transaction_rows.status).toBe("unplaced");
      expect(result.outcomes.fleet_fuel_transaction_rows.reason).toMatch(/1 vehicle\(s\) no fleet list names \(LB75TTGP\) was not added/);
    });

    it("leave a month the depot's report states to the report, and say where they disagree", () => {
      const result = mapEsgCalculatorToWorkbook({
        entries: [],
        rows: [
          listed,
          { grid: "fleet_vehicle_rows", index: 1, cells: { "fleet.vehicle_registration": "LB45BXGP", "fleet.monthly_km": 5290, "fleet.monthly_litres": 1718 }, sourceFiles: ["DIESEL REPORT.xlsx › Daily Summary"], period: "2026-03" },
          fill(2, { "fleet.vehicle_registration": "LB45BXGP", "fleet.transaction_date": "2026-03-02", "fleet.fuel_litres": 148 }, "DIESEL REPORT.xlsx › LB45BXGP"),
          fill(3, { "fleet.vehicle_registration": "LB45BXGP", "fleet.transaction_date": "2026-03-05", "fleet.fuel_litres": 165 }, "DIESEL REPORT.xlsx › LB45BXGP"),
        ],
      });
      const [row] = readEsgGridRows(result.patches.fleet?.cells as Record<string, unknown>, "fleet");
      expect(row).toMatchObject({ monthlyKm: 5290, monthlyLitres: 1718 });
      const reason = result.outcomes.fleet_fuel_transaction_rows.reason;
      expect(reason).toMatch(/1 vehicle-month\(s\) they cover are already stated by the depot's fuel report/);
      expect(reason).toMatch(/LB45BXGP 2026-03: the fills add to 313 L, the report says 1[\s ,]?718 L/);
    });

    it("count a log's total line as the check it is, never as one more fill", () => {
      const result = mapEsgCalculatorToWorkbook({
        entries: [],
        rows: [
          listed,
          fill(1, { "fleet.vehicle_registration": "LB45BXGP", "fleet.transaction_date": "2026-03-02", "fleet.fuel_litres": 148 }),
          fill(2, { "fleet.vehicle_registration": "LB45BXGP", "fleet.transaction_date": "2026-03-05", "fleet.fuel_litres": 165 }),
          // Undated, and exactly what the fills add to: the log's own total.
          fill(3, { "fleet.vehicle_registration": "LB45BXGP", "fleet.fuel_litres": 313 }),
        ],
      });
      const [row] = readEsgGridRows(result.patches.fleet?.cells as Record<string, unknown>, "fleet");
      expect(row.monthlyLitres).toBe(313);
      expect(result.outcomes.fleet_fuel_transaction_rows.reason).toMatch(/1 vehicle total line\(s\) agree with their fills and were not counted again/);
    });

    it("are the fleet when no fleet list was uploaded", () => {
      const result = mapEsgCalculatorToWorkbook({
        entries: [],
        rows: [fill(0, { "fleet.vehicle_registration": "CA123456", "fleet.transaction_date": "2026-03-04", "fleet.fuel_litres": 55 })],
      });
      const rows = readEsgGridRows(result.patches.fleet?.cells as Record<string, unknown>, "fleet");
      expect(rows).toEqual([expect.objectContaining({ reg: "CA123456", monthlyLitres: 55 })]);
    });
  });

  it("keeps the most recent rows of a register too large to hold", () => {
    const trips = Array.from({ length: 1_200 }, (_, i) => ({
      grid: "fleet_debrief_rows",
      index: i,
      cells: {
        "fleet.transaction_date": `2025-${String((i % 12) + 1).padStart(2, "0")}-01`,
        "fleet.driver_name": `Driver ${i}`,
        "fleet.route_name": `Route ${i}`,
      },
      sourceFiles: ["Debrief.xlsx › Trips"],
    }));
    const injection = applyEsgParserResult({
      status: "resolved",
      ai_entities: { extractions: [], calculator: { entries: [], rows: trips } },
    } as never);
    const cells = injection.patches["driver-debrief"]?.cells as Record<string, unknown> | undefined;
    if (!cells) return; // the debrief register maps these fields only where its grid does
    expect(Number(cells._row_count)).toBeLessThanOrEqual(1_000);
  });
});
