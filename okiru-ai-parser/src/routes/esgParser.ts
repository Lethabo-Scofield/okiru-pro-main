/**
 * The ESG upload routes — the same pipeline, the same money, a second vocabulary.
 *
 * Mounted under the parser router at `/api/parser/esg/*`, so the client that
 * already drives the B-BBEE upload can point at these paths and reuse its stream
 * reader VERBATIM: identical multipart field names, identical SSE event names
 * (`doc-start`, `doc-done`, `doc-error`, `resolving`, `resolve-progress`,
 * `result`, `complete`, `error`), identical heartbeat and buffering headers,
 * identical status codes.
 *
 * THREE THINGS THAT ARE NOT DUPLICATED, ON PURPOSE
 *
 *  1. THE MONEY. These routes use the SAME quote store, the SAME
 *     `authoriseExtraction` burn-on-use gate and the SAME
 *     `/quotes/:id/settle` internal-secret settlement as the B-BBEE routes.
 *     There is no second payment path to keep in sync, and no second way for
 *     extraction to become free. The gate fails CLOSED here for exactly the same
 *     reason and by exactly the same rule: only an explicit
 *     PARSER_REQUIRE_PAYMENT=false opens it.
 *
 *  2. THE FILE READING. `extractionInputsFromUpload` is shared unchanged —
 *     PDFs, scans, workbooks and decks are read the same way whatever the
 *     evidence is about.
 *
 *  3. THE EXTRACTION ENGINE. `extractEsgCaseEntities` is a thin wrapper over the
 *     same `extractDocument` the B-BBEE path calls, with `domain: 'esg'`.
 *
 *  4. THE UPLOAD POLICY. Both domains now share `services/uploadPolicy.ts` —
 *     same limits, same filter, one place to change. It used to be restated
 *     here to avoid a cycle (`parser.ts` mounts THIS router); living in
 *     `services/` removes the cycle and the "if one changes, both must" hazard.
 */
import { Router, type Request, type Response } from 'express';
import { createLogger } from '../logger.js';
import { fail, ok } from '../utils/apiResponse.js';
import { extractionInputsFromUpload } from '../services/fileExtraction.js';
import {
  MAX_UPLOAD_BATCH_BYTES,
  skippedUploadSummary,
  skippedUploads,
  upload,
} from '../services/uploadPolicy.js';
import { quoteUploadedFiles } from '../services/pricingQuote.js';
import { authoriseExtraction, fingerprintFiles, getQuoteStore } from '../services/quoteStore.js';
import { persistCaseFiles } from '../services/caseDocumentStorage.js';
import { concurrentMap } from '../services/concurrentMap.js';
import { extractEsgCaseEntities } from '../services/esgCaseExtraction.js';
import { elementFromHint } from '../services/specRetrieval.js';
import {
  ESG_DOCUMENT_MATRIX,
  esgDocumentsByElement,
  type EsgElement,
} from '../../schemas/esg_document_matrix.js';

const logger = createLogger('EsgParserRoutes');
const router = Router();

/**
 * Whether extraction is gated on payment. Defaults to ON: paid work must never
 * become free because someone forgot to set a flag. Identical rule to the
 * B-BBEE routes — read from the same env var so the two can never diverge.
 */
function extractionRequiresPayment(): boolean {
  return process.env.PARSER_REQUIRE_PAYMENT !== 'false';
}

function batchTooLarge(files: Express.Multer.File[]): boolean {
  return files.reduce((sum, file) => sum + file.size, 0) > MAX_UPLOAD_BATCH_BYTES;
}

/**
 * The 400 for "nothing usable arrived".
 *
 * Two different situations reach it and they need different words: no files at
 * all (a client bug — wrong field name), or files that were all skipped by the
 * upload filter (a user problem — say which, so they can drop them and retry).
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

/**
 * The ESG evidence catalogue — what to ask the client for, by element.
 *
 * The analogue of `/document-types`: it answers "what does an ESG engagement
 * actually require", which is what the upload UI needs in order to ask for the
 * right evidence up front. Asking well is the cheapest way to avoid a low score
 * caused by missing documents rather than by performance.
 *
 * `whatTheAuditorTests` is the assurance provider's own wording, so the UI can
 * explain why a document is needed instead of just naming it.
 */
router.get('/document-types', (_req: Request, res: Response) => {
  const grouped = esgDocumentsByElement();
  return res.json(ok({
    domain: 'esg',
    elements: Object.entries(grouped).map(([element, docs]) => ({
      element,
      documentCount: docs.length,
      documents: docs.map((doc) => ({
        id: doc.id,
        name: doc.name,
        aliases: doc.aliases,
        whatTheAuditorTests: doc.auditorTests,
        exampleOfGoodData: doc.exampleData,
        expectedFields: doc.expectedFields,
      })),
    })),
    totalDocuments: ESG_DOCUMENT_MATRIX.length,
  }));
});

/**
 * Quote (flow step 5) — FREE and deterministic, no Azure call, no OCR, no
 * vision, no extraction. Records the quote against a content fingerprint of
 * these exact files so payment can be bound to them, using the same store the
 * B-BBEE quote uses.
 *
 * The free structure scan is `quoteUploadedFiles` itself (pages, sheets, rows,
 * predicted tokens). On top of it each file gets the ESG element its NAME
 * states, where it states one — a filename costs nothing to read, and telling
 * the user "we think this is your water account" before they pay is the
 * difference between a quote and a bill.
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

    // Name-only routing: free, deterministic, and never asserted as fact — null
    // simply means the filename says nothing and the model will decide.
    const esgRouting = files.map((file) => ({
      filename: file.originalname,
      element: elementFromHint(file.originalname, 'esg') as EsgElement | null,
    }));

    return res.json(ok({
      ...quote,
      domain: 'esg',
      esgRouting,
      paymentRequired: extractionRequiresPayment(),
      // Files the filter dropped. Named at QUOTE time, which is free and comes
      // before payment, so "we can't read your .eml" is something the user
      // learns while they can still do something about it.
      skippedFiles: skippedUploads(req),
    }));
  } catch (err) {
    logger.error('ESG pricing quote failed', err as Error);
    return res.status(400).json(fail((err as Error).message, 'QUOTE_FAILED'));
  }
});

/**
 * Extraction (flow step 7) — the ONLY place real Azure effort is spent, so it is
 * gated on payment. The gate fails closed and re-fingerprints the uploaded files
 * against the paid quote, so a cheap quote can't be used to extract expensive
 * documents.
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
      logger.warn('ESG extraction refused by payment gate', { code: gate.code, quoteId });
      return res.status(gate.status).json(fail(gate.message, gate.code));
    }
    // Burn the quote so one payment buys exactly one extraction.
    await getQuoteStore().update(gate.record.quoteId, { consumedAt: Date.now() });
  }

  // Fire-and-forget: persist the ORIGINAL uploaded files to durable blob storage
  // in parallel with extraction. Never awaited, never lets a storage hiccup slow
  // or fail the response the client is waiting on.
  void persistCaseFiles(
    typeof req.body?.case_id === 'string' ? req.body.case_id : undefined,
    files,
  ).catch(() => { /* persistCaseFile already logs; this just stops an unhandled rejection */ });

  try {
    // Per-file isolation: one unreadable file (a legacy .doc, a scan with no
    // text layer) must FLAG, never sink a batch the user has paid for.
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
    const rawInputs = settled
      .filter((s) => s.ok)
      .flatMap((s) => (s as { inputs: Awaited<ReturnType<typeof extractionInputsFromUpload>> }).inputs);
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

    const entities = await extractEsgCaseEntities(rawInputs);
    const caseId = typeof req.body?.case_id === 'string' ? req.body.case_id : undefined;

    return res.status(entities ? 200 : 422).json({
      status: entities ? 'resolved' : 'failed',
      case_id: caseId,
      domain: 'esg',
      documents: rawInputs.map((input) => ({ file_name: input.filename })),
      // Both keys carry the same object: `ai_entities` so an existing B-BBEE
      // client reads it without a change, `esg_entities` so a caller that knows
      // about domains can be explicit.
      ai_entities: entities,
      esg_entities: entities,
      unreadable_files: unreadableFiles,
    });
  } catch (err) {
    logger.error('ESG case file resolve failed', err as Error);
    return res.status(400).json(fail((err as Error).message, 'CASE_FILE_PARSE_FAILED'));
  }
});

/**
 * Streaming variant. Same result, same events, so the UI fills up file-by-file
 * instead of showing one frozen spinner for minutes on a large evidence pack:
 *   event: doc-start        {index, fileName}
 *   event: doc-done         {index, fileName}
 *   event: doc-error        {index, fileName, message}
 *   event: resolving        {total}
 *   event: resolve-progress {done, total, fileName}
 *   event: result           {status, case_id, domain, ai_entities, esg_entities}
 *   event: complete         {}
 *   event: error            {message}
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
      logger.warn('ESG extraction refused by payment gate', { code: gate.code, quoteId });
      return res.status(gate.status).json(fail(gate.message, gate.code));
    }
    await getQuoteStore().update(gate.record.quoteId, { consumedAt: Date.now() });
  }

  void persistCaseFiles(
    typeof req.body?.case_id === 'string' ? req.body.case_id : undefined,
    files,
  ).catch(() => { /* persistCaseFile already logs; this just stops an unhandled rejection */ });

  // SSE headers. X-Accel-Buffering:no stops nginx (ingress + the web proxy) from
  // buffering the stream, so events reach the browser as they happen.
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
    const caseId = typeof req.body?.case_id === 'string' ? req.body.case_id : undefined;
    const entities = await extractEsgCaseEntities(rawInputs, undefined, (p) => send('resolve-progress', p));

    send('result', {
      status: entities ? 'resolved' : 'failed',
      case_id: caseId,
      domain: 'esg',
      documents: rawInputs.map((input) => ({ file_name: input.filename })),
      ai_entities: entities,
      esg_entities: entities,
    });
    send('complete', {});
  } catch (err) {
    logger.error('ESG case file resolve (stream) failed', err as Error);
    send('error', { message: (err as Error).message || 'CASE_FILE_PARSE_FAILED' });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

export default router;
