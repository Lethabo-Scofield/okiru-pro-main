import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { DEFAULT_YN_POINTS, maturityScoreFromYn } from "../EsgMaturityGrid";

describe("maturityScoreFromYn", () => {
  it("maps Yes to 5 and Partial to 2.5", () => {
    expect(maturityScoreFromYn("Yes")).toBe(5);
    expect(maturityScoreFromYn("Partial")).toBe(2.5);
    expect(maturityScoreFromYn("No")).toBe(0);
  });

  it("scores a blank, an unrecognised answer and Not Applicable at zero", () => {
    for (const answer of ["", "   ", "N/A", "maybe"]) {
      expect(maturityScoreFromYn(answer), answer).toBe(0);
    }
  });

  it("uses the sheet's own weights when a row supplies them", () => {
    // EE_Scorecard!E9 = IF(B9="Yes",10,IF(B9="Partial",5,0)) — not the 5 / 2.5 rule.
    expect(maturityScoreFromYn("Yes", { yes: 10, partial: 5 })).toBe(10);
    expect(maturityScoreFromYn("Partial", { yes: 10, partial: 5 })).toBe(5);
    // EE_Scorecard!E10…E14 award 2 for Partial, not 2.5.
    expect(maturityScoreFromYn("Partial", { yes: 5, partial: 2 })).toBe(2);
  });

  it("defaults to the governance sheet's rule", () => {
    expect(DEFAULT_YN_POINTS).toEqual({ yes: 5, partial: 2.5 });
  });
});

describe("the grid does not claim to persist what it never writes", () => {
  const source = readFileSync(
    path.resolve(__dirname, "../EsgMaturityGrid.tsx"),
    "utf8",
  );

  /**
   * The grid used to caption its subtotal "(stored at F26)" and divide by a
   * hardcoded 100. It wrote neither: the governance total is the sum of a score
   * column the derivation layer computes, and the employment-equity sheet is not
   * scored out of 100 at all. Both claims are removed; this pins them out.
   */
  it("never tells the user a total is stored in a cell", () => {
    expect(source).not.toMatch(/stored at/i);
  });

  it("never writes a score or total cell", () => {
    // The only writes are onChange({ [row.cell]: … }) — the value column.
    const writes = source.match(/onChange\(\{[^}]*\}\)/g) ?? [];
    expect(writes.length).toBeGreaterThan(0);
    for (const write of writes) {
      expect(write).toContain("[row.cell]");
      expect(write).not.toContain("scoreCell");
      expect(write).not.toContain("total");
    }
  });

  it("does not hardcode a denominator", () => {
    expect(source).not.toMatch(/\/\s*100\b/);
  });
});
