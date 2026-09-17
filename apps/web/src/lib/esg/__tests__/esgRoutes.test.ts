/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import {
  ESG_CLIENTS_PATH,
  ESG_HOME_PATH,
  esgClientsHref,
  esgCreateHref,
  esgHomeHref,
  esgSummaryHref,
  esgToolkitHref,
  hasChosenEsgStart,
  isEsgAppPath,
  rememberEsgStartChosen,
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

  /**
   * `/esg` STARTS a scorecard and `/esg/clients` REOPENS one. They are separate
   * paths on purpose: collapsing the first into the second is what put naming a
   * company ahead of reading the documents that name it.
   */
  it("keeps starting and reopening on separate paths", () => {
    expect(ESG_HOME_PATH).toBe("/esg");
    expect(esgHomeHref()).toBe("/esg");
    expect(esgHomeHref()).not.toBe(esgClientsHref());
  });

  it("remembers that a company has been through the entry choice", () => {
    sessionStorage.clear();
    expect(hasChosenEsgStart("co-123")).toBe(false);
    rememberEsgStartChosen("co-123");
    expect(hasChosenEsgStart("co-123")).toBe(true);
    // Per company: one workbook's choice never silences another's.
    expect(hasChosenEsgStart("co-999")).toBe(false);
  });
});
