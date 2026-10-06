/**
 * Each company's own sites and reporting months — taken from its documents
 * when the workbook is new, kept when it already holds figures, and moved
 * with their figures when the user changes them.
 */
import { describe, expect, it } from "vitest";
import {
  esgMonthsFromEvidence,
  esgPlacementAxes,
  esgSitesFromLabels,
  esgWorkbookAxisState,
  remapEsgMonthlyCells,
} from "../esgCaseAxes";
import {
  ESG_DEFAULT_DEPOTS,
  ESG_DEFAULT_MONTHS,
  esgWorkbookAxes,
  type EsgReportingAxes,
} from "@/components/esg-workbook/esgDefaults";
import { applyEsgParserResult, esgPatchCellCount } from "@/components/esg/esgParserInjection";

const fact = (site: string | null, periodEnd: string, value: number, file: string, measure = "energy.electricity_kwh") => ({
  grid: "esg_monthly_rows",
  cells: {
    "monthly.measure": measure,
    ...(site ? { "monthly.site": site } : {}),
    "monthly.period_end": periodEnd,
    "monthly.value": value,
  },
  sourceFiles: [file],
});

const caseOf = (rows: ReturnType<typeof fact>[], extractions: unknown[] = []) => ({
  status: "resolved",
  ai_entities: {
    extractions: extractions as never,
    calculator: { rows, entries: [] },
  },
});

describe("esgSitesFromLabels — one name per site, the documents' own", () => {
  it("clusters a site's many names, keeps the shortest and drops the company's lead", () => {
    expect(
      esgSitesFromLabels([
        "SG CONSUMER - BLOEMFONTEIN",
        "BLOEM",
        "SG CONSUMER - CAPE TOWN",
        "CPT",
        "SG CONSUMER - ISANDO",
        "DBN",
        "SG CONSUMER - DURBAN",
        "PE",
        "Port Elizabeth",
      ]),
    ).toEqual(["BLOEM", "CPT", "DBN", "ISANDO", "PE"]);
  });

  it("does not take two sites that share a first word for one company", () => {
    expect(esgSitesFromLabels(["PORT ELIZABETH", "PORT NOLLOTH"])).toEqual(["PORT ELIZABETH", "PORT NOLLOTH"]);
  });

  it("is the same list whatever order the documents came in", () => {
    const a = esgSitesFromLabels(["Rosebank", "Midrand", "ROSEBANK OFFICE"]);
    const b = esgSitesFromLabels(["ROSEBANK OFFICE", "Midrand", "Rosebank"]);
    expect(a).toEqual(b);
    expect(a).toEqual(["Midrand", "Rosebank"]);
  });

  it("does not let twelve bills for one site look like a company name", () => {
    expect(esgSitesFromLabels(Array(12).fill("ACME HOLDINGS HEAD OFFICE"))).toEqual(["ACME HOLDINGS HEAD OFFICE"]);
  });
});

describe("esgMonthsFromEvidence — the reporting year the figures fall in", () => {
  it("starts at the earliest month and runs a year", () => {
    const months = esgMonthsFromEvidence(["2025-08", "2026-03", "2025-07"]);
    expect(months[0]).toBe("Jul-25");
    expect(months).toHaveLength(12);
    expect(months[11]).toBe("Jun-26");
  });

  it("runs longer when the figures do, and keeps the latest year when they run past two", () => {
    expect(esgMonthsFromEvidence(["2025-01", "2026-02"])).toHaveLength(14);
    const long = esgMonthsFromEvidence(["2022-01", "2026-06"]);
    expect(long[0]).toBe("Jul-25");
    expect(long).toHaveLength(12);
  });

  it("is empty with nothing to go on", () => {
    expect(esgMonthsFromEvidence([])).toEqual([]);
  });
});

describe("esgPlacementAxes — whose axes a case is placed on", () => {
  const rows = [fact("Rosebank", "2026-04-30", 100, "a.pdf"), fact("Midrand", "2026-05-31", 200, "b.pdf")];

  it("a company being created gets its own sites and months, recorded with the figures", () => {
    const { axes, cells } = esgPlacementAxes(caseOf(rows));
    expect(axes.depots).toEqual(["Midrand", "Rosebank"]);
    expect(axes.months[0]).toBe("Apr-26");
    expect(cells).toMatchObject({ eSites: "Midrand\nRosebank", eFirstMonth: "Apr-26", eMonthCount: 12 });
  });

  it("a workbook that holds monthly figures keeps the axes they were entered on", () => {
    const workbook = esgWorkbookAxisState({ s2_C14: 5 });
    expect(workbook.filled).toBe(true);
    const { axes, cells } = esgPlacementAxes(caseOf(rows), workbook);
    expect(axes.depots).toEqual(ESG_DEFAULT_DEPOTS);
    expect(axes.months).toEqual(ESG_DEFAULT_MONTHS);
    expect(cells).toEqual({});
  });

  it("what the workbook states wins; what it leaves open comes from the documents", () => {
    const workbook = esgWorkbookAxisState({ eSites: "Head office, Midrand, Rosebank" });
    const { axes, cells } = esgPlacementAxes(caseOf(rows), workbook);
    expect(axes.depots).toEqual(["Head office", "Midrand", "Rosebank"]);
    expect(axes.months[0]).toBe("Apr-26");
    expect(cells.eFirstMonth).toBe("Apr-26");
  });

  it("figures that name no site at all are a company reporting as one", () => {
    const { axes, cells } = esgPlacementAxes(caseOf([fact(null, "2026-04-30", 100, "a.pdf")]));
    expect(axes.companyWide).toBe(true);
    expect(cells.eScope).toBe("Company wide");
  });

  it("unless the workbook says it reports per site", () => {
    const workbook = esgWorkbookAxisState({ eScope: "Per site / depot" });
    const { axes } = esgPlacementAxes(caseOf([fact(null, "2026-04-30", 100, "a.pdf")]), workbook);
    expect(axes.companyWide).toBeFalsy();
  });
});

describe("applyEsgParserResult — a client that is not Super Group", () => {
  it("places a client's own sites and a bill after March 2026, and records the axes", () => {
    const injection = applyEsgParserResult(
      caseOf([fact("Rosebank", "2026-04-30", 100, "a.pdf"), fact("Midrand", "2026-06-30", 200, "b.pdf")]) as never,
    );
    // Midrand row 0, Rosebank row 1; Apr-26 = C, Jun-26 = E.
    expect(injection.patches["e-data"].cells).toMatchObject({ s2_C15: 100, s2_E14: 200, eSites: "Midrand\nRosebank" });
    // The axes are settings, not figures the user is told were filled.
    expect(esgPatchCellCount(injection.patches)).toBe(2);
  });

  it("a company-wide workbook adds different sites' bills into its one row", () => {
    const injection = applyEsgParserResult(
      caseOf([fact("Rosebank", "2026-04-30", 100, "a.pdf"), fact("Midrand", "2026-04-30", 200, "b.pdf")]) as never,
      { workbook: esgWorkbookAxisState({ eScope: "Company wide", eFirstMonth: "Apr-26", eMonthCount: 12 }) },
    );
    expect(injection.patches["e-data"].cells.s2_C14).toBe(300);
    expect(injection.conflicts).toEqual([]);
  });

  it("…but two documents that disagree about the SAME site are still a conflict", () => {
    const injection = applyEsgParserResult(
      caseOf([
        fact("Rosebank", "2026-04-30", 100, "a.pdf"),
        fact("Rosebank", "2026-04-30", 120, "b.pdf"),
        fact("Midrand", "2026-04-30", 200, "c.pdf"),
      ]) as never,
      { workbook: esgWorkbookAxisState({ eScope: "Company wide", eFirstMonth: "Apr-26", eMonthCount: 12 }) },
    );
    expect(injection.patches["e-data"]?.cells?.s2_C14).toBeUndefined();
    expect(injection.conflicts.map((c) => c.candidates.map((x) => x.value).sort())).toEqual([[300, 320]]);
  });

  it("a stated company total that matches the sites' sum is one figure; one that does not is offered beside it", () => {
    const wide = { workbook: esgWorkbookAxisState({ eScope: "Company wide", eFirstMonth: "Apr-26", eMonthCount: 12 }) };
    const agree = applyEsgParserResult(
      caseOf([
        fact("Rosebank", "2026-04-30", 100, "a.pdf"),
        fact("Midrand", "2026-04-30", 200, "b.pdf"),
        fact(null, "2026-04-30", 300, "dashboard.xlsx"),
      ]) as never,
      wide,
    );
    expect(agree.patches["e-data"].cells.s2_C14).toBe(300);
    const differ = applyEsgParserResult(
      caseOf([fact("Rosebank", "2026-04-30", 100, "a.pdf"), fact(null, "2026-04-30", 900, "dashboard.xlsx")]) as never,
      wide,
    );
    expect(differ.conflicts[0].candidates.map((x) => x.value).sort((a, b) => Number(a) - Number(b))).toEqual([100, 900]);
  });

  it("the one-row LPG block adds two documents' different sites even per site", () => {
    const injection = applyEsgParserResult(
      caseOf([
        fact("ISANDO", "2025-08-31", 50, "a.pdf", "energy.lpg_kg"),
        fact("DBN", "2025-08-31", 30, "b.pdf", "energy.lpg_kg"),
      ]) as never,
      { axes: { depots: ESG_DEFAULT_DEPOTS, months: ESG_DEFAULT_MONTHS } },
    );
    expect(injection.patches["e-data"].cells.s1c_D14).toBe(80);
  });
});

describe("remapEsgMonthlyCells — figures stay with their site and month", () => {
  const from: EsgReportingAxes = { depots: ["BLOEM", "CPT", "DBN"], months: ["Jul-25", "Aug-25", "Sep-25"] };
  const cells = { s2_C14: 10, s2_D15: 20, s1a_E16: 30, s2_src_1: "CPT bill", s1c_C14: 5 };

  it("reordering sites moves each row's figures with it", () => {
    const { patch, lost } = remapEsgMonthlyCells(cells, from, { ...from, depots: ["DBN", "BLOEM", "CPT"] });
    expect(lost).toEqual([]);
    expect(patch).toMatchObject({ s2_C15: 10, s2_D16: 20, s1a_E14: 30, s2_src_2: "CPT bill", s1c_C14: 5 });
    expect(patch.s2_C14).toBe("");
  });

  it("renaming a site where it stands keeps its figures", () => {
    const { patch, lost } = remapEsgMonthlyCells(cells, from, { ...from, depots: ["Bloemfontein", "Cape Town", "Head office"] });
    expect(lost).toEqual([]);
    // BLOEM → Bloemfontein and CPT → Cape Town by name; DBN → Head office where it stood.
    expect(patch).toMatchObject({ s2_C14: 10, s2_D15: 20, s1a_E16: 30 });
  });

  it("adding a site or lengthening the year moves nothing", () => {
    const { patch, lost } = remapEsgMonthlyCells(cells, from, { depots: [...from.depots, "PE"], months: [...from.months, "Oct-25"] });
    expect(lost).toEqual([]);
    expect(patch).toMatchObject({ s2_C14: 10, s2_D15: 20, s1a_E16: 30 });
  });

  it("starting the year a month earlier shifts every figure one column right", () => {
    const { patch, lost } = remapEsgMonthlyCells(cells, from, { ...from, months: ["Jun-25", "Jul-25", "Aug-25", "Sep-25"] });
    expect(lost).toEqual([]);
    expect(patch).toMatchObject({ s2_D14: 10, s2_E15: 20, s1a_F16: 30, s1c_D14: 5, s2_C14: "" });
  });

  it("refuses to drop a site or a month that holds figures", () => {
    // DBN held 30 in s1a: two-for-three renames nothing, so DBN has nowhere to go.
    expect(remapEsgMonthlyCells(cells, from, { ...from, depots: ["BLOEM", "CPT"] }).lost).toEqual(["DBN's figures"]);
    expect(remapEsgMonthlyCells(cells, from, { ...from, months: ["Jul-25", "Aug-25"] }).lost).toEqual(["the figures for Sep-25"]);
  });

  it("switching to company wide adds the sites up; back to per site is refused", () => {
    const { patch } = remapEsgMonthlyCells({ s2_C14: 10, s2_C15: 20 }, from, { ...from, companyWide: true });
    expect(patch).toMatchObject({ s2_C14: 30, s2_C15: "" });
    const back = remapEsgMonthlyCells({ s2_C14: 30 }, { ...from, companyWide: true }, from);
    expect(back.lost).toEqual(["the company-wide figures (they cannot be split into sites)"]);
  });

  it("reads back from the cells the editor writes", () => {
    const axes = esgWorkbookAxes({ eSites: "Midrand\nRosebank", eFirstMonth: "Apr-26", eMonthCount: "12" });
    expect(axes.depots).toEqual(["Midrand", "Rosebank"]);
    expect(axes.months).toHaveLength(12);
    expect(axes.months[11]).toBe("Mar-27");
  });
});
