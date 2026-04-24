import { Router, type Request as ExpressRequest, type Response } from 'express';

type Request = ExpressRequest<Record<string, string>, any, any, Record<string, string>>;
import { storage } from '../../storage.js';
import { requireAuth, verifyClientAccess, verifyResourceOwnership } from '../middleware/auth.js';
import { EmployeeModel, TrainingProgramModel } from '../../models.js';

const router = Router();

// Employees
router.post('/', requireAuth, async (req: Request, res: Response) => {
  if (!(await verifyClientAccess(req, res))) return;
  const result = await storage.createEmployee({ ...req.body, clientId: String(req.params.clientId) });
  return res.json(result);
});

router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const doc = await EmployeeModel.findOne({ id: String(req.params.id) }).lean();
  if (!doc) return res.status(404).json({ message: "Employee not found" });
  if (!(await verifyResourceOwnership(req, res, doc.clientId))) return;
  await storage.deleteEmployee(String(req.params.id));
  return res.json({ message: "Deleted" });
});

// Training Programs
router.post('/:clientId/training-programs', requireAuth, async (req: Request, res: Response) => {
  if (!(await verifyClientAccess(req, res))) return;
  const result = await storage.createTrainingProgram({ ...req.body, clientId: String(req.params.clientId) });
  return res.json(result);
});

router.delete('/training-programs/:id', requireAuth, async (req: Request, res: Response) => {
  const doc = await TrainingProgramModel.findOne({ id: String(req.params.id) }).lean();
  if (!doc) return res.status(404).json({ message: "Training program not found" });
  if (!(await verifyResourceOwnership(req, res, doc.clientId))) return;
  await storage.deleteTrainingProgram(String(req.params.id));
  return res.json({ message: "Deleted" });
});

export default router;

