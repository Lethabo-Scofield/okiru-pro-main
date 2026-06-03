/**
 * Regression — route table (Task #4 verification).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as path from "node:path";

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
    expect(APP_TSX).toMatch(/EsgScoreSummary/);
    expect(APP_TSX).not.toMatch(/EsgToolkitRedirect/);
    expect(APP_TSX).not.toMatch(/EsgFlowStepper/);
    expect(APP_TSX).toMatch(/EsgPreviewRoute/);
  });
});
