/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import {
  ESG_CLIENTS_PATH,
  ESG_HOME_PATH,
  ESG_NEW_PATH,
  esgClientsHref,
  esgCreateHref,
  esgHomeHref,
  esgNewHref,
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
    // The constant still names the legacy path, because that route still
    // resolves; the href points at the workspace, which is the company list now.
    expect(ESG_CLIENTS_PATH).toBe("/esg/clients");
    expect(esgClientsHref()).toBe(ESG_HOME_PATH);
  });

  it("detects app-root ESG paths that must escape nested toolkit router", () => {
    expect(isEsgAppPath("/esg/clients")).toBe(true);
    expect(isEsgAppPath("/esg/create/co-1")).toBe(true);
    expect(isEsgAppPath("/environmental/ghg")).toBe(false);
  });

  /**
   * Starting a scorecard and opening an existing one stay on separate paths —
   * collapsing them is what once put naming a company ahead of reading the
   * documents that name it. What changed is which path is which.
   *
   * `/esg` is now the ESG WORKSPACE, mirroring `/bbbee`: the consultant's
   * companies, with creating one as an action inside. Starting moved to
   * `/esg/new`. Sending a consultant who carries twenty companies to a blank
   * creation form is what made the two products feel unlike each other.
   */
  it("opens the workspace at /esg and starts a scorecard at /esg/new", () => {
    expect(ESG_HOME_PATH).toBe("/esg");
    expect(esgHomeHref()).toBe("/esg");
    expect(ESG_NEW_PATH).toBe("/esg/new");
    expect(esgNewHref()).toBe("/esg/new");
    expect(esgHomeHref()).not.toBe(esgNewHref());
  });

  /** The old company-list path resolves to the workspace, not a second list. */
  it("folds the old /esg/clients link into the workspace", () => {
    expect(esgClientsHref()).toBe(ESG_HOME_PATH);
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
