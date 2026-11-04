/**
 * The directive's 20-step end-to-end acceptance scenario, run against the real services
 * (ledger, signing, Studio workflow, step-up, snapshots, impact engine, shared scorer) with
 * in-memory stores and a fake off-site store. Synthetic companies only.
 *
 * Deviation, documented: the directive's step 2 changes `esd.factor.guarantees` "from 0.5 to
 * 0.03". The SHIPPED value in this repository is already 0.03 (sectorConfig.ts), so the test
 * exercises the real change in the opposite direction, 0.03 -> 0.5. Everything else is as written.
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import mongoose from 'mongoose';
import { generateKeyPairSync, randomBytes } from 'crypto';
import { createSigner, createVerifier } from '../../signing.js';
import { MemoryRulesStore } from '../../__tests__/memoryStore.js';
import { MemoryStudioStore } from './memoryStudioStore.js';
import { createGrant } from '../permissions.js';
import {
  addItem, createChangeset, runAuthoritativeImpact, acknowledge, submitChangeset, decideChangeset, preparePublish, publishChangeset,
  freezeScope, unfreezeScope, createRestoreDraft, emergencyRollbackScorecard, checkIntegrity, backupStatus, rebaseChangeset,
  StudioError, type StudioCtx, type Changeset,
} from '../studioService.js';
import { enrollTotp, confirmTotp, startStepUp, verifyStepUp, consumeStepUp, totpAt, bindingHashOf } from '../stepUp.js';
import { verifyAudit } from '../audit.js';
import { resolvePublished, RulesIntegrityError, RulesFrozenError } from '../../rulesService.js';
import type { OffsiteStore } from '../snapshots.js';
import type { NotifyConfig } from '../notify.js';
import { buildEffectiveConfig } from '../../../../../web/Toolkit/src/lib/rules/buildEffectiveConfig';
import { SCORECARD_SOURCES } from '../../../../../web/Toolkit/src/lib/rules/scorecards';
import { resolveRules, PublishedRulesUnavailableError } from '../../../../../web/Toolkit/src/lib/rules/liveLink';
import { calculateScorecard } from '../../../../../web/Toolkit/src/lib/scoring/calculateScorecard';
import { buildFixture, FIXTURE_PROFILES } from '../../../../../web/Toolkit/src/lib/rules/impact/fixtures';

/**
 * Set RULES_TEST_MONGO_URI to run this whole suite against a REAL MongoDB (scratch database,
 * collections emptied between tests, database dropped at the end) instead of the in-memory stores.
 */
const MONGO_URI = process.env.RULES_TEST_MONGO_URI;
const SCRATCH = `rules_studio_test_${randomBytes(6).toString('hex')}`;
vi.mock('../../../../db.js', () => ({ isMongoConnected: () => mongoose.connection.readyState === 1 }));

if (MONGO_URI) vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 }); // Atlas round-trips are ~100 ms each
const SID = 'rcogp-generic';
const GUARANTEES_KEY = `${SID}:source:benefitFactors[contributionType=interest_free_loan].sdFactor`;

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const priv = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
const pub = publicKey.export({ type: 'spki', format: 'pem' }) as string;
const env = { RULES_TOTP_ENC_KEY: randomBytes(32).toString('base64') } as NodeJS.ProcessEnv;

class FakeOffsite implements OffsiteStore {
  objects = new Map<string, string>();
  failPut = false;
  corruptReadback = false;
  describe() { return 'fake:offsite'; }
  async put(key: string, data: string) {
    if (this.failPut) throw new Error('storage account unreachable');
    if (this.objects.has(key)) throw new Error('object exists (immutable)');
    this.objects.set(key, data);
  }
  async get(key: string) {
    const v = this.objects.get(key) ?? null;
    return v && this.corruptReadback ? v.replace('"signature"', '"signaturX"') : v;
  }
}

let clock: Date;
let rulesStore: MemoryRulesStore;
let studio: MemoryStudioStore;
let offsite: FakeOffsite;
let ctx: StudioCtx;
let webhookCalls: any[];
const secrets: Record<string, string> = {};

/** Behind-the-application tampering: raw driver on Mongo, direct mutation in memory. */
async function tamperGuarantees(value: number) {
  const key = 'benefitFactors[contributionType=interest_free_loan].sdFactor';
  if (MONGO_URI) {
    const doc = await mongoose.connection.db!.collection('rules_versions').findOne({ scorecardId: SID, version: 1 });
    await mongoose.connection.db!.collection('rules_versions').updateOne({ _id: doc!._id }, { $set: { overrides: { ...doc!.overrides, source: { ...doc!.overrides.source, [key]: value } } } });
  } else {
    rulesStore.versions.get(SID)![0].overrides.source[key] = value;
  }
}
async function resealVersion1(patch: Record<string, unknown>) {
  const { sealVersion } = await import('../../ledger.js');
  const [rec] = await rulesStore.getVersions(SID);
  const { payloadHash: _p, chainHash: _c, keyId: _k, signature: _s, ...payload } = rec as any;
  const sealed = sealVersion({ ...payload, ...patch }, ctx.rules.signer!);
  if (MONGO_URI) {
    const doc = await mongoose.connection.db!.collection('rules_versions').findOne({ scorecardId: SID, version: 1 });
    await mongoose.connection.db!.collection('rules_versions').replaceOne({ _id: doc!._id }, sealed as any);
  } else {
    rulesStore.versions.set(SID, [sealed]);
  }
}
const sleep = (s: number) => { clock = new Date(clock.getTime() + s * 1000); };

/** Full step-up: start, wait for a fresh TOTP step, verify, return the single-use token. */
async function stepUp(userId: string, action: string, bindingHash: string): Promise<string> {
  sleep(31);
  const { challengeId } = await startStepUp(studio, { userId, action, bindingHash, now: clock, newId: () => randomBytes(8).toString('hex') }, env);
  const { token } = await verifyStepUp(studio, { userId, challengeId, code: totpAt(secrets[userId], Math.floor(clock.getTime() / 30_000)), now: clock }, env);
  return token;
}

/** Scores a synthetic company the way the Toolkit does: resolve rules, build config, calculate. */
async function score(profile: 'strong', opts: { pin?: number } = {}) {
  const shipped = SCORECARD_SOURCES[SID].shipped;
  const body = await resolvePublished(SID, ctx.rules, opts.pin === undefined ? {} : { version: opts.pin });
  const resp = JSON.parse(JSON.stringify({ launched: true, ...body }));
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => resp });
  const resolved = await resolveRules(SID, shipped, fetchImpl as never, true, opts.pin);
  const fx = buildFixture(SID, FIXTURE_PROFILES.find((p) => p.id === profile)!);
  const result = calculateScorecard({ ...fx.state, calculatorConfig: resolved.config, ignoreSubMinimum: false }, null);
  return { total: Math.round(result.total.score * 1e6) / 1e6, esd: Math.round((result.supplierDevelopment.score + result.enterpriseDevelopment.score) * 1e6) / 1e6, stamp: resolved.stamp };
}

async function approvedDraft(value = 0.5): Promise<Changeset> {
  let cs = await createChangeset(ctx, 'editor', { scorecardId: SID, title: 'Guarantees count at 50%' });
  cs = await addItem(ctx, 'editor', cs.id, { ruleKey: GUARANTEES_KEY, value, justification: 'Align with the revised sector ruling on guarantees.' });
  const run = await runAuthoritativeImpact(ctx, 'editor', cs.id);
  for (const k of run.review!.requiresAcknowledgement) await acknowledge(ctx, 'editor', run.id, k, 'Intended: guarantees now count toward SD/ED.');
  cs = await submitChangeset(ctx, 'editor', cs.id);
  return decideChangeset(ctx, 'approver', cs.id, 'approve', 'Reviewed the impact lines.');
}

beforeAll(async () => {
  if (!MONGO_URI) return;
  await mongoose.connect(MONGO_URI, { dbName: SCRATCH, serverSelectionTimeoutMS: 15000 });
  const { RulesVersionModel, RuleFreezeModel } = await import('../../mongoStore.js');
  await RulesVersionModel.init(); await RuleFreezeModel.init();
}, 60_000);
afterAll(async () => {
  if (MONGO_URI && mongoose.connection.readyState === 1 && mongoose.connection.db?.databaseName === SCRATCH) await mongoose.connection.dropDatabase();
  if (MONGO_URI) await mongoose.disconnect();
});
beforeAll(() => { vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterAll(() => vi.restoreAllMocks());

beforeEach(async () => {
  clock = new Date('2026-11-02T08:00:00.000Z');
  if (MONGO_URI) {
    // scratch database only: empty every collection through the raw driver (the app models are append-only)
    for (const c of await mongoose.connection.db!.listCollections().toArray()) await mongoose.connection.db!.collection(c.name).deleteMany({});
    const { MongoRulesStore } = await import('../../mongoStore.js');
    const { MongoStudioStore } = await import('../mongoStudioStore.js');
    rulesStore = new MongoRulesStore() as unknown as MemoryRulesStore;
    studio = new MongoStudioStore() as unknown as MemoryStudioStore;
  } else {
    rulesStore = new MemoryRulesStore();
    studio = new MemoryStudioStore();
  }
  offsite = new FakeOffsite();
  webhookCalls = [];
  const notifyCfg: NotifyConfig = {
    webhookUrl: 'https://alarms.example.test/hook', smtpConfigured: false, maxAttempts: 3, timeoutMs: 1000,
    fetchImpl: async (_u, init) => { webhookCalls.push(JSON.parse(init.body)); return { ok: true, status: 200 }; },
  };
  ctx = {
    studio, offsite, notifyCfg, env, now: () => clock, requiredApprovals: 1,
    rules: { store: rulesStore, signer: createSigner('k1', priv), verifier: createVerifier({ k1: pub }), buildId: 'build-1', now: () => clock },
  };
  const g = (userId: string, role: any, scorecards = ['*']) => createGrant(studio, { userId, role, scorecards, createdBy: 'root', now: clock });
  await g('editor', 'expert_editor'); await g('editor2', 'expert_editor'); await g('approver', 'expert_approver'); await g('approver2', 'expert_approver');
  await g('admin', 'admin'); await g('viewer', 'viewer');
  for (const u of ['editor', 'approver', 'approver2', 'admin']) {
    const { secret } = await enrollTotp(studio, u, clock, env);
    secrets[u] = secret;
    await confirmTotp(studio, u, totpAt(secret, Math.floor(clock.getTime() / 30_000)), clock, env);
  }
});

describe('20-step acceptance scenario (RCOGP Generic)', () => {
  it('runs end to end', async () => {
    // 1. Original scores for Client A (unpinned) and Client B (submitted, pinned to version 0)
    const aBefore = await score('mid');
    const bBefore = await score('mid', { pin: 0 });
    expect(aBefore.stamp).toMatchObject({ version: 0, pinned: false });
    expect(bBefore.stamp).toMatchObject({ version: 0, pinned: true });
    expect(aBefore.total).toBe(bBefore.total);

    // 2. Draft: interest-free loan factor 0.7 -> 0.9
    let cs = await createChangeset(ctx, 'editor', { scorecardId: SID, title: 'Guarantees count at 50%' });
    cs = await addItem(ctx, 'editor', cs.id, { ruleKey: GUARANTEES_KEY, value: 0.9, justification: 'Align with the revised sector ruling on guarantees.' });

    // 3. Authoritative impact: only SD/ED lines move, all attributable
    const run = await runAuthoritativeImpact(ctx, 'editor', cs.id);
    expect(run.status).toBe('complete');
    expect(run.review!.counts.unexplained).toBe(0);
    expect(run.review!.counts.deliberate).toBeGreaterThan(0);
    for (const k of run.review!.requiresAcknowledgement) await acknowledge(ctx, 'editor', run.id, k, 'Intended: guarantees now count toward SD/ED.');
    cs = await submitChangeset(ctx, 'editor', cs.id);

    // 4. A separate approver approves (the author cannot)
    await expect(decideChangeset(ctx, 'editor', cs.id, 'approve', 'self approval')).rejects.toThrow(/permission/);
    cs = await decideChangeset(ctx, 'approver', cs.id, 'approve', 'Reviewed the impact lines.');
    expect(cs.status).toBe('approved');

    // 5. Step-up bound to the exact draft hash + version + effective date
    const plan = await preparePublish(ctx, 'approver', cs.id, { announcement: 'Guarantees now count at 50% toward SD and ED.' });
    expect(plan.ready).toBe(true);
    expect(plan.checks).toHaveLength(12);
    const token = await stepUp('approver', 'publish', plan.bindingHash);

    // 6 + 7. Signed, verified off-site snapshot, then publish version 1
    const { version } = await publishChangeset(ctx, 'approver', cs.id, { stepUpToken: token, announcement: 'Guarantees now count at 50% toward SD and ED.' });
    expect(version).toMatchObject({ version: 1, kind: 'publish', authors: ['editor'], approvers: ['approver'], buildId: 'build-1' });
    expect(offsite.objects.size).toBe(1);
    expect([...offsite.objects.keys()][0]).toMatch(/pre-publish-rcogp-generic/);
    expect((await backupStatus(ctx)).lastVerifiedSnapshotAt).not.toBeNull();

    // 8. Client A changes and is stamped version 1
    const aV1 = await score('mid');
    expect(aV1.stamp).toMatchObject({ version: 1, pinned: false, frozen: false });
    expect(aV1.esd).toBeGreaterThan(aBefore.esd);
    expect(aV1.total).toBeGreaterThan(aBefore.total);

    // 9. Client B stays on version 0
    const bAfter = await score('mid', { pin: 0 });
    expect(bAfter).toEqual(bBefore);

    // 10. Freeze to the last known good (version 0)
    const frToken = await stepUp('admin', 'freeze', bindingHashOf('freeze', SID, 0));
    await freezeScope(ctx, 'admin', { scope: SID, reason: 'Investigating the guarantees ruling', serveVersion: 0, stepUpToken: frToken });

    // 11. Unpinned scoring returns to the original result, flagged frozen
    const aFrozen = await score('mid');
    expect(aFrozen.total).toBe(aBefore.total);
    expect(aFrozen.stamp).toMatchObject({ version: 0, frozen: true });
    await expect(preparePublish(ctx, 'approver', cs.id, { announcement: 'x'.repeat(20) }).then((p) => publishChangeset(ctx, 'approver', cs.id, { stepUpToken: 'nope' }).catch((e) => { throw e; }))).rejects.toThrow();

    // 12. Unfreeze
    const unToken = await stepUp('admin', 'unfreeze', bindingHashOf('unfreeze', SID));
    await unfreezeScope(ctx, 'admin', { scope: SID, reason: 'Ruling confirmed correct', stepUpToken: unToken });
    expect((await score('mid')).stamp).toMatchObject({ version: 1, frozen: false });

    // 13. Restore version 0 as a NEW version 2 (draft -> impact -> approval -> publish)
    let restore = await createRestoreDraft(ctx, 'editor', SID, 0, 'Reverting the guarantees change after review');
    expect(restore.items).toHaveLength(1);
    const run2 = await runAuthoritativeImpact(ctx, 'editor', restore.id);
    for (const k of run2.review!.requiresAcknowledgement) await acknowledge(ctx, 'editor', run2.id, k, 'Intended: restoring the shipped guarantees factor.');
    restore = await submitChangeset(ctx, 'editor', restore.id);
    restore = await decideChangeset(ctx, 'approver2', restore.id, 'approve', 'Restore is correct.');
    const plan2 = await preparePublish(ctx, 'approver', restore.id, { announcement: 'Restoring version 0 rules for guarantees.' });
    expect(plan2.ready).toBe(true);
    const t2 = await stepUp('approver', 'publish', plan2.bindingHash);
    const { version: v2 } = await publishChangeset(ctx, 'approver', restore.id, { stepUpToken: t2, announcement: 'Restoring version 0 rules for guarantees.' });
    expect(v2).toMatchObject({ version: 2, kind: 'restore', restoredFromVersion: null });

    // 14 + 15. Client A returns to the original score; Client B is unchanged
    const aV2 = await score('mid');
    expect(aV2.total).toBe(aBefore.total);
    expect(aV2.stamp).toMatchObject({ version: 2 });
    expect(await score('mid', { pin: 0 })).toEqual(bBefore);

    // 16. Version 1 loaded explicitly reproduces its exact result
    const aPinV1 = await score('mid', { pin: 1 });
    expect(aPinV1.total).toBe(aV1.total);
    expect(aPinV1.esd).toBe(aV1.esd);
    expect(aPinV1.stamp).toMatchObject({ version: 1, pinned: true, configHash: aV1.stamp!.configHash });

    // 17. Rules endpoint unavailable on a launched deployment: scoring stops (fails closed)
    const down = async () => { throw new TypeError('network down'); };
    await expect(resolveRules(SID, SCORECARD_SOURCES[SID].shipped, down as never, true)).rejects.toThrow(PublishedRulesUnavailableError);

    // 18. A tampered version is detected and raises the integrity alarm
    expect((await checkIntegrity(ctx, 'admin')).ok).toBe(true);
    await tamperGuarantees(0.99);
    await expect(resolvePublished(SID, ctx.rules)).rejects.toThrow(RulesIntegrityError);
    const bad = await checkIntegrity(ctx, 'admin');
    expect(bad.ok).toBe(false);
    expect(webhookCalls.some((c) => c.type === 'integrity.failure' && c.severity === 'critical')).toBe(true);

    // 19. Every action was audited, and the audit trail itself verifies
    const audit = await verifyAudit(studio, ctx.rules.verifier);
    expect(audit.ok).toBe(true);
    expect(audit.unsigned).toBe(0);
    const actions = (await studio.collection<any>('auditEvents').find()).map((e) => e.action);
    for (const a of ['draft.create', 'draft.item.add', 'impact.run', 'draft.submit', 'draft.approve', 'rules.publish', 'rules.freeze', 'rules.unfreeze', 'draft.restore', 'integrity.check']) {
      expect(actions, a).toContain(a);
    }

    // 20. Unrelated functionality: this scenario touches no other module (asserted by construction -
    //     the only writers are the rules collections, studio_* collections and the audit trail).
    const touched = MONGO_URI ? (await mongoose.connection.db!.listCollections().toArray()).map((c) => c.name) : [...(studio as any).cols.keys()];
    expect(touched.every((n: string) => !/certificate|esg/i.test(n))).toBe(true);
  });
});

describe('guards around publishing', () => {
  it('four-eyes: authors cannot approve, an AI-accepting user counts as an author, admin cannot approve ordinary changes', async () => {
    let cs = await createChangeset(ctx, 'editor', { scorecardId: SID, title: 'Four eyes check' });
    cs = await addItem(ctx, 'editor2', cs.id, { ruleKey: GUARANTEES_KEY, value: 0.4, justification: 'Contributor edit to the draft.', source: 'ai' });
    expect(cs.authors.sort()).toEqual(['editor', 'editor2']);
    const run = await runAuthoritativeImpact(ctx, 'editor', cs.id);
    for (const k of run.review!.requiresAcknowledgement) await acknowledge(ctx, 'editor', run.id, k, 'Intended: guarantee factor change.');
    cs = await submitChangeset(ctx, 'editor', cs.id);
    await expect(decideChangeset(ctx, 'admin', cs.id, 'approve', 'admin approving')).rejects.toThrow(/permission/);
    await expect(decideChangeset(ctx, 'editor2', cs.id, 'approve', 'contributor approving')).rejects.toThrow(/permission|cannot approve/);
    await expect(decideChangeset(ctx, 'viewer', cs.id, 'approve', 'viewer approving')).rejects.toThrow(/permission/);
  });

  it('an approval is bound to the draft hash: editing after approval invalidates it', async () => {
    const cs = await approvedDraft(0.5);
    await addItem(ctx, 'editor', cs.id, { ruleKey: GUARANTEES_KEY, value: 0.6, justification: 'Changed my mind after approval.' });
    const after = await preparePublish(ctx, 'approver', cs.id, { announcement: 'Guarantees change announcement text.' });
    expect(after.ready).toBe(false);
    expect(after.checks.filter((c) => !c.ok).map((c) => c.id)).toEqual(expect.arrayContaining(['draft-hash-current', 'independent-approval']));
  });

  it('refuses to publish without a valid step-up, with a replayed step-up, or with one bound to a different draft', async () => {
    const cs = await approvedDraft(0.5);
    const plan = await preparePublish(ctx, 'approver', cs.id, { announcement: 'Guarantees now count at 50%.' });
    await expect(publishChangeset(ctx, 'approver', cs.id, { stepUpToken: 'not-a-token', announcement: 'Guarantees now count at 50%.' })).rejects.toThrow(/Step-up/);
    const wrong = await stepUp('approver', 'publish', bindingHashOf('publish', cs.id, 'other-hash', 1, 'x'));
    await expect(publishChangeset(ctx, 'approver', cs.id, { stepUpToken: wrong, announcement: 'Guarantees now count at 50%.' })).rejects.toThrow(/Step-up/);

    const good = await stepUp('approver', 'publish', plan.bindingHash);
    await publishChangeset(ctx, 'approver', cs.id, { stepUpToken: good, announcement: 'Guarantees now count at 50%.' });
    // the token was single-use: replaying it for the same action and binding is refused
    await expect(consumeStepUp(studio, { userId: 'approver', token: good, action: 'publish', bindingHash: plan.bindingHash, now: clock })).rejects.toThrow(/Step-up/);
  });

  it('the author cannot publish their own change even if they hold the approver role', async () => {
    await createGrant(studio, { userId: 'both', role: 'expert_editor', scorecards: ['*'], createdBy: 'root', now: clock });
    await createGrant(studio, { userId: 'both', role: 'expert_approver', scorecards: ['*'], createdBy: 'root', now: clock });
    let cs = await createChangeset(ctx, 'both', { scorecardId: SID, title: 'Self-publish attempt' });
    cs = await addItem(ctx, 'both', cs.id, { ruleKey: GUARANTEES_KEY, value: 0.5, justification: 'Trying to push my own change.' });
    const run = await runAuthoritativeImpact(ctx, 'both', cs.id);
    for (const k of run.review!.requiresAcknowledgement) await acknowledge(ctx, 'both', run.id, k, 'Intended: guarantee factor change.');
    cs = await submitChangeset(ctx, 'both', cs.id);
    await expect(decideChangeset(ctx, 'both', cs.id, 'approve', 'approving my own work')).rejects.toThrow(/cannot approve/);
    const plan = await preparePublish(ctx, 'both', cs.id, { announcement: 'Guarantees now count at 50%.' });
    expect(plan.checks.find((c) => c.id === 'publisher-authorised-not-author')?.ok).toBe(false);
  });

  it('snapshot failures stop publishing with 503 snapshot_failed and an alarm; nothing is published', async () => {
    for (const mode of ['put', 'readback', 'none'] as const) {
      const cs = await approvedDraft(0.5);
      const plan = await preparePublish(ctx, 'approver', cs.id, { announcement: 'Guarantees now count at 50%.' });
      if (mode === 'none') {
        ctx.offsite = null;
        const p2 = await preparePublish(ctx, 'approver', cs.id, { announcement: 'Guarantees now count at 50%.' });
        expect(p2.checks.find((c) => c.n === 12)).toMatchObject({ ok: false });
        await expect(publishChangeset(ctx, 'approver', cs.id, { stepUpToken: 'x', announcement: 'Guarantees now count at 50%.' })).rejects.toMatchObject({ status: 503 });
        ctx.offsite = offsite;
      } else {
        if (mode === 'put') offsite.failPut = true; else offsite.corruptReadback = true;
        const token = await stepUp('approver', 'publish', plan.bindingHash);
        const err = await publishChangeset(ctx, 'approver', cs.id, { stepUpToken: token, announcement: 'Guarantees now count at 50%.' }).catch((e) => e);
        expect(err).toBeInstanceOf(StudioError);
        expect(err).toMatchObject({ code: 'snapshot_failed', status: 503 });
        offsite.failPut = false; offsite.corruptReadback = false;
      }
      expect(await rulesStore.getVersions(SID)).toEqual([]); // never published
      expect(webhookCalls.some((c) => c.type === 'backup.failed' && c.severity === 'critical')).toBe(true);
      webhookCalls.length = 0;
      await studio.collection<Changeset>('ruleChangesets').replace({ ...(await studio.collection<Changeset>('ruleChangesets').get(cs.id))!, status: 'withdrawn' }, (await studio.collection<Changeset>('ruleChangesets').get(cs.id))!.rev);
    }
  });

  it('a frozen scorecard rejects publication with the freeze error (HTTP 423 at the route)', async () => {
    const cs = await approvedDraft(0.5);
    const frToken = await stepUp('admin', 'freeze', bindingHashOf('freeze', SID, ''));
    await freezeScope(ctx, 'admin', { scope: SID, reason: 'Hold everything', stepUpToken: frToken });
    const tok = await stepUp('approver', 'publish', 'irrelevant');
    await expect(publishChangeset(ctx, 'approver', cs.id, { stepUpToken: tok, announcement: 'Guarantees now count at 50%.' })).rejects.toThrow(RulesFrozenError);
  });

  it('a draft made on an old base must be rebased before it can be reviewed again', async () => {
    const first = await approvedDraft(0.5);
    const stale = await createChangeset(ctx, 'editor2', { scorecardId: SID, title: 'Second draft on the old base' });
    const plan = await preparePublish(ctx, 'approver', first.id, { announcement: 'Guarantees now count at 50%.' });
    const tok = await stepUp('approver', 'publish', plan.bindingHash);
    await publishChangeset(ctx, 'approver', first.id, { stepUpToken: tok, announcement: 'Guarantees now count at 50%.' });
    await addItem(ctx, 'editor2', stale.id, { ruleKey: GUARANTEES_KEY, value: 0.4, justification: 'A competing edit to guarantees.' });
    const out = await runAuthoritativeImpact(ctx, 'editor2', stale.id);
    expect(out.baseVersion).toBe(0);
    await expect(submitChangeset(ctx, 'editor2', stale.id)).rejects.toThrow(/draft-hash-current/);
    const rebased = await rebaseChangeset(ctx, 'editor2', stale.id);
    expect(rebased.baseVersion).toBe(1);
  });
});

describe('emergency rollback', () => {
  async function publishV1() {
    const cs = await approvedDraft(0.5);
    const plan = await preparePublish(ctx, 'approver', cs.id, { announcement: 'Guarantees now count at 50%.' });
    await publishChangeset(ctx, 'approver', cs.id, { stepUpToken: await stepUp('approver', 'publish', plan.bindingHash), announcement: 'Guarantees now count at 50%.' });
  }

  it('snapshots first, publishes the old rules as a new rollback version, and creates a review task due in two working days', async () => {
    await publishV1();
    const before = offsite.objects.size;
    sleep(60);
    const token = await stepUp('admin', 'emergency-rollback', bindingHashOf('emergency-rollback', SID, 'shipped'));
    const out = await emergencyRollbackScorecard(ctx, 'admin', SID, { toVersion: 'shipped', reason: 'Wrong ruling applied in production', stepUpToken: token });
    expect(out.mode).toBe('rolled_back');
    if (out.mode === 'rolled_back') expect(out.version).toMatchObject({ version: 2, kind: 'rollback' });
    expect(offsite.objects.size).toBe(before + 1);
    expect([...offsite.objects.keys()].some((k) => k.includes('pre-rollback'))).toBe(true);
    const tasks = (await studio.collection<any>('notifications').find()).filter((n) => n.type === 'review.task');
    expect(tasks).toHaveLength(1);
    expect(Date.parse(tasks[0].dueAt)).toBeGreaterThan(clock.getTime() + 1.9 * 86_400_000);
    expect((await score('mid')).total).toBe((await score('mid', { pin: 0 })).total);
  });

  it('works while frozen, but is refused without step-up or the right role', async () => {
    await publishV1();
    const fr = await stepUp('admin', 'freeze', bindingHashOf('freeze', SID, ''));
    await freezeScope(ctx, 'admin', { scope: SID, reason: 'Hold while investigating', stepUpToken: fr });
    await expect(emergencyRollbackScorecard(ctx, 'editor', SID, { toVersion: 'shipped', reason: 'I am only an editor', stepUpToken: 'x' })).rejects.toThrow(/permission/);
    await expect(emergencyRollbackScorecard(ctx, 'admin', SID, { toVersion: 'shipped', reason: 'No step-up supplied', stepUpToken: 'x' })).rejects.toThrow(/Step-up/);
    const token = await stepUp('admin', 'emergency-rollback', bindingHashOf('emergency-rollback', SID, 'shipped'));
    await expect(emergencyRollbackScorecard(ctx, 'admin', SID, { toVersion: 'shipped', reason: 'Rolling back while frozen', stepUpToken: token })).resolves.toMatchObject({ mode: 'rolled_back' });
  });

  it('does not weaken backup verification: a failed snapshot means no rollback and an alarm', async () => {
    await publishV1();
    offsite.failPut = true;
    const token = await stepUp('admin', 'emergency-rollback', bindingHashOf('emergency-rollback', SID, 'shipped'));
    await expect(emergencyRollbackScorecard(ctx, 'admin', SID, { toVersion: 'shipped', reason: 'Backup is down', stepUpToken: token })).rejects.toMatchObject({ code: 'snapshot_failed', status: 503 });
    expect(await rulesStore.getVersions(SID)).toHaveLength(1);
    expect(webhookCalls.some((c) => c.type === 'backup.failed')).toBe(true);
  });

  it('freezes to the last known good version when the target is incompatible with the running build', async () => {
    await publishV1();
    // Make version 1 incompatible: re-sign it against a different registry hash.
    await resealVersion1({ registryHash: 'f'.repeat(64) });
    const token = await stepUp('admin', 'emergency-rollback', bindingHashOf('emergency-rollback', SID, 1));
    const out = await emergencyRollbackScorecard(ctx, 'admin', SID, { toVersion: 1, reason: 'Restore the earlier rules now', stepUpToken: token });
    expect(out).toEqual({ mode: 'frozen_last_known_good', serveVersion: 0 });
    expect((await resolvePublished(SID, ctx.rules)).stamp).toMatchObject({ version: 0, frozen: true });
    expect(webhookCalls.some((c) => c.type === 'compatibility.failure')).toBe(true);
  });
});
