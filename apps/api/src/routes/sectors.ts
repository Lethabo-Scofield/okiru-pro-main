/**
 * Sectors Routes
 *
 * Provides sector configurations from ArangoDB as the single source of truth.
 * Replaces hardcoded sector lists with dynamic data from the database.
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '../logger.js';
import { aql } from 'arangojs';
import { getArangoDB, isArangoConnected } from '../../arango/connection.js';

const logger = createLogger("Sectors");
import { COLLECTIONS } from '../../arango/collections.js';
import { listSectorConfigs, type SectorConfig } from '../../pipeline/sectorConfig.js';
import { SectorRuleRepository } from '../../arango/repositories/sectorRuleRepository.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/sectors - List all available sectors from ArangoDB
// ---------------------------------------------------------------------------
router.get('/', async (_req: Request, res: Response) => {
  try {
    // Check if ArangoDB is connected
    if (!isArangoConnected()) {
      logger.warn('ArangoDB not connected, falling back to hardcoded sectors');
      const fallbackSectors = getFallbackSectors();
      return res.json({
        success: true,
        source: 'fallback',
        sectors: fallbackSectors,
      });
    }

    const db = getArangoDB();
    const repo = new SectorRuleRepository();

    // Query sector rules from ArangoDB
    const cursor = await db.query(aql`
      FOR s IN ${db.collection(COLLECTIONS.sectorRules)}
        SORT s.sectorCode, s.scorecardType
        RETURN {
          code: s.sectorCode,
          name: s.sectorName,
          type: s.scorecardType,
          totalPoints: s.totalMaxPoints,
          pillarConfigs: s.pillarConfigs,
          targets: s.targets,
          levelThresholds: s.levelThresholds
        }
    `);

    const sectors = await cursor.all();

    // If no sectors found in ArangoDB, seed and retry
    if (sectors.length === 0) {
      logger.info('No sectors found in ArangoDB, seeding from hardcoded configs');
      const { seedOntology } = await import('../../pipeline/seedOntology.js');
      await seedOntology();

      // Re-query after seeding
      const retryCursor = await db.query(aql`
        FOR s IN ${db.collection(COLLECTIONS.sectorRules)}
          SORT s.sectorCode, s.scorecardType
          RETURN {
            code: s.sectorCode,
            name: s.sectorName,
            type: s.scorecardType,
            totalPoints: s.totalMaxPoints,
            pillarConfigs: s.pillarConfigs,
            targets: s.targets,
            levelThresholds: s.levelThresholds
          }
      `);
      const seededSectors = await retryCursor.all();

      return res.json({
        success: true,
        source: 'seeded',
        sectors: seededSectors,
      });
    }

    return res.json({
      success: true,
      source: 'arangodb',
      sectors,
    });
  } catch (error: unknown) {
    logger.error('Error fetching sectors', error);
    const fallbackSectors = getFallbackSectors();
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch sectors',
      sectors: fallbackSectors,
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/sectors/options - Get simplified dropdown options
// ---------------------------------------------------------------------------
router.get('/options', async (_req: Request, res: Response) => {
  try {
    if (!isArangoConnected()) {
      logger.warn('ArangoDB not connected, falling back to hardcoded options');
      return res.json({
        success: true,
        source: 'fallback',
        options: getFallbackSectorOptions(),
      });
    }

    const db = getArangoDB();

    // Query unique sector codes with their QSE availability
    const cursor = await db.query(aql`
      FOR s IN ${db.collection(COLLECTIONS.sectorRules)}
        COLLECT code = s.sectorCode INTO types = s.scorecardType
        SORT code
        RETURN {
          code: code,
          name: FIRST(
            FOR sr IN ${db.collection(COLLECTIONS.sectorRules)}
              FILTER sr.sectorCode == code
              RETURN sr.sectorName
          ),
          types: types,
          hasQSE: 'QSE' IN types
        }
    `);

    const sectorGroups = await cursor.all();

    // Map to dropdown format
    const options = sectorGroups.map(group => ({
      value: group.code,
      label: group.name || `${group.code} Sector Code`,
      code: group.code,
      hasQSE: group.hasQSE,
      availableTypes: group.types,
    }));

    return res.json({
      success: true,
      source: 'arangodb',
      options,
    });
  } catch (error: unknown) {
    logger.error('Error fetching sector options', error);
    // Respond 200 so browsers and SPA fetch() can read fallback `options` (do not rely on scraping 500 bodies).
    return res.status(200).json({
      success: true,
      source: 'fallback_after_error',
      warning: error instanceof Error ? error.message : 'Failed to fetch sector options',
      options: getFallbackSectorOptions(),
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/sectors/:sectorCode/:scorecardType - Get specific sector config
// ---------------------------------------------------------------------------
router.get('/:sectorCode/:scorecardType', async (req: Request, res: Response) => {
  try {
    const sectorCode = Array.isArray(req.params.sectorCode) ? req.params.sectorCode[0] : req.params.sectorCode;
    const scorecardType = Array.isArray(req.params.scorecardType) ? req.params.scorecardType[0] : req.params.scorecardType;

    if (!isArangoConnected()) {
      return res.status(503).json({
        success: false,
        error: 'ArangoDB not connected',
      });
    }

    const db = getArangoDB();

    const cursor = await db.query(aql`
      FOR s IN ${db.collection(COLLECTIONS.sectorRules)}
        FILTER s.sectorCode == ${sectorCode.toUpperCase()}
           AND s.scorecardType == ${scorecardType}
        LIMIT 1
        RETURN s
    `);

    const config = await cursor.next();

    if (!config) {
      return res.status(404).json({
        success: false,
        error: `Sector ${sectorCode} ${scorecardType} not found`,
      });
    }

    return res.json({
      success: true,
      config,
    });
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

// ---------------------------------------------------------------------------
// POST /api/sectors/seed - Seed sectors from hardcoded configs (admin only)
// ---------------------------------------------------------------------------
router.post('/seed', async (_req: Request, res: Response) => {
  try {
    const { seedOntology } = await import('../../pipeline/seedOntology.js');
    const result = await seedOntology({ force: true });

    return res.json({
      success: true,
      message: 'Sectors seeded successfully',
      result: {
        totalSectors: result.totalSectors,
        totalCriteria: result.totalCriteria,
        totalEntityFields: result.totalEntityFields,
      },
    });
  } catch (error: unknown) {
    logger.error('Error seeding sectors', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to seed sectors',
    });
  }
});

// ---------------------------------------------------------------------------
// Fallback helpers — derived from `sectorConfig.ts` (single source of truth).
//
// Both the ArangoDB-backed code paths above and these fallbacks read from the
// same `listSectorConfigs()` registry, which guarantees no duplicate or
// drifting sector entries between the two paths. Adding a new sector to
// `ALL_CONFIGS` in sectorConfig.ts automatically surfaces it here too.
// ---------------------------------------------------------------------------

function getFallbackSectors() {
  return listSectorConfigs().map(c => ({
    code: c.code,
    name: c.name,
    type: c.type,
    totalPoints: c.totalPoints,
  }));
}

function getFallbackSectorOptions() {
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
  }));
}

export default router;
