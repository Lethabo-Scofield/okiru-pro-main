/**
 * Redis-backed quote store — the shared-state half of the payment gate.
 *
 * WHY THIS EXISTS: the parser Deployment runs 2 replicas. With the in-memory
 * store, a quote created on pod A is invisible to pod B, so a PayFast ITN
 * delivered to the wrong pod would never mark the quote paid — the user is
 * charged and gets nothing, and the extraction gate correctly but uselessly
 * refuses them. Quote state must live outside the process.
 *
 * DESIGN NOTES
 *  - Keys carry a TTL derived from the record's own expiry, with a grace period
 *    so PAID records survive long enough to be redeemed and audited. Redis does
 *    the sweeping the in-memory store had to do by hand.
 *  - `update` is a read-modify-write inside a WATCH/MULTI transaction. Without
 *    it, the ITN webhook marking a quote `paid` can race the extraction request
 *    marking it `consumed`, and one silently overwrites the other — the exact
 *    scenario where a paying user loses their extraction.
 *  - Connection failures are surfaced, never swallowed. The gate must fail
 *    closed: if we cannot read quote state, we cannot assert something was paid
 *    for. A store that returns `null` on an outage would read as "unknown
 *    quote", which is refusal — correct, but the error is logged so an outage
 *    is diagnosable rather than looking like a wave of invalid quote ids.
 */
import { createClient, type RedisClientType } from 'redis';
import { createLogger } from '../logger.js';
import type { QuoteRecord, QuoteStore } from './quoteStore.js';

const logger = createLogger('RedisQuoteStore');

const KEY_PREFIX = 'okiru:parser:quote:';
/** Keep paid/consumed records well past expiry so redemption and audit work. */
const RETENTION_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

function keyFor(quoteId: string): string {
  return `${KEY_PREFIX}${quoteId}`;
}

/** TTL in seconds: to expiry for unpaid quotes, plus a long grace once paid. */
function ttlSecondsFor(record: QuoteRecord): number {
  const base = record.paymentStatus === 'paid' || record.consumedAt
    ? record.expiresAt + RETENTION_GRACE_MS
    : record.expiresAt;
  return Math.max(60, Math.ceil((base - Date.now()) / 1000));
}

export class RedisQuoteStore implements QuoteStore {
  constructor(private readonly client: RedisClientType) {}

  async put(record: QuoteRecord): Promise<void> {
    await this.client.set(keyFor(record.quoteId), JSON.stringify(record), {
      EX: ttlSecondsFor(record),
    });
  }

  async get(quoteId: string): Promise<QuoteRecord | null> {
    const raw = await this.client.get(keyFor(quoteId));
    if (!raw) return null;
    const record = JSON.parse(raw) as QuoteRecord;
    // Mirror the in-memory store's lazy expiry so both behave identically.
    if (record.paymentStatus !== 'paid' && Date.now() > record.expiresAt) {
      record.paymentStatus = 'expired';
    }
    return record;
  }

  /**
   * Read-modify-write under WATCH. If another replica writes the same quote
   * between our read and our write, the transaction aborts and we retry with
   * fresh state rather than clobbering their change.
   */
  async update(quoteId: string, patch: Partial<QuoteRecord>): Promise<QuoteRecord | null> {
    const key = keyFor(quoteId);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      // A dedicated connection: WATCH is per-connection state, so sharing the
      // pooled client would let unrelated commands cancel our watch.
      const tx = this.client.duplicate();
      await tx.connect();
      try {
        await tx.watch(key);
        const raw = await tx.get(key);
        if (!raw) {
          await tx.unwatch();
          return null;
        }

        const next = { ...(JSON.parse(raw) as QuoteRecord), ...patch };
        const result = await tx
          .multi()
          .set(key, JSON.stringify(next), { EX: ttlSecondsFor(next) })
          .exec();

        // A null result means the WATCH tripped — someone else won; retry.
        if (result === null) continue;
        return next;
      } finally {
        await tx.quit().catch(() => undefined);
      }
    }

    throw new Error(`Could not update quote ${quoteId}: contended by other replicas`);
  }
}

/**
 * Build the store from REDIS_URL. Returns null when unconfigured so local dev
 * and tests keep the in-memory store without ceremony — production wiring
 * decides whether that is acceptable (see server.ts).
 */
export async function createRedisQuoteStore(url = process.env.REDIS_URL): Promise<RedisQuoteStore | null> {
  if (!url) return null;

  const client: RedisClientType = createClient({ url });
  // Without a listener, a connection error is an unhandled 'error' event and
  // takes the process down.
  client.on('error', (err) => logger.error('Redis client error', err as Error));
  await client.connect();
  logger.info('Quote store backed by Redis');
  return new RedisQuoteStore(client);
}
