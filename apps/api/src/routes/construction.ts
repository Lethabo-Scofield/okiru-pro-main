/**
 * Construction Sector Routes
 *
 * Indicator-level scoring for the three Construction entity types:
 *   - construction_qse
 *   - construction_contractor
 *   - construction_bep
 *
 * Pure compute over the indicator matrix in `pipeline/constructionIndicators.ts`.
 * No DB writes; safe to call without MongoDB / Arango configured.
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '../logger.js';
import {
  getConstructionScorecard,
  listConstructionEntityTypes,
  CONSTRUCTION_SCORECARDS,
} from '../../pipeline/constructionIndicators.js';
import {
  calculateConstructionScorecard,
  validateConstructionPayload,
} from '../../pipeline/constructionScoring.js';

const logger = createLogger('Construction');
const router = Router();

// ---------------------------------------------------------------------------
// GET /api/construction/entity-types — list supported Construction entities
// ---------------------------------------------------------------------------
router.get('/entity-types', (_req: Request, res: Response) => {
  return res.json({ success: true, entityTypes: listConstructionEntityTypes() });
});

// ---------------------------------------------------------------------------
// GET /api/construction/template/:entityType — return the indicator matrix
// (used by the frontend to render the data-entry form)
// ---------------------------------------------------------------------------
router.get('/template/:entityType', (req: Request, res: Response) => {
  try {
    const cfg = getConstructionScorecard(req.params.entityType);
    return res.json({ success: true, template: cfg });
  } catch (err) {
    return res.status(404).json({
      success: false,
      message: err instanceof Error ? err.message : 'Unknown entity type',
      supported: Object.keys(CONSTRUCTION_SCORECARDS),
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/construction/evaluate — score a Construction scorecard
// Body: { entityType, indicators: { <inputKey>: value }, financials: { npat, leviableAmount, totalMeasuredProcurementSpend }, africanEapPercent? }
// ---------------------------------------------------------------------------
router.post('/evaluate', (req: Request, res: Response) => {
  const validated = validateConstructionPayload(req.body);
  if (!validated.valid) {
    return res.status(400).json({ success: false, errors: validated.errors });
  }
  try {
    const result = calculateConstructionScorecard(validated.value.entityType, validated.value);
    return res.json({ success: true, scorecard: result });
  } catch (err) {
    logger.error('Construction evaluate failed', err);
    return res.status(400).json({
      success: false,
      message: err instanceof Error ? err.message : 'Failed to evaluate Construction scorecard',
    });
  }
});

export default router;
