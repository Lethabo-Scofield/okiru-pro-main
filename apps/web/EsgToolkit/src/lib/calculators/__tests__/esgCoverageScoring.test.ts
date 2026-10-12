/**
 * Points that respond to how much of the data is there (corrected mode).
 *
 * An invented five-site workbook with three sites blank used to earn the
 * coverage rows in full — "electricity tracked monthly at every site" for two
 * sites — and water alone earned "Scope 3 tracking initiated". Three rated
 * vehicles out of a fleet of ten read as the whole fleet within its norm, and
 * a route register earned "Driver fatigue programme active". Parity mode keeps
 * the workbook's own rules throughout. Every value is invented.
 */
import { describe, expect, it } from "vitest";
import { deriveEsgSummaryCells } from "@/lib/esg/esgDeriveSummary";
import { writeEsgGridCells } from "@/lib/esg/esgGridRows";
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { scoreEnvironmental } from "../environmental";
import { scoreSocial } from "../social";
import { esgGridCoverage } from "../esgCoverage";

const SITES = ["Depot North", "Depot South", "Depot East", "Depot West", "Depot Central"];
const MONTHS = 9;
const COLUMNS = "CDEFGHIJK".split("").slice(0, MONTHS);

/** Monthly cells for the first `filledSites` sites, every month. */
function grid(prefix: string, filledSites: number, value: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (let row = 0; row < filledSites; row += 1) {
    for (const col of COLUMNS) out[`${prefix}_${col}${14 + row}`] = value;
  }
  return out;
}

function workbook(sections: Record<string, Record<string, unknown>>): EsgWorkbookData {
  return deriveEsgSummaryCells({
    companyId: "coverage-test",
    sections: Object.fromEntries(Object.entries(sections).map(([id, cells]) => [id, { cells }])),
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as EsgWorkbookData);
}

const axes = { eSites: SITES.join("\n"), eFirstMonth: "Jul-25", eMonthCount: MONTHS };

describe("coverage rows pay for the share of sites × months recorded", () => {
  const twoOfFive = workbook({
    "e-data": { ...axes, ...grid("s1a", 2, 1_000), ...grid("s2", 2, 12_345.67), ...grid("water", 2, 40) },
  });

  it("measures two sites of five, all nine months, as 40 %", () => {
    expect(esgGridCoverage(twoOfFive, "s2")).toMatchObject({ sites: 5, months: 9, filled: 18, share: 0.4 });
    expect(esgGridCoverage(twoOfFive, "s2")?.missingSites).toEqual(["Depot East", "Depot West", "Depot Central"]);
  });

  it("d5, d11 and d23 are pro-rated in corrected mode and full in parity", () => {
    const corrected = scoreEnvironmental(twoOfFive).rows;
    expect(corrected.d5).toBeCloseTo(2, 10);
    expect(corrected.d11).toBeCloseTo(2, 10);
    expect(corrected.d23).toBeCloseTo(1.6, 10);
    const parity = scoreEnvironmental(twoOfFive, { mode: "workbook-parity" }).rows;
    expect([parity.d5, parity.d11, parity.d23]).toEqual([5, 5, 4]);
  });

  it("every site and month recorded earns the row in full", () => {
    const full = workbook({ "e-data": { ...axes, ...grid("s2", 5, 100) } });
    expect(scoreEnvironmental(full).rows.d11).toBe(5);
  });

  it("a year in progress is measured to the last month any site reported", () => {
    const sixMonths: Record<string, number> = {};
    for (let row = 0; row < 5; row += 1) for (const col of COLUMNS.slice(0, 6)) sixMonths[`s2_${col}${14 + row}`] = 50;
    const inProgress = workbook({ "e-data": { ...axes, ...sixMonths } });
    expect(esgGridCoverage(inProgress, "s2")).toMatchObject({ months: 6, share: 1 });
  });
});

describe("Scope 3 tracking is not earned by water alone", () => {
  const waterOnly = workbook({ "e-data": { ...axes, ...grid("water", 5, 40) } });

  it("corrected mode leaves d8 out of the score, with the reason", () => {
    const result = scoreEnvironmental(waterOnly);
    expect(result.rows.d8).toBe(0);
    expect(result.excluded.find((x) => x.key === "d8")?.reason).toMatch(/materiality screen/);
  });

  it("parity still pays the workbook's 5 points for water", () => {
    expect(scoreEnvironmental(waterOnly, { mode: "workbook-parity" }).rows.d8).toBe(5);
  });
});

describe("fuel-rate compliance is pro-rated by how much of the fleet is measured", () => {
  // Ten vehicles; three have litres and kilometres, all within a 30 L/100 km norm.
  const vehicles = Array.from({ length: 10 }, (_, i) => ({
    _id: `v${i}`,
    reg: `AB${String(i).padStart(2, "0")}CDGP`,
    l100Norm: 30,
    ...(i < 3 ? { monthlyKm: 1_000, monthlyLitres: 250 } : {}),
  }));
  const fleet = workbook({ fleet: writeEsgGridCells("fleet", vehicles) });

  it("corrected: 8 × 3 within-norm ÷ 10 vehicles", () => {
    expect(scoreEnvironmental(fleet).rows.d15).toBeCloseTo(2.4, 10);
  });

  it("parity: the workbook's 8 × 3 ÷ 3 rated", () => {
    expect(scoreEnvironmental(fleet, { mode: "workbook-parity" }).rows.d15).toBe(8);
  });
});

describe("a driver fatigue programme needs a fatigue fact", () => {
  const routesOnly = workbook({
    "driver-debrief": writeEsgGridCells("driver-debrief", [{ _id: "d1", date: "2025-08-01", driver: "Driver A", route: "Route 7" }]),
  });

  it("a route register alone earns nothing in corrected mode, and 5 in parity", () => {
    expect(scoreSocial(routesOnly).rows.d19).toBe(0);
    expect(scoreSocial(routesOnly, { mode: "workbook-parity" }).rows.d19).toBe(5);
  });

  it("learners on a fatigue programme earn it", () => {
    const trained = workbook({
      "s-data-ofo": writeEsgGridCells("s-data-ofo", [
        { _id: "o1", ofoCode: "2021-733201", occupation: "Truck driver", programme: "Driver fatigue management", learners: 12 },
      ]),
    });
    expect(scoreSocial(trained).rows.d19).toBe(5);
  });

  it("other training does not", () => {
    const other = workbook({
      "s-data-ofo": writeEsgGridCells("s-data-ofo", [
        { _id: "o1", ofoCode: "2021-733201", occupation: "Truck driver", programme: "Defensive driving", learners: 12 },
      ]),
    });
    expect(scoreSocial(other).rows.d19).toBe(0);
  });

  it("recorded driver-fatigue incidents (a stated zero included) earn it", () => {
    expect(scoreSocial(workbook({ "s-data": { C34: 0, D34: 2 } })).rows.d19).toBe(5);
  });
});
