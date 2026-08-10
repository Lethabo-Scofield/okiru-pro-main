/**
 * The wallet's two dangerous properties, pinned.
 *
 * Everything else here is bookkeeping; these two are the ones that cost real
 * money when they break:
 *   - a retried debit must charge once, not twice
 *   - concurrent debits must not overdraw a balance
 *
 * These run against the process-local store (no MONGODB_URI, so `store()`
 * selects MemoryWalletStore), which implements the same contract as the Mongo
 * path — the atomic `$gte`-guarded update there is the direct analogue of the
 * balance check here.
 */
import { describe, expect, it } from "vitest";
import {
  FREE_TOKEN_GRANT,
  centsToTokens,
  creditTokens,
  debitTokens,
  ensureWallet,
  listLedger,
} from "../tokenWallet";

let seq = 0;
const newOrg = () => `org-test-${Date.now()}-${++seq}`;

describe("credit wallet", () => {
  it("grants the opening balance exactly once", async () => {
    const orgId = newOrg();

    const first = await ensureWallet(orgId);
    expect(first.balance).toBe(FREE_TOKEN_GRANT);
    expect(first.plan).toBe("free");

    const second = await ensureWallet(orgId);
    expect(second.balance).toBe(FREE_TOKEN_GRANT);

    const ledger = await listLedger(orgId);
    expect(ledger.filter((entry) => entry.kind === "grant")).toHaveLength(1);
  });

  it("charges a repeated reference only once", async () => {
    const orgId = newOrg();
    await ensureWallet(orgId);

    const first = await debitTokens({
      organizationId: orgId,
      amount: 250,
      reference: `extract:quote-a`,
      description: "Document processing",
    });
    const retry = await debitTokens({
      organizationId: orgId,
      amount: 250,
      reference: `extract:quote-a`,
      description: "Document processing",
    });

    expect(first).toMatchObject({ ok: true, alreadyApplied: false, balance: FREE_TOKEN_GRANT - 250 });
    expect(retry).toMatchObject({ ok: true, alreadyApplied: true, balance: FREE_TOKEN_GRANT - 250 });

    const spend = (await listLedger(orgId)).filter((entry) => entry.kind === "extraction");
    expect(spend).toHaveLength(1);
  });

  it("refuses to overdraw and reports the exact shortfall", async () => {
    const orgId = newOrg();
    await ensureWallet(orgId);

    const result = await debitTokens({
      organizationId: orgId,
      amount: FREE_TOKEN_GRANT + 1_500,
      reference: `extract:quote-too-big`,
      description: "A very large batch",
    });

    expect(result).toEqual({
      ok: false,
      reason: "insufficient",
      balance: FREE_TOKEN_GRANT,
      shortfall: 1_500,
    });

    // A refused debit must leave the balance untouched.
    expect((await ensureWallet(orgId)).balance).toBe(FREE_TOKEN_GRANT);
  });

  it("does not let concurrent debits spend more than the balance", async () => {
    const orgId = newOrg();
    await ensureWallet(orgId);

    // Six batches at 2,000 tokens against a 10,000 balance: five can settle,
    // the sixth must not.
    const attempts = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        debitTokens({
          organizationId: orgId,
          amount: 2_000,
          reference: `extract:concurrent-${orgId}-${i}`,
          description: "Concurrent batch",
        }),
      ),
    );

    const settled = attempts.filter((a) => a.ok);
    expect(settled).toHaveLength(5);
    expect((await ensureWallet(orgId)).balance).toBe(0);
  });

  it("credits a purchase and records it once", async () => {
    const orgId = newOrg();
    await ensureWallet(orgId);

    const first = await creditTokens({
      organizationId: orgId,
      amount: 25_000,
      reference: "purchase:order-1",
      description: "Purchase — topup-25k",
      kind: "purchase",
    });
    const replay = await creditTokens({
      organizationId: orgId,
      amount: 25_000,
      reference: "purchase:order-1",
      description: "Purchase — topup-25k",
      kind: "purchase",
    });

    expect(first.balance).toBe(FREE_TOKEN_GRANT + 25_000);
    expect(replay).toMatchObject({ balance: FREE_TOKEN_GRANT + 25_000, alreadyApplied: true });
  });
});

describe("cents → tokens", () => {
  it("always rounds up, so a batch is never undercharged", () => {
    expect(centsToTokens(0)).toBe(0);
    expect(centsToTokens(0.4)).toBe(1);
    expect(centsToTokens(12.1)).toBe(13);
    expect(centsToTokens(400)).toBe(400);
  });

  it("treats a nonsense price as free rather than throwing", () => {
    expect(centsToTokens(Number.NaN)).toBe(0);
    expect(centsToTokens(-10)).toBe(0);
  });
});
