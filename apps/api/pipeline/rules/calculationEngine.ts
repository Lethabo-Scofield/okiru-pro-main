/**
 * Calculation Engine — Deterministic B-BBEE Scoring
 *
 * Orchestrates formula execution with dependency resolution, input mapping,
 * and result aggregation. This is the unified calculator that replaces the
 * fragmented implementations in calculators.ts and sectorCalculators.ts.
 *
 * Key capabilities:
 *   - Dependency graph resolution (criterion inputs → entity values)
 *   - Formula registry dispatch
 *   - Cross-pillar dependency handling (NPAT → ESD/SED)
 *   - Sub-minimum tracking
 *   - Audit trail generation
 */

import {
  FORMULA_REGISTRY,
  executeFormula,
  validateFormulaInputs,
  getRecognitionMultiplier,
  type FormulaParams,
  type FormulaResult,
} from './formulaRegistry.js';
import type {
  CriterionEntity,
  EntityManifest,
  EntityField,
  PillarPack,
} from '../extraction/entityManifest.js';
import type { SectorConfig } from '../sectorConfig.js';
import { getSectorConfig } from '../sectorConfig.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EntityValue {
  entityId: string;
  value: number | string | boolean;
  source: 'extraction' | 'manual' | 'default' | 'calculation';
  confidence?: number;
}

export interface CriterionInput {
  criterionCode: string;
  pillarCode: string;
  entityValues: Record<string, EntityValue>;
  computedInputs: Record<string, number>; // Derived values (counts, percentages)
}

export interface CriterionResult {
  criterionCode: string;
  pillarCode: string;
  name: string;
  formulaId: string;
  points: number;
  maxPoints: number;
  percentage: number;
  targetMet: boolean;
  subMinimumMet: boolean;
  inputs: Record<string, unknown>;
  intermediateValues?: Record<string, number | string>;
  errors: string[];
}

export interface PillarResult {
  pillarCode: string;
  pillarName: string;
  points: number;
  maxPoints: number;
  percentage: number;
  subMinimumMet: boolean;
  criteria: CriterionResult[];
}

export interface ScorecardResult {
  assessmentId: string;
  sectorCode: string;
  scorecardType: string;
  totalPoints: number;
  maxPoints: number;
  overallPercentage: number;
  beeLevel: number;
  recognitionLevel: number;
  pillars: PillarResult[];
  subMinimums: Record<string, boolean>;
  calculationErrors: string[];
  calculatedAt: string;
}

export interface CalculationContext {
  assessmentId: string;
  manifest: EntityManifest;
  sectorConfig: SectorConfig;
  entityValues: Map<string, EntityValue>;
  crossPillarValues: Map<string, number>; // NPAT, TMPS, leviableAmount, etc.
}

// ---------------------------------------------------------------------------
// Input Extractors — Transform entity values into formula inputs
// ---------------------------------------------------------------------------

interface InputExtractor {
  criterionCode: string;
  extract: (values: Map<string, EntityValue>, crossPillar: Map<string, number>) => Record<string, number | boolean | string>;
}

/**
 * Build input extractors for all criteria based on their input entities.
 */
function buildInputExtractors(manifest: EntityManifest): Map<string, InputExtractor> {
  const extractors = new Map<string, InputExtractor>();

  for (const pack of manifest.pillarPacks) {
    for (const criterion of pack.criteria) {
      extractors.set(criterion.code, {
        criterionCode: criterion.code,
        extract: (values, crossPillar) => {
          const inputs: Record<string, number | boolean | string> = {};

          // Extract values for each input entity
          for (const entityId of criterion.inputEntities) {
            const entityValue = values.get(entityId);
            if (entityValue !== undefined) {
              // Map entity ID to standardized input name
              const inputName = mapEntityToInputName(entityId, criterion.code);
              inputs[inputName] = entityValue.value;
            }
          }

          // Add cross-pillar values (NPAT, TMPS, etc.)
          for (const [key, value] of crossPillar) {
            inputs[key] = value;
          }

          // Add computed values based on criterion type
          const computed = computeDerivedInputs(criterion, values);
          Object.assign(inputs, computed);

          return inputs;
        },
      });
    }
  }

  return extractors;
}

/**
 * Map entity field ID to standardized formula input name.
 */
function mapEntityToInputName(entityId: string, criterionCode: string): string {
  // Ownership mappings
  if (entityId.includes('ownership_percent')) return 'actual';
  if (entityId === 'share_value') return 'shareValue';

  // Management control mappings
  if (entityId === 'employee_race') return 'race';
  if (entityId === 'employee_gender') return 'gender';
  if (entityId === 'employee_designation') return 'designation';
  if (entityId === 'employee_disabled') return 'isDisabled';

  // Skills mappings
  if (entityId === 'training_cost') return 'spend';
  if (entityId === 'leviable_amount') return 'baseValue';

  // Procurement mappings
  if (entityId === 'supplier_spend') return 'spend';
  if (entityId === 'supplier_bee_level') return 'beeLevel';
  if (entityId === 'supplier_black_ownership') return 'blackOwnership';
  if (entityId === 'tmps') return 'baseValue';

  // ESD/SED mappings
  if (entityId === 'esd_amount') return 'spend';
  if (entityId === 'sed_amount') return 'spend';
  if (entityId === 'npat') return 'npat';

  // Default: use entity ID as input name
  return entityId;
}

/**
 * Compute derived inputs (counts, percentages) from raw entity values.
 */
function computeDerivedInputs(
  criterion: CriterionEntity,
  values: Map<string, EntityValue>
): Record<string, number> {
  const computed: Record<string, number> = {};

  // Management control / EE: count black employees, board members, etc.
  if (criterion.pillarCode === 'managementControl' || criterion.pillarCode === 'employmentEquity') {
    const designations = ['Board', 'Executive', 'Senior', 'Middle', 'Junior'];

    for (const desig of designations) {
      if (criterion.code.toLowerCase().includes(desig.toLowerCase())) {
        // This is a simplified count - in production, you'd have employee arrays
        const key = `${desig.toLowerCase()}Count`;
        computed[key] = 0; // Placeholder - actual counting happens elsewhere
      }
    }
  }

  // Ownership: compute weighted ownership from shareholder data
  if (criterion.pillarCode === 'ownership') {
    // Weighted ownership calculation would go here
    computed.yearsHeld = 0; // Default - should come from entity values
    computed.companyValue = 0;
    computed.outstandingDebt = 0;
  }

  return computed;
}

// ---------------------------------------------------------------------------
// Parameter Builders — Create formula params from criterion + sector config
// ---------------------------------------------------------------------------

function buildFormulaParams(
  criterion: CriterionEntity,
  sectorConfig: SectorConfig
): FormulaParams {
  const baseParams: FormulaParams = {
    target: typeof criterion.target === 'number' ? criterion.target : 0,
    maxPoints: criterion.maxPoints,
  };

  switch (criterion.formulaId) {
    case 'proportional':
      return {
        target: baseParams.target,
        maxPoints: baseParams.maxPoints,
      };

    case 'graduated':
      return {
        baseTarget: baseParams.target || 0.25,
        maxPoints: baseParams.maxPoints,
        graduationYears: 0, // Should come from entity values
      };

    case 'net_value':
      return {
        maxPoints: baseParams.maxPoints,
        subMinimumThreshold: criterion.minimumThreshold || 3.2,
      };

    case 'bonus_flag':
      return {
        condition: criterion.bonusCondition || '',
        maxPoints: baseParams.maxPoints,
      };

    case 'eap_proportional':
      return {
        eapTarget: 0.5, // Should come from EAP configuration
        maxPoints: baseParams.maxPoints,
      };

    case 'percent_of_base':
      // Skills or Procurement
      if (criterion.pillarCode === 'skillsDevelopment') {
        const t = sectorConfig.targets.skills;
        return {
          targetPercent: criterion.code === 'SKILLS-BURS'
            ? t.bursarySpendPercent / 100
            : t.overallSpendPercent / 100,
          maxPoints: baseParams.maxPoints,
        };
      } else {
        const t = sectorConfig.targets.procurement;
        // Map criterion code to specific target
        const targetMap: Record<string, number> = {
          'PROC-EMP': t.allSuppliersTarget,
          'PROC-QSE': t.qseTarget,
          'PROC-EME': t.emeTarget,
          'PROC-BO51': t.bo51Target,
          'PROC-BWO30': t.bwo30Target,
          'PROC-DG': 0.12,
        };
        return {
          targetPercent: targetMap[criterion.code] || 0,
          maxPoints: baseParams.maxPoints,
        };
      }

    case 'percent_of_npat':
      if (criterion.pillarCode === 'enterpriseSupplierDevelopment') {
        const t = sectorConfig.targets.esd;
        return {
          targetPercent: criterion.code === 'ESD-SD'
            ? t.sdPercent / 100
            : t.edPercent / 100,
          maxPoints: baseParams.maxPoints,
        };
      } else {
        const t = sectorConfig.targets.sed;
        return {
          targetPercent: t.spendPercent / 100,
          maxPoints: baseParams.maxPoints,
        };
      }

    case 'yes_headcount':
      return {
        companySize: sectorConfig.scorecardType,
        maxPoints: 0,
      };

    case 'yes_absorption':
      return {
        targetPercent: 0.25,
        maxPoints: 0,
      };

    case 'yes_tier':
      return {
        companySize: sectorConfig.scorecardType,
        maxPoints: 0,
      };

    default:
      return baseParams;
  }
}

// ---------------------------------------------------------------------------
// Calculation Engine
// ---------------------------------------------------------------------------

export class CalculationEngine {
  private context: CalculationContext;
  private extractors: Map<string, InputExtractor>;
  private results: Map<string, CriterionResult> = new Map();

  constructor(context: CalculationContext) {
    this.context = context;
    this.extractors = buildInputExtractors(context.manifest);
  }

  /**
   * Calculate a single criterion.
   */
  calculateCriterion(criterion: CriterionEntity): CriterionResult {
    const cacheKey = `${criterion.pillarCode}_${criterion.code}`;

    // Check cache
    if (this.results.has(cacheKey)) {
      return this.results.get(cacheKey)!;
    }

    const result: CriterionResult = {
      criterionCode: criterion.code,
      pillarCode: criterion.pillarCode,
      name: criterion.name,
      formulaId: criterion.formulaId,
      points: 0,
      maxPoints: criterion.maxPoints,
      percentage: 0,
      targetMet: false,
      subMinimumMet: false,
      inputs: {},
      errors: [],
    };

    // Get input extractor
    const extractor = this.extractors.get(criterion.code);
    if (!extractor) {
      result.errors.push(`No input extractor found for ${criterion.code}`);
      this.results.set(cacheKey, result);
      return result;
    }

    // Extract inputs
    const inputs = extractor.extract(
      this.context.entityValues,
      this.context.crossPillarValues
    );
    result.inputs = inputs;

    // Validate inputs
    const validation = validateFormulaInputs(criterion.formulaId, inputs);
    if (!validation.valid) {
      result.errors.push(`Missing inputs: ${validation.missing.join(', ')}`);
      this.results.set(cacheKey, result);
      return result;
    }

    // Build formula parameters
    const params = buildFormulaParams(criterion, this.context.sectorConfig);

    // Execute formula
    const formulaResult = executeFormula(criterion.formulaId, inputs, params);

    if ('error' in formulaResult) {
      result.errors.push(formulaResult.error);
    } else {
      result.points = formulaResult.points;
      result.maxPoints = formulaResult.maxPoints;
      result.percentage = formulaResult.percentage;
      result.targetMet = formulaResult.targetMet;
      result.intermediateValues = formulaResult.intermediateValues;

      // Check sub-minimum (if applicable)
      const pillarConfig = this.context.sectorConfig.pillarConfigs[
        criterion.pillarCode as keyof typeof this.context.sectorConfig.pillarConfigs
      ];
      if (pillarConfig?.hasSubMinimum && criterion.minimumThreshold !== undefined) {
        result.subMinimumMet = result.points >= criterion.minimumThreshold;
      } else if (pillarConfig?.hasSubMinimum) {
        // Default: check against percentage of max points
        const threshold = pillarConfig.maxPoints * (pillarConfig.subMinimumPercent / 100);
        result.subMinimumMet = result.points >= threshold;
      }
    }

    this.results.set(cacheKey, result);
    return result;
  }

  /**
   * Calculate all criteria for a pillar.
   */
  calculatePillar(pack: PillarPack): PillarResult {
    const criterionResults: CriterionResult[] = [];

    for (const criterion of pack.criteria) {
      criterionResults.push(this.calculateCriterion(criterion));
    }

    const points = criterionResults.reduce((sum, r) => sum + r.points, 0);
    const maxPoints = pack.maxPoints;
    const percentage = maxPoints > 0 ? (points / maxPoints) * 100 : 0;

    // Check sub-minimum for pillar
    let subMinimumMet = true;
    if (pack.hasSubMinimum) {
      // All criteria with sub-minimum requirements must be met
      const subMinCriteria = criterionResults.filter(r => r.maxPoints > 0);
      if (subMinCriteria.length > 0) {
        subMinimumMet = subMinCriteria.every(r => r.subMinimumMet);
      }
      // Also check pillar-level threshold
      if (points < pack.subMinimumThreshold) {
        subMinimumMet = false;
      }
    }

    return {
      pillarCode: pack.pillarCode,
      pillarName: pack.pillarName,
      points: r2(points),
      maxPoints,
      percentage: r2(percentage),
      subMinimumMet,
      criteria: criterionResults,
    };
  }

  /**
   * Calculate the complete scorecard.
   */
  calculateScorecard(): ScorecardResult {
    const pillarResults: PillarResult[] = [];
    const errors: string[] = [];

    for (const pack of this.context.manifest.pillarPacks) {
      // Skip financials pack (no criteria)
      if (pack.pillarCode === 'financials') continue;

      try {
        pillarResults.push(this.calculatePillar(pack));
      } catch (err) {
        errors.push(`Pillar ${pack.pillarCode} calculation failed: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    }

    // Calculate totals
    const totalPoints = pillarResults.reduce((sum, p) => sum + p.points, 0);
    const maxPoints = pillarResults.reduce((sum, p) => sum + p.maxPoints, 0);
    const overallPercentage = maxPoints > 0 ? (totalPoints / maxPoints) * 100 : 0;

    // Determine B-BBEE level
    const levelResult = this.determineLevel(totalPoints, pillarResults);

    // Build sub-minimum map
    const subMinimums: Record<string, boolean> = {};
    for (const p of pillarResults) {
      subMinimums[p.pillarCode] = p.subMinimumMet;
    }

    return {
      assessmentId: this.context.assessmentId,
      sectorCode: this.context.manifest.sectorCode,
      scorecardType: this.context.manifest.scorecardType,
      totalPoints: r2(totalPoints),
      maxPoints,
      overallPercentage: r2(overallPercentage),
      beeLevel: levelResult.level,
      recognitionLevel: levelResult.recognition,
      pillars: pillarResults,
      subMinimums,
      calculationErrors: errors,
      calculatedAt: new Date().toISOString(),
    };
  }

  /**
   * Determine B-BBEE level based on total points.
   */
  private determineLevel(
    totalPoints: number,
    pillarResults: PillarResult[]
  ): { level: number; recognition: number } {
    const { levelThresholds } = this.context.sectorConfig;

    // Check sub-minimums first
    const failedSubMins = pillarResults.filter(p => !p.subMinimumMet);
    if (failedSubMins.length > 0) {
      // If sub-minimums failed, drop one level (or to non-compliant)
      const baseLevel = this.findLevelInTable(totalPoints, levelThresholds);
      return {
        level: Math.min(8, baseLevel.level + 1),
        recognition: 0,
      };
    }

    return this.findLevelInTable(totalPoints, levelThresholds);
  }

  private findLevelInTable(
    totalPoints: number,
    thresholds: Array<{ level: number; minPoints: number; recognition: number }>
  ): { level: number; recognition: number } {
    for (const t of thresholds) {
      if (totalPoints >= t.minPoints) {
        return { level: t.level, recognition: t.recognition };
      }
    }
    return { level: 9, recognition: 0 }; // Non-compliant
  }
}

// ---------------------------------------------------------------------------
// Helper: Round to 2 decimals
// ---------------------------------------------------------------------------

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Factory Function
// ---------------------------------------------------------------------------

export interface CalculationOptions {
  assessmentId: string;
  sectorCode: string;
  scorecardType: string;
  entityValues: Map<string, EntityValue>;
  crossPillarValues?: Map<string, number>;
}

export async function createCalculationEngine(options: CalculationOptions): Promise<CalculationEngine> {
  const { buildManifest } = await import('../extraction/entityManifest.js');
  const manifest = buildManifest(options.sectorCode, options.scorecardType);
  const sectorConfig = getSectorConfig(options.sectorCode, options.scorecardType);

  const context: CalculationContext = {
    assessmentId: options.assessmentId,
    manifest,
    sectorConfig,
    entityValues: options.entityValues,
    crossPillarValues: options.crossPillarValues || new Map(),
  };

  return new CalculationEngine(context);
}

// ---------------------------------------------------------------------------
// Simplified API
// ---------------------------------------------------------------------------

export async function calculateScorecard(
  options: CalculationOptions
): Promise<ScorecardResult> {
  const engine = await createCalculationEngine(options);
  return engine.calculateScorecard();
}
