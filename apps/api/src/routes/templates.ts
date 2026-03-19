/**
 * Template Routes
 *
 * Unified ingestion pipeline:
 *   1. Node.js extracts structure + formula graph from Excel
 *   2. Stores in ArangoDB (scorecards, pillars, indicators, cells, dependencies)
 *   3. Forwards to Python Computation Engine for executable model compilation
 *   4. Links graph IDs between both systems
 *
 * Also provides dev/expert inspection endpoints for cells, graphs, and accuracy.
 */

import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { aql } from 'arangojs';
import {
  buildFormulaGraph,
  extractScorecardStructure,
  extractScorecardSubgraph,
} from '../../pipeline/formulaGraphBuilder.js';
import { ingestToolkitFromBuffer, ingestAllToolkits } from '../../arango/ingestion/templateIngester.js';
import { GraphRepository } from '../../arango/repositories/graphRepository.js';
import { ScorecardRepository } from '../../arango/repositories/scorecardRepository.js';
import { getComputeClient } from '../../pipeline/computeClient.js';
import { getArangoDB } from '../../arango/connection.js';
import { COLLECTIONS } from '../../arango/collections.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const graphRepo = new GraphRepository();
const scorecardRepo = new ScorecardRepository();

// ---------------------------------------------------------------------------
// POST /api/templates/ingest - Upload toolkit, extract everything, store in ArangoDB
// ---------------------------------------------------------------------------
router.post('/ingest', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Excel file is required (multipart field: file)' });
    }

    const sectorCode = req.body.sectorCode as string | undefined;
    const scorecardType = req.body.scorecardType as string | undefined;
    const filename = req.file.originalname || 'upload.xlsx';
    const buffer = req.file.buffer;

    const ingestionResult = await ingestToolkitFromBuffer(buffer, filename, sectorCode, scorecardType);

    let computeModelId: string | null = null;
    try {
      const computeClient = getComputeClient();
      const available = await computeClient.isAvailable();
      if (available) {
        const modelVersion = await computeClient.compileToolkit(
          buffer,
          filename,
          {
            sectorCode: ingestionResult.extractedStructure?.sectorCode || sectorCode || 'RCOGP',
            scorecardType: ingestionResult.extractedStructure?.scorecardType || scorecardType || 'Generic',
            graphKey: ingestionResult.graphKey || '',
          },
        );
        computeModelId = modelVersion.version_id;

        if (ingestionResult.graphKey && computeModelId) {
          try {
            const db = getArangoDB();
            await db.collection(COLLECTIONS.formulaGraphs).update(
              ingestionResult.graphKey,
              { computeModelId, linkedAt: new Date().toISOString() },
            );
          } catch { /* linking is optional */ }
        }
      }
    } catch (err: unknown) {
      console.warn('[Templates] Computation Engine compile failed (non-blocking):', err);
    }

    return res.json({
      success: true,
      scorecardKey: ingestionResult.scorecardKey,
      graphKey: ingestionResult.graphKey,
      computeModelId,
      pillars: ingestionResult.pillarCount,
      indicators: ingestionResult.indicatorCount,
      targets: ingestionResult.targetCount,
      graphNodes: ingestionResult.graphNodeCount,
      graphEdges: ingestionResult.graphEdgeCount,
      structure: ingestionResult.extractedStructure,
      errors: ingestionResult.errors,
    });
  } catch (error: unknown) {
    console.error('[Templates] ingest error:', error);
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Ingestion failed',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/templates - List all ingested templates
// ---------------------------------------------------------------------------
router.get('/', async (_req: Request, res: Response) => {
  try {
    const graphs = await graphRepo.listFormulaGraphs();
    return res.json(graphs);
  } catch (error: unknown) {
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to list templates',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/templates/:id/cells - Get all cells for a template graph
// ---------------------------------------------------------------------------
router.get('/:id/cells', async (req: Request, res: Response) => {
  try {
    const cells = await graphRepo.getGraphCells(req.params.id);
    return res.json({
      graphKey: req.params.id,
      totalCells: cells.length,
      formulaCells: cells.filter(c => c.formula).length,
      inputCells: cells.filter(c => !c.formula).length,
      cells,
    });
  } catch (error: unknown) {
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to get cells',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/templates/:id/graph - Get dependency graph metadata + edges
// ---------------------------------------------------------------------------
router.get('/:id/graph', async (req: Request, res: Response) => {
  try {
    const graph = await graphRepo.getFormulaGraph(req.params.id);
    if (!graph) return res.status(404).json({ message: 'Graph not found' });

    const cells = await graphRepo.getGraphCells(req.params.id);
    const edges = cells.flatMap(c =>
      c.dependsOn.map(dep => ({ from: dep, to: c.address }))
    );

    const pillarGroups: Record<string, number> = {};
    for (const c of cells) {
      if (c.semanticTag && 'pillar' in c.semanticTag) {
        pillarGroups[c.semanticTag.pillar] = (pillarGroups[c.semanticTag.pillar] || 0) + 1;
      }
    }

    return res.json({
      ...graph,
      edges,
      pillarGroups,
      nodes: cells.map(c => ({
        id: c.address,
        sheet: c.sheet,
        formula: c.formula,
        value: c.value,
        semanticTag: c.semanticTag,
        dependencyCount: c.dependsOn.length,
      })),
    });
  } catch (error: unknown) {
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to get graph',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/templates/:id/structure - Get extracted pillar/indicator structure
// ---------------------------------------------------------------------------
router.get('/:id/structure', async (req: Request, res: Response) => {
  try {
    const graph = await graphRepo.getFormulaGraph(req.params.id);
    if (!graph) return res.status(404).json({ message: 'Graph not found' });

    const db = getArangoDB();
    const cursor = await db.query(aql`
      FOR sc IN ${db.collection(COLLECTIONS.scorecards)}
        FILTER sc.sourceFile == ${graph.sourceFile}
        SORT sc.createdAt DESC
        LIMIT 1
        LET pillars = (
          FOR p IN ${db.collection(COLLECTIONS.pillars)}
            FILTER p.scorecardId == sc._key
            SORT p.displayOrder ASC
            LET indicators = (
              FOR i IN ${db.collection(COLLECTIONS.indicators)}
                FILTER i.pillarId == p._key
                LET targets = (
                  FOR ct IN ${db.collection(COLLECTIONS.complianceTargets)}
                    FILTER ct.indicatorId == i._key
                    RETURN ct
                )
                RETURN MERGE(i, { targets })
            )
            RETURN MERGE(p, { indicators })
        )
        RETURN MERGE(sc, { pillars })
    `);

    const result = await cursor.next();
    if (!result) return res.status(404).json({ message: 'Scorecard structure not found' });
    return res.json(result);
  } catch (error: unknown) {
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to get structure',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/templates/:id/evaluate - Evaluate template with overrides
// ---------------------------------------------------------------------------
router.post('/:id/evaluate', async (req: Request, res: Response) => {
  try {
    const graph = await graphRepo.getFormulaGraph(req.params.id);
    if (!graph) return res.status(404).json({ message: 'Graph not found' });

    const computeClient = getComputeClient();
    const db = getArangoDB();

    const linkCursor = await db.query(aql`
      FOR g IN ${db.collection(COLLECTIONS.formulaGraphs)}
        FILTER g._key == ${req.params.id}
        RETURN g.computeModelId
    `);
    const rows = await linkCursor.all();
    const computeModelId = rows[0];

    if (!computeModelId) {
      return res.status(400).json({
        message: 'No computation model linked. Re-ingest the template to compile.',
      });
    }

    const overrides = req.body.overrides as Record<string, unknown> | undefined;
    const result = await computeClient.evaluateModel(computeModelId, overrides);
    return res.json(result);
  } catch (error: unknown) {
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Evaluation failed',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/templates/:id/compare - Compare ArangoDB eval vs toolkit ground truth
// ---------------------------------------------------------------------------
router.post('/:id/compare', upload.single('truthFile'), async (req: Request, res: Response) => {
  try {
    const graph = await graphRepo.getFormulaGraph(req.params.id);
    if (!graph) return res.status(404).json({ message: 'Graph not found' });

    if (!req.file) {
      return res.status(400).json({ message: 'Ground truth Excel file is required' });
    }

    const truthBuffer = req.file.buffer;
    const truthFilename = req.file.originalname || 'truth.xlsx';

    const truthGraph = buildFormulaGraph(truthBuffer, truthFilename);
    const truthStructure = extractScorecardStructure(truthGraph, truthBuffer, truthFilename);

    const storedCells = await graphRepo.getGraphCells(req.params.id);

    const comparison: Array<{
      address: string;
      sheet: string;
      storedValue: unknown;
      truthValue: unknown;
      formula: string | null;
      match: boolean;
      delta: number | null;
      semanticTag: unknown;
    }> = [];

    let matches = 0;
    let mismatches = 0;

    for (const stored of storedCells) {
      const truthCell = truthGraph.cells[stored.address];
      if (!truthCell) continue;

      const sv = typeof stored.value === 'number' ? stored.value : null;
      const tv = typeof truthCell.value === 'number' ? truthCell.value : null;

      const isMatch = sv !== null && tv !== null
        ? Math.abs(sv - tv) < 0.01
        : String(stored.value) === String(truthCell.value);

      if (isMatch) matches++;
      else mismatches++;

      comparison.push({
        address: stored.address,
        sheet: stored.sheet,
        storedValue: stored.value,
        truthValue: truthCell.value,
        formula: stored.formula,
        match: isMatch,
        delta: sv !== null && tv !== null ? Math.round((sv - tv) * 10000) / 10000 : null,
        semanticTag: stored.semanticTag,
      });
    }

    const total = matches + mismatches;
    return res.json({
      graphKey: req.params.id,
      truthFile: truthFilename,
      totalCompared: total,
      matches,
      mismatches,
      accuracy: total > 0 ? Math.round((matches / total) * 10000) / 100 : 0,
      truthStructure,
      details: comparison.filter(c => !c.match).slice(0, 100),
    });
  } catch (error: unknown) {
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Comparison failed',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/templates/:id/trace/:cellAddress - Trace dependencies for a cell
// ---------------------------------------------------------------------------
router.get('/:id/trace/:cellAddress', async (req: Request, res: Response) => {
  try {
    const { id, cellAddress } = req.params;
    const direction = req.query.direction === 'forward' ? 'forward' : 'backward';
    const maxDepth = parseInt(req.query.maxDepth as string) || 10;

    if (direction === 'forward') {
      const result = await graphRepo.traceDependents(id, cellAddress, maxDepth);
      return res.json(result);
    } else {
      const result = await graphRepo.traceDependencies(id, cellAddress, maxDepth);
      return res.json(result);
    }
  } catch (error: unknown) {
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Trace failed',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/templates/:id/pillar/:pillarCode - Get cells for a specific pillar
// ---------------------------------------------------------------------------
router.get('/:id/pillar/:pillarCode', async (req: Request, res: Response) => {
  try {
    const cells = await graphRepo.getCellsByPillar(req.params.id, req.params.pillarCode);
    return res.json({
      graphKey: req.params.id,
      pillar: req.params.pillarCode,
      totalCells: cells.length,
      cells,
    });
  } catch (error: unknown) {
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to get pillar cells',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/templates/ingest-all - Bulk ingest all 6 toolkit Excel files
// ---------------------------------------------------------------------------
router.post('/ingest-all', async (req: Request, res: Response) => {
  try {
    const basePath = req.body.basePath as string | undefined;
    if (!basePath) {
      return res.status(400).json({
        message: 'basePath is required (path to BBBEE Toolkits directory)',
      });
    }
    const result = await ingestAllToolkits(basePath);
    return res.json(result);
  } catch (error: unknown) {
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Bulk ingestion failed',
    });
  }
});

export default router;
