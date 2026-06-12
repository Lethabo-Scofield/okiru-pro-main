import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as path from "node:path";

const HUB_TSX = readFileSync(
  path.resolve(__dirname, "../pages/HubLanding.tsx"),
  "utf8",
);

describe("HubLanding ESG card (Phase 1 preview gate)", () => {
  it("links ESG toolkit to /esg/clients when allowed", () => {
    expect(HUB_TSX).toMatch(/id:\s*'esg'[\s\S]*?link:\s*'\/esg\/clients'/);
  });

  it("gates hero ESG CTA behind esgAllowed", () => {
    expect(HUB_TSX).toMatch(/esgAllowed/);
    expect(HUB_TSX).toMatch(/data-testid="action-create-esg"/);
    expect(HUB_TSX).toMatch(/href="\/esg\/clients"/);
  });

  it("uses useEsgAccess hook", () => {
    expect(HUB_TSX).toMatch(/useEsgAccess/);
  });
});
