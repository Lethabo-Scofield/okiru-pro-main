import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as path from "node:path";

const HUB_TSX = readFileSync(
  path.resolve(__dirname, "../pages/HubLanding.tsx"),
  "utf8",
);

/**
 * The hub is two product doors.
 *
 * It used to offer Create Scorecard, View Scorecard and ESG Toolkit as three
 * peers, which gave B-BBEE two entries and ESG one, and gave neither product a
 * section of its own. Each product now has a single card carrying both actions:
 * open the companies you already carry, or start another.
 */
describe("HubLanding product sections", () => {
  it("gives each product one card, with a workspace and a create action", () => {
    for (const id of ["bbbee", "esg"]) {
      expect(HUB_TSX).toMatch(new RegExp(`data-testid={\`product-\\$\\{p.id}\``));
      expect(HUB_TSX).toContain(`id: '${id}'`);
    }
    expect(HUB_TSX).toMatch(/workspace: '\/bbbee'/);
    expect(HUB_TSX).toMatch(/create: '\/bbbee\/new'/);
    expect(HUB_TSX).toMatch(/workspace: '\/esg'/);
    expect(HUB_TSX).toMatch(/create: '\/esg\/new'/);
  });

  it("keeps ESG visible while access remains gated", () => {
    expect(HUB_TSX).toMatch(/useEsgAccess/);
    expect(HUB_TSX).toMatch(/available: esgAllowed/);
    expect(HUB_TSX).toMatch(/ESG access is not enabled for this account/);
    expect(HUB_TSX).not.toMatch(/\.filter\(\(p\) => p\.show\)/);
  });

  it("offers the document library, which had no link anywhere before", () => {
    expect(HUB_TSX).toMatch(/href: '\/documents'/);
  });

  /**
   * Nothing on the hub advertises a product that does not exist, and nothing
   * decorates it. Corporate clients called the old page unserious: a
   * photograph, a violet glow, a greeting that changed with the clock, and
   * "AI-Verified" badges on tiles that were filtered out before rendering.
   */
  it("advertises no unbuilt toolkits", () => {
    expect(HUB_TSX).not.toMatch(/handleComingSoon/);
    expect(HUB_TSX).not.toMatch(/Coming Soon/);
    for (const gone of ["Employment Equity", "WSP/ATR", "Financial Audit"]) {
      expect(HUB_TSX).not.toContain(gone);
    }
  });

  it("carries no decorative layer", () => {
    for (const gone of [
      "hubBackground",
      "certCardBg",
      "Sparkles",
      "AI-Verified",
      "AI-Assisted",
      "Instrument Serif",
      "pulse-soft",
      "float-soft",
      "card-rise",
    ]) {
      expect(HUB_TSX).not.toContain(gone);
    }
  });

  /** The shell above the page owns the rail, the breadcrumbs and the account menu. */
  it("draws no header of its own", () => {
    expect(HUB_TSX).not.toMatch(/<header/);
    expect(HUB_TSX).not.toMatch(/UserAccountMenu\s/);
  });
});
