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
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch sector options',
      options: getFallbackSectorOptions(),
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/sectors/:sectorCode/:scorecardType - Get specific sector config
// ---------------------------------------------------------------------------
router.get('/:sectorCode/:scorecardType', async (req: Request, res: Response) => {
  try {
    const { sectorCode, scorecardType } = req.params;

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
    const { sectorCode } = req.params;
    const scorecardType = (req.query.type as string) || 'Generic';

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
// Fallback helpers
// ---------------------------------------------------------------------------

function getFallbackSectors() {
  // Based on hardcoded sectorConfig.ts
  return [
    {
      code: 'RCOGP',
      name: 'Revised Codes of Good Practice (RCOGP)',
      type: 'Generic',
      totalPoints: 120,
    },
    {
      code: 'RCOGP',
      name: 'Revised Codes (QSE)',
      type: 'QSE',
      totalPoints: 108,
    },
    {
      code: 'ICT',
      name: 'ICT Sector Code (Generic)',
      type: 'Generic',
      totalPoints: 140,
    },
    {
      code: 'ICT',
      name: 'ICT Sector Code (QSE)',
      type: 'QSE',
      totalPoints: 116,
    },
    {
      code: 'FSC',
      name: 'Financial Sector Code (Generic)',
      type: 'Generic',
      totalPoints: 120,
    },
    {
      code: 'AGRI',
      name: 'AgriBEE Sector Code (Generic)',
      type: 'Generic',
      totalPoints: 132,
    },
    {
      code: 'TRANSPORT',
      name: 'Transport Sector Code (Large Enterprise)',
      type: 'Generic',
      totalPoints: 108,
    },
    {
      code: 'TRANSPORT',
      name: 'Transport Sector Code (QSE)',
      type: 'QSE',
      totalPoints: 107,
    },
  ];
}

function getFallbackSectorOptions() {
  return [
    { value: 'RCOGP', label: 'Revised Codes of Good Practice (RCOGP)', code: 'RCOGP', hasQSE: true, availableTypes: ['Generic', 'QSE'] },
    { value: 'ICT', label: 'ICT Sector Code', code: 'ICT', hasQSE: true, availableTypes: ['Generic', 'QSE'] },
    { value: 'FSC', label: 'Financial Sector Code (FSC)', code: 'FSC', hasQSE: false, availableTypes: ['Generic'] },
    { value: 'AGRI', label: 'AgriBEE Sector Code', code: 'AGRI', hasQSE: false, availableTypes: ['Generic'] },
    { value: 'TRANSPORT', label: 'Transport Sector Code', code: 'TRANSPORT', hasQSE: true, availableTypes: ['Generic', 'QSE'] },
  ];
}

export default router;
