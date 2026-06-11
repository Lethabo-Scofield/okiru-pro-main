import { describe, it, expect } from "vitest";
import { SECTIONS, SUPPLIER_SIZE_MAP } from "../sections";
import { normalizeExcelBuffer } from "../../../lib/workbookExcelNormalizer";
import * as XLSX from "xlsx";

/**
 * Regression suite for T004 — Workbook supplier size term "Large" -> "Generic".
 *
 * The Information Request workbook now offers {Generic, QSE, EME} as the supplier
 * size enum (matching the BBBEE codes' generic-scorecard terminology). Legacy
 * uploads / records that say "Large" must still normalise cleanly to "Generic"
 * so historical data is not lost.
 */

function makeBuffer(sheets: Record<string, any[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  }
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return out as ArrayBuffer;
}

describe("T004 — supplier size option set is Generic/QSE/EME", () => {
  const procurement = SECTIONS.find((s) => s.key === "procurement")!;

  it("currentSize options are exactly [Generic, QSE, EME] and contain no 'Large'", () => {
    const col = procurement.columns!.find((c) => c.key === "currentSize")!;
    expect(col.options).toEqual(["Generic", "QSE", "EME"]);
    expect(col.options).not.toContain("Large");
  });

  it("sizeAtFirstProcurement (when present) also uses Generic, not Large", () => {
    const col = procurement.columns!.find((c) => c.key === "sizeAtFirstProcurement");
    if (col?.options) {
      expect(col.options).toContain("Generic");
      expect(col.options).not.toContain("Large");
    }
  });
});

describe("T004 — SUPPLIER_SIZE_MAP normalises legacy & current terms to Generic", () => {
  it.each([
    ["large", "Generic"],
    ["largeenterprise", "Generic"],
    ["generic", "Generic"],
    ["l", "Generic"],
  ])("maps '%s' -> '%s'", (key, expected) => {
    expect(SUPPLIER_SIZE_MAP[key]).toBe(expected);
  });

  it("does not map any synonym to the retired 'Large' term", () => {
    expect(Object.values(SUPPLIER_SIZE_MAP)).not.toContain("Large");
  });

  it("leaves the EME / QSE synonyms intact", () => {
    expect(SUPPLIER_SIZE_MAP["eme"]).toBe("EME");
    expect(SUPPLIER_SIZE_MAP["qse"]).toBe("QSE");
  });
});

describe("T004 — Excel import normalises supplier size to Generic", () => {
  it.each([
    ["Large", "Generic"],
    ["large enterprise", "Generic"],
    ["Generic", "Generic"],
    ["QSE", "QSE"],
    ["EME", "EME"],
  ])("upload size '%s' normalises to '%s'", async (raw, expected) => {
    const buf = makeBuffer({
      Procurement: [
        ["Supplier Name", "Current Size", "Spend"],
        ["Acme", raw, 1000],
      ],
    });
    const out = await normalizeExcelBuffer(buf);
    expect(out.sections["procurement"].rows[0].currentSize).toBe(expected);
  });
});
