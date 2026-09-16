/**
 * Regression — route table (Task #4 verification).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { ESG_CLIENTS_PATH, esgClientsHref } from "@/lib/esgRoutes";

const APP_TSX = readFileSync(
  path.resolve(__dirname, "../App.tsx"),
  "utf8",
);

function hasRoute(p: string): boolean {
  return new RegExp(`<Route\\s+path=["']${p}["']`).test(APP_TSX);
}

describe("App.tsx route declarations", () => {
  it("declares /hub", () => {
    expect(hasRoute("/hub")).toBe(true);
  });

  it("declares /dashboard", () => {
    expect(hasRoute("/dashboard")).toBe(true);
  });

  /**
   * Each product gets a door of its own, and behind it a workspace: the
   * consultant's companies for that product, with "create scorecard" inside.
   * `/bbbee` and `/esg` are aliases of the existing pages while the real
   * workspace pages are built; the old paths keep working throughout.
   */
  it("declares a door per product, and a create route behind each", () => {
    expect(hasRoute("/bbbee")).toBe(true);
    expect(hasRoute("/bbbee/new")).toBe(true);
    expect(hasRoute("/esg")).toBe(true);
    expect(hasRoute("/esg/new")).toBe(true);
  });

  it("declares /access alongside /workspace for people and permissions", () => {
    expect(hasRoute("/access")).toBe(true);
    expect(hasRoute("/workspace")).toBe(true);
  });

  it("declares /certificates", () => {
    expect(hasRoute("/certificates")).toBe(true);
  });

  it("declares /super-admin (SuperAdmin route, Task #18 area 8 verification)", () => {
    expect(hasRoute("/super-admin")).toBe(true);
  });

  it("does NOT declare /test (falls through to NotFound)", () => {
    expect(hasRoute("/test")).toBe(false);
  });

  it("declares ESG routes — clients, inputs, summary, toolkit", () => {
    expect(hasRoute("/esg")).toBe(true);
    expect(hasRoute("/esg/clients")).toBe(true);
    expect(hasRoute("/esg/toolkit")).toBe(true);
    expect(hasRoute("/esg/toolkit/:companyId")).toBe(true);
    expect(hasRoute("/esg/create/:companyId")).toBe(true);
    expect(hasRoute("/esg/create/:companyId/summary")).toBe(true);
    expect(APP_TSX).toMatch(/EsgInformationRequest/);
    expect(APP_TSX).not.toMatch(/path="\/esg\/create.*nest/);
    expect(APP_TSX).toMatch(/EsgScoreSummary/);
    expect(APP_TSX).not.toMatch(/EsgSectionEditor/);
    expect(APP_TSX).not.toMatch(/EsgToolkitRedirect/);
    expect(APP_TSX).not.toMatch(/EsgFlowStepper/);
    expect(APP_TSX).toMatch(/EsgPreviewRoute/);
  });

  /**
   * The toolkit's "back to companies" link now lands on the ESG workspace.
   * `/esg/clients` is still routed, so old links keep resolving, but it is no
   * longer a second company list to keep in step with the first.
   */
  it("sends toolkit back-navigation to the ESG workspace", () => {
    expect(ESG_CLIENTS_PATH).toBe("/esg/clients");
    expect(esgClientsHref()).toBe("/esg");
    expect(hasRoute("/esg/clients")).toBe(true);
  });
});
