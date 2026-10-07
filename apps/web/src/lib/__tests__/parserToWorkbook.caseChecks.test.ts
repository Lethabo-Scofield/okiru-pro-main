/**
 * Whole-case cross-checks, each measured on a real pack before it was written:
 *
 *   - TMPS read as 23 on a schedule summing to R3.3M (SheetJS's error code for
 *     a #REF! cell; the schedule's row count matched it by coincidence).
 *   - Two workbooks each stating their own TMPS: the first one read used to
 *     win silently, so the score depended on upload order.
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
          values: [{ field: "total_measured_procurement_spend", value: 23 }],
        },
        {
          documentId: "sheet_financials",
          sourceFile: "Pack.xlsx › Finance",
          element: "ESD",
          values: [{ field: "total_measured_procurement_spend", value: 5123456.78 }],
        },
      ],
      {
        resolved: {
          total_measured_procurement_spend: { value: 23, sources: ["Pack.xlsx › Procurement"], agreementCount: 1, conflicted: false, alternatives: [] },
        } as never,
      },
    );
    expect(result.meta["financial-information"]?.tmps).toBe(5123456.78);
    expect(result.metaConflicts.find((c) => c.column === "tmps")).toBeUndefined();
  });
});

describe("parserExtractionsToWorkbook — two workbooks each STATE a TMPS", () => {
  const stated = (sourceFile: string, value: number) => ({
    documentId: "sheet_financials",
    sourceFile,
    element: "ESD",
    values: [{ field: "total_measured_procurement_spend", value }],
  });
  const orders = <T,>(items: T[]) => [items, [...items].reverse()];

  it("opens a conflict when they disagree, whichever is uploaded first", () => {
    for (const extractions of orders([
      stated("Supplier Spend_FY2030.xlsm › Finance", 5123456.78),
      stated("Gathering_v2.xlsx › Finance", 4100000),
    ])) {
      const result = parserExtractionsToWorkbook(extractions);
      expect(result.meta["financial-information"]?.tmps).toBeUndefined();
      const conflict = result.metaConflicts.find((c) => c.column === "tmps");
      expect(conflict).toBeDefined();
      expect(conflict!.candidates.map((c) => Number(c.value)).sort()).toEqual([4100000, 5123456.78]);
    }
  });

  it("corroborates them when they agree", () => {
    const result = parserExtractionsToWorkbook([
      stated("Supplier Spend_FY2030.xlsm › Finance", 5123456.78),
      stated("Gathering File_FY2030.xlsm › Finance", 5123456.780000001),
    ]);
    expect(result.meta["financial-information"]?.tmps).toBeCloseTo(5123456.78, 2);
    expect(result.metaConflicts.find((c) => c.column === "tmps")).toBeUndefined();
    expect(result.metaCorroboration.find((c) => c.column === "tmps")?.agreementCount).toBe(2);
  });

  it("settles two stated figures against one far-off reading, in either order", () => {
    // A stale 23 from an older parser run next to two workbooks stating the
    // same figure: corroboration settles it the same way whatever came first.
    for (const extractions of orders([
      stated("Gathering_Updated.xlsx › Finance", 23),
      stated("Supplier Spend_FY2030.xlsm › Finance", 5123456.78),
      stated("Gathering File_FY2030.xlsm › Finance", 5123456.78),
    ])) {
      const result = parserExtractionsToWorkbook(extractions);
      expect(result.meta["financial-information"]?.tmps).toBeCloseTo(5123456.78, 2);
      expect(result.metaConflicts.find((c) => c.column === "tmps")).toBeUndefined();
    }
  });

  it("gives a model-computed figure no vote in a dispute between stated ones", () => {
    const result = parserExtractionsToWorkbook([
      stated("Supplier Spend_FY2030.xlsm › Finance", 5123456.78),
      stated("Gathering_v2.xlsx › Finance", 4100000),
      {
        documentId: "esd__audited_financial_statements",
        sourceFile: "afs.pdf",
        element: "ESD",
        values: [{ field: "total_measured_procurement_spend", value: 9200000 }],
      },
    ]);
    const conflict = result.metaConflicts.find((c) => c.column === "tmps");
    expect(conflict!.candidates.map((c) => Number(c.value))).not.toContain(9200000);
  });

  it("keeps an open stated-TMPS conflict offered when a later reading of 23 arrives", () => {
    // The resolver already holds an open TMPS question between two stated
    // figures; a later reading of 23 then fails the schedule check. The stated
    // figures must still be offered alongside the schedule's lower bound.
    const result = parserExtractionsToWorkbook(
      [
        {
          documentId: "procurement_spec",
          sourceFile: "Pack.xlsx › Procurement",
          element: "ESD",
          values: [
            { field: "total_measured_procurement_spend", value: 5123456.78 },
            { field: "supplier_rows", value: supplierTable(23, 100_000) },
          ],
        },
        {
          documentId: "finance",
          sourceFile: "Pack.xlsx › Finance",
          element: "ESD",
          values: [{ field: "total_measured_procurement_spend", value: 23 }],
        },
      ],
      {
        resolved: {
          total_measured_procurement_spend: {
            value: 5123456.78,
            sources: ["a.xlsm › Finance"],
            agreementCount: 1,
            conflicted: true,
            alternatives: [{ value: 4100000, sources: ["b.xlsx › Finance"] }],
          },
        } as never,
      },
    );
    // Only one parser field now feeds the TMPS cell (the pre-exclusions total
    // no longer does), so the resolver's open question covers the later
    // reading of 23 too: it never lands, and the stated figures stay offered.
    expect(result.meta["financial-information"]?.tmps).toBeUndefined();
    const values = result.metaConflicts.find((c) => c.column === "tmps")!.candidates.map((c) => Number(c.value));
    expect(values).toEqual(expect.arrayContaining([5123456.78, 4100000]));
    expect(values).not.toContain(23);
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
