/**
 * Sectors Routes
 *
 * Sector configuration comes from `pipeline/sectorConfig.ts`, which is the
 * single source of truth.
 *
 * It used to come from ArangoDB, with sectorConfig.ts as a fallback. The
 * fallback was the only path that ever ran: `sector_rules` held zero documents
 * in every environment, so every request logged "ArangoDB not connected,
 * falling back to hardcoded sectors" and served the same registry these routes
 * now read directly. The AQL queries, the connection guards and the `source`
 * discriminator they returned are gone with it.
 *
 * `GET /:sectorCode/:scorecardType` previously 503'd whenever Arango was
 * absent, which was always — it is now answered from the registry like the
 * others, so it returns a config for the first time.
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '../logger.js';

const logger = createLogger("Sectors");
import {
  getSectorConfigSafe,
  listSectorConfigs,
  listSectorConfigsFull,
} from '../../pipeline/sectorConfig.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

// Sector config (weights, thresholds, options) is read by authenticated build
// and toolkit flows only — never a public/marketing page. These reads had no
// guard and were anonymously reachable via the /api catch-all.
router.use(requireAuth);

// ---------------------------------------------------------------------------
// GET /api/sectors - List all available sectors
// ---------------------------------------------------------------------------
router.get('/', async (_req: Request, res: Response) => {
  try {
    return res.json({
      success: true,
      sectors: listSectorConfigsFull(),
    });
  } catch (error: unknown) {
    logger.error('Error fetching sectors', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch sectors',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/sectors/options - Get simplified dropdown options
// ---------------------------------------------------------------------------
router.get('/options', async (_req: Request, res: Response) => {
  try {
    return res.json({
      success: true,
      options: getSectorOptions(),
    });
  } catch (error: unknown) {
    logger.error('Error fetching sector options', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch sector options',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/sectors/:sectorCode/:scorecardType - Get one sector's config
// ---------------------------------------------------------------------------
router.get('/:sectorCode/:scorecardType', async (req: Request, res: Response) => {
  try {
    const sectorCode = Array.isArray(req.params.sectorCode) ? req.params.sectorCode[0] : req.params.sectorCode;
    const scorecardType = Array.isArray(req.params.scorecardType) ? req.params.scorecardType[0] : req.params.scorecardType;

    const config = getSectorConfigSafe(sectorCode.toUpperCase(), scorecardType);
    if (!config) {
      return res.status(404).json({
        success: false,
        error: `Sector ${sectorCode} ${scorecardType} not found`,
      });
    }

    return res.json({ success: true, config });
  } catch (error: unknown) {
    logger.error('Error fetching sector config', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch sector config',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/sectors/:sectorCode/manifest - Get entity manifest for sector
// ---------------------------------------------------------------------------
router.get('/:sectorCode/manifest', async (req: Request, res: Response) => {
  try {
    const sectorCode = Array.isArray(req.params.sectorCode) ? req.params.sectorCode[0] : req.params.sectorCode;
    const rawScorecardType = Array.isArray(req.query.type) ? req.query.type[0] : req.query.type;
    const scorecardType = (typeof rawScorecardType === 'string' ? rawScorecardType : 'Generic') || 'Generic';

    const { buildManifest } = await import('../../pipeline/extraction/entityManifest.js');
    const manifest = await buildManifest(sectorCode.toUpperCase(), scorecardType);

    return res.json({
      success: true,
      manifest,
    });
  } catch (error: unknown) {
    logger.error('Error building manifest', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to build manifest',
    });
  }
});

// NOTE: POST /seed is gone. It force-reseeded the ArangoDB sector ontology from
// these same hardcoded configs — copying the source of truth into a store
// nothing read.

// ---------------------------------------------------------------------------
// Dropdown options, derived from the `sectorConfig.ts` registry. Adding a
// sector to ALL_CONFIGS there surfaces it here automatically.
// ---------------------------------------------------------------------------

function getSectorOptions() {
  // Group registry rows by sectorCode → dropdown option with availableTypes.
  const grouped = new Map<string, { code: string; name: string; types: string[] }>();
  for (const c of listSectorConfigs()) {
    const existing = grouped.get(c.code);
    if (existing) {
      existing.types.push(c.type);
    } else {
      // Strip parenthesised scorecard type from the display name for the
      // grouped dropdown label (e.g. "Construction Sector Code (QSE)" →
      // "Construction Sector Code").
      const baseName = c.name.replace(/\s*\([^)]*\)\s*$/, '');
      grouped.set(c.code, { code: c.code, name: baseName, types: [c.type] });
    }
  }
  return Array.from(grouped.values()).map(g => ({
    value: g.code,
    label: g.name,
    code: g.code,
    hasQSE: g.types.includes('QSE'),
    availableTypes: g.types,
    ...(g.code === 'FSC'
      ? { availableVariants: ['Banks', 'LongTermInsurers', 'ShortTermInsurers', 'Others'] as const }
      : {}),
  }));
}

export default router;
