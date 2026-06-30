import { Router, type Request as ExpressRequest, type Response } from 'express';

type Request = ExpressRequest<Record<string, string>, any, any, Record<string, string>>;
import { storage } from '../../storage.js';
import { requireAuth, verifyClientAccess, verifyResourceOwnership, verifyPillarAccess } from '../middleware/auth.js';
import { SupplierModel } from '../../models.js';
import { fanOutBackSync } from '../services/workbookBackSyncFanout.js';

const router = Router();

router.post('/', requireAuth, async (req: Request, res: Response) => {
  if (!(await verifyClientAccess(req, res))) return;
  if (!(await verifyPillarAccess(req, res, 'procurement'))) return;
  const clientId = String(req.params.clientId);
  const result = await storage.createSupplier({ ...req.body, clientId });
  fanOutBackSync({ companyId: clientId, entityType: 'supplier', entity: result, op: 'upsert' });
  return res.json(result);
});

router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  // Previously had no ownership/scope check — silently allowed any authenticated
  // user to edit any supplier. Now mirrors the shareholder/employee pattern.
  const doc = await SupplierModel.findOne({ id: String(req.params.id) }).lean();
  if (!doc) return res.status(404).json({ message: "Supplier not found" });
  if (!(await verifyResourceOwnership(req, res, doc.clientId))) return;
  if (!(await verifyPillarAccess(req, res, 'procurement', doc.clientId))) return;
  const result = await storage.updateSupplier(String(req.params.id), req.body);
  if (result) fanOutBackSync({ companyId: String(doc.clientId), entityType: 'supplier', entity: result, op: 'upsert' });
  return res.json(result);
});

router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const doc = await SupplierModel.findOne({ id: String(req.params.id) }).lean();
  if (!doc) return res.status(404).json({ message: "Supplier not found" });
  if (!(await verifyResourceOwnership(req, res, doc.clientId))) return;
  if (!(await verifyPillarAccess(req, res, 'procurement', doc.clientId))) return;
  await storage.deleteSupplier(String(req.params.id));
  fanOutBackSync({ companyId: String(doc.clientId), entityType: 'supplier', entity: doc, op: 'delete' });
  return res.json({ message: "Deleted" });
});

router.patch('/:clientId/procurement', requireAuth, async (req: Request, res: Response) => {
  if (!(await verifyClientAccess(req, res))) return;
  if (!(await verifyPillarAccess(req, res, 'procurement'))) return;
  const result = await storage.upsertProcurementData(String(req.params.clientId), req.body.tmps);
  return res.json(result);
});

export default router;

