import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { generateKeyPairSync } from 'crypto';
import { createSigner, createVerifier } from '../../signing.js';
import { MemoryRulesStore } from '../../__tests__/memoryStore.js';
import { MemoryStudioStore } from './memoryStudioStore.js';
import { publishVersion } from '../../rulesService.js';
import { runNightly, runNightlyIfDue } from '../monitor.js';
import { backupStatus, type StudioCtx } from '../studioService.js';
import type { OffsiteStore } from '../snapshots.js';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
class Off implements OffsiteStore {
  m = new Map<string, string>(); fail = false;
  describe() { return 'fake'; }
  async put(k: string, d: string) { if (this.fail) throw new Error('down'); this.m.set(k, d); }
  async get(k: string) { return this.m.get(k) ?? null; }
}
let ctx: StudioCtx; let off: Off; let clock: Date; let hooks: any[];
beforeAll(() => { vi.spyOn(console, 'log').mockImplementation(() => {}); });
afterAll(() => vi.restoreAllMocks());
beforeEach(() => {
  clock = new Date('2026-11-03T01:00:00Z'); off = new Off(); hooks = [];
  ctx = {
    studio: new MemoryStudioStore(), offsite: off, env: {} as NodeJS.ProcessEnv, now: () => clock, requiredApprovals: 1,
    notifyCfg: { webhookUrl: 'https://h.test', smtpConfigured: false, maxAttempts: 1, timeoutMs: 100, fetchImpl: async (_u, i) => { hooks.push(JSON.parse(i.body)); return { ok: true, status: 200 }; } },
    rules: {
      store: new MemoryRulesStore(), buildId: 'b', now: () => clock,
      signer: createSigner('k', privateKey.export({ type: 'pkcs8', format: 'pem' }) as string),
      verifier: createVerifier({ k: publicKey.export({ type: 'spki', format: 'pem' }) as string }),
    },
  };
});

describe('nightly backup + heartbeat', () => {
  it('snapshots, verifies integrity and only then sends the heartbeat', async () => {
    await publishVersion({ scorecardId: 'rcogp-generic', overrides: { source: {}, calculator: {} }, publishedBy: 't' }, ctx.rules);
    const pings: string[] = [];
    const r = await runNightly(ctx, { heartbeatUrl: 'https://hb.test/ping', fetchImpl: async (u) => { pings.push(u); return { ok: true }; } });
    expect(r).toMatchObject({ ok: true, integrityOk: true, heartbeat: 'sent', problems: [] });
    expect(pings).toEqual(['https://hb.test/ping']);
    expect([...off.m.keys()].some((k) => k.includes('nightly-all'))).toBe(true);
    expect((await backupStatus(ctx)).stale).toBe(false);
  });

  it('withholds the heartbeat and alarms when the off-site write fails (so the external monitor fires)', async () => {
    off.fail = true;
    const pings: string[] = [];
    const r = await runNightly(ctx, { heartbeatUrl: 'https://hb.test/ping', fetchImpl: async (u) => { pings.push(u); return { ok: true }; } });
    expect(r.ok).toBe(false);
    expect(r.heartbeat).toBe('withheld');
    expect(pings).toEqual([]);
    expect(hooks.some((h) => h.type === 'backup.failed' && h.severity === 'critical')).toBe(true);
  });

  it('withholds the heartbeat and alarms on a tampered ledger', async () => {
    await publishVersion({ scorecardId: 'rcogp-generic', overrides: { source: {}, calculator: {} }, publishedBy: 't' }, ctx.rules);
    (ctx.rules.store as MemoryRulesStore).versions.get('rcogp-generic')![0].publishedBy = 'attacker';
    const r = await runNightly(ctx, { heartbeatUrl: 'https://hb.test/ping', fetchImpl: async () => ({ ok: true }) });
    expect(r).toMatchObject({ ok: false, integrityOk: false, heartbeat: 'withheld' });
    expect(hooks.some((h) => h.type === 'integrity.failure')).toBe(true);
  });

  it('detects an older off-site snapshot that has rotted', async () => {
    await runNightly(ctx);
    clock = new Date(clock.getTime() + 25 * 3_600_000);
    const [key] = [...off.m.keys()];
    off.m.set(key, off.m.get(key)!.replace('"content"', '"contenX"'));
    const r = await runNightly(ctx);
    expect(r.ok).toBe(false);
    expect(r.problems.join()).toMatch(/older off-site snapshot/);
  });

  it('runNightlyIfDue skips when a verified snapshot is under 24h old', async () => {
    expect(await runNightlyIfDue(ctx)).not.toBeNull();
    expect(await runNightlyIfDue(ctx)).toBeNull();
    clock = new Date(clock.getTime() + 25 * 3_600_000);
    expect(await runNightlyIfDue(ctx)).not.toBeNull();
  });

  it('a heartbeat delivery failure is reported but does not fail the backup', async () => {
    const r = await runNightly(ctx, { heartbeatUrl: 'https://hb.test', fetchImpl: async () => { throw new Error('net'); } });
    expect(r).toMatchObject({ ok: true, heartbeat: 'failed' });
  });
});
