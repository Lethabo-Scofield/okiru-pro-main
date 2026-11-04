import { describe, it, expect, beforeEach } from 'vitest';
import { generateKeyPairSync } from 'crypto';
import { createSigner, createVerifier, SigningUnavailableError } from '../signing.js';
import {
  publishVersion, resolvePublished, resolveHeads, loadVerifiedHistory, restoreVersion, emergencyRollback, freeze, unfreeze, RulesIncompatibleError, RulesNotFoundError,
  RulesIntegrityError, RulesFrozenError, PublishRejectedError, type ServiceDeps,
} from '../rulesService.js';
import { VersionConflictError } from '../store.js';
import { verifyChain, canonicalJson, sha256 } from '../ledger.js';
import { MemoryRulesStore } from './memoryStore.js';
import { buildEffectiveConfig, hashEffectiveConfig } from '../../../../web/Toolkit/src/lib/rules/buildEffectiveConfig';
import { SCORECARD_SOURCES } from '../../../../web/Toolkit/src/lib/rules/scorecards';

const GUARANTEES = 'benefitFactors[contributionType=interest_free_loan].sdFactor';
const keypair = () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    priv: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    pub: publicKey.export({ type: 'spki', format: 'pem' }) as string,
  };
};

let store: MemoryRulesStore;
let deps: ServiceDeps;
let clock: Date;
const k1 = keypair();

beforeEach(() => {
  store = new MemoryRulesStore();
  clock = new Date('2026-11-02T10:00:00.000Z');
  deps = {
    store,
    signer: createSigner('k1', k1.priv),
    verifier: createVerifier({ k1: k1.pub }),
    buildId: 'test-build',
    now: () => clock,
  };
});

const pub = (overrides = { source: { [GUARANTEES]: 0.5 }, calculator: {} }, extra = {}) =>
  publishVersion({ scorecardId: 'rcogp-generic', overrides, publishedBy: 'tester', ...extra }, deps);

describe('rules ledger - publishing', () => {
  it('publishes a signed version whose chain verifies', async () => {
    const v1 = await pub();
    expect(v1.version).toBe(1);
    expect(verifyChain('rcogp-generic', [v1], deps.verifier)).toEqual({ ok: true, failures: [] });
  });

  it('hashes the config it will actually serve (a benefit factor change changes it)', async () => {
    const v1 = await pub();
    const shippedHash = sha256(canonicalJson(SCORECARD_SOURCES['rcogp-generic'].shipped));
    expect(v1.configHash).not.toBe(shippedHash);
    const cfg = buildEffectiveConfig('rcogp-generic', v1.overrides);
    const guarantee = (cfg as unknown as { benefitFactors: { type: string; factor: number }[] }).benefitFactors.find((b) => b.type === 'interest_free_loan');
    expect(guarantee?.factor).toBe(0.5);
  });

  it('links versions into a chain and serves the latest', async () => {
    const v1 = await pub();
    clock = new Date('2026-11-02T11:00:00.000Z');
    const v2 = await pub({ source: { [GUARANTEES]: 0.04 }, calculator: {} });
    expect(v2.parentVersion).toBe(1);
    expect(v2.prevChainHash).toBe(v1.chainHash);
    const p = await resolvePublished('rcogp-generic', deps);
    expect(p.stamp.version).toBe(2);
    expect(p.overrides?.source[GUARANTEES]).toBe(0.04);
  });

  it('refuses unknown scorecards and invalid overrides, writing nothing', async () => {
    await expect(publishVersion({ scorecardId: 'nope', overrides: { source: {}, calculator: {} }, publishedBy: 't' }, deps)).rejects.toThrow(PublishRejectedError);
    await expect(pub({ source: { [GUARANTEES]: 7 }, calculator: {} })).rejects.toThrow(PublishRejectedError);
    await expect(pub({ source: { 'targets.nope.x': 1 }, calculator: {} })).rejects.toThrow(PublishRejectedError);
    expect(await store.getVersions('rcogp-generic')).toEqual([]);
  });

  it('is disabled without a signing key - there is no unsigned path', async () => {
    deps.signer = undefined;
    await expect(pub()).rejects.toThrow(SigningUnavailableError);
    expect(await store.getVersions('rcogp-generic')).toEqual([]);
  });

  it('rejects a past effectiveFrom and one that precedes an existing version', async () => {
    await pub(undefined, { effectiveFrom: new Date('2026-12-01T00:00:00Z') });
    await expect(pub(undefined, { effectiveFrom: new Date('2026-11-01T00:00:00Z') })).rejects.toThrow(/past/);
    await expect(pub(undefined, { effectiveFrom: new Date('2026-11-15T00:00:00Z') })).rejects.toThrow(/precede/);
  });

  it('loses the race cleanly: two publishes of the same next version', async () => {
    const results = await Promise.allSettled([pub(), pub({ source: { [GUARANTEES]: 0.04 }, calculator: {} })]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(VersionConflictError);
    expect((await store.getVersions('rcogp-generic')).map((r) => r.version)).toEqual([1]);
  });
});

describe('rules ledger - freeze', () => {
  it('blocks publishing (423) and keeps serving the frozen version, flagged in the stamp', async () => {
    await pub();
    await freeze(deps, { scope: 'rcogp-generic', reason: 'incident 42', actor: 'admin' });
    await expect(pub()).rejects.toThrow(RulesFrozenError);
    const p = await resolvePublished('rcogp-generic', deps);
    expect(p.stamp).toMatchObject({ version: 1, frozen: true, pinned: false });
  });

  it('serves the CHOSEN last known good version while frozen, even if newer versions exist', async () => {
    await pub({ source: { [GUARANTEES]: 0.5 }, calculator: {} });
    clock = new Date('2026-11-02T11:00:00Z');
    await pub({ source: { [GUARANTEES]: 0.04 }, calculator: {} });
    await freeze(deps, { scope: 'rcogp-generic', reason: 'v2 looks wrong', actor: 'admin', serveVersion: 1 });
    expect((await resolvePublished('rcogp-generic', deps)).stamp).toMatchObject({ version: 1, frozen: true });
    await freeze(deps, { scope: 'rcogp-generic', reason: 'back to shipped', actor: 'admin', serveVersion: 0 });
    expect((await resolvePublished('rcogp-generic', deps)).stamp).toMatchObject({ version: 0, frozen: true });
    await expect(freeze(deps, { scope: 'rcogp-generic', reason: 'nonexistent', actor: 'a', serveVersion: 9 })).rejects.toThrow(/does not exist/);
  });

  it('is scoped: freezing one scorecard does not freeze another', async () => {
    await freeze(deps, { scope: 'rcogp-generic', reason: 'only this one', actor: 'a' });
    await expect(publishVersion({ scorecardId: 'rcogp-qse', overrides: { source: {}, calculator: {} }, publishedBy: 't' }, deps)).resolves.toMatchObject({ version: 1 });
    expect((await resolvePublished('rcogp-qse', deps)).stamp.frozen).toBe(false);
  });

  it('freezing everything fans out one event per scorecard; the log is append-only history', async () => {
    await freeze(deps, { scope: '*', reason: 'platform incident', actor: 'a' });
    expect(store.freezeEvents).toHaveLength(9);
    await unfreeze(deps, { scope: 'rcogp-generic', reason: 'cleared', actor: 'a' });
    expect(store.freezeEvents).toHaveLength(10); // events are appended, never edited
    await expect(pub()).resolves.toMatchObject({ version: 1 });
    await expect(publishVersion({ scorecardId: 'ict-qse', overrides: { source: {}, calculator: {} }, publishedBy: 't' }, deps)).rejects.toThrow(RulesFrozenError);
  });

  it('RULES_FREEZE is an operator switch independent of the Studio', async () => {
    deps.envFrozen = true;
    await expect(pub()).rejects.toThrow(/RULES_FREEZE/);
  });
});

describe('rules ledger - tamper detection', () => {
  it('detects an edited override and refuses to serve or extend the chain', async () => {
    await pub();
    const list = store.versions.get('rcogp-generic')!;
    list[0].overrides.source[GUARANTEES] = 0.9; // attacker edits the stored rule
    await expect(resolvePublished('rcogp-generic', deps)).rejects.toThrow(RulesIntegrityError);
    await expect(pub()).rejects.toThrow(RulesIntegrityError);
  });

  it('detects a re-signed forgery from a different key', async () => {
    await pub();
    const evil = keypair();
    const list = store.versions.get('rcogp-generic')!;
    const forged = createSigner('k1', evil.priv).sign(canonicalJson({ forged: true }));
    list[0].signature = forged;
    await expect(loadVerifiedHistory('rcogp-generic', deps)).rejects.toThrow(/bad-signature/);
  });

  it('detects a deleted middle version and a truncated start', async () => {
    await pub();
    clock = new Date('2026-11-02T11:00:00Z');
    await pub({ source: { [GUARANTEES]: 0.04 }, calculator: {} });
    clock = new Date('2026-11-02T12:00:00Z');
    await pub({ source: { [GUARANTEES]: 0.05 }, calculator: {} });
    const full = store.versions.get('rcogp-generic')!;

    store.versions.set('rcogp-generic', [full[0], full[2]]);
    await expect(loadVerifiedHistory('rcogp-generic', deps)).rejects.toThrow(/version-gap|chain-link-broken/);

    store.versions.set('rcogp-generic', [full[1], full[2]]);
    await expect(loadVerifiedHistory('rcogp-generic', deps)).rejects.toThrow(/genesis-mismatch|version-gap/);
  });

  it('detects a version transplanted from another scorecard chain', async () => {
    await pub();
    await publishVersion({ scorecardId: 'rcogp-qse', overrides: { source: {}, calculator: {} }, publishedBy: 't' }, deps);
    const other = store.versions.get('rcogp-qse')![0];
    store.versions.set('rcogp-generic', [other]);
    await expect(loadVerifiedHistory('rcogp-generic', deps)).rejects.toThrow(RulesIntegrityError);
  });

  it('fails closed when the shipped baseline moves under a signed version', async () => {
    await pub();
    const list = store.versions.get('rcogp-generic')!;
    // Simulate: version was signed against a different baseline => stored configHash cannot be reproduced.
    const forgedPayloadOk = { ...list[0], configHash: 'f'.repeat(64) };
    // Re-seal with the real key so signature/chain are valid but the config hash is stale.
    const { sealVersion } = await import('../ledger.js');
    const { payloadHash: _p, chainHash: _c, keyId: _k, signature: _s, ...payload } = forgedPayloadOk;
    store.versions.set('rcogp-generic', [sealVersion(payload, deps.signer!)]);
    await expect(resolvePublished('rcogp-generic', deps)).rejects.toThrow(/no longer matches/);
  });
});

describe('rules ledger - effective dates and heads', () => {
  it('keeps serving the old version until a scheduled one takes effect', async () => {
    await pub();
    clock = new Date('2026-11-02T11:00:00Z');
    await pub({ source: { [GUARANTEES]: 0.04 }, calculator: {} }, { effectiveFrom: new Date('2026-11-10T00:00:00Z') });

    expect((await resolvePublished('rcogp-generic', deps)).stamp.version).toBe(1);
    expect((await resolvePublished('rcogp-generic', deps)).headVersion).toBe(2);
    expect((await resolvePublished('rcogp-generic', deps, { at: new Date('2026-11-10T00:00:01Z') })).stamp.version).toBe(2);
  });

  it('serves a version-0 (shipped) stamp for a scorecard that was never published', async () => {
    const p = await resolvePublished('fsc-banks', deps);
    expect(p.stamp).toMatchObject({ version: 0, pinned: false, frozen: false, buildId: 'test-build' });
    expect(p.overrides).toEqual({ source: {}, calculator: {} });
    expect(p.stamp.configHash).toBe(await hashEffectiveConfig(SCORECARD_SOURCES['fsc-banks'].shipped));
  });

  it('lists a head for each of the nine scorecards', async () => {
    await pub();
    const heads = await resolveHeads(deps);
    expect(heads).toHaveLength(9);
    expect(heads.find((h) => h.scorecardId === 'rcogp-generic')?.activeVersion).toBe(1);
    expect(heads.find((h) => h.scorecardId === 'ict-qse')?.activeVersion).toBe(0);
  });
});

describe('rules ledger - restore, emergency rollback and freeze', () => {
  const later = (h: number) => { clock = new Date(clock.getTime() + h * 3_600_000); };

  it('restore re-publishes an old version as a NEW version (history is never rewritten)', async () => {
    const v1 = await pub({ source: { [GUARANTEES]: 0.5 }, calculator: {} });
    later(1); await pub({ source: { [GUARANTEES]: 0.04 }, calculator: {} });
    later(1);
    const v3 = await restoreVersion({ scorecardId: 'rcogp-generic', fromVersion: 1, actor: 'admin', reason: 'bad change in v2' }, deps);
    expect(v3).toMatchObject({ version: 3, kind: 'restore', restoredFromVersion: 1, parentVersion: 2 });
    expect(v3.overridesHash).toBe(v1.overridesHash);
    expect(v3.configHash).toBe(v1.configHash);
    expect((await store.getVersions('rcogp-generic')).map((r) => r.version)).toEqual([1, 2, 3]);
    expect((await resolvePublished('rcogp-generic', deps)).stamp.version).toBe(3);
  });

  it('a normal restore is blocked by a freeze, an emergency rollback is not', async () => {
    await pub({ source: { [GUARANTEES]: 0.5 }, calculator: {} });
    later(1); await pub({ source: { [GUARANTEES]: 0.04 }, calculator: {} });
    await freeze(deps, { scope: 'rcogp-generic', reason: 'incident 7', actor: 'admin' });
    await expect(restoreVersion({ scorecardId: 'rcogp-generic', fromVersion: 1, actor: 'a', reason: 'undo it' }, deps)).rejects.toThrow(RulesFrozenError);
    later(1);
    const rb = await emergencyRollback({ scorecardId: 'rcogp-generic', fromVersion: 1, actor: 'a', reason: 'incident 7 rollback' }, deps);
    expect(rb).toMatchObject({ kind: 'rollback', version: 3, restoredFromVersion: 1 });
    // still frozen afterwards: ordinary publishing stays blocked
    await expect(pub()).rejects.toThrow(RulesFrozenError);
  });

  it('can roll back to the shipped configuration', async () => {
    await pub({ source: { [GUARANTEES]: 0.5 }, calculator: {} });
    later(1);
    const rb = await emergencyRollback({ scorecardId: 'rcogp-generic', fromVersion: 'shipped', actor: 'a', reason: 'back to baseline' }, deps);
    expect(rb.overrides).toEqual({ source: {}, calculator: {} });
    expect(rb.configHash).toBe(await hashEffectiveConfig(buildEffectiveConfig('rcogp-generic', { source: {}, calculator: {} })));
    expect(rb.configHash).toBe(await hashEffectiveConfig(SCORECARD_SOURCES['rcogp-generic'].shipped));
  });

  it('a rollback supersedes a still-scheduled version immediately', async () => {
    await pub({ source: { [GUARANTEES]: 0.5 }, calculator: {} });
    later(1);
    await pub({ source: { [GUARANTEES]: 0.04 }, calculator: {} }, { effectiveFrom: new Date('2026-12-01T00:00:00Z') });
    later(1);
    await emergencyRollback({ scorecardId: 'rcogp-generic', fromVersion: 1, actor: 'a', reason: 'cancel scheduled change' }, deps);
    expect((await resolvePublished('rcogp-generic', deps)).stamp.version).toBe(3);
    // even after the scheduled date passes, the higher-numbered rollback stays in force
    expect((await resolvePublished('rcogp-generic', deps, { at: new Date('2027-01-01T00:00:00Z') })).stamp.version).toBe(3);
  });

  it('never weakens verification: rollback on a tampered chain is refused', async () => {
    await pub({ source: { [GUARANTEES]: 0.5 }, calculator: {} });
    later(1); await pub({ source: { [GUARANTEES]: 0.04 }, calculator: {} });
    store.versions.get('rcogp-generic')![0].overrides.source[GUARANTEES] = 0.9;
    await expect(emergencyRollback({ scorecardId: 'rcogp-generic', fromVersion: 1, actor: 'a', reason: 'try anyway' }, deps)).rejects.toThrow(RulesIntegrityError);
    expect(await store.getVersions('rcogp-generic')).toHaveLength(2);
  });

  it('needs a reason, an existing version and a known scorecard', async () => {
    await pub();
    await expect(restoreVersion({ scorecardId: 'rcogp-generic', fromVersion: 1, actor: 'a', reason: '' }, deps)).rejects.toThrow(/reason/);
    await expect(restoreVersion({ scorecardId: 'rcogp-generic', fromVersion: 9, actor: 'a', reason: 'no such version' }, deps)).rejects.toThrow(/does not exist/);
    await expect(restoreVersion({ scorecardId: 'bogus', fromVersion: 1, actor: 'a', reason: 'unknown card' }, deps)).rejects.toThrow(PublishRejectedError);
    await expect(freeze(deps, { scope: 'rcogp-generic', reason: '', actor: 'a' })).rejects.toThrow(/reason/);
  });

  it('unfreezing re-enables publishing', async () => {
    await freeze(deps, { scope: 'rcogp-generic', reason: 'maintenance', actor: 'a' });
    await expect(pub()).rejects.toThrow(RulesFrozenError);
    await unfreeze(deps, { scope: 'rcogp-generic', reason: 'done maintaining', actor: 'a' });
    await expect(pub()).resolves.toMatchObject({ version: 1 });
  });
});

describe('rules ledger - pins, periods and compatibility', () => {
  const later = (h: number) => { clock = new Date(clock.getTime() + h * 3_600_000); };

  it('an explicit version pin is served exactly, flagged pinned, and never moved by publish / freeze / rollback', async () => {
    await pub({ source: { [GUARANTEES]: 0.5 }, calculator: {} });
    later(1); await pub({ source: { [GUARANTEES]: 0.04 }, calculator: {} });
    const pin1 = await resolvePublished('rcogp-generic', deps, { version: 1 });
    expect(pin1.stamp).toMatchObject({ version: 1, pinned: true, frozen: false });
    expect(pin1.overrides.source[GUARANTEES]).toBe(0.5);

    later(1);
    await freeze(deps, { scope: 'rcogp-generic', reason: 'freeze on v2', actor: 'a' });
    await emergencyRollback({ scorecardId: 'rcogp-generic', fromVersion: 'shipped', actor: 'a', reason: 'back to baseline' }, deps);
    const again = await resolvePublished('rcogp-generic', deps, { version: 1 });
    expect(again.stamp).toEqual(pin1.stamp);
    expect(again.overrides).toEqual(pin1.overrides);
  });

  it('pin 0 serves the shipped rules; an unknown pinned version is not found, never substituted', async () => {
    await pub();
    expect((await resolvePublished('rcogp-generic', deps, { version: 0 })).stamp).toMatchObject({ version: 0, pinned: true });
    await expect(resolvePublished('rcogp-generic', deps, { version: 7 })).rejects.toThrow(RulesNotFoundError);
  });

  it('periodEnd resolves the version in force at the end of that UTC day', async () => {
    await pub({ source: { [GUARANTEES]: 0.5 }, calculator: {} });                       // 2 Nov 10:00
    later(24 * 5); await pub({ source: { [GUARANTEES]: 0.04 }, calculator: {} });       // 7 Nov 10:00
    expect((await resolvePublished('rcogp-generic', deps, { periodEnd: '2026-11-01' })).stamp.version).toBe(0);
    expect((await resolvePublished('rcogp-generic', deps, { periodEnd: '2026-11-02' })).stamp.version).toBe(1);
    expect((await resolvePublished('rcogp-generic', deps, { periodEnd: '2026-11-06' })).stamp.version).toBe(1);
    expect((await resolvePublished('rcogp-generic', deps, { periodEnd: '2026-11-07' })).stamp.version).toBe(2);
    await expect(resolvePublished('rcogp-generic', deps, { periodEnd: 'yesterday' })).rejects.toThrow(/YYYY-MM-DD/);
  });

  it('refuses a version signed against a different rule registry (build incompatibility)', async () => {
    await pub();
    const { sealVersion } = await import('../ledger.js');
    const rec = store.versions.get('rcogp-generic')![0];
    const { payloadHash: _p, chainHash: _c, keyId: _k, signature: _s, ...payload } = rec;
    store.versions.set('rcogp-generic', [sealVersion({ ...payload, registryHash: 'a'.repeat(64) }, deps.signer!)]);
    await expect(resolvePublished('rcogp-generic', deps)).rejects.toThrow(RulesIncompatibleError);
    await expect(resolvePublished('rcogp-generic', deps, { version: 1 })).rejects.toThrow(RulesIncompatibleError);
    await expect(restoreVersion({ scorecardId: 'rcogp-generic', fromVersion: 1, actor: 'a', reason: 'restore it' }, deps)).rejects.toThrow(RulesIncompatibleError);
  });

  it('records authors, approvers, announcement and build on the signed version', async () => {
    const v = await pub(undefined, { authors: ['u-author'], approvers: ['u-approver'], announcement: 'Guarantees now count at 50%.' });
    expect(v).toMatchObject({ authors: ['u-author'], approvers: ['u-approver'], announcement: 'Guarantees now count at 50%.', buildId: 'test-build' });
    expect(v.registryHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
