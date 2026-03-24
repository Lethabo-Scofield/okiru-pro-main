/**
 * Template Ingester
 *
 * Ingests B-BBEE toolkit Excel templates into ArangoDB.
 * ALL scorecard structure (pillars, indicators, targets, weights)
 * is extracted from the Excel file itself via formulaGraphBuilder.
 * No hardcoded pillar definitions exist in this module.
 *
 * Flow:
 *   1. Read Excel file
 *   2. Build formula graph (extracting cell values, formulas, dependencies)
 *   3. Extract scorecard structure from the graph (pillar detection, targets, weights)
 *   4. Store structure in ArangoDB (scorecards, pillars, indicators, compliance_targets)
 *   5. Store formula graph in ArangoDB (formula_graphs, cells, cell_dependency)
 */

import * as fs from 'fs';
import {
  buildFormulaGraph,
  extractScorecardSubgraph,
  extractScorecardStructure,
} from '../../pipeline/formulaGraphBuilder.js';
import type { ExtractedScorecardStructure, ExtractedPillar } from '../../pipeline/formulaGraphBuilder.js';
import { ScorecardRepository, GraphRepository } from '../repositories/index.js';
import type { ScorecardTemplate, Pillar, Indicator, ComplianceTarget } from '../repositories/index.js';

export interface IngestionResult {
  scorecardKey: string;
  graphKey: string | null;
  pillarCount: number;
  indicatorCount: number;
  targetCount: number;
  graphNodeCount: number;
  graphEdgeCount: number;
  extractedStructure: ExtractedScorecardStructure | null;
  errors: string[];
}

/**
 * Ingest a single toolkit Excel file.
 * Extracts all structure from the Excel -- no hardcoded definitions.
 */
export async function ingestToolkitTemplate(
  filePath: string,
  sectorCodeOverride?: string,
  scorecardTypeOverride?: string,
): Promise<IngestionResult> {
  const errors: string[] = [];
  const scorecardRepo = new ScorecardRepository();
  const graphRepo = new GraphRepository();
  const fileName = filePath.split(/[\\/]/).pop() || filePath;

  if (!fs.existsSync(filePath)) {
    return {
      scorecardKey: '', graphKey: null, pillarCount: 0, indicatorCount: 0,
      targetCount: 0, graphNodeCount: 0, graphEdgeCount: 0,
      extractedStructure: null, errors: [`File not found: ${filePath}`],
    };
  }

  const buffer = fs.readFileSync(filePath);

  const fullGraph = buildFormulaGraph(buffer, fileName);
  const structure = extractScorecardStructure(fullGraph, buffer, fileName);

  if (sectorCodeOverride) structure.sectorCode = sectorCodeOverride;
  if (scorecardTypeOverride) structure.scorecardType = scorecardTypeOverride;

  const template: ScorecardTemplate = {
    name: `${structure.sectorCode} ${structure.scorecardType} Scorecard`,
    sectorCode: structure.sectorCode,
    scorecardType: structure.scorecardType,
    version: '1.0',
    totalMaxPoints: structure.totalMaxPoints,
    levelThresholds: structure.levelThresholds,
    createdAt: new Date().toISOString(),
    sourceFile: fileName,
  };

  const scorecard = await scorecardRepo.createScorecard(template);
  const scorecardKey = scorecard._key!;

  let indicatorCount = 0;
  let targetCount = 0;

  for (const pDef of structure.pillars) {
    const pillar: Pillar = {
      scorecardId: scorecardKey,
      name: pDef.name,
      code: pDef.code,
      maxPoints: pDef.maxPoints,
      hasSubMinimum: pDef.hasSubMinimum,
      subMinimumThreshold: pDef.subMinimumThreshold,
      displayOrder: pDef.displayOrder,
    };

    const savedPillar = await scorecardRepo.createPillar(pillar);

    for (const iDef of pDef.indicators) {
      const indicator: Indicator = {
        pillarId: savedPillar._key!,
        name: iDef.name,
        code: iDef.code,
        maxPoints: iDef.maxPoints,
        description: `Extracted from ${fileName}`,
      };

      const savedIndicator = await scorecardRepo.createIndicator(indicator);
      indicatorCount++;

      const ct: ComplianceTarget = {
        indicatorId: savedIndicator._key!,
        sectorCode: structure.sectorCode,
        targetValue: iDef.targetValue,
        targetUnit: iDef.targetUnit,
        targetBase: iDef.targetBase,
        weighting: iDef.maxPoints,
      };
      await scorecardRepo.createComplianceTarget(ct);
      targetCount++;
    }
  }

  let graphKey: string | null = null;
  let graphNodeCount = 0;
  let graphEdgeCount = 0;

  try {
    const subGraph = extractScorecardSubgraph(fullGraph);
    const graphToStore = subGraph.nodes.length > 0 ? subGraph : fullGraph;

    graphKey = await graphRepo.storeFormulaGraph(
      graphToStore,
      structure.scorecardType,
      structure.sectorCode,
      fileName,
    );

    graphNodeCount = graphToStore.nodes.length;
    graphEdgeCount = graphToStore.edges.length;
  } catch (err: unknown) {
    errors.push(`Graph storage failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    scorecardKey,
    graphKey,
    pillarCount: structure.pillars.length,
    indicatorCount,
    targetCount,
    graphNodeCount,
    graphEdgeCount,
    extractedStructure: structure,
    errors,
  };
}

/**
 * Ingest from a buffer (for API uploads, no file path needed).
 */
export async function ingestToolkitFromBuffer(
  buffer: Buffer,
  filename: string,
  sectorCode?: string,
  scorecardType?: string,
): Promise<IngestionResult> {
  const errors: string[] = [];
  const scorecardRepo = new ScorecardRepository();
  const graphRepo = new GraphRepository();

  const fullGraph = buildFormulaGraph(buffer, filename);
  const structure = extractScorecardStructure(fullGraph, buffer, filename);

  if (sectorCode) structure.sectorCode = sectorCode;
  if (scorecardType) structure.scorecardType = scorecardType;

  const template: ScorecardTemplate = {
    name: `${structure.sectorCode} ${structure.scorecardType} Scorecard`,
    sectorCode: structure.sectorCode,
    scorecardType: structure.scorecardType,
    version: '1.0',
    totalMaxPoints: structure.totalMaxPoints,
    levelThresholds: structure.levelThresholds,
    createdAt: new Date().toISOString(),
    sourceFile: filename,
  };

  const scorecard = await scorecardRepo.createScorecard(template);
  const scorecardKey = scorecard._key!;

  let indicatorCount = 0;
  let targetCount = 0;

  for (const pDef of structure.pillars) {
    const pillar: Pillar = {
      scorecardId: scorecardKey,
      name: pDef.name,
      code: pDef.code,
      maxPoints: pDef.maxPoints,
      hasSubMinimum: pDef.hasSubMinimum,
      subMinimumThreshold: pDef.subMinimumThreshold,
      displayOrder: pDef.displayOrder,
    };

    const savedPillar = await scorecardRepo.createPillar(pillar);

    for (const iDef of pDef.indicators) {
      const indicator: Indicator = {
        pillarId: savedPillar._key!,
        name: iDef.name,
        code: iDef.code,
        maxPoints: iDef.maxPoints,
        description: `Extracted from ${filename}`,
      };

      const savedIndicator = await scorecardRepo.createIndicator(indicator);
      indicatorCount++;

      const ct: ComplianceTarget = {
        indicatorId: savedIndicator._key!,
        sectorCode: structure.sectorCode,
        targetValue: iDef.targetValue,
        targetUnit: iDef.targetUnit,
        targetBase: iDef.targetBase,
        weighting: iDef.maxPoints,
      };
      await scorecardRepo.createComplianceTarget(ct);
      targetCount++;
    }
  }

  let graphKey: string | null = null;
  let graphNodeCount = 0;
  let graphEdgeCount = 0;

  try {
    const subGraph = extractScorecardSubgraph(fullGraph);
    const graphToStore = subGraph.nodes.length > 0 ? subGraph : fullGraph;

    graphKey = await graphRepo.storeFormulaGraph(
      graphToStore,
      structure.scorecardType,
      structure.sectorCode,
      filename,
    );

    graphNodeCount = graphToStore.nodes.length;
    graphEdgeCount = graphToStore.edges.length;
  } catch (err: unknown) {
    errors.push(`Graph storage failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    scorecardKey,
    graphKey,
    pillarCount: structure.pillars.length,
    indicatorCount,
    targetCount,
    graphNodeCount,
    graphEdgeCount,
    extractedStructure: structure,
    errors,
  };
}

export interface BulkIngestionResult {
  total: number;
  successful: number;
  failed: number;
  results: Array<{ file: string; sectorCode: string; type: string; result: IngestionResult }>;
}

export async function ingestAllToolkits(basePath: string): Promise<BulkIngestionResult> {
  const TOOLKITS = [
    { subPath: '1. RCOGP (Generic)/BBBEE Toolkit (RCOGP)_Template_v.1.4.xlsx', sector: 'RCOGP', type: 'Generic' },
    { subPath: '2. ICT (Generic)/BBBEE Toolkit (ICT Generic)_Template_v.1.4.xlsx', sector: 'ICT', type: 'Generic' },
    { subPath: '3. ICT (QSE)/BBBEE Toolkit (ICT QSE)_Template_v.1.1.xlsx', sector: 'ICT', type: 'QSE' },
    { subPath: '4. RCOGP (QSE)/BBBEE Toolkit (RCOGP QSE)_Template_v.1.1.xlsx', sector: 'RCOGP', type: 'QSE' },
    { subPath: '5. FSC (Generic)/BBBEE Toolkit (FSC) Template v1.0.xlsx', sector: 'FSC', type: 'Generic' },
    { subPath: '6. Agri (Generic)/BBBEE Toolkit (Agri Generic)_Master_v.1.0.1.xlsx', sector: 'AGRI', type: 'Generic' },
  ];

  const results: BulkIngestionResult['results'] = [];
  let successful = 0;
  let failed = 0;

  for (const tk of TOOLKITS) {
    const fullPath = `${basePath}/${tk.subPath}`;
    try {
      const result = await ingestToolkitTemplate(fullPath, tk.sector, tk.type);
      results.push({ file: tk.subPath, sectorCode: tk.sector, type: tk.type, result });
      if (result.errors.length === 0) successful++;
      else failed++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        file: tk.subPath,
        sectorCode: tk.sector,
        type: tk.type,
        result: {
          scorecardKey: '', graphKey: null, pillarCount: 0, indicatorCount: 0,
          targetCount: 0, graphNodeCount: 0, graphEdgeCount: 0,
          extractedStructure: null, errors: [msg],
        },
      });
      failed++;
    }
  }

  return { total: TOOLKITS.length, successful, failed, results };
}

/**
 * Maps a toolkit filename to its sector code and scorecard type.
 */
export function getSectorAndScorecardFromFilename(filename: string): { sectorCode: string; scorecardType: string } | null {
  const name = filename.toLowerCase();
  
  if (name.includes('rcogp') && name.includes('qse')) return { sectorCode: 'RCOGP', scorecardType: 'QSE' };
  if (name.includes('rcogp') || name.includes('generic')) return { sectorCode: 'RCOGP', scorecardType: 'Generic' };
  
  if (name.includes('ict') && name.includes('qse')) return { sectorCode: 'ICT', scorecardType: 'QSE' };
  if (name.includes('ict') || name.includes('generic') && !name.includes('fsc') && !name.includes('agri')) return { sectorCode: 'ICT', scorecardType: 'Generic' };
  
  if (name.includes('fsc')) return { sectorCode: 'FSC', scorecardType: 'Generic' };
  if (name.includes('agri')) return { sectorCode: 'AGRI', scorecardType: 'Generic' };
  
  return null;
}
