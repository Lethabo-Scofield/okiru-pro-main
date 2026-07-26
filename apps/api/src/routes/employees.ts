import { Router, type Request as ExpressRequest, type Response } from 'express';

type Request = ExpressRequest<Record<string, string>, any, any, Record<string, string>>;
import { storage } from '../../storage.js';
import { requireAuth, verifyClientAccess, verifyResourceOwnership, verifyPillarAccess } from '../middleware/auth.js';
import { EmployeeModel } from '../../models.js';
import { fanOutBackSync } from '../services/workbookBackSyncFanout.js';

// mergeParams is LOAD-BEARING: these routers mount under
// /api/clients/:clientId/... — without it req.params.clientId is undefined
// inside the router, verifyClientAccess/verifyPillarAccess PASS OPEN on the
// empty id, and creates write clientId:"undefined" orphans. Proven live by
// the 2026-07-26 round-trip probe.
const router = Router({ mergeParams: true });

// Employees
router.post('/', requireAuth, async (req: Request, res: Response) => {
  if (!(await verifyClientAccess(req, res))) return;
  if (!(await verifyPillarAccess(req, res, 'management'))) return;
  const clientId = String(req.params.clientId);
  const result = await storage.createEmployee({ ...req.body, clientId });
  fanOutBackSync({ companyId: clientId, entityType: 'employee', entity: result, op: 'upsert' });
  return res.json(result);
});

// Bulk-create employees (the client's bulk import path — the previous endpoint
// was dead, so the store fell back to N individual POSTs).
router.post('/bulk', requireAuth, async (req: Request, res: Response) => {
  if (!(await verifyClientAccess(req, res))) return;
  if (!(await verifyPillarAccess(req, res, 'management'))) return;
  const clientId = String(req.params.clientId);
  const rows: any[] = Array.isArray(req.body?.employees) ? req.body.employees : [];
  if (!rows.length) return res.json({ inserted: 0, employees: [] });
  const stamped = rows.map((r) => ({ ...r, clientId }));
  const inserted = await storage.createEmployeesBulk(stamped);
  // Fan-out per row — the back-sync helper debounces by (companyId, section)
  // so this collapses into one workbook write for the whole bulk import.
  for (const row of inserted) {
    fanOutBackSync({ companyId: clientId, entityType: 'employee', entity: row, op: 'upsert' });
  }
  return res.json({ inserted: inserted.length, employees: inserted });
});

router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  // 404 on unknown id rather than a silent no-op update.
  const doc = await EmployeeModel.findOne({ id: String(req.params.id) }).lean();
  if (!doc) return res.status(404).json({ message: "Employee not found" });
  if (!(await verifyResourceOwnership(req, res, doc.clientId))) return;
  if (!(await verifyPillarAccess(req, res, 'management', doc.clientId))) return;
  const result = await storage.updateEmployee(String(req.params.id), req.body);
  if (result) fanOutBackSync({ companyId: String(doc.clientId), entityType: 'employee', entity: result, op: 'upsert' });
  return res.json(result);
});

router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const doc = await EmployeeModel.findOne({ id: String(req.params.id) }).lean();
  if (!doc) return res.status(404).json({ message: "Employee not found" });
  if (!(await verifyResourceOwnership(req, res, doc.clientId))) return;
  if (!(await verifyPillarAccess(req, res, 'management', doc.clientId))) return;
  await storage.deleteEmployee(String(req.params.id));
  fanOutBackSync({ companyId: String(doc.clientId), entityType: 'employee', entity: doc, op: 'delete' });
  return res.json({ message: "Deleted" });
});

export default router;

