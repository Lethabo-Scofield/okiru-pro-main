/**
 * Storage contract for the rules ledger. The only production implementation is
 * MongoRulesStore (mongoStore.ts). There is deliberately NO in-memory fallback: when
 * MongoDB is down every method rejects with StoreUnavailableError and the routes
 * answer 503 - the Studio never pretends to have published something it has not.
 * (The in-memory store under __tests__ exists for unit tests only.)
 */
import type { RulesVersionRecord } from './ledger.js';

export class StoreUnavailableError extends Error {
  readonly code = 'STORE_UNAVAILABLE';
  constructor(message = 'Rules storage is unavailable') {
    super(message);
    this.name = 'StoreUnavailableError';
  }
}

export class VersionConflictError extends Error {
  readonly code = 'VERSION_CONFLICT';
  constructor(public readonly scorecardId: string, public readonly expectedHead: number, message?: string) {
    super(message ?? `Another publish landed first for ${scorecardId} (expected head ${expectedHead})`);
    this.name = 'VersionConflictError';
  }
}

/**
 * Freeze state is an append-only event log, never a mutable flag: who froze what, when,
 * and which version was served meanwhile is part of the audit trail.
 */
export interface FreezeEvent {
  id: string;
  /** A scorecard id, or '*' for every scorecard. */
  scope: string;
  action: 'freeze' | 'unfreeze';
  /** Version served to unpinned clients while frozen; 0 = the shipped rules. */
  serveVersion: number;
  reason: string;
  actor: string;
  at: string;
}

export interface RulesStore {
  /** Every version of one scorecard, ascending. */
  getVersions(scorecardId: string): Promise<RulesVersionRecord[]>;
  /**
   * Appends a version iff the current head is `expectedHeadVersion` (0 = empty).
   * Versions are never updated or deleted. Throws VersionConflictError on a lost race.
   */
  appendVersion(record: RulesVersionRecord, expectedHeadVersion: number): Promise<void>;
  /** All freeze events, oldest first. */
  getFreezeEvents(): Promise<FreezeEvent[]>;
  appendFreezeEvent(event: FreezeEvent): Promise<void>;
}

/** The effective freeze for a scorecard: the latest event for its own scope and for '*'. */
export function currentFreeze(events: FreezeEvent[], scorecardId: string): FreezeEvent | null {
  let own: FreezeEvent | null = null;
  let all: FreezeEvent | null = null;
  for (const e of events) {
    if (e.scope === scorecardId) own = e;
    else if (e.scope === '*') all = e;
  }
  const active = [own, all].filter((e): e is FreezeEvent => !!e && e.action === 'freeze');
  if (!active.length) return null;
  return active.reduce((a, b) => (Date.parse(b.at) >= Date.parse(a.at) ? b : a));
}
