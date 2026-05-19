/**
 * Sector-Specific B-BBEE Configuration
 *
 * Each sector code (RCOGP, ICT, FSC, AGRI, etc.) defines its own
 * pillar weightings, compliance targets, sub-minimum thresholds,
 * and level determination tables.
 *
 * @domain-rule slides:22,23,25
 * @see docs/domain/_index.md - Master scoring framework
 * @see docs/domain/calculations/scoring_tables.md - Recognition levels and thresholds
 * @see docs/domain/definitions.md - Enterprise classifications (EME/QSE/Large)
 *
 * Reference: B-BBEE Act 53 of 2003, Amended Codes of Good Practice,
 * and Sector-Specific Codes (ICT, FSC, AgriBEE, etc.)
 */

import { createLogger } from '../src/logger.js';

const logger = createLogger('SectorConfig');

export interface PillarConfig {
  maxPoints: number;
  hasSubMinimum: boolean;
  subMinimumPercent: number;
  /**
   * If set, this pillar belongs to a "choose one" elective group.
   * Only the single highest-scoring pillar in the group counts toward the total.
   * Transport QSE uses 'transport_qse_elective' for Skills Dev / PP / Enterprise Dev / SED.
   */
  chooseOneGroup?: string;
}

export interface OwnershipTargets {
  votingRightsTarget: number;
  votingRightsMaxPts: number;
  womenVotingTarget: number;
  womenVotingMaxPts: number;
  economicInterestTarget: number;
  economicInterestMaxPts: number;
  womenEITarget: number;
  womenEIMaxPts: number;
  netValueMaxPts: number;
  newEntrantsMaxPts: number;
  /** Transport Sector (Large): designated-group economic interest indicator row */
  economicInterestDesignatedGroupTarget?: number;
  economicInterestDesignatedGroupMaxPts?: number;
}

export interface MCTargets {
  boardBlackTarget: number;
  boardBlackMaxPts: number;
  boardBWTarget: number;
  boardBWMaxPts: number;
  execBlackTarget: number;           // Executive Directors Black: 50% (NOT 60%)
  execBlackMaxPts: number;
  execBWTarget: number;              // Executive Directors Women: 25% (NOT 30%)
  execBWMaxPts: number;
  otherExecBlackTarget: number;      // Other Exec Black: 60%
  otherExecBlackMaxPts: number;
  otherExecBWTarget: number;         // Other Exec Women: 30%
  otherExecBWMaxPts: number;
  seniorMaxPts: number;
  seniorBWMaxPts: number;
  middleMaxPts: number;
  middleBWMaxPts: number;
  juniorMaxPts: number;
  juniorBWMaxPts: number;
}

export interface EETargets {
  seniorMaxPts: number;
  middleMaxPts: number;
  juniorMaxPts: number;
  disabledMaxPts: number;
  disabledTarget: number;
  /** Black women disabled employees row (Transport Large sheet1) */
  disabledWomenMaxPts?: number;
  disabledWomenTarget?: number;
}

export interface SkillsTargets {
  learningProgrammesMaxPts: number;
  bursaryMaxPts: number;
  disabledLearningMaxPts: number;
  learnershipsMaxPts: number;
  absorptionMaxPts: number;
  overallSpendPercent: number;
  bursarySpendPercent: number;
  disabledSpendPercent: number;
  learnershipTargetPercent: number;
  absorptionTargetPercent: number;
}

export interface ProcurementTargets {
  allSuppliersTarget: number;
  allSuppliersMaxPts: number;
  qseTarget: number;
  qseMaxPts: number;
  emeTarget: number;
  emeMaxPts: number;
  bo51Target: number;
  bo51MaxPts: number;
  bwo30Target: number;
  bwo30MaxPts: number;
  dgTarget: number;      // Designated Group target (bonus row)
  dgMaxPts: number;      // Designated Group max points
  // NOTE: Procurement has NO bonus points - bonuses are ED only
}

export interface EsdTargets {
  sdPercent: number;
  sdMaxPts: number;
  edPercent: number;
  edMaxPts: number;
  edGraduationBonus: number;
  edJobsBonus: number;
}

// ---------------------------------------------------------------------------
// Reference tables seeded alongside sector rules
// ---------------------------------------------------------------------------

export interface RecognitionLevel {
  beeLevel: number;
  recognitionPercent: number;
  multiplier: number;
}

export interface BenefitFactor {
  contributionType: string;
  sdFactor: number;
  edFactor: number;
}

export interface CategoryWeighting {
  code: string;
  name: string;
  weighting: number;
  cap?: number;
}

export interface IndustryNorm {
  industry: string;
  normPercent: number;
  quarterThresholdPercent: number;
}

export interface SedTargets {
  spendPercent: number;
  maxPts: number;
}

export interface SectorConfig {
  sectorCode: string;
  sectorName: string;
  scorecardType: 'Generic' | 'QSE' | 'EME' | 'Contractor' | 'BEP';
  totalMaxPoints: number; // Total points including YES if applicable
  pillarConfigs: {
    ownership: PillarConfig;
    managementControl: PillarConfig;
    employmentEquity?: PillarConfig;
    skillsDevelopment: PillarConfig;
    preferentialProcurement: PillarConfig;
    supplierDevelopment: PillarConfig;
    enterpriseDevelopment: PillarConfig;
    socioEconomicDevelopment: PillarConfig;
    yesInitiative?: PillarConfig; // YES points are included in totalMaxPoints for some sectors
    empowermentFinancing?: PillarConfig;
    accessToFinancialServices?: PillarConfig;
    consumerEducation?: PillarConfig;
  };
  targets: {
    ownership: OwnershipTargets;
    managementControl: MCTargets;
    employmentEquity: EETargets;
    skills: SkillsTargets;
    procurement: ProcurementTargets;
    esd: EsdTargets;
    sed: SedTargets;
  };
  levelThresholds: Array<{ level: number; minPoints: number; recognition: number }>;
  recognitionTable: RecognitionLevel[];
  benefitFactors: BenefitFactor[];
  categoryWeightings: CategoryWeighting[];
  industryNorms: IndustryNorm[];
}

// ---------------------------------------------------------------------------
// Standard level thresholds (used by most codes)
// ---------------------------------------------------------------------------

const STANDARD_LEVELS = [
  { level: 1, minPoints: 100, recognition: 135 },
  { level: 2, minPoints: 95, recognition: 125 },
  { level: 3, minPoints: 90, recognition: 110 },
  { level: 4, minPoints: 80, recognition: 100 },
  { level: 5, minPoints: 75, recognition: 80 },
  { level: 6, minPoints: 70, recognition: 60 },
  { level: 7, minPoints: 55, recognition: 50 },
  { level: 8, minPoints: 40, recognition: 10 },
];

// ICT Sector uses a 140-point scale with different thresholds (from Excel)
const ICT_LEVELS = [
  { level: 1, minPoints: 120, recognition: 135 },
  { level: 2, minPoints: 115, recognition: 125 },
  { level: 3, minPoints: 110, recognition: 110 },
  { level: 4, minPoints: 100, recognition: 100 },
  { level: 5, minPoints: 95, recognition: 80 },
  { level: 6, minPoints: 90, recognition: 60 },
  { level: 7, minPoints: 75, recognition: 50 },
  { level: 8, minPoints: 55, recognition: 10 },
];

// Transport Sector Large — max 108 → scale default Generic thresholds (docs/Transport Codes.xlsx sheet1)
const TRANSPORT_LARGE_LEVELS = STANDARD_LEVELS.map(({ level, minPoints, recognition }) => ({
  level,
  minPoints: Math.round((minPoints * 108) / 120 * 100) / 100,
  recognition,
}));

// Transport Sector QSE — 107 total (82 compulsory + 25 chosen elective)
// Thresholds scaled proportionally from STANDARD_LEVELS (base 120) to 107.
const TRANSPORT_QSE_LEVELS = STANDARD_LEVELS.map(({ level, minPoints, recognition }) => ({
  level,
  minPoints: Math.round((minPoints * 107) / 120 * 100) / 100,
  recognition,
}));

// FSC uses scaled (non-integer) thresholds based on sub-sector total (from Excel)
const FSC_LEVELS = [
  { level: 1, minPoints: 95.50, recognition: 135 },
  { level: 2, minPoints: 90.72, recognition: 125 },
  { level: 3, minPoints: 85.95, recognition: 110 },
  { level: 4, minPoints: 76.40, recognition: 100 },
  { level: 5, minPoints: 71.62, recognition: 80 },
  { level: 6, minPoints: 66.85, recognition: 60 },
  { level: 7, minPoints: 52.52, recognition: 50 },
  { level: 8, minPoints: 38.20, recognition: 10 },
];

// ---------------------------------------------------------------------------
// BEE Recognition Table — multiplies supplier spend for procurement scoring
// Reference: B-BBEE Act, Schedule 4
// ---------------------------------------------------------------------------

export const STANDARD_RECOGNITION_TABLE: RecognitionLevel[] = [
  { beeLevel: 1, recognitionPercent: 135, multiplier: 1.35 },
  { beeLevel: 2, recognitionPercent: 125, multiplier: 1.25 },
  { beeLevel: 3, recognitionPercent: 110, multiplier: 1.10 },
  { beeLevel: 4, recognitionPercent: 100, multiplier: 1.00 },
  { beeLevel: 5, recognitionPercent: 80, multiplier: 0.80 },
  { beeLevel: 6, recognitionPercent: 60, multiplier: 0.60 },
  { beeLevel: 7, recognitionPercent: 50, multiplier: 0.50 },
  { beeLevel: 8, recognitionPercent: 10, multiplier: 0.10 },
  { beeLevel: 0, recognitionPercent: 0, multiplier: 0.00 },
];

// ---------------------------------------------------------------------------
// ESD Benefit Factors — multiplies contribution amounts for SD/ED scoring
// Reference: Schedule 4.3 of the Codes
// ---------------------------------------------------------------------------

// ESD Benefit Factors verified against SCORECARD_GROUND_TRUTH.md Section 13
// "ESD" columns (sdFactor/edFactor) = ESD applies to SD and ED
// SED-specific factors differ but are handled separately in calcSed()
const STANDARD_BENEFIT_FACTORS: BenefitFactor[] = [
  { contributionType: 'grant', sdFactor: 1.0, edFactor: 1.0 },          // Grant: 100% ✓
  { contributionType: 'direct_cost', sdFactor: 1.0, edFactor: 1.0 },    // Direct Cost: 100% ✓
  { contributionType: 'discounts', sdFactor: 1.0, edFactor: 1.0 },      // Discounts: 100% ✓
  { contributionType: 'overhead_costs', sdFactor: 0.7, edFactor: 0.7 }, // Overhead: 70% (ESD); SED=80% handled separately
  { contributionType: 'interest_free_loan', sdFactor: 0.7, edFactor: 0.7 }, // Interest-free loan: 70%
  { contributionType: 'standard_loan', sdFactor: 0.5, edFactor: 0.5 },  // Standard loan (no security): 50%
  { contributionType: 'guarantees', sdFactor: 0.03, edFactor: 0.03 },   // Guarantees: 3% of value ✓
  { contributionType: 'lower_interest_rate', sdFactor: 0.0, edFactor: 0.0 }, // Prime - Actual rate (variable, calculated at runtime)
  { contributionType: 'minority_investment', sdFactor: 0.7, edFactor: 0.7 }, // Minority investment in EME/QSE: 70%
  { contributionType: 'professional_services_free', sdFactor: 0.6, edFactor: 0.6 }, // Prof services (no cost): 60% ESD
  { contributionType: 'professional_services_discounted', sdFactor: 0.6, edFactor: 0.6 }, // Prof services (discount): 60% ESD
  { contributionType: 'employee_time', sdFactor: 0.6, edFactor: 0.6 },  // Employee time/secondment: 60% ESD
  { contributionType: 'shorter_payment_periods', sdFactor: 0.15, edFactor: 0.0 }, // Shorter payment terms: 15% of invoice (SD only)
  { contributionType: 'equity_investment', sdFactor: 0.0, edFactor: 1.0 },
];

// ---------------------------------------------------------------------------
// Skills Category Weightings — A through G
// Reference: Skills Development element, Annex 200(1)
// ---------------------------------------------------------------------------

const STANDARD_CATEGORY_WEIGHTINGS: CategoryWeighting[] = [
  { code: 'A', name: 'Bursaries (higher education)', weighting: 1.0 },
  { code: 'B', name: 'Internships & Learnerships', weighting: 1.0 },
  { code: 'C', name: 'Short courses & workshops (accredited)', weighting: 1.0 },
  { code: 'D', name: 'Other accredited training', weighting: 1.0 },
  { code: 'E', name: 'Non-accredited / informal training', weighting: 1.0, cap: 0.25 },
  { code: 'F', name: 'External unaccredited training', weighting: 1.0, cap: 0.15 },
  { code: 'G', name: 'Informal training (non-qualifying)', weighting: 0.0 },
];

// ---------------------------------------------------------------------------
// Industry Norms — for deemed NPAT calculation
// Reference: SARS quarterly industry classification norms (Q3 2023)
// Source: Verified from Excel toolkit extractions (docs/toolkits/extracted_*.json)
// Publication date: 2023-09-30
// ---------------------------------------------------------------------------

const STANDARD_INDUSTRY_NORMS: IndustryNorm[] = [
  { industry: 'All industries', normPercent: 5.58, quarterThresholdPercent: 1.40 },
  { industry: 'Mining and quarrying', normPercent: 16.25, quarterThresholdPercent: 4.06 },
  { industry: 'Manufacturing', normPercent: 4.58, quarterThresholdPercent: 1.15 },
  { industry: 'Electricity, gas and water supply', normPercent: -4.64, quarterThresholdPercent: 0 },
  { industry: 'Construction', normPercent: 5.22, quarterThresholdPercent: 1.31 },
  { industry: 'Trade (Retail/Wholesale)', normPercent: 4.29, quarterThresholdPercent: 1.07 },
  { industry: 'Transport, storage and communication', normPercent: 2.69, quarterThresholdPercent: 0.67 },
  { industry: 'Real estate and business services', normPercent: 8.24, quarterThresholdPercent: 2.06 },
  { industry: 'Community, social and personal services', normPercent: 7.90, quarterThresholdPercent: 1.98 },
  { industry: 'Agriculture, forestry and fishing', normPercent: 8.0, quarterThresholdPercent: 2.0 },
  { industry: 'Information and communication (ICT)', normPercent: 10.0, quarterThresholdPercent: 2.5 },
  { industry: 'Financial intermediation and insurance', normPercent: 15.0, quarterThresholdPercent: 3.75 },
  { industry: 'Professional, scientific and technical', normPercent: 20.0, quarterThresholdPercent: 5.0 },
  { industry: 'Education', normPercent: 10.0, quarterThresholdPercent: 2.5 },
  { industry: 'Healthcare and social work', normPercent: 8.0, quarterThresholdPercent: 2.0 },
  { industry: 'Hospitality and food service', normPercent: 5.0, quarterThresholdPercent: 1.25 },
  { industry: 'Other', normPercent: 5.58, quarterThresholdPercent: 1.40 },
];

// ---------------------------------------------------------------------------
// RCOGP Generic (Revised Codes of Good Practice)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// RCOGP Generic (Revised Codes of Good Practice)
// VERIFIED AGAINST: BBBEE Toolkit (RCOGP)_Template_v.1.4.xlsx
// Grand Total: 120 points (NOT 111, NOT 132)
// MC: 19 combined (NOT 8+11 split)
// PP: 29 (BO51=11 at 50%, DG=2 at 2% - bonus row)
// ESD: SD=10 + ED=7 (5 base + 2 bonuses)
// ---------------------------------------------------------------------------

export const RCOGP_GENERIC: SectorConfig = {
  sectorCode: 'RCOGP',
  sectorName: 'Revised Codes of Good Practice (Generic)',
  scorecardType: 'Generic',
  totalMaxPoints: 120, // Verified: 25+19+25+29+10+7+5 = 120 (YES excluded)
  pillarConfigs: {
    ownership: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    managementControl: { maxPoints: 19, hasSubMinimum: false, subMinimumPercent: 0 }, // MC+EE combined
    skillsDevelopment: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    preferentialProcurement: { maxPoints: 29, hasSubMinimum: true, subMinimumPercent: 40 },
    supplierDevelopment: { maxPoints: 10, hasSubMinimum: true, subMinimumPercent: 40 },
    enterpriseDevelopment: { maxPoints: 7, hasSubMinimum: false, subMinimumPercent: 0 }, // 5 base + 1 grad + 1 jobs
    socioEconomicDevelopment: { maxPoints: 5, hasSubMinimum: false, subMinimumPercent: 0 },
    yesInitiative: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 }, // Level boost only
  },
  targets: {
    ownership: {
      votingRightsTarget: 0.25, votingRightsMaxPts: 4,
      womenVotingTarget: 0.10, womenVotingMaxPts: 2,
      economicInterestTarget: 0.25, economicInterestMaxPts: 4,
      womenEITarget: 0.10, womenEIMaxPts: 2,
      netValueMaxPts: 8, newEntrantsMaxPts: 2,
    },
    managementControl: {
      boardBlackTarget: 0.50, boardBlackMaxPts: 2,
      boardBWTarget: 0.25, boardBWMaxPts: 1,
      execBlackTarget: 0.50, execBlackMaxPts: 2,
      execBWTarget: 0.25, execBWMaxPts: 1,
      otherExecBlackTarget: 0.60, otherExecBlackMaxPts: 2,
      otherExecBWTarget: 0.30, otherExecBWMaxPts: 1,
      seniorMaxPts: 2, seniorBWMaxPts: 1,
      middleMaxPts: 2, middleBWMaxPts: 1,
      juniorMaxPts: 1, juniorBWMaxPts: 1,
    },
    employmentEquity: {
      seniorMaxPts: 2, middleMaxPts: 2, juniorMaxPts: 1,
      disabledMaxPts: 2, disabledTarget: 0.02,
    },
    skills: {
      learningProgrammesMaxPts: 6,
      bursaryMaxPts: 4,
      disabledLearningMaxPts: 4,
      learnershipsMaxPts: 6,
      absorptionMaxPts: 5,
      overallSpendPercent: 3.5,
      bursarySpendPercent: 2.5,
      disabledSpendPercent: 0.3,
      learnershipTargetPercent: 5.0,
      absorptionTargetPercent: 2.5,
    },
    procurement: {
      allSuppliersTarget: 0.80, allSuppliersMaxPts: 5,
      qseTarget: 0.15, qseMaxPts: 3,
      emeTarget: 0.15, emeMaxPts: 4,
      bo51Target: 0.50, bo51MaxPts: 11,
      bwo30Target: 0.12, bwo30MaxPts: 4,
      dgTarget: 0.02, dgMaxPts: 2,
    },
    esd: {
      sdPercent: 2.0, sdMaxPts: 10,
      edPercent: 1.0, edMaxPts: 5,
      edGraduationBonus: 1,
      edJobsBonus: 1,
    },
    sed: { spendPercent: 1.0, maxPts: 5 },
  },
  levelThresholds: STANDARD_LEVELS,
  recognitionTable: STANDARD_RECOGNITION_TABLE,
  benefitFactors: STANDARD_BENEFIT_FACTORS,
  categoryWeightings: STANDARD_CATEGORY_WEIGHTINGS,
  industryNorms: STANDARD_INDUSTRY_NORMS,
};
// Ownership verification: 4+2+4+2+3+2+8 = 25 ✓
// Skills verification: 6+4+4+6+5 = 25 ✓
// Procurement verification: 5+3+4+11+4+2 = 29 ✓
// ESD verification: SD 10 + ED 5+1+1 = 17 ✓
// Grand total: 25+19+25+29+10+7+5 = 120 ✓

// ---------------------------------------------------------------------------
// ICT Generic (Information & Communication Technology)
// TODO: Verify against ICT Sector Code toolkit Excel
// ---------------------------------------------------------------------------

export const ICT_GENERIC: SectorConfig = {
  sectorCode: 'ICT',
  sectorName: 'ICT Sector Code (Generic)',
  scorecardType: 'Generic',
  totalMaxPoints: 140, // Verified from Excel: 25+23+25+27+10+18+12 = 140 (YES excluded)
  pillarConfigs: {
    ownership: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    managementControl: { maxPoints: 23, hasSubMinimum: false, subMinimumPercent: 0 }, // MC+EE combined
    employmentEquity: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 }, // Merged into MC
    skillsDevelopment: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    preferentialProcurement: { maxPoints: 27, hasSubMinimum: true, subMinimumPercent: 40 },
    supplierDevelopment: { maxPoints: 10, hasSubMinimum: true, subMinimumPercent: 40 }, // 2% NPAT
    enterpriseDevelopment: { maxPoints: 18, hasSubMinimum: false, subMinimumPercent: 0 }, // 15 base + 1 grad + 1 jobs≤10% + 1 jobs>11%
    socioEconomicDevelopment: { maxPoints: 12, hasSubMinimum: false, subMinimumPercent: 0 }, // ICT-specific
    yesInitiative: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 }, // Level boost only
  },
  targets: {
    ownership: {
      // GROUND TRUTH Section 4: ICT voting target = 30% (not 25%)
      votingRightsTarget: 0.30, votingRightsMaxPts: 5,
      womenVotingTarget: 0.10, womenVotingMaxPts: 2,
      economicInterestTarget: 0.25, economicInterestMaxPts: 5,
      womenEITarget: 0.10, womenEIMaxPts: 2,
      netValueMaxPts: 8, newEntrantsMaxPts: 3,
    },
    managementControl: {
      boardBlackTarget: 0.50, boardBlackMaxPts: 3, // 50% target
      boardBWTarget: 0.25, boardBWMaxPts: 2, // 25% target
      execBlackTarget: 0.50, execBlackMaxPts: 2, // 50% target
      execBWTarget: 0.25, execBWMaxPts: 1, // 25% target (NOT 30%)
      otherExecBlackTarget: 0.60, otherExecBlackMaxPts: 3,
      otherExecBWTarget: 0.30, otherExecBWMaxPts: 2,
      seniorMaxPts: 0, seniorBWMaxPts: 0, // Included in EE portion
      middleMaxPts: 0, middleBWMaxPts: 0,
      juniorMaxPts: 0, juniorBWMaxPts: 0,
    },
    employmentEquity: {
      seniorMaxPts: 0, middleMaxPts: 0, juniorMaxPts: 0, // All merged into MC
      disabledMaxPts: 2, disabledTarget: 0.02, // 2% (NOT 3%)
    },
    skills: {
      learningProgrammesMaxPts: 15, // 3% of leviable amount
      bursaryMaxPts: 7, // 1% for black female
      disabledLearningMaxPts: 3, // 0.15% for disabled
      learnershipsMaxPts: 0, // Included in learning programmes
      absorptionMaxPts: 5, // 1% absorption
      overallSpendPercent: 3.0,
      bursarySpendPercent: 1.0,
      disabledSpendPercent: 0.15,
      learnershipTargetPercent: 0,
      absorptionTargetPercent: 1.0,
    },
    procurement: {
      allSuppliersTarget: 0.80, allSuppliersMaxPts: 5, // 80% spend
      qseTarget: 0.15, qseMaxPts: 3, // 15% QSE
      emeTarget: 0.15, emeMaxPts: 4, // 15% EME
      bo51Target: 0.50, bo51MaxPts: 9, // 50% black-owned
      bwo30Target: 0.12, bwo30MaxPts: 4, // 12% black women-owned
      dgTarget: 0.02, dgMaxPts: 2, // 2% designated group
    },
    esd: { sdPercent: 2.0, sdMaxPts: 10, edPercent: 1.0, edMaxPts: 5, edGraduationBonus: 1, edJobsBonus: 1 },
    sed: { spendPercent: 1.0, maxPts: 12 }, // ICT-specific initiatives
  },
  levelThresholds: ICT_LEVELS,
  recognitionTable: STANDARD_RECOGNITION_TABLE,
  benefitFactors: STANDARD_BENEFIT_FACTORS,
  categoryWeightings: STANDARD_CATEGORY_WEIGHTINGS,
  industryNorms: STANDARD_INDUSTRY_NORMS,
};
// ICT Generic verified from Excel: 25+23+25+27+10+18+12 = 140 (YES excluded)
// ICT uses different level scale: L1=120, L2=115, L3=110, L4=100, L5=95, L6=90, L7=75, L8=55

// ---------------------------------------------------------------------------
// FSC Generic (Financial Sector Code)
// VERIFIED AGAINST: BBBEE Toolkit (FSC) Template v1.0.xlsx
// Grand Total: 120 points (reduced from fabricated 149)
// FSC-specific pillars: Empowerment Financing, Access to Financial Services, Consumer Education
// ---------------------------------------------------------------------------

export const FSC_GENERIC: SectorConfig = {
  sectorCode: 'FSC',
  sectorName: 'Financial Sector Code (Generic)',
  scorecardType: 'Generic',
  totalMaxPoints: 120, // Verified from Excel: 25+21+23+24+10+9+8 = 120 (Others sub-sector)
  pillarConfigs: {
    ownership: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    managementControl: { maxPoints: 21, hasSubMinimum: false, subMinimumPercent: 0 }, // MC+EE combined (Others: 2+1+2+1+10+4+1=21)
    employmentEquity: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 },
    skillsDevelopment: { maxPoints: 23, hasSubMinimum: true, subMinimumPercent: 40 }, // 2+2+3+4+4+1+4+3 = 23
    preferentialProcurement: { maxPoints: 24, hasSubMinimum: true, subMinimumPercent: 40 }, // 5+3+2+7+3+2+2 = 24 (Others, no EF)
    supplierDevelopment: { maxPoints: 10, hasSubMinimum: true, subMinimumPercent: 40 },
    enterpriseDevelopment: { maxPoints: 9, hasSubMinimum: false, subMinimumPercent: 0 }, // 5 base + 1 grad + 3 bonus
    socioEconomicDevelopment: { maxPoints: 8, hasSubMinimum: false, subMinimumPercent: 0 }, // SED 3 + CE 2 + bonus = 8
    yesInitiative: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 }, // Level boost only
  },
  targets: {
    ownership: {
      votingRightsTarget: 0.25, votingRightsMaxPts: 4,
      womenVotingTarget: 0.10, womenVotingMaxPts: 2,
      economicInterestTarget: 0.25, economicInterestMaxPts: 4,
      womenEITarget: 0.10, womenEIMaxPts: 2,
      netValueMaxPts: 8, newEntrantsMaxPts: 2,
    },
    managementControl: {
      // GROUND TRUTH Section 5: FSC MC breakdown: board 2+1, exec 2+1, other exec 10+4 = 20; + disabled 1 = 21
      boardBlackTarget: 0.50, boardBlackMaxPts: 2,  // board: 2 pts black
      boardBWTarget: 0.25, boardBWMaxPts: 1,         // board: 1 pt women
      execBlackTarget: 0.50, execBlackMaxPts: 2,     // exec: 2 pts black
      execBWTarget: 0.25, execBWMaxPts: 1,           // exec: 1 pt women
      otherExecBlackTarget: 0.75, otherExecBlackMaxPts: 10, // other exec: 10 pts (75%)
      otherExecBWTarget: 0.38, otherExecBWMaxPts: 4,        // other exec: 4 pts women (38%)
      seniorMaxPts: 0, seniorBWMaxPts: 0,
      middleMaxPts: 0, middleBWMaxPts: 0,
      juniorMaxPts: 0, juniorBWMaxPts: 0,
    },
    employmentEquity: {
      seniorMaxPts: 0, middleMaxPts: 0, juniorMaxPts: 0,
      disabledMaxPts: 1, disabledTarget: 0.02, // FSC: 1 pt disabled (NOT 0)
    },
    skills: {
      learningProgrammesMaxPts: 6,
      bursaryMaxPts: 4,
      disabledLearningMaxPts: 4,
      learnershipsMaxPts: 6,
      absorptionMaxPts: 5,
      overallSpendPercent: 3.5,
      bursarySpendPercent: 2.5,
      disabledSpendPercent: 0.3,
      learnershipTargetPercent: 5.0,
      absorptionTargetPercent: 2.5,
    },
    procurement: {
      allSuppliersTarget: 0.80, allSuppliersMaxPts: 5,
      qseTarget: 0.15, qseMaxPts: 3,
      emeTarget: 0.15, emeMaxPts: 4,
      bo51Target: 0.50, bo51MaxPts: 9,
      bwo30Target: 0.12, bwo30MaxPts: 4,
      dgTarget: 0.02, dgMaxPts: 2,
    },
    esd: { sdPercent: 2.0, sdMaxPts: 10, edPercent: 1.0, edMaxPts: 5, edGraduationBonus: 0, edJobsBonus: 0 },
    sed: { spendPercent: 1.0, maxPts: 8 }, // SED+CE combined for Others sub-sector
  },
  levelThresholds: FSC_LEVELS,
  recognitionTable: STANDARD_RECOGNITION_TABLE,
  benefitFactors: STANDARD_BENEFIT_FACTORS,
  categoryWeightings: STANDARD_CATEGORY_WEIGHTINGS,
  industryNorms: STANDARD_INDUSTRY_NORMS,
};
// FSC Generic verified: 25+21+23+24+10+9+8 = 120 (Others sub-sector) ✓
// MC breakdown (Section 5): board 2+1, exec 2+1, other exec 10+4, disabled 1 = 21 ✓
// FSC uses scaled level thresholds: L1=95.5, L2=90.7, ... L8=38.2
// FSC has sub-variants: Banks, Long-Term Insurers, Short-Term Insurers, Others
// EF is "NOT Applicable" for Others sub-sector

// ---------------------------------------------------------------------------
// Agri Generic (Agriculture / AgriBEE)
// TODO: Verify against AgriBEE Sector Code toolkit Excel
// ---------------------------------------------------------------------------

export const AGRI_GENERIC: SectorConfig = {
  sectorCode: 'AGRI',
  sectorName: 'AgriBEE Sector Code (Generic)',
  scorecardType: 'Generic',
  totalMaxPoints: 132, // Verified: 25+23+25+27+10+7+15 = 132
  pillarConfigs: {
    ownership: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    managementControl: { maxPoints: 23, hasSubMinimum: false, subMinimumPercent: 0 }, // MC+EE combined
    employmentEquity: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 },
    skillsDevelopment: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    preferentialProcurement: { maxPoints: 27, hasSubMinimum: true, subMinimumPercent: 40 },
    supplierDevelopment: { maxPoints: 10, hasSubMinimum: true, subMinimumPercent: 40 },
    enterpriseDevelopment: { maxPoints: 7, hasSubMinimum: false, subMinimumPercent: 0 }, // 5 base + 1 grad + 1 jobs
    socioEconomicDevelopment: { maxPoints: 15, hasSubMinimum: false, subMinimumPercent: 0 }, // Agriculture-specific CD
    yesInitiative: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 }, // Level boost only
  },
  targets: {
    ownership: {
      votingRightsTarget: 0.25, votingRightsMaxPts: 5,
      womenVotingTarget: 0.10, womenVotingMaxPts: 2,
      economicInterestTarget: 0.25, economicInterestMaxPts: 5,
      womenEITarget: 0.10, womenEIMaxPts: 2,
      netValueMaxPts: 8, newEntrantsMaxPts: 3,
    },
    managementControl: {
      boardBlackTarget: 0.50, boardBlackMaxPts: 3,
      boardBWTarget: 0.25, boardBWMaxPts: 2,
      execBlackTarget: 0.50, execBlackMaxPts: 2,
      execBWTarget: 0.25, execBWMaxPts: 1, // 25% (NOT 30%)
      otherExecBlackTarget: 0.60, otherExecBlackMaxPts: 3,
      otherExecBWTarget: 0.30, otherExecBWMaxPts: 2,
      seniorMaxPts: 0, seniorBWMaxPts: 0,
      middleMaxPts: 0, middleBWMaxPts: 0,
      juniorMaxPts: 0, juniorBWMaxPts: 0,
    },
    employmentEquity: {
      seniorMaxPts: 0, middleMaxPts: 0, juniorMaxPts: 0,
      disabledMaxPts: 2, disabledTarget: 0.02, // 2% (NOT 3%)
    },
    skills: {
      learningProgrammesMaxPts: 15,
      bursaryMaxPts: 7,
      disabledLearningMaxPts: 3,
      learnershipsMaxPts: 0,
      absorptionMaxPts: 5,
      overallSpendPercent: 3.0,
      bursarySpendPercent: 1.0,
      disabledSpendPercent: 0.15,
      learnershipTargetPercent: 0,
      absorptionTargetPercent: 1.0,
    },
    procurement: {
      allSuppliersTarget: 0.80, allSuppliersMaxPts: 5,
      qseTarget: 0.15, qseMaxPts: 3,
      emeTarget: 0.15, emeMaxPts: 4,
      bo51Target: 0.50, bo51MaxPts: 9,
      bwo30Target: 0.12, bwo30MaxPts: 4,
      dgTarget: 0.02, dgMaxPts: 2,
    },
    esd: { sdPercent: 2.0, sdMaxPts: 10, edPercent: 1.0, edMaxPts: 5, edGraduationBonus: 1, edJobsBonus: 1 },
    sed: { spendPercent: 1.0, maxPts: 15 },
  },
  levelThresholds: STANDARD_LEVELS,
  recognitionTable: STANDARD_RECOGNITION_TABLE,
  benefitFactors: STANDARD_BENEFIT_FACTORS,
  categoryWeightings: STANDARD_CATEGORY_WEIGHTINGS,
  industryNorms: STANDARD_INDUSTRY_NORMS,
};
// AGRI Generic verified: 25+23+25+27+10+7+15 = 132 (matches Excel Grand Total)

// ---------------------------------------------------------------------------
// QSE Scorecard (for Qualifying Small Enterprises, R10m-R50m turnover)
// TODO: Verify against QSE toolkit Excel
// ---------------------------------------------------------------------------

export const RCOGP_QSE: SectorConfig = {
  sectorCode: 'RCOGP',
  sectorName: 'Revised Codes (QSE)',
  scorecardType: 'QSE',
  totalMaxPoints: 108, // Verified: 25+15+30+21+5+7+5 = 108
  pillarConfigs: {
    ownership: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    managementControl: { maxPoints: 15, hasSubMinimum: false, subMinimumPercent: 0 },
    skillsDevelopment: { maxPoints: 30, hasSubMinimum: true, subMinimumPercent: 40 },
    preferentialProcurement: { maxPoints: 21, hasSubMinimum: true, subMinimumPercent: 40 },
    supplierDevelopment: { maxPoints: 5, hasSubMinimum: true, subMinimumPercent: 40 }, // 1% NPAT
    enterpriseDevelopment: { maxPoints: 7, hasSubMinimum: false, subMinimumPercent: 0 }, // 5 base + 1 grad + 1 jobs
    socioEconomicDevelopment: { maxPoints: 5, hasSubMinimum: false, subMinimumPercent: 0 }, // 1% NPAT
    yesInitiative: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 }, // Level boost only
  },
  targets: {
    ownership: {
      votingRightsTarget: 0.25, votingRightsMaxPts: 5,
      womenVotingTarget: 0.10, womenVotingMaxPts: 2,
      economicInterestTarget: 0.25, economicInterestMaxPts: 5,
      womenEITarget: 0.10, womenEIMaxPts: 2,
      netValueMaxPts: 8, newEntrantsMaxPts: 3,
    },
    managementControl: {
      boardBlackTarget: 0.50, boardBlackMaxPts: 3,
      boardBWTarget: 0.25, boardBWMaxPts: 2,
      execBlackTarget: 0.50, execBlackMaxPts: 5, // 50% = 5pts
      execBWTarget: 0.25, execBWMaxPts: 2, // 25% = 2pts
      otherExecBlackTarget: 0.60, otherExecBlackMaxPts: 3,
      otherExecBWTarget: 0.30, otherExecBWMaxPts: 2,
      seniorMaxPts: 0, seniorBWMaxPts: 0,
      middleMaxPts: 0, middleBWMaxPts: 0,
      juniorMaxPts: 0, juniorBWMaxPts: 0,
    },
    employmentEquity: {
      seniorMaxPts: 0, middleMaxPts: 0, juniorMaxPts: 0,
      disabledMaxPts: 2, disabledTarget: 0.02, // 2% (NOT 3%)
    },
    skills: {
      learningProgrammesMaxPts: 15, // 3% leviable
      bursaryMaxPts: 7, // 1% black female
      disabledLearningMaxPts: 3, // 0.15% disabled
      learnershipsMaxPts: 0,
      absorptionMaxPts: 5, // 1% absorption
      overallSpendPercent: 3.0,
      bursarySpendPercent: 1.0,
      disabledSpendPercent: 0.15,
      learnershipTargetPercent: 0,
      absorptionTargetPercent: 1.0,
    },
    procurement: {
      allSuppliersTarget: 0.80, allSuppliersMaxPts: 5,
      qseTarget: 0.15, qseMaxPts: 3,
      emeTarget: 0.15, emeMaxPts: 4,
      bo51Target: 0.50, bo51MaxPts: 9,
      bwo30Target: 0.12, bwo30MaxPts: 4,
      dgTarget: 0.02, dgMaxPts: 2,
    },
    esd: { sdPercent: 1.0, sdMaxPts: 5, edPercent: 1.0, edMaxPts: 5, edGraduationBonus: 1, edJobsBonus: 1 },
    sed: { spendPercent: 1.0, maxPts: 5 },
  },
  levelThresholds: STANDARD_LEVELS,
  recognitionTable: STANDARD_RECOGNITION_TABLE,
  benefitFactors: STANDARD_BENEFIT_FACTORS,
  categoryWeightings: STANDARD_CATEGORY_WEIGHTINGS,
  industryNorms: STANDARD_INDUSTRY_NORMS,
};
// RCOGP QSE verified: 25+15+30+21+5+7+5 = 108 (exact match Excel)

// ---------------------------------------------------------------------------
// ICT QSE (Information & Communication Technology - Qualifying Small Enterprise)
// TODO: Verify against ICT QSE toolkit Excel
// ---------------------------------------------------------------------------

export const ICT_QSE: SectorConfig = {
  sectorCode: 'ICT',
  sectorName: 'ICT Sector Code (QSE)',
  scorecardType: 'QSE',
  totalMaxPoints: 116, // Verified: 25+15+30+21+5+8+12 = 116
  pillarConfigs: {
    ownership: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    managementControl: { maxPoints: 15, hasSubMinimum: false, subMinimumPercent: 0 },
    skillsDevelopment: { maxPoints: 30, hasSubMinimum: true, subMinimumPercent: 40 },
    preferentialProcurement: { maxPoints: 21, hasSubMinimum: true, subMinimumPercent: 40 },
    supplierDevelopment: { maxPoints: 5, hasSubMinimum: true, subMinimumPercent: 40 },
    enterpriseDevelopment: { maxPoints: 8, hasSubMinimum: false, subMinimumPercent: 0 }, // 5 base + 1 grad + 2 jobs
    socioEconomicDevelopment: { maxPoints: 12, hasSubMinimum: false, subMinimumPercent: 0 },
    yesInitiative: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 }, // Level boost only
  },
  targets: {
    ownership: {
      votingRightsTarget: 0.25, votingRightsMaxPts: 5,
      womenVotingTarget: 0.10, womenVotingMaxPts: 2,
      economicInterestTarget: 0.25, economicInterestMaxPts: 5,
      womenEITarget: 0.10, womenEIMaxPts: 2,
      netValueMaxPts: 8, newEntrantsMaxPts: 3,
    },
    managementControl: {
      boardBlackTarget: 0.50, boardBlackMaxPts: 3,
      boardBWTarget: 0.25, boardBWMaxPts: 2,
      execBlackTarget: 0.50, execBlackMaxPts: 4,
      execBWTarget: 0.25, execBWMaxPts: 4,
      otherExecBlackTarget: 0.60, otherExecBlackMaxPts: 3,
      otherExecBWTarget: 0.30, otherExecBWMaxPts: 2,
      seniorMaxPts: 0, seniorBWMaxPts: 0,
      middleMaxPts: 0, middleBWMaxPts: 0,
      juniorMaxPts: 0, juniorBWMaxPts: 0,
    },
    employmentEquity: {
      seniorMaxPts: 0, middleMaxPts: 0, juniorMaxPts: 0,
      disabledMaxPts: 2, disabledTarget: 0.02, // 2% (NOT 3%)
    },
    skills: {
      learningProgrammesMaxPts: 15,
      bursaryMaxPts: 7,
      disabledLearningMaxPts: 3,
      learnershipsMaxPts: 0,
      absorptionMaxPts: 5,
      overallSpendPercent: 3.0,
      bursarySpendPercent: 1.0,
      disabledSpendPercent: 0.15,
      learnershipTargetPercent: 0,
      absorptionTargetPercent: 1.0,
    },
    procurement: {
      allSuppliersTarget: 0.80, allSuppliersMaxPts: 5,
      qseTarget: 0.15, qseMaxPts: 3,
      emeTarget: 0.15, emeMaxPts: 4,
      bo51Target: 0.50, bo51MaxPts: 9,
      bwo30Target: 0.12, bwo30MaxPts: 4,
      dgTarget: 0.02, dgMaxPts: 2,
    },
    esd: { sdPercent: 1.0, sdMaxPts: 5, edPercent: 1.0, edMaxPts: 5, edGraduationBonus: 1, edJobsBonus: 2 },
    sed: { spendPercent: 1.0, maxPts: 12 },
  },
  levelThresholds: ICT_LEVELS,
  recognitionTable: STANDARD_RECOGNITION_TABLE,
  benefitFactors: STANDARD_BENEFIT_FACTORS,
  categoryWeightings: STANDARD_CATEGORY_WEIGHTINGS,
  industryNorms: STANDARD_INDUSTRY_NORMS,
};
// ICT QSE verified from Excel: 25+15+30+21+5+8+12 = 116 (YES excluded)
// ICT QSE uses same ICT level scale as ICT Generic

// ---------------------------------------------------------------------------
// Transport Sector — Large Enterprise (docs/Transport Codes.xlsx sheet1)
// Grand Total 108: 24+29+15+20+15+5 (+ merged MC 11 + EE 18 in management pillar)
// Preferential procurement rows omit DG bonus row; supplier development is 3% NPAT → 15 pts (named Enterprise Dev in toolkit).
// ---------------------------------------------------------------------------

export const TRANSPORT_GENERIC: SectorConfig = {
  sectorCode: 'TRANSPORT',
  sectorName: 'Transport Sector Code (Large Enterprise)',
  scorecardType: 'Generic',
  totalMaxPoints: 108,
  pillarConfigs: {
    ownership: { maxPoints: 24, hasSubMinimum: false, subMinimumPercent: 0 },
    managementControl: { maxPoints: 29, hasSubMinimum: false, subMinimumPercent: 0 },
    employmentEquity: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 },
    skillsDevelopment: { maxPoints: 15, hasSubMinimum: false, subMinimumPercent: 0 },
    preferentialProcurement: { maxPoints: 20, hasSubMinimum: false, subMinimumPercent: 0 },
    supplierDevelopment: { maxPoints: 15, hasSubMinimum: false, subMinimumPercent: 0 },
    enterpriseDevelopment: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 },
    socioEconomicDevelopment: { maxPoints: 5, hasSubMinimum: false, subMinimumPercent: 0 },
    yesInitiative: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 },
  },
  targets: {
    ownership: {
      votingRightsTarget: 0.25, votingRightsMaxPts: 3,
      womenVotingTarget: 0.10, womenVotingMaxPts: 2,
      economicInterestTarget: 0.25, economicInterestMaxPts: 4,
      womenEITarget: 0.10, womenEIMaxPts: 2,
      economicInterestDesignatedGroupTarget: 0.025, economicInterestDesignatedGroupMaxPts: 1,
      netValueMaxPts: 7, newEntrantsMaxPts: 2,
    },
    managementControl: {
      boardBlackTarget: 0.50, boardBlackMaxPts: 0,
      boardBWTarget: 0.25, boardBWMaxPts: 0,
      execBlackTarget: 0.50, execBlackMaxPts: 0,
      execBWTarget: 0.25, execBWMaxPts: 0,
      otherExecBlackTarget: 0.60, otherExecBlackMaxPts: 0,
      otherExecBWTarget: 0.30, otherExecBWMaxPts: 0,
      seniorMaxPts: 0, seniorBWMaxPts: 0,
      middleMaxPts: 0, middleBWMaxPts: 0,
      juniorMaxPts: 0, juniorBWMaxPts: 0,
    },
    employmentEquity: {
      seniorMaxPts: 0, middleMaxPts: 0, juniorMaxPts: 0,
      disabledMaxPts: 1, disabledTarget: 0.02,
      disabledWomenMaxPts: 1, disabledWomenTarget: 0.01,
    },
    skills: {
      learningProgrammesMaxPts: 3,
      bursaryMaxPts: 3,
      disabledLearningMaxPts: 3,
      learnershipsMaxPts: 3,
      absorptionMaxPts: 3,
      overallSpendPercent: 3.0,
      bursarySpendPercent: 1.5,
      disabledSpendPercent: 0.45,
      learnershipTargetPercent: 5.0,
      absorptionTargetPercent: 2.5,
    },
    procurement: {
      allSuppliersTarget: 0.50, allSuppliersMaxPts: 12,
      qseTarget: 0.10, qseMaxPts: 3,
      emeTarget: 0, emeMaxPts: 0,
      bo51Target: 0.09, bo51MaxPts: 3,
      bwo30Target: 0.06, bwo30MaxPts: 2,
      dgTarget: 0, dgMaxPts: 0,
    },
    esd: {
      sdPercent: 3.0, sdMaxPts: 15,
      edPercent: 0, edMaxPts: 0,
      edGraduationBonus: 0, edJobsBonus: 0,
    },
    sed: { spendPercent: 1.0, maxPts: 5 },
  },
  levelThresholds: TRANSPORT_LARGE_LEVELS,
  recognitionTable: STANDARD_RECOGNITION_TABLE,
  benefitFactors: STANDARD_BENEFIT_FACTORS,
  categoryWeightings: STANDARD_CATEGORY_WEIGHTINGS,
  industryNorms: STANDARD_INDUSTRY_NORMS,
};
// Verification sheet1: 24+(11+18)+15+20+15+5 = 108 (toolkit labels MC and EE separately; engine reports one management pillar max 29)

// ---------------------------------------------------------------------------
// Transport Sector — QSE (docs/Transport Codes.xlsx "Road Freight QSE" sheet)
//
// Structure: 3 compulsory pillars (Ownership 28 + MC 27 + EE 27 = 82 pts)
//            + choose ONE of 4 elective pillars (Skills Dev / PP / Enterprise Dev / SED, each 25 pts)
//            = 107 total.
//
// NOTE: Choose ONE of the 4 elective pillars (Skills Dev, PP, Enterprise Dev, SED) —
//       only that pillar's 25 pts count toward the 107 total. Indicated by chooseOneGroup
//       = 'transport_qse_elective' on each elective pillar.
//
// Source: docs/Transport Codes.xlsx — "Road Freight QSE" sheet
// Ownership 28: voting 6 + EI 9 + fulfilment 1 + net value 9 + bonus women 2 + bonus ESOP 1
// MC 27: top mgmt 25 + bonus black women 2
// EE 27: black mgmt 7.5 + black women mgmt 7.5 + black employees 5 + black women employees 5 + EAP bonus 2
// ---------------------------------------------------------------------------

export const TRANSPORT_QSE: SectorConfig = {
  sectorCode: 'TRANSPORT',
  sectorName: 'Transport Sector Code (QSE)',
  scorecardType: 'QSE',
  // 82 compulsory (Ownership 28 + MC 27 + EE 27) + 1 chosen elective of 4 × 25 = 107
  totalMaxPoints: 107,
  pillarConfigs: {
    // --- Compulsory pillars ---
    ownership: { maxPoints: 28, hasSubMinimum: false, subMinimumPercent: 0 },
    managementControl: { maxPoints: 27, hasSubMinimum: false, subMinimumPercent: 0 },
    employmentEquity: { maxPoints: 27, hasSubMinimum: false, subMinimumPercent: 0 },
    // --- Elective pillars (choose ONE; only the chosen 25 pts count toward 107) ---
    skillsDevelopment: { maxPoints: 25, hasSubMinimum: false, subMinimumPercent: 0, chooseOneGroup: 'transport_qse_elective' },
    preferentialProcurement: { maxPoints: 25, hasSubMinimum: false, subMinimumPercent: 0, chooseOneGroup: 'transport_qse_elective' },
    supplierDevelopment: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 }, // Not a standalone elective
    enterpriseDevelopment: { maxPoints: 25, hasSubMinimum: false, subMinimumPercent: 0, chooseOneGroup: 'transport_qse_elective' },
    socioEconomicDevelopment: { maxPoints: 25, hasSubMinimum: false, subMinimumPercent: 0, chooseOneGroup: 'transport_qse_elective' },
    yesInitiative: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 },
  },
  targets: {
    ownership: {
      // voting 25%+1 vote = 6 pts; EI 25% = 9 pts; fulfilment = 1 pt (newEntrants);
      // net value 60% = 9 pts; bonus black women 10% = 2 pts; bonus ESOP/BBOS/co-ops 10% = 1 pt
      // Total: 6+9+1+9+2+1 = 28 ✓
      votingRightsTarget: 0.25, votingRightsMaxPts: 6,
      womenVotingTarget: 0.10, womenVotingMaxPts: 2,      // bonus: black women
      economicInterestTarget: 0.25, economicInterestMaxPts: 9,
      womenEITarget: 0.10, womenEIMaxPts: 1,              // bonus: ESOP/BBOS/co-ops
      netValueMaxPts: 9,                                   // net value 60%
      newEntrantsMaxPts: 1,                                // ownership fulfilment
    },
    managementControl: {
      // Top management black 50.1% = 25 pts; bonus black women 25% = 2 pts; Total: 27 ✓
      boardBlackTarget: 0, boardBlackMaxPts: 0,
      boardBWTarget: 0.25, boardBWMaxPts: 2,               // bonus: black women at top mgmt
      execBlackTarget: 0.501, execBlackMaxPts: 25,         // top management black 50.1%
      execBWTarget: 0, execBWMaxPts: 0,
      otherExecBlackTarget: 0, otherExecBlackMaxPts: 0,
      otherExecBWTarget: 0, otherExecBWMaxPts: 0,
      seniorMaxPts: 0, seniorBWMaxPts: 0,
      middleMaxPts: 0, middleBWMaxPts: 0,
      juniorMaxPts: 0, juniorBWMaxPts: 0,
    },
    employmentEquity: {
      // Black mgmt as % of all mgmt 40% = 7.5 pts; black women mgmt 20% = 7.5 pts
      // Black employees as % of total 60% = 5 pts; black women employees 30% = 5 pts
      // Bonus: meet/exceed EAP = 2 pts; Total: 7.5+7.5+5+5+2 = 27 ✓
      seniorMaxPts: 15,      // black mgmt 7.5 + black women mgmt 7.5
      middleMaxPts: 10,      // black employees 5 + black women employees 5
      juniorMaxPts: 0,
      disabledMaxPts: 2,     // EAP bonus
      disabledTarget: 0,
    },
    // Skills elective: 2% leviable → 12.5 pts; 1% black women → 12.5 pts
    skills: {
      learningProgrammesMaxPts: 12.5,
      bursaryMaxPts: 12.5,
      disabledLearningMaxPts: 0,
      learnershipsMaxPts: 0,
      absorptionMaxPts: 0,
      overallSpendPercent: 2.0,
      bursarySpendPercent: 1.0,
      disabledSpendPercent: 0,
      learnershipTargetPercent: 0,
      absorptionTargetPercent: 0,
    },
    // PP elective: 40% B-BBEE spend → 25 pts (single indicator)
    procurement: {
      allSuppliersTarget: 0.40, allSuppliersMaxPts: 25,
      qseTarget: 0, qseMaxPts: 0, emeTarget: 0, emeMaxPts: 0,
      bo51Target: 0, bo51MaxPts: 0, bwo30Target: 0, bwo30MaxPts: 0,
      dgTarget: 0, dgMaxPts: 0,
    },
    // Enterprise Dev elective: 2% NPAT → 25 pts
    esd: {
      sdPercent: 0, sdMaxPts: 0,
      edPercent: 2.0, edMaxPts: 25,
      edGraduationBonus: 0, edJobsBonus: 0,
    },
    // SED elective: 1% NPAT → 25 pts
    sed: { spendPercent: 1.0, maxPts: 25 },
  },
  levelThresholds: TRANSPORT_QSE_LEVELS,
  recognitionTable: STANDARD_RECOGNITION_TABLE,
  benefitFactors: STANDARD_BENEFIT_FACTORS,
  categoryWeightings: STANDARD_CATEGORY_WEIGHTINGS,
  industryNorms: STANDARD_INDUSTRY_NORMS,
};
// Verified against docs/Transport Codes.xlsx "Road Freight QSE":
// Compulsory: Ownership 28 + MC 27 + EE 27 = 82
// Elective (choose ONE of 4): Skills Dev 25 / PP 25 / Enterprise Dev 25 / SED 25
// Grand total: 82 + 25 = 107 ✓
// Level thresholds scaled: STANDARD_LEVELS × (107/120)

// ---------------------------------------------------------------------------
// Construction Sector configs (May 2026)
//
// ⚠️  UNVERIFIED — Construction sector totals (QSE=110, Contractor=123, BEP=123)
// are NOT present in docs/SCORECARD_GROUND_TRUTH.md and have NOT been verified
// against any official Construction Sector Code Excel toolkit.
// These values were derived from a Construction Sector Code document supplied
// alongside the core toolkits but require expert verification before use.
// Do NOT rely on these for compliance reporting until verified.
//
// Construction uses an indicator-level scoring engine — see
// `pipeline/constructionIndicators.ts` and `pipeline/constructionScoring.ts`.
// The legacy SectorConfig.targets shape (votingRightsTarget, boardBlackTarget,
// etc.) does NOT apply to Construction. We therefore stub `targets` with the
// required nested shape but zero values, and rely on the dedicated
// `/api/construction/evaluate` endpoint for actual scoring.
//
// What this entry IS used for: ArangoDB sector_rules row, sector discovery
// (/api/sectors, /api/sectors/options), the dropdown in the frontend, and the
// element-level pillar weights (so the dashboard can render the correct pillar
// caps per entity type).
//
// What this entry is NOT used for: indicator-level scoring (handled by the
// construction engine, which reads its own indicator matrix directly).
// ---------------------------------------------------------------------------

const ZERO_OWNERSHIP_TARGETS: OwnershipTargets = {
  votingRightsTarget: 0, votingRightsMaxPts: 0,
  womenVotingTarget: 0, womenVotingMaxPts: 0,
  economicInterestTarget: 0, economicInterestMaxPts: 0,
  womenEITarget: 0, womenEIMaxPts: 0,
  netValueMaxPts: 0, newEntrantsMaxPts: 0,
};
const ZERO_MC_TARGETS: MCTargets = {
  boardBlackTarget: 0, boardBlackMaxPts: 0,
  boardBWTarget: 0, boardBWMaxPts: 0,
  execBlackTarget: 0, execBlackMaxPts: 0,
  execBWTarget: 0, execBWMaxPts: 0,
  otherExecBlackTarget: 0, otherExecBlackMaxPts: 0,
  otherExecBWTarget: 0, otherExecBWMaxPts: 0,
  seniorMaxPts: 0, seniorBWMaxPts: 0,
  middleMaxPts: 0, middleBWMaxPts: 0,
  juniorMaxPts: 0, juniorBWMaxPts: 0,
};
const ZERO_EE_TARGETS: EETargets = {
  seniorMaxPts: 0, middleMaxPts: 0, juniorMaxPts: 0,
  disabledMaxPts: 0, disabledTarget: 0,
};
const ZERO_SKILLS_TARGETS: SkillsTargets = {
  learningProgrammesMaxPts: 0, bursaryMaxPts: 0, disabledLearningMaxPts: 0,
  learnershipsMaxPts: 0, absorptionMaxPts: 0,
  overallSpendPercent: 0, bursarySpendPercent: 0, disabledSpendPercent: 0,
  learnershipTargetPercent: 0, absorptionTargetPercent: 0,
};
const ZERO_PROC_TARGETS: ProcurementTargets = {
  allSuppliersTarget: 0, allSuppliersMaxPts: 0,
  qseTarget: 0, qseMaxPts: 0, emeTarget: 0, emeMaxPts: 0,
  bo51Target: 0, bo51MaxPts: 0, bwo30Target: 0, bwo30MaxPts: 0,
  dgTarget: 0, dgMaxPts: 0,
};
const ZERO_ESD_TARGETS: EsdTargets = {
  sdPercent: 0, sdMaxPts: 0, edPercent: 0, edMaxPts: 0,
  edGraduationBonus: 0, edJobsBonus: 0,
};

// TODO(verify): Construction-specific level thresholds were not present in the
// supplied source documents (Construction QSE Scorecard + Construction Sector
// Codes docx). Using STANDARD_LEVELS as a placeholder; the Construction engine
// returns total points and lets the caller translate to a B-BBEE level.
const CONSTRUCTION_LEVELS_PLACEHOLDER = STANDARD_LEVELS;

export const CONSTRUCTION_QSE: SectorConfig = {
  sectorCode: 'CONSTRUCTION',
  sectorName: 'Construction Sector Code (QSE)',
  scorecardType: 'QSE',
  totalMaxPoints: 110, // 30 + 20 + 26 + 29 + 5
  pillarConfigs: {
    ownership: { maxPoints: 30, hasSubMinimum: false, subMinimumPercent: 0 },
    managementControl: { maxPoints: 20, hasSubMinimum: false, subMinimumPercent: 0 },
    skillsDevelopment: { maxPoints: 26, hasSubMinimum: false, subMinimumPercent: 0 },
    preferentialProcurement: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 },
    supplierDevelopment: { maxPoints: 29, hasSubMinimum: false, subMinimumPercent: 0 }, // Construction ESD (combined)
    enterpriseDevelopment: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 },
    socioEconomicDevelopment: { maxPoints: 5, hasSubMinimum: false, subMinimumPercent: 0 },
    yesInitiative: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 },
  },
  targets: {
    ownership: ZERO_OWNERSHIP_TARGETS, managementControl: ZERO_MC_TARGETS,
    employmentEquity: ZERO_EE_TARGETS, skills: ZERO_SKILLS_TARGETS,
    procurement: ZERO_PROC_TARGETS, esd: ZERO_ESD_TARGETS,
    sed: { spendPercent: 0, maxPts: 5 },
  },
  levelThresholds: CONSTRUCTION_LEVELS_PLACEHOLDER,
  recognitionTable: STANDARD_RECOGNITION_TABLE,
  benefitFactors: STANDARD_BENEFIT_FACTORS,
  categoryWeightings: STANDARD_CATEGORY_WEIGHTINGS,
  industryNorms: STANDARD_INDUSTRY_NORMS,
};

export const CONSTRUCTION_CONTRACTOR: SectorConfig = {
  sectorCode: 'CONSTRUCTION',
  sectorName: 'Construction Sector Code (Contractor)',
  scorecardType: 'Contractor',
  totalMaxPoints: 123, // 31 + 22 + 26 + 38 + 6
  pillarConfigs: {
    ownership: { maxPoints: 31, hasSubMinimum: false, subMinimumPercent: 0 },
    managementControl: { maxPoints: 22, hasSubMinimum: false, subMinimumPercent: 0 },
    skillsDevelopment: { maxPoints: 26, hasSubMinimum: false, subMinimumPercent: 0 },
    preferentialProcurement: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 },
    supplierDevelopment: { maxPoints: 38, hasSubMinimum: false, subMinimumPercent: 0 },
    enterpriseDevelopment: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 },
    socioEconomicDevelopment: { maxPoints: 6, hasSubMinimum: false, subMinimumPercent: 0 },
    yesInitiative: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 },
  },
  targets: {
    ownership: ZERO_OWNERSHIP_TARGETS, managementControl: ZERO_MC_TARGETS,
    employmentEquity: ZERO_EE_TARGETS, skills: ZERO_SKILLS_TARGETS,
    procurement: ZERO_PROC_TARGETS, esd: ZERO_ESD_TARGETS,
    sed: { spendPercent: 0, maxPts: 6 },
  },
  levelThresholds: CONSTRUCTION_LEVELS_PLACEHOLDER,
  recognitionTable: STANDARD_RECOGNITION_TABLE,
  benefitFactors: STANDARD_BENEFIT_FACTORS,
  categoryWeightings: STANDARD_CATEGORY_WEIGHTINGS,
  industryNorms: STANDARD_INDUSTRY_NORMS,
};

export const CONSTRUCTION_BEP: SectorConfig = {
  sectorCode: 'CONSTRUCTION',
  sectorName: 'Construction Sector Code (Built Environment Professional)',
  scorecardType: 'BEP',
  totalMaxPoints: 123, // 31 + 22 + 34 + 30 + 6
  pillarConfigs: {
    ownership: { maxPoints: 31, hasSubMinimum: false, subMinimumPercent: 0 },
    managementControl: { maxPoints: 22, hasSubMinimum: false, subMinimumPercent: 0 },
    skillsDevelopment: { maxPoints: 34, hasSubMinimum: false, subMinimumPercent: 0 },
    preferentialProcurement: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 },
    supplierDevelopment: { maxPoints: 30, hasSubMinimum: false, subMinimumPercent: 0 },
    enterpriseDevelopment: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 },
    socioEconomicDevelopment: { maxPoints: 6, hasSubMinimum: false, subMinimumPercent: 0 },
    yesInitiative: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 },
  },
  targets: {
    ownership: ZERO_OWNERSHIP_TARGETS, managementControl: ZERO_MC_TARGETS,
    employmentEquity: ZERO_EE_TARGETS, skills: ZERO_SKILLS_TARGETS,
    procurement: ZERO_PROC_TARGETS, esd: ZERO_ESD_TARGETS,
    sed: { spendPercent: 0, maxPts: 6 },
  },
  levelThresholds: CONSTRUCTION_LEVELS_PLACEHOLDER,
  recognitionTable: STANDARD_RECOGNITION_TABLE,
  benefitFactors: STANDARD_BENEFIT_FACTORS,
  categoryWeightings: STANDARD_CATEGORY_WEIGHTINGS,
  industryNorms: STANDARD_INDUSTRY_NORMS,
};

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

const ALL_CONFIGS: SectorConfig[] = [
  RCOGP_GENERIC, ICT_GENERIC, FSC_GENERIC, AGRI_GENERIC, TRANSPORT_GENERIC, RCOGP_QSE, ICT_QSE, TRANSPORT_QSE,
  CONSTRUCTION_QSE, CONSTRUCTION_CONTRACTOR, CONSTRUCTION_BEP,
];

export function getSectorConfig(sectorCode: string, scorecardType: string = 'Generic'): SectorConfig {
  const match = ALL_CONFIGS.find(c =>
    c.sectorCode.toLowerCase() === sectorCode.toLowerCase() &&
    c.scorecardType.toLowerCase() === scorecardType.toLowerCase()
  );
  if (!match) {
    throw new Error(`No sector config found for sectorCode="${sectorCode}", scorecardType="${scorecardType}". Available: ${ALL_CONFIGS.map(c => `${c.sectorCode}/${c.scorecardType}`).join(', ')}`);
  }
  return match;
}

/** Non-throwing version for display-only paths. Returns null if not found. */
export function getSectorConfigSafe(sectorCode: string, scorecardType: string = 'Generic'): SectorConfig | null {
  return ALL_CONFIGS.find(c =>
    c.sectorCode.toLowerCase() === sectorCode.toLowerCase() &&
    c.scorecardType.toLowerCase() === scorecardType.toLowerCase()
  ) || null;
}

export function detectSectorFromName(nameOrSector: string): SectorConfig {
  const lower = (nameOrSector || '').toLowerCase();
  const hasICT = /ict|information.*communic|technology|telecom|software|digital/i.test(lower);
  const hasQSE = /qse|qualifying\s*small/i.test(lower);
  if (hasICT && hasQSE) return ICT_QSE;
  if (hasICT) return ICT_GENERIC;
  if (/fsc|financial\s*sector|banking|insurance|investment/i.test(lower)) return FSC_GENERIC;
  if (/agri|agriculture|farming|agribee/i.test(lower)) return AGRI_GENERIC;
  if (/transport|freight|logistics|rail|aviation|maritime|shipping/i.test(lower)) {
    return hasQSE ? TRANSPORT_QSE : TRANSPORT_GENERIC;
  }
  if (/construction|contractor|built\s*environment|builder/i.test(lower)) {
    if (/bep|built\s*environment\s*professional/i.test(lower)) return CONSTRUCTION_BEP;
    if (hasQSE) return CONSTRUCTION_QSE;
    return CONSTRUCTION_CONTRACTOR;
  }
  if (hasQSE) return RCOGP_QSE;
  logger.warn('No sector match — defaulting to RCOGP Generic', { input: nameOrSector });
  return RCOGP_GENERIC;
}

export function listSectorConfigs(): Array<{ code: string; name: string; type: string; totalPoints: number }> {
  return ALL_CONFIGS.map(c => ({
    code: c.sectorCode,
    name: c.sectorName,
    type: c.scorecardType,
    totalPoints: c.totalMaxPoints,
  }));
}
