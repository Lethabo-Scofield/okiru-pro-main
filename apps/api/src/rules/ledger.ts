/**
 * The append-only, signed, hash-chained version ledger - pure logic, no database.
 *
 * Each published version carries:
 *   - the overrides it applies on top of the shipped config (the change itself),
 *   - overridesHash / configHash (sha256 of the canonical overrides / effective config),
 *   - chainHash = sha256(prevChainHash + payloadHash), linking it to its predecessor,
 *   - an Ed25519 signature over the canonical payload.
 *
 * Tampering with any stored field, deleting a version, or re-ordering versions breaks
 * either a signature or a chain link, and verifyChain() reports exactly where.
 */
import { createHash } from 'crypto';
import type { Signer, Verifier } from './signing.js';
import type { RuleOverrides } from '../../../web/Toolkit/src/lib/rules/types';

export type VersionKind = 'publish' | 'restore' | 'rollback';

export interface RulesVersionPayload {
  scorecardId: string;
  version: number;
  kind: VersionKind;
  overrides: RuleOverrides;
  overridesHash: string;
  configHash: string;
  /** ISO instant the version takes effect. Never the calculation time. */
  effectiveFrom: string;
  publishedAt: string;
  publishedBy: string;
  changesetId: string | null;
  /** For restore / rollback: the version whose rules were re-instated. */
  restoredFromVersion: number | null;
  parentVersion: number | null;
  prevChainHash: string;
}

export interface RulesVersionRecord extends RulesVersionPayload {
  payloadHash: string;
  chainHash: string;
  keyId: string;
  signature: string;
}

export const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

export const genesisHash = (scorecardId: string) => sha256(`okiru-rules-genesis:${scorecardId}`);

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      const c = (v as Record<string, unknown>)[k];
      if (c !== undefined) out[k] = sortDeep(c);
    }
    return out;
  }
  return v;
}

export const canonicalJson = (v: unknown) => JSON.stringify(sortDeep(v));

/** Only the signed fields, in a fixed shape, so extra stored fields can never be smuggled in. */
export function payloadOf(r: RulesVersionPayload): RulesVersionPayload {
  return {
    scorecardId: r.scorecardId,
    version: r.version,
    kind: r.kind,
    overrides: { source: r.overrides.source ?? {}, calculator: r.overrides.calculator ?? {} },
    overridesHash: r.overridesHash,
    configHash: r.configHash,
    effectiveFrom: r.effectiveFrom,
    publishedAt: r.publishedAt,
    publishedBy: r.publishedBy,
    changesetId: r.changesetId ?? null,
    restoredFromVersion: r.restoredFromVersion ?? null,
    parentVersion: r.parentVersion ?? null,
    prevChainHash: r.prevChainHash,
  };
}

export function chainHashOf(prevChainHash: string, payloadHash: string): string {
  return sha256(`${prevChainHash}:${payloadHash}`);
}

export function sealVersion(payload: RulesVersionPayload, signer: Signer): RulesVersionRecord {
  const canonical = canonicalJson(payloadOf(payload));
  const payloadHash = sha256(canonical);
  return {
    ...payloadOf(payload),
    payloadHash,
    chainHash: chainHashOf(payload.prevChainHash, payloadHash),
    keyId: signer.keyId,
    signature: signer.sign(canonical),
  };
}

export type VerifyFailureCode =
  | 'bad-signature' | 'unknown-key' | 'payload-hash-mismatch' | 'chain-hash-mismatch'
  | 'chain-link-broken' | 'version-gap' | 'genesis-mismatch' | 'overrides-hash-mismatch'
  | 'config-hash-mismatch';

export interface VerifyFailure { version: number; code: VerifyFailureCode; detail: string }

export function verifyRecord(r: RulesVersionRecord, verifier: Verifier): VerifyFailure[] {
  const fails: VerifyFailure[] = [];
  const canonical = canonicalJson(payloadOf(r));
  if (sha256(canonical) !== r.payloadHash) {
    fails.push({ version: r.version, code: 'payload-hash-mismatch', detail: 'stored fields do not match payloadHash' });
  }
  if (sha256(canonicalJson({ source: r.overrides.source ?? {}, calculator: r.overrides.calculator ?? {} })) !== r.overridesHash) {
    fails.push({ version: r.version, code: 'overrides-hash-mismatch', detail: 'overrides do not match overridesHash' });
  }
  if (chainHashOf(r.prevChainHash, r.payloadHash) !== r.chainHash) {
    fails.push({ version: r.version, code: 'chain-hash-mismatch', detail: 'chainHash is not derived from prevChainHash + payloadHash' });
  }
  if (!verifier.knownKeyIds().includes(r.keyId)) {
    fails.push({ version: r.version, code: 'unknown-key', detail: `no public key for ${r.keyId}` });
  } else if (!verifier.verify(canonical, r.signature, r.keyId)) {
    fails.push({ version: r.version, code: 'bad-signature', detail: 'Ed25519 signature does not verify' });
  }
  return fails;
}

/** `records` must be every version of ONE scorecard. Order is not trusted. */
export function verifyChain(scorecardId: string, records: RulesVersionRecord[], verifier: Verifier): { ok: boolean; failures: VerifyFailure[] } {
  const sorted = [...records].sort((a, b) => a.version - b.version);
  const failures: VerifyFailure[] = [];
  let prev: RulesVersionRecord | null = null;
  for (const r of sorted) {
    failures.push(...verifyRecord(r, verifier));
    if (r.scorecardId !== scorecardId) {
      failures.push({ version: r.version, code: 'genesis-mismatch', detail: `record belongs to ${r.scorecardId}` });
    }
    if (!prev) {
      if (r.version !== 1) failures.push({ version: r.version, code: 'version-gap', detail: 'chain does not start at version 1' });
      if (r.prevChainHash !== genesisHash(scorecardId)) {
        failures.push({ version: r.version, code: 'genesis-mismatch', detail: 'first version does not link to the genesis hash' });
      }
    } else {
      if (r.version !== prev.version + 1) {
        failures.push({ version: r.version, code: 'version-gap', detail: `expected version ${prev.version + 1}` });
      }
      if (r.prevChainHash !== prev.chainHash) {
        failures.push({ version: r.version, code: 'chain-link-broken', detail: 'prevChainHash does not equal the previous chainHash' });
      }
    }
    prev = r;
  }
  return { ok: failures.length === 0, failures };
}
