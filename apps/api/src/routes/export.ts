import { stripServerControlledFields } from '../middleware/sanitizeBody.js';
import { Router, type Request as ExpressRequest, type Response } from 'express';

type Request = ExpressRequest<Record<string, string>, any, any, Record<string, string>>;
import { storage } from '../../storage.js';
import { createLogger } from '../logger.js';

const logger = createLogger("Export");
import { requireAuth, verifyClientAccess } from '../middleware/auth.js';

// mergeParams so :clientId from the mount path (/api/clients/:clientId/export-logs)
// reaches req.params. Without it the mounted GET below has no client to
// authorise against, and verifyClientAccess would see an undefined id.
const router = Router({ mergeParams: true });

router.post('/log', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await storage.createExportLog({
      ...stripServerControlledFields(req.body),
      userId: req.session.userId!,
    });
    return res.json(result);
  } catch (error: unknown) {
    logger.error('Export log error', error);
    return res.status(500).json({ message: "Failed to log export" });
  }
});

/**
 * Mounted form: GET /api/clients/:clientId/export-logs
 * This is the path the Toolkit actually calls. It previously matched no route
 * at all, so the "Recent Exports" panel could never have been populated.
 */
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const clientId = String(req.params.clientId ?? "");
    if (!clientId || clientId === "undefined" || clientId === "null") {
      return res.status(400).json({ message: "Client context required" });
    }
    if (!(await verifyClientAccess(req, res))) return;
    const logs = await storage.getExportLogs(clientId);
    return res.json(logs);
  } catch (error: unknown) {
    logger.error("Get export logs error", error);
    return res.status(500).json({ message: "Failed to fetch export logs" });
  }
});

/** Legacy shape: GET /api/export-log/:clientId/logs */
router.get("/:clientId/logs", requireAuth, async (req: Request, res: Response) => {
  try {
    if (!(await verifyClientAccess(req, res))) return;
    const logs = await storage.getExportLogs(String(req.params.clientId));
    return res.json(logs);
  } catch (error: unknown) {
    logger.error('Get export logs error', error);
    return res.status(500).json({ message: "Failed to fetch export logs" });
  }
});

export default router;

