import { describe, it, expect } from "vitest";
import express from "express";
import http from "http";
import { AddressInfo } from "net";
import {
  FakeUnitOfWork,
  FakeDataAccessFactory,
} from "@okiru/data-layer/testing";
import { InMemoryProviderRegistry } from "@okiru/data-layer";
import type { IUserRepository, UserView } from "../domain/user.js";
import type {
  IClientRepository,
  ClientView,
  ClientCreateInput,
  ClientUpdateInput,
  PaginatedResult,
} from "../domain/client.js";
import type { IAppUnitOfWork } from "../mongo/mongo-unit-of-work.js";
import { attachUow, withUowErrorHandler } from "../middleware/attach-uow.js";

/**
 * Spin the Express app on an ephemeral port and issue one real HTTP request.
 * Real network IO keeps res "finish"/"close" semantics honest for the
 * lifecycle assertions below.
 */
async function callApp(
  app: express.Express,
  method: "GET",
  path: string,
): Promise<{ status: number; body: string }> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  try {
    return await new Promise((resolve, reject) => {
      const req = http.request({ hostname: "127.0.0.1", port, path, method }, (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      });
      req.on("error", reject);
      req.end();
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/** Wait one event-loop tick so res.once('finish', ...) handlers can run. */
const tick = () => new Promise((r) => setImmediate(r));

/**
 * In-memory IUserRepository for tests. Mirrors the shape MongoUserRepository
 * exposes so route tests using a fake UoW are interchangeable with the real
 * one at runtime.
 */
class InMemoryUserRepository implements IUserRepository {
  private readonly users = new Map<string, UserView>();

  add(user: UserView): void {
    this.users.set(user.id, user);
  }

  async findById(id: string): Promise<UserView | null> {
    return this.users.get(id) ?? null;
  }

  async findByUsername(username: string): Promise<UserView | null> {
    for (const user of this.users.values()) {
      if (user.username === username) return user;
    }
    return null;
  }
}

/**
 * In-memory IClientRepository for tests. Mirrors MongoClientRepository's
 * surface so the same test can swap the fake for the real repo without
 * touching call sites.
 */
class InMemoryClientRepository implements IClientRepository {
  private readonly clients = new Map<string, ClientView>();
  private nextId = 1;

  add(client: ClientView): void {
    this.clients.set(client.id, client);
  }

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
    const start = (page - 1) * limit;
    return { items: all.slice(start, start + limit), total: all.length, page, limit };
  }

  async create(input: ClientCreateInput): Promise<ClientView> {
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
      createdAt: new Date("2026-05-01T00:00:00Z").toISOString(),
    };
    this.clients.set(id, client);
    return client;
  }

  async update(id: string, input: ClientUpdateInput): Promise<ClientView | null> {
    const existing = this.clients.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...input };
    this.clients.set(id, updated);
    return updated;
  }
}

class FakeAppUoW extends FakeUnitOfWork implements IAppUnitOfWork {
  constructor(
    public readonly users: IUserRepository,
    public readonly clients: IClientRepository = new InMemoryClientRepository(),
  ) {
    super();
  }
}

function makeClient(overrides: Partial<ClientView> = {}): ClientView {
  return {
    id: "client-1",
    organizationId: "org-1",
    name: "Acme",
    financialYear: "2026",
    revenue: 1_000_000,
    npat: 100_000,
    leviableAmount: 50_000,
    industrySector: "Tech",
    eapProvince: "WC",
    industryNorm: null,
    logo: null,
    pipelineOverrides: null,
    createdAt: "2026-05-01T00:00:00Z",
    ...overrides,
  };
}

function makeUser(overrides: Partial<UserView> = {}): UserView {
  return {
    id: "user-1",
    username: "alice",
    email: "alice@example.com",
    fullName: "Alice",
    role: "user",
    organizationId: null,
    profilePicture: null,
    createdAt: new Date("2026-04-30T00:00:00Z").toISOString(),
    ...overrides,
  };
}

describe("centralized data layer", () => {
  describe("FakeUnitOfWork", () => {
    it("tracks commit", async () => {
      const uow = new FakeUnitOfWork();
      expect(uow.committed).toBe(false);
      await uow.commit();
      expect(uow.committed).toBe(true);
      expect(uow.rolledBack).toBe(false);
    });

    it("tracks rollback", async () => {
      const uow = new FakeUnitOfWork();
      await uow.rollback();
      expect(uow.rolledBack).toBe(true);
      expect(uow.committed).toBe(false);
    });

    it("rejects double-finalisation", async () => {
      const uow = new FakeUnitOfWork();
      await uow.commit();
      await expect(uow.rollback()).rejects.toThrow(/already committed/);

      const uow2 = new FakeUnitOfWork();
      await uow2.rollback();
      await expect(uow2.commit()).rejects.toThrow(/already rolled back/);
    });

    it("supports shouldFailOnCommit per architecture doc §9", async () => {
      const uow = new FakeUnitOfWork();
      uow.shouldFailOnCommit = true;
      await expect(uow.commit()).rejects.toThrow(/simulated commit failure/);
      expect(uow.committed).toBe(false);
      expect(uow.commitCount).toBe(0);

      // Custom error wins over the default message.
      const uow2 = new FakeUnitOfWork();
      uow2.shouldFailOnCommit = true;
      uow2.commitError = new Error("custom DB outage");
      await expect(uow2.commit()).rejects.toThrow(/custom DB outage/);

      // Recovery: clear the flag, commit succeeds, counters update.
      const uow3 = new FakeUnitOfWork();
      uow3.shouldFailOnCommit = true;
      await expect(uow3.commit()).rejects.toThrow();
      uow3.shouldFailOnCommit = false;
      await uow3.commit();
      expect(uow3.committed).toBe(true);
      expect(uow3.commitCount).toBe(1);
    });
  });

  describe("FakeDataAccessFactory + repository", () => {
    it("supports happy-path read with the repository pattern", async () => {
      const repo = new InMemoryUserRepository();
      repo.add(makeUser());
      const uow = new FakeAppUoW(repo);
      const factory = new FakeDataAccessFactory<IAppUnitOfWork>(uow);

      const got = await factory.createUnitOfWork();
      const user = await got.users.findByUsername("alice");
      await got.commit();

      expect(user?.id).toBe("user-1");
      expect((uow as FakeUnitOfWork).committed).toBe(true);
    });

    it("returns null for unknown users without throwing", async () => {
      const repo = new InMemoryUserRepository();
      const uow = new FakeAppUoW(repo);
      const factory = new FakeDataAccessFactory<IAppUnitOfWork>(uow);

      const got = await factory.createUnitOfWork();
      const user = await got.users.findById("missing");
      await got.commit();

      expect(user).toBeNull();
    });

    it("supports a fresh-uow-per-call builder so multiple commits work", async () => {
      const repo = new InMemoryUserRepository();
      repo.add(makeUser());
      const factory = new FakeDataAccessFactory<IAppUnitOfWork>(
        () => new FakeAppUoW(repo),
      );

      const a = await factory.createUnitOfWork();
      await a.users.findByUsername("alice");
      await a.commit();

      const b = await factory.createUnitOfWork();
      await b.users.findById("user-1");
      await b.commit();

      expect((a as FakeUnitOfWork).committed).toBe(true);
      expect((b as FakeUnitOfWork).committed).toBe(true);
    });
  });

  describe("InMemoryProviderRegistry", () => {
    it("registers, resolves, and reports known keys", async () => {
      const registry = new InMemoryProviderRegistry();
      const repo = new InMemoryUserRepository();
      const factory = new FakeDataAccessFactory<IAppUnitOfWork>(
        () => new FakeAppUoW(repo),
      );

      registry.register("inmem", factory);

      expect(registry.has("inmem")).toBe(true);
      expect(registry.resolve("inmem")).toBe(factory);
    });

    it("refuses double-registration of the same key", () => {
      const registry = new InMemoryProviderRegistry();
      const repo = new InMemoryUserRepository();
      const factory = new FakeDataAccessFactory<IAppUnitOfWork>(
        () => new FakeAppUoW(repo),
      );
      registry.register("inmem", factory);
      expect(() => registry.register("inmem", factory)).toThrow(
        /already registered/,
      );
    });

    it("throws a helpful error for unknown providers", () => {
      const registry = new InMemoryProviderRegistry();
      expect(() => registry.resolve("ghost")).toThrow(/No provider registered/);
    });
  });

  describe("IClientRepository contract", () => {
    // These tests run against the in-memory fake but exercise EVERY method on
    // IClientRepository. Any provider (Mongo, in-memory, future Arango) that
    // claims to implement IClientRepository must pass this same suite.
    it("create assigns an id and returns the stored projection", async () => {
      const repo = new InMemoryClientRepository();
      const created = await repo.create({
        organizationId: "org-1",
        name: "Acme",
        financialYear: "2026",
        revenue: 5,
      });
      expect(created.id).toBeTruthy();
      expect(created.organizationId).toBe("org-1");
      expect(created.revenue).toBe(5);
      expect(created.npat).toBe(0);
      expect(await repo.findById(created.id)).toEqual(created);
    });

    it("findByOrganization filters by tenant", async () => {
      const repo = new InMemoryClientRepository();
      repo.add(makeClient({ id: "a", organizationId: "org-1" }));
      repo.add(makeClient({ id: "b", organizationId: "org-2" }));
      const got = await repo.findByOrganization("org-1");
      expect(got.map((c) => c.id)).toEqual(["a"]);
    });

    it("findByOrganizationPaginated honours page/limit and reports total", async () => {
      const repo = new InMemoryClientRepository();
      for (let i = 0; i < 7; i++) {
        repo.add(makeClient({ id: `c-${i}`, organizationId: "org-1" }));
      }
      const page1 = await repo.findByOrganizationPaginated("org-1", 1, 3);
      expect(page1.total).toBe(7);
      expect(page1.items).toHaveLength(3);
      expect(page1.page).toBe(1);

      const page3 = await repo.findByOrganizationPaginated("org-1", 3, 3);
      expect(page3.items).toHaveLength(1);
      expect(page3.total).toBe(7);
    });

    it("update returns null for an unknown id and merges fields when found", async () => {
      const repo = new InMemoryClientRepository();
      expect(await repo.update("missing", { name: "x" })).toBeNull();

      repo.add(makeClient());
      const updated = await repo.update("client-1", { name: "Renamed", revenue: 999 });
      expect(updated?.name).toBe("Renamed");
      expect(updated?.revenue).toBe(999);
      // Untouched fields preserved.
      expect(updated?.organizationId).toBe("org-1");
    });
  });

  describe("attachUow middleware lifecycle", () => {
    function buildApp(uow: FakeAppUoW) {
      const factory = new FakeDataAccessFactory<IAppUnitOfWork>(uow);
      const app = express();
      app.use(attachUow(factory));
      return app;
    }

    it("auto-rolls-back the UoW when a route returns early without committing", async () => {
      const repo = new InMemoryUserRepository();
      const uow = new FakeAppUoW(repo);
      const app = buildApp(uow);
      app.get("/early", (_req, res) => {
        // Simulates a 400 validation early-return — no commit/rollback.
        res.status(400).json({ message: "bad" });
      });

      const result = await callApp(app, "GET", "/early");
      await tick();

      expect(result.status).toBe(400);
      expect(uow.rolledBack).toBe(true);
      expect(uow.committed).toBe(false);
    });

    it("respects an explicit commit and does not auto-rollback afterwards", async () => {
      const repo = new InMemoryUserRepository();
      repo.add(makeUser());
      const uow = new FakeAppUoW(repo);
      const app = buildApp(uow);
      app.get("/ok", async (req, res) => {
        const u = await req.uow!.users.findByUsername("alice");
        await req.commitUow!();
        res.json(u);
      });

      const result = await callApp(app, "GET", "/ok");
      await tick();

      expect(result.status).toBe(200);
      expect(uow.committed).toBe(true);
      expect(uow.rolledBack).toBe(false);
    });

    it("rolls back on uncaught error via withUowErrorHandler and does not double-finalise", async () => {
      const repo = new InMemoryUserRepository();
      const uow = new FakeAppUoW(repo);
      const app = buildApp(uow);
      app.get("/boom", (_req, _res, next) => next(new Error("boom")));
      app.use(withUowErrorHandler());
      // Final error responder so the test gets a clean 500.
      app.use((err: any, _req: any, res: any, _next: any) => {
        res.status(500).json({ message: err.message });
      });

      const result = await callApp(app, "GET", "/boom");
      await tick();

      expect(result.status).toBe(500);
      expect(uow.rolledBack).toBe(true);
      expect(uow.committed).toBe(false);
    });

    it("leaves UoW finalisable when commit throws (state stays 'open')", async () => {
      // Use the canonical shouldFailOnCommit flag from architecture doc §9.
      const repo = new InMemoryUserRepository();
      const uow = new FakeAppUoW(repo);
      uow.shouldFailOnCommit = true;
      uow.commitError = new Error("commit failed: network");

      const factory = new FakeDataAccessFactory<IAppUnitOfWork>(uow);
      const app = express();
      app.use(attachUow(factory));
      app.get("/commit-throws", async (req, _res, next) => {
        try {
          await req.commitUow!();
        } catch (err) {
          return next(err);
        }
      });
      app.use(withUowErrorHandler());
      app.use((err: any, _req: any, res: any, _next: any) => {
        res.status(500).json({ message: err.message });
      });

      const result = await callApp(app, "GET", "/commit-throws");
      await tick();

      // After commit fails, withUowErrorHandler must still be able to roll back
      // because state is left "open".
      expect(result.status).toBe(500);
      expect(JSON.parse(result.body).message).toMatch(/commit failed/);
      expect(uow.rolledBack).toBe(true);
      expect(uow.committed).toBe(false);
      expect(uow.commitCount).toBe(0);
      expect(uow.rollbackCount).toBe(1);
    });

    it("commits client mutations alongside reads on the same UoW", async () => {
      // Validates the second-template promise: the same UoW exposes both
      // users and clients, both share a transaction boundary, and a single
      // commitUow finalises both.
      const userRepo = new InMemoryUserRepository();
      userRepo.add(makeUser());
      const clientRepo = new InMemoryClientRepository();
      const uow = new FakeAppUoW(userRepo, clientRepo);
      const factory = new FakeDataAccessFactory<IAppUnitOfWork>(uow);

      const app = express();
      app.use(attachUow(factory));
      app.get("/mixed", async (req, res) => {
        const u = await req.uow!.users.findById("user-1");
        const c = await req.uow!.clients.create({
          organizationId: "org-1",
          name: "Acme",
          financialYear: "2026",
        });
        await req.commitUow!();
        res.json({ user: u?.id, client: c.id });
      });

      const result = await callApp(app, "GET", "/mixed");
      await tick();

      expect(result.status).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.user).toBe("user-1");
      expect(body.client).toBe("client-1");
      expect(uow.committed).toBe(true);
      expect(uow.rolledBack).toBe(false);
      expect(await clientRepo.findById("client-1")).not.toBeNull();
    });

    it("rolls back client writes when the route throws after a successful create", async () => {
      // The most important transactional guarantee: a write that is followed
      // by an unhandled error must NOT be persisted in production. With the
      // in-memory fake we cannot reverse the side-effect, but we can prove
      // that rollback was called instead of commit — the contract Mongo
      // sessions enforce in production.
      const userRepo = new InMemoryUserRepository();
      const clientRepo = new InMemoryClientRepository();
      const uow = new FakeAppUoW(userRepo, clientRepo);
      const factory = new FakeDataAccessFactory<IAppUnitOfWork>(uow);

      const app = express();
      app.use(attachUow(factory));
      app.get("/write-then-fail", async (req, _res, next) => {
        await req.uow!.clients.create({
          organizationId: "org-1",
          name: "Acme",
          financialYear: "2026",
        });
        next(new Error("downstream failure"));
      });
      app.use(withUowErrorHandler());
      app.use((err: any, _req: any, res: any, _next: any) => {
        res.status(500).json({ message: err.message });
      });

      const result = await callApp(app, "GET", "/write-then-fail");
      await tick();

      expect(result.status).toBe(500);
      expect(uow.rolledBack).toBe(true);
      expect(uow.committed).toBe(false);
      expect(uow.rollbackCount).toBe(1);
    });

    it("commitUow / rollbackUow are idempotent", async () => {
      const repo = new InMemoryUserRepository();
      const uow = new FakeAppUoW(repo);
      const app = buildApp(uow);
      app.get("/idem", async (req, res) => {
        const first = await req.commitUow!();
        const second = await req.commitUow!();
        const third = await req.rollbackUow!();
        res.json({ first, second, third });
      });

      const result = await callApp(app, "GET", "/idem");
      await tick();

      expect(result.status).toBe(200);
      expect(JSON.parse(result.body)).toEqual({ first: true, second: false, third: false });
      expect(uow.committed).toBe(true);
      expect(uow.rolledBack).toBe(false);
    });
  });
});
