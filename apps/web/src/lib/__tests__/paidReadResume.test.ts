/**
 * Collecting a paid read whose connection dropped: the polling rules.
 */
import { describe, expect, it, vi } from "vitest";
import {
  RESUME_POLL_INTERVAL_MS,
  collectPaidRead,
  isConnectionLoss,
  refundSentence,
  uncollectedReadMessage,
} from "../paidReadResume";

function json(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as unknown as Response;
}

/** A clock the fake sleep advances, so the deadline logic runs without waiting. */
function clock(start = 1_000_000) {
  let now = start;
  const sleeps: number[] = [];
  return {
    now: () => now,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      now += ms;
    },
    sleeps,
  };
}

describe("collectPaidRead", () => {
  it("polls every 5 seconds while the read is running, then returns its result", async () => {
    const c = clock();
    const answers = [
      json({ status: "running", startedAt: c.now() - 60_000, maxRunMs: 7_200_000, serverNow: c.now() }),
      json({ status: "running", startedAt: c.now() - 60_000, maxRunMs: 7_200_000, serverNow: c.now() }),
      json({ status: "done", result: { case_id: "c" } }),
    ];
    const fetchImpl = vi.fn(async () => answers.shift()!);
    const onRunning = vi.fn();
    const collected = await collectPaidRead("q-1", { now: c.now, sleep: c.sleep, fetchImpl: fetchImpl as never, onRunning });
    expect(collected).toEqual({ status: "done", result: { case_id: "c" } });
    expect(onRunning).toHaveBeenCalledTimes(2);
    expect(c.sleeps).toEqual([RESUME_POLL_INTERVAL_MS, RESUME_POLL_INTERVAL_MS]);
    expect(fetchImpl).toHaveBeenCalledWith("/api/tokens/result/q-1", { credentials: "include" });
  });

  it("stops after the run's maximum time plus a margin, on the server's clock", async () => {
    const c = clock();
    // The server's clock runs an hour ahead of ours; the run started 130
    // minutes ago (server time) and may read for 140: ten minutes left there,
    // plus a one-minute margin, whatever our own clock says.
    const skew = 60 * 60_000;
    const startedAt = c.now() + skew - 130 * 60_000;
    const fetchImpl = vi.fn(async () =>
      json({ status: "running", startedAt, maxRunMs: 140 * 60_000, serverNow: c.now() + skew }),
    );
    const began = c.now();
    const collected = await collectPaidRead("q-1", { now: c.now, sleep: c.sleep, fetchImpl: fetchImpl as never, marginMs: 60_000 });
    expect(collected.status).toBe("unknown");
    const waited = c.now() - began;
    expect(waited).toBeGreaterThanOrEqual(11 * 60_000);
    expect(waited).toBeLessThan(11 * 60_000 + 2 * RESUME_POLL_INTERVAL_MS);
  });

  it("keeps asking through a dropped connection, and says so when it never gets through", async () => {
    const c = clock();
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const collected = await collectPaidRead("q-1", { now: c.now, sleep: c.sleep, fetchImpl: fetchImpl as never });
    expect(collected.status).toBe("unreachable");
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(100);
  });

  it("reports failed, too large and unknown runs plainly", async () => {
    const c = clock();
    const once = (r: Response) => vi.fn(async () => r) as never;
    expect(await collectPaidRead("q", { ...c, fetchImpl: once(json({ status: "failed", reason: "model unavailable" })) }))
      .toEqual({ status: "failed", reason: "model unavailable" });
    expect(await collectPaidRead("q", { ...c, fetchImpl: once(json({ status: "done", result: null, reason: "too-large" })) }))
      .toMatchObject({ status: "failed", tooLarge: true });
    expect(await collectPaidRead("q", { ...c, fetchImpl: once(json({ message: "No read is on record for this batch." }, 404)) }))
      .toEqual({ status: "unknown", reason: "No read is on record for this batch." });
  });
});

describe("isConnectionLoss", () => {
  it("is a TypeError from fetch or a stream, never our own abort or a server refusal", () => {
    expect(isConnectionLoss(new TypeError("network error"))).toBe(true);
    expect(isConnectionLoss(new TypeError("Failed to fetch"))).toBe(true);
    expect(isConnectionLoss(Object.assign(new Error("aborted"), { name: "AbortError" }))).toBe(false);
    expect(isConnectionLoss(new Error("Payment could not be verified"))).toBe(false);
  });
});

describe("messages", () => {
  it("says whether the tokens come back, from the settlement", () => {
    expect(refundSentence({ state: "settled", refundedTokens: 250 })).toBe("250 tokens were returned to your balance.");
    expect(refundSentence({ state: "settled", refundedTokens: 0, reason: "This kind of run is not refunded automatically." }))
      .toBe("Your tokens were not refunded: This kind of run is not refunded automatically.");
    expect(refundSentence(null)).toMatch(/come back to your balance automatically/);
  });

  it("names what happened to the read", () => {
    expect(uncollectedReadMessage({ status: "failed", reason: "model unavailable" })).toMatch(/did not finish \(model unavailable\)/);
    expect(uncollectedReadMessage({ status: "unreachable", reason: null })).toMatch(/could not reach the server/);
  });
});
