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
import mongoose from 'mongoose';
import { WorkbookModel } from '../shared/schema';
import {
  entityToWorkbookRow,
  compositeKey,
  ENTITY_TYPE_TO_SECTION,
  clientPatchToWorkbookMeta,
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

// ---------------------------------------------------------------------------
// Phase 2: Client-scalar/meta back-sync
//
// Toolkit PATCH /api/clients/:id fires this with the request body. We map
// each known client field to its target section.meta blob, then merge into
// the workbook (preserving any meta keys the workbook owns that the client
// doesn't know about — workbook-only fields stay untouched).
// ---------------------------------------------------------------------------

interface MetaSyncArgs {
  companyId: string;
  patch: Record<string, any>;
}

const pendingMeta = new Map<string, Timeout>();
type Timeout = ReturnType<typeof setTimeout>;
const pendingMetaWork = new Map<string, Record<string, any>>();

export function backSyncClientMetaToWorkbook(args: MetaSyncArgs): void {
  const key = `meta::${args.companyId}`;
  const merged = { ...(pendingMetaWork.get(key) ?? {}), ...args.patch };
  pendingMetaWork.set(key, merged);

  if (pendingMeta.has(key)) clearTimeout(pendingMeta.get(key)!);
  const timer = setTimeout(() => {
    pendingMeta.delete(key);
    const work = pendingMetaWork.get(key) ?? {};
    pendingMetaWork.delete(key);
    flushMetaPatch(args.companyId, work).catch((err) => {
      logger.warn('meta back-sync failed', { companyId: args.companyId, error: err instanceof Error ? err.message : String(err) });
    });
  }, DEBOUNCE_MS);
  pendingMeta.set(key, timer);
}

async function flushMetaPatch(companyId: string, patch: Record<string, any>): Promise<void> {
  const targets = clientPatchToWorkbookMeta(patch);
  if (targets.length === 0) return;

  const doc = await WorkbookModel.findOne({ companyId }).lean();
  if (!doc) {
    logger.debug('no workbook for companyId — skipping meta sync', { companyId });
    return;
  }
  const sections = { ...((doc as any).sections ?? {}) };

  const update: Record<string, any> = { updatedAt: new Date() };
  for (const { sectionKey, meta } of targets) {
    const existing = sections[sectionKey] ?? { rows: [] };
    const existingMeta = (existing.meta && typeof existing.meta === 'object') ? existing.meta : {};
    // Merge: workbook-only meta keys preserved, Toolkit values win on overlap.
    const mergedMeta = { ...existingMeta, ...meta };
    update[`sections.${sectionKey}.meta`] = mergedMeta;
    // If the section didn't exist, also seed rows so the editor renders it.
    if (!sections[sectionKey]) update[`sections.${sectionKey}.rows`] = [];
  }

  await WorkbookModel.findOneAndUpdate({ companyId }, { $set: update }, { new: false });
  logger.info('meta back-sync flushed', { companyId, sections: targets.map((t) => t.sectionKey) });
}

// ---------------------------------------------------------------------------
// Phase 5: Read-time workbook section rebuild
//
// When the workbook editor loads (GET /api/workbook/:companyId), rebuild
// section.rows from the live per-entity Mongo collections (shareholders,
// employees, trainingPrograms, suppliers, esdContributions, sedContributions).
// This makes the workbook a true derived view of the Toolkit state — even if
// a back-sync fan-out was dropped (apps/web temporarily unreachable), the
// workbook self-heals on next open.
//
// Merge policy per row:
//   - Match existing workbook row by _id (== workbookRowId on the entity).
//   - Toolkit fields win for every column the codec knows about.
//   - Workbook-only fields (construction template columns, audit metadata,
//     etc.) are PRESERVED untouched.
//   - Workbook rows that have no matching entity (rare: row imported but
//     /sync hasn't run yet) are kept as-is.
// ---------------------------------------------------------------------------

const ENTITY_COLLECTION_NAME: Record<WorkbookEntityType, string> = {
  shareholder: 'shareholders',
  employee: 'employees',
  trainingProgram: 'trainingPrograms',
  supplier: 'suppliers',
  esdContribution: 'esdContributions',
  sedContribution: 'sedContributions',
};

const ENTITY_TYPES: WorkbookEntityType[] = [
  'shareholder', 'employee', 'trainingProgram', 'supplier', 'esdContribution', 'sedContribution',
];

/** Mutates `wb.sections` in place: replaces rows in each derivable section
 *  with a fresh codec-of-live-entities pass, preserving workbook-only fields.
 *  Returns the same wb for chaining. Safe to call when Mongo is unavailable —
 *  in that case we leave the workbook untouched. */
export async function rebuildWorkbookFromEntities(wb: any): Promise<any> {
  if (!mongoose.connection?.db) return wb;
  if (!wb || !wb.companyId) return wb;
  const sections = { ...((wb.sections && typeof wb.sections === 'object') ? wb.sections : {}) };

  for (const entityType of ENTITY_TYPES) {
    const sectionKey = ENTITY_TYPE_TO_SECTION[entityType];
    const collName = ENTITY_COLLECTION_NAME[entityType];
    try {
      const docs = await mongoose.connection.db.collection(collName)
        .find({ clientId: wb.companyId })
        .toArray();
      const existingSection = sections[sectionKey] ?? { rows: [] };
      const existingRows: any[] = Array.isArray(existingSection.rows) ? existingSection.rows : [];

      // Index existing rows by _id and composite key for the merge.
      const byId = new Map<string, any>();
      const byCompositeKey = new Map<string, any>();
      for (const r of existingRows) {
        if (r && r._id) byId.set(String(r._id), r);
        const ck = compositeKey(entityType, r);
        if (ck) byCompositeKey.set(ck, r);
      }
      const usedRowIds = new Set<string>();

      const mergedRows: any[] = [];
      for (const ent of docs) {
        const codecRow = entityToWorkbookRow(entityType, ent);
        const rowId = (ent as any).workbookRowId || codecRow._id;
        codecRow._id = rowId;

        // Find existing row by id, then composite key
        let prior = byId.get(String(rowId));
        if (!prior) {
          const ck = compositeKey(entityType, codecRow);
          if (ck) prior = byCompositeKey.get(ck);
        }
        if (prior && prior._id) usedRowIds.add(String(prior._id));

        // Merge: workbook-only fields from prior + Toolkit values from codec
        mergedRows.push(prior ? { ...prior, ...codecRow, _id: rowId } : codecRow);
      }

      // Keep any workbook rows that didn't match a live entity (they may be
      // newly typed in the workbook editor and not yet /submit'd).
      for (const r of existingRows) {
        if (r && r._id && !usedRowIds.has(String(r._id))) {
          mergedRows.push(r);
        }
      }

      sections[sectionKey] = { ...existingSection, rows: mergedRows };
    } catch (err) {
      logger.warn('workbook rebuild section failed', { sectionKey, error: err instanceof Error ? err.message : String(err) });
      // leave section untouched on error
    }
  }

  wb.sections = sections;
  return wb;
}

/** Token-protected handler factory. Caller mounts as:
 *   app.post('/api/internal/workbook-backsync', handleBackSync(token));
 *
 * Supports two payload shapes:
 *   - { kind: 'entity', companyId, entityType, entity, op } — Phase 1
 *   - { kind: 'clientMeta', companyId, patch }              — Phase 2
 * Legacy payload (no `kind` field) is treated as 'entity' for backward
 * compatibility with apps/api callers shipped before the union landed.
 */
export function handleBackSync(sharedToken: string | undefined) {
  return async (req: any, res: any) => {
    const tokenHeader = req.headers['x-internal-token'];
    if (!sharedToken || tokenHeader !== sharedToken) {
      return res.status(401).json({ message: 'bad token' });
    }
    const body = req.body ?? {};
    const kind = body.kind ?? 'entity';

    if (kind === 'clientMeta') {
      if (!body.companyId || !body.patch || typeof body.patch !== 'object') {
        return res.status(400).json({ message: 'bad payload' });
      }
      backSyncClientMetaToWorkbook({
        companyId: String(body.companyId),
        patch: body.patch,
      });
      return res.json({ ok: true });
    }

    // entity (default)
    const { companyId, entityType, entity, op } = body;
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
