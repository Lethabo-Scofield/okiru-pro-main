/**
 * Refunds for paid runs that delivered nothing.
 *
 * Tokens are spent before a run starts — they have to be, or extraction would
 * be free to anyone who closed the tab at the right moment. The cost of that
 * order was that a run which threw, came back empty, or read nothing from half
 * its documents kept every token. People paid for blank results, and nothing
 * on record could tell those runs from good ones.
 *
 * The parser now records how each paid run ended, per document. This module
 * reads that record server to server and settles each run once:
 *
 *   - the run failed, threw, or came back with nothing → every token back
 *   - some documents produced no values → those documents' tokens back
 *   - the run never reported back, long after it began → it died; every token back
 *   - the run never started, long after it was paid for → the quote is voided at
 *     the parser first, so it can no longer buy an extraction, then refunded
 *
 * The browser never decides a refund. The upload screen may ASK for its run to
 * be settled, so the refund shows the moment the run ends, but the decision is
 * made here from the parser's record and the wallet's own debit. Both halves
 * are idempotent — the refund is ledger reference `refund:<quoteId>` (the same
 * one `/authorize` uses when it cannot start a run, so a quote is refunded at
 * most once, whichever path gets there first) and the settlement is unique per
 * quote — so the screen and the background sweep can race freely.
 */
import { createLogger } from "./logger";
import { ExtractionSettlementModel, TokenLedgerModel } from "../shared/schema";
import { centsToTokens, creditTokens, findLedgerEntry, refundedSince, walletIsDurable } from "./tokenWallet";

const logger = createLogger("ExtractionRefunds");

/**
 * A run with no outcome this long after it began has died (a pod restart, an
 * out-of-memory kill) and will never report back. Generous on purpose: judging
 * a slow run dead refunds a run that then delivers, while waiting longer only
 * delays a refund nobody has to ask for.
 */
export const RUN_PRESUMED_DEAD_AFTER_MS = 2 * 60 * 60 * 1000;

/**
 * A paid quote no run has used this long after the debit was abandoned. The
 * upload screen starts the run the moment the payment clears, so a quote still
 * unused after this was refused at the gate or lost its tab.
 */
export const UNUSED_QUOTE_AFTER_MS = 30 * 60 * 1000;

/** How far back the sweep looks: the parser keeps a paid quote's record for a week past expiry. */
const SWEEP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Runs this fresh are left to the upload screen, which settles its own run as it ends. */
const SWEEP_MIN_AGE_MS = 2 * 60 * 1000;
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
const SWEEP_PAGE = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Tokens an organisation can have refunded automatically in a rolling day
 * before further refunds wait for the window to clear (see settleRun). The
 * default matches the free grant: generous for real failures, a ceiling on a
 * refund loop.
 */
export function dailyRefundAllowance(): number {
  const configured = Number(process.env.AUTO_REFUND_DAILY_ALLOWANCE_TOKENS);
  return Number.isFinite(configured) && configured > 0 ? configured : 10_000;
}

/** What the parser recorded about a paid run (GET /api/parser/quotes/:id/outcome). */
export interface ParserRunRecord {
  consumedAt: number | null;
  voidedAt: number | null;
  /** Whether the run that consumed the quote reports an outcome at all (B-BBEE runs do not). */
  recordsOutcome: boolean;
  outcome: {
    status: string;
    /** Quoted document's name → values read from it, joined by content (never by name). */
    valuesByFile: Record<string, number>;
    /** True only when every value was attributed to a quoted document by content. */
    attributed?: boolean;
    /** Values read across the whole run, attributed or not. */
    totalValues?: number;
    /** False when the client had gone before the result could be sent. */
    delivered?: boolean;
    reason?: string;
  } | null;
  files: Array<{ filename: string; extractionCents: number }>;
}

export type RefundDecision =
  | { kind: "wait"; reason: string }
  | { kind: "void-then-refund"; tokens: number; label: string; reason: string; emptyFiles: string[] }
  | {
      kind: "settle";
      tokens: number;
      /** The billing ledger's line for the refund, if there is one. */
      label: string;
      /** The sentence the person who ran it reads. */
      reason: string;
      emptyFiles: string[];
      outcomeStatus: string | null;
    };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Decide what a finished (or abandoned) paid run is owed. Pure: everything it
 * judges by is passed in, so every rule here is pinned by a test.
 */
export function decideRefund(
  run: ParserRunRecord,
  charge: { tokens: number; at: number },
  now = Date.now(),
): RefundDecision {
  const everyFile = Array.from(new Set(run.files.map((f) => f.filename)));
  const all = (label: string, reason: string, outcomeStatus: string | null): RefundDecision => ({
    kind: "settle",
    tokens: charge.tokens,
    label,
    reason,
    emptyFiles: everyFile,
    outcomeStatus,
  });
  const none = (reason: string, outcomeStatus: string | null): RefundDecision => ({
    kind: "settle",
    tokens: 0,
    label: "",
    reason,
    emptyFiles: [],
    outcomeStatus,
  });

  if (charge.tokens <= 0) return none("Nothing was charged for this run.", run.outcome?.status ?? null);

  if (!run.consumedAt) {
    const neverRan = "The run never started, so every token was returned.";
    if (run.voidedAt) return all("the run never started", neverRan, null);
    if (now - charge.at < UNUSED_QUOTE_AFTER_MS) return { kind: "wait", reason: "The run has not started yet." };
    return { kind: "void-then-refund", tokens: charge.tokens, label: "the run never started", reason: neverRan, emptyFiles: everyFile };
  }

  // A B-BBEE run records no outcome, so its silence says nothing about what it delivered.
  if (!run.recordsOutcome) {
    return none("This kind of run does not report what it read, so it is not refunded automatically.", null);
  }

  if (!run.outcome) {
    if (now - run.consumedAt < RUN_PRESUMED_DEAD_AFTER_MS) return { kind: "wait", reason: "The run is still going." };
    return all("the run stopped without finishing", "The run stopped without finishing, so every token was returned.", null);
  }

  const { status } = run.outcome;
  if (status === "error") return all("the run failed", "The run failed, so every token was returned.", status);
  if (status === "failed") {
    return all("nothing could be read", "Nothing could be read from these documents, so every token was returned.", status);
  }
  if (status !== "resolved") return { kind: "wait", reason: "The run's outcome is not one this wallet understands yet." };
  // However well it went, nobody received it: the screen had timed out, closed
  // or lost its connection before the result could be sent.
  if (run.outcome.delivered === false) {
    return all(
      "the result never reached you",
      "The connection closed before the result reached you, so every token was returned.",
      status,
    );
  }

  if (run.outcome.totalValues === 0) {
    return all("nothing could be read", "None of the documents produced a value, so every token was returned.", status);
  }
  // A single document is refunded only on certain evidence: every value joined
  // to its document by content. Names alone are the client's to choose — and to
  // swap between quote and run, steering the refund onto the expensive file.
  if (run.outcome.attributed !== true) {
    return none("Values could not be matched to their documents with certainty, so no single document is refunded.", status);
  }
  // Only a document the parser counted, and counted at zero, is refunded. One
  // it never named is not evidence of anything.
  const counts = run.outcome.valuesByFile ?? {};
  const empty = run.files.filter((f) => counts[f.filename] === 0);
  if (empty.length === 0) return none("Every document produced values.", status);
  const emptyFiles = Array.from(new Set(empty.map((f) => f.filename)));
  if (emptyFiles.length === everyFile.length) {
    return all("nothing could be read", "None of the documents produced a value, so every token was returned.", status);
  }
  // The same conversion the quote itemised them with, so a refunded document
  // returns exactly what the review step said it cost.
  const tokens = Math.min(charge.tokens, empty.reduce((sum, f) => sum + centsToTokens(f.extractionCents), 0));
  return {
    kind: "settle",
    tokens,
    label: `${plural(emptyFiles.length, "document")} produced nothing`,
    reason: `${plural(emptyFiles.length, "document")} of ${everyFile.length} produced nothing, so ${
      emptyFiles.length === 1 ? "its" : "their"
    } tokens were returned.`,
    emptyFiles,
    outcomeStatus: status,
  };
}

/** How the parser's record is read and an unused quote voided — swappable in tests. */
export interface ParserRunClient {
  read(quoteId: string): Promise<ParserRunRecord | null>;
  /** True once the quote can no longer buy an extraction; false if a run had already used it. */
  void(quoteId: string): Promise<boolean>;
}

const parserBase = () => process.env.PARSER_SERVICE_URL || "http://127.0.0.1:3200";
const internalSecret = () => process.env.PARSER_INTERNAL_SECRET || "";

function toRunRecord(data: unknown): ParserRunRecord | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, any>;
  const rawOutcome = d.outcome && typeof d.outcome === "object" ? (d.outcome as Record<string, any>) : null;
  const valuesByFile: Record<string, number> = {};
  for (const [name, count] of Object.entries(rawOutcome?.valuesByFile ?? {})) {
    if (typeof count === "number" && Number.isFinite(count)) valuesByFile[name] = count;
  }
  return {
    consumedAt: typeof d.consumedAt === "number" ? d.consumedAt : null,
    voidedAt: typeof d.voidedAt === "number" ? d.voidedAt : null,
    recordsOutcome: d.recordsOutcome === true,
    outcome: rawOutcome && typeof rawOutcome.status === "string"
      ? {
          status: rawOutcome.status,
          valuesByFile,
          attributed: rawOutcome.attributed === true,
          totalValues: typeof rawOutcome.totalValues === "number" ? rawOutcome.totalValues : undefined,
          delivered: typeof rawOutcome.delivered === "boolean" ? rawOutcome.delivered : undefined,
          reason: typeof rawOutcome.reason === "string" ? rawOutcome.reason : undefined,
        }
      : null,
    files: Array.isArray(d.files)
      ? d.files.map((f: any) => ({ filename: String(f?.filename ?? ""), extractionCents: Number(f?.extractionCents ?? 0) || 0 }))
      : [],
  };
}

export const httpParserRunClient: ParserRunClient = {
  async read(quoteId) {
    const secret = internalSecret();
    if (!secret) return null;
    try {
      const res = await fetch(`${parserBase()}/api/parser/quotes/${encodeURIComponent(quoteId)}/outcome`, {
        headers: { accept: "application/json", "x-okiru-internal-secret": secret },
      });
      // 404 is also what a parser too old to record outcomes answers: not yet decidable.
      if (!res.ok) return null;
      const body = (await res.json().catch(() => null)) as { data?: unknown } | null;
      return toRunRecord(body?.data);
    } catch (err) {
      logger.warn("Could not reach the parser to read a paid run", { quoteId, error: (err as Error).message });
      return null;
    }
  },
  async void(quoteId) {
    const secret = internalSecret();
    if (!secret) return false;
    try {
      const res = await fetch(`${parserBase()}/api/parser/quotes/${encodeURIComponent(quoteId)}/void`, {
        method: "POST",
        headers: { accept: "application/json", "x-okiru-internal-secret": secret },
      });
      return res.ok;
    } catch (err) {
      logger.warn("Could not reach the parser to void an unused quote", { quoteId, error: (err as Error).message });
      return false;
    }
  },
};

export interface RunSettlement {
  /** not-charged: no debit of the caller's for this run. pending: not decidable yet. */
  state: "not-charged" | "pending" | "settled";
  quoteId: string;
  chargedTokens: number;
  refundedTokens: number;
  reason: string;
  emptyFiles: string[];
  /** True only for the call that actually moved the tokens back. */
  refundedNow: boolean;
  /** A refund that is owed but waiting on the organisation's daily allowance. */
  queued?: boolean;
  balance: number | null;
}

interface SettlementRecord {
  quoteId: string;
  organizationId: string;
  chargedTokens: number;
  refundedTokens: number;
  reason: string;
  emptyFiles: string[];
  outcomeStatus: string | null;
  settledAt: Date;
}

/** Dev/test only, like the wallet's own memory store: production refuses to move tokens without Mongo. */
const memorySettlements = new Map<string, SettlementRecord>();

async function findSettlement(quoteId: string): Promise<SettlementRecord | null> {
  if (walletIsDurable()) return (await ExtractionSettlementModel.findOne({ quoteId }).lean()) as SettlementRecord | null;
  return memorySettlements.get(quoteId) ?? null;
}

async function saveSettlement(record: SettlementRecord): Promise<void> {
  if (!walletIsDurable()) {
    if (!memorySettlements.has(record.quoteId)) memorySettlements.set(record.quoteId, record);
    return;
  }
  try {
    await ExtractionSettlementModel.create(record);
  } catch (err) {
    // Settled by a concurrent caller — the same decision, already on record.
    if ((err as { code?: number }).code !== 11000) throw err;
  }
}

async function unsettled(quoteIds: string[]): Promise<string[]> {
  if (!walletIsDurable()) return quoteIds.filter((id) => !memorySettlements.has(id));
  const done = (await ExtractionSettlementModel.find({ quoteId: { $in: quoteIds } })
    .select("quoteId")
    .lean()) as Array<{ quoteId: string }>;
  const settled = new Set(done.map((s) => s.quoteId));
  return quoteIds.filter((id) => !settled.has(id));
}

const notCharged = (quoteId: string): RunSettlement => ({
  state: "not-charged",
  quoteId,
  chargedTokens: 0,
  refundedTokens: 0,
  reason: "",
  emptyFiles: [],
  refundedNow: false,
  balance: null,
});

const pending = (quoteId: string, chargedTokens: number, reason: string): RunSettlement => ({
  state: "pending",
  quoteId,
  chargedTokens,
  refundedTokens: 0,
  reason,
  emptyFiles: [],
  refundedNow: false,
  balance: null,
});

/**
 * Settle one paid run: decide what it is owed and pay it back, once.
 *
 * `organizationId` scopes the call to the caller's own runs. Someone else's run
 * answers exactly like a run that was never charged, so a quote id from another
 * organisation reveals nothing.
 */
export async function settleRun(
  quoteId: string,
  opts: { organizationId?: string; parser?: ParserRunClient; now?: number } = {},
): Promise<RunSettlement> {
  const now = opts.now ?? Date.now();
  const parser = opts.parser ?? httpParserRunClient;

  const debit = await findLedgerEntry(`extract:${quoteId}`);
  if (!debit || debit.kind !== "extraction") return notCharged(quoteId);
  if (opts.organizationId && debit.organizationId !== opts.organizationId) return notCharged(quoteId);
  const charged = Math.max(0, -debit.delta);

  const done = await findSettlement(quoteId);
  if (done) {
    return {
      state: "settled",
      quoteId,
      chargedTokens: done.chargedTokens,
      refundedTokens: done.refundedTokens,
      reason: done.reason,
      emptyFiles: done.emptyFiles ?? [],
      refundedNow: false,
      balance: null,
    };
  }

  const run = await parser.read(quoteId);
  if (!run) return pending(quoteId, charged, "The run's record could not be read yet. It is checked again shortly.");

  const chargedAt = Date.parse(debit.createdAt);
  let decision = decideRefund(run, { tokens: charged, at: Number.isFinite(chargedAt) ? chargedAt : now }, now);
  if (decision.kind === "wait") return pending(quoteId, charged, decision.reason);
  if (decision.kind === "void-then-refund") {
    // Refund an unused quote only once it can no longer buy an extraction.
    if (!(await parser.void(quoteId))) {
      return pending(quoteId, charged, "The run started after all. It is settled when it ends.");
    }
    decision = { ...decision, kind: "settle", outcomeStatus: null };
  }

  let refundedNow = false;
  let balance: number | null = null;
  if (decision.tokens > 0) {
    // Refunds are paced per organisation, never denied. A client that hangs up
    // mid-run, or pads a batch with blank scans, is refunded — and the OCR and
    // model spend is ours — so without a pace one free grant could be looped
    // through our Azure bill forever. Past the day's allowance the refund waits
    // and the sweep pays it once the window clears; the first refund of a day
    // always goes through, whatever its size, so no single refund is stuck.
    const recent = await refundedSince(debit.organizationId, new Date(now - DAY_MS));
    if (recent > 0 && recent + decision.tokens > dailyRefundAllowance()) {
      logger.warn("Refund queued: the organisation's automatic refunds for the day are used up", {
        quoteId,
        orgId: debit.organizationId,
        tokens: decision.tokens,
        refundedToday: recent,
      });
      return {
        ...pending(
          quoteId,
          charged,
          `${decision.tokens.toLocaleString("en-ZA")} tokens are owed back for this run. Your organisation's automatic refunds for today are used up, so they follow within a day.`,
        ),
        queued: true,
      };
    }
    const credit = await creditTokens({
      organizationId: debit.organizationId,
      userId: null,
      amount: decision.tokens,
      reference: `refund:${quoteId}`,
      description: `Refund — ${decision.label}`,
      kind: "refund",
      metadata: { quoteId, emptyFiles: decision.emptyFiles, outcomeStatus: decision.outcomeStatus },
    });
    refundedNow = !credit.alreadyApplied;
    balance = credit.balance;
  }

  // What the ledger says was returned to the organisation that paid, whichever
  // path returned it — not what this call meant to return.
  const refundEntry = await findLedgerEntry(`refund:${quoteId}`);
  const refundedTokens =
    refundEntry && refundEntry.organizationId === debit.organizationId ? Math.max(0, refundEntry.delta) : 0;
  const reason = refundedTokens > 0 && decision.tokens === 0 && refundEntry ? refundEntry.description : decision.reason;

  await saveSettlement({
    quoteId,
    organizationId: debit.organizationId,
    chargedTokens: charged,
    refundedTokens,
    reason,
    emptyFiles: decision.emptyFiles,
    outcomeStatus: decision.outcomeStatus,
    settledAt: new Date(now),
  });
  if (refundedNow) {
    logger.info("Refunded a paid run that did not deliver", {
      quoteId,
      orgId: debit.organizationId,
      tokens: decision.tokens,
      outcome: decision.outcomeStatus,
      emptyFiles: decision.emptyFiles.length,
    });
  }

  return {
    state: "settled",
    quoteId,
    chargedTokens: charged,
    refundedTokens,
    reason,
    emptyFiles: decision.emptyFiles,
    refundedNow,
    balance,
  };
}

/**
 * Why `/authorize` must refuse to open this quote for this organisation, or null.
 *
 * Two holes. A quote whose tokens already came back would be re-authorised
 * against the very debit that was refunded: the retry found `extract:<id>` in
 * the ledger, charged nothing, and the run went ahead for free. And a quote
 * another organisation paid for would read as "already paid" for this one, so
 * a guessed quote id could ride someone else's payment.
 */
export async function authorizeRefusal(
  quoteId: string,
  organizationId: string,
): Promise<{ status: number; code: string; message: string } | null> {
  const debit = await findLedgerEntry(`extract:${quoteId}`);
  if (debit && debit.organizationId !== organizationId) {
    // Answered exactly like a quote that does not exist.
    return { status: 404, code: "QUOTE_NOT_FOUND", message: "That quote is unknown or has expired. Upload the batch again." };
  }
  if (await findLedgerEntry(`refund:${quoteId}`)) {
    return {
      status: 409,
      code: "QUOTE_REFUNDED",
      message: "This batch's tokens were already returned, so it cannot run on that payment. Upload the documents again for a new price.",
    };
  }
  return null;
}

/**
 * Quote ids of every run debited in the sweep window that nobody has settled.
 *
 * Paged through the whole window and filtered page by page. A cap on the query
 * itself (the newest N) would let a backlog — the parser down for an afternoon
 * — push the oldest runs out of sight for good, and those are exactly the ones
 * owed a refund for having died or never started.
 */
async function openRunDebits(now: number): Promise<string[]> {
  if (!walletIsDurable()) return [];
  const window = { $gte: new Date(now - SWEEP_WINDOW_MS), $lte: new Date(now - SWEEP_MIN_AGE_MS) };
  const open: string[] = [];
  let after: unknown = null;
  for (;;) {
    const filter: Record<string, unknown> = { kind: "extraction", reference: /^extract:/, createdAt: window };
    if (after) filter._id = { $gt: after };
    const page = (await TokenLedgerModel.find(filter)
      .select("_id reference")
      .sort({ _id: 1 })
      .limit(SWEEP_PAGE)
      .lean()) as Array<{ _id: unknown; reference: string }>;
    if (page.length === 0) break;
    open.push(...(await unsettled(page.map((d) => d.reference.slice("extract:".length)))));
    if (page.length < SWEEP_PAGE) break;
    after = page[page.length - 1]._id;
  }
  return open;
}

/**
 * Settle every recent paid run nobody has settled: the runs whose screen was
 * closed, whose run died, or whose quote was never used. Each run is settled
 * independently, so one the parser cannot answer for never holds up the rest.
 */
export async function sweepRunRefunds(
  opts: { parser?: ParserRunClient; now?: number; candidates?: (now: number) => Promise<string[]> } = {},
): Promise<{ checked: number; refunded: number }> {
  const now = opts.now ?? Date.now();
  const quoteIds = opts.candidates ? await unsettled(await opts.candidates(now)) : await openRunDebits(now);
  let refunded = 0;
  for (const quoteId of quoteIds) {
    try {
      const result = await settleRun(quoteId, { parser: opts.parser, now });
      if (result.refundedNow) refunded++;
    } catch (err) {
      logger.warn("Could not settle a paid run", { quoteId, error: (err as Error).message });
    }
  }
  if (refunded) logger.info("Paid-run refund sweep", { checked: quoteIds.length, refunded });
  return { checked: quoteIds.length, refunded };
}

let timer: NodeJS.Timeout | null = null;

export function startExtractionRefundSweep(): void {
  if (timer) return;
  const run = () => {
    sweepRunRefunds().catch((err) => logger.error("Paid-run refund sweep failed", err as Error));
  };
  setTimeout(run, 2 * 60 * 1000).unref?.();
  timer = setInterval(run, SWEEP_INTERVAL_MS);
  timer.unref?.();
}
