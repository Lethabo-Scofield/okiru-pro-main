import { describe, expect, it } from "vitest";
import { E_SCORECARD_INDICATORS } from "../esgScorecardDefinitions";

describe("esgScorecardDefinitions smoke", () => {
  it("loads E indicators", () => {
    expect(E_SCORECARD_INDICATORS.length).toBe(20);
  });
});
