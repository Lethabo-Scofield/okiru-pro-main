/**
 * Builder Types
 *
 * Type definitions for the B-BBEE scorecard builder.
 * These mirror the types from the API for consistency.
 */

// ============================================================================
// Entity Manifest Types
// ============================================================================

export interface ValidationRules {
  min?: number;
  max?: number;
  enum?: string[];
}

export interface UIConfig {
  placeholder?: string;
  helpText?: string;
  inputType?: string;
  group?: string;
}

export interface ExtractionConfig {
  aliases: string[];
  patterns?: string[];
  zones?: string[];
}

export interface EntityField {
  id: string;
  name: string;
  fieldType: 'currency' | 'percentage' | 'count' | 'string' | 'date' | 'bee_level' | 'boolean' | 'number' | 'text' | 'select' | 'toggle';
  definition: string;
  pillarCode: string;
  criterionCodes: string[];
  required: boolean;
  validation: ValidationRules;
  ui?: UIConfig;
  extraction?: ExtractionConfig;
}

export interface CriterionEntity {
  code: string;
  name: string;
  pillarCode: string;
  target: number | string;
  maxPoints: number;
  formula: string;
  inputEntities: string[];
  bonusCondition?: string;
  capRule?: string;
  minimumThreshold?: number;
  period?: string;
  evidenceRequired: string[];
}

export interface PillarPack {
  pillarCode: string;
  pillarName: string;
  maxPoints: number;
  hasSubMinimum: boolean;
  subMinimumThreshold: number;
  criteria: CriterionEntity[];
  entities: EntityField[];
}

export interface RootContext {
  sector: string;
  sectorCodeVersion: string;
  scorecardType: 'Generic' | 'QSE' | 'EME';
  companySize: 'EME' | 'QSE' | 'Generic';
  financialYearEnd: string;
  verificationDate: string;
  applicableIndustryNorm: string;
  province: string;
  eapTargetSet: string;
}

export interface EntityManifest {
  sectorCode: string;
  scorecardType: string;
  rootContext: RootContext;
  pillarPacks: PillarPack[];
  requiredEntities: EntityField[];
}

// ============================================================================
// Calculation Engine Types
// ============================================================================

export interface EntityValue {
  entityId: string;
  value: unknown;
  source: 'manual' | 'extracted' | 'calculated';
  confidence?: number;
  evidenceRef?: string;
}

export interface CriterionResult {
  criterionCode: string;
  name: string;
  points: number;
  maxPoints: number;
  percentage: number;
  targetMet: boolean;
  details?: Record<string, unknown>;
}

export interface PillarResult {
  pillarCode: string;
  pillarName: string;
  points: number;
  maxPoints: number;
  criteria: CriterionResult[];
  subMinimumMet?: boolean;
}

export interface ScorecardResult {
  assessmentId: string;
  sectorCode: string;
  scorecardType: string;
  totalPoints: number;
  maxPoints: number;
  beeLevel: number;
  recognitionLevel: string;
  isDiscounted: boolean;
  pillars: PillarResult[];
  _source?: string;
  _entityCounts?: Record<string, number>;
  _financials?: {
    revenue?: number;
    npat?: number;
    leviableAmount?: number;
    tmps?: number;
  };
}

// ============================================================================
// Client-Side Import Types
// ============================================================================

export interface Shareholder {
  name: string;
  race: string;
  gender: string;
  shares: number;
  blackOwnership: number;
  blackWomenOwnership: number;
}

export interface Employee {
  name?: string;
  designation: string;
  race: string;
  gender: string;
  isBlack: boolean;
  isBlackWoman: boolean;
  count: number;
}

export interface TrainingProgram {
  name: string;
  cost: number;
  isBlack: boolean;
  isEmployed: boolean;
  category?: string;
}

export interface Supplier {
  name: string;
  beeLevel: number;
  spend: number;
  isEmpowering: boolean;
  enterpriseType?: string;
}

export interface ESDContribution {
  category: 'supplier_development' | 'enterprise_development';
  amount: number;
  beneficiary: string;
}

export interface SEDContribution {
  amount: number;
  beneficiary: string;
  category: string;
}

export interface Financials {
  revenue: number;
  npat: number;
  leviableAmount: number;
  tmps: number;
}

export interface ClientSideImportResult {
  shareholders: Shareholder[];
  employees: Employee[];
  trainingPrograms: TrainingProgram[];
  suppliers: Supplier[];
  esdContributions: ESDContribution[];
  sedContributions: SEDContribution[];
  financials: Financials;
  entityCounts?: {
    shareholders: number;
    employees: number;
    trainingPrograms: number;
    suppliers: number;
    esdContributions: number;
    sedContributions: number;
  };
}
