/**
 * The wiring that closes the loop: parser extractions → workbook rows + meta.
 *
 * The properties that matter: a document that describes many people becomes many
 * ROWS (not one flattened row), entity-level values land in META rather than a
 * grid row, values that cannot be placed are reported, and required-field gaps
 * are surfaced.
 */
import { describe, expect, it } from "vitest";
import { parserExtractionsToWorkbook, toWorkbookSections } from "../parserToWorkbook";
import type { ParserExtraction } from "../parserToWorkbook";

function extraction(over: Partial<ParserExtraction> & { values: ParserExtraction["values"] }): ParserExtraction {
  return { documentId: "doc", sourceFile: "evidence.pdf", ...over };
}

describe("scalar values become one row", () => {
  it("turns a certificate's fields into a single procurement row", () => {
    const result = parserExtractionsToWorkbook([
      extraction({
        element: "ESD",
        values: [
          { field: "supplier_name", value: "Dynamic Maintenance Products" },
          { field: "bee_level", value: "4" },
          { field: "claimed_spend_ex_vat", value: "R 4 876.00" },
        ],
      }),
    ]);

    expect(result.rows.procurement).toHaveLength(1);
    const row = result.rows.procurement![0];
    expect(row.supplierName).toBe("Dynamic Maintenance Products");
    // bbbeeLevel is a dropdown of level STRINGS ("1".."8"), so it stays "4" —
    // the workbook stores the option, and matching to the option is the point.
    expect(row.bbbeeLevel).toBe("4");
    expect(row.spend).toBeCloseTo(4876, 2);
  });

  it("keeps provenance on the row", () => {
    const result = parserExtractionsToWorkbook([
      extraction({ sourceFile: "cert.pdf", values: [{ field: "supplier_name", value: "Alpha" }] }),
    ]);
    expect(result.rows.procurement![0]._sourceFiles).toEqual(["cert.pdf"]);
  });
});

describe("a table becomes many rows", () => {
  it("expands a share register into one row per shareholder", () => {
    // The failure this prevents: flattening twelve shareholders into one row
    // scores a fraction of the ownership.
    const result = parserExtractionsToWorkbook([
      extraction({
        element: "OWNERSHIP",
        values: [
          {
            field: "holdings_table",
            value: [
              { holder_name: "V Naidoo", number_of_shares: 60 },
              { holder_name: "N Dlamini", number_of_shares: 40 },
            ],
          },
        ],
      }),
    ]);

    expect(result.rows.ownership).toHaveLength(2);
    expect(result.rows.ownership!.map((r) => r.shareholderName)).toEqual(["V Naidoo", "N Dlamini"]);
    expect(result.rows.ownership!.map((r) => r.numberOfShares)).toEqual([60, 40]);
  });
});

describe("entity-level values go to meta, not a row", () => {
  it("routes TMPS to financial-information meta", () => {
    const result = parserExtractionsToWorkbook([
      extraction({
        element: "ESD",
        values: [{ field: "total_pre_exclusions_tmps", value: "R 1 030 806.68" }],
      }),
    ]);

    // TMPS is the procurement DENOMINATOR — one number, not a supplier row.
    expect(result.meta["financial-information"]?.tmps).toBeCloseTo(1030806.68, 2);
    expect(result.rows.procurement ?? []).toHaveLength(0);
  });

  it("keeps the first meta value when two documents disagree", () => {
    const result = parserExtractionsToWorkbook([
      extraction({ sourceFile: "a.pdf", element: "ESD", values: [{ field: "current_year_revenue", value: 10826271 }] }),
      extraction({ sourceFile: "b.pdf", element: "ESD", values: [{ field: "current_year_revenue", value: 9500000 }] }),
    ]);

    expect(result.meta["financial-information"]?.revenue).toBe(10826271);
  });
});

describe("nothing is forced", () => {
  it("reports a value that cannot satisfy its column", () => {
    const result = parserExtractionsToWorkbook([
      extraction({
        element: "OWNERSHIP",
        values: [
          { field: "holder_name", value: "T Nkosi" },
          { field: "declared_race", value: "Klingon" }, // not a dropdown option
        ],
      }),
    ]);

    expect(result.rows.ownership![0].shareholderName).toBe("T Nkosi");
    expect(result.rows.ownership![0].race).toBeUndefined();
    expect(result.rejected.map((r) => r.field)).toContain("race");
    expect(result.rejected[0].sourceFile).toBe("evidence.pdf");
  });

  it("reports a parser field it has no mapping for", () => {
    const result = parserExtractionsToWorkbook([
      extraction({ values: [{ field: "hpcsa_number", value: "PS0123456" }] }),
    ]);
    expect(result.coverage.unmapped).toContain("hpcsa_number");
  });
});

describe("required-field hunting is surfaced", () => {
  it("flags a supplier row with spend but no name", () => {
    const result = parserExtractionsToWorkbook([
      extraction({ element: "ESD", values: [{ field: "claimed_spend_ex_vat", value: 1000 }] }),
    ]);

    const columns = result.coverage.gaps.map((g) => g.column);
    expect(columns).toContain("supplierName");
    expect(result.coverage.complete).toBe(false);
  });
});

describe("shaping for the workbook", () => {
  it("produces the { rows, meta } shape the workbook consumes", () => {
    const result = parserExtractionsToWorkbook([
      extraction({ element: "ESD", values: [
        { field: "supplier_name", value: "Alpha" },
        { field: "total_pre_exclusions_tmps", value: 1000000 },
      ] }),
    ]);

    const sections = toWorkbookSections(result);
    expect(sections.procurement.rows.length).toBeGreaterThan(0);
    expect(sections["financial-information"].meta?.tmps).toBe(1000000);
  });

  it("handles an empty case without throwing", () => {
    const result = parserExtractionsToWorkbook([]);
    expect(result.rows).toEqual({});
    expect(result.coverage.complete).toBe(true);
  });
});
