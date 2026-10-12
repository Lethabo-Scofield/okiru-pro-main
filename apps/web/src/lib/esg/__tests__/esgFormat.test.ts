/**
 * One way to write a number, a field name, a date and an element on every ESG
 * screen. "8,6" beside "1,630" read two ways; "Electricity kwh" and a raw
 * "2025-07-31" read as a debug console.
 */
import { describe, expect, it } from "vitest";
import {
  esgElementLabel,
  esgFieldLabel,
  formatEsgDate,
  formatEsgNumber,
  formatEsgScalar,
  isEsgParserOutput,
} from "../esgFormat";

const NB = " ";

describe("formatEsgNumber", () => {
  it("groups thousands with a space and writes decimals with a point", () => {
    expect(formatEsgNumber(14820)).toBe(`14${NB}820`);
    expect(formatEsgNumber(1630)).toBe(`1${NB}630`);
    expect(formatEsgNumber(8.6)).toBe("8.6");
    expect(formatEsgNumber(1234567.891)).toBe(`1${NB}234${NB}567.89`);
    expect(formatEsgNumber(-3.5)).toBe("-3.5");
  });

  it("caps the decimals and drops trailing zeros", () => {
    expect(formatEsgNumber(4.3684)).toBe("4.37");
    expect(formatEsgNumber(4.3684, 1)).toBe("4.4");
    expect(formatEsgNumber(12)).toBe("12");
  });

  it("never prints NaN or Infinity", () => {
    expect(formatEsgNumber(Number.NaN)).toBe("—");
    expect(formatEsgNumber(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

describe("esgFieldLabel", () => {
  it("writes units the way they are written, in sentence case", () => {
    expect(esgFieldLabel("electricity_kwh")).toBe("Electricity kWh");
    expect(esgFieldLabel("water_kl")).toBe("Water kL");
    expect(esgFieldLabel("max_demand_kva")).toBe("Max demand kVA");
    expect(esgFieldLabel("scope1_tco2e")).toBe("Scope1 tCO2e");
    expect(esgFieldLabel("ltifr")).toBe("LTIFR");
    expect(esgFieldLabel("billing_period_end")).toBe("Billing period end");
  });

  it("names a namespaced key by its last part", () => {
    expect(esgFieldLabel("energy.site_name")).toBe("Site name");
    expect(esgFieldLabel("fleet.diesel_litres")).toBe("Diesel litres");
  });
});

describe("formatEsgScalar", () => {
  it("reads an ISO date as a date", () => {
    expect(formatEsgDate("2025-07-31")).toBe("31 Jul 2025");
    expect(formatEsgScalar("2025-07-31")).toBe("31 Jul 2025");
    expect(formatEsgDate("31/07/2025")).toBeNull();
  });

  it("writes numbers, and numbers written as text, by the one rule", () => {
    expect(formatEsgScalar(14820)).toBe(`14${NB}820`);
    expect(formatEsgScalar("14820")).toBe(`14${NB}820`);
    expect(formatEsgScalar(true)).toBe("Yes");
  });

  it("leaves years, codes and words as they are", () => {
    expect(formatEsgScalar(2025, { field: "baseline_year" })).toBe("2025");
    expect(formatEsgScalar("2025")).toBe("2025");
    expect(formatEsgScalar("0012")).toBe("0012");
    expect(formatEsgScalar("Site A")).toBe("Site A");
    expect(formatEsgScalar({ a: 1 })).toBeNull();
  });
});

describe("esgElementLabel", () => {
  it("names a known element, and never shows an unknown code raw", () => {
    expect(esgElementLabel("GHG_ENERGY")).toBe("Energy & emissions");
    expect(esgElementLabel("LAND_USE")).toBe("Land use");
    expect(esgElementLabel("")).toBe("Unclassified");
  });
});

describe("isEsgParserOutput", () => {
  it("knows an ESG run by its domain or its element", () => {
    expect(isEsgParserOutput({ domain: "esg" })).toBe(true);
    expect(isEsgParserOutput({ pillar: "FLEET" })).toBe(true);
    expect(isEsgParserOutput({ pillar: "ownership" })).toBe(false);
    expect(isEsgParserOutput(null)).toBe(false);
  });
});
