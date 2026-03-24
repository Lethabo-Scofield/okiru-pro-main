/**
 * Scorecard Routes
 *
 * Proxies scorecard operations to the Computation Engine via the compute client.
 * Supports listing models, compiling toolkits, evaluating scorecards, and health checks.
 */

import { Router, type Request, type Response } from 'express';
import { aql } from 'arangojs';
import { getComputeClient } from '../../pipeline/computeClient.js';
import { getArangoDB } from '../../arango/connection.js';
import { COLLECTIONS } from '../../arango/collections.js';
import { generateScorecardSummary } from '../../pipeline/scorecardSummaryGenerator.js';

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

    if (!versionId || typeof versionId !== 'string') {
      return res.status(404).json({
        message: `No active model found for sector ${sectorCode}/${scorecardType}. Compile a toolkit first with sectorCode and scorecardType.`,
      });
    }

    const result = await computeClient.evaluateModel(versionId, overrides ?? undefined);
    return res.json(result);
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

export default router;
