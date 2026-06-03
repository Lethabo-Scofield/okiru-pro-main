import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { allToolkitHrefs } from "@/lib/esg/esgToolkitNav";

const APP_TSX = readFileSync(path.resolve(__dirname, "../App.tsx"), "utf8");

describe("EsgToolkit App routes", () => {
  const hrefs = allToolkitHrefs();

  it("registers a Route for every nav href", () => {
    for (const href of hrefs) {
      const pattern = href === "/" ? 'path="/"' : `path="${href}"`;
      expect(APP_TSX, `missing route for ${href}`).toMatch(pattern);
    }
  });

  it("includes inline editor and hierarchical nav", () => {
    expect(APP_TSX).toMatch(/EsgToolkitSectionPage/);
    expect(APP_TSX).toMatch(/EsgToolkitInlineEditor|path="\/environmental\/ghg"/);
    expect(APP_TSX).toMatch(/setStance/);
    expect(APP_TSX).toMatch(/esg-hdr-overall/);
  });

  it("covers all pillar subsection routes", () => {
    expect(hrefs).toContain("/environmental/ghg");
    expect(hrefs).toContain("/social/management");
    expect(hrefs).toContain("/governance/king5");
    expect(hrefs).toContain("/import");
    expect(hrefs.length).toBe(23);
  });
});
