/**
 * The credit wallet.
 *
 * Okiru used to charge per upload: every document set produced a quote and a
 * card payment before anything could be read. That put a checkout in the middle
 * of the work, and people abandoned mid-flow. The wallet replaces it — an
 * organisation holds credit tokens, work spends them, and buying more is a
 * separate, unhurried act.
 *
 * Three rules this module exists to enforce:
 *
 *  1. THE WALLET BELONGS TO THE ORGANISATION. Colleagues on the same client
 *     draw on one balance; an admin's top-up funds the whole team.
 *
 *  2. A DEBIT IS IDEMPOTENT. Every movement carries a `reference` — the id of
 *     the thing being paid for — and that reference is uniquely indexed. A
 *     retried request (a refreshed tab, a proxy retry, a double-click) collides
 *     on the index and is recognised as the same movement rather than charged
 *     twice.
 *
 *  3. A DEBIT FAILS CLOSED. The decrement is guarded by `$gte` in the same
 *     atomic update, so two concurrent extractions cannot both pass a
 *     read-then-write balance check and overdraw. There is no path that spends
 *     tokens an organisation does not hold.
 *
 * The balance on the organisation document is a cache of the ledger's sum, kept
 * there so reading a balance costs one document rather than a scan. The ledger
 * is the record of truth, and it is append-only.
 */
import mongoose from "mongoose";
import { OrganizationModel, TokenLedgerModel } from "../shared/schema";
import { createLogger } from "./logger";

const logger = createLogger("TokenWallet");

/** What a new organisation is granted, free, the first time its wallet is read. */
export const FREE_TOKEN_GRANT = 10_000;

/**
 * The exchange rate between quoted processing price and credit tokens.
 *
 * The parser already prices a document set in ZAR cents from real structure
 * (pages, sheets, OCR need, predicted model tokens). Rather than invent a
 * second pricing model that would drift from it, a token IS a cent of that
 * quote: 10,000 free tokens = R100 of processing.
 *
 * One constant, one place to change it if the commercial ratio moves.
 */
export const TOKENS_PER_CENT = Number(process.env.TOKENS_PER_CENT || 1);

/** Quoted price (ZAR cents) → tokens. Always rounds UP: never undercharge. */
export function centsToTokens(cents: number): number {
  if (!Number.isFinite(cents) || cents <= 0) return 0;
  return Math.max(1, Math.ceil(cents * TOKENS_PER_CENT));
}

export type LedgerKind = "grant" | "purchase" | "extraction" | "refund" | "adjustment";

export interface LedgerEntry {
  id: string;
  organizationId: string;
  userId: string | null;
  delta: number;
  balanceAfter: number;
  kind: LedgerKind;
  description: string;
  reference: string;
  createdAt: string;
}

export interface Wallet {
  organizationId: string;
  balance: number;
  plan: "free" | "pro";
  planRenewsAt: string | null;
}

export type DebitResult =
  | { ok: true; balance: number; alreadyApplied: boolean }
  | { ok: false; reason: "insufficient"; balance: number; shortfall: number };

/**
 * Mongo-free fallback.
 *
 * The web server already runs without Mongo (offline demo, unit tests) via
 * MemoryStorage. The wallet has to survive that too, or every page that shows a
 * balance breaks in dev. Same semantics, same guarantees, process-local.
 */
interface WalletStore {
  read(orgId: string): Promise<{ balance: number | null; plan: "free" | "pro"; planRenewsAt: string | null } | null>;
  seed(orgId: string, amount: number): Promise<boolean>;
  applyDelta(orgId: string, delta: number, requireBalance: boolean): Promise<number | null>;
  setPlan(orgId: string, plan: "free" | "pro", renewsAt: string | null): Promise<void>;
  appendLedger(entry: Omit<LedgerEntry, "id" | "createdAt"> & { metadata?: unknown }): Promise<boolean>;
  findLedger(reference: string): Promise<LedgerEntry | null>;
  listLedger(orgId: string, limit: number): Promise<LedgerEntry[]>;
}

class MongoWalletStore implements WalletStore {
  async read(orgId: string) {
    const doc = (await OrganizationModel.findOne({ id: orgId })
      .select("tokenBalance plan planRenewsAt")
      .lean()) as { tokenBalance?: number | null; plan?: string; planRenewsAt?: string | null } | null;
    if (!doc) return null;
    return {
      balance: typeof doc.tokenBalance === "number" ? doc.tokenBalance : null,
      plan: doc.plan === "pro" ? ("pro" as const) : ("free" as const),
      planRenewsAt: doc.planRenewsAt ?? null,
    };
  }

  /** Grants the opening balance exactly once, even under concurrent first reads. */
  async seed(orgId: string, amount: number): Promise<boolean> {
    const res = await OrganizationModel.updateOne(
      { id: orgId, $or: [{ tokenBalance: null }, { tokenBalance: { $exists: false } }] },
      { $set: { tokenBalance: amount, tokensSeededAt: new Date().toISOString() } },
    );
    return (res.modifiedCount ?? 0) > 0;
  }

  /**
   * The only thing that moves a balance. When `requireBalance` is set the
   * `$gte` guard lives INSIDE the filter, so the check and the decrement are
   * one atomic operation and concurrent spends cannot both pass.
   */
  async applyDelta(orgId: string, delta: number, requireBalance: boolean): Promise<number | null> {
    const filter: Record<string, unknown> = { id: orgId };
    if (requireBalance) filter.tokenBalance = { $gte: Math.abs(delta) };
    const doc = (await OrganizationModel.findOneAndUpdate(
      filter,
      { $inc: { tokenBalance: delta } },
      { new: true, projection: { tokenBalance: 1 } },
    ).lean()) as { tokenBalance?: number } | null;
    return doc ? Number(doc.tokenBalance ?? 0) : null;
  }

  async setPlan(orgId: string, plan: "free" | "pro", renewsAt: string | null): Promise<void> {
    await OrganizationModel.updateOne({ id: orgId }, { $set: { plan, planRenewsAt: renewsAt } });
  }

  async appendLedger(entry: Omit<LedgerEntry, "id" | "createdAt"> & { metadata?: unknown }): Promise<boolean> {
    try {
      await TokenLedgerModel.create(entry);
      return true;
    } catch (err) {
      // Duplicate `reference` — this exact movement is already recorded. That
      // is the idempotency guard doing its job, not a failure.
      if ((err as { code?: number }).code === 11000) return false;
      throw err;
    }
  }

  async findLedger(reference: string): Promise<LedgerEntry | null> {
    const doc = (await TokenLedgerModel.findOne({ reference }).lean()) as Record<string, unknown> | null;
    return doc ? toLedgerEntry(doc) : null;
  }

  async listLedger(orgId: string, limit: number): Promise<LedgerEntry[]> {
    const docs = (await TokenLedgerModel.find({ organizationId: orgId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()) as Array<Record<string, unknown>>;
    return docs.map(toLedgerEntry);
  }
}

class MemoryWalletStore implements WalletStore {
  private readonly orgs = new Map<string, { balance: number | null; plan: "free" | "pro"; planRenewsAt: string | null }>();
  private readonly ledger: LedgerEntry[] = [];
  private readonly references = new Set<string>();

  private row(orgId: string) {
    let row = this.orgs.get(orgId);
    if (!row) {
      row = { balance: null, plan: "free", planRenewsAt: null };
      this.orgs.set(orgId, row);
    }
    return row;
  }

  async read(orgId: string) {
    return { ...this.row(orgId) };
  }

  async seed(orgId: string, amount: number): Promise<boolean> {
    const row = this.row(orgId);
    if (row.balance !== null) return false;
    row.balance = amount;
    return true;
  }

  async applyDelta(orgId: string, delta: number, requireBalance: boolean): Promise<number | null> {
    const row = this.row(orgId);
    const current = row.balance ?? 0;
    if (requireBalance && current < Math.abs(delta)) return null;
    row.balance = current + delta;
    return row.balance;
  }

  async setPlan(orgId: string, plan: "free" | "pro", renewsAt: string | null): Promise<void> {
    const row = this.row(orgId);
    row.plan = plan;
    row.planRenewsAt = renewsAt;
  }

  async appendLedger(entry: Omit<LedgerEntry, "id" | "createdAt">): Promise<boolean> {
    if (this.references.has(entry.reference)) return false;
    this.references.add(entry.reference);
    this.ledger.unshift({ ...entry, id: `mem_${this.ledger.length + 1}`, createdAt: new Date().toISOString() });
    return true;
  }

  async findLedger(reference: string): Promise<LedgerEntry | null> {
    return this.ledger.find((e) => e.reference === reference) ?? null;
  }

  async listLedger(orgId: string, limit: number): Promise<LedgerEntry[]> {
    return this.ledger.filter((e) => e.organizationId === orgId).slice(0, limit);
  }
}

function toLedgerEntry(doc: Record<string, unknown>): LedgerEntry {
  const createdAt = doc.createdAt;
  return {
    id: String(doc.id ?? ""),
    organizationId: String(doc.organizationId ?? ""),
    userId: (doc.userId as string | null) ?? null,
    delta: Number(doc.delta ?? 0),
    balanceAfter: Number(doc.balanceAfter ?? 0),
    kind: (doc.kind as LedgerKind) ?? "adjustment",
    description: String(doc.description ?? ""),
    reference: String(doc.reference ?? ""),
    createdAt: createdAt instanceof Date ? createdAt.toISOString() : String(createdAt ?? ""),
  };
}

const memoryStore = new MemoryWalletStore();
const mongoStore = new MongoWalletStore();

/** Thrown instead of falling back to RAM when real money is at stake. */
export class WalletUnavailableError extends Error {
  constructor() {
    super("The token wallet's database is unavailable, so no tokens can move right now.");
    this.name = "WalletUnavailableError";
  }
}

/** Whether wallet writes land somewhere that survives a restart. */
export function walletIsDurable(): boolean {
  return mongoose.connection?.readyState === 1;
}

/**
 * Mongo when it is actually connected — checked per call rather than once at
 * import, because the web server starts before (and survives without) the
 * database.
 *
 * The in-memory store is a dev/test convenience. In PRODUCTION with payment
 * enforced it was a fail-open in the one path that moves money: Mongo going
 * down handed every organisation a fresh FREE_TOKEN_GRANT from RAM (free
 * extraction), and a PayFast credit written there evaporated on the next
 * restart (paid money, lost credit). Refusing is the honest answer — the
 * authorize route returns 503 and charges nothing, and a PayFast ITN gets a
 * 5xx so PayFast retries until the ledger is durable again.
 */
function store(): WalletStore {
  if (walletIsDurable()) return mongoStore;
  if (process.env.NODE_ENV === "production" && process.env.TOKENS_REQUIRE_PAYMENT !== "false") {
    throw new WalletUnavailableError();
  }
  return memoryStore;
}

/**
 * The wallet for an organisation, granting the free opening balance on first
 * read. Every other function here goes through this, so there is no way to
 * spend from — or report on — a wallet that was never granted.
 */
export async function ensureWallet(orgId: string): Promise<Wallet> {
  const s = store();
  const existing = await s.read(orgId);
  if (existing && existing.balance !== null) {
    return {
      organizationId: orgId,
      balance: existing.balance,
      plan: existing.plan,
      planRenewsAt: existing.planRenewsAt,
    };
  }

  const seeded = await s.seed(orgId, FREE_TOKEN_GRANT);
  if (seeded) {
    await s.appendLedger({
      organizationId: orgId,
      userId: null,
      delta: FREE_TOKEN_GRANT,
      balanceAfter: FREE_TOKEN_GRANT,
      kind: "grant",
      description: "Welcome grant",
      reference: `grant:${orgId}`,
    });
    logger.info("Granted opening token balance", { orgId, tokens: FREE_TOKEN_GRANT });
  }

  const after = await s.read(orgId);
  return {
    organizationId: orgId,
    balance: after?.balance ?? FREE_TOKEN_GRANT,
    plan: after?.plan ?? "free",
    planRenewsAt: after?.planRenewsAt ?? null,
  };
}

/**
 * Spend tokens.
 *
 * The decrement happens first (guarded, atomic), then the ledger records it. If
 * the ledger write collides on `reference` this movement was already applied by
 * an earlier attempt, so the decrement is rolled back and the caller is told
 * the charge already stands — which is what makes a retry safe.
 */
export async function debitTokens(params: {
  organizationId: string;
  userId?: string | null;
  amount: number;
  reference: string;
  description: string;
  metadata?: Record<string, unknown>;
}): Promise<DebitResult> {
  const amount = Math.max(0, Math.round(params.amount));
  const wallet = await ensureWallet(params.organizationId);
  if (amount === 0) return { ok: true, balance: wallet.balance, alreadyApplied: false };

  const s = store();

  // Cheap pre-check so a genuine repeat gets a clean answer without touching
  // the balance at all. The unique index below is the real guard.
  const prior = await s.findLedger(params.reference);
  if (prior) {
    const current = await s.read(params.organizationId);
    return { ok: true, balance: current?.balance ?? wallet.balance, alreadyApplied: true };
  }

  const balanceAfter = await s.applyDelta(params.organizationId, -amount, true);
  if (balanceAfter === null) {
    return {
      ok: false,
      reason: "insufficient",
      balance: wallet.balance,
      shortfall: Math.max(0, amount - wallet.balance),
    };
  }

  const recorded = await s.appendLedger({
    organizationId: params.organizationId,
    userId: params.userId ?? null,
    delta: -amount,
    balanceAfter,
    kind: "extraction",
    description: params.description,
    reference: params.reference,
    metadata: params.metadata ?? null,
  });

  if (!recorded) {
    // Someone else recorded this exact movement between our pre-check and the
    // write. Put the tokens back — their debit stands, ours must not.
    await s.applyDelta(params.organizationId, amount, false);
    const current = await s.read(params.organizationId);
    return { ok: true, balance: current?.balance ?? wallet.balance, alreadyApplied: true };
  }

  logger.info("Tokens debited", { orgId: params.organizationId, amount, balanceAfter, reference: params.reference });
  return { ok: true, balance: balanceAfter, alreadyApplied: false };
}

/**
 * Put tokens in — a purchase, a refund for work we failed to deliver, or an
 * admin adjustment. Same idempotency contract as a debit.
 */
export async function creditTokens(params: {
  organizationId: string;
  userId?: string | null;
  amount: number;
  reference: string;
  description: string;
  kind: Extract<LedgerKind, "purchase" | "refund" | "adjustment" | "grant">;
  metadata?: Record<string, unknown>;
}): Promise<{ balance: number; alreadyApplied: boolean }> {
  const amount = Math.max(0, Math.round(params.amount));
  const wallet = await ensureWallet(params.organizationId);
  if (amount === 0) return { balance: wallet.balance, alreadyApplied: false };

  const s = store();
  const prior = await s.findLedger(params.reference);
  if (prior) {
    const current = await s.read(params.organizationId);
    return { balance: current?.balance ?? wallet.balance, alreadyApplied: true };
  }

  const balanceAfter = (await s.applyDelta(params.organizationId, amount, false)) ?? wallet.balance + amount;
  const recorded = await s.appendLedger({
    organizationId: params.organizationId,
    userId: params.userId ?? null,
    delta: amount,
    balanceAfter,
    kind: params.kind,
    description: params.description,
    reference: params.reference,
    metadata: params.metadata ?? null,
  });

  if (!recorded) {
    await s.applyDelta(params.organizationId, -amount, false);
    const current = await s.read(params.organizationId);
    return { balance: current?.balance ?? wallet.balance, alreadyApplied: true };
  }

  logger.info("Tokens credited", { orgId: params.organizationId, amount, balanceAfter, kind: params.kind });
  return { balance: balanceAfter, alreadyApplied: false };
}

export async function setPlan(orgId: string, plan: "free" | "pro", renewsAt: string | null): Promise<void> {
  await store().setPlan(orgId, plan, renewsAt);
}

export async function listLedger(orgId: string, limit = 50): Promise<LedgerEntry[]> {
  return store().listLedger(orgId, Math.min(Math.max(1, limit), 200));
}
