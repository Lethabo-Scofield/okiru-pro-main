/**
 * The ESG verification checks: totals against the documents they come from.
 *
 * Before these existed the known traps passed silently — a printed total that
 * is not its own site rows' sum, water in litres beside kilolitres, a bill
 * booked a month late, a fleet register that accounts for three quarters of
 * the depots' diesel, a contractor's 90 % diversion shown as no rate at all.
 * Every check is flag-only: these tests also pin that the workbook is never
 * changed. Every value, name and file is invented.
 */
import { describe, expect, it } from "vitest";
import { verifyEsg, esgFiguresAgree, esgFigure, type EsgVerificationInput } from "../esgVerification";
import type { EsgCalculatorEntryLike, EsgCalculatorRowLike } from "../esgParserToWorkbook";
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { esgAxisCells, type EsgReportingAxes } from "@/components/esg-workbook/esgDefaults";

const AXES: EsgReportingAxes = {
  depots: ["Depot North", "Depot South", "Depot East"],
  months: ["Jul-25", "Aug-25", "Sep-25", "Oct-25", "Nov-25", "Dec-25", "Jan-26", "Feb-26", "Mar-26", "Apr-26", "May-26", "Jun-26"],
};
const DASH = "Acme dashboard.xlsx › Dashboard";
const BILL = "Acme North July.pdf";

const monthly = (source: string, measure: string, site: string | null, ym: string, value: number, extra: Record<string, unknown> = {}): EsgCalculatorRowLike => ({
  grid: "esg_monthly_rows",
  cells: { "monthly.measure": measure, ...(site ? { "monthly.site": site } : {}), "monthly.period_end": `${ym}-28`, "monthly.value": value, ...extra },
  sourceFiles: [source],
});

function workbook(sections: Record<string, Record<string, unknown>>): EsgWorkbookData {
  return {
    companyId: "C-ACME",
    ownerUserId: "u",
    ownerOrganizationId: null,
    updatedAt: "",
    sections: Object.fromEntries(
      Object.entries({ ...sections, "e-data": { ...esgAxisCells(AXES), ...(sections["e-data"] ?? {}) } }).map(([id, cells]) => [id, { cells }]),
    ),
  } as unknown as EsgWorkbookData;
}

function run(over: Partial<EsgVerificationInput> & { rows?: EsgCalculatorRowLike[]; entries?: EsgCalculatorEntryLike[] }) {
  return verifyEsg({
    calculator: { rows: over.rows ?? [], entries: over.entries ?? [] },
    axes: AXES,
    workbook: over.workbook ?? workbook({}),
    extractions: over.extractions,
    held: over.held,
  });
}
const byCode = (report: ReturnType<typeof verifyEsg>, code: string) => report.checks.filter((c) => c.code === code);

describe("tolerance and formatting", () => {
  it("agrees up to rounding, not beyond", () => {
    expect(esgFiguresAgree(1000, 1000.9)).toBe(true);
    expect(esgFiguresAgree(1000, 1004)).toBe(false);
    expect(esgFiguresAgree(2.3, 2.7)).toBe(true);
    expect(esgFigure(12345.678)).toBe("12 345.68");
    expect(esgFigure(3)).toBe("3");
  });
});

describe("V1: printed totals against the document's own site rows", () => {
  const rows = [
    // Electricity: Jul total prints 3 (a broken cell); Aug agrees.
    monthly(DASH, "energy.electricity_kwh", null, "2025-07", 3),
    monthly(DASH, "energy.electricity_kwh", "Depot North", "2025-07", 1000),
    monthly(DASH, "energy.electricity_kwh", "Depot South", "2025-07", 2000),
    monthly(DASH, "energy.electricity_kwh", null, "2025-08", 3100),
    monthly(DASH, "energy.electricity_kwh", "Depot North", "2025-08", 1100),
    monthly(DASH, "energy.electricity_kwh", "Depot South", "2025-08", 2000),
    // Water: the total is in litres, the site rows in kilolitres.
    monthly(DASH, "water.kl", null, "2025-07", 12_345_670),
    monthly(DASH, "water.kl", "Depot North", "2025-07", 12_345.67),
    // Diesel agrees; the same site row repeated by a second sheet counts once.
    monthly(DASH, "fleet.diesel_litres", null, "2025-07", 500),
    monthly(DASH, "fleet.diesel_litres", "Depot North", "2025-07", 500),
    monthly("Acme dashboard.xlsx › Fuel", "fleet.diesel_litres", "Depot North", "2025-07", 500),
  ];
  const report = run({ rows });
  const v1 = byCode(report, "V1");

  it("flags a month whose printed total is not its rows' sum, and passes the rest", () => {
    const electricity = v1.find((c) => c.subject.startsWith("Electricity"))!;
    expect(electricity.status).toBe("flag");
    expect(electricity.statement).toMatch(/1 of 2 printed Electricity totals/);
    expect(electricity.statement).toMatch(/Jul-25 prints 3 kWh against 3 000/);
    expect(electricity.rule).toBe("flag-only");
  });

  it("names a factor of 1 000 as a unit error", () => {
    const water = v1.find((c) => c.subject.startsWith("Water"))!;
    expect(water.status).toBe("flag");
    expect(water.statement).toMatch(/factor of 1 000/);
  });

  it("passes a measure whose totals add up", () => {
    expect(v1.find((c) => c.subject.startsWith("Fleet diesel"))?.status).toBe("pass");
  });
});

describe("V2 / V3: the same site and month in two documents", () => {
  it("a bill a month apart from the dashboard is a booking question, not an error", () => {
    const rows = [
      monthly(BILL, "energy.electricity_kwh", "Depot North", "2025-07", 1234.5, { "monthly.field": "electricity_kwh" }),
      monthly(DASH, "energy.electricity_kwh", "Depot North", "2025-07", 980),
      monthly(DASH, "energy.electricity_kwh", "Depot North", "2025-08", 1234.5),
    ];
    const check = byCode(run({ rows }), "V2")[0];
    expect(check.status).toBe("needs-you");
    expect(check.statement).toMatch(/a month apart/);
  });

  it("a plain disagreement is a flag", () => {
    const rows = [
      monthly(BILL, "energy.electricity_kwh", "Depot North", "2025-07", 1234.5, { "monthly.field": "electricity_kwh" }),
      monthly(DASH, "energy.electricity_kwh", "Depot North", "2025-07", 1500),
    ];
    expect(byCode(run({ rows }), "V2")[0].status).toBe("flag");
  });

  it("a bill at an address that names no site asks whether it is the site holding its figure", () => {
    const rows = [
      monthly(BILL, "energy.electricity_kwh", "12 Example Road, Industria", "2025-09", 4321, { "monthly.field": "electricity_kwh" }),
      monthly(DASH, "energy.electricity_kwh", "Depot South", "2025-10", 4321),
    ];
    const check = byCode(run({ rows }), "V2").find((c) => c.id.startsWith("V2:site"))!;
    expect(check.status).toBe("needs-you");
    expect(check.statement).toMatch(/Depot South Oct-25/);
  });

  it("fuel agreeing across documents passes under V3", () => {
    const rows = [
      monthly("Acme diesel report.xlsx", "fleet.diesel_litres", "Depot East", "2026-03", 5000),
      monthly(DASH, "fleet.diesel_litres", "Depot East", "2026-03", 5000),
    ];
    expect(byCode(run({ rows }), "V3")[0]).toMatchObject({ status: "pass" });
  });

  it("diesel issued to external vehicles that is also recorded as generator diesel is flagged", () => {
    const rows = [
      monthly("Acme diesel report.xlsx", "fleet.external_diesel_issued_litres", "Depot East", "2026-03", 432),
      monthly(DASH, "energy.generator_diesel_litres", "Depot East", "2026-03", 432),
    ];
    const check = byCode(run({ rows }), "V3").find((c) => c.id.startsWith("V3:external"))!;
    expect(check.status).toBe("flag");
    expect(check.statement).toMatch(/cannot be both/);
  });
});

describe("V4: the fleet register against the depots' diesel", () => {
  it("flags a register that accounts for three quarters of the depots' fuel", () => {
    const wb = workbook({
      "e-data": { s1a_C14: 4000, s1a_C15: 4000 },
      fleet: { _rows: [{ reg: "AB 12 CD", depot: "Depot North", monthlyKm: 9000, monthlyLitres: 3000 }, { reg: "EF 34 GH", depot: "Depot South", monthlyKm: 9000, monthlyLitres: 3000 }] },
    });
    const check = byCode(run({ workbook: wb }), "V4")[0];
    expect(check.status).toBe("flag");
    expect(check.statement).toMatch(/ratio 0\.75/);
  });
});

describe("V5: the waste contractor's figures", () => {
  const entries: EsgCalculatorEntryLike[] = [
    { key: "waste.total_kg", value: 20_000, sourceField: "waste_total_kg", sourceFiles: ["Acme waste report.pdf"] },
    { key: "waste.recycled_kg", value: 18_000, sourceField: "waste_recycled_kg", sourceFiles: ["Acme waste report.pdf"] },
    { key: "waste.landfill_kg", value: 2_000, sourceField: "waste_landfill_kg", sourceFiles: ["Acme waste report.pdf"] },
  ];

  it("asks for the rate when the register cannot state one, and checks the contractor's own sum", () => {
    const wb = workbook({ waste: { _row_count: 2, _rows: [{ wasteType: "Cardboard", totalKg: 12_000 }, { wasteType: "Plastic", totalKg: 8_000 }] } });
    const report = run({ entries, workbook: wb });
    expect(report.checks.find((c) => c.id === "V5:contractor-sum")?.status).toBe("pass");
    const rate = report.checks.find((c) => c.id === "V5:diversion")!;
    expect(rate.status).toBe("needs-you");
    expect(rate.statement).toMatch(/90\.0 % diverted/);
    expect(report.checks.find((c) => c.id === "V5:register")?.status).toBe("pass");
  });

  it("flags a workbook rate that differs from the contractor's", () => {
    const wb = workbook({ waste: { _row_count: 1, _rows: [{ wasteType: "Mixed", totalKg: 20_000, recycledKg: 10_000, landfillKg: 10_000 }] } });
    expect(run({ entries, workbook: wb }).checks.find((c) => c.id === "V5:diversion")?.status).toBe("flag");
  });

  it("reports waste rows held for want of a unit", () => {
    const held = [{ field: "waste_stream_rows", value: 2.58, sourceFile: "Acme waste.xlsx", reason: "no unit", rejection: "unit_unresolved" }];
    expect(run({ held }).checks.find((c) => c.id === "V5:units")?.status).toBe("flag");
  });
});

describe("V6: Employment Equity", () => {
  it("a document from an earlier period is out of period, with its reason", () => {
    const held = [{ field: "ee.headcount_total", value: 321, sourceFile: "Acme EE return 2023.pdf", reason: "Its document covers 2023-09-01 to 2023-11-30, which ended before the reporting year.", rejection: "out_of_period" }];
    const check = byCode(run({ held }), "V6")[0];
    expect(check.status).toBe("out-of-period");
    expect(check.statement).toMatch(/2023-11-30/);
  });

  it("flags a level matrix that does not add up to the stated total", () => {
    const rows: EsgCalculatorRowLike[] = [
      { grid: "ee_level_rows", cells: { "ee.occupational_level": "Top management", "ee.headcount_level_total": 4 }, sourceFiles: ["Acme EEA2.pdf"] },
      { grid: "ee_level_rows", cells: { "ee.occupational_level": "Skilled", "ee.headcount_african_male": 50, "ee.headcount_white_female": 10 }, sourceFiles: ["Acme EEA2.pdf"] },
    ];
    const entries = [{ key: "ee.headcount_total", value: 70, sourceField: "headcount_total", sourceFiles: ["Acme EEA2.pdf"] }];
    const check = byCode(run({ rows, entries }), "V6")[0];
    expect(check.status).toBe("flag");
    expect(check.statement).toMatch(/adds up to 64 employees; the document states 70/);
  });
});

describe("V7: incident counts and LTIFR", () => {
  const rows: EsgCalculatorRowLike[] = [
    { grid: "incident_rows", cells: { "hs.incident_date": "2025-08-14", "hs.incident_classification": "LTI" }, sourceFiles: ["Acme SHE register.xlsx"] },
  ];

  it("passes when S_Data holds the register's counts, and asks for hours before an LTIFR", () => {
    const wb = workbook({ "s-data": { C28: 0, C29: 1, C30: 0 } });
    const report = run({ rows, workbook: wb });
    expect(report.checks.find((c) => c.id === "V7:counts")?.status).toBe("pass");
    const ltifr = report.checks.find((c) => c.id === "V7:ltifr")!;
    expect(ltifr.status).toBe("needs-you");
    expect(ltifr.statement).toMatch(/per 1 000 000 hours/);
  });

  it("flags a quarterly cell holding another count", () => {
    const wb = workbook({ "s-data": { C28: 0, C29: 3, C30: 0 } });
    expect(run({ rows, workbook: wb }).checks.find((c) => c.id === "V7:counts")?.status).toBe("flag");
  });

  it("computes the LTIFR check per million hours when hours exist", () => {
    const wb = workbook({ "s-data": { C28: 0, C29: 1, C30: 0, C27: 200_000 } });
    const ltifr = run({ rows, workbook: wb }).checks.find((c) => c.id === "V7:ltifr")!;
    expect(ltifr.status).toBe("pass");
    expect(ltifr.statement).toMatch(/= 5\.00/);
  });
});

describe("V8: the factor basis and a client emissions export", () => {
  const EXPORT = "Acme carbon system export.xlsx";
  const wb = workbook({ "e-data": { s2_C14: 1000, s2_D14: 1000, s1c_C14: 50 } });
  const rows = [
    monthly(EXPORT, "energy.electricity_kwh", "Depot North", "2025-07", 1000),
    monthly(EXPORT, "energy.electricity_kwh", "Depot North", "2025-08", 1200),
  ];
  const extractions = [{ documentId: "emissions_system_export", documentName: "Emissions inventory system export", sourceFile: EXPORT }];
  const report = run({ rows, workbook: wb, extractions });

  it("states the factor basis, not signed off, as a question for the expert", () => {
    const factors = report.checks.find((c) => c.id === "V8:factors")!;
    expect(factors.status).toBe("needs-you");
    expect(factors.statement).toMatch(/Factor basis: grid electricity 0\.82/);
  });

  it("compares the export's activity with ours over its months, and lists what lies outside its boundary", () => {
    const check = report.checks.find((c) => c.id === `V8:export:${EXPORT}`)!;
    expect(check.status).toBe("flag");
    expect(check.statement).toMatch(/Electricity 2 200 kWh against our 2 000/);
    expect(check.statement).toMatch(/outside the export's boundary: Scope 1C/);
  });
});

describe("V9: coverage", () => {
  it("flags sites with no figure and a months-of-actuals count the grids contradict", () => {
    const wb = workbook({ "e-data": { s2_C14: 1000, s2_D14: 1000 }, assumptions: { B111: 6 } });
    const report = run({ workbook: wb });
    const electricity = report.checks.find((c) => c.id === "V9:s2")!;
    expect(electricity.status).toBe("flag");
    expect(electricity.statement).toMatch(/2 of 6 site-months/);
    expect(electricity.statement).toMatch(/Depot South, Depot East/);
    expect(report.checks.find((c) => c.id === "V9:months")?.status).toBe("flag");
  });

  it("a block the workbook keeps as one company-wide row is covered by its months, not by sites", () => {
    const wb = workbook({ "e-data": { s1c_C14: 40, s1c_D14: 45 } });
    expect(run({ workbook: wb }).checks.find((c) => c.id === "V9:s1c")?.status).toBe("pass");
  });
});

describe("V10: register sanity", () => {
  it("flags repeated rows, undated rows and more stops than planned", () => {
    const debrief = (route: string, planned: number, actual: number): EsgCalculatorRowLike => ({
      grid: "fleet_debrief_rows",
      cells: { "fleet.route_name": route, "fleet.planned_stops": planned, "fleet.actual_stops": actual },
      sourceFiles: ["Acme debrief.xlsx"],
    });
    const rows = [debrief("R1", 10, 9), debrief("R1", 10, 9), debrief("R2", 8, 12)];
    const entries = [
      { key: "fleet.planned_stops", value: 100, sourceField: "planned_stops", sourceFiles: ["Acme debrief.xlsx"] },
      { key: "fleet.actual_stops", value: 140, sourceField: "actual_stops", sourceFiles: ["Acme debrief.xlsx"] },
    ];
    const report = run({ rows, entries });
    const register = report.checks.find((c) => c.id === "V10:fleet_debrief_rows")!;
    expect(register.status).toBe("flag");
    expect(register.statement).toMatch(/1 of 3 rows are identical to another row in every column read/);
    expect(register.statement).toMatch(/3 of 3 rows carry no date/);
    expect(register.statement).toMatch(/1 rows complete more stops than were planned/);
    expect(report.checks.find((c) => c.id === "V10:stops")?.status).toBe("flag");
  });
});

describe("the report", () => {
  it("is flag-only: it counts every status and never changes the workbook", () => {
    const wb = workbook({ "e-data": { s2_C14: 1000 }, "s-data": { C29: 1 } });
    const before = JSON.stringify(wb);
    const report = run({ workbook: wb, rows: [monthly(DASH, "energy.electricity_kwh", null, "2025-07", 3), monthly(DASH, "energy.electricity_kwh", "Depot North", "2025-07", 1000)] });
    expect(JSON.stringify(wb)).toBe(before);
    expect(report.checks.every((c) => c.rule === "flag-only")).toBe(true);
    const total = Object.values(report.counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(report.checks.length);
    expect(report.period).toEqual({ start: "2025-07-01", end: "2026-06-30" });
  });
});
