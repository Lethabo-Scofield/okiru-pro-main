/**
 * The Studio workflow: drafts -> authoritative impact -> independent approval -> step-up ->
 * signed off-site snapshot -> signed immutable version. Plus freeze, restore and emergency
 * rollback. Everything here runs on the server; nothing the browser reports is trusted.
 *
 * Non-negotiable: nothing in this file changes live rules except publishVersion /
 * emergencyRollback in rulesService, and those are reached only through the guarded paths below.
 */
import { randomUUID } from 'crypto';
import { getRules, findRule } from '../../../../web/Toolkit/src/lib/rules/registry';
import { SCORECARD_SOURCES, isScorecardId, type ScorecardId } from '../../../../web/Toolkit/src/lib/rules/scorecards';
import { getAtPath } from '../../../../web/Toolkit/src/lib/rules/paths';
import type { RuleOverrides } from '../../../../web/Toolkit/src/lib/rules/types';
import { canonicalJson, sha256, type RulesVersionRecord } from '../ledger.js';
import {
  publishVersion, emergencyRollback, freeze, unfreeze, loadVerifiedHistory, resolvePublished, activeVersionAt,
  RulesFrozenError, RulesIncompatibleError, PublishRejectedError, type ServiceDeps,
} from '../rulesService.js';
import { currentFreeze, VersionConflictError, type FreezeEvent } from '../store.js';
import { appendAudit } from './audit.js';
import { authorize, ForbiddenError, type StudioAction } from './permissions.js';
import { reviewDraft, type ReviewResult } from './impactReview.js';
import { notify, type NotifyConfig, type NotificationType, type Severity } from './notify.js';
import { SnapshotFailedError, takeSnapshot, type OffsiteStore, type SnapshotDeps } from './snapshots.js';
import { bindingHashOf, consumeStepUp } from './stepUp.js';
import type { Doc, StudioStore } from './studioStore.js';

/* ------------------------------------------------------------------ context and errors */

export interface StudioCtx {
  studio: StudioStore;
  rules: ServiceDeps;
  offsite: OffsiteStore | null;
  notifyCfg: NotifyConfig;
  env: NodeJS.ProcessEnv;
  now: () => Date;
  /** Independent approvals required before publishing (owner decision; default 1). */
  requiredApprovals: number;
}

export class StudioError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number, public readonly details?: unknown) {
    super(message);
    this.name = 'StudioError';
  }
}

const notFound = (what: string) => new StudioError('not_found', `${what} not found`, 404);
const badState = (msg: string) => new StudioError('invalid_state', msg, 409);

/* ------------------------------------------------------------------ records */

export type ChangesetStatus = 'draft' | 'changes_requested' | 'submitted' | 'approved' | 'published' | 'rejected' | 'withdrawn';

export interface ChangeItem {
  id: string;
  ruleKey: string;
  layer: 'source' | 'calculator';
  path: string;
  value: number;
  justification: string;
  source: 'manual' | 'ai' | 'restore';
  addedBy: string;
  addedAt: string;
}

export interface Changeset extends Doc {
  scorecardId: ScorecardId;
  title: string;
  description: string;
  /** 'restore' drafts re-instate an older version and are published as kind=restore. */
  kind: 'change' | 'restore';
  status: ChangesetStatus;
  createdBy: string;
  createdAt: string;
  /** Creator, every contributor and every user who accepted an AI proposal. Authors can never approve or publish. */
  authors: string[];
  baseVersion: number;
  baseOverrides: RuleOverrides;
  items: ChangeItem[];
  effectiveFrom: string | null;
  announcement: string | null;
  restoredFromVersion: number | null;
  publishedVersion: number | null;
  submittedAt: string | null;
}

export interface Approval extends Doc {
  changesetId: string;
  approver: string;
  decision: 'approve' | 'reject' | 'request_changes';
  draftHash: string;
  comment: string;
  createdAt: string;
}

export interface ImpactRunDoc extends Doc {
  changesetId: string;
  scorecardId: ScorecardId;
  draftHash: string;
  baseVersion: number;
  status: 'complete' | 'failed';
  error: string | null;
  review: ReviewResult | null;
  acknowledgements: Record<string, { justification: string; by: string; at: string }>;
  createdBy: string;
  createdAt: string;
  durationMs: number;
}

/* ------------------------------------------------------------------ small helpers */

export function proposedOverridesOf(cs: Pick<Changeset, 'baseOverrides' | 'items'>): RuleOverrides {
  const out: RuleOverrides = { source: { ...cs.baseOverrides.source }, calculator: { ...cs.baseOverrides.calculator } };
  for (const it of cs.items) out[it.layer][it.path] = it.value;
  return out;
}

export function draftHashOf(cs: Pick<Changeset, 'scorecardId' | 'baseVersion' | 'baseOverrides' | 'items' | 'restoredFromVersion'>): string {
  const p = proposedOverridesOf(cs);
  return sha256(canonicalJson({ scorecardId: cs.scorecardId, baseVersion: cs.baseVersion, source: p.source, calculator: p.calculator, restoredFromVersion: cs.restoredFromVersion ?? null }));
}

async function audit(ctx: StudioCtx, actor: string, action: string, target: string | null, details: Record<string, unknown> = {}) {
  return appendAudit(ctx.studio, ctx.rules.signer, { actor, action, target, details, now: ctx.now() });
}

async function tell(ctx: StudioCtx, type: NotificationType, severity: Severity, message: string, entity: string | null, audience: string[] = [], dueAt: string | null = null) {
  try {
    await notify(ctx.studio, ctx.notifyCfg, ctx.now(), { type, severity, message, entity, audience, dueAt });
  } catch {
    // Notification failure must never undo or block the operation it reports on.
  }
}

async function getChangeset(ctx: StudioCtx, cid: string): Promise<Changeset> {
  const cs = await ctx.studio.collection<Changeset>('ruleChangesets').get(cid);
  if (!cs) throw notFound('Draft');
  return cs;
}

const EDITABLE: ChangesetStatus[] = ['draft', 'changes_requested'];
/** Editing a submitted/approved draft is allowed; it returns to 'draft' and every prior approval stops applying (new hash). */
const EDITABLE_RESETTING: ChangesetStatus[] = [...EDITABLE, 'submitted', 'approved'];

async function save(ctx: StudioCtx, cs: Changeset, expectedRev = cs.rev): Promise<Changeset> {
  return ctx.studio.collection<Changeset>('ruleChangesets').replace(cs, expectedRev);
}

/* ------------------------------------------------------------------ drafts */

export async function createChangeset(ctx: StudioCtx, userId: string, input: { scorecardId: string; title: string; description?: string }): Promise<Changeset> {
  if (!isScorecardId(input.scorecardId)) throw new StudioError('unknown_scorecard', 'Unknown scorecard', 404);
  await authorize(ctx.studio, userId, 'draft.write', input.scorecardId, ctx.env);
  if (!input.title || input.title.trim().length < 3 || input.title.length > 160) throw new StudioError('invalid_input', 'A title of 3-160 characters is required', 400);

  const history = await loadVerifiedHistory(input.scorecardId, ctx.rules);
  const head = history[history.length - 1];
  const cs: Changeset = {
    id: randomUUID(), rev: 1, scorecardId: input.scorecardId, title: input.title.trim(), description: (input.description ?? '').slice(0, 4000), kind: 'change',
    status: 'draft', createdBy: userId, createdAt: ctx.now().toISOString(), authors: [userId],
    baseVersion: head?.version ?? 0, baseOverrides: head ? structuredClone(head.overrides) : { source: {}, calculator: {} },
    items: [], effectiveFrom: null, announcement: null, restoredFromVersion: null, publishedVersion: null, submittedAt: null,
  };
  await ctx.studio.collection<Changeset>('ruleChangesets').insert(cs);
  await audit(ctx, userId, 'draft.create', cs.id, { scorecardId: cs.scorecardId, baseVersion: cs.baseVersion });
  return cs;
}

export async function addItem(
  ctx: StudioCtx, userId: string, cid: string,
  input: { ruleKey: string; value: unknown; justification: string; source?: 'manual' | 'ai'; expectedRev?: number },
): Promise<Changeset> {
  const cs = await getChangeset(ctx, cid);
  await authorize(ctx.studio, userId, 'draft.write', cs.scorecardId, ctx.env);
  if (!EDITABLE_RESETTING.includes(cs.status)) throw badState(`A ${cs.status} draft cannot be edited`);

  const rule = getRules(cs.scorecardId).find((r) => r.key === input.ruleKey);
  if (!rule) throw new StudioError('unknown_rule', 'That rule is not editable on this scorecard', 400);
  if (rule.editability === 'developer') throw new StudioError('developer_rule', 'That rule needs a developer change request, not an expert edit', 403);
  if (typeof input.value !== 'number' || !Number.isFinite(input.value)) throw new StudioError('invalid_value', 'The value must be a finite number', 400);
  if (input.value < rule.min || input.value > rule.max) throw new StudioError('out_of_range', `The value must be between ${rule.min} and ${rule.max}`, 400);
  if (!input.justification || input.justification.trim().length < 10) throw new StudioError('justification_required', 'Explain the change in at least 10 characters', 400);

  const item: ChangeItem = {
    id: randomUUID(), ruleKey: rule.key, layer: rule.binding.layer, path: rule.binding.path, value: input.value,
    justification: input.justification.trim().slice(0, 1000), source: input.source ?? 'manual', addedBy: userId, addedAt: ctx.now().toISOString(),
  };
  const next: Changeset = {
    ...cs, status: 'draft', submittedAt: null,
    items: [...cs.items.filter((i) => i.ruleKey !== rule.key), item],
    authors: [...new Set([...cs.authors, userId])],
  };
  const saved = await save(ctx, next, input.expectedRev ?? cs.rev);
  await audit(ctx, userId, 'draft.item.add', cid, { ruleKey: rule.key, source: item.source });
  return saved;
}

export async function removeItem(ctx: StudioCtx, userId: string, cid: string, itemId: string, expectedRev?: number): Promise<Changeset> {
  const cs = await getChangeset(ctx, cid);
  await authorize(ctx.studio, userId, 'draft.write', cs.scorecardId, ctx.env);
  if (!EDITABLE_RESETTING.includes(cs.status)) throw badState(`A ${cs.status} draft cannot be edited`);
  if (!cs.items.some((i) => i.id === itemId)) throw notFound('Item');
  const saved = await save(ctx, { ...cs, status: 'draft', submittedAt: null, items: cs.items.filter((i) => i.id !== itemId), authors: [...new Set([...cs.authors, userId])] }, expectedRev ?? cs.rev);
  await audit(ctx, userId, 'draft.item.remove', cid, { itemId });
  return saved;
}

export async function patchChangeset(ctx: StudioCtx, userId: string, cid: string, patch: { title?: string; description?: string; effectiveFrom?: string | null; announcement?: string | null; expectedRev?: number }): Promise<Changeset> {
  const cs = await getChangeset(ctx, cid);
  await authorize(ctx.studio, userId, 'draft.write', cs.scorecardId, ctx.env);
  if (!EDITABLE.includes(cs.status) && cs.status !== 'approved') throw badState(`A ${cs.status} draft cannot be edited`);
  const next: Changeset = { ...cs, authors: [...new Set([...cs.authors, userId])] };
  if (patch.title !== undefined) next.title = patch.title.trim().slice(0, 160);
  if (patch.description !== undefined) next.description = patch.description.slice(0, 4000);
  if (patch.announcement !== undefined) next.announcement = patch.announcement ? patch.announcement.slice(0, 2000) : null;
  if (patch.effectiveFrom !== undefined) {
    if (patch.effectiveFrom !== null && Number.isNaN(Date.parse(patch.effectiveFrom))) throw new StudioError('invalid_input', 'effectiveFrom is not a valid date', 400);
    next.effectiveFrom = patch.effectiveFrom;
  }
  return save(ctx, next, patch.expectedRev ?? cs.rev);
}

export async function withdrawChangeset(ctx: StudioCtx, userId: string, cid: string): Promise<Changeset> {
  const cs = await getChangeset(ctx, cid);
  await authorize(ctx.studio, userId, 'draft.write', cs.scorecardId, ctx.env);
  if (cs.status === 'published' || cs.status === 'withdrawn') throw badState(`A ${cs.status} draft cannot be withdrawn`);
  const saved = await save(ctx, { ...cs, status: 'withdrawn' });
  await audit(ctx, userId, 'draft.withdraw', cid);
  return saved;
}

/** Re-bases a draft onto the current head. Items are kept; impact and approvals no longer apply (the hash changed). */
export async function rebaseChangeset(ctx: StudioCtx, userId: string, cid: string): Promise<Changeset> {
  const cs = await getChangeset(ctx, cid);
  await authorize(ctx.studio, userId, 'draft.write', cs.scorecardId, ctx.env);
  if (!EDITABLE.includes(cs.status) && cs.status !== 'submitted' && cs.status !== 'approved') throw badState(`A ${cs.status} draft cannot be rebased`);
  const history = await loadVerifiedHistory(cs.scorecardId, ctx.rules);
  const head = history[history.length - 1];
  const saved = await save(ctx, {
    ...cs, status: 'draft', baseVersion: head?.version ?? 0, baseOverrides: head ? structuredClone(head.overrides) : { source: {}, calculator: {} },
    authors: [...new Set([...cs.authors, userId])], submittedAt: null,
  });
  await audit(ctx, userId, 'draft.rebase', cid, { baseVersion: saved.baseVersion });
  return saved;
}

/** Normal restore: a NEW draft holding an older version's rules; it goes through the usual impact + approval + publish. */
export async function createRestoreDraft(ctx: StudioCtx, userId: string, scorecardId: string, toVersion: number | 'shipped', reason: string): Promise<Changeset> {
  if (!isScorecardId(scorecardId)) throw new StudioError('unknown_scorecard', 'Unknown scorecard', 404);
  await authorize(ctx.studio, userId, 'draft.write', scorecardId, ctx.env);
  if (!reason || reason.trim().length < 10) throw new StudioError('justification_required', 'Explain why in at least 10 characters', 400);
  const history = await loadVerifiedHistory(scorecardId, ctx.rules); // verifies the target's integrity
  const target = toVersion === 'shipped' || toVersion === 0 ? null : history.find((r) => r.version === toVersion);
  if (toVersion !== 'shipped' && toVersion !== 0 && !target) throw notFound(`Version ${toVersion}`);
  const head = history[history.length - 1];
  const baseOverrides: RuleOverrides = head ? structuredClone(head.overrides) : { source: {}, calculator: {} };
  const targetOverrides: RuleOverrides = target ? target.overrides : { source: {}, calculator: {} };

  const items: ChangeItem[] = [];
  for (const rule of getRules(scorecardId)) {
    const { layer, path } = rule.binding;
    const shipped = getAtPath(layer === 'source' ? SCORECARD_SOURCES[scorecardId].source : SCORECARD_SOURCES[scorecardId].shipped, path) as number;
    const want = targetOverrides[layer]?.[path] ?? shipped;
    const have = baseOverrides[layer]?.[path] ?? shipped;
    if (want !== have) {
      items.push({ id: randomUUID(), ruleKey: rule.key, layer, path, value: want as number, justification: `Restore ${target ? `version ${target.version}` : 'the shipped rules'}: ${reason.trim()}`.slice(0, 1000), source: 'restore', addedBy: userId, addedAt: ctx.now().toISOString() });
    }
  }
  const cs: Changeset = {
    id: randomUUID(), rev: 1, scorecardId, title: `Restore ${target ? `version ${target.version}` : 'shipped rules'}`, description: reason.trim(), kind: 'restore',
    status: 'draft', createdBy: userId, createdAt: ctx.now().toISOString(), authors: [userId],
    baseVersion: head?.version ?? 0, baseOverrides, items, effectiveFrom: null, announcement: null,
    restoredFromVersion: target?.version ?? null, publishedVersion: null, submittedAt: null,
  };
  await ctx.studio.collection<Changeset>('ruleChangesets').insert(cs);
  await audit(ctx, userId, 'draft.restore', cs.id, { scorecardId, toVersion });
  return cs;
}

/* ------------------------------------------------------------------ authoritative impact */

const MAX_IMPACT_MS = 20_000;
let running = 0;
const MAX_CONCURRENT_IMPACT = 2;

export async function runAuthoritativeImpact(ctx: StudioCtx, userId: string, cid: string): Promise<ImpactRunDoc> {
  const cs = await getChangeset(ctx, cid);
  await authorize(ctx.studio, userId, 'draft.write', cs.scorecardId, ctx.env);
  if (cs.status === 'published' || cs.status === 'withdrawn' || cs.status === 'rejected') throw badState(`A ${cs.status} draft has no impact to run`);
  if (running >= MAX_CONCURRENT_IMPACT) throw new StudioError('busy', 'The impact engine is busy; try again in a moment', 429);

  const started = Date.now();
  const run: ImpactRunDoc = {
    id: randomUUID(), rev: 1, changesetId: cid, scorecardId: cs.scorecardId, draftHash: draftHashOf(cs), baseVersion: cs.baseVersion,
    status: 'complete', error: null, review: null, acknowledgements: {}, createdBy: userId, createdAt: ctx.now().toISOString(), durationMs: 0,
  };
  running++;
  try {
    run.review = reviewDraft(cs.scorecardId, cs.baseOverrides, proposedOverridesOf(cs));
    run.durationMs = Date.now() - started;
    if (run.durationMs > MAX_IMPACT_MS) { run.status = 'failed'; run.error = 'impact run exceeded its time budget'; run.review = null; }
  } catch (e) {
    run.status = 'failed'; run.error = (e as Error).message.slice(0, 300); run.durationMs = Date.now() - started;
  } finally {
    running--;
  }
  await ctx.studio.collection<ImpactRunDoc>('impactRuns').insert(run);
  await audit(ctx, userId, 'impact.run', cid, { runId: run.id, status: run.status, draftHash: run.draftHash });
  return run;
}

async function latestRun(ctx: StudioCtx, cs: Changeset): Promise<ImpactRunDoc | null> {
  const hash = draftHashOf(cs);
  const runs = (await ctx.studio.collection<ImpactRunDoc>('impactRuns').find({ changesetId: cs.id } as never))
    .filter((r) => r.draftHash === hash).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return runs[runs.length - 1] ?? null;
}

export async function acknowledge(ctx: StudioCtx, userId: string, runId: string, ruleKey: string, justification: string): Promise<ImpactRunDoc> {
  const run = await ctx.studio.collection<ImpactRunDoc>('impactRuns').get(runId);
  if (!run) throw notFound('Impact run');
  await authorize(ctx.studio, userId, 'draft.write', run.scorecardId, ctx.env);
  if (!run.review?.requiresAcknowledgement.includes(ruleKey)) throw new StudioError('nothing_to_acknowledge', 'That rule produced no deliberate difference to acknowledge', 400);
  if (!justification || justification.trim().length < 10) throw new StudioError('justification_required', 'Explain why the difference is intended, in at least 10 characters', 400);
  return ctx.studio.collection<ImpactRunDoc>('impactRuns').replace({
    ...run, acknowledgements: { ...run.acknowledgements, [ruleKey]: { justification: justification.trim().slice(0, 1000), by: userId, at: ctx.now().toISOString() } },
  }, run.rev);
}

/* ------------------------------------------------------------------ the 12 publishing checks */

export interface Check { n: number; id: string; ok: boolean; detail: string }

export interface PublishPlan {
  checks: Check[];
  ready: boolean;
  draftHash: string;
  nextVersion: number;
  effectiveFrom: string;
  /** What the step-up is bound to: the exact ISO instant, or `immediate`. */
  bindingEffective: string;
  bindingHash: string;
}

async function evaluateChecks(
  ctx: StudioCtx, cs: Changeset, opts: { publisherId: string | null; effectiveFrom: string | null; announcement: string | null },
): Promise<{ checks: Check[]; nextVersion: number; effectiveFrom: string; bindingEffective: string; draftHash: string }> {
  const checks: Check[] = [];
  const add = (n: number, id: string, ok: boolean, detail = 'ok') => checks.push({ n, id, ok, detail: ok ? 'ok' : detail });
  const draftHash = draftHashOf(cs);

  let history: RulesVersionRecord[] = [];
  let ledgerOk = true;
  try { history = await loadVerifiedHistory(cs.scorecardId, ctx.rules); } catch (e) { ledgerOk = false; add(10, 'build-compatible', false, `the rules ledger failed verification: ${(e as Error).message}`); }
  const head = history[history.length - 1];
  const nextVersion = (head?.version ?? 0) + 1;

  // 1 draft hash current (and based on the version in force)
  const run = await latestRun(ctx, cs);
  add(1, 'draft-hash-current', cs.baseVersion === (head?.version ?? 0) && !!run, cs.baseVersion !== (head?.version ?? 0) ? `the draft is based on version ${cs.baseVersion} but version ${head?.version ?? 0} is now current - rebase and re-run impact` : 'no impact run matches the current draft');
  // 2 authoritative impact complete
  add(2, 'impact-complete', !!run && run.status === 'complete' && !!run.review, run ? (run.error ?? 'impact run did not complete') : 'run the authoritative impact calculation');
  const review = run?.status === 'complete' ? run.review : null;
  // 3 nothing unexplained or missing
  add(3, 'no-unexplained-or-missing', !!review && review.counts.unexplained === 0 && review.counts.missing === 0, review ? `${review.counts.unexplained} unexplained, ${review.counts.missing} missing` : 'no impact result');
  // 4 deliberate differences acknowledged
  const missingAck = review ? review.requiresAcknowledgement.filter((k) => !(run!.acknowledgements[k]?.justification?.length >= 10)) : [];
  add(4, 'deliberate-differences-acknowledged', !!review && missingAck.length === 0, review ? `justification needed for: ${missingAck.join(', ')}` : 'no impact result');
  // 5 invariants
  const failedInv = review ? review.invariants.filter((i) => !i.ok) : [];
  add(5, 'invariants-pass', !!review && failedInv.length === 0, failedInv.map((i) => `${i.id}: ${i.detail}`).join('; ') || 'no impact result');
  // 6 level-1
  add(6, 'level-1-checks', !!review && review.level1.ok, review?.level1.detail ?? 'no impact result');
  // 7 independent approval(s) bound to this draft hash
  const approvals = (await ctx.studio.collection<Approval>('ruleApprovals').find({ changesetId: cs.id } as never)).filter((a) => a.decision === 'approve' && a.draftHash === draftHash && !cs.authors.includes(a.approver));
  const approvers = [...new Set(approvals.map((a) => a.approver))];
  add(7, 'independent-approval', approvers.length >= ctx.requiredApprovals, `${approvers.length} of ${ctx.requiredApprovals} required independent approval(s) for this exact draft`);
  // 8 publisher authorised and not an author
  if (opts.publisherId) {
    let authorised = true;
    try { await authorize(ctx.studio, opts.publisherId, 'publish', cs.scorecardId, ctx.env); } catch { authorised = false; }
    add(8, 'publisher-authorised-not-author', authorised && !cs.authors.includes(opts.publisherId), authorised ? 'the publisher authored this change' : 'the publisher is not an Expert Approver for this scorecard');
  } else {
    add(8, 'publisher-authorised-not-author', true, 'ok');
  }
  // 9 effective date and announcement
  const now = ctx.now();
  const eff = opts.effectiveFrom ? new Date(opts.effectiveFrom) : now;
  const effOk = !Number.isNaN(eff.getTime()) && eff.getTime() >= now.getTime() - 1000 && eff.getTime() <= now.getTime() + 366 * 86_400_000;
  const ann = (opts.announcement ?? '').trim();
  add(9, 'effective-date-and-announcement', effOk && ann.length >= 10 && ann.length <= 2000, !effOk ? 'the effective date must be now or within the next year' : 'an announcement of 10-2000 characters explaining what changed and why is required');
  // 10 build compatibility (registry + ledger verification)
  if (ledgerOk) {
    try { await resolvePublished(cs.scorecardId, ctx.rules); add(10, 'build-compatible', !!ctx.rules.buildId, 'this build has no BUILD_ID'); }
    catch (e) { add(10, 'build-compatible', false, (e as Error).message); }
  }
  // 11 not frozen
  const frozen = !!ctx.rules.envFrozen || !!currentFreeze(await ctx.rules.store.getFreezeEvents(), cs.scorecardId);
  add(11, 'not-frozen', !frozen, 'publishing is frozen for this scorecard');
  // 12 snapshot prerequisites (the snapshot itself is taken - and verified - inside publish)
  const snapOk = !!ctx.offsite && !!ctx.rules.signer;
  add(12, 'signed-snapshot-possible', snapOk, !ctx.offsite ? 'no off-site backup store is configured, so protected publishing is disabled' : 'no signing key is configured');

  checks.sort((a, b) => a.n - b.n);
  // An explicit date is bound exactly; the default ("on publication") is bound as `immediate`, because the instant it
  // takes effect is the moment of publication itself.
  const bindingEffective = opts.effectiveFrom ? (Number.isNaN(eff.getTime()) ? 'invalid' : eff.toISOString()) : 'immediate';
  return { checks, nextVersion, effectiveFrom: eff.toISOString(), bindingEffective, draftHash };
}

/* ------------------------------------------------------------------ submit / decide */

export async function submitChangeset(ctx: StudioCtx, userId: string, cid: string): Promise<Changeset> {
  const cs = await getChangeset(ctx, cid);
  await authorize(ctx.studio, userId, 'draft.submit', cs.scorecardId, ctx.env);
  if (!EDITABLE.includes(cs.status)) throw badState(`A ${cs.status} draft cannot be submitted`);
  if (!cs.items.length) throw new StudioError('empty_draft', 'Add at least one change before submitting', 400);

  const { checks } = await evaluateChecks(ctx, cs, { publisherId: null, effectiveFrom: null, announcement: 'placeholder announcement for submit-time evaluation' });
  // Submission needs checks 1-6 and 10-11; approval (7), publisher (8), date (9) and snapshot (12) come later.
  const required = checks.filter((c) => [1, 2, 3, 4, 5, 6, 10, 11].includes(c.n));
  const failed = required.filter((c) => !c.ok);
  if (failed.length) throw new StudioError('checks_failed', `Cannot submit: ${failed.map((c) => c.id).join(', ')}`, 422, { checks: required });

  const saved = await save(ctx, { ...cs, status: 'submitted', submittedAt: ctx.now().toISOString() });
  await audit(ctx, userId, 'draft.submit', cid, { draftHash: draftHashOf(cs) });
  await tell(ctx, 'draft.submitted', 'info', `Draft "${cs.title}" for ${cs.scorecardId} was submitted for review.`, cid, ['expert_approver']);
  return saved;
}

export async function decideChangeset(ctx: StudioCtx, userId: string, cid: string, decision: Approval['decision'], comment: string): Promise<Changeset> {
  const cs = await getChangeset(ctx, cid);
  await authorize(ctx.studio, userId, 'review.decide', cs.scorecardId, ctx.env);
  if (cs.authors.includes(userId)) throw new ForbiddenError('You contributed to this draft, so you cannot approve or reject it');
  if (cs.status !== 'submitted' && cs.status !== 'approved') throw badState(`A ${cs.status} draft is not awaiting review`);
  if (!['approve', 'reject', 'request_changes'].includes(decision)) throw new StudioError('invalid_input', 'Unknown decision', 400);
  if (decision !== 'approve' && (!comment || comment.trim().length < 5)) throw new StudioError('comment_required', 'Say why, in at least 5 characters', 400);

  const draftHash = draftHashOf(cs);
  // Server re-verifies the review on the SAME hash - an approval can never outlive a change.
  const { checks } = await evaluateChecks(ctx, cs, { publisherId: null, effectiveFrom: null, announcement: 'placeholder announcement for review-time evaluation' });
  if (decision === 'approve') {
    const failed = checks.filter((c) => [1, 2, 3, 4, 5, 6, 10, 11].includes(c.n) && !c.ok);
    if (failed.length) throw new StudioError('checks_failed', `Cannot approve: ${failed.map((c) => c.id).join(', ')}`, 422, { checks });
  }
  await ctx.studio.collection<Approval>('ruleApprovals').insert({
    id: randomUUID(), rev: 1, changesetId: cid, approver: userId, decision, draftHash, comment: (comment ?? '').slice(0, 1000), createdAt: ctx.now().toISOString(),
  });

  let status: ChangesetStatus = cs.status;
  if (decision === 'approve') {
    const approvers = new Set((await ctx.studio.collection<Approval>('ruleApprovals').find({ changesetId: cid } as never))
      .filter((a) => a.decision === 'approve' && a.draftHash === draftHash && !cs.authors.includes(a.approver)).map((a) => a.approver));
    status = approvers.size >= ctx.requiredApprovals ? 'approved' : 'submitted';
  } else {
    status = decision === 'reject' ? 'rejected' : 'changes_requested';
  }
  const saved = await save(ctx, { ...cs, status });
  await audit(ctx, userId, `draft.${decision}`, cid, { draftHash });
  await tell(ctx, decision === 'approve' ? 'draft.approved' : decision === 'reject' ? 'draft.rejected' : 'draft.changes_requested', 'info', `Draft "${cs.title}" was ${decision.replace('_', ' ')}${decision === 'approve' ? 'd' : 'ed'}.`, cid);
  return saved;
}

/* ------------------------------------------------------------------ publish */

export async function preparePublish(ctx: StudioCtx, userId: string, cid: string, input: { effectiveFrom?: string | null; announcement?: string | null }): Promise<PublishPlan> {
  const cs = await getChangeset(ctx, cid);
  await authorize(ctx.studio, userId, 'publish', cs.scorecardId, ctx.env);
  const ev = await evaluateChecks(ctx, cs, { publisherId: userId, effectiveFrom: input.effectiveFrom ?? cs.effectiveFrom, announcement: input.announcement ?? cs.announcement });
  const statusOk = cs.status === 'approved';
  const checks = statusOk ? ev.checks : [...ev.checks, { n: 7, id: 'independent-approval', ok: false, detail: `the draft is ${cs.status}, not approved` }];
  return {
    checks, ready: checks.every((c) => c.ok), draftHash: ev.draftHash, nextVersion: ev.nextVersion, effectiveFrom: ev.effectiveFrom,
    bindingEffective: ev.bindingEffective, bindingHash: bindingHashOf('publish', cid, ev.draftHash, ev.nextVersion, ev.bindingEffective),
  };
}

export async function publishChangeset(
  ctx: StudioCtx, userId: string, cid: string,
  input: { stepUpToken: string; effectiveFrom?: string | null; announcement?: string | null },
): Promise<{ version: RulesVersionRecord; changeset: Changeset }> {
  const cs = await getChangeset(ctx, cid);
  await authorize(ctx.studio, userId, 'publish', cs.scorecardId, ctx.env);
  if (cs.status !== 'approved') throw badState(`A ${cs.status} draft cannot be published`);

  const effectiveFrom = input.effectiveFrom ?? cs.effectiveFrom;
  const announcement = input.announcement ?? cs.announcement;
  const ev = await evaluateChecks(ctx, cs, { publisherId: userId, effectiveFrom, announcement });

  const frozen = ev.checks.find((c) => c.id === 'not-frozen' && !c.ok);
  if (frozen) throw new RulesFrozenError('publishing is frozen for this scorecard');
  const failed = ev.checks.filter((c) => !c.ok);
  if (failed.length && failed.every((c) => c.n === 12)) {
    // Everything else is in order; the only thing missing is the ability to take the required snapshot.
    await tell(ctx, 'backup.failed', 'critical', `Publishing ${cs.scorecardId} is blocked: ${failed[0].detail}.`, cid);
    throw new StudioError('snapshot_failed', 'Protected publishing is unavailable: the required signed off-site snapshot cannot be taken.', 503, { checks: ev.checks });
  }
  if (failed.length) throw new StudioError('checks_failed', `Cannot publish: ${failed.map((c) => c.id).join(', ')}`, 422, { checks: ev.checks });

  // Step-up bound to the exact draft hash, version and effective date. Burned even if a later step fails.
  const bindingHash = bindingHashOf('publish', cid, ev.draftHash, ev.nextVersion, ev.bindingEffective);
  await consumeStepUp(ctx.studio, { userId, token: input.stepUpToken, action: 'publish', bindingHash, now: ctx.now() });

  const snapDeps = snapshotDeps(ctx);
  let version: RulesVersionRecord;
  try {
    version = await publishVersion({
      scorecardId: cs.scorecardId, overrides: proposedOverridesOf(cs), publishedBy: userId, changesetId: cid,
      effectiveFrom: ev.bindingEffective === 'immediate' ? ctx.now() : new Date(ev.effectiveFrom), announcement: announcement!.trim(),
      kind: cs.kind === 'restore' ? 'restore' : 'publish',
      restoredFromVersion: cs.restoredFromVersion,
      authors: cs.authors,
      approvers: [...new Set((await ctx.studio.collection<Approval>('ruleApprovals').find({ changesetId: cid } as never)).filter((a) => a.decision === 'approve' && a.draftHash === ev.draftHash).map((a) => a.approver))],
    }, ctx.rules, async (candidate) => { await takeSnapshot(snapDeps, { kind: 'pre-publish', scorecardId: cs.scorecardId, actor: userId, candidate }); });
  } catch (e) {
    if (e instanceof SnapshotFailedError) {
      await tell(ctx, 'backup.failed', 'critical', `Publishing ${cs.scorecardId} stopped: the signed off-site snapshot failed (${e.stage}).`, cid);
      throw new StudioError('snapshot_failed', 'The required signed off-site snapshot could not be created and verified, so nothing was published.', 503, { stage: e.stage });
    }
    if (e instanceof VersionConflictError) throw new StudioError('stale_publish', 'Another publication landed first. Rebase the draft and review again.', 409);
    throw e;
  }

  const saved = await save(ctx, { ...cs, status: 'published', publishedVersion: version.version });
  await audit(ctx, userId, 'rules.publish', cid, { scorecardId: cs.scorecardId, version: version.version, chainHash: version.chainHash, effectiveFrom: version.effectiveFrom });
  await tell(ctx, 'publication.completed', 'info', `${cs.scorecardId} version ${version.version} was published. ${announcement!.trim().slice(0, 200)}`, cid);
  return { version, changeset: saved };
}

/* ------------------------------------------------------------------ freeze / emergency rollback */

export function snapshotDeps(ctx: StudioCtx): SnapshotDeps {
  return {
    studio: ctx.studio, rules: ctx.rules.store, signer: ctx.rules.signer, verifier: ctx.rules.verifier, offsite: ctx.offsite,
    buildId: ctx.rules.buildId, now: ctx.now,
    alarm: async (e) => { await tell(ctx, 'backup.failed', 'critical', `Snapshot failed at ${e.stage}${e.scorecardId ? ` for ${e.scorecardId}` : ''}.`, e.scorecardId); },
  };
}

export async function freezeScope(ctx: StudioCtx, userId: string, input: { scope: string; reason: string; serveVersion?: number; stepUpToken: string }): Promise<FreezeEvent[]> {
  // '*' needs an unscoped grant; a single scorecard accepts a grant that covers it.
  await authorize(ctx.studio, userId, 'freeze', input.scope === '*' ? undefined : input.scope, ctx.env);
  await consumeStepUp(ctx.studio, { userId, token: input.stepUpToken, action: 'freeze', bindingHash: bindingHashOf('freeze', input.scope, input.serveVersion ?? ''), now: ctx.now() });
  const events = await freeze(ctx.rules, { scope: input.scope, reason: input.reason, actor: userId, serveVersion: input.serveVersion });
  await audit(ctx, userId, 'rules.freeze', input.scope, { reason: input.reason, serveVersion: input.serveVersion ?? null });
  await tell(ctx, 'freeze.performed', 'critical', `Rules frozen for ${input.scope === '*' ? 'all scorecards' : input.scope}: ${input.reason.slice(0, 200)}`, input.scope);
  return events;
}

export async function unfreezeScope(ctx: StudioCtx, userId: string, input: { scope: string; reason: string; stepUpToken: string }): Promise<FreezeEvent[]> {
  await authorize(ctx.studio, userId, 'freeze', input.scope === '*' ? undefined : input.scope, ctx.env);
  await consumeStepUp(ctx.studio, { userId, token: input.stepUpToken, action: 'unfreeze', bindingHash: bindingHashOf('unfreeze', input.scope), now: ctx.now() });
  const events = await unfreeze(ctx.rules, { scope: input.scope, reason: input.reason, actor: userId });
  await audit(ctx, userId, 'rules.unfreeze', input.scope, { reason: input.reason });
  await tell(ctx, 'unfreeze.performed', 'warning', `Rules unfrozen for ${input.scope === '*' ? 'all scorecards' : input.scope}.`, input.scope);
  return events;
}

function addWorkingDays(from: Date, days: number): Date {
  const d = new Date(from);
  let left = days;
  while (left > 0) { d.setUTCDate(d.getUTCDate() + 1); if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) left--; }
  return d;
}

export async function emergencyRollbackScorecard(
  ctx: StudioCtx, userId: string, scorecardId: string, input: { toVersion: number | 'shipped'; reason: string; stepUpToken: string },
): Promise<{ mode: 'rolled_back'; version: RulesVersionRecord } | { mode: 'frozen_last_known_good'; serveVersion: number }> {
  if (!isScorecardId(scorecardId)) throw new StudioError('unknown_scorecard', 'Unknown scorecard', 404);
  await authorize(ctx.studio, userId, 'rollback.emergency', scorecardId, ctx.env);
  await consumeStepUp(ctx.studio, { userId, token: input.stepUpToken, action: 'emergency-rollback', bindingHash: bindingHashOf('emergency-rollback', scorecardId, input.toVersion), now: ctx.now() });

  const snapDeps = snapshotDeps(ctx);
  const dueAt = addWorkingDays(ctx.now(), 2).toISOString();
  try {
    const version = await emergencyRollback(
      { scorecardId, fromVersion: input.toVersion, actor: userId, reason: input.reason, authors: [userId] }, ctx.rules,
      async (candidate) => { await takeSnapshot(snapDeps, { kind: 'pre-rollback', scorecardId, actor: userId, candidate }); },
    );
    await audit(ctx, userId, 'rules.emergency_rollback', scorecardId, { toVersion: input.toVersion, newVersion: version.version, reason: input.reason });
    await tell(ctx, 'rollback.performed', 'critical', `Emergency rollback on ${scorecardId} to ${input.toVersion === 'shipped' ? 'the shipped rules' : `version ${input.toVersion}`} (new version ${version.version}).`, scorecardId);
    await tell(ctx, 'review.task', 'warning', `Independent review required for the emergency rollback of ${scorecardId}.`, scorecardId, ['expert_approver'], dueAt);
    return { mode: 'rolled_back', version };
  } catch (e) {
    if (e instanceof RulesIncompatibleError) {
      // The target cannot run on this build: hold the scorecard on the last version that can.
      const history = await loadVerifiedHistory(scorecardId, ctx.rules);
      let serveVersion = 0;
      for (const rec of [...history].reverse()) {
        if (rec.version === e.version) continue;
        try { await resolvePublished(scorecardId, ctx.rules, { version: rec.version }); serveVersion = rec.version; break; } catch { /* try an older one */ }
      }
      await freeze(ctx.rules, { scope: scorecardId, reason: `Emergency rollback target is incompatible with this build: ${input.reason}`, actor: userId, serveVersion });
      await audit(ctx, userId, 'rules.emergency_rollback_frozen', scorecardId, { requested: input.toVersion, serveVersion });
      await tell(ctx, 'compatibility.failure', 'critical', `Rollback target for ${scorecardId} is incompatible; frozen on ${serveVersion === 0 ? 'the shipped rules' : `version ${serveVersion}`}.`, scorecardId);
      await tell(ctx, 'review.task', 'warning', `Independent review required: ${scorecardId} was frozen after an incompatible rollback target.`, scorecardId, ['expert_approver'], dueAt);
      return { mode: 'frozen_last_known_good', serveVersion };
    }
    if (e instanceof SnapshotFailedError) {
      await tell(ctx, 'backup.failed', 'critical', `Emergency rollback on ${scorecardId} stopped: snapshot failed (${e.stage}). Use freeze or RULES_FREEZE to hold the scorecard.`, scorecardId);
      throw new StudioError('snapshot_failed', 'The required verified snapshot could not be created, so the rollback was not applied. Freeze the scorecard to hold the last known good version.', 503, { stage: e.stage });
    }
    throw e;
  }
}

export { PublishRejectedError };
export type { FreezeEvent };
export const _internal = { activeVersionAt, findRule, getChangeset };

/* ------------------------------------------------------------------ integrity and backup status */

export interface IntegrityReport {
  ok: boolean;
  checkedAt: string;
  scorecards: Array<{ scorecardId: string; ok: boolean; versions: number; failures: unknown[] }>;
  audit: { ok: boolean; events: number; unsigned: number; failures: unknown[] };
}

/** Verifies every scorecard's signed chain and the audit trail; raises a critical alarm on any failure. */
export async function checkIntegrity(ctx: StudioCtx, actor: string): Promise<IntegrityReport> {
  const { verifyChain } = await import('../ledger.js');
  const { verifyAudit } = await import('./audit.js');
  const { SCORECARD_IDS } = await import('../../../../web/Toolkit/src/lib/rules/scorecards');
  const scorecards: IntegrityReport['scorecards'] = [];
  for (const id of SCORECARD_IDS) {
    const records = await ctx.rules.store.getVersions(id);
    const r = verifyChain(id, records, ctx.rules.verifier);
    scorecards.push({ scorecardId: id, ok: r.ok, versions: records.length, failures: r.failures });
    if (!r.ok) await tell(ctx, 'integrity.failure', 'critical', `Integrity failure in the ${id} rules ledger (${r.failures.length} problem(s)).`, id);
  }
  const a = await verifyAudit(ctx.studio, ctx.rules.verifier);
  if (!a.ok) await tell(ctx, 'integrity.failure', 'critical', `Integrity failure in the Studio audit trail (${a.failures.length} problem(s)).`, 'audit');
  const report: IntegrityReport = { ok: scorecards.every((s) => s.ok) && a.ok, checkedAt: ctx.now().toISOString(), scorecards, audit: a };
  await audit(ctx, actor, 'integrity.check', null, { ok: report.ok });
  return report;
}

export interface BackupStatus {
  offsiteConfigured: boolean;
  offsiteTarget: string | null;
  signingConfigured: boolean;
  protectedPublishingAvailable: boolean;
  lastVerifiedSnapshotAt: string | null;
  lastSnapshotAgeHours: number | null;
  /** True when no verified snapshot exists in the last 36 hours (nightly cadence + slack). */
  stale: boolean;
}

export async function backupStatus(ctx: StudioCtx): Promise<BackupStatus> {
  const checks = (await ctx.studio.collection<{ id: string; rev: number; kind: string; verifiedAt: string }>('backupChecks').find()).filter((c) => c.kind === 'snapshot-verified');
  const last = checks.map((c) => c.verifiedAt).sort().pop() ?? null;
  const age = last ? (ctx.now().getTime() - Date.parse(last)) / 3_600_000 : null;
  return {
    offsiteConfigured: !!ctx.offsite, offsiteTarget: ctx.offsite?.describe() ?? null, signingConfigured: !!ctx.rules.signer,
    protectedPublishingAvailable: !!ctx.offsite && !!ctx.rules.signer,
    lastVerifiedSnapshotAt: last, lastSnapshotAgeHours: age === null ? null : Math.round(age * 10) / 10, stale: age === null || age > 36,
  };
}
