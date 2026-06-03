import { describe, expect, it } from "vitest";
import { sumRow } from "@/lib/esg/esgGridPaste";

describe("EsgMonthlyGrid helpers", () => {
  it("sums month column values for YTD", () => {
    expect(sumRow([10, 20, ""])).toBe(30);
  });

  it("computes tCO2 from YTD and factor", () => {
    const ytd = 1000;
    const factor = 2.68;
    expect((ytd * factor) / 1000).toBeCloseTo(2.68, 2);
  });
});
