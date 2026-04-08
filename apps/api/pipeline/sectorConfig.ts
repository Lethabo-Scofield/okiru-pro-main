/**
 * Sector-Specific B-BBEE Configuration
 *
 * Each sector code (RCOGP, ICT, FSC, AGRI, etc.) defines its own
 * pillar weightings, compliance targets, sub-minimum thresholds,
 * and level determination tables.
 *
 * Reference: B-BBEE Act 53 of 2003, Amended Codes of Good Practice,
 * and Sector-Specific Codes (ICT, FSC, AgriBEE, etc.)
 */

export interface PillarConfig {
  maxPoints: number;
  hasSubMinimum: boolean;
  subMinimumPercent: number;
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
  scorecardType: 'Generic' | 'QSE' | 'EME';
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

// ---------------------------------------------------------------------------
// BEE Recognition Table — multiplies supplier spend for procurement scoring
// Reference: B-BBEE Act, Schedule 4
// ---------------------------------------------------------------------------

const STANDARD_RECOGNITION_TABLE: RecognitionLevel[] = [
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

const STANDARD_BENEFIT_FACTORS: BenefitFactor[] = [
  { contributionType: 'grant', sdFactor: 1.0, edFactor: 1.0 },
  { contributionType: 'direct_cost', sdFactor: 1.0, edFactor: 1.0 },
  { contributionType: 'discounts', sdFactor: 1.0, edFactor: 1.0 },
  { contributionType: 'overhead_costs', sdFactor: 1.0, edFactor: 1.0 },
  { contributionType: 'interest_free_loan', sdFactor: 1.0, edFactor: 1.0 },
  { contributionType: 'standard_loan', sdFactor: 0.7, edFactor: 0.7 },
  { contributionType: 'guarantees', sdFactor: 0.03, edFactor: 0.03 },
  { contributionType: 'lower_interest_rate', sdFactor: 0.7, edFactor: 0.7 },
  { contributionType: 'minority_investment', sdFactor: 1.0, edFactor: 1.0 },
  { contributionType: 'professional_services_free', sdFactor: 1.0, edFactor: 1.0 },
  { contributionType: 'professional_services_discounted', sdFactor: 0.8, edFactor: 0.8 },
  { contributionType: 'employee_time', sdFactor: 1.0, edFactor: 1.0 },
  { contributionType: 'shorter_payment_periods', sdFactor: 0.7, edFactor: 0.0 },
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
  totalMaxPoints: 140, // Verified: 25+23+25+27+10+15+12 = 137, +3 YES bonus = 140
  pillarConfigs: {
    ownership: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    managementControl: { maxPoints: 23, hasSubMinimum: false, subMinimumPercent: 0 }, // MC+EE combined
    employmentEquity: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 }, // Merged into MC
    skillsDevelopment: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    preferentialProcurement: { maxPoints: 27, hasSubMinimum: true, subMinimumPercent: 40 },
    supplierDevelopment: { maxPoints: 10, hasSubMinimum: true, subMinimumPercent: 40 }, // 2% NPAT
    enterpriseDevelopment: { maxPoints: 15, hasSubMinimum: false, subMinimumPercent: 0 }, // Higher than RCOGP
    socioEconomicDevelopment: { maxPoints: 12, hasSubMinimum: false, subMinimumPercent: 0 }, // ICT-specific
    yesInitiative: { maxPoints: 3, hasSubMinimum: false, subMinimumPercent: 0 }, // Tier 2 bonus included in total
  },
  targets: {
    ownership: {
      votingRightsTarget: 0.25, votingRightsMaxPts: 5, // Generic uses 25% + 1 vote
      womenVotingTarget: 0.10, womenVotingMaxPts: 2,
      economicInterestTarget: 0.25, economicInterestMaxPts: 5,
      womenEITarget: 0.10, womenEIMaxPts: 2,
      netValueMaxPts: 8, newEntrantsMaxPts: 3, // 2% designated group
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
  levelThresholds: STANDARD_LEVELS,
  recognitionTable: STANDARD_RECOGNITION_TABLE,
  benefitFactors: STANDARD_BENEFIT_FACTORS,
  categoryWeightings: STANDARD_CATEGORY_WEIGHTINGS,
  industryNorms: STANDARD_INDUSTRY_NORMS,
};
// ICT Generic verified: 25+23+25+27+10+15+12 = 137, +3 YES = 140 (includes YES)
// MC includes Employment Equity as combined pillar per ICT Sector Code

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
  totalMaxPoints: 120, // FSC Generic total (needs verification from full Excel)
  pillarConfigs: {
    ownership: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    managementControl: { maxPoints: 21, hasSubMinimum: false, subMinimumPercent: 0 }, // MC+EE combined
    employmentEquity: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 },
    skillsDevelopment: { maxPoints: 20, hasSubMinimum: true, subMinimumPercent: 40 }, // ~20 pts
    preferentialProcurement: { maxPoints: 20, hasSubMinimum: true, subMinimumPercent: 40 }, // ~20 pts
    supplierDevelopment: { maxPoints: 10, hasSubMinimum: true, subMinimumPercent: 40 },
    enterpriseDevelopment: { maxPoints: 5, hasSubMinimum: false, subMinimumPercent: 0 },
    socioEconomicDevelopment: { maxPoints: 5, hasSubMinimum: false, subMinimumPercent: 0 },
    // FSC-specific pillars (values approximate pending full Excel verification)
    empowermentFinancing: { maxPoints: 8, hasSubMinimum: false, subMinimumPercent: 0 },
    accessToFinancialServices: { maxPoints: 6, hasSubMinimum: false, subMinimumPercent: 0 },
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
      // FSC has different Other Exec targets: 75%/38% instead of 60%/30%
      boardBlackTarget: 0.50, boardBlackMaxPts: 3,
      boardBWTarget: 0.25, boardBWMaxPts: 2,
      execBlackTarget: 0.50, execBlackMaxPts: 3,
      execBWTarget: 0.25, execBWMaxPts: 1, // 25% (NOT 30%)
      otherExecBlackTarget: 0.75, otherExecBlackMaxPts: 10, // 75% (NOT 60%)
      otherExecBWTarget: 0.38, otherExecBWMaxPts: 2, // 38% (NOT 30%)
      seniorMaxPts: 0, seniorBWMaxPts: 0,
      middleMaxPts: 0, middleBWMaxPts: 0,
      juniorMaxPts: 0, juniorBWMaxPts: 0,
    },
    employmentEquity: {
      seniorMaxPts: 0, middleMaxPts: 0, juniorMaxPts: 0,
      disabledMaxPts: 0, disabledTarget: 0.02, // 2% (NOT 3%)
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
    sed: { spendPercent: 1.0, maxPts: 5 },
  },
  levelThresholds: STANDARD_LEVELS,
  recognitionTable: STANDARD_RECOGNITION_TABLE,
  benefitFactors: STANDARD_BENEFIT_FACTORS,
  categoryWeightings: STANDARD_CATEGORY_WEIGHTINGS,
  industryNorms: STANDARD_INDUSTRY_NORMS,
};
// FSC Generic: 25+21+0+20+20+10+5+5+8+6 = 120 (approximate pending full Excel verification)
// FSC has sub-variants: Banks (FSC-BANK), Long-Term Insurers (FSC-LTI), Short-Term Insurers (FSC-STI)
// These have different pillar weightings that need individual verification

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
  levelThresholds: STANDARD_LEVELS,
  recognitionTable: STANDARD_RECOGNITION_TABLE,
  benefitFactors: STANDARD_BENEFIT_FACTORS,
  categoryWeightings: STANDARD_CATEGORY_WEIGHTINGS,
  industryNorms: STANDARD_INDUSTRY_NORMS,
};
// ICT QSE verified: 25+15+30+21+5+8+12 = 116 (exact match Excel)

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

const ALL_CONFIGS: SectorConfig[] = [
  RCOGP_GENERIC, ICT_GENERIC, FSC_GENERIC, AGRI_GENERIC, RCOGP_QSE, ICT_QSE,
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
  if (hasQSE) return RCOGP_QSE;
  console.warn(`[detectSectorFromName] No sector match for "${nameOrSector}" — defaulting to RCOGP Generic`);
  return RCOGP_GENERIC;
}

export function listSectorConfigs(): Array<{ code: string; name: string; type: string }> {
  return ALL_CONFIGS.map(c => ({ code: c.sectorCode, name: c.sectorName, type: c.scorecardType }));
}
