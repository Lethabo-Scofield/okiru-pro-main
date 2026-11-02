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
import { resolveHeads, resolvePublished, RulesIntegrityError, type ServiceDeps } from '../rules/rulesService.js';
import { StoreUnavailableError } from '../rules/store.js';
import { getServiceDeps, rulesLaunched } from '../rules/runtime.js';

const logger = createLogger('RulesPublished');

export function sendRulesError(res: Response, err: unknown, context: string): void {
  res.setHeader('Cache-Control', 'no-store');
  if (err instanceof StoreUnavailableError) {
    res.status(503).json({ code: err.code, message: 'Rules storage is unavailable' });
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

export function createPublishedRulesRouter(depsFactory: () => ServiceDeps = getServiceDeps, launched: () => boolean = rulesLaunched): Router {
  const router = Router();

  router.get('/heads', requireAuth, async (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!launched()) return void res.json({ launched: false, heads: [] });
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
    if (!launched()) return void res.json({ launched: false, scorecardId: sid, stamp: null, overrides: null });
    try {
      const p = await resolvePublished(sid, depsFactory());
      res.json({ launched: true, ...p });
    } catch (err) {
      sendRulesError(res, err, `published:${sid}`);
    }
  });

  return router;
}

export default createPublishedRulesRouter();
