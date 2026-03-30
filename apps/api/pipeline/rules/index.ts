/**
 * Rules Module — B-BBEE Scoring Rules Registry
 *
 * Central export for formula definitions and calculation engine.
 */

export {
  FORMULA_REGISTRY,
  getFormula,
  listFormulas,
  validateFormulaInputs,
  executeFormula,
  getRecognitionMultiplier,
  RECOGNITION_TABLE,
} from './formulaRegistry.js';
export type {
  FormulaDefinition,
  FormulaParams,
  FormulaResult,
  ProportionalParams,
  GraduatedParams,
  NetValueParams,
  BonusFlagParams,
  EapProportionalParams,
  PercentOfBaseParams,
  PercentOfNpatParams,
  YesHeadcountParams,
  YesAbsorptionParams,
  YesTierParams,
} from './formulaRegistry.js';

export {
  CalculationEngine,
  createCalculationEngine,
  calculateScorecard,
} from './calculationEngine.js';
export type {
  EntityValue,
  CriterionInput,
  CriterionResult,
  PillarResult,
  ScorecardResult,
  CalculationContext,
  CalculationOptions,
} from './calculationEngine.js';
