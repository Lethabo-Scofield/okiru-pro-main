/**
 * Audit log tests:
 *   - buildAuditRow shape
 *   - recordAudit is fire-and-forget and never throws
 *   - append-only pre-hooks reject update/delete operations
 *
 * No live MongoDB connection is required: the mongoose model's pre-hooks
 * for update/delete fire before any I/O, so we can assert their behaviour
 * by invoking the hook function directly with a minimal `this`.
 */
import { describe, it, expect } from "vitest";
import {
  buildAuditRow,
  recordAudit,
  queryAuditLogs,
  AuditLogModel,
} from "../../src/security/auditLog.js";

function mockReq(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    session: { userId: "u-1", organizationId: "org-1" },
    headers: { "user-agent": "vitest", "x-request-id": "req-abc" },
    method: "POST",
    originalUrl: "/api/test",
    path: "/api/test",
    ip: "10.0.0.1",
    ...overrides,
  } as unknown as import("express").Request;
}

describe("buildAuditRow", () => {
  it("populates a complete row from the request and event", () => {
    const row = buildAuditRow(mockReq(), {
      action: "client.create",
      resourceType: "client",
      resourceId: "c-1",
      result: "success",
      metadata: { name: "Acme" },
    });
    expect(row.action).toBe("client.create");
    expect(row.resourceType).toBe("client");
    expect(row.resourceId).toBe("c-1");
    expect(row.result).toBe("success");
    expect(row.actorUserId).toBe("u-1");
    expect(row.organizationId).toBe("org-1");
    expect(row.method).toBe("POST");
    expect(row.path).toBe("/api/test");
    expect(row.ip).toBe("10.0.0.1");
    expect(row.userAgent).toBe("vitest");
    expect(row.requestId).toBe("req-abc");
    expect(row.metadata).toEqual({ name: "Acme" });
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.timestamp).toBeInstanceOf(Date);
  });

  it("defaults result to 'success' when omitted", () => {
    const row = buildAuditRow(mockReq(), { action: "user.login", resourceType: "user" });
    expect(row.result).toBe("success");
  });

  it("respects explicit actorUserId / organizationId overrides (including nulls)", () => {
    const row = buildAuditRow(mockReq(), {
      action: "user.register",
      resourceType: "user",
      actorUserId: null,
      organizationId: null,
    });
    expect(row.actorUserId).toBeNull();
    expect(row.organizationId).toBeNull();
  });

  it("falls back to nulls when session is empty", () => {
    const row = buildAuditRow(
      mockReq({ session: {} }),
      { action: "user.login.failed", resourceType: "user" },
    );
    expect(row.actorUserId).toBeNull();
    expect(row.organizationId).toBeNull();
  });
});

describe("recordAudit", () => {
  it("never throws even when MongoDB is not connected", async () => {
    await expect(
      recordAudit(mockReq(), { action: "test.event", resourceType: "test" }),
    ).resolves.toBeUndefined();
  });
});

describe("queryAuditLogs tenant scoping", () => {
  it("refuses to run when organizationId is missing", async () => {
    await expect(queryAuditLogs({} as Parameters<typeof queryAuditLogs>[0])).rejects.toThrow(
      /organizationId/i,
    );
  });

  it("refuses to run when organizationId is empty string", async () => {
    await expect(queryAuditLogs({ organizationId: "" })).rejects.toThrow(/organizationId/i);
  });
});

describe("auditLogs append-only hooks", () => {
  // Pull the schema off the model so we can introspect the registered hooks.
  // mongoose stores middleware on schema.s.hooks. We verify by counting the
  // pre-hooks registered for each blocked op.
  const schema = (AuditLogModel as unknown as { schema: { s: { hooks: any } } }).schema;

  function preHooksFor(opName: string): Array<(...args: unknown[]) => unknown> {
    const hooks = schema.s.hooks._pres?.get(opName) ?? schema.s.hooks._pres?.[opName] ?? [];
    return Array.from(hooks).map((h: any) => h.fn ?? h);
  }

  const blockedOps = [
    "updateOne",
    "updateMany",
    "findOneAndUpdate",
    "replaceOne",
    "deleteOne",
    "deleteMany",
    "findOneAndDelete",
  ];

  for (const op of blockedOps) {
    it(`registers a blocking pre-hook for ${op}`, () => {
      const hooks = preHooksFor(op);
      expect(hooks.length).toBeGreaterThan(0);
    });

    it(`pre-hook for ${op} calls next() with an immutability error`, () => {
      const hooks = preHooksFor(op);
      const fn = hooks[0];
      let captured: Error | undefined;
      fn.call(
        { getQuery: () => ({}) },
        (err?: Error) => {
          captured = err;
        },
      );
      expect(captured).toBeInstanceOf(Error);
      expect(captured?.message).toMatch(/append-only/i);
      expect((captured as Error & { code?: string })?.code).toBe("AUDIT_LOG_IMMUTABLE");
    });
  }
});
