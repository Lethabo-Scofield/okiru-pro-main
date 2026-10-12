/**
 * An incident register's rows become the quarterly injury counts.
 *
 * The rows were read and reported as evidence the scorecard does not consume,
 * so S_Data's H&S block stayed empty and "Zero fatalities" (S d18) scored 0
 * for a register that lists four lost-time injuries and no fatality.
 * Every value here is invented.
 */
import { describe, expect, it } from "vitest";
import { esgIncidentCounts, esgInjuryClass } from "../esgIncidentCounts";
import { mapEsgCalculatorToWorkbook, type EsgCalculatorRowLike } from "../esgParserToWorkbook";
import { deriveEsgSummaryCells } from "../esgDeriveSummary";
import type { EsgWorkbookData } from "../esgWorkbookStorage";
import { scoreSocial } from "../../../../EsgToolkit/src/lib/calculators/social";

const FY = {
  depots: ["Depot North"],
  months: ["Jul-25", "Aug-25", "Sep-25", "Oct-25", "Nov-25", "Dec-25", "Jan-26", "Feb-26", "Mar-26", "Apr-26", "May-26", "Jun-26"],
};
const FILE = "Invented SHE register.xlsx";

const incident = (date: string, classification: string | null, extra: Record<string, unknown> = {}): EsgCalculatorRowLike => ({
  grid: "incident_rows",
  cells: {
    "hs.incident_date": date,
    ...(classification ? { "hs.incident_classification": classification } : {}),
    ...extra,
  },
  sourceFiles: [FILE],
});

const register = [
  incident("2025-08-14", "LTI", { "hs.injured_party_category": "Employee" }),
  incident("2025-09-02", "Lost time injury"),
  incident("2025-11-20", "Medical treatment case"),
  incident("2026-01-09", "First aid - no lost time", { "hs.incident_lost_time": false }),
  incident("2026-02-11", "LTI", { "hs.injured_party_category": "Contractor" }),
  incident("2026-02-12", "LTI", { "hs.injured_party_category": "Member of the public" }),
  incident("2026-04-03", null, { "hs.incident_lost_time": true }),
  incident("2026-05-17", null),
  incident("2024-12-01", "LTI"),
];

const periodEntries = [
  { key: "hs.period_start", value: "2025-07-01", sourceField: "reporting_period_start", sourceFiles: [FILE] },
  { key: "hs.period_end", value: "2026-06-30", sourceField: "reporting_period_end", sourceFiles: [FILE] },
];

describe("the register's own classification", () => {
  it("is read as printed, fatality first, and never guessed", () => {
    expect(esgInjuryClass({ "hs.incident_classification": "Fatal" })).toBe("fatality");
    expect(esgInjuryClass({ "hs.incident_classification": "LTI" })).toBe("lti");
    expect(esgInjuryClass({ "hs.incident_classification": "First aid - no lost time" })).toBe("not_an_injury");
    expect(esgInjuryClass({ "hs.incident_classification": "Non-lost time injury" })).toBe("not_an_injury");
    expect(esgInjuryClass({ "hs.incident_classification": "MTC" })).toBe("mti");
    expect(esgInjuryClass({ "hs.incident_lost_time": true })).toBe("lti");
    expect(esgInjuryClass({})).toBe("unclassified");
  });
});

describe("quarterly counts from an incident register", () => {
  it("counts workers' injuries by quarter, with zeros only where the register covers the quarter", () => {
    const periods = new Map([[FILE, { start: "2025-07-01", end: "2026-06-30" }]]);
    const counts = esgIncidentCounts(register, FY, periods)!;
    expect(counts.totals).toEqual({ fatality: 0, lti: 4, mti: 1 });
    expect(counts.quarters).toEqual(["C", "D", "E", "F"]);
    expect(counts.cells).toMatchObject({ C29: 2, D30: 1, E29: 1, F29: 1, C28: 0, D28: 0, E28: 0, F28: 0, E30: 0 });
    expect(counts.skipped).toEqual({ unclassified: 1, notAnInjury: 1, notAWorker: 1, outsideYear: 1 });
    expect(counts.summary).toMatch(/confirm/);
  });

  it("without a stated period, only the quarters it lists an incident in", () => {
    const counts = esgIncidentCounts([incident("2025-08-14", "LTI")], FY)!;
    expect(counts.quarters).toEqual(["C"]);
    expect(counts.cells).toEqual({ C28: 0, C29: 1, C30: 0 });
  });

  it("places them in S_Data, so Zero fatalities is earned from the register", () => {
    const result = mapEsgCalculatorToWorkbook({ entries: periodEntries, rows: register }, { axes: FY });
    const cells = result.patches["s-data"]?.cells ?? {};
    expect(cells).toMatchObject({ C28: 0, D28: 0, E28: 0, F28: 0, C29: 2, E29: 1, F29: 1, D30: 1 });
    expect(result.outcomes.incident_rows).toMatchObject({ status: "placed" });
    expect(result.outcomes.incident_rows.reason).toMatch(/4 lost-time injuries, 1 medical-treatment case, 0 fatalities/);

    const workbook = { companyId: "hs", sections: { "s-data": { cells } }, updatedAt: "" } as unknown as EsgWorkbookData;
    const derived = deriveEsgSummaryCells(workbook);
    expect(derived.sections?.["s-data"]?.cells?.G28).toBe(0);
    expect(derived.sections?.["s-data"]?.cells?.G29).toBe(4);
    expect(scoreSocial(derived).rows.d18).toBe(8);
    // No hours worked: LTIFR stays uncomputed (per 1 000 000 hours, never estimated).
    expect(typeof derived.sections?.["s-data"]?.cells?.G35).not.toBe("number");
  });

  it("a fatality on the register loses Zero fatalities", () => {
    const rows = [...register, incident("2025-10-02", "Fatality")];
    const result = mapEsgCalculatorToWorkbook({ entries: periodEntries, rows }, { axes: FY });
    const cells = result.patches["s-data"]?.cells ?? {};
    expect(cells.D28).toBe(1);
    const workbook = { companyId: "hs", sections: { "s-data": { cells } }, updatedAt: "" } as unknown as EsgWorkbookData;
    expect(scoreSocial(deriveEsgSummaryCells(workbook)).rows.d18).toBe(0);
  });

  it("a printed count that disagrees with the rows is the user's call, not ours", () => {
    const result = mapEsgCalculatorToWorkbook(
      {
        entries: [
          { key: "hs.period_start", value: "2025-07-01", sourceField: "reporting_period_start", sourceFiles: ["Invented Q1 stats.pdf"] },
          { key: "hs.period_end", value: "2025-09-30", sourceField: "reporting_period_end", sourceFiles: ["Invented Q1 stats.pdf"] },
          { key: "hs.lost_time_injuries_count", value: 3, sourceField: "lost_time_injuries_count", sourceFiles: ["Invented Q1 stats.pdf"] },
        ],
        rows: [incident("2025-08-14", "LTI"), incident("2025-09-02", "LTI")],
      },
      { axes: FY },
    );
    expect(result.patches["s-data"]?.cells?.C29).toBeUndefined();
    expect(result.conflicts.some((c) => c.sectionId === "s-data" && c.cellRef === "C29")).toBe(true);
  });
});
