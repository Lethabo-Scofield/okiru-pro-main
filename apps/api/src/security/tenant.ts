/**
 * Tenant scoping helpers.
 *
 * Every tenant-owned record in this codebase carries an `organizationId`.
 * These helpers make tenant enforcement explicit at the route boundary so
 * that:
 *
 *   - It is impossible to fetch a record by ID without proving tenant
 *     ownership.
 *   - Cross-tenant access attempts are logged in the audit trail with
 *     `result: "failure"` and `action: "permission.denied"`.
 *
 * The existing `verifyClientAccess` middleware (in `middleware/auth.ts`)
 * is the original implementation for clients. New routes should prefer
 * `requireTenantOwnership` because it works for any resource type.
 */
import type { Request, Response, NextFunction } from "express";
import { recordAudit } from "./auditLog.js";

export interface TenantContext {
  userId: string;
  organizationId: string;
}

/**
 * Returns the authenticated tenant context, or null if the request is
 * unauthenticated or has no organization. Most callers should run after
 * `requireAuth` so they can assume a context exists.
 */
export function getTenantContext(req: Request): TenantContext | null {
  const session = (req.session as { userId?: string; organizationId?: string } | undefined) || {};
  if (!session.userId || !session.organizationId) return null;
  return { userId: session.userId, organizationId: session.organizationId };
}

/**
 * Throw-style assert: useful inside service code where a missing context
 * indicates a programming error (the route should have been guarded).
 */
export function requireTenantContext(req: Request): TenantContext {
  const ctx = getTenantContext(req);
  if (!ctx) {
    const err = new Error("Tenant context required");
    (err as Error & { status: number }).status = 401;
    throw err;
  }
  return ctx;
}

/**
 * Verify that an arbitrary record belongs to the caller's tenant. Returns
 * `false` and writes a `permission.denied` audit line if not.
 */
export async function assertSameTenant(
  req: Request,
  res: Response,
  record: { organizationId?: string | null } | null | undefined,
  resourceType: string,
  resourceId: string | null,
): Promise<boolean> {
  if (!record) {
    res.status(404).json({ message: "Not found" });
    return false;
  }
  const ctx = getTenantContext(req);
  if (!ctx) {
    res.status(401).json({ message: "Not authenticated" });
    return false;
  }
  if (!record.organizationId || record.organizationId !== ctx.organizationId) {
    await recordAudit(req, {
      action: "permission.denied",
      resourceType,
      resourceId,
      result: "failure",
      metadata: { reason: "cross_tenant_access", recordOrg: record.organizationId ?? null },
    });
    res.status(403).json({ message: "Access denied" });
    return false;
  }
  return true;
}

/**
 * Middleware factory: load a record via `loader` and ensure the caller
 * owns it before passing through to the handler. The loader receives the
 * request and must return either the record (with `organizationId`) or
 * `null` for not-found.
 *
 * Example:
 *   router.get('/:id', requireAuth,
 *     requireTenantOwnership({
 *       resourceType: 'client',
 *       loader: req => storage.getClient(req.params.id),
 *     }),
 *     handler);
 */
export function requireTenantOwnership<T extends { organizationId?: string | null }>(opts: {
  resourceType: string;
  loader: (req: Request) => Promise<T | null | undefined> | T | null | undefined;
  resourceIdFrom?: (req: Request) => string | null | undefined;
}) {
  return async function requireTenantOwnershipMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const record = await Promise.resolve(opts.loader(req));
      const resourceId =
        opts.resourceIdFrom?.(req) ??
        (req.params.id as string) ??
        (req.params.clientId as string) ??
        null;
      const ok = await assertSameTenant(req, res, record ?? null, opts.resourceType, resourceId);
      if (!ok) return;
      next();
    } catch (err) {
      next(err);
    }
  };
}
