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
