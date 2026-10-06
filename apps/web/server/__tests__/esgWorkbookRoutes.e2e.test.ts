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
import * as XLSX from "xlsx";
import { storage, MemoryStorage } from "../storage";
import { registerRoutes } from "../routes";
import { withStorageReportedAvailable } from "./memoryStorageSession";
import { mergeEsgSectionCells, readEsgGridRows } from "../../src/lib/esg/esgGridRows";

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
  const res = await withStorageReportedAvailable(() =>
    agent.post("/api/auth/login").send({ username: user.username, password: user.password }),
  );
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

  // Creating a company now requires its identity. Kept on the B-BBEE product,
  // as it was before that rule existed, so these ESG workbook routes are
  // exercised against exactly the same company they always were.
  const created = await esgAgent.post("/api/clients").send({
    name: "ESG Test Co",
    industrySector: "RCOGP",
    scorecardType: "Generic",
    financialYearEnd: "2026-02-28",
  });
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

  it("saves what the calculators read beyond the input pages: declared exclusions and net-zero levers", async () => {
    // A company's "this does not apply to us", with its reason.
    const declared = await esgAgent
      .put(`/api/esg/workbook/${companyId}/section/applicability`)
      .send({ cells: { "e:d24": "Water is metered and billed by the landlord." } });
    expect(declared.status).toBe(200);
    const levers = await esgAgent
      .put(`/api/esg/workbook/${companyId}/section/netzero`)
      .send({ cells: { A20: "Fleet renewal", B20: "Replace 20 trucks with Euro VI" } });
    expect(levers.status).toBe(200);

    const get = await esgAgent.get(`/api/esg/workbook/${companyId}`);
    expect(get.body.sections.applicability.cells["e:d24"]).toBe("Water is metered and billed by the landlord.");
    expect(get.body.sections.netzero.cells.A20).toBe("Fleet renewal");
  });

  it("serves the template whole or one part of it, and refuses a part that names nothing", async () => {
    const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    };
    const sheetsOf = (body: Buffer) => XLSX.read(body, { type: "buffer" }).SheetNames;

    const whole = await esgAgent.get("/api/esg/workbook/template").buffer(true).parse(binary);
    expect(whole.status).toBe(200);
    expect(whole.headers["content-disposition"]).toContain("esg-bulk-input-template.xlsx");
    expect(sheetsOf(whole.body)).toContain("SAQ_Supplier");

    const fleet = await esgAgent.get("/api/esg/workbook/template?part=fleet").buffer(true).parse(binary);
    expect(fleet.status).toBe(200);
    expect(fleet.headers["content-disposition"]).toContain("esg-template-fleet.xlsx");
    expect(sheetsOf(fleet.body)).toEqual(["Instructions", "Fleet_Register"]);

    const bad = await esgAgent.get("/api/esg/workbook/template?part=..%2F..%2Fsecrets");
    expect(bad.status).toBe(400);
  });

  it("merges an import by default, and replaces a register only when the person chose to", async () => {
    const fleet = (regs: string[]) => ({ cells: mergeEsgSectionCells("fleet", regs.map((reg, i) => ({ _id: `r${i}`, reg })), {}) });
    const rowsNow = async () => readEsgGridRows((await esgAgent.get(`/api/esg/workbook/${companyId}`)).body.sections.fleet.cells, "fleet").map((r) => r.reg);

    await esgAgent.put(`/api/esg/workbook/${companyId}/section/fleet`).send(fleet(["AA11BBGP", "CC22DDGP"]));
    const merged = await esgAgent.post(`/api/esg/workbook/${companyId}/import`).send({ confirm: true, sections: { fleet: fleet(["EE33FFGP"]) } });
    expect(merged.status).toBe(200);
    expect(await rowsNow()).toEqual(["AA11BBGP", "CC22DDGP", "EE33FFGP"]);

    const replaced = await esgAgent
      .post(`/api/esg/workbook/${companyId}/import`)
      .send({ confirm: true, sections: { fleet: fleet(["EE33FFGP"]) }, replace: ["fleet"] });
    expect(replaced.status).toBe(200);
    expect(replaced.body.registers).toEqual([expect.objectContaining({ sectionId: "fleet", replaced: true, removed: 3 })]);
    expect(await rowsNow()).toEqual(["EE33FFGP"]);
  });
});
