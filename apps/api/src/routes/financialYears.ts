import { stripServerControlledFields } from '../middleware/sanitizeBody.js';
import { Router, type Request as ExpressRequest, type Response } from 'express';

type Request = ExpressRequest<Record<string, string>, any, any, Record<string, string>>;
import { storage } from '../../storage.js';
import { requireAuth, verifyClientAccess, verifyResourceOwnership, verifyFullScorecardAccess } from '../middleware/auth.js';
import { FinancialYearModel } from '../../models.js';

// mergeParams is LOAD-BEARING: these routers mount under
// /api/clients/:clientId/... — without it req.params.clientId is undefined
// inside the router, verifyClientAccess/verifyPillarAccess PASS OPEN on the
// empty id, and creates write clientId:"undefined" orphans. Proven live by
// the 2026-07-26 round-trip probe.
const router = Router({ mergeParams: true });

router.post('/', requireAuth, async (req: Request, res: Response) => {
  if (!(await verifyClientAccess(req, res))) return;
  // Financial year carries revenue / NPAT / leviable — every pillar reads it.
  if (!(await verifyFullScorecardAccess(req, res))) return;
  const result = await storage.createFinancialYear({ ...stripServerControlledFields(req.body), clientId: String(req.params.clientId) });
  return res.json(result);
});

router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  const doc = await FinancialYearModel.findOne({ id: String(req.params.id) }).lean();
  if (!doc) return res.status(404).json({ message: "Financial year not found" });
  if (!(await verifyResourceOwnership(req, res, doc.clientId))) return;
  if (!(await verifyFullScorecardAccess(req, res, doc.clientId))) return;
  const result = await storage.updateFinancialYear(String(req.params.id), req.body);
  return res.json(result);
});

router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const doc = await FinancialYearModel.findOne({ id: String(req.params.id) }).lean();
  if (!doc) return res.status(404).json({ message: "Financial year not found" });
  if (!(await verifyResourceOwnership(req, res, doc.clientId))) return;
  if (!(await verifyFullScorecardAccess(req, res, doc.clientId))) return;
  await storage.deleteFinancialYear(String(req.params.id));
  return res.json({ message: "Deleted" });
});

export default router;

