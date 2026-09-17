/**
 * Whole-case cross-checks, each measured on a real pack before it was written:
 *
 *   - TMPS read as 23 on a 47-row schedule summing to R3.3M (a row count).
 *   - Leviable payroll blanked as a "conflict" between R2,124,744 on two
 *     Finance sheets and R22,057.61 on one PDF (a monthly figure).
 *   - An owner recorded as "Black" (→ African) on the ownership evidence and
 *     as Indian on the EE register under the same ID.
 */
import { describe, expect, it } from "vitest";
import { parserExtractionsToWorkbook, resolveLopsidedConflict } from "../parserToWorkbook";

const supplierTable = (n: number, spend: number) =>
  Array.from({ length: n }, (_, i) => ({ supplier_name: `Supplier ${i + 1}`, amount_ex_vat: spend }));

describe("resolveLopsidedConflict — corroboration plus an order of magnitude settles it", () => {
  it("picks the figure two documents state over a single reading 10× away", () => {
    const settled = resolveLopsidedConflict([
      { value: 2124744, sources: ["Finance A", "Finance B"] },
      { value: 22057.61, sources: ["Skills Development Evidence.pdf"] },
    ]);
    expect(settled?.value).toBe(2124744);
    expect(settled?.sources).toEqual(["Finance A", "Finance B"]);
    expect(settled?.note).toMatch(/2 documents/);
    expect(settled?.note).toMatch(/monthly or partial/);
  });

  it("leaves genuine disagreements open: peers, or an outlier that is not far off", () => {
    expect(resolveLopsidedConflict([
      { value: 1000000, sources: ["A"] },
      { value: 1200000, sources: ["B"] },
    ])).toBeNull();
    expect(resolveLopsidedConflict([
      { value: 2124744, sources: ["A", "B"] },
      { value: 1800000, sources: ["C"] },
    ])).toBeNull();
    expect(resolveLopsidedConflict([
      { value: 2124744, sources: ["A", "B"] },
      { value: 22057, sources: ["C", "D"] },
    ])).toBeNull();
  });
});

describe("parserExtractionsToWorkbook — TMPS must contain the schedule it denominates", () => {
  it("withdraws a TMPS that equals the row count and puts the schedule total to the user", () => {
    const result = parserExtractionsToWorkbook([
      {
        documentId: "sheet_table__procurement",
        sourceFile: "Pack.xlsx › Procurement",
        element: "ESD",
        values: [{ field: "supplier_rows", value: supplierTable(23, 100_000) }],
      },
      {
        documentId: "finance",
        sourceFile: "Pack.xlsx › Finance",
        element: "ESD",
        values: [{ field: "total_measured_procurement_spend", value: 23 }],
      },
    ]);
    expect(result.meta["financial-information"]?.tmps).toBeUndefined();
    const conflict = result.metaConflicts.find((c) => c.column === "tmps");
    expect(conflict).toBeDefined();
    expect(conflict!.candidates.map((c) => c.value)).toEqual([23, 2_300_000]);
    expect(result.reconciliation.some((f) => f.column === "tmps" && /row count/.test(f.message))).toBe(true);
  });

  it("keeps a TMPS that plausibly contains the schedule", () => {
    const result = parserExtractionsToWorkbook([
      {
        documentId: "sheet_table__procurement",
        sourceFile: "Pack.xlsx › Procurement",
        element: "ESD",
        values: [{ field: "supplier_rows", value: supplierTable(5, 100_000) }],
      },
      {
        documentId: "finance",
        sourceFile: "Pack.xlsx › Finance",
        element: "ESD",
        values: [{ field: "total_measured_procurement_spend", value: 900_000 }],
      },
    ]);
    expect(result.meta["financial-information"]?.tmps).toBe(900_000);
    expect(result.metaConflicts.find((c) => c.column === "tmps")).toBeUndefined();
  });
});

describe("parserExtractionsToWorkbook — a labelled total outranks a resolver-settled column", () => {
  it("lets the Finance sheet's stated TMPS replace a row-count the resolver settled first", () => {
    const result = parserExtractionsToWorkbook(
      [
        {
          documentId: "procurement_spec",
          sourceFile: "Pack.xlsx › Procurement",
          element: "ESD",
          values: [{ field: "total_pre_exclusions_tmps", value: 23 }],
        },
        {
          documentId: "sheet_financials",
          sourceFile: "Pack.xlsx › Finance",
          element: "ESD",
          values: [{ field: "total_measured_procurement_spend", value: 4674994.56 }],
        },
      ],
      {
        resolved: {
          total_pre_exclusions_tmps: { value: 23, sources: ["Pack.xlsx › Procurement"], agreementCount: 1, conflicted: false, alternatives: [] },
        } as never,
      },
    );
    expect(result.meta["financial-information"]?.tmps).toBe(4674994.56);
    expect(result.metaConflicts.find((c) => c.column === "tmps")).toBeUndefined();
  });
});

describe("parserExtractionsToWorkbook — one person, one race", () => {
  it("takes the EE register's declared race onto an ownership row with the same ID", () => {
    const result = parserExtractionsToWorkbook([
      {
        documentId: "ownership",
        sourceFile: "Share Register.pdf",
        element: "OWNERSHIP",
        values: [
          { field: "shareholder_name", value: "Venugopal Lutchman Naidoo" },
          { field: "id_number", value: "5608305112083" },
          { field: "race", value: "Black" },
          { field: "voting_rights_percentage", value: 100 },
        ],
      },
      {
        documentId: "ee_register",
        sourceFile: "Pack.xlsx › Employment Equity",
        element: "MANAGEMENT_CONTROL",
        values: [
          { field: "employee_name", value: "Venugopal Lutchman Naidoo" },
          { field: "id_number", value: "5608305112083" },
          { field: "race", value: "Indian" },
          { field: "gender", value: "Male" },
          { field: "designation", value: "Member" },
        ],
      },
    ]);
    const owner = result.rows.ownership?.[0];
    expect(owner?.race).toBe("Indian");
    expect(result.reconciliation.some((f) => f.column === "race" && /EE register/.test(f.message))).toBe(true);
  });
});
