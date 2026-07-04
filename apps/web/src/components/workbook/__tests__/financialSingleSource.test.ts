/**
 * Regression — FINANCIAL_META does not have a separate `leviableAmount` field.
 * The downstream `leviableAmount` is derived as the FULL Total Payroll (the
 * skills-levy base) in `mapWorkbookFinancialsToClient` — verified against the
 * test workbooks (Kgodiso Financials: Total Payroll = Leviable Amount for
 * Skills = 96,000,000; "6% of leviable = R5,760,000"). There are no forecast
 * financial fields.
 */
import { describe, expect, it } from "vitest";
import { SECTIONS } from "../sections";
import { mapWorkbookFinancialsToClient } from "../workbookClientSync";

describe("FINANCIAL_META — leviableAmount not a separate input", () => {
  const finSection = SECTIONS.find((s) => s.key === "financial-information")!;
  const metaKeys = (finSection.meta ?? []).map((f) => f.key);

  it("does not collect leviableAmount as a separate input", () => {
    expect(metaKeys).not.toContain("leviableAmount");
  });

  it("does not collect forecast financial fields", () => {
    expect(metaKeys).not.toContain("forecastPayroll");
    expect(metaKeys).not.toContain("forecastRevenue");
    expect(metaKeys).not.toContain("forecastNpat");
  });

  it("still collects actual payroll", () => {
    expect(metaKeys).toContain("payroll");
  });
});

describe("mapWorkbookFinancialsToClient — leviableAmount = full payroll (levy base)", () => {
  const company = { industrySector: "RCOGP", scorecardType: "Generic" };

  it("derives leviableAmount as the full Total Payroll (workbook: Leviable = Total Payroll)", () => {
    const out = mapWorkbookFinancialsToClient(
      { revenue: 1_000_000, npat: 100_000, payroll: 4_000_000 },
      company,
    );
    // Leviable Amount for Skills = Total Payroll (skills-levy base), NOT the 1% SDL.
    expect(out.leviableAmount).toBe(4_000_000);
  });

  it("leviableAmount is 0 when payroll is absent", () => {
    const out = mapWorkbookFinancialsToClient(
      { revenue: 1_000_000, npat: 100_000 },
      company,
    );
    expect(out.leviableAmount).toBe(0);
  });

  it("uses actual revenue and npat (no forecast override)", () => {
    const out = mapWorkbookFinancialsToClient(
      { revenue: 5_000_000, npat: 500_000, payroll: 2_000_000 },
      company,
    );
    expect(out.revenue).toBe(5_000_000);
    expect(out.npat).toBe(500_000);
  });

  it("does not expose a second writable leviableAmount input on the form", () => {
    const finSection = SECTIONS.find((s) => s.key === "financial-information")!;
    expect((finSection.meta ?? []).filter((f) => f.key === "leviableAmount").length).toBe(0);
  });
});
