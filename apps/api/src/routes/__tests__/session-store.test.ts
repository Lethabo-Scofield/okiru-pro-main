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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import http from "http";

// Stub heavy / external collaborators imported transitively by routes/index.
// We only need registerRoutes to reach the session-store branch and either
// throw (prod) or boot (dev). Anything else is noise.
vi.mock("../../db.js", () => ({
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

  beforeEach(() => {
    vi.resetModules();
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

    const { registerRoutes } = await import("../index.js");
    const app = express();
    const server = http.createServer(app);
    try {
      await expect(registerRoutes(server, app)).rejects.toThrow(/MongoDB is required for the session store/);
    } finally {
      server.close();
    }
  });
});
