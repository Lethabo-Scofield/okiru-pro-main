/**
 * REAL MongoDB integration tests for the rules ledger and Studio stores.
 *
 * Skipped unless RULES_TEST_MONGO_URI is set. It connects with a unique scratch database name
 * (`rules_studio_test_<random>`) - never the application database - writes only synthetic data,
 * and drops that scratch database afterwards. Run:
 *
 *   RULES_TEST_MONGO_URI="<mongodb connection string>" npx vitest run src/rules/__tests__/mongo.integration.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { generateKeyPairSync, randomBytes } from 'crypto';
import mongoose from 'mongoose';

const URI = process.env.RULES_TEST_MONGO_URI;
const SCRATCH = `rules_studio_test_${randomBytes(6).toString('hex')}`;

vi.mock('../../../db.js', () => ({ isMongoConnected: () => mongoose.connection.readyState === 1 }));
vi.mock('../../logger.js', () => ({ createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }) }));

const G = 'benefitFactors[contributionType=guarantees].sdFactor';
const { privateKey, publicKey } = generateKeyPairSync('ed25519');

describe.skipIf(!URI)('rules ledger on a real MongoDB', () => {
  let rules: any; let studioStore: any; let svc: any; let signing: any; let audit: any; let stepUp: any; let perms: any; let snaps: any;
  let deps: any;

  beforeAll(async () => {
    if (!SCRATCH.startsWith('rules_studio_test_')) throw new Error('refusing to run outside a scratch database');
    await mongoose.connect(URI!, { dbName: SCRATCH, serverSelectionTimeoutMS: 15000 });
    expect(mongoose.connection.db?.databaseName).toBe(SCRATCH);
    rules = await import('../mongoStore.js');
    studioStore = await import('../studio/mongoStudioStore.js');
    svc = await import('../rulesService.js');
    signing = await import('../signing.js');
    audit = await import('../studio/audit.js');
    stepUp = await import('../studio/stepUp.js');
    perms = await import('../studio/permissions.js');
    snaps = await import('../studio/snapshots.js');
    // make sure the unique indexes exist before the race tests
    await rules.RulesVersionModel.init(); await rules.RuleFreezeModel.init();
    deps = {
      store: new rules.MongoRulesStore(),
      signer: signing.createSigner('k1', privateKey.export({ type: 'pkcs8', format: 'pem' }) as string),
      verifier: signing.createVerifier({ k1: publicKey.export({ type: 'spki', format: 'pem' }) as string }),
      buildId: 'mongo-it',
    };
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState === 1 && mongoose.connection.db?.databaseName === SCRATCH) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('round-trips a signed version whose override keys contain dots, brackets and equals signs, and the chain still verifies', async () => {
    const v1 = await svc.publishVersion({ scorecardId: 'rcogp-generic', overrides: { source: { [G]: 0.5, 'targets.ownership.votingRightsTarget': 0.3 }, calculator: {} }, publishedBy: 'it' }, deps);
    const stored = await deps.store.getVersions('rcogp-generic');
    expect(stored).toHaveLength(1);
    expect(stored[0].overrides.source[G]).toBe(0.5);
    expect(stored[0].overrides.source['targets.ownership.votingRightsTarget']).toBe(0.3);
    expect(stored[0].chainHash).toBe(v1.chainHash);
    const served = await svc.resolvePublished('rcogp-generic', deps);
    expect(served.stamp).toMatchObject({ version: 1, buildId: 'mongo-it' });
  });

  it('concurrent publishes never produce a duplicate or a gap: the unique index serialises them', async () => {
    const attempt = (v: number) => svc.publishVersion({ scorecardId: 'ict-generic', overrides: { source: { [G]: v }, calculator: {} }, publishedBy: 'it' }, deps);
    const results = await Promise.allSettled([attempt(0.4), attempt(0.5), attempt(0.6), attempt(0.7)]);
    const won = results.filter((r) => r.status === 'fulfilled').length;
    expect(won).toBeGreaterThanOrEqual(1);
    for (const r of results.filter((x) => x.status === 'rejected') as PromiseRejectedResult[]) expect(r.reason.code).toBe('VERSION_CONFLICT');
    const stored = await deps.store.getVersions('ict-generic');
    expect(stored.map((v: any) => v.version)).toEqual(Array.from({ length: won }, (_, i) => i + 1)); // 1..n, no duplicate, no gap
    expect((await svc.resolvePublished('ict-generic', deps)).headVersion).toBe(won);
  });

  it('the unique (scorecardId, version) index exists in the real database and rejects a duplicate insert', async () => {
    const idx = await mongoose.connection.db!.collection('rules_versions').indexes();
    expect(idx.some((i: any) => i.unique && JSON.stringify(i.key) === JSON.stringify({ scorecardId: 1, version: 1 }))).toBe(true);
    const [first] = await deps.store.getVersions('ict-generic');
    await expect(deps.store.appendVersion({ ...first }, 0)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  });

  it('rules_versions refuses update and delete through every Mongoose path', async () => {
    const M = rules.RulesVersionModel;
    await expect(M.updateOne({ scorecardId: 'rcogp-generic' }, { $set: { publishedBy: 'attacker' } })).rejects.toThrow(/append-only/);
    await expect(M.deleteOne({ scorecardId: 'rcogp-generic' })).rejects.toThrow(/append-only/);
    await expect(M.deleteMany({})).rejects.toThrow(/append-only/);
    await expect(M.findOneAndUpdate({ scorecardId: 'rcogp-generic' }, { publishedBy: 'x' })).rejects.toThrow(/append-only/);
    await expect(M.replaceOne({ scorecardId: 'rcogp-generic' }, { scorecardId: 'rcogp-generic' })).rejects.toThrow(/append-only/);
    const doc = await M.findOne({ scorecardId: 'rcogp-generic' });
    doc.publishedBy = 'attacker';
    await expect(doc.save()).rejects.toThrow(/append-only/);
    expect((await deps.store.getVersions('rcogp-generic'))[0].publishedBy).toBe('it');
  });

  it('a change made behind the application (raw driver) is caught by signature verification', async () => {
    await mongoose.connection.db!.collection('rules_versions').updateOne({ scorecardId: 'rcogp-generic', version: 1 }, { $set: { [`overrides.source.${G.replace(/\./g, '．')}`]: 1 } });
    await mongoose.connection.db!.collection('rules_versions').updateOne({ scorecardId: 'rcogp-generic', version: 1 }, { $set: { publishedBy: 'tampered' } });
    await expect(svc.resolvePublished('rcogp-generic', deps)).rejects.toThrow(/RULES_INTEGRITY_FAILURE|failed verification/);
  });

  it('freeze events persist in order and drive pinned / frozen reads', async () => {
    await svc.publishVersion({ scorecardId: 'agri-generic', overrides: { source: { [G]: 0.5 }, calculator: {} }, publishedBy: 'it' }, deps);
    await svc.freeze(deps, { scope: 'agri-generic', reason: 'integration test', actor: 'it', serveVersion: 0 });
    expect((await svc.resolvePublished('agri-generic', deps)).stamp).toMatchObject({ version: 0, frozen: true });
    await svc.unfreeze(deps, { scope: 'agri-generic', reason: 'integration done', actor: 'it' });
    expect((await svc.resolvePublished('agri-generic', deps)).stamp).toMatchObject({ version: 1, frozen: false });
    const events = await deps.store.getFreezeEvents();
    expect(events.map((e: any) => e.action)).toEqual(['freeze', 'unfreeze']);
    await expect(rules.RuleFreezeModel.deleteOne({})).rejects.toThrow(/append-only/);
  });

  it('studio store: insert, duplicate id, optimistic replace, stale write, filters, append-only collections', async () => {
    const store = new studioStore.MongoStudioStore();
    const col = store.collection('ruleChangesets');
    await col.insert({ id: 'cs1', rev: 1, scorecardId: 'rcogp-generic', status: 'draft', items: [{ a: 1 }] });
    await expect(col.insert({ id: 'cs1', rev: 1 })).rejects.toThrow(/already exists/);
    const a = await col.get('cs1');
    const saved = await col.replace({ ...a, status: 'submitted' }, a.rev);
    expect(saved.rev).toBe(2);
    await expect(col.replace({ ...a, status: 'approved' }, a.rev)).rejects.toThrow(/changed by someone else/);
    expect((await col.find({ status: 'submitted' })).map((d: any) => d.id)).toEqual(['cs1']);
    expect(await col.find({ status: 'draft' })).toEqual([]);

    const approvals = store.collection('ruleApprovals');
    await approvals.insert({ id: 'ap1', rev: 1, decision: 'approve' });
    await expect(approvals.replace({ id: 'ap1', rev: 1, decision: 'reject' }, 1)).rejects.toThrow(/append-only/);
    await expect(mongoose.models.Studio_ruleApprovals.deleteOne({ _id: 'ap1' })).rejects.toThrow(/append-only/);
  });

  it('audit chain written to Mongo verifies, and survives concurrent appends without gaps', async () => {
    const store = new studioStore.MongoStudioStore();
    const signer = deps.signer;
    await Promise.all(Array.from({ length: 6 }, (_, i) => audit.appendAudit(store, signer, { actor: 'it', action: `a${i}`, now: new Date() })));
    const r = await audit.verifyAudit(store, deps.verifier);
    expect(r).toMatchObject({ ok: true, events: 6, unsigned: 0 });
  });

  it('step-up and grants against Mongo: enrol, challenge, single-use token', async () => {
    const store = new studioStore.MongoStudioStore();
    const env = { RULES_TOTP_ENC_KEY: randomBytes(32).toString('base64') } as NodeJS.ProcessEnv;
    await perms.createGrant(store, { userId: 'u1', role: 'expert_approver', scorecards: ['*'], createdBy: 'root', now: new Date() });
    await expect(perms.authorize(store, 'u1', 'publish', 'rcogp-generic', {} as NodeJS.ProcessEnv)).resolves.toBeTruthy();
    const t0 = new Date();
    const { secret } = await stepUp.enrollTotp(store, 'u1', t0, env);
    await stepUp.confirmTotp(store, 'u1', stepUp.totpAt(secret, Math.floor(t0.getTime() / 30_000)), t0, env);
    const t1 = new Date(t0.getTime() + 31_000);
    const binding = stepUp.bindingHashOf('publish', 'cs', 'h', 1, 'immediate');
    const { challengeId } = await stepUp.startStepUp(store, { userId: 'u1', action: 'publish', bindingHash: binding, now: t1, newId: () => randomBytes(8).toString('hex') }, env);
    const { token } = await stepUp.verifyStepUp(store, { userId: 'u1', challengeId, code: stepUp.totpAt(secret, Math.floor(t1.getTime() / 30_000)), now: t1 }, env);
    const results = await Promise.allSettled([1, 2].map(() => stepUp.consumeStepUp(store, { userId: 'u1', token, action: 'publish', bindingHash: binding, now: t1 })));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('snapshot documents persist with their signature (off-site is simulated here)', async () => {
    const store = new studioStore.MongoStudioStore();
    const mem = new Map<string, string>();
    const offsite = { describe: () => 'mem', put: async (k: string, d: string) => { mem.set(k, d); }, get: async (k: string) => mem.get(k) ?? null };
    const snap = await snaps.takeSnapshot({ studio: store, rules: deps.store, signer: deps.signer, verifier: deps.verifier, offsite, buildId: 'mongo-it', now: () => new Date(), alarm: () => {} }, { kind: 'nightly', scorecardId: null, actor: 'it' });
    const back = await store.collection('ruleSnapshots').get(snap.id);
    expect(back.contentHash).toBe(snap.contentHash);
    expect(back.content.length).toBeGreaterThan(100);
    expect(deps.verifier.verify(back.content, back.signature, back.keyId)).toBe(true);
  });

  it('client ruleset pins read and write on the real Client collection', async () => {
    const { createMongoClientPinStore, pinRuleset } = await import('../pins.js');
    const { ClientModel } = await import('../../../models.js');
    await ClientModel.deleteMany({ name: /^IT scratch client/ }).catch(() => {});
    const c: any = await ClientModel.create({ name: 'IT scratch client', financialYear: '2026', organizationId: 'it-org' });
    const pins = await createMongoClientPinStore();
    const studio = new studioStore.MongoStudioStore();
    const out = await pinRuleset({ rules: deps, studio, pins, now: () => new Date() }, { clientId: c.id, scorecardId: 'rcogp-generic', version: 0, actor: 'it' });
    expect(out['rcogp-generic'].version).toBe(0);
    const reread: any = await ClientModel.findOne({ id: c.id }).lean();
    expect(reread.rulesetPins['rcogp-generic']).toMatchObject({ version: 0, pinnedBy: 'it' });
  }, 90_000);
});
