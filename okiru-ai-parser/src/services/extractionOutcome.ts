/**
 * What a paid extraction actually produced, per quoted document.
 *
 * Tokens are spent before a run starts, and until now nothing recorded how the
 * run ended — so a run that threw, came back empty, or died mid-stream kept the
 * tokens with nothing to show, and nobody could tell those runs apart from good
 * ones. The outcome is written onto the paid quote when the run ends; the web
 * wallet reads it (server to server) to decide a refund. The browser never
 * decides one, so "refund, then extract for free" is impossible.
 */
import { createLogger } from '../logger.js';
import { digestFile, getQuoteStore, type ExtractionOutcome, type QuoteRecord } from './quoteStore.js';

const logger = createLogger('ExtractionOutcome');

/** The separator the reader uses when it splits a workbook: "File.xlsx › Sheet". */
const SHEET_MARK = ' › ';

/**
 * Which quoted document each upload IS, matched by content.
 *
 * Names come from the client and can be swapped between quote and run — the
 * same bytes, so the gate passes — which would steer a per-file refund onto the
 * expensive document. Matching on SHA-256 makes the name irrelevant. Null when
 * the match cannot be certain: a quote without digests, an upload the quote
 * does not cover, or two uploads sharing a name (the parser names extractions
 * after uploads, so their values could not be told apart).
 */
export function quotedNameByUpload(
  files: ReadonlyArray<{ originalname: string; buffer: Buffer }>,
  record: Pick<QuoteRecord, 'fileDigests' | 'quote'>,
): Map<string, string> | null {
  const quoted = record.quote?.files ?? [];
  const digests = record.fileDigests;
  if (!digests || digests.length !== quoted.length) return null;
  if (new Set(files.map((f) => f.originalname)).size !== files.length) return null;

  const pool = quoted.map((file, i) => ({ name: file.filename, digest: digests[i], taken: false }));
  const byUpload = new Map<string, string>();
  for (const file of files) {
    const digest = digestFile(file);
    const match = pool.find((p) => !p.taken && p.digest === digest);
    if (!match) return null;
    match.taken = true;
    byUpload.set(file.originalname, match.name);
  }
  return byUpload;
}

/**
 * Values read per QUOTED document — the evidence a per-file refund rests on.
 *
 * Each extraction names its source after the upload it came from, exactly
 * ("File.pdf") or as one sheet of it ("File.xlsx › Sheet"). The longest upload
 * name that fits wins, so a name that itself contains " › " still resolves.
 * Values from a source no upload accounts for, or an attribution that was not
 * certain, mark the record unattributed: the wallet then refunds whole-run
 * failures only, never single documents.
 */
export function valuesByQuotedFile(
  files: ReadonlyArray<{ originalname: string; buffer: Buffer }>,
  record: Pick<QuoteRecord, 'fileDigests' | 'quote'> | undefined,
  extractions: ReadonlyArray<{ sourceFile?: unknown; values?: unknown }> | null | undefined,
): Pick<ExtractionOutcome, 'valuesByFile' | 'attributed' | 'totalValues'> {
  const valuesByFile: Record<string, number> = Object.fromEntries(
    (record?.quote?.files ?? []).map((file) => [file.filename, 0]),
  );
  // No quote (payment switched off): nothing is recorded, so nothing to attribute.
  const byUpload = record ? quotedNameByUpload(files, record) : null;
  const uploadNames = files.map((f) => f.originalname).sort((a, b) => b.length - a.length);

  let totalValues = 0;
  let unattributed = 0;
  for (const extraction of extractions ?? []) {
    const count = Array.isArray(extraction?.values) ? extraction.values.length : 0;
    totalValues += count;
    const source = String(extraction?.sourceFile ?? '');
    const upload = uploadNames.find((name) => source === name || source.startsWith(name + SHEET_MARK));
    const quotedName = upload ? byUpload?.get(upload) : undefined;
    if (quotedName === undefined) {
      unattributed += count;
      continue;
    }
    valuesByFile[quotedName] += count;
  }
  return { valuesByFile, attributed: byUpload !== null && unattributed === 0, totalValues };
}

/**
 * Whether the client is still there to receive the result. One that gave up —
 * its idle timeout, a closed tab, a dropped connection — never gets the result
 * however well the run goes, and the run's outcome says so, so the wallet
 * refunds it instead of charging for something nobody received.
 */
export function watchClient(res: Pick<NodeJS.EventEmitter, 'on'> & { readonly writableEnded: boolean }): () => boolean {
  let gone = false;
  res.on('close', () => {
    if (!res.writableEnded) gone = true;
  });
  return () => !gone;
}

const RECORD_ATTEMPTS = 3;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Record how a paid run ended. Never throws: a lost record must not cost the
 * user their result. Retried, because a lost record is not harmless either — a
 * delivered run with no outcome would read as dead two hours later and be
 * refunded in full.
 */
export async function recordExtractionOutcome(
  quoteId: string | undefined,
  outcome: Omit<ExtractionOutcome, 'finishedAt'>,
): Promise<void> {
  if (!quoteId) return;
  for (let attempt = 1; attempt <= RECORD_ATTEMPTS; attempt += 1) {
    try {
      await getQuoteStore().update(quoteId, { outcome: { ...outcome, finishedAt: Date.now() } });
      return;
    } catch (err) {
      if (attempt === RECORD_ATTEMPTS) {
        logger.error('Could not record the outcome of a paid extraction', err as Error, { quoteId, status: outcome.status });
        return;
      }
      await pause(250 * 4 ** (attempt - 1));
    }
  }
}
