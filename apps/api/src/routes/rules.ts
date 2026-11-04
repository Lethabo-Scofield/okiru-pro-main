/**
 * Published rules - the "live link" the calculators read.
 *
 *   GET /api/rules/heads            one cheap call: which version is in force per scorecard
 *   GET /api/rules/published/:sid   the overrides + stamp for one scorecard
 *
 * Fail-closed contract with the clients:
 *   - RULES_LAUNCHED !== "true"  -> 200 {launched:false}: clients use the shipped rules.
 *   - launched, healthy          -> 200 with the verified version (or stamp:null if none yet).
 *   - launched, anything wrong   -> 5xx with a machine-readable `code`. Clients MUST NOT
 *     fall back to shipped rules for a launched deployment; they refuse to calculate.
 */
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { createLogger } from '../logger.js';
import { isScorecardId } from '../../../web/Toolkit/src/lib/rules/scorecards';
import {
  resolveHeads, resolvePublished, RulesIntegrityError, RulesFrozenError, RulesIncompatibleError,
  RulesNotFoundError, PublishRejectedError, type ServiceDeps,
} from '../rules/rulesService.js';
import { createHash } from 'crypto';
import { StoreUnavailableError } from '../rules/store.js';
import { getServiceDeps, rulesServedTo } from '../rules/runtime.js';

const logger = createLogger('RulesPublished');

export function sendRulesError(res: Response, err: unknown, context: string): void {
  res.setHeader('Cache-Control', 'no-store');
  if (err instanceof StoreUnavailableError) {
    res.status(503).json({ code: err.code, message: 'Rules storage is unavailable' });
    return;
  }
  if (err instanceof RulesFrozenError) {
    res.status(423).json({ code: err.code, message: err.message });
    return;
  }
  if (err instanceof RulesNotFoundError) {
    res.status(404).json({ code: err.code, message: 'That rules version does not exist' });
    return;
  }
  if (err instanceof PublishRejectedError) {
    res.status(400).json({ code: err.code, message: err.message });
    return;
  }
  if (err instanceof RulesIncompatibleError) {
    logger.error('RULES INCOMPATIBLE', err, { context, scorecardId: err.scorecardId, version: err.version });
    res.status(500).json({ code: err.code, message: 'Published rules are incompatible with this build', scorecardId: err.scorecardId });
    return;
  }
  if (err instanceof RulesIntegrityError) {
    // An alarm, not a warning: published rules failed verification.
    logger.error('RULES INTEGRITY FAILURE', err, { context, scorecardId: err.scorecardId, failures: err.failures });
    res.status(500).json({ code: err.code, message: 'Published rules failed integrity verification', scorecardId: err.scorecardId });
    return;
  }
  logger.error('Unexpected rules error', err as Error, { context });
  res.status(500).json({ code: 'RULES_ERROR', message: 'Rules could not be resolved' });
}

export function createPublishedRulesRouter(depsFactory: () => ServiceDeps = getServiceDeps, launched: (userId?: string) => boolean = (userId) => rulesServedTo(userId)): Router {
  const router = Router();

  const userOf = (req: Request) => (req.session as { userId?: string } | undefined)?.userId;

  router.get('/heads', requireAuth, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!launched(userOf(req))) return void res.json({ launched: false, heads: [] });
    try {
      res.json({ launched: true, heads: await resolveHeads(depsFactory()) });
    } catch (err) {
      sendRulesError(res, err, 'heads');
    }
  });

  router.get('/published/:sid', requireAuth, async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const sid = req.params.sid;
    if (!isScorecardId(sid)) return void res.status(404).json({ code: 'UNKNOWN_SCORECARD', message: 'Unknown scorecard' });
    if (!launched(userOf(req))) return void res.json({ launched: false, scorecardId: sid, stamp: null, overrides: null });
    try {
      const q = req.query as Record<string, string | undefined>;
      let version: number | undefined;
      if (q.version !== undefined) {
        if (!/^\d{1,6}$/.test(q.version)) return void res.status(400).json({ code: 'BAD_VERSION', message: 'version must be a non-negative integer' });
        version = Number(q.version);
      }
      if (q.periodEnd !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(q.periodEnd)) {
        return void res.status(400).json({ code: 'BAD_PERIOD_END', message: 'periodEnd must be YYYY-MM-DD' });
      }
      const p = await resolvePublished(sid, depsFactory(), { version, periodEnd: q.periodEnd });
      const body = JSON.stringify({ launched: true, ...p });
      const etag = '"' + createHash('sha256').update(body).digest('hex').slice(0, 32) + '"';
      res.setHeader('ETag', etag);
      if (req.headers['if-none-match'] === etag) return void res.status(304).end();
      res.type('application/json').send(body);
    } catch (err) {
      sendRulesError(res, err, `published:${sid}`);
    }
  });

  return router;
}

export default createPublishedRulesRouter();
