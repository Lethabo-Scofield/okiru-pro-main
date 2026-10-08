/**
 * Collecting a paid read whose connection dropped.
 *
 * The parser keeps every paid stream run's status and, once done, the very
 * payload its stream would have delivered (GET /api/parser/quotes/:id/result,
 * server to server). This module decides WHO may collect it — only the
 * organisation that paid for the quote, or in free mode the one that
 * authorised it — and fetches it with the internal secret the browser never
 * holds.
 *
 * Someone else's quote answers exactly like a quote that never ran, so a
 * guessed or leaked quote id reveals nothing.
 */
import { createLogger } from "./logger";
import { ExtractionQuoteBindingModel } from "../shared/schema";
import { findLedgerEntry, walletIsDurable } from "./tokenWallet";

const logger = createLogger("PaidRunResults");

const parserBase = () => process.env.PARSER_SERVICE_URL || "http://127.0.0.1:3200";
const internalSecret = () => process.env.PARSER_INTERNAL_SECRET || "";

/** Dev/test only, like the wallet's own memory store. */
const memoryBindings = new Map<string, string>();

/**
 * Record that `organizationId` authorised `quoteId` without a charge. The first
 * organisation to authorise a quote owns it; resolves the owner, which is
 * another organisation's id when it got there first.
 */
export async function bindQuoteToOrganization(quoteId: string, organizationId: string): Promise<string> {
  if (!walletIsDurable()) {
    if (!memoryBindings.has(quoteId)) memoryBindings.set(quoteId, organizationId);
    return memoryBindings.get(quoteId)!;
  }
  try {
    const doc = (await ExtractionQuoteBindingModel.findOneAndUpdate(
      { quoteId },
      { $setOnInsert: { quoteId, organizationId, createdAt: new Date() } },
      { upsert: true, new: true },
    ).lean()) as { organizationId?: string } | null;
    return doc?.organizationId ?? organizationId;
  } catch (err) {
    // Two authorisations racing the unique index: the other one won.
    if ((err as { code?: number }).code !== 11000) throw err;
    const doc = (await ExtractionQuoteBindingModel.findOne({ quoteId }).lean()) as { organizationId?: string } | null;
    return doc?.organizationId ?? organizationId;
  }
}

async function boundOrganization(quoteId: string): Promise<string | null> {
  if (!walletIsDurable()) return memoryBindings.get(quoteId) ?? null;
  const doc = (await ExtractionQuoteBindingModel.findOne({ quoteId }).lean()) as { organizationId?: string } | null;
  return doc?.organizationId ?? null;
}

/**
 * The organisation a quote's run belongs to: the one its ledger debit charged,
 * else (free mode) the one that authorised it. Null when neither is on record.
 */
export async function quoteOwner(quoteId: string): Promise<string | null> {
  const debit = await findLedgerEntry(`extract:${quoteId}`);
  if (debit && debit.kind === "extraction") return debit.organizationId;
  return boundOrganization(quoteId);
}

export type RunResultStatus = "running" | "done" | "failed" | "unknown";

export interface RunResultView {
  quoteId: string;
  status: RunResultStatus;
  /** The stream's final `result` event, verbatim — only when status is done. */
  result: unknown | null;
  startedAt: number | null;
  finishedAt: number | null;
  reason: string | null;
  /** How long the parser lets a run say "running" before it is taken to have died. */
  maxRunMs: number | null;
  /** The parser's clock when it answered, so the browser can time its polling without trusting its own. */
  serverNow: number | null;
}

/** What answers "transient — ask again" rather than "there is no such run". */
export class RunResultUnavailable extends Error {}

const unknown = (quoteId: string, reason: string): RunResultView => ({
  quoteId,
  status: "unknown",
  result: null,
  startedAt: null,
  finishedAt: null,
  reason,
  maxRunMs: null,
  serverNow: null,
});

/**
 * Ask the parser for a run's status and result. Throws RunResultUnavailable
 * when the parser cannot answer right now (so the screen keeps polling);
 * resolves "unknown" when it answered that no run is recorded.
 */
export async function readParserRunResult(quoteId: string): Promise<RunResultView> {
  const secret = internalSecret();
  if (!secret) {
    logger.error(
      "PARSER_INTERNAL_SECRET is not set — a dropped read cannot be collected",
      new Error("missing PARSER_INTERNAL_SECRET"),
    );
    throw new RunResultUnavailable("The read's result cannot be collected right now.");
  }
  let res: Response;
  try {
    res = await fetch(`${parserBase()}/api/parser/quotes/${encodeURIComponent(quoteId)}/result`, {
      headers: { accept: "application/json", "x-okiru-internal-secret": secret },
    });
  } catch (err) {
    logger.warn("Could not reach the parser to collect a run result", { quoteId, error: (err as Error).message });
    throw new RunResultUnavailable("The document reader could not be reached.");
  }
  if (res.status === 404) return unknown(quoteId, "No read is on record for this batch.");
  if (!res.ok) {
    logger.warn("The parser could not answer for a run result", { quoteId, status: res.status });
    throw new RunResultUnavailable("The document reader could not answer right now.");
  }
  const body = (await res.json().catch(() => null)) as { data?: Record<string, unknown> } | null;
  const d = body?.data;
  if (!d) throw new RunResultUnavailable("The document reader's answer could not be read.");
  const status = d.status === "running" || d.status === "done" || d.status === "failed" ? d.status : "unknown";
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    quoteId,
    status,
    result: status === "done" ? (d.result ?? null) : null,
    startedAt: num(d.startedAt),
    finishedAt: num(d.finishedAt),
    reason: typeof d.reason === "string" ? d.reason : null,
    maxRunMs: num(d.maxRunMs),
    serverNow: num(d.now),
  };
}
