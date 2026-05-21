/**
 * Unit tests for the in-memory fallback path of /api/clients and the
 * tightened tenant check on GET /api/workbook/:companyId.
 *
 * These tests do NOT spin up an HTTP server — they exercise the storage
 * layer + handler logic directly using a fresh MemoryStorage and the same
 * filter rules the route would apply. The intent is to lock in the
 * behaviour fixed in P1 + P3 so regressions are caught without needing a
 * running app or a live Mongo.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStorage } from "../storage";

describe("MemoryStorage — clients fallback (P1)", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it("listClientsForUser returns [] when no clients exist", async () => {
    const user = { role: "user", organizationId: "org-1" };
    const result = await storage.listClientsForUser("user-1", user);
    expect(result).toEqual([]);
  });

  it("createOrUpdateClient preserves caller-supplied clientId and tenancy", async () => {
    const created = await storage.createOrUpdateClient({
      id: "C-12345",
      clientId: "C-12345",
      name: "Acme",
      organizationId: "org-1",
      createdByUserId: "user-1",
    });
    expect(created.id).toBe("C-12345");
    expect(created.clientId).toBe("C-12345");
    expect(created.name).toBe("Acme");
    expect(created.organizationId).toBe("org-1");
    expect(created.createdByUserId).toBe("user-1");

    const fetched = await storage.getClientByClientId("C-12345");
    expect(fetched?.name).toBe("Acme");
  });

  it("listClientsForUser shows clients created by the caller", async () => {
    await storage.createOrUpdateClient({
      id: "C-1",
      clientId: "C-1",
      name: "Mine",
      organizationId: null,
      createdByUserId: "user-1",
    });
    await storage.createOrUpdateClient({
      id: "C-2",
      clientId: "C-2",
      name: "Theirs",
      organizationId: null,
      createdByUserId: "user-2",
    });
    const list = await storage.listClientsForUser("user-1", { organizationId: null });
    expect(list.map((c) => c.clientId)).toEqual(["C-1"]);
  });

  it("listClientsForUser shows clients in the same org", async () => {
    await storage.createOrUpdateClient({
      id: "C-1",
      clientId: "C-1",
      name: "Same org, other user",
      organizationId: "org-1",
      createdByUserId: "user-2",
    });
    await storage.createOrUpdateClient({
      id: "C-2",
      clientId: "C-2",
      name: "Other org",
      organizationId: "org-2",
      createdByUserId: "user-3",
    });
    const list = await storage.listClientsForUser("user-1", { organizationId: "org-1" });
    expect(list.map((c) => c.clientId)).toEqual(["C-1"]);
  });

  it("super_admin can see lakeTradingDemo clients", async () => {
    await storage.createOrUpdateClient({
      id: "lake",
      clientId: "lake",
      name: "Lake",
      lakeTradingDemo: true,
      organizationId: "demo-org",
      createdByUserId: "demo-owner",
    });
    const list = await storage.listClientsForUser("super-1", {
      role: "super_admin",
      organizationId: null,
    });
    expect(list.map((c) => c.clientId)).toEqual(["lake"]);
  });

  it("updateClientByClientId / deleteClientByClientId work via clientId", async () => {
    await storage.createOrUpdateClient({
      id: "C-7",
      clientId: "C-7",
      name: "Original",
      createdByUserId: "u",
    });
    const upd = await storage.updateClientByClientId("C-7", { name: "Renamed" });
    expect(upd?.name).toBe("Renamed");
    const ok = await storage.deleteClientByClientId("C-7");
    expect(ok).toBe(true);
    expect(await storage.getClientByClientId("C-7")).toBeUndefined();
  });
});

describe("Workbook GET tenant check (P3) — client-existence logic", () => {
  // Mirrors authorizeWorkbookAccess Step 1 (no-mongo branch). Asserts that
  // an unknown companyId is rejected and that cross-tenant access is denied.
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  async function authorize(
    companyId: string,
    user: { id: string; organizationId: string | null; role?: string },
  ): Promise<{ status: number }> {
    const memClient = await storage.getClientByClientId(companyId);
    if (!memClient) return { status: 404 };
    const clientOrgId = memClient.organizationId ?? null;
    const clientCreatorId = memClient.createdByUserId ?? null;
    const sameOrg = clientOrgId !== null && clientOrgId === user.organizationId;
    const sameUser = clientCreatorId === user.id;
    const isDemoClient = Boolean(memClient.lakeTradingDemo);
    const superAdmin = user.role === "super_admin";
    if (!sameOrg && !sameUser && !(isDemoClient && superAdmin)) {
      return { status: 403 };
    }
    return { status: 200 };
  }

  it("returns 404 for an unknown companyId (no leakage of scaffolded workbook)", async () => {
    const res = await authorize("C-does-not-exist", {
      id: "user-1",
      organizationId: "org-1",
    });
    expect(res.status).toBe(404);
  });

  it("returns 200 for the legitimate owner", async () => {
    await storage.createOrUpdateClient({
      id: "C-99",
      clientId: "C-99",
      name: "Mine",
      organizationId: "org-1",
      createdByUserId: "user-1",
    });
    const res = await authorize("C-99", { id: "user-1", organizationId: "org-1" });
    expect(res.status).toBe(200);
  });

  it("returns 403 for a stranger in a different org", async () => {
    await storage.createOrUpdateClient({
      id: "C-99",
      clientId: "C-99",
      name: "Theirs",
      organizationId: "org-1",
      createdByUserId: "user-1",
    });
    const res = await authorize("C-99", { id: "user-2", organizationId: "org-2" });
    expect(res.status).toBe(403);
  });

  it("returns 200 for a same-org colleague", async () => {
    await storage.createOrUpdateClient({
      id: "C-99",
      clientId: "C-99",
      name: "Shared",
      organizationId: "org-1",
      createdByUserId: "user-1",
    });
    const res = await authorize("C-99", { id: "user-2", organizationId: "org-1" });
    expect(res.status).toBe(200);
  });
});
