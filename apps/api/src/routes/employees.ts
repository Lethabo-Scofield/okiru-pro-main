import { Router, type Request as ExpressRequest, type Response } from 'express';

type Request = ExpressRequest<Record<string, string>, any, any, Record<string, string>>;
import { storage } from '../../storage.js';
import { requireAuth, verifyClientAccess, verifyResourceOwnership } from '../middleware/auth.js';
import { EmployeeModel } from '../../models.js';

const router = Router();

// Employees
router.post('/', requireAuth, async (req: Request, res: Response) => {
  if (!(await verifyClientAccess(req, res))) return;
  const result = await storage.createEmployee({ ...req.body, clientId: String(req.params.clientId) });
  return res.json(result);
});

// Bulk-create employees (the client's bulk import path — the previous endpoint
// was dead, so the store fell back to N individual POSTs).
router.post('/bulk', requireAuth, async (req: Request, res: Response) => {
  if (!(await verifyClientAccess(req, res))) return;
  const clientId = String(req.params.clientId);
  const rows: any[] = Array.isArray(req.body?.employees) ? req.body.employees : [];
  if (!rows.length) return res.json({ inserted: 0, employees: [] });
  const stamped = rows.map((r) => ({ ...r, clientId }));
  const inserted = await storage.createEmployeesBulk(stamped);
  return res.json({ inserted: inserted.length, employees: inserted });
});

router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  // 404 on unknown id rather than a silent no-op update.
  const doc = await EmployeeModel.findOne({ id: String(req.params.id) }).lean();
  if (!doc) return res.status(404).json({ message: "Employee not found" });
  if (!(await verifyResourceOwnership(req, res, doc.clientId))) return;
  const result = await storage.updateEmployee(String(req.params.id), req.body);
  return res.json(result);
});

router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const doc = await EmployeeModel.findOne({ id: String(req.params.id) }).lean();
  if (!doc) return res.status(404).json({ message: "Employee not found" });
  if (!(await verifyResourceOwnership(req, res, doc.clientId))) return;
  await storage.deleteEmployee(String(req.params.id));
  return res.json({ message: "Deleted" });
});

export default router;

