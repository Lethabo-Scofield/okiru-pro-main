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
import type { EntityValue, EmployeeInput, ShareholderInput, SupplierInput, ContributionInput } from '../../pipeline/rules/calculationEngine.js';
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

    const manifest = await buildManifest(sectorCode, scorecardType);
    
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
  employees?: EmployeeInput[];
  shareholders?: ShareholderInput[];
  suppliers?: SupplierInput[];
  contributions?: ContributionInput[];
  financials?: { revenue: number; npat: number; leviableAmount: number; tmps: number; headcount: number };
  npat?: number;
  tmps?: number;
  leviableAmount?: number;
  totalEmployees?: number;
}

router.post('/calculate', async (req, res) => {
  try {
    const {
      assessmentId, sectorCode, scorecardType, entityValues,
      employees, shareholders, suppliers, contributions, financials,
      npat, tmps, leviableAmount, totalEmployees,
    } = (req.body || {}) as CalculateRequest;

    if (!sectorCode || !scorecardType) {
      return res.status(400).json({ error: 'sectorCode and scorecardType are required' });
    }

    const valuesMap = new Map<string, EntityValue>();
    if (entityValues && typeof entityValues === 'object') {
      for (const [key, value] of Object.entries(entityValues)) {
        valuesMap.set(key, value);
      }
    }

    // Extract cross-pillar values from explicit fields, financials object, or entityValues
    const crossPillarValues = new Map<string, number>();

    const npatValue = npat ?? financials?.npat ?? valuesMap.get('npat')?.value;
    const tmpsValue = tmps ?? financials?.tmps ?? valuesMap.get('tmps')?.value;
    const leviableValue = leviableAmount ?? financials?.leviableAmount ?? valuesMap.get('leviable_amount')?.value;
    const totalEmpValue = totalEmployees ?? financials?.headcount ?? valuesMap.get('total_employees')?.value;

    if (typeof npatValue === 'number') crossPillarValues.set('npat', npatValue);
    if (typeof tmpsValue === 'number') crossPillarValues.set('tmps', tmpsValue);
    if (typeof leviableValue === 'number') crossPillarValues.set('leviableAmount', leviableValue);
    if (typeof totalEmpValue === 'number') crossPillarValues.set('totalEmployees', totalEmpValue);

    const result = await calculateScorecard({
      assessmentId,
      sectorCode,
      scorecardType,
      entityValues: valuesMap,
      crossPillarValues,
      employees: employees as EmployeeInput[] | undefined,
      shareholders: shareholders as ShareholderInput[] | undefined,
      suppliers: suppliers as SupplierInput[] | undefined,
      contributions: contributions as ContributionInput[] | undefined,
      financials: financials || undefined,
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
      ontologySnapshot: result.ontologySnapshot as unknown as Record<string, unknown>,
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

router.post('/assessments', async (req, res) => {
  try {
    const body = req.body || {};
    const assessmentId = body.assessmentId || body.sessionId || `assessment-${Date.now()}`;
    const sectorCode = body.sectorCode || body.clientInfo?.sectorCode || 'RCOGP';
    const scorecardType = body.scorecardType || 'Generic';
    const values = body.values || {};

    if (values && typeof values === 'object' && Object.keys(values).length > 0) {
      try {
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
      } catch (evidenceErr) {
        console.warn('[Assessments] Evidence storage failed (non-fatal):', evidenceErr instanceof Error ? evidenceErr.message : evidenceErr);
      }
    }

    const clientId = body.clientId || null;
    const clientInfo = body.clientInfo || {};
    const scorecardResult = body.scorecardResult || body.result || null;
    const pillars = body.pillars || null;
    const financials = body.financials || null;

    let savedClient = null;
    if (clientInfo.companyName) {
      try {
        const { ClientModel } = await import('../../models.js');
        const userId = (req.session as any)?.userId;
        const existing = clientId ? await ClientModel.findOne({ id: clientId }) : null;
        if (existing) {
          savedClient = existing;
        } else {
          savedClient = await ClientModel.create({
            name: clientInfo.companyName,
            industry: clientInfo.industry || sectorCode,
            registrationNumber: clientInfo.registrationNumber || '',
            annualTurnover: financials?.totalRevenue || 0,
            bbeLevel: scorecardResult?.finalLevel || scorecardResult?.achievedLevel || 0,
            status: 'complete',
            createdByUserId: userId || null,
          });
        }
      } catch (clientErr) {
        console.warn('[Assessments] Client creation failed (non-fatal):', clientErr instanceof Error ? clientErr.message : clientErr);
      }
    }

    res.json({
      success: true,
      assessmentId,
      savedAt: new Date().toISOString(),
      assessment: savedClient ? { clientId: savedClient.id || (savedClient as any)._id?.toString() } : null,
    });
  } catch (err) {
    console.error('[Assessments] Save error:', err);
    res.status(500).json({
      error: 'Save failed',
      details: err instanceof Error ? err.message : 'Unknown error'
    });
  }
});

export default router;
