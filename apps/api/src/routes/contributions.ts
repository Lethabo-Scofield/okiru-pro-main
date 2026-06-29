import { Router, type Request as ExpressRequest, type Response } from 'express';

type Request = ExpressRequest<Record<string, string>, any, any, Record<string, string>>;
import { storage } from '../../storage.js';
import { requireAuth, verifyClientAccess, verifyResourceOwnership, verifyPillarAccess } from '../middleware/auth.js';
import { EsdContributionModel, SedContributionModel } from '../../models.js';

// IMPORTANT: previous handlers used router.post('/esd') / '/sed' but the
// router is already mounted at /api/clients/:clientId/esd-contributions etc.,
// so the full match would have been /api/clients/X/esd-contributions/esd —
// which no client ever posts to. Effect: every addEsdContribution and
// addSedContribution call silently 404'd (caught by .catch(console.error) in
// the store, masking the failure). Routes now use the bare POST '/' and
// DELETE '/:id' shape that actually matches what the client sends, and
// disambiguate ESD vs SED by mount path via req.baseUrl.

const router = Router({ mergeParams: true });

function isSedRequest(req: Request): boolean {
  return req.baseUrl.includes('sed-contributions');
}

// POST /api/clients/:clientId/{esd,sed}-contributions
router.post('/', requireAuth, async (req: Request, res: Response) => {
  if (!(await verifyClientAccess(req, res))) return;
  const sed = isSedRequest(req);
  const pillarKey = sed ? 'sed' : 'esd';
  if (!(await verifyPillarAccess(req, res, pillarKey))) return;
  const payload = { ...req.body, clientId: String(req.params.clientId) };
  const result = sed
    ? await storage.createSedContribution(payload)
    : await storage.createEsdContribution(payload);
  return res.json(result);
});

// DELETE /api/{esd,sed}-contributions/:id
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const sed = isSedRequest(req);
  const Model = sed ? SedContributionModel : EsdContributionModel;
  const pillarKey = sed ? 'sed' : 'esd';
  const doc = await Model.findOne({ id: String(req.params.id) }).lean();
  if (!doc) return res.status(404).json({ message: `${sed ? 'SED' : 'ESD'} contribution not found` });
  if (!(await verifyResourceOwnership(req, res, doc.clientId))) return;
  if (!(await verifyPillarAccess(req, res, pillarKey, doc.clientId))) return;
  if (sed) await storage.deleteSedContribution(String(req.params.id));
  else await storage.deleteEsdContribution(String(req.params.id));
  return res.json({ message: "Deleted" });
});

export default router;

