/**
 * Integration tests for the public + admin certificates router.
 *
 * Strategy:
 *   - chdir to a tmp dir BEFORE importing certificateStore + analytics so
 *     they write to test-scoped paths only.
 *   - Mock auth, models, db, certificateExtractor, azureSearch — none of
 *     these are needed for the routes we're testing and they pull in heavy
 *     deps (mongoose, tesseract, azure SDKs) we don't want at test time.
 *   - The certificateStore + analytics + apiResponse + the router itself
 *     run REAL code so we're testing actual behavior, not stubs.
 *
 * Auth model:
 *   - No header → requireAuth returns 401 (matches production).
 *   - x-test-auth: "<userId>|<role>"  → session.userId + userData.role set.
 *   - role of "admin" or "super_admin" passes isAdminSession().
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import express from 'express';
import http from 'http';
import os from 'os';
import path from 'path';
import fs from 'fs';
import type { AddressInfo } from 'net';

// ---- Mocks (hoisted) -------------------------------------------------------

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    const auth = req.headers['x-test-auth'];
    if (!auth) return res.status(401).json({ message: 'Not authenticated' });
    const [userId, role, name] = String(auth).split('|');
    req.session = req.session ?? {};
    req.session.userId = userId;
    req.session.userData = { role: role || 'user', fullName: name || null };
    next();
  },
  verifyClientAccess: async () => true,
  verifyResourceOwnership: async () => true,
}));

vi.mock('../../../db.js', () => ({ isMongoConnected: () => false }));

vi.mock('../../../models.js', () => {
  const noop = {
    create: vi.fn(async (x: any) => x),
    find: () => ({ sort: () => ({ skip: () => ({ limit: () => ({ lean: async () => [] }) }), limit: () => ({ lean: async () => [] }) }) }),
    findOne: vi.fn(async () => null),
    updateOne: vi.fn(async () => ({})),
    countDocuments: vi.fn(async () => 0),
    deleteMany: vi.fn(async () => ({ deletedCount: 0 })),
  };
  return {
    CertificateMetadataModel: noop,
    CertificateReportModel: noop,
    CertificateEventModel: noop,
  };
});

vi.mock('../../services/certificateExtractor.js', () => ({
  processAllCertificates: vi.fn(async () => ({ processed: 0 })),
  processOneCertificate: vi.fn(async () => null),
  getCertificateStats: vi.fn(async () => ({
    total: 0, valid: 0, expiring: 0, expired: 0, unknown: 0,
  })),
  extractDatesFromText: vi.fn(() => ({ issueDate: null, expiryDate: null })),
}));

vi.mock('../../services/azureSearch.js', () => ({
  searchCertificates: vi.fn(async () => []),
  isAzureSearchConfigured: () => false,
  getSearchClient: () => null,
  getSearchIndexClient: () => null,
  ensureIndex: vi.fn(async () => {}),
  uploadDocuments: vi.fn(async () => {}),
}));

// ---- Test harness ----------------------------------------------------------

let server: http.Server;
let port: number;
let tmpDir: string;
let originalCwd: string;
type StoreModule = typeof import('../../services/certificateStore.js');
let storeMod: StoreModule;

async function call(
  method: string,
  path: string,
  opts: { body?: any; auth?: string } = {},
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.auth) headers['x-test-auth'] = opts.auth;
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
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cert-routes-test-'));
  process.chdir(tmpDir);

  storeMod = await import('../../services/certificateStore.js');
  const router = (await import('../certificates.js')).default;

  const app = express();
  app.use(express.json());
  app.use('/api/certificates', router);
  server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  process.chdir(originalCwd);
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

beforeEach(() => {
  // Wipe disk store so each test starts with a deterministic baseline.
  // We then re-seed only what each test needs. Note: the in-memory Map
  // inside certificateStore persists across tests because the module isn't
  // reloaded, so we wipe + zero it via reflection-friendly clear().
  const upload = path.join(tmpDir, 'uploads', 'certificates');
  if (fs.existsSync(upload)) {
    for (const f of fs.readdirSync(upload)) {
      const p = path.join(upload, f);
      try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
  // Clear the singleton's internal Maps so list() starts empty
  const s: any = storeMod.certificateStore;
  if (s.records?.clear) s.records.clear();
  if (s.reports?.clear) s.reports.clear();
});

function seedCert(overrides: Partial<{
  companyName: string;
  vatNumber: string;
  bbbeeLevel: number;
  expiryDate: string;
  blackOwnership: number;
  blackWomenOwnership: number;
  companySize: string;
  verified: boolean;
}> = {}) {
  const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const rec = storeMod.certificateStore.add({
    fileName: `${overrides.companyName || 'co'}.pdf`,
    buffer: Buffer.from('pdf'),
    mimeType: 'application/pdf',
    companyName: overrides.companyName || 'Test Co',
    vatNumber: overrides.vatNumber || null,
    companySize: overrides.companySize || 'QSE',
    blackOwnership: overrides.blackOwnership ?? 51,
    blackWomenOwnership: overrides.blackWomenOwnership ?? 25,
    bbbeeLevel: overrides.bbbeeLevel ?? 4,
    expiryDate: overrides.expiryDate || future,
  });
  if (overrides.verified) {
    storeMod.certificateStore.setVerified(rec.id, true, 'admin-1', 'Admin');
  }
  return rec;
}

// ---- Public registry -------------------------------------------------------

describe('Public certificates registry', () => {
  it('GET /list returns a bare array with no auth (existing MVP shape preserved)', async () => {
    seedCert({ companyName: 'Acme Industries', vatNumber: '4111111111' });
    const r = await call('GET', '/api/certificates/list');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    expect(r.body.length).toBe(1);
    expect(r.body[0].companyName).toBe('Acme Industries');
    expect(r.body[0].vatNumber).toBe('4111111111');
    expect(r.body[0].slug).toBeTruthy();
    expect(r.body[0].id).toBeTruthy();
  });

  it('GET /list?limit=N returns the paginated envelope { items, total, limit, offset }', async () => {
    seedCert({ companyName: 'A Co', vatNumber: '1' });
    seedCert({ companyName: 'B Co', vatNumber: '2' });
    seedCert({ companyName: 'C Co', vatNumber: '3' });

    const r = await call('GET', '/api/certificates/list?limit=2&offset=0');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      success: true,
      error: null,
    });
    expect(r.body.data).toMatchObject({ total: 3, limit: 2, offset: 0 });
    expect(r.body.data.items).toHaveLength(2);
  });

  it('GET /list?sort=verified surfaces verified certificates first', async () => {
    seedCert({ companyName: 'Unverified Co', vatNumber: '111' });
    seedCert({ companyName: 'Verified Co', vatNumber: '222', verified: true });
    seedCert({ companyName: 'Another Unverified', vatNumber: '333' });

    const r = await call('GET', '/api/certificates/list?limit=10&offset=0&sort=verified');
    expect(r.status).toBe(200);
    expect(r.body.data.items[0].companyName).toBe('Verified Co');
    expect(r.body.data.items[0].verified).toBe(true);
  });

  it('GET /by-slug/:slug surfaces id + verified + vatNumber for the detail page', async () => {
    const rec = seedCert({ companyName: 'Slug Co', vatNumber: '99988877' });
    // Use a unique search param to bypass the module-scoped /list cache.
    const r = await call('GET', `/api/certificates/list?search=${encodeURIComponent('Slug Co')}`);
    const item = r.body.find((x: any) => x.companyName === 'Slug Co');
    expect(item, `expected to find "Slug Co" in /list response: ${JSON.stringify(r.body)}`).toBeTruthy();
    expect(item.slug).toBeTruthy();

    const detail = await call('GET', `/api/certificates/by-slug/${item.slug}`);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      id: rec.id,
      companyName: 'Slug Co',
      vatNumber: '99988877',
      verified: false,
    });
  });

  it('GET /:id/history returns a success envelope with versions: []', async () => {
    const rec = seedCert({ companyName: 'History Co' });
    const r = await call('GET', `/api/certificates/${rec.id}/history`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      success: true,
      error: null,
    });
    expect(r.body.data).toMatchObject({
      certificateId: rec.id,
      versions: [],
    });
  });

  it('GET /:id/history returns 404 envelope for unknown id', async () => {
    const r = await call('GET', '/api/certificates/does-not-exist/history');
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({
      success: false,
      data: null,
      error: { message: expect.any(String), code: 'NOT_FOUND' },
    });
  });
});

// ---- Reports (public submit) -----------------------------------------------

describe('POST /:id/reports — public report-incorrect-data', () => {
  it('rejects invalid reasons with envelope error', async () => {
    const rec = seedCert();
    const r = await call('POST', `/api/certificates/${rec.id}/reports`, {
      body: { reason: 'something-bogus', message: 'long enough message here' },
    });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      success: false,
      data: null,
      error: { code: 'INVALID_REASON' },
    });
  });

  it('rejects messages shorter than 10 chars', async () => {
    const rec = seedCert();
    const r = await call('POST', `/api/certificates/${rec.id}/reports`, {
      body: { reason: 'incorrect-data', message: 'short' },
    });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('INVALID_MESSAGE');
  });

  it('accepts a valid report and returns 201 with envelope + bumps reportCount', async () => {
    const rec = seedCert();
    const r = await call('POST', `/api/certificates/${rec.id}/reports`, {
      body: {
        reason: 'incorrect-data',
        message: 'BBBEE level appears to be wrong, please review.',
        email: 'reporter@example.com',
      },
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      success: true,
      error: null,
      data: { certificateId: rec.id, reason: 'incorrect-data', status: 'open' },
    });
    const fetched = storeMod.certificateStore.getById(rec.id);
    expect(fetched?.reportCount).toBe(1);
  });
});

// ---- Admin endpoints -------------------------------------------------------

describe('Admin endpoints — auth + role gating', () => {
  it.each([
    ['GET', '/api/certificates/admin/reports'],
    ['GET', '/api/certificates/admin/analytics'],
    ['GET', '/api/certificates/admin/duplicates'],
  ])('%s %s returns 401 when unauthenticated', async (method, route) => {
    const r = await call(method, route);
    expect(r.status).toBe(401);
  });

  it.each([
    ['GET', '/api/certificates/admin/reports'],
    ['GET', '/api/certificates/admin/analytics'],
    ['GET', '/api/certificates/admin/duplicates'],
  ])('%s %s returns 403 envelope for a non-admin user', async (method, route) => {
    const r = await call(method, route, { auth: 'user-1|user' });
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({
      success: false,
      data: null,
      error: { code: 'FORBIDDEN' },
    });
  });

  it('GET /admin/analytics returns the summary envelope for an admin', async () => {
    const r = await call('GET', '/api/certificates/admin/analytics', { auth: 'admin-1|admin|Alice' });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data).toHaveProperty('totals');
    expect(r.body.data).toHaveProperty('byType');
    expect(r.body.data).toHaveProperty('topCertificates');
    expect(r.body.data).toHaveProperty('topQueries');
    expect(r.body.data).toHaveProperty('recent');
  });

  it('GET /admin/duplicates groups certificates by VAT and surfaces clusters > 1', async () => {
    seedCert({ companyName: 'Acme A', vatNumber: '4123456789' });
    seedCert({ companyName: 'Acme B', vatNumber: '4123456789' });
    seedCert({ companyName: 'Different Co', vatNumber: '9999999999' });

    const r = await call('GET', '/api/certificates/admin/duplicates', { auth: 'admin-1|admin' });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.totalClusters).toBe(1);
    expect(r.body.data.clusters[0]).toMatchObject({
      vatNumber: '4123456789',
      count: 2,
    });
    expect(r.body.data.clusters[0].certificates).toHaveLength(2);
  });

  it('GET /admin/reports returns a paginated envelope for an admin', async () => {
    const rec = seedCert();
    storeMod.certificateStore.addReport({
      certificateId: rec.id,
      certificateSlug: 'x',
      reason: 'incorrect-data',
      message: 'long enough message here',
      email: null,
      ipAddress: null,
      userAgent: null,
    });
    const r = await call('GET', '/api/certificates/admin/reports', { auth: 'admin-1|admin' });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ total: 1, limit: 50, offset: 0 });
    expect(r.body.data.items).toHaveLength(1);
  });
});

// ---- Verify / Unverify -----------------------------------------------------

describe('Verify / unverify roundtrip', () => {
  it('POST /:id/verify requires admin and toggles the verified flag', async () => {
    const rec = seedCert();

    // Unauthenticated → 401
    const unauth = await call('POST', `/api/certificates/${rec.id}/verify`);
    expect(unauth.status).toBe(401);

    // Regular user → 403 envelope
    const user = await call('POST', `/api/certificates/${rec.id}/verify`, { auth: 'u|user' });
    expect(user.status).toBe(403);
    expect(user.body.error.code).toBe('FORBIDDEN');

    // Admin → success envelope, flag is set in store
    const admin = await call('POST', `/api/certificates/${rec.id}/verify`, { auth: 'admin-1|admin|Alice' });
    expect(admin.status).toBe(200);
    expect(admin.body).toMatchObject({
      success: true,
      data: { id: rec.id, verified: true, verifiedBy: 'admin-1', verifiedByName: 'Alice' },
    });
    expect(storeMod.certificateStore.getById(rec.id)?.verified).toBe(true);

    // Unverify clears the flag
    const unverify = await call('POST', `/api/certificates/${rec.id}/unverify`, { auth: 'admin-1|admin' });
    expect(unverify.status).toBe(200);
    expect(unverify.body.data).toMatchObject({ id: rec.id, verified: false });
    expect(storeMod.certificateStore.getById(rec.id)?.verified).toBe(false);
  });

  it('POST /:id/verify returns 404 envelope for unknown id', async () => {
    const r = await call('POST', '/api/certificates/no-such-id/verify', { auth: 'admin-1|admin' });
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('NOT_FOUND');
  });
});
