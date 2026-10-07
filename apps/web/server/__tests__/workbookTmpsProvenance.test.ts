/**
 * Decision F: a computed TMPS is never presented as if it were stated.
 *
 * projectWorkbookToClient used to set financials.tmps to the sum of supplier
 * spend whenever the workbook carried no TMPS. That is a fair stand-in when no
 * document ever stated one, but two other reasons leave the cell blank:
 *   - CONTESTED: two stated TMPS figures disagree, so the upload left it blank
 *     and told the user "nothing is scored from it until you pick one";
 *   - WITHDRAWN: the stated TMPS cell held #REF! (or failed the plausibility
 *     check), and the user was told it was not computed.
 * Filling the blank with the supplier sum in either case scored a figure the
 * screen had just promised was not there. And where the sum IS used, it must
 * say so, so nothing downstream shows it as the client's own figure.
 */
import { describe, expect, it } from "vitest";
import type { WorkbookData } from "../workbookRoutes";
import { projectWorkbookToClient } from "../workbookRoutes";

function workbook(finMeta: Record<string, unknown>): WorkbookData {
  return {
    companyId: "c1",
    sections: {
      "company-information": { meta: { industrySector: "RCOGP" } },
      "financial-information": { meta: finMeta },
      procurement: {
        rows: [
          { _id: "s1", supplierName: "Acme Trading", currentSize: "Generic", bbbeeLevel: "1", spend: 1_000_000 },
          { _id: "s2", supplierName: "Beta Logistics", currentSize: "QSE", bbbeeLevel: "2", spend: 234_567.89 },
        ],
      },
    },
  } as unknown as WorkbookData;
}

const financialsOf = (finMeta: Record<string, unknown>) =>
  projectWorkbookToClient(workbook(finMeta)).financials as unknown as Record<string, unknown>;

describe("TMPS provenance on the workbook projection", () => {
  it("leaves a CONTESTED TMPS blank instead of summing the suppliers", () => {
    const fin = financialsOf({
      _metaConflicts: [{
        column: "tmps",
        field: "total_measured_procurement_spend",
        candidates: [
          { value: 1_500_000, sources: ["Acme workbook v1.xlsx"] },
          { value: 1_750_000, sources: ["Acme workbook v2.xlsx"] },
        ],
      }],
    });
    expect(fin.tmps).toBe(0);
    expect(fin.tmpsHeld).toBe("contested");
    expect(fin.tmpsSource ?? null).toBeNull();
  });

  it("leaves a WITHDRAWN TMPS (#REF! cell) blank instead of summing the suppliers", () => {
    const fin = financialsOf({
      _metaWithdrawn: [{ column: "tmps", field: "total_measured_procurement_spend", reason: "TMPS cell holds #REF!" }],
    });
    expect(fin.tmps).toBe(0);
    expect(fin.tmpsHeld).toBe("withdrawn");
    expect(fin.tmpsSource ?? null).toBeNull();
  });

  it("still sums the suppliers when no document stated a TMPS, and says so", () => {
    const fin = financialsOf({});
    expect(fin.tmps).toBeCloseTo(1_234_567.89, 2);
    expect(fin.tmpsSource).toBe("supplier_spend_sum");
    expect(fin.tmpsHeld ?? null).toBeNull();
  });

  it("marks a stated TMPS as stated", () => {
    const fin = financialsOf({ tmps: 9_000_000 });
    expect(fin.tmps).toBe(9_000_000);
    expect(fin.tmpsSource).toBe("stated");
  });

  it("a conflict the user has since answered no longer holds the figure", () => {
    // The answered value is in the cell; a stale conflict entry must not blank it.
    const fin = financialsOf({
      tmps: 1_750_000,
      _metaConflicts: [{ column: "tmps", field: "x", candidates: [{ value: 1, sources: [] }, { value: 2, sources: [] }] }],
    });
    expect(fin.tmps).toBe(1_750_000);
    expect(fin.tmpsSource).toBe("stated");
  });

  it("a conflict on another figure does not hold TMPS", () => {
    const fin = financialsOf({
      _metaConflicts: [{ column: "revenue", field: "current_year_revenue", candidates: [] }],
    });
    expect(fin.tmpsSource).toBe("supplier_spend_sum");
  });
});
