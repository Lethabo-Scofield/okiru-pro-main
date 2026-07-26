import { Router, type Request as ExpressRequest, type Response } from 'express';

type Request = ExpressRequest<Record<string, string>, any, any, Record<string, string>>;
import multer from 'multer';
import { storage } from '../../storage.js';
import { createLogger } from '../logger.js';

const logger = createLogger("Clients");
import { requireAuth, verifyClientAccess, verifyPillarAccess, verifyFullScorecardAccess } from '../middleware/auth.js';
import { PERMISSIONS, requirePermission, recordAudit } from '../security/index.js';
import { ClientModel } from '../../models.js';
import { fanOutClientMetaBackSync } from '../services/workbookBackSyncFanout.js';
import {
  ShareholderModel, OwnershipDataModel, EmployeeModel, TrainingProgramModel,
  SupplierModel, ProcurementDataModel, EsdContributionModel, SedContributionModel,
  ScenarioModel, FinancialYearModel, ImportLogModel, ExportLogModel,
} from '../../models.js';

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

/**
 * Fields a caller may never set or change through the API.
 *
 * `verifyClientAccess` controls WHICH client a caller may touch; it does not
 * control WHICH FIELDS. Without this, `PATCH /:id` passed `req.body` straight to
 * `storage.updateClient`, so an authorised user could set `organizationId` and
 * move the record into another tenant, or overwrite `createdByUserId` / `id` /
 * timestamps. Ownership and identity are server-assigned, never client-supplied.
 */
const PROTECTED_CLIENT_FIELDS = new Set([
  'id',
  '_id',
  'organizationId',
  'createdByUserId',
  'createdAt',
  'updatedAt',
]);

/** Numeric client fields that must never be negative. */
const NON_NEGATIVE_CLIENT_FIELDS = [
  'revenue',
  'npat',
  'leviableAmount',
  'tmps',
  'companyValue',
  'outstandingDebt',
  'numberOfEmployees',
] as const;

/**
 * Validate a client payload. The route previously accepted anything, so a
 * create with no name or a negative revenue was persisted and only surfaced
 * later as a nonsensical scorecard. `requireName` is on for create, off for
 * partial updates.
 */
function validateClientPayload(
  body: Record<string, unknown>,
  { requireName }: { requireName: boolean },
): string[] {
  const errors: string[] = [];

  if (requireName) {
    const name = body.name;
    if (typeof name !== 'string' || name.trim() === '') {
      errors.push('name is required');
    }
    // The Client schema requires financialYear; without this check a create
    // missing it passed validation here and 500'd on the Mongoose save — an
    // unexplained failure instead of a clear 400.
    if (body.financialYear === undefined || body.financialYear === null || String(body.financialYear).trim() === '') {
      errors.push('financialYear is required');
    }
  } else if ('name' in body && (typeof body.name !== 'string' || body.name.trim() === '')) {
    errors.push('name must be a non-empty string');
  }

  for (const field of NON_NEGATIVE_CLIENT_FIELDS) {
    if (!(field in body) || body[field] === null || body[field] === undefined) continue;
    const value = Number(body[field]);
    if (!Number.isFinite(value)) errors.push(`${field} must be a number`);
    else if (value < 0) errors.push(`${field} must not be negative`);
  }

  return errors;
}

/**
 * Strip server-owned fields from a client-supplied payload. Returns the safe
 * patch plus the names that were rejected, so the attempt can be audited rather
 * than silently ignored.
 */
function stripProtectedClientFields(body: unknown): {
  safe: Record<string, unknown>;
  rejected: string[];
} {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { safe: {}, rejected: [] };
  }
  const safe: Record<string, unknown> = {};
  const rejected: string[] = [];
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (PROTECTED_CLIENT_FIELDS.has(key)) rejected.push(key);
    else safe[key] = value;
  }
  return { safe, rejected };
}

router.get('/', requireAuth, requirePermission(PERMISSIONS.CLIENT_READ), async (req: Request, res: Response) => {
  const orgId = req.session.organizationId!;
  const userId = req.session.userId!;
  const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 50));
  const skip = (page - 1) * limit;
  const visibilityFilter = {
    $or: [
      { createdByUserId: userId },
      ...(orgId ? [{ organizationId: orgId }] : []),
    ],
  };
  const [docs, total] = await Promise.all([
    ClientModel.find(visibilityFilter).skip(skip).limit(limit).lean(),
    ClientModel.countDocuments(visibilityFilter),
  ]);
  return res.json({
    items: docs,
    total,
    page,
    limit,
  });
});

router.post('/', requireAuth, requirePermission(PERMISSIONS.CLIENT_WRITE), async (req: Request, res: Response) => {
  try {
    const orgId = req.session.organizationId!;
    const userId = req.session.userId!;
    // Server-owned fields are stripped before the spread so a crafted body can
    // never seed an id/timestamp or claim another tenant.
    const { safe, rejected } = stripProtectedClientFields(req.body);
    if (rejected.length) {
      logger.warn('Rejected protected fields on client create', { rejected, userId, orgId });
    }
    const errors = validateClientPayload(safe, { requireName: true });
    if (errors.length) {
      return res.status(400).json({ message: 'Invalid client payload', errors });
    }
    // `safe` is an unknown-shaped record after stripping; validateClientPayload
    // above has already enforced the required fields at runtime.
    const client = await storage.createClient({
      ...safe,
      organizationId: orgId,
      createdByUserId: userId,
    } as Parameters<typeof storage.createClient>[0]);
    await recordAudit(req, {
      action: "client.create",
      resourceType: "client",
      resourceId: client.id,
      result: "success",
      metadata: { name: client.name },
    });
    return res.json(client);
  } catch (error: unknown) {
    logger.error('Create client error', error);
    await recordAudit(req, {
      action: "client.create",
      resourceType: "client",
      result: "failure",
      metadata: { reason: "exception" },
    });
    return res.status(500).json({ message: "Failed to create client" });
  }
});

router.get('/:id', requireAuth, requirePermission(PERMISSIONS.CLIENT_READ), async (req: Request, res: Response) => {
  if (!(await verifyClientAccess(req, res))) return;
  const client = await storage.getClient(String(req.params.id));
  if (!client) return res.status(404).json({ message: "Client not found" });
  return res.json(client);
});

router.patch('/:id', requireAuth, requirePermission(PERMISSIONS.CLIENT_WRITE), async (req: Request, res: Response) => {
  if (!(await verifyClientAccess(req, res))) return;
  // updateClient is CROSS-PILLAR: it carries revenue/NPAT/TMPS/leviable, AFS
  // and the ESD bonuses — the denominators every pillar scores from. A
  // pillar-scoped collaborator (say skills-only) must not be able to rewrite
  // them; this was the one write on this router with no workspace-scope gate.
  // (Audit B15-srv completion, 2026-07-26.)
  if (!(await verifyFullScorecardAccess(req, res))) return;
  const clientId = String(req.params.id);
  // verifyClientAccess gates WHICH client may be edited; this gates WHICH FIELDS.
  // Without it a caller could reassign organizationId and move the record into
  // another tenant.
  const { safe, rejected } = stripProtectedClientFields(req.body);
  if (rejected.length) {
    logger.warn('Rejected protected fields on client update', {
      rejected,
      clientId,
      userId: req.session.userId,
    });
    await recordAudit(req, {
      action: "client.update.rejected_fields",
      resourceType: "client",
      resourceId: clientId,
      result: "failure",
      metadata: { rejected },
    });
  }
  const errors = validateClientPayload(safe, { requireName: false });
  if (errors.length) {
    return res.status(400).json({ message: 'Invalid client payload', errors });
  }
  const client = await storage.updateClient(clientId, safe);
  if (!client) return res.status(404).json({ message: "Client not found" });
  await recordAudit(req, {
    action: "client.update",
    resourceType: "client",
    resourceId: client.id,
    result: "success",
    metadata: { fields: Object.keys(safe) },
  });
  // Phase 2 back-sync: propagate the client patch to the matching workbook
  // section.meta blobs. Non-blocking; no-op when INTERNAL_BACKSYNC_TOKEN is
  // unset. Use the canonical client.clientId (the toolkit's id) so the
  // workbook is keyed correctly when the API id and clientId differ.
  fanOutClientMetaBackSync({
    companyId: String((client as any).clientId ?? client.id ?? clientId),
    patch: safe,
  });
  return res.json(client);
});

// PATCH /api/clients/:id/ownership — sets companyValue / outstandingDebt /
// yearsHeld. The Toolkit calls this via api.updateOwnership and the data ends
// up on the ownershipData collection. Previously this PATCH path didn't exist
// on apps/api OR apps/web — the route in shareholders.ts is mounted at
// /api/shareholders/:clientId/ownership which the Toolkit doesn't hit. Result:
// every "update valuation" silently 404'd in prod. Adding the canonical path
// here so client.companyValue actually saves.
router.patch('/:id/ownership', requireAuth, async (req: Request, res: Response) => {
  if (!(await verifyClientAccess(req, res))) return;
  if (!(await verifyPillarAccess(req, res, 'ownership'))) return;
  const clientId = String(req.params.id);
  const result = await storage.upsertOwnershipData(clientId, req.body);
  // Workbook back-sync — companyValue / outstandingDebt land in the
  // financial-information section meta (see clientPatchToWorkbookMeta).
  fanOutClientMetaBackSync({ companyId: clientId, patch: req.body ?? {} });
  return res.json(result);
});

// PATCH /api/clients/:id/procurement — sets TMPS. Same broken-path story as
// ownership above. The shareholders.ts route handles it for /api/shareholders/:clientId/procurement,
// but the Toolkit calls /api/clients/:id/procurement.
router.patch('/:id/procurement', requireAuth, async (req: Request, res: Response) => {
  if (!(await verifyClientAccess(req, res))) return;
  if (!(await verifyPillarAccess(req, res, 'procurement'))) return;
  const clientId = String(req.params.id);
  const tmps = Number(req.body?.tmps ?? 0);
  const result = await storage.upsertProcurementData(clientId, tmps);
  fanOutClientMetaBackSync({ companyId: clientId, patch: { tmps } });
  return res.json(result);
});

router.delete('/:id', requireAuth, requirePermission(PERMISSIONS.CLIENT_DELETE), async (req: Request, res: Response) => {
  if (!(await verifyClientAccess(req, res))) return;
  // Deleting the client destroys every pillar's records at once — the most
  // cross-pillar action there is. Workspace members below full access cannot.
  if (!(await verifyFullScorecardAccess(req, res))) return;
  const clientId = String(req.params.id);
  await Promise.all([
    ShareholderModel.deleteMany({ clientId }),
    OwnershipDataModel.deleteMany({ clientId }),
    EmployeeModel.deleteMany({ clientId }),
    TrainingProgramModel.deleteMany({ clientId }),
    SupplierModel.deleteMany({ clientId }),
    ProcurementDataModel.deleteMany({ clientId }),
    EsdContributionModel.deleteMany({ clientId }),
    SedContributionModel.deleteMany({ clientId }),
    ScenarioModel.deleteMany({ clientId }),
    FinancialYearModel.deleteMany({ clientId }),
    ImportLogModel.deleteMany({ clientId }),
    ExportLogModel.deleteMany({ clientId }),
  ]);
  await storage.deleteClient(clientId);
  await recordAudit(req, {
    action: "client.delete",
    resourceType: "client",
    resourceId: clientId,
    result: "success",
  });
  return res.json({ message: "Deleted" });
});

router.post('/:id/logo', requireAuth, requirePermission(PERMISSIONS.CLIENT_WRITE), upload.single('logo'), async (req: Request, res: Response) => {
  try {
    if (!(await verifyClientAccess(req, res))) return;
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const base64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    const updated = await storage.updateClient(String(req.params.id), { logo: base64 });
    if (!updated) return res.status(404).json({ message: "Client not found" });
    return res.json(updated);
  } catch {
    return res.status(500).json({ message: "Failed to upload logo" });
  }
});

router.get('/:id/data', requireAuth, requirePermission(PERMISSIONS.CLIENT_READ), async (req: Request, res: Response) => {
  try {
    if (!(await verifyClientAccess(req, res))) return;
    const clientId = String(req.params.id);
    const client = await storage.getClient(clientId);
    if (!client) return res.status(404).json({ message: "Client not found" });

    const [
      financialYearsData, shareholdersData, ownershipDataResult,
      employeesData, trainingProgramsData, suppliersData, procurementDataResult,
      esdData, sedData, scenariosData
    ] = await Promise.all([
      storage.getFinancialYears(clientId),
      storage.getShareholdersByClient(clientId),
      storage.getOwnershipData(clientId),
      storage.getEmployeesByClient(clientId),
      storage.getTrainingProgramsByClient(clientId),
      storage.getSuppliersByClient(clientId),
      storage.getProcurementData(clientId),
      storage.getEsdContributions(clientId),
      storage.getSedContributions(clientId),
      storage.getScenariosByClient(clientId),
    ]);

    return res.json({
      client,
      financialYears: financialYearsData,
      ownership: {
        ...(ownershipDataResult || { companyValue: 0, outstandingDebt: 0, yearsHeld: 0 }),
        shareholders: shareholdersData,
      },
      management: { employees: employeesData },
      skills: { leviableAmount: client.leviableAmount || 0, trainingPrograms: trainingProgramsData },
      procurement: { tmps: procurementDataResult?.tmps || 0, suppliers: suppliersData },
      esd: {
        contributions: esdData,
        graduationBonus: (client as any).graduationBonus ?? false,
        jobsCreatedBonus: (client as any).jobsCreatedBonus ?? false,
        jobsCreatedCount: (client as any).jobsCreatedCount ?? 0,
        graduationEvidence: (client as any).graduationEvidence ?? '',
        jobsCreatedEvidence: (client as any).jobsCreatedEvidence ?? '',
      },
      sed: {
        contributions: sedData,
        ceSpend: (client as any).ceSpend ?? 0,
        ceBonusSpend: (client as any).ceBonusSpend ?? 0,
        fundisaSpend: (client as any).fundisaSpend ?? 0,
      },
      afs: (client as any).afs ?? undefined,
      scenarios: scenariosData,
    });
  } catch (error: unknown) {
    logger.error('Get client data error', error);
    return res.status(500).json({ message: "Failed to load client data" });
  }
});

export default router;

