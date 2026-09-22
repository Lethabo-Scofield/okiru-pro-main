/**
 * The separator is the point of this module, so it is what the tests check.
 *
 * Raised in the 18 September review: black-ownership percentages were printing
 * with a full stop while every rand amount beside them printed with a comma.
 * `toFixed` is not locale-aware, which is easy to miss because the output looks
 * like a number either way.
 */
import { describe, expect, it } from "vitest";
import { formatPercent, formatPercentFromFraction } from "../lib/formatPercent";

describe("formatPercent", () => {
  it("separates the decimal with a comma, not a full stop", () => {
    expect(formatPercent(5.1)).toBe("5,1%");
    expect(formatPercent(26.45, { decimals: 2 })).toBe("26,45%");
  });

  it("drops the decimal on figures of ten and over, where it adds nothing", () => {
    expect(formatPercent(51)).toBe("51%");
    expect(formatPercent(100)).toBe("100%");
  });

  it("keeps a decimal below ten, where a small holding still matters", () => {
    expect(formatPercent(9.4)).toBe("9,4%");
    expect(formatPercent(0.5)).toBe("0,5%");
  });

  it("honours an explicit decimal count either way", () => {
    expect(formatPercent(51, { decimals: 2 })).toBe("51,00%");
    expect(formatPercent(9.44, { decimals: 0 })).toBe("9%");
  });

  /**
   * An ownership percentage nobody supplied is not zero percent. Rendering it
   * as a number would turn a gap in the data into a measured finding.
   */
  it("says the value is missing rather than printing a zero", () => {
    expect(formatPercent(null)).toBe("Missing");
    expect(formatPercent(undefined)).toBe("Missing");
    expect(formatPercent(Number.NaN)).toBe("Missing");
    expect(formatPercent(null, { fallback: "—" })).toBe("—");
  });

  it("can leave the symbol off for callers that place their own", () => {
    expect(formatPercent(26.4, { withSymbol: false })).toBe("26");
    expect(formatPercent(26.4, { withSymbol: false, decimals: 1 })).toBe("26,4");
  });
});

describe("formatPercentFromFraction", () => {
  it("converts a stored fraction without the caller doing the arithmetic", () => {
    expect(formatPercentFromFraction(0.264)).toBe("26%");
    expect(formatPercentFromFraction(0.264, { decimals: 1 })).toBe("26,4%");
    expect(formatPercentFromFraction(1)).toBe("100%");
  });

  it("treats an absent fraction as absent, not as none owned", () => {
    expect(formatPercentFromFraction(null)).toBe("Missing");
    expect(formatPercentFromFraction(undefined, { fallback: "—" })).toBe("—");
  });

  /** 0.051 is 5,1% — the decimal survives the conversion. */
  it("keeps the decimal on a small holding through the conversion", () => {
    expect(formatPercentFromFraction(0.051)).toBe("5,1%");
  });
});
