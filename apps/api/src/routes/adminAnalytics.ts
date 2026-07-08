/**
 * Admin analytics endpoints — Google Analytics (GA4) + Search Console.
 *
 * Mounted at /api/admin/analytics (see routes/index.ts) and proxied from the
 * web server (see apps/web/server/apiProxy.ts). Every route requires an
 * authenticated admin / super_admin. Google credentials never leave the server;
 * when they are absent the routes respond 200 with `{ configured: false }` so
 * the UI can show a configuration message instead of crashing.
 */
import {
  Router,
  type Request as ExpressRequest,
  type Response,
  type NextFunction,
} from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { storage } from "../../storage.js";
import { isMongoConnected } from "../../db.js";
import { createLogger } from "../logger.js";
import {
  isAnalyticsConfigured,
  isSearchConsoleConfigured,
  isValidRange,
  getOverview,
  getRealtime,
  getSources,
  getPages,
  getAudience,
  getSearchConsole,
  type DateRangeKey,
} from "../services/googleAnalytics.js";

type Request = ExpressRequest<
  Record<string, string>,
  any,
  any,
  Record<string, string>
>;

const logger = createLogger("AdminAnalytics");

function hasAnyRole(user: any, ...roles: string[]): boolean {
  const primary: string = user?.role ?? "";
  const secondary: string[] = user?.secondaryRoles ?? [];
  return roles.some((r) => r === primary || secondary.includes(r));
}

const OFFLINE_DEMO_USER_ID = "demo-offline-user";

/**
 * Resolves the offline-demo caller from the trusted identity header the web
 * proxy injects (see apps/web/server/apiProxy.ts). This is honoured ONLY when
 * BOTH hold:
 *  - the process is NOT production — Mongo connectivity is an operational state,
 *    not a security boundary, so a production DB outage must never turn this
 *    header into an auth bypass (a caller hitting apps/api:3000 directly would
 *    otherwise skip the web proxy's header stripping); and
 *  - MongoDB is unavailable — the exact condition under which offline demo/demo
 *    login is permitted (when Mongo is up the servers share a real session
 *    store and this path is unnecessary).
 */
function resolveOfflineDemoUser(
  req: Request,
): { id: string; role: string } | null {
  if (process.env.NODE_ENV === "production") return null;
  if (isMongoConnected()) return null;
  const demoUser = req.headers["x-okiru-demo-user"];
  if (demoUser !== OFFLINE_DEMO_USER_ID) return null;
  const demoRole = req.headers["x-okiru-demo-role"];
  return {
    id: OFFLINE_DEMO_USER_ID,
    role: typeof demoRole === "string" && demoRole ? demoRole : "admin",
  };
}

/**
 * Populates the session with the offline-demo identity (if present) before auth
 * runs, so the demo account created on the web server can reach these proxied
 * endpoints even though the two servers do not share an in-memory session store.
 */
function attachOfflineDemoSession(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const demo = resolveOfflineDemoUser(req);
  if (demo) {
    (req.session as any).userId = demo.id;
    (req as any).offlineDemoUser = demo;
  }
  next();
}

/** Requires the caller to be an admin or super_admin. */
async function requireAdminOrSuperAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const demo = (req as any).offlineDemoUser as
    | { id: string; role: string }
    | undefined;
  if (demo) {
    if (!hasAnyRole(demo, "admin", "super_admin")) {
      return res.status(403).json({ message: "Admin access required" });
    }
    return next();
  }
  if (!req.session.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  const user = await storage.getUser(req.session.userId);
  if (!user || !hasAnyRole(user, "admin", "super_admin")) {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

/** Reads + validates the `range` query param, defaulting to 30 days. */
function resolveRange(req: Request, res: Response): DateRangeKey | null {
  const raw = req.query.range ?? "30d";
  if (!isValidRange(raw)) {
    res.status(400).json({
      message: "Invalid date range. Use one of: today, 7d, 30d, 90d.",
    });
    return null;
  }
  return raw;
}

/** Wraps a report producer with uniform error handling (no leaked internals). */
async function respond<T>(
  res: Response,
  label: string,
  producer: () => Promise<T>,
): Promise<void> {
  try {
    const data = await producer();
    res.json({ configured: true, data });
  } catch (err) {
    logger.error(`Analytics report failed: ${label}`, err as Error);
    res
      .status(502)
      .json({ message: "Unable to load analytics data. Please try again." });
  }
}

const router = Router();

router.use(attachOfflineDemoSession, requireAuth, requireAdminOrSuperAdmin);

/** GET /api/admin/analytics/overview?range=30d */
router.get("/overview", async (req: Request, res: Response) => {
  if (!isAnalyticsConfigured()) return res.json({ configured: false });
  const range = resolveRange(req, res);
  if (!range) return;
  await respond(res, "overview", () => getOverview(range));
});

/** GET /api/admin/analytics/realtime */
router.get("/realtime", async (_req: Request, res: Response) => {
  if (!isAnalyticsConfigured()) return res.json({ configured: false });
  await respond(res, "realtime", () => getRealtime());
});

/** GET /api/admin/analytics/sources?range=30d */
router.get("/sources", async (req: Request, res: Response) => {
  if (!isAnalyticsConfigured()) return res.json({ configured: false });
  const range = resolveRange(req, res);
  if (!range) return;
  await respond(res, "sources", () => getSources(range));
});

/** GET /api/admin/analytics/pages?range=30d */
router.get("/pages", async (req: Request, res: Response) => {
  if (!isAnalyticsConfigured()) return res.json({ configured: false });
  const range = resolveRange(req, res);
  if (!range) return;
  await respond(res, "pages", () => getPages(range));
});

/** GET /api/admin/analytics/audience?range=30d */
router.get("/audience", async (req: Request, res: Response) => {
  if (!isAnalyticsConfigured()) return res.json({ configured: false });
  const range = resolveRange(req, res);
  if (!range) return;
  await respond(res, "audience", () => getAudience(range));
});

/** GET /api/admin/analytics/search-console?range=30d */
router.get("/search-console", async (req: Request, res: Response) => {
  if (!isSearchConsoleConfigured()) return res.json({ configured: false });
  const range = resolveRange(req, res);
  if (!range) return;
  await respond(res, "search-console", () => getSearchConsole(range));
});

export default router;
