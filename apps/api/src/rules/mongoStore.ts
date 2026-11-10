/**
 * MongoDB implementation of the rules ledger.
 *
 * rules_versions  one immutable document per (scorecardId, version). A unique index on
 *                 (scorecardId, version) is the optimistic lock: of two concurrent
 *                 publishes of the same next version exactly one insert succeeds.
 *                 Mongoose update / delete operations on this model throw.
 * rule_freezes    append-only freeze / unfreeze events (the kill-switch history).
 */
import { Schema } from 'mongoose';
import { lazyModel, rulesDbConnected } from './rulesConnection.js';
import type { RulesVersionRecord } from './ledger.js';
import {
  StoreUnavailableError, VersionConflictError,
  type RulesStore, type FreezeEvent,
} from './store.js';

const versionSchema = new Schema({
  scorecardId: { type: String, required: true },
  version: { type: Number, required: true },
  kind: { type: String, enum: ['publish', 'restore', 'rollback'], required: true },
  overrides: { type: Schema.Types.Mixed, required: true },
  overridesHash: { type: String, required: true },
  configHash: { type: String, required: true },
  effectiveFrom: { type: String, required: true },
  registryHash: { type: String, required: true },
  buildId: { type: String, required: true },
  announcement: { type: String, default: null },
  authors: { type: [String], default: [] },
  approvers: { type: [String], default: [] },
  publishedAt: { type: String, required: true },
  publishedBy: { type: String, required: true },
  changesetId: { type: String, default: null },
  restoredFromVersion: { type: Number, default: null },
  parentVersion: { type: Number, default: null },
  prevChainHash: { type: String, required: true },
  payloadHash: { type: String, required: true },
  chainHash: { type: String, required: true },
  keyId: { type: String, required: true },
  signature: { type: String, required: true },
}, { collection: 'rules_versions', versionKey: false, minimize: false });

versionSchema.index({ scorecardId: 1, version: 1 }, { unique: true });

// Append-only: every mutating path is closed.
const forbid = (op: string) => function forbidden() {
  throw new Error(`rules_versions is append-only; ${op} is not permitted`);
};
for (const op of [
  'updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne',
  'deleteOne', 'deleteMany', 'findOneAndDelete',
] as const) {
  versionSchema.pre(op as never, forbid(op));
}
versionSchema.pre('save', function () {
  if (!this.isNew) throw new Error('rules_versions is append-only; documents cannot be re-saved');
});

const freezeSchema = new Schema({
  id: { type: String, required: true },
  scope: { type: String, required: true },
  action: { type: String, enum: ['freeze', 'unfreeze'], required: true },
  serveVersion: { type: Number, required: true },
  reason: { type: String, required: true },
  actor: { type: String, required: true },
  at: { type: String, required: true },
}, { collection: 'rule_freezes', versionKey: false });
freezeSchema.index({ id: 1 }, { unique: true });
for (const op of [
  'updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne',
  'deleteOne', 'deleteMany', 'findOneAndDelete',
] as const) {
  freezeSchema.pre(op as never, forbid(op === 'updateOne' ? 'updateOne (freeze events)' : op));
}

export const RulesVersionModel = lazyModel('RulesVersion', versionSchema);
export const RuleFreezeModel = lazyModel('RuleFreeze', freezeSchema);

function requireConnection(): void {
  if (!rulesDbConnected()) throw new StoreUnavailableError();
}

export class MongoRulesStore implements RulesStore {
  async getVersions(scorecardId: string): Promise<RulesVersionRecord[]> {
    requireConnection();
    const docs = await RulesVersionModel.find({ scorecardId }).sort({ version: 1 }).lean();
    return docs.map(({ _id, ...rest }) => rest as unknown as RulesVersionRecord);
  }

  async appendVersion(record: RulesVersionRecord, expectedHeadVersion: number): Promise<void> {
    requireConnection();
    if (record.version !== expectedHeadVersion + 1) {
      throw new VersionConflictError(record.scorecardId, expectedHeadVersion, 'Version must be head + 1');
    }
    try {
      await RulesVersionModel.create(record);
    } catch (e) {
      if ((e as { code?: number }).code === 11000) throw new VersionConflictError(record.scorecardId, expectedHeadVersion);
      throw e;
    }
  }

  async getFreezeEvents(): Promise<FreezeEvent[]> {
    requireConnection();
    const docs = await RuleFreezeModel.find({}).sort({ at: 1, _id: 1 }).lean();
    return docs.map(({ _id, ...rest }) => rest as unknown as FreezeEvent);
  }

  async appendFreezeEvent(event: FreezeEvent): Promise<void> {
    requireConnection();
    await RuleFreezeModel.create(event);
  }
}
