/**
 * Accuracy & Ingestion Routes
 *
 * Endpoints for:
 * - Ingesting B-BBEE toolkit templates into ArangoDB
 * - Running accuracy comparisons (ArangoDB vs toolkit)
 * - Querying the knowledge graph
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '../logger.js';
import * as fs from 'fs';
import { requireAuth } from '../middleware/auth.js';

const logger = createLogger("Accuracy");
import { buildFormulaGraph, extractScorecardSubgraph } from '../../pipeline/formulaGraphBuilder.js';
import { parseExcelBuffer, buildPipelineResult } from '../../pipeline/index.js';
import { validateAll } from '../../pipeline/extraction/index.js';

const router = Router();

/**
 * POST /api/accuracy/ingest
 * Ingest a toolkit template: parse formulas, build graph, store in ArangoDB.
 * Body: { filePath: string, sectorCode: string, scorecardType: string }
 */
router.post('/ingest', requireAuth, async (req: Request, res: Response) => {
  try {
    const { filePath, sectorCode, scorecardType } = req.body as {
      filePath?: string;
      sectorCode?: string;
      scorecardType?: string;
    };

    if (!filePath || !sectorCode || !scorecardType) {
      return res.status(400).json({ message: 'filePath, sectorCode, and scorecardType are required' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: `File not found: ${filePath}` });
    }

    const buffer = fs.readFileSync(filePath);
    const fileName = filePath.split(/[\\/]/).pop() || 'unknown.xlsx';

    const fullGraph = buildFormulaGraph(buffer, fileName);
    const subGraph = extractScorecardSubgraph(fullGraph);
    const effectiveGraph = subGraph.nodes.length > 10 ? subGraph : fullGraph;

    return res.json({
      status: 'success',
      file: fileName,
      sectorCode,
      scorecardType,
      graph: {
        totalCells: effectiveGraph.metadata.totalCells,
        formulaCells: effectiveGraph.metadata.formulaCells,
        inputCells: effectiveGraph.metadata.inputCells,
        edgeCount: effectiveGraph.metadata.edgeCount,
        hasCycles: effectiveGraph.metadata.hasCycles,
        sheets: effectiveGraph.sheets,
      },
      scorecardSubgraph: {
        totalCells: subGraph.metadata.totalCells,
        formulaCells: subGraph.metadata.formulaCells,
      },
    });
  } catch (error: unknown) {
    logger.error('Ingest error', error);
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Ingestion failed',
    });
  }
});

/**
 * POST /api/accuracy/compare
 * Compare toolkit Excel scorecard values against pipeline-calculated values.
 * Upload the Excel file via multipart form data.
 */
router.post('/compare', requireAuth, async (req: Request, res: Response) => {
  try {
    const { filePath } = req.body as { filePath?: string };

    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(400).json({ message: 'Valid filePath required' });
    }

    const buffer = fs.readFileSync(filePath);
    const fileName = filePath.split(/[\\/]/).pop() || 'unknown.xlsx';

    const parseResult = parseExcelBuffer(buffer, fileName);
    const pipelineResult = buildPipelineResult(parseResult, fileName);

    const toolkitScores = parseResult.scorecardValues || {};

    const pillars = [
      { code: 'ownership', name: 'Ownership', maxPts: 25 },
      { code: 'managementControl', name: 'Management Control', maxPts: 8 },
      { code: 'employmentEquity', name: 'Employment Equity', maxPts: 11 },
      { code: 'skillsDevelopment', name: 'Skills Development', maxPts: 25 },
      { code: 'preferentialProcurement', name: 'Preferential Procurement', maxPts: 27 },
      { code: 'enterpriseSupplierDevelopment', name: 'Enterprise & Supplier Development', maxPts: 15 },
      { code: 'socioEconomicDevelopment', name: 'Socio-Economic Development', maxPts: 5 },
    ];

    const comparison = pillars.map(p => {
      const calculated = (pipelineResult.scorecard.pillars as Record<string, number>)[p.code] || 0;
      const toolkit = toolkitScores[p.code];
      const hasToolkitValue = toolkit !== undefined;
      const deviation = hasToolkitValue ? Math.abs(calculated - toolkit) : null;
      const match = hasToolkitValue ? deviation! < 0.5 : null;

      return {
        pillar: p.name,
        code: p.code,
        maxPoints: p.maxPts,
        calculated,
        toolkit: hasToolkitValue ? toolkit : null,
        deviation,
        match,
        status: !hasToolkitValue ? 'no_reference' : match ? 'pass' : 'fail',
      };
    });

    const totalCalc = pipelineResult.scorecard.pillars.totalPoints;
    const totalToolkit = toolkitScores.totalPoints;

    const validation = validateAll({
      shareholders: parseResult.shareholders.map(s => ({
        name: s.name,
        blackOwnership: s.blackOwnership,
        blackWomenOwnership: s.blackWomenOwnership,
        shares: s.shares,
      })),
      financials: {
        revenue: parseResult.client.revenue,
        npat: parseResult.client.npat,
        leviableAmount: parseResult.client.leviableAmount,
        tmps: parseResult.client.tmps,
        payroll: parseResult.client.payroll,
      },
      employees: parseResult.employees.map(e => ({
        race: e.race,
        gender: e.gender,
        designation: e.designation,
      })),
      suppliers: parseResult.suppliers.map(s => ({
        beeLevel: s.beeLevel,
        spend: s.spend,
        blackOwnership: s.blackOwnership,
      })),
    });

    return res.json({
      status: 'success',
      file: fileName,
      client: pipelineResult.client.name,
      comparison,
      totals: {
        calculated: totalCalc,
        toolkit: totalToolkit ?? null,
        deviation: totalToolkit !== undefined ? Math.abs(totalCalc - totalToolkit) : null,
        match: totalToolkit !== undefined ? Math.abs(totalCalc - totalToolkit) < 1.0 : null,
      },
      beeLevel: {
        calculated: pipelineResult.scorecard.beeLevel,
        recognition: pipelineResult.scorecard.recognitionLevelPercent,
      },
      validation: {
        valid: validation.valid,
        issueCount: validation.issues.length,
        issues: validation.issues,
      },
      extractionStats: {
        sheetsFound: pipelineResult.sheetsFound.length,
        sheetsMatched: pipelineResult.sheetsMatched.length,
        shareholders: pipelineResult.ownership.shareholders.length,
        employees: pipelineResult.managementControl.employeesCount,
        suppliers: pipelineResult.preferentialProcurement.suppliersCount,
        trainings: pipelineResult.skillsDevelopment.trainingProgramsCount,
      },
    });
  } catch (error: unknown) {
    logger.error('Compare error', error);
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Comparison failed',
    });
  }
});

/**
 * POST /api/accuracy/graph-analyze
 * Analyze the formula graph of an Excel toolkit file.
 */
router.post('/graph-analyze', requireAuth, async (req: Request, res: Response) => {
  try {
    const { filePath } = req.body as { filePath?: string };

    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(400).json({ message: 'Valid filePath required' });
    }

    const buffer = fs.readFileSync(filePath);
    const fileName = filePath.split(/[\\/]/).pop() || 'unknown.xlsx';

    const graph = buildFormulaGraph(buffer, fileName);
    const subgraph = extractScorecardSubgraph(graph);

    const taggedByPillar: Record<string, number> = {};
    const taggedByRole: Record<string, number> = {};
    for (const node of Object.values(graph.cells)) {
      if (node.semanticTag) {
        const tag = node.semanticTag as Record<string, unknown>;
        if (tag.pillar) {
          const p = String(tag.pillar);
          taggedByPillar[p] = (taggedByPillar[p] || 0) + 1;
        }
        if (tag.role) {
          const r = String(tag.role);
          taggedByRole[r] = (taggedByRole[r] || 0) + 1;
        }
      }
    }

    return res.json({
      status: 'success',
      file: fileName,
      fullGraph: graph.metadata,
      scorecardSubgraph: subgraph.metadata,
      sheets: graph.sheets,
      semanticTags: {
        byPillar: taggedByPillar,
        byRole: taggedByRole,
      },
    });
  } catch (error: unknown) {
    logger.error('Graph analyze error', error);
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Analysis failed',
    });
  }
});

/**
 * POST /api/accuracy/provenance
 * Extract the scorecard subgraph and return nodes/edges for visualization.
 * Returns a lightweight representation suitable for D3/force-graph rendering.
 */
router.post('/provenance', requireAuth, async (req: Request, res: Response) => {
  try {
    const { filePath, pillar } = req.body as { filePath?: string; pillar?: string };

    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(400).json({ message: 'Valid filePath required' });
    }

    const buffer = fs.readFileSync(filePath);
    const fileName = filePath.split(/[\\/]/).pop() || 'unknown.xlsx';

    const graph = buildFormulaGraph(buffer, fileName, {
      maxTotalCells: 100_000,
      maxCellsPerSheet: 20_000,
      skipCycleDetection: true,
    });

    const subgraph = extractScorecardSubgraph(graph);
    const effectiveGraph = subgraph.nodes.length > 5 ? subgraph : graph;

    let filteredNodes = Object.values(effectiveGraph.cells);
    let filteredEdges = effectiveGraph.edges;

    if (pillar) {
      const pillarNodes = new Set<string>();
      for (const node of filteredNodes) {
        const tag = node.semanticTag as Record<string, unknown> | null;
        if (tag?.pillar === pillar || tag?.role === 'financial') {
          pillarNodes.add(node.address);
        }
      }
      for (const edge of effectiveGraph.edges) {
        if (pillarNodes.has(edge.to)) pillarNodes.add(edge.from);
      }
      filteredNodes = filteredNodes.filter(n => pillarNodes.has(n.address));
      filteredEdges = filteredEdges.filter(e => pillarNodes.has(e.from) || pillarNodes.has(e.to));
    }

    const MAX_VIS_NODES = 500;
    if (filteredNodes.length > MAX_VIS_NODES) {
      const tagged = filteredNodes.filter(n => n.semanticTag !== null);
      const withFormulas = filteredNodes.filter(n => n.formula !== null && n.semanticTag === null);
      filteredNodes = [...tagged, ...withFormulas].slice(0, MAX_VIS_NODES);
      const nodeSet = new Set(filteredNodes.map(n => n.address));
      filteredEdges = filteredEdges.filter(e => nodeSet.has(e.from) && nodeSet.has(e.to));
    }

    const visNodes = filteredNodes.map(n => {
      const tag = n.semanticTag as Record<string, unknown> | null;
      return {
        id: n.address,
        sheet: n.sheet,
        formula: n.formula,
        value: n.value,
        hasFormula: !!n.formula,
        pillar: tag?.pillar || null,
        role: tag?.role || null,
        group: tag?.pillar || (n.formula ? 'formula' : 'input'),
      };
    });

    const visEdges = filteredEdges.map(e => ({
      source: e.from,
      target: e.to,
    }));

    return res.json({
      status: 'success',
      file: fileName,
      nodeCount: visNodes.length,
      edgeCount: visEdges.length,
      totalGraphNodes: effectiveGraph.nodes.length,
      nodes: visNodes,
      edges: visEdges,
      pillars: [...new Set(visNodes.map(n => n.pillar).filter(Boolean))],
      sheets: effectiveGraph.processedSheets,
    });
  } catch (error: unknown) {
    logger.error('Provenance error', error);
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Provenance extraction failed',
    });
  }
});

/**
 * GET /api/accuracy/sectors
 * List all available sector configurations.
 */
router.get('/sectors', (_req: Request, res: Response) => {
  const { listSectorConfigs } = require('../../pipeline/sectorConfig.js');
  return res.json({ sectors: listSectorConfigs() });
});

export default router;
