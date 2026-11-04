/**
 * Step-up authentication for sensitive Studio actions.
 *
 * - TOTP (RFC 6238: HMAC-SHA1, 30 s, 6 digits) works with no email or SMS dependency.
 * - A challenge is bound to ONE action and ONE binding hash (for publish: the exact draft
 *   hash, version and effective date). A token issued for anything else is useless.
 * - Tokens are single-use and short-lived. The same TOTP time-step can never be accepted
 *   twice for a user (replay), and failed attempts lock the challenge.
 * - TOTP secrets are stored AES-256-GCM encrypted with RULES_TOTP_ENC_KEY. Without that key
 *   step-up is unavailable and every protected operation stays disabled; there is no
 *   default key and no bypass.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { Doc, StudioStore } from './studioStore.js';

export class StepUpUnavailableError extends Error {
  readonly code = 'STEP_UP_UNAVAILABLE';
  constructor(message = 'Step-up authentication is not configured (RULES_TOTP_ENC_KEY)') {
    super(message);
    this.name = 'StepUpUnavailableError';
  }
}

export class StepUpDeniedError extends Error {
  readonly code = 'STEP_UP_DENIED';
  constructor(message = 'Step-up authentication failed') {
    super(message);
    this.name = 'StepUpDeniedError';
  }
}

export const CHALLENGE_TTL_MS = 5 * 60_000;
export const TOKEN_TTL_MS = 2 * 60_000;
export const MAX_ATTEMPTS = 5;

/* ------------------------------------------------------------------ TOTP primitives */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0; let value = 0; let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  let bits = 0; let value = 0; const out: number[] = [];
  for (const ch of s.replace(/=+$/, '').toUpperCase()) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('Invalid base32');
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const generateTotpSecret = () => base32Encode(randomBytes(20));

export function totpAt(secret: string, step: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const off = h[h.length - 1] & 15;
  const bin = ((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 1_000_000).padStart(6, '0');
}

/** Returns the matching time-step (within ±1 step of `now`) or null. */
export function matchTotp(secret: string, code: string, now: Date): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now.getTime() / 30_000);
  for (const step of [current, current - 1, current + 1]) {
    const expected = totpAt(secret, step);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(code))) return step;
  }
  return null;
}

/* ------------------------------------------------------------------ secret encryption */

function keyFrom(env: NodeJS.ProcessEnv): Buffer {
  const raw = env.RULES_TOTP_ENC_KEY;
  if (!raw) throw new StepUpUnavailableError();
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new StepUpUnavailableError('RULES_TOTP_ENC_KEY must be 32 bytes, base64-encoded');
  return key;
}

export function encryptSecret(secret: string, env: NodeJS.ProcessEnv = process.env): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keyFrom(env), iv);
  const enc = Buffer.concat([c.update(secret, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}

export function decryptSecret(blob: string, env: NodeJS.ProcessEnv = process.env): string {
  const [iv, tag, enc] = blob.split('.').map((p) => Buffer.from(p, 'base64'));
  const d = createDecipheriv('aes-256-gcm', keyFrom(env), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

/* ------------------------------------------------------------------ enrolment and challenges */

interface TotpRecord extends Doc {
  kind: 'totp';
  userId: string;
  secretEnc: string;
  confirmed: boolean;
  lastStep: number;
  createdAt: string;
}

export interface Challenge extends Doc {
  userId: string;
  action: string;
  bindingHash: string;
  expiresAt: string;
  status: 'pending' | 'issued' | 'used' | 'locked';
  attempts: number;
  tokenHash: string | null;
  tokenExpiresAt: string | null;
  createdAt: string;
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const totpId = (userId: string) => `totp:${userId}`;

export async function enrollTotp(store: StudioStore, userId: string, now: Date, env: NodeJS.ProcessEnv = process.env, issuer = 'Okiru Rules Studio') {
  const col = store.collection<TotpRecord>('studioGrants');
  const existing = await col.get(totpId(userId));
  if (existing?.confirmed) throw new StepUpDeniedError('An authenticator is already enrolled; an admin must reset it');
  const secret = generateTotpSecret();
  const rec: TotpRecord = { id: totpId(userId), rev: existing ? existing.rev : 1, kind: 'totp', userId, secretEnc: encryptSecret(secret, env), confirmed: false, lastStep: 0, createdAt: now.toISOString() };
  if (existing) await col.replace(rec, existing.rev); else await col.insert(rec);
  return { secret, otpauthUri: `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(userId)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30` };
}

export async function confirmTotp(store: StudioStore, userId: string, code: string, now: Date, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const col = store.collection<TotpRecord>('studioGrants');
  const rec = await col.get(totpId(userId));
  if (!rec) throw new StepUpDeniedError('No enrolment in progress');
  const step = matchTotp(decryptSecret(rec.secretEnc, env), code, now);
  if (step === null) throw new StepUpDeniedError('That code is not valid');
  await col.replace({ ...rec, confirmed: true, lastStep: step }, rec.rev);
}

export async function resetTotp(store: StudioStore, userId: string): Promise<void> {
  const col = store.collection<TotpRecord>('studioGrants');
  const rec = await col.get(totpId(userId));
  if (rec) await col.replace({ ...rec, confirmed: false, secretEnc: rec.secretEnc, lastStep: 0 }, rec.rev);
}

export async function startStepUp(
  store: StudioStore, input: { userId: string; action: string; bindingHash: string; now: Date; newId: () => string },
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ challengeId: string; expiresAt: string }> {
  keyFrom(env); // fail early and clearly when step-up is not configured
  const rec = await store.collection<TotpRecord>('studioGrants').get(totpId(input.userId));
  if (!rec?.confirmed) throw new StepUpDeniedError('Enrol an authenticator app before performing sensitive actions');
  const c: Challenge = {
    id: input.newId(), rev: 1, userId: input.userId, action: input.action, bindingHash: input.bindingHash,
    expiresAt: new Date(input.now.getTime() + CHALLENGE_TTL_MS).toISOString(), status: 'pending', attempts: 0,
    tokenHash: null, tokenExpiresAt: null, createdAt: input.now.toISOString(),
  };
  await store.collection<Challenge>('stepUpChallenges').insert(c);
  return { challengeId: c.id, expiresAt: c.expiresAt };
}

export async function verifyStepUp(
  store: StudioStore, input: { userId: string; challengeId: string; code: string; now: Date },
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ token: string; expiresAt: string }> {
  const challenges = store.collection<Challenge>('stepUpChallenges');
  const c = await challenges.get(input.challengeId);
  if (!c || c.userId !== input.userId) throw new StepUpDeniedError();
  if (c.status !== 'pending' || Date.parse(c.expiresAt) < input.now.getTime()) throw new StepUpDeniedError('This challenge has expired or was already used');

  const totps = store.collection<TotpRecord>('studioGrants');
  const rec = await totps.get(totpId(input.userId));
  if (!rec?.confirmed) throw new StepUpDeniedError();

  const step = matchTotp(decryptSecret(rec.secretEnc, env), input.code, input.now);
  if (step === null || step <= rec.lastStep) {
    // wrong code, or a time-step that was already accepted (replay)
    const attempts = c.attempts + 1;
    await challenges.replace({ ...c, attempts, status: attempts >= MAX_ATTEMPTS ? 'locked' : 'pending' }, c.rev);
    throw new StepUpDeniedError(step !== null ? 'That code was already used; wait for the next one' : 'That code is not valid');
  }
  // Burn the time-step first: two concurrent verifies with the same code cannot both pass.
  await totps.replace({ ...rec, lastStep: step }, rec.rev);

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(input.now.getTime() + TOKEN_TTL_MS).toISOString();
  await challenges.replace({ ...c, status: 'issued', tokenHash: sha(token), tokenExpiresAt: expiresAt }, c.rev);
  return { token, expiresAt };
}

/** Consumes the token for exactly (user, action, binding). Single-use, even under races. */
export async function consumeStepUp(
  store: StudioStore, input: { userId: string; token: string; action: string; bindingHash: string; now: Date },
): Promise<void> {
  const challenges = store.collection<Challenge>('stepUpChallenges');
  const [c] = await challenges.find({ tokenHash: sha(input.token) } as never);
  if (!c || c.userId !== input.userId || c.action !== input.action || c.bindingHash !== input.bindingHash) throw new StepUpDeniedError();
  if (c.status !== 'issued' || !c.tokenExpiresAt || Date.parse(c.tokenExpiresAt) < input.now.getTime()) throw new StepUpDeniedError('Step-up has expired or was already used');
  try {
    await challenges.replace({ ...c, status: 'used' }, c.rev);
  } catch (e) {
    if ((e as { code?: string }).code === 'STALE_WRITE') throw new StepUpDeniedError('Step-up has expired or was already used');
    throw e;
  }
}

export const bindingHashOf = (...parts: Array<string | number | null>) => sha(parts.map((p) => String(p ?? '')).join('|'));
