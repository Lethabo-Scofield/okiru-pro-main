import { describe, expect, it } from "vitest";
import {
  pruneFinancialMetaForFscSubSector,
  pruneFinancialMetaWhenLeavingFsc,
} from "../fscWorkbookMeta";

describe("fscWorkbookMeta", () => {
  it("strips all AFS keys from financial-information meta", () => {
    const meta = {
      revenue: 1,
      afsTransactionPointCoverage: 80,
      afsCommercialEquipment: true,
    };
    const pruned = pruneFinancialMetaForFscSubSector(meta, "Short-Term Insurers");
    expect(pruned.afsTransactionPointCoverage).toBeUndefined();
    expect(pruned.afsCommercialEquipment).toBeUndefined();
    expect(pruned.revenue).toBe(1);
  });

  it("strips FSC-only financial keys when leaving FSC sector", () => {
    const meta = {
      priorYearRevenue: 100,
      afsTransactionPointCoverage: 50,
      npat: 10,
    };
    const pruned = pruneFinancialMetaWhenLeavingFsc(meta);
    expect(pruned.priorYearRevenue).toBeUndefined();
    expect(pruned.afsTransactionPointCoverage).toBeUndefined();
    expect(pruned.npat).toBe(10);
  });
});
