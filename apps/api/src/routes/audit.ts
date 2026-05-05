/**
 * Admin endpoint for querying the append-only audit log.
 *
 * Guarded by `requirePermission('audit.read')`. Tenant scoping is enforced
 * at the query layer: callers can only see events for their own
 * organization. A platform-admin can pass `?organizationId=` to override
 * (TODO: gate this on a future `platform.admin` permission once we
 * introduce a platform-level role).
 */
import { Router, type Request as ExpressRequest, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { PERMISSIONS, requirePermission, queryAuditLogs, validateQuery } from "../security/index.js";

type Request = ExpressRequest<Record<string, string>, any, any, Record<string, string>>;

const router = Router();

const querySchema = z.object({
  actorUserId: z.string().optional(),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  result: z.enum(["success", "failure"]).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  organizationId: z.string().optional(),
});

router.get(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.AUDIT_READ),
  validateQuery(querySchema),
  async (req: Request, res: Response) => {
    const sessionOrg = req.session.organizationId;
    // Hard-fail if the session has no organization. Without this, a
    // session that never set `organizationId` (for example a freshly
    // logged-in user whose org was not attached) would otherwise read
    // every tenant's audit trail because `queryAuditLogs` only applies
    // the org filter when truthy.
    if (!sessionOrg) {
      return res.status(403).json({
        message: "Audit log access requires an organization-scoped session",
      });
    }
    // Always pin to the caller's org. We intentionally ignore any incoming
    // `organizationId` query param so a tenant admin cannot peek at any
    // other tenant's audit trail.
    const result = await queryAuditLogs({
      organizationId: sessionOrg,
      actorUserId: req.query.actorUserId as string | undefined,
      action: req.query.action as string | undefined,
      resourceType: req.query.resourceType as string | undefined,
      resourceId: req.query.resourceId as string | undefined,
      result: req.query.result as "success" | "failure" | undefined,
      from: req.query.from ? new Date(req.query.from as string) : undefined,
      to: req.query.to ? new Date(req.query.to as string) : undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    return res.json(result);
  },
);

export default router;
