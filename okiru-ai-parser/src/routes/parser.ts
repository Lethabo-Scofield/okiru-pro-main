import { Router, type Request, type Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { createLogger } from '../logger.js';
import { requireAdminToken } from '../middleware/adminAuth.js';
import { fail, ok } from '../utils/apiResponse.js';
import { extractionInputsFromUpload, rawExtractionInputFromUpload, SUPPORTED_UPLOAD_MIME_TYPES } from '../services/fileExtraction.js';
import {
  MAX_UPLOAD_BATCH_BYTES,
  skippedUploadSummary,
  skippedUploads,
  upload,
} from '../services/uploadPolicy.js';
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
// The reader behind the lexical classifier: settles low-confidence / too-close
// document types by purpose and layout. Undefined without a model, in which
// case the lexical decision stands and extraction still runs under it.
import { modelTypeAdjudicator } from '../services/documentTypeAdjudication.js';
import { concurrentMap } from '../services/concurrentMap.js';
import { persistCaseFiles } from '../services/caseDocumentStorage.js';
import esgRouter from './esgParser.js';

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
/**
 * The 400 for "nothing usable arrived" — see `noUsableFiles` in esgParser.ts.
 * No files at all is a client bug; every file skipped by the upload filter is a
 * user problem, and only one of those is worth naming the files for.
 */
function noUsableFiles(req: Request) {
  const summary = skippedUploadSummary(req);
  return summary
    ? fail(
      `None of the uploaded files are a type we can read: ${summary}. Remove them and upload the documents on their own.`,
      'UNSUPPORTED_FILES_ONLY',
    )
    : fail('Upload files using multipart field name "files"', 'FILES_REQUIRED');
}

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
    const service = new ParserService(repository, { adjudicator: modelTypeAdjudicator() });
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
      // An unsupported file is now skipped rather than fatal, so "no file" and
      // "the only file was the wrong type" both land here and need telling apart.
      const summary = skippedUploadSummary(req);
      return res.status(400).json(summary
        ? fail(`That file is not a type we can read: ${summary}.`, 'UNSUPPORTED_FILES_ONLY')
        : fail('Upload a file using multipart field name "file"', 'FILE_REQUIRED'));
    }

    const rawInput = await rawExtractionInputFromUpload(req.file);
    const service = new ParserService(repository, { adjudicator: modelTypeAdjudicator() });
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

    const service = new CaseParserService(repository, { adjudicator: modelTypeAdjudicator() });
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
router.post('/resolve-case-files', upload.array('files', 100), async (req: Request, res: Response) => {
  const files = Array.isArray(req.files) ? req.files as Express.Multer.File[] : [];
  if (files.length === 0) {
    return res.status(400).json(noUsableFiles(req));
  }
  if (batchTooLarge(files)) {
    return res.status(413).json(fail('Upload batch is too large. Maximum combined size is 500MB.', 'BATCH_TOO_LARGE'));
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

  // Fire-and-forget: persist the ORIGINAL uploaded files to durable blob
  // storage in parallel with extraction. Never awaited, never lets a storage
  // hiccup slow or fail the response the client is waiting on.
  void persistCaseFiles(
    typeof req.body?.case_id === 'string' ? req.body.case_id : undefined,
    files,
  ).catch(() => { /* persistCaseFile already logs; this just stops an unhandled rejection */ });

  const repository = await getParserRepository();
  try {
    // A multi-sheet workbook becomes one input PER SHEET, so the Ownership sheet
    // is classified and extracted against the ownership prompts and the
    // Procurement sheet against the procurement prompts — instead of one prompt
    // drowning in a 17-sheet blob (Phase 4 finding).
    //
    // Per-file isolation, like the stream route: one unreadable file (a legacy
    // .doc, a scan with no text layer) must FLAG, never sink the batch — a
    // 64-file pack once returned 400 for all 64 because Promise.all rejected
    // on the single bad file.
    const settled = await Promise.all(
      files.map(async (file) => {
        try {
          return { ok: true as const, inputs: await extractionInputsFromUpload(file) };
        } catch (err) {
          logger.warn('File skipped — could not be read', { filename: file.originalname, error: (err as Error).message });
          return { ok: false as const, fileName: file.originalname, message: (err as Error).message };
        }
      }),
    );
    const rawInputs = settled.filter((s) => s.ok).flatMap((s) => (s as { inputs: Awaited<ReturnType<typeof extractionInputsFromUpload>> }).inputs);
    const unreadableFiles = [
      // Skipped by the upload filter (wrong type) and failed while being read
      // are different causes with the same consequence: the user uploaded it
      // and got nothing back. Report them together so neither disappears.
      ...skippedUploads(req),
      ...settled
        .filter((s) => !s.ok)
        .map((s) => ({ file_name: (s as { fileName: string }).fileName, reason: (s as { message: string }).message })),
    ];
    if (rawInputs.length === 0) {
      return res.status(400).json(fail(
        `None of the uploaded files could be read (${unreadableFiles.map((u) => u.file_name).join(', ')})`,
        'CASE_FILE_PARSE_FAILED',
      ));
    }
    const service = new CaseParserService(repository, { adjudicator: modelTypeAdjudicator() });
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
      unreadable_files: unreadableFiles,
    });
  } catch (err) {
    logger.error('Parser case file resolve failed', err as Error);
    return res.status(400).json(fail((err as Error).message, 'CASE_FILE_PARSE_FAILED'));
  } finally {
    await repository.close?.();
  }
});

/**
 * Streaming variant of resolve-case-files. Same result, but emits Server-Sent
 * Events so the UI can fill up file-by-file instead of showing one frozen
 * spinner for minutes on a large evidence pack:
 *   event: doc-start   {index, fileName}   — before a file is parsed
 *   event: doc-done    {index, fileName}   — after that file is parsed
 *   event: resolving        {total}          — parsing done, reconcile/AI begins
 *   event: resolve-progress {done,total,fileName} — each doc's AI read completes
 *   event: result           {<full case result>, ai_entities}
 *   event: complete         {}
 *   event: error            {message}
 * The parse phase (OCR/vision per file) is the slow part on scanned packs; the
 * cross-case resolve/AI step is rate-limited and multi-minute, so it now reports
 * sub-progress per document rather than freezing on one "resolving" spinner.
 */
router.post('/resolve-case-files-stream', upload.array('files', 100), async (req: Request, res: Response) => {
  const files = Array.isArray(req.files) ? req.files as Express.Multer.File[] : [];
  if (files.length === 0) {
    return res.status(400).json(noUsableFiles(req));
  }
  if (batchTooLarge(files)) {
    return res.status(413).json(fail('Upload batch is too large. Maximum combined size is 500MB.', 'BATCH_TOO_LARGE'));
  }
  if (extractionRequiresPayment()) {
    const quoteId = typeof req.body?.quote_id === 'string' ? req.body.quote_id : undefined;
    const gate = await authoriseExtraction(quoteId, files);
    if (!gate.ok) {
      logger.warn('Extraction refused by payment gate', { code: gate.code, quoteId });
      return res.status(gate.status).json(fail(gate.message, gate.code));
    }
    await getQuoteStore().update(gate.record.quoteId, { consumedAt: Date.now() });
  }

  // Fire-and-forget: persist the ORIGINAL uploaded files to durable blob
  // storage in parallel with the stream below — never awaited, never lets a
  // storage hiccup slow or fail the extraction the client is watching.
  void persistCaseFiles(
    typeof req.body?.case_id === 'string' ? req.body.case_id : undefined,
    files,
  ).catch(() => { /* persistCaseFile already logs; this just stops an unhandled rejection */ });

  // SSE headers. X-Accel-Buffering:no stops nginx (ingress + the web proxy)
  // from buffering the stream, so events reach the browser as they happen.
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  // Heartbeat so intermediaries don't drop a long-idle connection during the
  // cross-case AI step.
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);

  const repository = await getParserRepository();
  try {
    // Files the upload filter dropped never reach `files`, so without this they
    // would be silently absent from a stream the client uses as the record of
    // what happened. Same event the per-file reader failures use, so the UI
    // marks them without knowing the difference.
    skippedUploads(req).forEach((skipped, i) => {
      send('doc-error', {
        index: -1 - i,
        fileName: skipped.file_name,
        message: `Skipped — ${skipped.reason}`,
      });
    });

    // Files parse with BOUNDED CONCURRENCY, not one at a time — a 17-file pack
    // was as slow as the sum of its parts because each scan's OCR/vision wait
    // blocked every file behind it. Events still fire per file as each worker
    // picks it up / finishes, so the progress UI is unchanged; results are
    // flattened in INPUT ORDER (concurrentMap preserves it) so the
    // first-document-wins reconciliation stays deterministic.
    const fileLanes = (() => {
      const configured = Number(process.env.PARSER_FILE_CONCURRENCY);
      return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 3;
    })();
    const settled = await concurrentMap(files, fileLanes, async (file, i) => {
      send('doc-start', { index: i, fileName: file.originalname });
      try {
        const inputs = await extractionInputsFromUpload(file);
        send('doc-done', { index: i, fileName: file.originalname });
        return inputs;
      } catch (err) {
        send('doc-error', { index: i, fileName: file.originalname, message: (err as Error).message });
        return [];
      }
    });
    const rawInputs: Awaited<ReturnType<typeof extractionInputsFromUpload>> = settled
      .filter((r) => r.status === 'fulfilled' && Array.isArray(r.value))
      .flatMap((r) => r.value as Awaited<ReturnType<typeof extractionInputsFromUpload>>);

    send('resolving', { total: rawInputs.length });
    const service = new CaseParserService(repository, { adjudicator: modelTypeAdjudicator() });
    const caseId = typeof req.body?.case_id === 'string' ? req.body.case_id : undefined;
    const result = await service.resolveCase(rawInputs, caseId);
    // Sub-progress through the slow, rate-limited AI resolve phase, so the wait
    // after payment shows movement instead of a silent multi-minute gap.
    const entities = await extractCaseEntities(rawInputs, undefined, (p) =>
      send('resolve-progress', p));

    send('result', { ...result, ai_entities: entities });
    send('complete', {});
  } catch (err) {
    logger.error('Parser case file resolve (stream) failed', err as Error);
    send('error', { message: (err as Error).message || 'CASE_FILE_PARSE_FAILED' });
  } finally {
    clearInterval(heartbeat);
    await repository.close?.();
    res.end();
  }
});

/**
 * Quote (flow step 5) — free and deterministic. Records the quote against a
 * content fingerprint of these exact files so payment can be bound to them.
 */
router.post('/quote-files', upload.array('files', 100), async (req: Request, res: Response) => {
  try {
    const files = Array.isArray(req.files) ? req.files as Express.Multer.File[] : [];
    if (files.length === 0) {
      return res.status(400).json(noUsableFiles(req));
    }
    if (batchTooLarge(files)) {
      return res.status(413).json(fail('Upload batch is too large. Maximum combined size is 500MB.', 'BATCH_TOO_LARGE'));
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
    // `skippedFiles` is named at QUOTE time, which is free and comes before
    // payment, so "we can't read your .eml" is something the user learns while
    // they can still do something about it.
    return res.json(ok({
      ...quote,
      paymentRequired: extractionRequiresPayment(),
      skippedFiles: skippedUploads(req),
    }));
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
 * Settle a quote against the CREDIT WALLET instead of a card.
 *
 * The product now sells credit tokens up front rather than charging per upload,
 * so the thing that authorises extraction is no longer a PayFast ITN — it is a
 * successful token debit, which happens in apps/web (that is where the session,
 * the organisation and the balance live). This endpoint is how that debit is
 * reported back to the gate.
 *
 * It is strictly server-to-server. The browser must never be able to reach it,
 * because reaching it means free extraction — so it fails CLOSED in three ways:
 *   - no PARSER_INTERNAL_SECRET configured → 404 (the route may as well not exist)
 *   - wrong/absent secret → 403
 *   - constant-time compare, so the secret can't be discovered a byte at a time
 *
 * `authoriseExtraction` is untouched: it still demands a paid, unexpired,
 * unconsumed quote whose fingerprint matches the uploaded files. All that has
 * changed is who is allowed to say "paid".
 */
router.post('/quotes/:quoteId/settle', async (req: Request, res: Response) => {
  const secret = process.env.PARSER_INTERNAL_SECRET || '';
  if (!secret) {
    logger.warn('Wallet settle attempted with no PARSER_INTERNAL_SECRET configured');
    return res.status(404).json(fail('Not found', 'NOT_FOUND'));
  }
  const presented = String(req.header('x-okiru-internal-secret') ?? '');
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    logger.warn('Rejected wallet settle with a bad internal secret', { quoteId: req.params.quoteId });
    return res.status(403).json(fail('Forbidden', 'FORBIDDEN'));
  }

  const quoteId = String(req.params.quoteId);
  const record = await getQuoteStore().get(quoteId);
  if (!record) return res.status(404).json(fail('Unknown quote', 'QUOTE_NOT_FOUND'));
  if (record.consumedAt) {
    return res.status(409).json(fail('This quote has already been used for an extraction.', 'QUOTE_ALREADY_USED'));
  }
  if (record.paymentStatus !== 'paid' && Date.now() > record.expiresAt) {
    return res.status(410).json(fail('That quote has expired. Request a new quote.', 'QUOTE_EXPIRED'));
  }
  // Idempotent: a retried settle for an already-settled quote is a success, not
  // a double charge. The caller's own ledger is what prevents double debits.
  if (record.paymentStatus === 'paid') {
    return res.json(ok({ quoteId, paymentStatus: 'paid', alreadySettled: true, totalCents: record.totalCents }));
  }

  const reference = String((req.body as { reference?: unknown } | undefined)?.reference ?? '').slice(0, 120);
  await getQuoteStore().update(quoteId, {
    paymentStatus: 'paid',
    paidAt: Date.now(),
    providerRef: reference ? `wallet_${reference}` : `wallet_${quoteId}`,
  });
  logger.info('Quote settled from the credit wallet', { quoteId, reference: reference || null });
  return res.json(ok({ quoteId, paymentStatus: 'paid', alreadySettled: false, totalCents: record.totalCents }));
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

/**
 * The ESG evidence pipeline, at `/api/parser/esg/*`.
 *
 * Mounted here rather than in server.ts so ESG inherits this router's path,
 * proxy configuration and deployment surface unchanged — and so the payment
 * routes above (`/quotes/:id/checkout`, `/quotes/:id/settle`, the PayFast
 * webhook) remain the ONLY payment path for both domains. No route above is
 * touched: `/esg` collides with none of them.
 */
router.use('/esg', esgRouter);

export default router;
