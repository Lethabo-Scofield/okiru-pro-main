/**
 * Bills read as rows: every bill is its own site × month figure, and every
 * bill's readings — the figure, its site, its period — are told their OWN
 * fate, not the fate of whichever bill happened to place.
 */
import { describe, expect, it } from "vitest";
import { applyEsgParserResult } from "@/components/esg/esgParserInjection";
import { ESG_DEFAULT_MONTHS } from "@/components/esg-workbook/esgDefaults";

const AXES = { axes: { depots: ["ALDER", "BKT", "DRN", "FENWICK", "GH"], months: ESG_DEFAULT_MONTHS } };

/** One bill as the parser hands it back: its own readings, and its row. */
function bill(file: string, site: string, periodEnd: string, kwh: number) {
  return {
    extraction: {
      documentId: `doc:${file}`,
      sourceFile: file,
      element: "GHG_ENERGY",
      values: [
        { field: "site_name", value: site, sourceFile: file },
        { field: "billing_period_end", value: periodEnd, sourceFile: file },
        { field: "electricity_kwh", value: kwh, sourceFile: file },
        { field: "utility_account_number", value: `ACC-${file}`, sourceFile: file },
      ],
    },
    row: {
      grid: "esg_monthly_rows",
      cells: {
        "monthly.measure": "energy.electricity_kwh",
        "monthly.site": site,
        "monthly.period_end": periodEnd,
        "monthly.value": kwh,
        "monthly.field": "electricity_kwh",
        "monthly.context": "site_name,billing_period_end",
      },
      sourceFiles: [file],
    },
  };
}

function caseOf(bills: ReturnType<typeof bill>[]) {
  return {
    status: "resolved",
    ai_entities: {
      extractions: bills.map((b) => b.extraction),
      calculator: { rows: bills.map((b) => b.row), entries: [] },
    },
  } as never;
}

describe("bills as rows", () => {
  it("places every bill, each in its own site and month", () => {
    const injection = applyEsgParserResult(
      caseOf([
        bill("alder-jul.pdf", "ACME CONSUMER - ALDERWOOD", "2025-07-31", 1000),
        bill("bkt-jul.pdf", "ACME CONSUMER - BROOK TOWN", "2025-07-31", 2000),
        bill("bkt-aug.pdf", "ACME CONSUMER - BROOK TOWN", "2025-08-31", 2100),
      ]),
      AXES,
    );
    expect(injection.patches["e-data"].cells).toMatchObject({ s2_C14: 1000, s2_C15: 2000, s2_D15: 2100 });
    expect(injection.conflicts).toEqual([]);
  });

  it("tells each bill its own fate — one outside the year is not 'placed' because another bill was", () => {
    const injection = applyEsgParserResult(
      caseOf([
        bill("bkt-jul.pdf", "BKT", "2025-07-31", 2000),
        bill("bkt-old.pdf", "BKT", "2024-07-31", 1900),
      ]),
      AXES,
    );
    const fate = (file: string, field: string) =>
      injection.placed.some((p) => p.sourceFile === file && p.field === field)
        ? "placed"
        : injection.unplaced.find((u) => u.sourceFile === file && u.field === field)?.reason ?? "missing";

    expect(fate("bkt-jul.pdf", "electricity_kwh")).toBe("placed");
    expect(fate("bkt-jul.pdf", "site_name")).toBe("placed");
    expect(fate("bkt-jul.pdf", "billing_period_end")).toBe("placed");
    expect(fate("bkt-old.pdf", "electricity_kwh")).toMatch(/2024-07 falls outside the workbook's reporting year/);
    expect(fate("bkt-old.pdf", "site_name")).toMatch(/outside the workbook's reporting year/);
    // The account number is evidence with no cell — reported, as before.
    expect(fate("bkt-jul.pdf", "utility_account_number")).not.toBe("placed");
  });

  it("two bills that disagree about one site and month are one conflict, owned by both", () => {
    const injection = applyEsgParserResult(
      caseOf([bill("a.pdf", "BKT", "2025-07-31", 2000), bill("b.pdf", "BKT", "2025-07-31", 2500)]),
      AXES,
    );
    expect(injection.conflicts).toHaveLength(1);
    expect(injection.conflicts[0].candidates.map((c) => c.sources[0]).sort()).toEqual(["a.pdf", "b.pdf"]);
    // Contested readings are accounted for by the conflict, never as placed.
    expect(injection.placed.filter((p) => p.field === "electricity_kwh")).toEqual([]);
  });
});
