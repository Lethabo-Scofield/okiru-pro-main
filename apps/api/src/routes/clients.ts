/**
 * /api/clients router.
 *
 * Migrated to use the centralized data layer (Repository + Unit of Work).
 *
 * Lifecycle (per architecture doc §5.1):
 *   1. attachUow middleware opens a per-request UoW from the factory
 *   2. Handler reads/writes via req.uow.clients (NEVER imports Mongoose models
 *      or storage.ts for client-shaped operations)
 *   3. Handler calls req.commitUow!() on success
 *   4. withUowErrorHandler rolls back on error
 *
 * Operations that touch entities NOT yet migrated to the data layer (cascade
 * delete across 12 collections, getClientData aggregation across all related
 * entities) still use the legacy storage.ts facade. Those will move when the
 * other entities (Shareholder, Employee, Supplier, ...) get their own
 * repositories.
 */
import { Router, type Request as ExpressRequest, type Response, type NextFunction } from 'express';

type Request = ExpressRequest<Record<string, string>, any, any, Record<string, string>>;
import multer from 'multer';
import { z } from 'zod';
import { storage } from '../../storage.js';
import { createLogger } from '../logger.js';
import { requireAuth, verifyClientAccess } from '../middleware/auth.js';
import { attachUow, withUowErrorHandler } from '../data-layer/middleware/attach-uow.js';
import type { AppDataAccessFactory } from '../data-layer/index.js';

/**
 * Strict, allowlisted payload schemas. .strict() rejects unknown keys so a
 * client cannot smuggle in fields like `organizationId`, `id`, `createdAt`,
 * or future-added internal flags via mass assignment. Every field is
 * explicitly typed.
 */
const clientCreateSchema = z.object({
  name: z.string().min(1).max(200),
  financialYear: z.string().min(1).max(20),
  revenue: z.number().nonnegative().optional(),
  npat: z.number().optional(),
  leviableAmount: z.number().nonnegative().optional(),
  industrySector: z.string().max(100).optional(),
  eapProvince: z.string().max(50).optional(),
  industryNorm: z.number().nullable().optional(),
  logo: z.string().nullable().optional(),
  pipelineOverrides: z.unknown().optional(),
}).strict();

const clientUpdateSchema = clientCreateSchema.partial();
import {
  ShareholderModel, OwnershipDataModel, EmployeeModel, TrainingProgramModel,
  SupplierModel, ProcurementDataModel, EsdContributionModel, SedContributionModel,
  ScenarioModel, FinancialYearModel, ImportLogModel, ExportLogModel,
} from '../../models.js';

const logger = createLogger("Clients");

const upload = multer({ storage: multer.memoryStorage() });

/**
 * Factory-style export so the composition root can inject the data access
 * factory. Mirrors createDataLayerDemoRouter and the architecture doc's
 * recommendation to keep route construction explicit (no module-level
 * `app.locals` magic).
 */
export function createClientsRouter(factory: AppDataAccessFactory): Router {
  const router = Router();

  router.use(requireAuth);
  router.use(attachUow(factory));

  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.session.organizationId!;
      const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 50));
      const result = await req.uow!.clients.findByOrganizationPaginated(orgId, page, limit);
      await req.commitUow!();
      return res.json(result);
    } catch (err) {
      logger.error('List clients failed', err as Error);
      return next(err);
    }
  });

  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.session.organizationId!;
      const parsed = clientCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Invalid client payload",
          issues: parsed.error.issues,
        });
      }
      const created = await req.uow!.clients.create({
        ...parsed.data,
        organizationId: orgId, // server-controlled, never from request body
      });
      await req.commitUow!();
      return res.json(created);
    } catch (err) {
      logger.error('Create client failed', err as Error);
      return next(err);
    }
  });

  router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!(await verifyClientAccess(req, res))) return;
      const client = await req.uow!.clients.findById(String(req.params.id));
      await req.commitUow!();
      if (!client) return res.status(404).json({ message: "Client not found" });
      return res.json(client);
    } catch (err) {
      logger.error('Get client failed', err as Error);
      return next(err);
    }
  });

  router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!(await verifyClientAccess(req, res))) return;
      const parsed = clientUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Invalid client payload",
          issues: parsed.error.issues,
        });
      }
      const client = await req.uow!.clients.update(String(req.params.id), parsed.data);
      await req.commitUow!();
      if (!client) return res.status(404).json({ message: "Client not found" });
      return res.json(client);
    } catch (err) {
      logger.error('Update client failed', err as Error);
      return next(err);
    }
  });

  /**
   * DELETE still uses the legacy storage facade plus direct model deletes for
   * the cascade. Migrating this safely requires repositories for all 12
   * cascaded collections (Shareholder, Employee, Supplier, ...). Tracked in
   * the migration backlog.
   */
  router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
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
      await req.commitUow!();
      return res.json({ message: "Deleted" });
    } catch (err) {
      logger.error('Delete client failed', err as Error);
      return next(err);
    }
  });

  router.post('/:id/logo', upload.single('logo'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!(await verifyClientAccess(req, res))) return;
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const base64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
      const updated = await req.uow!.clients.update(String(req.params.id), { logo: base64 });
      await req.commitUow!();
      if (!updated) return res.status(404).json({ message: "Client not found" });
      return res.json(updated);
    } catch (err) {
      logger.error('Upload client logo failed', err as Error);
      return next(err);
    }
  });

  /**
   * Aggregation across many entities — still uses storage.ts facade because
   * the related entities (FinancialYears, Shareholders, Employees, Suppliers,
   * etc.) have not been migrated to the data layer yet. The client itself is
   * read via the data layer; everything else is read via storage.
   */
  router.get('/:id/data', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!(await verifyClientAccess(req, res))) return;
      const clientId = String(req.params.id);
      const client = await req.uow!.clients.findById(clientId);
      if (!client) {
        await req.commitUow!();
        return res.status(404).json({ message: "Client not found" });
      }

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

      await req.commitUow!();
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
    } catch (err) {
      logger.error('Get client data failed', err as Error);
      return next(err);
    }
  });

  router.use(withUowErrorHandler());

  return router;
}

/**
 * Backwards-compatible default export — some legacy imports may still reach
 * for the module's default. Always prefer `createClientsRouter(factory)` from
 * the composition root.
 *
 * Throws on use to make it impossible to accidentally mount a router without
 * the data layer wired in.
 */
const defaultRouter = Router();
defaultRouter.use((_req, _res, next) => {
  next(new Error("clients router was mounted without a data access factory — use createClientsRouter(factory)"));
});
export default defaultRouter;
