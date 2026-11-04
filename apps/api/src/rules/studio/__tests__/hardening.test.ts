/** The review findings closed on integration: each test is one gap that must stay closed. */
import { describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'crypto';
import { MemoryRulesStore } from '../../__tests__/memoryStore';
import { MemoryStudioStore } from './memoryStudioStore';
import { createSigner, createVerifier } from '../../signing.js';
import { freeze, verifiedFreezeEvents, RulesIntegrityError, type ServiceDeps } from '../../rulesService.js';
import { rulesServedTo, previewUserIds } from '../../runtime.js';
import { authorize, createGrant, hasAnyGrant, isAllowedUser, revokeGrant, ForbiddenError } from '../permissions.js';
import { ensureInitialGrants, parseInitialGrants } from '../initialGrants.js';
import { S3Offsite } from '../snapshots.js';
import { validateProposal } from '../aiProposals.js';
import { reviewDraft } from '../impactReview.js';
import { getRules } from '../../../../../web/Toolkit/src/lib/rules/registry';

const none = { source: {}, calculator: {} };
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const priv = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
const pub = publicKey.export({ type: 'spki', format: 'pem' }) as string;

describe('the Studio is limited to named people', () => {
  const prod = { NODE_ENV: 'production', RULES_STUDIO_ALLOWED_USERS: 'alice,bob' } as NodeJS.ProcessEnv;

  it('in production an empty list means nobody, even with a grant or as a bootstrap admin', async () => {
    const env = { NODE_ENV: 'production', RULES_STUDIO_BOOTSTRAP_ADMINS: 'alice' } as NodeJS.ProcessEnv;
    const store = new MemoryStudioStore();
    expect(isAllowedUser('alice', env)).toBe(false);
    expect(await hasAnyGrant(store, 'alice', env)).toBe(false);
    await expect(authorize(store, 'alice', 'read', 'rcogp-generic', env)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('a second account of the same person cannot be granted anything', async () => {
    const store = new MemoryStudioStore();
    await expect(createGrant(store, { userId: 'mallory', role: 'expert_approver', scorecards: ['*'], createdBy: 'alice', now: new Date() }, prod)).rejects.toBeInstanceOf(ForbiddenError);
    await createGrant(store, { userId: 'alice', role: 'expert_editor', scorecards: ['*'], createdBy: 'bob', now: new Date() }, prod);
    await expect(authorize(store, 'alice', 'draft.write', 'rcogp-generic', prod)).resolves.toBeTruthy();
  });

  it('which rules a client is scored under takes a Studio role, not a company role', async () => {
    const store = new MemoryStudioStore();
    await expect(authorize(store, 'alice', 'pins.manage', 'rcogp-generic', prod)).rejects.toBeInstanceOf(ForbiddenError);
    await createGrant(store, { userId: 'alice', role: 'expert_editor', scorecards: ['*'], createdBy: 'bob', now: new Date() }, prod);
    await expect(authorize(store, 'alice', 'pins.manage', 'rcogp-generic', prod)).rejects.toBeInstanceOf(ForbiddenError);
    await createGrant(store, { userId: 'bob', role: 'expert_approver', scorecards: ['*'], createdBy: 'alice', now: new Date() }, prod);
    await expect(authorize(store, 'bob', 'pins.manage', 'rcogp-generic', prod)).resolves.toBeTruthy();
  });
});

describe('preview: published rules reach the named accounts and nobody else', () => {
  const env = {
    NODE_ENV: 'production', BUILD_ID: 'abc', RULES_SIGNING_KEY_ID: 'k1', RULES_SIGNING_PRIVATE_KEY: priv, RULES_PREVIEW_USER_IDS: 'alice, bob',
  } as NodeJS.ProcessEnv;

  it('serves preview users only', () => {
    expect(previewUserIds(env)).toEqual(['alice', 'bob']);
    expect(rulesServedTo('alice', env)).toBe(true);
    expect(rulesServedTo('client-user', env)).toBe(false);
    expect(rulesServedTo(undefined, env)).toBe(false);
  });

  it('does not serve anyone without a signing key to verify against', () => {
    expect(rulesServedTo('alice', { ...env, RULES_SIGNING_PRIVATE_KEY: '' })).toBe(false);
  });

  it('asking for launch without meeting the blockers still leaves clients on the current rules', () => {
    expect(rulesServedTo('client-user', { ...env, RULES_LAUNCHED: 'true' })).toBe(false);
  });
});

describe('freeze events are signed', () => {
  const deps = (): ServiceDeps & { store: MemoryRulesStore } => ({
    store: new MemoryRulesStore(), signer: createSigner('k1', priv), verifier: createVerifier({ k1: pub }), buildId: 'b', now: () => new Date('2026-11-04T10:00:00Z'),
  });

  it('a real freeze verifies', async () => {
    const d = deps();
    await freeze(d, { scope: 'rcogp-generic', reason: 'investigating a ruling', actor: 'alice' });
    await expect(verifiedFreezeEvents(d)).resolves.toHaveLength(1);
  });

  it('a row inserted behind the application stops everything instead of choosing the rules', async () => {
    const d = deps();
    await d.store.appendFreezeEvent({ id: 'x', scope: 'rcogp-generic', action: 'freeze', serveVersion: 0, reason: 'forged', actor: 'x', at: '2026-11-04T10:00:00Z' });
    await expect(verifiedFreezeEvents(d)).rejects.toBeInstanceOf(RulesIntegrityError);
  });

  it('an altered event fails too', async () => {
    const d = deps();
    const [e] = await freeze(d, { scope: 'rcogp-generic', reason: 'investigating a ruling', actor: 'alice' });
    const events = await d.store.getFreezeEvents();
    events[0].serveVersion = e.serveVersion + 99;
    const tampered = { ...d, store: { ...d.store, getFreezeEvents: async () => events } as unknown as MemoryRulesStore };
    await expect(verifiedFreezeEvents(tampered)).rejects.toBeInstanceOf(RulesIntegrityError);
  });
});

describe('S3 off-site store', () => {
  class Put { constructor(public input: any) {} }
  class Get { constructor(public input: any) {} }

  it('refuses to overwrite and reads back what was written', async () => {
    const objects = new Map<string, string>();
    const client = {
      async send(c: any) {
        if (c instanceof Put) {
          if (c.input.IfNoneMatch === '*' && objects.has(c.input.Key)) throw Object.assign(new Error('exists'), { name: 'PreconditionFailed', $metadata: { httpStatusCode: 412 } });
          objects.set(c.input.Key, c.input.Body);
          return {};
        }
        if (!objects.has(c.input.Key)) throw Object.assign(new Error('missing'), { name: 'NoSuchKey' });
        return { Body: { transformToString: async () => objects.get(c.input.Key) } };
      },
    };
    const s3 = new S3Offsite(client, 'bucket', 's3:bucket', { Put: Put as never, Get: Get as never });
    await s3.put('a', 'one');
    await expect(s3.put('a', 'two')).rejects.toThrow('exists');
    await expect(s3.get('a')).resolves.toBe('one');
    await expect(s3.get('nope')).resolves.toBeNull();
    expect(s3.describe()).toBe('s3:bucket');
  });
});

describe('what the AI may answer', () => {
  const SID = 'rcogp-generic' as const;
  const editable = getRules(SID).find((r) => r.editability === 'expert')!;
  const locked = getRules(SID).find((r) => r.editability === 'developer')!;

  it('passes on a question and developer items, and drops a locked rule', () => {
    const out = validateProposal(JSON.stringify({
      understanding: 'You want the target raised.', question: 'Which year applies?',
      needsDeveloper: [{ what: 'Change the level thresholds', why: 'Levels go to the developers' }],
      changes: [{ ruleKey: editable.key, value: editable.min, justification: 'as asked' }, { ruleKey: locked.key, value: 1, justification: 'should be dropped' }],
    }), SID);
    expect(out.question).toBe('Which year applies?');
    expect(out.understanding).toContain('target');
    expect(out.needsDeveloper).toHaveLength(1);
    expect(out.items.map((i) => i.ruleKey)).toEqual([editable.key]);
    expect(out.rejected).toEqual([{ ruleKey: locked.key, reason: 'needs a developer change request' }]);
  });

  it('never lets an out-of-range value through', () => {
    const out = validateProposal(JSON.stringify({ changes: [{ ruleKey: editable.key, value: editable.max + 1, justification: 'x' }] }), SID);
    expect(out.items).toHaveLength(0);
    expect(out.rejected).toHaveLength(1);
  });
});

describe('first grants from deployment settings', () => {
  const env = { NODE_ENV: 'production', RULES_STUDIO_ALLOWED_USERS: 'alice,bob', RULES_STUDIO_INITIAL_GRANTS: 'alice:expert_editor, bob:expert_approver, bob:admin, mallory:admin, alice:not_a_role' } as NodeJS.ProcessEnv;
  const ctxWith = (store: MemoryStudioStore, e: NodeJS.ProcessEnv) => ({ studio: store, rules: { signer: undefined }, env: e, now: () => new Date('2026-11-04T10:00:00Z') }) as never;

  it('skips anyone not named and any unknown role', () => {
    expect(parseInitialGrants('a:admin,b:nope,:admin,c')).toEqual([{ userId: 'a', role: 'admin' }]);
  });

  it('refuses an account that is not on the named list', async () => {
    await expect(ensureInitialGrants(ctxWith(new MemoryStudioStore(), env))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('creates each once, and a revoked grant stays revoked', async () => {
    const store = new MemoryStudioStore();
    const named = { ...env, RULES_STUDIO_INITIAL_GRANTS: 'alice:expert_editor,bob:expert_approver' } as NodeJS.ProcessEnv;
    expect(await ensureInitialGrants(ctxWith(store, named))).toBe(2);
    expect(await ensureInitialGrants(ctxWith(store, named))).toBe(0);
    const grants = await store.collection<any>('studioGrants').find();
    await revokeGrant(store, grants[0].id, new Date());
    expect(await ensureInitialGrants(ctxWith(store, named))).toBe(0);
    await expect(authorize(store, 'alice', 'draft.write', 'rcogp-generic', named)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('impact review', () => {
  it('a rule no test company reaches needs a reason, so "nothing moved" cannot pass silently', () => {
    const rule = getRules('rcogp-generic').find((r) => r.binding.path === 'benefitFactors[contributionType=discounts].sdFactor')!;
    expect(rule.editability).toBe('expert');
    const r = reviewDraft('rcogp-generic', none, { source: { [rule.binding.path]: 0.5 }, calculator: {} });
    expect(r.requiresAcknowledgement).toContain(rule.key);
  });

  it('the guarantees rule shows and moves the number that really scores', () => {
    const rule = getRules('rcogp-generic').find((r) => r.key.includes('type=guarantees'))!;
    expect(rule.binding.layer).toBe('calculator');
    const r = reviewDraft('rcogp-generic', none, { source: {}, calculator: { [rule.binding.path]: 0.25 } });
    expect(r.changed[0]).toMatchObject({ from: 0.5, to: 0.25 });
    expect(r.counts.deliberate).toBeGreaterThan(0);
  });
});
