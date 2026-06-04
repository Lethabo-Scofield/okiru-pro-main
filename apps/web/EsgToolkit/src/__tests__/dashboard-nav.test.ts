import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { toolkitPillarHref } from "@/lib/esg/esgToolkitNav";

const DASHBOARD_TSX = readFileSync(
  path.resolve(__dirname, "../pages/EsgDashboard.tsx"),
  "utf8",
);

describe("EsgDashboard pillar navigation", () => {
  it("links Environmental pillar to /environmental", () => {
    expect(toolkitPillarHref("environmental")).toBe("/environmental");
    expect(DASHBOARD_TSX).toMatch(/toolkitPillarHref/);
    expect(DASHBOARD_TSX).toMatch(/data-esg-pillar-href=\{href\}/);
    expect(DASHBOARD_TSX).toMatch(/data-testid=\{`esg-pillar-\$\{p\.key\}`\}/);
    expect(DASHBOARD_TSX).toMatch(/toolkitPillarHref\("environmental"\)/);
  });

  it("links Social and Governance pillars to pillar dashboards", () => {
    expect(toolkitPillarHref("social")).toBe("/social");
    expect(toolkitPillarHref("governance")).toBe("/governance");
  });
});
