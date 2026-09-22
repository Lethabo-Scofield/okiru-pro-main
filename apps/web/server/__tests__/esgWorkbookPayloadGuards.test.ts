/**
 * Two things the ESG workbook routes took on trust from the browser.
 *
 * 1. THE ADVICE CHAT'S GROUNDING. `/advice/chat` authorised the workbook and
 *    then discarded it, answering from a `runtimeSnapshot` the client sent —
 *    validated only as `typeof === "object"` and, unlike the `message` beside
 *    it, not length-limited at all. The reply cited "Current ESG scorecard" as
 *    its source while reporting whatever the browser claimed.
 *
 * 2. THE SIZE OF A SECTION. `express.json` is mounted at 50 MB and both write
 *    paths stored the client's `cells` object with no bound on how many cells,
 *    how long a key, or how large a value — straight into a Mongo `Mixed`
 *    field that every later read walks synchronously.
 *
 * These drive the REAL route stack over HTTP, so a regression fails here
 * rather than in a client's workbook.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { registerEsgWorkbookRoutes } from "../esgWorkbookRoutes";
import { createClient } from "../clientsMemoryStore";

let server: http.Server;
let port = 0;

/** The in-memory storage seeds a demo user with id "1"; the REAL requireAuth runs. */
const USER = { id: "1", organizationId: null as string | null };
const COMPANY = "C-ESG-GUARD";

beforeAll(async () => {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: false }));
  app.use((req, _res, next) => {
    (req as any).session = { userId: USER.id, destroy: (cb?: () => void) => cb?.() };
    next();
  });
  registerEsgWorkbookRoutes(app);

  createClient({
    clientId: COMPANY,
    id: COMPANY,
    name: "Guard Test Co",
    createdByUserId: USER.id,
    organizationId: null,
  } as never);

  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* a non-JSON body is still reported through `text` */
  }
  return { status: res.status, json, text };
}

const putSection = (cells: unknown) =>
  call("PUT", `/api/esg/workbook/${COMPANY}/section/g-data`, { cells });

describe("advice chat grounds on the workbook, not on what the browser claims", () => {
  it("ignores a runtimeSnapshot that invents a company and a score", async () => {
    const res = await call("POST", `/api/esg/scorecards/${COMPANY}/advice/chat`, {
      message: "Which ESG pillar is reducing our score most?",
      runtimeSnapshot: {
        companyName: "TOTALLY FAKE LTD",
        scorecard: {
          overallPercent: 0.999,
          environmental: { score: 999, max: 999, percent: 0.999 },
          scope1Tco2e: 123456.78,
        },
      },
    });

    expect(res.status).toBe(200);
    const answer = String(res.json?.answer ?? "");
    // None of the client's fabrications may reach the reply.
    expect(answer).not.toContain("TOTALLY FAKE");
    expect(answer).not.toContain("99.9");
    expect(answer).not.toContain("123456");
    expect(answer).not.toContain("123,456");
  });

  it("does not claim a scorecard source for a workbook that holds no data", async () => {
    const res = await call("POST", `/api/esg/scorecards/${COMPANY}/advice/chat`, {
      message: "Explain our Scope 1 and Scope 2 position",
      runtimeSnapshot: { scorecard: { overallPercent: 0.95, scope1Tco2e: 42 } },
    });

    expect(res.status).toBe(200);
    const sourceIds = (res.json?.sources ?? []).map((s: { id: string }) => s.id);
    // The client asserted a scorecard; the empty workbook says otherwise.
    expect(sourceIds).not.toContain("current-esg-scorecard");
  });

  it("still refuses an over-long question, as it always did", async () => {
    const res = await call("POST", `/api/esg/scorecards/${COMPANY}/advice/chat`, {
      message: "x".repeat(2001),
    });
    expect(res.status).toBe(400);
  });
});

describe("a section cannot be arbitrarily large", () => {
  it("accepts a workbook-sized section", async () => {
    const cells: Record<string, unknown> = {};
    for (let i = 0; i < 500; i++) cells[`B${i + 5}`] = i;
    expect((await putSection(cells)).status).toBe(200);
  });

  it("refuses more cells than any real section holds", async () => {
    const cells: Record<string, unknown> = {};
    for (let i = 0; i < 20_001; i++) cells[`B${i}`] = 1;
    const res = await putSection(cells);
    expect(res.status).toBe(413);
    expect(res.json?.code).toBe("SECTION_REJECTED");
  });

  it("refuses a single oversized cell value", async () => {
    expect((await putSection({ B5: "x".repeat(4001) })).status).toBe(413);
  });

  it("refuses an absurdly long cell reference", async () => {
    expect((await putSection({ ["B".repeat(65)]: 1 })).status).toBe(413);
  });

  it("refuses a nested object where a cell value belongs", async () => {
    // A shape problem rather than a size problem — so 400, not 413.
    expect((await putSection({ B5: { nested: { deeper: true } } })).status).toBe(400);
  });

  it("refuses an array in place of a cells object", async () => {
    expect((await putSection([1, 2, 3])).status).toBe(400);
  });
});

describe("the import confirm step is a write path with the same bounds", () => {
  it("rejects an oversized section and stores NOTHING from that request", async () => {
    // Seed a known-good value we can prove survived.
    expect((await putSection({ B12: "Yes" })).status).toBe(200);

    const huge: Record<string, unknown> = {};
    for (let i = 0; i < 20_001; i++) huge[`B${i}`] = 1;

    const res = await call("POST", `/api/esg/workbook/${COMPANY}/import`, {
      confirm: true,
      sections: {
        // A VALID section listed first, so only all-or-nothing handling can
        // leave it unwritten.
        assumptions: { cells: { B8: "Strict" } },
        "iso-tracker": { cells: huge },
      },
    });
    expect(res.status).toBe(413);
    expect(res.json?.code).toBe("SECTION_REJECTED");

    const after = await call("GET", `/api/esg/workbook/${COMPANY}`);
    expect(after.status).toBe(200);
    // The earlier good write is intact, and neither section from the refused
    // request landed — a rejection must not half-apply.
    expect(after.json?.sections?.["g-data"]?.cells?.B12).toBe("Yes");
    expect(after.json?.sections?.assumptions?.cells?.B8).toBeUndefined();
    expect(after.json?.sections?.["iso-tracker"]?.cells?.B0).toBeUndefined();
  });

  it("still accepts a normal confirm", async () => {
    const res = await call("POST", `/api/esg/workbook/${COMPANY}/import`, {
      confirm: true,
      sections: { assumptions: { cells: { B8: "Standard" } } },
    });
    expect(res.status).toBe(200);
  });
});
