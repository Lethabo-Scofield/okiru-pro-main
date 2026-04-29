import { Router, type Request as ExpressRequest, type Response } from 'express';

type Request = ExpressRequest<Record<string, string>, any, any, Record<string, string>>;
import multer from 'multer';
import { storage } from '../../storage.js';
import { createLogger } from '../logger.js';

const logger = createLogger("Clients");
import { requireAuth, verifyClientAccess } from '../middleware/auth.js';
import { PERMISSIONS, requirePermission, recordAudit } from '../security/index.js';
import {
  ShareholderModel, OwnershipDataModel, EmployeeModel, TrainingProgramModel,
  SupplierModel, ProcurementDataModel, EsdContributionModel, SedContributionModel,
  ScenarioModel, FinancialYearModel, ImportLogModel, ExportLogModel,
} from '../../models.js';

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

router.get('/', requireAuth, requirePermission(PERMISSIONS.CLIENT_READ), async (req: Request, res: Response) => {
  const orgId = req.session.organizationId!;
  const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 50));
  const result = await storage.getClientsByOrgPaginated(orgId, page, limit);
  return res.json(result);
});

router.post('/', requireAuth, requirePermission(PERMISSIONS.CLIENT_WRITE), async (req: Request, res: Response) => {
  try {
    const orgId = req.session.organizationId!;
    const client = await storage.createClient({ ...req.body, organizationId: orgId });
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
  const client = await storage.updateClient(String(req.params.id), req.body);
  if (!client) return res.status(404).json({ message: "Client not found" });
  await recordAudit(req, {
    action: "client.update",
    resourceType: "client",
    resourceId: client.id,
    result: "success",
    metadata: { fields: Object.keys(req.body || {}) },
  });
  return res.json(client);
});

router.delete('/:id', requireAuth, requirePermission(PERMISSIONS.CLIENT_DELETE), async (req: Request, res: Response) => {
  if (!(await verifyClientAccess(req, res))) return;
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
      esd: { contributions: esdData },
      sed: { contributions: sedData },
      scenarios: scenariosData,
    });
  } catch (error: unknown) {
    logger.error('Get client data error', error);
    return res.status(500).json({ message: "Failed to load client data" });
  }
});

export default router;

