/**
 * Integration tests for the migrated /api/clients router.
 *
 * Scope:
 *   - Mass-assignment / tenant-integrity guards on create + update payloads
 *   - Server-controlled organizationId is honoured (never taken from body)
 *   - 503 fallback when the data layer is missing is exercised in
 *     routes/index.ts; this file focuses on the router itself with a fake
 *     factory + in-memory repos.
 *
 * Auth and verifyClientAccess are stubbed by injecting a session and
 * mounting permissive middleware — the goal is to test request validation
 * and repository wiring, not the auth layer (covered elsewhere).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import http from "http";
import type { AddressInfo } from "net";
import { FakeUnitOfWork, FakeDataAccessFactory } from "@okiru/data-layer/testing";
import type { IUserRepository, UserView } from "../../data-layer/domain/user.js";
import type {
  IClientRepository,
  ClientView,
  ClientCreateInput,
  ClientUpdateInput,
  PaginatedResult,
} from "../../data-layer/domain/client.js";
import type { IAppUnitOfWork } from "../../data-layer/mongo/mongo-unit-of-work.js";

// Stub the auth middleware before importing the router. requireAuth becomes a
// no-op that injects a session; verifyClientAccess always passes.
vi.mock("../../middleware/auth.js", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.session = req.session ?? {};
    req.session.organizationId = req.session.organizationId ?? "org-from-session";
    next();
  },
  verifyClientAccess: async () => true,
}));

// Stub the legacy storage facade so DELETE / GET-:id/data tests don't hit it.
vi.mock("../../../storage.js", () => ({
  storage: {
    deleteClient: vi.fn(async () => {}),
    getFinancialYears: vi.fn(async () => []),
    getShareholdersByClient: vi.fn(async () => []),
    getOwnershipData: vi.fn(async () => null),
    getEmployeesByClient: vi.fn(async () => []),
    getTrainingProgramsByClient: vi.fn(async () => []),
    getSuppliersByClient: vi.fn(async () => []),
    getProcurementData: vi.fn(async () => null),
    getEsdContributions: vi.fn(async () => []),
    getSedContributions: vi.fn(async () => []),
    getScenariosByClient: vi.fn(async () => []),
  },
}));

// Stub Mongoose models so importing clients.ts doesn't fail outside Mongo.
vi.mock("../../../models.js", () => {
  const noop = { deleteMany: vi.fn(async () => ({ deletedCount: 0 })) };
  return {
    ShareholderModel: noop,
    OwnershipDataModel: noop,
    EmployeeModel: noop,
    TrainingProgramModel: noop,
    SupplierModel: noop,
    ProcurementDataModel: noop,
    EsdContributionModel: noop,
    SedContributionModel: noop,
    ScenarioModel: noop,
    FinancialYearModel: noop,
    ImportLogModel: noop,
    ExportLogModel: noop,
  };
});

// Imported AFTER the mocks above so the mocked versions are picked up.
const { createClientsRouter } = await import("../clients.js");

class InMemoryUserRepository implements IUserRepository {
  async findById(_: string): Promise<UserView | null> { return null; }
  async findByUsername(_: string): Promise<UserView | null> { return null; }
}

class InMemoryClientRepository implements IClientRepository {
  public readonly created: ClientCreateInput[] = [];
  public readonly updated: Array<{ id: string; input: ClientUpdateInput }> = [];
  private readonly clients = new Map<string, ClientView>();
  private nextId = 1;

  async findById(id: string): Promise<ClientView | null> {
    return this.clients.get(id) ?? null;
  }
  async findByOrganization(organizationId: string): Promise<ClientView[]> {
    return [...this.clients.values()].filter((c) => c.organizationId === organizationId);
  }
  async findByOrganizationPaginated(
    organizationId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<ClientView>> {
    const all = await this.findByOrganization(organizationId);
    return { items: all.slice((page - 1) * limit, page * limit), total: all.length, page, limit };
  }
  async create(input: ClientCreateInput): Promise<ClientView> {
    this.created.push(input);
    const id = `client-${this.nextId++}`;
    const client: ClientView = {
      id,
      organizationId: input.organizationId,
      name: input.name,
      financialYear: input.financialYear,
      revenue: input.revenue ?? 0,
      npat: input.npat ?? 0,
      leviableAmount: input.leviableAmount ?? 0,
      industrySector: input.industrySector ?? "",
      eapProvince: input.eapProvince ?? "",
      industryNorm: input.industryNorm ?? null,
      logo: input.logo ?? null,
      pipelineOverrides: input.pipelineOverrides ?? null,
      createdAt: "2026-05-01T00:00:00Z",
    };
    this.clients.set(id, client);
    return client;
  }
  async update(id: string, input: ClientUpdateInput): Promise<ClientView | null> {
    this.updated.push({ id, input });
    const existing = this.clients.get(id);
    if (!existing) return null;
    const next = { ...existing, ...input };
    this.clients.set(id, next);
    return next;
  }
}

class FakeAppUoW extends FakeUnitOfWork implements IAppUnitOfWork {
  constructor(
    public readonly users: IUserRepository,
    public readonly clients: IClientRepository,
  ) { super(); }
}

async function callApp(
  app: express.Express,
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  const { port } = server.address() as AddressInfo;
  try {
    return await new Promise((resolve, reject) => {
      const payload = body !== undefined ? JSON.stringify(body) : null;
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path,
          method,
          headers: payload
            ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) }
            : {},
        },
        (res) => {
          let chunks = "";
          res.setEncoding("utf8");
          res.on("data", (c) => { chunks += c; });
          res.on("end", () => {
            let parsed: any = chunks;
            try { parsed = JSON.parse(chunks); } catch { /* leave as string */ }
            resolve({ status: res.statusCode ?? 0, body: parsed });
          });
        },
      );
      req.on("error", reject);
      if (payload) req.write(payload);
      req.end();
    });
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

function buildApp(repo: InMemoryClientRepository) {
  const factory = new FakeDataAccessFactory<IAppUnitOfWork>(
    () => new FakeAppUoW(new InMemoryUserRepository(), repo),
  );
  const app = express();
  app.use(express.json());
  app.use("/api/clients", createClientsRouter(factory));
  return app;
}

describe("/api/clients (data-layer router)", () => {
  let repo: InMemoryClientRepository;

  beforeEach(() => { repo = new InMemoryClientRepository(); });

  describe("POST / — payload validation", () => {
    it("creates a client and uses the session organizationId, never the body's", async () => {
      const app = buildApp(repo);
      const result = await callApp(app, "POST", "/api/clients", {
        name: "Acme",
        financialYear: "2026",
        revenue: 1000,
      });
      expect(result.status).toBe(200);
      expect(result.body.organizationId).toBe("org-from-session");
      expect(repo.created).toHaveLength(1);
      expect(repo.created[0].organizationId).toBe("org-from-session");
    });

    it("rejects unknown fields (mass-assignment guard)", async () => {
      const app = buildApp(repo);
      const result = await callApp(app, "POST", "/api/clients", {
        name: "Acme",
        financialYear: "2026",
        organizationId: "org-attacker", // attacker tries to spoof tenant
        id: "client-attacker",
        createdAt: "1970-01-01T00:00:00Z",
      });
      expect(result.status).toBe(400);
      expect(result.body.message).toMatch(/Invalid client payload/);
      expect(repo.created).toHaveLength(0);
    });

    it("rejects missing required fields", async () => {
      const app = buildApp(repo);
      const result = await callApp(app, "POST", "/api/clients", { revenue: 5 });
      expect(result.status).toBe(400);
      expect(repo.created).toHaveLength(0);
    });

    it("rejects negative revenue", async () => {
      const app = buildApp(repo);
      const result = await callApp(app, "POST", "/api/clients", {
        name: "Acme", financialYear: "2026", revenue: -1,
      });
      expect(result.status).toBe(400);
    });
  });

  describe("PATCH /:id — payload validation", () => {
    it("rejects an attempt to mutate organizationId", async () => {
      // Seed an existing client so update can find it.
      await repo.create({
        organizationId: "org-from-session",
        name: "Acme",
        financialYear: "2026",
      });
      const app = buildApp(repo);
      const result = await callApp(app, "PATCH", "/api/clients/client-1", {
        name: "Renamed",
        organizationId: "org-attacker",
      });
      expect(result.status).toBe(400);
      // Critical: NO update was forwarded to the repo, so the tenant is safe.
      expect(repo.updated).toHaveLength(0);
    });

    it("rejects an attempt to inject id or createdAt", async () => {
      await repo.create({
        organizationId: "org-from-session",
        name: "Acme",
        financialYear: "2026",
      });
      const app = buildApp(repo);
      const result = await callApp(app, "PATCH", "/api/clients/client-1", {
        id: "client-attacker",
        createdAt: "1970-01-01T00:00:00Z",
      });
      expect(result.status).toBe(400);
      expect(repo.updated).toHaveLength(0);
    });

    it("accepts a clean partial update", async () => {
      await repo.create({
        organizationId: "org-from-session",
        name: "Acme",
        financialYear: "2026",
      });
      const app = buildApp(repo);
      const result = await callApp(app, "PATCH", "/api/clients/client-1", {
        name: "Renamed",
        revenue: 999,
      });
      expect(result.status).toBe(200);
      expect(result.body.name).toBe("Renamed");
      expect(result.body.revenue).toBe(999);
      expect(result.body.organizationId).toBe("org-from-session"); // untouched
    });

    it("returns 404 for unknown id with a valid payload", async () => {
      const app = buildApp(repo);
      const result = await callApp(app, "PATCH", "/api/clients/missing", { name: "x" });
      expect(result.status).toBe(404);
    });
  });

  describe("GET / — pagination", () => {
    it("paginates by session organizationId", async () => {
      for (let i = 0; i < 3; i++) {
        await repo.create({
          organizationId: "org-from-session",
          name: `c-${i}`,
          financialYear: "2026",
        });
      }
      // Different tenant should not leak into results.
      await repo.create({
        organizationId: "other-tenant",
        name: "other",
        financialYear: "2026",
      });
      const app = buildApp(repo);
      const result = await callApp(app, "GET", "/api/clients?page=1&limit=10");
      expect(result.status).toBe(200);
      expect(result.body.total).toBe(3);
      expect(result.body.items).toHaveLength(3);
    });
  });
});
