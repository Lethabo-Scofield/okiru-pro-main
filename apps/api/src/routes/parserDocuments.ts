import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import multer from 'multer';
import { z } from 'zod';
import { Document, ParserRunModel } from '../../models.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { createLogger } from '../logger.js';
import { resolveFileWithParser } from '../services/parserClient.js';

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

/**
 * Append a run and point the document at it.
 *
 * Shared by the client-supplied path (`POST /:id/runs`) and the server-side
 * re-parse, so a re-parse produces a record indistinguishable from a first
 * read — same fields, same derivation, same history. A re-parse that recorded
 * itself differently would make the run history unreadable.
 */
async function appendRun(
  doc: { _id: unknown },
  owner: SessionIdentity,
  output: Record<string, any>,
  extra: { caseId?: string | null; parserVersion?: string | null; reviewReasons?: string[] } = {},
) {
  const derived = deriveParserRunData(output, extra.reviewReasons ?? []);
  const run = await ParserRunModel.create({
    documentId: doc._id,
    userId: owner.userId,
    organizationId: owner.organizationId,
    caseId: extra.caseId ?? null,
    parserVersion: extra.parserVersion ?? null,
    graphVersion: typeof derived.audit.graph_version === 'string' ? derived.audit.graph_version : null,
    status: output.status,
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
  return run;
}

/** The document-level mirror of a run's headline numbers. */
function documentSetFromRun(run: Record<string, any>): Record<string, unknown> {
  return {
    latestParserRunId: run.runId,
    parserStatus: run.status,
    parserDocumentType: run.documentType,
    parserOverallConfidence: run.overallConfidence,
    parserExtractedFieldCount: run.extractedFieldCount,
    parserProblemFieldCount: run.problemFieldCount,
    parserReviewRequired: run.requiresHumanReview,
    parserMissingFields: run.missingFields,
    parserLowConfidenceFields: run.lowConfidenceFields,
    parserLastRunAt: run.createdAt,
    status: run.status === 'passed' ? 'parsed' : run.status,
  };
}

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

    const run = await appendRun(doc as unknown as { _id: unknown }, owner, output, {
      caseId: parsed.data.caseId ?? null,
      parserVersion: parsed.data.parserVersion ?? null,
      reviewReasons: parsed.data.reviewReasons ?? [],
    });
    await Document.updateOne(documentFilter(req, documentId), { $set: documentSetFromRun(run.toObject()) });

    return res.status(201).json({ run: runSummary(run.toObject()) });
  } catch (error) {
    logger.error('Failed to persist parser run', error as Error, { documentId: routeParam(req.params.id) });
    return res.status(500).json({ message: 'Could not persist parser run' });
  }
});

const patchSchema = z.object({
  /** The saved company this document belongs to. Null unlinks it. */
  entityId: z.string().max(200).nullable().optional(),
  /** A human overriding the classifier. */
  documentType: z.string().min(1).max(200).optional(),
  /** Why the type was changed — kept with the correction, not instead of it. */
  note: z.string().max(2000).optional(),
});

/**
 * PATCH /:id — the two things a human can tell us that the parser cannot work
 * out for itself: which company this belongs to, and what the document
 * actually is.
 *
 * A type correction is recorded as a review event on the LATEST RUN rather
 * than overwriting the run's own reading. The run is an immutable record of
 * what the parser saw; a correction is a separate, attributable fact about it.
 * Losing the original would destroy the only evidence of what the classifier
 * gets wrong, which is exactly what anyone improving it needs.
 */
router.patch('/:id', async (req: Request, res: Response) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid update', issues: parsed.error.issues });
  const owner = identity(req);
  const documentId = routeParam(req.params.id);

  try {
    const doc = await Document.findOne(documentFilter(req, documentId));
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    const set: Record<string, unknown> = {};
    if ('entityId' in parsed.data) set.entityId = parsed.data.entityId ?? null;

    if (parsed.data.documentType) {
      set.parserDocumentType = parsed.data.documentType;
      const latestRunId = (doc as unknown as { latestParserRunId?: string }).latestParserRunId;
      if (latestRunId) {
        const previous = String((doc as unknown as { parserDocumentType?: string }).parserDocumentType ?? '');
        await ParserRunModel.updateOne(
          { runId: latestRunId },
          {
            $push: {
              reviewHistory: {
                fieldKey: 'document_type',
                originalValue: previous,
                correctedValue: parsed.data.documentType,
                reviewerUserId: owner.userId,
                approvalState: 'corrected',
                note: parsed.data.note ?? null,
                reviewedAt: new Date(),
              },
            },
          },
        );
      }
    }

    if (Object.keys(set).length === 0) return res.status(400).json({ message: 'Nothing to update' });

    await Document.updateOne(documentFilter(req, documentId), { $set: set });
    const updated = await Document.findOne(documentFilter(req, documentId)).lean();
    return res.json({ document: documentJson(updated as Record<string, any>) });
  } catch (error) {
    logger.error('Failed to update parser document', error as Error, { documentId });
    return res.status(500).json({ message: 'Could not update this document' });
  }
});

/**
 * POST /:id/reparse — read the SAME bytes again, optionally after replacing
 * them with a better copy of the file.
 *
 * "Upload a different file" and "try again" are one operation because they end
 * the same way: new bytes or old, the document is re-read and the result is
 * appended as another run. Nothing is overwritten — the previous run stays in
 * the history, so a re-parse that turns out worse can be seen and compared
 * rather than having quietly replaced a better reading.
 */
router.post('/:id/reparse', upload.single('file'), async (req: Request, res: Response) => {
  const owner = identity(req);
  const documentId = routeParam(req.params.id);

  try {
    const doc = await Document.findOne(documentFilter(req, documentId));
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    const replacement = req.file;
    const raw = replacement?.buffer ?? (doc as unknown as { rawContent?: Buffer }).rawContent;
    if (!raw || raw.length === 0) {
      return res.status(409).json({
        message: 'The original file is not stored for this document, so it cannot be re-read. Upload the file again.',
      });
    }

    const filename = replacement?.originalname ?? String((doc as unknown as { filename: string }).filename);
    const mimeType = replacement?.mimetype ?? String((doc as unknown as { fileType?: string }).fileType ?? '');

    const outcome = await resolveFileWithParser({ buffer: Buffer.from(raw), filename, mimeType });
    if (!outcome.ok || !outcome.result) {
      return res.status(502).json({ message: outcome.error ?? 'The parser could not read this file' });
    }

    // Swap the stored bytes only once the new file has actually been read —
    // a failed re-parse must not leave the document holding a file nobody has
    // successfully parsed and no copy of the one that worked.
    if (replacement) {
      await Document.updateOne(documentFilter(req, documentId), {
        $set: {
          rawContent: replacement.buffer,
          filename: replacement.originalname,
          fileType: replacement.mimetype,
          fileSize: replacement.size,
          contentHash: crypto.createHash('sha256').update(replacement.buffer).digest('hex'),
        },
      });
    }

    const output = outcome.result as unknown as Record<string, any>;
    const run = await appendRun(doc as unknown as { _id: unknown }, owner, output, {
      reviewReasons: replacement ? ['Re-read after the file was replaced by a user.'] : ['Re-read on request.'],
    });
    await Document.updateOne(documentFilter(req, documentId), { $set: documentSetFromRun(run.toObject()) });

    const updated = await Document.findOne(documentFilter(req, documentId)).lean();
    return res.status(201).json({
      document: documentJson(updated as Record<string, any>),
      run: runSummary(run.toObject()),
    });
  } catch (error) {
    logger.error('Failed to re-parse document', error as Error, { documentId });
    return res.status(500).json({ message: 'Could not re-read this document' });
  }
});

router.get('/', async (req: Request, res: Response) => {
  const owner = identity(req);
  const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || '25'), 10) || 25));
  const filter: Record<string, any> = { source: 'parser', ...tenantFilter(owner) };
  // Documents filed against one saved company — the library's per-client view.
  if (typeof req.query.entityId === 'string' && req.query.entityId.trim()) {
    filter.entityId = req.query.entityId.trim();
  } else if (req.query.unassigned === 'true') {
    // Documents not yet filed under any company. {entityId: null} matches both
    // an explicit null and a missing field, which is exactly the legacy set.
    filter.entityId = null;
  }
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
