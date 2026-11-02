/**
 * /api/rules-studio - the Studio's own API (the published-rules live link is /api/rules).
 *
 * Every route requires an authenticated Okiru session AND a Studio grant (studioGrants);
 * platform admin / super-admin roles grant nothing here. Mutating requests must come from an
 * allowed Origin and carry `X-Requested-With: okiru-studio` (a non-simple header, so a
 * cross-site form or fetch cannot send it). Sensitive actions additionally need a single-use
 * step-up token bound to that exact action. Responses are never cached.
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { requireAuth } from '../middleware/requireAuth.js';
import { createLogger } from '../logger.js';
import { SCORECARD_IDS, SCORECARD_SOURCES, isScorecardId, type ScorecardId } from '../../../web/Toolkit/src/lib/rules/scorecards';
import { getRules } from '../../../web/Toolkit/src/lib/rules/registry';
import { getAtPath } from '../../../web/Toolkit/src/lib/rules/paths';
import { buildEffectiveConfig } from '../../../web/Toolkit/src/lib/rules/buildEffectiveConfig';
import { RulesFrozenError, PublishRejectedError, RulesIntegrityError, RulesNotFoundError, RulesIncompatibleError, loadVerifiedHistory } from '../rules/rulesService.js';
import { StoreUnavailableError, VersionConflictError } from '../rules/store.js';
import { SigningUnavailableError } from '../rules/signing.js';
import { canonicalJson } from '../rules/ledger.js';
import { getStudioCtx, rulesLaunched } from '../rules/runtime.js';
import { DuplicateIdError, StaleWriteError, type Doc } from '../rules/studio/studioStore.js';
import { ForbiddenError, authorize, hasAnyGrant, createGrant, revokeGrant, STUDIO_ROLES, type Grant } from '../rules/studio/permissions.js';
import { StepUpDeniedError, StepUpUnavailableError, enrollTotp, confirmTotp, resetTotp, startStepUp, verifyStepUp, bindingHashOf } from '../rules/studio/stepUp.js';
import { SnapshotFailedError } from '../rules/studio/snapshots.js';
import { appendAudit, verifyAudit, newId, type AuditEvent } from '../rules/studio/audit.js';
import {
  StudioError, createChangeset, addItem, removeItem, patchChangeset, withdrawChangeset, rebaseChangeset, createRestoreDraft,
  runAuthoritativeImpact, acknowledge, submitChangeset, decideChangeset, preparePublish, publishChangeset, freezeScope, unfreezeScope,
  emergencyRollbackScorecard, checkIntegrity, backupStatus, stepUpBinding, type Changeset, type ImpactRunDoc, type StudioCtx,
} from '../rules/studio/studioService.js';
import { persistentDeliveryFailures, type Notification } from '../rules/studio/notify.js';

const logger = createLogger('RulesStudio');

type Handler = (req: Request, res: Response, ctx: StudioCtx, userId: string) => Promise<unknown> | unknown;

const str = (v: unknown, max = 4000): string => (typeof v === 'string' ? v.slice(0, max) : '');
const body = (req: Request): Record<string, unknown> => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});
const param = (req: Request, name: string): string => String(req.params[name] ?? '');
const sidOf = (req: Request): ScorecardId => {
  const sid = param(req, 'sid');
  if (!isScorecardId(sid)) throw new StudioError('unknown_scorecard', 'Unknown scorecard', 404);
  return sid;
};

export function mapError(res: Response, err: unknown, context: string): void {
  res.setHeader('Cache-Control', 'no-store');
  const send = (status: number, code: string, message: string, extra: Record<string, unknown> = {}) => void res.status(status).json({ code, message, ...extra });
  if (err instanceof StudioError) return send(err.status, err.code, err.message, err.details ? { details: err.details } : {});
  if (err instanceof ForbiddenError) return send(403, err.code, err.message);
  if (err instanceof StepUpUnavailableError) return send(503, err.code, err.message);
  if (err instanceof StepUpDeniedError) return send(401, err.code, err.message);
  if (err instanceof RulesFrozenError) return send(423, err.code, err.message);
  if (err instanceof SnapshotFailedError) return send(503, err.code, 'The required signed off-site snapshot failed; nothing was changed.', { stage: err.stage });
  if (err instanceof SigningUnavailableError) return send(503, err.code, err.message);
  if (err instanceof StoreUnavailableError) return send(503, err.code, 'Studio storage is unavailable');
  if (err instanceof StaleWriteError || err instanceof VersionConflictError || err instanceof DuplicateIdError) return send(409, (err as { code: string }).code, (err as Error).message);
  if (err instanceof PublishRejectedError) return send(400, err.code, err.message);
  if (err instanceof RulesNotFoundError) return send(404, err.code, err.message);
  if (err instanceof RulesIntegrityError || err instanceof RulesIncompatibleError) {
    logger.error('RULES INTEGRITY/COMPATIBILITY FAILURE', err as Error, { context });
    return send(500, (err as { code: string }).code, 'Published rules failed verification');
  }
  logger.error('Unexpected Studio error', err as Error, { context });
  return send(500, 'studio_error', 'The Studio could not complete that request');
}

/** Mutating requests: same-site Origin (when sent) and the custom header. */
export function csrfGuard(allowedOrigins: () => string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.headers.origin;
    const host = req.headers.host;
    const sameHost = origin && host && (() => { try { return new URL(origin).host === host; } catch { return false; } })();
    if (origin && !sameHost && !allowedOrigins().includes(origin)) return void res.status(403).json({ code: 'bad_origin', message: 'Request origin is not allowed' });
    if (req.headers['x-requested-with'] !== 'okiru-studio') return void res.status(403).json({ code: 'csrf', message: 'Missing Studio request header' });
    next();
  };
}

const allowedFromEnv = () => (process.env.CORS_ORIGIN ?? '').split(',').map((s) => s.trim()).filter(Boolean);

export function createStudioRouter(ctxFactory: () => Promise<StudioCtx> = getStudioCtx): Router {
  const router = Router();

  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    // Studio-specific CSP for everything this router serves: it only ever returns JSON.
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  router.use(requireAuth);
  router.use(csrfGuard(allowedFromEnv));
  router.use(rateLimit({
    windowMs: 60_000, limit: Number(process.env.RULES_STUDIO_RATE_LIMIT ?? 240), standardHeaders: 'draft-7', legacyHeaders: false,
    keyGenerator: (req) => String((req.session as { userId?: string } | undefined)?.userId ?? ipKeyGenerator(req.ip ?? '')),
    message: { code: 'rate_limited', message: 'Too many Studio requests; slow down' },
  }));

  const wrap = (handler: Handler, opts: { status?: number } = {}) => async (req: Request, res: Response) => {
    try {
      const ctx = await ctxFactory();
      const userId = (req.session as { userId?: string } | undefined)?.userId;
      if (!userId) return void res.status(401).json({ code: 'unauthenticated', message: 'Not authenticated' });
      const out = await handler(req, res, ctx, userId);
      if (!res.headersSent) res.status(opts.status ?? 200).json(out ?? { ok: true });
    } catch (err) {
      mapError(res, err, `${req.method} ${req.path}`);
    }
  };
  const read = (req: Request, ctx: StudioCtx, userId: string, sid?: string) => authorize(ctx.studio, userId, 'read', sid, ctx.env);

  /* ---- access, registry, values ---- */
  router.get('/access', wrap(async (_req, _res, ctx, userId) => ({
    hasAccess: await hasAnyGrant(ctx.studio, userId, ctx.env), launched: rulesLaunched(), protectedPublishing: (await backupStatus(ctx)).protectedPublishingAvailable,
  })));

  router.get('/scorecards', wrap(async (req, _res, ctx, userId) => {
    await authorize(ctx.studio, userId, 'read', undefined, ctx.env).catch(() => authorize(ctx.studio, userId, 'read', 'rcogp-generic', ctx.env));
    return { scorecards: SCORECARD_IDS.map((id) => ({ id, label: SCORECARD_SOURCES[id].label, rules: getRules(id).length })) };
  }));

  router.get('/scorecards/:sid/registry', wrap(async (req, _res, ctx, userId) => {
    const sid = sidOf(req); await read(req, ctx, userId, sid);
    return { scorecardId: sid, rules: getRules(sid) };
  }));

  router.get('/scorecards/:sid/values', wrap(async (req, _res, ctx, userId) => {
    const sid = sidOf(req); await read(req, ctx, userId, sid);
    const history = await loadVerifiedHistory(sid, ctx.rules);
    const head = history[history.length - 1];
    // Values come from the actual Toolkit calculator configuration (shipped + published overrides), not a pipeline-only copy.
    const config = buildEffectiveConfig(sid, head?.overrides ?? { source: {}, calculator: {} });
    return {
      scorecardId: sid, publishedVersion: head?.version ?? 0,
      values: getRules(sid).map((r) => ({
        key: r.key, shipped: getAtPath(r.binding.layer === 'source' ? SCORECARD_SOURCES[sid].source : SCORECARD_SOURCES[sid].shipped, r.binding.path),
        published: head?.overrides[r.binding.layer]?.[r.binding.path] ?? getAtPath(r.binding.layer === 'source' ? SCORECARD_SOURCES[sid].source : SCORECARD_SOURCES[sid].shipped, r.binding.path),
      })),
      effectiveConfigKeys: Object.keys(config).length,
    };
  }));

  /* ---- drafts ---- */
  router.post('/scorecards/:sid/changesets', wrap((req, _res, ctx, userId) => createChangeset(ctx, userId, { scorecardId: sidOf(req), title: str(body(req).title, 160), description: str(body(req).description) }), { status: 201 }));

  router.get('/changesets', wrap(async (req, _res, ctx, userId) => {
    const sid = typeof req.query.scorecardId === 'string' ? req.query.scorecardId : undefined;
    if (sid && !isScorecardId(sid)) throw new StudioError('unknown_scorecard', 'Unknown scorecard', 404);
    const all = await ctx.studio.collection<Changeset>('ruleChangesets').find();
    const visible: Changeset[] = [];
    for (const cs of all) {
      if (sid && cs.scorecardId !== sid) continue;
      if (typeof req.query.status === 'string' && cs.status !== req.query.status) continue;
      try { await authorize(ctx.studio, userId, 'read', cs.scorecardId, ctx.env); visible.push(cs); } catch { /* not visible to this user */ }
    }
    return { changesets: visible };
  }));

  const loadCs = async (ctx: StudioCtx, userId: string, cid: string) => {
    const cs = await ctx.studio.collection<Changeset>('ruleChangesets').get(cid);
    if (!cs) throw new StudioError('not_found', 'Draft not found', 404);
    await authorize(ctx.studio, userId, 'read', cs.scorecardId, ctx.env);
    return cs;
  };
  router.get('/changesets/:cid', wrap(async (req, _res, ctx, userId) => loadCs(ctx, userId, param(req, 'cid'))));
  router.patch('/changesets/:cid', wrap((req, _res, ctx, userId) => {
    const b = body(req);
    return patchChangeset(ctx, userId, param(req, 'cid'), {
      title: b.title === undefined ? undefined : str(b.title, 160), description: b.description === undefined ? undefined : str(b.description),
      announcement: b.announcement === undefined ? undefined : (b.announcement === null ? null : str(b.announcement, 2000)),
      effectiveFrom: b.effectiveFrom === undefined ? undefined : (b.effectiveFrom === null ? null : str(b.effectiveFrom, 40)),
      expectedRev: typeof b.rev === 'number' ? b.rev : undefined,
    });
  }));
  router.post('/changesets/:cid/items', wrap((req, _res, ctx, userId) => {
    const b = body(req);
    return addItem(ctx, userId, param(req, 'cid'), { ruleKey: str(b.ruleKey, 300), value: b.value, justification: str(b.justification, 1000), expectedRev: typeof b.rev === 'number' ? b.rev : undefined });
  }, { status: 201 }));
  router.delete('/changesets/:cid/items/:itemId', wrap((req, _res, ctx, userId) => removeItem(ctx, userId, param(req, 'cid'), param(req, 'itemId'), typeof req.query.rev === 'string' ? Number(req.query.rev) : undefined)));
  router.post('/changesets/:cid/rebase', wrap((req, _res, ctx, userId) => rebaseChangeset(ctx, userId, param(req, 'cid'))));
  router.post('/changesets/:cid/withdraw', wrap((req, _res, ctx, userId) => withdrawChangeset(ctx, userId, param(req, 'cid'))));

  /* ---- AI (optional): honestly unavailable unless a provider is configured ---- */
  router.get('/ai/availability', wrap(async (_req, _res, ctx, userId) => {
    await authorize(ctx.studio, userId, 'read', 'rcogp-generic', ctx.env).catch(() => authorize(ctx.studio, userId, 'read', undefined, ctx.env));
    const { aiAvailability } = await import('../rules/studio/aiProposals.js');
    return aiAvailability(ctx.env);
  }));
  router.post('/changesets/:cid/propose', wrap(async (req, _res, ctx, userId) => {
    const { proposeChange } = await import('../rules/studio/aiProposals.js');
    return proposeChange(ctx, userId, param(req, 'cid'), str(body(req).prompt, 1500));
  }, { status: 201 }));
  router.post('/proposals/:pid/accept', wrap(async (req, _res, ctx, userId) => (await import('../rules/studio/aiProposals.js')).decideProposal(ctx, userId, param(req, 'pid'), 'accept')));
  router.post('/proposals/:pid/reject', wrap(async (req, _res, ctx, userId) => (await import('../rules/studio/aiProposals.js')).decideProposal(ctx, userId, param(req, 'pid'), 'reject')));

  /* ---- impact ---- */
  router.post('/changesets/:cid/impact', wrap((req, _res, ctx, userId) => runAuthoritativeImpact(ctx, userId, param(req, 'cid')), { status: 201 }));
  const loadRun = async (ctx: StudioCtx, userId: string, runId: string) => {
    const run = await ctx.studio.collection<ImpactRunDoc>('impactRuns').get(runId);
    if (!run) throw new StudioError('not_found', 'Impact run not found', 404);
    await authorize(ctx.studio, userId, 'read', run.scorecardId, ctx.env);
    return run;
  };
  router.get('/impact/:runId', wrap(async (req, _res, ctx, userId) => {
    const run = await loadRun(ctx, userId, param(req, 'runId'));
    return { ...run, review: run.review ? { ...run.review, lines: undefined, report: { ...run.review.report, fixtures: undefined } } : null };
  }));
  router.get('/impact/:runId/lines', wrap(async (req, _res, ctx, userId) => {
    const run = await loadRun(ctx, userId, param(req, 'runId'));
    let lines = run.review?.lines ?? [];
    if (typeof req.query.verdict === 'string') lines = lines.filter((l) => l.verdict === req.query.verdict);
    if (typeof req.query.pillar === 'string') lines = lines.filter((l) => l.pillar === req.query.pillar);
    return { runId: run.id, lines };
  }));
  router.post('/impact/:runId/acknowledge', wrap((req, _res, ctx, userId) => acknowledge(ctx, userId, param(req, 'runId'), str(body(req).ruleKey, 300), str(body(req).justification, 1000))));
  router.post('/scorecards/:sid/parity-check', wrap(async (req, _res, ctx, userId) => {
    const sid = sidOf(req); await read(req, ctx, userId, sid);
    const { checkInvariants } = await import('../rules/studio/impactReview.js');
    const empty = { source: {}, calculator: {} };
    const same = canonicalJson(buildEffectiveConfig(sid, empty)) === canonicalJson(SCORECARD_SOURCES[sid].shipped);
    return { scorecardId: sid, emptyOverridesReproduceShipped: same, invariants: checkInvariants(sid, empty), ok: same };
  }));

  /* ---- approvals and publishing ---- */
  router.post('/changesets/:cid/submit', wrap((req, _res, ctx, userId) => submitChangeset(ctx, userId, param(req, 'cid'))));
  router.post('/changesets/:cid/approve', wrap((req, _res, ctx, userId) => decideChangeset(ctx, userId, param(req, 'cid'), 'approve', str(body(req).comment, 1000))));
  router.post('/changesets/:cid/reject', wrap((req, _res, ctx, userId) => decideChangeset(ctx, userId, param(req, 'cid'), 'reject', str(body(req).comment, 1000))));
  router.post('/changesets/:cid/request-changes', wrap((req, _res, ctx, userId) => decideChangeset(ctx, userId, param(req, 'cid'), 'request_changes', str(body(req).comment, 1000))));
  router.post('/changesets/:cid/publish/prepare', wrap((req, _res, ctx, userId) => {
    const b = body(req);
    return preparePublish(ctx, userId, param(req, 'cid'), { effectiveFrom: b.effectiveFrom ? str(b.effectiveFrom, 40) : null, announcement: b.announcement ? str(b.announcement, 2000) : null });
  }));
  router.post('/changesets/:cid/publish', wrap((req, _res, ctx, userId) => {
    const b = body(req);
    return publishChangeset(ctx, userId, param(req, 'cid'), { stepUpToken: str(b.stepUpToken, 200), effectiveFrom: b.effectiveFrom ? str(b.effectiveFrom, 40) : null, announcement: b.announcement ? str(b.announcement, 2000) : null });
  }));

  /* ---- versions ---- */
  const versionView = (v: Awaited<ReturnType<typeof loadVerifiedHistory>>[number]) => ({
    version: v.version, kind: v.kind, effectiveFrom: v.effectiveFrom, publishedAt: v.publishedAt, publishedBy: v.publishedBy, announcement: v.announcement,
    authors: v.authors, approvers: v.approvers, changesetId: v.changesetId, restoredFromVersion: v.restoredFromVersion, configHash: v.configHash,
    overridesHash: v.overridesHash, chainHash: v.chainHash, keyId: v.keyId, buildId: v.buildId, overrideCount: Object.keys(v.overrides.source).length + Object.keys(v.overrides.calculator).length,
  });
  router.get('/scorecards/:sid/versions', wrap(async (req, _res, ctx, userId) => {
    const sid = sidOf(req); await read(req, ctx, userId, sid);
    return { scorecardId: sid, versions: (await loadVerifiedHistory(sid, ctx.rules)).map(versionView) };
  }));
  router.get('/scorecards/:sid/versions/:n', wrap(async (req, _res, ctx, userId) => {
    const sid = sidOf(req); await read(req, ctx, userId, sid);
    const v = (await loadVerifiedHistory(sid, ctx.rules)).find((r) => r.version === Number(param(req, 'n')));
    if (!v) throw new StudioError('not_found', 'Version not found', 404);
    return { ...versionView(v), overrides: v.overrides };
  }));
  router.get('/scorecards/:sid/timeline', wrap(async (req, _res, ctx, userId) => {
    const sid = sidOf(req); await read(req, ctx, userId, sid);
    const history = await loadVerifiedHistory(sid, ctx.rules);
    const freezes = (await ctx.rules.store.getFreezeEvents()).filter((e) => e.scope === sid || e.scope === '*');
    return { scorecardId: sid, versions: history.map(versionView), freezeEvents: freezes };
  }));
  router.get('/scorecards/:sid/compare', wrap(async (req, _res, ctx, userId) => {
    const sid = sidOf(req); await read(req, ctx, userId, sid);
    const from = Number(req.query.from); const to = Number(req.query.to);
    const history = await loadVerifiedHistory(sid, ctx.rules);
    const get = (n: number) => (n === 0 ? { source: {}, calculator: {} } : history.find((r) => r.version === n)?.overrides);
    const a = get(from); const b = get(to);
    if (!a || !b) throw new StudioError('not_found', 'Version not found', 404);
    const { changedRules } = await import('../rules/studio/impactReview.js');
    return { scorecardId: sid, from, to, changes: changedRules(sid, a, b) };
  }));
  router.post('/scorecards/:sid/restore', wrap((req, _res, ctx, userId) => {
    const to = body(req).toVersion;
    return createRestoreDraft(ctx, userId, sidOf(req), to === 'shipped' ? 'shipped' : Number(to), str(body(req).reason, 1000));
  }, { status: 201 }));
  // "rollback" = a restore draft aimed at the version before the current one (normal approvals still apply).
  router.post('/scorecards/:sid/rollback', wrap(async (req, _res, ctx, userId) => {
    const sid = sidOf(req);
    const history = await loadVerifiedHistory(sid, ctx.rules);
    const head = history[history.length - 1];
    if (!head) throw new StudioError('nothing_to_roll_back', 'No version has been published for this scorecard', 409);
    const to = body(req).toVersion !== undefined ? Number(body(req).toVersion) : head.version - 1;
    return createRestoreDraft(ctx, userId, sid, to, str(body(req).reason, 1000));
  }, { status: 201 }));
  router.post('/scorecards/:sid/emergency-rollback', wrap((req, _res, ctx, userId) => {
    const b = body(req);
    return emergencyRollbackScorecard(ctx, userId, sidOf(req), { toVersion: b.toVersion === 'shipped' ? 'shipped' : Number(b.toVersion), reason: str(b.reason, 1000), stepUpToken: str(b.stepUpToken, 200) });
  }));

  /* ---- safety and administration ---- */
  router.post('/freeze', wrap((req, _res, ctx, userId) => {
    const b = body(req);
    return freezeScope(ctx, userId, { scope: str(b.scope, 60) || '*', reason: str(b.reason, 1000), serveVersion: typeof b.serveVersion === 'number' ? b.serveVersion : undefined, stepUpToken: str(b.stepUpToken, 200) });
  }));
  router.post('/unfreeze', wrap((req, _res, ctx, userId) => {
    const b = body(req);
    return unfreezeScope(ctx, userId, { scope: str(b.scope, 60) || '*', reason: str(b.reason, 1000), stepUpToken: str(b.stepUpToken, 200) });
  }));
  router.get('/backups/status', wrap(async (_req, _res, ctx, userId) => {
    await authorize(ctx.studio, userId, 'backups.read', undefined, ctx.env);
    return { ...(await backupStatus(ctx)), deliveryProblems: await persistentDeliveryFailures(ctx.studio) };
  }));
  router.get('/backups/snapshots', wrap(async (_req, _res, ctx, userId) => {
    await authorize(ctx.studio, userId, 'backups.read', undefined, ctx.env);
    const snaps = await ctx.studio.collection<{ id: string; rev: number; kind: string; scorecardId: string | null; createdAt: string; contentHash: string; offsiteKey: string; offsiteTarget: string; verifiedAt: string; keyId: string }>('ruleSnapshots').find();
    return { snapshots: snaps.map(({ id, kind, scorecardId, createdAt, contentHash, offsiteKey, offsiteTarget, verifiedAt, keyId }) => ({ id, kind, scorecardId, createdAt, contentHash, offsiteKey, offsiteTarget, verifiedAt, keyId })) };
  }));
  router.post('/backups/drill-results', wrap(async (req, _res, ctx, userId) => {
    await authorize(ctx.studio, userId, 'backups.drill', undefined, ctx.env);
    const b = body(req);
    const outcome = b.outcome === 'pass' ? 'pass' : 'fail';
    const rec = { id: newId(), rev: 1, kind: 'restore-drill', outcome, notes: str(b.notes, 1000), recordedBy: userId, createdAt: ctx.now().toISOString() };
    await ctx.studio.collection('backupChecks').insert(rec);
    await appendAudit(ctx.studio, ctx.rules.signer, { actor: userId, action: 'backup.drill', target: rec.id, details: { outcome }, now: ctx.now() });
    if (outcome === 'fail') {
      const { notify } = await import('../rules/studio/notify.js');
      await notify(ctx.studio, ctx.notifyCfg, ctx.now(), { type: 'backup.failed', severity: 'critical', message: 'A restore drill failed.', entity: rec.id });
    }
    return rec;
  }, { status: 201 }));
  router.get('/activity', wrap(async (req, _res, ctx, userId) => {
    await authorize(ctx.studio, userId, 'read', undefined, ctx.env).catch(() => authorize(ctx.studio, userId, 'read', 'rcogp-generic', ctx.env));
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const events = (await ctx.studio.collection<AuditEvent>('auditEvents').find()).sort((a, b) => b.seq - a.seq).slice(0, limit);
    return { events: events.map(({ seq, at, actor, action, target, details }) => ({ seq, at, actor, action, target, details })) };
  }));
  router.get('/audit/export', wrap(async (_req, res, ctx, userId) => {
    await authorize(ctx.studio, userId, 'audit.read', undefined, ctx.env);
    const events = (await ctx.studio.collection<AuditEvent>('auditEvents').find()).sort((a, b) => a.seq - b.seq);
    res.setHeader('Content-Disposition', 'attachment; filename="rules-studio-audit.json"');
    return { exportedAt: ctx.now().toISOString(), events };
  }));
  router.get('/audit/integrity', wrap(async (_req, _res, ctx, userId) => {
    await authorize(ctx.studio, userId, 'audit.read', undefined, ctx.env);
    return { ledger: await checkIntegrity(ctx, userId), audit: await verifyAudit(ctx.studio, ctx.rules.verifier) };
  }));

  router.get('/grants', wrap(async (_req, _res, ctx, userId) => {
    await authorize(ctx.studio, userId, 'grants.manage', undefined, ctx.env);
    return { grants: (await ctx.studio.collection<Grant>('studioGrants').find()).filter((g) => g.kind === 'grant') };
  }));
  router.post('/grants', wrap(async (req, _res, ctx, userId) => {
    await authorize(ctx.studio, userId, 'grants.manage', undefined, ctx.env);
    const b = body(req);
    const role = str(b.role, 40);
    if (!(STUDIO_ROLES as readonly string[]).includes(role)) throw new StudioError('invalid_input', 'Unknown role', 400);
    const scorecards = Array.isArray(b.scorecards) ? b.scorecards.filter((s): s is string => typeof s === 'string' && (s === '*' || isScorecardId(s))) : [];
    const grant = await createGrant(ctx.studio, { userId: str(b.userId, 120), role: role as Grant['role'], scorecards, createdBy: userId, now: ctx.now() });
    await appendAudit(ctx.studio, ctx.rules.signer, { actor: userId, action: 'grant.create', target: grant.id, details: { role, scorecards, userId: grant.userId }, now: ctx.now() });
    const { notify } = await import('../rules/studio/notify.js');
    await notify(ctx.studio, ctx.notifyCfg, ctx.now(), { type: 'permissions.changed', severity: 'warning', message: `A ${role} grant was created.`, entity: grant.id });
    return grant;
  }, { status: 201 }));
  router.delete('/grants/:id', wrap(async (req, _res, ctx, userId) => {
    await authorize(ctx.studio, userId, 'grants.manage', undefined, ctx.env);
    const g = await revokeGrant(ctx.studio, param(req, 'id'), ctx.now());
    await appendAudit(ctx.studio, ctx.rules.signer, { actor: userId, action: 'grant.revoke', target: g.id, details: { role: g.role }, now: ctx.now() });
    const { notify } = await import('../rules/studio/notify.js');
    await notify(ctx.studio, ctx.notifyCfg, ctx.now(), { type: 'permissions.changed', severity: 'warning', message: `A ${g.role} grant was revoked.`, entity: g.id });
    return g;
  }));

  /* ---- notifications ---- */
  router.get('/notifications', wrap(async (_req, _res, ctx, userId) => {
    await authorize(ctx.studio, userId, 'read', 'rcogp-generic', ctx.env).catch(() => authorize(ctx.studio, userId, 'read', undefined, ctx.env));
    const all = (await ctx.studio.collection<Notification>('notifications').find()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200);
    return { notifications: all.map((n) => ({ ...n, read: n.readBy.includes(userId) })), deliveryProblems: await persistentDeliveryFailures(ctx.studio) };
  }));
  router.post('/notifications/:id/read', wrap(async (req, _res, ctx, userId) => {
    const col = ctx.studio.collection<Notification>('notifications');
    const n = await col.get(param(req, 'id'));
    if (!n) throw new StudioError('not_found', 'Notification not found', 404);
    return n.readBy.includes(userId) ? n : col.replace({ ...n, readBy: [...n.readBy, userId] }, n.rev);
  }));

  /* ---- developer change requests, rulings and notes (small, audited) ---- */
  interface ChangeRequest { id: string; rev: number; scorecardId: string; title: string; description: string; ruleKey: string | null; status: 'open' | 'in_progress' | 'done' | 'declined'; createdBy: string; createdAt: string; assignee: string | null }
  router.get('/change-requests', wrap(async (_req, _res, ctx, userId) => {
    await authorize(ctx.studio, userId, 'read', 'rcogp-generic', ctx.env).catch(() => authorize(ctx.studio, userId, 'read', undefined, ctx.env));
    return { changeRequests: await ctx.studio.collection<ChangeRequest>('ruleChangeRequests').find() };
  }));
  router.post('/change-requests', wrap(async (req, _res, ctx, userId) => {
    const b = body(req);
    const sid = str(b.scorecardId, 60);
    if (!isScorecardId(sid)) throw new StudioError('unknown_scorecard', 'Unknown scorecard', 404);
    await authorize(ctx.studio, userId, 'changeRequest.create', sid, ctx.env);
    if (str(b.title, 160).length < 3) throw new StudioError('invalid_input', 'A title is required', 400);
    const cr: ChangeRequest = { id: newId(), rev: 1, scorecardId: sid, title: str(b.title, 160), description: str(b.description, 4000), ruleKey: b.ruleKey ? str(b.ruleKey, 300) : null, status: 'open', createdBy: userId, createdAt: ctx.now().toISOString(), assignee: null };
    await ctx.studio.collection<ChangeRequest>('ruleChangeRequests').insert(cr);
    await ctx.studio.collection<Doc & Record<string, unknown>>('ruleChangeRequestEvents').insert({ id: newId(), rev: 1, changeRequestId: cr.id, event: 'created', actor: userId, createdAt: cr.createdAt });
    await appendAudit(ctx.studio, ctx.rules.signer, { actor: userId, action: 'change_request.create', target: cr.id, details: { scorecardId: sid }, now: ctx.now() });
    return cr;
  }, { status: 201 }));
  router.patch('/change-requests/:id', wrap(async (req, _res, ctx, userId) => {
    await authorize(ctx.studio, userId, 'changeRequest.manage', undefined, ctx.env).catch(() => authorize(ctx.studio, userId, 'changeRequest.manage', sidFromBody(req), ctx.env));
    const col = ctx.studio.collection<ChangeRequest>('ruleChangeRequests');
    const cr = await col.get(param(req, 'id'));
    if (!cr) throw new StudioError('not_found', 'Change request not found', 404);
    const status = str(body(req).status, 20);
    if (!['open', 'in_progress', 'done', 'declined'].includes(status)) throw new StudioError('invalid_input', 'Unknown status', 400);
    const saved = await col.replace({ ...cr, status: status as ChangeRequest['status'], assignee: userId }, cr.rev);
    await ctx.studio.collection<Doc & Record<string, unknown>>('ruleChangeRequestEvents').insert({ id: newId(), rev: 1, changeRequestId: cr.id, event: `status:${status}`, actor: userId, createdAt: ctx.now().toISOString() });
    await appendAudit(ctx.studio, ctx.rules.signer, { actor: userId, action: 'change_request.update', target: cr.id, details: { status }, now: ctx.now() });
    return saved;
  }));
  const sidFromBody = (req: Request) => (typeof body(req).scorecardId === 'string' ? (body(req).scorecardId as string) : undefined);

  interface Note { id: string; rev: number; scorecardId: string | null; text: string; createdBy: string; createdAt: string }
  router.get('/notes', wrap(async (_req, _res, ctx, userId) => {
    await authorize(ctx.studio, userId, 'read', 'rcogp-generic', ctx.env).catch(() => authorize(ctx.studio, userId, 'read', undefined, ctx.env));
    return { notes: await ctx.studio.collection<Note>('rulingAnswers').find({ kind: 'note' } as never) };
  }));
  router.post('/notes', wrap(async (req, _res, ctx, userId) => {
    const sid = typeof body(req).scorecardId === 'string' ? (body(req).scorecardId as string) : null;
    if (sid && !isScorecardId(sid)) throw new StudioError('unknown_scorecard', 'Unknown scorecard', 404);
    await authorize(ctx.studio, userId, 'draft.write', sid ?? undefined, ctx.env);
    const text = str(body(req).text, 4000);
    if (text.trim().length < 3) throw new StudioError('invalid_input', 'A note cannot be empty', 400);
    const note = { id: newId(), rev: 1, kind: 'note', scorecardId: sid, text, createdBy: userId, createdAt: ctx.now().toISOString() };
    await ctx.studio.collection('rulingAnswers').insert(note);
    return note;
  }, { status: 201 }));
  router.get('/rulings', wrap(async (_req, _res, ctx, userId) => {
    await authorize(ctx.studio, userId, 'read', 'rcogp-generic', ctx.env).catch(() => authorize(ctx.studio, userId, 'read', undefined, ctx.env));
    return { rulings: await ctx.studio.collection('rulingAnswers').find({ kind: 'ruling' } as never) };
  }));
  router.post('/rulings', wrap(async (req, _res, ctx, userId) => {
    const sid = str(body(req).scorecardId, 60);
    if (!isScorecardId(sid)) throw new StudioError('unknown_scorecard', 'Unknown scorecard', 404);
    await authorize(ctx.studio, userId, 'draft.write', sid, ctx.env);
    const r = { id: newId(), rev: 1, kind: 'ruling', scorecardId: sid, question: str(body(req).question, 1000), answer: str(body(req).answer, 4000), source: str(body(req).source, 500), ruleKey: body(req).ruleKey ? str(body(req).ruleKey, 300) : null, createdBy: userId, createdAt: ctx.now().toISOString() };
    if (r.question.length < 5 || r.answer.length < 5) throw new StudioError('invalid_input', 'A question and an answer are required', 400);
    await ctx.studio.collection('rulingAnswers').insert(r);
    return r;
  }, { status: 201 }));

  return router;
}

/* ------------------------------------------------------------------ step-up (mounted at /api/auth/step-up) */

export function createStepUpRouter(ctxFactory: () => Promise<StudioCtx> = getStudioCtx): Router {
  const router = Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.use(requireAuth);
  router.use(csrfGuard(allowedFromEnv));
  router.use(rateLimit({
    windowMs: 60_000, limit: Number(process.env.RULES_STEPUP_RATE_LIMIT ?? 20), standardHeaders: 'draft-7', legacyHeaders: false,
    keyGenerator: (req) => String((req.session as { userId?: string } | undefined)?.userId ?? ipKeyGenerator(req.ip ?? '')),
    message: { code: 'rate_limited', message: 'Too many step-up attempts; wait a minute' },
  }));

  const run = (fn: (req: Request, ctx: StudioCtx, userId: string) => Promise<unknown>, status = 200) => async (req: Request, res: Response) => {
    try {
      const ctx = await ctxFactory();
      const userId = (req.session as { userId?: string } | undefined)?.userId;
      if (!userId) return void res.status(401).json({ code: 'unauthenticated', message: 'Not authenticated' });
      if (!(await hasAnyGrant(ctx.studio, userId, ctx.env))) throw new ForbiddenError();
      res.status(status).json(await fn(req, ctx, userId));
    } catch (err) {
      mapError(res, err, `${req.method} ${req.path}`);
    }
  };

  router.post('/enroll', run(async (_req, ctx, userId) => {
    const out = await enrollTotp(ctx.studio, userId, ctx.now(), ctx.env);
    await appendAudit(ctx.studio, ctx.rules.signer, { actor: userId, action: 'stepup.enroll', target: userId, now: ctx.now() });
    return out;
  }, 201));
  router.post('/confirm', run(async (req, ctx, userId) => {
    await confirmTotp(ctx.studio, userId, str(body(req).code, 10), ctx.now(), ctx.env);
    await appendAudit(ctx.studio, ctx.rules.signer, { actor: userId, action: 'stepup.confirm', target: userId, now: ctx.now() });
    return { ok: true };
  }));
  router.post('/reset', run(async (req, ctx, userId) => {
    await authorize(ctx.studio, userId, 'grants.manage', undefined, ctx.env);
    const target = str(body(req).userId, 120);
    await resetTotp(ctx.studio, target);
    await appendAudit(ctx.studio, ctx.rules.signer, { actor: userId, action: 'stepup.reset', target, now: ctx.now() });
    return { ok: true };
  }));
  router.post('/start', run(async (req, ctx, userId) => {
    const b = body(req);
    const action = str(b.action, 40);
    const p = b.params && typeof b.params === 'object' ? (b.params as Record<string, unknown>) : {};
    // The client names the action and the thing it will do; the SERVER derives what the token is bound to
    // (for a publish, from the authoritative draft hash, next version and effective date - never from the client).
    const bindingHash = await stepUpBinding(ctx, userId, action, p);
    return startStepUp(ctx.studio, { userId, action, bindingHash, now: ctx.now(), newId }, ctx.env);
  }, 201));
  router.post('/verify', run(async (req, ctx, userId) => {
    const out = await verifyStepUp(ctx.studio, { userId, challengeId: str(body(req).challengeId, 80), code: str(body(req).code, 10), now: ctx.now() }, ctx.env);
    return out;
  }));
  return router;
}

export default createStudioRouter();
export const stepUpRouter = createStepUpRouter();
