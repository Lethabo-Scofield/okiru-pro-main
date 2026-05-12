/**
 * Scorecard Builder API Routes
 *
 * REST endpoints for the hierarchical B-BBEE scoring system.
 * - GET /api/manifest - Load entity manifest for sector/type
 * - POST /api/calculate - Run calculation engine
 * - POST /api/assessments - Save assessment results
 */

import { Router } from 'express';
import { createLogger } from '../logger.js';
import { buildManifest } from '../../pipeline/extraction/entityManifest.js';

const logger = createLogger("ScorecardBuilder");
import { calculateScorecard } from '../../pipeline/rules/calculationEngine.js';
import type { EntityValue, EmployeeInput, ShareholderInput, SupplierInput, ContributionInput } from '../../pipeline/rules/calculationEngine.js';
import { ScoreResultRepository } from '../../arango/repositories/scoreResultRepository.js';
import { EvidenceRepository } from '../../arango/repositories/evidenceRepository.js';
import { mapToUCSPayload } from '../../pipeline/extraction/aiEntityMapper.js';

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
    logger.error('Error loading manifest', err);
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
  financials?: {
    revenue: number;
    npat: number;
    leviableAmount: number;
    tmps: number;
    headcount: number;
    companyValue?: number;
    outstandingDebt?: number;
    yearsHeld?: number;
    totalRevenue?: number;
  };
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
  const start = Date.now();
  try {
    const body = (req.body || {}) as CalculateRequest;
    const { sectorCode, scorecardType } = body;

    logger.info('Calculate request', { sectorCode, scorecardType, employees: body.employees?.length, shareholders: body.shareholders?.length, suppliers: body.suppliers?.length });

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
      const leviableValue = leviableAmount ?? financials?.leviableAmount ?? valuesMap.get('leviable_amount')?.value ?? valuesMap.get('leviableAmount')?.value;
      const totalEmpValue = totalEmployees ?? financials?.headcount ?? valuesMap.get('total_employees')?.value ?? valuesMap.get('totalEmployees')?.value ?? valuesMap.get('headcount')?.value;

      if (typeof npatValue === 'number') crossPillarValues.set('npat', npatValue);
      if (typeof tmpsValue === 'number') crossPillarValues.set('tmps', tmpsValue);
      if (typeof leviableValue === 'number') crossPillarValues.set('leviableAmount', leviableValue);
      if (typeof totalEmpValue === 'number') crossPillarValues.set('totalEmployees', totalEmpValue);

      // Handle ownership financials for OWN-NV calculation
      const companyValue = financials?.companyValue ?? valuesMap.get('companyValue')?.value ?? valuesMap.get('company_value')?.value ?? 0;
      const outstandingDebt = financials?.outstandingDebt ?? valuesMap.get('outstandingDebt')?.value ?? valuesMap.get('outstanding_debt')?.value ?? 0;
      const yearsHeld = financials?.yearsHeld ?? valuesMap.get('yearsHeld')?.value ?? valuesMap.get('years_held')?.value ?? 0;

      if (typeof companyValue === 'number' && companyValue > 0) {
        valuesMap.set('companyValue', { entityId: 'companyValue', value: companyValue, source: 'financials' });
        crossPillarValues.set('companyValue', companyValue);
      }
      if (typeof outstandingDebt === 'number' && outstandingDebt > 0) {
        valuesMap.set('outstandingDebt', { entityId: 'outstandingDebt', value: outstandingDebt, source: 'financials' });
        crossPillarValues.set('outstandingDebt', outstandingDebt);
      }
      if (typeof yearsHeld === 'number' && yearsHeld > 0) {
        valuesMap.set('yearsHeld', { entityId: 'yearsHeld', value: yearsHeld, source: 'financials' });
        crossPillarValues.set('yearsHeld', yearsHeld);
      }
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
      logger.warn('ArangoDB storage failed (non-fatal)', { error: arangoErr instanceof Error ? arangoErr.message : String(arangoErr) });
    }

    logger.info('Scorecard calculated', { sessionId: assessmentId, sector: sectorCode, durationMs: Date.now() - start });

    res.json({ success: true, scorecard: result });
  } catch (err) {
    logger.error('Calculation error', err);
    res.status(500).json({ 
      success: false,
      error: 'Calculation failed',
      details: err instanceof Error ? err.message : 'Unknown error'
    });
  }
});

// ============================================================================
// POST /api/calculate-from-extraction
// Combines AI entity mapping + UCS calculation in one call.
// Frontend sends raw extraction output, backend handles all normalization.
// ============================================================================

router.post('/calculate-from-extraction', async (req, res) => {
  try {
    const body = req.body || {};
    const { sectorCode, scorecardType, sessionId, entities, tables } = body;

    if (!sectorCode || !scorecardType) {
      return res.status(400).json({ success: false, error: 'sectorCode and scorecardType are required' });
    }

    logger.info('Mapping extraction to UCS format');

    const payload = await mapToUCSPayload({ entities: entities || [], tables: tables || {} });

    logger.info('Extraction data quality', { dataQuality: payload.dataQuality });
    logger.info('Extraction arrays', {
      employees: payload.employees.length,
      shareholders: payload.shareholders.length,
      suppliers: payload.suppliers.length,
      contributions: payload.contributions.length,
      trainingPrograms: payload.trainingPrograms.length,
    });
    logger.debug('Extraction financials', { financials: payload.financials });
    logger.debug('Cross-pillar values', { crossPillarValues: Object.fromEntries(payload.crossPillarValues) });

    const assessmentId = `upload-${sessionId || Date.now()}`;

    const result = await calculateScorecard({
      assessmentId,
      sectorCode,
      scorecardType,
      entityValues: new Map(Object.entries(payload.entityValues).map(([k, v]) => [k, v as EntityValue])),
      crossPillarValues: payload.crossPillarValues,
      employees: payload.employees,
      shareholders: payload.shareholders,
      suppliers: payload.suppliers,
      contributions: payload.contributions,
      trainingPrograms: payload.trainingPrograms,
      financials: payload.financials,
    });

    // Store in ArangoDB (non-fatal)
    try {
      const scoreRepo = new ScoreResultRepository();
      await scoreRepo.startCalculationRun({
        assessmentId,
        sectorCode,
        scorecardType,
        triggeredBy: 'extraction',
        totalPoints: result.totalPoints,
        maxPoints: result.maxPoints,
        overallPercentage: result.overallPercentage,
        beeLevel: result.beeLevel,
        recognitionLevel: result.recognitionLevel,
        subMinimumsMet: result.subMinimums,
      });
    } catch (arangoErr) {
      logger.warn('ArangoDB storage failed (non-fatal)', { error: arangoErr instanceof Error ? arangoErr.message : String(arangoErr) });
    }

    res.json({
      success: true,
      scorecard: result,
      dataQuality: payload.dataQuality,
      pillarData: {
        employees: payload.employees,
        shareholders: payload.shareholders,
        suppliers: payload.suppliers,
        contributions: payload.contributions,
        trainingPrograms: payload.trainingPrograms,
        financials: payload.financials,
      },
    });
  } catch (err) {
    logger.error('Calculation from extraction failed', err);
    res.status(500).json({
      success: false,
      error: 'Calculation from extraction failed',
      details: err instanceof Error ? err.message : 'Unknown error',
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
        logger.warn('Evidence storage failed (non-fatal)', { error: evidenceErr instanceof Error ? evidenceErr.message : String(evidenceErr) });
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
        const existing = clientId ? await ClientModel.findOne({ id: clientId }) : null;
        if (existing) {
          savedClient = existing;
        } else {
          const orgId = (req.session as any)?.organizationId;
          if (!orgId) {
            throw new Error('organizationId required in session to create client');
          }
          savedClient = await ClientModel.create({
            organizationId: orgId,
            name: clientInfo.companyName,
            financialYear: clientInfo.financialYear || String(new Date().getFullYear()),
            revenue: financials?.totalRevenue ?? financials?.revenue ?? 0,
            npat: financials?.npat ?? 0,
            leviableAmount: financials?.leviableAmount ?? 0,
            industrySector: typeof clientInfo.industry === 'string' ? clientInfo.industry : sectorCode,
          });
        }
      } catch (clientErr) {
        logger.warn('Client creation failed (non-fatal)', { error: clientErr instanceof Error ? clientErr.message : String(clientErr) });
      }
    }

    res.json({
      success: true,
      assessmentId,
      savedAt: new Date().toISOString(),
      assessment: savedClient ? { clientId: savedClient.id || (savedClient as any)._id?.toString() } : null,
    });
  } catch (err) {
    logger.error('Assessment save error', err);
    res.status(500).json({
      error: 'Save failed',
      details: err instanceof Error ? err.message : 'Unknown error'
    });
  }
});

export default router;
