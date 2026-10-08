/**
 * Quote + payment state (flow steps 5–7).
 *
 * This is the record the money hangs off. It answers exactly one question for
 * the extraction gate: *has this specific set of files been paid for?*
 *
 * Two properties matter more than anything else here:
 *
 *  1. A quote is BOUND TO THE FILES via a content fingerprint. Without this,
 *     someone quotes a one-line CSV for 4c, pays, then posts a 500-page scan to
 *     the extractor. The gate re-fingerprints whatever is uploaded and refuses
 *     if it isn't what was paid for.
 *
 *  2. The gate FAILS CLOSED. Unknown quote, expired quote, unpaid quote,
 *     mismatched files — all refuse. Only an explicit `paid` record with a
 *     matching fingerprint opens it.
 *
 * PRODUCTION LIMITATION — the default store is in-memory, which is correct for
 * one process but WRONG for the 2-replica deployment: a quote created on pod A
 * is invisible to pod B, and a PayFast ITN landing on the wrong pod would not
 * mark it paid. Before real money, back this with shared state (the cluster
 * already runs Redis, which fits: TTL'd keys, exactly this shape). The
 * QuoteStore interface exists so that swap is a drop-in.
 */
import { createHash } from 'node:crypto';
import type { UploadedFileLike } from './fileExtraction.js';
import type { PricingQuote } from './pricingQuote.js';

export type PaymentStatus = 'not_started' | 'pending' | 'paid' | 'failed' | 'expired';

export interface QuoteRecord {
  quoteId: string;
  /** Content fingerprint of the exact files this quote covers. */
  fingerprint: string;
  /**
   * SHA-256 of each quoted file, in `quote.files` order. A run's values are
   * attributed to the quoted document by CONTENT through these — never by
   * name, which the client chooses and can swap between quote and run.
   */
  fileDigests?: string[];
  currency: string;
  totalCents: number;
  paymentStatus: PaymentStatus;
  /** Provider payment reference. Never card data. */
  providerRef?: string;
  createdAt: number;
  expiresAt: number;
  paidAt?: number;
  /** Set once extraction has consumed the quote, so it can't be reused. */
  consumedAt?: number;
  /**
   * Set when a paid quote that never ran is refunded. The refund waits for
   * this, and the gate refuses a voided quote, so the tokens cannot come back
   * while the quote can still buy an extraction.
   */
  voidedAt?: number;
  /**
   * Set when the run that consumed the quote is one that records an outcome
   * (the ESG routes). Only those runs can be judged by a MISSING outcome: one
   * still missing long after the run began means the run died. A B-BBEE run
   * records none, and its silence means nothing.
   */
  recordsOutcome?: boolean;
  /** What the paid run produced, recorded when it ends — the evidence a refund is decided on. */
  outcome?: ExtractionOutcome;
  quote: PricingQuote;
}

export interface ExtractionOutcome {
  finishedAt: number;
  /** resolved = a case came back; failed = it came back empty; error = the run threw. */
  status: 'resolved' | 'failed' | 'error';
  /** Quoted document's name → values read from it, a workbook's sheets folded into it. */
  valuesByFile: Record<string, number>;
  /**
   * True only when every value was attributed to a quoted document by content.
   * Anything less and the wallet refunds whole-run failures only.
   */
  attributed?: boolean;
  /** Values read across the whole run, attributed or not. */
  totalValues?: number;
  /**
   * False when the client had gone (its timeout, a closed tab, a dropped
   * connection) before the result could be sent: however well the run went,
   * nobody received it.
   */
  delivered?: boolean;
  /**
   * Until when the run's result is held for the client to collect after a
   * dropped connection (GET /quotes/:id/result). An undelivered run is not
   * lost while it is held — the wallet waits rather than refund it.
   */
  resultHeldUntil?: number;
  /** When an undelivered result was collected after all (it then reads as delivered). */
  collectedAt?: number;
  reason?: string;
}

export interface QuoteStore {
  put(record: QuoteRecord): Promise<void>;
  get(quoteId: string): Promise<QuoteRecord | null>;
  update(quoteId: string, patch: Partial<QuoteRecord>): Promise<QuoteRecord | null>;
  /**
   * Compare-and-set: apply `patch` only if `guard` holds for the record as it
   * stands at the moment of the write. `applied` false with a record = the
   * guard refused; with null = no such quote.
   */
  updateIf(
    quoteId: string,
    patch: Partial<QuoteRecord>,
    guard: (current: QuoteRecord) => boolean,
  ): Promise<{ applied: boolean; record: QuoteRecord | null }>;
}

/** SHA-256 of one upload's bytes. */
export function digestFile(file: Pick<UploadedFileLike, 'buffer'>): string {
  return createHash('sha256').update(file.buffer).digest('hex');
}

/**
 * Fingerprint a set of uploads by CONTENT, not by name — renaming a file must
 * not let it ride on another file's quote.
 */
export function fingerprintFiles(files: UploadedFileLike[]): string {
  const parts = files.map((f) => `${digestFile(f)}:${f.size}`).sort();
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

class InMemoryQuoteStore implements QuoteStore {
  private readonly records = new Map<string, QuoteRecord>();

  async put(record: QuoteRecord): Promise<void> {
    this.sweep();
    this.records.set(record.quoteId, record);
  }

  async get(quoteId: string): Promise<QuoteRecord | null> {
    const record = this.records.get(quoteId) ?? null;
    if (!record) return null;
    if (record.paymentStatus !== 'paid' && Date.now() > record.expiresAt) {
      record.paymentStatus = 'expired';
    }
    return record;
  }

  async update(quoteId: string, patch: Partial<QuoteRecord>): Promise<QuoteRecord | null> {
    return (await this.updateIf(quoteId, patch, () => true)).record;
  }

  // No await between the check and the write: atomic within the one process
  // this store serves.
  async updateIf(
    quoteId: string,
    patch: Partial<QuoteRecord>,
    guard: (current: QuoteRecord) => boolean,
  ): Promise<{ applied: boolean; record: QuoteRecord | null }> {
    const record = this.records.get(quoteId);
    if (!record) return { applied: false, record: null };
    if (!guard(record)) return { applied: false, record };
    Object.assign(record, patch);
    this.records.set(quoteId, record);
    return { applied: true, record };
  }

  /** Drop records well past expiry so a long-lived process doesn't grow forever. */
  private sweep(): void {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [id, r] of this.records) {
      if (r.createdAt < cutoff) this.records.delete(id);
    }
  }
}

let store: QuoteStore = new InMemoryQuoteStore();

/** Swap in a shared (Redis/Mongo) store for multi-replica production. */
export function setQuoteStore(next: QuoteStore): void {
  store = next;
}

export function getQuoteStore(): QuoteStore {
  return store;
}

export type GateResult =
  | { ok: true; record: QuoteRecord }
  | { ok: false; status: 402 | 409 | 410; code: string; message: string };

/**
 * The extraction gate. Fails closed: only a paid, unexpired, unconsumed quote
 * whose fingerprint matches the uploaded files opens it.
 */
export async function authoriseExtraction(
  quoteId: string | undefined,
  files: UploadedFileLike[],
): Promise<GateResult> {
  if (!quoteId) {
    return { ok: false, status: 402, code: 'QUOTE_REQUIRED', message: 'Get a quote and pay for it before extraction.' };
  }

  const record = await getQuoteStore().get(quoteId);
  if (!record) {
    return { ok: false, status: 402, code: 'QUOTE_NOT_FOUND', message: 'That quote is unknown. Request a new quote.' };
  }
  if (record.paymentStatus === 'expired' || (record.paymentStatus !== 'paid' && Date.now() > record.expiresAt)) {
    return { ok: false, status: 410, code: 'QUOTE_EXPIRED', message: 'That quote has expired. Request a new quote.' };
  }
  if (record.paymentStatus !== 'paid') {
    return { ok: false, status: 402, code: 'PAYMENT_REQUIRED', message: 'This quote has not been paid yet.' };
  }
  if (record.voidedAt) {
    return {
      ok: false,
      status: 409,
      code: 'QUOTE_VOIDED',
      message: 'This batch never ran, so its tokens were refunded. Upload the documents again for a new price.',
    };
  }
  if (record.consumedAt) {
    return { ok: false, status: 409, code: 'QUOTE_ALREADY_USED', message: 'This quote has already been used for an extraction.' };
  }
  if (record.fingerprint !== fingerprintFiles(files)) {
    return {
      ok: false,
      status: 409,
      code: 'QUOTE_FILE_MISMATCH',
      message: 'These are not the documents that were quoted and paid for. Request a quote for these files.',
    };
  }

  return { ok: true, record };
}

/**
 * Burn a quote for exactly one run.
 *
 * The gate's checks and this write used to be separate steps, so a void (the
 * refund of an unused quote) or a second run could land between them and both
 * would win — a refund AND a run, or two runs on one payment. The write is now
 * a compare-and-set against the record as it stands at that instant: of a run,
 * a second run and a void, exactly one gets the quote.
 */
export async function claimQuoteForRun(quoteId: string, extra: Partial<QuoteRecord> = {}): Promise<GateResult> {
  const { applied, record } = await getQuoteStore().updateIf(
    quoteId,
    { ...extra, consumedAt: Date.now() },
    (current) => !current.consumedAt && !current.voidedAt,
  );
  if (applied && record) return { ok: true, record };
  if (record?.voidedAt) {
    return {
      ok: false,
      status: 409,
      code: 'QUOTE_VOIDED',
      message: 'This batch never ran, so its tokens were refunded. Upload the documents again for a new price.',
    };
  }
  return { ok: false, status: 409, code: 'QUOTE_ALREADY_USED', message: 'This quote has already been used for an extraction.' };
}
