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
            vehicle("DATA", { "fleet.vehicle_registration": "AB34EFGP", "fleet.depot_name": "ACTALDER", "fleet.gvm_kg": 26000 }, 0),
            vehicle("DATA", { "fleet.vehicle_registration": "AB90LMGP", "fleet.depot_name": "ACTBKT", "fleet.gvm_kg": 34100 }, 1),
            vehicle("Fuel Summary", { "fleet.vehicle_registration": "AB34EFGP PERMIT", "fleet.monthly_km": 3620, "fleet.monthly_litres": 1676 }, 0),
            vehicle("Sheet2", { "fleet.vehicle_registration": "AB34EFGP", "fleet.gvm_kg": 99999 }, 0),
            vehicle("SOLD", { "fleet.vehicle_registration": "AB90LMGP" }, 0),
          ],
        },
      },
    } as never);

    const rows = readEsgGridRows(injection.patches.fleet?.cells as Record<string, unknown>, "fleet");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reg: "AB34EFGP", depot: "ACTALDER", gvm: 26000, monthlyKm: 3620, monthlyLitres: 1676 });
  });
});
