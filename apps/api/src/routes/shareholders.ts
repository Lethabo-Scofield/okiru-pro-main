import { Router, type Request as ExpressRequest, type Response } from 'express';

type Request = ExpressRequest<Record<string, string>, any, any, Record<string, string>>;
import { storage } from '../../storage.js';
import { requireAuth, verifyClientAccess, verifyResourceOwnership } from '../middleware/auth.js';
import { ShareholderModel } from '../../models.js';

const router = Router();

router.post('/', requireAuth, async (req: Request, res: Response) => {
  if (!(await verifyClientAccess(req, res))) return;
  const result = await storage.createShareholder({ ...req.body, clientId: String(req.params.clientId) });
  return res.json(result);
});

router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const doc = await ShareholderModel.findOne({ id: String(req.params.id) }).lean();
  if (!doc) return res.status(404).json({ message: "Shareholder not found" });
  if (!(await verifyResourceOwnership(req, res, doc.clientId))) return;
  await storage.deleteShareholder(String(req.params.id));
  return res.json({ message: "Deleted" });
});

router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  const result = await storage.updateShareholder(String(req.params.id), req.body);
  return res.json(result);
});

router.patch('/:clientId/ownership', requireAuth, async (req: Request, res: Response) => {
  if (!(await verifyClientAccess(req, res))) return;
  const result = await storage.upsertOwnershipData(String(req.params.clientId), req.body);
  return res.json(result);
});

export default router;

