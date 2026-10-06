import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import http from 'http';
import type { AddressInfo } from 'net';

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
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('$ne' in expected) return record[key] !== expected.$ne;
      return true;
    }
    return String(record[key] ?? '') === String(expected ?? '');
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

beforeAll(async () => {
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

  it('sends ESG evidence back to the ESG workbook instead of reading it as B-BBEE', async () => {
    seed();
    runs[0].parserOutput = { domain: 'esg' };
    const res = await request('/api/parser-documents/doc-1/reread/quote', { method: 'POST' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ESG_REREAD_FROM_WORKBOOK');
    expect(quoteCalls).not.toHaveBeenCalled();
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
    documents.push({ _id: 'doc-1', filename: 'certificate.pdf', fileType: 'application/pdf', source: 'parser', userId: 'user-a', organizationId: 'org-a' });
    const response = await request('/api/parser-documents/doc-1/runs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parserOutput: parserOutput('review_required'), reviewReasons: ['Confirm level'] }),
    });
    expect(response.status).toBe(201);
    expect(runs[0].status).toBe('review_required');
    expect(runs[0].missingFields).toContain('expiry_date');
    expect(runs[0].lowConfidenceFields).toContain('bee_level');
    expect(runs[0].parserOutput.extracted_fields.expiry_date.confidence).toBe(0);
    expect(runs[0].reviewReasons).toEqual(expect.arrayContaining(['Confirm level', 'Level needs review']));
  });

  it('keeps failed attempts visible and preserves earlier runs on rerun', async () => {
    documents.push({ _id: 'doc-1', filename: 'certificate.pdf', fileType: 'application/pdf', source: 'parser', userId: 'user-a', organizationId: 'org-a' });
    for (const status of ['failed', 'passed'] as const) {
      const response = await request('/api/parser-documents/doc-1/runs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parserOutput: parserOutput(status) }),
      });
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
    documents.push({ _id: 'doc-winner', filename: 'supplier-ledger-a.xlsx', fileHash, source: 'parser', userId: 'user-a', organizationId: 'org-a' });

    const form = new FormData();
    form.append('file', new Blob([bytes], { type: 'text/plain' }), 'supplier-ledger-b.xlsx');
    const uploaded = await request('/api/parser-documents/upload', { method: 'POST', body: form });

    expect(uploaded.status).toBe(201);
    expect(uploaded.body.document.id).toBe('doc-winner');
    expect(documents).toHaveLength(1);
  });

  it('does not expose another organisation document or parser result', async () => {
    documents.push({ _id: 'doc-secret', filename: 'private.pdf', source: 'parser', userId: 'user-b', organizationId: 'org-b' });
    const detail = await request('/api/parser-documents/doc-secret', {}, 'user-a', 'org-a');
    expect(detail.status).toBe(404);
    const createRun = await request('/api/parser-documents/doc-secret/runs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parserOutput: parserOutput() }),
    }, 'user-a', 'org-a');
    expect(createRun.status).toBe(404);
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
