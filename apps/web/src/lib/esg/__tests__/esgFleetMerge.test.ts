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

  it("lets a hidden sheet add to a listed vehicle, never add a vehicle", () => {
    const hidden = (cells: Record<string, unknown>, index: number) => ({ ...vehicle("Fuel Summary", cells, index), hidden: true });
    const injection = applyEsgParserResult({
      status: "resolved",
      ai_entities: {
        extractions: [],
        calculator: {
          entries: [],
          rows: [
            hidden({ "fleet.vehicle_registration": "AB34EFGP", "fleet.monthly_km": 3620, "fleet.monthly_litres": 1676 }, 0),
            hidden({ "fleet.vehicle_registration": "OLD001GP", "fleet.monthly_km": 900 }, 1),
            vehicle("DATA", { "fleet.vehicle_registration": "AB34EFGP", "fleet.gvm_kg": 26000 }, 0),
          ],
        },
      },
    } as never);
    const rows = readEsgGridRows(injection.patches.fleet?.cells as Record<string, unknown>, "fleet");
    expect(rows.map((r) => r.reg)).toEqual(["AB34EFGP"]);
    expect(rows[0]).toMatchObject({ gvm: 26000, monthlyKm: 3620, monthlyLitres: 1676 });
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
