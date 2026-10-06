/**
 * Refunds for paid runs that delivered nothing.
 *
 * The rules are money rules, so each is pinned: what a run is owed for every
 * way it can end, that the refund moves once however many times it is asked
 * for, that it goes to the organisation that paid and no one else, and that an
 * unused quote is only refunded once the parser has voided it.
 *
 * Runs against the wallet's process-local store, like tokenWallet.test.ts.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RUN_PRESUMED_DEAD_AFTER_MS,
  UNUSED_QUOTE_AFTER_MS,
  authorizeRefusal,
  decideRefund,
  settleRun,
  sweepRunRefunds,
  type ParserRunClient,
  type ParserRunRecord,
} from "../extractionRefunds";
import { FREE_TOKEN_GRANT, creditTokens, debitTokens, ensureWallet, listLedger } from "../tokenWallet";

const NOW = Date.UTC(2026, 9, 6, 12, 0, 0);
const MINUTE = 60_000;

const files = [
  { filename: "DIESEL REPORT - Mar 2026.xlsx", extractionCents: 300 },
  { filename: "city-power-oct.pdf", extractionCents: 150 },
  { filename: "blank-scan.pdf", extractionCents: 120 },
];

function run(over: Partial<ParserRunRecord> = {}): ParserRunRecord {
  return {
    consumedAt: NOW - 5 * MINUTE,
    voidedAt: null,
    recordsOutcome: true,
    outcome: {
      status: "resolved",
      valuesByFile: { "DIESEL REPORT - Mar 2026.xlsx": 40, "city-power-oct.pdf": 12, "blank-scan.pdf": 0 },
      attributed: true,
      totalValues: 52,
    },
    files,
    ...over,
  };
}

/** The batch costs more than its documents: the R2 floor rides on top. */
const charge = { tokens: 600, at: NOW - 6 * MINUTE };

describe("decideRefund", () => {
  it("returns the tokens of the one document that produced nothing, and names it", () => {
    const decision = decideRefund(run(), charge, NOW);
    expect(decision).toMatchObject({
      kind: "settle",
      tokens: 120,
      emptyFiles: ["blank-scan.pdf"],
      outcomeStatus: "resolved",
      label: "1 document produced nothing",
      reason: "1 document of 3 produced nothing, so its tokens were returned.",
    });
  });

  it("returns nothing when every document produced values", () => {
    const decision = decideRefund(
      run({ outcome: { status: "resolved", valuesByFile: { "DIESEL REPORT - Mar 2026.xlsx": 1, "city-power-oct.pdf": 1, "blank-scan.pdf": 1 }, attributed: true, totalValues: 3 } }),
      charge,
      NOW,
    );
    expect(decision).toMatchObject({ kind: "settle", tokens: 0, emptyFiles: [] });
  });

  it("returns everything — the batch minimum too — when no document produced a value", () => {
    const decision = decideRefund(
      run({ outcome: { status: "resolved", valuesByFile: { "DIESEL REPORT - Mar 2026.xlsx": 0, "city-power-oct.pdf": 0, "blank-scan.pdf": 0 }, attributed: true, totalValues: 0 } }),
      charge,
      NOW,
    );
    expect(decision).toMatchObject({ kind: "settle", tokens: 600, emptyFiles: files.map((f) => f.filename) });
  });

  it("returns everything when the run failed or came back empty", () => {
    expect(decideRefund(run({ outcome: { status: "error", valuesByFile: {} } }), charge, NOW)).toMatchObject({
      kind: "settle",
      tokens: 600,
      outcomeStatus: "error",
      reason: "The run failed, so every token was returned.",
    });
    expect(decideRefund(run({ outcome: { status: "failed", valuesByFile: {} } }), charge, NOW)).toMatchObject({
      kind: "settle",
      tokens: 600,
      outcomeStatus: "failed",
    });
  });

  it("returns everything when the result never reached the screen, however well the run went", () => {
    const decision = decideRefund(
      run({
        outcome: {
          status: "resolved",
          valuesByFile: { "DIESEL REPORT - Mar 2026.xlsx": 40, "city-power-oct.pdf": 12, "blank-scan.pdf": 3 },
          delivered: false,
        },
      }),
      charge,
      NOW,
    );
    expect(decision).toMatchObject({ kind: "settle", tokens: 600, label: "the result never reached you" });
  });

  it("waits on a run that is still going, and refunds one that never reported back", () => {
    expect(decideRefund(run({ outcome: null }), charge, NOW)).toMatchObject({ kind: "wait" });
    const dead = decideRefund(
      run({ outcome: null, consumedAt: NOW - RUN_PRESUMED_DEAD_AFTER_MS - MINUTE }),
      charge,
      NOW,
    );
    expect(dead).toMatchObject({ kind: "settle", tokens: 600, outcomeStatus: null });
    expect((dead as { reason: string }).reason).toMatch(/stopped without finishing/);
  });

  it("never judges a run that does not report an outcome (a B-BBEE run) by its silence", () => {
    const decision = decideRefund(
      run({ recordsOutcome: false, outcome: null, consumedAt: NOW - 10 * RUN_PRESUMED_DEAD_AFTER_MS }),
      charge,
      NOW,
    );
    expect(decision).toMatchObject({ kind: "settle", tokens: 0 });
  });

  it("waits on a fresh unused quote, voids an abandoned one first, and refunds a voided one", () => {
    expect(decideRefund(run({ consumedAt: null, outcome: null }), charge, NOW)).toMatchObject({ kind: "wait" });
    const abandoned = { tokens: 600, at: NOW - UNUSED_QUOTE_AFTER_MS - MINUTE };
    expect(decideRefund(run({ consumedAt: null, outcome: null }), abandoned, NOW)).toMatchObject({
      kind: "void-then-refund",
      tokens: 600,
    });
    expect(decideRefund(run({ consumedAt: null, outcome: null, voidedAt: NOW - MINUTE }), charge, NOW)).toMatchObject({
      kind: "settle",
      tokens: 600,
    });
  });

  it("refunds no document the parser never named — that is not evidence of anything", () => {
    const decision = decideRefund(
      run({ outcome: { status: "resolved", valuesByFile: { "DIESEL REPORT - Mar 2026.xlsx": 9 }, attributed: true, totalValues: 9 } }),
      charge,
      NOW,
    );
    expect(decision).toMatchObject({ kind: "settle", tokens: 0 });
  });

  it("refunds no single document when values could not be joined to documents by content", () => {
    // Names are the client's to choose, and to swap between quote and run.
    const decision = decideRefund(
      run({
        outcome: {
          status: "resolved",
          valuesByFile: { "DIESEL REPORT - Mar 2026.xlsx": 40, "city-power-oct.pdf": 12, "blank-scan.pdf": 0 },
          attributed: false,
          totalValues: 52,
        },
      }),
      charge,
      NOW,
    );
    expect(decision).toMatchObject({ kind: "settle", tokens: 0, emptyFiles: [] });
  });

  it("still returns everything when nothing at all was read, attributed or not", () => {
    const decision = decideRefund(
      run({ outcome: { status: "resolved", valuesByFile: {}, attributed: false, totalValues: 0 } }),
      charge,
      NOW,
    );
    expect(decision).toMatchObject({ kind: "settle", tokens: 600 });
  });

  it("never returns more than was charged, and nothing when nothing was", () => {
    const decision = decideRefund(run(), { tokens: 50, at: charge.at }, NOW);
    expect(decision).toMatchObject({ kind: "settle", tokens: 50 });
    expect(decideRefund(run({ outcome: { status: "error", valuesByFile: {} } }), { tokens: 0, at: charge.at }, NOW)).toMatchObject({
      kind: "settle",
      tokens: 0,
    });
  });
});

let seq = 0;
const ids = () => {
  seq += 1;
  return { orgId: `org-refund-${Date.now()}-${seq}`, quoteId: `quote-refund-${Date.now()}-${seq}` };
};

async function paidRun(orgId: string, quoteId: string, tokens = 600) {
  await ensureWallet(orgId);
  const debit = await debitTokens({ organizationId: orgId, amount: tokens, reference: `extract:${quoteId}`, description: "Document processing" });
  expect(debit.ok).toBe(true);
}

function parserReturning(record: ParserRunRecord | null, voids = true): ParserRunClient & { void: ReturnType<typeof vi.fn> } {
  return { read: vi.fn(async () => record), void: vi.fn(async () => voids) };
}

describe("settleRun", () => {
  it("refunds a run's empty documents once, however many times it is asked", async () => {
    const { orgId, quoteId } = ids();
    await paidRun(orgId, quoteId);
    const parser = parserReturning(run());

    const first = await settleRun(quoteId, { organizationId: orgId, parser, now: NOW });
    expect(first).toMatchObject({ state: "settled", chargedTokens: 600, refundedTokens: 120, refundedNow: true, emptyFiles: ["blank-scan.pdf"] });
    expect(first.balance).toBe(FREE_TOKEN_GRANT - 600 + 120);

    const again = await settleRun(quoteId, { organizationId: orgId, parser, now: NOW });
    expect(again).toMatchObject({ state: "settled", refundedTokens: 120, refundedNow: false });
    // Settled runs are answered from the record — the parser is not asked again.
    expect(parser.read).toHaveBeenCalledTimes(1);

    const refunds = (await listLedger(orgId)).filter((e) => e.kind === "refund");
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({ delta: 120, reference: `refund:${quoteId}`, description: "Refund — 1 document produced nothing" });
  });

  it("refunds into the organisation that paid, and tells anyone else nothing", async () => {
    const { orgId, quoteId } = ids();
    await paidRun(orgId, quoteId);
    const parser = parserReturning(run({ outcome: { status: "error", valuesByFile: {} } }));

    const stranger = await settleRun(quoteId, { organizationId: "org-someone-else", parser, now: NOW });
    expect(stranger).toMatchObject({ state: "not-charged", refundedTokens: 0, chargedTokens: 0 });
    expect(parser.read).not.toHaveBeenCalled();
    expect((await listLedger(orgId)).some((e) => e.kind === "refund")).toBe(false);
  });

  it("answers not-charged for a run nobody paid for (free mode)", async () => {
    const { quoteId } = ids();
    const result = await settleRun(quoteId, { parser: parserReturning(run()), now: NOW });
    expect(result.state).toBe("not-charged");
  });

  it("leaves a run it cannot read yet pending — never settled as owed nothing", async () => {
    const { orgId, quoteId } = ids();
    await paidRun(orgId, quoteId);

    const blind = await settleRun(quoteId, { organizationId: orgId, parser: parserReturning(null), now: NOW });
    expect(blind).toMatchObject({ state: "pending", refundedTokens: 0 });

    // Once the parser can answer, the run is still owed its refund.
    const later = await settleRun(quoteId, {
      organizationId: orgId,
      parser: parserReturning(run({ outcome: { status: "failed", valuesByFile: {} } })),
      now: NOW,
    });
    expect(later).toMatchObject({ state: "settled", refundedTokens: 600, refundedNow: true });
  });

  it("refunds an abandoned quote only after the parser has voided it", async () => {
    const { orgId, quoteId } = ids();
    await paidRun(orgId, quoteId);
    const unused = run({ consumedAt: null, outcome: null });
    // The debit is stamped by the real clock, so "abandoned" is measured from it.
    const late = Date.now() + UNUSED_QUOTE_AFTER_MS + 10 * MINUTE;

    // The run slipped through after all: no refund, judged later by its outcome.
    const raced = parserReturning(unused, false);
    expect(await settleRun(quoteId, { organizationId: orgId, parser: raced, now: late })).toMatchObject({
      state: "pending",
      refundedTokens: 0,
    });
    expect(raced.void).toHaveBeenCalledWith(quoteId);
    expect((await listLedger(orgId)).some((e) => e.kind === "refund")).toBe(false);

    const voided = parserReturning(unused, true);
    expect(await settleRun(quoteId, { organizationId: orgId, parser: voided, now: late })).toMatchObject({
      state: "settled",
      refundedTokens: 600,
      refundedNow: true,
    });
  });

  it("never refunds a quote twice when /authorize already gave its tokens back", async () => {
    const { orgId, quoteId } = ids();
    await paidRun(orgId, quoteId);
    // What /authorize does when the parser will not settle the quote.
    await creditTokens({
      organizationId: orgId,
      amount: 600,
      reference: `refund:${quoteId}`,
      description: "Refund — processing could not be authorised",
      kind: "refund",
    });

    const result = await settleRun(quoteId, {
      organizationId: orgId,
      parser: parserReturning(run({ outcome: { status: "error", valuesByFile: {} } })),
      now: NOW,
    });
    expect(result).toMatchObject({ state: "settled", refundedTokens: 600, refundedNow: false });
    expect((await listLedger(orgId)).filter((e) => e.kind === "refund")).toHaveLength(1);
    expect((await ensureWallet(orgId)).balance).toBe(FREE_TOKEN_GRANT);
  });
});

describe("the daily refund allowance", () => {
  const KEY = "AUTO_REFUND_DAILY_ALLOWANCE_TOKENS";
  const original = process.env[KEY];
  afterEach(() => {
    if (original === undefined) delete process.env[KEY];
    else process.env[KEY] = original;
  });

  it("pays the day's first refund whatever its size, then queues — never denies — the rest", async () => {
    process.env[KEY] = "700";
    const { orgId, quoteId: first } = ids();
    const { quoteId: second } = ids();
    await paidRun(orgId, first);
    await paidRun(orgId, second);
    const failed = parserReturning(run({ outcome: { status: "error", valuesByFile: {} } }));

    // 600 refunded: the first of the day always goes through.
    expect(await settleRun(first, { organizationId: orgId, parser: failed, now: NOW })).toMatchObject({
      state: "settled",
      refundedTokens: 600,
    });
    // 600 more would take the day to 1,200 > 700: owed, queued, not lost.
    const queued = await settleRun(second, { organizationId: orgId, parser: failed, now: NOW });
    expect(queued).toMatchObject({ state: "pending", queued: true, refundedTokens: 0 });
    expect(queued.reason).toMatch(/600 tokens are owed back/);
    expect((await listLedger(orgId)).filter((e) => e.kind === "refund")).toHaveLength(1);

    // A day on, the window has cleared and the sweep pays it.
    const tomorrow = Date.now() + 25 * 60 * 60 * 1000;
    expect(await settleRun(second, { organizationId: orgId, parser: failed, now: tomorrow })).toMatchObject({
      state: "settled",
      refundedTokens: 600,
      refundedNow: true,
    });
  });
});

describe("authorizeRefusal", () => {
  it("refuses a quote whose tokens already came back — the retry used to run free", async () => {
    const { orgId, quoteId } = ids();
    await paidRun(orgId, quoteId);
    expect(await authorizeRefusal(quoteId, orgId)).toBeNull();
    await creditTokens({
      organizationId: orgId,
      amount: 600,
      reference: `refund:${quoteId}`,
      description: "Refund — processing could not be authorised",
      kind: "refund",
    });
    expect(await authorizeRefusal(quoteId, orgId)).toMatchObject({ status: 409, code: "QUOTE_REFUNDED" });
  });

  it("answers another organisation's paid quote as if it did not exist", async () => {
    const { orgId, quoteId } = ids();
    await paidRun(orgId, quoteId);
    expect(await authorizeRefusal(quoteId, "org-guessing-quote-ids")).toMatchObject({
      status: 404,
      code: "QUOTE_NOT_FOUND",
    });
  });

  it("lets a fresh quote through", async () => {
    const { orgId, quoteId } = ids();
    expect(await authorizeRefusal(quoteId, orgId)).toBeNull();
  });
});

describe("sweepRunRefunds", () => {
  it("settles the runs nobody settled, skips the settled, and survives one it cannot read", async () => {
    const a = ids();
    const b = ids();
    const c = ids();
    await paidRun(a.orgId, a.quoteId);
    await paidRun(b.orgId, b.quoteId);
    await paidRun(c.orgId, c.quoteId);

    const records: Record<string, ParserRunRecord | null> = {
      [a.quoteId]: run({ outcome: { status: "error", valuesByFile: {} } }),
      [b.quoteId]: null, // the parser cannot answer for this one right now
      [c.quoteId]: run(),
    };
    const parser: ParserRunClient = {
      read: vi.fn(async (quoteId: string) => records[quoteId] ?? null),
      void: vi.fn(async () => true),
    };
    const candidates = async () => [a.quoteId, b.quoteId, c.quoteId];

    expect(await sweepRunRefunds({ parser, now: NOW, candidates })).toEqual({ checked: 3, refunded: 2 });
    expect((await ensureWallet(a.orgId)).balance).toBe(FREE_TOKEN_GRANT);
    expect((await ensureWallet(c.orgId)).balance).toBe(FREE_TOKEN_GRANT - 600 + 120);

    // Next pass: only the run that could not be read is still open.
    expect(await sweepRunRefunds({ parser, now: NOW, candidates })).toEqual({ checked: 1, refunded: 0 });
  });
});
