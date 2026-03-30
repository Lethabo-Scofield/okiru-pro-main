/**
 * Rules Registry — B-BBEE Scoring Formula Definitions
 *
 * Declarative formula specifications that drive the calculation engine.
 * Each formula defines its inputs, parameters, and computation logic.
 *
 * Formula types (10 total):
 *   proportional      → (actual / target) * maxPoints
 *   graduated         → Economic interest with graduation factor
 *   net_value         → Net value calculation with debt/carrying value
 *   bonus_flag        → Binary condition check
 *   eap_proportional  → Based on Economically Active Population targets
 *   percent_of_base   → (spend / base) * maxPoints (TMPS, leviable)
 *   percent_of_npat   → (spend / NPAT) * maxPoints (ESD, SED)
 *   yes_headcount     → YES youth target based on company size
 *   yes_absorption    → YES absorption rate calculation
 *   yes_tier          → YES level improvement tiers
 */

// ---------------------------------------------------------------------------
// Formula Parameter Types
// ---------------------------------------------------------------------------

export interface FormulaParams {
  target?: number;
  maxPoints: number;
  [key: string]: unknown;
}

export interface ProportionalParams extends FormulaParams {
  target: number;
  maxPoints: number;
}

export interface GraduatedParams extends FormulaParams {
  baseTarget: number;
  maxPoints: number;
  graduationYears?: number;
}

export interface NetValueParams extends FormulaParams {
  maxPoints: number;
  debtAttribute?: number;
  subMinimumThreshold: number;
}

export interface BonusFlagParams extends FormulaParams {
  condition: string;
  maxPoints: number;
}

export interface EapProportionalParams extends FormulaParams {
  eapTarget: number;
  maxPoints: number;
}

export interface PercentOfBaseParams extends FormulaParams {
  targetPercent: number;
  maxPoints: number;
  baseValue: number;
}

export interface PercentOfNpatParams extends FormulaParams {
  targetPercent: number;
  maxPoints: number;
  npat: number;
}

export interface YesHeadcountParams extends FormulaParams {
  companySize: 'EME' | 'QSE' | 'Generic';
  currentHeadcount: number;
}

export interface YesAbsorptionParams extends FormulaParams {
  absorbedCount: number;
  totalPlaced: number;
  targetPercent: number;
}

export interface YesTierParams extends FormulaParams {
  currentLevel: number;
  achievedLevel: number;
  companySize: 'EME' | 'QSE' | 'Generic';
}

// ---------------------------------------------------------------------------
// Formula Definition
// ---------------------------------------------------------------------------

export interface FormulaDefinition {
  id: string;
  name: string;
  description: string;
  requiredInputs: string[];
  optionalInputs?: string[];
  parameters: FormulaParams;
  compute: (inputs: Record<string, number | boolean | string>, params: FormulaParams) => FormulaResult;
}

export interface FormulaResult {
  points: number;
  maxPoints: number;
  percentage: number;
  targetMet: boolean;
  intermediateValues?: Record<string, number | string>;
}

// ---------------------------------------------------------------------------
// Graduation Factor Table (for graduated formula)
// ---------------------------------------------------------------------------

const GRADUATION_TABLE: Record<number, number> = {
  1: 0.1, 2: 0.2, 3: 0.4, 4: 0.6,
  5: 0.8, 6: 1.0, 7: 1.0, 8: 1.0, 9: 1.0, 10: 1.0
};

function getGraduationFactor(years: number): number {
  if (years <= 0) return 0;
  let factor = 0;
  for (const y of Object.keys(GRADUATION_TABLE).map(Number).sort((a, b) => a - b)) {
    if (y <= years) factor = GRADUATION_TABLE[y]; else break;
  }
  return factor;
}

// ---------------------------------------------------------------------------
// Helper: Round to 2 decimals
// ---------------------------------------------------------------------------

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Formula Implementations
// ---------------------------------------------------------------------------

export const FORMULA_REGISTRY: Record<string, FormulaDefinition> = {
  // ==========================================================================
  // 1. PROPORTIONAL — Most common formula
  //    (actual / target) * maxPoints, capped at maxPoints
  //    Used for: voting rights, board participation, disabled employees
  // ==========================================================================
  proportional: {
    id: 'proportional',
    name: 'Proportional Achievement',
    description: 'Achievement percentage multiplied by max points, capped',
    requiredInputs: ['actual'],
    optionalInputs: ['targetOverride'],
    parameters: { target: 0, maxPoints: 0 },
    compute: (inputs, params) => {
      const actual = Number(inputs.actual) || 0;
      const target = Number(inputs.targetOverride) || params.target || 0;
      const maxPoints = params.maxPoints;

      const percentage = target > 0 ? actual / target : 0;
      const points = Math.min(percentage * maxPoints, maxPoints);

      return {
        points: r2(points),
        maxPoints,
        percentage: r2(Math.min(percentage, 1) * 100),
        targetMet: percentage >= 1,
        intermediateValues: { actual, target, percentage: r2(percentage) }
      };
    }
  },

  // ==========================================================================
  // 2. GRADUATED — Economic interest with time-based graduation
  //    Adjusts target based on years held
  //    Used for: OWN-EI-BLACK (economic interest)
  // ==========================================================================
  graduated: {
    id: 'graduated',
    name: 'Graduated Achievement',
    description: 'Economic interest with graduation factor based on years held',
    requiredInputs: ['actual', 'yearsHeld'],
    parameters: { baseTarget: 0.25, maxPoints: 8 },
    compute: (inputs, params) => {
      const actual = Number(inputs.actual) || 0;
      const yearsHeld = Number(inputs.yearsHeld) || 0;
      const baseTarget = Number(params.baseTarget) || 0.25;
      const maxPoints = params.maxPoints;

      const gradFactor = getGraduationFactor(yearsHeld);
      const adjustedTarget = yearsHeld > 0 ? baseTarget * gradFactor : baseTarget;

      const percentage = adjustedTarget > 0 ? actual / adjustedTarget : 0;
      const points = Math.min(percentage * maxPoints, maxPoints);

      return {
        points: r2(points),
        maxPoints,
        percentage: r2(Math.min(percentage, 1) * 100),
        targetMet: percentage >= 1,
        intermediateValues: {
          actual,
          baseTarget,
          yearsHeld,
          gradFactor,
          adjustedTarget,
          percentage: r2(percentage)
        }
      };
    }
  },

  // ==========================================================================
  // 3. NET_VALUE — Complex ownership net value calculation
  //    (allocated - debt) / carrying * blackOwnership
  //    Used for: OWN-NV
  // ==========================================================================
  net_value: {
    id: 'net_value',
    name: 'Net Value Calculation',
    description: 'Net value based on company valuation, debt, and share carrying value',
    requiredInputs: ['blackOwnership', 'companyValue', 'shareValue', 'outstandingDebt'],
    parameters: { maxPoints: 8, subMinimumThreshold: 3.2 },
    compute: (inputs, params) => {
      const blackOwnership = Number(inputs.blackOwnership) || 0;
      const companyValue = Number(inputs.companyValue) || 0;
      const shareValue = Number(inputs.shareValue) || 0;
      const outstandingDebt = Number(inputs.outstandingDebt) || 0;
      const maxPoints = params.maxPoints;

      let netValueRatio = 0;
      if (companyValue > 0 && shareValue > 0) {
        const allocated = companyValue * blackOwnership;
        const debtAttr = outstandingDebt * blackOwnership;
        const carrying = shareValue * blackOwnership;
        if (carrying > 0) {
          netValueRatio = Math.max(0, (allocated - debtAttr) / carrying);
        }
      }

      // If no net value data available, fallback to black ownership percentage
      if (companyValue === 0 || shareValue === 0) {
        netValueRatio = blackOwnership >= 1.0 ? 1.0 : blackOwnership / 0.25;
      }

      const points = Math.min(netValueRatio * maxPoints, maxPoints);
      const subMinimumThreshold = Number(params.subMinimumThreshold) || 3.2;

      return {
        points: r2(points),
        maxPoints,
        percentage: r2(Math.min(netValueRatio, 1) * 100),
        targetMet: points >= subMinimumThreshold,
        intermediateValues: {
          blackOwnership,
          companyValue,
          shareValue,
          outstandingDebt,
          netValueRatio: r2(netValueRatio)
        }
      };
    }
  },

  // ==========================================================================
  // 4. BONUS_FLAG — Binary condition check
  //    Full points if condition met, 0 otherwise
  //    Used for: bonus criteria, new entrants
  // ==========================================================================
  bonus_flag: {
    id: 'bonus_flag',
    name: 'Bonus Flag',
    description: 'Full points if condition is satisfied',
    requiredInputs: ['conditionMet'],
    parameters: { condition: '', maxPoints: 1 },
    compute: (inputs, params) => {
      const conditionMet = inputs.conditionMet === true || inputs.conditionMet === 'true';
      const maxPoints = params.maxPoints;

      return {
        points: conditionMet ? maxPoints : 0,
        maxPoints,
        percentage: conditionMet ? 100 : 0,
        targetMet: conditionMet,
        intermediateValues: { conditionMet: conditionMet ? 1 : 0 }
      };
    }
  },

  // ==========================================================================
  // 5. EAP_PROPORTIONAL — Based on Economically Active Population
  //    Achievement vs EAP demographic targets
  //    Used for: EE-SENIOR, EE-MIDDLE, EE-JUNIOR
  // ==========================================================================
  eap_proportional: {
    id: 'eap_proportional',
    name: 'EAP-Based Proportional',
    description: 'Achievement based on Economically Active Population targets',
    requiredInputs: ['actualPercentage', 'eapPercentage'],
    parameters: { maxPoints: 0 },
    compute: (inputs, params) => {
      const actual = Number(inputs.actualPercentage) || 0;
      const eapTarget = Number(inputs.eapPercentage) || 0;
      const maxPoints = params.maxPoints;

      const percentage = eapTarget > 0 ? actual / eapTarget : 0;
      const points = Math.min(percentage * maxPoints, maxPoints);

      return {
        points: r2(points),
        maxPoints,
        percentage: r2(Math.min(percentage, 1) * 100),
        targetMet: percentage >= 1,
        intermediateValues: { actual, eapTarget, percentage: r2(percentage) }
      };
    }
  },

  // ==========================================================================
  // 6. PERCENT_OF_BASE — Spend as percentage of base amount
  //    (spend / base) * maxPoints
  //    Used for: Skills, Procurement
  // ==========================================================================
  percent_of_base: {
    id: 'percent_of_base',
    name: 'Percent of Base',
    description: 'Spend as percentage of base value (TMPS, leviable amount)',
    requiredInputs: ['spend', 'baseValue'],
    parameters: { targetPercent: 0, maxPoints: 0 },
    compute: (inputs, params) => {
      const spend = Number(inputs.spend) || 0;
      const baseValue = Number(inputs.baseValue) || 0;
      const targetPercent = Number(params.targetPercent) || 0;
      const maxPoints = params.maxPoints;

      const targetSpend = baseValue * targetPercent;
      const percentage = targetSpend > 0 ? spend / targetSpend : 0;
      const points = Math.min(percentage * maxPoints, maxPoints);

      return {
        points: r2(points),
        maxPoints,
        percentage: r2(Math.min(percentage, 1) * 100),
        targetMet: percentage >= 1,
        intermediateValues: {
          spend,
          baseValue,
          targetSpend: r2(targetSpend),
          percentage: r2(percentage)
        }
      };
    }
  },

  // ==========================================================================
  // 7. PERCENT_OF_NPAT — Spend as percentage of NPAT
  //    (spend / NPAT) * maxPoints
  //    Used for: ESD, SED
  // ==========================================================================
  percent_of_npat: {
    id: 'percent_of_npat',
    name: 'Percent of NPAT',
    description: 'Spend as percentage of Net Profit After Tax',
    requiredInputs: ['spend', 'npat'],
    parameters: { targetPercent: 0, maxPoints: 0 },
    compute: (inputs, params) => {
      const spend = Number(inputs.spend) || 0;
      const npat = Number(inputs.npat) || 0;
      const targetPercent = Number(params.targetPercent) || 0;
      const maxPoints = params.maxPoints;

      const targetSpend = npat * targetPercent;
      const percentage = targetSpend > 0 ? spend / targetSpend : 0;
      const points = Math.min(percentage * maxPoints, maxPoints);

      return {
        points: r2(points),
        maxPoints,
        percentage: r2(Math.min(percentage, 1) * 100),
        targetMet: percentage >= 1,
        intermediateValues: {
          spend,
          npat,
          targetSpend: r2(targetSpend),
          percentage: r2(percentage)
        }
      };
    }
  },

  // ==========================================================================
  // 8. YES_HEADCOUNT — YES youth headcount target
  //    Size-based headcount requirements
  // ==========================================================================
  yes_headcount: {
    id: 'yes_headcount',
    name: 'YES Headcount Target',
    description: 'YES youth placement target based on company size',
    requiredInputs: ['currentHeadcount'],
    parameters: { companySize: 'Generic' as const, maxPoints: 0 },
    compute: (inputs, params) => {
      const current = Number(inputs.currentHeadcount) || 0;
      const size = String(params.companySize) as 'EME' | 'QSE' | 'Generic';

      // YES targets vary by company size
      const targets: Record<string, number> = { EME: 1, QSE: 2, Generic: 5 };
      const target = targets[size] || targets.Generic;

      const percentage = target > 0 ? current / target : 0;

      return {
        points: 0, // YES doesn't contribute points directly, only level boost
        maxPoints: 0,
        percentage: r2(Math.min(percentage, 1) * 100),
        targetMet: percentage >= 1,
        intermediateValues: { current, target, companySize: size }
      };
    }
  },

  // ==========================================================================
  // 9. YES_ABSORPTION — YES absorption rate
  //    Percentage of YES youth absorbed into permanent employment
  // ==========================================================================
  yes_absorption: {
    id: 'yes_absorption',
    name: 'YES Absorption Rate',
    description: 'Percentage of YES youth absorbed into permanent employment',
    requiredInputs: ['absorbedCount', 'totalPlaced'],
    parameters: { targetPercent: 0.25, maxPoints: 0 },
    compute: (inputs, params) => {
      const absorbed = Number(inputs.absorbedCount) || 0;
      const total = Number(inputs.totalPlaced) || 0;
      const targetPercent = Number(params.targetPercent) || 0.25;

      const actualPercent = total > 0 ? absorbed / total : 0;

      return {
        points: 0,
        maxPoints: 0,
        percentage: r2(actualPercent * 100),
        targetMet: actualPercent >= targetPercent,
        intermediateValues: { absorbed, total, actualPercent: r2(actualPercent), targetPercent }
      };
    }
  },

  // ==========================================================================
  // 10. YES_TIER — YES level improvement
  //     Tier-based level boost calculation
  // ==========================================================================
  yes_tier: {
    id: 'yes_tier',
    name: 'YES Tier Level Boost',
    description: 'B-BBEE level improvement based on YES achievement tier',
    requiredInputs: ['currentLevel', 'achievedLevel'],
    parameters: { companySize: 'Generic' as const, maxPoints: 0 },
    compute: (inputs, params) => {
      const current = Number(inputs.currentLevel) || 8;
      const achieved = Number(inputs.achievedLevel) || current;
      const size = String(params.companySize) as 'EME' | 'QSE' | 'Generic';

      // Level boost varies by company size and achievement
      const boost = size === 'EME' ? 2 : size === 'QSE' ? 1 : 1;
      const newLevel = Math.max(1, current - boost);

      return {
        points: 0,
        maxPoints: 0,
        percentage: achieved < current ? 100 : 0,
        targetMet: achieved < current,
        intermediateValues: { current, achieved, boost, newLevel, companySize: size }
      };
    }
  }
};

// ---------------------------------------------------------------------------
// Formula Registry Utilities
// ---------------------------------------------------------------------------

export function getFormula(formulaId: string): FormulaDefinition | undefined {
  return FORMULA_REGISTRY[formulaId];
}

export function listFormulas(): Array<{ id: string; name: string; description: string }> {
  return Object.values(FORMULA_REGISTRY).map(f => ({
    id: f.id,
    name: f.name,
    description: f.description
  }));
}

export function validateFormulaInputs(
  formulaId: string,
  inputs: Record<string, unknown>
): { valid: boolean; missing: string[]; extra: string[] } {
  const formula = getFormula(formulaId);
  if (!formula) {
    return { valid: false, missing: ['unknown formula'], extra: [] };
  }

  const provided = new Set(Object.keys(inputs));
  const required = new Set(formula.requiredInputs);
  const allowed = new Set([...formula.requiredInputs, ...(formula.optionalInputs || [])]);

  const missing = [...required].filter(r => !provided.has(r));
  const extra = [...provided].filter(p => !allowed.has(p));

  return { valid: missing.length === 0, missing, extra };
}

export function executeFormula(
  formulaId: string,
  inputs: Record<string, number | boolean | string>,
  params: FormulaParams
): FormulaResult | { error: string } {
  const formula = getFormula(formulaId);
  if (!formula) {
    return { error: `Unknown formula: ${formulaId}` };
  }

  const validation = validateFormulaInputs(formulaId, inputs);
  if (!validation.valid) {
    return { error: `Missing required inputs: ${validation.missing.join(', ')}` };
  }

  try {
    return formula.compute(inputs, params);
  } catch (err) {
    return { error: `Computation error: ${err instanceof Error ? err.message : 'unknown'}` };
  }
}

// ---------------------------------------------------------------------------
// Recognition Table (for procurement scoring)
// ---------------------------------------------------------------------------

export const RECOGNITION_TABLE: Record<number, number> = {
  1: 1.35, 2: 1.25, 3: 1.10, 4: 1.00,
  5: 0.80, 6: 0.60, 7: 0.50, 8: 0.10, 0: 0
};

export function getRecognitionMultiplier(beeLevel: number): number {
  return RECOGNITION_TABLE[beeLevel] ?? 0;
}
