/**
 * End-to-end Supertest coverage for the /api/organization endpoints
 * (company-admin membership: roster, invite gating, admin transfer, remove).
 *
 * Mirrors clientsRoutes.e2e.test.ts: boots the real Express app with the
 * in-memory MemoryStorage (MONGODB_URI unset) and authenticates via
 * POST /api/auth/login, so no live MongoDB is required. Because the org
 * endpoints go through the storage abstraction (getUsersByOrganization /
 * getOrganizationById / setOrganizationAdmin), the same code path that runs
 * against Mongo in prod is exercised here.
 */

delete process.env.MONGODB_URI;
delete process.env.MONGO_URI;
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
  role?: string;
}): Promise<SeededUser> {
  const hashed = await bcrypt.hash(opts.password, 4);
  const user = await storage.createUser({
    username: opts.username,
    password: hashed,
    email: opts.email,
    fullName: opts.username,
    organizationId: opts.organizationId,
    organizationName: opts.organizationId,
    role: opts.role ?? "analyst",
    isVerified: true,
    twofaEnabled: false,
  } as any);
  return { id: user.id, username: opts.username, password: opts.password, organizationId: opts.organizationId };
}

async function loginAgent(baseUrl: string, user: SeededUser) {
  const agent = request.agent(baseUrl);
  const res = await agent.post("/api/auth/login").send({ username: user.username, password: user.password });
  if (res.status !== 200) {
    throw new Error(`Login failed for ${user.username}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return agent;
}

let app: express.Express;
let httpServer: Server;
let baseUrl: string;

// org-A: founder(admin) + two members. org-B: a stranger (separate tenant).
let founder: SeededUser;
let member: SeededUser;
let member2: SeededUser;
let removable: SeededUser;
let stranger: SeededUser;

let founderAgent: request.Agent;
let memberAgent: request.Agent;
let member2Agent: request.Agent;
let strangerAgent: request.Agent;

beforeAll(async () => {
  if (storage instanceof MemoryStorage) {
    (storage as any).users = new Map();
    (storage as any).organizations = new Map();
    (storage as any).userSeq = 0;
  }

  app = express();
  app.use(express.json({ limit: "10mb" }));
  httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const addr = httpServer.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;

  // Seed founder FIRST so it is the earliest member of org-A.
  founder = await seedVerifiedUser({ username: "founder_a", password: "founderpass", email: "founder@a.com", organizationId: "org-A", role: "admin" });
  member = await seedVerifiedUser({ username: "member_a", password: "memberpass", email: "member@a.com", organizationId: "org-A", role: "analyst" });
  member2 = await seedVerifiedUser({ username: "member2_a", password: "member2pass", email: "member2@a.com", organizationId: "org-A", role: "analyst" });
  removable = await seedVerifiedUser({ username: "removable_a", password: "removablepass", email: "removable@a.com", organizationId: "org-A", role: "analyst" });
  stranger = await seedVerifiedUser({ username: "stranger_b", password: "strangerpass", email: "stranger@b.com", organizationId: "org-B", role: "admin" });

  founderAgent = await loginAgent(baseUrl, founder);
  memberAgent = await loginAgent(baseUrl, member);
  member2Agent = await loginAgent(baseUrl, member2);
  strangerAgent = await loginAgent(baseUrl, stranger);
});

afterAll(async () => {
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

describe("GET /api/organization/members — org-scoped roster + admin resolution", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await request(app).get("/api/organization/members");
    expect(res.status).toBe(401);
  });

  it("lists every member of the caller's org and marks the founder as admin", async () => {
    const res = await founderAgent.get("/api/organization/members");
    expect(res.status).toBe(200);
    expect(res.body.isAdmin).toBe(true);
    expect(res.body.adminUserId).toBe(founder.id);
    const ids = res.body.members.map((m: any) => m.id).sort();
    expect(ids).toEqual([founder.id, member.id, member2.id, removable.id].sort());
    const founderRow = res.body.members.find((m: any) => m.id === founder.id);
    expect(founderRow.isAdmin).toBe(true);
  });

  it("lets a non-admin member see the full roster but reports isAdmin=false", async () => {
    const res = await memberAgent.get("/api/organization/members");
    expect(res.status).toBe(200);
    expect(res.body.isAdmin).toBe(false);
    expect(res.body.members.length).toBe(4);
  });

  it("does not leak members across organizations (tenant isolation)", async () => {
    const res = await strangerAgent.get("/api/organization/members");
    expect(res.status).toBe(200);
    const ids = res.body.members.map((m: any) => m.id);
    expect(ids).toEqual([stranger.id]);
    expect(ids).not.toContain(founder.id);
  });
});

describe("GET /api/organization — summary", () => {
  it("reports memberCount and admin flag for the founder", async () => {
    const res = await founderAgent.get("/api/organization");
    expect(res.status).toBe(200);
    expect(res.body.isAdmin).toBe(true);
    expect(res.body.memberCount).toBe(4);
    expect(res.body.organization?.adminUserId).toBe(founder.id);
  });
});

describe("POST /api/organization/invites — admin only", () => {
  it("rejects an invite from a non-admin member (403)", async () => {
    const res = await memberAgent.post("/api/organization/invites").send({ email: "new@a.com" });
    expect(res.status).toBe(403);
  });

  it("rejects an invalid email (400)", async () => {
    const res = await founderAgent.post("/api/organization/invites").send({ email: "not-an-email" });
    expect(res.status).toBe(400);
  });

  it("lets the admin invite by email and returns an accept link when SMTP is off", async () => {
    const res = await founderAgent.post("/api/organization/invites").send({ email: "New.Teammate@A.com" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.emailSent).toBe(false);
    expect(typeof res.body.acceptUrl).toBe("string");
    expect(res.body.acceptUrl).toContain("/invite/");
  });
});

describe("PATCH /api/organization/admin — transfer", () => {
  it("rejects a transfer initiated by a non-admin (403)", async () => {
    const res = await memberAgent.patch("/api/organization/admin").send({ newAdminUserId: member.id });
    expect(res.status).toBe(403);
  });

  it("rejects transfer to a user outside the org (404)", async () => {
    const res = await founderAgent.patch("/api/organization/admin").send({ newAdminUserId: stranger.id });
    expect(res.status).toBe(404);
  });

  it("rejects transfer to self (400)", async () => {
    const res = await founderAgent.patch("/api/organization/admin").send({ newAdminUserId: founder.id });
    expect(res.status).toBe(400);
  });

  it("transfers admin: promotes the target, demotes the outgoing admin, moves the pointer", async () => {
    const res = await founderAgent.patch("/api/organization/admin").send({ newAdminUserId: member2.id });
    expect(res.status).toBe(200);
    expect(res.body.adminUserId).toBe(member2.id);

    // New admin sees isAdmin=true; roster reflects the swap.
    const roster = await member2Agent.get("/api/organization/members");
    expect(roster.body.adminUserId).toBe(member2.id);
    const m2 = roster.body.members.find((m: any) => m.id === member2.id);
    const f = roster.body.members.find((m: any) => m.id === founder.id);
    expect(m2.isAdmin).toBe(true);
    expect(m2.role).toBe("admin");
    expect(f.isAdmin).toBe(false);
    expect(f.role).toBe("analyst");

    // The outgoing admin can no longer perform admin actions.
    const denied = await founderAgent.patch("/api/organization/admin").send({ newAdminUserId: member.id });
    expect(denied.status).toBe(403);

    // Transfer back so later tests run with the founder as admin again.
    const back = await member2Agent.patch("/api/organization/admin").send({ newAdminUserId: founder.id });
    expect(back.status).toBe(200);
    expect(back.body.adminUserId).toBe(founder.id);
  });
});

describe("DELETE /api/organization/members/:userId — remove", () => {
  it("rejects removal by a non-admin (403)", async () => {
    const res = await memberAgent.delete(`/api/organization/members/${removable.id}`);
    expect(res.status).toBe(403);
  });

  it("rejects the admin removing themselves (400)", async () => {
    const res = await founderAgent.delete(`/api/organization/members/${founder.id}`);
    expect(res.status).toBe(400);
  });

  it("removes a member so they drop out of the org roster", async () => {
    const res = await founderAgent.delete(`/api/organization/members/${removable.id}`);
    expect(res.status).toBe(200);

    const roster = await founderAgent.get("/api/organization/members");
    const ids = roster.body.members.map((m: any) => m.id);
    expect(ids).not.toContain(removable.id);
    expect(roster.body.memberCount ?? roster.body.members.length).toBe(3);
  });
});
