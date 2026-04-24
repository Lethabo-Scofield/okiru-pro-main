import { Router, type Request as ExpressRequest, type Response } from 'express';

type Request = ExpressRequest<Record<string, string>, any, any, Record<string, string>>;
import { storage } from '../../storage.js';
import { createLogger } from '../logger.js';

const logger = createLogger("Export");
import { requireAuth, verifyClientAccess } from '../middleware/auth.js';

const router = Router();

router.post('/log', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await storage.createExportLog({
      ...req.body,
      userId: req.session.userId!,
    });
    return res.json(result);
  } catch (error: unknown) {
    logger.error('Export log error', error);
    return res.status(500).json({ message: "Failed to log export" });
  }
});

router.get('/:clientId/logs', requireAuth, async (req: Request, res: Response) => {
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

