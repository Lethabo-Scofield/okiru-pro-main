/**
 * ArangoDB Connection Manager
 *
 * Handles connection setup, database initialization, and health checks
 * for the B-BBEE knowledge graph stored in ArangoDB.
 *
 * MongoDB remains the primary store for user/auth data.
 * ArangoDB is used exclusively for the B-BBEE domain graph:
 * scorecards, pillars, indicators, calculations, and audit trails.
 */

import { Database } from 'arangojs';

let _db: Database | null = null;
let _arangoConnected = false;

export interface ArangoConfig {
  url: string;
  databaseName: string;
  username: string;
  password: string;
}

export function isArangoConnected(): boolean {
  return _arangoConnected;
}

function getConfig(): ArangoConfig {
  return {
    url: process.env.ARANGO_URL || 'http://127.0.0.1:8529',
    databaseName: process.env.ARANGO_DB || 'bbbee_db',
    username: process.env.ARANGO_USER || 'root',
    password: process.env.ARANGO_PASSWORD || 'Okiru123!',
  };
}

export async function connectArango(): Promise<Database | null> {
  if (_db) return _db;

  const cfg = getConfig();
  console.log(`[ArangoDB] Connecting to ${cfg.url}/${cfg.databaseName}...`);

  try {
    const systemDb = new Database({
      url: cfg.url,
      auth: { username: cfg.username, password: cfg.password },
    });

    const databases = await systemDb.listDatabases();
    if (!databases.includes(cfg.databaseName)) {
      console.log(`[ArangoDB] Creating database "${cfg.databaseName}"...`);
      await systemDb.createDatabase(cfg.databaseName);
    }

    _db = systemDb.database(cfg.databaseName);
    _arangoConnected = true;
    console.log(`[ArangoDB] Connected to "${cfg.databaseName}"`);
    return _db;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[ArangoDB] Failed to connect: ${msg}. Routes requiring ArangoDB will be unavailable.`);
    return null;
  }
}

export function getArangoDB(): Database {
  if (!_db) {
    throw new Error('[ArangoDB] Not connected. Call connectArango() first.');
  }
  return _db;
}

export async function checkArangoHealth(): Promise<{ ok: boolean; version?: string; error?: string }> {
  try {
    const db = getArangoDB();
    const info = await db.version();
    return { ok: true, version: info.version };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
