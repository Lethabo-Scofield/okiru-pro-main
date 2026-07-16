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
 * is invisible to pod B, and a Yoco webhook landing on the wrong pod would not
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
  currency: string;
  totalCents: number;
  paymentStatus: PaymentStatus;
  /** Yoco checkout id / payment reference. Never card data. */
  providerRef?: string;
  createdAt: number;
  expiresAt: number;
  paidAt?: number;
  /** Set once extraction has consumed the quote, so it can't be reused. */
  consumedAt?: number;
  quote: PricingQuote;
}

export interface QuoteStore {
  put(record: QuoteRecord): Promise<void>;
  get(quoteId: string): Promise<QuoteRecord | null>;
  update(quoteId: string, patch: Partial<QuoteRecord>): Promise<QuoteRecord | null>;
}

/**
 * Fingerprint a set of uploads by CONTENT, not by name — renaming a file must
 * not let it ride on another file's quote.
 */
export function fingerprintFiles(files: UploadedFileLike[]): string {
  const parts = files
    .map((f) => `${createHash('sha256').update(f.buffer).digest('hex')}:${f.size}`)
    .sort();
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
    const record = this.records.get(quoteId);
    if (!record) return null;
    Object.assign(record, patch);
    this.records.set(quoteId, record);
    return record;
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
