import { describe, it, expect } from "vitest";
import { validateWorkbook } from "../workbookValidation";

describe("validateWorkbook", () => {
  it("requires TMPS when procurement rows have spend", () => {
    const issues = validateWorkbook({
      "financial-information": { meta: { revenue: 1_000_000, npat: 100_000, payroll: 500_000, forecastRevenue: 1_100_000, forecastNpat: 110_000, forecastPayroll: 550_000 } },
      procurement: {
        rows: [
          {
            _id: "r1",
            supplierName: "Acme",
            currentSize: "QSE",
            spend: 50_000,
          },
        ],
      },
    });
    expect(issues.some((i) => i.field === "tmps")).toBe(true);
  });

  it("rejects invalid sector codes in company meta", () => {
    const issues = validateWorkbook({
      "company-information": { meta: { companyName: "Test Co", industrySector: "INVALID" } },
      "financial-information": {
        meta: {
          revenue: 1,
          npat: 1,
          payroll: 1,
          forecastRevenue: 1,
          forecastNpat: 1,
          forecastPayroll: 1,
        },
      },
    });
    expect(issues.some((i) => i.field === "industrySector")).toBe(true);
  });

  it("accepts valid minimal financial meta without supplier spend", () => {
    const issues = validateWorkbook({
      "financial-information": {
        meta: {
          revenue: 1_000_000,
          npat: 100_000,
          payroll: 500_000,
          forecastRevenue: 1_100_000,
          forecastNpat: 110_000,
          forecastPayroll: 550_000,
        },
      },
    });
    expect(issues).toHaveLength(0);
  });
});
