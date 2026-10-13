/**
 * The route the web wallet reads to decide a refund. It is server-to-server:
 * whoever can read it learns nothing they could spend, but a browser still has
 * no business here, so it wears the same guard as settle.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import parserRouter from '../../src/routes/parser.js';
import { authoriseExtraction, getQuoteStore } from '../../src/services/quoteStore.js';

const SECRET = 'test-internal-secret';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/parser', parserRouter);
  return a;
}

async function paidQuote(extra: Record<string, unknown> = {}) {
  const quoteId = `quote_route_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  await getQuoteStore().put({
    quoteId,
    fingerprint: 'f',
    currency: 'ZAR',
    totalCents: 500,
    paymentStatus: 'paid',
    createdAt: Date.now(),
    expiresAt: Date.now() + 3_600_000,
    quote: {
      files: [
        { filename: 'fuel.xlsx', pricing: { extractionCents: 300 } },
        { filename: 'scan.pdf', pricing: { extractionCents: 150 } },
      ],
    } as never,
    ...extra,
  });
  return quoteId;
}

describe('GET /api/parser/quotes/:id/outcome', () => {
  const previous = process.env.PARSER_INTERNAL_SECRET;
  beforeEach(() => { process.env.PARSER_INTERNAL_SECRET = SECRET; });
  afterEach(() => {
    if (previous === undefined) delete process.env.PARSER_INTERNAL_SECRET;
    else process.env.PARSER_INTERNAL_SECRET = previous;
  });

  it('does not exist when no internal secret is configured', async () => {
    delete process.env.PARSER_INTERNAL_SECRET;
    const quoteId = await paidQuote();
    const res = await request(app()).get(`/api/parser/quotes/${quoteId}/outcome`).set('x-okiru-internal-secret', 'anything');
    expect(res.status).toBe(404);
  });

  it('refuses a caller without the secret', async () => {
    const quoteId = await paidQuote();
    expect((await request(app()).get(`/api/parser/quotes/${quoteId}/outcome`)).status).toBe(403);
    const wrong = await request(app()).get(`/api/parser/quotes/${quoteId}/outcome`).set('x-okiru-internal-secret', 'nope');
    expect(wrong.status).toBe(403);
  });

  it('returns the outcome, whether the run records one, and the per-file prices', async () => {
    const consumedAt = Date.now() - 60_000;
    const quoteId = await paidQuote({
      consumedAt,
      recordsOutcome: true,
      outcome: { finishedAt: Date.now(), status: 'resolved', valuesByFile: { 'fuel.xlsx': 12, 'scan.pdf': 0 } },
    });
    const res = await request(app()).get(`/api/parser/quotes/${quoteId}/outcome`).set('x-okiru-internal-secret', SECRET);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      quoteId,
      paymentStatus: 'paid',
      consumedAt,
      recordsOutcome: true,
      totalCents: 500,
      outcome: { status: 'resolved', valuesByFile: { 'fuel.xlsx': 12, 'scan.pdf': 0 } },
      files: [
        { filename: 'fuel.xlsx', extractionCents: 300 },
        { filename: 'scan.pdf', extractionCents: 150 },
      ],
    });
  });

  it('says plainly when a run records no outcome (a B-BBEE run)', async () => {
    const quoteId = await paidQuote({ consumedAt: Date.now() });
    const res = await request(app()).get(`/api/parser/quotes/${quoteId}/outcome`).set('x-okiru-internal-secret', SECRET);
    expect(res.body.data.recordsOutcome).toBe(false);
    expect(res.body.data.outcome).toBeNull();
  });

  it('answers 404 for a quote it does not know', async () => {
    const res = await request(app()).get('/api/parser/quotes/no-such-quote/outcome').set('x-okiru-internal-secret', SECRET);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/parser/quotes/:id/void', () => {
  const previous = process.env.PARSER_INTERNAL_SECRET;
  beforeEach(() => { process.env.PARSER_INTERNAL_SECRET = SECRET; });
  afterEach(() => {
    if (previous === undefined) delete process.env.PARSER_INTERNAL_SECRET;
    else process.env.PARSER_INTERNAL_SECRET = previous;
  });

  it('voids a paid quote that never ran, after which it buys nothing', async () => {
    const quoteId = await paidQuote();
    const res = await request(app()).post(`/api/parser/quotes/${quoteId}/void`).set('x-okiru-internal-secret', SECRET);
    expect(res.status).toBe(200);
    expect(typeof res.body.data.voidedAt).toBe('number');

    // The gate refuses it before it even looks at the files...
    const gate = await authoriseExtraction(quoteId, []);
    expect(gate).toMatchObject({ ok: false, status: 409, code: 'QUOTE_VOIDED' });
    // ...and the wallet cannot settle it back into life.
    const settle = await request(app())
      .post(`/api/parser/quotes/${quoteId}/settle`)
      .set('x-okiru-internal-secret', SECRET)
      .send({ reference: 'extract:again' });
    expect(settle.status).toBe(409);
    expect(settle.body.error?.code ?? settle.body.code).toBe('QUOTE_VOIDED');
  });

  it('will not void a quote a run has consumed — that run is judged by its outcome', async () => {
    const quoteId = await paidQuote({ consumedAt: Date.now(), recordsOutcome: true });
    const res = await request(app()).post(`/api/parser/quotes/${quoteId}/void`).set('x-okiru-internal-secret', SECRET);
    expect(res.status).toBe(409);
    expect((await getQuoteStore().get(quoteId))?.voidedAt).toBeUndefined();
  });

  it('refuses a caller without the secret', async () => {
    const quoteId = await paidQuote();
    expect((await request(app()).post(`/api/parser/quotes/${quoteId}/void`)).status).toBe(403);
    expect((await getQuoteStore().get(quoteId))?.voidedAt).toBeUndefined();
  });
});
