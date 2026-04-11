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

interface TrainingProgramInput {
  id?: string;
  name: string;
  category?: string;
  cost: number;
  isYesEmployee?: boolean;
  isAbsorbed?: boolean;
  race?: string;
  gender?: string;
  isDisabled?: boolean;
}

interface CalculateRequest {
  assessmentId: string;
  sectorCode: string;
  scorecardType: string;
  entityValues: Record<string, EntityValue>;
  employees?: EmployeeInput[];
  shareholders?: ShareholderInput[];
  suppliers?: SupplierInput[];
  contributions?: ContributionInput[];
  trainingPrograms?: TrainingProgramInput[];
  financials?: { revenue: number; npat: number; leviableAmount: number; tmps: number; headcount: number };
  npat?: number;
  tmps?: number;
  leviableAmount?: number;
  totalEmployees?: number;
  pillarData?: any;
  foundationData?: any;
}

/**
 * Translate frontend pillarData/foundationData format into
 * the entity-level inputs the calculation engine expects.
 */
function extractFromPillarData(body: CalculateRequest): {
  employees: EmployeeInput[];
  shareholders: ShareholderInput[];
  suppliers: SupplierInput[];
  contributions: ContributionInput[];
  financials: { revenue: number; npat: number; leviableAmount: number; tmps: number; headcount: number } | undefined;
  entityValues: Map<string, EntityValue>;
  crossPillarValues: Map<string, number>;
} {
  const pd = body.pillarData || {};
  const fd = body.foundationData || {};
  const clientInfo = fd.clientInfo || {};
  const fin = fd.financials || {};

  const employees: EmployeeInput[] = (pd.management?.employees || []).map((e: any) => ({
    name: e.name,
    race: e.race,
    gender: e.gender,
    designation: e.designation,
    isDisabled: !!e.isDisabled,
    isForeign: !!e.isForeign,
  }));

  const shareholders: ShareholderInput[] = (pd.ownership?.shareholders || []).map((s: any) => ({
    name: s.name || 'Shareholder',
    blackOwnership: s.blackOwnership || 0,
    blackWomenOwnership: s.blackWomenOwnership || 0,
    shares: s.shares || 0,
    shareValue: s.shareValue || 0,
    yearsHeld: s.yearsHeld,
    isDesignatedGroup: !!s.isDesignatedGroup,
    blackNewEntrant: !!s.blackNewEntrant,
  }));

  const suppliers: SupplierInput[] = (pd.procurement?.suppliers || []).map((s: any) => ({
    name: s.name || 'Supplier',
    spend: s.spend || 0,
    beeLevel: s.beeLevel || 0,
    blackOwnership: s.blackOwnership || 0,
    blackWomenOwnership: s.blackWomenOwnership || 0,
    enterpriseType: s.enterpriseType || 'generic',
    isDesignatedGroup: !!s.isDesignatedGroup,
    isBlackOwned51: !!s.isBlackOwned51 || (s.blackOwnership >= 51),
    isBlackWomanOwned30: !!s.isBlackWomanOwned30 || (s.blackWomenOwnership >= 30),
    isEME: !!s.isEME || s.enterpriseType === 'eme',
    isQSE: !!s.isQSE || s.enterpriseType === 'qse',
    isForeignSupplier: !!s.isForeignSupplier,
  }));

  const esdContribs = (pd.esd?.contributions || []).map((c: any) => ({
    beneficiary: c.beneficiary || 'Beneficiary',
    type: c.type || 'direct_cost',
    amount: c.amount || 0,
    category: (c.category === 'socio_economic' ? 'sed' : c.category === 'enterprise_development' ? 'ed' : 'sd') as 'sd' | 'ed' | 'sed',
    benefitFactor: c.benefitFactor,
  }));

  const sedContribs = (pd.sed?.contributions || []).map((c: any) => ({
    beneficiary: c.beneficiary || 'Beneficiary',
    type: c.type || 'grant',
    amount: c.amount || 0,
    category: 'sed' as const,
    benefitFactor: c.benefitFactor,
  }));

  const contributions: ContributionInput[] = [...esdContribs, ...sedContribs];

  const npatVal = fin.npat ?? clientInfo.npat ?? 0;
  const leviableVal = pd.skills?.leviableAmount ?? fin.leviableAmount ?? clientInfo.leviableAmount ?? 0;
  const tmpsVal = pd.procurement?.tmps ?? 0;
  const headcountVal = employees.length || pd.yes?.totalEmployees || clientInfo.numberOfEmployees || 0;
  const revenueVal = fin.revenue ?? clientInfo.revenue ?? 0;

  const financials = {
    revenue: revenueVal,
    npat: npatVal,
    leviableAmount: leviableVal,
    tmps: tmpsVal,
    headcount: headcountVal,
  };

  const entityValues = new Map<string, EntityValue>();
  if (pd.ownership) {
    entityValues.set('companyValue', { entityId: 'companyValue', value: pd.ownership.companyValue || 0, source: 'manual' });
    entityValues.set('outstandingDebt', { entityId: 'outstandingDebt', value: pd.ownership.outstandingDebt || 0, source: 'manual' });
  }

  const crossPillarValues = new Map<string, number>();
  if (npatVal) crossPillarValues.set('npat', npatVal);
  if (tmpsVal) crossPillarValues.set('tmps', tmpsVal);
  if (leviableVal) crossPillarValues.set('leviableAmount', leviableVal);
  if (headcountVal) crossPillarValues.set('totalEmployees', headcountVal);
  if (revenueVal) crossPillarValues.set('revenue', revenueVal);

  return { employees, shareholders, suppliers, contributions, financials, entityValues, crossPillarValues };
}

router.post('/calculate', async (req, res) => {
  try {
    const body = (req.body || {}) as CalculateRequest;
    const { sectorCode, scorecardType } = body;

    console.log('[API /calculate] Request:', { sectorCode, scorecardType, employees: body.employees?.length, shareholders: body.shareholders?.length, suppliers: body.suppliers?.length });

    if (!sectorCode || !scorecardType) {
      return res.status(400).json({ success: false, error: 'sectorCode and scorecardType are required' });
    }

    const hasPillarData = !!body.pillarData;
    let calcEmployees: EmployeeInput[] | undefined;
    let calcShareholders: ShareholderInput[] | undefined;
    let calcSuppliers: SupplierInput[] | undefined;
    let calcContributions: ContributionInput[] | undefined;
    let calcFinancials: any;
    let valuesMap = new Map<string, EntityValue>();
    let crossPillarValues = new Map<string, number>();

    if (hasPillarData) {
      const extracted = extractFromPillarData(body);
      calcEmployees = extracted.employees;
      calcShareholders = extracted.shareholders;
      calcSuppliers = extracted.suppliers;
      calcContributions = extracted.contributions;
      calcFinancials = extracted.financials;
      valuesMap = extracted.entityValues;
      crossPillarValues = extracted.crossPillarValues;
    } else {
      const { entityValues, employees, shareholders, suppliers, contributions, financials, npat, tmps, leviableAmount, totalEmployees } = body;
      if (entityValues && typeof entityValues === 'object') {
        for (const [key, value] of Object.entries(entityValues)) {
          valuesMap.set(key, value);
        }
      }
      calcEmployees = employees as EmployeeInput[] | undefined;
      calcShareholders = shareholders as ShareholderInput[] | undefined;
      calcSuppliers = suppliers as SupplierInput[] | undefined;
      calcContributions = contributions as ContributionInput[] | undefined;
      calcFinancials = financials || undefined;

      const npatValue = npat ?? financials?.npat ?? valuesMap.get('npat')?.value;
      const tmpsValue = tmps ?? financials?.tmps ?? valuesMap.get('tmps')?.value;
      const leviableValue = leviableAmount ?? financials?.leviableAmount ?? valuesMap.get('leviable_amount')?.value;
      const totalEmpValue = totalEmployees ?? financials?.headcount ?? valuesMap.get('total_employees')?.value;

      if (typeof npatValue === 'number') crossPillarValues.set('npat', npatValue);
      if (typeof tmpsValue === 'number') crossPillarValues.set('tmps', tmpsValue);
      if (typeof leviableValue === 'number') crossPillarValues.set('leviableAmount', leviableValue);
      if (typeof totalEmpValue === 'number') crossPillarValues.set('totalEmployees', totalEmpValue);
    }

    const assessmentId = body.assessmentId || `calc-${Date.now()}`;

    const result = await calculateScorecard({
      assessmentId,
      sectorCode,
      scorecardType,
      entityValues: valuesMap,
      crossPillarValues,
      employees: calcEmployees,
      shareholders: calcShareholders,
      suppliers: calcSuppliers,
      contributions: calcContributions,
      trainingPrograms: body.trainingPrograms,
      financials: calcFinancials,
    });

    try {
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

      const scoreResults = [];
      
      for (const pillar of result.pillars) {
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
        subMinimumMet: Object.values(result.subMinimums).every(Boolean),
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
    } catch (arangoErr) {
      console.warn('[Calculate] ArangoDB storage failed (non-fatal):', arangoErr instanceof Error ? arangoErr.message : arangoErr);
    }

    res.json({ success: true, scorecard: result });
  } catch (err) {
    console.error('Calculation error:', err);
    res.status(500).json({ 
      success: false,
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
