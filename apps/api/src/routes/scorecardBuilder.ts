/**
 * Scorecard Builder API Routes
 *
 * - GET /api/manifest - Load entity manifest for sector/type
 * - POST /api/calculate-from-extraction - Map raw extraction output to pillar data
 * - POST /api/assessments - Save assessment results
 *
 * Nothing here scores. Every B-BBEE score is calculated in the browser by the
 * Toolkit calculators (apps/web/Toolkit/src/lib/calculators); a second copy of
 * the engine used to live on this server and was deleted because no score a
 * user saw ever came from it.
 */

import { Router } from 'express';
import { createLogger } from '../logger.js';
import { buildManifest } from '../../pipeline/extraction/entityManifest.js';

const logger = createLogger("ScorecardBuilder");
import { mapToUCSPayload } from '../../pipeline/extraction/aiEntityMapper.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

// This router is mounted at the BARE '/api' path (app.use('/api', ...)), so a
// router-level `router.use(requireAuth)` would run for EVERY /api/* request that
// reaches it in the middleware chain and 401 public routes mounted after it
// (e.g. the certificate directory). The guard is therefore attached per-route
// (/manifest, /calculate-from-extraction, /assessments) below.

// ============================================================================
// GET /api/manifest
// ============================================================================

router.get('/manifest', requireAuth, async (req, res) => {
  try {
    const sectorCode = String(req.query.sector || 'RCOGP');
    const scorecardType = String(req.query.type || 'Generic');

    const manifest = await buildManifest(sectorCode, scorecardType);
    
    res.json(manifest);
  } catch (err) {
    logger.error('Error loading manifest', err);
    res.status(500).json({ 
      error: 'Failed to load manifest',
      details: err instanceof Error ? err.message : 'Unknown error'
    });
  }
});

// ============================================================================
// POST /api/calculate-from-extraction
// AI entity mapping only: the frontend sends raw extraction output, this
// normalizes it into pillarData, and the browser scores that pillarData with
// the Toolkit calculators. (The name predates the server engine's removal; it
// is kept so the deployed web keeps working.)
// ============================================================================

router.post('/calculate-from-extraction', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const { sectorCode, scorecardType, entities, tables } = body;

    if (!sectorCode || !scorecardType) {
      return res.status(400).json({ success: false, error: 'sectorCode and scorecardType are required' });
    }

    logger.info('Mapping extraction to UCS format');

    // TMPS is the supplier schedule's sum unless the caller passes the client's
    // explicit choice of the stated figure (tmpsChoice: 'stated').
    const payload = await mapToUCSPayload({ entities: entities || [], tables: tables || {} }, { tmpsChoice: body.tmpsChoice });

    logger.info('Extraction data quality', { dataQuality: payload.dataQuality });
    logger.info('Extraction arrays', {
      employees: payload.employees.length,
      shareholders: payload.shareholders.length,
      suppliers: payload.suppliers.length,
      contributions: payload.contributions.length,
      trainingPrograms: payload.trainingPrograms.length,
    });
    logger.debug('Extraction financials', { financials: payload.financials });
    logger.debug('Cross-pillar values', { crossPillarValues: Object.fromEntries(payload.crossPillarValues) });

    res.json({
      success: true,
      dataQuality: payload.dataQuality,
      // Where pillarData.financials.tmps came from — the supplier sum by
      // default — and the TMPS the documents state, shown beside it.
      tmpsProvenance: { source: payload.tmpsSource, held: payload.tmpsHeld, stated: payload.tmpsStated },
      pillarData: {
        employees: payload.employees,
        shareholders: payload.shareholders,
        suppliers: payload.suppliers,
        contributions: payload.contributions,
        trainingPrograms: payload.trainingPrograms,
        financials: payload.financials,
      },
    });
  } catch (err) {
    logger.error('Mapping from extraction failed', err);
    res.status(500).json({
      success: false,
      error: 'Mapping from extraction failed',
      details: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});

// ============================================================================
// POST /api/assessments
// ============================================================================

router.post('/assessments', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const assessmentId = body.assessmentId || body.sessionId || `assessment-${Date.now()}`;
    const sectorCode = body.sectorCode || body.clientInfo?.sectorCode || 'RCOGP';
    const scorecardType = body.scorecardType || 'Generic';
    const values = body.values || {};


    const clientId = body.clientId || null;
    const clientInfo = body.clientInfo || {};
    const scorecardResult = body.scorecardResult || body.result || null;
    const pillars = body.pillars || null;
    const financials = body.financials || null;

    let savedClient = null;
    if (clientInfo.companyName) {
      try {
        const { ClientModel } = await import('../../models.js');
        const existing = clientId ? await ClientModel.findOne({ id: clientId }) : null;
        if (existing) {
          savedClient = existing;
        } else {
          const orgId = (req.session as any)?.organizationId;
          if (!orgId) {
            throw new Error('organizationId required in session to create client');
          }
          savedClient = await ClientModel.create({
            organizationId: orgId,
            name: clientInfo.companyName,
            financialYear: clientInfo.financialYear || String(new Date().getFullYear()),
            revenue: financials?.totalRevenue ?? financials?.revenue ?? 0,
            npat: financials?.npat ?? 0,
            leviableAmount: financials?.leviableAmount ?? 0,
            industrySector: typeof clientInfo.industry === 'string' ? clientInfo.industry : sectorCode,
          });
        }
      } catch (clientErr) {
        logger.warn('Client creation failed (non-fatal)', { error: clientErr instanceof Error ? clientErr.message : String(clientErr) });
      }
    }

    res.json({
      success: true,
      assessmentId,
      savedAt: new Date().toISOString(),
      assessment: savedClient ? { clientId: savedClient.id || (savedClient as any)._id?.toString() } : null,
    });
  } catch (err) {
    logger.error('Assessment save error', err);
    res.status(500).json({
      error: 'Save failed',
      details: err instanceof Error ? err.message : 'Unknown error'
    });
  }
});

export default router;
