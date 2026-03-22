import { Router, type Request as ExpressRequest, type Response } from 'express';

type Request = ExpressRequest<Record<string, string>, any, any, Record<string, string>>;
import { storage } from '../../storage.js';
import { requireAuth, verifyClientAccess, verifyResourceOwnership } from '../middleware/auth.js';
import { FinancialYearModel } from '../../models.js';

const router = Router();

router.post('/', requireAuth, async (req: Request, res: Response) => {
  if (!(await verifyClientAccess(req, res))) return;
  const result = await storage.createFinancialYear({ ...req.body, clientId: String(req.params.clientId) });
  return res.json(result);
});

router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const doc = await FinancialYearModel.findOne({ id: String(req.params.id) }).lean();
  if (!doc) return res.status(404).json({ message: "Financial year not found" });
  if (!(await verifyResourceOwnership(req, res, doc.clientId))) return;
  await storage.deleteFinancialYear(String(req.params.id));
  return res.json({ message: "Deleted" });
});

export default router;

