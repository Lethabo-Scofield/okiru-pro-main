/**
 * Collecting a paid read whose connection dropped.
 *
 * A paid read streams its progress and, at the end, its result. When the
 * connection drops part-way — the network blinking, a phone changing towers —
 * the read carries on server-side and the parser keeps its result for a day.
 * The quote it spent stays spent (one payment, one read), so trying again
 * used to meet "This batch has already been processed" with no way forward.
 *
 * This module is the way forward, shared by the B-BBEE and ESG upload screens:
 *   - `isConnectionLoss` tells a dropped connection from a real refusal
 *   - `collectPaidRead` asks the server for the run (GET /api/tokens/result),
 *     polling every 5s while it is still reading, until it is done, failed,
 *     or past the run's maximum time
 *   - the pending-read record keeps the quote id (and the library ids of the
 *     uploads) in sessionStorage while a read is in flight, so a reload can
 *     collect it too
 *
 * It never starts a run and never charges: collecting only reads what the
 * spent quote already bought.
 */

export const RESUME_RUNNING_MESSAGE =
  "Still reading your documents — your connection dropped but the read carried on.";
/** Shown while the server has not answered yet (the connection may still be down). */
export const RESUME_CHECKING_MESSAGE = "Checking on your read — nothing is charged again.";

/** How often a read that is still going is asked about again. */
export const RESUME_POLL_INTERVAL_MS = 5_000;
/** The interval the screens poll at — a seam so component tests need not wait 5s a turn. */
export const resumeTiming = { intervalMs: RESUME_POLL_INTERVAL_MS };
/** Past the run's maximum time, how long to keep asking (clock skew, the last write). */
export const RESUME_POLL_MARGIN_MS = 2 * 60 * 1000;
/** The parser's own default for how long a run may read (PARSER_RUN_MAX_MS), until it says otherwise. */
export const DEFAULT_RUN_MAX_MS = 2 * 60 * 60 * 1000;
/** With no answer at all (still offline), how long to keep trying before saying so. */
export const RESUME_UNREACHABLE_GIVE_UP_MS = 10 * 60 * 1000;

/** Thrown inside a read when its stream is lost and the run should be collected instead. */
export class PaidReadInterrupted extends Error {
  constructor(readonly quoteId: string, readonly why: "connection" | "already-used" | "no-result" | "idle") {
    super("The read's connection was lost");
    this.name = "PaidReadInterrupted";
  }
}

/**
 * A dropped connection, as the browser reports it: fetch and stream reads fail
 * with a TypeError ("Failed to fetch", "network error", "Load failed") rather
 * than an HTTP status. Our own aborts (AbortError) are not one of these.
 */
export function isConnectionLoss(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: unknown };
  return e.name === "TypeError" || e.name === "NetworkError";
}

export type CollectedRead =
  | { status: "done"; result: unknown }
  | { status: "failed" | "unknown" | "unreachable"; reason: string | null; tooLarge?: boolean };

interface RunAnswer {
  status?: string;
  result?: unknown;
  startedAt?: number | null;
  reason?: string | null;
  maxRunMs?: number | null;
  serverNow?: number | null;
}

export interface CollectOptions {
  /** Called each time the server says the read is still going. */
  onRunning?: () => void;
  /** Stop asking (the screen unmounted). */
  isCancelled?: () => boolean;
  intervalMs?: number;
  marginMs?: number;
  /** Injected in tests. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  fetchImpl?: typeof fetch;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Collect what a spent quote's read produced. Resolves when the read is done
 * (with the exact result its stream would have delivered), failed, unknown to
 * the server, or still unanswered past the run's maximum time.
 */
export async function collectPaidRead(quoteId: string, options: CollectOptions = {}): Promise<CollectedRead> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const doFetch = options.fetchImpl ?? fetch;
  const interval = options.intervalMs ?? resumeTiming.intervalMs;
  const margin = options.marginMs ?? RESUME_POLL_MARGIN_MS;
  const began = now();
  // Until the server has said when the run started, give up only after a
  // spell of no answers at all — the user may still be offline.
  let deadline = began + RESUME_UNREACHABLE_GIVE_UP_MS;
  let lastReason: string | null = null;

  for (;;) {
    if (options.isCancelled?.()) return { status: "unreachable", reason: null };
    let answer: RunAnswer | null = null;
    try {
      const res = await doFetch(`/api/tokens/result/${encodeURIComponent(quoteId)}`, { credentials: "include" });
      if (res.status === 404) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        return { status: "unknown", reason: body?.message ?? null };
      }
      if (res.ok) answer = (await res.json().catch(() => null)) as RunAnswer | null;
      else lastReason = ((await res.json().catch(() => null)) as { message?: string } | null)?.message ?? null;
    } catch {
      // Still offline, or the request was cut: ask again.
    }

    if (answer) {
      if (answer.status === "done") {
        if (answer.result != null) return { status: "done", result: answer.result };
        return { status: "failed", reason: answer.reason ?? null, tooLarge: answer.reason === "too-large" };
      }
      if (answer.status === "failed") return { status: "failed", reason: answer.reason ?? null };
      if (answer.status !== "running") return { status: "unknown", reason: answer.reason ?? null };
      options.onRunning?.();
      // The run's own deadline, on the server's clock, moved onto ours.
      const maxRunMs = typeof answer.maxRunMs === "number" ? answer.maxRunMs : DEFAULT_RUN_MAX_MS;
      if (typeof answer.startedAt === "number" && typeof answer.serverNow === "number") {
        deadline = Math.max(deadline, now() + (answer.startedAt + maxRunMs - answer.serverNow) + margin);
      } else {
        deadline = Math.max(deadline, began + maxRunMs + margin);
      }
    }

    if (now() >= deadline) {
      return answer
        ? { status: "unknown", reason: "The read did not finish in the time it is allowed." }
        : { status: "unreachable", reason: lastReason };
    }
    await sleep(interval);
  }
}

/** The sentence that leads a read we could not collect. */
export function uncollectedReadMessage(collected: Exclude<CollectedRead, { status: "done" }>): string {
  if (collected.status === "unreachable") {
    return "Your connection dropped while your documents were being read, and we could not reach the server to collect the result.";
  }
  if (collected.status === "failed" && collected.tooLarge) {
    return "Your connection dropped while your documents were being read. The read finished, but its result was too large to keep for you to collect.";
  }
  if (collected.status === "failed") {
    return `Your connection dropped while your documents were being read, and the read did not finish${collected.reason ? ` (${collected.reason})` : ""}.`;
  }
  return "Your connection dropped while your documents were being read, and no finished read is on record for this batch.";
}

/** What the settlement says about the tokens of a read that never reached the screen. */
export function refundSentence(settlement: {
  state?: string;
  refundedTokens?: number;
  reason?: string;
  queued?: boolean;
} | null): string {
  if (!settlement) {
    return "If this read delivered nothing, its tokens come back to your balance automatically — there is nothing you need to do.";
  }
  const refunded = Number(settlement.refundedTokens ?? 0);
  if (settlement.state === "settled" && refunded > 0) {
    return `${refunded.toLocaleString("en-ZA")} tokens were returned to your balance.`;
  }
  if (settlement.state === "settled") {
    return `Your tokens were not refunded${settlement.reason ? `: ${settlement.reason}` : "."}`;
  }
  if (settlement.state === "not-charged") return "Nothing was charged for this read.";
  if (settlement.queued && settlement.reason) return settlement.reason;
  return "If this read delivered nothing, its tokens come back to your balance automatically — there is nothing you need to do.";
}

/* ------------------------------------------------------------------ *
 * The pending-read record: which paid read is in flight in this tab.
 * ------------------------------------------------------------------ */

export interface PendingRead {
  quoteId: string;
  startedAt: string;
  /** The uploads this read covers, by name. */
  fileNames: string[];
  /** Library id per upload name — the uploads are gone after a reload, their library copies are not. */
  documentIdsByName: Record<string, string>;
}

export function readPendingReadRecord(key: string): PendingRead | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const rec = JSON.parse(raw) as PendingRead;
    return rec && typeof rec.quoteId === "string" && rec.quoteId ? rec : null;
  } catch {
    return null;
  }
}

export function writePendingReadRecord(key: string, record: PendingRead): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(record));
  } catch {
    // Quota or private mode: an in-page retry still collects the read.
  }
}

export function clearPendingReadRecord(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}
