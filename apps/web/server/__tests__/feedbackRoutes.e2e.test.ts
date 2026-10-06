/**
 * Feedback holds clients' names and email addresses: anyone may SEND it, only
 * the Okiru team may read it or change it (sprint task H2). Mirrors
 * esgWorkbookRoutes.e2e.test.ts — memory storage, real routes, real sessions.
 */

delete process.env.MONGODB_URI;
delete process.env.MONGO_URI;
delete process.env.REPLIT_DEV_DOMAIN;
delete process.env.REPL_SLUG;
delete process.env.REPLIT_DOMAINS;
process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret";
process.env.FEEDBACK_NOTIFY_DISABLED = "true";
process.env.FEEDBACK_ADMIN_EMAILS = "team.member@example.com";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import request from "supertest";
import bcrypt from "bcryptjs";
import { storage, MemoryStorage } from "../storage";
import { registerRoutes } from "../routes";
import { isFeedbackTeam } from "../feedbackRoutes";
import { withStorageReportedAvailable } from "./memoryStorageSession";

async function signedIn(baseUrl: string, username: string, email: string) {
  const password = "feedback-pass";
  await storage.createUser({
    username,
    password: await bcrypt.hash(password, 4),
    email,
    fullName: username,
    organizationId: `org-${username}`,
    organizationName: `org-${username}`,
    isVerified: true,
    twofaEnabled: false,
  } as any);
  const agent = request.agent(baseUrl);
  const res = await withStorageReportedAvailable(() => agent.post("/api/auth/login").send({ username, password }));
  if (res.status !== 200) throw new Error(`Login failed for ${username}: ${res.status}`);
  return agent;
}

let app: express.Express;
let httpServer: Server;
let baseUrl: string;
let client: request.Agent;
let staff: request.Agent;
let listed: request.Agent;
let reportId: string;

beforeAll(async () => {
  if (storage instanceof MemoryStorage) {
    (storage as any).users = new Map();
    (storage as any).userSeq = 0;
  }
  app = express();
  app.use(express.json({ limit: "1mb" }));
  httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;

  client = await signedIn(baseUrl, "client_user", "ceo@clientco.example");
  staff = await signedIn(baseUrl, "okiru_staff", "analyst@okiru.co.za");
  listed = await signedIn(baseUrl, "team_other_login", "Team.Member@example.com");

  const sent = await client.post("/api/feedback").send({ message: "The ESG export is missing a sheet.", userEmail: "ceo@clientco.example" });
  expect(sent.status).toBe(201);
  reportId = sent.body.feedback.id;
});

afterAll(async () => {
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

describe("feedback is the team's to read", () => {
  it("refuses anyone signed out", async () => {
    expect((await request(app).get("/api/feedback")).status).toBe(401);
    expect((await request(app).get("/api/feedback/stats")).status).toBe(401);
  });

  it("refuses a client — other clients' names and emails are in there", async () => {
    const res = await client.get("/api/feedback");
    expect(res.status).toBe(403);
    expect(res.body.feedback).toBeUndefined();
    expect((await client.get("/api/feedback/stats")).status).toBe(403);
  });

  it("lets the team read it: an @okiru.co.za account, and a sign-in on the team list", async () => {
    const byStaff = await staff.get("/api/feedback");
    expect(byStaff.status).toBe(200);
    expect(byStaff.body.feedback.map((f: { id: string }) => f.id)).toContain(reportId);
    expect((await listed.get("/api/feedback/stats")).status).toBe(200);
  });
});

describe("feedback is the team's to change", () => {
  it("refuses a client's change or delete of any report, their own included", async () => {
    expect((await client.patch(`/api/feedback/${reportId}`).send({ status: "resolved" })).status).toBe(403);
    expect((await client.delete(`/api/feedback/${reportId}`)).status).toBe(403);
  });

  it("lets the team move a report on", async () => {
    const res = await staff.patch(`/api/feedback/${reportId}`).send({ status: "in-progress" });
    expect(res.status).toBe(200);
    expect(res.body.feedback.status).toBe("in-progress");
  });
});

describe("isFeedbackTeam", () => {
  it("is staff by role, domain, the feedback inboxes or the configured list — nobody else", () => {
    expect(isFeedbackTeam({ email: "someone@clientco.example", role: "admin" })).toBe(false);
    expect(isFeedbackTeam({ email: "x@okiru.co.za.evil.example" })).toBe(false);
    expect(isFeedbackTeam({ email: "x@okiru.co.za" })).toBe(true);
    expect(isFeedbackTeam({ email: "team.member@example.com" })).toBe(true);
    expect(isFeedbackTeam({ email: "contact@okiru.co.za" })).toBe(true);
    expect(isFeedbackTeam({ email: "", secondaryRoles: ["super_admin"] })).toBe(true);
    expect(isFeedbackTeam(null)).toBe(false);
  });
});
