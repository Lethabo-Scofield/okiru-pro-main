import { exec } from "child_process";
import { promisify } from "util";
import type { Express, Request, Response, NextFunction } from "express";
import { createLogger } from "./logger";
import { hasAnyRole } from "./roles";

const execAsync = promisify(exec);
const logger = createLogger("AdminRollback");

const NAMESPACE = "okiru-pro";
const ALLOWED_DEPLOYMENTS = ["web", "api", "compute"] as const;
type AllowedDeployment = (typeof ALLOWED_DEPLOYMENTS)[number];

function isAllowedDeployment(name: string): name is AllowedDeployment {
  return (ALLOWED_DEPLOYMENTS as readonly string[]).includes(name);
}

function requireSuperAdmin(req: Request, res: Response): boolean {
  const user = (req as any).user;
  if (!hasAnyRole(user, "super_admin")) {
    res.status(403).json({ message: "Super-admin access required" });
    return false;
  }
  return true;
}

interface DeploymentRevision {
  revision: number;
  changeReason: string;
  timestamp: string | null;
  deployedBy: string | null;
}

/**
 * Parse `kubectl rollout history deployment/<name>` output into structured revisions.
 *
 * Example stdout:
 *   REVISION  CHANGE-CAUSE
 *   1         <none>
 *   2         deploy: web v1.2.3 by ops@example.com at 2026-05-26T10:00:00Z
 *   3         deploy: web v1.2.4 by ops@example.com at 2026-05-27T08:30:00Z
 */
function parseRolloutHistory(stdout: string): DeploymentRevision[] {
  const lines = stdout.trim().split("\n");
  const revisions: DeploymentRevision[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("REVISION") || trimmed.startsWith("deployment.apps")) {
      continue;
    }
    const match = trimmed.match(/^(\d+)\s+(.*)/);
    if (!match) continue;

    const revision = parseInt(match[1], 10);
    const changeReason = match[2].trim() === "<none>" ? "" : match[2].trim();

    // Extract deployedBy and timestamp from the change-cause annotation if present.
    // Convention: "deploy: <image> by <email> at <ISO8601>"
    let deployedBy: string | null = null;
    let timestamp: string | null = null;

    const byMatch = changeReason.match(/\bby\s+(\S+)/i);
    const atMatch = changeReason.match(/\bat\s+(\S+)/i);
    if (byMatch) deployedBy = byMatch[1];
    if (atMatch) timestamp = atMatch[1];

    revisions.push({ revision, changeReason, timestamp, deployedBy });
  }

  return revisions.reverse(); // most recent first
}

export function registerAdminRollbackRoutes(
  app: Express,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void | Promise<void>,
): void {
  /**
   * GET /api/admin/deployments
   * Returns rollout history for all tracked Kubernetes deployments.
   * Requires super_admin role.
   */
  app.get("/api/admin/deployments", requireAuth, async (req: Request, res: Response) => {
    if (!requireSuperAdmin(req, res)) return;

    const results: Record<string, DeploymentRevision[] | { error: string }> = {};

    await Promise.all(
      ALLOWED_DEPLOYMENTS.map(async (name) => {
        try {
          const { stdout } = await execAsync(
            `kubectl rollout history deployment/${name} -n ${NAMESPACE}`,
            { timeout: 15_000 },
          );
          results[name] = parseRolloutHistory(stdout);
        } catch (err: any) {
          logger.error(`Failed to get rollout history for ${name}`, err);
          results[name] = { error: err.message || "kubectl command failed" };
        }
      }),
    );

    res.json(results);
  });

  /**
   * POST /api/admin/rollback
   * Body: { deployment: "web" | "api" | "compute", revision: number }
   * Runs `kubectl rollout undo deployment/<name> -n okiru-pro --to-revision=<revision>`
   * Revision 0 means "previous" (kubectl default).
   * Requires super_admin role.
   */
  app.post("/api/admin/rollback", requireAuth, async (req: Request, res: Response) => {
    if (!requireSuperAdmin(req, res)) return;

    const { deployment, revision } = req.body ?? {};

    if (!deployment || !isAllowedDeployment(deployment)) {
      return res.status(400).json({
        message: `Invalid deployment. Must be one of: ${ALLOWED_DEPLOYMENTS.join(", ")}`,
      });
    }

    if (revision === undefined || revision === null || typeof revision !== "number" || !Number.isInteger(revision) || revision < 0) {
      return res.status(400).json({ message: "revision must be a non-negative integer (0 = previous)" });
    }

    const actor = (req as any).user?.email ?? (req as any).user?.username ?? "unknown";
    logger.info(`Rollback requested`, { deployment, revision, actor });

    const cmd = `kubectl rollout undo deployment/${deployment} -n ${NAMESPACE} --to-revision=${revision}`;

    try {
      const { stdout, stderr } = await execAsync(cmd, { timeout: 60_000 });
      logger.info(`Rollback succeeded`, { deployment, revision, actor, stdout, stderr });
      res.json({
        ok: true,
        deployment,
        revision,
        message: stdout.trim() || `Rolled back deployment/${deployment} to revision ${revision}`,
      });
    } catch (err: any) {
      logger.error(`Rollback failed`, err, { deployment, revision, actor });
      res.status(500).json({
        ok: false,
        message: `kubectl rollout undo failed: ${err.message}`,
      });
    }
  });
}
