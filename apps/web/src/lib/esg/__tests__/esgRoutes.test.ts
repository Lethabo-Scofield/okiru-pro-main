import { describe, expect, it } from "vitest";
import { esgCreateHref, esgSummaryHref, esgToolkitHref } from "../esgRoutes";

describe("esgRoutes", () => {
  it("builds create and summary paths", () => {
    expect(esgCreateHref("co-123")).toBe("/esg/create/co-123");
    expect(esgSummaryHref("co-123")).toBe("/esg/create/co-123/summary");
  });

  it("builds toolkit path with company id", () => {
    expect(esgToolkitHref("co-123")).toBe("/esg/toolkit/co-123");
  });
});
