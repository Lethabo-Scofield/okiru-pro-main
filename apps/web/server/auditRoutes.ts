/**
 * Client-retrievable audit trail.
 *
 * A client being able to ask "who touched our data, and when" without going
 * through us is a due-diligence requirement, not a convenience. These routes are
 * scoped to the caller's own organisation and cannot be widened by a query
 * parameter: an organisation administrator sees their organisation, platform
 * staff can name another one explicitly, and nobody else reaches this at all.
 *
 * Reading the trail is itself an auditable act, so each export writes its own
 * entry.
 */
import type { Express, Request, Response } from "express";
import mongoose from "mongoose";
import { createLogger } from "./logger";
import { hasAnyRole, isPlatformAdmin } from "./roles";
import { recordAudit } from "./securityAudit.js";
import {
  AUDIT_RETENTION_DAYS,
  auditRecordIsIntact,
  runRetentionPass,
  signingConfigured,
  verifyDay,
} from "./auditRetention.js";

const logger = createLogger("AuditRoutes");

const MAX_PAGE_SIZE = 1000;
const MAX_EXPORT_ROWS = 50_000;

function mongoReady(): boolean {
  return mongoose.connection.readyState === 1;
}

/** Resolve which organisation's trail this caller may read. */
function scopeFor(req: Request): { ok: true; organizationId: string | null } | { ok: false; status: number; message: string } {
  const user = (req as any).user;
  if (!user) return { ok: false, status: 401, message: "Not authenticated" };

  const requested = typeof req.query.organizationId === "string" ? req.query.organizationId : null;

  if (isPlatformAdmin(user)) {
    // Platform staff may read across tenants, but only by naming one; there is
    // no unscoped "everything" read by accident.
    return { ok: true, organizationId: requested || user.organizationId || null };
  }

  if (!hasAnyRole(user, "admin")) {
    return { ok: false, status: 403, message: "Only an organisation administrator can read the audit trail" };
  }

  if (!user.organizationId) {
    return { ok: false, status: 403, message: "This account is not attached to an organisation" };
  }

  if (requested && requested !== user.organizationId) {
    return { ok: false, status: 403, message: "You can only read your own organisation's audit trail" };
  }

  return { ok: true, organizationId: user.organizationId };
}

function parseRange(req: Request): { from: Date; to: Date } {
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const from = req.query.from ? new Date(String(req.query.from)) : defaultFrom;
  const to = req.query.to ? new Date(String(req.query.to)) : now;
  return {
    from: Number.isNaN(from.getTime()) ? defaultFrom : from,
    to: Number.isNaN(to.getTime()) ? now : to,
  };
}

function buildFilter(organizationId: string | null, req: Request): Record<string, unknown> {
  const { from, to } = parseRange(req);
  const filter: Record<string, unknown> = { timestamp: { $gte: from, $lte: to } };
  if (organizationId) filter.organizationId = organizationId;
  const action = typeof req.query.action === "string" ? req.query.action.trim() : "";
  if (action) filter.action = action.endsWith("*") ? { $regex: `^${action.slice(0, -1)}` } : action;
  const result = typeof req.query.result === "string" ? req.query.result.trim() : "";
  if (result === "success" || result === "failure") filter.result = result;
  const actor = typeof req.query.actorUserId === "string" ? req.query.actorUserId.trim() : "";
  if (actor) filter.actorUserId = actor;
  return filter;
}

const CSV_COLUMNS = [
  "timestamp",
  "action",
  "result",
  "actorUserId",
  "organizationId",
  "resourceType",
  "resourceId",
  "ip",
  "method",
  "path",
  "requestId",
  "integrity",
] as const;

function csvCell(value: unknown): string {
  if (value == null) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  // A leading =, +, - or @ makes a spreadsheet treat the cell as a formula.
  const guarded = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export function registerAuditRoutes(
  app: Express,
  requireAuth: (req: Request, res: Response, next: (err?: unknown) => void) => void,
): void {
  /** Page through the trail. */
  app.get("/api/audit/logs", requireAuth as any, async (req: Request, res: Response) => {
    const scope = scopeFor(req);
    if (!scope.ok) return res.status(scope.status).json({ message: scope.message });
    if (!mongoReady()) return res.status(503).json({ message: "Audit store is not available" });

    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(req.query.limit) || 100));
    const skip = Math.max(0, Number(req.query.skip) || 0);

    try {
      const col = mongoose.connection.db!.collection("auditLogs");
      const filter = buildFilter(scope.organizationId, req);
      const [rows, total] = await Promise.all([
        col.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limit).toArray(),
        col.countDocuments(filter),
      ]);
      res.json({
        total,
        skip,
        limit,
        retentionDays: AUDIT_RETENTION_DAYS,
        tamperEvident: signingConfigured(),
        entries: rows.map((row: any) => ({
          id: row.id,
          timestamp: row.timestamp,
          action: row.action,
          result: row.result,
          actorUserId: row.actorUserId,
          organizationId: row.organizationId,
          resourceType: row.resourceType,
          resourceId: row.resourceId,
          ip: row.ip,
          method: row.method,
          path: row.path,
          requestId: row.requestId,
          metadata: row.metadata,
          integrity: row.signature ? (auditRecordIsIntact(row) ? "verified" : "FAILED") : "unsigned",
        })),
      });
    } catch (err) {
      logger.error("Audit query failed", err as Error);
      res.status(500).json({ message: "Could not read the audit trail" });
    }
  });

  /** Download the trail as CSV or JSON. */
  app.get("/api/audit/export", requireAuth as any, async (req: Request, res: Response) => {
    const scope = scopeFor(req);
    if (!scope.ok) return res.status(scope.status).json({ message: scope.message });
    if (!mongoReady()) return res.status(503).json({ message: "Audit store is not available" });

    const format = String(req.query.format || "csv").toLowerCase() === "json" ? "json" : "csv";
    const { from, to } = parseRange(req);
    const stamp = `${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}`;
    const filename = `okiru-audit-${scope.organizationId || "all"}-${stamp}.${format}`;

    try {
      const col = mongoose.connection.db!.collection("auditLogs");
      const filter = buildFilter(scope.organizationId, req);
      const rows = await col.find(filter).sort({ timestamp: 1 }).limit(MAX_EXPORT_ROWS).toArray();

      await recordAudit(req, {
        action: "audit.exported",
        resourceType: "auditLog",
        resourceId: scope.organizationId,
        metadata: { rows: rows.length, from, to, format },
      });

      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

      if (format === "json") {
        res.setHeader("Content-Type", "application/json");
        return res.send(
          JSON.stringify(
            {
              organizationId: scope.organizationId,
              from,
              to,
              rows: rows.length,
              truncated: rows.length >= MAX_EXPORT_ROWS,
              retentionDays: AUDIT_RETENTION_DAYS,
              entries: rows.map((row: any) => ({
                ...row,
                _id: undefined,
                integrity: row.signature ? (auditRecordIsIntact(row) ? "verified" : "FAILED") : "unsigned",
              })),
            },
            null,
            2,
          ),
        );
      }

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      const lines = [CSV_COLUMNS.join(",")];
      for (const row of rows as any[]) {
        const integrity = row.signature ? (auditRecordIsIntact(row) ? "verified" : "FAILED") : "unsigned";
        lines.push(
          CSV_COLUMNS.map((c) => csvCell(c === "integrity" ? integrity : row[c])).join(","),
        );
      }
      // A BOM so Excel opens the file as UTF-8 rather than the system codepage.
      res.send("﻿" + lines.join("\r\n") + "\r\n");
    } catch (err) {
      logger.error("Audit export failed", err as Error);
      res.status(500).json({ message: "Could not export the audit trail" });
    }
  });

  /**
   * Integrity report: re-derives each day's digest and compares it with the seal
   * taken when the day closed. Platform staff only — it describes the whole
   * store, not one tenant's slice of it.
   */
  app.get("/api/audit/integrity", requireAuth as any, async (req: Request, res: Response) => {
    if (!isPlatformAdmin((req as any).user)) {
      return res.status(403).json({ message: "Not permitted" });
    }
    if (!mongoReady()) return res.status(503).json({ message: "Audit store is not available" });

    const days = Math.min(90, Math.max(1, Number(req.query.days) || 14));
    const out = [];
    for (let i = 1; i <= days; i += 1) {
      const day = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      out.push(await verifyDay(day));
    }
    res.json({
      tamperEvident: signingConfigured(),
      retentionDays: AUDIT_RETENTION_DAYS,
      days: out,
      intact: out.every((d) => !d.sealed || (d.matches && !d.invalidRecords)),
    });
  });

  /** Force a retention/seal pass. Platform staff only. */
  app.post("/api/audit/retention/run", requireAuth as any, async (req: Request, res: Response) => {
    if (!isPlatformAdmin((req as any).user)) {
      return res.status(403).json({ message: "Not permitted" });
    }
    try {
      const result = await runRetentionPass();
      await recordAudit(req, {
        action: "audit.retention.run",
        resourceType: "auditLog",
        metadata: result,
      });
      res.json(result);
    } catch (err) {
      logger.error("Retention pass failed", err as Error);
      res.status(500).json({ message: "Retention pass failed" });
    }
  });
}
