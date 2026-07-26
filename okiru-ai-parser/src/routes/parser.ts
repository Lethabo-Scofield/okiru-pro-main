import { Router, type Request, type Response } from 'express';
import path from 'node:path';
import multer from 'multer';
import { z } from 'zod';
import { createLogger } from '../logger.js';
import { requireAdminToken } from '../middleware/adminAuth.js';
import { fail, ok } from '../utils/apiResponse.js';
import { extractionInputsFromUpload, isSupportedUpload, rawExtractionInputFromUpload, SUPPORTED_UPLOAD_MIME_TYPES } from '../services/fileExtraction.js';
import { quoteUploadedFiles } from '../services/pricingQuote.js';
import { authoriseExtraction, fingerprintFiles, getQuoteStore } from '../services/quoteStore.js';
import {
  createPayfastCheckout,
  verifyPayfastItn,
  isPaymentComplete,
  simulatedPaymentAllowed,
} from '../services/payfastPayment.js';
import { createNeo4jOntologyRepository, MissingNeo4jConfigError } from '../../graph/neo4j_client.js';
import type { OntologyRepository } from '../../graph/ontology_models.js';
import { InMemoryOntologyRepository } from '../../graph/ontology_queries.js';
import { buildOntologyRecordsFromWorkbook, DEFAULT_ONTOLOGY_MATRIX_PATH, loadOntologyFromWorkbook } from '../../graph/ontology_loader.js';
import { CaseParserService } from '../../parser/case_parser_service.js';
import { getRequiredDocumentGroups, SECTOR_OPTIONS } from '../../parser/sector_documents.js';
import { ParserService } from '../../parser/parser_service.js';
import { documentsByElement } from '../../schemas/verification_document_matrix.js';
import { extractCaseEntities } from '../services/caseExtraction.js';

const logger = createLogger('ParserRoutes');
const router = Router();

/**
 * Whether extraction is gated on payment. Defaults to ON: paid work must never
 * become free because someone forgot to set a flag. Only an explicit
 * PARSER_REQUIRE_PAYMENT=false opens it (for local dev / the free manual path).
 */
function extractionRequiresPayment(): boolean {
  return process.env.PARSER_REQUIRE_PAYMENT !== 'false';
}
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 25 },
  fileFilter: (_req, file, cb) => {
    // Judge on type OR extension: a correct .xlsm arrives as
    // application/octet-stream often enough that MIME alone rejected real
    // client workbooks.
    if (isSupportedUpload(file.mimetype, file.originalname)) cb(null, true);
    else cb(new Error(`Unsupported file type ${file.mimetype} (${file.originalname})`));
  },
});
const MAX_UPLOAD_BATCH_BYTES = 250 * 1024 * 1024;

function batchTooLarge(files: Express.Multer.File[]): boolean {
  return files.reduce((sum, file) => sum + file.size, 0) > MAX_UPLOAD_BATCH_BYTES;
}

let fallbackRepositoryPromise: Promise<OntologyRepository> | null = null;

function resolveOntologyMatrixPath(): string {
  return process.env.ONTOLOGY_MATRIX_PATH || path.resolve(process.cwd(), DEFAULT_ONTOLOGY_MATRIX_PATH);
}

async function getFallbackRepository(): Promise<OntologyRepository> {
  fallbackRepositoryPromise ??= (async () => {
    const repository = new InMemoryOntologyRepository();
    try {
      const records = buildOntologyRecordsFromWorkbook(resolveOntologyMatrixPath());
      await repository.upsertOntology(records);
      logger.info('Loaded local parser ontology matrix', {
        records: records.length,
        workbookPath: resolveOntologyMatrixPath(),
      });
    } catch (err) {
      logger.warn('Local parser ontology matrix unavailable; using built-in fallback only', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return repository;
  })();
  return fallbackRepositoryPromise;
}

async function getParserRepository(): Promise<OntologyRepository> {
  let neo4jRepository: ReturnType<typeof createNeo4jOntologyRepository>;
  try {
    neo4jRepository = createNeo4jOntologyRepository();
  } catch (err) {
    if (err instanceof MissingNeo4jConfigError) {
      // Not configured at all: use the bundled in-memory ontology (the canonical
      // document types + verification matrix). Neo4j is an optional graph store,
      // not a hard dependency — the parser classifies and extracts fully on the
      // in-memory ontology. An operator who genuinely requires Neo4j can enforce
      // it with PARSER_REQUIRE_NEO4J=true (same flag as the unreachable branch).
      if (process.env.PARSER_REQUIRE_NEO4J === 'true') {
        throw err;
      }
      logger.warn('Neo4j parser graph is not configured; using in-memory parser ontology fallback');
      return getFallbackRepository();
    }
    throw err;
  }

  // Configured — but verify it is actually reachable. A configured-but-down
  // Neo4j must not take the whole service down: fall back to the bundled
  // in-memory ontology (non-production) rather than 500 on every request.
  try {
    await neo4jRepository.ping();
    return neo4jRepository;
  } catch (err) {
    await neo4jRepository.close?.().catch(() => undefined);
    if (process.env.NODE_ENV === 'production' && process.env.PARSER_REQUIRE_NEO4J === 'true') {
      throw err;
    }
    logger.warn('Neo4j parser graph is unreachable; using in-memory parser ontology fallback', {
      error: err instanceof Error ? err.message : String(err),
    });
    return getFallbackRepository();
  }
}

/**
 * The preset "documents expected to be uploaded" catalog — the ontology's
 * document types (name, description, pillar, required) plus the case-level
 * required groups the case parser enforces. Lets the UI render the upload
 * checklist from the same source of truth that classification/validation use.
 */
router.get('/document-types', async (req: Request, res: Response) => {
  const repository = await getParserRepository();
  try {
    const types = await repository.listDocumentTypes();
    const required_groups = getRequiredDocumentGroups({
      sector: typeof req.query.sector === 'string' ? req.query.sector : undefined,
      size: typeof req.query.size === 'string' ? req.query.size : undefined,
      subSector: typeof req.query.subSector === 'string' ? req.query.subSector : undefined,
    });
    return res.json({
      document_types: types,
      required_groups,
      sector_options: SECTOR_OPTIONS,
    });
  } catch (err) {
    logger.error('Listing parser document types failed', err as Error);
    return res.status(500).json(fail('Could not list document types', 'DOCUMENT_TYPES_FAILED'));
  } finally {
    await repository.close?.();
  }
});

/**
 * The verification document request — what to ask the client for, by element.
 *
 * `/document-types` answers "what can the parser recognise". This answers "what
 * does a verification actually require", which is what the upload UI needs in
 * order to ask for the right evidence up front. Asking well is the cheapest way
 * to avoid a low score caused by missing documents rather than by performance.
 *
 * `whatTheAuditorTests` is the expert's own wording, so the UI can explain why a
 * document is needed instead of just naming it.
 */
router.get('/required-documents', (_req: Request, res: Response) => {
  const grouped = documentsByElement();
  return res.json(ok({
    elements: Object.entries(grouped).map(([element, docs]) => ({
      element,
      documentCount: docs.length,
      documents: docs.map((doc) => ({
        id: doc.id,
        name: doc.name,
        whatTheAuditorTests: doc.auditorTests,
        exampleOfGoodData: doc.exampleData,
        expectedFields: doc.expectedFields,
      })),
    })),
    totalDocuments: Object.values(grouped).reduce((sum, docs) => sum + docs.length, 0),
  }));
});

router.post('/resolve', async (req: Request, res: Response) => {
  const repository = await getParserRepository();
  try {
    const service = new ParserService(repository);
    const result = await service.resolve(req.body);
    return res.status(result.status === 'failed' ? 422 : 200).json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json(fail(err.errors.map((e) => e.message).join('; '), 'INVALID_PARSER_INPUT'));
    }
    logger.error('Parser resolve failed', err as Error);
    return res.status(500).json(fail('Parser resolve failed', 'PARSER_RESOLVE_FAILED'));
  } finally {
    await repository.close?.();
  }
});

router.post('/resolve-file', upload.single('file'), async (req: Request, res: Response) => {
  const repository = await getParserRepository();
  try {
    if (!req.file) {
      return res.status(400).json(fail('Upload a file using multipart field name "file"', 'FILE_REQUIRED'));
    }

    const rawInput = await rawExtractionInputFromUpload(req.file);
    const service = new ParserService(repository);
    const result = await service.resolve(rawInput);
    return res.status(result.status === 'failed' ? 422 : 200).json(result);
  } catch (err) {
    logger.error('Parser file resolve failed', err as Error);
    return res.status(400).json(fail((err as Error).message, 'FILE_PARSE_FAILED'));
  } finally {
    await repository.close?.();
  }
});

router.post('/resolve-case', async (req: Request, res: Response) => {
  const repository = await getParserRepository();
  try {
    const documents = Array.isArray(req.body?.documents) ? req.body.documents : null;
    if (!documents) {
      return res.status(400).json(fail('Body must include documents[]', 'DOCUMENTS_REQUIRED'));
    }

    const service = new CaseParserService(repository);
    const caseId = typeof req.body?.case_id === 'string' ? req.body.case_id : undefined;
    const result = await service.resolveCase(documents, caseId);
    return res.status(result.status === 'failed' ? 422 : 200).json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json(fail(err.errors.map((e) => e.message).join('; '), 'INVALID_CASE_INPUT'));
    }
    logger.error('Parser case resolve failed', err as Error);
    return res.status(500).json(fail('Parser case resolve failed', 'PARSER_CASE_RESOLVE_FAILED'));
  } finally {
    await repository.close?.();
  }
});

/**
 * Extraction (flow step 7) — the ONLY place real Azure effort is spent, so it
 * is gated on payment. The gate fails closed and re-fingerprints the uploaded
 * files against the paid quote, so a cheap quote can't be used to extract
 * expensive documents.
 */
router.post('/resolve-case-files', upload.array('files', 25), async (req: Request, res: Response) => {
  const files = Array.isArray(req.files) ? req.files as Express.Multer.File[] : [];
  if (files.length === 0) {
    return res.status(400).json(fail('Upload files using multipart field name "files"', 'FILES_REQUIRED'));
  }
  if (batchTooLarge(files)) {
    return res.status(413).json(fail('Upload batch is too large. Maximum combined size is 250MB.', 'BATCH_TOO_LARGE'));
  }

  if (extractionRequiresPayment()) {
    const quoteId = typeof req.body?.quote_id === 'string' ? req.body.quote_id : undefined;
    const gate = await authoriseExtraction(quoteId, files);
    if (!gate.ok) {
      logger.warn('Extraction refused by payment gate', { code: gate.code, quoteId });
      return res.status(gate.status).json(fail(gate.message, gate.code));
    }
    // Burn the quote so one payment buys exactly one extraction.
    await getQuoteStore().update(gate.record.quoteId, { consumedAt: Date.now() });
  }

  const repository = await getParserRepository();
  try {
    // A multi-sheet workbook becomes one input PER SHEET, so the Ownership sheet
    // is classified and extracted against the ownership prompts and the
    // Procurement sheet against the procurement prompts — instead of one prompt
    // drowning in a 17-sheet blob (Phase 4 finding).
    const rawInputs = (await Promise.all(files.map((file) => extractionInputsFromUpload(file)))).flat();
    const service = new CaseParserService(repository);
    const caseId = typeof req.body?.case_id === 'string' ? req.body.case_id : undefined;
    const result = await service.resolveCase(rawInputs, caseId);

    // AI extraction runs ACROSS the case, not per document, because evidence for
    // one fact is spread over several files (entity name on the certificate and
    // the CIPC record; NPAT in the AFS and the SED workpaper). It is additive:
    // with no model configured this is skipped and the deterministic result is
    // returned unchanged.
    const entities = await extractCaseEntities(rawInputs);

    return res.status(result.status === 'failed' && !entities ? 422 : 200).json({
      ...result,
      ai_entities: entities,
    });
  } catch (err) {
    logger.error('Parser case file resolve failed', err as Error);
    return res.status(400).json(fail((err as Error).message, 'CASE_FILE_PARSE_FAILED'));
  } finally {
    await repository.close?.();
  }
});

/**
 * Quote (flow step 5) — free and deterministic. Records the quote against a
 * content fingerprint of these exact files so payment can be bound to them.
 */
router.post('/quote-files', upload.array('files', 25), async (req: Request, res: Response) => {
  try {
    const files = Array.isArray(req.files) ? req.files as Express.Multer.File[] : [];
    if (files.length === 0) {
      return res.status(400).json(fail('Upload files using multipart field name "files"', 'FILES_REQUIRED'));
    }
    if (batchTooLarge(files)) {
      return res.status(413).json(fail('Upload batch is too large. Maximum combined size is 250MB.', 'BATCH_TOO_LARGE'));
    }

    const quote = await quoteUploadedFiles(files);
    await getQuoteStore().put({
      quoteId: quote.quoteId,
      fingerprint: fingerprintFiles(files),
      currency: quote.currency,
      totalCents: quote.totals.totalCents,
      paymentStatus: 'not_started',
      createdAt: Date.now(),
      expiresAt: new Date(quote.expiresAt).getTime(),
      quote,
    });
    // The client must not guess whether money is involved: if the gate is off
    // (no payment provider wired yet), it shows a review step instead of a
    // pay button rather than sending the user to a checkout that cannot settle.
    return res.json(ok({ ...quote, paymentRequired: extractionRequiresPayment() }));
  } catch (err) {
    logger.error('Parser pricing quote failed', err as Error);
    return res.status(400).json(fail((err as Error).message, 'QUOTE_FAILED'));
  }
});

/**
 * Payment (flow step 6) — hand the user a PayFast hosted-checkout URL for a quote.
 * We never touch card data; PayFast's page does.
 */
router.post('/quotes/:quoteId/checkout', async (req: Request, res: Response) => {
  const quoteId = String(req.params.quoteId);
  try {
    const record = await getQuoteStore().get(quoteId);
    if (!record) return res.status(404).json(fail('Unknown quote', 'QUOTE_NOT_FOUND'));
    if (record.paymentStatus === 'paid') {
      return res.status(409).json(fail('This quote is already paid', 'ALREADY_PAID'));
    }
    if (Date.now() > record.expiresAt) {
      return res.status(410).json(fail('That quote has expired. Request a new quote.', 'QUOTE_EXPIRED'));
    }

    const checkout = createPayfastCheckout({
      quoteId: record.quoteId,
      amountCents: record.totalCents,
      currency: record.currency,
    });
    await getQuoteStore().update(quoteId, { paymentStatus: 'pending' });

    return res.json(ok({
      quoteId,
      redirectUrl: checkout.redirectUrl,
      amountCents: record.totalCents,
      currency: record.currency,
      simulated: checkout.simulated,
    }));
  } catch (err) {
    logger.error('PayFast checkout failed', err as Error);
    return res.status(502).json(fail((err as Error).message, 'CHECKOUT_FAILED'));
  }
});

/** Read a quote's payment state (the UI polls this after returning from PayFast). */
router.get('/quotes/:quoteId', async (req: Request, res: Response) => {
  const record = await getQuoteStore().get(String(req.params.quoteId));
  if (!record) return res.status(404).json(fail('Unknown quote', 'QUOTE_NOT_FOUND'));
  return res.json(ok({
    quoteId: record.quoteId,
    paymentStatus: record.paymentStatus,
    currency: record.currency,
    totalCents: record.totalCents,
    expiresAt: new Date(record.expiresAt).toISOString(),
    consumed: Boolean(record.consumedAt),
    quote: record.quote,
  }));
});

/**
 * PayFast ITN — the ONLY thing allowed to mark a quote paid. We trust it only
 * after (1) recomputing its signature and (2) confirming it server-to-server
 * with PayFast, then (3) checking the amount matches the quote. Anything less is
 * an attacker claiming payment.
 */
router.post('/webhooks/payfast', async (req: Request, res: Response) => {
  // PayFast posts application/x-www-form-urlencoded; express.urlencoded has
  // already parsed it into an object of strings.
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.body ?? {})) fields[k] = String(v);

  // Always 200 the ITN once received; PayFast retries on non-200 and the
  // outcome is decided by our own checks below, not by the response code.
  const quoteId = fields.m_payment_id || fields.custom_str1;
  if (!quoteId) return res.json(ok({ ignored: true, reason: 'no m_payment_id' }));

  const verified = await verifyPayfastItn(fields);
  if (!verified) {
    logger.warn('Rejected PayFast ITN that failed verification', { quoteId });
    return res.status(400).json(fail('ITN verification failed', 'BAD_ITN'));
  }

  const record = await getQuoteStore().get(quoteId);
  if (!record) return res.json(ok({ ignored: true, reason: 'unknown quote' }));

  // The amount PayFast settled must match what we quoted, to the cent.
  const paidCents = Math.round(Number(fields.amount_gross ?? fields.amount ?? 0) * 100);
  if (isPaymentComplete(fields) && paidCents === Math.round(record.totalCents)) {
    await getQuoteStore().update(quoteId, {
      paymentStatus: 'paid',
      paidAt: Date.now(),
      providerRef: fields.pf_payment_id,
    });
    logger.info('Quote marked paid by PayFast ITN', { quoteId });
  } else if (String(fields.payment_status ?? '').toUpperCase() === 'FAILED') {
    await getQuoteStore().update(quoteId, { paymentStatus: 'failed' });
    logger.info('Quote payment failed', { quoteId });
  } else {
    logger.warn('PayFast ITN not applied (status or amount mismatch)', {
      quoteId, status: fields.payment_status, paidCents, expected: record.totalCents,
    });
  }

  return res.json(ok({ received: true }));
});

/**
 * Local-only: mark a quote paid without PayFast, so the flow can be exercised
 * before live keys exist. Hard-gated — never available in production.
 */
router.post('/quotes/:quoteId/simulate-payment', async (req: Request, res: Response) => {
  if (!simulatedPaymentAllowed()) {
    return res.status(404).json(fail('Not found', 'NOT_FOUND'));
  }
  const record = await getQuoteStore().update(String(req.params.quoteId), {
    paymentStatus: 'paid',
    paidAt: Date.now(),
    providerRef: `sim_${req.params.quoteId}`,
  });
  if (!record) return res.status(404).json(fail('Unknown quote', 'QUOTE_NOT_FOUND'));
  logger.warn('Quote marked paid by SIMULATED payment (development only)', { quoteId: record.quoteId });
  return res.json(ok({ quoteId: record.quoteId, paymentStatus: record.paymentStatus, simulated: true }));
});

router.post('/load-ontology', requireAdminToken, async (req: Request, res: Response) => {
  let repository: OntologyRepository;
  try {
    repository = createNeo4jOntologyRepository();
  } catch (err) {
    if (err instanceof MissingNeo4jConfigError) {
      return res.status(503).json(fail(err.message, 'NEO4J_NOT_CONFIGURED'));
    }
    throw err;
  }

  try {
    const workbookPath = typeof req.body?.workbook_path === 'string' && req.body.workbook_path.trim()
      ? req.body.workbook_path.trim()
      : DEFAULT_ONTOLOGY_MATRIX_PATH;
    const result = await loadOntologyFromWorkbook(repository, workbookPath);
    return res.json(ok(result));
  } catch (err) {
    logger.error('Parser ontology load failed', err as Error);
    return res.status(500).json(fail((err as Error).message, 'ONTOLOGY_LOAD_FAILED'));
  } finally {
    await repository.close?.();
  }
});

export default router;
