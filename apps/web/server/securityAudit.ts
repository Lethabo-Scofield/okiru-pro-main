/**
 * Web-side audit log writer.
 *
 * Writes to the SAME `auditLogs` MongoDB collection used by the API
 * (`apps/api/src/security/auditLog.ts`) so the audit trail is unified
 * across both servers. Schema kept intentionally minimal here — the
 * full schema is owned by the API; this writer only needs to insert.
 *
 * Failures are logged but never thrown.
 */
import mongoose, { Schema } from "mongoose";
import { v4 as uuid } from "uuid";
import type { Request } from "express";
import { createLogger } from "./logger.js";
import { signAuditRecord } from "./auditRetention.js";

const logger = createLogger("SecurityAudit");

const auditLogSchema = new Schema(
  {
    id: { type: String, default: uuid, unique: true },
    timestamp: { type: Date, default: Date.now, index: true },
    actorUserId: { type: String, default: null, index: true },
    organizationId: { type: String, default: null, index: true },
    action: { type: String, required: true, index: true },
    resourceType: { type: String, required: true, index: true },
    resourceId: { type: String, default: null, index: true },
    result: { type: String, enum: ["success", "failure"], required: true, index: true },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
    requestId: { type: String, default: null, index: true },
    method: { type: String, default: null },
    path: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
    // Tamper evidence. An HMAC over the record's own contents, so altering any
    // field in the database invalidates it. See auditRetention.ts for the daily
    // seal that makes deletions detectable too.
    signature: { type: String, default: null },
  },
  { collection: "auditLogs" },
);

const AuditLogModel =
  mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);

/** See the note at the write site — keeps a slow database off the login path. */
const AUDIT_WRITE_TIMEOUT_MS = Number(process.env.AUDIT_WRITE_TIMEOUT_MS || 2000);

export interface WebAuditEvent {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  result?: "success" | "failure";
  metadata?: Record<string, unknown>;
  actorUserId?: string | null;
  organizationId?: string | null;
}

export async function recordAudit(req: Request, event: WebAuditEvent): Promise<void> {
  const session = (req.session as { userId?: string; organizationId?: string } | undefined) || {};
  const row: Record<string, any> = {
    id: uuid(),
    timestamp: new Date(),
    actorUserId: event.actorUserId !== undefined ? event.actorUserId : session.userId ?? null,
    organizationId:
      event.organizationId !== undefined ? event.organizationId : session.organizationId ?? null,
    action: event.action,
    resourceType: event.resourceType,
    resourceId: event.resourceId ?? null,
    result: event.result ?? "success",
    ip: req.ip || (req.headers["x-forwarded-for"] as string) || null,
    userAgent: (req.headers["user-agent"] as string) || null,
    requestId: (req.headers["x-request-id"] as string) || null,
    method: req.method,
    path: req.originalUrl || req.path,
    metadata: event.metadata ?? {},
  };
  row.signature = signAuditRecord(row);

  // Always log structurally — captures the event even when MongoDB is down.
  logger.info(`audit:${row.action}`, {
    audit: true,
    action: row.action,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    result: row.result,
    actorUserId: row.actorUserId,
    organizationId: row.organizationId,
    requestId: row.requestId,
  });

  if (mongoose.connection.readyState !== 1) return;

  try {
    // Hard ceiling on how long an audit write may hold up the caller. Mongoose
    // buffers operations for ten seconds when the driver cannot reach a server,
    // and a sign-in must not inherit that: the structured log line above has
    // already captured the event either way.
    await Promise.race([
      AuditLogModel.create(row),
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error("audit write timed out")), AUDIT_WRITE_TIMEOUT_MS).unref?.(),
      ),
    ]);
  } catch (err) {
    logger.error("Failed to persist web audit event", err as Error, {
      action: row.action,
      resourceType: row.resourceType,
    });
  }
}
