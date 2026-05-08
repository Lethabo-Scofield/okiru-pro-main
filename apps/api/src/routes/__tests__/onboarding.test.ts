/**
 * Integration tests for the company onboarding endpoints.
 *
 * These mount the real router but stub:
 *   - storage.js (in-memory Map of user → profile)
 *   - middleware/auth.js (header-driven session for clean per-request control)
 *
 * Coverage:
 *   - GET /me + POST /  require authentication (401 without session).
 *   - POST / rejects empty companyName (400).
 *   - POST / persists fields including the toolsUsed array.
 *   - GET /me returns the persisted profile (idempotency: a second login
 *     reads the same row, so onboarding only runs once).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'http';
import type { AddressInfo } from 'net';

vi.mock('../../../db.js', () => ({
  mongoose: {
    connection: {
      readyState: 1,
    },
  },
}));

// In-memory storage stub — exposed so tests can reset state.
const profiles = new Map<string, any>();

vi.mock('../../../storage.js', () => ({
  storage: {
    async getCompanyProfileByUserId(userId: string) {
      return profiles.get(userId);
    },
    async upsertCompanyProfile(userId: string, data: any) {
      const profile = { id: `prof-${userId}`, userId, ...data, createdAt: new Date().toISOString() };
      profiles.set(userId, profile);
      return profile;
    },
  },
}));

// Auth: x-test-user header drives the session userId. Missing → 401.
vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    const userId = req.headers['x-test-user'];
    if (!userId) return res.status(401).json({ message: 'Not authenticated' });
    req.session = req.session ?? {};
    req.session.userId = userId;
    next();
  },
  verifyClientAccess: async () => true,
  verifyResourceOwnership: async () => true,
}));

let server: http.Server;
let port: number;

async function call(
  method: string,
  path: string,
  opts: { body?: any; userId?: string } = {},
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.userId) headers['x-test-user'] = opts.userId;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body };
}

beforeAll(async () => {
  const router = (await import('../onboarding.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/onboarding', router);
  server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

describe('Onboarding API — auth gating', () => {
  it('GET /me returns 401 when unauthenticated', async () => {
    const r = await call('GET', '/api/onboarding/me');
    expect(r.status).toBe(401);
  });

  it('POST / returns 401 when unauthenticated', async () => {
    const r = await call('POST', '/api/onboarding', { body: { companyName: 'Acme' } });
    expect(r.status).toBe(401);
  });
});

describe('Onboarding API — validation', () => {
  it('rejects POST with empty companyName', async () => {
    const r = await call('POST', '/api/onboarding', {
      userId: 'user-validation-1',
      body: { companyName: '' },
    });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/company name/i);
  });

  it('rejects POST with whitespace-only companyName', async () => {
    const r = await call('POST', '/api/onboarding', {
      userId: 'user-validation-2',
      body: { companyName: '   ' },
    });
    expect(r.status).toBe(400);
  });
});

describe('Onboarding API — happy path + idempotency', () => {
  it('POST persists every supported field including toolsUsed array', async () => {
    const userId = 'user-happy-1';
    const payload = {
      companyName: 'Acme Manufacturing (Pty) Ltd',
      role: 'Compliance Officer',
      beeLevel: 'Level 2',
      employeeRange: '50-249',
      industry: 'Manufacturing',
      annualRevenue: 'R10m - R50m',
      acquisitionSource: 'Google',
      toolsUsed: ['BE123', 'Excel', 'Custom Internal System'],
      biggestChallenge: 'Tracking supplier compliance manually',
    };
    const r = await call('POST', '/api/onboarding', { userId, body: payload });
    expect(r.status).toBe(200);
    expect(r.body.profile).toMatchObject({
      userId,
      companyName: payload.companyName,
      role: payload.role,
      beeLevel: payload.beeLevel,
      employeeRange: payload.employeeRange,
      industry: payload.industry,
      annualRevenue: payload.annualRevenue,
      acquisitionSource: payload.acquisitionSource,
      biggestChallenge: payload.biggestChallenge,
    });
    expect(r.body.profile.toolsUsed).toEqual(payload.toolsUsed);
  });

  it('GET /me returns the saved profile after onboarding (runs once per user)', async () => {
    const userId = 'user-idempotent-1';
    await call('POST', '/api/onboarding', {
      userId,
      body: { companyName: 'Once-and-Done Co', role: 'CEO' },
    });
    // Simulate "log out, log back in": fresh request, same userId
    const r = await call('GET', '/api/onboarding/me', { userId });
    expect(r.status).toBe(200);
    expect(r.body.profile).toMatchObject({
      userId,
      companyName: 'Once-and-Done Co',
      role: 'CEO',
    });
  });

  it('GET /me returns 200 with null profile when no profile exists yet', async () => {
    const r = await call('GET', '/api/onboarding/me', { userId: 'user-no-profile' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ profile: null });
  });

  it('persists Other-style custom values for industry / role / tools', async () => {
    const r = await call('POST', '/api/onboarding', {
      userId: 'user-other-1',
      body: {
        companyName: 'Niche Co',
        role: 'Other',
        industryOther: 'Boutique Coffee Roasting',
        acquisitionSource: 'Other',
        acquisitionSourceOther: 'A friend at SARS',
        toolsUsed: ['Custom Internal System'],
        toolsUsedOther: 'Bespoke compliance tracker',
      },
    });
    expect(r.status).toBe(200);
    expect(r.body.profile.industryOther).toBe('Boutique Coffee Roasting');
    expect(r.body.profile.acquisitionSourceOther).toBe('A friend at SARS');
    expect(r.body.profile.toolsUsedOther).toBe('Bespoke compliance tracker');
  });

  it('sanitises input: trims whitespace, drops non-strings from toolsUsed, and truncates overly long fields', async () => {
    const long = 'x'.repeat(10_000); // way beyond MAX_LEN (500) and biggestChallenge cap (2000)
    const r = await call('POST', '/api/onboarding', {
      userId: 'user-sanitize-1',
      body: {
        companyName: '  Trim Me  ',
        role: long,
        biggestChallenge: long,
        toolsUsed: ['Excel', '', '   ', 42, null, 'BE123'],
      },
    });
    expect(r.status).toBe(200);
    expect(r.body.profile.companyName).toBe('Trim Me');
    expect(r.body.profile.role).toHaveLength(500);
    expect(r.body.profile.biggestChallenge).toHaveLength(2000);
    expect(r.body.profile.toolsUsed).toEqual(['Excel', 'BE123']);
  });
});
