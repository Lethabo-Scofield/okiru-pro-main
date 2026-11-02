/**
 * Ed25519 signing for published rule versions.
 *
 * Dedicated keys, no fallbacks: the rules signing key is NOT the session secret, an
 * API key or anything shared. If it is not configured, publishing is disabled - there
 * is no unsigned code path and no dev-only default key.
 *
 *   RULES_SIGNING_KEY_ID        short id stamped on every signature (e.g. "rules-2026-11")
 *   RULES_SIGNING_PRIVATE_KEY   PKCS#8 PEM (literal "\n" sequences are accepted)
 *   RULES_SIGNING_PUBLIC_KEYS   optional JSON {keyId: SPKI PEM} for RETIRED keys, so old
 *                               versions keep verifying after a rotation. The active
 *                               key's public half is derived from the private key.
 */
import { createPrivateKey, createPublicKey, sign as edSign, verify as edVerify, type KeyObject } from 'crypto';

export class SigningUnavailableError extends Error {
  readonly code = 'SIGNING_KEY_MISSING';
  constructor(message = 'Rules signing key is not configured; publishing is disabled') {
    super(message);
    this.name = 'SigningUnavailableError';
  }
}

export interface Signer {
  keyId: string;
  sign(message: string): string; // base64
}

export interface Verifier {
  verify(message: string, signatureB64: string, keyId: string): boolean;
  knownKeyIds(): string[];
}

const pem = (raw: string) => raw.replace(/\\n/g, '\n').trim();

export function createSigner(keyId: string, privatePem: string): Signer {
  if (!keyId || !privatePem) throw new SigningUnavailableError();
  const key = createPrivateKey(pem(privatePem));
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Rules signing key must be Ed25519');
  return {
    keyId,
    sign: (message) => edSign(null, Buffer.from(message, 'utf8'), key).toString('base64'),
  };
}

export function createVerifier(publicKeys: Record<string, string | KeyObject>): Verifier {
  const keys = new Map<string, KeyObject>();
  for (const [id, k] of Object.entries(publicKeys)) {
    keys.set(id, typeof k === 'string' ? createPublicKey(pem(k)) : k);
  }
  return {
    knownKeyIds: () => [...keys.keys()],
    verify(message, signatureB64, keyId) {
      const key = keys.get(keyId);
      if (!key) return false;
      try {
        return edVerify(null, Buffer.from(message, 'utf8'), key, Buffer.from(signatureB64, 'base64'));
      } catch {
        return false;
      }
    },
  };
}

export function signerFromEnv(env: NodeJS.ProcessEnv = process.env): Signer {
  const keyId = env.RULES_SIGNING_KEY_ID;
  const priv = env.RULES_SIGNING_PRIVATE_KEY;
  if (!keyId || !priv) throw new SigningUnavailableError();
  return createSigner(keyId, priv);
}

export function verifierFromEnv(env: NodeJS.ProcessEnv = process.env): Verifier {
  const keys: Record<string, string | KeyObject> = {};
  if (env.RULES_SIGNING_PUBLIC_KEYS) {
    const parsed = JSON.parse(env.RULES_SIGNING_PUBLIC_KEYS) as Record<string, string>;
    Object.assign(keys, parsed);
  }
  if (env.RULES_SIGNING_KEY_ID && env.RULES_SIGNING_PRIVATE_KEY) {
    keys[env.RULES_SIGNING_KEY_ID] = createPublicKey(createPrivateKey(pem(env.RULES_SIGNING_PRIVATE_KEY)));
  }
  return createVerifier(keys);
}
