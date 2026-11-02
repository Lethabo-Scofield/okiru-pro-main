/**
 * /api/rules/heads and /api/rules/published/:sid - the fail-closed live link contract.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import http from 'http';
import type { AddressInfo } from 'net';
import { generateKeyPairSync } from 'crypto';

vi.mock('../../logger.js', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));
vi.mock('../../middleware/requireAuth.js', () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../rules/runtime.js', () => ({ getServiceDeps: () => { throw new Error('unused'); }, rulesLaunched: () => true }));

import { createPublishedRulesRouter } from '../rules.js';
import { createSigner, createVerifier } from '../../rules/signing.js';
import { publishVersion, freeze, type ServiceDeps } from '../../rules/rulesService.js';
import { StoreUnavailableError } from '../../rules/store.js';
import { MemoryRulesStore } from '../../rules/__tests__/memoryStore.js';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const priv = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
const pub = publicKey.export({ type: 'spki', format: 'pem' }) as string;
const G = 'benefitFactors[contributionType=guarantees].sdFactor';

let store: MemoryRulesStore;
let deps: ServiceDeps;
let launched = true;
let server: http.Server;
let base = '';

beforeAll(async () => {
  const app = express();
  app.use('/api/rules', createPublishedRulesRouter(() => deps, () => launched));
  server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(() => {
  launched = true;
  store = new MemoryRulesStore();
  deps = { store, signer: createSigner('k1', priv), verifier: createVerifier({ k1: pub }), buildId: 'route-test-build' };
});

const get = async (path: string) => {
  const res = await fetch(base + path);
  return { status: res.status, cache: res.headers.get('cache-control'), body: await res.json() as any };
};

describe('published rules routes', () => {
  it('answers launched:false (shipped rules) while RULES_LAUNCHED is off, without touching storage', async () => {
    launched = false;
    deps = { ...deps, store: { getVersions: () => { throw new Error('must not be called'); } } as any };
    expect((await get('/api/rules/heads')).body).toEqual({ launched: false, heads: [] });
    const p = await get('/api/rules/published/rcogp-generic');
    expect(p.status).toBe(200);
    expect(p.body).toMatchObject({ launched: false, stamp: null, overrides: null });
  });

  it('serves the verified version with a stamp, never cached', async () => {
    await publishVersion({ scorecardId: 'rcogp-generic', overrides: { source: { [G]: 0.5 }, calculator: {} }, publishedBy: 't' }, deps);
    const r = await get('/api/rules/published/rcogp-generic');
    expect(r.status).toBe(200);
    expect(r.cache).toBe('no-store');
    expect(r.body.stamp).toMatchObject({ scorecardId: 'rcogp-generic', version: 1 });
    expect(r.body.stamp.configHash).toMatch(/^[0-9a-f]{64}$/);
    expect(r.body.overrides.source[G]).toBe(0.5);
  });

  it('serves a version-0 (shipped) stamp for a scorecard with no published version', async () => {
    const r = await get('/api/rules/published/fsc-banks');
    expect(r.body).toMatchObject({ launched: true, headVersion: 0, overrides: { source: {}, calculator: {} } });
    expect(r.body.stamp).toMatchObject({ version: 0, pinned: false, frozen: false, buildId: 'route-test-build' });
  });

  it('serves a pinned version, a period-end version and rejects bad query parameters', async () => {
    await publishVersion({ scorecardId: 'rcogp-generic', overrides: { source: { [G]: 0.5 }, calculator: {} }, publishedBy: 't', effectiveFrom: new Date(Date.now() + 1000) }, deps);
    expect((await get('/api/rules/published/rcogp-generic?version=1')).body.stamp).toMatchObject({ version: 1, pinned: true });
    expect((await get('/api/rules/published/rcogp-generic?version=0')).body.stamp).toMatchObject({ version: 0, pinned: true });
    expect((await get('/api/rules/published/rcogp-generic?periodEnd=2020-01-01')).body.stamp.version).toBe(0);
    expect((await get('/api/rules/published/rcogp-generic?version=9')).status).toBe(404);
    expect((await get('/api/rules/published/rcogp-generic?version=-1')).status).toBe(400);
    expect((await get('/api/rules/published/rcogp-generic?version=abc')).status).toBe(400);
    expect((await get('/api/rules/published/rcogp-generic?periodEnd=tomorrow')).status).toBe(400);
  });

  it('serves the frozen last-known-good version flagged frozen', async () => {
    await publishVersion({ scorecardId: 'rcogp-generic', overrides: { source: { [G]: 0.5 }, calculator: {} }, publishedBy: 't' }, deps);
    await freeze(deps, { scope: 'rcogp-generic', reason: 'investigating', actor: 'a', serveVersion: 0 });
    const r = await get('/api/rules/published/rcogp-generic');
    expect(r.body.stamp).toMatchObject({ version: 0, frozen: true });
    expect((await get('/api/rules/heads')).body.heads.find((h: any) => h.scorecardId === 'rcogp-generic')).toMatchObject({ frozen: true, activeVersion: 0, headVersion: 1 });
  });

  it('supports conditional requests with an ETag', async () => {
    const first = await fetch(base + '/api/rules/published/rcogp-generic');
    const etag = first.headers.get('etag')!;
    expect(etag).toMatch(/^"[0-9a-f]{32}"$/);
    const second = await fetch(base + '/api/rules/published/rcogp-generic', { headers: { 'If-None-Match': etag } });
    expect(second.status).toBe(304);
    expect(second.headers.get('cache-control')).toBe('no-store');
  });

  it('lists nine heads', async () => {
    const r = await get('/api/rules/heads');
    expect(r.body.heads).toHaveLength(9);
  });

  it('404s an unknown scorecard id', async () => {
    expect((await get('/api/rules/published/not-a-scorecard')).status).toBe(404);
    expect((await get('/api/rules/published/__proto__')).status).toBe(404);
  });

  it('fails closed with 500 + code when the ledger was tampered with', async () => {
    await publishVersion({ scorecardId: 'rcogp-generic', overrides: { source: { [G]: 0.5 }, calculator: {} }, publishedBy: 't' }, deps);
    store.versions.get('rcogp-generic')![0].overrides.source[G] = 0.9;
    const r = await get('/api/rules/published/rcogp-generic');
    expect(r.status).toBe(500);
    expect(r.body.code).toBe('RULES_INTEGRITY_FAILURE');
    expect(JSON.stringify(r.body)).not.toContain('0.9'); // internals are not echoed
    expect((await get('/api/rules/heads')).status).toBe(500);
  });

  it('returns 503 (no in-memory fallback) when storage is down', async () => {
    deps = { ...deps, store: { getVersions: async () => { throw new StoreUnavailableError(); } } as any };
    const r = await get('/api/rules/published/rcogp-generic');
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('STORE_UNAVAILABLE');
  });
});
