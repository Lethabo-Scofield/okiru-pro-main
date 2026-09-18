/**
 * Imported suppliers have to move the score.
 *
 * Twenty suppliers were added to a live client's Procurement pillar and the
 * score did not change. Not a rounding difference — no change at all, on half
 * a million rand of recognised spend.
 *
 * The cause was one field. `calculateProcurementScore` reads
 *
 *     sup.isEmpoweringSupplier ?? (sup.beeLevel >= 1 && sup.beeLevel <= 8)
 *
 * and its comment is explicit that a stated false means strict exclusion. The
 * importer wrote `false` for every supplier, because the sheet had no
 * empowering-supplier column and the mapper read "absent" as "no". Every row
 * was therefore excluded from the spend that scores, while looking perfectly
 * correct in the table.
 *
 * So the test worth having is not "the field is undefined" — it is "the score
 * goes up". A mapping can be wrong in a hundred ways and this asks the only
 * question that matters about all of them.
 */
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { readSectionSheet } from "@/lib/workbookExcelNormalizer";
import { calculateProcurementScore } from "@toolkit/lib/calculators/procurement";
import { RCOGP_GENERIC_CALCULATOR_CONFIG } from "@toolkit/lib/sectors/rcogp-generic";
import { BULK_IMPORT_SPECS, type ParsedRow } from "../bulkImportSpecs";
import { coerceYesNo, coerceYesNoOrUnset } from "@/lib/yesNoValue";
import type { Supplier } from "@toolkit/lib/types";

/** A supplier register as a client sends it: no empowering-supplier column. */
function supplierSheet(count: number): ArrayBuffer {
  const rows: unknown[][] = [
    ["Procurement / Suppliers"],
    ["Supplier Name", "Spend (R)", "B-BBEE Level", "Current Company Size", "Black Ownership (%)"],
  ];
  for (let i = 1; i <= count; i += 1) {
    rows.push([`Supplier ${i}`, 25_000, i % 3 === 0 ? "1" : "4", i % 2 === 0 ? "QSE" : "EME", 51]);
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Procurement");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

function importSuppliers(count: number): Supplier[] {
  const spec = BULK_IMPORT_SPECS.procurement;
  const read = readSectionSheet(supplierSheet(count), spec.columns, {
    sectionKey: spec.sectionKey,
  });
  return read.rows.map((r) => spec.toEntity(r as ParsedRow));
}

function score(suppliers: Supplier[]) {
  const tmps = suppliers.reduce((sum, s) => sum + (s.spend ?? 0), 0);
  return calculateProcurementScore(
    { id: "p", clientId: "c", tmps, suppliers },
    RCOGP_GENERIC_CALCULATOR_CONFIG,
  );
}

describe("suppliers imported from a spreadsheet", () => {
  it("map with a real spend and a real level", () => {
    const suppliers = importSuppliers(20);
    expect(suppliers).toHaveLength(20);
    expect(suppliers.every((s) => s.spend === 25_000)).toBe(true);
    expect(suppliers.every((s) => s.beeLevel >= 1)).toBe(true);
  });

  /** The incident, as a number. */
  it("move the procurement score off zero", () => {
    const result = score(importSuppliers(20));
    expect(result.total).toBeGreaterThan(0);
  });

  it("count as spend from empowering suppliers, which is the line they belong on", () => {
    const result = score(importSuppliers(20));
    // This was 0: every row excluded by an answer the sheet never gave.
    expect(result.rawStats.empoweringSpend).toBeGreaterThan(0);
  });

  it("score higher as more of them are added", () => {
    const five = score(importSuppliers(5)).total;
    const twenty = score(importSuppliers(20)).total;
    expect(twenty).toBeGreaterThanOrEqual(five);
    expect(twenty).toBeGreaterThan(0);
  });

  /**
   * The other half of the rule. A sheet that DOES carry the column and says
   * "No" is making a statement, and it has to stick — otherwise the fix would
   * simply hand out the points the old bug withheld.
   */
  it("still exclude a supplier the sheet explicitly calls non-empowering", () => {
    const spec = BULK_IMPORT_SPECS.procurement;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Procurement / Suppliers"],
        ["Supplier Name", "Spend (R)", "B-BBEE Level", "Empowering Supplier"],
        ["Excluded Co", 500_000, "4", "No"],
      ]),
      "Procurement",
    );
    const read = readSectionSheet(
      XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer,
      spec.columns,
      { sectionKey: spec.sectionKey },
    );
    const suppliers = read.rows.map((r) => spec.toEntity(r as ParsedRow));

    expect(suppliers[0].isEmpoweringSupplier).toBe(false);
    expect(score(suppliers).rawStats.empoweringSpend).toBe(0);
  });
});

/**
 * The round trip, not just the import.
 *
 * The first fix made the score move and stopped there. But the store rebuilds
 * every supplier from the API on each load, and that rebuild coerced Yes/No
 * fields with a helper that answers false for undefined — so an import scored
 * correctly, and then went back to zero the moment the page reloaded. Fixing
 * the mapper without fixing the re-hydration would have demoed perfectly and
 * failed on the first refresh.
 */
describe("surviving a page reload", () => {
  /** What JSON.stringify sends, and therefore what comes back. */
  const overTheWire = (s: Supplier) => JSON.parse(JSON.stringify(s));

  it("does not store an answer the sheet never gave", () => {
    const [supplier] = importSuppliers(1);
    expect("isEmpoweringSupplier" in overTheWire(supplier)).toBe(false);
  });

  it("re-hydrates as unstated, not as no", () => {
    const stored = overTheWire(importSuppliers(1)[0]);
    // The helper the store used to use — this is the regression, exactly.
    expect(coerceYesNo(stored.isEmpoweringSupplier)).toBe(false);
    // The one it uses now.
    expect(coerceYesNoOrUnset(stored.isEmpoweringSupplier)).toBeUndefined();
  });

  it("still scores after a reload", () => {
    const reloaded = importSuppliers(20).map((s) => {
      const stored = overTheWire(s);
      return {
        ...stored,
        isEmpoweringSupplier: coerceYesNoOrUnset(stored.isEmpoweringSupplier),
      } as Supplier;
    });

    expect(score(reloaded).rawStats.empoweringSpend).toBeGreaterThan(0);
    expect(score(reloaded).total).toBeGreaterThan(0);
  });

  it("would have scored zero under the old coercion", () => {
    const reloadedTheOldWay = importSuppliers(20).map((s) => {
      const stored = overTheWire(s);
      return {
        ...stored,
        isEmpoweringSupplier: coerceYesNo(stored.isEmpoweringSupplier),
      } as Supplier;
    });

    // Proof the reload path was genuinely broken, not a theory about it.
    expect(score(reloadedTheOldWay).rawStats.empoweringSpend).toBe(0);
  });

  it("keeps an explicit no through a reload", () => {
    const stored = { isEmpoweringSupplier: false };
    expect(coerceYesNoOrUnset(stored.isEmpoweringSupplier)).toBe(false);
  });
});
