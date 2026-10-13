/**
 * POST /api/parser/resolve-file-paid — the paid single-file re-read the
 * document library uses. Money rules, so the abuse cases come first:
 *   - unpaid / priced-at-nothing / other bytes  => refused, nothing claimed
 *   - a paid quote buys exactly one read, and a voided one none
 *   - every run that starts records how it ended, keyed by the QUOTED name
 */
import { beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import parserRouter from '../../src/routes/parser.js';
import {
  digestFile,
  fingerprintFiles,
  getQuoteStore,
  setQuoteStore,
  type QuoteRecord,
  type QuoteStore,
} from '../../src/services/quoteStore.js';

const AFS = Buffer.from(
  'Annual Financial Statements\nRegistered name: Silver Lake Trading 447 (Pty) Ltd\nRevenue: R 274 953 097\nNet profit after tax: R 33 862 998\n',
  'utf8',
);

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/parser', parserRouter);
  return a;
}

function freshStore(): QuoteStore {
  const map = new Map<string, QuoteRecord>();
  return {
    async put(r) { map.set(r.quoteId, r); },
    async get(id) { return map.get(id) ?? null; },
    async update(id, patch) {
      const r = map.get(id);
      if (!r) return null;
      Object.assign(r, patch);
      return r;
    },
    async updateIf(id, patch, guard) {
      const r = map.get(id);
      if (!r) return { applied: false, record: null };
      if (!guard(r)) return { applied: false, record: r };
      Object.assign(r, patch);
      return { applied: true, record: r };
    },
  };
}

async function quoteFor(bytes: Buffer, over: Partial<QuoteRecord> = {}): Promise<string> {
  const file = { originalname: 'afs.txt', mimetype: 'text/plain', buffer: bytes, size: bytes.length };
  const quoteId = `quote_paid_${Math.random().toString(36).slice(2)}`;
  await getQuoteStore().put({
    quoteId,
    fingerprint: fingerprintFiles([file]),
    fileDigests: [digestFile(file)],
    currency: 'ZAR',
    totalCents: 300,
    paymentStatus: 'paid',
    createdAt: Date.now(),
    expiresAt: Date.now() + 3_600_000,
    quote: { files: [{ filename: 'afs.txt', pricing: { extractionCents: 300 } }] } as never,
    ...over,
  });
  return quoteId;
}

const read = (quoteId: string | undefined, bytes: Buffer, name = 'afs.txt') => {
  const r = request(app()).post('/api/parser/resolve-file-paid').attach('file', bytes, { filename: name, contentType: 'text/plain' });
  return quoteId ? r.field('quote_id', quoteId) : r;
};

beforeEach(() => {
  setQuoteStore(freshStore());
  delete process.env.PARSER_REQUIRE_PAYMENT; // the gate is on unless explicitly switched off
});

describe('POST /api/parser/resolve-file-paid', () => {
  it('refuses without a paid quote, and claims nothing', async () => {
    expect((await read(undefined, AFS)).status).toBe(402);
    const unpaid = await quoteFor(AFS, { paymentStatus: 'not_started' });
    const res = await read(unpaid, AFS);
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('PAYMENT_REQUIRED');
    expect((await getQuoteStore().get(unpaid))?.consumedAt).toBeUndefined();
  });

  it('never runs on a quote priced at nothing', async () => {
    const zero = await quoteFor(AFS, { totalCents: 0 });
    const res = await read(zero, AFS);
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('QUOTE_UNPRICED');
    expect((await getQuoteStore().get(zero))?.consumedAt).toBeUndefined();
  });

  it('refuses bytes other than the ones that were quoted', async () => {
    const quoteId = await quoteFor(AFS);
    const res = await read(quoteId, Buffer.from('a different, more expensive document'));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('QUOTE_FILE_MISMATCH');
  });

  it('reads once, and records the outcome under the quoted name — whatever the upload is called', async () => {
    const quoteId = await quoteFor(AFS);
    const res = await read(quoteId, AFS, 'renamed-on-the-way.txt');
    expect([200, 422]).toContain(res.status);
    expect(res.body).toHaveProperty('extracted_fields');

    const record = await getQuoteStore().get(quoteId);
    expect(record?.consumedAt).toBeTruthy();
    expect(record?.recordsOutcome).toBe(true);
    expect(record?.outcome?.attributed).toBe(true);
    expect(Object.keys(record?.outcome?.valuesByFile ?? {})).toEqual(['afs.txt']);
    expect(record?.outcome?.valuesByFile['afs.txt']).toBe(record?.outcome?.totalValues);
    expect(record?.outcome?.delivered).toBe(true);

    // One payment, one read.
    const again = await read(quoteId, AFS);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('QUOTE_ALREADY_USED');
  });

  it('refuses a quote whose run was voided and refunded', async () => {
    const quoteId = await quoteFor(AFS, { voidedAt: Date.now() });
    const res = await read(quoteId, AFS);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('QUOTE_VOIDED');
  });
});
