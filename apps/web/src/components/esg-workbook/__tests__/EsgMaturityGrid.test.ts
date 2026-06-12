import { describe, expect, it } from "vitest";
import { maturityScoreFromYn } from "../EsgMaturityGrid";

describe("maturityScoreFromYn", () => {
  it("maps Yes to 5 and Partial to 2.5", () => {
    expect(maturityScoreFromYn("Yes")).toBe(5);
    expect(maturityScoreFromYn("Partial")).toBe(2.5);
    expect(maturityScoreFromYn("No")).toBe(0);
  });
});
