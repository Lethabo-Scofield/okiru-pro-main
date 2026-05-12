/**
 * Construction Sector Scoring Engine
 *
 * Consumes the indicator matrices defined in `constructionIndicators.ts` and
 * produces an indicator-level scorecard breakdown that mirrors the output
 * shape used by the rest of the platform.
 *
 * Design principles:
 *   - Pure function: no I/O, no logging, no DB access. Deterministic output.
 *   - Missing-data tolerant: if a required input is absent, the indicator is
 *     scored 0 with status='missing_data' and a list of missingFields.
 *   - Bonus indicators contribute to their parent element total but the element
 *     total is capped at the element's max points.
 *   - Existing sector pipelines are untouched.
 */

import {
  getConstructionScorecard,
  type ConstructionElement,
  type ConstructionIndicator,
  type ConstructionScorecardConfig,
} from './constructionIndicators.js';

export type IndicatorStatus = 'met' | 'partial' | 'failed' | 'missing_data';

export interface IndicatorResult {
  code: string;
  element: ConstructionElement;
  category: 'main' | 'bonus';
  name: string;
  description: string;
  weight: number;
  target: number | string;
  targetUnit: string;
  actual: number | boolean | null;
  achievedPoints: number;
  availablePoints: number;
  gap: number;
  status: IndicatorStatus;
  evidenceRequired: string;
  missingFields: string[];
  recommendation?: string;
}

export interface ElementScore {
  element: ConstructionElement;
  name: string;
  achievedPoints: number;
  availablePoints: number;
  gap: number;
  indicators: IndicatorResult[];
}

export interface ConstructionScorecardOutput {
  sectorCode: 'CONSTRUCTION';
  scorecardType: 'QSE' | 'Contractor' | 'BEP';
  entityType: string;
  totalScore: number;
  totalAvailable: number;
  elementScores: Record<ConstructionElement, ElementScore>;
  indicators: IndicatorResult[];
  missingFieldSummary: string[];
  generatedAt: string;
}

export interface ConstructionScoringInput {
  /** Indicator actuals keyed by `inputKey` from the indicator matrix. */
  indicators: Record<string, number | boolean | null | undefined>;
  /** Financials needed by NPAT / leviable / TMPS calculations. */
  financials: {
    npat?: number;
    leviableAmount?: number;
    totalMeasuredProcurementSpend?: number;
  };
  /** Optional override for the African EAP percent (default uses national EAP for African = 80.4%). */
  africanEapPercent?: number;
}

const ELEMENT_NAMES: Record<ConstructionElement, string> = {
  ownership: 'Ownership',
  managementControl: 'Management Control',
  skillsDevelopment: 'Skills Development',
  enterpriseSupplierDevelopment: 'Enterprise & Supplier Development',
  socioEconomicDevelopment: 'Socio-Economic Development',
};

/** National EAP — African People share (Stats SA EAP 2023, ~80.4%). Used as default for Skills "African People (per Stats SA EAP)". */
const DEFAULT_AFRICAN_EAP_PERCENT = 80.4;

const r2 = (n: number) => Math.round(n * 100) / 100;

function recommend(indicator: ConstructionIndicator, status: IndicatorStatus, gap: number): string | undefined {
  if (status === 'met') return undefined;
  if (status === 'missing_data') {
    return `Provide value for "${indicator.name}" — required to score this indicator.`;
  }
  if (typeof indicator.target === 'number') {
    return `Increase performance by ${gap.toFixed(2)} points to reach the ${indicator.target}${indicator.targetUnit === 'percent' ? '%' : ''} target.`;
  }
  return `Provide qualifying evidence for "${indicator.name}".`;
}

function scoreIndicator(
  indicator: ConstructionIndicator,
  input: ConstructionScoringInput
): IndicatorResult {
  const raw = input.indicators[indicator.inputKey];
  const missing = raw === undefined || raw === null;
  const baseResult = {
    code: indicator.code,
    element: indicator.element,
    category: indicator.category,
    name: indicator.name,
    description: indicator.description,
    weight: indicator.weight,
    target: indicator.target,
    targetUnit: indicator.targetUnit,
    availablePoints: indicator.weight,
    evidenceRequired: indicator.evidenceRequired,
  };

  if (missing) {
    const result: IndicatorResult = {
      ...baseResult,
      actual: null,
      achievedPoints: 0,
      gap: indicator.weight,
      status: 'missing_data',
      missingFields: [indicator.inputKey],
    };
    result.recommendation = recommend(indicator, 'missing_data', indicator.weight);
    return result;
  }

  let achieved = 0;
  let actual: number | boolean = typeof raw === 'boolean' ? raw : Number(raw);

  switch (indicator.calculation) {
    case 'percentage': {
      const target = Number(indicator.target);
      const actualPct = Number(actual);
      achieved = target > 0 ? Math.min(indicator.weight, (actualPct / target) * indicator.weight) : 0;
      break;
    }
    case 'percentage_of_npat': {
      const npat = input.financials.npat ?? 0;
      if (npat <= 0) {
        return {
          ...baseResult,
          actual,
          achievedPoints: 0,
          gap: indicator.weight,
          status: 'missing_data',
          missingFields: ['financials.npat'],
          recommendation: 'NPAT is required to score this indicator. Provide a positive NPAT value.',
        };
      }
      const targetAmount = npat * (Number(indicator.target) / 100);
      achieved = targetAmount > 0 ? Math.min(indicator.weight, (Number(actual) / targetAmount) * indicator.weight) : 0;
      break;
    }
    case 'percentage_of_leviable': {
      const leviable = input.financials.leviableAmount ?? 0;
      if (leviable <= 0) {
        return {
          ...baseResult,
          actual,
          achievedPoints: 0,
          gap: indicator.weight,
          status: 'missing_data',
          missingFields: ['financials.leviableAmount'],
          recommendation: 'Leviable amount is required to score this indicator.',
        };
      }
      const targetAmount = leviable * (Number(indicator.target) / 100);
      achieved = targetAmount > 0 ? Math.min(indicator.weight, (Number(actual) / targetAmount) * indicator.weight) : 0;
      break;
    }
    case 'percentage_of_tmps': {
      const tmps = input.financials.totalMeasuredProcurementSpend ?? 0;
      if (tmps <= 0) {
        return {
          ...baseResult,
          actual,
          achievedPoints: 0,
          gap: indicator.weight,
          status: 'missing_data',
          missingFields: ['financials.totalMeasuredProcurementSpend'],
          recommendation: 'Total Measured Procurement Spend (TMPS) is required to score this indicator.',
        };
      }
      const targetAmount = tmps * (Number(indicator.target) / 100);
      achieved = targetAmount > 0 ? Math.min(indicator.weight, (Number(actual) / targetAmount) * indicator.weight) : 0;
      break;
    }
    case 'bonus_threshold': {
      const target = Number(indicator.target);
      achieved = Number(actual) >= target ? indicator.weight : 0;
      break;
    }
    case 'evidence': {
      const truthy = actual === true || (typeof actual === 'number' && actual >= 1) || actual === 'Yes';
      achieved = truthy ? indicator.weight : 0;
      actual = !!truthy;
      break;
    }
    case 'net_value': {
      // Simplified Net Value: realisation factor in [0, 1] applied to the weight.
      // Detailed Annex CSC 100 calc requires inputs we don't model yet — this
      // accepts a precomputed realisation value (0..1 or 0..100) from upstream.
      const v = Number(actual);
      const factor = v > 1 ? v / 100 : v;
      achieved = Math.max(0, Math.min(indicator.weight, factor * indicator.weight));
      break;
    }
    case 'eap_percentage': {
      const eapTarget = input.africanEapPercent ?? DEFAULT_AFRICAN_EAP_PERCENT;
      const actualPct = Number(actual);
      achieved = eapTarget > 0 ? Math.min(indicator.weight, (actualPct / eapTarget) * indicator.weight) : 0;
      break;
    }
    default: {
      achieved = 0;
    }
  }

  achieved = r2(achieved);
  const gap = r2(Math.max(0, indicator.weight - achieved));
  let status: IndicatorStatus;
  if (achieved >= indicator.weight - 0.001) status = 'met';
  else if (achieved > 0) status = 'partial';
  else status = 'failed';

  const result: IndicatorResult = {
    ...baseResult,
    actual,
    achievedPoints: achieved,
    gap,
    status,
    missingFields: [],
  };
  result.recommendation = recommend(indicator, status, gap);
  return result;
}

export function calculateConstructionScorecard(
  entityType: string,
  input: ConstructionScoringInput
): ConstructionScorecardOutput {
  const config: ConstructionScorecardConfig = getConstructionScorecard(entityType);

  const elementScores = {} as Record<ConstructionElement, ElementScore>;
  for (const el of Object.keys(config.elementMaxPoints) as ConstructionElement[]) {
    elementScores[el] = {
      element: el,
      name: ELEMENT_NAMES[el],
      achievedPoints: 0,
      availablePoints: config.elementMaxPoints[el],
      gap: 0,
      indicators: [],
    };
  }

  const allIndicatorResults: IndicatorResult[] = [];
  const missingSet = new Set<string>();

  for (const ind of config.indicators) {
    const r = scoreIndicator(ind, input);
    allIndicatorResults.push(r);
    elementScores[ind.element].indicators.push(r);
    elementScores[ind.element].achievedPoints += r.achievedPoints;
    for (const m of r.missingFields) missingSet.add(m);
  }

  // Cap each element at its maximum and compute gap; round.
  let totalScore = 0;
  for (const el of Object.keys(elementScores) as ConstructionElement[]) {
    const e = elementScores[el];
    e.achievedPoints = r2(Math.min(e.achievedPoints, e.availablePoints));
    e.gap = r2(Math.max(0, e.availablePoints - e.achievedPoints));
    totalScore += e.achievedPoints;
  }

  return {
    sectorCode: 'CONSTRUCTION',
    scorecardType: config.scorecardType,
    entityType,
    totalScore: r2(totalScore),
    totalAvailable: config.totalMaxPoints,
    elementScores,
    indicators: allIndicatorResults,
    missingFieldSummary: Array.from(missingSet),
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Lightweight payload validator. Returns `{ valid: true }` or
 * `{ valid: false, errors: [...] }`. Used by the API route before scoring.
 */
export function validateConstructionPayload(payload: unknown): { valid: true; value: ConstructionScoringInput & { entityType: string } } | { valid: false; errors: string[] } {
  const errors: string[] = [];
  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Payload must be an object.'] };
  }
  const p = payload as Record<string, unknown>;
  const entityType = typeof p.entityType === 'string' ? p.entityType : '';
  if (!entityType) errors.push('entityType is required (one of: construction_qse, construction_contractor, construction_bep)');
  const indicators = (p.indicators ?? {}) as Record<string, unknown>;
  if (typeof indicators !== 'object' || Array.isArray(indicators)) {
    errors.push('indicators must be an object keyed by indicator inputKey.');
  }
  const financials = (p.financials ?? {}) as Record<string, unknown>;
  if (typeof financials !== 'object' || Array.isArray(financials)) {
    errors.push('financials must be an object.');
  }
  if (errors.length > 0) return { valid: false, errors };

  return {
    valid: true,
    value: {
      entityType,
      indicators: indicators as Record<string, number | boolean | null | undefined>,
      financials: {
        npat: typeof financials.npat === 'number' ? financials.npat : undefined,
        leviableAmount: typeof financials.leviableAmount === 'number' ? financials.leviableAmount : undefined,
        totalMeasuredProcurementSpend: typeof financials.totalMeasuredProcurementSpend === 'number' ? financials.totalMeasuredProcurementSpend : undefined,
      },
      africanEapPercent: typeof p.africanEapPercent === 'number' ? p.africanEapPercent : undefined,
    },
  };
}
