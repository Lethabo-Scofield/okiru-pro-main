import { describe, expect, it } from "vitest";
import {
  ESG_CLIENTS_PATH,
  esgClientsHref,
  esgCreateHref,
  esgSummaryHref,
  esgToolkitHref,
  isEsgAppPath,
} from "../esgRoutes";

describe("esgRoutes", () => {
  it("builds create and summary paths", () => {
    expect(esgCreateHref("co-123")).toBe("/esg/create/co-123");
    expect(esgSummaryHref("co-123")).toBe("/esg/create/co-123/summary");
  });

  it("builds toolkit path with company id", () => {
    expect(esgToolkitHref("co-123")).toBe("/esg/toolkit/co-123");
  });

  it("exposes canonical companies path for toolkit back navigation", () => {
    expect(ESG_CLIENTS_PATH).toBe("/esg/clients");
    expect(esgClientsHref()).toBe("/esg/clients");
  });

  it("detects app-root ESG paths that must escape nested toolkit router", () => {
    expect(isEsgAppPath("/esg/clients")).toBe(true);
    expect(isEsgAppPath("/esg/create/co-1")).toBe(true);
    expect(isEsgAppPath("/environmental/ghg")).toBe(false);
  });
});
