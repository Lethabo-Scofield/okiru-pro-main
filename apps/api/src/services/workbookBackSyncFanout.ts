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

function postInternal(payload: Record<string, any>): void {
  const token = process.env.INTERNAL_BACKSYNC_TOKEN;
  if (!token) {
    // No token configured — back-sync is disabled. Don't spam logs in that
    // mode; just no-op. Operators see this as a one-time INFO at boot.
    return;
  }
  const url = `${WEB_BASE}/api/internal/workbook-backsync`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-token': token,
    },
    body: JSON.stringify(payload),
    signal: controller.signal,
  })
    .then((res) => {
      if (!res.ok) {
        logger.warn('back-sync fan-out non-2xx', { status: res.status, kind: payload.kind, companyId: payload.companyId });
      }
    })
    .catch((err) => {
      if (err?.name === 'AbortError') {
        logger.warn('back-sync fan-out timed out', { kind: payload.kind, companyId: payload.companyId, ms: TIMEOUT_MS });
      } else {
        logger.warn('back-sync fan-out failed', { kind: payload.kind, companyId: payload.companyId, error: err?.message });
      }
    })
    .finally(() => clearTimeout(timer));
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
