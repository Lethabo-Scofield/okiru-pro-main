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
const mongoConnectedMock = vi.hoisted(() => vi.fn(() => false));
const certificateFindMock = vi.hoisted(() => vi.fn());
const certificateFindOneMock = vi.hoisted(() => vi.fn(() => ({ lean: vi.fn(async () => null) })));
const certificateUpdateOneMock = vi.hoisted(() => vi.fn(async () => ({})));
const certificateCountDocumentsMock = vi.hoisted(() => vi.fn(async () => 0));

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

vi.mock('../../../db.js', () => ({ isMongoConnected: mongoConnectedMock }));

vi.mock('../../../models.js', () => {
  const noop = {
    create: vi.fn(async (x: any) => x),
    find: certificateFindMock,
    findOne: certificateFindOneMock,
    updateOne: certificateUpdateOneMock,
    countDocuments: certificateCountDocumentsMock,
    deleteMany: vi.fn(async () => ({ deletedCount: 0 })),
  };
  return {
    CertificateMetadataModel: noop,
    CertificateReportModel: noop,
    CertificateEventModel: noop,
  };
});

vi.mock('../../services/mongoSearch.js', () => ({
  searchCertificatesMongo: vi.fn(async () => ({ results: [], total: 0 })),
  hybridSearchCertificates: vi.fn(async (q: string) => ({
    results: q.toLowerCase().includes('acme')
      ? [{
          id: 'search-hit-1',
          fileName: 'acme.pdf',
          blobName: 'public/acme.pdf',
          companyName: 'Acme Search Hit',
          vatNumber: '4111111111',
          companySize: 'QSE',
          blackOwnership: 51,
          blackWomenOwnership: 25,
          bbbeeLevel: 2,
          expiryDate: '2030-01-01',
          status: 'valid',
          verified: false,
          score: 1,
          snippet: 'Acme',
        }]
      : [],
    total: q.toLowerCase().includes('acme') ? 1 : 0,
  })),
  ensureSearchIndex: vi.fn(async () => undefined),
}));

vi.mock('../../services/azureCertStorage.js', () => ({
  getCertAccountName: vi.fn(() => 'testaccount'),
  getCertBlobContainerName: vi.fn(() => 'clients-certs'),
  getCertBlobServiceClient: vi.fn(() => ({ mocked: true })),
  getCertConnectionString: vi.fn(() => 'UseDevelopmentStorage=true'),
  getCertContainerClient: vi.fn(() => ({
    getBlobClient: vi.fn(() => ({
      url: 'https://example.test/cert.pdf',
      downloadToBuffer: vi.fn(),
    })),
    // The upload paths use getBlockBlobClient(...).uploadData(...). Without it
    // every upload threw "getBlockBlobClient is not a function", which the route
    // swallowed into a generic 500 — so these tests were failing on a missing
    // mock, not on production behaviour.
    getBlockBlobClient: vi.fn(() => ({
      url: 'https://example.test/cert.pdf',
      uploadData: vi.fn(async () => ({ requestId: 'test-request' })),
      setMetadata: vi.fn(async () => ({})),
      delete: vi.fn(async () => ({})),
      deleteIfExists: vi.fn(async () => ({ succeeded: true })),
      downloadToBuffer: vi.fn(async () => Buffer.from('')),
    })),
    listBlobsFlat: vi.fn(async function* () {}),
  })),
}));

vi.mock('../../services/certificateExtractor.js', () => ({
  processAllCertificates: vi.fn(async () => ({ processed: 0 })),
  processOneCertificate: vi.fn(async () => null),
  getCertificateStats: vi.fn(async () => ({
    total: 0, valid: 0, expiring: 0, expired: 0, unknown: 0,
  })),
  extractCertificateData: vi.fn(() => ({
    issueDate: null,
    expiryDate: null,
    bbbeeLevel: null,
    supplierName: null,
    vatNumber: null,
    companySize: null,
    blackOwnership: null,
    blackWomenOwnership: null,
    verificationAgency: null,
    certificateNumber: null,
    bbbeeScore: null,
  })),
}));

const runCertificateTextExtractionRetryJob = vi.fn(async (_client: any, options: any) => ({
  dryRun: options?.dryRun !== false,
  limit: Math.min(Math.max(Number(options?.limit) || (options?.dryRun === false ? 5 : 20), 1), 25),
  requestedLimit: options?.limit ?? null,
  maxLimit: 25,
  concurrency: Math.min(Math.max(Number(options?.concurrency) || 1, 1), 3),
  fileTimeoutMs: Number(options?.fileTimeoutMs) || 120000,
  matched: 0,
  retried: 0,
  wouldRetry: options?.dryRun === false ? 0 : 0,
  updated: 0,
  skipped: 0,
  completed: 0,
  textTooShort: 0,
  failed: 0,
  timedOut: 0,
  durationMs: 0,
  averageMsPerFile: 0,
  results: [],
  summary: {},
  coverage: { totalCertificates: 0 },
}));

const runCertificateEnrichmentJob = vi.fn(async (_client: any, options: any) => ({
  totalCertificates: 2758,
  usableTextCount: 2040,
  skippedMissingText: 718,
  processed: 0,
  updated: 0,
  reviewRequired: 0,
  failed: 0,
  dryRun: options?.dryRun === true,
  coverage: {},
  reviewSamples: [],
  details: [],
}));

const runCertificateVatRecoveryJob = vi.fn(async (options: any) => ({
  dryRun: options?.dryRun !== false,
  limit: Math.min(Math.max(Number(options?.limit) || 100, 1), 1000),
  totalCertificates: 2758,
  vatCoverageBefore: 1318,
  vatCoverageAfter: options?.dryRun === false ? 1328 : 1318,
  processed: 10,
  wouldUpdate: options?.dryRun === false ? 0 : 10,
  updated: options?.dryRun === false ? 10 : 0,
  reviewRequired: 0,
  noCandidateFound: 0,
  multipleCandidates: 0,
  rejectedByNegativeContext: 0,
  alreadyHadTrustedVat: 0,
  failed: 0,
  beforeCoverage: '1318/2758',
  afterCoverage: options?.dryRun === false ? '1328/2758' : '1318/2758',
  details: [],
}));

vi.mock('../../services/certificateEnrichmentJob.js', () => ({
  CERTIFICATE_ENRICHMENT_VERSION: 'cert-enrichment-test',
  ENRICHMENT_FIELDS: [
    'companyName',
    'sectorCode',
    'sectorName',
    'vatNumber',
    'bbbeeLevel',
    'bbbeeLevelStatus',
    'companySize',
    'blackOwnership',
    'blackWomenOwnership',
    'expiryDate',
    'certificateNumber',
    'verificationAgency',
  ],
  PRODUCTION_CERTIFICATE_FIELDS: [
    'companyName',
    'sectorCode',
    'sectorName',
    'vatNumber',
    'bbbeeLevel',
    'bbbeeLevelStatus',
    'companySize',
    'blackOwnership',
    'blackWomenOwnership',
    'expiryDate',
  ],
  getProductionCertificateCoverage: vi.fn(async () => ({
    totalCertificates: 2758,
    usableTextCount: 2040,
    skippedMissingText: 718,
    productionFields: ['company', 'sector', 'vatNumber', 'bbbeeLevel', 'companySize', 'ownership', 'expiryDate'],
    fieldCoverage: {
      companyCount: 2757,
      sectorCount: 2300,
      vatNumberCount: 3,
      bbbeeLevelCount: 308,
      companySizeCount: 2735,
      ownershipCount: 1129,
      expiryDateCount: 941,
    },
  })),
  runCertificateEnrichmentJob,
  runCertificateVatRecoveryJob,
}));

vi.mock('../../services/certificateTextExtractionJob.js', () => ({
  getCertificateTextExtractionCoverage: vi.fn(async () => ({
    totalCertificates: 0,
    usableExtractedText: 0,
    missingExtractedText: 0,
    textTooShort: 0,
    failed: 0,
    missingBlob: 0,
    unsupported: 0,
    pendingOrNotAttempted: 0,
    byExtractionStatus: {},
    byExtractionMode: {},
    averageExtractedTextLength: 0,
    topFailureReasons: [],
    dependencies: {
      azureDocumentIntelligenceConfigured: false,
      tesseractJsAvailable: true,
      pdftoppmAvailable: false,
    },
  })),
  runCertificateTextExtractionRetryJob,
}));

let server: http.Server;
let port: number;
let tmpDir: string;
let originalCwd: string;
type StoreModule = typeof import('../../services/certificateStore.js');
let storeMod: StoreModule;

async function call(
  method: string,
  path: string,
  opts: { body?: any; auth?: string; apiKey?: string } = {},
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.auth) headers['x-test-auth'] = opts.auth;
  if (opts.apiKey) headers['x-api-key'] = opts.apiKey;
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

function buildMultipart(
  fields: Record<string, string>,
  files: Array<{ field?: string; filename: string; content: Buffer; mimeType?: string }> = [],
): { body: Buffer; contentType: string } {
  const boundary = `----VitestCert${Date.now()}`;
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    ));
  }
  for (const file of files) {
    const field = file.field ?? 'files';
    const mime = file.mimeType ?? 'application/pdf';
    chunks.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${file.filename}"\r\nContent-Type: ${mime}\r\n\r\n`,
    ));
    chunks.push(file.content);
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

async function upload(
  query = '',
  fields: Record<string, string> = {},
  opts: { auth?: string; fileName?: string } = {},
): Promise<{ status: number; body: any }> {
  const { body, contentType } = buildMultipart(
    { companyName: 'Upload Co', sectorCode: 'ICT', ...fields },
    [{ filename: opts.fileName ?? 'cert.pdf', content: Buffer.from('%PDF-1.4 test') }],
  );
  const headers: Record<string, string> = { 'Content-Type': contentType };
  if (opts.auth) headers['x-test-auth'] = opts.auth;
  const res = await fetch(`http://127.0.0.1:${port}/api/certificates/upload${query}`, {
    method: 'POST',
    headers,
    body,
  });
  const text = await res.text();
  let parsed: any = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

beforeAll(async () => {
  originalCwd = process.cwd();
  process.env.API_INTERNAL_KEY = 'test-internal-key';
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
}, 60_000);

afterAll(async () => {
  if (server) {
    await new Promise<void>((r) => server.close(() => r()));
  }
  process.chdir(originalCwd);
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

beforeEach(() => {
  runCertificateTextExtractionRetryJob.mockClear();
  runCertificateEnrichmentJob.mockClear();
  runCertificateVatRecoveryJob.mockClear();
  certificateFindOneMock.mockReset();
  certificateFindOneMock.mockReturnValue({ lean: vi.fn(async () => null) });
  certificateUpdateOneMock.mockReset();
  certificateUpdateOneMock.mockResolvedValue({});
  delete process.env.DISABLE_CERTIFICATE_STARTUP_EXTRACTION;
  mongoConnectedMock.mockReturnValue(false);
  certificateCountDocumentsMock.mockResolvedValue(0);
  certificateFindMock.mockReturnValue({
    sort: vi.fn(() => ({
      skip: vi.fn(() => ({
        limit: vi.fn(() => ({
          lean: vi.fn(async () => []),
        })),
      })),
      limit: vi.fn(() => ({
        lean: vi.fn(async () => []),
      })),
    })),
  });

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

  it('GET /list?limit=5 uses Mongo pagination without loading the full collection', async () => {
    mongoConnectedMock.mockReturnValue(true);
    const sort = vi.fn(() => chain);
    const skip = vi.fn(() => chain);
    const limit = vi.fn(() => chain);
    const lean = vi.fn(async () => [
      {
        id: 'mongo-1',
        blobName: 'certs/acme.pdf',
        fileName: 'acme.pdf',
        supplierName: 'Acme Fast Co',
        vatNumber: '4123456789',
        companySize: 'QSE',
        sectorCode: 'ICT',
        sectorName: 'Information & Communications Technology',
        bbbeeLevel: 2,
        blackOwnership: 51,
        blackWomenOwnership: 26,
        expiryDate: new Date('2030-01-01T00:00:00Z'),
        extractionStatus: 'completed',
        enrichmentStatus: 'completed',
        reviewFields: [],
        verified: true,
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    const chain = { sort, skip, limit, lean };
    certificateFindMock.mockReturnValue(chain);
    certificateCountDocumentsMock.mockResolvedValue(2759);

    const r = await call('GET', '/api/certificates/list?limit=5&offset=10');

    expect(r.status).toBe(200);
    expect(certificateFindMock).toHaveBeenCalledTimes(1);
    expect(certificateFindMock.mock.calls[0][1]).not.toHaveProperty('extractedText');
    expect(skip).toHaveBeenCalledWith(10);
    expect(limit).toHaveBeenCalledWith(5);
    expect(lean).toHaveBeenCalledTimes(1);
    expect(r.body.data).toMatchObject({ total: 2759, limit: 5, offset: 10 });
    expect(r.body.data.items).toHaveLength(1);
    expect(r.body.data.items[0]).toMatchObject({
      id: 'mongo-1',
      company: 'Acme Fast Co',
      companyName: 'Acme Fast Co',
      size: 'QSE',
      sector: { code: 'ICT', name: 'Information & Communications Technology' },
      vatNumber: '4123456789',
      bbbeeLevel: 2,
      ownership: { black: 51, blackWomen: 26 },
      expiryDate: '2030-01-01',
      extractionStatus: 'completed',
      reviewRequired: false,
    });
  });

  it('GET /list hides non-Okiru legacy sector codes and marks them for review', async () => {
    mongoConnectedMock.mockReturnValue(true);
    const sort = vi.fn(() => chain);
    const skip = vi.fn(() => chain);
    const limit = vi.fn(() => chain);
    const lean = vi.fn(async () => [
      {
        id: 'mongo-legacy-sector',
        blobName: 'certs/generic.pdf',
        fileName: 'generic.pdf',
        supplierName: 'Generic Legacy Co',
        companySize: 'Generic Enterprise',
        sectorCode: 'GENERIC',
        sectorName: 'Generic Codes',
        extractionStatus: 'completed',
        enrichmentStatus: 'completed',
        reviewFields: [],
      },
    ]);
    const chain = { sort, skip, limit, lean };
    certificateFindMock.mockReturnValue(chain);
    certificateCountDocumentsMock.mockResolvedValue(1);

    const r = await call('GET', '/api/certificates/list?limit=5&offset=0');

    expect(r.status).toBe(200);
    expect(r.body.data.items[0]).toMatchObject({
      id: 'mongo-legacy-sector',
      sector: { code: null, name: null },
      sectorCode: null,
      sectorName: null,
      reviewRequired: true,
    });
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

// ---- List filters, stats, SEO ------------------------------------------------

describe('GET /list — search and filters', () => {
  it('filters by company name search', async () => {
    seedCert({ companyName: 'Unique Alpha Corp', vatNumber: '1000000001' });
    seedCert({ companyName: 'Beta Holdings', vatNumber: '1000000002' });
    const r = await call('GET', '/api/certificates/list?search=Unique+Alpha&limit=50');
    expect(r.status).toBe(200);
    expect(r.body.data.items).toHaveLength(1);
    expect(r.body.data.items[0].companyName).toBe('Unique Alpha Corp');
  });

  it('filters by VAT in search', async () => {
    seedCert({ companyName: 'VAT Search Co', vatNumber: '4999888777' });
    const r = await call('GET', '/api/certificates/list?search=4999888777&limit=50');
    expect(r.body.data.items).toHaveLength(1);
    expect(r.body.data.items[0].vatNumber).toBe('4999888777');
  });

  it('filters by status and company size', async () => {
    const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    seedCert({ companyName: 'Expired Co', vatNumber: '2000000001', expiryDate: past });
    seedCert({ companyName: 'Valid QSE', vatNumber: '2000000002', companySize: 'QSE' });

    const expiredOnly = await call('GET', '/api/certificates/list?status=expired&limit=50');
    expect(expiredOnly.body.data.items.every((x: any) => x.status === 'expired')).toBe(true);

    const qseOnly = await call('GET', '/api/certificates/list?size=QSE&limit=50');
    expect(qseOnly.body.data.items.some((x: any) => x.companyName === 'Valid QSE')).toBe(true);
    expect(qseOnly.body.data.items.every((x: any) => (x.companySize || '').toLowerCase() === 'qse')).toBe(true);
  });

  it('filters by black ownership range', async () => {
    seedCert({ companyName: 'Low Own', vatNumber: '3000000001', blackOwnership: 10 });
    seedCert({ companyName: 'High Own', vatNumber: '3000000002', blackOwnership: 80 });

    const r = await call('GET', '/api/certificates/list?minOwnership=50&maxOwnership=100&limit=50');
    expect(r.body.data.items).toHaveLength(1);
    expect(r.body.data.items[0].companyName).toBe('High Own');
  });
});

describe('GET /list — pagination', () => {
  it('respects limit and offset across pages', async () => {
    for (let i = 0; i < 5; i++) {
      seedCert({ companyName: `Page Co ${i}`, vatNumber: `400000000${i}` });
    }
    const page1 = await call('GET', '/api/certificates/list?limit=2&offset=0&sort=recent');
    const page2 = await call('GET', '/api/certificates/list?limit=2&offset=2&sort=recent');
    expect(page1.body.data).toMatchObject({ total: 5, limit: 2, offset: 0 });
    expect(page1.body.data.items).toHaveLength(2);
    expect(page2.body.data).toMatchObject({ total: 5, limit: 2, offset: 2 });
    expect(page2.body.data.items).toHaveLength(2);
    const ids1 = page1.body.data.items.map((x: any) => x.id);
    const ids2 = page2.body.data.items.map((x: any) => x.id);
    expect(ids1.some((id: string) => ids2.includes(id))).toBe(false);
  });
});

describe('GET /stats and GET /seo/list', () => {
  it('GET /stats returns aggregate counts', async () => {
    const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    seedCert({ companyName: 'Stats Valid', vatNumber: '5000000001' });
    seedCert({ companyName: 'Stats Expired', vatNumber: '5000000002', expiryDate: past });

    const r = await call('GET', '/api/certificates/stats');
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(2);
    expect(r.body.valid + r.body.expired + r.body.expiring + r.body.unknown).toBe(2);
  });

  it('GET /seo/list returns slugged records for SSR', async () => {
    seedCert({ companyName: 'SEO Widgets (Pty) Ltd', vatNumber: '6000000001' });
    const r = await call('GET', '/api/certificates/seo/list');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    const row = r.body.find((x: any) => x.companyName === 'SEO Widgets (Pty) Ltd');
    expect(row).toMatchObject({
      companyName: 'SEO Widgets (Pty) Ltd',
      slug: expect.stringMatching(/^seo-widgets/),
      status: expect.any(String),
    });
  });
});

describe('Internal extraction coverage/retry endpoints', () => {
  it('rejects extraction coverage without a valid API key', async () => {
    const r = await call('GET', '/api/certificates/extraction-coverage', { auth: 'admin-1|admin' });

    expect(r.status).toBe(401);
  });

  it('rejects retry extraction without a valid API key', async () => {
    const r = await call('POST', '/api/certificates/retry-extraction', { auth: 'admin-1|admin', body: { limit: 20 } });

    expect(r.status).toBe(401);
  });

  it('defaults retry extraction to dryRun=true', async () => {
    const r = await call('POST', '/api/certificates/retry-extraction', { auth: 'admin-1|admin',
      apiKey: 'test-internal-key',
      body: { limit: 20 },
    });

    expect(r.status).toBe(200);
    expect(runCertificateTextExtractionRetryJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ dryRun: true, limit: 20 }),
    );
    expect(r.body.dryRun).toBe(true);
  });

  it('passes safe retry filters and controls to the extraction job', async () => {
    const r = await call('POST', '/api/certificates/retry-extraction', { auth: 'admin-1|admin',
      apiKey: 'test-internal-key',
      body: {
        limit: 999,
        dryRun: false,
        statuses: ['text_too_short', 'completed', 'not-real'],
        modes: ['none', 'ocr', 'not-real'],
        onlyMissingText: true,
        fileTimeoutMs: 30000,
        concurrency: 2,
      },
    });

    expect(r.status).toBe(200);
    expect(runCertificateTextExtractionRetryJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        limit: 999,
        dryRun: false,
        statuses: ['text_too_short', 'completed'],
        modes: ['none', 'ocr'],
        onlyMissingText: true,
        fileTimeoutMs: 30000,
        concurrency: 2,
      }),
    );
    expect(r.body.limit).toBe(25);
    expect(r.body.concurrency).toBe(2);
  });

  it('manual retry endpoint still works when startup extraction is disabled', async () => {
    process.env.DISABLE_CERTIFICATE_STARTUP_EXTRACTION = 'true';

    const r = await call('POST', '/api/certificates/retry-extraction', { auth: 'admin-1|admin',
      apiKey: 'test-internal-key',
      body: {
        limit: 10,
        dryRun: false,
        modes: ['none'],
        onlyMissingText: true,
      },
    });

    expect(r.status).toBe(200);
    expect(runCertificateTextExtractionRetryJob).toHaveBeenCalledTimes(1);
    expect(runCertificateTextExtractionRetryJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        limit: 10,
        dryRun: false,
        modes: ['none'],
        onlyMissingText: true,
      }),
    );
  });

  it('rejects usable-text enrichment without a valid API key', async () => {
    const r = await call('POST', '/api/certificates/enrich-usable-text', { auth: 'admin-1|admin',
      body: { limit: 100, dryRun: true },
    });

    expect(r.status).toBe(401);
    expect(runCertificateEnrichmentJob).not.toHaveBeenCalled();
  });

  it('runs enrichment only for usable-text records without triggering text extraction', async () => {
    const r = await call('POST', '/api/certificates/enrich-usable-text', { auth: 'admin-1|admin',
      apiKey: 'test-internal-key',
      body: {
        limit: 100,
        dryRun: false,
        forceText: true,
        fields: ['vatNumber', 'expiryDate', 'not-real'],
      },
    });

    expect(r.status).toBe(200);
    expect(runCertificateEnrichmentJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        limit: 100,
        dryRun: false,
        forceText: false,
        onlyUsableText: true,
        fields: ['vatNumber', 'expiryDate'],
      }),
    );
    expect(r.body).toMatchObject({
      totalCertificates: 2758,
      usableTextCount: 2040,
      skippedMissingText: 718,
    });
  });

  it('defaults usable-text enrichment to production-critical fields only', async () => {
    const r = await call('POST', '/api/certificates/enrich-usable-text', { auth: 'admin-1|admin',
      apiKey: 'test-internal-key',
      body: {
        dryRun: true,
      },
    });

    expect(r.status).toBe(200);
    expect(runCertificateEnrichmentJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        dryRun: true,
        onlyUsableText: true,
        fields: [
          'companyName',
          'sectorCode',
          'sectorName',
          'vatNumber',
          'bbbeeLevel',
          'bbbeeLevelStatus',
          'companySize',
          'blackOwnership',
          'blackWomenOwnership',
          'expiryDate',
        ],
      }),
    );
  });

  it('returns focused production coverage for the seven MVP fields', async () => {
    const r = await call('GET', '/api/certificates/production-coverage', { auth: 'admin-1|admin',
      apiKey: 'test-internal-key',
    });

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      totalCertificates: 2758,
      usableTextCount: 2040,
      skippedMissingText: 718,
      productionFields: ['company', 'sector', 'vatNumber', 'bbbeeLevel', 'companySize', 'ownership', 'expiryDate'],
      fieldCoverage: {
        companyCount: 2757,
        sectorCount: 2300,
        vatNumberCount: 3,
        bbbeeLevelCount: 308,
        companySizeCount: 2735,
        ownershipCount: 1129,
        expiryDateCount: 941,
      },
    });
  });

  it('runs VAT recovery as a dry run by default', async () => {
    const r = await call('POST', '/api/certificates/recover-vat', { auth: 'admin-1|admin',
      apiKey: 'test-internal-key',
      body: { limit: 25 },
    });

    expect(r.status).toBe(200);
    expect(runCertificateVatRecoveryJob).toHaveBeenCalledWith(expect.objectContaining({
      limit: 25,
      dryRun: true,
      onlyMissing: true,
      onlyUsableText: true,
    }));
    expect(r.body).toMatchObject({
      dryRun: true,
      vatCoverageBefore: 1318,
      vatCoverageAfter: 1318,
      wouldUpdate: 10,
      updated: 0,
    });
  });

  it('returns a VAT review queue without extracted text', async () => {
    mongoConnectedMock.mockReturnValue(true);
    const sort = vi.fn(() => chain);
    const skip = vi.fn(() => chain);
    const limit = vi.fn(() => chain);
    const lean = vi.fn(async () => [
      {
        id: 'vat-review-1',
        blobName: 'clients/acme.pdf',
        fileName: 'acme.pdf',
        supplierName: 'Acme VAT Co',
        companySize: 'QSE',
        sectorCode: 'ICT',
        sectorName: 'Information & Communications Technology',
        vatNumber: null,
        extractionStatus: 'completed',
        extractionMode: 'ocr',
        extractedTextLength: 1600,
        enrichmentStatus: 'review_required',
        reviewFields: ['vatNumber'],
        reviewCandidates: {
          vatNumber: {
            reason: 'multiple_vat_like_candidates',
            candidates: [
              { value: '4123456789', snippet: 'VAT No 4123456789', confidence: 0.96 },
            ],
          },
        },
        extractedText: 'must not leak',
      },
    ]);
    const chain = { sort, skip, limit, lean };
    certificateFindMock.mockReturnValue(chain);
    certificateCountDocumentsMock.mockResolvedValue(1);

    const r = await call('GET', '/api/certificates/vat-review-queue?limit=5', { auth: 'admin-1|admin',
      apiKey: 'test-internal-key',
    });

    expect(r.status).toBe(200);
    expect(certificateFindMock.mock.calls[0][1]).not.toHaveProperty('extractedText');
    expect(skip).toHaveBeenCalledWith(0);
    expect(limit).toHaveBeenCalledWith(5);
    expect(r.body).toMatchObject({
      total: 1,
      limit: 5,
      pagination: { total: 1, limit: 5, offset: 0 },
      items: [{
        id: 'vat-review-1',
        filename: 'acme.pdf',
        company: 'Acme VAT Co',
        vatNumber: null,
        reviewReason: 'multiple_vat_like_candidates',
        vatCandidates: [{
          candidate: '4123456789',
          confidence: 0.96,
          snippet: 'VAT No 4123456789',
        }],
        documentUrl: expect.stringContaining('/api/certificates/download?file=clients%2Facme.pdf'),
        previewUrl: expect.stringContaining('/api/certificates/download?file=clients%2Facme.pdf'),
      }],
    });
    expect(r.body.items[0]).not.toHaveProperty('extractedText');
  });

  it('confirms VAT manually and clears VAT review metadata only', async () => {
    mongoConnectedMock.mockReturnValue(true);
    certificateFindOneMock.mockReturnValue({
      lean: vi.fn(async () => ({
        id: 'cert-vat-1',
        blobName: 'clients/acme.pdf',
        vatNumber: null,
        reviewFields: ['vatNumber', 'expiryDate'],
        reviewCandidates: {
          vatNumber: { reason: 'multiple_vat_like_candidates' },
          expiryDate: { reason: 'expired' },
        },
        fieldConfidence: {
          expiryDate: { confidence: 0.98, source: 'text' },
        },
      })),
    });

    const r = await call('POST', '/api/certificates/cert-vat-1/confirm-vat', { auth: 'admin-1|admin',
      apiKey: 'test-internal-key',
      body: { vatNumber: '412 345 6789', note: 'Checked against certificate preview' },
    });

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      ok: true,
      id: 'cert-vat-1',
      vatNumber: '4123456789',
      clearedReviewField: 'vatNumber',
    });
    expect(certificateUpdateOneMock).toHaveBeenCalledWith(
      { id: 'cert-vat-1' },
      expect.objectContaining({
        $set: expect.objectContaining({
          vatNumber: '4123456789',
          vatNumberNormalized: '4123456789',
          reviewFields: ['expiryDate'],
          enrichmentStatus: 'review_required',
          fieldConfidence: expect.objectContaining({
            vatNumber: expect.objectContaining({
              confidence: 1,
              source: 'manual_review',
            }),
            expiryDate: { confidence: 0.98, source: 'text' },
          }),
        }),
        $push: expect.objectContaining({
          auditLog: expect.any(Object),
        }),
      }),
    );
    const update = certificateUpdateOneMock.mock.calls[0][1];
    expect(update.$set.reviewCandidates).not.toHaveProperty('vatNumber');
    expect(update.$set).not.toHaveProperty('calculatorPayload');
    expect(update.$set).not.toHaveProperty('scorecardId');
    expect(update.$set).not.toHaveProperty('annualSpend');
    expect(update.$set).not.toHaveProperty('bbbeeScore');
  });

  it('rejects invalid manual VAT confirmation values', async () => {
    mongoConnectedMock.mockReturnValue(true);

    const r = await call('POST', '/api/certificates/cert-vat-1/confirm-vat', { auth: 'admin-1|admin',
      apiKey: 'test-internal-key',
      body: { vatNumber: 'registration 2019/123456/07' },
    });

    expect(r.status).toBe(400);
    expect(certificateUpdateOneMock).not.toHaveBeenCalled();
  });

  it('rejects manual VAT confirmation for numbers that do not start with 4', async () => {
    mongoConnectedMock.mockReturnValue(true);

    const r = await call('POST', '/api/certificates/cert-vat-1/confirm-vat', { auth: 'admin-1|admin',
      apiKey: 'test-internal-key',
      body: { vatNumber: '5123456789' },
    });

    expect(r.status).toBe(400);
    expect(r.body.message).toContain('start with 4');
    expect(certificateUpdateOneMock).not.toHaveBeenCalled();
  });

  it('normalizes hyphenated VAT values on manual confirmation', async () => {
    mongoConnectedMock.mockReturnValue(true);
    certificateFindOneMock.mockReturnValue({
      lean: vi.fn(async () => ({
        id: 'cert-vat-2',
        blobName: 'clients/beta.pdf',
        vatNumber: null,
        reviewFields: ['vatNumber'],
        reviewCandidates: { vatNumber: { reason: 'no_vat_like_candidate_found' } },
        fieldConfidence: {},
      })),
    });

    const r = await call('POST', '/api/certificates/cert-vat-2/confirm-vat', { auth: 'admin-1|admin',
      apiKey: 'test-internal-key',
      body: { vatNumber: '412-345-6789', source: 'manual_review' },
    });

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, vatNumber: '4123456789' });
    const update = certificateUpdateOneMock.mock.calls[0][1];
    expect(update.$set.vatNumber).toBe('4123456789');
    expect(update.$set.reviewFields).toEqual([]);
    expect(update.$set.reviewCandidates).not.toHaveProperty('vatNumber');
    expect(update.$set.enrichmentStatus).toBe('completed');
  });

  it('lists missing-VAT certificates with no candidates in the review queue and excludes trusted VAT records', async () => {
    mongoConnectedMock.mockReturnValue(true);
    certificateFindMock.mockClear();
    const sort = vi.fn(() => chain);
    const skip = vi.fn(() => chain);
    const limit = vi.fn(() => chain);
    const lean = vi.fn(async () => [
      {
        id: 'vat-review-2',
        blobName: 'clients/no-candidate.pdf',
        fileName: 'no-candidate.pdf',
        supplierName: 'No Candidate Co',
        companySize: 'EME',
        sectorCode: 'RCOGP',
        sectorName: 'Retail, Construction, Oil & Gas, Property',
        vatNumber: null,
        extractionStatus: 'completed',
        extractionMode: 'pdf_text',
        extractedTextLength: 900,
        enrichmentStatus: 'review_required',
        reviewFields: ['vatNumber'],
        reviewCandidates: {
          vatNumber: {
            value: null,
            candidates: [],
            reason: 'no_vat_like_candidate_found',
          },
        },
      },
    ]);
    const chain = { sort, skip, limit, lean };
    certificateFindMock.mockReturnValue(chain);
    certificateCountDocumentsMock.mockResolvedValue(7);

    const r = await call('GET', '/api/certificates/vat-review-queue?limit=2&offset=4', { auth: 'admin-1|admin',
      apiKey: 'test-internal-key',
    });

    expect(r.status).toBe(200);
    // Only missing-VAT records may enter the queue: trusted VAT is excluded by the filter itself.
    expect(certificateFindMock.mock.calls[0][0]).toEqual({
      $or: [
        { vatNumber: null },
        { vatNumber: '' },
        { vatNumber: { $exists: false } },
      ],
    });
    expect(skip).toHaveBeenCalledWith(4);
    expect(limit).toHaveBeenCalledWith(2);
    expect(r.body).toMatchObject({
      total: 7,
      limit: 2,
      offset: 4,
      pagination: { total: 7, limit: 2, offset: 4 },
      items: [{
        id: 'vat-review-2',
        company: 'No Candidate Co',
        vatNumber: null,
        reviewReason: 'no_vat_like_candidate_found',
        vatCandidates: [],
      }],
    });
    expect(r.body.items[0]).not.toHaveProperty('extractedText');
  });

  it('returns a focused review queue without extracted text and flags legacy sectors', async () => {
    mongoConnectedMock.mockReturnValue(true);
    const sort = vi.fn(() => chain);
    const skip = vi.fn(() => chain);
    const limit = vi.fn(() => chain);
    const lean = vi.fn(async () => [
      {
        id: 'review-1',
        blobName: 'certs/generic.pdf',
        fileName: 'generic.pdf',
        supplierName: 'Legacy Generic Co',
        sectorCode: 'GENERIC',
        sectorName: 'Generic Codes',
        extractionStatus: 'completed',
        extractionMode: 'ocr',
        extractedTextLength: 2000,
        enrichmentStatus: 'review_required',
        reviewFields: ['bbbeeLevel'],
        fieldConfidence: {},
        auditLog: [{ reviewFields: ['bbbeeLevel'] }],
      },
    ]);
    const chain = { sort, skip, limit, lean };
    certificateFindMock.mockReturnValue(chain);
    certificateCountDocumentsMock
      .mockResolvedValueOnce(1)
      .mockResolvedValue(0);

    const r = await call('GET', '/api/certificates/review-queue?limit=5', { auth: 'admin-1|admin',
      apiKey: 'test-internal-key',
    });

    expect(r.status).toBe(200);
    expect(certificateFindMock.mock.calls[0][1]).not.toHaveProperty('extractedText');
    expect(r.body).toMatchObject({ total: 1, limit: 5, offset: 0 });
    expect(r.body.items[0]).toMatchObject({
      id: 'review-1',
      companyName: 'Legacy Generic Co',
      reviewFields: expect.arrayContaining(['bbbeeLevel', 'sectorCode']),
      values: {
        sectorCode: null,
        sectorName: null,
      },
    });
    expect(r.body.items[0]).not.toHaveProperty('extractedText');
  });

  it('passes usable-text mode through enrich-missing when requested', async () => {
    const r = await call('POST', '/api/certificates/enrich-missing', { auth: 'admin-1|admin',
      apiKey: 'test-internal-key',
      body: {
        limit: 25,
        dryRun: true,
        onlyUsableText: true,
      },
    });

    expect(r.status).toBe(200);
    expect(runCertificateEnrichmentJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        limit: 25,
        dryRun: true,
        onlyUsableText: true,
      }),
    );
  });
});

describe('GET /search', () => {
  it('returns 400 when q is missing', async () => {
    const r = await call('GET', '/api/certificates/search');
    expect(r.status).toBe(400);
  });

  it('returns hybrid search results for a query', async () => {
    const r = await call('GET', '/api/certificates/search?q=acme');
    expect(r.status).toBe(200);
    expect(r.body.results).toHaveLength(1);
    expect(r.body.results[0].company_name).toBe('Acme Search Hit');
    expect(r.body.pagination.hasMore).toBe(false);
  });
});

// ---- Upload, VAT dedupe, versioning ----------------------------------------

describe('POST /upload', () => {
  it('returns 401 without authentication', async () => {
    const r = await upload();
    expect(r.status).toBe(401);
  });

  it('creates a certificate for an authenticated user (local store path)', async () => {
    const r = await upload('', { vatNumber: '7111222333', companyName: 'Fresh Upload Ltd' }, { auth: 'uploader-1|user' });
    expect(r.status).toBe(200);
    expect(r.body.action).toBe('created');
    expect(r.body.results.some((x: any) => x.status === 'uploaded')).toBe(true);

    const listed = await call('GET', '/api/certificates/list?search=Fresh+Upload&limit=50');
    expect(listed.body.data.items.some((x: any) => x.companyName === 'Fresh Upload Ltd')).toBe(true);
  });

  it('rejects duplicate VAT with 409 VAT_EXISTS envelope', async () => {
    seedCert({ companyName: 'Existing VAT Co', vatNumber: '4123456789' });
    const r = await upload('', { vatNumber: '412 345 6789', companyName: 'Duplicate Attempt' }, { auth: 'uploader-1|user' });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({
      success: false,
      error: { code: 'VAT_EXISTS' },
    });
    expect(r.body.data.existing.companyName).toBe('Existing VAT Co');
  });

  it('adds a new version when ?action=update with the same VAT', async () => {
    const original = seedCert({ companyName: 'Versioned Co', vatNumber: '4988776655', bbbeeLevel: 4 });
    const originalBlobName = original.blobName;
    const r = await upload('?action=update', {
      vatNumber: '4988776655',
      companyName: 'Versioned Co',
      expiryDate: new Date(Date.now() + 400 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    }, { auth: 'uploader-1|user', fileName: 'v2.pdf' });
    expect(r.status).toBe(200);
    expect(r.body.action).toBe('updated');

    const history = await call('GET', `/api/certificates/${original.id}/history`);
    expect(history.body.data.versions).toHaveLength(1);
    expect(history.body.data.versions[0].blobName).toBe(originalBlobName);
    expect(history.body.data.latest.blobName).not.toBe(originalBlobName);
    expect(history.body.data.latest.fileName).toMatch(/v2\.pdf$/i);
  });

  it('nulls ownership values outside 0–100 instead of storing invalid numbers', async () => {
    const r = await upload('', {
      vatNumber: '5333444555',
      companyName: 'Ownership Edge Co',
      blackOwnership: '150',
      blackWomenOwnership: '-5',
    }, { auth: 'uploader-1|user' });
    expect(r.status).toBe(200);
    const match = storeMod.certificateStore.getByVatNumber('5333444555');
    expect(match?.blackOwnership).toBeNull();
    expect(match?.blackWomenOwnership).toBeNull();
  });
});

describe('Cache invalidation after mutations', () => {
  it('includes a newly uploaded certificate on the next paginated list', async () => {
    const before = await call('GET', '/api/certificates/list?limit=200&offset=0');
    const totalBefore = before.body.data.total;

    await upload('', { vatNumber: '6222333444', companyName: 'Cache Bust Co' }, { auth: 'uploader-1|user' });

    const after = await call('GET', '/api/certificates/list?limit=200&offset=0');
    expect(after.body.data.total).toBe(totalBefore + 1);
    expect(after.body.data.items.some((x: any) => x.companyName === 'Cache Bust Co')).toBe(true);
  });
});

// ---- Reports — extra validation --------------------------------------------

describe('POST /:id/reports — additional validation', () => {
  it('rejects invalid email addresses', async () => {
    const rec = seedCert();
    const r = await call('POST', `/api/certificates/${rec.id}/reports`, {
      body: {
        reason: 'incorrect-data',
        message: 'Valid message length here',
        email: 'not-an-email',
      },
    });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('INVALID_EMAIL');
  });

  it('rejects messages longer than 4000 characters', async () => {
    const rec = seedCert();
    const r = await call('POST', `/api/certificates/${rec.id}/reports`, {
      body: {
        reason: 'other',
        message: 'x'.repeat(4001),
      },
    });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('MESSAGE_TOO_LONG');
  });
});

// ---- Analytics side effects --------------------------------------------------

describe('Analytics events from certificate routes', () => {
  it('records a verify event after admin verification', async () => {
    const rec = seedCert({ companyName: 'Analytics Verify Co' });
    await call('POST', `/api/certificates/${rec.id}/verify`, { auth: 'admin-1|admin' });

    const eventsPath = path.join(tmpDir, 'uploads', 'certificates', '_events.json');
    expect(fs.existsSync(eventsPath)).toBe(true);
    const events = JSON.parse(fs.readFileSync(eventsPath, 'utf-8'));
    expect(events.some((e: any) => e.type === 'verify' && e.certificateId === rec.id)).toBe(true);
  });
});
