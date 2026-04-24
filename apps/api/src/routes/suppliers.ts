import { Router, type Request as ExpressRequest, type Response } from 'express';

type Request = ExpressRequest<Record<string, string>, any, any, Record<string, string>>;
import { storage } from '../../storage.js';
import { requireAuth, verifyClientAccess } from '../middleware/auth.js';

const router = Router();

router.post('/', requireAuth, async (req: Request, res: Response) => {
  if (!(await verifyClientAccess(req, res))) return;
  const result = await storage.createSupplier({ ...req.body, clientId: String(req.params.clientId) });
  return res.json(result);
});

router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  await storage.deleteSupplier(String(req.params.id));
  return res.json({ message: "Deleted" });
});

router.patch('/:clientId/procurement', requireAuth, async (req: Request, res: Response) => {
  if (!(await verifyClientAccess(req, res))) return;
  const result = await storage.upsertProcurementData(String(req.params.clientId), req.body.tmps);
  return res.json(result);
});

export default router;

