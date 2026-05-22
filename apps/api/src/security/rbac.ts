/**
 * RBAC resolution and middleware.
 *
 * `resolvePermissions(userId, organizationId)` looks up a user's role
 * (from the `users` collection — single role per user today) and any
 * tenant-specific role overrides in `rbacRoles`, then returns the merged
 * permission set. Results are cached in-memory for a short TTL to keep
 * authorization off the hot path; the cache is keyed by user+org and
 * can be invalidated explicitly when a role is changed.
 *
 * `requirePermission(perm)` is the canonical way to guard an Express
 * route. Denials are 403 and are recorded in the audit log so that
 * operators can see cross-role probing.
 */
import type { Request, Response, NextFunction } from "express";
import { storage } from "../../storage.js";
import { createLogger } from "../logger.js";
import {
  defaultPermissionsForRole,
  DEFAULT_ROLE_PERMISSIONS,
  type Permission,
  ALL_PERMISSIONS,
} from "./permissions.js";
import { RbacRoleModel, RbacRoleAssignmentModel } from "./rbacModels.js";
import { recordAudit } from "./auditLog.js";
import { isMongoConnected } from "../../db.js";

const logger = createLogger("RBAC");

interface CacheEntry {
  perms: Set<string>;
  roleNames: string[];
  expiresAt: number;
}

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, CacheEntry>();

function cacheKey(userId: string, organizationId: string | null): string {
  return `${userId}::${organizationId ?? "_"}`;
}

/** Invalidate the cache entry for a user. Call after role changes. */
export function invalidatePermissionsCache(userId: string, organizationId?: string | null) {
  for (const key of Array.from(cache.keys())) {
    if (key.startsWith(`${userId}::`)) {
      if (organizationId === undefined || key === cacheKey(userId, organizationId)) {
        cache.delete(key);
      }
    }
  }
}

export interface ResolvedPermissions {
  permissions: Permission[];
  roles: string[];
}

/**
 * Resolve a user's permissions for an organization. The user's `role`
 * field is the primary input; optional DB-backed role assignments
 * (`rbacRoleAssignments`) and tenant-scoped role definitions
 * (`rbacRoles`) are merged on top.
 */
export async function resolvePermissions(
  userId: string,
  organizationId: string | null,
): Promise<ResolvedPermissions> {
  const key = cacheKey(userId, organizationId);
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return { permissions: Array.from(cached.perms) as Permission[], roles: cached.roleNames };
  }

  const user = await storage.getUser(userId);
  const roleNames = new Set<string>();
  if (user?.role) roleNames.add(user.role);
  for (const sr of (user as any)?.secondaryRoles ?? []) {
    if (sr) roleNames.add(sr);
  }

  // Layer in any explicit role assignments. Failure to read this collection
  // (e.g. MongoDB not connected) must not block the request — we fall back
  // to the single role on the user record.
  if (isMongoConnected() && organizationId) {
    try {
      const assignments = await RbacRoleAssignmentModel.find({
        userId,
        organizationId,
      }).lean();
      for (const a of assignments as Array<{ roleName?: string }>) {
        if (a.roleName) roleNames.add(a.roleName);
      }
    } catch (err) {
      logger.warn("Failed to load role assignments — using user.role only", {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Resolve each role to a permission set: prefer tenant-scoped DB role,
  // then global DB role, then built-in defaults.
  const perms = new Set<string>();
  for (const roleName of roleNames) {
    let dbRole: { permissions?: string[] } | null = null;
    if (isMongoConnected()) {
      try {
        dbRole =
          (await RbacRoleModel.findOne({
            name: roleName,
            organizationId,
          }).lean()) as { permissions?: string[] } | null;
        if (!dbRole) {
          dbRole = (await RbacRoleModel.findOne({
            name: roleName,
            organizationId: null,
          }).lean()) as { permissions?: string[] } | null;
        }
      } catch (err) {
        logger.warn("Failed to load DB role override — using defaults", {
          roleName,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    if (dbRole?.permissions?.length) {
      for (const p of dbRole.permissions) perms.add(p);
    } else {
      for (const p of defaultPermissionsForRole(roleName)) perms.add(p);
    }
  }

  cache.set(key, { perms, roleNames: Array.from(roleNames), expiresAt: now + CACHE_TTL_MS });
  return { permissions: Array.from(perms) as Permission[], roles: Array.from(roleNames) };
}

/** Pure function for tests: given role(s) + a permission, can they do it? */
export function hasPermissionFromDefaults(roles: string | string[], permission: Permission): boolean {
  const roleList = Array.isArray(roles) ? roles : [roles];
  return roleList.some((r) => defaultPermissionsForRole(r).includes(permission));
}

/** Express middleware: require a single permission. */
export function requirePermission(permission: Permission) {
  return async function requirePermissionMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    const session = (req.session as { userId?: string; organizationId?: string } | undefined) || {};
    if (!session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { permissions, roles } = await resolvePermissions(
        session.userId,
        session.organizationId ?? null,
      );
      if (!permissions.includes(permission)) {
        await recordAudit(req, {
          action: "permission.denied",
          resourceType: "permission",
          resourceId: permission,
          result: "failure",
          metadata: { roles, requiredPermission: permission },
        });
        return res.status(403).json({ message: "Forbidden", requiredPermission: permission });
      }
      next();
    } catch (err) {
      logger.error("Permission resolution failed", err as Error);
      return res.status(500).json({ message: "Authorization error" });
    }
  };
}

/** Require ANY of the given permissions (logical OR). */
export function requireAnyPermission(...permissions: Permission[]) {
  return async function requireAnyPermissionMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    const session = (req.session as { userId?: string; organizationId?: string } | undefined) || {};
    if (!session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { permissions: held, roles } = await resolvePermissions(
        session.userId,
        session.organizationId ?? null,
      );
      const ok = permissions.some((p) => held.includes(p));
      if (!ok) {
        await recordAudit(req, {
          action: "permission.denied",
          resourceType: "permission",
          resourceId: permissions.join("|"),
          result: "failure",
          metadata: { roles, requiredAnyOf: permissions },
        });
        return res.status(403).json({ message: "Forbidden", requiredAnyOf: permissions });
      }
      next();
    } catch (err) {
      logger.error("Permission resolution failed", err as Error);
      return res.status(500).json({ message: "Authorization error" });
    }
  };
}

/** Sanity check used by the boot-time logger. */
export function describePermissionsModel(): { defaultRoles: string[]; allPermissions: Permission[] } {
  return {
    defaultRoles: Object.keys(DEFAULT_ROLE_PERMISSIONS),
    allPermissions: ALL_PERMISSIONS,
  };
}
