/**
 * Azure OpenAI fetch with 429/5xx retry.
 *
 * A large evidence pack fans out enough concurrent extraction calls to trip
 * the deployment's tokens-per-minute limit. Without retry, every 429 threw and
 * its fields were simply left missing — a 64-file pack lost most of its
 * case-level extraction to a rate-limit storm while the batch "succeeded".
 * Azure tells us exactly how long to wait (Retry-After); honouring it turns a
 * wall of failures into a slightly slower success.
 */
import { createLogger } from '../logger.js';

const logger = createLogger('AzureRetry');

const RETRYABLE = new Set([429, 500, 502, 503, 529]);
const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 2_000;
const MAX_DELAY_MS = 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(response: Response, attempt: number): number {
  const header = Number(response.headers.get('retry-after'));
  if (Number.isFinite(header) && header > 0) return Math.min(header * 1000, MAX_DELAY_MS);
  // Exponential backoff with jitter so parallel lanes don't retry in lockstep.
  const backoff = BASE_DELAY_MS * 2 ** (attempt - 1);
  return Math.min(backoff + Math.random() * backoff, MAX_DELAY_MS);
}

/**
 * fetch() that retries retryable Azure statuses (429 + transient 5xx) up to
 * MAX_ATTEMPTS, honouring Retry-After. Non-retryable statuses and network
 * errors are returned/thrown unchanged — the caller's error handling applies.
 */
export async function fetchAzureWithRetry(url: string, init: RequestInit): Promise<Response> {
  let response = await fetch(url, init);
  for (let attempt = 1; attempt < MAX_ATTEMPTS && RETRYABLE.has(response.status); attempt++) {
    const delay = retryDelayMs(response, attempt);
    logger.warn('Azure call throttled — retrying', { status: response.status, attempt, delayMs: Math.round(delay) });
    await sleep(delay);
    response = await fetch(url, init);
  }
  return response;
}
