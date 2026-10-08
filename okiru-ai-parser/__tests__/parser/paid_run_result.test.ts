/**
 * A paid read whose connection drops is not a lost read.
 *
 * Brian's network dropped while a B-BBEE read was streaming. The run carried
 * on server-side and finished, but the result went to a closed socket, and the
 * retry met "already processed" because the quote was (correctly) spent. These
 * pin the parser half of the fix:
 *   - a paid stream run records running → done | failed, and keeps the exact
 *     final payload (signed run records included) for 24h, under a size cap
 *   - a client disconnect does not abandon a paid run (the agent pass is
 *     cancelled on disconnect only when nothing was paid)
 *   - GET /quotes/:id/result is server-to-server only, like /settle and /outcome
 *   - collecting an undelivered ESG result marks it delivered, so the wallet
 *     does not refund a run the organisation received after all
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const control = vi.hoisted(() => ({
  /** Holds the AI pass open until the test lets it finish. */
  gate: Promise.resolve() as Promise<void>,
  release: () => {},
  started: () => {},
  startedSignal: Promise.resolve() as Promise<void>,
  /** The agent signal the B-BBEE route handed the AI pass. */
  agentSignal: undefined as AbortSignal | undefined,
  agentOptionSeen: false,
}));

function holdTheAiPass() {
  control.gate = new Promise<void>((resolve) => { control.release = resolve; });
  control.startedSignal = new Promise<void>((resolve) => { control.started = resolve; });
}

vi.mock('../../src/services/caseExtraction.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/caseExtraction.js')>();
  return {
    ...actual,
    extractCaseEntities: vi.fn(async (_inputs: unknown, _model: unknown, _progress: unknown, options?: { agent?: { signal?: AbortSignal } }) => {
      control.agentOptionSeen = Boolean(options?.agent);
      control.agentSignal = options?.agent?.signal;
      control.started();
      await control.gate;
      return null;
    }),
  };
});

vi.mock('../../src/services/esgCaseExtraction.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/esgCaseExtraction.js')>();
  return {
    ...actual,
    extractEsgCaseEntities: vi.fn(async () => {
      control.started();
      await control.gate;
      return {
        extractions: [{ documentId: 'fuel', sourceFile: 'fuel.txt', element: 'ENVIRONMENT', values: [{ field: 'litres', value: 1200 }] }],
      };
    }),
  };
});

import parserRouter from '../../src/routes/parser.js';
import {
  digestFile,
  fingerprintFiles,
  getQuoteStore,
  setQuoteStore,
  type QuoteRecord,
  type QuoteStore,
} from '../../src/services/quoteStore.js';
import {
  RUN_RESULT_TTL_MS,
  RedisRunResultStore,
  getRunResultStore,
  inMemoryRunResultStore,
  paidRunRecorder,
  setRunResultStore,
} from '../../src/services/runResultStore.js';

const SECRET = 'test-internal-secret';
const DOC = Buffer.from('Invented Holdings (Pty) Ltd\nShare register\nShareholder A 51%\n', 'utf8');

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/parser', parserRouter);
  return a;
}

function freshQuoteStore(): QuoteStore {
  const map = new Map<string, QuoteRecord>();
  return {
    async put(r) { map.set(r.quoteId, structuredClone(r)); },
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

async function quoteFor(name: string, bytes: Buffer, over: Partial<QuoteRecord> = {}): Promise<string> {
  const file = { originalname: name, mimetype: 'text/plain', buffer: bytes, size: bytes.length };
  const quoteId = `quote_resume_${Math.random().toString(36).slice(2)}`;
  await getQuoteStore().put({
    quoteId,
    fingerprint: fingerprintFiles([file]),
    fileDigests: [digestFile(file)],
    currency: 'ZAR',
    totalCents: 300,
    paymentStatus: 'paid',
    createdAt: Date.now(),
    expiresAt: Date.now() + 3_600_000,
    quote: { files: [{ filename: name, pricing: { extractionCents: 300 } }] } as never,
    ...over,
  });
  return quoteId;
}

const env = { secret: process.env.PARSER_INTERNAL_SECRET, payment: process.env.PARSER_REQUIRE_PAYMENT };

beforeEach(() => {
  setQuoteStore(freshQuoteStore());
  setRunResultStore(inMemoryRunResultStore());
  process.env.PARSER_INTERNAL_SECRET = SECRET;
  delete process.env.PARSER_REQUIRE_PAYMENT;
  control.gate = Promise.resolve();
  control.startedSignal = Promise.resolve();
  control.started = () => {};
  control.agentSignal = undefined;
  control.agentOptionSeen = false;
});

afterEach(() => {
  control.release();
  if (env.secret === undefined) delete process.env.PARSER_INTERNAL_SECRET;
  else process.env.PARSER_INTERNAL_SECRET = env.secret;
  if (env.payment === undefined) delete process.env.PARSER_REQUIRE_PAYMENT;
  else process.env.PARSER_REQUIRE_PAYMENT = env.payment;
});

const until = async (check: () => Promise<boolean>, ms = 15_000) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('timed out waiting');
};

describe('paidRunRecorder', () => {
  it('records running, then the exact result it is handed, for 24 hours', async () => {
    const puts: number[] = [];
    const inner = inMemoryRunResultStore();
    setRunResultStore({ put: (r, ttl) => { puts.push(ttl); return inner.put(r, ttl); }, get: (id) => inner.get(id) });
    const recorder = paidRunRecorder('q-1', 'bbbee');
    await recorder.start();
    expect(await getRunResultStore().get('q-1')).toMatchObject({ status: 'running', result: null, finishedAt: null });

    const payload = { case_id: 'c', run_attestations: [{ token: 'signed' }] };
    expect(await recorder.done(payload)).toBe(true);
    const done = await getRunResultStore().get('q-1');
    expect(done).toMatchObject({ status: 'done', result: payload, domain: 'bbbee' });
    expect(typeof done?.finishedAt).toBe('number');
    expect(puts).toEqual([RUN_RESULT_TTL_MS, RUN_RESULT_TTL_MS]);
  });

  it('keeps only the status of a result over the size cap', async () => {
    const recorder = paidRunRecorder('q-big', 'esg', { maxBytes: 64 });
    await recorder.start();
    expect(await recorder.done({ blob: 'x'.repeat(500) })).toBe(false);
    const run = await getRunResultStore().get('q-big');
    expect(run).toMatchObject({ status: 'done', result: null, reason: 'too-large' });
    expect(run?.resultBytes).toBeGreaterThan(64);
  });

  it('records a failure with its reason', async () => {
    const recorder = paidRunRecorder('q-fail', 'bbbee');
    await recorder.failed('the model went away');
    expect(await getRunResultStore().get('q-fail')).toMatchObject({ status: 'failed', reason: 'the model went away', result: null });
  });

  it('never throws when the store is down', async () => {
    setRunResultStore({ put: async () => { throw new Error('redis down'); }, get: async () => null });
    const recorder = paidRunRecorder('q-x', 'bbbee');
    await expect(recorder.start()).resolves.toBeUndefined();
    await expect(recorder.done({})).resolves.toBe(false);
  });

  it('is shared through Redis with a TTL, so any replica can serve it', async () => {
    const values = new Map<string, { value: string; ex?: number }>();
    const client = {
      async set(key: string, value: string, opts?: { EX?: number }) { values.set(key, { value, ex: opts?.EX }); return 'OK'; },
      async get(key: string) { return values.get(key)?.value ?? null; },
    };
    const a = new RedisRunResultStore(client as never);
    const b = new RedisRunResultStore(client as never);
    await a.put({ quoteId: 'q-r', domain: 'esg', status: 'done', startedAt: 1, finishedAt: 2, result: { ok: 1 } }, RUN_RESULT_TTL_MS);
    expect(await b.get('q-r')).toMatchObject({ status: 'done', result: { ok: 1 } });
    expect(values.get('okiru:parser:run:q-r')?.ex).toBe(24 * 60 * 60);
  });
});

describe('GET /api/parser/quotes/:id/result', () => {
  it('does not exist without an internal secret, and refuses a wrong one', async () => {
    await paidRunRecorder('q-guard', 'bbbee').start();
    expect((await request(app()).get('/api/parser/quotes/q-guard/result')).status).toBe(403);
    expect((await request(app()).get('/api/parser/quotes/q-guard/result').set('x-okiru-internal-secret', 'nope')).status).toBe(403);
    delete process.env.PARSER_INTERNAL_SECRET;
    expect((await request(app()).get('/api/parser/quotes/q-guard/result').set('x-okiru-internal-secret', SECRET)).status).toBe(404);
  });

  it('answers 404 for a quote no run was recorded under', async () => {
    const res = await request(app()).get('/api/parser/quotes/nothing-here/result').set('x-okiru-internal-secret', SECRET);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RUN_NOT_FOUND');
  });

  it('reports a running run, then its result once done', async () => {
    const recorder = paidRunRecorder('q-route', 'bbbee');
    await recorder.start();
    const running = await request(app()).get('/api/parser/quotes/q-route/result').set('x-okiru-internal-secret', SECRET);
    expect(running.status).toBe(200);
    expect(running.body.data).toMatchObject({ status: 'running', result: null, finishedAt: null, maxRunMs: 2 * 60 * 60 * 1000 });
    expect(typeof running.body.data.startedAt).toBe('number');
    expect(typeof running.body.data.now).toBe('number');

    await recorder.done({ case_id: 'c', run_attestations: [{ token: 't' }] });
    const done = await request(app()).get('/api/parser/quotes/q-route/result').set('x-okiru-internal-secret', SECRET);
    expect(done.body.data).toMatchObject({ status: 'done', result: { case_id: 'c', run_attestations: [{ token: 't' }] } });
  });

  it('reports a run still "running" past the run max as failed — its pod died', async () => {
    const old = paidRunRecorder('q-stale', 'esg', { now: () => Date.now() - 3 * 60 * 60 * 1000 });
    await old.start();
    const res = await request(app()).get('/api/parser/quotes/q-stale/result').set('x-okiru-internal-secret', SECRET);
    expect(res.body.data).toMatchObject({ status: 'failed', result: null, reason: 'The read stopped without finishing.' });
  });

  it('marks an undelivered, held run delivered once its result is collected', async () => {
    const quoteId = await quoteFor('fuel.txt', DOC, {
      consumedAt: Date.now(),
      recordsOutcome: true,
      outcome: { finishedAt: Date.now(), status: 'resolved', valuesByFile: { 'fuel.txt': 1 }, delivered: false, resultHeldUntil: Date.now() + 1000 },
    });
    const recorder = paidRunRecorder(quoteId, 'esg');
    await recorder.done({ status: 'resolved' });
    await request(app()).get(`/api/parser/quotes/${quoteId}/result`).set('x-okiru-internal-secret', SECRET);
    const record = await getQuoteStore().get(quoteId);
    expect(record?.outcome?.delivered).toBe(true);
    expect(typeof record?.outcome?.collectedAt).toBe('number');
  });
});

describe('a dropped connection does not abandon a paid stream run', () => {
  let server: Server;
  let base: string;
  beforeAll(async () => {
    server = app().listen(0);
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  /** Start a stream, read until the AI pass has begun, then hang up. */
  async function startThenDrop(path: string, quoteId: string | null, name: string) {
    const form = new FormData();
    form.append('files', new Blob([DOC], { type: 'text/plain' }), name);
    form.append('case_id', 'case_resume');
    if (quoteId) form.append('quote_id', quoteId);
    const controller = new AbortController();
    const res = await fetch(`${base}${path}`, { method: 'POST', body: form, signal: controller.signal });
    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    await reader.read();
    await control.startedSignal;
    controller.abort();
    await reader.read().catch(() => undefined);
    // Give the server the moment it takes to see the socket close.
    await new Promise((r) => setTimeout(r, 300));
  }

  it('B-BBEE: finishes the paid run after the client has gone and keeps the signed result', async () => {
    holdTheAiPass();
    const quoteId = await quoteFor('register.txt', DOC);
    await startThenDrop('/api/parser/resolve-case-files-stream', quoteId, 'register.txt');

    expect((await getRunResultStore().get(quoteId))?.status).toBe('running');
    // The paid run's agent pass was given nothing that a disconnect can cancel.
    expect(control.agentOptionSeen).toBe(true);
    expect(control.agentSignal).toBeUndefined();

    control.release();
    await until(async () => (await getRunResultStore().get(quoteId))?.status === 'done');
    const run = await getRunResultStore().get(quoteId);
    const result = run?.result as { case_id?: string; run_attestations?: unknown[]; ai_entities?: unknown };
    expect(result.case_id).toBe('case_resume');
    expect(result).toHaveProperty('ai_entities', null);
    expect(Array.isArray(result.run_attestations)).toBe(true);
    expect(result.run_attestations!.length).toBeGreaterThan(0);

    // The quote stays spent: the result is collected, never re-run.
    const again = await request(app())
      .post('/api/parser/resolve-case-files-stream')
      .attach('files', DOC, { filename: 'register.txt', contentType: 'text/plain' })
      .field('quote_id', quoteId);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('QUOTE_ALREADY_USED');
  });

  it('B-BBEE: an unpaid run still cancels its agent pass when the client goes', async () => {
    process.env.PARSER_REQUIRE_PAYMENT = 'false';
    holdTheAiPass();
    await startThenDrop('/api/parser/resolve-case-files-stream', null, 'register.txt');
    expect(control.agentSignal).toBeInstanceOf(AbortSignal);
    await until(async () => control.agentSignal!.aborted);
  });

  it('free mode: keeps the result under the named quote only when the quote covers these bytes', async () => {
    process.env.PARSER_REQUIRE_PAYMENT = 'false';
    const quoteId = await quoteFor('register.txt', DOC, { paymentStatus: 'not_started' });
    const other = await quoteFor('other.txt', Buffer.from('different bytes'), { paymentStatus: 'not_started' });

    const ok1 = await request(app())
      .post('/api/parser/resolve-case-files-stream')
      .attach('files', DOC, { filename: 'register.txt', contentType: 'text/plain' })
      .field('quote_id', quoteId);
    expect(ok1.status).toBe(200);
    expect((await getRunResultStore().get(quoteId))?.status).toBe('done');

    await request(app())
      .post('/api/parser/resolve-case-files-stream')
      .attach('files', DOC, { filename: 'register.txt', contentType: 'text/plain' })
      .field('quote_id', other);
    expect(await getRunResultStore().get(other)).toBeNull();
  });

  it('ESG: finishes after the client has gone, holds the result, and the wallet sees it held', async () => {
    holdTheAiPass();
    const quoteId = await quoteFor('fuel.txt', DOC);
    await startThenDrop('/api/parser/esg/resolve-case-files-stream', quoteId, 'fuel.txt');
    control.release();

    await until(async () => (await getRunResultStore().get(quoteId))?.status === 'done');
    const result = (await getRunResultStore().get(quoteId))?.result as { domain?: string; run_attestations?: unknown[] };
    expect(result.domain).toBe('esg');
    expect(Array.isArray(result.run_attestations)).toBe(true);

    await until(async () => Boolean((await getQuoteStore().get(quoteId))?.outcome));
    const outcome = (await getQuoteStore().get(quoteId))?.outcome;
    expect(outcome).toMatchObject({ status: 'resolved', delivered: false });
    expect(outcome!.resultHeldUntil).toBeGreaterThan(Date.now() + RUN_RESULT_TTL_MS - 60_000);
  });

  it('ESG: a run that throws is recorded failed', async () => {
    const { extractEsgCaseEntities } = await import('../../src/services/esgCaseExtraction.js');
    vi.mocked(extractEsgCaseEntities).mockRejectedValueOnce(new Error('model unavailable'));
    const quoteId = await quoteFor('fuel.txt', DOC);
    const res = await request(app())
      .post('/api/parser/esg/resolve-case-files-stream')
      .attach('files', DOC, { filename: 'fuel.txt', contentType: 'text/plain' })
      .field('quote_id', quoteId);
    expect(res.text).toContain('event: error');
    expect(await getRunResultStore().get(quoteId)).toMatchObject({ status: 'failed', reason: 'model unavailable' });
  });
});
