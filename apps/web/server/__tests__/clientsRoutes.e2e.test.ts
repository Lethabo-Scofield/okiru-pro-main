/**
 * End-to-end Supertest coverage for /api/clients and /api/workbook tenant rules.
 *
 * Unlike `clientsFallback.test.ts` (which exercises the storage layer +
 * authorization predicate directly), this suite boots the real Express app
 * with MemoryStorage and asserts HTTP status codes. It locks in the
 * `loadClientWithAccess` middleware behaviour on `/api/clients/:clientId*`
 * and `authorizeWorkbookAccess` on `GET /api/workbook/:companyId` so that a
 * regression in middleware ordering, session handling, or the helper itself
 * is caught at the HTTP boundary.
 *
 * The app is booted with `MONGODB_URI` unset so it falls back to the
 * in-memory `MemoryStorage` singleton. Users are created directly via that
 * singleton (verified, no 2FA) and authenticated via `POST /api/auth/login`,
 * so no live MongoDB is required in CI.
 */

// Ensure Mongo-related env vars are wiped BEFORE importing the routes module
// (route registration reads MONGODB_URI eagerly to wire up MongoStore).
delete process.env.MONGODB_URI;
delete process.env.MONGO_URI;
// Force "non-Replit, non-production" detection so the session cookie isn't
// flagged Secure (supertest connects over plain HTTP and would drop secure
// cookies, leaving every request unauthenticated).
delete process.env.REPLIT_DEV_DOMAIN;
delete process.env.REPL_SLUG;
delete process.env.REPLIT_DOMAINS;
process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import request from "supertest";
import bcrypt from "bcryptjs";
import { storage, MemoryStorage } from "../storage";
import { registerRoutes } from "../routes";

interface SeededUser {
  id: string;
  username: string;
  password: string;
  organizationId: string | null;
}

async function seedVerifiedUser(opts: {
  username: string;
  password: string;
  email: string;
  organizationId: string | null;
}): Promise<SeededUser> {
  const hashed = await bcrypt.hash(opts.password, 4);
  const user = await storage.createUser({
    username: opts.username,
    password: hashed,
    email: opts.email,
    fullName: opts.username,
    organizationId: opts.organizationId,
    organizationName: opts.organizationId,
    isVerified: true,
    twofaEnabled: false,
  } as any);
  return {
    id: user.id,
    username: opts.username,
    password: opts.password,
    organizationId: opts.organizationId,
  };
}

async function loginAgent(baseUrl: string, user: SeededUser) {
  const agent = request.agent(baseUrl);
  const res = await agent
    .post("/api/auth/login")
    .send({ username: user.username, password: user.password });
  if (res.status !== 200) {
    throw new Error(`Login failed for ${user.username}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return agent;
}

let app: express.Express;
let httpServer: Server;
let baseUrl: string;
let alice: SeededUser; // org-1, owns C-ALICE
let bob: SeededUser; // org-1, same org as alice (colleague)
let mallory: SeededUser; // org-2, stranger
let aliceAgent: request.Agent;
let bobAgent: request.Agent;
let malloryAgent: request.Agent;
let aliceClientId: string;

beforeAll(async () => {
  // Reset the shared MemoryStorage to keep this suite isolated from any
  // previous tests in the same vitest run.
  if (storage instanceof MemoryStorage) {
    (storage as any).users = new Map();
    (storage as any).clients = new Map();
    (storage as any).userSeq = 0;
  }

  app = express();
  app.use(express.json({ limit: "10mb" }));
  httpServer = createServer(app);
  await registerRoutes(httpServer, app);

  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const addr = httpServer.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;

  alice = await seedVerifiedUser({
    username: "alice_e2e",
    password: "alicepass",
    email: "alice_e2e@example.com",
    organizationId: "org-1",
  });
  bob = await seedVerifiedUser({
    username: "bob_e2e",
    password: "bobpass",
    email: "bob_e2e@example.com",
    organizationId: "org-1",
  });
  mallory = await seedVerifiedUser({
    username: "mallory_e2e",
    password: "mallorypass",
    email: "mallory_e2e@example.com",
    organizationId: "org-2",
  });

  aliceAgent = await loginAgent(baseUrl, alice);
  bobAgent = await loginAgent(baseUrl, bob);
  malloryAgent = await loginAgent(baseUrl, mallory);
});

afterAll(async () => {
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

describe("GET /api/clients", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await request(app).get("/api/clients");
    expect(res.status).toBe(401);
  });

  it("returns 200 with an empty array for a fresh user", async () => {
    const res = await aliceAgent.get("/api/clients");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toEqual([]);
  });
});

describe("POST /api/clients + GET round-trip", () => {
  it("creates a client and the follow-up GET includes it", async () => {
    const created = await aliceAgent
      .post("/api/clients")
      .send({ name: "Alice Holdings" });
    expect(created.status).toBe(200);
    expect(created.body.name).toBe("Alice Holdings");
    expect(created.body.clientId).toMatch(/^C-\d{5}$/);
    expect(created.body.organizationId).toBe("org-1");
    expect(created.body.createdByUserId).toBe(alice.id);
    aliceClientId = created.body.clientId;

    const list = await aliceAgent.get("/api/clients");
    expect(list.status).toBe(200);
    expect(list.body.map((c: any) => c.clientId)).toContain(aliceClientId);
  });

  it("rejects creation without a name", async () => {
    const res = await aliceAgent.post("/api/clients").send({});
    expect(res.status).toBe(400);
  });
});

describe("/api/clients/:clientId — tenant guard", () => {
  it("returns 404 for an unknown clientId on GET", async () => {
    const res = await aliceAgent.get("/api/clients/C-does-not-exist");
    expect(res.status).toBe(404);
  });

  it("returns 404 for an unknown clientId on PATCH", async () => {
    const res = await aliceAgent
      .patch("/api/clients/C-does-not-exist")
      .send({ name: "x" });
    expect(res.status).toBe(404);
  });

  it("returns 404 for an unknown clientId on DELETE", async () => {
    const res = await aliceAgent.delete("/api/clients/C-does-not-exist");
    expect(res.status).toBe(404);
  });

  it("returns 200 for the legitimate owner on GET", async () => {
    const res = await aliceAgent.get(`/api/clients/${aliceClientId}`);
    expect(res.status).toBe(200);
    expect(res.body.clientId).toBe(aliceClientId);
  });

  it("returns 200 for a same-org colleague on GET", async () => {
    const res = await bobAgent.get(`/api/clients/${aliceClientId}`);
    expect(res.status).toBe(200);
    expect(res.body.clientId).toBe(aliceClientId);
  });

  it("returns 403 for a cross-tenant caller on GET", async () => {
    const res = await malloryAgent.get(`/api/clients/${aliceClientId}`);
    expect(res.status).toBe(403);
  });

  it("returns 403 for a cross-tenant caller on PATCH", async () => {
    const res = await malloryAgent
      .patch(`/api/clients/${aliceClientId}`)
      .send({ name: "hijacked" });
    expect(res.status).toBe(403);
    // And the client was not mutated.
    const check = await aliceAgent.get(`/api/clients/${aliceClientId}`);
    expect(check.body.name).toBe("Alice Holdings");
  });

  it("returns 403 for a cross-tenant caller on DELETE", async () => {
    const res = await malloryAgent.delete(`/api/clients/${aliceClientId}`);
    expect(res.status).toBe(403);
    // And the client still exists.
    const check = await aliceAgent.get(`/api/clients/${aliceClientId}`);
    expect(check.status).toBe(200);
  });
});

describe("GET /api/workbook/:companyId — tenant guard", () => {
  it("returns 200 for the legitimate owner", async () => {
    const res = await aliceAgent.get(`/api/workbook/${aliceClientId}`);
    expect(res.status).toBe(200);
    expect(res.body.companyId).toBe(aliceClientId);
  });

  it("returns 200 for a same-org colleague", async () => {
    const res = await bobAgent.get(`/api/workbook/${aliceClientId}`);
    expect(res.status).toBe(200);
    expect(res.body.companyId).toBe(aliceClientId);
  });

  it("returns 404 for an unknown companyId (no scaffolded workbook leak)", async () => {
    const res = await malloryAgent.get("/api/workbook/C-does-not-exist");
    expect(res.status).toBe(404);
  });

  it("returns 403 for a cross-tenant caller on a known client", async () => {
    const res = await malloryAgent.get(`/api/workbook/${aliceClientId}`);
    expect(res.status).toBe(403);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await request(app).get(`/api/workbook/${aliceClientId}`);
    expect(res.status).toBe(401);
  });
});
