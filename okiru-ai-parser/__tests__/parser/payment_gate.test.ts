/**
 * The payment gate (flow steps 5–7). These tests exist to stop money bugs, so
 * they lean on the abuse cases rather than the happy path:
 *   - no quote / unknown / unpaid / expired  => refused
 *   - paid quote used twice                  => refused
 *   - paid a cheap quote, extracted different (expensive) files => refused
 * The gate must FAIL CLOSED in every one of those.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  authoriseExtraction,
  fingerprintFiles,
  getQuoteStore,
  setQuoteStore,
  type QuoteRecord,
  type QuoteStore,
} from '../../src/services/quoteStore.js';
import type { UploadedFileLike } from '../../src/services/fileExtraction.js';

const upload = (name: string, content: string): UploadedFileLike => {
  const buffer = Buffer.from(content, 'utf8');
  return { originalname: name, mimetype: 'text/plain', buffer, size: buffer.length };
};

/** Fresh in-memory store per test so records never leak between cases. */
function freshStore(): QuoteStore {
  const map = new Map<string, QuoteRecord>();
  return {
    async put(r) { map.set(r.quoteId, r); },
    async get(id) {
      const r = map.get(id) ?? null;
      if (r && r.paymentStatus !== 'paid' && Date.now() > r.expiresAt) r.paymentStatus = 'expired';
      return r;
    },
    async update(id, patch) {
      const r = map.get(id);
      if (!r) return null;
      Object.assign(r, patch);
      return r;
    },
  };
}

const record = (over: Partial<QuoteRecord> & { fingerprint: string }): QuoteRecord => ({
  quoteId: 'q1',
  currency: 'ZAR',
  totalCents: 754,
  paymentStatus: 'paid',
  createdAt: Date.now(),
  expiresAt: Date.now() + 30 * 60 * 1000,
  quote: {} as QuoteRecord['quote'],
  ...over,
});

describe('fingerprintFiles', () => {
  it('is content-based — renaming a file does not change it', () => {
    const a = fingerprintFiles([upload('a.txt', 'same bytes')]);
    const b = fingerprintFiles([upload('renamed.txt', 'same bytes')]);
    expect(a).toBe(b);
  });

  it('changes when the content changes', () => {
    expect(fingerprintFiles([upload('a.txt', 'one')])).not.toBe(fingerprintFiles([upload('a.txt', 'two')]));
  });

  it('is order-independent for the same set', () => {
    const f1 = upload('a.txt', 'alpha');
    const f2 = upload('b.txt', 'beta');
    expect(fingerprintFiles([f1, f2])).toBe(fingerprintFiles([f2, f1]));
  });
});

describe('authoriseExtraction — fails closed', () => {
  let files: UploadedFileLike[];

  beforeEach(() => {
    setQuoteStore(freshStore());
    files = [upload('cert.txt', 'B-BBEE certificate Level 2')];
  });

  it('refuses with 402 when no quote is supplied', async () => {
    const gate = await authoriseExtraction(undefined, files);
    expect(gate).toMatchObject({ ok: false, status: 402, code: 'QUOTE_REQUIRED' });
  });

  it('refuses with 402 for an unknown quote', async () => {
    const gate = await authoriseExtraction('does-not-exist', files);
    expect(gate).toMatchObject({ ok: false, status: 402, code: 'QUOTE_NOT_FOUND' });
  });

  it('refuses with 402 when the quote is not paid', async () => {
    await getQuoteStore().put(record({ fingerprint: fingerprintFiles(files), paymentStatus: 'not_started' }));
    const gate = await authoriseExtraction('q1', files);
    expect(gate).toMatchObject({ ok: false, status: 402, code: 'PAYMENT_REQUIRED' });
  });

  it('refuses with 410 when the quote has expired', async () => {
    await getQuoteStore().put(record({
      fingerprint: fingerprintFiles(files),
      paymentStatus: 'not_started',
      expiresAt: Date.now() - 1000,
    }));
    const gate = await authoriseExtraction('q1', files);
    expect(gate).toMatchObject({ ok: false, status: 410, code: 'QUOTE_EXPIRED' });
  });

  it('refuses to let one payment buy two extractions', async () => {
    await getQuoteStore().put(record({ fingerprint: fingerprintFiles(files), consumedAt: Date.now() }));
    const gate = await authoriseExtraction('q1', files);
    expect(gate).toMatchObject({ ok: false, status: 409, code: 'QUOTE_ALREADY_USED' });
  });

  it('refuses when the uploaded files are not the ones that were paid for', async () => {
    // Paid for a one-line CSV...
    await getQuoteStore().put(record({ fingerprint: fingerprintFiles([upload('tiny.txt', 'x')]) }));
    // ...then tried to extract something else entirely.
    const gate = await authoriseExtraction('q1', [upload('huge.txt', 'y'.repeat(50_000))]);
    expect(gate).toMatchObject({ ok: false, status: 409, code: 'QUOTE_FILE_MISMATCH' });
  });

  it('opens only for a paid, unexpired, unconsumed quote with matching files', async () => {
    await getQuoteStore().put(record({ fingerprint: fingerprintFiles(files) }));
    const gate = await authoriseExtraction('q1', files);
    expect(gate.ok).toBe(true);
  });
});
