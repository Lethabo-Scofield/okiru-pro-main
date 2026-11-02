/**
 * Storage for everything the Studio keeps besides the version ledger: grants, drafts,
 * approvals, impact runs, step-up challenges, snapshots, audit events, notifications.
 *
 * One small generic collection contract keeps the Mongo and test implementations the same
 * size. Append-only collections (approvals, snapshots, audit, deliveries) refuse update and
 * delete at the storage layer, not just in the service.
 */
import { StoreUnavailableError } from '../store.js';

export class StaleWriteError extends Error {
  readonly code = 'STALE_WRITE';
  constructor(message = 'This record was changed by someone else; reload and try again') {
    super(message);
    this.name = 'StaleWriteError';
  }
}

export class DuplicateIdError extends Error {
  readonly code = 'DUPLICATE_ID';
  constructor(id: string) {
    super(`A record with id ${id} already exists`);
    this.name = 'DuplicateIdError';
  }
}

export interface Doc {
  id: string;
  /** Revision counter for optimistic locking; starts at 1. */
  rev: number;
}

export interface Collection<T extends Doc> {
  get(id: string): Promise<T | null>;
  /** Throws DuplicateIdError if the id exists. */
  insert(doc: T): Promise<void>;
  /** Replaces the doc iff the stored rev === expectedRev, then stores rev + 1. Throws StaleWriteError. */
  replace(doc: T, expectedRev: number): Promise<T>;
  /** Equality filter on top-level fields, oldest first. */
  find(filter?: Partial<Record<keyof T & string, unknown>>): Promise<T[]>;
}

export const COLLECTION_NAMES = [
  'studioGrants', 'ruleChangesets', 'ruleApprovals', 'impactRuns', 'stepUpChallenges',
  'ruleSnapshots', 'auditEvents', 'notifications', 'notificationDeliveries', 'aiProposals',
  'rulesetPinEvents', 'rulingAnswers', 'ruleChangeRequests', 'ruleChangeRequestEvents', 'backupChecks',
] as const;
export type CollectionName = (typeof COLLECTION_NAMES)[number];

/** Collections whose records can never be updated or deleted once written. */
export const APPEND_ONLY: ReadonlySet<CollectionName> = new Set([
  'ruleApprovals', 'ruleSnapshots', 'auditEvents', 'notificationDeliveries', 'rulesetPinEvents',
  'ruleChangeRequestEvents', 'backupChecks',
]);

export interface StudioStore {
  collection<T extends Doc>(name: CollectionName): Collection<T>;
}

export { StoreUnavailableError };
