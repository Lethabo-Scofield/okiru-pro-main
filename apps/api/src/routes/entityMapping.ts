/**
 * Entity-to-Cell Mapping API Routes
 *
 * Provides endpoints to:
 *   - Build entity-to-cell mappings for scorecard templates
 *   - Retrieve mappings for a sector/type
 *   - Apply extracted entities to scorecards
 *   - Validate entity coverage
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '../logger.js';
import { aql } from 'arangojs';

const logger = createLogger("EntityMapping");
import {
  buildEntityCellMapping,
  getEntityCellMapping,
  buildAllMappings,
  applyEntitiesToScorecard,
  validateEntityCoverage,
} from '../../arango/entityCellMapping.js';
import { buildManifest, getAllEntities } from '../../pipeline/extraction/entityManifest.js';
import { getArangoDB } from '../../arango/connection.js';
import { COLLECTIONS } from '../../arango/collections.js';

const router = Router();

/**
 * Find the latest formula graph for a sector code and scorecard type
 */
async function findGraphForSector(sectorCode: string, scorecardType: string): Promise<string | null> {
  const db = getArangoDB();
  const cursor = await db.query(aql`
    FOR g IN ${db.collection(COLLECTIONS.formulaGraphs)}
      FILTER g.sectorCode == ${sectorCode.toUpperCase()} 
        OR g.scorecardType == ${scorecardType}
        OR g.sourceFile LIKE ${'%' + sectorCode.toUpperCase() + '%'}
      SORT g.createdAt DESC
      LIMIT 1
      RETURN g._key
  `);
  const result = await cursor.next();
  return result || null;
}

/**
 * POST /api/entity-mappings/build/:sectorCode/:scorecardType
 *
 * Build entity-to-cell mapping for a specific template.
 */
router.post('/build/:sectorCode/:scorecardType', async (req: Request, res: Response) => {
  try {
    const { sectorCode, scorecardType } = req.params;
    let { graphKey } = req.body;

    // Auto-lookup graph key if not provided
    if (!graphKey) {
      graphKey = await findGraphForSector(sectorCode, scorecardType);
      if (!graphKey) {
        return res.status(404).json({ 
          message: `No formula graph found for ${sectorCode}/${scorecardType}. Please ingest a template first.` 
        });
      }
      logger.info('Auto-resolved graphKey', { graphKey, sectorCode, scorecardType });
    }

    // Get required entities for this sector/type
    const manifest = await buildManifest(sectorCode, scorecardType);

    // Build the mapping
    const mapping = await buildEntityCellMapping(
      graphKey,
      sectorCode.toUpperCase(),
      scorecardType,
      getAllEntities(manifest),
    );

    return res.json({
      success: true,
      mapping: {
        sectorCode: mapping.sectorCode,
        scorecardType: mapping.scorecardType,
        graphKey: mapping.graphKey,
        scorecardKey: mapping.scorecardKey,
        coverage: mapping.coverage,
        mappingCount: mapping.mappings.length,
        topMappings: mapping.mappings.slice(0, 10).map(m => ({
          entityName: m.entityName,
          cellAddresses: m.cellAddresses,
          confidence: m.confidence,
          matchReason: m.matchReason,
        })),
      },
    });
  } catch (error: unknown) {
    logger.error('Build error', error);
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to build mapping',
    });
  }
});

/**
 * POST /api/entity-mappings/build-all
 *
 * Build mappings for all 6 scorecard templates.
 */
router.post('/build-all', async (_req: Request, res: Response) => {
  try {
    // Build manifests for all 6 templates
    const manifests = await Promise.all([
      buildManifest('RCOGP', 'Generic'),
      buildManifest('ICT', 'Generic'),
      buildManifest('ICT', 'QSE'),
      buildManifest('RCOGP', 'QSE'),
      buildManifest('FSC', 'Generic'),
      buildManifest('AGRI', 'Generic'),
    ]);

    const results: Array<{
      sectorCode: string;
      scorecardType: string;
      coveragePercent: number;
      mapped: number;
      unmapped: number;
    }> = [];

    for (const manifest of manifests) {
      const allMappings = await buildAllMappings(getAllEntities(manifest));
      for (const { sectorCode, scorecardType, mapping } of allMappings) {
        if (sectorCode === manifest.sectorCode && scorecardType === manifest.scorecardType) {
          results.push({
            sectorCode,
            scorecardType,
            coveragePercent: mapping.coverage.coveragePercent,
            mapped: mapping.coverage.mappedEntities,
            unmapped: mapping.coverage.unmappedEntities.length,
          });
        }
      }
    }

    return res.json({
      success: true,
      results,
      summary: {
        total: results.length,
        avgCoverage: Math.round(results.reduce((a, b) => a + b.coveragePercent, 0) / results.length),
      },
    });
  } catch (error: unknown) {
    logger.error('Build-all error', error);
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to build all mappings',
    });
  }
});

/**
 * GET /api/entity-mappings/:sectorCode/:scorecardType
 *
 * Get existing mapping for a sector/type.
 */
router.get('/:sectorCode/:scorecardType', async (req: Request, res: Response) => {
  try {
    const { sectorCode, scorecardType } = req.params;

    const mapping = await getEntityCellMapping(
      sectorCode.toUpperCase(),
      scorecardType,
    );

    if (!mapping) {
      return res.status(404).json({
        message: `No mapping found for ${sectorCode}/${scorecardType}. Build it first.`,
      });
    }

    return res.json({
      success: true,
      mapping: {
        sectorCode: mapping.sectorCode,
        scorecardType: mapping.scorecardType,
        graphKey: mapping.graphKey,
        scorecardKey: mapping.scorecardKey,
        coverage: mapping.coverage,
        mappings: mapping.mappings,
      },
    });
  } catch (error: unknown) {
    logger.error('Get mapping error', error);
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to get mapping',
    });
  }
});

/**
 * POST /api/entity-mappings/apply
 *
 * Apply extracted entities to a scorecard.
 * Body: { sectorCode, scorecardType, entities: { entityName: value } }
 */
router.post('/apply', async (req: Request, res: Response) => {
  try {
    const { sectorCode, scorecardType, entities } = req.body;

    if (!sectorCode || !scorecardType || !entities) {
      return res.status(400).json({
        message: 'sectorCode, scorecardType, and entities are required',
      });
    }

    const mapping = await getEntityCellMapping(sectorCode.toUpperCase(), scorecardType);

    if (!mapping) {
      return res.status(404).json({
        message: `No mapping found for ${sectorCode}/${scorecardType}. Build it first.`,
      });
    }

    // Apply entities to get cell overrides
    const overrides = applyEntitiesToScorecard(mapping, entities);

    // Validate coverage
    const validation = validateEntityCoverage(mapping, entities);

    return res.json({
      success: true,
      sectorCode,
      scorecardType,
      cellOverrides: overrides,
      overrideCount: Object.keys(overrides).length,
      validation,
      canCalculate: validation.valid,
    });
  } catch (error: unknown) {
    logger.error('Apply error', error);
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to apply entities',
    });
  }
});

/**
 * GET /api/entity-mappings/:sectorCode/:scorecardType/unmapped
 *
 * Get list of unmapped entities (for debugging/improvement).
 */
router.get('/:sectorCode/:scorecardType/unmapped', async (req: Request, res: Response) => {
  try {
    const { sectorCode, scorecardType } = req.params;

    const mapping = await getEntityCellMapping(
      sectorCode.toUpperCase(),
      scorecardType,
    );

    if (!mapping) {
      return res.status(404).json({
        message: `No mapping found for ${sectorCode}/${scorecardType}. Build it first.`,
      });
    }

    return res.json({
      success: true,
      sectorCode: mapping.sectorCode,
      scorecardType: mapping.scorecardType,
      unmappedEntities: mapping.coverage.unmappedEntities,
      totalUnmapped: mapping.coverage.unmappedEntities.length,
    });
  } catch (error: unknown) {
    logger.error('Unmapped entities error', error);
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to get unmapped entities',
    });
  }
});

export default router;
