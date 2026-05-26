/**
 * Regression — legacy "Suppliers" sheet / section compatibility (Task #2).
 *
 * Before May 2026 the workbook had a separate `suppliers` section in addition
 * to `procurement`. The cleanup routes everything to `procurement` while still
 * preserving any persisted `suppliers` rows so legacy workbooks aren't lost.
 */
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { normalizeExcelBuffer } from "../workbookExcelNormalizer";
import { SECTIONS } from "@/components/workbook/sections";

function makeBuffer(sheets: Record<string, unknown[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [name, matrix] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(matrix), name);
  }
  return XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}

describe("Legacy 'Suppliers' Excel sheet", () => {
  it("is surfaced under the canonical 'procurement' section without data loss", async () => {
    const buf = makeBuffer({
      Suppliers: [
        ["Supplier Name", "Current Size", "Spend", "B-BBEE Level"],
        ["Alpha", "EME", 100, "4"],
        ["Beta", "QSE", 250, "2"],
        ["Gamma", "Large", 500, "1"],
      ],
    });
    const out = await normalizeExcelBuffer(buf);

    expect(out.sections["procurement"]).toBeDefined();
    expect(out.sections["suppliers"]).toBeUndefined();

    const rows = out.sections["procurement"].rows;
    expect(rows.length).toBe(3);
    const names = rows.map((r) => r.supplierName);
    expect(names).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(rows.find((r) => r.supplierName === "Alpha")!.spend).toBe(100);
    expect(rows.find((r) => r.supplierName === "Beta")!.bbbeeLevel).toBe("2");
  });
});

describe("SECTIONS catalogue — no separate suppliers section", () => {
  it("only exposes 'procurement' (suppliers was removed in May 2026)", () => {
    const keys = SECTIONS.map((s) => s.key);
    expect(keys).toContain("procurement");
    expect(keys).not.toContain("suppliers");
  });
});

describe("Round-trip — new workbook uses only 'procurement'", () => {
  it("normalises both Procurement and Suppliers sheets into a single canonical key", async () => {
    const buf = makeBuffer({
      Procurement: [
        ["Supplier Name", "Current Size", "Spend"],
        ["NewCo", "QSE", 999],
      ],
      Suppliers: [
        ["Supplier Name", "Current Size", "Spend"],
        ["OldCo", "EME", 111],
      ],
    });
    const out = await normalizeExcelBuffer(buf);
    expect(Object.keys(out.sections)).toContain("procurement");
    expect(Object.keys(out.sections)).not.toContain("suppliers");
    expect(out.sections["procurement"].rows.length).toBe(2);
  });
});
