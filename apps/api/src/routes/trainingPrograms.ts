import { Router, type Request as ExpressRequest, type Response } from 'express';

type Request = ExpressRequest<Record<string, string>, any, any, Record<string, string>>;
import { storage } from '../../storage.js';
import { requireAuth, verifyClientAccess, verifyResourceOwnership, verifyPillarAccess } from '../middleware/auth.js';
import { TrainingProgramModel } from '../../models.js';

// Dedicated training-programs router. Previously these routes lived on the
// employees router, which was dual-mounted at /api/training-programs — so a
// POST /api/clients/:clientId/training-programs hit the employees `post('/')`
// (createEmployee!) and DELETE/PATCH /api/training-programs/:id hit the employee
// handlers. Splitting it out makes create/update/delete actually persist.
const router = Router({ mergeParams: true });

// Create (mounted at /api/clients/:clientId/training-programs)
router.post('/', requireAuth, async (req: Request, res: Response) => {
  if (!(await verifyClientAccess(req, res))) return;
  if (!(await verifyPillarAccess(req, res, 'skills'))) return;
  const result = await storage.createTrainingProgram({ ...req.body, clientId: String(req.params.clientId) });
  return res.json(result);
});

// Update (mounted at /api/training-programs/:id)
router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  const doc = await TrainingProgramModel.findOne({ id: String(req.params.id) }).lean();
  if (!doc) return res.status(404).json({ message: "Training program not found" });
  if (!(await verifyResourceOwnership(req, res, doc.clientId))) return;
  if (!(await verifyPillarAccess(req, res, 'skills', doc.clientId))) return;
  const result = await storage.updateTrainingProgram(String(req.params.id), req.body);
  return res.json(result);
});

// Delete (mounted at /api/training-programs/:id)
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const doc = await TrainingProgramModel.findOne({ id: String(req.params.id) }).lean();
  if (!doc) return res.status(404).json({ message: "Training program not found" });
  if (!(await verifyResourceOwnership(req, res, doc.clientId))) return;
  if (!(await verifyPillarAccess(req, res, 'skills', doc.clientId))) return;
  await storage.deleteTrainingProgram(String(req.params.id));
  return res.json({ message: "Deleted" });
});

export default router;
