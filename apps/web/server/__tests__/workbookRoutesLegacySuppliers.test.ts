/**
 * Regression — persisted workbook JSON with the legacy `sections.suppliers`
 * key must still project into the canonical `suppliers` client output
 * (Task #18 area 9). `projectWorkbookToClient` merges rows from both
 * `procurement` and `suppliers` so old workbooks aren't silently dropped
 * after the May 2026 SECTIONS catalogue cleanup.
 */
import { describe, expect, it } from "vitest";
import { projectWorkbookToClient } from "../workbookRoutes";
import type { WorkbookData } from "../workbookRoutes";

function makeWorkbook(sections: Record<string, { rows: any[]; meta?: any }>): WorkbookData {
  return {
    companyId: "LEGACY",
    ownerOrganizationId: null,
    ownerUserId: "u1",
    sections,
    submittedAt: null,
    submittedByUserId: null,
    updatedAt: new Date().toISOString(),
  } as WorkbookData;
}

describe("projectWorkbookToClient — legacy persisted JSON with sections.suppliers", () => {
  it("merges rows from the legacy `suppliers` section into the canonical suppliers output", () => {
    const wb = makeWorkbook({
      suppliers: {
        rows: [
          {
            _id: "row-1",
            supplierName: "LegacyCo",
            currentSize: "EME",
            bbbeeLevel: "4",
            spend: 1000,
            currentBlackOwnership: 51,
            currentBlackFemaleOwnership: 30,
          },
        ],
      },
    });
    const out = projectWorkbookToClient(wb);
    expect(out.suppliers.length).toBe(1);
    expect(out.suppliers[0].supplierName).toBe("LegacyCo");
    expect(out.suppliers[0].spend).toBe(1000);
    expect(out.suppliers[0].bbbeeLevel).toBe(4);
  });

  it("dedupes by _id when the same row exists in both procurement and suppliers", () => {
    const sharedRow = {
      _id: "row-shared",
      supplierName: "Both",
      currentSize: "QSE",
      bbbeeLevel: "2",
      spend: 500,
    };
    const wb = makeWorkbook({
      procurement: { rows: [sharedRow] },
      suppliers: { rows: [sharedRow] },
    });
    const out = projectWorkbookToClient(wb);
    // Only one supplier emitted (procurement is walked first, suppliers
    // de-duped via the _id seen-set).
    expect(out.suppliers.filter((s) => s.supplierName === "Both").length).toBe(1);
  });

  it("merges distinct rows from procurement and the legacy suppliers section", () => {
    const wb = makeWorkbook({
      procurement: {
        rows: [
          { _id: "p1", supplierName: "NewCo", currentSize: "Large", spend: 999 },
        ],
      },
      suppliers: {
        rows: [
          { _id: "s1", supplierName: "OldCo", currentSize: "EME", spend: 111 },
        ],
      },
    });
    const out = projectWorkbookToClient(wb);
    const names = out.suppliers.map((s) => s.supplierName).sort();
    expect(names).toEqual(["NewCo", "OldCo"]);
  });

  it("never emits a `suppliers` SECTIONS key — but downstream output key is still `suppliers`", () => {
    // Defensive: even with no legacy data, the projection always exposes a
    // `suppliers` array on the client model (consumed by the scoring engine).
    const wb = makeWorkbook({});
    const out = projectWorkbookToClient(wb);
    expect(Array.isArray(out.suppliers)).toBe(true);
  });
});
