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

export interface FreezeState {
  frozen: boolean;
  reason: string | null;
  by: string | null;
  at: string | null;
}

export interface RulesStore {
  /** Every version of one scorecard, ascending. */
  getVersions(scorecardId: string): Promise<RulesVersionRecord[]>;
  /**
   * Appends a version iff the current head is `expectedHeadVersion` (0 = empty).
   * Versions are never updated or deleted. Throws VersionConflictError on a lost race.
   */
  appendVersion(record: RulesVersionRecord, expectedHeadVersion: number): Promise<void>;
  getFreezeState(): Promise<FreezeState>;
  setFreezeState(state: FreezeState): Promise<void>;
}
