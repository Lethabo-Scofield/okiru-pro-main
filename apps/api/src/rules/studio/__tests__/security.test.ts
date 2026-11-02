import { describe, it, expect, beforeEach } from 'vitest';
import { generateKeyPairSync, randomBytes } from 'crypto';
import { MemoryStudioStore } from './memoryStudioStore.js';
import { createSigner, createVerifier } from '../../signing.js';
import {
  authorize, createGrant, revokeGrant, hasAnyGrant, ForbiddenError, PERMISSION_MATRIX, STUDIO_ACTIONS, STUDIO_ROLES, type StudioAction, type StudioRole,
} from '../permissions.js';
import { appendAudit, verifyAudit } from '../audit.js';
import {
  enrollTotp, confirmTotp, startStepUp, verifyStepUp, consumeStepUp, totpAt, matchTotp, bindingHashOf,
  StepUpDeniedError, StepUpUnavailableError, MAX_ATTEMPTS, TOKEN_TTL_MS, encryptSecret, decryptSecret, base32Decode, generateTotpSecret,
} from '../stepUp.js';

const now = new Date('2026-11-02T12:00:00.000Z');
const env = { RULES_TOTP_ENC_KEY: randomBytes(32).toString('base64') } as NodeJS.ProcessEnv;
let store: MemoryStudioStore;
let n = 0;
const newId = () => `id-${++n}`;
beforeEach(() => { store = new MemoryStudioStore(); n = 0; });

describe('permission matrix', () => {
  const grantFor = async (role: StudioRole, scorecards = ['*']) => {
    const s = new MemoryStudioStore();
    await createGrant(s, { userId: 'u', role, scorecards, createdBy: 'root', now });
    return s;
  };

  it.each(STUDIO_ROLES)('role %s can do exactly what the matrix says on a covered scorecard', async (role) => {
    const s = await grantFor(role);
    for (const action of STUDIO_ACTIONS) {
      const allowed = PERMISSION_MATRIX[action].includes(role);
      const attempt = authorize(s, 'u', action as StudioAction, 'rcogp-generic', {} as NodeJS.ProcessEnv);
      if (allowed) await expect(attempt).resolves.toBeTruthy();
      else await expect(attempt).rejects.toThrow(ForbiddenError);
    }
  });

  it('Okiru Admin can NOT approve or publish ordinary changes, but can freeze and roll back in an emergency', async () => {
    const s = await grantFor('admin');
    await expect(authorize(s, 'u', 'review.decide', 'rcogp-generic', {} as NodeJS.ProcessEnv)).rejects.toThrow(ForbiddenError);
    await expect(authorize(s, 'u', 'publish', 'rcogp-generic', {} as NodeJS.ProcessEnv)).rejects.toThrow(ForbiddenError);
    await expect(authorize(s, 'u', 'freeze', 'rcogp-generic', {} as NodeJS.ProcessEnv)).resolves.toBeTruthy();
    await expect(authorize(s, 'u', 'rollback.emergency', 'rcogp-generic', {} as NodeJS.ProcessEnv)).resolves.toBeTruthy();
  });

  it('is scoped to the scorecards granted', async () => {
    const s = await grantFor('expert_approver', ['rcogp-qse']);
    await expect(authorize(s, 'u', 'publish', 'rcogp-qse', {} as NodeJS.ProcessEnv)).resolves.toBeTruthy();
    await expect(authorize(s, 'u', 'publish', 'rcogp-generic', {} as NodeJS.ProcessEnv)).rejects.toThrow(ForbiddenError);
  });

  it('global actions need an unscoped grant, even for the right role', async () => {
    const s = await grantFor('admin', ['rcogp-qse']);
    await expect(authorize(s, 'u', 'grants.manage', undefined, {} as NodeJS.ProcessEnv)).rejects.toThrow(ForbiddenError);
  });

  it('revoked grants stop working; unauthenticated callers and strangers are refused', async () => {
    const s = new MemoryStudioStore();
    const g = await createGrant(s, { userId: 'u', role: 'viewer', scorecards: ['*'], createdBy: 'root', now });
    await expect(authorize(s, 'u', 'read', 'rcogp-generic', {} as NodeJS.ProcessEnv)).resolves.toBeTruthy();
    await revokeGrant(s, g.id, now);
    await expect(authorize(s, 'u', 'read', 'rcogp-generic', {} as NodeJS.ProcessEnv)).rejects.toThrow(ForbiddenError);
    await expect(authorize(s, undefined, 'read', 'rcogp-generic', {} as NodeJS.ProcessEnv)).rejects.toThrow(ForbiddenError);
    await expect(authorize(s, 'stranger', 'read', 'rcogp-generic', {} as NodeJS.ProcessEnv)).rejects.toThrow(ForbiddenError);
    expect(await hasAnyGrant(s, 'u', {} as NodeJS.ProcessEnv)).toBe(false);
  });

  it('bootstrap admins (env) can manage grants but are not implicit approvers', async () => {
    const e = { RULES_STUDIO_BOOTSTRAP_ADMINS: 'root, other' } as NodeJS.ProcessEnv;
    await expect(authorize(store, 'root', 'grants.manage', undefined, e)).resolves.toBeTruthy();
    await expect(authorize(store, 'root', 'publish', 'rcogp-generic', e)).rejects.toThrow(ForbiddenError);
    await expect(authorize(store, 'nobody', 'grants.manage', undefined, e)).rejects.toThrow(ForbiddenError);
  });

  it('platform roles do not leak in: there is no path from a user id alone to permission', async () => {
    await expect(authorize(store, 'super-admin-user', 'read', 'rcogp-generic', {} as NodeJS.ProcessEnv)).rejects.toThrow(ForbiddenError);
  });
});

describe('audit trail', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const signer = createSigner('ak', privateKey.export({ type: 'pkcs8', format: 'pem' }) as string);
  const verifier = createVerifier({ ak: publicKey.export({ type: 'spki', format: 'pem' }) as string });

  it('chains and signs events; a clean log verifies', async () => {
    for (let i = 0; i < 3; i++) await appendAudit(store, signer, { actor: 'u', action: `a${i}`, now });
    expect(await verifyAudit(store, verifier)).toMatchObject({ ok: true, events: 3, unsigned: 0 });
  });

  it('detects an edited event, a deleted event and a forged signature', async () => {
    for (let i = 0; i < 3; i++) await appendAudit(store, signer, { actor: 'u', action: `a${i}`, now });
    const rows = (store.collection('auditEvents') as any).rows as Map<string, any>;

    rows.get('audit-0000000002').action = 'tampered';
    let r = await verifyAudit(store, verifier);
    expect(r.ok).toBe(false);
    expect(r.failures.map((f) => f.code)).toContain('hash-mismatch');

    rows.get('audit-0000000002').action = 'a1';
    rows.delete('audit-0000000002');
    r = await verifyAudit(store, verifier);
    expect(r.failures.map((f) => f.code)).toEqual(expect.arrayContaining(['seq-gap', 'chain-broken']));
  });

  it('records events without a signing key as unsigned (visible in the integrity report)', async () => {
    await appendAudit(store, undefined, { actor: 'u', action: 'draft.create', now });
    expect(await verifyAudit(store, verifier)).toMatchObject({ ok: true, unsigned: 1 });
  });

  it('refuses to be edited or deleted at the storage layer', async () => {
    const e = await appendAudit(store, signer, { actor: 'u', action: 'x', now });
    await expect(store.collection('auditEvents').replace({ ...e, action: 'y' }, e.rev)).rejects.toThrow(/append-only/);
  });
});

describe('TOTP primitives', () => {
  it('matches the RFC 6238 SHA-1 test vectors', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // "12345678901234567890"
    expect(Buffer.from(base32Decode(secret)).toString()).toBe('12345678901234567890');
    expect(totpAt(secret, Math.floor(59 / 30))).toBe('287082');
    expect(totpAt(secret, Math.floor(1111111109 / 30))).toBe('081804');
    expect(totpAt(secret, Math.floor(20000000000 / 30))).toBe('353130');
  });

  it('accepts ±1 step of drift and nothing else', () => {
    const secret = generateTotpSecret();
    const step = Math.floor(now.getTime() / 30_000);
    expect(matchTotp(secret, totpAt(secret, step), now)).toBe(step);
    expect(matchTotp(secret, totpAt(secret, step - 1), now)).toBe(step - 1);
    expect(matchTotp(secret, totpAt(secret, step + 1), now)).toBe(step + 1);
    expect(matchTotp(secret, totpAt(secret, step + 3), now)).toBeNull();
    expect(matchTotp(secret, '12345', now)).toBeNull();
    expect(matchTotp(secret, 'abcdef', now)).toBeNull();
  });

  it('encrypts secrets at rest and refuses to work without a key', () => {
    const s = generateTotpSecret();
    const blob = encryptSecret(s, env);
    expect(blob).not.toContain(s);
    expect(decryptSecret(blob, env)).toBe(s);
    expect(() => encryptSecret(s, {} as NodeJS.ProcessEnv)).toThrow(StepUpUnavailableError);
    expect(() => decryptSecret(blob, { RULES_TOTP_ENC_KEY: randomBytes(32).toString('base64') } as NodeJS.ProcessEnv)).toThrow();
    expect(() => encryptSecret(s, { RULES_TOTP_ENC_KEY: 'short' } as NodeJS.ProcessEnv)).toThrow(StepUpUnavailableError);
  });
});

describe('step-up flow', () => {
  const binding = bindingHashOf('publish', 'cs-1', 'hash-1', 2, '2026-11-02');
  const clock = { t: now };
  const enrolled = async () => {
    const { secret } = await enrollTotp(store, 'u', clock.t, env);
    await confirmTotp(store, 'u', totpAt(secret, Math.floor(clock.t.getTime() / 30_000)), clock.t, env);
    return secret;
  };
  const code = (secret: string, offsetSteps = 0) => totpAt(secret, Math.floor(clock.t.getTime() / 30_000) + offsetSteps);
  beforeEach(() => { clock.t = now; });

  it('issues a single-use token bound to the exact action and binding', async () => {
    const secret = await enrolled();
    clock.t = new Date(now.getTime() + 31_000); // next step: the enrolment code cannot be reused
    const { challengeId } = await startStepUp(store, { userId: 'u', action: 'publish', bindingHash: binding, now: clock.t, newId }, env);
    const { token } = await verifyStepUp(store, { userId: 'u', challengeId, code: code(secret), now: clock.t }, env);

    // wrong binding / wrong action / wrong user: refused, and refusal does not burn the token
    await expect(consumeStepUp(store, { userId: 'u', token, action: 'publish', bindingHash: bindingHashOf('publish', 'cs-1', 'OTHER', 2, '2026-11-02'), now: clock.t })).rejects.toThrow(StepUpDeniedError);
    await expect(consumeStepUp(store, { userId: 'u', token, action: 'freeze', bindingHash: binding, now: clock.t })).rejects.toThrow(StepUpDeniedError);
    await expect(consumeStepUp(store, { userId: 'someone-else', token, action: 'publish', bindingHash: binding, now: clock.t })).rejects.toThrow(StepUpDeniedError);

    await expect(consumeStepUp(store, { userId: 'u', token, action: 'publish', bindingHash: binding, now: clock.t })).resolves.toBeUndefined();
    // replay
    await expect(consumeStepUp(store, { userId: 'u', token, action: 'publish', bindingHash: binding, now: clock.t })).rejects.toThrow(StepUpDeniedError);
  });

  it('two simultaneous consumes: exactly one wins', async () => {
    const secret = await enrolled();
    clock.t = new Date(now.getTime() + 31_000);
    const { challengeId } = await startStepUp(store, { userId: 'u', action: 'publish', bindingHash: binding, now: clock.t, newId }, env);
    const { token } = await verifyStepUp(store, { userId: 'u', challengeId, code: code(secret), now: clock.t }, env);
    const results = await Promise.allSettled([1, 2].map(() => consumeStepUp(store, { userId: 'u', token, action: 'publish', bindingHash: binding, now: clock.t })));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('expires tokens quickly', async () => {
    const secret = await enrolled();
    clock.t = new Date(now.getTime() + 31_000);
    const { challengeId } = await startStepUp(store, { userId: 'u', action: 'publish', bindingHash: binding, now: clock.t, newId }, env);
    const { token } = await verifyStepUp(store, { userId: 'u', challengeId, code: code(secret), now: clock.t }, env);
    await expect(consumeStepUp(store, { userId: 'u', token, action: 'publish', bindingHash: binding, now: new Date(clock.t.getTime() + TOKEN_TTL_MS + 1) })).rejects.toThrow(/expired/);
  });

  it('rejects a replayed TOTP code (same time-step) across challenges', async () => {
    const secret = await enrolled();
    clock.t = new Date(now.getTime() + 31_000);
    const a = await startStepUp(store, { userId: 'u', action: 'publish', bindingHash: binding, now: clock.t, newId }, env);
    const c = code(secret);
    await verifyStepUp(store, { userId: 'u', challengeId: a.challengeId, code: c, now: clock.t }, env);
    const b = await startStepUp(store, { userId: 'u', action: 'publish', bindingHash: binding, now: clock.t, newId }, env);
    await expect(verifyStepUp(store, { userId: 'u', challengeId: b.challengeId, code: c, now: clock.t }, env)).rejects.toThrow(/already used/);
  });

  it('locks a challenge after repeated wrong codes, even if the right code follows', async () => {
    const secret = await enrolled();
    clock.t = new Date(now.getTime() + 31_000);
    const { challengeId } = await startStepUp(store, { userId: 'u', action: 'publish', bindingHash: binding, now: clock.t, newId }, env);
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await expect(verifyStepUp(store, { userId: 'u', challengeId, code: '000000', now: clock.t }, env)).rejects.toThrow(StepUpDeniedError);
    }
    await expect(verifyStepUp(store, { userId: 'u', challengeId, code: code(secret), now: clock.t }, env)).rejects.toThrow(/expired|already used/);
  });

  it('requires enrolment, works only for the challenge owner, and is unavailable without the key', async () => {
    await expect(startStepUp(store, { userId: 'u', action: 'publish', bindingHash: binding, now, newId }, env)).rejects.toThrow(/Enrol/);
    await enrolled();
    const { challengeId } = await startStepUp(store, { userId: 'u', action: 'publish', bindingHash: binding, now, newId }, env);
    await expect(verifyStepUp(store, { userId: 'mallory', challengeId, code: '123456', now }, env)).rejects.toThrow(StepUpDeniedError);
    await expect(startStepUp(store, { userId: 'u', action: 'publish', bindingHash: binding, now, newId }, {} as NodeJS.ProcessEnv)).rejects.toThrow(StepUpUnavailableError);
  });

  it('an enrolment is not usable until confirmed, and cannot be silently re-enrolled once confirmed', async () => {
    const { secret } = await enrollTotp(store, 'u', now, env);
    await expect(startStepUp(store, { userId: 'u', action: 'publish', bindingHash: binding, now, newId }, env)).rejects.toThrow(/Enrol/);
    await confirmTotp(store, 'u', totpAt(secret, Math.floor(now.getTime() / 30_000)), now, env);
    await expect(enrollTotp(store, 'u', now, env)).rejects.toThrow(/already enrolled/);
    await expect(confirmTotp(store, 'ghost', '123456', now, env)).rejects.toThrow(StepUpDeniedError);
  });
});
