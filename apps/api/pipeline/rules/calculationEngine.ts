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
 *   - Entity array aggregation (employees, shareholders, suppliers, contributions)
 *   - Input data validation with structured error reporting
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
import { SectorRuleRepository } from '../../arango/repositories/sectorRuleRepository.js';

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
  validation?: ValidationResult;
  ontologySnapshot?: OntologySnapshot;
}

// ---------------------------------------------------------------------------
// Entity Input Types — Arrays accepted from API callers
// ---------------------------------------------------------------------------

export interface EmployeeInput {
  name?: string;
  race: string;
  gender: string;
  designation: string;
  isDisabled: boolean;
  isForeign?: boolean;
}

export interface ShareholderInput {
  name: string;
  blackOwnership: number;
  blackWomenOwnership: number;
  shares: number;
  shareValue: number;
  yearsHeld?: number;
  isDesignatedGroup?: boolean;
  blackNewEntrant?: boolean;
}

export interface SupplierInput {
  name: string;
  spend: number;
  beeLevel: number;
  blackOwnership: number;
  blackWomenOwnership: number;
  enterpriseType: string;
  isDesignatedGroup?: boolean;
  isBlackOwned51?: boolean;
  isBlackWomanOwned30?: boolean;
  isEME?: boolean;
  isQSE?: boolean;
  isForeignSupplier?: boolean;
}

export interface ContributionInput {
  beneficiary: string;
  type: string;
  amount: number;
  category: 'sd' | 'ed' | 'sed';
  benefitFactor?: number;
}

export interface FinancialsInput {
  revenue: number;
  npat: number;
  leviableAmount: number;
  tmps: number;
  headcount: number;
}

// ---------------------------------------------------------------------------
// Validation Types
// ---------------------------------------------------------------------------

export interface ValidationResult {
  isValid: boolean;
  missingEntities: Array<{ pillar: string; field: string; reason: string }>;
  warnings: Array<{ pillar: string; field: string; message: string }>;
}

// ---------------------------------------------------------------------------
// Ontology Snapshot — Captures calculation rules for AI guidance
// ---------------------------------------------------------------------------

export interface OntologySnapshot {
  calculatedAt: string;
  sectorCode: string;
  scorecardType: string;
  configSource: 'arango' | 'hardcoded';

  sectorConfig: {
    pillarConfigs: Record<string, { maxPoints: number; hasSubMinimum: boolean; subMinimumPercent: number }>;
    levelThresholds: Array<{ level: number; minPoints: number; recognition: number }>;
    totalMaxPoints: number;
  };

  pillarTraces: Array<{
    pillarCode: string;
    criteriaUsed: Array<{
      code: string;
      formulaId: string;
      target: number;
      maxPoints: number;
      actualValue: number;
      calculatedScore: number;
      inputs: Record<string, number>;
    }>;
    totalScore: number;
    subMinimumThreshold: number;
    subMinimumMet: boolean;
  }>;

  entityTemplateVersion: string;
  manifestPillars: string[];

  missingEntities: string[];
  zeroScorePillars: string[];
  nearSubMinimumPillars: Array<{ pillar: string; score: number; threshold: number; gap: number }>;
}

// ---------------------------------------------------------------------------
// Calculation Context
// ---------------------------------------------------------------------------

export interface CalculationContext {
  assessmentId: string;
  manifest: EntityManifest;
  sectorConfig: SectorConfig;
  configSource: 'arango' | 'hardcoded';
  entityValues: Map<string, EntityValue>;
  crossPillarValues: Map<string, number>; // NPAT, TMPS, leviableAmount, etc.
  employees: EmployeeInput[];
  shareholders: ShareholderInput[];
  suppliers: SupplierInput[];
  contributions: ContributionInput[];
  province?: string;
}

// ---------------------------------------------------------------------------
// Input Extractors — Transform entity values into formula inputs
// ---------------------------------------------------------------------------

interface InputExtractor {
  criterionCode: string;
  extract: (values: Map<string, EntityValue>, crossPillar: Map<string, number>) => Record<string, number | boolean | string>;
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

// ---------------------------------------------------------------------------
// Entity Array Pre-aggregation
// ---------------------------------------------------------------------------

const BLACK_RACES = ['African', 'Coloured', 'Indian'];
function isBlack(race: string): boolean {
  return BLACK_RACES.includes(race);
}

/**
 * Pre-aggregate entity arrays into derived entity values.
 *
 * Runs once when the engine is created. Populates `ctx.entityValues`
 * with computed percentages and totals so criterion extractors can
 * look them up without re-scanning the arrays per criterion.
 */
function preAggregateEntityArrays(ctx: CalculationContext): void {
  const { entityValues, employees, shareholders, suppliers, contributions } = ctx;

  const set = (id: string, value: number) => {
    entityValues.set(id, { entityId: id, value, source: 'calculation' as const });
  };

  // ---- MC/EE: Aggregate employees by designation ----
  if (employees.length > 0) {
    const nonForeign = employees.filter(e => !e.isForeign);
    const isBlackWoman = (e: EmployeeInput) => isBlack(e.race) && e.gender === 'Female';

    const byDesig: Record<string, EmployeeInput[]> = {};
    for (const emp of nonForeign) {
      (byDesig[emp.designation] ??= []).push(emp);
    }

    const pctBlack = (group: EmployeeInput[]) =>
      group.length > 0 ? group.filter(e => isBlack(e.race)).length / group.length : 0;
    const pctBW = (group: EmployeeInput[]) =>
      group.length > 0 ? group.filter(isBlackWoman).length / group.length : 0;

    // Board
    const board = byDesig['Board'] || [];
    set('boardBlackPct', pctBlack(board));
    set('boardBlackWomenPct', pctBW(board));
    set('boardCount', board.length);

    // Executive (includes Executive Director designation)
    const exec = [...(byDesig['Executive'] || []), ...(byDesig['Executive Director'] || [])];
    set('execBlackPct', pctBlack(exec));
    set('execBlackWomenPct', pctBW(exec));
    set('execCount', exec.length);

    // Other Executive Management
    const otherExec = byDesig['Other Executive Management'] || [];
    set('otherExecBlackPct', pctBlack(otherExec));
    set('otherExecBlackWomenPct', pctBW(otherExec));
    set('otherExecCount', otherExec.length);

    // Senior
    const senior = byDesig['Senior'] || [];
    set('seniorBlackPct', pctBlack(senior));
    set('seniorBlackWomenPct', pctBW(senior));
    set('seniorCount', senior.length);

    // Middle
    const middle = byDesig['Middle'] || [];
    set('middleBlackPct', pctBlack(middle));
    set('middleBlackWomenPct', pctBW(middle));
    set('middleCount', middle.length);

    // Junior (includes Semi-skilled and Unskilled per frontend logic)
    const junior = [
      ...(byDesig['Junior'] || []),
      ...(byDesig['Semi-skilled'] || []),
      ...(byDesig['Unskilled'] || []),
    ];
    set('juniorBlackPct', pctBlack(junior));
    set('juniorBlackWomenPct', pctBW(junior));
    set('juniorCount', junior.length);

    // Skilled Technical (uses Middle EAP targets)
    const skilledTech = byDesig['Skilled Technical'] || [];
    set('skilledTechBlackPct', pctBlack(skilledTech));
    set('skilledTechBlackWomenPct', pctBW(skilledTech));
    set('skilledTechCount', skilledTech.length);

    // Disabled (percentage of black disabled relative to total headcount)
    const disabled = nonForeign.filter(e => e.isDisabled);
    const blackDisabled = disabled.filter(e => isBlack(e.race)).length;
    set('disabledBlackPct', nonForeign.length > 0 ? blackDisabled / nonForeign.length : 0);
    set('disabledPct', nonForeign.length > 0 ? disabled.length / nonForeign.length : 0);
    set('totalEmployees', nonForeign.length);
  }

  // ---- Ownership: Aggregate shareholders ----
  if (shareholders.length > 0) {
    const totalShares = shareholders.reduce((sum, sh) => sum + sh.shares, 0);
    const hasShares = totalShares > 0;

    let blackVoting = 0, blackWomenVoting = 0;
    let economicInterest = 0, economicInterestBWO = 0;
    let designatedGroup = 0, newEntrant = 0;

    for (const sh of shareholders) {
      const pct = hasShares ? sh.shares / totalShares : 1 / shareholders.length;
      blackVoting += pct * sh.blackOwnership;
      blackWomenVoting += pct * sh.blackWomenOwnership;
      economicInterest += pct * sh.blackOwnership;
      economicInterestBWO += pct * sh.blackWomenOwnership;
      if (sh.isDesignatedGroup) designatedGroup += pct * sh.blackOwnership;
      if (sh.blackNewEntrant) newEntrant += pct * sh.blackOwnership;
    }

    set('blackVotingPct', blackVoting);
    set('blackWomenVotingPct', blackWomenVoting);
    set('economicInterestPct', economicInterest);
    set('economicInterestBWOPct', economicInterestBWO);
    set('designatedGroupPct', designatedGroup);
    set('newEntrantPct', newEntrant);
    set('blackOwnershipPct', blackVoting);

    const maxYearsHeld = Math.max(...shareholders.map(sh => sh.yearsHeld ?? 0), 0);
    set('yearsHeld', maxYearsHeld);

    const totalShareValue = shareholders.reduce((sum, sh) => sum + sh.shareValue, 0);
    set('companyShareValue', totalShareValue);
  }

  // ---- Procurement: Aggregate suppliers ----
  if (suppliers.length > 0) {
    const recognitionTable: Record<number, number> = {
      1: 1.35, 2: 1.25, 3: 1.10, 4: 1.00,
      5: 0.80, 6: 0.60, 7: 0.50, 8: 0.10, 0: 0,
    };

    let totalSpend = 0, recognisedSpend = 0, empoweringSpend = 0;
    let qseSpend = 0, emeSpend = 0;
    let bo51Spend = 0, bwo30Spend = 0, dgSpend = 0;
    let foreignSpend = 0;

    for (const s of suppliers) {
      totalSpend += s.spend || 0;

      if (s.isForeignSupplier) {
        foreignSpend += s.spend || 0;
        continue;
      }

      const multiplier = recognitionTable[s.beeLevel] ?? 0;
      recognisedSpend += (s.spend || 0) * multiplier;
      empoweringSpend += s.spend || 0;

      if (s.isQSE || s.enterpriseType === 'qse') qseSpend += s.spend || 0;
      if (s.isEME || s.enterpriseType === 'eme') emeSpend += s.spend || 0;
      if (s.isBlackOwned51 || s.blackOwnership >= 51) bo51Spend += s.spend || 0;
      if (s.isBlackWomanOwned30 || s.blackWomenOwnership >= 30) bwo30Spend += s.spend || 0;
      if (s.isDesignatedGroup) dgSpend += s.spend || 0;
    }

    set('totalProcurementSpend', totalSpend);
    set('recognisedSpend', recognisedSpend);
    set('empoweringSpend', empoweringSpend);
    set('qseSpend', qseSpend);
    set('emeSpend', emeSpend);
    set('bo51Spend', bo51Spend);
    set('bwo30Spend', bwo30Spend);
    set('dgSpend', dgSpend);
    set('foreignSupplierSpend', foreignSpend);
  }

  // ---- ESD/SED: Aggregate contributions ----
  if (contributions.length > 0) {
    let sdSpend = 0, edSpend = 0, sedSpend = 0;

    for (const c of contributions) {
      const factor = c.benefitFactor ?? 1.0;
      const weighted = c.amount * factor;

      switch (c.category) {
        case 'sd': sdSpend += weighted; break;
        case 'ed': edSpend += weighted; break;
        case 'sed': sedSpend += weighted; break;
      }
    }

    set('sdSpend', sdSpend);
    set('edSpend', edSpend);
    set('sedSpend', sedSpend);
  }
}

// ---------------------------------------------------------------------------
// Input Validation
// ---------------------------------------------------------------------------

function validateInputData(ctx: CalculationContext): ValidationResult {
  const missing: ValidationResult['missingEntities'] = [];
  const warnings: ValidationResult['warnings'] = [];
  const { crossPillarValues, employees, shareholders, suppliers, contributions } = ctx;

  if (!crossPillarValues.has('npat')) {
    missing.push({ pillar: 'enterpriseSupplierDevelopment', field: 'npat', reason: 'NPAT required for ESD calculation (percent of NPAT formula)' });
    missing.push({ pillar: 'socioEconomicDevelopment', field: 'npat', reason: 'NPAT required for SED calculation (percent of NPAT formula)' });
  }
  if (!crossPillarValues.has('tmps')) {
    missing.push({ pillar: 'preferentialProcurement', field: 'tmps', reason: 'Total Measured Procurement Spend required for procurement calculation' });
  }
  if (!crossPillarValues.has('leviableAmount')) {
    missing.push({ pillar: 'skillsDevelopment', field: 'leviableAmount', reason: 'Leviable amount required for skills development calculation' });
  }

  if (employees.length === 0) {
    warnings.push({ pillar: 'managementControl', field: 'employees', message: 'No employee data provided — MC/EE scores will be zero' });
  }
  if (shareholders.length === 0) {
    warnings.push({ pillar: 'ownership', field: 'shareholders', message: 'No shareholder data provided — ownership scores will be zero' });
  }
  if (suppliers.length === 0) {
    warnings.push({ pillar: 'preferentialProcurement', field: 'suppliers', message: 'No supplier data provided — procurement scores will be zero' });
  }
  if (contributions.length === 0) {
    warnings.push({ pillar: 'enterpriseSupplierDevelopment', field: 'contributions', message: 'No contribution data provided — ESD/SED scores will be zero' });
  }

  return {
    isValid: missing.length === 0,
    missingEntities: missing,
    warnings,
  };
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
        graduationYears: 0, // Overridden by computeDerivedInputs yearsHeld
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
        eapTarget: 0.5, // Overridden by computeDerivedInputs
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
        const targetMap: Record<string, number> = {
          'PROC-EMP': t.allSuppliersTarget,
          'PROC-QSE': t.qseTarget,
          'PROC-EME': t.emeTarget,
          'PROC-BO51': t.bo51Target,
          'PROC-BWO30': t.bwo30Target,
          'PROC-DG': t.dgTarget || 0.02,
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
    preAggregateEntityArrays(context);
    this.extractors = this.buildInputExtractors(context.manifest);
  }

  /**
   * Build input extractors for all criteria based on their input entities.
   */
  private buildInputExtractors(manifest: EntityManifest): Map<string, InputExtractor> {
    const extractors = new Map<string, InputExtractor>();

    for (const pack of manifest.pillarPacks) {
      for (const criterion of pack.criteria) {
        extractors.set(criterion.code, {
          criterionCode: criterion.code,
          extract: (values, crossPillar) => {
            const inputs: Record<string, number | boolean | string> = {};

            for (const entityId of criterion.inputEntities) {
              const entityValue = values.get(entityId);
              if (entityValue !== undefined) {
                const inputName = mapEntityToInputName(entityId, criterion.code);
                inputs[inputName] = entityValue.value;
              }
            }

            for (const [key, value] of crossPillar) {
              inputs[key] = value;
            }

            const computed = this.computeDerivedInputs(criterion, values);
            Object.assign(inputs, computed);

            return inputs;
          },
        });
      }
    }

    return extractors;
  }

  /**
   * Compute derived inputs for a criterion from pre-aggregated entity values.
   *
   * After `preAggregateEntityArrays` has populated the entity values map,
   * this method selects the relevant aggregated values for the criterion's
   * pillar and sub-category.
   */
  private computeDerivedInputs(
    criterion: CriterionEntity,
    values: Map<string, EntityValue>
  ): Record<string, number | boolean | string> {
    const computed: Record<string, number | boolean | string> = {};

    const get = (key: string): number => {
      const ev = values.get(key);
      return typeof ev?.value === 'number' ? ev.value : 0;
    };

    if (criterion.pillarCode === 'managementControl' || criterion.pillarCode === 'employmentEquity') {
      const code = criterion.code.toLowerCase();

      const EAP_TABLES: Record<string, Record<string, { blackTarget: number; blackWomenTarget: number }>> = {
        national: {
          senior: { blackTarget: 0.731, blackWomenTarget: 0.341 },
          middle: { blackTarget: 0.786, blackWomenTarget: 0.425 },
          junior: { blackTarget: 0.845, blackWomenTarget: 0.512 },
          skilledtechnical: { blackTarget: 0.786, blackWomenTarget: 0.425 },
        },
        gauteng: {
          senior: { blackTarget: 0.733, blackWomenTarget: 0.359 },
          middle: { blackTarget: 0.794, blackWomenTarget: 0.442 },
          junior: { blackTarget: 0.861, blackWomenTarget: 0.545 },
          skilledtechnical: { blackTarget: 0.794, blackWomenTarget: 0.442 },
        },
        'western cape': {
          senior: { blackTarget: 0.551, blackWomenTarget: 0.311 },
          middle: { blackTarget: 0.654, blackWomenTarget: 0.422 },
          junior: { blackTarget: 0.743, blackWomenTarget: 0.526 },
          skilledtechnical: { blackTarget: 0.654, blackWomenTarget: 0.422 },
        },
        'eastern cape': {
          senior: { blackTarget: 0.868, blackWomenTarget: 0.454 },
          middle: { blackTarget: 0.902, blackWomenTarget: 0.501 },
          junior: { blackTarget: 0.932, blackWomenTarget: 0.558 },
          skilledtechnical: { blackTarget: 0.902, blackWomenTarget: 0.501 },
        },
        'kwazulu-natal': {
          senior: { blackTarget: 0.863, blackWomenTarget: 0.421 },
          middle: { blackTarget: 0.895, blackWomenTarget: 0.467 },
          junior: { blackTarget: 0.928, blackWomenTarget: 0.523 },
          skilledtechnical: { blackTarget: 0.895, blackWomenTarget: 0.467 },
        },
        'free state': {
          senior: { blackTarget: 0.852, blackWomenTarget: 0.461 },
          middle: { blackTarget: 0.884, blackWomenTarget: 0.492 },
          junior: { blackTarget: 0.921, blackWomenTarget: 0.534 },
          skilledtechnical: { blackTarget: 0.884, blackWomenTarget: 0.492 },
        },
        'north west': {
          senior: { blackTarget: 0.881, blackWomenTarget: 0.435 },
          middle: { blackTarget: 0.908, blackWomenTarget: 0.479 },
          junior: { blackTarget: 0.936, blackWomenTarget: 0.531 },
          skilledtechnical: { blackTarget: 0.908, blackWomenTarget: 0.479 },
        },
        'northern cape': {
          senior: { blackTarget: 0.611, blackWomenTarget: 0.324 },
          middle: { blackTarget: 0.705, blackWomenTarget: 0.418 },
          junior: { blackTarget: 0.798, blackWomenTarget: 0.509 },
          skilledtechnical: { blackTarget: 0.705, blackWomenTarget: 0.418 },
        },
        mpumalanga: {
          senior: { blackTarget: 0.894, blackWomenTarget: 0.418 },
          middle: { blackTarget: 0.917, blackWomenTarget: 0.462 },
          junior: { blackTarget: 0.941, blackWomenTarget: 0.527 },
          skilledtechnical: { blackTarget: 0.917, blackWomenTarget: 0.462 },
        },
        limpopo: {
          senior: { blackTarget: 0.938, blackWomenTarget: 0.465 },
          middle: { blackTarget: 0.951, blackWomenTarget: 0.498 },
          junior: { blackTarget: 0.963, blackWomenTarget: 0.542 },
          skilledtechnical: { blackTarget: 0.951, blackWomenTarget: 0.498 },
        },
      };
      const provinceName = (this.context.province || 'national').toLowerCase();
      const NATIONAL_EAP = EAP_TABLES[provinceName] || EAP_TABLES.national;

      const isBWO = code.includes('bwo') || code.includes('bw');

      if (code.includes('board')) {
        computed.actual = isBWO ? get('boardBlackWomenPct') : get('boardBlackPct');
      } else if (code.includes('oexec') || (code.includes('other') && code.includes('exec'))) {
        computed.actual = isBWO ? get('otherExecBlackWomenPct') : get('otherExecBlackPct');
      } else if (code.includes('exec')) {
        computed.actual = isBWO ? get('execBlackWomenPct') : get('execBlackPct');
      } else if (code.includes('senior')) {
        computed.actualPercentage = isBWO ? get('seniorBlackWomenPct') : get('seniorBlackPct');
        computed.eapPercentage = isBWO ? NATIONAL_EAP.senior.blackWomenTarget : NATIONAL_EAP.senior.blackTarget;
      } else if (code.includes('middle')) {
        computed.actualPercentage = isBWO ? get('middleBlackWomenPct') : get('middleBlackPct');
        computed.eapPercentage = isBWO ? NATIONAL_EAP.middle.blackWomenTarget : NATIONAL_EAP.middle.blackTarget;
      } else if (code.includes('junior')) {
        computed.actualPercentage = isBWO ? get('juniorBlackWomenPct') : get('juniorBlackPct');
        computed.eapPercentage = isBWO ? NATIONAL_EAP.junior.blackWomenTarget : NATIONAL_EAP.junior.blackTarget;
      } else if (code.includes('skilled') || code.includes('technical')) {
        computed.actualPercentage = isBWO ? get('skilledTechBlackWomenPct') : get('skilledTechBlackPct');
        computed.eapPercentage = isBWO ? NATIONAL_EAP.skilledtechnical.blackWomenTarget : NATIONAL_EAP.skilledtechnical.blackTarget;
      } else if (code.includes('disabled')) {
        computed.actual = get('disabledBlackPct');
      }
    }

    if (criterion.pillarCode === 'ownership') {
      const code = criterion.code.toUpperCase();
      if (code === 'OWN-VR-BLACK') {
        computed.actual = get('blackVotingPct');
      } else if (code === 'OWN-VR-BWO') {
        computed.actual = get('blackWomenVotingPct');
      } else if (code === 'OWN-EI-BLACK') {
        computed.actual = get('economicInterestPct');
        computed.yearsHeld = get('yearsHeld');
      } else if (code === 'OWN-EI-BWO') {
        computed.actual = get('economicInterestBWOPct');
      } else if (code === 'OWN-DG') {
        computed.actual = get('designatedGroupPct');
      } else if (code === 'OWN-NE') {
        computed.conditionMet = get('newEntrantPct') > 0;
      } else if (code === 'OWN-NV') {
        computed.blackOwnership = get('blackVotingPct');
        computed.companyValue = get('companyValue');
        computed.shareValue = get('companyShareValue');
        computed.outstandingDebt = get('outstandingDebt');
      }
    }

    if (criterion.pillarCode === 'preferentialProcurement') {
      const code = criterion.code.toUpperCase();
      const tmps = this.context.crossPillarValues.get('tmps') || 0;
      if (code.includes('EMP') || code === 'PROC-EMP') {
        computed.spend = get('recognisedSpend');
        computed.baseValue = tmps;
      } else if (code.includes('QSE') || code === 'PROC-QSE') {
        computed.spend = get('qseSpend');
        computed.baseValue = tmps;
      } else if (code.includes('EME') || code === 'PROC-EME') {
        computed.spend = get('emeSpend');
        computed.baseValue = tmps;
      } else if (code.includes('BO51') || code === 'PROC-BO51') {
        computed.spend = get('bo51Spend');
        computed.baseValue = tmps;
      } else if (code.includes('BWO30') || code === 'PROC-BWO30') {
        computed.spend = get('bwo30Spend');
        computed.baseValue = tmps;
      } else if (code.includes('DG') || code === 'PROC-DG') {
        computed.spend = get('dgSpend');
        computed.baseValue = tmps;
      }
    }

    if (criterion.pillarCode === 'enterpriseSupplierDevelopment') {
      const npat = this.context.crossPillarValues.get('npat') || 0;
      const code = criterion.code.toUpperCase();
      if (code.includes('SD') && !code.includes('ED')) {
        computed.spend = get('sdSpend');
        computed.npat = npat;
      } else if (code.includes('ED')) {
        computed.spend = get('edSpend');
        computed.npat = npat;
      }
    }

    if (criterion.pillarCode === 'socioEconomicDevelopment') {
      const npat = this.context.crossPillarValues.get('npat') || 0;
      computed.spend = get('sedSpend');
      computed.npat = npat;
    }

    if (criterion.pillarCode === 'skillsDevelopment') {
      const leviable = this.context.crossPillarValues.get('leviableAmount') || 0;
      computed.baseValue = leviable;
    }

    return computed;
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

    const rawPoints = criterionResults.reduce((sum, r) => sum + r.points, 0);
    const maxPoints = pack.maxPoints;
    const percentage = maxPoints > 0 ? (rawPoints / maxPoints) * 100 : 0;

    let subMinimumMet = true;
    if (pack.hasSubMinimum) {
      subMinimumMet = rawPoints >= pack.subMinimumThreshold;
    }

    return {
      pillarCode: pack.pillarCode,
      pillarName: pack.pillarName,
      points: rawPoints,
      maxPoints,
      percentage,
      subMinimumMet,
      criteria: criterionResults,
    };
  }

  /**
   * Calculate the complete scorecard.
   */
  calculateScorecard(): ScorecardResult {
    const validation = validateInputData(this.context);
    const pillarResults: PillarResult[] = [];
    const errors: string[] = [];

    // Surface validation errors into calculationErrors
    for (const m of validation.missingEntities) {
      errors.push(`[${m.pillar}] ${m.field}: ${m.reason}`);
    }

    for (const pack of this.context.manifest.pillarPacks) {
      if (pack.pillarCode === 'financials') continue;

      try {
        pillarResults.push(this.calculatePillar(pack));
      } catch (err) {
        errors.push(`Pillar ${pack.pillarCode} calculation failed: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    }

    const rawTotal = pillarResults.reduce((sum, p) => sum + p.points, 0);
    const maxPoints = pillarResults.reduce((sum, p) => sum + p.maxPoints, 0);
    const overallPercentage = maxPoints > 0 ? (rawTotal / maxPoints) * 100 : 0;

    const levelResult = this.determineLevel(rawTotal, pillarResults);

    const subMinimums: Record<string, boolean> = {};
    for (const p of pillarResults) {
      subMinimums[p.pillarCode] = p.subMinimumMet;
    }

    // Round all output values at the end (Excel-style: compute raw, round for display)
    const roundedPillars = pillarResults.map(p => ({
      ...p,
      points: r2(p.points),
      percentage: r2(p.percentage),
      criteria: p.criteria.map(c => ({ ...c, points: r2(c.points), percentage: r2(c.percentage) })),
    }));

    const calculatedAt = new Date().toISOString();
    const ontologySnapshot = this.buildOntologySnapshot(roundedPillars, validation, calculatedAt);

    return {
      assessmentId: this.context.assessmentId,
      sectorCode: this.context.manifest.sectorCode,
      scorecardType: this.context.manifest.scorecardType,
      totalPoints: r2(rawTotal),
      maxPoints,
      overallPercentage: r2(overallPercentage),
      beeLevel: levelResult.level,
      recognitionLevel: levelResult.recognition,
      pillars: roundedPillars,
      subMinimums,
      calculationErrors: errors,
      calculatedAt,
      validation,
      ontologySnapshot,
    };
  }

  /**
   * Build the ontology snapshot capturing all rules, thresholds, and traces
   * that produced this calculation. Enables AI guidance on score improvement.
   */
  private buildOntologySnapshot(
    pillarResults: PillarResult[],
    validation: ValidationResult,
    calculatedAt: string
  ): OntologySnapshot {
    const { sectorConfig, manifest, configSource } = this.context;

    // Build pillar config map
    const pillarConfigs: Record<string, { maxPoints: number; hasSubMinimum: boolean; subMinimumPercent: number }> = {};
    for (const [key, pc] of Object.entries(sectorConfig.pillarConfigs)) {
      if (pc) {
        pillarConfigs[key] = {
          maxPoints: pc.maxPoints,
          hasSubMinimum: pc.hasSubMinimum,
          subMinimumPercent: pc.subMinimumPercent,
        };
      }
    }

    // Build pillar traces from results
    const pillarTraces = pillarResults.map(pr => {
      const pack = manifest.pillarPacks.find(p => p.pillarCode === pr.pillarCode);
      const subMinThreshold = pack
        ? pack.subMinimumThreshold
        : (pillarConfigs[pr.pillarCode]?.maxPoints ?? 0) * ((pillarConfigs[pr.pillarCode]?.subMinimumPercent ?? 0) / 100);

      return {
        pillarCode: pr.pillarCode,
        criteriaUsed: pr.criteria.map(cr => {
          const numericInputs: Record<string, number> = {};
          for (const [k, v] of Object.entries(cr.inputs)) {
            if (typeof v === 'number') numericInputs[k] = v;
          }
          const criterion = pack?.criteria.find(c => c.code === cr.criterionCode);
          return {
            code: cr.criterionCode,
            formulaId: cr.formulaId,
            target: typeof criterion?.target === 'number' ? criterion.target : 0,
            maxPoints: cr.maxPoints,
            actualValue: cr.percentage,
            calculatedScore: cr.points,
            inputs: numericInputs,
          };
        }),
        totalScore: pr.points,
        subMinimumThreshold: r2(subMinThreshold),
        subMinimumMet: pr.subMinimumMet,
      };
    });

    // Identify zero-score pillars
    const zeroScorePillars = pillarResults
      .filter(p => p.points === 0 && p.maxPoints > 0)
      .map(p => p.pillarCode);

    // Identify near-sub-minimum pillars (within 20% of threshold)
    const nearSubMinimumPillars: OntologySnapshot['nearSubMinimumPillars'] = [];
    for (const trace of pillarTraces) {
      if (trace.subMinimumThreshold > 0) {
        const gap = trace.subMinimumThreshold - trace.totalScore;
        if (gap > 0 && gap <= trace.subMinimumThreshold * 0.20) {
          nearSubMinimumPillars.push({
            pillar: trace.pillarCode,
            score: trace.totalScore,
            threshold: trace.subMinimumThreshold,
            gap: r2(gap),
          });
        }
      }
    }

    // Collect missing entities from validation
    const missingEntities = validation.missingEntities.map(m => `${m.pillar}.${m.field}`);
    for (const w of validation.warnings) {
      missingEntities.push(`${w.pillar}.${w.field}`);
    }

    return {
      calculatedAt,
      sectorCode: manifest.sectorCode,
      scorecardType: manifest.scorecardType,
      configSource,
      sectorConfig: {
        pillarConfigs,
        levelThresholds: sectorConfig.levelThresholds,
        totalMaxPoints: sectorConfig.totalMaxPoints,
      },
      pillarTraces,
      entityTemplateVersion: '1.0',
      manifestPillars: manifest.pillarPacks.map(p => p.pillarCode),
      missingEntities,
      zeroScorePillars,
      nearSubMinimumPillars,
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

    const failedSubMins = pillarResults.filter(p => !p.subMinimumMet);
    if (failedSubMins.length > 0) {
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
  employees?: EmployeeInput[];
  shareholders?: ShareholderInput[];
  suppliers?: SupplierInput[];
  contributions?: ContributionInput[];
  financials?: FinancialsInput;
  province?: string;
}

export async function createCalculationEngine(options: CalculationOptions): Promise<CalculationEngine> {
  const { buildManifest } = await import('../extraction/entityManifest.js');
  const manifest = await buildManifest(options.sectorCode, options.scorecardType);
  
  const { config: sectorConfig, source: configSource } = await resolveSectorConfig(
    options.sectorCode, options.scorecardType
  );

  // If financials are provided, populate cross-pillar values
  const crossPillarValues = options.crossPillarValues || new Map();
  if (options.financials) {
    const f = options.financials;
    if (!crossPillarValues.has('npat') && f.npat) crossPillarValues.set('npat', f.npat);
    if (!crossPillarValues.has('tmps') && f.tmps) crossPillarValues.set('tmps', f.tmps);
    if (!crossPillarValues.has('leviableAmount') && f.leviableAmount) crossPillarValues.set('leviableAmount', f.leviableAmount);
    if (!crossPillarValues.has('totalEmployees') && f.headcount) crossPillarValues.set('totalEmployees', f.headcount);
    if (!crossPillarValues.has('revenue') && f.revenue) crossPillarValues.set('revenue', f.revenue);
  }

  const context: CalculationContext = {
    assessmentId: options.assessmentId,
    manifest,
    sectorConfig,
    configSource,
    entityValues: options.entityValues,
    crossPillarValues,
    employees: options.employees || [],
    shareholders: options.shareholders || [],
    suppliers: options.suppliers || [],
    contributions: options.contributions || [],
    province: options.province,
  };

  return new CalculationEngine(context);
}

// ---------------------------------------------------------------------------
// Sector Config Resolution — ArangoDB first, fallback to hardcoded
// ---------------------------------------------------------------------------

/**
 * Convert StoredSectorRule from ArangoDB to SectorConfig interface.
 */
function storedRuleToSectorConfig(stored: import('../../arango/repositories/sectorRuleRepository.js').StoredSectorRule): SectorConfig {
  // Defaults are intentionally empty — every pillar MUST come from ArangoDB.
  // These only apply for any pillar code not present in stored.pillarConfigs.
  const pillarConfigs: SectorConfig['pillarConfigs'] = {
    ownership: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    managementControl: { maxPoints: 19, hasSubMinimum: false, subMinimumPercent: 0 },
    employmentEquity: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 },
    skillsDevelopment: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    preferentialProcurement: { maxPoints: 29, hasSubMinimum: true, subMinimumPercent: 40 },
    supplierDevelopment: { maxPoints: 10, hasSubMinimum: true, subMinimumPercent: 40 },
    enterpriseDevelopment: { maxPoints: 7, hasSubMinimum: false, subMinimumPercent: 0 },
    socioEconomicDevelopment: { maxPoints: 5, hasSubMinimum: false, subMinimumPercent: 0 },
    yesInitiative: { maxPoints: 3, hasSubMinimum: false, subMinimumPercent: 0 },
  };
  
  for (const spc of stored.pillarConfigs) {
    const keyMap: Record<string, keyof SectorConfig['pillarConfigs']> = {
      'ownership': 'ownership',
      'managementControl': 'managementControl',
      'employmentEquity': 'employmentEquity',
      'skillsDevelopment': 'skillsDevelopment',
      'preferentialProcurement': 'preferentialProcurement',
      'supplierDevelopment': 'supplierDevelopment',
      'enterpriseDevelopment': 'enterpriseDevelopment',
      'socioEconomicDevelopment': 'socioEconomicDevelopment',
      'yesInitiative': 'yesInitiative',
    };
    const key = keyMap[spc.code];
    if (key) {
      pillarConfigs[key] = {
        maxPoints: spc.maxPoints,
        hasSubMinimum: spc.hasSubMinimum,
        subMinimumPercent: spc.subMinimumThreshold,
      };
    }
  }
  
  const targets = stored.targets as SectorConfig['targets'];
  
  // Compute totalMaxPoints from pillar configs
  const totalMaxPoints = Object.values(pillarConfigs).reduce((sum, pc) => sum + pc.maxPoints, 0);
  
  return {
    sectorCode: stored.sectorCode,
    sectorName: stored.sectorName,
    scorecardType: stored.scorecardType as 'Generic' | 'QSE' | 'EME',
    totalMaxPoints,
    pillarConfigs,
    targets,
    levelThresholds: stored.levelThresholds.map(lt => ({
      level: lt.level,
      minPoints: lt.minPoints,
      recognition: lt.recognition,
    })),
    recognitionTable: stored.recognitionTable?.map(rt => ({
      beeLevel: rt.beeLevel,
      recognitionPercent: rt.recognitionPercent,
      multiplier: rt.multiplier,
    })) ?? [],
    benefitFactors: stored.benefitFactors?.map(bf => ({
      contributionType: bf.contributionType,
      sdFactor: bf.sdFactor,
      edFactor: bf.edFactor,
    })) ?? [],
    categoryWeightings: stored.categoryWeightings?.map(cw => ({
      code: cw.code,
      name: cw.name,
      weighting: cw.weighting,
      cap: cw.cap,
    })) ?? [],
    industryNorms: stored.industryNorms?.map(ind => ({
      industry: ind.industry,
      normPercent: ind.normPercent,
      quarterThresholdPercent: ind.quarterThresholdPercent,
    })) ?? [],
  };
}

/**
 * Resolve sector config from ArangoDB or fallback to hardcoded.
 * Returns both the config and its source for ontology tracking.
 */
async function resolveSectorConfig(
  sectorCode: string,
  scorecardType: string
): Promise<{ config: SectorConfig; source: 'arango' | 'hardcoded' }> {
  const repo = new SectorRuleRepository();
  
  try {
    const stored = await repo.getSectorRule(sectorCode, scorecardType);
    if (stored) {
      return { config: storedRuleToSectorConfig(stored), source: 'arango' };
    }
  } catch (err) {
    // ArangoDB query failed, fall through to hardcoded config
  }
  
  return { config: getSectorConfig(sectorCode, scorecardType), source: 'hardcoded' };
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
