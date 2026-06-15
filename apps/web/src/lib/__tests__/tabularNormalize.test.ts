import { describe, expect, it } from "vitest";
import type { ColumnDef } from "@/components/workbook/sections";
import {
  buildDeterministicMapping,
  normalizeCellForColumn,
  normalizeMatrix,
  toGridRows,
} from "../tabularNormalize";
import { buildFieldMapping } from "../columnMatch";

const COLUMNS: ColumnDef[] = [
  { key: "supplierName", label: "Supplier Name", type: "text", required: true },
  { key: "spend", label: "Spend (R)", type: "number" },
  { key: "currentBlackOwnership", label: "Black Ownership (%)", type: "number" },
  { key: "currentSize", label: "Size", type: "select", options: ["Generic", "QSE", "EME"] },
  {
    key: "bbbeeLevel",
    label: "B-BBEE Level",
    type: "select",
    options: ["1", "2", "3", "4", "5", "6", "7", "8", "Non-compliant"],
  },
  { key: "certificateExpiryDate", label: "Certificate Expiry", type: "date" },
  { key: "empoweringSupplier", label: "Empowering Supplier", type: "boolean" },
];

const col = (key: string) => COLUMNS.find((c) => c.key === key)!;

describe("normalizeCellForColumn — currency", () => {
  it("parses messy currency formats to plain numbers", () => {
    expect(normalizeCellForColumn("R1 000", col("spend")).value).toBe(1000);
    expect(normalizeCellForColumn("1,000.00", col("spend")).value).toBe(1000);
    expect(normalizeCellForColumn("1000", col("spend")).value).toBe(1000);
    expect(normalizeCellForColumn("R 1,234.50", col("spend")).value).toBe(1234.5);
    expect(normalizeCellForColumn("1.234,50", col("spend")).value).toBe(1234.5);
  });

  it("handles accounting-style negatives", () => {
    expect(normalizeCellForColumn("(500)", col("spend")).value).toBe(-500);
  });

  it("flags non-numeric values as errors instead of dropping them", () => {
    const cell = normalizeCellForColumn("not a number", col("spend"));
    expect(cell.value).toBe("");
    expect(cell.flag?.level).toBe("error");
  });
});

describe("normalizeCellForColumn — percentages", () => {
  it("normalizes 15%, 0.15 and 15 all to 15", () => {
    expect(normalizeCellForColumn("15%", col("currentBlackOwnership")).value).toBe(15);
    expect(normalizeCellForColumn("0.15", col("currentBlackOwnership")).value).toBe(15);
    expect(normalizeCellForColumn("15", col("currentBlackOwnership")).value).toBe(15);
  });

  it("flags out-of-range percentages", () => {
    const cell = normalizeCellForColumn("150", col("currentBlackOwnership"));
    expect(cell.flag?.level).toBe("warning");
  });
});

describe("normalizeCellForColumn — booleans", () => {
  it("accepts Y/Yes/true/1 as true and N/No/false/0 as false", () => {
    for (const t of ["Y", "Yes", "true", "1", "TRUE"]) {
      expect(normalizeCellForColumn(t, col("empoweringSupplier")).value).toBe(true);
    }
    for (const f of ["N", "No", "false", "0", ""]) {
      expect(normalizeCellForColumn(f, col("empoweringSupplier")).value).toBe(false);
    }
  });

  it("flags an ambiguous boolean", () => {
    const cell = normalizeCellForColumn("maybe", col("empoweringSupplier"));
    expect(cell.value).toBe(false);
    expect(cell.flag?.level).toBe("warning");
  });
});

describe("normalizeCellForColumn — dates", () => {
  it("parses multiple date formats to ISO yyyy-mm-dd", () => {
    expect(normalizeCellForColumn("2024-03-15", col("certificateExpiryDate")).value).toBe("2024-03-15");
    expect(normalizeCellForColumn("15/03/2024", col("certificateExpiryDate")).value).toBe("2024-03-15");
    expect(normalizeCellForColumn("15 March 2024", col("certificateExpiryDate")).value).toBe("2024-03-15");
    expect(normalizeCellForColumn("March 15, 2024", col("certificateExpiryDate")).value).toBe("2024-03-15");
  });

  it("flags an unparseable date but keeps the raw text", () => {
    const cell = normalizeCellForColumn("sometime soon", col("certificateExpiryDate"));
    expect(cell.flag?.level).toBe("warning");
  });
});

describe("normalizeCellForColumn — enterprise size & level codes", () => {
  it("maps EME/QSE/Generic variants to canonical options", () => {
    expect(normalizeCellForColumn("eme", col("currentSize")).value).toBe("EME");
    expect(normalizeCellForColumn("Qualifying Small Enterprise", col("currentSize")).value).toBe("QSE");
    expect(normalizeCellForColumn("Generic", col("currentSize")).value).toBe("Generic");
    expect(normalizeCellForColumn("Large", col("currentSize")).value).toBe("Generic");
  });

  it("maps level variants", () => {
    expect(normalizeCellForColumn("Level 4", col("bbbeeLevel")).value).toBe("4");
    expect(normalizeCellForColumn("non-compliant", col("bbbeeLevel")).value).toBe("Non-compliant");
  });

  it("flags an unknown select value (uncertain) without dropping it", () => {
    const cell = normalizeCellForColumn("Mega Corp", col("currentSize"));
    expect(cell.flag?.level).toBe("warning");
    expect(cell.value).toBe("Mega Corp");
  });
});

describe("normalizeCellForColumn — empty / placeholder", () => {
  it("treats placeholders as blank", () => {
    expect(normalizeCellForColumn("-", col("supplierName")).value).toBe("");
    expect(normalizeCellForColumn("N/A", col("spend")).value).toBe("");
    expect(normalizeCellForColumn("none", col("currentSize")).value).toBe("");
  });
});

describe("buildDeterministicMapping — header variants & reordering", () => {
  it("matches synonyms in any column order", () => {
    const headers = ["Vendor", "BEE Level", "Amount", "Black ownership", "Expiry", "Empowering", "Size"];
    const mapping = buildDeterministicMapping(headers, COLUMNS);
    const byHeader = Object.fromEntries(mapping.map((m) => [m.sourceHeader, m.targetKey]));
    expect(byHeader["Vendor"]).toBe("supplierName");
    expect(byHeader["Amount"]).toBe("spend");
    expect(byHeader["Black ownership"]).toBe("currentBlackOwnership");
    expect(byHeader["Size"]).toBe("currentSize");
    expect(byHeader["BEE Level"]).toBe("bbbeeLevel");
    expect(byHeader["Expiry"]).toBe("certificateExpiryDate");
    expect(byHeader["Empowering"]).toBe("empoweringSupplier");
  });

  it("never assigns the same target field to two columns", () => {
    const headers = ["Supplier Name", "Supplier"];
    const mapping = buildFieldMapping(headers, COLUMNS);
    const claimed = mapping.filter((m) => m.targetKey === "supplierName");
    expect(claimed.length).toBe(1);
  });

  it("leaves unrecognized headers unmapped", () => {
    const mapping = buildDeterministicMapping(["Supplier Name", "Lucky Number"], COLUMNS);
    const lucky = mapping.find((m) => m.sourceHeader === "Lucky Number");
    expect(lucky?.targetKey).toBeNull();
  });
});

describe("normalizeMatrix — full pipeline", () => {
  it("normalizes a header-mapped paste with reordered columns", () => {
    const matrix = [
      ["Vendor", "Amount", "Size", "Black ownership"],
      ["Acme (Pty) Ltd", "R1 000 000", "qse", "51%"],
      ["Beta CC", "2,500,000", "Generic", "0.3"],
    ];
    const result = normalizeMatrix(matrix, COLUMNS);
    expect(result.headerRowDetected).toBe(true);
    expect(result.rows).toHaveLength(2);

    const rows = toGridRows(result, COLUMNS);
    expect(rows[0].supplierName).toBe("Acme (Pty) Ltd");
    expect(rows[0].spend).toBe(1000000);
    expect(rows[0].currentSize).toBe("QSE");
    expect(rows[0].currentBlackOwnership).toBe(51);
    expect(rows[1].spend).toBe(2500000);
    expect(rows[1].currentSize).toBe("Generic");
    expect(rows[1].currentBlackOwnership).toBe(30);
  });

  it("supports header-less positional paste from an anchor column", () => {
    const matrix = [["EME", "Level 1"]];
    const result = normalizeMatrix(matrix, COLUMNS, {
      hasHeaderRow: false,
      startColIndex: 3, // currentSize
    });
    const rows = toGridRows(result, COLUMNS);
    expect(rows[0].currentSize).toBe("EME");
    expect(rows[0].bbbeeLevel).toBe("1");
  });

  it("surfaces unmapped headers without dropping mapped data", () => {
    const matrix = [
      ["Supplier Name", "Mystery Column"],
      ["Acme", "ignore me"],
    ];
    const result = normalizeMatrix(matrix, COLUMNS);
    expect(result.unmappedHeaders).toContain("Mystery Column");
    expect(toGridRows(result, COLUMNS)[0].supplierName).toBe("Acme");
  });

  it("collects per-cell validation flags", () => {
    const matrix = [
      ["Supplier Name", "Spend (R)", "Size"],
      ["Acme", "oops", "Mega Corp"],
    ];
    const result = normalizeMatrix(matrix, COLUMNS);
    const flagged = result.rows[0];
    expect(flagged.cells.spend.flag?.level).toBe("error");
    expect(flagged.cells.currentSize.flag?.level).toBe("warning");
    expect(result.stats.flaggedCells).toBeGreaterThanOrEqual(2);
  });

  it("handles large pastes without dropping rows", () => {
    const header = ["Supplier Name", "Spend (R)"];
    const body = Array.from({ length: 2000 }, (_, i) => [`Supplier ${i}`, String(i * 10)]);
    const result = normalizeMatrix([header, ...body], COLUMNS);
    expect(result.rows).toHaveLength(2000);
  });

  it("normalizeMatrix preserves empty middle cells", () => {
    const cols: ColumnDef[] = [
      { key: "first", label: "First", type: "text" },
      { key: "middle", label: "Middle", type: "text" },
      { key: "last", label: "Last", type: "text" },
    ];
    const result = normalizeMatrix([["a", "", "b"]], cols, { hasHeaderRow: false, startColIndex: 0 });
    const rows = toGridRows(result, cols);
    expect(rows[0]).toMatchObject({ first: "a", middle: "", last: "b" });
  });

  it("does not treat a single-column designation paste as a header row", () => {
    const designationCols: ColumnDef[] = [
      { key: "designation", label: "Designation", type: "select", options: ["Senior Manager", "Middle Manager"] },
    ];
    const matrix = [["Senior Manager"], ["Middle Manager"], ["Junior Manager"]];
    const result = normalizeMatrix(matrix, designationCols, { startColIndex: 0 });
    expect(result.headerRowDetected).toBe(false);
    expect(result.rows).toHaveLength(3);
  });
});
