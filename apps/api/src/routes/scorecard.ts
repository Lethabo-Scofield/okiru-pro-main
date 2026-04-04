/**
 * Scorecard Routes
 *
 * Proxies scorecard operations to the Computation Engine via the compute client.
 * Falls back to TypeScript graph evaluator when the Python engine is unavailable.
 * Supports listing models, compiling toolkits, evaluating scorecards, and health checks.
 */

import { Router, type Request, type Response } from 'express';
import { aql } from 'arangojs';
import { getComputeClient } from '../../pipeline/computeClient.js';
import { evaluateGraphWithOverrides } from '../../pipeline/tsGraphEvaluator.js';
import { getArangoDB } from '../../arango/connection.js';
import { COLLECTIONS } from '../../arango/collections.js';
import { generateScorecardSummary } from '../../pipeline/scorecardSummaryGenerator.js';
import {
  getEntityCellMapping,
  applyEntitiesToScorecard,
  validateEntityCoverage,
  buildEntityCellMapping,
} from '../../arango/entityCellMapping.js';
import { buildManifest, getAllEntities } from '../../pipeline/extraction/entityManifest.js';
import { getSectorConfig } from '../../pipeline/sectorConfig.js';

const router = Router();
const computeClient = getComputeClient();

// ---------------------------------------------------------------------------
// GET /api/scorecard/models - List all compiled models
// ---------------------------------------------------------------------------
router.get('/models', async (_req: Request, res: Response) => {
  try {
    const models = await computeClient.listModels();
    return res.json(models);
  } catch (error: unknown) {
    console.error('[Scorecard] listModels error:', error);
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to list models',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/scorecard/models/:versionId/summary - Get model summary
// ---------------------------------------------------------------------------
router.get('/models/:versionId/summary', async (req: Request, res: Response) => {
  try {
    const versionId = String(req.params.versionId || '');
    if (!versionId) {
      return res.status(400).json({ message: 'versionId is required' });
    }
    const summary = await computeClient.getModelSummary(versionId);
    return res.json(summary);
  } catch (error: unknown) {
    console.error('[Scorecard] getModelSummary error:', error);
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to get model summary',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/scorecard/compile - Compile a toolkit
// ---------------------------------------------------------------------------
router.post('/compile', async (req: Request, res: Response) => {
  try {
    const { filePath, name, sectorCode, scorecardType } = req.body as {
      filePath?: string;
      name?: string;
      sectorCode?: string;
      scorecardType?: string;
    };

    if (!filePath || !name) {
      return res.status(400).json({ message: 'filePath and name are required' });
    }

    const metadata: Record<string, string> = {};
    if (sectorCode) metadata.sectorCode = sectorCode;
    if (scorecardType) metadata.scorecardType = scorecardType;

    const modelVersion = await computeClient.compileToolkit(
      filePath,
      name,
      Object.keys(metadata).length > 0 ? metadata : undefined
    );

    // If sectorCode/scorecardType provided, store the mapping in ArangoDB
    if (sectorCode && scorecardType) {
      try {
        const db = getArangoDB();
        const col = db.collection(COLLECTIONS.sectorModelMappings);
        const updatedAt = new Date().toISOString();
        const upsertCursor = await db.query(aql`
          UPSERT { sectorCode: ${sectorCode}, scorecardType: ${scorecardType} }
          INSERT { sectorCode: ${sectorCode}, scorecardType: ${scorecardType}, versionId: ${modelVersion.version_id}, modelName: ${modelVersion.name}, updatedAt: ${updatedAt} }
          UPDATE { versionId: ${modelVersion.version_id}, modelName: ${modelVersion.name}, updatedAt: ${updatedAt} }
          IN ${col}
          RETURN NEW
        `);
        await upsertCursor.all();
      } catch (dbError: unknown) {
        console.warn('[Scorecard] Failed to store sector mapping:', dbError);
        // Continue - compile succeeded, mapping is optional
      }
    }

    return res.json(modelVersion);
  } catch (error: unknown) {
    console.error('[Scorecard] compile error:', error);
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Compilation failed',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/scorecard/evaluate - Evaluate a scorecard by version ID
// ---------------------------------------------------------------------------
router.post('/evaluate', async (req: Request, res: Response) => {
  try {
    const { versionId, overrides } = req.body as {
      versionId?: string;
      overrides?: Record<string, unknown>;
    };

    if (!versionId) {
      return res.status(400).json({ message: 'versionId is required' });
    }

    const result = await computeClient.evaluateModel(versionId, overrides ?? undefined);
    return res.json(result);
  } catch (error: unknown) {
    console.error('[Scorecard] evaluate error:', error);
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Evaluation failed',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/scorecard/evaluate-by-sector - Evaluate by sector (looks up active model)
// ---------------------------------------------------------------------------
router.post('/evaluate-by-sector', async (req: Request, res: Response) => {
  try {
    const { sectorCode, scorecardType, overrides } = req.body as {
      sectorCode?: string;
      scorecardType?: string;
      overrides?: Record<string, unknown>;
    };

    if (!sectorCode || !scorecardType) {
      return res.status(400).json({
        message: 'sectorCode and scorecardType are required',
      });
    }

    const db = getArangoDB();
    const col = db.collection(COLLECTIONS.sectorModelMappings);
    const cursor = await db.query(aql`
      FOR doc IN ${col}
        FILTER doc.sectorCode == ${sectorCode} AND doc.scorecardType == ${scorecardType}
        SORT doc.updatedAt DESC
        LIMIT 1
        RETURN doc.versionId
    `);
    const rows = await cursor.all();
    const versionId = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;

    let result;

    if (versionId && typeof versionId === 'string') {
      try {
        const available = await computeClient.isAvailable();
        if (available) {
          result = await computeClient.evaluateModel(versionId, overrides ?? undefined);
          return res.json(result);
        }
      } catch (engineErr) {
        console.warn('[Scorecard] Computation Engine unavailable:', engineErr);
      }
    }

    const graphCursor = await db.query(aql`
      FOR g IN ${db.collection(COLLECTIONS.formulaGraphs)}
        FILTER g.sectorCode == ${sectorCode} AND g.scorecardType == ${scorecardType}
        LIMIT 1
        RETURN g._key
    `);
    const graphKeys = await graphCursor.all();
    if (graphKeys.length === 0) {
      return res.status(404).json({
        message: `No formula graph found for ${sectorCode}/${scorecardType}.`,
      });
    }

    const tsResult = await evaluateGraphWithOverrides(graphKeys[0], (overrides ?? {}) as Record<string, unknown>);
    return res.json({
      results: tsResult.results,
      stats: tsResult.stats,
      pillarScores: tsResult.pillarScores,
      engine: 'typescript-evaluator',
    });
  } catch (error: unknown) {
    console.error('[Scorecard] evaluate-by-sector error:', error);
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Evaluation by sector failed',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/scorecard/health - Check if Computation Engine is available
// ---------------------------------------------------------------------------
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const available = await computeClient.isAvailable();
    return res.json({ available });
  } catch (error: unknown) {
    console.error('[Scorecard] health check error:', error);
    return res.json({ available: false });
  }
});

// ---------------------------------------------------------------------------
// POST /api/scorecard/evaluate-from-entities
// Combined endpoint: entities → cell mapping → evaluation → scorecard
// ---------------------------------------------------------------------------
router.post('/evaluate-from-entities', async (req: Request, res: Response) => {
  try {
    const { sectorCode, scorecardType, entities } = req.body as {
      sectorCode?: string;
      scorecardType?: string;
      entities?: Record<string, number | string>;
    };

    if (!sectorCode || !scorecardType || !entities) {
      return res.status(400).json({
        message: 'sectorCode, scorecardType, and entities are required',
      });
    }

    let mapping = await getEntityCellMapping(sectorCode.toUpperCase(), scorecardType);

    if (!mapping) {
      const db = getArangoDB();
      const graphCursor = await db.query(aql`
        FOR g IN ${db.collection(COLLECTIONS.formulaGraphs)}
          FILTER g.sectorCode == ${sectorCode.toUpperCase()}
             AND g.scorecardType == ${scorecardType}
          LIMIT 1
          RETURN g._key
      `);
      const graphKeys = await graphCursor.all();

      if (graphKeys.length === 0) {
        return res.status(404).json({
          message: `No formula graph found for ${sectorCode}/${scorecardType}. Ingest the toolkit first.`,
        });
      }

      const manifest = buildManifest(sectorCode.toUpperCase(), scorecardType);
      mapping = await buildEntityCellMapping(
        graphKeys[0],
        sectorCode.toUpperCase(),
        scorecardType,
        getAllEntities(manifest),
      );
    }

    const cellOverrides = applyEntitiesToScorecard(mapping, entities);
    const coverage = validateEntityCoverage(mapping, entities);

    let evaluationResult: Record<string, unknown> = {};
    let evaluationStats: Record<string, unknown> = {};
    let usedEngine = 'none';

    try {
      const available = await computeClient.isAvailable();
      if (available) {
        const db = getArangoDB();
        const col = db.collection(COLLECTIONS.sectorModelMappings);
        const cursor = await db.query(aql`
          FOR doc IN ${col}
            FILTER doc.sectorCode == ${sectorCode.toUpperCase()}
               AND doc.scorecardType == ${scorecardType}
            SORT doc.updatedAt DESC LIMIT 1
            RETURN doc.versionId
        `);
        const rows = await cursor.all();
        const versionId = rows[0];

        if (versionId) {
          const result = await computeClient.evaluateModel(versionId, cellOverrides);
          evaluationResult = result.results;
          evaluationStats = result.stats;
          usedEngine = 'computation-engine';
        }
      }
    } catch (engineErr) {
      console.warn('[Scorecard] Computation Engine unavailable, falling back to TS evaluator:', engineErr);
    }

    if (usedEngine === 'none') {
      try {
        const tsResult = await evaluateGraphWithOverrides(mapping.graphKey, cellOverrides);
        evaluationResult = tsResult.results;
        evaluationStats = tsResult.stats;
        usedEngine = 'typescript-evaluator';
      } catch (tsErr) {
        console.error('[Scorecard] TypeScript evaluator also failed:', tsErr);
        return res.status(500).json({
          message: 'Both Computation Engine and TS evaluator failed. Check that the toolkit is properly ingested.',
          cellOverrides,
          coverage,
        });
      }
    }

    return res.json({
      success: true,
      sectorCode,
      scorecardType,
      engine: usedEngine,
      cellOverrides,
      overrideCount: Object.keys(cellOverrides).length,
      coverage,
      evaluation: {
        results: evaluationResult,
        stats: evaluationStats,
      },
    });
  } catch (error: unknown) {
    console.error('[Scorecard] evaluate-from-entities error:', error);
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Entity evaluation failed',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/scorecard/generate-summary
// Generate a formatted UI scorecard summary from a PipelineResult
// ---------------------------------------------------------------------------
router.post('/generate-summary', async (req: Request, res: Response) => {
  try {
    const { pipelineResult } = req.body;
    
    if (!pipelineResult || !pipelineResult.scorecard || !pipelineResult.client) {
      return res.status(400).json({
        message: 'Valid pipelineResult is required',
      });
    }

    const summary = generateScorecardSummary(pipelineResult);
    return res.json(summary);
  } catch (error: unknown) {
    console.error('[Scorecard] generate-summary error:', error);
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Summary generation failed',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/scorecard/sector-config/:sectorCode/:scorecardType
// Returns sector-specific calculator configuration
// Primary source: ArangoDB sector_rules collection
// Fallback: Hardcoded sectorConfig.ts
// ---------------------------------------------------------------------------
router.get('/sector-config/:sectorCode/:scorecardType', async (req: Request, res: Response) => {
  try {
    const { sectorCode, scorecardType } = req.params as { sectorCode: string; scorecardType: string };
    
    if (!sectorCode || !scorecardType) {
      return res.status(400).json({ message: 'sectorCode and scorecardType are required' });
    }

    const db = getArangoDB();
    
    // Primary: Try ArangoDB sector_rules collection
    try {
      const cursor = await db.query(aql`
        FOR sr IN ${db.collection(COLLECTIONS.sectorRules)}
          FILTER sr.sectorCode == ${sectorCode.toUpperCase()} 
             AND sr.scorecardType == ${scorecardType}
          LIMIT 1
          RETURN sr
      `);
      const rules = await cursor.all();
      
      if (rules.length > 0 && rules[0]) {
        const rule = rules[0];
        // Transform ArangoDB format to calculatorConfig format
        const config = {
          source: 'arangodb',
          sectorCode: rule.sectorCode,
          scorecardType: rule.scorecardType,
          pillarConfigs: rule.pillarConfigs || {},
          targets: rule.targets || {},
          levelThresholds: rule.levelThresholds || [],
        };
        return res.json({ success: true, config });
      }
    } catch (arangoErr) {
      console.warn('[Scorecard] ArangoDB sector_rules query failed:', arangoErr);
      // Continue to fallback
    }

    // Fallback: Use hardcoded sectorConfig.ts
    try {
      const fallbackConfig = getSectorConfig(sectorCode, scorecardType);
      const config = {
        source: 'fallback',
        sectorCode: fallbackConfig.sectorCode,
        scorecardType: fallbackConfig.scorecardType,
        pillarConfigs: fallbackConfig.pillarConfigs,
        targets: fallbackConfig.targets,
        levelThresholds: fallbackConfig.levelThresholds,
      };
      return res.json({ success: true, config, fallback: true });
    } catch (fallbackErr) {
      console.error('[Scorecard] Fallback config failed:', fallbackErr);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to load sector configuration from both ArangoDB and fallback' 
      });
    }
  } catch (error: unknown) {
    console.error('[Scorecard] sector-config error:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to get sector config',
    });
  }
});

export default router;
