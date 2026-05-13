import { Router, type Request as ExpressRequest, type Response } from 'express';

type Request = ExpressRequest<Record<string, string>, any, any, Record<string, string>>;
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { Worker } from 'worker_threads';
import { storage } from '../../storage.js';
import { createLogger } from '../logger.js';

const logger = createLogger("Import");
import { requireAuth } from '../middleware/auth.js';
import type { PipelineResult } from '../../pipeline/index.js';

// __dirname is available in the CJS bundle produced by esbuild.
// The worker is bundled as dist/excelParseWorker.cjs alongside dist/index.cjs.
const WORKER_PATH = path.resolve(__dirname, 'excelParseWorker.cjs');

function runParseInWorker(buffer: Buffer, filename: string): Promise<PipelineResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_PATH, {
      workerData: { buffer: new Uint8Array(buffer), filename },
    });
    worker.once('message', (msg: { ok: boolean; result?: PipelineResult; error?: string }) => {
      if (msg.ok) resolve(msg.result!);
      else reject(new Error(msg.error ?? 'Worker parse error'));
    });
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
    });
  });
}

const uploadLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20,
  message: { message: "Too many file uploads, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, cb) => {
      cb(null, `import-${Date.now()}-${file.originalname}`);
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/pdf',
      'application/octet-stream',
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'image/svg+xml',
    ];
    if (allowed.includes(file.mimetype) || /\.(xlsx?|csv|pdf|png|jpe?g|gif|webp|svg)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type.'));
    }
  },
});

const router = Router();

router.get('/logs', requireAuth, async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 20));
    const result = await storage.getImportLogsByUserPaginated(req.session.userId!, page, limit);
    return res.json(result);
  } catch (error: unknown) {
    logger.error('Get import logs error', error);
    return res.status(500).json({ message: "Failed to fetch import logs" });
  }
});

router.post('/excel', requireAuth, uploadLimiter, upload.array('files', 10), async (req: Request, res: Response) => {
  const isProd = process.env.NODE_ENV === "production";
  try {
    const files = req.files as Express.Multer.File[];

    const emptyPipeline = {
      status: 'failed' as const,
      processedAt: new Date().toISOString(),
      sourceFiles: [],
      extractionSummary: { sheetsParsed: 0, sheetsTotal: 0, rowsExtracted: 0, entitiesExtracted: 0, warnings: [] as string[], errors: [] as string[] },
      client: { name: '', tradeName: '', address: '', registrationNumber: '', vatNumber: '', financialYearEnd: '', industrySector: '', applicableScorecard: '', applicableCodes: '', certificateNumber: '' },
      financials: { revenue: 0, npat: 0, payroll: 0, leviableAmount: 0, tmpsInclusions: 0, tmpsExclusions: 0, tmps: 0, deemedNpat: 0, deemedNpatUsed: false, industryNormUsed: 0 },
      ownership: { blackOwnershipPercent: 0, blackFemaleOwnershipPercent: 0, votingRightsBlack: 0, economicInterestBlack: 0, calculatedPoints: 0, subMinimumMet: false, shareholders: [] },
      managementControl: { calculatedPoints: 0, employeesCount: 0, blackBoardPercent: 0, blackExecPercent: 0, disabledPercent: 0, employees: [] },
      skillsDevelopment: { calculatedPoints: 0, subMinimumMet: false, leviableAmount: 0, totalSpendBlack: 0, trainingProgramsCount: 0, trainings: [] },
      preferentialProcurement: { calculatedPoints: 0, subMinimumMet: false, tmps: 0, recognizedSpend: 0, suppliersCount: 0, suppliers: [] },
      enterpriseSupplierDevelopment: { calculatedPoints: 0, totalContributions: 0, esdList: [] },
      socioEconomicDevelopment: { calculatedPoints: 0, totalSpend: 0, sedList: [] },
      yes: { qualified: false, youthCount: 0, absorbedCount: 0 },
      scorecard: { pillars: { ownership: 0, managementControl: 0, skillsDevelopment: 0, preferentialProcurement: 0, enterpriseSupplierDevelopment: 0, socioEconomicDevelopment: 0, yesInitiative: 0, totalPoints: 0 }, beeLevel: 'Non-Compliant', recognitionLevelPercent: 0, blackOwnershipPercent: 0, blackFemaleOwnershipPercent: 0, valueAddingSupplier: 'NO', edBeneficiary: 'NO', edCategory: 'N/A', subMinimumsMet: false, discountedLevel: 'Non-Compliant', isDiscounted: false, yesTier: null },
      rawData: { financeRaw: [], ownershipRaw: [], mcRaw: [] },
      pdfCertificateData: { docNo: '', approvedBy: '', revisionNo: '', lastModified: '', verificationDate: '', analyst: '', signatory: '' },
      strategyPackSuggestions: [],
      sheetsFound: [] as string[],
      sheetsMatched: [] as unknown[],
      logs: [] as { message: string; type: string; timestamp: string }[],
    };

    if (!files || files.length === 0) {
      return res.status(400).json({ ...emptyPipeline, extractionSummary: { ...emptyPipeline.extractionSummary, errors: ['No files were uploaded.'] }, logs: [{ message: 'No files received', type: 'error', timestamp: new Date().toISOString() }] });
    }

    const excelFile = files.find(f => /\.(xlsx?|csv)$/i.test(f.originalname));
    if (!excelFile) {
      await Promise.all(files.map(f => fs.unlink(f.path).catch(() => {})));
      return res.status(400).json({ ...emptyPipeline, extractionSummary: { ...emptyPipeline.extractionSummary, errors: ['No Excel file found in upload.'] }, logs: [{ message: 'No Excel file in upload batch', type: 'error', timestamp: new Date().toISOString() }] });
    }

    const fileBuffer = await fs.readFile(excelFile.path);

    // Run CPU-bound Excel parsing in a worker thread so the main event loop
    // (and health-check endpoint) stays responsive for large files.
    const pipelineResult = await runParseInWorker(fileBuffer, excelFile.originalname);

    await Promise.all(files.map(f => fs.unlink(f.path).catch(() => {})));

    if (req.session.userId) {
      try {
        await storage.createImportLog({
          userId: req.session.userId,
          clientId: req.body.clientId || null,
          fileName: excelFile.originalname,
          status: pipelineResult.status === 'failed' ? 'failed' : 'success',
          sheetsFound: pipelineResult.extractionSummary.sheetsTotal,
          sheetsMatched: pipelineResult.extractionSummary.sheetsParsed,
          entitiesExtracted: pipelineResult.extractionSummary.entitiesExtracted,
          errors: pipelineResult.extractionSummary.errors,
        });
      } catch (logErr) {
        logger.error('Failed to log import', logErr);
      }
    }

    return res.json(pipelineResult);
  } catch (error: unknown) {
    logger.error('Import error', error);
    const files = req.files as Express.Multer.File[] | undefined;
    if (files) await Promise.all(files.map(f => fs.unlink(f.path).catch(() => {})));
    const message = isProd ? 'An unexpected error occurred during import.' : (error instanceof Error ? error.message : 'An unexpected error occurred during import.');
    return res.status(500).json({
      status: 'failed',
      processedAt: new Date().toISOString(),
      sourceFiles: [],
      extractionSummary: { sheetsParsed: 0, sheetsTotal: 0, rowsExtracted: 0, entitiesExtracted: 0, warnings: [], errors: [message] },
      client: { name: '', tradeName: '', address: '', registrationNumber: '', vatNumber: '', financialYearEnd: '', industrySector: '', applicableScorecard: '', applicableCodes: '', certificateNumber: '' },
      financials: { revenue: 0, npat: 0, payroll: 0, leviableAmount: 0, tmpsInclusions: 0, tmpsExclusions: 0, tmps: 0, deemedNpat: 0, deemedNpatUsed: false, industryNormUsed: 0 },
      ownership: { blackOwnershipPercent: 0, blackFemaleOwnershipPercent: 0, votingRightsBlack: 0, economicInterestBlack: 0, calculatedPoints: 0, subMinimumMet: false, shareholders: [] },
      managementControl: { calculatedPoints: 0, employeesCount: 0, blackBoardPercent: 0, blackExecPercent: 0, disabledPercent: 0, employees: [] },
      skillsDevelopment: { calculatedPoints: 0, subMinimumMet: false, leviableAmount: 0, totalSpendBlack: 0, trainingProgramsCount: 0, trainings: [] },
      preferentialProcurement: { calculatedPoints: 0, subMinimumMet: false, tmps: 0, recognizedSpend: 0, suppliersCount: 0, suppliers: [] },
      enterpriseSupplierDevelopment: { calculatedPoints: 0, totalContributions: 0, esdList: [] },
      socioEconomicDevelopment: { calculatedPoints: 0, totalSpend: 0, sedList: [] },
      yes: { qualified: false, youthCount: 0, absorbedCount: 0 },
      scorecard: { pillars: { ownership: 0, managementControl: 0, skillsDevelopment: 0, preferentialProcurement: 0, enterpriseSupplierDevelopment: 0, socioEconomicDevelopment: 0, yesInitiative: 0, totalPoints: 0 }, beeLevel: 'Non-Compliant', recognitionLevelPercent: 0, blackOwnershipPercent: 0, blackFemaleOwnershipPercent: 0, valueAddingSupplier: 'NO', edBeneficiary: 'NO', edCategory: 'N/A', subMinimumsMet: false, discountedLevel: 'Non-Compliant', isDiscounted: false, yesTier: null },
      rawData: { financeRaw: [], ownershipRaw: [], mcRaw: [] },
      pdfCertificateData: { docNo: '', approvedBy: '', revisionNo: '', lastModified: '', verificationDate: '', analyst: '', signatory: '' },
      strategyPackSuggestions: [],
      sheetsFound: [],
      sheetsMatched: [],
      logs: [{ message: isProd ? 'Server error during import.' : `Server error: ${error instanceof Error ? error.message : 'Unknown'}`, type: 'error', timestamp: new Date().toISOString() }],
    });
  }
});

export default router;

