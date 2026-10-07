import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import crypto from 'crypto';
import http from 'http';
import type { AddressInfo } from 'net';
import { signRunPayload } from '../../security/parserRunAttestation.js';

const documents: any[] = [];
const runs: any[] = [];
let nextDocumentId = 1;
let nextRunId = 1;

class Query<T> implements PromiseLike<T> {
  constructor(private value: T) {}
  select() { return this; }
  sort() { return this; }
  skip() { return this; }
  limit() { return this; }
  lean() { return Promise.resolve(this.value); }
  then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null) {
    return Promise.resolve(this.value).then(onfulfilled, onrejected);
  }
}

function matches(record: any, filter: Record<string, any>): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$or') return (expected as any[]).some((part) => matches(record, part));
    const actual = key.split('.').reduce((value, part) => value?.[part], record);
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('$ne' in expected) return actual !== expected.$ne;
      return true;
    }
    return String(actual ?? '') === String(expected ?? '');
  });
}

vi.mock('../../../models.js', () => ({
  Document: {
    findOne(filter: Record<string, any>) {
      return new Query(documents.find((document) => matches(document, filter)) ?? null);
    },
    async create(payload: any) {
      // Mongo's unique fileHash index, as the real collection has it.
      if (payload.fileHash && documents.some((document) => document.fileHash === payload.fileHash)) {
        throw Object.assign(new Error('E11000 duplicate key error collection: okiru.documents index: fileHash_1'), { code: 11000 });
      }
      const record = { ...payload, _id: `doc-${nextDocumentId++}` };
      record.toObject = () => ({ ...record, toObject: undefined });
      documents.push(record);
      return record;
    },
    async updateOne(filter: Record<string, any>, update: any) {
      const record = documents.find((document) => matches(document, filter));
      if (record) Object.assign(record, update.$set ?? {});
      return { modifiedCount: record ? 1 : 0 };
    },
    find(filter: Record<string, any>) {
      return new Query(documents.filter((document) => matches(document, filter)));
    },
    async countDocuments(filter: Record<string, any>) {
      return documents.filter((document) => matches(document, filter)).length;
    },
    async distinct(key: string, filter: Record<string, any>) {
      return [...new Set(documents.filter((document) => matches(document, filter)).map((document) => document[key]).filter(Boolean))];
    },
  },
  ParserRunModel: {
    async create(payload: any) {
      const record = { ...payload, runId: `run-${nextRunId++}`, createdAt: new Date('2026-08-07T12:00:00Z') };
      record.toObject = () => ({ ...record, toObject: undefined });
      runs.push(record);
      return record;
    },
    find(filter: Record<string, any>) {
      return new Query(runs.filter((run) => matches(run, filter)));
    },
    findOne(filter: Record<string, any>) {
      return new Query(runs.find((run) => matches(run, filter)) ?? null);
    },
    async updateOne(filter: Record<string, any>, update: any) {
      const run = runs.find((r) => matches(r, filter));
      for (const [key, value] of Object.entries(update.$push ?? {})) {
        const each = value && typeof value === 'object' && '$each' in (value as object) ? (value as { $each: unknown[] }).$each : [value];
        if (run) (run[key] ??= []).push(...each);
      }
      return { modifiedCount: run ? 1 : 0 };
    },
  },
}));

vi.mock('../../middleware/requireAuth.js', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    const userId = req.headers['x-test-user'];
    if (!userId) return res.status(401).json({ message: 'Authentication required' });
    req.session = { userId, organizationId: req.headers['x-test-org'] || null };
    next();
  },
}));

vi.mock('../../logger.js', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const parserCalls = vi.fn();
const quoteCalls = vi.fn();
let paidReply: Record<string, unknown> = { ok: true, result: { status: 'passed', document_type: 'AFS', overall_confidence: 0.9, extracted_fields: {}, validation: { passed: true, warnings: [], errors: [], missing_fields: [] }, audit_trail: {} } };
vi.mock('../../services/parserClient.js', () => ({
  isParserConfigured: () => true,
  quoteFileWithParser: async (file: { buffer: Buffer }) => {
    quoteCalls(file);
    return { ok: true, quoteId: 'quote_reread_1' };
  },
  resolvePaidFileWithParser: async (...args: unknown[]) => {
    parserCalls(...args);
    return paidReply;
  },
}));

let viewOnly = false;
vi.mock('../../services/clientScopes.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/clientScopes.js')>();
  return { ...actual, isViewOnlyMember: async () => viewOnly };
});

let server: http.Server;
let port: number;

async function request(path: string, options: RequestInit = {}, user = 'user-a', org = 'org-a') {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    ...options,
    headers: { 'x-test-user': user, 'x-test-org': org, ...(options.headers ?? {}) },
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

function parserOutput(status: 'passed' | 'review_required' | 'failed' = 'passed') {
  return {
    file_id: 'file-1', filename: 'certificate.pdf', document_type: 'B-BBEE Certificate', pillar: 'General',
    overall_confidence: status === 'failed' ? 0.4 : 0.94, status,
    extracted_fields: {
      supplier_name: { raw_value: 'Acme', normalized_value: 'Acme', data_type: 'string', confidence: 0.95, source: { page: 1, table: null, text_snippet: 'Supplier: Acme' } },
      expiry_date: { raw_value: null, normalized_value: null, data_type: 'date', confidence: 0, source: { page: null, table: null, text_snippet: null } },
      bee_level: { raw_value: 'Level 2', normalized_value: 2, data_type: 'integer', confidence: 0.7, source: { page: 1, table: null, text_snippet: 'Level 2' } },
    },
    calculator_payload: status === 'passed' ? { supplier_name: 'Acme' } : {},
    validation: { passed: status === 'passed', warnings: status === 'review_required' ? ['Level needs review'] : [], errors: status === 'failed' ? ['Document confidence is too low'] : [], missing_fields: ['expiry_date'] },
    audit_trail: { graph_version: 'test-v1', requires_human_review: status !== 'passed', classification_candidates: [], classification_reason: 'Matched certificate', matched_patterns: [], rules_applied: [], rejected_calculator_keys: [], source_file: 'certificate.pdf' },
  };
}

const SECRET = 'test-parser-internal-secret';
const CERTIFICATE_BYTES = 'certificate bytes';
const sha256 = (content: string | Buffer) => crypto.createHash('sha256').update(content).digest('hex');

/** A parser document whose stored bytes are `content`. */
function parserDocument(id: string, content = CERTIFICATE_BYTES, owner = { userId: 'user-a', organizationId: 'org-a' }) {
  return { _id: id, filename: 'certificate.pdf', fileType: 'application/pdf', source: 'parser', contentHash: sha256(content), ...owner };
}

/** A value the model or the agent read, as the parser's record carries it. */
function aiValue(over: Record<string, unknown> = {}) {
  return {
    key: 'ai.bbbee_certificate.bee_level', field: 'bee_level', value: 3, layer: 'ai', confidence: null,
    documentId: 'bbbee_certificate', documentName: 'B-BBEE Certificate', element: 'GENERAL', sourceFile: 'certificate.pdf',
    page: null, cell: null, quote: null, grounded: true,
    ...over,
  };
}

interface RecordOptions {
  content?: string | Buffer;
  reviewReasons?: string[];
  caseId?: string;
  iat?: number;
  secret?: string;
  aiValues?: unknown[];
  domain?: string;
}

/** The parser's signed record, as the parser makes it. */
function signedRecord(output: Record<string, unknown>, options: RecordOptions = {}) {
  const iat = options.iat ?? Date.now();
  const payload = JSON.stringify({
    typ: 'okiru.parser-run',
    v: 1,
    iat,
    exp: iat + 24 * 60 * 60 * 1000,
    domain: options.domain ?? 'bbbee',
    caseId: options.caseId ?? 'case-1',
    quoteId: 'q-1',
    filename: 'certificate.pdf',
    contentSha256: sha256(options.content ?? CERTIFICATE_BYTES),
    reviewReasons: options.reviewReasons ?? [],
    parserOutput: output,
    ...(options.aiValues ? { aiValues: options.aiValues } : {}),
  });
  return { filename: 'certificate.pdf', payload, signature: signRunPayload(payload, options.secret ?? SECRET) };
}

/** The run body the browser files: the parser's signed record. */
function signedRun(output: Record<string, unknown>, options: RecordOptions = {}) {
  const { payload, signature } = signedRecord(output, options);
  return { attestation: { payload, signature } };
}

function postRun(documentId: string, body: unknown, user = 'user-a', org = 'org-a') {
  return request(`/api/parser-documents/${documentId}/runs`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }, user, org);
}

beforeAll(async () => {
  process.env.PARSER_INTERNAL_SECRET = SECRET;
  const router = (await import('../parserDocuments.js')).default;
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/api/parser-documents', router);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  documents.length = 0;
  runs.length = 0;
  nextDocumentId = 1;
  nextRunId = 1;
  viewOnly = false;
  parserCalls.mockClear();
  quoteCalls.mockClear();
  paidReply = { ok: true, result: { status: 'passed', document_type: 'AFS', overall_confidence: 0.9, extracted_fields: { revenue: { normalized_value: 274953097, confidence: 0.95 } }, validation: { passed: true, warnings: [], errors: [], missing_fields: [] }, audit_trail: {} } };
});

describe('paid fresh reads', () => {
  function seed(extra: Record<string, unknown> = {}) {
    documents.push({
      _id: 'doc-1', filename: 'afs.pdf', fileType: 'application/pdf', rawContent: Buffer.from('%PDF afs'),
      source: 'parser', userId: 'user-a', organizationId: 'org-a', latestParserRunId: 'run-9', ...extra,
    });
    runs.push({ runId: 'run-9', documentId: 'doc-1', organizationId: 'org-a', status: 'review_required', parserOutput: { domain: 'bbbee' } });
  }

  it('prices the stored bytes and pins the quote to this document', async () => {
    seed();
    const res = await request('/api/parser-documents/doc-1/reread/quote', { method: 'POST' });
    expect(res.status).toBe(201);
    expect(res.body.quoteId).toBe('quote_reread_1');
    expect(documents[0].pendingRereadQuoteId).toBe('quote_reread_1');
    expect(documents[0].pendingRereadSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(quoteCalls.mock.calls[0][0].buffer.toString()).toBe('%PDF afs');
    expect(parserCalls).not.toHaveBeenCalled();
  });

  it('reads with the paid quote, appends a run, and clears the pending price', async () => {
    seed();
    await request('/api/parser-documents/doc-1/reread/quote', { method: 'POST' });
    const res = await request('/api/parser-documents/doc-1/reread', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quoteId: 'quote_reread_1' }),
    });
    expect(res.status).toBe(201);
    expect(parserCalls).toHaveBeenCalledTimes(1);
    expect(parserCalls.mock.calls[0][1]).toBe('quote_reread_1');
    expect(runs).toHaveLength(2);
    expect(documents[0].pendingRereadQuoteId).toBeNull();
  });

  it('will not spend a quote priced for something else', async () => {
    seed({ pendingRereadQuoteId: 'quote_other', pendingRereadSha256: 'x' });
    const res = await request('/api/parser-documents/doc-1/reread', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quoteId: 'quote_reread_1' }),
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('QUOTE_NOT_FOR_THIS_DOCUMENT');
    expect(parserCalls).not.toHaveBeenCalled();
  });

  it('passes the parser’s refusal through — a voided quote is not read', async () => {
    seed();
    await request('/api/parser-documents/doc-1/reread/quote', { method: 'POST' });
    paidReply = { ok: false, status: 409, code: 'QUOTE_VOIDED', error: 'This batch never ran, so its tokens were refunded.' };
    const res = await request('/api/parser-documents/doc-1/reread', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quoteId: 'quote_reread_1' }),
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('QUOTE_VOIDED');
    expect(runs).toHaveLength(1);
  });

  it('says plainly when the paid reader is not deployed yet', async () => {
    seed();
    await request('/api/parser-documents/doc-1/reread/quote', { method: 'POST' });
    paidReply = { ok: false, status: 404, error: 'Not found' };
    const res = await request('/api/parser-documents/doc-1/reread', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quoteId: 'quote_reread_1' }),
    });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('PAID_READ_UNAVAILABLE');
  });

  const reread = () => request('/api/parser-documents/doc-1/reread', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quoteId: 'quote_reread_1' }),
  });

  it('asks the parser for the whole read — rules, model, agent — through the B-BBEE reader', async () => {
    seed();
    await request('/api/parser-documents/doc-1/reread/quote', { method: 'POST' });
    await reread();
    expect(parserCalls.mock.calls[0][2]).toEqual({ domain: 'bbbee', full: true });
  });

  it('reads ESG evidence again with the ESG reader — it used to be refused', async () => {
    seed();
    runs[0].parserOutput = { domain: 'esg' };
    const quoted = await request('/api/parser-documents/doc-1/reread/quote', { method: 'POST' });
    expect(quoted.status).toBe(201);
    // Priced exactly as before: the same quote route, the same bytes.
    expect(quoteCalls).toHaveBeenCalledTimes(1);
    const res = await reread();
    expect(res.status).toBe(201);
    expect(parserCalls.mock.calls[0][2]).toEqual({ domain: 'esg', full: true });
  });

  it('stores the signed AI and agent values of a fresh read as the new run', async () => {
    seed();
    await request('/api/parser-documents/doc-1/reread/quote', { method: 'POST' });
    const output = parserOutput('review_required');
    const values = [aiValue(), aiValue({ key: 'ai.afs.npat', field: 'npat', value: 1200, layer: 'agent', page: 3, quote: 'Net profit 1 200' })];
    const signed = signedRecord(output, { content: Buffer.from('%PDF afs'), aiValues: values });
    paidReply = { ok: true, result: { ...output, run_attestation: signed, ai_value_count: 2 } };

    const res = await reread();
    expect(res.status).toBe(201);
    const run = runs[1];
    expect(run.aiValues).toEqual(values);
    expect(run.aiValueCount).toBe(2);
    expect(run.attestation).toMatchObject({ contentSha256: sha256(Buffer.from('%PDF afs')), id: signed.signature });
    // The rule layer is the run's parser output, without the transport fields.
    expect(run.parserOutput).not.toHaveProperty('run_attestation');
    expect(run.parserOutput.extracted_fields.bee_level.normalized_value).toBe(2);
    // Two rule fields read + two model/agent values.
    expect(run.extractedFieldCount).toBe(4);
    expect(res.body.run.aiValueCount).toBe(2);

    const detail = await request('/api/parser-documents/doc-1');
    expect(detail.body.latestRun.aiValues).toEqual(values);
  });

  it('keeps only the rule layer of a fresh read whose record does not verify', async () => {
    seed();
    await request('/api/parser-documents/doc-1/reread/quote', { method: 'POST' });
    const output = parserOutput('passed');
    // Signed for other bytes than the ones this document holds.
    const signed = signedRecord(output, { content: 'some other file', aiValues: [aiValue()] });
    paidReply = { ok: true, result: { ...output, run_attestation: signed } };
    const res = await reread();
    expect(res.status).toBe(201);
    expect(runs[1].aiValues).toBeNull();
    expect(runs[1].attestation).toBeNull();
    expect(runs[1].parserOutput).not.toHaveProperty('run_attestation');
    expect(runs[1].reviewReasons).toContain('The AI values from this read could not be verified, so only the rule-based fields were kept.');
  });

  it('is not available to a view-only member', async () => {
    seed();
    viewOnly = true;
    expect((await request('/api/parser-documents/doc-1/reread/quote', { method: 'POST' })).status).toBe(403);
    expect(quoteCalls).not.toHaveBeenCalled();
  });
});

describe('re-reading, reviewing, and who may do either', () => {
  function seedReadDocument() {
    documents.push({
      _id: 'doc-1', filename: 'afs.pdf', fileType: 'application/pdf', rawContent: Buffer.from('%PDF'),
      source: 'parser', userId: 'user-a', organizationId: 'org-a', latestParserRunId: 'run-9', parserStatus: 'review_required',
    });
    runs.push({ runId: 'run-9', documentId: 'doc-1', organizationId: 'org-a', status: 'review_required', documentType: 'AFS' });
  }

  it('returns the stored read for an unchanged file — the parser is never called', async () => {
    seedReadDocument();
    const res = await request('/api/parser-documents/doc-1/reparse', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(res.body.reused).toBe(true);
    expect(res.body.run.runId).toBe('run-9');
    expect(parserCalls).not.toHaveBeenCalled();
    expect(runs).toHaveLength(1);
  });

  it('never reads afresh for free — a fresh read is priced first', async () => {
    seedReadDocument();
    const res = await request('/api/parser-documents/doc-1/reparse?fresh=1', { method: 'POST' });
    expect(res.status).toBe(402);
    expect(res.body.code).toBe('PRICE_FIRST');
    expect(parserCalls).not.toHaveBeenCalled();
  });

  it('takes a reviewed document out of the "Needs review" queue', async () => {
    seedReadDocument();
    expect((await request('/api/parser-documents?status=review_required')).body.documents).toHaveLength(1);

    const res = await request('/api/parser-documents/doc-1', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reviewed: true }),
    });
    expect(res.status).toBe(200);
    expect(res.body.document.reviewedByUserId).toBe('user-a');
    expect(res.body.document.reviewedAt).toBeTruthy();
    expect((await request('/api/parser-documents?status=review_required')).body.documents).toHaveLength(0);

    // Reopened, it is back in the queue.
    await request('/api/parser-documents/doc-1', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reviewed: false }),
    });
    expect((await request('/api/parser-documents?status=review_required')).body.documents).toHaveLength(1);
  });

  it('records a corrected value and an added field beside the reading, never over it', async () => {
    seedReadDocument();
    runs[0].parserOutput = { extracted_fields: { bee_level: { normalized_value: 4, raw_value: 'Level 4' } } };

    const res = await request('/api/parser-documents/doc-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { bee_level: 2, registration_number: ' 2010/123456/07 ' } }),
    });
    expect(res.status).toBe(200);
    expect(res.body.reviewHistory).toEqual([
      expect.objectContaining({ fieldKey: 'bee_level', originalValue: 4, correctedValue: 2, approvalState: 'corrected', reviewerUserId: 'user-a' }),
      expect.objectContaining({ fieldKey: 'registration_number', originalValue: null, correctedValue: '2010/123456/07' }),
    ]);
    // The parser's own reading is untouched.
    expect(runs[0].parserOutput.extracted_fields.bee_level.normalized_value).toBe(4);
  });

  it('refuses a correction to a document that was never read', async () => {
    documents.push({ _id: 'doc-2', filename: 'x.pdf', source: 'parser', userId: 'user-a', organizationId: 'org-a' });
    const res = await request('/api/parser-documents/doc-2', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { bee_level: 2 } }),
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NOT_READ');
  });

  it('lets a view-only member look, but not change, review or re-read', async () => {
    seedReadDocument();
    viewOnly = true;
    expect((await request('/api/parser-documents/doc-1')).status).toBe(200);
    const patch = await request('/api/parser-documents/doc-1', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reviewed: true }),
    });
    expect(patch.status).toBe(403);
    expect((await request('/api/parser-documents/doc-1/reparse', { method: 'POST' })).status).toBe(403);
    expect(documents[0].reviewedAt).toBeUndefined();
  });
});

describe('parser document persistence', () => {
  it('persists an uploaded original and exposes it in the tenant library', async () => {
    const form = new FormData();
    form.append('file', new Blob(['certificate evidence'], { type: 'text/plain' }), 'certificate.txt');
    const uploaded = await request('/api/parser-documents/upload', { method: 'POST', body: form });
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.document.filename).toBe('certificate.txt');
    expect(documents[0].rawContent).toBeTruthy();

    const listed = await request('/api/parser-documents');
    expect(listed.status).toBe(200);
    expect(listed.body.documents).toHaveLength(1);
    expect(listed.body.documents[0]).not.toHaveProperty('rawContent');
  });

  it('preserves missing, low-confidence, warning, and review-required data', async () => {
    documents.push(parserDocument('doc-1'));
    const response = await postRun('doc-1', signedRun(parserOutput('review_required'), { reviewReasons: ['Confirm level'] }));
    expect(response.status).toBe(201);
    expect(runs[0].caseId).toBe('case-1');
    expect(runs[0].attestation).toMatchObject({ quoteId: 'q-1', contentSha256: sha256(CERTIFICATE_BYTES) });
    expect(runs[0].status).toBe('review_required');
    expect(runs[0].missingFields).toContain('expiry_date');
    expect(runs[0].lowConfidenceFields).toContain('bee_level');
    expect(runs[0].parserOutput.extracted_fields.expiry_date.confidence).toBe(0);
    expect(runs[0].reviewReasons).toEqual(expect.arrayContaining(['Confirm level', 'Level needs review']));
  });

  it('keeps failed attempts visible and preserves earlier runs on rerun', async () => {
    documents.push(parserDocument('doc-1'));
    for (const status of ['failed', 'passed'] as const) {
      const response = await postRun('doc-1', signedRun(parserOutput(status), { caseId: `case-${status}` }));
      expect(response.status).toBe(201);
    }
    expect(runs).toHaveLength(2);
    expect(runs.map((run) => run.status)).toEqual(['failed', 'passed']);
    expect(documents[0].latestParserRunId).toBe('run-2');
  });

  it('returns the existing record when the same bytes lose an upload race, instead of a 500', async () => {
    // Two copies of one ledger under different names, uploaded at once: the
    // first insert lands between the second's lookup and its insert. Replayed
    // deterministically by planting the winner where only the unique index sees it.
    const crypto = await import('crypto');
    const bytes = 'ledger summary';
    const contentHash = crypto.createHash('sha256').update(bytes).digest('hex');
    const fileHash = crypto.createHash('sha256').update(`org-a:${contentHash}`).digest('hex');
    documents.push({ _id: 'doc-winner', filename: '1 Ledger SUPPLIERS ESD.xlsx', fileHash, source: 'parser', userId: 'user-a', organizationId: 'org-a' });

    const form = new FormData();
    form.append('file', new Blob([bytes], { type: 'text/plain' }), '1 Ledger 4 SUPPLIERS ESF.xlsx');
    const uploaded = await request('/api/parser-documents/upload', { method: 'POST', body: form });

    expect(uploaded.status).toBe(201);
    expect(uploaded.body.document.id).toBe('doc-winner');
    expect(documents).toHaveLength(1);
  });

  it('does not expose another organisation document or parser result', async () => {
    documents.push({ _id: 'doc-secret', filename: 'private.pdf', source: 'parser', userId: 'user-b', organizationId: 'org-b' });
    const detail = await request('/api/parser-documents/doc-secret', {}, 'user-a', 'org-a');
    expect(detail.status).toBe(404);
    const createRun = await postRun('doc-secret', signedRun(parserOutput()), 'user-a', 'org-a');
    expect(createRun.status).toBe(404);
  });

  it('counts an ESG value as read, not as low confidence, when the reader scores no confidence', async () => {
    documents.push(parserDocument('doc-1'));
    const esgOutput = {
      filename: 'certificate.pdf', domain: 'esg', document_type: 'Electricity bill', pillar: 'ENVIRONMENTAL', status: 'passed',
      extracted_fields: {
        electricity_kwh: { raw_value: 18250, normalized_value: 18250, data_type: 'number', confidence: null, source: { page: null, table: null, text_snippet: null } },
      },
      validation: { passed: true, warnings: [], errors: [], missing_fields: [] },
      audit_trail: { source_file: 'certificate.pdf', requires_human_review: false },
    };
    expect((await postRun('doc-1', signedRun(esgOutput, { domain: 'esg' }))).status).toBe(201);
    expect(runs[0].extractedFieldCount).toBe(1);
    expect(runs[0].lowConfidenceFields).toEqual([]);
    expect(runs[0].missingFields).toEqual([]);
  });
});

describe('a parser run is only what the parser signed', () => {
  /** Nothing was stored, and the document still points at nothing. */
  function expectNothingFiled() {
    expect(runs).toHaveLength(0);
    expect(documents[0].latestParserRunId).toBeUndefined();
    expect(documents[0].parserStatus).toBeUndefined();
  }

  it('refuses a result the browser wrote itself', async () => {
    documents.push(parserDocument('doc-1'));
    const response = await postRun('doc-1', { parserOutput: parserOutput('passed'), reviewReasons: [] });
    expect(response.status).toBe(400);
    expectNothingFiled();
  });

  it('ignores the old fields a browser sends beside the signed record — only the signed text is stored', async () => {
    documents.push(parserDocument('doc-1'));
    const madeUp = { ...parserOutput('passed'), document_type: 'Something the browser made up' };
    const response = await postRun('doc-1', { ...signedRun(parserOutput('review_required')), parserOutput: madeUp, caseId: 'browser-case' });
    expect(response.status).toBe(201);
    expect(runs[0].status).toBe('review_required');
    expect(runs[0].documentType).toBe('B-BBEE Certificate');
    expect(runs[0].caseId).toBe('case-1');
  });

  it('refuses a forged record carrying a made-up signature', async () => {
    documents.push(parserDocument('doc-1'));
    const forged = signedRun(parserOutput('passed'));
    forged.attestation.signature = crypto.randomBytes(32).toString('base64url');
    const response = await postRun('doc-1', forged);
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('RUN_SIGNATURE_INVALID');
    expectNothingFiled();
  });

  it('refuses a genuine record edited after signing — a review turned into a pass, a level raised', async () => {
    documents.push(parserDocument('doc-1'));
    const genuine = signedRun(parserOutput('review_required'));
    const claims = JSON.parse(genuine.attestation.payload);
    claims.parserOutput.status = 'passed';
    claims.parserOutput.extracted_fields.bee_level.normalized_value = 1;
    const response = await postRun('doc-1', { attestation: { payload: JSON.stringify(claims), signature: genuine.attestation.signature } });
    expect(response.status).toBe(403);
    expectNothingFiled();
  });

  it('refuses a record signed under any other secret', async () => {
    documents.push(parserDocument('doc-1'));
    const response = await postRun('doc-1', signedRun(parserOutput('passed'), { secret: 'not-the-parser' }));
    expect(response.status).toBe(403);
    expectNothingFiled();
  });

  it('refuses a genuine reading of a different file', async () => {
    documents.push(parserDocument('doc-1', 'the certificate this document holds'));
    const response = await postRun('doc-1', signedRun(parserOutput('passed'), { content: 'some other, better certificate' }));
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('RUN_FILE_MISMATCH');
    expectNothingFiled();
  });

  it('refuses a record past its lifetime', async () => {
    documents.push(parserDocument('doc-1'));
    const response = await postRun('doc-1', signedRun(parserOutput('passed'), { iat: Date.now() - 2 * 24 * 60 * 60 * 1000 }));
    expect(response.status).toBe(422);
    expectNothingFiled();
  });

  it('files each signed record once, so a replay cannot roll the document back to an older reading', async () => {
    documents.push(parserDocument('doc-1'));
    const older = signedRun(parserOutput('passed'), { caseId: 'case-old' });
    const newer = signedRun(parserOutput('review_required'), { caseId: 'case-new' });
    expect((await postRun('doc-1', older)).status).toBe(201);
    expect((await postRun('doc-1', newer)).status).toBe(201);

    const replay = await postRun('doc-1', older);
    expect(replay.status).toBe(200);
    expect(replay.body.duplicate).toBe(true);
    expect(runs).toHaveLength(2);
    expect(documents[0].latestParserRunId).toBe('run-2');
    expect(documents[0].parserStatus).toBe('review_required');
  });

  it('refuses every run when this server cannot check signatures', async () => {
    documents.push(parserDocument('doc-1'));
    delete process.env.PARSER_INTERNAL_SECRET;
    try {
      const response = await postRun('doc-1', signedRun(parserOutput('passed')));
      expect(response.status).toBe(503);
      expectNothingFiled();
    } finally {
      process.env.PARSER_INTERNAL_SECRET = SECRET;
    }
  });
});

describe('the AI block of a run: what the model and the agent read', () => {
  const values = () => [
    aiValue(),
    aiValue({ key: 'ai.afs.npat', field: 'npat', value: 1200, layer: 'agent', documentId: 'afs', documentName: 'AFS', page: 3, quote: 'Net profit after tax 1 200' }),
    aiValue({ key: 'ai.sheet_table__skills.learners', field: 'learners', value: [{ name: 'A' }], layer: 'ai', cell: 'Skills!B4', rowCount: 340 }),
  ];

  it('stores the signed AI values with the run and returns them with their source layer and citation', async () => {
    documents.push(parserDocument('doc-1'));
    const response = await postRun('doc-1', signedRun(parserOutput('passed'), { aiValues: values() }));
    expect(response.status).toBe(201);
    expect(response.body.run.aiValueCount).toBe(3);
    expect(runs[0].aiValues).toEqual(values());
    // The library counts both layers: 2 rule fields read + 3 model/agent values.
    expect(runs[0].extractedFieldCount).toBe(5);
    expect(documents[0].parserExtractedFieldCount).toBe(5);

    const detail = await request('/api/parser-documents/doc-1');
    expect(detail.body.latestRun.aiValues).toEqual(values());
    expect(detail.body.latestRun.aiValues[1]).toMatchObject({ layer: 'agent', page: 3, quote: 'Net profit after tax 1 200' });
    const history = await request(`/api/parser-documents/doc-1/runs/${runs[0].runId}`);
    expect(history.body.run.aiValues).toHaveLength(3);
  });

  it('refuses an AI block sent outside the signature, even beside a genuine record', async () => {
    documents.push(parserDocument('doc-1'));
    const response = await postRun('doc-1', { ...signedRun(parserOutput('passed')), aiValues: values() });
    expect(response.status).toBe(400);
    expect(runs).toHaveLength(0);
  });

  it('refuses a genuine record whose AI values were edited after signing', async () => {
    documents.push(parserDocument('doc-1'));
    const genuine = signedRun(parserOutput('passed'), { aiValues: values() });
    const claims = JSON.parse(genuine.attestation.payload);
    claims.aiValues[0].value = 1;
    claims.aiValues.push(aiValue({ key: 'ai.extra.injected', field: 'injected', value: 'made up' }));
    const response = await postRun('doc-1', { attestation: { payload: JSON.stringify(claims), signature: genuine.attestation.signature } });
    expect(response.status).toBe(403);
    expect(runs).toHaveLength(0);
  });

  it('refuses a signed AI block that is not in the shape the library shows', async () => {
    documents.push(parserDocument('doc-1'));
    const response = await postRun('doc-1', signedRun(parserOutput('passed'), { aiValues: [aiValue({ layer: 'oracle' })] }));
    expect(response.status).toBe(422);
    expect(runs).toHaveLength(0);
  });

  it('still returns an old run with no AI block, as an empty one', async () => {
    documents.push({ ...parserDocument('doc-1'), latestParserRunId: 'run-old' });
    runs.push({ runId: 'run-old', documentId: 'doc-1', organizationId: 'org-a', status: 'passed', parserOutput: parserOutput('passed') });
    const detail = await request('/api/parser-documents/doc-1');
    expect(detail.status).toBe(200);
    expect(detail.body.latestRun.aiValues).toEqual([]);
    expect(detail.body.latestRun.aiValueCount).toBe(0);
    expect(detail.body.latestRun.signed).toBe(false);
  });

  it('records a correction to an AI value against what THAT reader said, beside the reading', async () => {
    documents.push(parserDocument('doc-1'));
    await postRun('doc-1', signedRun(parserOutput('passed'), { aiValues: values() }));
    const res = await request('/api/parser-documents/doc-1', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { 'ai.afs.npat': 1250 } }),
    });
    expect(res.status).toBe(200);
    expect(res.body.reviewHistory).toEqual([
      expect.objectContaining({ fieldKey: 'ai.afs.npat', originalValue: 1200, correctedValue: 1250, approvalState: 'corrected' }),
    ]);
    // The reader's own value is untouched.
    expect(runs[0].aiValues[1].value).toBe(1200);
  });
});

describe('serving the original file', () => {
  async function download(fileType: string, filename: string) {
    documents.push({ _id: 'doc-1', filename, fileType, rawContent: Buffer.from('<script>alert(document.cookie)</script>'), source: 'parser', userId: 'user-a', organizationId: 'org-a' });
    const response = await fetch(`http://127.0.0.1:${port}/api/parser-documents/doc-1/download`, {
      headers: { 'x-test-user': 'user-a', 'x-test-org': 'org-a' },
    });
    return response.headers;
  }

  it('never renders uploaded HTML or SVG from our own origin', async () => {
    for (const [type, name] of [['text/html', 'invoice.html'], ['image/svg+xml', 'logo.svg'], ['application/xhtml+xml', 'x.xhtml'], ['', 'unknown']]) {
      documents.length = 0;
      const headers = await download(type, name);
      expect(headers.get('content-type')).toBe('application/octet-stream');
      expect(headers.get('content-disposition')).toMatch(/^attachment;/);
      expect(headers.get('x-content-type-options')).toBe('nosniff');
    }
  });

  it('still shows PDFs and images inline, for the side-by-side preview', async () => {
    for (const [type, name] of [['application/pdf', 'afs.pdf'], ['image/jpeg', 'id.jpg'], ['IMAGE/PNG', 'scan.png']]) {
      documents.length = 0;
      const headers = await download(type, name);
      expect(headers.get('content-type')).toBe(type.toLowerCase());
      expect(headers.get('content-disposition')).toMatch(/^inline;/);
      expect(headers.get('x-content-type-options')).toBe('nosniff');
    }
  });
});
