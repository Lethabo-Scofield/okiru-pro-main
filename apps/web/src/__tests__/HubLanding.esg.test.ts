import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as path from "node:path";

const HUB_TSX = readFileSync(
  path.resolve(__dirname, "../pages/HubLanding.tsx"),
  "utf8",
);

/**
 * There is ONE ESG entry on the hub and it points at `/esg`, the three-step
 * start flow, NOT at `/esg/clients`.
 *
 * It used to point at the company picker, which made "name a company" the
 * first thing anyone did on ESG — before the documents that actually know the
 * registered name had been read. `/esg/clients` is still routed and still
 * linked from step 1, but it is the way back to an EXISTING scorecard, not the
 * way into a new one.
 *
 * There were two doors until b315c324 ("one ESG door not two") collapsed them.
 * This file went on asserting the second one — a card object carrying
 * `id: 'esg'` — after it was deliberately deleted, so the suite read red on a
 * finished change. The assertion now pins the property that change was made to
 * establish: exactly one ESG destination, and it is the start flow.
 */
describe("HubLanding ESG card (Phase 1 preview gate)", () => {
  it("offers exactly one ESG entry, and it is the start flow", () => {
    const esgHrefs = HUB_TSX.match(/href="\/esg[^"]*"/g) ?? [];
    expect(esgHrefs).toEqual(['href="/esg"']);
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
