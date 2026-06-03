/**
 * HTTP registration for /api/esg/* — mirrors clientsRoutes.e2e.test.ts.
 * Locks in that ESG routes exist on the web Express app (ingress must route here).
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

async function seedVerifiedUser(opts: {
  username: string;
  password: string;
  email: string;
}) {
  const hashed = await bcrypt.hash(opts.password, 4);
  const user = await storage.createUser({
    username: opts.username,
    password: hashed,
    email: opts.email,
    fullName: opts.username,
    organizationId: "org-esg",
    organizationName: "org-esg",
    isVerified: true,
    twofaEnabled: false,
  } as any);
  return { id: user.id, username: opts.username, password: opts.password };
}

async function loginAgent(baseUrl: string, user: { username: string; password: string }) {
  const agent = request.agent(baseUrl);
  const res = await agent
    .post("/api/auth/login")
    .send({ username: user.username, password: user.password });
  if (res.status !== 200) {
    throw new Error(`Login failed: ${res.status}`);
  }
  return agent;
}

let app: express.Express;
let httpServer: Server;
let baseUrl: string;
let esgUser: { id: string; username: string; password: string };
let esgAgent: request.Agent;
let companyId: string;

beforeAll(async () => {
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

  esgUser = await seedVerifiedUser({
    username: "brian_esg_e2e",
    password: "esgpass",
    email: "brian.esg.e2e@example.com",
  });
  esgAgent = await loginAgent(baseUrl, esgUser);

  const created = await esgAgent.post("/api/clients").send({ name: "ESG Test Co" });
  expect(created.status).toBe(200);
  companyId = created.body.clientId;
});

afterAll(async () => {
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

describe("GET /api/esg/access", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await request(app).get("/api/esg/access");
    expect(res.status).toBe(401);
  });

  it("returns allowed:true for preview-eligible user", async () => {
    const res = await esgAgent.get("/api/esg/access");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ allowed: true });
  });
});

describe("ESG workbook routes", () => {
  it("GET /api/esg/workbook/:companyId returns empty sections", async () => {
    const res = await esgAgent.get(`/api/esg/workbook/${companyId}`);
    expect(res.status).toBe(200);
    expect(res.body.companyId).toBe(companyId);
    expect(res.body.sections).toEqual({});
  });

  it("PUT section then GET round-trip", async () => {
    const put = await esgAgent
      .put(`/api/esg/workbook/${companyId}/section/assumptions`)
      .send({ cells: { sector: "SG Consumer" } });
    expect(put.status).toBe(200);
    expect(put.body.ok).toBe(true);

    const get = await esgAgent.get(`/api/esg/workbook/${companyId}`);
    expect(get.body.sections.assumptions.cells.sector).toBe("SG Consumer");
  });

  it("GET /api/esg/workbook/:companyId/scores returns scores payload", async () => {
    const res = await esgAgent.get(`/api/esg/workbook/${companyId}/scores`);
    expect(res.status).toBe(200);
    expect(res.body.companyId).toBe(companyId);
    expect(res.body).toHaveProperty("scores");
  });

  it("rejects unknown section key with 400", async () => {
    const res = await esgAgent
      .put(`/api/esg/workbook/${companyId}/section/not-a-section`)
      .send({ cells: {} });
    expect(res.status).toBe(400);
  });
});
