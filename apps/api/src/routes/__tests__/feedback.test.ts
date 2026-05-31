/**
 * Integration tests for POST /api/feedback.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import http from 'http';
import type { AddressInfo } from 'net';

const createdDocs: any[] = [];

vi.mock('../../../db.js', () => ({
  isMongoConnected: () => true,
}));

vi.mock('../../logger.js', () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../../../models.js', () => ({
  FeedbackModel: {
    async create(payload: any) {
      if (!payload.feedbackId) {
        const err: any = new Error('feedbackId required');
        err.name = 'ValidationError';
        err.errors = { feedbackId: { message: 'Path `feedbackId` is required.' } };
        throw err;
      }
      if (!payload.id) {
        const err: any = new Error('duplicate key');
        err.name = 'MongoServerError';
        err.code = 11000;
        throw err;
      }
      const doc = { ...payload, toObject: () => ({ ...payload }) };
      createdDocs.push(doc);
      return doc;
    },
  },
}));

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));

let server: http.Server;
let port: number;

async function call(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; body: any }> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: any = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

beforeAll(async () => {
  const router = (await import('../feedback.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/feedback', router);
  server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as AddressInfo).port;
}, 30_000);

afterAll(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
});

beforeEach(() => {
  createdDocs.length = 0;
});

describe('POST /api/feedback', () => {
  it('returns 400 when message is empty', async () => {
    const r = await call('POST', '/api/feedback', { message: '   ' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/required/i);
  });

  it('creates feedback with feedbackId, legacy id, and pillar', async () => {
    const r = await call('POST', '/api/feedback', {
      message: 'Ownership calc looks wrong',
      category: 'compliance',
      pillar: 'ownership',
      pageUrl: '/create-scorecard',
    });
    expect(r.status).toBe(201);
    expect(r.body.feedback.id).toBeTruthy();
    expect(r.body.feedback.pillar).toBe('ownership');
    expect(createdDocs[0].feedbackId).toBe(createdDocs[0].id);
  });

  it('normalizes invalid pillar to null', async () => {
    const r = await call('POST', '/api/feedback', {
      message: 'General note',
      pillar: 'not-a-real-pillar',
    });
    expect(r.status).toBe(201);
    expect(r.body.feedback.pillar).toBeNull();
    expect(createdDocs[0].pillar).toBeNull();
  });
});
