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
import {
  CONSTRUCTION_QSE_SCORECARD,
  CONSTRUCTION_CONTRACTOR_SCORECARD,
  CONSTRUCTION_BEP_SCORECARD,
  type ConstructionIndicator,
} from './constructionIndicators.js';
import {
  getAllSectorPillarSubElements,
  type PillarSubElement,
} from './sectorSubElements.js';

const logger = createLogger('SectorConfig');

/** Map Construction indicator matrix rows → Super Admin / API `indicators` shape. */
function mapConstructionIndicators(indicators: ConstructionIndicator[]): SectorIndicatorRow[] {
  return indicators.map((ind) => ({
    code: ind.code,
    element: ind.element,
    category: ind.category,
    name: ind.name,
    weight: ind.weight,
    target: ind.target,
    targetUnit: ind.targetUnit,
    calculation: ind.calculation,
  }));
}

export interface PillarConfig {
  maxPoints: number;
  hasSubMinimum: boolean;
  subMinimumPercent: number;
  /**
   * If set, this pillar belongs to an elective group: only the highest-scoring
   * members count toward the total. How many count is `electiveGroupSizes[group]`
   * on the SectorConfig (default 1, hence the historical name).
   *
   * Transport QSE puts ALL SEVEN elements in one group of 4 — the sector code is
   * measured on any four of the seven (see TRANSPORT_QSE).
   */
  chooseOneGroup?: string;
  /**
   * Denominator contribution when this pillar is an elected group member, where
   * that differs from `maxPoints`.
   *
   * Transport QSE elements are each weighted 25 for the denominator, but
   * `maxPoints` also carries bonus points (Ownership 28, MC 27, EE 27). Bonuses
   * are earnable but do not enlarge the target — which is exactly how a real
   * certificate reports 102 out of 100.
   */
  basePoints?: number;
  /** Ledger-aligned indicator rows for Super Admin display (Construction uses `indicators` instead). */
  subElements?: PillarSubElement[];
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
  /**
   * Per-band black / black-female targets, split across demographic groups by
   * the effective EAP for the client's province (workbook MC Scorecard model).
   * Optional — when omitted, the calculator falls back to the generic-code
   * defaults (0.60/0.75/0.88 black, 0.30/0.38/0.44 black female).
   */
  seniorBlackTarget?: number;
  seniorBWTarget?: number;
  middleBlackTarget?: number;
  middleBWTarget?: number;
  juniorBlackTarget?: number;
  juniorBWTarget?: number;
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
  /** Transport Large — women equivalents per management band */
  seniorBWMaxPts?: number;
  middleBWMaxPts?: number;
  juniorBWMaxPts?: number;
  semiUnskilledWomenMaxPts?: number;
  eapBonusMaxPts?: number;
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

/**
 * Super Admin Fix Plan §1.1 + §4.1 — Construction-style per-indicator scorecard
 * rows surfaced for sectors whose `targets.*` legacy buckets don't map cleanly
 * (e.g. Construction Sector Code). When present, Super Admin renders these
 * rows directly instead of trying to derive them from `targets.*MaxPts`.
 */
export interface SectorIndicatorRow {
  code: string;
  element: string;
  category: 'main' | 'bonus';
  name: string;
  weight: number;
  target: number | string;
  targetUnit: string;
  calculation: string;
}

export interface SectorConfig {
  sectorCode: string;
  sectorName: string;
  scorecardType: 'Generic' | 'QSE' | 'EME' | 'Contractor' | 'BEP';
  totalMaxPoints: number; // Total points including YES if applicable
  /**
   * How many members of each elective group count toward the score.
   * Absent or unlisted groups mean 1 (the original "choose one" behaviour).
   * Transport QSE: { transport_qse_elective: 4 } — any four of the seven elements.
   */
  electiveGroupSizes?: Record<string, number>;
  /** Optional indicator-level breakdown (Construction sectors). */
  indicators?: SectorIndicatorRow[];
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

/**
 * Transport Sector Large — the LEGACY (2007-framework) level table, same bands
 * as Transport QSE below. The Transport Sector Code was never re-gazetted onto
 * the amended-codes ladder, and real Road Freight Large certificates confirm
 * it: Super Group (TLVT, 2025) scores 93.88 and is certified LEVEL 2 — the
 * previous scaled amended-codes ladder here (L1 from 90/108) would have called
 * that Level 1. Audit 2026-07-26 item 1; gazette GG 32511.
 */
const TRANSPORT_LARGE_LEVELS = [
  { level: 1, minPoints: 100, recognition: 135 },
  { level: 2, minPoints: 85, recognition: 125 },
  { level: 3, minPoints: 75, recognition: 110 },
  { level: 4, minPoints: 65, recognition: 100 },
  { level: 5, minPoints: 55, recognition: 80 },
  { level: 6, minPoints: 45, recognition: 60 },
  { level: 7, minPoints: 40, recognition: 50 },
  { level: 8, minPoints: 30, recognition: 10 },
];

/**
 * Transport Sector QSE — the legacy (2007-framework) level table, on a base of
 * 100 (any four elements × 25).
 *
 * These are NOT the amended-codes thresholds scaled to fit. The Transport Sector
 * Code was never replaced by an aligned 5-element code, so it keeps the legacy
 * bands: Level 1 >= 100, Level 2 85-99.99, Level 3 75-84.99, and so on. The
 * previous table scaled STANDARD_LEVELS (an amended-codes, base-120 scale) by
 * 107/120, which is a different scorecard's ladder applied to this one.
 *
 * Confirmed against certificate 13609: 102 points → Level 1 at 135% recognition.
 *
 * NOTE FOR REVIEW: Okiru's own "Okiru Toolkit (Transport QSE)_Template_v.1.1.xlsx"
 * (Summary Scorecard rows 4-12) lists the AMENDED bands 100/95/90/80/75/70/40
 * for this same scorecard. Both agree that >= 100 is Level 1, so Thandanani is
 * unaffected either way, but they diverge sharply in the middle — an entity on 88
 * is Level 2 here and Level 4 under the template. The template needs the same
 * correction; flagged rather than silently reconciled.
 */
const TRANSPORT_QSE_LEVELS = [
  { level: 1, minPoints: 100, recognition: 135 },
  { level: 2, minPoints: 85, recognition: 125 },
  { level: 3, minPoints: 75, recognition: 110 },
  { level: 4, minPoints: 65, recognition: 100 },
  { level: 5, minPoints: 55, recognition: 80 },
  { level: 6, minPoints: 45, recognition: 60 },
  { level: 7, minPoints: 40, recognition: 50 },
  { level: 8, minPoints: 30, recognition: 10 },
];

/**
 * FSC level thresholds — the GAZETTE formula (GG 41287 §8.2.1):
 *   threshold(level) = generic-points(level) / 109 × sector total
 * with sector totals Banks & Life 120, STI 115, Others 105 (§8.1), and the
 * generic ladder W = 100/95/90/80/75/70/55/40.
 *
 * The previous ladders came from the Excel template's "Scoring Scale" sheet
 * (denominator 111 with a template-derived core), which ran ~1-3.5 points more
 * lenient at Level 1 than the gazette. Audit 2026-07-26 item 10; the gazette
 * formula is unambiguous.
 */
const FSC_GENERIC_LADDER = [100, 95, 90, 80, 75, 70, 55, 40];
const FSC_RECOGNITION = [135, 125, 110, 100, 80, 60, 50, 10];

function fscLevels(sectorTotal: number) {
  return FSC_GENERIC_LADDER.map((points, i) => ({
    level: i + 1,
    minPoints: Math.round((points / 109) * sectorTotal * 100) / 100,
    recognition: FSC_RECOGNITION[i],
  }));
}

const FSC_LEVELS_OTHERS = fscLevels(105);     // L1 = 96.33
const FSC_LEVELS_BANKS_LTI = fscLevels(120);  // L1 = 110.09
const FSC_LEVELS_STI = fscLevels(115);        // L1 = 105.50

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
      // Super Admin Fix Plan §3.3 R1 — RCOGP Ownership has a designated-group /
      // ownership-schemes 3 pt indicator at 3% target (Ground Truth §3.1).
      // Previously this row was missing, leaving the expanded view at 22 pts
      // while the pillar header reported 25.
      votingRightsTarget: 0.25, votingRightsMaxPts: 4,
      womenVotingTarget: 0.10, womenVotingMaxPts: 2,
      economicInterestTarget: 0.25, economicInterestMaxPts: 4,
      womenEITarget: 0.10, womenEIMaxPts: 2,
      economicInterestDesignatedGroupTarget: 0.03, economicInterestDesignatedGroupMaxPts: 3,
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
      // Per-band black / black-female targets (workbook MC Scorecard E30/E37/E43/E50/E56/E63).
      seniorBlackTarget: 0.60, seniorBWTarget: 0.30,
      middleBlackTarget: 0.75, middleBWTarget: 0.38,
      juniorBlackTarget: 0.88, juniorBWTarget: 0.44,
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
      absorptionTargetPercent: 100,  // Statement 300 / AICT300: 100% of unemployed LAI absorbed (audit item 2; was 2.5 = x40 over-award)
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
  // Verified from Excel Summary Scorecard: 25+23+25+27+10+18+12 = 140 (YES excluded)
  // ICT uses different level scale: L1=120, L2=115, L3=110, L4=100, L5=95, L6=90, L7=75, L8=55
  totalMaxPoints: 140,
  pillarConfigs: {
    // Ownership: 4+2+4+2+3+2+8 = 25 (same structure as RCOGP)
    ownership: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    // MC+EE combined at 23 pts; no separate EE pillar
    managementControl: { maxPoints: 23, hasSubMinimum: false, subMinimumPercent: 0 },
    employmentEquity: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 },
    // Skills: 8+4+4+4+5 = 25 (6% all-spend, no bursary, 2×headcount, absorption bonus)
    skillsDevelopment: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    // PP: 5+3+4+9+4 = 25 base + 2 DG bonus = 27
    preferentialProcurement: { maxPoints: 27, hasSubMinimum: true, subMinimumPercent: 40 },
    // SD: 2% NPAT / 10 pts
    supplierDevelopment: { maxPoints: 10, hasSubMinimum: true, subMinimumPercent: 40 },
    // ED: 15 base (3% NPAT) + 1 graduation + 2 jobs≥11% = 18 max
    enterpriseDevelopment: { maxPoints: 18, hasSubMinimum: false, subMinimumPercent: 0 },
    // SED: 1.5% NPAT / 12 pts (ICT Specific Initiatives)
    socioEconomicDevelopment: { maxPoints: 12, hasSubMinimum: false, subMinimumPercent: 0 },
    yesInitiative: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 },
  },
  targets: {
    ownership: {
      // ICT gazette AICT101 (GG 40407): the ICT sector code sets a 30% black
      // ownership target for voting rights and economic interest — NOT the
      // generic 25%+1. The Excel summary carried the generic figure; the
      // gazette is unambiguous and ICT_QSE below already uses 0.30.
      // (Audit 2026-07-26 item 3.)
      votingRightsTarget: 0.30, votingRightsMaxPts: 4,
      womenVotingTarget: 0.10, womenVotingMaxPts: 2,
      economicInterestTarget: 0.30, economicInterestMaxPts: 4,
      womenEITarget: 0.10, womenEIMaxPts: 2,
      netValueMaxPts: 8,
      newEntrantsMaxPts: 2,
      economicInterestDesignatedGroupTarget: 0.03,
      economicInterestDesignatedGroupMaxPts: 3,
    },
    managementControl: {
      // Verified from MC Scorecard rows: board 3+2, exec 2+1, other exec 3+2 = 13 director pts
      // Senior 2+1, middle 2+1, junior 1+1, disabled 2 = 10 EE pts; total 23
      boardBlackTarget: 0.50, boardBlackMaxPts: 3,
      boardBWTarget: 0.25, boardBWMaxPts: 2,
      execBlackTarget: 0.50, execBlackMaxPts: 2,
      execBWTarget: 0.25, execBWMaxPts: 1,
      otherExecBlackTarget: 0.60, otherExecBlackMaxPts: 3,
      otherExecBWTarget: 0.30, otherExecBWMaxPts: 2,
      // Senior/middle/junior bands are included in the combined MC+EE 23-pt total
      seniorMaxPts: 2, seniorBWMaxPts: 1,
      middleMaxPts: 2, middleBWMaxPts: 1,
      juniorMaxPts: 1, juniorBWMaxPts: 1,
      // Per-band Black / Black-female targets, split across the provincial EAP
      // (workbook MC Scorecard E30/E37/E43/E50/E56/E63). Required: without them the
      // calculator's mgmtFallback returns undefined for ICT (useRcogp=false) and the
      // 8 senior/middle/junior band points silently score 0. (R6 / matches AGRI D-01)
      seniorBlackTarget: 0.60, seniorBWTarget: 0.30,
      middleBlackTarget: 0.75, middleBWTarget: 0.38,
      juniorBlackTarget: 0.88, juniorBWTarget: 0.44,
    },
    employmentEquity: {
      // All MC+EE merged into the MC pillar; disabled scored within MC
      seniorMaxPts: 0, middleMaxPts: 0, juniorMaxPts: 0,
      disabledMaxPts: 2, disabledTarget: 0.02,
    },
    skills: {
      // 2.1.1.1 All-spend Black: 6% leviable = 8 pts
      // 2.1.1.2 Disabled Black: 0.3% leviable = 4 pts
      // 2.1.2.1 LAI Black (employed + unemployed): 2.5% headcount = 4 pts → learnershipsMaxPts
      // 2.1.2.2 Unemployed Black in LAI: 2.5% headcount = 4 pts → bursary slot (bursaryIsHeadcount)
      // 2.1.3 Absorption bonus = 5 pts
      // Total: 8+4+4+4+5 = 25
      // Previously 2.1.2.1 and 2.1.2.2 were folded into learnershipsMaxPts=8, which let an
      // employed-only LAI workforce score the full 8 instead of 4. (DISCREPANCY-LEDGER D-02)
      learningProgrammesMaxPts: 8,
      bursaryMaxPts: 4,        // 2.1.2.2 unemployed-LAI headcount (headcount-based)
      disabledLearningMaxPts: 4,
      learnershipsMaxPts: 4,   // 2.1.2.1 all-LAI headcount @ 2.5%
      absorptionMaxPts: 5,
      overallSpendPercent: 6.0,
      bursarySpendPercent: 2.5, // 2.1.2.2 unemployed-LAI headcount target
      disabledSpendPercent: 0.3,
      learnershipTargetPercent: 2.5,
      absorptionTargetPercent: 100,  // Statement 300 / AICT300: 100% of unemployed LAI absorbed (audit item 2; was 2.5 = x40 over-award)
    },
    procurement: {
      // Verified from Procurement Scorecard: total 27 (25 base + 2 DG bonus)
      allSuppliersTarget: 0.80, allSuppliersMaxPts: 5,
      qseTarget: 0.15, qseMaxPts: 3,
      emeTarget: 0.15, emeMaxPts: 4,
      // ICT CRITICAL: BO51 target is 40% (not 50% as in RCOGP)
      bo51Target: 0.40, bo51MaxPts: 9,
      bwo30Target: 0.12, bwo30MaxPts: 4,
      dgTarget: 0.02, dgMaxPts: 2,
    },
    esd: {
      // SD: 2% NPAT = 10 pts (same as RCOGP)
      // ED: 3% NPAT base = 15 pts; bonuses: graduation +1, jobs≥11% +2 (or jobs≤10% +1)
      // edJobsBonus = 2 enables the ICT ≥11%-of-workforce upper tier (TOOLKIT-RESOLVED.md S6),
      // so the full ED pillar reaches 15 + 1 + 2 = 18.
      sdPercent: 2.0, sdMaxPts: 10,
      edPercent: 3.0, edMaxPts: 15,
      edGraduationBonus: 1, edJobsBonus: 2,
    },
    // SED: 1.5% NPAT = 12 pts (ICT Specific Initiatives)
    sed: { spendPercent: 1.5, maxPts: 12 },
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
  totalMaxPoints: 119, // FSC Others: 25+20+23+24+10+9+8 = 119 (MC 20 per FS200 — audit item 9)
  pillarConfigs: {
    ownership: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    managementControl: { maxPoints: 20, hasSubMinimum: false, subMinimumPercent: 0 }, // MC+EE combined (Others: 2+1+2+1+10+4+1=21)
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
      // FS200: board black voting = 1 point, not 2 (audit 2026-07-26 item 9).
      boardBlackTarget: 0.50, boardBlackMaxPts: 1,  // board: 2 pts black
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
      // FSC Others skills structure — per-management-level approach (not RCOGP single-rate).
      // Excel indicator breakdown: Senior+Exec(2)+Middle(2)+Junior(3)+Non-mgmt(4) = 11;
      // Unemployed(4) + Disabled(1) = 5; LAI headcount(4); Absorption bonus(3). Total = 23.
      // learningProgrammesMaxPts maps to managed-level spend sub-total (11 pts).
      // bursaryMaxPts maps to unemployed Black spend (4 pts, 1.5% leviable).
      learningProgrammesMaxPts: 11,   // Senior+Exec(2)+Middle(2)+Junior(3)+Non-mgmt(4) = 11
      bursaryMaxPts: 4,               // Unemployed Black people (2.5: 1.5% leviable)
      disabledLearningMaxPts: 1,      // Black disabled (2.6: 0.3% leviable) — 1 pt not 3
      learnershipsMaxPts: 4,          // LAI headcount (2.7: 5% of headcount) — 4 pts not 6
      absorptionMaxPts: 3,            // Absorption bonus (2.8: 100%) — 3 pts not 5
      overallSpendPercent: 3.5,       // Approximation only; FSC uses per-level rates
      bursarySpendPercent: 1.5,       // Unemployed spend target = 1.5% of leviable
      disabledSpendPercent: 0.3,      // Disabled spend target = 0.3% of leviable
      learnershipTargetPercent: 5.0,  // LAI = 5% of total headcount
      absorptionTargetPercent: 100,   // 100% of unemployed LAI (skills.ts single /100 → 1.0). R7: was 1.0 + a 2nd /100 in the mapper = 0.01% effective
    },
    procurement: {
      // FSC Others PP — verified from Excel procurement scorecard.
      // Base rows: 5+3+2+7+3 = 20 pts; bonus capped at 4 pts → total 24 pts.
      // Note: 3 bonus row types (intermediated 2pts, stockbrokers 2pts, DG 2pts = 6 pts raw)
      // but scorecard Total = 24 (base 20 + 4 bonus cap). dgMaxPts represents combined bonus.
      allSuppliersTarget: 0.80, allSuppliersMaxPts: 5,  // 80% of TMPS from L1–L8
      qseTarget: 0.18, qseMaxPts: 3,                    // 18% QSE (FSC: 18%, not RCOGP 15%)
      emeTarget: 0.12, emeMaxPts: 2,                    // 12% EME (FSC: 12%, not RCOGP 15%)
      bo51Target: 0.30, bo51MaxPts: 7,                  // 30% ≥51% black owned (FSC: 30%, not RCOGP 50%)
      bwo30Target: 0.10, bwo30MaxPts: 3,                // 10% ≥30% BWO (FSC: 10%, not RCOGP 12%)
      dgTarget: 0.02, dgMaxPts: 4,                      // Combined bonus rows (intermediated+stockbrokers+DG) capped at 4 pts
    },
    esd: { sdPercent: 2.0, sdMaxPts: 10, edPercent: 1.0, edMaxPts: 5, edGraduationBonus: 1, edJobsBonus: 3 },
    sed: { spendPercent: 1.0, maxPts: 8 }, // SED+CE combined for Others sub-sector
  },
  levelThresholds: FSC_LEVELS_OTHERS,
  recognitionTable: STANDARD_RECOGNITION_TABLE,
  benefitFactors: STANDARD_BENEFIT_FACTORS,
  categoryWeightings: STANDARD_CATEGORY_WEIGHTINGS,
  industryNorms: STANDARD_INDUSTRY_NORMS,
};
// FSC Generic verified: 25+21+23+24+10+9+8 = 120 (Others sub-sector) ✓
// MC breakdown (Section 5): board 2+1, exec 2+1, other exec 10+4, disabled 1 = 21 ✓
// Skills breakdown: Senior(2)+Middle(2)+Junior(3)+Non-mgmt(4)+Unemployed(4)+Disabled(1)+LAI(4)+Absorption(3) = 23 ✓
// PP targets (FSC-specific): QSE 18%, EME 12%, BO51 30%, BWO30 10%
// FSC uses scaled level thresholds: L1=95.5, L2=90.7, ... L8=38.2
// FSC has sub-variants: Banks (FS701), Long-Term Insurers (FS702), Short-Term Insurers (FS703), Others (Generic)

// ---------------------------------------------------------------------------
// FSC Banks (FS701) — Empowerment Financing + AFS: Banks
// Grand total: 130 pts (25+21+23+24+10+7+12+8)
//   SD target: 1.8% NPAT (not 2%); ED target: 0.2% NPAT (not 1%)
//   No stockbroker bonus (not on Banks EF&ESD sheet)
//   EF Targeted Investments + Transaction Financing = 0 pts (Q44: blank in template)
//   AFS Banks = 12 pts (6 geographic/access indicators)
// ---------------------------------------------------------------------------

export const FSC_BANKS: SectorConfig = {
  sectorCode: 'FSC',
  sectorName: 'Financial Sector Code (Banks — FS701)',
  scorecardType: 'Generic',
  // Banks gazette shapes: 23+20+23+19+7(SD)+5(ED)+15(EF)+12(AFS)+8 = 132 (audit items 7-9)
  totalMaxPoints: 132,
  pillarConfigs: {
    ownership: { maxPoints: 23, hasSubMinimum: true, subMinimumPercent: 40 },
    managementControl: { maxPoints: 20, hasSubMinimum: false, subMinimumPercent: 0 },
    employmentEquity: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 },
    skillsDevelopment: { maxPoints: 23, hasSubMinimum: true, subMinimumPercent: 40 },
    preferentialProcurement: { maxPoints: 19, hasSubMinimum: true, subMinimumPercent: 40 },
    // Banks SD row on the EF & ESD scorecard = 7 pts (C17 =IF(D7="Banks",7,0),
    // FSC_Generic.md L15913) — the previous 10 was the Others ESD-scorecard value.
    supplierDevelopment: { maxPoints: 7, hasSubMinimum: true, subMinimumPercent: 40 },
    // Banks ED: 3 base (C19, L15923) + 1 grad + 1 jobs = 5 (no stockbroker row on Banks EF sheet)
    enterpriseDevelopment: { maxPoints: 5, hasSubMinimum: false, subMinimumPercent: 0 },
    socioEconomicDevelopment: { maxPoints: 8, hasSubMinimum: false, subMinimumPercent: 0 },
    yesInitiative: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 },
    // EF-proper: Targeted Investments 12 (C14 =IF(D7="Banks",12,0), L15893) +
    // Transaction Financing 3 (C15, L15903) = 15. The old 0 was a formula
    // artifact of the template's default "Others" sub-sector (Q44 resolved —
    // FSC-FULL-ANALYSIS.md §5.6; SD/ED/bonuses stay in the ESD pillar).
    empowermentFinancing: { maxPoints: 15, hasSubMinimum: false, subMinimumPercent: 0 },
    // AFS Banks = 12 pts (verified from AFS Scorecard - Banks sheet)
    accessToFinancialServices: { maxPoints: 12, hasSubMinimum: false, subMinimumPercent: 0 },
  },
  targets: {
    ownership: {
      // FSC gazette FS100 Table 2a (GG 41287 pp.203-204): Banks/LTI/STI
      // ownership is 23 points — EI 3 (not 4), New Entrants 3 (not 2), Net
      // Value 6 (not 8), plus the DG/ESOP/BBOS/co-op 3@3% line the generic
      // shape carries. Sub-minimum = 40% of the SIX net-value points.
      // (Audit 2026-07-26 item 7.)
      votingRightsTarget: 0.25, votingRightsMaxPts: 4,
      womenVotingTarget: 0.10, womenVotingMaxPts: 2,
      economicInterestTarget: 0.25, economicInterestMaxPts: 3,
      womenEITarget: 0.10, womenEIMaxPts: 2,
      economicInterestDesignatedGroupTarget: 0.03, economicInterestDesignatedGroupMaxPts: 3,
      netValueMaxPts: 6, newEntrantsMaxPts: 3,
    },
    managementControl: {
      // FS200: board black voting = 1 point, not 2 (audit 2026-07-26 item 9).
      boardBlackTarget: 0.50, boardBlackMaxPts: 1,
      boardBWTarget: 0.25, boardBWMaxPts: 1,
      execBlackTarget: 0.50, execBlackMaxPts: 2,
      execBWTarget: 0.25, execBWMaxPts: 1,
      otherExecBlackTarget: 0.75, otherExecBlackMaxPts: 10,
      otherExecBWTarget: 0.38, otherExecBWMaxPts: 4,
      seniorMaxPts: 0, seniorBWMaxPts: 0,
      middleMaxPts: 0, middleBWMaxPts: 0,
      juniorMaxPts: 0, juniorBWMaxPts: 0,
    },
    employmentEquity: {
      seniorMaxPts: 0, middleMaxPts: 0, juniorMaxPts: 0,
      disabledMaxPts: 1, disabledTarget: 0.02,
    },
    skills: {
      learningProgrammesMaxPts: 11,
      bursaryMaxPts: 4,
      disabledLearningMaxPts: 1,
      learnershipsMaxPts: 4,
      absorptionMaxPts: 3,
      overallSpendPercent: 3.5,
      bursarySpendPercent: 1.5,
      disabledSpendPercent: 0.3,
      learnershipTargetPercent: 5.0,
      absorptionTargetPercent: 100,  // R7: 100% of unemployed LAI (was 1.0 + 2nd /100 in mapper)
    },
    procurement: {
      // FSC gazette pp.245-246: the Banks/LTI PP rows are 4/2/2/5/2 = 15
      // base (the 5/3/2/7/3 = 20 shape belongs to Others). +4 bonus stays.
      // (Audit 2026-07-26 item 8.)
      allSuppliersTarget: 0.80, allSuppliersMaxPts: 4,
      qseTarget: 0.18, qseMaxPts: 2,
      emeTarget: 0.12, emeMaxPts: 2,
      bo51Target: 0.30, bo51MaxPts: 5,
      bwo30Target: 0.10, bwo30MaxPts: 2,
      dgTarget: 0.02, dgMaxPts: 4,
    },
    // Banks SD: 1.8% NPAT @ 7 pts; ED: 0.2% NPAT @ 3 pts base (EF & ESD Scorecard -
    // Banks C17/C19 — the old 10/5 were the Others ESD-scorecard maxima); no stockbroker bonus
    esd: { sdPercent: 1.8, sdMaxPts: 7, edPercent: 0.2, edMaxPts: 3, edGraduationBonus: 1, edJobsBonus: 1 },
    sed: { spendPercent: 1.0, maxPts: 8 },
  },
  levelThresholds: FSC_LEVELS_BANKS_LTI,
  recognitionTable: STANDARD_RECOGNITION_TABLE,
  benefitFactors: STANDARD_BENEFIT_FACTORS,
  categoryWeightings: STANDARD_CATEGORY_WEIGHTINGS,
  industryNorms: STANDARD_INDUSTRY_NORMS,
};
// FSC Banks verified vs template: 25+21+23+24+7+5+15(EF)+12+8 = 140 incl bonuses.
// Template core F12 = 121 (own 23 + MC 21 + skills 20 + PP 15 + EF 15 + SD 7 + ED 3
// + SED&CE 5 + AFS 12); C104 incl bonus = 138. Remaining app-vs-template pillar
// deltas (own 25 vs 23+5bonus, PP 24 vs 15+4bonus, skills 23 vs 20+3bonus) are
// pre-existing and tracked separately — SD/ED/EF now match the template exactly.
// SD target 1.8%, ED target 0.2%; no stockbroker bonus (not on Banks EF&ESD sheet)
// AFS: Transaction Point(5km,1pt) + Service Point(10km,1pt) + Sales Point(15km,2pts)
//      + Electronic Access(2pts) + Point of Presence(3pts) + Active Accounts(3pts) = 12 ✓

// ---------------------------------------------------------------------------
// FSC Long-Term Insurers (FS702) — Empowerment Financing + AFS: Long Term
// Grand total: 132 pts (25+21+23+24+10+9+12+8)
//   SD target: 1.8% NPAT; ED target: 0.2% NPAT + stockbroker support (0.5% / 2 pts)
//   EF Targeted Investments + Transaction Financing = 0 pts (Q44)
//   AFS LTI = 12 pts (Appropriate Products 3 + Market Penetration 7 + Transactional Access 2)
// ---------------------------------------------------------------------------

export const FSC_LTI: SectorConfig = {
  sectorCode: 'FSC',
  sectorName: 'Financial Sector Code (Long-Term Insurers — FS702)',
  scorecardType: 'Generic',
  // 25+21+23+24+7(SD)+7(ED with stockbroker)+15(EF)+12(AFS)+8 = 142
  totalMaxPoints: 134, // LTI: 23+20+23+19+7+7+15(EF)+12(AFS)+8 = 134 (gazette shapes — audit items 7-9)
  pillarConfigs: {
    ownership: { maxPoints: 23, hasSubMinimum: true, subMinimumPercent: 40 },
    managementControl: { maxPoints: 20, hasSubMinimum: false, subMinimumPercent: 0 },
    employmentEquity: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 },
    skillsDevelopment: { maxPoints: 23, hasSubMinimum: true, subMinimumPercent: 40 },
    preferentialProcurement: { maxPoints: 19, hasSubMinimum: true, subMinimumPercent: 40 },
    // LTI SD row on the EF & ESD scorecard = 7 pts (C16 =IF(LTI,7,0),
    // FSC_Generic.md L16040) — the previous 10 was the Others ESD-scorecard value.
    supplierDevelopment: { maxPoints: 7, hasSubMinimum: true, subMinimumPercent: 40 },
    // LTI ED: 3 base (C18, L16050) + 1 grad + 1 jobs + 2 stockbroker (C22, L16078) = 7
    enterpriseDevelopment: { maxPoints: 7, hasSubMinimum: false, subMinimumPercent: 0 },
    socioEconomicDevelopment: { maxPoints: 8, hasSubMinimum: false, subMinimumPercent: 0 },
    yesInitiative: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 },
    // EF-proper: Targeted Investments 12 (C13 =IF(LTI,12,0), L16020) +
    // Transaction Financing 3 (C14, L16030) = 15 (Q44 resolved — the old 0 was
    // the template's default-"Others" formula artifact).
    empowermentFinancing: { maxPoints: 15, hasSubMinimum: false, subMinimumPercent: 0 },
    accessToFinancialServices: { maxPoints: 12, hasSubMinimum: false, subMinimumPercent: 0 },
  },
  targets: {
    ownership: {
      // FSC gazette FS100 Table 2a (GG 41287 pp.203-204): Banks/LTI/STI
      // ownership is 23 points — EI 3 (not 4), New Entrants 3 (not 2), Net
      // Value 6 (not 8), plus the DG/ESOP/BBOS/co-op 3@3% line the generic
      // shape carries. Sub-minimum = 40% of the SIX net-value points.
      // (Audit 2026-07-26 item 7.)
      votingRightsTarget: 0.25, votingRightsMaxPts: 4,
      womenVotingTarget: 0.10, womenVotingMaxPts: 2,
      economicInterestTarget: 0.25, economicInterestMaxPts: 3,
      womenEITarget: 0.10, womenEIMaxPts: 2,
      economicInterestDesignatedGroupTarget: 0.03, economicInterestDesignatedGroupMaxPts: 3,
      netValueMaxPts: 6, newEntrantsMaxPts: 3,
    },
    managementControl: {
      // FS200: board black voting = 1 point, not 2 (audit 2026-07-26 item 9).
      boardBlackTarget: 0.50, boardBlackMaxPts: 1,
      boardBWTarget: 0.25, boardBWMaxPts: 1,
      execBlackTarget: 0.50, execBlackMaxPts: 2,
      execBWTarget: 0.25, execBWMaxPts: 1,
      otherExecBlackTarget: 0.75, otherExecBlackMaxPts: 10,
      otherExecBWTarget: 0.38, otherExecBWMaxPts: 4,
      seniorMaxPts: 0, seniorBWMaxPts: 0,
      middleMaxPts: 0, middleBWMaxPts: 0,
      juniorMaxPts: 0, juniorBWMaxPts: 0,
    },
    employmentEquity: {
      seniorMaxPts: 0, middleMaxPts: 0, juniorMaxPts: 0,
      disabledMaxPts: 1, disabledTarget: 0.02,
    },
    skills: {
      learningProgrammesMaxPts: 11,
      bursaryMaxPts: 4,
      disabledLearningMaxPts: 1,
      learnershipsMaxPts: 4,
      absorptionMaxPts: 3,
      overallSpendPercent: 3.5,
      bursarySpendPercent: 1.5,
      disabledSpendPercent: 0.3,
      learnershipTargetPercent: 5.0,
      absorptionTargetPercent: 100,  // R7: 100% of unemployed LAI (was 1.0 + 2nd /100 in mapper)
    },
    procurement: {
      // FSC gazette pp.245-246: the Banks/LTI PP rows are 4/2/2/5/2 = 15
      // base (the 5/3/2/7/3 = 20 shape belongs to Others). +4 bonus stays.
      // (Audit 2026-07-26 item 8.)
      allSuppliersTarget: 0.80, allSuppliersMaxPts: 4,
      qseTarget: 0.18, qseMaxPts: 2,
      emeTarget: 0.12, emeMaxPts: 2,
      bo51Target: 0.30, bo51MaxPts: 5,
      bwo30Target: 0.10, bwo30MaxPts: 2,
      dgTarget: 0.02, dgMaxPts: 4,
    },
    // LTI SD: 1.8% NPAT @ 7 pts; ED: 0.2% NPAT @ 3 pts base (EF & ESD Scorecard -
    // Long Term C16/C18); stockbroker bonus 0.5% NPAT / 2 pts (C22, on EF sheet)
    esd: { sdPercent: 1.8, sdMaxPts: 7, edPercent: 0.2, edMaxPts: 3, edGraduationBonus: 1, edJobsBonus: 3 },
    sed: { spendPercent: 1.0, maxPts: 8 },
  },
  levelThresholds: FSC_LEVELS_BANKS_LTI,
  recognitionTable: STANDARD_RECOGNITION_TABLE,
  benefitFactors: STANDARD_BENEFIT_FACTORS,
  categoryWeightings: STANDARD_CATEGORY_WEIGHTINGS,
  industryNorms: STANDARD_INDUSTRY_NORMS,
};
// FSC LTI verified vs template: 25+21+23+24+7+7+15(EF)+12+8 = 142 incl bonuses.
// Template core F12 = 121; C104 incl bonus = 140 (Q44 resolved — EF was a
// default-"Others" formula artifact). Remaining app-vs-template pillar deltas
// (own/PP/skills bonus framing) are pre-existing and tracked separately.
// SD target 1.8%, ED target 0.2%, stockbroker bonus 0.5%/2pts included
// AFS: Appropriate Products(3pts) + Market Penetration(7pts) + Transactional Access(80%/2pts) = 12 ✓

// ---------------------------------------------------------------------------
// FSC Short-Term Insurers (FS703) — AFS: Short Term only (no EF)
// Grand total: 132 pts (25+21+23+24+10+9+12+8)
//   Standard SD/ED targets (same as Others: SD 2%, ED 1%, stockbroker 0.5%)
//   No EF pillar (STI: EF = N/A per SLS §2)
//   AFS STI = 12 pts (Commercial Products 2 + Insurance Policies 10)
// ---------------------------------------------------------------------------

export const FSC_STI: SectorConfig = {
  sectorCode: 'FSC',
  sectorName: 'Financial Sector Code (Short-Term Insurers — FS703)',
  scorecardType: 'Generic',
  // 25+21+23+24+10+9+12+8 = 132 (same as LTI, EF=N/A for STI)
  totalMaxPoints: 129, // STI: 23+20+... (own 23 + MC 20 per gazette — audit items 7,9)
  pillarConfigs: {
    ownership: { maxPoints: 23, hasSubMinimum: true, subMinimumPercent: 40 },
    managementControl: { maxPoints: 20, hasSubMinimum: false, subMinimumPercent: 0 },
    employmentEquity: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 },
    skillsDevelopment: { maxPoints: 23, hasSubMinimum: true, subMinimumPercent: 40 },
    preferentialProcurement: { maxPoints: 24, hasSubMinimum: true, subMinimumPercent: 40 },
    supplierDevelopment: { maxPoints: 10, hasSubMinimum: true, subMinimumPercent: 40 },
    enterpriseDevelopment: { maxPoints: 9, hasSubMinimum: false, subMinimumPercent: 0 },
    socioEconomicDevelopment: { maxPoints: 8, hasSubMinimum: false, subMinimumPercent: 0 },
    yesInitiative: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 },
    // No EF for STI (N/A per SLS §2)
    accessToFinancialServices: { maxPoints: 12, hasSubMinimum: false, subMinimumPercent: 0 },
  },
  targets: {
    ownership: {
      // FSC gazette FS100 Table 2a (GG 41287 pp.203-204): Banks/LTI/STI
      // ownership is 23 points — EI 3 (not 4), New Entrants 3 (not 2), Net
      // Value 6 (not 8), plus the DG/ESOP/BBOS/co-op 3@3% line the generic
      // shape carries. Sub-minimum = 40% of the SIX net-value points.
      // (Audit 2026-07-26 item 7.)
      votingRightsTarget: 0.25, votingRightsMaxPts: 4,
      womenVotingTarget: 0.10, womenVotingMaxPts: 2,
      economicInterestTarget: 0.25, economicInterestMaxPts: 3,
      womenEITarget: 0.10, womenEIMaxPts: 2,
      economicInterestDesignatedGroupTarget: 0.03, economicInterestDesignatedGroupMaxPts: 3,
      netValueMaxPts: 6, newEntrantsMaxPts: 3,
    },
    managementControl: {
      // FS200: board black voting = 1 point, not 2 (audit 2026-07-26 item 9).
      boardBlackTarget: 0.50, boardBlackMaxPts: 1,
      boardBWTarget: 0.25, boardBWMaxPts: 1,
      execBlackTarget: 0.50, execBlackMaxPts: 2,
      execBWTarget: 0.25, execBWMaxPts: 1,
      otherExecBlackTarget: 0.75, otherExecBlackMaxPts: 10,
      otherExecBWTarget: 0.38, otherExecBWMaxPts: 4,
      seniorMaxPts: 0, seniorBWMaxPts: 0,
      middleMaxPts: 0, middleBWMaxPts: 0,
      juniorMaxPts: 0, juniorBWMaxPts: 0,
    },
    employmentEquity: {
      seniorMaxPts: 0, middleMaxPts: 0, juniorMaxPts: 0,
      disabledMaxPts: 1, disabledTarget: 0.02,
    },
    skills: {
      learningProgrammesMaxPts: 11,
      bursaryMaxPts: 4,
      disabledLearningMaxPts: 1,
      learnershipsMaxPts: 4,
      absorptionMaxPts: 3,
      overallSpendPercent: 3.5,
      bursarySpendPercent: 1.5,
      disabledSpendPercent: 0.3,
      learnershipTargetPercent: 5.0,
      absorptionTargetPercent: 100,  // R7: 100% of unemployed LAI (was 1.0 + 2nd /100 in mapper)
    },
    procurement: {
      allSuppliersTarget: 0.80, allSuppliersMaxPts: 5,
      qseTarget: 0.18, qseMaxPts: 3,
      emeTarget: 0.12, emeMaxPts: 2,
      bo51Target: 0.30, bo51MaxPts: 7,
      bwo30Target: 0.10, bwo30MaxPts: 3,
      dgTarget: 0.02, dgMaxPts: 4,
    },
    // STI: standard SD/ED (same targets as Others — 2% and 1%)
    esd: { sdPercent: 2.0, sdMaxPts: 10, edPercent: 1.0, edMaxPts: 5, edGraduationBonus: 1, edJobsBonus: 3 },
    sed: { spendPercent: 1.0, maxPts: 8 },
  },
  levelThresholds: FSC_LEVELS_STI,
  recognitionTable: STANDARD_RECOGNITION_TABLE,
  benefitFactors: STANDARD_BENEFIT_FACTORS,
  categoryWeightings: STANDARD_CATEGORY_WEIGHTINGS,
  industryNorms: STANDARD_INDUSTRY_NORMS,
};
// FSC STI verified: 25+21+23+24+10+9+12+8 = 132 (STI sub-sector) ✓
// Standard SD 2%/10pts and ED 1%/5pts+bonuses (same as Generic Others)
// No EF pillar for STI
// AFS: Commercial Products (2pts) + Insurance Policies (100%/10pts) = 12 ✓

// ---------------------------------------------------------------------------
// AGRI Generic (AgriBEE Sector Code — Amended AgriBEE Sector Codes: Generic)
// VERIFIED AGAINST: BBBEE Toolkit (Agri Generic)_Master_v.1.0.1.xlsx
// Grand Total: 132 (25+23+25+27+10+7+15 = 132)
// MC: 23 combined (Exco 13 + EE bands 10 — board 3+2, exec 2+1, other-exec 3+2,
//     senior 2+1, middle 2+1, junior 1+1, disabled 2)
// PP: 27 (allSuppliers 5@80%, QSE 3@15%, EME 4@15%, BO51 9@40%, BWO30 4@12%,
//          DG bonus 2@2%)
// Skills: 25 (general 8@6%, disabled 4@0.3%, LAI 4@2.5%, unemployedTraining 4@2.5%,
//              absorption 5@100%)
// ESD: SD 10@2%, ED 5@1.5%, grad bonus 1, jobs bonus 1
// SED: 15@1.5% — Agriculture-specific "Socioeconomic Development Contributions"
// Ownership: voting-Black 4@25%, voting-BW 2@10%, EI-Black 4@25%, EI-BW 2@10%,
//             designated-groups (incl. farm workers, ESOP, BBOS, co-ops) 3@4%,
//             new-entrants 2@2%, net-value 8@100%
// ---------------------------------------------------------------------------

export const AGRI_GENERIC: SectorConfig = {
  sectorCode: 'AGRI',
  sectorName: 'AgriBEE Sector Code (Generic)',
  scorecardType: 'Generic',
  totalMaxPoints: 128, // AgriBEE gazette: 25+19+25+27+10+7+15 = 128 (MC 19 per GG 41306 — audit item 11)
  pillarConfigs: {
    ownership: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    managementControl: { maxPoints: 19, hasSubMinimum: false, subMinimumPercent: 0 }, // MC+EE combined, 19 pts (GG 41306 — audit item 11)
    employmentEquity: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 }, // EE folded into MC
    skillsDevelopment: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    preferentialProcurement: { maxPoints: 27, hasSubMinimum: true, subMinimumPercent: 40 },
    supplierDevelopment: { maxPoints: 10, hasSubMinimum: true, subMinimumPercent: 40 },
    enterpriseDevelopment: { maxPoints: 7, hasSubMinimum: false, subMinimumPercent: 0 }, // 5 base + 1 grad + 1 jobs
    socioEconomicDevelopment: { maxPoints: 15, hasSubMinimum: false, subMinimumPercent: 0 }, // Agriculture-specific SED
    yesInitiative: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 }, // Level boost only
  },
  targets: {
    ownership: {
      // AGRI Ownership: verified against Ownership Scorecard rows 5–17
      // Voting Black: 4pts @ 25%+1 vote; Voting BW: 2pts @ 10%
      // EI Black: 4pts @ 25%; EI BW: 2pts @ 10%
      // Designated Groups (1. Black DG, 2. ESOP participants, 3. BBOS, 4. Co-ops, 5. Farm workers):
      //   3pts @ 4% — agriculture-specific inclusion of farm workers
      // New Entrants: 2pts @ 2%; Net Value: 8pts @ 100%
      votingRightsTarget: 0.25, votingRightsMaxPts: 4,
      womenVotingTarget: 0.10, womenVotingMaxPts: 2,
      economicInterestTarget: 0.25, economicInterestMaxPts: 4,
      womenEITarget: 0.10, womenEIMaxPts: 2,
      economicInterestDesignatedGroupTarget: 0.04, economicInterestDesignatedGroupMaxPts: 3,
      netValueMaxPts: 8, newEntrantsMaxPts: 2,
    },
    managementControl: {
      // AGRI MC: AgriBEE gazette (GG 41306) Statement — 19-pt combined total.
      // Exco sub-total: 9 — Board Black 2@50%, Board BW 1@25%, Exec Black 2@50%,
      //   Exec BW 1@25%, Other Exec Black 2@60%, Other Exec BW 1@30%.
      // The Agri Excel template carried 3+2 / 3+2 (= 23 total, +4 phantom
      // points) — the gazette is unambiguous. (Audit 2026-07-26 item 11.)
      // EE bands sub-total: 10 — Senior Black 2@60%, Senior BW 1@30%,
      //   Middle Black 2@75%, Middle BW 1@38%, Junior Black 1@88%, Junior BW 1@44%,
      //   Disabled 2@2%
      boardBlackTarget: 0.50, boardBlackMaxPts: 2,
      boardBWTarget: 0.25, boardBWMaxPts: 1,
      execBlackTarget: 0.50, execBlackMaxPts: 2,
      execBWTarget: 0.25, execBWMaxPts: 1,   // 25% (NOT 30% — exec directors only)
      otherExecBlackTarget: 0.60, otherExecBlackMaxPts: 2,
      otherExecBWTarget: 0.30, otherExecBWMaxPts: 1,
      seniorMaxPts: 2, seniorBWMaxPts: 1,    // EAP-based (60%/30%)
      middleMaxPts: 2, middleBWMaxPts: 1,    // EAP-based (75%/38%)
      juniorMaxPts: 1, juniorBWMaxPts: 1,    // EAP-based (88%/44%)
      // Per-band Black / Black-female targets, split across the provincial EAP
      // (workbook MC Scorecard E30/E37/E43/E50/E56/E63). Required: without them the
      // calculator's mgmtFallback returns undefined for AGRI (useRcogp=false) and the
      // 8 senior/middle/junior band points silently score 0. (DISCREPANCY-LEDGER D-01)
      seniorBlackTarget: 0.60, seniorBWTarget: 0.30,
      middleBlackTarget: 0.75, middleBWTarget: 0.38,
      juniorBlackTarget: 0.88, juniorBWTarget: 0.44,
    },
    employmentEquity: {
      seniorMaxPts: 2, middleMaxPts: 2, juniorMaxPts: 1,
      disabledMaxPts: 2, disabledTarget: 0.02, // 2% of all employees
    },
    skills: {
      // AGRI Skills: verified against Skills Scorecard rows 15–48
      // 2.1.1.1: General learning programmes for Black people — 8pts @ 6% leviable
      // 2.1.1.2: Disabled Black learning — 4pts @ 0.3% leviable (mapped to disabledLearningMaxPts)
      // 2.1.2.1: Black people in LAI — 4pts @ 2.5% headcount (learnershipsMaxPts)
      // 2.1.2.2: Unemployed Black people in training — 4pts @ 2.5% headcount
      //          (mapped to bursaryMaxPts — AGRI has no HEI bursary indicator)
      // 2.1.3:   Absorption of unemployed after LAI — 5pts @ 100% (bonus)
      // Total: 8+4+4+4+5 = 25 ✓
      learningProgrammesMaxPts: 8,
      bursaryMaxPts: 4,         // Repurposed: AGRI unemployed training (2.1.2.2) 4pts @ 2.5%
      disabledLearningMaxPts: 4,
      learnershipsMaxPts: 4,
      absorptionMaxPts: 5,
      overallSpendPercent: 6.0, // 6% of leviable amount (AgriBEE — not 3.5%)
      bursarySpendPercent: 2.5, // Repurposed: unemployed training headcount target (2.5%)
      disabledSpendPercent: 0.3,
      learnershipTargetPercent: 2.5, // LAI: 2.5% of headcount (AgriBEE — not 5%)
      absorptionTargetPercent: 100.0, // Absorption: 100% of unemployed LAI graduates
    },
    procurement: {
      // AGRI PP: verified against Procurement Scorecard rows 9–16
      // allSuppliers: 5pts @ 80%; QSE: 3pts @ 15%; EME: 4pts @ 15%
      // BO51: 9pts @ 40% (NOT 50% — agriculture-specific lower threshold)
      // BWO30: 4pts @ 12%; DG bonus: 2pts @ 2%
      // Total base: 5+3+4+9+4 = 25; bonus: 2; pillar total: 27
      allSuppliersTarget: 0.80, allSuppliersMaxPts: 5,
      qseTarget: 0.15, qseMaxPts: 3,
      emeTarget: 0.15, emeMaxPts: 4,
      bo51Target: 0.40, bo51MaxPts: 9, // 40% (NOT 50%)
      bwo30Target: 0.12, bwo30MaxPts: 4,
      dgTarget: 0.02, dgMaxPts: 2,
    },
    // ESD: SD 2% NPAT / 10pts; ED 1.5% NPAT / 5pts base + 1 grad + 1 jobs = 7
    esd: { sdPercent: 2.0, sdMaxPts: 10, edPercent: 1.5, edMaxPts: 5, edGraduationBonus: 1, edJobsBonus: 1 },
    // SED: 1.5% NPAT / 15pts — "Socioeconomic Development Contributions (Agricultural Industry)"
    sed: { spendPercent: 1.5, maxPts: 15 },
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
  // Verified against BBBEE Toolkit (RCOGP QSE)_Template_v.1.1.xlsx:
  // 25 + 15 + 30 + 21 + 5 + 7 + 5 = 108
  totalMaxPoints: 108,
  pillarConfigs: {
    ownership: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    // QSE MC: no board, no EAP bands, no disabled — 2-section flat-target scorecard
    managementControl: { maxPoints: 15, hasSubMinimum: false, subMinimumPercent: 0 },
    skillsDevelopment: { maxPoints: 30, hasSubMinimum: true, subMinimumPercent: 40 },
    preferentialProcurement: { maxPoints: 21, hasSubMinimum: true, subMinimumPercent: 40 },
    supplierDevelopment: { maxPoints: 5, hasSubMinimum: true, subMinimumPercent: 40 },
    enterpriseDevelopment: { maxPoints: 7, hasSubMinimum: false, subMinimumPercent: 0 },
    socioEconomicDevelopment: { maxPoints: 5, hasSubMinimum: false, subMinimumPercent: 0 },
    yesInitiative: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 },
  },
  targets: {
    ownership: {
      // QSE ownership: voting Black 5pts, EI Black 5pts; new entrants/designated combined 3pts
      votingRightsTarget: 0.25, votingRightsMaxPts: 5,
      womenVotingTarget: 0.10, womenVotingMaxPts: 2,
      economicInterestTarget: 0.25, economicInterestMaxPts: 5,
      womenEITarget: 0.10, womenEIMaxPts: 2,
      economicInterestDesignatedGroupTarget: 0.02, economicInterestDesignatedGroupMaxPts: 3,
      netValueMaxPts: 8, newEntrantsMaxPts: 0, // combined into designatedGroup above
    },
    managementControl: {
      // QSE MC Section 1 — Executive Management (no Board indicator)
      boardBlackTarget: 0, boardBlackMaxPts: 0,
      boardBWTarget: 0, boardBWMaxPts: 0,
      execBlackTarget: 0.50, execBlackMaxPts: 5,
      execBWTarget: 0.25, execBWMaxPts: 2,
      // QSE MC has no "Other Executive Management" band
      otherExecBlackTarget: 0, otherExecBlackMaxPts: 0,
      otherExecBWTarget: 0, otherExecBWMaxPts: 0,
      // QSE MC Section 2 — Senior+Middle+Junior combined (60%/30% fixed targets, not EAP-based)
      // seniorMaxPts carries the combined SMJ Black score (6pts @ 60%)
      seniorMaxPts: 6, seniorBWMaxPts: 2,
      middleMaxPts: 0, middleBWMaxPts: 0,
      juniorMaxPts: 0, juniorBWMaxPts: 0,
      // No disabled employees indicator in QSE MC
    },
    employmentEquity: {
      seniorMaxPts: 0, middleMaxPts: 0, juniorMaxPts: 0,
      disabledMaxPts: 0, disabledTarget: 0,
    },
    skills: {
      // QSE Skills: all-black 3%/15pts, black-female 1%/7pts, disabled 0.15%/3pts, absorption 1%/5pts
      learningProgrammesMaxPts: 15,   // Spend on Black people: 3% leviable
      bursaryMaxPts: 7,               // Spend on Black female: 1% leviable (QSE-specific indicator)
      disabledLearningMaxPts: 3,      // Spend on Black disabled: 0.15% leviable
      learnershipsMaxPts: 0,          // No LAI headcount indicator in QSE
      absorptionMaxPts: 5,            // Absorption of unemployed Black after LAI (bonus)
      overallSpendPercent: 3.0,       // 3% (vs Generic 3.5%)
      bursarySpendPercent: 1.0,       // Black female spend target 1%
      disabledSpendPercent: 0.15,     // 0.15% (vs Generic 0.3%)
      learnershipTargetPercent: 0,
      // R8: 100% absorption target. Excel `Skills Calcs!J28 = MIN(absorbed/completers × 5, 5)`
      // has NO percentage divisor — full 5 pts require 100% absorption. Whole-percent 100 →
      // (calculator /100) → 1.0 = 100%. Was 1.0 (=1%); the ledger D-04 "1% target" misread the
      // display cell C30=1 as a divisor. (basis completers-vs-black-learners stays open: Q-E/R18.)
      absorptionTargetPercent: 100,
    },
    procurement: {
      // QSE PP: 3 indicators only (no QSE/EME split, no BWO30)
      allSuppliersTarget: 0.60, allSuppliersMaxPts: 15, // 60% TMPS (Generic: 80% / 5pts)
      qseTarget: 0, qseMaxPts: 0,                       // Not present in QSE toolkit
      emeTarget: 0, emeMaxPts: 0,                       // Not present in QSE toolkit
      bo51Target: 0.15, bo51MaxPts: 5,                  // 15% TMPS (Generic: 50% / 11pts)
      bwo30Target: 0, bwo30MaxPts: 0,                   // Not present in QSE toolkit
      dgTarget: 0.01, dgMaxPts: 1,                      // DG bonus: 1% / 1pt (Generic: 2% / 2pts)
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
// RCOGP QSE verified: 25+15+30+21+5+7+5 = 108 (exact match Excel v1.1)
// RCOGP QSE verified: 25+15+30+21+5+7+5 = 108 (exact match Excel)

// ---------------------------------------------------------------------------
// ICT QSE (Information & Communication Technology - Qualifying Small Enterprise)
// Verified 2026-05-29 against BBBEE Toolkit (ICT QSE)_Template_v.1.1.xlsx
// @see docs/domain/sectors/ict/qse/sls.md
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
    enterpriseDevelopment: { maxPoints: 8, hasSubMinimum: false, subMinimumPercent: 0 }, // 5 base + 1 grad + tiered jobs (1 or 2)
    socioEconomicDevelopment: { maxPoints: 12, hasSubMinimum: false, subMinimumPercent: 0 }, // ICT-specific 12 pts
    yesInitiative: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 }, // Level boost only
  },
  targets: {
    ownership: {
      // ICT sector: voting rights target = 30% (not 25% as in RCOGP)
      votingRightsTarget: 0.30, votingRightsMaxPts: 5,
      womenVotingTarget: 0.10, womenVotingMaxPts: 2,
      economicInterestTarget: 0.30, economicInterestMaxPts: 5,
      womenEITarget: 0.10, womenEIMaxPts: 2,
      // QSE: single combined "Black New Entrants OR Designated Groups" indicator
      // (3 pts @ 2%); modelled via the designated-group slot, new-entrants = 0.
      // (TOOLKIT-RESOLVED.md Q8.) Ownership total: 5+2+5+2+8+3 = 25.
      economicInterestDesignatedGroupTarget: 0.02, economicInterestDesignatedGroupMaxPts: 3,
      netValueMaxPts: 8, newEntrantsMaxPts: 0,
    },
    managementControl: {
      // QSE: NO board indicators
      boardBlackTarget: 0, boardBlackMaxPts: 0,
      boardBWTarget: 0, boardBWMaxPts: 0,
      // QSE Section 1: Executive Management (50%/25% flat targets)
      execBlackTarget: 0.50, execBlackMaxPts: 5,
      execBWTarget: 0.25, execBWMaxPts: 2,
      // QSE: NO "Other Executive Management" band
      otherExecBlackTarget: 0, otherExecBlackMaxPts: 0,
      otherExecBWTarget: 0, otherExecBWMaxPts: 0,
      // QSE Section 2: Senior+Middle+Junior combined (60%/30% flat targets)
      seniorMaxPts: 6, seniorBWMaxPts: 2,
      middleMaxPts: 0, middleBWMaxPts: 0,
      juniorMaxPts: 0, juniorBWMaxPts: 0,
    },
    employmentEquity: {
      // QSE: No separate EE pillar; disabled not scored in QSE MC
      seniorMaxPts: 0, middleMaxPts: 0, juniorMaxPts: 0,
      disabledMaxPts: 0, disabledTarget: 0,
    },
    skills: {
      // SK-1: 3% leviable / 15 pts (Black people)
      learningProgrammesMaxPts: 15,
      // SK-2: 1% leviable / 7 pts (Black women spend — not bursaries)
      bursaryMaxPts: 7,
      // SK-3: 0.15% leviable / 3 pts (Black disabled)
      disabledLearningMaxPts: 3,
      // No LAI headcount indicator in QSE
      learnershipsMaxPts: 0,
      // SK-4: Absorption bonus / 5 pts
      absorptionMaxPts: 5,
      overallSpendPercent: 3.0,
      bursarySpendPercent: 1.0,
      disabledSpendPercent: 0.15,
      learnershipTargetPercent: 0,
      // R22 (mirror of R8): 100% absorption target. Excel `Skills Calcs!J28 =
      // MIN(absorbed/completers × 5, 5)` has NO percentage divisor — full 5 pts
      // require 100% absorption. Whole-percent 100 → (calculator /100) → 1.0 = 100%.
      // Was 1.0 (=1%); the D-04 fix removed the double /100 but left the under-target.
      absorptionTargetPercent: 100,
    },
    procurement: {
      // QSE PP: 3 indicators only (all-suppliers 60%/15, BO51 15%/5, DG bonus 1%/1)
      allSuppliersTarget: 0.60, allSuppliersMaxPts: 15,
      // No QSE/EME/BWO30 rows in QSE procurement
      qseTarget: 0, qseMaxPts: 0,
      emeTarget: 0, emeMaxPts: 0,
      bo51Target: 0.15, bo51MaxPts: 5,
      bwo30Target: 0, bwo30MaxPts: 0,
      dgTarget: 0.01, dgMaxPts: 1,
    },
    // SD: 1% NPAT / 5 pts; ED: 1% NPAT / 5 base + tiered jobs bonus (1 or 2 pts, not yet modelled in calculator)
    // ICT gazette AICT604 §7.1.1.4-7.1.1.5: QSE SD and ED are each 2% of NPAT,
    // not the generic 1% — the 1% figure halved every target and doubled the
    // score at a given spend. (Audit 2026-07-26 item 4.)
    esd: { sdPercent: 2.0, sdMaxPts: 5, edPercent: 2.0, edMaxPts: 5, edGraduationBonus: 1, edJobsBonus: 2 },
    sed: { spendPercent: 1.0, maxPts: 12 }, // ICT QSE: 12 pts (not 5)
  },
  // ICT QSE uses standard RCOGP 8-band thresholds (100/95/90/80/75/70/55/40),
  // NOT the ICT Generic 140-pt scale (ICT_LEVELS).
  levelThresholds: STANDARD_LEVELS,
  recognitionTable: STANDARD_RECOGNITION_TABLE,
  benefitFactors: STANDARD_BENEFIT_FACTORS,
  categoryWeightings: STANDARD_CATEGORY_WEIGHTINGS,
  industryNorms: STANDARD_INDUSTRY_NORMS,
};
// ICT QSE verified from Excel: 25+15+30+21+5+8+12 = 116 (YES excluded)
// ICT QSE uses STANDARD level thresholds (not ICT_LEVELS which is for Generic/140-pt scale)

// ---------------------------------------------------------------------------
// FSC QSFI — Qualifying Small Financial Institution (annual revenue R10-50m).
//
// ELEMENT WEIGHTS are gazette-verified (GG 41287 §8.2, read first-hand in the
// 2026-07-26 audit): Ownership 25 + Management Control 15 + Skills 25 +
// Procurement & ESD 30 + SED & Consumer Education 5 = 100. Before this config
// existed an FSC QSE fell through to the 105-pt Others scorecard — a wrong
// answer rather than a refusal.
//
// INNER INDICATOR SPLITS are DERIVED, pending extraction of the QSFI
// statements themselves: ownership/MC mirror the amended-codes QSE statements
// (same shapes the gazette's QSFI chapters are built on), P&ESD 30 splits
// PP 20 / SD 5 / ED 5 (the FSC pattern at QSE scale), and SED&CE 5 splits
// SED 3 @ 0.6% + CE 2 @ 0.4% (the FSC Others split, FS500). Deemed levels
// (≥51% black → L2, 100% → L1 via annual sworn affidavit) are handled by the
// deemed-level pipeline, not this scorecard.
// ---------------------------------------------------------------------------

export const FSC_QSE: SectorConfig = {
  sectorCode: 'FSC',
  sectorName: 'Financial Sector Code (QSFI)',
  scorecardType: 'QSE',
  // GG 41287 §8.2: 25 + 15 + 25 + 30 + 5 = 100
  totalMaxPoints: 100,
  pillarConfigs: {
    // Ownership is a QSFI PRIORITY element (FSC §3.3.2(b)).
    ownership: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    managementControl: { maxPoints: 15, hasSubMinimum: false, subMinimumPercent: 0 },
    employmentEquity: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 },
    skillsDevelopment: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    preferentialProcurement: { maxPoints: 20, hasSubMinimum: true, subMinimumPercent: 40 },
    supplierDevelopment: { maxPoints: 5, hasSubMinimum: true, subMinimumPercent: 40 },
    enterpriseDevelopment: { maxPoints: 5, hasSubMinimum: false, subMinimumPercent: 0 },
    socioEconomicDevelopment: { maxPoints: 5, hasSubMinimum: false, subMinimumPercent: 0 },
    yesInitiative: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 },
  },
  targets: {
    ownership: {
      // Amended QSE ownership shape: voting 5, BW voting 2, EI 5, BW EI 2,
      // combined NE/DG 3, net value 8 = 25.
      votingRightsTarget: 0.25, votingRightsMaxPts: 5,
      womenVotingTarget: 0.10, womenVotingMaxPts: 2,
      economicInterestTarget: 0.25, economicInterestMaxPts: 5,
      womenEITarget: 0.10, womenEIMaxPts: 2,
      economicInterestDesignatedGroupTarget: 0.02, economicInterestDesignatedGroupMaxPts: 3,
      netValueMaxPts: 8, newEntrantsMaxPts: 0, // combined into designatedGroup above
    },
    managementControl: {
      // QSE MC: executive 5+2, senior/middle/junior combined 6+2 = 15.
      boardBlackTarget: 0, boardBlackMaxPts: 0,
      boardBWTarget: 0, boardBWMaxPts: 0,
      execBlackTarget: 0.50, execBlackMaxPts: 5,
      execBWTarget: 0.25, execBWMaxPts: 2,
      otherExecBlackTarget: 0, otherExecBlackMaxPts: 0,
      otherExecBWTarget: 0, otherExecBWMaxPts: 0,
      seniorMaxPts: 6, seniorBWMaxPts: 2,
      middleMaxPts: 0, middleBWMaxPts: 0,
      juniorMaxPts: 0, juniorBWMaxPts: 0,
    },
    employmentEquity: {
      seniorMaxPts: 0, middleMaxPts: 0, juniorMaxPts: 0,
      disabledMaxPts: 0, disabledTarget: 0,
    },
    skills: {
      // QSFI Skills 25: black spend 3%/12, black female 1%/5, disabled 0.15%/3,
      // absorption 100%/5.
      learningProgrammesMaxPts: 12,
      bursaryMaxPts: 5,
      disabledLearningMaxPts: 3,
      learnershipsMaxPts: 0,
      absorptionMaxPts: 5,
      overallSpendPercent: 3.0,
      bursarySpendPercent: 1.0,
      disabledSpendPercent: 0.15,
      learnershipTargetPercent: 0,
      absorptionTargetPercent: 100,
    },
    procurement: {
      // QSFI PP 20: all suppliers 60%/12, >=51% black-owned 15%/7, DG bonus 1%/1.
      allSuppliersTarget: 0.60, allSuppliersMaxPts: 12,
      qseTarget: 0, qseMaxPts: 0,
      emeTarget: 0, emeMaxPts: 0,
      bo51Target: 0.15, bo51MaxPts: 7,
      bwo30Target: 0, bwo30MaxPts: 0,
      dgTarget: 0.01, dgMaxPts: 1,
    },
    esd: { sdPercent: 1.0, sdMaxPts: 5, edPercent: 1.0, edMaxPts: 5, edGraduationBonus: 0, edJobsBonus: 0 },
    // SED & CE 5 = SED 3 @ 0.6% NPAT + Consumer Education 2 @ 0.4% (FS500 split).
    sed: { spendPercent: 1.0, maxPts: 5 },
  },
  levelThresholds: STANDARD_LEVELS,
  recognitionTable: STANDARD_RECOGNITION_TABLE,
  benefitFactors: STANDARD_BENEFIT_FACTORS,
  categoryWeightings: STANDARD_CATEGORY_WEIGHTINGS,
  industryNorms: STANDARD_INDUSTRY_NORMS,
};

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
  // Super Admin Fix Plan §1.3 + §3.1 T1/T2 — Transport Large has two separate
  // pillars per the gazette (Transport Codes row 22 = MC 11; row 33 = EE 18).
  // Previously they were merged into MC = 29 / EE = 0, leaving EE invisible
  // in Super Admin.
  pillarConfigs: {
    ownership: { maxPoints: 24, hasSubMinimum: false, subMinimumPercent: 0 },
    managementControl: { maxPoints: 11, hasSubMinimum: false, subMinimumPercent: 0 },
    employmentEquity: { maxPoints: 18, hasSubMinimum: false, subMinimumPercent: 0 },
    skillsDevelopment: { maxPoints: 15, hasSubMinimum: false, subMinimumPercent: 0 },
    preferentialProcurement: { maxPoints: 20, hasSubMinimum: false, subMinimumPercent: 0 },
    supplierDevelopment: { maxPoints: 15, hasSubMinimum: false, subMinimumPercent: 0 },
    enterpriseDevelopment: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 },
    socioEconomicDevelopment: { maxPoints: 5, hasSubMinimum: false, subMinimumPercent: 0 },
    yesInitiative: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 },
  },
  targets: {
    ownership: {
      // Super Admin Fix Plan §3.1 T5 — Transport Generic Ownership previously
      // summed to 21 (header 24). Add Ownership Fulfilment 1 pt (Transport
      // Codes row 9) and Bonus ESOP/BBOS 2 pts (row 11). We reuse the
      // `newEntrantsMaxPts` slot for Ownership Fulfilment (semantically the
      // "ownership fulfilment" 1-pt indicator from the gazette) and lift
      // `womenVotingMaxPts` from 2 → 2 + 2 (bonus ESOP/BBOS) for a 24-pt
      // total: 3+4+4+2+1+7+1+2 = 24 ✓.
      votingRightsTarget: 0.25, votingRightsMaxPts: 3,
      womenVotingTarget: 0.10, womenVotingMaxPts: 4, // 2 women-voting + 2 bonus ESOP/BBOS
      economicInterestTarget: 0.25, economicInterestMaxPts: 4,
      womenEITarget: 0.10, womenEIMaxPts: 2,
      economicInterestDesignatedGroupTarget: 0.025, economicInterestDesignatedGroupMaxPts: 1,
      netValueMaxPts: 7, newEntrantsMaxPts: 3, // 2 new-entrants + 1 ownership fulfilment
    },
    managementControl: {
      // Super Admin Fix Plan §3.1 T3 — Transport Codes Road Freight Large rows
      // 23–31: Board B/BW 1.5/1.5, Exec Dir B/BW 1/1, Senior Top B/BW 1.5/1.5,
      // Other Top B/BW 1/1, Bonus Independent NEDs 1 → MC = 11 ✓
      boardBlackTarget: 0.50, boardBlackMaxPts: 1.5,
      boardBWTarget: 0.25, boardBWMaxPts: 1.5,
      execBlackTarget: 0.50, execBlackMaxPts: 1,
      execBWTarget: 0.25, execBWMaxPts: 1,
      otherExecBlackTarget: 0.60, otherExecBlackMaxPts: 1.5,
      otherExecBWTarget: 0.30, otherExecBWMaxPts: 1.5,
      // Top mgmt (above other exec) – modelled in the senior slot; bonus
      // Independent NEDs (1 pt) modelled in seniorBWMaxPts. Junior/middle
      // unused at MC level for Transport Large (live in EE).
      seniorMaxPts: 1, seniorBWMaxPts: 1, // 1 = Other Top Black; 1 = Bonus Independent NEDs
      middleMaxPts: 0, middleBWMaxPts: 0,
      juniorMaxPts: 0, juniorBWMaxPts: 0,
    },
    employmentEquity: {
      // Super Admin Fix Plan §3.1 T4 — Transport Codes Road Freight Large rows
      // 33–43: Black Senior 2.5 + BW Senior 2.5 + Black Middle 1.5 + BW Middle
      // 1.5 + Black Junior 1.5 + BW Junior 1.5 + BW Semi/Unskilled 2 +
      // Disabled 1 + Disabled Women 1 + Bonus EAP 3 → EE = 18 ✓.
      seniorMaxPts: 2.5, middleMaxPts: 1.5, juniorMaxPts: 1.5,
      disabledMaxPts: 1, disabledTarget: 0.02,
      disabledWomenMaxPts: 1, disabledWomenTarget: 0.01,
      // Black women equivalents at each level — held as optional fields on
      // EETargets so Super Admin can render them; engine reads them in
      // calcTransportLargeManagementAndEE.
      seniorBWMaxPts: 2.5,
      middleBWMaxPts: 1.5,
      juniorBWMaxPts: 1.5,
      semiUnskilledWomenMaxPts: 2,
      eapBonusMaxPts: 3,
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
      // NOT the Statement-300 absorption indicator: Transport Large (legacy
      // framework) reuses this slot for "black women in B/C/D programmes" at a
      // genuine 2.5% target (calcTransportLargeSkills). Audit item 2's 100%
      // fix applies to RCOGP/ICT Generic only.
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
// Structure: ANY FOUR of the seven elements, each weighted 25 → denominator 100.
// Bonus points are earnable on top, so a compliant entity can exceed 100.
//
// The Transport Sector Code still follows the 2007 seven-element framework (it was
// never replaced by an aligned 5-element code), so the QSE rule is "measured on
// four of the seven elements". Where the entity has not elected four, the
// verification agency takes the four highest-scoring ones.
//
// GROUND TRUTH — Thandanani Packers & Haulers cc t/a Thandanani Transport,
// certificate 13609, final BEE verification report dated 30 January 2026
// (docs/testdocs/Final Report - Thandanani Transport BE13609-300126.pdf):
//
//   Equity Ownership 25.00 | Management Control 27.00 | Employment Equity 0.00
//   Skills Development 0.00 | Preferential Procurement 25.00
//   Enterprise Development 0.00 | Socio-Economic Development 25.00
//   TOTAL 102.00 → 135% recognition → LEVEL 1
//
// The best four (MC 27 + Own 25 + PP 25 + SED 25) reproduce 102 exactly. EE, SD
// and ED report 0.00 because they were simply not among the four measured.
//
// THIS REPLACED an earlier model of "82 compulsory (Own + MC + EE) + one elective
// of 25 = 107". That model was not sourced from the sector code: it forced EE into
// the denominator and allowed only ONE elective, so Thandanani scored
// 25 + 27 + 0 + 25 = 77 against a 107 target = Level 4 — three levels below the
// certificate. Both defects are the same mistake: guessing a selection rule the
// workbook never states.
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
  // Any four of the seven elements, 25 each → 100. Bonuses may exceed it.
  totalMaxPoints: 100,
  electiveGroupSizes: { transport_qse_elective: 4 },
  pillarConfigs: {
    // All seven elements are electives in ONE group of four. `basePoints: 25` is
    // each element's weighting for the denominator; `maxPoints` additionally
    // carries that element's bonus points, which are earnable but do not raise
    // the target.
    ownership: { maxPoints: 28, basePoints: 25, hasSubMinimum: false, subMinimumPercent: 0, chooseOneGroup: 'transport_qse_elective' },
    managementControl: { maxPoints: 27, basePoints: 25, hasSubMinimum: false, subMinimumPercent: 0, chooseOneGroup: 'transport_qse_elective' },
    employmentEquity: { maxPoints: 27, basePoints: 25, hasSubMinimum: false, subMinimumPercent: 0, chooseOneGroup: 'transport_qse_elective' },
    skillsDevelopment: { maxPoints: 25, basePoints: 25, hasSubMinimum: false, subMinimumPercent: 0, chooseOneGroup: 'transport_qse_elective' },
    preferentialProcurement: { maxPoints: 25, basePoints: 25, hasSubMinimum: false, subMinimumPercent: 0, chooseOneGroup: 'transport_qse_elective' },
    supplierDevelopment: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 }, // Not a standalone element
    enterpriseDevelopment: { maxPoints: 25, basePoints: 25, hasSubMinimum: false, subMinimumPercent: 0, chooseOneGroup: 'transport_qse_elective' },
    socioEconomicDevelopment: { maxPoints: 25, basePoints: 25, hasSubMinimum: false, subMinimumPercent: 0, chooseOneGroup: 'transport_qse_elective' },
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

// Gazette-exact: CSC000 uses the amended-codes standard ladder unchanged
// (verified first-hand against GG 41287 in the 2026-07-26 audit — the old
// _PLACEHOLDER name and TODO suggested it was unconfirmed; it is confirmed).
const CONSTRUCTION_LEVELS = STANDARD_LEVELS;

export const CONSTRUCTION_QSE: SectorConfig = {
  sectorCode: 'CONSTRUCTION',
  sectorName: 'Construction Sector Code (QSE)',
  scorecardType: 'QSE',
  totalMaxPoints: 110, // 30 + 20 + 26 + 29 + 5
  indicators: mapConstructionIndicators(CONSTRUCTION_QSE_SCORECARD.indicators),
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
  levelThresholds: CONSTRUCTION_LEVELS,
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
  indicators: mapConstructionIndicators(CONSTRUCTION_CONTRACTOR_SCORECARD.indicators),
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
  levelThresholds: CONSTRUCTION_LEVELS,
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
  indicators: mapConstructionIndicators(CONSTRUCTION_BEP_SCORECARD.indicators),
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
  levelThresholds: CONSTRUCTION_LEVELS,
  recognitionTable: STANDARD_RECOGNITION_TABLE,
  benefitFactors: STANDARD_BENEFIT_FACTORS,
  categoryWeightings: STANDARD_CATEGORY_WEIGHTINGS,
  industryNorms: STANDARD_INDUSTRY_NORMS,
};

// ---------------------------------------------------------------------------
// Enrich configs with ledger sub-elements for Super Admin / API display
// ---------------------------------------------------------------------------

function attachSubElements(config: SectorConfig): SectorConfig {
  const subs = getAllSectorPillarSubElements(config.sectorCode, config.scorecardType);
  if (Object.keys(subs).length === 0) return config;

  const pillarConfigs = { ...config.pillarConfigs };
  for (const [key, elements] of Object.entries(subs)) {
    const pk = key as keyof typeof pillarConfigs;
    const existing = pillarConfigs[pk];
    if (existing && elements.length > 0) {
      pillarConfigs[pk] = { ...existing, subElements: elements };
    }
  }
  return { ...config, pillarConfigs };
}

function getEnrichedConfig(sectorCode: string, scorecardType: string = 'Generic'): SectorConfig {
  const match = ALL_CONFIGS.find(
    (c) =>
      c.sectorCode.toLowerCase() === sectorCode.toLowerCase() &&
      c.scorecardType.toLowerCase() === scorecardType.toLowerCase(),
  );
  if (!match) {
    throw new Error(
      `No sector config found for sectorCode="${sectorCode}", scorecardType="${scorecardType}". Available: ${ALL_CONFIGS.map((c) => `${c.sectorCode}/${c.scorecardType}`).join(', ')}`,
    );
  }
  return match;
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

const ALL_CONFIGS: SectorConfig[] = [
  RCOGP_GENERIC, ICT_GENERIC, FSC_GENERIC, FSC_BANKS, FSC_LTI, FSC_STI,
  FSC_QSE, AGRI_GENERIC, TRANSPORT_GENERIC, RCOGP_QSE, ICT_QSE, TRANSPORT_QSE,
  CONSTRUCTION_QSE, CONSTRUCTION_CONTRACTOR, CONSTRUCTION_BEP,
].map(attachSubElements);

export function getSectorConfig(sectorCode: string, scorecardType: string = 'Generic'): SectorConfig {
  return getEnrichedConfig(sectorCode, scorecardType);
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
  if (hasICT && hasQSE) return getSectorConfig('ICT', 'QSE');
  if (hasICT) return getSectorConfig('ICT', 'Generic');
  if (/fsc|financial\s*sector|banking|insurance|investment/i.test(lower)) return getSectorConfig('FSC', 'Generic');
  if (/agri|agriculture|farming|agribee/i.test(lower)) return getSectorConfig('AGRI', 'Generic');
  if (/transport|freight|logistics|rail|aviation|maritime|shipping/i.test(lower)) {
    return hasQSE ? getSectorConfig('TRANSPORT', 'QSE') : getSectorConfig('TRANSPORT', 'Generic');
  }
  if (/construction|contractor|built\s*environment|builder/i.test(lower)) {
    if (/bep|built\s*environment\s*professional/i.test(lower)) return getSectorConfig('CONSTRUCTION', 'BEP');
    if (hasQSE) return getSectorConfig('CONSTRUCTION', 'QSE');
    return getSectorConfig('CONSTRUCTION', 'Contractor');
  }
  if (hasQSE) return getSectorConfig('RCOGP', 'QSE');
  logger.warn('No sector match — defaulting to RCOGP Generic', { input: nameOrSector });
  return getSectorConfig('RCOGP', 'Generic');
}

export function listSectorConfigs(): Array<{ code: string; name: string; type: string; totalPoints: number }> {
  return ALL_CONFIGS.map(c => ({
    code: c.sectorCode,
    name: c.sectorName,
    type: c.scorecardType,
    totalPoints: c.totalMaxPoints,
  }));
}

/** Merge canonical ledger sub-elements onto API/Arango sector payloads (stale DB rows may omit them). */
export function enrichSectorApiPayload<T extends {
  code: string;
  type: string;
  totalPoints?: number;
  pillarConfigs?: unknown;
  indicators?: SectorIndicatorRow[];
}>(sector: T): T {
  const config = getSectorConfigSafe(sector.code, sector.type);
  if (!config) return sector;

  const out = { ...sector, totalPoints: config.totalMaxPoints };

  if (Array.isArray(sector.pillarConfigs)) {
    out.pillarConfigs = (sector.pillarConfigs as Array<{
      code?: string;
      chooseOneGroup?: string;
      subElements?: PillarSubElement[];
      subMinimumPercent?: number;
      maxPoints?: number;
      hasSubMinimum?: boolean;
    }>).map((p) => {
      const pk = p.code;
      if (!pk) return p;
      const canonical = config.pillarConfigs[pk as keyof typeof config.pillarConfigs];
      if (!canonical) return p;
      return {
        ...p,
        maxPoints: p.maxPoints ?? canonical.maxPoints,
        hasSubMinimum: p.hasSubMinimum ?? canonical.hasSubMinimum,
        subMinimumPercent:
          typeof p.subMinimumPercent === 'number' ? p.subMinimumPercent : canonical.subMinimumPercent,
        chooseOneGroup: p.chooseOneGroup ?? canonical.chooseOneGroup,
        subElements: p.subElements?.length ? p.subElements : canonical.subElements,
      };
    });
  } else if (sector.pillarConfigs && typeof sector.pillarConfigs === 'object') {
    const merged = { ...(sector.pillarConfigs as Record<string, PillarConfig>) };
    for (const [key, canonical] of Object.entries(config.pillarConfigs)) {
      if (!canonical) continue;
      const existing = merged[key];
      merged[key] = {
        ...(existing ?? canonical),
        maxPoints: existing?.maxPoints ?? canonical.maxPoints,
        hasSubMinimum: existing?.hasSubMinimum ?? canonical.hasSubMinimum,
        subMinimumPercent: existing?.subMinimumPercent ?? canonical.subMinimumPercent,
        chooseOneGroup: existing?.chooseOneGroup ?? canonical.chooseOneGroup,
        subElements: existing?.subElements?.length ? existing.subElements : canonical.subElements,
      };
    }
    out.pillarConfigs = merged;
  }

  if (config.indicators?.length && !out.indicators?.length) {
    out.indicators = config.indicators;
  }

  return out;
}

/** Full sector payloads for `/api/sectors` fallback when Arango is unavailable. */
/**
 * Sum a config's pillar `maxPoints`, respecting `chooseOneGroup`.
 *
 * Elective pillars sharing a `chooseOneGroup` are alternatives — only ONE counts
 * toward the total (e.g. Transport QSE is 82 compulsory + 25 from a single chosen
 * elective = 107, even though four 25-point electives are defined). A naive sum
 * over `pillarConfigs` reports 182 for that config and is simply wrong.
 *
 * This lived only as copy-pasted helpers inside two test files, which noted that
 * "the production validator today is the arithmetic identity" — i.e. there was
 * none. It is production code now so callers and tests share one implementation.
 */
export function sumPillarMaxPoints(
  config: Pick<SectorConfig, 'pillarConfigs'> & Partial<Pick<SectorConfig, 'electiveGroupSizes'>>,
): number {
  const groups = new Map<string, number[]>();
  let total = 0;

  for (const pillar of Object.values(config.pillarConfigs)) {
    if (!pillar || pillar.maxPoints <= 0) continue;
    const group = (pillar as { chooseOneGroup?: string }).chooseOneGroup;
    if (group) {
      // A group member contributes its weighting, not its bonus-inclusive max.
      const points = (pillar as { basePoints?: number }).basePoints ?? pillar.maxPoints;
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group)!.push(points);
      continue;
    }
    total += pillar.maxPoints;
  }

  // Only the top `size` members of each group can be elected (default 1).
  for (const [group, points] of groups) {
    const size = config.electiveGroupSizes?.[group] ?? 1;
    total += points.sort((a, b) => b - a).slice(0, size).reduce((sum, p) => sum + p, 0);
  }
  return total;
}

export interface SectorConfigIntegrityIssue {
  configId: string;
  declaredTotal: number;
  pillarSum: number;
}

/**
 * Check every shipped sector config for the arithmetic identity
 * `sumPillarMaxPoints(config) === config.totalMaxPoints`.
 *
 * A mismatch means the scorecard can award a different number of points than it
 * declares — which silently corrupts percentages and B-BBEE levels. Returns the
 * offending configs (empty array = healthy) so both tests and runtime callers can
 * assert on it instead of each re-deriving the arithmetic.
 */
export function findSectorConfigIntegrityIssues(): SectorConfigIntegrityIssue[] {
  const issues: SectorConfigIntegrityIssue[] = [];
  for (const config of ALL_CONFIGS) {
    const pillarSum = sumPillarMaxPoints(config);
    if (pillarSum !== config.totalMaxPoints) {
      issues.push({
        configId: `${config.sectorCode}_${config.scorecardType}`,
        declaredTotal: config.totalMaxPoints,
        pillarSum,
      });
    }
  }
  return issues;
}

export function listSectorConfigsFull(): Array<{
  code: string;
  name: string;
  type: string;
  totalPoints: number;
  pillarConfigs: SectorConfig['pillarConfigs'];
  targets: SectorConfig['targets'];
  levelThresholds: SectorConfig['levelThresholds'];
  indicators?: SectorIndicatorRow[];
}> {
  return ALL_CONFIGS.map((c) => ({
    code: c.sectorCode,
    name: c.sectorName,
    type: c.scorecardType,
    totalPoints: c.totalMaxPoints,
    pillarConfigs: c.pillarConfigs,
    targets: c.targets,
    levelThresholds: c.levelThresholds,
    ...(c.indicators?.length ? { indicators: c.indicators } : {}),
  }));
}
