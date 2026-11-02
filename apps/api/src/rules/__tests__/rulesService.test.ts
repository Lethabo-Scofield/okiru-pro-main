import { describe, it, expect, beforeEach } from 'vitest';
import { generateKeyPairSync } from 'crypto';
import { createSigner, createVerifier, SigningUnavailableError } from '../signing.js';
import {
  publishVersion, resolvePublished, resolveHeads, loadVerifiedHistory,
  RulesIntegrityError, RulesFrozenError, PublishRejectedError, type ServiceDeps,
} from '../rulesService.js';
import { VersionConflictError } from '../store.js';
import { verifyChain, canonicalJson, sha256 } from '../ledger.js';
import { MemoryRulesStore } from './memoryStore.js';
import { buildEffectiveConfig } from '../../../../web/Toolkit/src/lib/rules/buildEffectiveConfig';
import { SCORECARD_SOURCES } from '../../../../web/Toolkit/src/lib/rules/scorecards';

const GUARANTEES = 'benefitFactors[contributionType=guarantees].sdFactor';
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

  it('hashes the config it will actually serve (guarantees 0.03 -> 0.5 changes it)', async () => {
    const v1 = await pub();
    const shippedHash = sha256(canonicalJson(SCORECARD_SOURCES['rcogp-generic'].shipped));
    expect(v1.configHash).not.toBe(shippedHash);
    const cfg = buildEffectiveConfig('rcogp-generic', v1.overrides);
    const guarantee = (cfg as unknown as { benefitFactors: { type: string; factor: number }[] }).benefitFactors.find((b) => b.type === 'guarantees');
    expect(guarantee?.factor).toBe(0.5);
  });

  it('links versions into a chain and serves the latest', async () => {
    const v1 = await pub();
    clock = new Date('2026-11-02T11:00:00.000Z');
    const v2 = await pub({ source: { [GUARANTEES]: 0.04 }, calculator: {} });
    expect(v2.parentVersion).toBe(1);
    expect(v2.prevChainHash).toBe(v1.chainHash);
    const p = await resolvePublished('rcogp-generic', deps);
    expect(p.stamp?.version).toBe(2);
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
  it('blocks publishing when frozen in storage or by environment, but keeps serving', async () => {
    await pub();
    await store.setFreezeState({ frozen: true, reason: 'incident 42', by: 'admin', at: clock.toISOString() });
    await expect(pub()).rejects.toThrow(RulesFrozenError);
    expect((await resolvePublished('rcogp-generic', deps)).stamp?.version).toBe(1);

    await store.setFreezeState({ frozen: false, reason: null, by: null, at: null });
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

    expect((await resolvePublished('rcogp-generic', deps)).stamp?.version).toBe(1);
    expect((await resolvePublished('rcogp-generic', deps)).headVersion).toBe(2);
    expect((await resolvePublished('rcogp-generic', deps, new Date('2026-11-10T00:00:01Z'))).stamp?.version).toBe(2);
  });

  it('reports no stamp for a scorecard that was never published (clients use shipped rules)', async () => {
    const p = await resolvePublished('fsc-banks', deps);
    expect(p.stamp).toBeNull();
    expect(p.overrides).toBeNull();
  });

  it('lists a head for each of the nine scorecards', async () => {
    await pub();
    const heads = await resolveHeads(deps);
    expect(heads).toHaveLength(9);
    expect(heads.find((h) => h.scorecardId === 'rcogp-generic')?.activeVersion).toBe(1);
    expect(heads.find((h) => h.scorecardId === 'ict-qse')?.activeVersion).toBeNull();
  });
});
