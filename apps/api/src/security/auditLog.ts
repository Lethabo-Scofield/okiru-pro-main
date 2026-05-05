/**
 * Append-only audit log.
 *
 * Persists security- and business-critical events. Updates and deletes via
 * Mongoose are blocked at the schema level; operators can only purge
 * historical data via direct DB access (for retention rotation), which
 * is intentional and documented.
 *
 * Events are ALWAYS written best-effort: a failure to record an audit
 * line MUST NOT break a real request, but it WILL emit a structured
 * error log for the operator to investigate.
 */
import type { Request, Response, NextFunction } from "express";
import mongoose, { Schema } from "mongoose";
import { v4 as uuid } from "uuid";
import { createLogger } from "../logger.js";
import { isMongoConnected } from "../../db.js";

const logger = createLogger("AuditLog");

export type AuditResult = "success" | "failure";

export interface AuditEventInput {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  result?: AuditResult;
  metadata?: Record<string, unknown>;
  /** Override the actor; defaults to req.session.userId */
  actorUserId?: string | null;
  /** Override the tenant; defaults to req.session.organizationId */
  organizationId?: string | null;
}

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
  },
  { collection: "auditLogs" },
);

// --- Append-only enforcement ---------------------------------------------
// Block any attempt to mutate or delete an audit row through the Mongoose
// query layer. This is defence-in-depth; the canonical guarantee is that
// the application never calls update/delete on this model. Direct shell
// access can still rotate data, which is a deliberate operational lever.

function blockMutation(this: { getQuery?: () => unknown }, next: (err?: Error) => void) {
  const err = new Error("auditLogs is append-only");
  (err as Error & { code: string }).code = "AUDIT_LOG_IMMUTABLE";
  logger.warn("Blocked mutation on append-only auditLogs collection", {
    query: this.getQuery?.(),
  });
  next(err);
}

auditLogSchema.pre("updateOne", blockMutation);
auditLogSchema.pre("updateMany", blockMutation);
auditLogSchema.pre("findOneAndUpdate", blockMutation);
auditLogSchema.pre("replaceOne", blockMutation);
auditLogSchema.pre("deleteOne", blockMutation);
auditLogSchema.pre("deleteMany", blockMutation);
auditLogSchema.pre("findOneAndDelete", blockMutation);
auditLogSchema.pre("findOneAndRemove" as "findOneAndDelete", blockMutation);

export const AuditLogModel =
  mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);

/** Synchronously build the row that would be written for a request+event. */
export function buildAuditRow(req: Request, event: AuditEventInput) {
  const session = (req.session as { userId?: string; organizationId?: string } | undefined) || {};
  return {
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
}

/** Fire-and-log audit writer. Never throws. */
export async function recordAudit(req: Request, event: AuditEventInput): Promise<void> {
  const row = buildAuditRow(req, event);
  // Always emit a structured log line so the event is captured even when
  // MongoDB is unavailable.
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

  if (!isMongoConnected()) return;

  try {
    await AuditLogModel.create(row);
  } catch (err) {
    // Critical: do not break the user request. Surface as an error log.
    logger.error("Failed to persist audit event", err as Error, {
      action: row.action,
      resourceType: row.resourceType,
    });
  }
}

/**
 * Express middleware that emits an audit event after the response is sent.
 * `result` is inferred from the HTTP status code (2xx/3xx => success).
 *
 * Use sparingly — for high-traffic GETs prefer an explicit `recordAudit`
 * call inside the handler so you can include resource IDs.
 */
export function auditAction(opts: {
  action: string;
  resourceType: string;
  resourceIdFrom?: (req: Request) => string | null | undefined;
  metadataFrom?: (req: Request) => Record<string, unknown>;
}) {
  return function auditActionMiddleware(req: Request, res: Response, next: NextFunction) {
    res.on("finish", () => {
      const ok = res.statusCode < 400;
      void recordAudit(req, {
        action: opts.action,
        resourceType: opts.resourceType,
        resourceId: opts.resourceIdFrom?.(req) ?? null,
        result: ok ? "success" : "failure",
        metadata: {
          status: res.statusCode,
          ...(opts.metadataFrom?.(req) ?? {}),
        },
      });
    });
    next();
  };
}

export interface AuditQuery {
  organizationId?: string;
  actorUserId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  result?: AuditResult;
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
}

/**
 * Read-side query for the admin endpoint.
 *
 * Defence-in-depth: callers MUST supply an `organizationId` (the route
 * pins it to the caller's session). We refuse to run an unscoped query
 * even if asked, so a future bug at the route layer cannot leak audit
 * data across tenants. Use `queryAuditLogsUnscoped` (not exported) only
 * for trusted internal tooling.
 */
export async function queryAuditLogs(q: AuditQuery) {
  if (!q.organizationId) {
    throw new Error("queryAuditLogs requires an organizationId for tenant scoping");
  }
  const filter: Record<string, unknown> = {};
  filter.organizationId = q.organizationId;
  if (q.actorUserId) filter.actorUserId = q.actorUserId;
  // (organizationId already applied above)
  if (q.action) filter.action = q.action;
  if (q.resourceType) filter.resourceType = q.resourceType;
  if (q.resourceId) filter.resourceId = q.resourceId;
  if (q.result) filter.result = q.result;
  if (q.from || q.to) {
    const range: Record<string, Date> = {};
    if (q.from) range.$gte = q.from;
    if (q.to) range.$lte = q.to;
    filter.timestamp = range;
  }
  const page = Math.max(1, q.page ?? 1);
  const limit = Math.min(500, Math.max(1, q.limit ?? 100));
  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    AuditLogModel.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
    AuditLogModel.countDocuments(filter),
  ]);
  return { rows, total, page, limit };
}
