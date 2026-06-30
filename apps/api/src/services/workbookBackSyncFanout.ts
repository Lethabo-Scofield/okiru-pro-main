/**
 * workbookBackSyncFanout.ts (apps/api)
 *
 * Fire-and-forget HTTP POST to the apps/web back-sync endpoint
 * (POST /api/internal/workbook-backsync) after a successful per-entity write.
 * Token-protected via INTERNAL_BACKSYNC_TOKEN env var (shared with apps/web).
 *
 * Intentionally non-blocking: a 2s timeout, errors are logged but never
 * propagate to the caller — Toolkit UX stays snappy even if apps/web is slow
 * or down. A retry queue (sync plan Phase 6) is deferred.
 */
import { createLogger } from '../../src/logger.js';
import { WorkbookBackSyncOutboxModel } from '../../models.js';

const logger = createLogger('WorkbookBackSyncFanout');

type EntityType =
  | 'shareholder'
  | 'employee'
  | 'trainingProgram'
  | 'supplier'
  | 'esdContribution'
  | 'sedContribution';

const WEB_BASE = process.env.WEB_INTERNAL_URL || 'http://web:5000';
const TIMEOUT_MS = 2000;

/** Single network attempt. Returns { ok, reason } so caller can decide whether
 * to enqueue a retry. ok=true means apps/web acknowledged (2xx); anything else
 * is retryable. */
async function attemptPost(payload: Record<string, any>): Promise<{ ok: boolean; reason?: string }> {
  const token = process.env.INTERNAL_BACKSYNC_TOKEN;
  if (!token) return { ok: false, reason: 'no-token' };
  const url = `${WEB_BASE}/api/internal/workbook-backsync`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-token': token },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (res.ok) return { ok: true };
    return { ok: false, reason: `http-${res.status}` };
  } catch (err: any) {
    if (err?.name === 'AbortError') return { ok: false, reason: 'timeout' };
    return { ok: false, reason: `network: ${err?.message}` };
  } finally {
    clearTimeout(timer);
  }
}

/** Exponential backoff: 1m, 5m, 25m, 2h, 10h, then capped at 24h. */
function nextDelayMs(attempts: number): number {
  const step = Math.min(attempts, 5);
  const minutes = Math.pow(5, step); // 1, 5, 25, 125, 625, 3125
  return Math.min(minutes, 1440) * 60_000;
}

const MAX_ATTEMPTS = 8; // ~24h cumulative

async function enqueueRetry(payload: Record<string, any>, reason: string): Promise<void> {
  try {
    await WorkbookBackSyncOutboxModel.create({
      companyId: String(payload.companyId ?? ''),
      kind: String(payload.kind ?? 'entity'),
      payload,
      attempts: 1,
      nextAttemptAt: new Date(Date.now() + nextDelayMs(1)),
      lastError: reason,
    });
  } catch (err: any) {
    logger.error('failed to enqueue back-sync retry', err, { kind: payload.kind, companyId: payload.companyId, reason });
  }
}

function postInternal(payload: Record<string, any>): void {
  // Skip silently when token isn't set — operators see one-time boot log and
  // the outbox stays empty (intentional: avoid swamping Mongo when feature off).
  if (!process.env.INTERNAL_BACKSYNC_TOKEN) return;
  attemptPost(payload)
    .then((result) => {
      if (!result.ok) {
        logger.warn('back-sync fan-out failed; enqueueing', { kind: payload.kind, companyId: payload.companyId, reason: result.reason });
        return enqueueRetry(payload, result.reason ?? 'unknown');
      }
    })
    .catch((err) => {
      logger.error('back-sync postInternal threw', err, { kind: payload.kind, companyId: payload.companyId });
    });
}

/** Drainer worker — call at boot. Periodically scans the outbox for entries
 * whose nextAttemptAt has passed, retries each, removes on success or pushes
 * the next backoff window on failure. Gives up after MAX_ATTEMPTS (~24h). */
let drainerStarted = false;
const DRAIN_INTERVAL_MS = 60_000;
const DRAIN_BATCH_SIZE = 20;

export function startBackSyncDrainer(): void {
  if (drainerStarted) return;
  drainerStarted = true;
  setInterval(() => { drainOnce().catch((err) => logger.error('drainer iteration failed', err)); }, DRAIN_INTERVAL_MS).unref();
  logger.info('workbook back-sync drainer started', { intervalMs: DRAIN_INTERVAL_MS, batchSize: DRAIN_BATCH_SIZE, maxAttempts: MAX_ATTEMPTS });
}

async function drainOnce(): Promise<void> {
  if (!process.env.INTERNAL_BACKSYNC_TOKEN) return; // feature off
  const due = await WorkbookBackSyncOutboxModel
    .find({ nextAttemptAt: { $lte: new Date() } })
    .sort({ nextAttemptAt: 1 })
    .limit(DRAIN_BATCH_SIZE)
    .lean();
  if (!due.length) return;

  for (const entry of due) {
    const e = entry as any;
    const result = await attemptPost(e.payload);
    if (result.ok) {
      await WorkbookBackSyncOutboxModel.deleteOne({ _id: e._id });
      logger.info('outbox entry drained', { id: e.id, companyId: e.companyId, kind: e.kind, attempts: e.attempts });
      continue;
    }
    const nextAttempts = (e.attempts ?? 1) + 1;
    if (nextAttempts > MAX_ATTEMPTS) {
      // Give up — keep the entry but push nextAttemptAt far out so the drainer
      // ignores it. Operators see it via /api/admin/workbook-backsync/health.
      await WorkbookBackSyncOutboxModel.updateOne(
        { _id: e._id },
        { $set: { attempts: nextAttempts, nextAttemptAt: new Date(Date.now() + 365 * 24 * 60 * 60_000), lastError: `gave-up: ${result.reason}` } },
      );
      logger.error('outbox entry exceeded max attempts', undefined, { id: e.id, companyId: e.companyId, attempts: nextAttempts });
    } else {
      await WorkbookBackSyncOutboxModel.updateOne(
        { _id: e._id },
        { $set: { attempts: nextAttempts, nextAttemptAt: new Date(Date.now() + nextDelayMs(nextAttempts)), lastError: result.reason ?? null } },
      );
    }
  }
}

/** Admin observability — outbox depth + recent failure counts. Mounted by
 * the admin router. */
export async function getOutboxHealth(): Promise<{ depth: number; gaveUp: number; oldest: Date | null; sample: any[] }> {
  const [depth, gaveUp, oldest, sample] = await Promise.all([
    WorkbookBackSyncOutboxModel.countDocuments({}),
    WorkbookBackSyncOutboxModel.countDocuments({ attempts: { $gt: MAX_ATTEMPTS } }),
    WorkbookBackSyncOutboxModel.findOne({}).sort({ createdAt: 1 }).select({ createdAt: 1 }).lean() as any,
    WorkbookBackSyncOutboxModel.find({}).sort({ createdAt: -1 }).limit(5).lean() as any,
  ]);
  return {
    depth,
    gaveUp,
    oldest: oldest?.createdAt ?? null,
    sample: (sample ?? []).map((s: any) => ({
      companyId: s.companyId,
      kind: s.kind,
      attempts: s.attempts,
      lastError: s.lastError,
      nextAttemptAt: s.nextAttemptAt,
    })),
  };
}

export function fanOutBackSync(args: {
  companyId: string;
  entityType: EntityType;
  entity: any;
  op: 'upsert' | 'delete';
}): void {
  postInternal({ kind: 'entity', ...args });
}

/** Phase 2: client-scalar/meta back-sync. Fire from PATCH /api/clients/:id
 * with the request body — the apps/web receiver maps known client fields to
 * the matching workbook section.meta blobs (company-information, financial-
 * information, skills-development, sed, afs-additions, esd). Unknown fields
 * are ignored; partial patches are fine. */
export function fanOutClientMetaBackSync(args: {
  companyId: string;
  patch: Record<string, any>;
}): void {
  if (!args.patch || Object.keys(args.patch).length === 0) return;
  postInternal({ kind: 'clientMeta', ...args });
}
