import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as path from "node:path";

const HUB_TSX = readFileSync(
  path.resolve(__dirname, "../pages/HubLanding.tsx"),
  "utf8",
);

/**
 * Both hub entries point at `/esg`, the three-step start flow, NOT at
 * `/esg/clients`.
 *
 * They used to point at the company picker, which made "name a company" the
 * first thing anyone did on ESG — before the documents that actually know the
 * registered name had been read. `/esg/clients` is still routed and still
 * linked from step 1, but it is the way back to an EXISTING scorecard, not the
 * way into a new one.
 */
describe("HubLanding ESG card (Phase 1 preview gate)", () => {
  it("links the ESG toolkit card to the start flow when allowed", () => {
    expect(HUB_TSX).toMatch(/id:\s*'esg'[\s\S]*?link:\s*'\/esg'/);
  });

  it("gates hero ESG CTA behind esgAllowed and sends it to the start flow", () => {
    expect(HUB_TSX).toMatch(/esgAllowed/);
    expect(HUB_TSX).toMatch(/data-testid="action-create-esg"/);
    expect(HUB_TSX).toMatch(/href="\/esg"/);
    // The picker is no longer the front door.
    expect(HUB_TSX).not.toMatch(/href="\/esg\/clients"/);
  });

  it("uses useEsgAccess hook", () => {
    expect(HUB_TSX).toMatch(/useEsgAccess/);
  });
});
