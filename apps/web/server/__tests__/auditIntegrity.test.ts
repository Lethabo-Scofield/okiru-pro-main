import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  auditRecordIsIntact,
  canonicalAuditPayload,
  signAuditRecord,
} from "../auditRetention";

const sampleRow = {
  id: "3f0d1a2b-0000-4000-8000-000000000001",
  timestamp: new Date("2026-09-17T08:30:00.000Z"),
  actorUserId: "user-1",
  organizationId: "org-1",
  action: "client.exported",
  resourceType: "client",
  resourceId: "client-9",
  result: "success",
  ip: "196.25.1.1",
  userAgent: "test",
  requestId: "req-1",
  method: "POST",
  path: "/api/clients/client-9/export",
  metadata: { format: "docx" },
};

describe("audit record signing", () => {
  beforeAll(() => {
    process.env.AUDIT_SIGNING_KEY = "test-signing-key";
  });

  it("signs deterministically regardless of key order", () => {
    const reordered = {
      metadata: sampleRow.metadata,
      path: sampleRow.path,
      method: sampleRow.method,
      requestId: sampleRow.requestId,
      userAgent: sampleRow.userAgent,
      ip: sampleRow.ip,
      result: sampleRow.result,
      resourceId: sampleRow.resourceId,
      resourceType: sampleRow.resourceType,
      action: sampleRow.action,
      organizationId: sampleRow.organizationId,
      actorUserId: sampleRow.actorUserId,
      timestamp: sampleRow.timestamp,
      id: sampleRow.id,
    };
    expect(signAuditRecord(reordered)).toBe(signAuditRecord(sampleRow));
  });

  it("survives a JSON round trip, which is how a record comes back from the driver", () => {
    const roundTripped = JSON.parse(JSON.stringify(sampleRow));
    expect(signAuditRecord(roundTripped)).toBe(signAuditRecord(sampleRow));
  });

  it("detects a changed field", () => {
    const signed = { ...sampleRow, signature: signAuditRecord(sampleRow) };
    expect(auditRecordIsIntact(signed)).toBe(true);

    for (const field of ["actorUserId", "action", "result", "resourceId", "ip", "path"] as const) {
      const tampered = { ...signed, [field]: "changed" };
      expect(auditRecordIsIntact(tampered)).toBe(false);
    }

    const backdated = { ...signed, timestamp: new Date("2020-01-01T00:00:00.000Z") };
    expect(auditRecordIsIntact(backdated)).toBe(false);

    const rewrittenMetadata = { ...signed, metadata: { format: "pptx" } };
    expect(auditRecordIsIntact(rewrittenMetadata)).toBe(false);
  });

  it("treats an unsigned record as not intact rather than silently passing it", () => {
    expect(auditRecordIsIntact(sampleRow)).toBe(false);
    expect(auditRecordIsIntact({ ...sampleRow, signature: "" })).toBe(false);
  });

  it("separates fields, so moving text across a boundary changes the signature", () => {
    const a = signAuditRecord({ ...sampleRow, action: "client", resourceType: "exported" });
    const b = signAuditRecord({ ...sampleRow, action: "clientexported", resourceType: "" });
    expect(a).not.toBe(b);
  });

  it("uses a unit separator between fields", () => {
    expect(canonicalAuditPayload(sampleRow).split("")).toHaveLength(12);
  });
});

describe("cross-service signature agreement", () => {
  /**
   * apps/api and apps/web both write into the same `auditLogs` collection and
   * the daily seal verifies every record in it, so the two canonical forms must
   * stay byte-identical. Comparing the source is cruder than importing the API
   * copy, but the API module pulls in its own database layer at import time.
   */
  it("keeps the two canonical implementations identical", () => {
    const extract = (path: string) => {
      const source = readFileSync(resolve(__dirname, path), "utf8");
      const start = source.indexOf("const ts =");
      const end = source.indexOf("].join(", start);
      expect(start, `canonical payload not found in ${path}`).toBeGreaterThan(-1);
      return source
        .slice(start, end)
        .replace(/\s+/g, " ")
        .trim();
    };

    const web = extract("../auditRetention.ts");
    const api = extract("../../../api/src/security/auditLog.ts");
    expect(api).toBe(web);
  });

  it("keeps the same separator in both", () => {
    const sep = (path: string) => {
      const source = readFileSync(resolve(__dirname, path), "utf8");
      const match = source.match(/\]\.join\((".*?")\);/);
      return match?.[1];
    };
    expect(sep("../auditRetention.ts")).toBe('"\\u001f"');
    expect(sep("../../../api/src/security/auditLog.ts")).toBe('"\\u001f"');
  });
});
