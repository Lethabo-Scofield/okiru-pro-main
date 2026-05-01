import mongoose, { type ClientSession } from "mongoose";
import type { IUnitOfWork } from "@okiru/data-layer";
import { createLogger } from "../../logger.js";
import type { IUserRepository } from "../domain/user.js";
import type { IClientRepository } from "../domain/client.js";
import { MongoUserRepository } from "./mongo-user-repository.js";
import { MongoClientRepository } from "./mongo-client-repository.js";

const logger = createLogger("MongoUoW");

/**
 * Application-specific Unit of Work that exposes the domain repositories the
 * Okiru API uses. Add new repositories here as they are migrated to the data
 * layer pattern. Every repository on this UoW shares the same Mongo session,
 * so all reads/writes inside one request participate in the same transaction
 * (when transactions are supported by the topology).
 */
export interface IAppUnitOfWork extends IUnitOfWork {
  readonly users: IUserRepository;
  readonly clients: IClientRepository;
}

/**
 * Cache the result of the topology probe. We only need to ask Mongo once per
 * connection whether transactions are supported. `null` means "not yet probed".
 *
 * We invalidate on every Mongoose `disconnected` event so a reconnection (e.g.
 * to a different cluster, or after a transient outage) re-probes instead of
 * sticking to a stale `false`.
 */
let cachedTransactionsSupported: boolean | null = null;
let topologyListenersRegistered = false;

function ensureTopologyListeners(): void {
  if (topologyListenersRegistered) return;
  topologyListenersRegistered = true;
  mongoose.connection.on("disconnected", () => {
    cachedTransactionsSupported = null;
  });
  mongoose.connection.on("reconnected", () => {
    cachedTransactionsSupported = null;
  });
}

/**
 * Detect whether the current Mongo deployment supports multi-document
 * transactions. Transactions require a replica set (or sharded cluster).
 *
 * We probe with the `hello` admin command: replica-set members report a
 * `setName`. Any failure (auth, command unsupported, etc.) is treated as
 * "no transactions" — safer to fall back than to throw on every request.
 */
async function detectTransactionsSupported(): Promise<boolean> {
  ensureTopologyListeners();
  if (cachedTransactionsSupported !== null) return cachedTransactionsSupported;
  if (mongoose.connection.readyState !== 1) return false;

  try {
    const db = mongoose.connection.db;
    if (!db) {
      cachedTransactionsSupported = false;
      return false;
    }
    const helloResult = (await db.admin().command({ hello: 1 })) as {
      setName?: string;
      msg?: string;
    };
    const isReplicaSet = typeof helloResult.setName === "string" && helloResult.setName.length > 0;
    const isSharded = helloResult.msg === "isdbgrid";
    cachedTransactionsSupported = isReplicaSet || isSharded;
    logger.debug("Mongo topology probed", {
      transactionsSupported: cachedTransactionsSupported,
      setName: helloResult.setName ?? null,
      sharded: isSharded,
    });
    return cachedTransactionsSupported;
  } catch (err) {
    logger.debug("Mongo topology probe failed — assuming no transaction support", {
      error: err instanceof Error ? err.message : String(err),
    });
    cachedTransactionsSupported = false;
    return false;
  }
}

/**
 * Test-only hook to reset the cached topology decision (e.g. when reconnecting
 * to a different Mongo in tests). Not part of the public API.
 */
export function __resetMongoTopologyCacheForTests(): void {
  cachedTransactionsSupported = null;
}

/**
 * Mongoose-backed Unit of Work.
 *
 * MongoDB transactions require a replica set (or sharded cluster). In dev,
 * standalone Mongo, and in-memory mode they are not available, so this UoW
 * degrades gracefully:
 *   - With a replica set / sharded cluster: opens a real transaction;
 *     commit/rollback do the right thing.
 *   - Standalone / disconnected: no transaction or session is opened;
 *     commit/rollback are no-ops. Reads/writes still work via Mongoose's
 *     default connection — they are just not atomic across operations.
 *
 * This mirrors how the rest of the Okiru API is written: it falls back to
 * in-memory mode rather than failing hard.
 */
export class MongoUnitOfWork implements IAppUnitOfWork {
  readonly users: IUserRepository;
  readonly clients: IClientRepository;

  private constructor(private readonly session: ClientSession | null) {
    this.users = new MongoUserRepository(session);
    this.clients = new MongoClientRepository(session);
  }

  static async begin(): Promise<MongoUnitOfWork> {
    if (mongoose.connection.readyState !== 1) {
      // No DB connection — return a UoW with no session. Repositories will
      // operate against whatever Mongoose has (typically a no-op or buffered
      // call that an upstream guard should have prevented).
      return new MongoUnitOfWork(null);
    }

    const supported = await detectTransactionsSupported();
    if (!supported) {
      // Standalone Mongo (or topology probe failed). Skip session/transaction
      // entirely — opening one and then having commit fail mid-request is
      // worse than running session-less.
      return new MongoUnitOfWork(null);
    }

    let session: ClientSession | null = null;
    try {
      session = await mongoose.startSession();
      session.startTransaction();
      return new MongoUnitOfWork(session);
    } catch (err) {
      logger.debug("Could not start Mongo transaction despite topology support — running without one", {
        error: err instanceof Error ? err.message : String(err),
      });
      if (session) {
        try { await session.endSession(); } catch { /* ignore */ }
      }
      // Treat this as a hint that our cached decision is wrong; force a
      // re-probe next time so we don't keep paying this cost.
      cachedTransactionsSupported = null;
      return new MongoUnitOfWork(null);
    }
  }

  async commit(): Promise<void> {
    if (!this.session) return;
    try {
      if (this.session.inTransaction()) {
        await this.session.commitTransaction();
      }
    } finally {
      try { await this.session.endSession(); } catch { /* ignore */ }
    }
  }

  async rollback(): Promise<void> {
    if (!this.session) return;
    try {
      if (this.session.inTransaction()) {
        await this.session.abortTransaction();
      }
    } finally {
      try { await this.session.endSession(); } catch { /* ignore */ }
    }
  }
}
