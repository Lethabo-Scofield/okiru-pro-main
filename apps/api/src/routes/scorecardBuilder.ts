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

// Type definitions for array inputs (from Toolkit entities)
interface EmployeeInput {
  race: 'Black' | 'Coloured' | 'Indian' | 'White' | 'Other';
  gender: 'Male' | 'Female' | 'Other';
  designation: 'Board' | 'Executive' | 'Senior' | 'Middle' | 'Junior' | 'Other';
  isDisabled?: boolean;
  isForeign?: boolean;
  isExecutiveDirector?: boolean;
}

interface ShareholderInput {
  name: string;
  blackOwnership: number;  // 0-100 percentage
  isDesignatedGroup?: boolean;
  yearsHeld?: number;
  shareValue?: number;
  votingRights?: number;
  economicInterest?: number;
  isNewEntrant?: boolean;
}

interface SupplierInput {
  name: string;
  spend: number;
  beeLevel?: number;
  blackOwnership?: number;
  isBlackOwned51?: boolean;
  isBlackWomanOwned30?: boolean;
  isDesignatedGroup?: boolean;
  isQSE?: boolean;
  isEME?: boolean;
}

interface CalculateRequest {
  assessmentId: string;
  sectorCode: string;
  scorecardType: string;
  entityValues: Record<string, EntityValue>;
  // NEW: Array inputs for proper aggregation
  employees?: EmployeeInput[];
  shareholders?: ShareholderInput[];
  suppliers?: SupplierInput[];
  // Cross-pillar values
  npat?: number;
  tmps?: number;
  leviableAmount?: number;
  totalEmployees?: number;
}

router.post('/calculate', async (req, res) => {
  try {
    const { assessmentId, sectorCode, scorecardType, entityValues, employees, shareholders, suppliers, npat, tmps, leviableAmount, totalEmployees } = (req.body || {}) as CalculateRequest;

    if (!sectorCode || !scorecardType) {
      return res.status(400).json({ error: 'sectorCode and scorecardType are required' });
    }

    const valuesMap = new Map<string, EntityValue>();
    if (entityValues && typeof entityValues === 'object') {
      for (const [key, value] of Object.entries(entityValues)) {
        valuesMap.set(key, value);
      }
    }

    // Extract cross-pillar values
    const crossPillarValues = new Map<string, number>();
    
    // Use explicit values if provided, otherwise try to extract from entityValues
    const npatValue = npat ?? valuesMap.get('npat')?.value;
    const tmpsValue = tmps ?? valuesMap.get('tmps')?.value;
    const leviableValue = leviableAmount ?? valuesMap.get('leviable_amount')?.value;
    const totalEmpValue = totalEmployees ?? valuesMap.get('total_employees')?.value;
    
    if (typeof npatValue === 'number') crossPillarValues.set('npat', npatValue);
    if (typeof tmpsValue === 'number') crossPillarValues.set('tmps', tmpsValue);
    if (typeof leviableValue === 'number') crossPillarValues.set('leviableAmount', leviableValue);
    if (typeof totalEmpValue === 'number') crossPillarValues.set('totalEmployees', totalEmpValue);

    // TODO: Pre-aggregate array inputs into computed percentages
    // This will be implemented when the calculationEngine is updated to accept arrays
    // For now, the arrays are accepted but not yet processed (see todo: fix-computation-engine-inputs)
    if (employees && employees.length > 0) {
      // Aggregate employees by designation and race/gender
      const totalEmp = employees.length;
      const boardEmployees = employees.filter(e => e.designation === 'Board');
      const execEmployees = employees.filter(e => e.designation === 'Executive');
      const seniorEmployees = employees.filter(e => e.designation === 'Senior');
      const middleEmployees = employees.filter(e => e.designation === 'Middle');
      const juniorEmployees = employees.filter(e => e.designation === 'Junior');
      
      // Calculate percentages and store in valuesMap for the engine
      // Board representation
      if (boardEmployees.length > 0) {
        const boardBlack = boardEmployees.filter(e => e.race === 'Black').length;
        const boardBlackWomen = boardEmployees.filter(e => e.race === 'Black' && e.gender === 'Female').length;
        valuesMap.set('boardBlackPct', { value: boardBlack / boardEmployees.length, source: 'calculation', entityId: 'boardBlackPct' });
        valuesMap.set('boardBlackWomenPct', { value: boardBlackWomen / boardEmployees.length, source: 'calculation', entityId: 'boardBlackWomenPct' });
      }
      
      // Executive representation
      if (execEmployees.length > 0) {
        const execBlack = execEmployees.filter(e => e.race === 'Black').length;
        const execBlackWomen = execEmployees.filter(e => e.race === 'Black' && e.gender === 'Female').length;
        valuesMap.set('execBlackPct', { value: execBlack / execEmployees.length, source: 'calculation', entityId: 'execBlackPct' });
        valuesMap.set('execBlackWomenPct', { value: execBlackWomen / execEmployees.length, source: 'calculation', entityId: 'execBlackWomenPct' });
      }
      
      // Senior/Middle/Junior (EAP-based - requires province lookup)
      if (seniorEmployees.length > 0) {
        const seniorBlack = seniorEmployees.filter(e => e.race === 'Black').length;
        valuesMap.set('seniorBlackPct', { value: seniorBlack / seniorEmployees.length, source: 'calculation', entityId: 'seniorBlackPct' });
      }
      if (middleEmployees.length > 0) {
        const middleBlack = middleEmployees.filter(e => e.race === 'Black').length;
        valuesMap.set('middleBlackPct', { value: middleBlack / middleEmployees.length, source: 'calculation', entityId: 'middleBlackPct' });
      }
      if (juniorEmployees.length > 0) {
        const juniorBlack = juniorEmployees.filter(e => e.race === 'Black').length;
        valuesMap.set('juniorBlackPct', { value: juniorBlack / juniorEmployees.length, source: 'calculation', entityId: 'juniorBlackPct' });
      }
      
      // Disabled employees
      const disabledCount = employees.filter(e => e.isDisabled).length;
      valuesMap.set('disabledPct', { value: disabledCount / totalEmp, source: 'calculation', entityId: 'disabledPct' });
    }

    // Aggregate shareholders for ownership
    if (shareholders && shareholders.length > 0) {
      let totalOwnership = 0;
      let blackOwnership = 0;
      let designatedGroupOwnership = 0;
      let newEntrantOwnership = 0;
      
      for (const sh of shareholders) {
        totalOwnership += sh.blackOwnership || 0;
        if (sh.blackOwnership > 0) {
          blackOwnership += sh.blackOwnership;
          if (sh.isDesignatedGroup) {
            designatedGroupOwnership += sh.blackOwnership;
          }
          if (sh.isNewEntrant) {
            newEntrantOwnership += sh.blackOwnership;
          }
        }
      }
      
      valuesMap.set('blackOwnershipPct', { value: blackOwnership / 100, source: 'calculation', entityId: 'blackOwnershipPct' });
      valuesMap.set('designatedGroupPct', { value: designatedGroupOwnership / 100, source: 'calculation', entityId: 'designatedGroupPct' });
      valuesMap.set('newEntrantPct', { value: newEntrantOwnership / 100, source: 'calculation', entityId: 'newEntrantPct' });
    }

    // Aggregate suppliers for procurement
    if (suppliers && suppliers.length > 0) {
      const totalSpend = suppliers.reduce((sum, s) => sum + (s.spend || 0), 0);
      const recognisedSpend = suppliers.reduce((sum, s) => {
        const multiplier = s.beeLevel ? getRecognitionMultiplier(s.beeLevel) : 0;
        return sum + ((s.spend || 0) * multiplier);
      }, 0);
      
      const bo51Spend = suppliers.filter(s => s.isBlackOwned51).reduce((sum, s) => sum + (s.spend || 0), 0);
      const bwo30Spend = suppliers.filter(s => s.isBlackWomanOwned30).reduce((sum, s) => sum + (s.spend || 0), 0);
      const dgSpend = suppliers.filter(s => s.isDesignatedGroup).reduce((sum, s) => sum + (s.spend || 0), 0);
      
      valuesMap.set('recognisedSpend', { value: recognisedSpend, source: 'calculation', entityId: 'recognisedSpend' });
      valuesMap.set('bo51Spend', { value: bo51Spend, source: 'calculation', entityId: 'bo51Spend' });
      valuesMap.set('bwo30Spend', { value: bwo30Spend, source: 'calculation', entityId: 'bwo30Spend' });
      valuesMap.set('dgSpend', { value: dgSpend, source: 'calculation', entityId: 'dgSpend' });
    }

    // Helper function for recognition multipliers
    function getRecognitionMultiplier(beeLevel: number): number {
      const table: Record<number, number> = {
        1: 1.35, 2: 1.25, 3: 1.10, 4: 1.00,
        5: 0.80, 6: 0.60, 7: 0.50, 8: 0.10, 0: 0
      };
      return table[beeLevel] ?? 0;
    }

    const result = await calculateScorecard({
      assessmentId,
      sectorCode,
      scorecardType,
      entityValues: valuesMap,
      crossPillarValues,
      // TODO: Pass arrays to calculationEngine when it supports them
      // employees,
      // shareholders,
      // suppliers,
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
