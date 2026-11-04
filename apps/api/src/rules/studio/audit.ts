/**
 * Append-only, hash-chained, signed audit trail for Studio activity.
 *
 * Each event commits to the previous one (prevHash) and, when a signing key is configured,
 * carries an Ed25519 signature. Removing, re-ordering or editing an event breaks the chain
 * and verifyAudit() says where. Audit details never carry client information.
 */
import { randomUUID } from 'crypto';
import { canonicalJson, sha256 } from '../ledger.js';
import type { Signer, Verifier } from '../signing.js';
import type { Doc, StudioStore } from './studioStore.js';

export interface AuditEvent extends Doc {
  seq: number;
  at: string;
  actor: string;
  action: string;
  target: string | null;
  details: Record<string, unknown>;
  prevHash: string;
  hash: string;
  keyId: string | null;
  signature: string | null;
  createdAt: string;
}

const GENESIS = sha256('okiru-rules-audit-genesis');

function bodyOf(e: Pick<AuditEvent, 'seq' | 'at' | 'actor' | 'action' | 'target' | 'details' | 'prevHash'>) {
  return canonicalJson({ seq: e.seq, at: e.at, actor: e.actor, action: e.action, target: e.target, details: e.details, prevHash: e.prevHash });
}

export async function appendAudit(
  store: StudioStore, signer: Signer | undefined,
  input: { actor: string; action: string; target?: string | null; details?: Record<string, unknown>; now: Date },
): Promise<AuditEvent> {
  const col = store.collection<AuditEvent>('auditEvents');
  // A lost race on the sequence number surfaces as DuplicateIdError; retry on the new tail.
  for (let attempt = 0; attempt < 30; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, Math.random() * 25 * Math.min(attempt, 8))); // jittered backoff under contention
    const all = (await col.find()).sort((a, b) => a.seq - b.seq);
    const tail = all[all.length - 1];
    const seq = (tail?.seq ?? 0) + 1;
    const base = {
      seq, at: input.now.toISOString(), actor: input.actor, action: input.action,
      target: input.target ?? null, details: input.details ?? {}, prevHash: tail?.hash ?? GENESIS,
    };
    const body = bodyOf(base);
    const event: AuditEvent = {
      id: `audit-${String(seq).padStart(10, '0')}`, rev: 1, ...base,
      hash: sha256(body), keyId: signer?.keyId ?? null, signature: signer ? signer.sign(body) : null,
      createdAt: base.at,
    };
    try {
      await col.insert(event);
      return event;
    } catch (e) {
      if ((e as { code?: string }).code !== 'DUPLICATE_ID') throw e;
    }
  }
  throw new Error('Could not append audit event after repeated sequence conflicts');
}

export interface AuditIntegrity {
  ok: boolean;
  events: number;
  unsigned: number;
  failures: Array<{ seq: number; code: 'hash-mismatch' | 'chain-broken' | 'seq-gap' | 'bad-signature' | 'unknown-key'; detail: string }>;
}

export async function verifyAudit(store: StudioStore, verifier: Verifier): Promise<AuditIntegrity> {
  const events = (await store.collection<AuditEvent>('auditEvents').find()).sort((a, b) => a.seq - b.seq);
  const failures: AuditIntegrity['failures'] = [];
  let unsigned = 0;
  let prev: AuditEvent | null = null;
  for (const e of events) {
    const body = bodyOf(e);
    if (sha256(body) !== e.hash) failures.push({ seq: e.seq, code: 'hash-mismatch', detail: 'event fields do not match its hash' });
    if (prev) {
      if (e.seq !== prev.seq + 1) failures.push({ seq: e.seq, code: 'seq-gap', detail: `expected ${prev.seq + 1}` });
      if (e.prevHash !== prev.hash) failures.push({ seq: e.seq, code: 'chain-broken', detail: 'prevHash is not the previous hash' });
    } else {
      if (e.seq !== 1) failures.push({ seq: e.seq, code: 'seq-gap', detail: 'chain does not start at 1' });
      if (e.prevHash !== GENESIS) failures.push({ seq: e.seq, code: 'chain-broken', detail: 'first event does not link to genesis' });
    }
    if (e.signature && e.keyId) {
      if (!verifier.knownKeyIds().includes(e.keyId)) failures.push({ seq: e.seq, code: 'unknown-key', detail: e.keyId });
      else if (!verifier.verify(body, e.signature, e.keyId)) failures.push({ seq: e.seq, code: 'bad-signature', detail: 'signature does not verify' });
    } else {
      unsigned++;
    }
    prev = e;
  }
  return { ok: failures.length === 0, events: events.length, unsigned, failures };
}

export const newId = () => randomUUID();
