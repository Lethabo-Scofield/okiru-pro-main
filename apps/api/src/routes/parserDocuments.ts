import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import multer from 'multer';
import { z } from 'zod';
import { Document, ParserRunModel } from '../../models.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { createLogger } from '../logger.js';

const logger = createLogger('ParserDocuments');
const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } });
const SAFE_FIELD_CONFIDENCE = 0.85;

router.use(requireAuth);

type SessionIdentity = { userId: string; organizationId: string | null };

function identity(req: Request): SessionIdentity {
  return {
    userId: String((req.session as any).userId),
    organizationId: (req.session as any).organizationId ? String((req.session as any).organizationId) : null,
  };
}

export function tenantFilter(id: SessionIdentity): Record<string, unknown> {
  return id.organizationId ? { organizationId: id.organizationId } : { userId: id.userId, organizationId: null };
}

function documentFilter(req: Request, documentId: string): Record<string, unknown> {
  return { _id: documentId, source: 'parser', ...tenantFilter(identity(req)) };
}

function routeParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] || '' : value;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function documentJson(doc: Record<string, any>): Record<string, unknown> {
  return {
    id: String(doc._id),
    filename: doc.filename,
    fileType: doc.fileType,
    fileSize: doc.fileSize,
    uploadedAt: doc.uploadedAt,
    entityId: doc.entityId ?? null,
    status: doc.parserStatus ?? null,
    documentType: doc.parserDocumentType ?? null,
    overallConfidence: doc.parserOverallConfidence ?? null,
    extractedFieldCount: doc.parserExtractedFieldCount ?? 0,
    problemFieldCount: doc.parserProblemFieldCount ?? 0,
    reviewRequired: doc.parserReviewRequired ?? false,
    missingFields: doc.parserMissingFields ?? [],
    lowConfidenceFields: doc.parserLowConfidenceFields ?? [],
    latestRunId: doc.latestParserRunId ?? null,
    lastRunAt: doc.parserLastRunAt ?? null,
  };
}

function runSummary(run: Record<string, any>): Record<string, unknown> {
  return {
    runId: run.runId,
    documentId: String(run.documentId),
    status: run.status,
    documentType: run.documentType,
    overallConfidence: run.overallConfidence,
    extractedFieldCount: run.extractedFieldCount,
    missingFieldCount: run.missingFieldCount,
    problemFieldCount: run.problemFieldCount,
    missingFields: run.missingFields,
    lowConfidenceFields: run.lowConfidenceFields,
    warnings: run.warnings,
    errors: run.errors,
    reviewReasons: run.reviewReasons,
    requiresHumanReview: run.requiresHumanReview,
    parserVersion: run.parserVersion,
    graphVersion: run.graphVersion,
    createdAt: run.createdAt,
  };
}

const runInputSchema = z.object({
  parserOutput: z.record(z.unknown()),
  caseId: z.string().max(200).optional().nullable(),
  parserVersion: z.string().max(100).optional().nullable(),
  reviewReasons: z.array(z.string().max(1000)).max(200).optional(),
});

export function deriveParserRunData(output: Record<string, any>, suppliedReviewReasons: string[] = []) {
  const fields = output.extracted_fields && typeof output.extracted_fields === 'object'
    ? output.extracted_fields as Record<string, any>
    : {};
  const validation = output.validation && typeof output.validation === 'object' ? output.validation : {};
  const audit = output.audit_trail && typeof output.audit_trail === 'object' ? output.audit_trail : {};
  const missingFields = Array.from(new Set([
    ...(Array.isArray(validation.missing_fields) ? validation.missing_fields.map(String) : []),
    ...Object.entries(fields)
      .filter(([, field]) => field?.normalized_value == null && field?.raw_value == null)
      .map(([key]) => key),
  ]));
  const lowConfidenceFields = Object.entries(fields)
    .filter(([, field]) => field?.normalized_value != null && Number(field?.confidence ?? 0) < SAFE_FIELD_CONFIDENCE)
    .map(([key]) => key);
  const extractedFieldCount = Object.values(fields).filter((field) => field?.normalized_value != null).length;
  const warnings = Array.isArray(validation.warnings) ? validation.warnings.map(String) : [];
  const errors = Array.isArray(validation.errors) ? validation.errors.map(String) : [];
  const reviewReasons = Array.from(new Set([...suppliedReviewReasons, ...warnings, ...errors]));
  return {
    fields,
    audit,
    missingFields,
    lowConfidenceFields,
    extractedFieldCount,
    warnings,
    errors,
    reviewReasons,
    requiresHumanReview: output.status !== 'passed' || audit.requires_human_review === true,
    problemFieldCount: new Set([...missingFields, ...lowConfidenceFields]).size,
  };
}

router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ message: 'File is required (multipart field: file)' });
  const owner = identity(req);
  const contentHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
  const scope = owner.organizationId || owner.userId;
  // The legacy Document model has a globally unique fileHash. A scoped storage
  // hash preserves tenant isolation while contentHash keeps the true checksum.
  const fileHash = crypto.createHash('sha256').update(`${scope}:${contentHash}`).digest('hex');

  try {
    let doc = await Document.findOne({ source: 'parser', contentHash, ...tenantFilter(owner) });
    if (!doc) {
      doc = await Document.create({
        filename: req.file.originalname || 'document',
        fileType: req.file.mimetype || 'application/octet-stream',
        uploadedAt: new Date(),
        userId: owner.userId,
        organizationId: owner.organizationId,
        entityId: req.body.entityId || null,
        fileHash,
        contentHash,
        fileSize: req.file.size,
        rawContent: req.file.buffer,
        source: 'parser',
        status: 'uploaded',
      });
    }
    return res.status(201).json({ document: documentJson(doc.toObject()) });
  } catch (error) {
    logger.error('Failed to persist parser document', error as Error);
    return res.status(500).json({ message: 'Could not persist document' });
  }
});

router.post('/:id/runs', async (req: Request, res: Response) => {
  const parsed = runInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid parser result', issues: parsed.error.issues });
  const owner = identity(req);

  try {
    const documentId = routeParam(req.params.id);
    const doc = await Document.findOne(documentFilter(req, documentId));
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    const output = parsed.data.parserOutput as Record<string, any>;
    const status = output.status;
    if (!['passed', 'review_required', 'failed'].includes(status)) {
      return res.status(400).json({ message: 'Parser status must be passed, review_required, or failed' });
    }

    const derived = deriveParserRunData(output, parsed.data.reviewReasons ?? []);

    const run = await ParserRunModel.create({
      documentId: doc._id,
      userId: owner.userId,
      organizationId: owner.organizationId,
      caseId: parsed.data.caseId ?? null,
      parserVersion: parsed.data.parserVersion ?? null,
      graphVersion: typeof derived.audit.graph_version === 'string' ? derived.audit.graph_version : null,
      status,
      documentType: String(output.document_type || 'Unknown'),
      overallConfidence: Number(output.overall_confidence || 0),
      extractedFieldCount: derived.extractedFieldCount,
      missingFieldCount: derived.missingFields.length,
      problemFieldCount: derived.problemFieldCount,
      missingFields: derived.missingFields,
      lowConfidenceFields: derived.lowConfidenceFields,
      warnings: derived.warnings,
      errors: derived.errors,
      reviewReasons: derived.reviewReasons,
      requiresHumanReview: derived.requiresHumanReview,
      parserOutput: output,
    });

    await Document.updateOne(documentFilter(req, documentId), {
      $set: {
        latestParserRunId: run.runId,
        parserStatus: status,
        parserDocumentType: run.documentType,
        parserOverallConfidence: run.overallConfidence,
        parserExtractedFieldCount: run.extractedFieldCount,
        parserProblemFieldCount: run.problemFieldCount,
        parserReviewRequired: run.requiresHumanReview,
        parserMissingFields: run.missingFields,
        parserLowConfidenceFields: run.lowConfidenceFields,
        parserLastRunAt: run.createdAt,
        status: status === 'passed' ? 'parsed' : status,
      },
    });

    return res.status(201).json({ run: runSummary(run.toObject()) });
  } catch (error) {
    logger.error('Failed to persist parser run', error as Error, { documentId: routeParam(req.params.id) });
    return res.status(500).json({ message: 'Could not persist parser run' });
  }
});

router.get('/', async (req: Request, res: Response) => {
  const owner = identity(req);
  const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || '25'), 10) || 25));
  const filter: Record<string, any> = { source: 'parser', ...tenantFilter(owner) };
  const search = String(req.query.search || '').trim();
  if (search) filter.filename = { $regex: escapeRegex(search), $options: 'i' };
  if (['passed', 'review_required', 'failed'].includes(String(req.query.status))) filter.parserStatus = String(req.query.status);
  if (req.query.documentType) filter.parserDocumentType = String(req.query.documentType);
  if (req.query.reviewRequired === 'true') filter.parserReviewRequired = true;
  if (req.query.missingField) filter.parserMissingFields = String(req.query.missingField);
  if (req.query.lowConfidence === 'true') filter.parserLowConfidenceFields = { $exists: true, $ne: [] };
  if (req.query.from || req.query.to) {
    filter.uploadedAt = {};
    if (req.query.from) filter.uploadedAt.$gte = new Date(String(req.query.from));
    if (req.query.to) filter.uploadedAt.$lte = new Date(`${String(req.query.to).slice(0, 10)}T23:59:59.999Z`);
  }

  try {
    const [docs, total, documentTypes] = await Promise.all([
      Document.find(filter).select('-rawContent').sort({ uploadedAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Document.countDocuments(filter),
      Document.distinct('parserDocumentType', { source: 'parser', ...tenantFilter(owner), parserDocumentType: { $ne: null } }),
    ]);
    return res.json({
      documents: docs.map((doc) => documentJson(doc as Record<string, any>)),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      documentTypes: documentTypes.filter(Boolean).sort(),
    });
  } catch (error) {
    logger.error('Failed to list parser documents', error as Error);
    return res.status(500).json({ message: 'Could not load parser documents' });
  }
});

router.get('/:id/runs', async (req: Request, res: Response) => {
  const doc = await Document.findOne(documentFilter(req, routeParam(req.params.id))).select('_id').lean();
  if (!doc) return res.status(404).json({ message: 'Document not found' });
  const runs = await ParserRunModel.find({ documentId: doc._id, ...tenantFilter(identity(req)) })
    .select('-parserOutput -reviewHistory').sort({ createdAt: -1 }).lean();
  return res.json({ runs: runs.map((run) => runSummary(run as Record<string, any>)) });
});

router.get('/:id/runs/:runId', async (req: Request, res: Response) => {
  const doc = await Document.findOne(documentFilter(req, routeParam(req.params.id))).select('_id').lean();
  if (!doc) return res.status(404).json({ message: 'Document not found' });
  const run = await ParserRunModel.findOne({ documentId: doc._id, runId: routeParam(req.params.runId), ...tenantFilter(identity(req)) }).lean();
  if (!run) return res.status(404).json({ message: 'Parser run not found' });
  return res.json({ run: { ...runSummary(run as Record<string, any>), parserOutput: run.parserOutput, reviewHistory: run.reviewHistory ?? [] } });
});

router.get('/:id/download', async (req: Request, res: Response) => {
  const doc = await Document.findOne(documentFilter(req, routeParam(req.params.id))).select('filename fileType rawContent').lean() as any;
  if (!doc) return res.status(404).json({ message: 'Document not found' });
  if (!doc.rawContent) return res.status(404).json({ message: 'Original file is unavailable' });
  res.setHeader('Content-Type', doc.fileType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(doc.filename)}`);
  return res.send(doc.rawContent);
});

router.get('/:id', async (req: Request, res: Response) => {
  const doc = await Document.findOne(documentFilter(req, routeParam(req.params.id))).select('-rawContent').lean();
  if (!doc) return res.status(404).json({ message: 'Document not found' });
  const latestRun = doc.latestParserRunId
    ? await ParserRunModel.findOne({ documentId: doc._id, runId: doc.latestParserRunId, ...tenantFilter(identity(req)) }).lean()
    : null;
  return res.json({
    document: documentJson(doc as Record<string, any>),
    latestRun: latestRun ? { ...runSummary(latestRun as Record<string, any>), parserOutput: latestRun.parserOutput, reviewHistory: latestRun.reviewHistory ?? [] } : null,
  });
});

export default router;
