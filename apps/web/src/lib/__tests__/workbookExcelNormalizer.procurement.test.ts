/**
 * Regression — Procurement parsing (Task #2).
 *
 * Pins the May 2026 hardening: spend header aliases, currency parsing,
 * supplier-size synonym map, and Procurement/Suppliers sheet dedupe.
 */
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { normalizeExcelBuffer, parseLooseNumber } from "../workbookExcelNormalizer";
import { SECTIONS } from "@/components/workbook/sections";

function makeBuffer(sheets: Record<string, unknown[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [name, matrix] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(matrix), name);
  }
  return XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}

describe("Procurement spend — header alias detection", () => {
  it.each([
    ["Rand Value"],
    ["Amount"],
    ["Spend"],
    ["Procurement Spend"],
    ["Supplier Spend"],
    ["RAND VALUE"],
    ["procurement_spend"],
    ["Supplier  Spend"],
    ["Total Spend"],
    ["Annual Spend"],
    ["Spend (R)"],
  ])("maps header '%s' onto the spend key", async (header) => {
    const buf = makeBuffer({
      Procurement: [
        ["Supplier Name", "Current Size", header],
        ["Acme", "Large", 1000],
      ],
    });
    const out = await normalizeExcelBuffer(buf);
    const rows = out.sections["procurement"]?.rows ?? [];
    expect(rows.length).toBe(1);
    expect(rows[0].spend).toBe(1000);
  });
});

describe("parseLooseNumber — Rand/currency parsing contract", () => {
  it("parses standard SA conventions", () => {
    expect(parseLooseNumber("R1,200.50")).toBe(1200.5);
    expect(parseLooseNumber("1 200,50")).toBe(1200.5);
    expect(parseLooseNumber("1200.50")).toBe(1200.5);
    expect(parseLooseNumber("R 1 200,50")).toBe(1200.5);
  });
  it("parses parenthesised negatives", () => {
    expect(parseLooseNumber("(R1,200.50)")).toBe(-1200.5);
    expect(parseLooseNumber("(1234)")).toBe(-1234);
  });
  it("returns null for empty / non-numeric input", () => {
    expect(parseLooseNumber("")).toBeNull();
    expect(parseLooseNumber(null)).toBeNull();
    expect(parseLooseNumber(undefined)).toBeNull();
    // The parser does NOT recognise '-' as zero; it returns null (empty after strip).
    expect(parseLooseNumber("-")).toBeNull();
  });
});

describe("currentSize — SUPPLIER_SIZE_MAP synonyms", () => {
  it.each([
    ["EME", "EME"],
    ["eme", "EME"],
    ["Exempt Micro Enterprise", "EME"],
    ["QSE", "QSE"],
    ["qualifying small enterprise", "QSE"],
    ["Large", "Large"],
    ["large enterprise", "Large"],
    ["Generic", "Large"], // documented mapping in SUPPLIER_SIZE_MAP
  ])("normalises '%s' -> '%s'", async (raw, expected) => {
    const buf = makeBuffer({
      Procurement: [
        ["Supplier Name", "Current Size", "Spend"],
        ["Acme", raw, 100],
      ],
    });
    const out = await normalizeExcelBuffer(buf);
    expect(out.sections["procurement"].rows[0].currentSize).toBe(expected);
  });

  it("leaves unmapped values untouched (UI <select> rejects them at render time)", async () => {
    const buf = makeBuffer({
      Procurement: [
        ["Supplier Name", "Current Size", "Spend"],
        ["Acme", "Mega Corp", 100],
      ],
    });
    const out = await normalizeExcelBuffer(buf);
    // Source contract: unknown size strings pass through verbatim.
    expect(out.sections["procurement"].rows[0].currentSize).toBe("Mega Corp");

    // Pin the option-set contract so a regression in SUPPLIER_SIZE_OPTIONS
    // (or accidentally including arbitrary text) is loud.
    const procurement = SECTIONS.find((s) => s.key === "procurement")!;
    const sizeCol = procurement.columns!.find((c) => c.key === "currentSize")!;
    expect(sizeCol.type).toBe("select");
    expect(sizeCol.options).toBeDefined();
    expect(sizeCol.options).not.toContain("Mega Corp");
    // NOTE: validateWorkbook does not currently emit issues for invalid
    // select values; the SpreadsheetGrid <select> is the rejection surface.
    // See follow-up Task #22 to surface a server-side validation issue.
  });
});

describe("Procurement vs Suppliers sheet dedupe", () => {
  it("routes both Suppliers and Procurement sheets to the canonical 'procurement' key", async () => {
    const buf = makeBuffer({
      Suppliers: [
        ["Supplier Name", "Current Size", "Spend"],
        ["Alpha", "EME", 100],
      ],
      Procurement: [
        ["Supplier Name", "Current Size", "Spend"],
        ["Beta", "QSE", 200],
      ],
    });
    const out = await normalizeExcelBuffer(buf);
    expect(out.sections["procurement"]).toBeDefined();
    // No standalone "suppliers" section should be emitted (May 2026 cleanup).
    expect(out.sections["suppliers"]).toBeUndefined();
    const names = out.sections["procurement"].rows.map((r) => r.supplierName).sort();
    expect(names).toEqual(["Alpha", "Beta"]);
  });
});
