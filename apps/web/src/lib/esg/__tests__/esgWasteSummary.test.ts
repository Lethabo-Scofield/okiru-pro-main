/**
 * The waste figures, three ways they went wrong (every value invented):
 *
 *   1. A register of stream TOTALS (no recycled, no landfill) published a 0.0 %
 *      diversion rate as if measured. Unknown is unknown: no rate, a reason,
 *      and "—" on the dashboard.
 *   2. A register long enough to reach row 13 had its 13th stream averaged as
 *      the contractor's "% recycled" row (`B13:J13`), earning E d20's 4 points
 *      from a cardboard line; and rows 16–18 are its streams, not B16:B18.
 *   3. A waste row with no unit was written as kilograms beside real kilograms.
 *      It is held and said so, never scored.
 */
import { describe, expect, it } from "vitest";
import { deriveEsgSummaryCells } from "../esgDeriveSummary";
import { mapEsgCalculatorToWorkbook, type EsgCalculatorRowLike } from "../esgParserToWorkbook";
import { writeEsgGridCells } from "../esgGridRows";
import { readEsgWasteSummary, esgWasteDiversionUnknownReason, wasteRegisterLastRow } from "../esgWasteSummary";
import type { EsgWorkbookData } from "../esgWorkbookStorage";
import { scoreEnvironmental } from "../../../../EsgToolkit/src/lib/calculators/environmental";
import { computeEsgDashboard } from "../../../../EsgToolkit/src/lib/calculators/dashboard";

type Cells = Record<string, unknown>;

function wb(sections: Record<string, Cells>): EsgWorkbookData {
  return {
    companyId: "waste-test",
    sections: Object.fromEntries(Object.entries(sections).map(([k, cells]) => [k, { cells }])),
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as EsgWorkbookData;
}

/** A register the app wrote: stamped, contiguous from row 5. */
function register(rows: Array<Record<string, unknown>>): Cells {
  return writeEsgGridCells("waste", rows.map((r, i) => ({ _id: `r${i}`, ...r })));
}

const streams = (n: number, extra: (i: number) => Record<string, unknown> = () => ({})) =>
  Array.from({ length: n }, (_, i) => ({ wasteType: i % 2 ? "Cardboard" : "Shrink wrap", totalKg: 10 + i, ...extra(i) }));

describe("the diversion rate needs a disposal route", () => {
  it("stream totals alone give no rate, a reason, and a dash on the dashboard", () => {
    const derived = deriveEsgSummaryCells(wb({ waste: register(streams(4)) }));
    expect(readEsgWasteSummary(derived, "diversion")).toBeNull();
    expect(esgWasteDiversionUnknownReason(derived)).toMatch(/none says how much was recycled or sent to landfill/);
    const kpi = computeEsgDashboard(wb({ waste: register(streams(4)) })).kpis.find((k) => k.id === "waste");
    expect(kpi?.value).toBe("—");
  });

  it("recycled or landfill figures give the rate, over those rows only", () => {
    const rows = [
      { wasteType: "Mixed (landfill)", totalKg: 200, landfillKg: 200 },
      { wasteType: "Cardboard", totalKg: 900, recycledKg: 900 },
      { wasteType: "Unsorted, route unknown", totalKg: 5_000 },
    ];
    const derived = deriveEsgSummaryCells(wb({ waste: register(rows) }));
    // 900 diverted of the 1,100 whose route is known; the 5,000 of unknown route counts on neither side.
    expect(readEsgWasteSummary(derived, "diversion")).toBeCloseTo(900 / 1100, 10);
  });

  it("a landfill figure beside the total is enough: diverted = total less landfill", () => {
    const derived = deriveEsgSummaryCells(wb({ waste: register([{ wasteType: "All streams", totalKg: 1_000, landfillKg: 100 }]) }));
    expect(readEsgWasteSummary(derived, "diversion")).toBeCloseTo(0.9, 10);
  });
});

describe("a register that reaches the scorecard rows owns them", () => {
  const long = register(streams(20, (i) => ({ depot: i === 11 ? "Depot North" : undefined })));

  it("the register is stamped through row 24", () => {
    expect(wasteRegisterLastRow(long)).toBe(24);
  });

  it("row 13 is a stream, never the contractor's % recycled row: no B17, no d20 points", () => {
    expect(long.C13).toBeDefined();
    const derived = deriveEsgSummaryCells(wb({ waste: long }));
    expect(readEsgWasteSummary(derived, "recycledMonthly")).toBeNull();
    expect(scoreEnvironmental(derived).rows.d20).toBe(0);
  });

  it("a stream's depot at row 16 stays the depot; the summary lives under its own key", () => {
    const withRoutes = register(streams(20, (i) => ({ depot: i === 11 ? "Depot North" : undefined, recycledKg: 1 })));
    const derived = deriveEsgSummaryCells(wb({ waste: withRoutes }));
    const cells = derived.sections?.waste?.cells as Cells;
    expect(cells.B16).toBe("Depot North");
    expect(readEsgWasteSummary(derived, "diversion")).toBeGreaterThan(0);
    expect(cells._diversion_rate).toBe(readEsgWasteSummary(derived, "diversion"));
  });

  it("the reference sheet's own B13:J13 and B16 are still read where the register stops short", () => {
    const legacy = wb({ waste: { C5: "Cardboard", D5: 100, E5: 50, B13: 0.1, C13: 0.2, B16: 0.5 } });
    const derived = deriveEsgSummaryCells(legacy);
    expect(readEsgWasteSummary(derived, "recycledMonthly")).toBeCloseTo(0.15, 10);
    expect(readEsgWasteSummary(derived, "diversion")).toBe(0.5);
  });
});

describe("a waste row needs a unit", () => {
  const row = (cells: Record<string, unknown>, source = "Invented report.pdf"): EsgCalculatorRowLike => ({
    grid: "waste_stream_rows",
    index: 0,
    cells: { "waste.stream_type": "Cardboard", ...cells },
    sourceFiles: [source],
  });

  it("rows with no unit are held back, said so, and never reach the register", () => {
    const result = mapEsgCalculatorToWorkbook({ entries: [], rows: [row({ "waste.total_kg": 14.38 })] });
    expect(result.patches.waste).toBeUndefined();
    expect(result.outcomes.waste_stream_rows).toMatchObject({ status: "unplaced", rejection: "unit_unresolved" });
    expect(result.outcomes.waste_stream_rows.reason).toMatch(/no unit stated.*not scored/);
  });

  it("a unit the register cannot hold is held too, and named", () => {
    const result = mapEsgCalculatorToWorkbook({ entries: [], rows: [row({ "waste.total_kg": 200, "waste.mass_unit": "UNITS" })] });
    expect(result.patches.waste).toBeUndefined();
    expect(result.outcomes.waste_stream_rows.reason).toMatch(/"UNITS"/);
  });

  it("kilograms are written as stated; tonnes become kilograms", () => {
    const result = mapEsgCalculatorToWorkbook({
      entries: [],
      rows: [
        row({ "waste.total_kg": 1_200, "waste.recycled_kg": 1_000, "waste.mass_unit": "kg" }),
        { ...row({ "waste.total_kg": 2.5, "waste.landfill_kg": 2.5, "waste.mass_unit": "tonnes" }), index: 1 },
      ],
    });
    expect(result.patches.waste?.cells).toMatchObject({ D5: 1_200, E5: 1_000, D6: 2_500, F6: 2_500 });
  });

  it("a document's own stated unit covers its rows, and only its rows", () => {
    const result = mapEsgCalculatorToWorkbook({
      entries: [{ key: "waste.mass_unit", value: "kg", sourceField: "waste_mass_unit", sourceFiles: ["Contractor.pdf"] }],
      rows: [
        row({ "waste.total_kg": 300 }, "Contractor.pdf"),
        { ...row({ "waste.total_kg": 9.1 }, "Dashboard.xlsx › waste"), index: 1 },
      ],
    });
    expect(result.patches.waste?.cells).toMatchObject({ D5: 300 });
    expect(result.patches.waste?.cells.D6).toBeUndefined();
    expect(result.outcomes.waste_stream_rows.status).toBe("placed");
    expect(result.sourceOutcomes.waste_stream_rows?.["Dashboard.xlsx › waste"]).toMatchObject({ rejection: "unit_unresolved" });
  });
});
