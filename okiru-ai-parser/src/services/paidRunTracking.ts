/**
 * Which runs keep their result for a reconnecting client, and what collecting
 * it means for the wallet.
 */
import { createLogger } from '../logger.js';
import { fingerprintFiles, getQuoteStore } from './quoteStore.js';
import type { UploadedFileLike } from './fileExtraction.js';
import { paidRunRecorder, type PaidRunRecord, type PaidRunRecorder } from './runResultStore.js';

const logger = createLogger('PaidRunTracking');

/**
 * The recorder for this run, or null when there is nothing to key it by.
 *
 * A paid run is keyed by the quote it just consumed. With payment switched off
 * nothing is consumed, so the run is keyed by the quote the client names only
 * when that quote exists AND covers exactly these bytes — a quote id alone,
 * guessed or reused, never lets one upload's run overwrite another's result.
 */
export async function recorderForRun(options: {
  domain: PaidRunRecord['domain'];
  /** The quote this run consumed (payment on). */
  paidQuoteId?: string;
  /** The `quote_id` the client sent (payment off). */
  requestedQuoteId?: unknown;
  files: UploadedFileLike[];
}): Promise<PaidRunRecorder | null> {
  if (options.paidQuoteId) return paidRunRecorder(options.paidQuoteId, options.domain);
  if (typeof options.requestedQuoteId !== 'string' || !options.requestedQuoteId) return null;
  try {
    const quote = await getQuoteStore().get(options.requestedQuoteId);
    if (!quote || quote.fingerprint !== fingerprintFiles(options.files)) return null;
    return paidRunRecorder(quote.quoteId, options.domain);
  } catch (err) {
    logger.warn('Could not look up the quote for an unpaid run; its result is not kept', {
      error: (err as Error).message,
    });
    return null;
  }
}

/**
 * The organisation has collected the result its connection dropped: the run
 * DID reach them after all, so the wallet must judge it as delivered rather
 * than refund it as lost. Only an outcome that says "not delivered" changes.
 * Never throws — collecting the result matters more than the bookkeeping.
 */
export async function markResultCollected(quoteId: string): Promise<void> {
  try {
    const record = await getQuoteStore().get(quoteId);
    const outcome = record?.outcome;
    if (!outcome || outcome.delivered !== false) return;
    await getQuoteStore().updateIf(
      quoteId,
      { outcome: { ...outcome, delivered: true, collectedAt: Date.now() } },
      (current) => current.outcome?.delivered === false,
    );
  } catch (err) {
    logger.warn('Could not mark a collected result as delivered', { quoteId, error: (err as Error).message });
  }
}
