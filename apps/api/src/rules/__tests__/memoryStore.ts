/** TEST-ONLY store. Production code must never import this file. */
import type { RulesVersionRecord } from '../ledger.js';
import { VersionConflictError, type RulesStore, type FreezeState } from '../store.js';

export class MemoryRulesStore implements RulesStore {
  versions = new Map<string, RulesVersionRecord[]>();
  freeze: FreezeState = { frozen: false, reason: null, by: null, at: null };

  async getVersions(scorecardId: string) {
    return structuredClone(this.versions.get(scorecardId) ?? []);
  }

  async appendVersion(record: RulesVersionRecord, expectedHeadVersion: number) {
    const list = this.versions.get(record.scorecardId) ?? [];
    const head = list.length ? list[list.length - 1].version : 0;
    if (head !== expectedHeadVersion || record.version !== head + 1) {
      throw new VersionConflictError(record.scorecardId, expectedHeadVersion);
    }
    this.versions.set(record.scorecardId, [...list, structuredClone(record)]);
  }

  async getFreezeState() { return { ...this.freeze }; }
  async setFreezeState(s: FreezeState) { this.freeze = { ...s }; }
}
