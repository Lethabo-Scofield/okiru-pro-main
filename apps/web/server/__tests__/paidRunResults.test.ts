/**
 * Collecting a paid read whose connection dropped — the web server half.
 *
 * The parser keeps a paid run's result; this server decides who may collect
 * it. The money rules, pinned:
 *   - only the organisation whose `extract:<quoteId>` debit paid for the run
 *     may collect it; anyone else gets the 404 a quote that never ran gets
 *   - in free mode there is no debit, so authorising binds the quote to the
 *     organisation that authorised it, and only that one may collect it
 *   - a spent quote answers 409 with a code the screen can act on, and is
 *     never charged or run a second time
 *   - an undelivered run whose result is still held is not refunded as lost
 *
 * Runs against the wallet's process-local store, like tokenWallet.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../routes", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    const org = req.header("x-test-org");
    if (!org) return res.status(401).json({ message: "Not signed in" });
    req.user = { id: `user-${org}`, organizationId: org };
    next();
  },
}));
vi.mock("../securityAudit", () => ({ recordAudit: vi.fn(async () => undefined) }));

import { registerTokenRoutes } from "../tokenRoutes";
import { decideRefund, type ParserRunRecord } from "../extractionRefunds";
import { debitTokens, ensureWallet, listLedger } from "../tokenWallet";

const SECRET = "test-internal-secret";
let seq = 0;
const newOrg = () => `org-resume-${Date.now()}-${++seq}`;
const newQuote = () => `quote-resume-${Date.now()}-${++seq}`;

/** What the fake parser answers, per quote. */
const parserQuotes = new Map<string, { consumed: boolean; paymentStatus: string }>();
const parserRuns = new Map<string, { status: number; body?: unknown } | "unreachable">();
const parserCalls: Array<{ url: string; secret: string | null }> = [];

function stubParser() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      parserCalls.push({ url, secret: headers.get("x-okiru-internal-secret") });
      const reply = (status: number, body: unknown) =>
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

      const result = url.match(/\/api\/parser\/quotes\/([^/]+)\/result$/);
      if (result) {
        const run = parserRuns.get(decodeURIComponent(result[1]));
        if (run === "unreachable") throw new TypeError("fetch failed");
        if (!run) return reply(404, { success: false, error: { code: "RUN_NOT_FOUND" } });
        return reply(run.status, run.body);
      }
      const settle = url.match(/\/api\/parser\/quotes\/([^/]+)\/settle$/);
      if (settle) return reply(200, { data: { paymentStatus: "paid" } });
      const quote = url.match(/\/api\/parser\/quotes\/([^/]+)$/);
      if (quote) {
        const q = parserQuotes.get(decodeURIComponent(quote[1]));
        if (!q) return reply(404, {});
        return reply(200, { data: { quoteId: quote[1], totalCents: 250, currency: "ZAR", voided: false, quote: { files: [] }, ...q } });
      }
      return reply(404, {});
    }) as unknown as typeof fetch,
  );
}

function app() {
  const a = express();
  a.use(express.json());
  registerTokenRoutes(a);
  return a;
}

const DONE = {
  data: {
    quoteId: "x",
    status: "done",
    result: { case_id: "case-1", run_attestations: [{ token: "signed-run" }] },
    startedAt: 1_000,
    finishedAt: 2_000,
    reason: null,
    maxRunMs: 7_200_000,
    now: 3_000,
  },
};

const previous = { secret: process.env.PARSER_INTERNAL_SECRET, tokens: process.env.TOKENS_REQUIRE_PAYMENT };

beforeEach(() => {
  process.env.PARSER_INTERNAL_SECRET = SECRET;
  delete process.env.TOKENS_REQUIRE_PAYMENT;
  parserQuotes.clear();
  parserRuns.clear();
  parserCalls.length = 0;
  stubParser();
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (previous.secret === undefined) delete process.env.PARSER_INTERNAL_SECRET;
  else process.env.PARSER_INTERNAL_SECRET = previous.secret;
  if (previous.tokens === undefined) delete process.env.TOKENS_REQUIRE_PAYMENT;
  else process.env.TOKENS_REQUIRE_PAYMENT = previous.tokens;
});

/** The org pays for the quote, the way /authorize debits it. */
async function paidBy(orgId: string, quoteId: string) {
  await ensureWallet(orgId);
  const debit = await debitTokens({ organizationId: orgId, amount: 250, reference: `extract:${quoteId}`, description: "Document processing" });
  expect(debit.ok).toBe(true);
}

describe("GET /api/tokens/result/:quoteId — paid mode", () => {
  it("hands the paying organisation the run's result, collected with the internal secret", async () => {
    const org = newOrg();
    const quoteId = newQuote();
    await paidBy(org, quoteId);
    parserRuns.set(quoteId, { status: 200, body: DONE });

    const res = await request(app()).get(`/api/tokens/result/${quoteId}`).set("x-test-org", org);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      quoteId,
      status: "done",
      result: { case_id: "case-1", run_attestations: [{ token: "signed-run" }] },
      startedAt: 1_000,
      finishedAt: 2_000,
      maxRunMs: 7_200_000,
      serverNow: 3_000,
    });
    const call = parserCalls.find((c) => c.url.endsWith(`/quotes/${quoteId}/result`));
    expect(call?.secret).toBe(SECRET);
  });

  it("answers another organisation exactly like a quote that never ran — and never asks the parser", async () => {
    const payer = newOrg();
    const quoteId = newQuote();
    await paidBy(payer, quoteId);
    parserRuns.set(quoteId, { status: 200, body: DONE });

    const res = await request(app()).get(`/api/tokens/result/${quoteId}`).set("x-test-org", newOrg());
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("RUN_NOT_FOUND");
    expect(res.body).not.toHaveProperty("result");
    expect(parserCalls.some((c) => c.url.includes("/result"))).toBe(false);
  });

  it("refuses a quote nobody paid for", async () => {
    const quoteId = newQuote();
    parserRuns.set(quoteId, { status: 200, body: DONE });
    const res = await request(app()).get(`/api/tokens/result/${quoteId}`).set("x-test-org", newOrg());
    expect(res.status).toBe(404);
  });

  it("requires a signed-in user", async () => {
    expect((await request(app()).get(`/api/tokens/result/${newQuote()}`)).status).toBe(401);
  });

  it("passes a running run through, and says unknown when the parser has no run on record", async () => {
    const org = newOrg();
    const running = newQuote();
    const missing = newQuote();
    await paidBy(org, running);
    await paidBy(org, missing);
    parserRuns.set(running, { status: 200, body: { data: { status: "running", result: null, startedAt: 5, finishedAt: null, maxRunMs: 7_200_000, now: 9 } } });

    const r1 = await request(app()).get(`/api/tokens/result/${running}`).set("x-test-org", org);
    expect(r1.body).toMatchObject({ status: "running", result: null, startedAt: 5 });

    const r2 = await request(app()).get(`/api/tokens/result/${missing}`).set("x-test-org", org);
    expect(r2.status).toBe(200);
    expect(r2.body).toMatchObject({ status: "unknown", result: null });
  });

  it("answers 503 — ask again — when the parser cannot be reached or no secret is set", async () => {
    const org = newOrg();
    const quoteId = newQuote();
    await paidBy(org, quoteId);
    parserRuns.set(quoteId, "unreachable");
    const down = await request(app()).get(`/api/tokens/result/${quoteId}`).set("x-test-org", org);
    expect(down.status).toBe(503);
    expect(down.body.code).toBe("RUN_RESULT_UNAVAILABLE");

    delete process.env.PARSER_INTERNAL_SECRET;
    parserRuns.set(quoteId, { status: 200, body: DONE });
    expect((await request(app()).get(`/api/tokens/result/${quoteId}`).set("x-test-org", org)).status).toBe(503);
  });
});

describe("POST /api/tokens/authorize on a spent quote", () => {
  it("answers 409 with a code the screen collects on, and charges nothing", async () => {
    const org = newOrg();
    const quoteId = newQuote();
    await paidBy(org, quoteId);
    parserQuotes.set(quoteId, { consumed: true, paymentStatus: "paid" });
    const before = (await listLedger(org)).length;

    const res = await request(app()).post("/api/tokens/authorize").set("x-test-org", org).send({ quoteId });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: "QUOTE_ALREADY_USED", message: "This batch has already been processed." });
    expect((await listLedger(org)).length).toBe(before);
    expect(parserCalls.some((c) => c.url.endsWith("/settle"))).toBe(false);
  });
});

describe("free mode — the quote is bound to the organisation that authorised it", () => {
  beforeEach(() => {
    process.env.TOKENS_REQUIRE_PAYMENT = "false";
  });

  it("lets the authorising organisation collect, and nobody else", async () => {
    const org = newOrg();
    const quoteId = newQuote();
    parserQuotes.set(quoteId, { consumed: false, paymentStatus: "not_started" });
    parserRuns.set(quoteId, { status: 200, body: DONE });

    // Before anyone authorises it, nobody owns it.
    expect((await request(app()).get(`/api/tokens/result/${quoteId}`).set("x-test-org", org)).status).toBe(404);

    const auth = await request(app()).post("/api/tokens/authorize").set("x-test-org", org).send({ quoteId });
    expect(auth.status).toBe(200);
    expect(auth.body).toMatchObject({ authorized: true, free: true, tokensCharged: 0 });

    const mine = await request(app()).get(`/api/tokens/result/${quoteId}`).set("x-test-org", org);
    expect(mine.status).toBe(200);
    expect(mine.body.status).toBe("done");

    const other = newOrg();
    expect((await request(app()).get(`/api/tokens/result/${quoteId}`).set("x-test-org", other)).status).toBe(404);
    // ...and it cannot take the quote over by authorising it second.
    const steal = await request(app()).post("/api/tokens/authorize").set("x-test-org", other).send({ quoteId });
    expect(steal.status).toBe(404);
    expect((await request(app()).get(`/api/tokens/result/${quoteId}`).set("x-test-org", other)).status).toBe(404);
  });

  it("re-authorising by the same organisation keeps it bound to them", async () => {
    const org = newOrg();
    const quoteId = newQuote();
    parserQuotes.set(quoteId, { consumed: false, paymentStatus: "not_started" });
    expect((await request(app()).post("/api/tokens/authorize").set("x-test-org", org).send({ quoteId })).status).toBe(200);
    expect((await request(app()).post("/api/tokens/authorize").set("x-test-org", org).send({ quoteId })).status).toBe(200);
  });
});

describe("decideRefund — an undelivered result that is still held", () => {
  const NOW = Date.UTC(2026, 9, 8, 9, 0, 0);
  const run = (outcome: Partial<NonNullable<ParserRunRecord["outcome"]>>): ParserRunRecord => ({
    consumedAt: NOW - 30 * 60_000,
    voidedAt: null,
    recordsOutcome: true,
    outcome: { status: "resolved", valuesByFile: { "fuel.xlsx": 10 }, attributed: true, totalValues: 10, delivered: false, ...outcome },
    files: [{ filename: "fuel.xlsx", extractionCents: 250 }],
  });
  const charge = { tokens: 250, at: NOW - 31 * 60_000 };

  it("waits while the result can still be collected", () => {
    expect(decideRefund(run({ resultHeldUntil: NOW + 60 * 60_000 }), charge, NOW)).toMatchObject({ kind: "wait" });
  });

  it("refunds in full once the held result has expired uncollected", () => {
    expect(decideRefund(run({ resultHeldUntil: NOW - 60 * 60_000 }), charge, NOW)).toMatchObject({
      kind: "settle",
      tokens: 250,
      label: "the result never reached you",
    });
  });

  it("still refunds an undelivered run whose result was never held (too large to keep)", () => {
    expect(decideRefund(run({}), charge, NOW)).toMatchObject({ kind: "settle", tokens: 250 });
  });
});
