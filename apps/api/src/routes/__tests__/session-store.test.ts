/**
 * Regression test: production session-store fail-closed behaviour.
 *
 * In production, `registerRoutes` must REFUSE to start when the MongoDB
 * session store cannot be created. Falling back to MemoryStore would lose
 * sessions on restart, leak memory, and fail to scale horizontally — all
 * silently. This test pins the fail-loud contract.
 *
 * In development the same code path warns and continues with MemoryStore,
 * which is convenient and not tested here (it's the legacy default).
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import express from "express";
import http from "http";

// Stub heavy / external collaborators imported transitively by routes/index.
// We only need registerRoutes to reach the session-store branch and either
// throw (prod) or boot (dev). Anything else is noise.
// NOTE: the real module is apps/api/db.ts. routes/index.ts imports it as
// '../../db.js' (from src/routes/), but from THIS file that specifier resolves to
// src/db.js, which does not exist — so the mock silently never applied, the real
// db layer loaded, and the test hung instead of reaching the session branch.
vi.mock("../../../db.js", () => ({
  isMongoConnected: () => false,
}));

vi.mock("connect-mongo", () => ({
  default: { create: () => ({ on: () => {} }) },
}));

describe("registerRoutes session store", () => {
  const ORIGINAL_ENV = process.env.NODE_ENV;
  const ORIGINAL_SECRET = process.env.SESSION_SECRET;
  const ORIGINAL_MONGO = process.env.MONGO_URI;
  const ORIGINAL_MONGODB = process.env.MONGODB_URI;

  // Importing routes/index pulls in the entire route graph — ~11s in isolation
  // and considerably longer when the full suite saturates the workers. Pay it
  // ONCE here with a generous hook budget; registerRoutes itself then rejects in
  // ~1ms, so the tests below stay fast and are not timing-sensitive.
  let registerRoutes: typeof import("../index.js")["registerRoutes"];

  beforeAll(async () => {
    process.env.NODE_ENV = "production";
    ({ registerRoutes } = await import("../index.js"));
  }, 180_000);

  beforeEach(() => {
    // Deliberately NOT vi.resetModules(): re-importing the route graph
    // re-registers the Mongoose models and throws OverwriteModelError. Both tests
    // run under NODE_ENV=production (set before the first dynamic import, so the
    // module-level isProd is true), and registerRoutes reads SESSION_SECRET and
    // NODE_ENV at call time — so one cached import serves both cases.
    process.env.NODE_ENV = "production";
  });

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_ENV;
    if (ORIGINAL_SECRET === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = ORIGINAL_SECRET;
    if (ORIGINAL_MONGO === undefined) delete process.env.MONGO_URI;
    else process.env.MONGO_URI = ORIGINAL_MONGO;
    if (ORIGINAL_MONGODB === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = ORIGINAL_MONGODB;
  });

  it("throws in production when MongoDB session store cannot be created", async () => {
    process.env.NODE_ENV = "production";
    process.env.SESSION_SECRET = "long-and-strong-secret-for-tests-1234567890";
    delete process.env.MONGO_URI;
    delete process.env.MONGODB_URI;

    const app = express();
    const server = http.createServer(app);
    try {
      await expect(registerRoutes(server, app)).rejects.toThrow(/MongoDB is required for the session store/);
    } finally {
      server.close();
    }
  });

  it("throws (not process.exit) in production when SESSION_SECRET is missing", async () => {
    // This previously called process.exit(1) from library code, which killed the
    // test worker outright and so could never be asserted. Throwing keeps the
    // fail-closed behaviour (index.ts catches startup failures and exits 1) while
    // making it testable.
    process.env.NODE_ENV = "production";
    delete process.env.SESSION_SECRET;

    const app = express();
    const server = http.createServer(app);
    try {
      await expect(registerRoutes(server, app)).rejects.toThrow(/SESSION_SECRET/);
    } finally {
      server.close();
    }
  });
});
