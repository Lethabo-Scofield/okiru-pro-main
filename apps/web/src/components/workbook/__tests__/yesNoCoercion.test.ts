/**
 * Regression — workbook Yes/No meta flags must coerce correctly through
 * mapWorkbookFinancialsToClient. Boolean("No") === true, so string yes/no values
 * (Excel imports, legacy rows) previously flipped flags like combineExcoSenior,
 * farmWorkersIncluded and fscReinsurer. coerceYesNo fixes the whole class.
 */
import { describe, expect, it } from "vitest";
import { mapWorkbookFinancialsToClient } from "../workbookClientSync";

const fin = { revenue: 1_000_000, npat: 100_000, payroll: 2_000_000 };

describe("workbookClientSync — Yes/No meta coercion", () => {
  it('treats string "No" as false (not truthy)', () => {
    const out = mapWorkbookFinancialsToClient(fin, {
      industrySector: "AGRI",
      scorecardType: "Generic",
      combineExcoSenior: "No",
      farmWorkersIncluded: "No",
      fscReinsurer: "No",
    });
    expect(out.combineExcoSenior).toBe(false);
    expect(out.farmWorkersIncluded).toBe(false);
    expect(out.fscReinsurer).toBe(false);
  });

  it('treats string "Yes" as true', () => {
    const out = mapWorkbookFinancialsToClient(fin, {
      industrySector: "AGRI",
      scorecardType: "Generic",
      combineExcoSenior: "Yes",
      farmWorkersIncluded: "Yes",
      fscReinsurer: "Yes",
    });
    expect(out.combineExcoSenior).toBe(true);
    expect(out.farmWorkersIncluded).toBe(true);
    expect(out.fscReinsurer).toBe(true);
  });

  it("still honours real booleans", () => {
    const out = mapWorkbookFinancialsToClient(fin, {
      industrySector: "AGRI",
      scorecardType: "Generic",
      combineExcoSenior: true,
      farmWorkersIncluded: false,
    });
    expect(out.combineExcoSenior).toBe(true);
    expect(out.farmWorkersIncluded).toBe(false);
  });
});
