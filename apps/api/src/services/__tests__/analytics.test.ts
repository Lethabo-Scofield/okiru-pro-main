/**
 * Behavior tests for the local-fallback analytics service.
 *
 * recordEvent() must:
 *  - persist events to disk (so the registry has stats even without Mongo)
 *  - support all event types defined in the spec (view/search/upload/...)
 *
 * getAnalyticsSummary() must aggregate totals, byType, topCertificates,
 * topQueries — these power the /admin/analytics dashboard tab.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// db.js / models.js have side effects we don't want — stub them so the
// analytics module's imports resolve cleanly without spinning up Mongoose.
vi.mock('../../../db.js', () => ({ isMongoConnected: () => false }));
vi.mock('../../../models.js', () => ({
  CertificateEventModel: {
    create: vi.fn(async () => ({})),
    find: () => ({
      sort: () => ({
        limit: () => ({ lean: async () => [] }),
      }),
    }),
  },
  CertificateMetadataModel: {},
  CertificateReportModel: {},
}));

let tmpDir: string;
let originalCwd: string;
type AnalyticsModule = typeof import('../analytics.js');
let mod: AnalyticsModule;

beforeAll(() => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cert-analytics-test-'));
  process.chdir(tmpDir);
});

beforeEach(async () => {
  // Wipe events file and reload the module so internal cache resets too
  const eventsFile = path.join(tmpDir, 'uploads', 'certificates', '_events.json');
  if (fs.existsSync(eventsFile)) fs.unlinkSync(eventsFile);
  vi.resetModules();
  mod = await import('../analytics.js');
});

afterAll(() => {
  process.chdir(originalCwd);
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('recordEvent', () => {
  it('persists an event to local disk', () => {
    mod.recordEvent({
      type: 'view',
      certificateId: 'cert-001',
      certificateSlug: 'acme-cert-001',
      userId: 'user-1',
      ipAddress: '127.0.0.1',
      userAgent: 'test',
    });
    const file = path.join(tmpDir, 'uploads', 'certificates', '_events.json');
    expect(fs.existsSync(file)).toBe(true);
    const arr = JSON.parse(fs.readFileSync(file, 'utf-8'));
    expect(arr).toHaveLength(1);
    expect(arr[0]).toMatchObject({
      type: 'view',
      certificateId: 'cert-001',
      certificateSlug: 'acme-cert-001',
      userId: 'user-1',
    });
    expect(arr[0].id).toMatch(/[a-f0-9-]{36}/);
    expect(arr[0].createdAt).toBeTruthy();
  });

  it('records each spec event type without throwing', () => {
    const types = ['view', 'search', 'upload', 'download', 'verify', 'unverify', 'report'] as const;
    for (const type of types) {
      expect(() => mod.recordEvent({ type, query: type === 'search' ? 'acme' : null })).not.toThrow();
    }
    const arr = JSON.parse(fs.readFileSync(
      path.join(tmpDir, 'uploads', 'certificates', '_events.json'),
      'utf-8',
    ));
    expect(arr.map((e: any) => e.type).sort()).toEqual([...types].sort());
  });

  it('never throws when given malformed input', () => {
    // The route handlers rely on recordEvent being fire-and-forget safe.
    expect(() => mod.recordEvent({ type: 'view' })).not.toThrow();
  });
});

describe('getAnalyticsSummary', () => {
  it('reports totals and byType counts', async () => {
    mod.recordEvent({ type: 'view', certificateId: 'a', certificateSlug: 'a-slug' });
    mod.recordEvent({ type: 'view', certificateId: 'a', certificateSlug: 'a-slug' });
    mod.recordEvent({ type: 'search', query: 'acme' });
    mod.recordEvent({ type: 'upload' });
    mod.recordEvent({ type: 'download' });

    const summary = await mod.getAnalyticsSummary();
    expect(summary.totals.allTime).toBe(5);
    expect(summary.totals.last24h).toBe(5);
    expect(summary.byType.view).toBe(2);
    expect(summary.byType.search).toBe(1);
    expect(summary.byType.upload).toBe(1);
    expect(summary.byType.download).toBe(1);
  });

  it('ranks topCertificates by view count', async () => {
    for (let i = 0; i < 3; i++) mod.recordEvent({ type: 'view', certificateId: 'c-popular', certificateSlug: 'pop' });
    mod.recordEvent({ type: 'view', certificateId: 'c-quiet', certificateSlug: 'quiet' });

    const summary = await mod.getAnalyticsSummary();
    expect(summary.topCertificates[0]).toEqual({ certificateId: 'c-popular', certificateSlug: 'pop', views: 3 });
    expect(summary.topCertificates[1]).toEqual({ certificateId: 'c-quiet', certificateSlug: 'quiet', views: 1 });
  });

  it('ranks topQueries by frequency, normalising whitespace + case', async () => {
    mod.recordEvent({ type: 'search', query: 'Acme' });
    mod.recordEvent({ type: 'search', query: 'ACME' });
    mod.recordEvent({ type: 'search', query: '  acme  ' });
    mod.recordEvent({ type: 'search', query: 'unique' });

    const summary = await mod.getAnalyticsSummary();
    expect(summary.topQueries[0]).toEqual({ query: 'acme', count: 3 });
    expect(summary.topQueries[1]).toEqual({ query: 'unique', count: 1 });
  });

  it('returns empty arrays + zero totals on a fresh install', async () => {
    const summary = await mod.getAnalyticsSummary();
    expect(summary.totals.allTime).toBe(0);
    expect(summary.topCertificates).toEqual([]);
    expect(summary.topQueries).toEqual([]);
    expect(summary.recent).toEqual([]);
  });
});
