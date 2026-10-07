import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import multer from 'multer';
import { z } from 'zod';
import { Document, ParserRunModel } from '../../models.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { createLogger } from '../logger.js';
import { isParserConfigured, quoteFileWithParser, resolvePaidFileWithParser } from '../services/parserClient.js';
import { applyDocumentScopeFilter, isViewOnlyMember, resolveClientScopeIds } from '../services/clientScopes.js';
import {
  signedParserRunSchema,
  verifyParserRun,
  type ParserRunClaims,
  type RunAiValue,
  type SignedParserRun,
} from '../security/parserRunAttestation.js';

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

/**
 * The same filter, narrowed to the companies this caller may see. Used by the
 * routes that open or act on ONE document, so a scoped member cannot reach a
 * document by id that they could not have found by listing.
 */
async function scopedDocumentFilter(req: Request, documentId: string): Promise<Record<string, unknown>> {
  const owner = identity(req);
  const scopedIds = await resolveClientScopeIds(owner.userId);
  return applyDocumentScopeFilter(documentFilter(req, documentId), scopedIds, owner.userId);
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
    reviewedAt: doc.reviewedAt ?? null,
    reviewedByUserId: doc.reviewedByUserId ?? null,
  };
}

/** View-only members may read the library but never change it. */
async function refuseViewOnly(req: Request, res: Response): Promise<boolean> {
  if (await isViewOnlyMember(identity(req).userId)) {
    res.status(403).json({ message: 'Your role in this team is view-only, so you can look at documents but not change them.' });
    return true;
  }
  return false;
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
    aiValueCount: Number(run.aiValueCount ?? (Array.isArray(run.aiValues) ? run.aiValues.length : 0)),
    signed: Boolean(run.attestation),
    createdAt: run.createdAt,
  };
}

/** A run with everything the detail screens show: both layers and the review history. */
function runDetail(run: Record<string, any>): Record<string, unknown> {
  return {
    ...runSummary(run),
    parserOutput: run.parserOutput,
    aiValues: Array.isArray(run.aiValues) ? run.aiValues : [],
    reviewHistory: run.reviewHistory ?? [],
  };
}

/**
 * A run filed from the browser is the parser's signed record and nothing else.
 * It used to be any JSON the browser sent, so anyone signed in could file a
 * "parser reading" of their own making. Case id, review reasons and the AI
 * block ride inside the signed record, so none of what is stored is the
 * browser's say.
 *
 * The browser may still send the old fields beside `attestation` (it does,
 * so an api that predates signing keeps filing runs during a deploy); they are
 * ignored here. An AI block OUTSIDE the signature is refused outright — it can
 * only be an attempt to have one stored.
 */
const runInputSchema = z.object({
  attestation: signedParserRunSchema,
  aiValues: z.undefined({ invalid_type_error: 'AI values are only accepted inside the parser’s signed record' }),
});

export function deriveParserRunData(
  output: Record<string, any>,
  suppliedReviewReasons: string[] = [],
  aiValues: readonly RunAiValue[] = [],
) {
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
  // A null confidence is a reader that does not score one (ESG), not a low
  // score; a MISSING one still counts as low, as it always has.
  const lowConfidenceFields = Object.entries(fields)
    .filter(([, field]) => field?.normalized_value != null
      && field?.confidence !== null
      && Number(field?.confidence ?? 0) < SAFE_FIELD_CONFIDENCE)
    .map(([key]) => key);
  // Both layers: what the rules read plus what the model and the agent read.
  // Counting the rule layer alone is how the library said "3 read" of a
  // document the parser had read forty values from.
  const extractedFieldCount = Object.values(fields).filter((field) => field?.normalized_value != null).length
    + aiValues.length;
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
    // The same bytes uploaded twice at once — a folder holding two copies of
    // one ledger under different names does exactly this — both miss the
    // lookup above and race to insert. The loser used to get a 500 and its
    // file dropped out of the library. The winner's record IS this upload.
    if ((error as { code?: number })?.code === 11000) {
      const existing = await Document.findOne({ source: 'parser', fileHash, ...tenantFilter(owner) }).select('-rawContent').lean();
      if (existing) return res.status(201).json({ document: documentJson(existing as Record<string, any>) });
    }
    logger.error('Failed to persist parser document', error as Error);
    return res.status(500).json({ message: 'Could not persist document' });
  }
});

type RunAttestationRecord = { id: string; issuedAt: Date; quoteId: string | null; contentSha256: string };

function attestationRecord(signed: SignedParserRun, claims: ParserRunClaims): RunAttestationRecord {
  return { id: signed.signature, issuedAt: new Date(claims.iat), quoteId: claims.quoteId, contentSha256: claims.contentSha256 };
}

/**
 * Append a run and point the document at it.
 *
 * Shared by the signed path (`POST /:id/runs`) and the server-side re-read,
 * so a re-read produces a record indistinguishable from a first read — same
 * fields, same derivation, same history. A re-read that recorded itself
 * differently would make the run history unreadable.
 *
 * Only ever called with parser output the server can vouch for: verified
 * against the parser's signature, or fetched from the parser by this server.
 */
async function appendRun(
  doc: { _id: unknown },
  owner: SessionIdentity,
  output: Record<string, any>,
  extra: {
    caseId?: string | null;
    parserVersion?: string | null;
    reviewReasons?: string[];
    aiValues?: RunAiValue[] | null;
    attestation?: RunAttestationRecord | null;
  } = {},
) {
  const derived = deriveParserRunData(output, extra.reviewReasons ?? [], extra.aiValues ?? []);
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
    aiValues: extra.aiValues ?? null,
    aiValueCount: extra.aiValues?.length ?? 0,
    attestation: extra.attestation ?? null,
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
  if (!parsed.success) {
    return res.status(400).json({
      message: 'A parser result can only be saved as the signed record the parser issued',
      issues: parsed.error.issues,
    });
  }
  const owner = identity(req);
  const documentId = routeParam(req.params.id);

  // Before anything is looked up: an unsigned or altered record learns nothing
  // about which documents exist.
  const verdict = verifyParserRun(parsed.data.attestation);
  if (!verdict.ok) {
    logger.warn('Refused a parser run that the parser did not sign', { documentId, code: verdict.code, userId: owner.userId });
    return res.status(verdict.status).json({ message: verdict.message, code: verdict.code });
  }
  const { claims } = verdict;

  try {
    const doc = await Document.findOne(await scopedDocumentFilter(req, documentId));
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    // A genuine reading of one file must not be filed against another.
    const storedHash = (doc as unknown as { contentHash?: string | null }).contentHash ?? null;
    if (!storedHash || storedHash !== claims.contentSha256) {
      logger.warn('Refused a signed parser run for different bytes', { documentId, userId: owner.userId });
      return res.status(409).json({
        message: 'This parser result was read from a different file than this document holds.',
        code: 'RUN_FILE_MISMATCH',
      });
    }

    // Each signed record files once. Replaying it would add a duplicate run, or
    // make an older reading the document's latest again.
    const attestation = attestationRecord(parsed.data.attestation, claims);
    const already = await ParserRunModel.findOne({ documentId: doc._id, 'attestation.id': attestation.id }).lean();
    if (already) return res.status(200).json({ run: runSummary(already as Record<string, any>), duplicate: true });

    const run = await appendRun(doc as unknown as { _id: unknown }, owner, claims.parserOutput as Record<string, any>, {
      caseId: claims.caseId,
      reviewReasons: claims.reviewReasons,
      aiValues: claims.aiValues ?? null,
      attestation,
    });
    await Document.updateOne(documentFilter(req, documentId), { $set: documentSetFromRun(run.toObject()) });

    return res.status(201).json({ run: runSummary(run.toObject()) });
  } catch (error) {
    // The same record filed twice at once: the unique index let one through.
    if ((error as { code?: number })?.code === 11000) {
      return res.status(200).json({ duplicate: true });
    }
    logger.error('Failed to persist parser run', error as Error, { documentId });
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
  /**
   * A teammate has looked at this read and signed it off (true), or reopened
   * it (false). Takes it in and out of the company's "Needs review" queue.
   */
  reviewed: z.boolean().optional(),
  /**
   * Values a person read off the document themselves — a correction to a field
   * the parser read, or a field it could not find. Keyed by the parser's field
   * key; null withdraws an earlier correction.
   */
  fields: z
    .record(
      z.string().min(1).max(120).regex(/^[A-Za-z0-9_. -]+$/),
      z.union([z.string().max(2000), z.number().finite(), z.null()]),
    )
    .refine((fields) => Object.keys(fields).length > 0 && Object.keys(fields).length <= 100, 'Between 1 and 100 fields')
    .optional(),
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
  if (await refuseViewOnly(req, res)) return;

  try {
    const doc = await Document.findOne(await scopedDocumentFilter(req, documentId));
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    const set: Record<string, unknown> = {};
    if ('entityId' in parsed.data) set.entityId = parsed.data.entityId ?? null;

    if (typeof parsed.data.reviewed === 'boolean') {
      set.reviewedAt = parsed.data.reviewed ? new Date() : null;
      set.reviewedByUserId = parsed.data.reviewed ? owner.userId : null;
      const latestRunId = (doc as unknown as { latestParserRunId?: string }).latestParserRunId;
      if (latestRunId) {
        await ParserRunModel.updateOne(
          { runId: latestRunId },
          {
            $push: {
              reviewHistory: {
                fieldKey: 'document',
                originalValue: null,
                correctedValue: null,
                reviewerUserId: owner.userId,
                organizationId: owner.organizationId,
                approvalState: parsed.data.reviewed ? 'approved' : 'pending',
                note: parsed.data.note ?? null,
              },
            },
          },
        );
      }
    }

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

    // Field corrections live beside the parser's reading, never over it — the
    // same rule as a type correction. Each one names what the parser said, so
    // the history shows both, and the latest event per field is the value.
    let fieldsCorrected = false;
    if (parsed.data.fields) {
      const latestRunId = (doc as unknown as { latestParserRunId?: string }).latestParserRunId;
      if (!latestRunId) {
        return res.status(409).json({ message: 'This document has not been read yet, so there is nothing to correct.', code: 'NOT_READ' });
      }
      const latestRun = await ParserRunModel.findOne({ runId: latestRunId }).select('parserOutput aiValues').lean();
      const extracted = ((latestRun as { parserOutput?: { extracted_fields?: Record<string, { normalized_value?: unknown; raw_value?: unknown }> } } | null)
        ?.parserOutput?.extracted_fields ?? {});
      // A model or agent value is corrected under its own key (ai.<spec>.<field>),
      // so a correction to it names what THAT reader said, not the rule layer.
      const aiValues = new Map(
        ((latestRun as { aiValues?: RunAiValue[] | null } | null)?.aiValues ?? [])
          .map((value) => [value.key, value.value] as const),
      );
      const original = (fieldKey: string): unknown => {
        if (aiValues.has(fieldKey)) {
          const value = aiValues.get(fieldKey);
          return value !== null && typeof value === 'object' ? JSON.stringify(value) : value ?? null;
        }
        return extracted[fieldKey]?.normalized_value ?? extracted[fieldKey]?.raw_value ?? null;
      };
      const events = Object.entries(parsed.data.fields).map(([fieldKey, value]) => ({
        fieldKey,
        originalValue: original(fieldKey),
        correctedValue: typeof value === 'string' ? value.trim() || null : value,
        reviewerUserId: owner.userId,
        organizationId: owner.organizationId,
        approvalState: 'corrected',
        note: parsed.data.note ?? null,
      }));
      await ParserRunModel.updateOne({ runId: latestRunId }, { $push: { reviewHistory: { $each: events } } });
      fieldsCorrected = true;
    }

    if (Object.keys(set).length === 0 && !fieldsCorrected) return res.status(400).json({ message: 'Nothing to update' });

    if (Object.keys(set).length > 0) await Document.updateOne(documentFilter(req, documentId), { $set: set });
    const updated = await Document.findOne(documentFilter(req, documentId)).lean();
    if (!fieldsCorrected) return res.json({ document: documentJson(updated as Record<string, any>) });
    const runAfter = await ParserRunModel.findOne({ runId: (doc as unknown as { latestParserRunId: string }).latestParserRunId })
      .select('reviewHistory')
      .lean();
    return res.json({
      document: documentJson(updated as Record<string, any>),
      reviewHistory: (runAfter as { reviewHistory?: unknown[] } | null)?.reviewHistory ?? [],
    });
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
  if (await refuseViewOnly(req, res)) return;

  try {
    const doc = await Document.findOne(await scopedDocumentFilter(req, documentId));
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    const replacement = req.file;

    // The same bytes read again give the same reading — so an unchanged file
    // returns the stored run, instantly, and nobody pays for it: not the
    // user, and not Okiru's model bill. Every "Re-read" used to run the full
    // extraction chain again (text layer, Document Intelligence, the model).
    // `fresh=1` is for a reading the parser itself has since improved on.
    const fresh = req.query.fresh === '1' || (req.body as { fresh?: unknown } | undefined)?.fresh === 'true';
    const latestRunId = (doc as unknown as { latestParserRunId?: string }).latestParserRunId;
    if (!replacement && !fresh && latestRunId) {
      const stored = await ParserRunModel.findOne({ documentId: (doc as unknown as { _id: unknown })._id, runId: latestRunId, ...tenantFilter(owner) }).lean();
      if (stored) {
        const plain = doc as unknown as { toObject?: () => Record<string, any> } & Record<string, any>;
        return res.status(200).json({
          document: documentJson(typeof plain.toObject === 'function' ? plain.toObject() : plain),
          run: runSummary(stored as Record<string, any>),
          reused: true,
        });
      }
    }
    // Anything else is a real read — from scratch, or of a replacement — and
    // a real read is priced and paid first (POST /:id/reread/quote, then the
    // wallet, then POST /:id/reread). This route used to run it for free.
    return res.status(402).json({
      message: 'Reading this document again from scratch is charged — get its price first.',
      code: 'PRICE_FIRST',
    });
  } catch (error) {
    logger.error('Failed to re-parse document', error as Error, { documentId });
    return res.status(500).json({ message: 'Could not re-read this document' });
  }
});

/**
 * Which reader a fresh read goes through. ESG evidence is read by the ESG
 * reader: an ESG bill through the B-BBEE reader came back as B-BBEE fields,
 * which is why ESG re-reads used to be refused outright. A document's domain
 * is the one its latest run was read under; a document never read is B-BBEE,
 * as every document was before ESG runs could be stored.
 */
export async function documentDomain(doc: Record<string, any>, owner: SessionIdentity): Promise<'bbbee' | 'esg'> {
  if (!doc.latestParserRunId) return 'bbbee';
  const run = await ParserRunModel.findOne({ documentId: doc._id, runId: doc.latestParserRunId, ...tenantFilter(owner) })
    .select('parserOutput')
    .lean() as { parserOutput?: { domain?: unknown } } | null;
  return run?.parserOutput?.domain === 'esg' ? 'esg' : 'bbbee';
}

/**
 * What a fresh read stores: the parser's signed record (both layers) when it
 * sent one that verifies and was read from these bytes; otherwise the rule
 * layer it returned, as before, saying the model's values could not be kept.
 *
 * This read was fetched by this server, so it is trusted either way — the
 * signature is checked anyway, so the library holds one kind of AI block: the
 * kind the parser signed.
 */
function freshReadRecord(
  result: Record<string, any>,
  signed: SignedParserRun | null | undefined,
  sha256: string,
): { output: Record<string, any>; aiValues: RunAiValue[] | null; attestation: RunAttestationRecord | null; notes: string[] } {
  const { run_attestation: _signed, ai_value_count: _count, ...ruleLayer } = result;
  if (!signed) return { output: ruleLayer, aiValues: null, attestation: null, notes: [] };
  const verdict = verifyParserRun(signed);
  if (!verdict.ok || verdict.claims.contentSha256 !== sha256) {
    logger.warn('A fresh read came back with a run record that does not verify; keeping the rule layer only', {
      code: verdict.ok ? 'RUN_FILE_MISMATCH' : verdict.code,
    });
    return {
      output: ruleLayer,
      aiValues: null,
      attestation: null,
      notes: ['The AI values from this read could not be verified, so only the rule-based fields were kept.'],
    };
  }
  return {
    output: verdict.claims.parserOutput as Record<string, any>,
    aiValues: verdict.claims.aiValues ?? null,
    attestation: attestationRecord(signed, verdict.claims),
    notes: verdict.claims.reviewReasons,
  };
}

/** The bytes a fresh read would use: a replacement, or what is stored. */
function rereadBytes(doc: Record<string, any>, replacement: Express.Multer.File | undefined) {
  const raw: Buffer | undefined = replacement?.buffer ?? doc.rawContent;
  if (!raw || raw.length === 0) return null;
  return {
    buffer: Buffer.from(raw),
    filename: replacement?.originalname ?? String(doc.filename),
    mimeType: replacement?.mimetype ?? String(doc.fileType ?? ''),
    sha256: crypto.createHash('sha256').update(raw).digest('hex'),
  };
}

/**
 * POST /:id/reread/quote — price a fresh read of this document (multipart
 * `file` to price a replacement instead). Free: a structure scan, nothing
 * read. The quote is pinned to this document AND these exact bytes; the
 * browser then pays it through the wallet (/api/tokens/authorize), exactly as
 * a bulk upload is paid.
 */
router.post('/:id/reread/quote', upload.single('file'), async (req: Request, res: Response) => {
  const documentId = routeParam(req.params.id);
  if (await refuseViewOnly(req, res)) return;
  if (!isParserConfigured()) return res.status(503).json({ message: 'Fresh reads are not available right now.' });
  try {
    const doc = await Document.findOne(await scopedDocumentFilter(req, documentId));
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    const bytes = rereadBytes(doc as unknown as Record<string, any>, req.file);
    if (!bytes) {
      return res.status(409).json({ message: 'The original file is not stored for this document. Upload it again as a replacement.' });
    }
    const quote = await quoteFileWithParser(bytes);
    if (!quote.ok || !quote.quoteId) {
      return res.status(502).json({ message: quote.error ?? 'We could not price this file.' });
    }
    await Document.updateOne(documentFilter(req, documentId), {
      $set: { pendingRereadQuoteId: quote.quoteId, pendingRereadSha256: bytes.sha256 },
    });
    return res.status(201).json({ quoteId: quote.quoteId });
  } catch (error) {
    logger.error('Failed to price a fresh read', error as Error, { documentId });
    return res.status(500).json({ message: 'Could not price a fresh read of this document' });
  }
});

/**
 * POST /:id/reread — the paid fresh read itself, after the wallet authorised
 * `quoteId`. Same bytes as were priced (a replacement is sent again), checked
 * here against the pending quote and again by the parser's gate, which claims
 * the quote once and records how the read ended — the wallet's settlement
 * (/api/tokens/runs/:quoteId/settle-outcome) refunds a read that delivered
 * nothing. Appended as a new run: the earlier readings stay in the history.
 */
router.post('/:id/reread', upload.single('file'), async (req: Request, res: Response) => {
  const owner = identity(req);
  const documentId = routeParam(req.params.id);
  if (await refuseViewOnly(req, res)) return;
  if (!isParserConfigured()) return res.status(503).json({ message: 'Fresh reads are not available right now.' });
  const quoteId = typeof req.body?.quoteId === 'string' ? req.body.quoteId : '';
  try {
    const doc = await Document.findOne(await scopedDocumentFilter(req, documentId));
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    const plain = doc as unknown as Record<string, any>;
    if (!quoteId || plain.pendingRereadQuoteId !== quoteId) {
      return res.status(409).json({ message: 'That price was for a different read. Get a new price.', code: 'QUOTE_NOT_FOR_THIS_DOCUMENT' });
    }
    const bytes = rereadBytes(plain, req.file);
    if (!bytes || bytes.sha256 !== plain.pendingRereadSha256) {
      return res.status(409).json({ message: 'These are not the bytes that were priced. Get a new price.', code: 'QUOTE_FILE_MISMATCH' });
    }

    // The whole per-document read (rules, model, agent), through the reader
    // for this document's domain — not the rule layer alone.
    const domain = await documentDomain(plain, owner);
    const outcome = await resolvePaidFileWithParser(bytes, quoteId, { domain, full: true });
    if (!outcome.ok || !outcome.result) {
      if (outcome.status === 404) {
        return res.status(503).json({ message: 'Fresh reads are not available yet. Nothing was read.', code: 'PAID_READ_UNAVAILABLE' });
      }
      if (outcome.status && [402, 409, 410].includes(outcome.status)) {
        return res.status(outcome.status).json({ message: outcome.error, code: outcome.code });
      }
      return res.status(502).json({ message: outcome.error ?? 'The parser could not read this file', code: outcome.code });
    }

    // Swap the stored bytes only once the new file has actually been read —
    // a failed read must not leave the document holding a file nobody has
    // successfully parsed and no copy of the one that worked.
    if (req.file) {
      await Document.updateOne(documentFilter(req, documentId), {
        $set: {
          rawContent: req.file.buffer,
          filename: req.file.originalname,
          fileType: req.file.mimetype,
          fileSize: req.file.size,
          contentHash: bytes.sha256,
        },
      });
    }

    const record = freshReadRecord(outcome.result as unknown as Record<string, any>, outcome.result.run_attestation, bytes.sha256);
    const run = await appendRun(doc as unknown as { _id: unknown }, owner, record.output, {
      reviewReasons: [
        req.file ? 'Read again after the file was replaced by a user.' : 'Read again from scratch on request.',
        ...record.notes,
      ],
      aiValues: record.aiValues,
      attestation: record.attestation,
    });
    await Document.updateOne(documentFilter(req, documentId), {
      $set: { ...documentSetFromRun(run.toObject()), pendingRereadQuoteId: null, pendingRereadSha256: null },
    });
    const updated = await Document.findOne(documentFilter(req, documentId)).lean();
    return res.status(201).json({ document: documentJson(updated as Record<string, any>), run: runSummary(run.toObject()) });
  } catch (error) {
    logger.error('Failed to run a paid fresh read', error as Error, { documentId, quoteId });
    return res.status(500).json({ message: 'Could not read this document again' });
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
  // "Needs review" is a queue: a document a teammate has signed off has left it.
  if (String(req.query.status) === 'review_required') filter.reviewedAt = null;
  if (req.query.documentType) filter.parserDocumentType = String(req.query.documentType);
  if (req.query.reviewRequired === 'true') filter.parserReviewRequired = true;
  if (req.query.missingField) filter.parserMissingFields = String(req.query.missingField);
  if (req.query.lowConfidence === 'true') filter.parserLowConfidenceFields = { $exists: true, $ne: [] };
  if (req.query.from || req.query.to) {
    filter.uploadedAt = {};
    if (req.query.from) filter.uploadedAt.$gte = new Date(String(req.query.from));
    if (req.query.to) filter.uploadedAt.$lte = new Date(`${String(req.query.to).slice(0, 10)}T23:59:59.999Z`);
  }

  // The library is organisation-wide, so without this a member limited to
  // three companies could still read every other company's evidence — which is
  // usually where the sensitive detail actually is.
  const scopedIds = await resolveClientScopeIds(owner.userId);
  const scopedFilter = applyDocumentScopeFilter(filter, scopedIds, owner.userId);

  try {
    const [docs, total, documentTypes] = await Promise.all([
      Document.find(scopedFilter).select('-rawContent').sort({ uploadedAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Document.countDocuments(scopedFilter),
      Document.distinct(
        'parserDocumentType',
        applyDocumentScopeFilter(
          { source: 'parser', ...tenantFilter(owner), parserDocumentType: { $ne: null } },
          scopedIds,
          owner.userId,
        ),
      ),
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
  const doc = await Document.findOne(await scopedDocumentFilter(req, routeParam(req.params.id))).select('_id').lean();
  if (!doc) return res.status(404).json({ message: 'Document not found' });
  const runs = await ParserRunModel.find({ documentId: doc._id, ...tenantFilter(identity(req)) })
    .select('-parserOutput -reviewHistory -aiValues').sort({ createdAt: -1 }).lean();
  return res.json({ runs: runs.map((run) => runSummary(run as Record<string, any>)) });
});

router.get('/:id/runs/:runId', async (req: Request, res: Response) => {
  const doc = await Document.findOne(await scopedDocumentFilter(req, routeParam(req.params.id))).select('_id').lean();
  if (!doc) return res.status(404).json({ message: 'Document not found' });
  const run = await ParserRunModel.findOne({ documentId: doc._id, runId: routeParam(req.params.runId), ...tenantFilter(identity(req)) }).lean();
  if (!run) return res.status(404).json({ message: 'Parser run not found' });
  return res.json({ run: runDetail(run as Record<string, any>) });
});

/**
 * Types a browser can display from our own origin without running anything.
 *
 * The stored type is whatever the uploader's browser claimed, and the original
 * used to be served under it, inline, from okiru.pro: an uploaded .html (or
 * .svg, which carries script) ran with the session of whoever opened it. Only
 * these are shown inline now; everything else is a download of opaque bytes.
 */
const INLINE_SAFE_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'text/plain']);

export function downloadHeaders(fileType: unknown, filename: unknown): Record<string, string> {
  const type = String(fileType ?? '').split(';')[0].trim().toLowerCase();
  const name = encodeURIComponent(String(filename || 'document'));
  const inline = INLINE_SAFE_TYPES.has(type);
  return {
    'Content-Type': inline ? (type === 'text/plain' ? 'text/plain; charset=utf-8' : type) : 'application/octet-stream',
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${name}`,
    'X-Content-Type-Options': 'nosniff',
  };
}

router.get('/:id/download', async (req: Request, res: Response) => {
  const doc = await Document.findOne(await scopedDocumentFilter(req, routeParam(req.params.id))).select('filename fileType rawContent').lean() as any;
  if (!doc) return res.status(404).json({ message: 'Document not found' });
  if (!doc.rawContent) return res.status(404).json({ message: 'Original file is unavailable' });
  res.set(downloadHeaders(doc.fileType, doc.filename));
  return res.send(doc.rawContent);
});

router.get('/:id', async (req: Request, res: Response) => {
  const doc = await Document.findOne(await scopedDocumentFilter(req, routeParam(req.params.id))).select('-rawContent').lean();
  if (!doc) return res.status(404).json({ message: 'Document not found' });
  const latestRun = doc.latestParserRunId
    ? await ParserRunModel.findOne({ documentId: doc._id, runId: doc.latestParserRunId, ...tenantFilter(identity(req)) }).lean()
    : null;
  return res.json({
    document: documentJson(doc as Record<string, any>),
    latestRun: latestRun ? runDetail(latestRun as Record<string, any>) : null,
  });
});

export default router;
