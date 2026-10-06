/**
 * One vehicle, one fleet row: a fleet list repeats its vehicles across
 * sheets, each knowing part of the story, and sold vehicles are not the fleet.
 */
import { describe, expect, it } from "vitest";
import { applyEsgParserResult } from "@/components/esg/esgParserInjection";
import { readEsgGridRows } from "@/lib/esg/esgGridRows";

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
});
