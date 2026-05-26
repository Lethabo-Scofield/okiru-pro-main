/**
 * Regression — FINANCIAL_META no longer has a separate `leviableAmount` field
 * (Task #3 / May 2026 removal). The downstream `leviableAmount` is derived in
 * one place — `mapWorkbookFinancialsToClient` — from `forecastPayroll` (preferred)
 * with `payroll` as fallback.
 */
import { describe, expect, it } from "vitest";
import { SECTIONS } from "../sections";
import { mapWorkbookFinancialsToClient } from "../workbookClientSync";

describe("FINANCIAL_META — leviableAmount removed", () => {
  const finSection = SECTIONS.find((s) => s.key === "financial-information")!;
  const metaKeys = (finSection.meta ?? []).map((f) => f.key);

  it("does not collect leviableAmount as a separate input", () => {
    expect(metaKeys).not.toContain("leviableAmount");
  });

  it("still collects the canonical inputs we derive from", () => {
    expect(metaKeys).toContain("payroll");
    expect(metaKeys).toContain("forecastPayroll");
  });
});

describe("mapWorkbookFinancialsToClient — single derivation point", () => {
  const company = { industrySector: "RCOGP", scorecardType: "Generic" };

  it("prefers forecastPayroll for leviableAmount", () => {
    const out = mapWorkbookFinancialsToClient(
      { revenue: 1_000_000, npat: 100_000, payroll: 4_000_000, forecastPayroll: 10_000_000 },
      company,
    );
    expect(out.leviableAmount).toBe(10_000_000);
  });

  it("falls back to legacy leviableAmount only when forecastPayroll is absent", () => {
    const out = mapWorkbookFinancialsToClient(
      { revenue: 1_000_000, npat: 100_000, leviableAmount: 7_000_000 },
      company,
    );
    expect(out.leviableAmount).toBe(7_000_000);
  });

  it("falls back to payroll when neither forecast nor legacy leviableAmount is set", () => {
    const out = mapWorkbookFinancialsToClient(
      { revenue: 1_000_000, npat: 100_000, payroll: 4_000_000 },
      company,
    );
    expect(out.leviableAmount).toBe(4_000_000);
  });

  it("does not expose a second writable leviableAmount input on the form", () => {
    // Combined with the FINANCIAL_META test above, this is the negative
    // assertion: a user cannot enter two conflicting payroll values because
    // the second field literally does not exist on the form.
    const finSection = SECTIONS.find((s) => s.key === "financial-information")!;
    // The Forecast Payroll label intentionally documents "(used as Leviable
    // Amount for Skills)" so users know where the value flows — but there is
    // no separate field with that key.
    expect((finSection.meta ?? []).filter((f) => f.key === "leviableAmount").length).toBe(0);
  });
});
