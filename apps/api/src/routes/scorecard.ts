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
import { getSectorConfig, type SectorConfig } from '../../pipeline/sectorConfig.js';

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

      const manifest = await buildManifest(sectorCode.toUpperCase(), scorecardType);
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
// Transform SectorConfig/StoredSectorRule → CalculatorConfig (Toolkit shape)
//
// Handles BOTH shapes:
// 1. SectorConfig (hardcoded): targets.ownership.votingRightsMaxPts, pillarConfigs as object
// 2. StoredSectorRule (ArangoDB): targets flattened, pillarConfigs as array
//
// Without this mapping, calculators silently fall back to RCOGP defaults.
// ---------------------------------------------------------------------------
function sectorConfigToCalculatorConfig(sc: any) {
  // Determine if this is StoredSectorRule (array) or SectorConfig (object)
  const isStoredShape = Array.isArray(sc.pillarConfigs);

  const t = sc.targets || {};
  const own = t.ownership || {};
  const mc = t.managementControl || {};
  const ee = t.employmentEquity || {};
  const sk = t.skills || {};
  const pr = t.procurement || {};
  const esd = t.esd || {};
  const sed = t.sed || {};

  let pc: any = {};
  if (isStoredShape && Array.isArray(sc.pillarConfigs)) {
    for (const p of sc.pillarConfigs) {
      pc[p.code] = {
        maxPoints: p.maxPoints ?? 0,
        hasSubMinimum: p.hasSubMinimum ?? false,
        subMinimumPercent: p.subMinimumThreshold ? Math.round((p.subMinimumThreshold / p.maxPoints) * 100) : 0,
      };
    }
  } else {
    pc = sc.pillarConfigs || {};
  }

  const pOwn = pc.ownership || {};
  const pMc = pc.managementControl || {};
  const pEe = pc.employmentEquity || { maxPoints: 0 };
  const pSk = pc.skillsDevelopment || {};
  const pPp = pc.preferentialProcurement || {};
  const pSd = pc.supplierDevelopment || pc.enterpriseSupplierDevelopment || {};
  const pEd = pc.enterpriseDevelopment || {};
  const pSed = pc.socioEconomicDevelopment || {};
  const pYes = pc.yesInitiative || { maxPoints: 0 };

  const ownershipSubMin = pOwn.hasSubMinimum
    ? (pOwn.subMinimumPercent / 100) * pOwn.maxPoints
    : 3.2;
  const skillsSubMin = pSk.hasSubMinimum
    ? (pSk.subMinimumPercent / 100) * pSk.maxPoints
    : 10;
  const procSubMin = pPp.hasSubMinimum
    ? (pPp.subMinimumPercent / 100) * pPp.maxPoints
    : 11.6;

  const procBaseMax = (pr.allSuppliersMaxPts || 0)
    + (pr.qseMaxPts || 0) + (pr.emeMaxPts || 0)
    + (pr.bo51MaxPts || 0) + (pr.bwo30MaxPts || 0);

  const totalMaxPoints = sc.totalMaxPoints ||
    Object.values(pc).reduce((sum: number, p: any) => sum + (p.maxPoints || 0), 0);

  // Extract category caps from categoryWeightings if available
  const cw = sc.categoryWeightings || [];
  const catE = cw.find((c: any) => c.code === 'E');
  const catF = cw.find((c: any) => c.code === 'F');

  return {
    totalMaxPoints,
    ownership: {
      votingRightsMax: own.votingRightsMaxPts,
      womenBonusMax: own.womenVotingMaxPts,
      economicInterestMax: own.economicInterestMaxPts,
      netValueMax: own.netValueMaxPts,
      targetEconomicInterest: own.economicInterestTarget,
      subMinNetValue: ownershipSubMin,
    },
    management: {
      boardBlackTarget: mc.boardBlackTarget,
      boardBlackPoints: mc.boardBlackMaxPts,
      boardWomenTarget: mc.boardBWTarget,
      boardWomenPoints: mc.boardBWMaxPts,
      execBlackTarget: mc.execBlackTarget,
      execBlackPoints: mc.execBlackMaxPts,
      execWomenTarget: mc.execBWTarget,
      execWomenPoints: mc.execBWMaxPts,
      disabledTarget: ee.disabledTarget,
      execBWTarget: mc.execBWTarget,
      execBWMaxPts: mc.execBWMaxPts,
    },
    managementControl: {
      maxPoints: pMc.maxPoints,
      subMinimumPercent: pMc.subMinimumPercent ?? 0,
      boardBlackTarget: mc.boardBlackTarget,
      boardBlackMaxPts: mc.boardBlackMaxPts,
      boardBWTarget: mc.boardBWTarget,
      boardBWMaxPts: mc.boardBWMaxPts,
      execBlackTarget: mc.execBlackTarget,
      execBlackMaxPts: mc.execBlackMaxPts,
      execBWTarget: mc.execBWTarget,
      execBWMaxPts: mc.execBWMaxPts,
      otherExecBlackTarget: mc.otherExecBlackTarget,
      otherExecBlackMaxPts: mc.otherExecBlackMaxPts,
      otherExecBWTarget: mc.otherExecBWTarget,
      otherExecBWMaxPts: mc.otherExecBWMaxPts,
      seniorMaxPts: mc.seniorMaxPts,
      seniorBWMaxPts: mc.seniorBWMaxPts,
      middleMaxPts: mc.middleMaxPts,
      middleBWMaxPts: mc.middleBWMaxPts,
      juniorMaxPts: mc.juniorMaxPts,
      juniorBWMaxPts: mc.juniorBWMaxPts,
      disabledTarget: ee.disabledTarget,
      disabledMaxPts: ee.disabledMaxPts,
    },
    employmentEquity: pEe.maxPoints > 0
      ? { maxPoints: pEe.maxPoints, disabledTarget: ee.disabledTarget, disabledMaxPts: ee.disabledMaxPts }
      : { maxPoints: 0, disabledTarget: ee.disabledTarget, disabledMaxPts: ee.disabledMaxPts },
    skills: {
      generalMax: sk.learningProgrammesMaxPts,
      bursaryMax: sk.bursaryMaxPts,
      overallTarget: sk.overallSpendPercent,
      bursaryTarget: sk.bursarySpendPercent,
      subMinThreshold: skillsSubMin,
      overallSpendPercent: sk.overallSpendPercent,
      bursarySpendPercent: sk.bursarySpendPercent,
      disabledSpendPercent: sk.disabledSpendPercent,
      categoryECap: catE?.cap,
      categoryFCap: catF?.cap,
      learningProgrammesMaxPts: sk.learningProgrammesMaxPts,
      bursaryMaxPts: sk.bursaryMaxPts,
      disabledLearningMaxPts: sk.disabledLearningMaxPts,
      learnershipsMaxPts: sk.learnershipsMaxPts,
      absorptionMaxPts: sk.absorptionMaxPts,
      learnershipTargetPercent: sk.learnershipTargetPercent,
      absorptionTargetPercent: sk.absorptionTargetPercent,
    },
    procurement: {
      baseMax: procBaseMax,
      bonusMax: pr.dgMaxPts,
      tmpsTarget: 0,
      subMinThreshold: procSubMin,
      blackOwnedThreshold: pr.bo51Target,
      blackWomenThreshold: pr.bwo30Target,
      allSuppliersTarget: pr.allSuppliersTarget,
      allSuppliersMaxPts: pr.allSuppliersMaxPts,
      qseTarget: pr.qseTarget,
      qseMaxPts: pr.qseMaxPts,
      emeTarget: pr.emeTarget,
      emeMaxPts: pr.emeMaxPts,
      bo51Target: pr.bo51Target,
      bo51MaxPts: pr.bo51MaxPts,
      bwo30Target: pr.bwo30Target,
      bwo30MaxPts: pr.bwo30MaxPts,
      dgTarget: pr.dgTarget,
      dgMaxPts: pr.dgMaxPts,
    },
    esd: {
      supplierDevMax: esd.sdMaxPts,
      enterpriseDevMax: esd.edMaxPts,
      supplierDevTarget: (esd.sdPercent ?? 2) / 100,
      enterpriseDevTarget: (esd.edPercent ?? 1) / 100,
    },
    sed: {
      maxPoints: sed.maxPts,
      npatTarget: (sed.spendPercent ?? 1) / 100,
    },
    // TODO: Extract YES config from Excel toolkits. These values are sector-independent per B-BBEE Act.
    yes: {
      tier1Points: 1.5, tier2Points: 1, tier3Points: 0.5,
      tier1Multiplier: 2.5, tier2Multiplier: 1.5, tier3Multiplier: 1,
      headcountTarget5: 0.025, headcountTarget10: 0.015, headcountTarget15: 0.01,
      blackYouthPercent: 0.55,
    },
    discounting: { dropLevels: 1, maxDropLevel: 8 },
    recognitionTable: (sc.recognitionTable || []).map((r: any) => ({
      level: r.beeLevel ?? r.level, multiplier: r.multiplier,
    })),
    levelThresholds: (sc.levelThresholds || []).map((lt: any) => ({
      level: lt.level, minPoints: lt.minPoints, recognition: lt.recognition,
    })),
    pillarConfigs: {
      ownership: { maxPoints: pOwn.maxPoints, subMinimumPercent: pOwn.subMinimumPercent },
      managementControl: { maxPoints: pMc.maxPoints, subMinimumPercent: pMc.subMinimumPercent },
      ...(pEe.maxPoints > 0 ? { employmentEquity: { maxPoints: pEe.maxPoints } } : {}),
      skillsDevelopment: { maxPoints: pSk.maxPoints, subMinimumPercent: pSk.subMinimumPercent },
      preferentialProcurement: { maxPoints: pPp.maxPoints, subMinimumPercent: pPp.subMinimumPercent },
      supplierDevelopment: { maxPoints: pSd.maxPoints, subMinimumPercent: pSd.subMinimumPercent },
      enterpriseDevelopment: { maxPoints: pEd.maxPoints, subMinimumPercent: pEd.subMinimumPercent },
      socioEconomicDevelopment: { maxPoints: pSed.maxPoints },
      ...(pYes.maxPoints > 0 ? { yesInitiative: { maxPoints: pYes.maxPoints } } : {}),
    },
    benefitFactors: (sc.benefitFactors || []).map((bf: any) => ({
      type: bf.contributionType ?? bf.type, factor: bf.sdFactor ?? bf.factor,
    })),
    industryNorms: (sc.industryNorms || []).map((n: any) => ({
      name: n.industry ?? n.name, norm: String(n.normPercent ?? n.norm ?? '5.58'),
    })),
  };
}

// ---------------------------------------------------------------------------
// GET /api/scorecard/sector-config/:sectorCode/:scorecardType
// Returns sector-specific calculator configuration in CalculatorConfig shape.
// Primary source: ArangoDB sector_rules (seeded from verified sectorConfig.ts)
// Fallback: Hardcoded sectorConfig.ts (if ArangoDB unavailable or stale)
// ---------------------------------------------------------------------------
router.get('/sector-config/:sectorCode/:scorecardType', async (req: Request, res: Response) => {
  try {
    const { sectorCode, scorecardType } = req.params as { sectorCode: string; scorecardType: string };

    if (!sectorCode || !scorecardType) {
      return res.status(400).json({ message: 'sectorCode and scorecardType are required' });
    }

    // Primary: Try ArangoDB first (seeded with corrected values from sectorConfig.ts)
    try {
      const db = getArangoDB();
      const cursor = await db.query(aql`
        FOR sr IN ${db.collection(COLLECTIONS.sectorRules)}
          FILTER sr.sectorCode == ${sectorCode.toUpperCase()}
             AND sr.scorecardType == ${scorecardType}
          SORT sr.updatedAt DESC
          LIMIT 1
          RETURN sr
      `);
      const rows = await cursor.all();

      if (rows.length > 0 && rows[0]) {
        // Transform ArangoDB shape (StoredSectorRule) to CalculatorConfig
        const dbConfig = sectorConfigToCalculatorConfig(rows[0]);
        return res.json({ success: true, config: dbConfig, source: 'arangodb' });
      }
    } catch (arangoErr) {
      console.warn('[Scorecard] ArangoDB unavailable, falling back to hardcoded:', arangoErr);
    }

    // Fallback: Use verified hardcoded sectorConfig.ts
    try {
      const fallbackConfig = getSectorConfig(sectorCode, scorecardType);
      const config = sectorConfigToCalculatorConfig(fallbackConfig);
      return res.json({ success: true, config, source: 'hardcoded' });
    } catch (fallbackErr) {
      console.error('[Scorecard] Config failed for', sectorCode, scorecardType, ':', fallbackErr);
      return res.status(500).json({
        success: false,
        message: 'Failed to load sector configuration'
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
