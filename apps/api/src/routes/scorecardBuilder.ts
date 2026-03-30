/**
 * Scorecard Builder API Routes
 *
 * REST endpoints for the hierarchical B-BBEE scoring system.
 * - GET /api/manifest - Load entity manifest for sector/type
 * - POST /api/calculate - Run calculation engine
 * - POST /api/assessments - Save assessment results
 */

import { Router } from 'express';
import { buildManifest } from '../../pipeline/extraction/entityManifest.js';
import { calculateScorecard } from '../../pipeline/rules/calculationEngine.js';
import type { EntityValue } from '../../pipeline/rules/calculationEngine.js';
import { ScoreResultRepository } from '../../arango/repositories/scoreResultRepository.js';
import { EvidenceRepository } from '../../arango/repositories/evidenceRepository.js';

const router = Router();

// ============================================================================
// GET /api/manifest
// ============================================================================

router.get('/manifest', async (req, res) => {
  try {
    const sectorCode = String(req.query.sector || 'RCOGP');
    const scorecardType = String(req.query.type || 'Generic');

    const manifest = buildManifest(sectorCode, scorecardType);
    
    res.json(manifest);
  } catch (err) {
    console.error('Error loading manifest:', err);
    res.status(500).json({ 
      error: 'Failed to load manifest',
      details: err instanceof Error ? err.message : 'Unknown error'
    });
  }
});

// ============================================================================
// POST /api/calculate
// ============================================================================

interface CalculateRequest {
  assessmentId: string;
  sectorCode: string;
  scorecardType: string;
  entityValues: Record<string, EntityValue>;
}

router.post('/calculate', async (req, res) => {
  try {
    const { assessmentId, sectorCode, scorecardType, entityValues } = req.body as CalculateRequest;

    // Convert record to Map
    const valuesMap = new Map<string, EntityValue>();
    for (const [key, value] of Object.entries(entityValues)) {
      valuesMap.set(key, value);
    }

    // Extract cross-pillar values
    const crossPillarValues = new Map<string, number>();
    const npatValue = valuesMap.get('npat')?.value;
    const tmpsValue = valuesMap.get('tmps')?.value;
    const leviableValue = valuesMap.get('leviable_amount')?.value;
    
    if (typeof npatValue === 'number') crossPillarValues.set('npat', npatValue);
    if (typeof tmpsValue === 'number') crossPillarValues.set('tmps', tmpsValue);
    if (typeof leviableValue === 'number') crossPillarValues.set('leviableAmount', leviableValue);

    const result = await calculateScorecard({
      assessmentId,
      sectorCode,
      scorecardType,
      entityValues: valuesMap,
      crossPillarValues,
    });

    // Store calculation run and results in ArangoDB
    const scoreRepo = new ScoreResultRepository();
    
    const run = await scoreRepo.startCalculationRun({
      assessmentId,
      sectorCode,
      scorecardType,
      triggeredBy: 'manual_entry',
      totalPoints: result.totalPoints,
      maxPoints: result.maxPoints,
      overallPercentage: result.overallPercentage,
      beeLevel: result.beeLevel,
      recognitionLevel: result.recognitionLevel,
      subMinimumsMet: result.subMinimums,
    });

    // Store pillar and criterion results
    const scoreResults = [];
    
    for (const pillar of result.pillars) {
      // Store pillar result
      scoreResults.push({
        assessmentId,
        calculationRunId: run._key!,
        sectorCode,
        scorecardType,
        type: 'pillar' as const,
        pillarCode: pillar.pillarCode,
        actualValue: pillar.points,
        targetValue: pillar.maxPoints,
        achievementPercentage: pillar.percentage,
        pointsAchieved: pillar.points,
        maxPoints: pillar.maxPoints,
        weightedScore: pillar.points,
        subMinimumMet: pillar.subMinimumMet,
        isBonus: false,
        formulaUsed: 'aggregate',
        inputs: {},
      });

      // Store criterion results
      for (const criterion of pillar.criteria) {
        scoreResults.push({
          assessmentId,
          calculationRunId: run._key!,
          sectorCode,
          scorecardType,
          type: 'criterion' as const,
          pillarCode: pillar.pillarCode,
          criterionCode: criterion.criterionCode,
          actualValue: criterion.points,
          targetValue: criterion.maxPoints,
          achievementPercentage: criterion.percentage,
          pointsAchieved: criterion.points,
          maxPoints: criterion.maxPoints,
          weightedScore: criterion.points,
          subMinimumMet: criterion.subMinimumMet,
          isBonus: criterion.formulaId === 'bonus_flag',
          formulaUsed: criterion.formulaId,
          inputs: criterion.inputs,
          intermediateSteps: criterion.intermediateValues,
        });
      }
    }

    // Store overall result
    scoreResults.push({
      assessmentId,
      calculationRunId: run._key!,
      sectorCode,
      scorecardType,
      type: 'overall' as const,
      actualValue: result.totalPoints,
      targetValue: result.maxPoints,
      achievementPercentage: result.overallPercentage,
      pointsAchieved: result.totalPoints,
      maxPoints: result.maxPoints,
      weightedScore: result.totalPoints,
      subMinimumMet: Object.values(result.subMinimums).every(Boolean), // All sub-minimums met
      isBonus: false,
      formulaUsed: 'aggregate',
      inputs: {},
    });

    await scoreRepo.storeScoreResults(scoreResults as Array<Omit<import('../../arango/repositories/scoreResultRepository.js').StoredScoreResult, '_key' | 'calculatedAt'>>);
    await scoreRepo.completeCalculationRun(run._key!, {
      totalPoints: result.totalPoints,
      maxPoints: result.maxPoints,
      overallPercentage: result.overallPercentage,
      beeLevel: result.beeLevel,
      recognitionLevel: result.recognitionLevel,
      subMinimumsMet: result.subMinimums,
    });

    res.json(result);
  } catch (err) {
    console.error('Calculation error:', err);
    res.status(500).json({ 
      error: 'Calculation failed',
      details: err instanceof Error ? err.message : 'Unknown error'
    });
  }
});

// ============================================================================
// POST /api/assessments
// ============================================================================

interface SaveAssessmentRequest {
  assessmentId: string;
  clientId?: string;
  financialYear?: string;
  sectorCode: string;
  scorecardType: string;
  values: Record<string, unknown>;
  result?: import('../../pipeline/rules/calculationEngine.js').ScorecardResult;
}

router.post('/assessments', async (req, res) => {
  try {
    const { assessmentId, clientId, financialYear, sectorCode, scorecardType, values, result } = req.body as SaveAssessmentRequest;

    // Store evidence references for each value
    const evidenceRepo = new EvidenceRepository();
    const evidences = [];

    for (const [entityId, value] of Object.entries(values)) {
      if (value !== undefined && value !== null) {
        evidences.push({
          assessmentId,
          entityFieldId: entityId,
          sectorCode,
          scorecardType,
          documentType: 'manual_input' as const,
          normalizedValue: value,
          confidence: 1.0,
        });
      }
    }

    if (evidences.length > 0) {
      await evidenceRepo.storeEvidences(evidences);
    }

    // TODO: Store assessment in main database
    // This would integrate with your existing assessment storage

    res.json({ 
      success: true, 
      assessmentId,
      savedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Save error:', err);
    res.status(500).json({ 
      error: 'Save failed',
      details: err instanceof Error ? err.message : 'Unknown error'
    });
  }
});

export default router;
