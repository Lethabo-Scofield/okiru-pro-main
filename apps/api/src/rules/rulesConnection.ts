/**
 * Which MongoDB connection the rules ledger and Studio collections use.
 *
 * Default: the application's own connection (shared with the rest of the API).
 *
 * With RULES_MONGO_URI set: a SEPARATE connection authenticated as a restricted database user
 * (docs/rules-studio/mongo-roles.md). That user can insert into the append-only collections but has no
 * update or delete privilege on them, so published history cannot be edited or removed even by
 * someone who obtains the application's credentials or finds an injection bug elsewhere in the API.
 * Indexes are created by an administrator (scripts/rules-studio-indexes.mjs), not by the app.
 */
import mongoose, { type Connection } from 'mongoose';
import { isMongoConnected } from '../../db.js';

let restricted: Connection | null = null;

export const usingRestrictedConnection = (env: NodeJS.ProcessEnv = process.env) => !!env.RULES_MONGO_URI;

export function rulesConnection(env: NodeJS.ProcessEnv = process.env): Connection {
  if (!env.RULES_MONGO_URI) return mongoose.connection;
  if (!restricted) {
    restricted = mongoose.createConnection(env.RULES_MONGO_URI, { serverSelectionTimeoutMS: 10_000, autoIndex: false, autoCreate: false });
    restricted.on('error', (e) => console.error('[rules] restricted MongoDB connection error:', e.message));
  }
  return restricted;
}

export function rulesDbConnected(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.RULES_MONGO_URI ? rulesConnection(env).readyState === 1 : isMongoConnected();
}

/** A model bound lazily to the rules connection, so the connection choice is made at first use, not import. */
export function lazyModel(name: string, schema: mongoose.Schema): mongoose.Model<any> {
  let real: mongoose.Model<any> | null = null;
  const get = (): any => {
    if (!real) {
      const conn = rulesConnection() as any;
      real = (conn.models[name] ?? conn.model(name, schema)) as mongoose.Model<any>;
    }
    return real;
  };
  return new Proxy({} as mongoose.Model<any>, {
    get(_t, prop) {
      const m = get();
      const v = m[prop];
      return typeof v === 'function' ? v.bind(m) : v;
    },
  });
}

export function _resetForTests() { restricted = null; }
