import { stripServerControlledFields } from '../middleware/sanitizeBody.js';
import { Router, type Request as ExpressRequest, type Response } from 'express';

type Request = ExpressRequest<Record<string, string>, any, any, Record<string, string>>;
import { storage } from '../../storage.js';
import { requireAuth, verifyClientAccess, verifyResourceOwnership, verifyPillarAccess } from '../middleware/auth.js';
import { ShareholderModel } from '../../models.js';
import { fanOutBackSync } from '../services/workbookBackSyncFanout.js';

// mergeParams is LOAD-BEARING: these routers mount under
// /api/clients/:clientId/... — without it req.params.clientId is undefined
// inside the router, verifyClientAccess/verifyPillarAccess PASS OPEN on the
// empty id, and creates write clientId:"undefined" orphans. Proven live by
// the 2026-07-26 round-trip probe.
const router = Router({ mergeParams: true });

router.post('/', requireAuth, async (req: Request, res: Response) => {
  if (!(await verifyClientAccess(req, res))) return;
  if (!(await verifyPillarAccess(req, res, 'ownership'))) return;
  const clientId = String(req.params.clientId);
  const result = await storage.createShareholder({ ...stripServerControlledFields(req.body), clientId });
  fanOutBackSync({ companyId: clientId, entityType: 'shareholder', entity: result, op: 'upsert' });
  return res.json(result);
});

router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const doc = await ShareholderModel.findOne({ id: String(req.params.id) }).lean();
  if (!doc) return res.status(404).json({ message: "Shareholder not found" });
  if (!(await verifyResourceOwnership(req, res, doc.clientId))) return;
  if (!(await verifyPillarAccess(req, res, 'ownership', doc.clientId))) return;
  await storage.deleteShareholder(String(req.params.id));
  fanOutBackSync({ companyId: String(doc.clientId), entityType: 'shareholder', entity: doc, op: 'delete' });
  return res.json({ message: "Deleted" });
});

router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  // Previously had no ownership/scope check — silently allowed cross-client
  // edits. Now mirrors the employee/supplier pattern.
  const doc = await ShareholderModel.findOne({ id: String(req.params.id) }).lean();
  if (!doc) return res.status(404).json({ message: "Shareholder not found" });
  if (!(await verifyResourceOwnership(req, res, doc.clientId))) return;
  if (!(await verifyPillarAccess(req, res, 'ownership', doc.clientId))) return;
  const result = await storage.updateShareholder(String(req.params.id), req.body);
  if (result) fanOutBackSync({ companyId: String(doc.clientId), entityType: 'shareholder', entity: result, op: 'upsert' });
  return res.json(result);
});

router.patch('/:clientId/ownership', requireAuth, async (req: Request, res: Response) => {
  if (!(await verifyClientAccess(req, res))) return;
  if (!(await verifyPillarAccess(req, res, 'ownership'))) return;
  const result = await storage.upsertOwnershipData(String(req.params.clientId), req.body);
  return res.json(result);
});

export default router;

