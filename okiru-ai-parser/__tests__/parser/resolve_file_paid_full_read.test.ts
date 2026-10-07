/**
 * POST /api/parser/resolve-file-paid with `read=full` — the library's re-read
 * runs the whole per-document read (rule layer + model + agent gate) and hands
 * back the signed run record the api stores. The model is a stub: offline, no
 * paid call, and it asserts the plumbing rather than the model's judgement.
 *
 * The payment gate and outcome accounting are the same as the rule-only read
 * (resolve_file_paid_route.test.ts); what this pins is what changed:
 *   - read=full returns a signed record carrying the model's values, with their
 *     source layer, bound to the bytes that were read;
 *   - ESG documents go through the ESG reader, not the B-BBEE one;
 *   - the outcome counts both layers, so a read that only the model could do is
 *     not refunded as "delivered nothing";
 *   - without read=full the response is the rule-only result, exactly as before.
 */
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import parserRouter from '../../src/routes/parser.js';
import { setExtractionModel } from '../../src/services/caseExtraction.js';
import { resetExtractionCache } from '../../src/services/extractionCache.js';
import type { ExtractionModel } from '../../src/services/aiExtraction.js';
import { signRunPayload, type ParserRunClaims } from '../../src/services/runAttestation.js';
import {
  digestFile,
  fingerprintFiles,
  getQuoteStore,
  setQuoteStore,
  type QuoteRecord,
  type QuoteStore,
} from '../../src/services/quoteStore.js';

const SECRET = 'test-full-read-secret';
const NAME = 'Kestrel Quarry Supplies (Pty) Ltd';

const AFS = Buffer.from(
  `Annual Financial Statements\nRegistered name: ${NAME}\nRevenue: R 4 200 000\nNet profit after tax: R 310 000\n`,
  'utf8',
);
const BILL = Buffer.from(
  'Municipal electricity account\nAccount holder: Kestrel Quarry Supplies\nBilling period: March 2026\nConsumption: 18 250 kWh\nAmount due: R 41 300\n',
  'utf8',
);
/** What the stub model reads off the statements when it is asked. */
const AFS_ANSWERS = { current_year_npat: 310000, current_year_revenue: 4200000 };
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

/** Answers every spec it is asked about with the values it knows, and nothing else. */
function stubModel(known: Record<string, unknown>, asked: string[] = []): ExtractionModel {
  return {
    name: `stub-${Math.random().toString(36).slice(2)}`,
    async complete(_system, user) {
      const line = user.split('\n').find((l) => l.startsWith('EXPECTED JSON KEYS: '));
      if (!line) return '{}';
      const keys = line.slice('EXPECTED JSON KEYS: '.length).split(',').map((k) => k.trim());
      asked.push(...keys);
      const reply = Object.fromEntries(keys.filter((k) => k in known).map((k) => [k, known[k]]));
      return JSON.stringify(Object.keys(reply).length > 0 ? reply : { not_this_document: true });
    },
  };
}

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

async function quoteFor(bytes: Buffer, name: string): Promise<string> {
  const file = { originalname: name, mimetype: 'text/plain', buffer: bytes, size: bytes.length };
  const quoteId = `quote_full_${Math.random().toString(36).slice(2)}`;
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
  });
  return quoteId;
}

function read(quoteId: string, bytes: Buffer, name: string, fields: Record<string, string> = {}) {
  let r = request(app()).post('/api/parser/resolve-file-paid')
    .attach('file', bytes, { filename: name, contentType: 'text/plain' })
    .field('quote_id', quoteId);
  for (const [key, value] of Object.entries(fields)) r = r.field(key, value);
  return r;
}

/** The record, checked the way the api checks it. */
function verified(body: { run_attestation?: { payload: string; signature: string } | null }): ParserRunClaims {
  const signed = body.run_attestation;
  expect(signed).toBeTruthy();
  expect(signed!.signature).toBe(signRunPayload(signed!.payload, SECRET));
  return JSON.parse(signed!.payload) as ParserRunClaims;
}

beforeEach(() => {
  setQuoteStore(freshStore());
  resetExtractionCache();
  delete process.env.PARSER_REQUIRE_PAYMENT;
  delete process.env.PARSER_AGENT_EXTRACTION;
  process.env.PARSER_INTERNAL_SECRET = SECRET;
});

afterEach(() => {
  setExtractionModel(undefined as unknown as null);
  delete process.env.PARSER_INTERNAL_SECRET;
});

describe('POST /api/parser/resolve-file-paid — read=full', () => {
  it('returns a signed record with the rule layer AND the model values, bound to the bytes read', async () => {
    setExtractionModel(stubModel(AFS_ANSWERS));
    const quoteId = await quoteFor(AFS, 'afs.txt');
    const res = await read(quoteId, AFS, 'afs.txt', { read: 'full', domain: 'bbbee' });

    expect([200, 422]).toContain(res.status);
    // Still the rule-layer result at the top, so an api that only knows that shape keeps working.
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('extracted_fields');

    const claims = verified(res.body);
    expect(claims.domain).toBe('bbbee');
    expect(claims.filename).toBe('afs.txt');
    expect(claims.contentSha256).toBe(sha256(AFS));
    expect(claims.quoteId).toBe(quoteId);
    expect(claims.parserOutput.filename).toBe('afs.txt');

    const npat = claims.aiValues?.find((value) => value.field === 'current_year_npat');
    expect(npat).toMatchObject({ value: 310000, layer: 'ai', sourceFile: 'afs.txt', confidence: null });
    expect(npat?.key).toMatch(/^ai\.[A-Za-z0-9_.-]+\.current_year_npat$/);
    expect(res.body.ai_value_count).toBe(claims.aiValues?.length);
  });

  it('counts the model values in the outcome, so a read only the model could do is not refunded', async () => {
    setExtractionModel(stubModel(AFS_ANSWERS));
    const quoteId = await quoteFor(AFS, 'afs.txt');
    const res = await read(quoteId, AFS, 'afs.txt', { read: 'full' });
    const claims = verified(res.body);

    const outcome = (await getQuoteStore().get(quoteId))?.outcome;
    const rule = Object.values(claims.parserOutput.extracted_fields as Record<string, { normalized_value?: unknown; raw_value?: unknown }>)
      .filter((field) => (field?.normalized_value ?? field?.raw_value) != null).length;
    expect(outcome?.totalValues).toBe(rule + (claims.aiValues?.length ?? 0));
    expect(outcome?.totalValues).toBeGreaterThan(rule);
    expect(outcome?.valuesByFile['afs.txt']).toBe(outcome?.totalValues);
    expect(outcome?.delivered).toBe(true);
  });

  it('runs the agent pass on a re-read when PARSER_AGENT_EXTRACTION allows it, and not otherwise', async () => {
    const submitNothing = {
      message: {
        role: 'assistant' as const,
        content: null,
        tool_calls: [{ id: 'c1', type: 'function' as const, function: { name: 'submit_values', arguments: '{"values":[]}' } }],
      },
    };
    const withTools = (): ExtractionModel & { completeWithTools: ReturnType<typeof vi.fn> } => ({
      ...stubModel(AFS_ANSWERS),
      completeWithTools: vi.fn(async () => submitNothing),
    });

    const off = withTools();
    setExtractionModel(off);
    await read(await quoteFor(AFS, 'afs.txt'), AFS, 'afs.txt', { read: 'full' });
    expect(off.completeWithTools).not.toHaveBeenCalled();

    process.env.PARSER_AGENT_EXTRACTION = 'all';
    resetExtractionCache();
    const on = withTools();
    setExtractionModel(on);
    const res = await read(await quoteFor(AFS, 'afs.txt'), AFS, 'afs.txt', { read: 'full' });
    expect(on.completeWithTools).toHaveBeenCalled();
    // The agent found nothing new; the first pass's values are still all there.
    expect(verified(res.body).aiValues?.some((value) => value.field === 'current_year_npat')).toBe(true);
  });

  it('reads an ESG document with the ESG reader, not the B-BBEE one', async () => {
    const asked: string[] = [];
    setExtractionModel(stubModel({ electricity_kwh: 18250 }, asked));
    const quoteId = await quoteFor(BILL, 'power-march.txt');
    const res = await read(quoteId, BILL, 'power-march.txt', { read: 'full', domain: 'esg' });

    const claims = verified(res.body);
    expect(claims.domain).toBe('esg');
    expect(claims.parserOutput.domain).toBe('esg');
    // ESG has no rule layer: everything it read is in the AI block.
    expect(claims.parserOutput.extracted_fields).toEqual({});
    expect(claims.aiValues?.some((value) => value.field === 'electricity_kwh' && value.value === 18250)).toBe(true);
    // The questions asked were ESG questions.
    expect(asked).toContain('electricity_kwh');
    expect(asked).not.toContain('total_shares_in_issue');
  });

  it('says it cannot sign rather than returning an unsigned record as if it were one', async () => {
    delete process.env.PARSER_INTERNAL_SECRET;
    setExtractionModel(stubModel(AFS_ANSWERS));
    const quoteId = await quoteFor(AFS, 'afs.txt');
    const res = await read(quoteId, AFS, 'afs.txt', { read: 'full' });
    expect([200, 422]).toContain(res.status);
    expect(res.body.run_attestation).toBeNull();
  });

  it('without read=full is the rule-only read it always was — no model call, no record', async () => {
    const asked: string[] = [];
    setExtractionModel(stubModel(AFS_ANSWERS, asked));
    const quoteId = await quoteFor(AFS, 'afs.txt');
    const res = await read(quoteId, AFS, 'afs.txt');
    expect([200, 422]).toContain(res.status);
    expect(res.body).toHaveProperty('extracted_fields');
    expect(res.body).not.toHaveProperty('run_attestation');
    expect(asked).toEqual([]);
  });
});
