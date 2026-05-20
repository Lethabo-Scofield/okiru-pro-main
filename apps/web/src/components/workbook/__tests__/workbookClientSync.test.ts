import { describe, it, expect } from "vitest";
import { mapWorkbookFinancialsToClient } from "../workbookClientSync";

describe("mapWorkbookFinancialsToClient", () => {
  it("maps forecast financials to client scoring fields", () => {
    const financials = mapWorkbookFinancialsToClient(
      {
        revenue: 40_000_000,
        npat: 2_000_000,
        payroll: 4_000_000,
        forecastRevenue: 45_000_000,
        forecastNpat: 2_500_000,
        forecastPayroll: 4_500_000,
        tmps: 12_000_000,
      },
      {
        industrySector: "RCOGP",
        scorecardType: "QSE",
      },
    );

    expect(financials.revenue).toBe(45_000_000);
    expect(financials.npat).toBe(2_500_000);
    expect(financials.leviableAmount).toBe(4_500_000);
    expect(financials.tmps).toBe(12_000_000);
    expect(financials.scorecardType).toBe("QSE");
    expect(financials.industrySector).toBe("RCOGP");
    expect(financials.annualTurnover).toBe(45_000_000);
  });

  it("falls back to historical financials when forecast is absent", () => {
    const financials = mapWorkbookFinancialsToClient(
      {
        revenue: 80_000_000,
        npat: 5_000_000,
        payroll: 6_000_000,
      },
      {
        industrySector: "ICT",
        scorecardType: "Generic",
      },
    );

    expect(financials.revenue).toBe(80_000_000);
    expect(financials.npat).toBe(5_000_000);
    expect(financials.leviableAmount).toBe(6_000_000);
  });
});
