import { describe, expect, it } from "vitest";
import { sumRow } from "@/lib/esg/esgGridPaste";

describe("EsgHeadcountGrid totals", () => {
  it("sums race/gender columns per row", () => {
    expect(sumRow([5, 3, 0, 2])).toBe(10);
  });
});
