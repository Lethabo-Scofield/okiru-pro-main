/**
 * Integration tests for the /api/clients and /api/workbook in-memory fallback
 * (P1 + P3 on lethabo/quality-assurance).
 *
 * Runs against the dev server on http://localhost:5000 — the same pattern as
 * routes.test.ts. These tests assume the server is started without MongoDB
 * configured, which is the default Replit dev configuration.
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  canAccessClient,
  createClient as memCreateClient,
  listClientsForTenant,
  __resetClientsMemoryStore,
  type MemoryClient,
} from "../clientsMemoryStore";

// In Replit the session cookie is marked Secure, so direct http://localhost
// requests never receive a Set-Cookie. Fall back to the public HTTPS proxy
// when REPLIT_DEV_DOMAIN is set so the session round-trips correctly.
const BASE_URL =
  process.env.WEB_BASE_URL ||
  (process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : "http://localhost:5000");

interface ApiResponse<T = any> {
  status: number;
  body: T;
}

class TestClient {
  private cookie = "";

  async request<T = any>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    };
    if (this.cookie) headers["Cookie"] = this.cookie;

    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
      redirect: "manual",
    });
    // Only capture the session cookie once; later responses may add other
    // cookies (CSRF, telemetry) that would corrupt the simple split(';')[0].
    if (!this.cookie) {
      const setCookie = res.headers.get("set-cookie");
      if (setCookie) {
        const sid = setCookie.split(/,(?=[^;]+=)/).find((c) => /okiru\.web\.sid=/.test(c));
        const chosen = sid || setCookie;
        this.cookie = chosen.split(";")[0].trim();
      }
    }
    const contentType = res.headers.get("content-type") || "";
    const body = contentType.includes("json") ? await res.json() : await res.text();
    return { status: res.status, body: body as T };
  }
}

async function isServerUp(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/me`, { redirect: "manual" });
    return res.status === 401 || res.status === 200;
  } catch {
    return false;
  }
}

describe("clientsMemoryStore (unit)", () => {
  beforeAll(() => __resetClientsMemoryStore());

  const baseDoc = (overrides: Partial<MemoryClient> = {}): MemoryClient => ({
    clientId: overrides.clientId ?? "C-00001",
    name: overrides.name ?? "Acme",
    financialYear: "2026",
    industrySector: null,
    eapProvince: null,
    revenue: 0,
    npat: 0,
    leviableAmount: 0,
    organizationId: overrides.organizationId ?? "org_a",
    createdByUserId: overrides.createdByUserId ?? "user_a",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  it("listClientsForTenant filters by org or creator and orders newest first", () => {
    __resetClientsMemoryStore();
    memCreateClient(baseDoc({ clientId: "C-1", organizationId: "org_a", createdByUserId: "u1" }));
    // Different org, different creator — should not be visible to user u1/org_a.
    memCreateClient(baseDoc({ clientId: "C-2", organizationId: "org_b", createdByUserId: "u2" }));
    // Same creator, no org — visible.
    memCreateClient(
      baseDoc({ clientId: "C-3", organizationId: null, createdByUserId: "u1" }),
    );

    const list = listClientsForTenant("u1", "org_a");
    const ids = list.map((c) => c.clientId).sort();
    expect(ids).toEqual(["C-1", "C-3"]);
  });

  it("canAccessClient denies a stranger and allows same-org / same-creator", () => {
    const c = baseDoc({ organizationId: "org_a", createdByUserId: "owner" });
    expect(canAccessClient(c, "owner", null)).toBe(true);
    expect(canAccessClient(c, "other", "org_a")).toBe(true);
    expect(canAccessClient(c, "stranger", "org_b")).toBe(false);
    expect(canAccessClient(c, "stranger", null)).toBe(false);
  });

  it("canAccessClient denies cross-tenant access on null-tenancy records", () => {
    // Records with no organizationId AND no createdByUserId must never be
    // accessible via the in-memory fallback — this matches the production
    // policy in loadClientWithAccess and prevents accidental IDOR.
    const orphan = baseDoc({ organizationId: null, createdByUserId: null });
    expect(canAccessClient(orphan, "anyone", "any_org")).toBe(false);
    expect(canAccessClient(orphan, "anyone", null)).toBe(false);
  });
});

describe("/api/clients + /api/workbook in-memory fallback (HTTP)", () => {
  const client = new TestClient();
  let serverUp = false;
  let createdClientId: string | null = null;

  beforeAll(async () => {
    serverUp = await isServerUp();
  });

  it("logs in as the seeded demo user", async () => {
    if (!serverUp) return;
    const { status } = await client.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: "demo", password: "demo" }),
    });
    expect(status).toBe(200);
  });

  it("GET /api/clients returns 200 with an array (no Mongo, no 503/500)", async () => {
    if (!serverUp) return;
    const { status, body } = await client.request("/api/clients");
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it("POST /api/clients creates a client and returns 200 with a clientId", async () => {
    if (!serverUp) return;
    const { status, body } = await client.request("/api/clients", {
      method: "POST",
      body: JSON.stringify({ name: `Fallback Test ${Date.now()}` }),
    });
    expect(status).toBe(200);
    expect(body.clientId).toMatch(/^C-\d{5}$/);
    expect(body.createdByUserId).toBeTruthy();
    createdClientId = body.clientId;
  });

  it("GET /api/clients now includes the new client", async () => {
    if (!serverUp || !createdClientId) return;
    const { status, body } = await client.request("/api/clients");
    expect(status).toBe(200);
    const ids = (body as any[]).map((c) => c.clientId);
    expect(ids).toContain(createdClientId);
  });

  it("GET /api/workbook/:owned returns 200 for the legitimate owner", async () => {
    if (!serverUp || !createdClientId) return;
    const { status, body } = await client.request(`/api/workbook/${createdClientId}`);
    expect(status).toBe(200);
    expect(body.companyId).toBe(createdClientId);
  });

  it("GET /api/workbook/:unknown returns 404 (no scaffolded workbook)", async () => {
    if (!serverUp) return;
    const unknown = `C-99${Date.now().toString().slice(-3)}`;
    const { status, body } = await client.request(`/api/workbook/${unknown}`);
    expect(status).toBe(404);
    expect(body.error).toBeDefined();
  });

  it("Submit still returns a clean 503 when Mongo is absent", async () => {
    if (!serverUp || !createdClientId) return;
    const { status, body } = await client.request(
      `/api/workbook/${createdClientId}/submit`,
      { method: "POST" },
    );
    expect(status).toBe(503);
    expect(String(body.error || "")).toMatch(/Database unavailable/i);
  });
});
