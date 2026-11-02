/**
 * MongoDB implementation of the rules ledger.
 *
 * rules_versions  one immutable document per (scorecardId, version). A unique index on
 *                 (scorecardId, version) is the optimistic lock: of two concurrent
 *                 publishes of the same next version exactly one insert succeeds.
 *                 Mongoose update / delete operations on this model throw.
 * rules_state     a single document holding the freeze / kill-switch state.
 */
import mongoose, { Schema } from 'mongoose';
import { isMongoConnected } from '../../db.js';
import type { RulesVersionRecord } from './ledger.js';
import {
  StoreUnavailableError, VersionConflictError,
  type RulesStore, type FreezeState,
} from './store.js';

const versionSchema = new Schema({
  scorecardId: { type: String, required: true },
  version: { type: Number, required: true },
  kind: { type: String, enum: ['publish', 'restore', 'rollback'], required: true },
  overrides: { type: Schema.Types.Mixed, required: true },
  overridesHash: { type: String, required: true },
  configHash: { type: String, required: true },
  effectiveFrom: { type: String, required: true },
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

const stateSchema = new Schema({
  _id: { type: String, required: true },
  frozen: { type: Boolean, required: true },
  reason: { type: String, default: null },
  by: { type: String, default: null },
  at: { type: String, default: null },
}, { collection: 'rules_state', versionKey: false });

export const RulesVersionModel = mongoose.models.RulesVersion || mongoose.model('RulesVersion', versionSchema);
export const RulesStateModel = mongoose.models.RulesState || mongoose.model('RulesState', stateSchema);

function requireConnection(): void {
  if (!isMongoConnected()) throw new StoreUnavailableError();
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

  async getFreezeState(): Promise<FreezeState> {
    requireConnection();
    const doc = await RulesStateModel.findById('global').lean();
    return doc
      ? { frozen: !!doc.frozen, reason: doc.reason ?? null, by: doc.by ?? null, at: doc.at ?? null }
      : { frozen: false, reason: null, by: null, at: null };
  }

  async setFreezeState(state: FreezeState): Promise<void> {
    requireConnection();
    // rules_state is mutable by design (it is a switch, not history); every change is also audited.
    await RulesStateModel.updateOne({ _id: 'global' }, { $set: state }, { upsert: true });
  }
}
