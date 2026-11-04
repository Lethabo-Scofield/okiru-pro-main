import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateKeyPairSync, randomBytes } from 'crypto';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { envReadiness, fullReadiness } from '../readiness.js';
import { LocalDirOffsite, offsiteFromEnv, SnapshotFailedError } from '../studio/snapshots.js';
import { MemoryStudioStore } from '../studio/__tests__/memoryStudioStore.js';
import { createGrant } from '../studio/permissions.js';

vi.mock('../../../db.js', () => ({ isMongoConnected: () => true }));

const priv = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
const totp = randomBytes(32).toString('base64');
const base = { RULES_SIGNING_KEY_ID: 'k1', RULES_SIGNING_PRIVATE_KEY: priv, RULES_TOTP_ENC_KEY: totp, BUILD_ID: 'abc123' } as NodeJS.ProcessEnv;
const prodReady = {
  ...base, NODE_ENV: 'production', RULES_OFFSITE_AZURE_CONNECTION_STRING: 'conn-OFFSITE', RULES_OFFSITE_CONTAINER: 'snaps',
  RULES_ALARM_WEBHOOK_URL: 'https://hook', RULES_HEARTBEAT_URL: 'https://hb', RULES_MONGO_URI: 'mongodb://restricted',
} as NodeJS.ProcessEnv;
const blockers = (e: NodeJS.ProcessEnv) => envReadiness(e).checks.filter((c) => c.severity === 'blocker' && !c.ok).map((c) => c.id);

describe('launch readiness', () => {
  it('an empty environment cannot launch and lists every blocker', () => {
    const r = envReadiness({} as NodeJS.ProcessEnv);
    expect(r.canLaunch).toBe(false);
    expect(blockers({} as NodeJS.ProcessEnv)).toEqual(expect.arrayContaining(['signing-key', 'totp-key', 'offsite-backup', 'build-id', 'alarm-webhook', 'heartbeat', 'restricted-db-user']));
  });

  it('RULES_LAUNCHED=true is ignored while a blocker fails', () => {
    const r = envReadiness({ RULES_LAUNCHED: 'true' } as NodeJS.ProcessEnv);
    expect(r.launchedFlag).toBe(true);
    expect(r.effectiveLaunched).toBe(false);
  });

  it('a fully configured production environment can launch and is production-ready', () => {
    const r = envReadiness({ ...prodReady, RULES_LAUNCHED: 'true' } as NodeJS.ProcessEnv);
    expect(blockers(prodReady)).toEqual([]);
    expect(r).toMatchObject({ canLaunch: true, productionReady: true, rehearsal: false, effectiveLaunched: true });
  });

  it('rejects a malformed or non-Ed25519 signing key and a short TOTP key', () => {
    expect(blockers({ ...prodReady, RULES_SIGNING_PRIVATE_KEY: 'garbage' } as NodeJS.ProcessEnv)).toContain('signing-key');
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    expect(blockers({ ...prodReady, RULES_SIGNING_PRIVATE_KEY: rsa } as NodeJS.ProcessEnv)).toContain('signing-key');
    expect(blockers({ ...prodReady, RULES_TOTP_ENC_KEY: 'short' } as NodeJS.ProcessEnv)).toContain('totp-key');
  });

  it('refuses an off-site store that is the primary storage account', () => {
    expect(blockers({ ...prodReady, AZURE_STORAGE_CONNECTION_STRING: 'conn-OFFSITE' } as NodeJS.ProcessEnv)).toContain('offsite-backup');
  });

  it('rehearsal can launch locally but is NEVER production-ready', () => {
    const rehearsal = { ...base, RULES_REHEARSAL: 'true', RULES_OFFSITE_LOCAL_DIR: '/tmp/x', RULES_LAUNCHED: 'true' } as NodeJS.ProcessEnv;
    const r = envReadiness(rehearsal);
    expect(r).toMatchObject({ canLaunch: true, rehearsal: true, productionReady: false, effectiveLaunched: true });
  });

  it('rehearsal settings are refused in production, and the local store needs RULES_REHEARSAL', () => {
    const inProd = { ...prodReady, RULES_REHEARSAL: 'true', RULES_OFFSITE_LOCAL_DIR: '/tmp/x' } as NodeJS.ProcessEnv;
    expect(blockers(inProd)).toContain('not-rehearsal-in-prod');
    expect(envReadiness(inProd).rehearsal).toBe(false);
    expect(blockers({ ...base, RULES_OFFSITE_LOCAL_DIR: '/tmp/x' } as NodeJS.ProcessEnv)).toContain('offsite-backup');
  });

  it('database checks: needs an editor and a DIFFERENT approver, plus an enrolled authenticator', async () => {
    const studio = new MemoryStudioStore();
    const env = { ...prodReady } as NodeJS.ProcessEnv;
    const ids = async () => (await fullReadiness(studio, env)).checks.filter((c) => !c.ok && c.severity === 'blocker').map((c) => c.id);
    expect(await ids()).toEqual(expect.arrayContaining(['roles', 'approver-enrolled']));
    await createGrant(studio, { userId: 'solo', role: 'expert_editor', scorecards: ['*'], createdBy: 'r', now: new Date() });
    await createGrant(studio, { userId: 'solo', role: 'expert_approver', scorecards: ['*'], createdBy: 'r', now: new Date() });
    expect(await ids()).toContain('roles'); // one person holding both roles cannot satisfy four-eyes
    await createGrant(studio, { userId: 'boss', role: 'expert_approver', scorecards: ['*'], createdBy: 'r', now: new Date() });
    expect(await ids()).not.toContain('roles');
    await studio.collection('studioGrants').insert({ id: 'totp:boss', rev: 1, kind: 'totp', userId: 'boss', confirmed: true } as never);
    expect(await ids()).toEqual([]);
  });
});

describe('local rehearsal off-site store', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'rules-rehearsal-')); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('writes, reads back, never overwrites, and cannot escape its directory', async () => {
    const s = new LocalDirOffsite(dir);
    expect(s.rehearsal).toBe(true);
    expect(s.describe()).toContain('LOCAL-REHEARSAL');
    await s.put('rules-snapshots/2026/a.json', '{"x":1}');
    expect(await s.get('rules-snapshots/2026/a.json')).toBe('{"x":1}');
    await expect(s.put('rules-snapshots/2026/a.json', 'overwrite')).rejects.toThrow();
    expect(await s.get('missing.json')).toBeNull();
    await s.put('../../escape.json', 'x');
    expect(existsSync(join(dir, '..', '..', 'escape.json'))).toBe(false);
  });

  it('is refused in production and absent unless configured', async () => {
    await expect(offsiteFromEnv({ NODE_ENV: 'production', RULES_OFFSITE_LOCAL_DIR: dir } as NodeJS.ProcessEnv)).rejects.toBeInstanceOf(SnapshotFailedError);
    expect(await offsiteFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
    expect((await offsiteFromEnv({ RULES_OFFSITE_LOCAL_DIR: dir } as NodeJS.ProcessEnv))?.describe()).toContain(dir);
  });
});
