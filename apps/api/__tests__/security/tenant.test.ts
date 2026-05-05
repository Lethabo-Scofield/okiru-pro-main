/**
 * Tenant scoping middleware tests.
 *
 * These tests use lightweight Express req/res mocks rather than a real
 * server so they stay deterministic and DB-free. recordAudit (called on
 * cross-tenant denials) gracefully no-ops when MongoDB is not connected.
 */
import { describe, it, expect, vi } from "vitest";
import {
  getTenantContext,
  requireTenantContext,
  assertSameTenant,
  requireTenantOwnership,
} from "../../src/security/tenant.js";

function mockReq(opts: {
  userId?: string;
  organizationId?: string;
  params?: Record<string, string>;
}) {
  return {
    session: {
      ...(opts.userId !== undefined ? { userId: opts.userId } : {}),
      ...(opts.organizationId !== undefined ? { organizationId: opts.organizationId } : {}),
    },
    params: opts.params ?? {},
    headers: {},
    method: "GET",
    path: "/test",
    originalUrl: "/test",
    ip: "127.0.0.1",
  } as unknown as import("express").Request;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as import("express").Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
}

describe("getTenantContext", () => {
  it("returns null when session is missing userId", () => {
    expect(getTenantContext(mockReq({ organizationId: "org-1" }))).toBeNull();
  });

  it("returns null when session is missing organizationId", () => {
    expect(getTenantContext(mockReq({ userId: "u-1" }))).toBeNull();
  });

  it("returns context when both are present", () => {
    expect(getTenantContext(mockReq({ userId: "u-1", organizationId: "org-1" }))).toEqual({
      userId: "u-1",
      organizationId: "org-1",
    });
  });
});

describe("requireTenantContext", () => {
  it("throws a 401-tagged error when context is missing", () => {
    try {
      requireTenantContext(mockReq({}));
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as Error & { status?: number }).status).toBe(401);
    }
  });

  it("returns the context when present", () => {
    const ctx = requireTenantContext(mockReq({ userId: "u-1", organizationId: "org-1" }));
    expect(ctx).toEqual({ userId: "u-1", organizationId: "org-1" });
  });
});

describe("assertSameTenant", () => {
  it("404s when the record is null", async () => {
    const req = mockReq({ userId: "u-1", organizationId: "org-1" });
    const res = mockRes();
    const ok = await assertSameTenant(req, res, null, "client", "c-1");
    expect(ok).toBe(false);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("401s when the caller has no session", async () => {
    const req = mockReq({});
    const res = mockRes();
    const ok = await assertSameTenant(req, res, { organizationId: "org-1" }, "client", "c-1");
    expect(ok).toBe(false);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("403s and audits when the record belongs to a different tenant", async () => {
    const req = mockReq({ userId: "u-1", organizationId: "org-1" });
    const res = mockRes();
    const ok = await assertSameTenant(req, res, { organizationId: "org-OTHER" }, "client", "c-1");
    expect(ok).toBe(false);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("403s when the record has no organizationId", async () => {
    const req = mockReq({ userId: "u-1", organizationId: "org-1" });
    const res = mockRes();
    const ok = await assertSameTenant(req, res, { organizationId: null }, "client", "c-1");
    expect(ok).toBe(false);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("returns true when the record belongs to the caller's tenant", async () => {
    const req = mockReq({ userId: "u-1", organizationId: "org-1" });
    const res = mockRes();
    const ok = await assertSameTenant(req, res, { organizationId: "org-1" }, "client", "c-1");
    expect(ok).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe("requireTenantOwnership", () => {
  it("calls next() on same-tenant access", async () => {
    const req = mockReq({ userId: "u-1", organizationId: "org-1", params: { id: "c-1" } });
    const res = mockRes();
    const next = vi.fn();
    const mw = requireTenantOwnership({
      resourceType: "client",
      loader: async () => ({ organizationId: "org-1" }),
    });
    await mw(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("denies cross-tenant access without calling next()", async () => {
    const req = mockReq({ userId: "u-1", organizationId: "org-1", params: { id: "c-1" } });
    const res = mockRes();
    const next = vi.fn();
    const mw = requireTenantOwnership({
      resourceType: "client",
      loader: async () => ({ organizationId: "org-OTHER" }),
    });
    await mw(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("404s when loader returns null", async () => {
    const req = mockReq({ userId: "u-1", organizationId: "org-1", params: { id: "missing" } });
    const res = mockRes();
    const next = vi.fn();
    const mw = requireTenantOwnership({
      resourceType: "client",
      loader: async () => null,
    });
    await mw(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("forwards loader errors to next(err)", async () => {
    const req = mockReq({ userId: "u-1", organizationId: "org-1", params: { id: "c-1" } });
    const res = mockRes();
    const next = vi.fn();
    const boom = new Error("DB exploded");
    const mw = requireTenantOwnership({
      resourceType: "client",
      loader: async () => {
        throw boom;
      },
    });
    await mw(req, res, next);
    expect(next).toHaveBeenCalledWith(boom);
  });
});
