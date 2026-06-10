import { describe, it, expect } from "vitest";
import { mapWorkbookFinancialsToClient } from "../workbookClientSync";

describe("mapWorkbookFinancialsToClient", () => {
  it("maps actual financials to client scoring fields (forecast fields are ignored)", () => {
    const financials = mapWorkbookFinancialsToClient(
      {
        revenue: 40_000_000,
        npat: 2_000_000,
        payroll: 4_000_000,
        tmps: 12_000_000,
      },
      {
        industrySector: "RCOGP",
        scorecardType: "QSE",
      },
    );

    // Actual values only — no forecast fallback.
    expect(financials.revenue).toBe(40_000_000);
    expect(financials.npat).toBe(2_000_000);
    // Leviable Amount = payroll × 1%.
    expect(financials.leviableAmount).toBe(40_000);
    expect(financials.tmps).toBe(12_000_000);
    expect(financials.scorecardType).toBe("QSE");
    expect(financials.industrySector).toBe("RCOGP");
    expect(financials.annualTurnover).toBe(40_000_000);
  });

  it("derives leviableAmount as 1% of payroll", () => {
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
    // 6 000 000 × 1% = 60 000
    expect(financials.leviableAmount).toBe(60_000);
  });

  it("skips skills EAP province/year for QSE scorecards", () => {
    const financials = mapWorkbookFinancialsToClient(
      { revenue: 1, npat: 1, payroll: 1_000_000 },
      { industrySector: "RCOGP", scorecardType: "QSE" },
      { eapProvince: "Gauteng", eapYear: 2025, headcount: 50 },
    );
    expect(financials.eapProvince).toBeUndefined();
    expect(financials.eapYear).toBeUndefined();
    expect(financials.headcount).toBe(50);
  });

  it("maps skills EAP province/year for Generic scorecards", () => {
    const financials = mapWorkbookFinancialsToClient(
      { revenue: 1, npat: 1, payroll: 1_000_000 },
      { industrySector: "RCOGP", scorecardType: "Generic" },
      { eapProvince: "Gauteng", eapYear: 2025 },
    );
    expect(financials.eapProvince).toBe("Gauteng");
    expect(financials.eapYear).toBe(2025);
  });

  it("maps FSC AFS inputs from afs-additions meta", () => {
    const financials = mapWorkbookFinancialsToClient(
      { revenue: 1, npat: 1, payroll: 1_000_000 },
      { industrySector: "FSC", scorecardType: "Generic", fscSubSector: "Banks" },
      undefined,
      undefined,
      { afsTransactionPointCoverage: 85, afsElectronicAccessCompliant: true },
    );
    expect(financials.afs?.transactionPointCoverage).toBe(85);
    expect(financials.afs?.electronicAccessCompliant).toBe(true);
  });

  it("resolves industry norm from sector when meta omits industryNormPercent", () => {
    const financials = mapWorkbookFinancialsToClient(
      { revenue: 10_000_000, npat: 50_000, payroll: 1_000_000 },
      { industrySector: "ICT", scorecardType: "Generic" },
    );
    expect(financials.industryNormPercent).toBe(10);
  });

  it("falls back to legacy AFS fields on financial-information meta", () => {
    const financials = mapWorkbookFinancialsToClient(
      {
        revenue: 1,
        npat: 1,
        payroll: 1_000_000,
        afsTransactionPointCoverage: 70,
      },
      { industrySector: "FSC", scorecardType: "Generic", fscSubSector: "Banks" },
    );
    expect(financials.afs?.transactionPointCoverage).toBe(70);
  });
});
