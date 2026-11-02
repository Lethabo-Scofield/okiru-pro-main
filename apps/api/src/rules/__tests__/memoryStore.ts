/** TEST-ONLY store. Production code must never import this file. */
import type { RulesVersionRecord } from '../ledger.js';
import { VersionConflictError, type RulesStore, type FreezeEvent } from '../store.js';

export class MemoryRulesStore implements RulesStore {
  versions = new Map<string, RulesVersionRecord[]>();
  freezeEvents: FreezeEvent[] = [];

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

  async getFreezeEvents() { return structuredClone(this.freezeEvents); }
  async appendFreezeEvent(e: FreezeEvent) { this.freezeEvents.push(structuredClone(e)); }
}
