/**
 * What a paid extraction actually produced, per uploaded file.
 *
 * Tokens are spent before a run starts, and until now nothing recorded how the
 * run ended — so a run that threw, came back empty, or died mid-stream kept the
 * tokens with nothing to show, and nobody could tell those runs apart from good
 * ones. The outcome is written onto the paid quote when the run ends; the web
 * wallet reads it (server to server) to decide a refund. The browser never
 * decides one, so "refund, then extract for free" is impossible.
 */
import { createLogger } from '../logger.js';
import { getQuoteStore, type ExtractionOutcome } from './quoteStore.js';

const logger = createLogger('ExtractionOutcome');

/**
 * Values read per uploaded file. The parser splits a workbook and names each
 * sheet "File.xlsx › Sheet"; those count towards the workbook they came from.
 */
export function valuesByUploadedFile(
  uploadNames: readonly string[],
  extractions: ReadonlyArray<{ sourceFile?: unknown; values?: unknown }> | null | undefined,
): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(uploadNames.map((name) => [name, 0]));
  for (const extraction of extractions ?? []) {
    const source = String(extraction?.sourceFile ?? '').trim();
    const marker = source.indexOf('›');
    const workbook = marker >= 0 ? source.slice(0, marker).trim() : source;
    const name = uploadNames.includes(source) ? source : uploadNames.includes(workbook) ? workbook : null;
    if (!name) continue;
    counts[name] += Array.isArray(extraction?.values) ? extraction.values.length : 0;
  }
  return counts;
}

/** Record how a paid run ended. Never throws: a lost record must not cost the user their result. */
export async function recordExtractionOutcome(
  quoteId: string | undefined,
  outcome: Omit<ExtractionOutcome, 'finishedAt'>,
): Promise<void> {
  if (!quoteId) return;
  try {
    await getQuoteStore().update(quoteId, { outcome: { ...outcome, finishedAt: Date.now() } });
  } catch (err) {
    logger.warn('Could not record the outcome of a paid extraction', {
      quoteId,
      error: (err as Error).message,
    });
  }
}
