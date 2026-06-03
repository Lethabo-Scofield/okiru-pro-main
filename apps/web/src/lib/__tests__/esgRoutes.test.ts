import { describe, expect, it } from "vitest";
import { esgToolkitHref, esgLegacyCreateRedirect } from "../esgRoutes";

describe("esgRoutes", () => {
  it("builds toolkit path with company id", () => {
    expect(esgToolkitHref("co-123")).toBe("/esg/toolkit/co-123");
  });

  it("redirects legacy create URLs to toolkit", () => {
    expect(esgLegacyCreateRedirect("co-abc")).toBe("/esg/toolkit/co-abc");
    expect(esgLegacyCreateRedirect("co-abc", true)).toBe("/esg/toolkit/co-abc");
  });
});
