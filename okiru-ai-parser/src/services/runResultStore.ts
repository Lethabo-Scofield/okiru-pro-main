/**
 * Where a paid read's RESULT waits when nobody was there to receive it.
 *
 * A paid stream run consumes its quote before it starts, and until now the
 * result existed only as the stream's final `result` event. A dropped
 * connection — the network blinking, a phone changing towers — left the run
 * reading on server-side, finishing, and handing its result to a socket that
 * was already gone. The browser's retry then met "already processed" (the
 * quote is spent, correctly) and had no way to the result it had paid for.
 *
 * Each paid run now records its status here (running → done | failed) and,
 * once done, the very payload the stream's final event delivers — signed run
 * records included — so the web server can hand it to the organisation that
 * paid, server to server (GET /api/parser/quotes/:id/result).
 *
 * Kept APART from the quote record on purpose: the quote record is rewritten
 * under WATCH on every payment step, and dragging a multi-megabyte result
 * through each of those compare-and-sets would slow the money path for a
 * convenience. A separate key costs one write per run.
 */
import { createLogger } from '../logger.js';
import type { RedisClientType } from 'redis';

const logger = createLogger('RunResultStore');

export type PaidRunStatus = 'running' | 'done' | 'failed';

export interface PaidRunRecord {
  quoteId: string;
  domain: 'bbbee' | 'esg';
  status: PaidRunStatus;
  startedAt: number;
  finishedAt: number | null;
  /** The stream's final `result` event, verbatim. Null while running, after a failure, or over the cap. */
  result: unknown | null;
  /** Size of the result as stored (or as refused), in bytes of JSON. */
  resultBytes?: number;
  /** Why no result is held for a finished run: the failure, or that it was too large to keep. */
  reason?: string;
}

/** How long a run's status and result are kept: the signed run records inside it live as long. */
export const RUN_RESULT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * The largest result kept, in bytes of JSON. A real evidence pack's result is
 * tens to hundreds of kilobytes; this is a guard against a runaway payload
 * eating the shared Redis, not a working limit. Over it, only the status is
 * kept and the client is told the result could not be held.
 */
export const DEFAULT_RUN_RESULT_MAX_BYTES = 8 * 1024 * 1024;

export function runResultMaxBytes(env: NodeJS.ProcessEnv = process.env): number {
  const configured = Number(env.PARSER_RUN_RESULT_MAX_BYTES);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : DEFAULT_RUN_RESULT_MAX_BYTES;
}

/**
 * How long a run may say "running" before it is taken to have died (a pod
 * restart, an out-of-memory kill) — matched to the wallet's own
 * RUN_PRESUMED_DEAD_AFTER_MS, so the screen and the refund agree on when a run
 * is over.
 */
export const DEFAULT_RUN_MAX_MS = 2 * 60 * 60 * 1000;

export function runMaxMs(env: NodeJS.ProcessEnv = process.env): number {
  const configured = Number(env.PARSER_RUN_MAX_MS);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : DEFAULT_RUN_MAX_MS;
}

export interface RunResultStore {
  put(record: PaidRunRecord, ttlMs: number): Promise<void>;
  get(quoteId: string): Promise<PaidRunRecord | null>;
}

class InMemoryRunResultStore implements RunResultStore {
  private readonly records = new Map<string, { record: PaidRunRecord; expiresAt: number }>();

  async put(record: PaidRunRecord, ttlMs: number): Promise<void> {
    const now = Date.now();
    for (const [id, entry] of this.records) if (entry.expiresAt <= now) this.records.delete(id);
    this.records.set(record.quoteId, { record: structuredClone(record), expiresAt: now + ttlMs });
  }

  async get(quoteId: string): Promise<PaidRunRecord | null> {
    const entry = this.records.get(quoteId);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.records.delete(quoteId);
      return null;
    }
    return structuredClone(entry.record);
  }
}

const KEY_PREFIX = 'okiru:parser:run:';

/** Redis-backed, so a result written by one replica is served by the other. */
export class RedisRunResultStore implements RunResultStore {
  constructor(private readonly client: Pick<RedisClientType, 'get' | 'set'>) {}

  async put(record: PaidRunRecord, ttlMs: number): Promise<void> {
    await this.client.set(`${KEY_PREFIX}${record.quoteId}`, JSON.stringify(record), {
      EX: Math.max(60, Math.ceil(ttlMs / 1000)),
    });
  }

  async get(quoteId: string): Promise<PaidRunRecord | null> {
    const raw = await this.client.get(`${KEY_PREFIX}${quoteId}`);
    return raw ? (JSON.parse(String(raw)) as PaidRunRecord) : null;
  }
}

let store: RunResultStore = new InMemoryRunResultStore();

export function setRunResultStore(next: RunResultStore): void {
  store = next;
}

export function getRunResultStore(): RunResultStore {
  return store;
}

/** A fresh process-local store — for tests that must not see another test's runs. */
export function inMemoryRunResultStore(): RunResultStore {
  return new InMemoryRunResultStore();
}

/**
 * One paid run's record, written as it goes. Never throws: losing the record
 * must not cost the user the stream they are still watching.
 */
export interface PaidRunRecorder {
  readonly quoteId: string;
  /** Write "running". Awaited before the work starts, so a reconnecting client finds it at once. */
  start(): Promise<void>;
  /**
   * The run finished: keep exactly what the stream delivers. Resolves whether
   * the result itself was kept (false when over the cap or the write failed).
   */
  done(result: unknown): Promise<boolean>;
  failed(reason: string): Promise<void>;
}

export function paidRunRecorder(
  quoteId: string,
  domain: PaidRunRecord['domain'],
  options: { maxBytes?: number; ttlMs?: number; now?: () => number } = {},
): PaidRunRecorder {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? RUN_RESULT_TTL_MS;
  const startedAt = now();
  const write = async (record: PaidRunRecord): Promise<boolean> => {
    try {
      await getRunResultStore().put(record, ttlMs);
      return true;
    } catch (err) {
      logger.error('Could not record a paid run', err as Error, { quoteId, status: record.status });
      return false;
    }
  };
  const base = { quoteId, domain, startedAt };
  return {
    quoteId,
    async start() {
      await write({ ...base, status: 'running', finishedAt: null, result: null });
    },
    async done(result) {
      let serialised: string;
      try {
        serialised = JSON.stringify(result) ?? 'null';
      } catch (err) {
        await write({ ...base, status: 'done', finishedAt: now(), result: null, reason: `The result could not be kept: ${(err as Error).message}` });
        return false;
      }
      const resultBytes = Buffer.byteLength(serialised, 'utf8');
      const maxBytes = options.maxBytes ?? runResultMaxBytes();
      if (resultBytes > maxBytes) {
        logger.warn('Paid run result over the size cap: only its status is kept', { quoteId, resultBytes, maxBytes });
        await write({ ...base, status: 'done', finishedAt: now(), result: null, resultBytes, reason: 'too-large' });
        return false;
      }
      return write({ ...base, status: 'done', finishedAt: now(), result, resultBytes });
    },
    async failed(reason) {
      await write({ ...base, status: 'failed', finishedAt: now(), result: null, reason });
    },
  };
}
