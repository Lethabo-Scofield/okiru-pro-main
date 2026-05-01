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

class FakeAppUoW extends FakeUnitOfWork implements IAppUnitOfWork {
  constructor(public readonly users: IUserRepository) {
    super();
  }
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
