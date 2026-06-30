/**
 * workbookBackSync.ts — Toolkit→Workbook section back-sync.
 *
 * When the Toolkit mutates a per-entity record (employee, supplier, etc.) via
 * apps/api per-entity routes, those routes fire a non-blocking HTTP call to
 * apps/web POST /api/internal/workbook-backsync. That endpoint delegates here:
 * we load the corresponding WorkbookModel by companyId, locate the matching
 * row in sections[<key>].rows (by workbookRowId, falling back to composite
 * key), upsert/delete it, and persist the section.
 *
 * If no workbook exists for this companyId we skip silently — single-tenant
 * "Toolkit-only" clients don't need a workbook view.
 *
 * Phase 1 of the sync plan: closes the "I edited X on Toolkit, workbook still
 * shows old data" gap for the 6 highest-traffic entity types.
 */
import { WorkbookModel } from '../shared/schema';
import {
  entityToWorkbookRow,
  compositeKey,
  ENTITY_TYPE_TO_SECTION,
  type WorkbookEntityType,
} from './workbookEntityCodec';
import { createLogger } from './logger';

const logger = createLogger('WorkbookBackSync');

export type BackSyncOp = 'upsert' | 'delete';

interface BackSyncArgs {
  companyId: string;
  entityType: WorkbookEntityType;
  entity: any;
  op: BackSyncOp;
}

/** In-process trailing-edge debounce per (companyId, sectionKey). Coalesces
 * burst writes (e.g. bulk employee import → N entity routes → N back-sync
 * calls) into a single section rebuild. */
const pendingFlush = new Map<string, NodeJS.Timeout>();
const pendingWork = new Map<string, BackSyncArgs[]>();
const DEBOUNCE_MS = 200;

export function backSyncEntityToWorkbook(args: BackSyncArgs): void {
  const key = `${args.companyId}::${ENTITY_TYPE_TO_SECTION[args.entityType]}`;
  const list = pendingWork.get(key) ?? [];
  list.push(args);
  pendingWork.set(key, list);

  if (pendingFlush.has(key)) clearTimeout(pendingFlush.get(key)!);
  const timer = setTimeout(() => {
    pendingFlush.delete(key);
    const batch = pendingWork.get(key) ?? [];
    pendingWork.delete(key);
    flushBatch(key, batch).catch((err) => {
      logger.warn('back-sync batch failed', { key, error: err instanceof Error ? err.message : String(err) });
    });
  }, DEBOUNCE_MS);
  pendingFlush.set(key, timer);
}

async function flushBatch(key: string, batch: BackSyncArgs[]): Promise<void> {
  if (batch.length === 0) return;
  const { companyId, entityType } = batch[0];
  const sectionKey = ENTITY_TYPE_TO_SECTION[entityType];

  const doc = await WorkbookModel.findOne({ companyId }).lean();
  if (!doc) {
    // No workbook for this client — Toolkit-only; nothing to back-sync.
    logger.debug('no workbook for companyId — skipping', { companyId, entityType });
    return;
  }

  const sections = (doc as any).sections ?? {};
  const section = sections[sectionKey] ?? { rows: [] };
  let rows: any[] = Array.isArray(section.rows) ? [...section.rows] : [];

  for (const item of batch) {
    const targetRow = entityToWorkbookRow(item.entityType, item.entity);
    const rowId = item.entity?.workbookRowId || targetRow._id;
    targetRow._id = rowId;

    // Match by rowId first, then by composite key
    let idx = rows.findIndex((r) => r && r._id === rowId);
    if (idx === -1) {
      const ck = compositeKey(item.entityType, targetRow);
      if (ck) {
        idx = rows.findIndex((r) => r && compositeKey(item.entityType, r) === ck);
      }
    }

    if (item.op === 'delete') {
      if (idx >= 0) rows.splice(idx, 1);
    } else {
      // upsert
      if (idx >= 0) {
        // Preserve workbook-only fields by spreading existing row first.
        rows[idx] = { ...rows[idx], ...targetRow };
      } else {
        rows.push(targetRow);
      }
    }
  }

  await WorkbookModel.findOneAndUpdate(
    { companyId },
    { $set: { [`sections.${sectionKey}`]: { ...section, rows }, updatedAt: new Date() } },
    { new: false },
  );
  logger.info('back-sync section flushed', { companyId, sectionKey, batchSize: batch.length, rowCount: rows.length });
}

/** Token-protected handler factory. Caller mounts as:
 *   app.post('/api/internal/workbook-backsync', handleBackSync(token));
 */
export function handleBackSync(sharedToken: string | undefined) {
  return async (req: any, res: any) => {
    const tokenHeader = req.headers['x-internal-token'];
    if (!sharedToken || tokenHeader !== sharedToken) {
      return res.status(401).json({ message: 'bad token' });
    }
    const { companyId, entityType, entity, op } = req.body ?? {};
    if (!companyId || !entityType || !op || !ENTITY_TYPE_TO_SECTION[entityType as WorkbookEntityType]) {
      return res.status(400).json({ message: 'bad payload' });
    }
    backSyncEntityToWorkbook({
      companyId: String(companyId),
      entityType: entityType as WorkbookEntityType,
      entity: entity ?? {},
      op: op === 'delete' ? 'delete' : 'upsert',
    });
    return res.json({ ok: true });
  };
}
