/**
 * The create flow's own axes — the sites and the reporting year a new
 * company's figures are placed on, worked out from its documents with no
 * workbook to say otherwise. Invented companies and figures throughout.
 *
 * What these pin:
 *  - the company's shared lead ("Acme Retail") is never a site, and a depot
 *    never matches through it — that one row once swallowed two depots'
 *    figures and held three more as ambiguous;
 *  - a bill's address, an account number and an LPG storage point are not
 *    sites;
 *  - a depot named in full ("East London") matches a label that contains it;
 *  - two years of dashboards are a reporting year and last year, never one
 *    24-month year: last year is kept out and offered as the baseline, and
 *    the months of actual data are recorded;
 *  - figures a dashboard held back are listed, figure by figure, even when
 *    some of its figures were placed.
 */
import { describe, expect, it } from "vitest";
import {
  esgCaseAxisEvidence,
  esgLabelIsAddressOrAccount,
  esgReportingYear,
  esgStatedMonth,
} from "../esgCaseAxes";
import { esgCompanyLeads, esgIsCompanyLabel, esgSiteMatch } from "../esgParserFieldBridge";
import { applyEsgParserResult, esgUnplacedKinds } from "@/components/esg/esgParserInjection";
import { buildEsgReportingMonths } from "@/components/esg-workbook/esgDefaults";
import { esgCreateFactCells, esgPeriodLabel, esgPriorYearBaseline } from "@/components/esg/esgCreateFacts";

type Row = { grid: string; cells: Record<string, unknown>; sourceFiles: string[] };

const fact = (measure: string, site: string | null, periodEnd: string, value: number, source: string, field?: string): Row => ({
  grid: "esg_monthly_rows",
  cells: {
    "monthly.measure": measure,
    ...(site ? { "monthly.site": site } : {}),
    "monthly.period_end": periodEnd,
    "monthly.value": value,
    ...(field ? { "monthly.field": field } : {}),
  },
  sourceFiles: [source],
});

const caseOf = (rows: Row[], extractions: unknown[] = []) => ({
  status: "resolved",
  ai_entities: {
    extractions: [
      // Every source has a reading, as the parser's register readers emit.
      ...Array.from(new Set(rows.map((r) => r.sourceFiles[0]))).map((sourceFile) => ({
        sourceFile,
        values: [{ field: String(rows.find((r) => r.sourceFiles[0] === sourceFile)!.cells["monthly.field"] ?? "esg_monthly_rows"), value: [1], sourceFile }],
      })),
      ...extractions,
    ] as never,
    calculator: { rows, entries: [] },
  },
});

/** "2025-07-31" for the n-th month after July 2025 (0 = July). */
const monthEnd = (year: number, month: number): string => {
  const d = new Date(Date.UTC(year, month, 0));
  return d.toISOString().slice(0, 10);
};

describe("the company is never a site", () => {
  const rows = [
    fact("energy.electricity_kwh", "Acme Retail - Depot North", "2025-07-31", 100, "dash.xlsx › Energy"),
    fact("energy.electricity_kwh", "Acme Retail - East London", "2025-07-31", 200, "dash.xlsx › Energy"),
    fact("energy.electricity_kwh", "Acme Retail - Mossel Bay", "2025-07-31", 300, "dash.xlsx › Energy"),
    // The company's own total, under its bare lead.
    fact("energy.electricity_kwh", "Acme Retail", "2025-07-31", 600, "dash.xlsx › Summary"),
    fact("fleet.distance_km", "Acme Retail", "2025-07-31", 9000, "dash.xlsx › Summary"),
  ];

  it("takes three sites from three depot labels — no row for the company's lead", () => {
    const injection = applyEsgParserResult(caseOf(rows) as never);
    expect(injection.axes?.depots).toEqual(["DEPOT NORTH", "EAST LONDON", "MOSSEL BAY"]);
    expect(injection.axes?.depots).not.toContain("RETAIL");
  });

  it("puts each depot's figure on its own row, and adds nothing into another's", () => {
    const cells = applyEsgParserResult(caseOf(rows) as never).patches["e-data"].cells;
    expect(cells).toMatchObject({ s2_C14: 100, s2_C15: 200, s2_C16: 300 });
    expect(Object.keys(cells).filter((ref) => /^s2_[C-Z]1[7-9]$/.test(ref))).toEqual([]);
  });

  it("a one-word depot does not match through the company's word", () => {
    expect(esgCompanyLeads(["Acme Retail - Depot North", "Acme Retail - Kimberley"])).toContain("ACME RETAIL");
    expect(esgSiteMatch("Acme Retail - Kimberley", ["Retail", "Kimberley"], ["ACME RETAIL"])).toBe(1);
    expect(esgSiteMatch("Acme Retail", ["Retail", "Kimberley"], ["ACME RETAIL"])).toBeNull();
    expect(esgIsCompanyLabel("Acme Retail", ["ACME RETAIL"])).toBe(true);
    expect(esgIsCompanyLabel("ACME TRADING", [], ["Acme Trading (Pty) Ltd"])).toBe(true);
    expect(esgIsCompanyLabel("Acme Retail - Kimberley", ["ACME RETAIL"])).toBe(false);
  });

  it("a bill's address, an account number and an LPG storage point are not sites — the bill is a question", () => {
    const injection = applyEsgParserResult(
      caseOf([
        fact("energy.electricity_kwh", "Depot North", "2025-07-31", 100, "dash.xlsx › Energy"),
        fact("energy.electricity_kwh", "East London", "2025-07-31", 200, "dash.xlsx › Energy"),
        fact("energy.lpg_kg", "Gas Store North", "2025-07-31", 40, "dash.xlsx › Gas"),
        fact("energy.electricity_kwh", "At 12 Long Street, Erf 4321", "2025-08-31", 5000, "bill-a.pdf", "electricity_kwh"),
        fact("energy.electricity_kwh", "40123/WAREHOUSE B", "2025-09-30", 7000, "bill-b.pdf", "electricity_kwh"),
      ]) as never,
    );
    expect(injection.axes?.depots).toEqual(["Depot North", "East London"]);
    const questions = injection.unplaced.filter((u) => u.choice?.needs.includes("site")).map((u) => u.choice!.value);
    expect(questions.sort()).toEqual([5000, 7000]);
    expect(injection.patches["e-data"].cells.s1c_C14).toBe(40);
  });

  it("knows an address or account from a site name", () => {
    expect(esgLabelIsAddressOrAccount("At 12 Long Street, Erf 4321")).toBe(true);
    expect(esgLabelIsAddressOrAccount("40123/WAREHOUSE B")).toBe(true);
    expect(esgLabelIsAddressOrAccount("7 Main Road")).toBe(true);
    expect(esgLabelIsAddressOrAccount("Depot North")).toBe(false);
    expect(esgLabelIsAddressOrAccount("Plant 2")).toBe(false);
  });
});

describe("a site named in full matches a label that contains it", () => {
  it("a depot of several words is found inside a longer label", () => {
    expect(esgSiteMatch("Acme Retail - East London", ["Kimberley", "East London", "Upington"])).toBe(1);
    expect(esgSiteMatch("Depot North - Mossel Bay", ["East London", "Mossel Bay"])).toBe(1);
    expect(esgSiteMatch("EAST LONDON DEPOT", ["East London", "Upington"])).toBe(0);
    // Words of the depot that are not side by side are not the depot.
    expect(esgSiteMatch("East Yard, London Road", ["East London", "Upington"])).toBeNull();
  });

  it("places the figures of a workbook that spells its sites out", () => {
    const year = buildEsgReportingMonths("Jul-25", 12);
    const injection = applyEsgParserResult(
      caseOf([
        fact("fleet.diesel_litres", "Acme Retail - East London", "2025-07-31", 51, "dash.xlsx › Fuel"),
        fact("fleet.diesel_litres", "Acme Retail - Mossel Bay", "2025-07-31", 12, "dash.xlsx › Fuel"),
        fact("fleet.diesel_litres", "Acme Retail - Kimberley", "2025-07-31", 7, "dash.xlsx › Fuel"),
      ]) as never,
      { axes: { depots: ["East London", "Kimberley", "Mossel Bay"], months: year } },
    );
    expect(injection.patches["e-data"].cells).toMatchObject({ s1a_C14: 51, s1a_C15: 7, s1a_C16: 12 });
  });
});

describe("the reporting year is the one the documents state", () => {
  // Last year's dashboard: Jul-24 … Jun-25. This year's: Jul-25 … Mar-26.
  const lastYear = "Acme dashboard 2024-2025.xlsx › Energy";
  const thisYear = "Acme dashboard 2025-2026.xlsx › Energy";
  const rows: Row[] = [];
  for (let m = 0; m < 12; m += 1) {
    rows.push(fact("energy.electricity_kwh", "Depot North", monthEnd(2024, 7 + m), 1000, lastYear));
    rows.push(fact("energy.lpg_kg", "Depot North", monthEnd(2024, 7 + m), 10, lastYear));
  }
  for (let m = 0; m < 9; m += 1) {
    rows.push(fact("energy.electricity_kwh", "Depot North", monthEnd(2025, 7 + m), 2000, thisYear));
    rows.push(fact("energy.lpg_kg", "Depot North", monthEnd(2025, 7 + m), 20, thisYear));
  }
  const register = {
    sourceFile: "Acme safety register.xlsx",
    element: "HEALTH_SAFETY",
    values: [
      { field: "reporting_period_start", value: "1 July 2025" },
      { field: "reporting_period_end", value: "30 June 2026" },
    ],
  };

  it("proposes the stated year, with what states it, and names the other year stated", () => {
    const year = esgReportingYear(esgCaseAxisEvidence(caseOf(rows, [register]) as never));
    expect(year?.basis).toBe("stated");
    expect(year?.months[0]).toBe("Jul-25");
    expect(year?.months).toHaveLength(12);
    expect(year?.statedBy).toEqual(expect.arrayContaining(["Acme safety register.xlsx", "Acme dashboard 2025-2026.xlsx"]));
    expect(year?.otherYears.map((y) => y.months[0])).toEqual(["Jul-24"]);
  });

  it("places only the declared year; last year is kept out and offered as the baseline", () => {
    const injection = applyEsgParserResult(caseOf(rows, [register]) as never);
    expect(injection.axes?.months).toEqual(buildEsgReportingMonths("Jul-25", 12));
    const cells = injection.patches["e-data"].cells;
    const monthly = Object.entries(cells).filter(([ref]) => /^(s2|s1c)_[C-Z]\d+$/.test(ref));
    // Nine months of this year's figures, nothing of last year's merged in.
    expect(monthly.filter(([ref]) => ref.startsWith("s2_")).map(([, v]) => v)).toEqual(Array(9).fill(2000));
    expect(monthly.filter(([ref]) => ref.startsWith("s1c_")).map(([, v]) => v)).toEqual(Array(9).fill(20));
    // The months of actual data travel with the year.
    expect(injection.patches.assumptions.cells.B111).toBe(9);
    expect(injection.priorYear?.months[0]).toBe("Jul-24");
    expect(injection.priorYear?.measures.find((m) => m.prefix === "s2")).toMatchObject({ total: 12000, monthsCovered: 12 });
    expect(injection.priorYear?.measures.find((m) => m.prefix === "s1c")).toMatchObject({ total: 120 });
  });

  it("a dashboard title alone states the year when no register does", () => {
    const year = esgReportingYear(esgCaseAxisEvidence(caseOf(rows) as never));
    // One vote each; the later year wins the tie.
    expect(year?.months[0]).toBe("Jul-25");
  });

  it("writes the period, and the baseline only when the person takes it", () => {
    const injection = applyEsgParserResult(caseOf(rows, [register]) as never);
    const months = injection.axes!.months;
    const without = esgCreateFactCells({ months, boundary: "Operational control" }, injection.patches, injection.priorYear);
    expect(without["company-reporting-setup"].cells).toMatchObject({ period: "July 2025 to June 2026", boundary: "Operational control" });
    expect(without["e-data"].cells.B92).toBeUndefined();
    expect(without["e-data"].cells.B90).toBeUndefined();
    const taken = esgCreateFactCells({ months, useBaseline: true }, injection.patches, injection.priorYear);
    expect(taken["e-data"].cells.B92).toBe(12000);
    expect(Number(taken["e-data"].cells.B90)).toBeGreaterThan(0);
    expect(esgPriorYearBaseline(injection.priorYear, injection.patches).B92).toBe(12000);
    expect(esgPeriodLabel(months)).toBe("July 2025 to June 2026");
  });

  it("a bill whose period ends the month before the year asks which month it is booked in", () => {
    const injection = applyEsgParserResult(
      caseOf([...rows, fact("energy.electricity_kwh", "Depot North", "2025-06-20", 777, "bill.pdf", "electricity_kwh")], [register]) as never,
    );
    const bill = injection.unplaced.find((u) => u.sourceFile === "bill.pdf" && u.choice);
    expect(bill?.choice?.needs).toEqual(["month"]);
    expect(injection.priorYear?.measures.find((m) => m.prefix === "s2")?.total).toBe(12000);
  });

  it("reads the dates documents state", () => {
    expect(esgStatedMonth("1 July 2025")).toBe("2025-07");
    expect(esgStatedMonth("30 June 2026")).toBe("2026-06");
    expect(esgStatedMonth("JUNE 2026")).toBe("2026-06");
    expect(esgStatedMonth("Mar 2026")).toBe("2026-03");
    expect(esgStatedMonth("25/02/2026")).toBe("2026-02");
    expect(esgStatedMonth("2026-03-31")).toBe("2026-03");
    expect(esgStatedMonth("FY2026")).toBeNull();
  });
});

describe("figures a dashboard held back are listed, even when some were placed", () => {
  const year = buildEsgReportingMonths("Jul-25", 12);
  const axes = { depots: ["Depot North", "East London"], months: year };

  it("lists each held figure with its reason; a figure with a question stands alone", () => {
    const injection = applyEsgParserResult(
      caseOf([
        fact("energy.electricity_kwh", "Depot North", "2025-07-31", 100, "dash.xlsx › Energy"),
        // Not one of the company's sites — a question per figure.
        fact("energy.electricity_kwh", "Kimberley", "2025-07-31", 40, "dash.xlsx › Energy"),
        // Company totals in a per-site grid: held, with the reason, as one line.
        fact("energy.electricity_kwh", null, "2025-07-31", 140, "dash.xlsx › Energy"),
        fact("energy.electricity_kwh", null, "2025-08-31", 150, "dash.xlsx › Energy"),
      ]) as never,
      { axes },
    );
    // The dashboard's reading is placed (Depot North) …
    expect(injection.placed.some((p) => p.sourceFile === "dash.xlsx › Energy")).toBe(true);
    // … and what it held is not hidden behind that.
    const held = injection.unplaced.filter((u) => u.heldFigures);
    expect(held.find((u) => u.choice)?.choice).toMatchObject({ value: 40, needs: ["site"] });
    const totals = held.find((u) => !u.choice)!;
    expect(totals.heldFigures).toBe(2);
    expect(String(totals.value)).toContain("2 figures");
    expect(totals.reason).toMatch(/company-wide total/);
    expect(esgUnplacedKinds(injection.unplaced).toPlace).toBe(1);
    // Every value read is placed, not placed, or disputed.
    expect(injection.placed.length + injection.unplaced.length).toBe(injection.valuesRead);
  });

  it("carries what placing a register noted onto its placed value", () => {
    const rows = Array.from({ length: 1001 }, (_, i) => ({
      grid: "fleet_debrief_rows",
      cells: { "fleet.driver_name": `Driver ${i}`, "fleet.route_name": `Route ${i}` },
      sourceFiles: ["debrief.xlsx"],
    }));
    const injection = applyEsgParserResult({
      status: "resolved",
      ai_entities: {
        extractions: [{ sourceFile: "debrief.xlsx", values: [{ field: "fleet_debrief_rows", value: [1], sourceFile: "debrief.xlsx" }] }],
        calculator: { rows, entries: [] },
      },
    } as never);
    const placed = injection.placed.find((p) => p.field === "fleet_debrief_rows");
    expect(placed?.note).toMatch(/1.?001 rows were read; the register keeps the (first|most recent) 1.?000/);
  });
});
