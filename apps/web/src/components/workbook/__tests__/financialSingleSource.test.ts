/**
 * Regression — FINANCIAL_META does not have a separate `leviableAmount` field.
 * The downstream `leviableAmount` is always derived as `payroll × 1%` in
 * `mapWorkbookFinancialsToClient`. There are no forecast financial fields.
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

describe("mapWorkbookFinancialsToClient — leviableAmount = payroll × 1%", () => {
  const company = { industrySector: "RCOGP", scorecardType: "Generic" };

  it("derives leviableAmount as exactly 1% of payroll", () => {
    const out = mapWorkbookFinancialsToClient(
      { revenue: 1_000_000, npat: 100_000, payroll: 4_000_000 },
      company,
    );
    // 4 000 000 × 1% = 40 000
    expect(out.leviableAmount).toBe(40_000);
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
