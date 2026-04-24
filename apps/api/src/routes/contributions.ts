import { Router, type Request as ExpressRequest, type Response } from 'express';

type Request = ExpressRequest<Record<string, string>, any, any, Record<string, string>>;
import { storage } from '../../storage.js';
import { requireAuth, verifyClientAccess, verifyResourceOwnership } from '../middleware/auth.js';
import { EsdContributionModel, SedContributionModel } from '../../models.js';

const router = Router();

// ESD Contributions
router.post('/esd', requireAuth, async (req: Request, res: Response) => {
  if (!(await verifyClientAccess(req, res))) return;
  const result = await storage.createEsdContribution({ ...req.body, clientId: String(req.params.clientId) });
  return res.json(result);
});

router.delete('/esd/:id', requireAuth, async (req: Request, res: Response) => {
  const doc = await EsdContributionModel.findOne({ id: String(req.params.id) }).lean();
  if (!doc) return res.status(404).json({ message: "ESD contribution not found" });
  if (!(await verifyResourceOwnership(req, res, doc.clientId))) return;
  await storage.deleteEsdContribution(String(req.params.id));
  return res.json({ message: "Deleted" });
});

// SED Contributions
router.post('/sed', requireAuth, async (req: Request, res: Response) => {
  if (!(await verifyClientAccess(req, res))) return;
  const result = await storage.createSedContribution({ ...req.body, clientId: String(req.params.clientId) });
  return res.json(result);
});

router.delete('/sed/:id', requireAuth, async (req: Request, res: Response) => {
  const doc = await SedContributionModel.findOne({ id: String(req.params.id) }).lean();
  if (!doc) return res.status(404).json({ message: "SED contribution not found" });
  if (!(await verifyResourceOwnership(req, res, doc.clientId))) return;
  await storage.deleteSedContribution(String(req.params.id));
  return res.json({ message: "Deleted" });
});

export default router;

