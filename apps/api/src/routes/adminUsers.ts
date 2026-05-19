/**
 * Super-admin / admin user management endpoints.
 *
 * Role hierarchy enforced here:
 *   super_admin → can do everything, assign any role
 *   admin       → can list users, toggle 2FA; cannot elevate roles
 *   user        → no access
 *
 * These routes live at /api/admin/users and are mounted in routes/index.ts.
 */
import { Router, type Request as ExpressRequest, type Response, type NextFunction } from "express";
import bcrypt from "bcrypt";
import { v4 as uuid } from "uuid";
import { requireAuth } from "../middleware/requireAuth.js";
import { storage } from "../../storage.js";
import { UserModel, OrganizationModel, ProcessorSessionModel } from "../../models.js";
import { invalidatePermissionsCache, recordAudit, getEffectiveRoles } from "../security/index.js";
import { createLogger } from "../logger.js";

type Request = ExpressRequest<Record<string, string>, any, any, Record<string, string>>;

const logger = createLogger("AdminUsers");

const ALLOWED_ROLES = ["user", "auditor", "analyst", "manager", "admin", "super_admin"] as const;
type AllowedRole = typeof ALLOWED_ROLES[number];

// ─── Middleware ──────────────────────────────────────────────────────────────

function hasAnyRole(user: any, ...roles: string[]): boolean {
  const primary: string = user?.role ?? "";
  const secondary: string[] = user?.secondaryRoles ?? [];
  return roles.some(r => r === primary || secondary.includes(r));
}

/** Requires the caller to be an admin or super_admin. */
async function requireAdminOrSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
  const user = await storage.getUser(req.session.userId);
  if (!user || !hasAnyRole(user, "admin", "super_admin")) {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

/** Requires the caller to be a super_admin specifically. */
async function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
  const user = await storage.getUser(req.session.userId);
  if (!user || !hasAnyRole(user, "super_admin")) {
    return res.status(403).json({ message: "Super-admin access required" });
  }
  next();
}

// ─── Router ──────────────────────────────────────────────────────────────────

const router = Router();

/**
 * GET /api/admin/users
 * Returns a paginated list of all users (super_admin only).
 * Query: ?limit=50&skip=0&role=admin
 */
router.get(
  "/",
  requireAuth,
  requireSuperAdmin,
  async (req: Request, res: Response) => {
    try {
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
      const skip = Math.max(0, Number(req.query.skip) || 0);
      const roleFilter = req.query.role as string | undefined;

      const filter: Record<string, unknown> = {};
      if (roleFilter && ALLOWED_ROLES.includes(roleFilter as AllowedRole)) {
        filter.role = roleFilter;
      }

      const [docs, total] = await Promise.all([
        UserModel.find(filter, {
          password: 0,
          __v: 0,
          _id: 0,
        })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        UserModel.countDocuments(filter),
      ]);

      // Enrich with org names
      const orgIds = [...new Set(docs.map((d) => d.organizationId).filter(Boolean))] as string[];
      const orgs = orgIds.length
        ? await OrganizationModel.find({ id: { $in: orgIds } }, { id: 1, name: 1, _id: 0 }).lean()
        : [];
      const orgMap = new Map(orgs.map((o) => [o.id as string, o.name as string]));

      const users = docs.map((d) => ({
        id: d.id,
        username: d.username,
        fullName: d.fullName ?? null,
        email: d.email ?? null,
        role: d.role ?? "user",
        organizationId: d.organizationId ?? null,
        organizationName: orgMap.get(d.organizationId as string) ?? null,
        createdAt: d.createdAt ?? null,
        lastLogin: (d as any).lastLogin ?? null,
        isVerified: (d as any).isVerified ?? false,
        twofaEnabled: (d as any).twofaEnabled ?? false,
      }));

      return res.json({ users, total, skip, limit });
    } catch (err) {
      logger.error("Admin users list failed", err as Error);
      return res.status(500).json({ message: "Failed to fetch users" });
    }
  },
);

/**
 * PATCH /api/admin/users/:id/role
 * Assigns a role to a user.
 *   - super_admin can assign any role in ALLOWED_ROLES.
 *   - admin cannot use this endpoint (403).
 * Body: { role: string }
 */
router.patch(
  "/:id/role",
  requireAuth,
  requireSuperAdmin,
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { role } = req.body ?? {};

    if (!role || !ALLOWED_ROLES.includes(role as AllowedRole)) {
      return res.status(400).json({
        message: `Invalid role. Allowed: ${ALLOWED_ROLES.join(", ")}`,
      });
    }

    try {
      const target = await storage.getUser(id);
      if (!target) return res.status(404).json({ message: "User not found" });

      const previousRole = target.role;
      const update: Record<string, unknown> = { role };
      // Preserve prior role for data scoping when promoting to super_admin.
      if (role === "super_admin" && previousRole && previousRole !== "super_admin") {
        const existing = getEffectiveRoles(target as { role?: string; secondaryRoles?: string[] });
        const secondary = new Set(
          [...((target as { secondaryRoles?: string[] }).secondaryRoles ?? []), previousRole].filter(
            (r) => r && r !== "super_admin",
          ),
        );
        for (const r of existing) {
          if (r !== "super_admin") secondary.add(r);
        }
        update.secondaryRoles = Array.from(secondary);
      }

      const updated = await UserModel.findOneAndUpdate(
        { id },
        { $set: update },
        { new: true, projection: { password: 0, __v: 0, _id: 0 } },
      ).lean();

      if (!updated) return res.status(404).json({ message: "User not found" });

      // Bust the RBAC cache so the next request picks up the new role.
      invalidatePermissionsCache(id);

      await recordAudit(req, {
        action: "user.role.change",
        resourceType: "user",
        resourceId: id,
        result: "success",
        actorUserId: req.session.userId ?? null,
        organizationId: req.session.organizationId ?? null,
        metadata: { previousRole, newRole: role, targetUser: target.username },
      });

      return res.json({
        user: {
          id: updated.id,
          username: updated.username,
          email: updated.email ?? null,
          role: updated.role ?? "user",
        },
      });
    } catch (err) {
      logger.error("Role update failed", err as Error);
      return res.status(500).json({ message: "Failed to update role" });
    }
  },
);

/**
 * PATCH /api/admin/users/:id/2fa
 * Enables or disables 2FA for a user (admin or super_admin).
 * Body: { enabled: boolean }
 */
router.patch(
  "/:id/2fa",
  requireAuth,
  requireAdminOrSuperAdmin,
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { enabled } = req.body ?? {};

    if (typeof enabled !== "boolean") {
      return res.status(400).json({ message: "enabled (boolean) is required" });
    }

    try {
      const updated = await UserModel.findOneAndUpdate(
        { id },
        { $set: { twofaEnabled: enabled } },
        { new: true, projection: { password: 0, __v: 0, _id: 0 } },
      ).lean();

      if (!updated) return res.status(404).json({ message: "User not found" });

      return res.json({
        user: {
          id: updated.id,
          username: updated.username,
          email: updated.email ?? null,
          role: updated.role ?? "user",
          twofaEnabled: (updated as any).twofaEnabled ?? false,
        },
      });
    } catch (err) {
      logger.error("2FA toggle failed", err as Error);
      return res.status(500).json({ message: "Failed to update 2FA" });
    }
  },
);

// ─── Demo Data Seeding ───────────────────────────────────────────────────────

const SA_COMPANIES = [
  { name: "Thebe Investment Corporation", suffix: "thebe" },
  { name: "Afropulse Technologies", suffix: "afropulse" },
  { name: "Ubuntu Consulting Group", suffix: "ubuntu" },
  { name: "Mzansi Capital Partners", suffix: "mzansi" },
  { name: "Ndlovu Legal Solutions", suffix: "ndlovu" },
];

const SA_SECTORS = ["RCOGP", "ICT", "TRANSPORT", "MINING", "CONSTRUCTION"];

/**
 * POST /api/admin/seed-demo-users
 * Creates 3-5 demo company users (super_admin only).
 */
router.post(
  "/seed-demo-users",
  requireAuth,
  requireSuperAdmin,
  async (req: Request, res: Response) => {
    try {
      const created: string[] = [];
      const hashedPassword = await bcrypt.hash("DemoPass2026!", 10);

      for (const co of SA_COMPANIES.slice(0, 4)) {
        const username = `demo_${co.suffix}_${uuid().slice(0, 6)}`;
        const email = `${co.suffix}@demo.okiru.co.za`;

        // Skip if email already exists
        const exists = await UserModel.findOne({ email }).lean();
        if (exists) continue;

        const orgDoc = await OrganizationModel.create({
          id: uuid(),
          name: co.name,
        });
        await UserModel.create({
          id: uuid(),
          username,
          password: hashedPassword,
          fullName: `${co.name} Admin`,
          email,
          role: "admin",
          organizationId: orgDoc.id,
          isDemo: true,
        });
        created.push(email);
      }

      return res.json({ created, message: `${created.length} demo user(s) created` });
    } catch (err) {
      logger.error("Demo user seed failed", err as Error);
      return res.status(500).json({ message: "Failed to seed demo users" });
    }
  },
);

/**
 * POST /api/admin/seed-demo-sessions
 * Creates 2-3 demo processor sessions with realistic B-BBEE data (super_admin only).
 */
router.post(
  "/seed-demo-sessions",
  requireAuth,
  requireSuperAdmin,
  async (req: Request, res: Response) => {
    try {
      const sessions = [
        {
          id: uuid(),
          sector: "RCOGP",
          status: "complete",
          isDemo: true,
          metadata: {
            companyName: "Thebe Investment Corporation",
            score: 78.4,
            level: "Level 3",
            certificates: 12,
          },
          createdAt: new Date(),
        },
        {
          id: uuid(),
          sector: "ICT",
          status: "complete",
          isDemo: true,
          metadata: {
            companyName: "Afropulse Technologies",
            score: 93.1,
            level: "Level 1",
            certificates: 24,
          },
          createdAt: new Date(),
        },
        {
          id: uuid(),
          sector: "TRANSPORT",
          status: "processing",
          isDemo: true,
          metadata: {
            companyName: "Mzansi Capital Partners",
            score: 61.0,
            level: "Level 5",
            certificates: 7,
          },
          createdAt: new Date(),
        },
      ];

      const docs = await ProcessorSessionModel.insertMany(sessions);
      return res.json({ created: docs.length, message: `${docs.length} demo session(s) created` });
    } catch (err) {
      logger.error("Demo session seed failed", err as Error);
      return res.status(500).json({ message: "Failed to seed demo sessions" });
    }
  },
);

/**
 * DELETE /api/admin/clear-demo-data
 * Removes all records tagged isDemo: true across users, orgs, sessions (super_admin only).
 */
router.delete(
  "/clear-demo-data",
  requireAuth,
  requireSuperAdmin,
  async (_req: Request, res: Response) => {
    try {
      const [usersResult, orgsResult] = await Promise.all([
        UserModel.deleteMany({ isDemo: true }),
        OrganizationModel.deleteMany({ isDemo: true }),
      ]);

      let sessionsDeleted = 0;
      try {
        const r = await ProcessorSessionModel.deleteMany({ isDemo: true });
        sessionsDeleted = r.deletedCount ?? 0;
      } catch {
        // ignore if model not configured
      }

      return res.json({
        message: "Demo data cleared",
        deleted: {
          users: usersResult.deletedCount,
          organizations: orgsResult.deletedCount,
          sessions: sessionsDeleted,
        },
      });
    } catch (err) {
      logger.error("Clear demo data failed", err as Error);
      return res.status(500).json({ message: "Failed to clear demo data" });
    }
  },
);

export default router;
