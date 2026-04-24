import { Router, type Request as ExpressRequest, type Response } from 'express';

type Request = ExpressRequest<Record<string, string>, any, any, Record<string, string>>;
import { storage } from '../../storage.js';
import { requireAuth, verifyClientAccess, verifyResourceOwnership } from '../middleware/auth.js';
import { ScenarioModel } from '../../models.js';

const router = Router();

router.post('/', requireAuth, async (req: Request, res: Response) => {
  if (!(await verifyClientAccess(req, res))) return;
  const result = await storage.createScenario({ ...req.body, clientId: String(req.params.clientId) });
  return res.json(result);
});

router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const doc = await ScenarioModel.findOne({ id: String(req.params.id) }).lean();
  if (!doc) return res.status(404).json({ message: "Scenario not found" });
  if (!(await verifyResourceOwnership(req, res, doc.clientId))) return;
  await storage.deleteScenario(String(req.params.id));
  return res.json({ message: "Deleted" });
});

export default router;

