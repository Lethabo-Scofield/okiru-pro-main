#!/usr/bin/env node
/**
 * Creates the indexes the Rules Studio depends on. Run ONCE with an ADMIN connection string (the restricted
 * rules user cannot create indexes, and the app does not try when RULES_MONGO_URI is set).
 *
 *   MONGO_ADMIN_URI="mongodb+srv://admin:...@cluster/okiru" node scripts/rules-studio-indexes.mjs
 *
 * The unique (scorecardId, version) index on rules_versions is the publish lock: without it two concurrent
 * publishes could both succeed.
 */
import mongoose from 'mongoose';

const uri = process.env.MONGO_ADMIN_URI;
if (!uri) { console.error('Set MONGO_ADMIN_URI to an admin connection string.'); process.exit(1); }

await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
const db = mongoose.connection.db;
const plan = [
  ['rules_versions', { scorecardId: 1, version: 1 }, { unique: true, name: 'scorecard_version_unique' }],
  ['rule_freezes', { id: 1 }, { unique: true, name: 'freeze_id_unique' }],
  ['rule_audit_events', { createdAt: 1 }, { name: 'audit_created' }],
  ['rule_changesets', { scorecardId: 1, status: 1 }, { name: 'changeset_scorecard_status' }],
  ['step_up_challenges', { tokenHash: 1 }, { name: 'stepup_token', sparse: true }],
  ['studio_grants', { userId: 1 }, { name: 'grants_user' }],
];
for (const [coll, key, opts] of plan) {
  await db.collection(coll).createIndex(key, opts);
  console.log(`ok  ${coll}  ${JSON.stringify(key)}${opts.unique ? '  UNIQUE' : ''}`);
}
await mongoose.disconnect();
