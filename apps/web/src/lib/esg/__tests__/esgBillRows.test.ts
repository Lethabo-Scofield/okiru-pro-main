/**
 * Bills read as rows: every bill is its own site × month figure, and every
 * bill's readings — the figure, its site, its period — are told their OWN
 * fate, not the fate of whichever bill happened to place.
 */
import { describe, expect, it } from "vitest";
import { applyEsgParserResult } from "@/components/esg/esgParserInjection";
import { ESG_DEFAULT_DEPOTS, ESG_DEFAULT_MONTHS } from "@/components/esg-workbook/esgDefaults";

const AXES = { axes: { depots: ESG_DEFAULT_DEPOTS, months: ESG_DEFAULT_MONTHS } };

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
        bill("bloem-jul.pdf", "SG CONSUMER - BLOEMFONTEIN", "2025-07-31", 1000),
        bill("cpt-jul.pdf", "SG CONSUMER - CAPE TOWN", "2025-07-31", 2000),
        bill("cpt-aug.pdf", "SG CONSUMER - CAPE TOWN", "2025-08-31", 2100),
      ]),
      AXES,
    );
    expect(injection.patches["e-data"].cells).toMatchObject({ s2_C14: 1000, s2_C15: 2000, s2_D15: 2100 });
    expect(injection.conflicts).toEqual([]);
  });

  it("tells each bill its own fate — one outside the year is not 'placed' because another bill was", () => {
    const injection = applyEsgParserResult(
      caseOf([
        bill("cpt-jul.pdf", "CPT", "2025-07-31", 2000),
        bill("cpt-old.pdf", "CPT", "2024-07-31", 1900),
      ]),
      AXES,
    );
    const fate = (file: string, field: string) =>
      injection.placed.some((p) => p.sourceFile === file && p.field === field)
        ? "placed"
        : injection.unplaced.find((u) => u.sourceFile === file && u.field === field)?.reason ?? "missing";

    expect(fate("cpt-jul.pdf", "electricity_kwh")).toBe("placed");
    expect(fate("cpt-jul.pdf", "site_name")).toBe("placed");
    expect(fate("cpt-jul.pdf", "billing_period_end")).toBe("placed");
    expect(fate("cpt-old.pdf", "electricity_kwh")).toMatch(/2024-07 falls outside the workbook's reporting year/);
    expect(fate("cpt-old.pdf", "site_name")).toMatch(/outside the workbook's reporting year/);
    // The account number is evidence with no cell — reported, as before.
    expect(fate("cpt-jul.pdf", "utility_account_number")).not.toBe("placed");
  });

  it("two bills that disagree about one site and month are one conflict, owned by both", () => {
    const injection = applyEsgParserResult(
      caseOf([bill("a.pdf", "CPT", "2025-07-31", 2000), bill("b.pdf", "CPT", "2025-07-31", 2500)]),
      AXES,
    );
    expect(injection.conflicts).toHaveLength(1);
    expect(injection.conflicts[0].candidates.map((c) => c.sources[0]).sort()).toEqual(["a.pdf", "b.pdf"]);
    // Contested readings are accounted for by the conflict, never as placed.
    expect(injection.placed.filter((p) => p.field === "electricity_kwh")).toEqual([]);
  });
});
