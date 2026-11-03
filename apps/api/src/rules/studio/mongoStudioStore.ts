/**
 * MongoDB implementation of StudioStore. No in-memory fallback: when the database is
 * unreachable every call rejects with StoreUnavailableError (HTTP 503).
 */
import { Schema, type Model } from 'mongoose';
import { rulesConnection, rulesDbConnected } from '../rulesConnection.js';
import {
  APPEND_ONLY, COLLECTION_NAMES, DuplicateIdError, StaleWriteError, StoreUnavailableError,
  type Collection, type CollectionName, type Doc, type StudioStore,
} from './studioStore.js';

const MONGO_COLLECTION: Record<CollectionName, string> = {
  studioGrants: 'studio_grants',
  ruleChangesets: 'rule_changesets',
  ruleApprovals: 'rule_approvals',
  impactRuns: 'impact_runs',
  stepUpChallenges: 'step_up_challenges',
  ruleSnapshots: 'rule_snapshots',
  auditEvents: 'rule_audit_events',
  notifications: 'rule_notifications',
  notificationDeliveries: 'rule_notification_deliveries',
  aiProposals: 'rule_ai_proposals',
  rulesetPinEvents: 'ruleset_pin_events',
  rulingAnswers: 'ruling_answers',
  ruleChangeRequests: 'rule_change_requests',
  ruleChangeRequestEvents: 'rule_change_request_events',
  backupChecks: 'rule_backup_checks',
};

function modelFor(name: CollectionName): Model<any> {
  const modelName = `Studio_${name}`;
  const existing = rulesConnection().models[modelName];
  if (existing) return existing;

  const schema = new Schema({ _id: { type: String, required: true } }, { strict: false, versionKey: false, minimize: false, collection: MONGO_COLLECTION[name] });
  if (APPEND_ONLY.has(name)) {
    const forbid = (op: string) => function forbidden() {
      throw new Error(`${MONGO_COLLECTION[name]} is append-only; ${op} is not permitted`);
    };
    for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete'] as const) {
      schema.pre(op as never, forbid(op));
    }
  }
  return rulesConnection().model(modelName, schema);
}

function requireConnection(): void {
  if (!rulesDbConnected()) throw new StoreUnavailableError();
}

const toDoc = <T extends Doc>(raw: any): T => {
  const { _id, ...rest } = raw;
  return { ...rest, id: _id } as T;
};

class MongoCollection<T extends Doc> implements Collection<T> {
  constructor(private readonly name: CollectionName) {}

  async get(id: string): Promise<T | null> {
    requireConnection();
    const raw = await modelFor(this.name).findById(id).lean();
    return raw ? toDoc<T>(raw) : null;
  }

  async insert(doc: T): Promise<void> {
    requireConnection();
    const { id, ...rest } = doc;
    try {
      await modelFor(this.name).create({ _id: id, ...rest });
    } catch (e) {
      if ((e as { code?: number }).code === 11000) throw new DuplicateIdError(id);
      throw e;
    }
  }

  async replace(doc: T, expectedRev: number): Promise<T> {
    requireConnection();
    if (APPEND_ONLY.has(this.name)) throw new Error(`${this.name} is append-only`);
    const { id, ...rest } = doc;
    const next = { ...rest, rev: expectedRev + 1 };
    const res = await modelFor(this.name).replaceOne({ _id: id, rev: expectedRev }, { _id: id, ...next });
    if (res.matchedCount !== 1) throw new StaleWriteError();
    return { ...doc, rev: expectedRev + 1 };
  }

  async find(filter: Partial<Record<keyof T & string, unknown>> = {}): Promise<T[]> {
    requireConnection();
    const mongoFilter: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(filter)) mongoFilter[k === 'id' ? '_id' : k] = v;
    const raws = await modelFor(this.name).find(mongoFilter).sort({ createdAt: 1, _id: 1 }).lean();
    return raws.map((r) => toDoc<T>(r));
  }
}

export class MongoStudioStore implements StudioStore {
  collection<T extends Doc>(name: CollectionName): Collection<T> {
    if (!COLLECTION_NAMES.includes(name)) throw new Error(`Unknown studio collection ${name}`);
    return new MongoCollection<T>(name);
  }
}
