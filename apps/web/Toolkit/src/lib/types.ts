export interface FinancialYear {
  id: string;
  year: string;
  revenue: number;
  npat: number;
  indicativeNpat?: number;
  notes?: string;
}

export interface Client {
  id: string;
  name: string;
  tradingName?: string;                    // DBA name
  
  // Registration numbers
  registrationNumber: string;            // CIPC number
  vatNumber?: string;                    // SARS VAT number
  taxNumber?: string;                    // SARS income tax number
  
  // Addresses
  physicalAddress: string;
  postalAddress?: string;
  
  // Contact details
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  
  // BEE specifics
  sectorCode: 'RCOGP' | 'ICT' | 'FSC' | 'AGRI' | 'TOURISM' | 'CONSTRUCTION' | 'MINING' | 'OTHER';
  industry: string;                     // For industry norm lookup
  
  // Financials
  financialYear: string;
  measurementPeriodStart?: string;
  measurementPeriodEnd?: string;
  revenue: number;
  npat: number;
  leviableAmount: number;
  
  // Classification (auto-computed from turnover/employees)
  companySize: 'EME' | 'QSE' | 'Generic';
  annualTurnover: number;
  numberOfEmployees: number;
  
  // EAP targeting
  eapProvince: 'National' | 'Western Cape' | 'Eastern Cape' | 'Northern Cape' | 'Free State' | 'KwaZulu-Natal' | 'KZN' | 'North West' | 'Gauteng' | 'Mpumalanga' | 'Limpopo';
  industryNorm?: number;
  
  // Financial history
  financialHistory: FinancialYear[];
  
  // Verification details
  beeCertificateNumber?: string;
  beeCertificateExpiry?: string;
  beeCertificateLevel?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  meProvider?: string;                  // Measured Entity verification agency
  verificationAgency?: string;
}

export interface Shareholder {
  id: string;
  name: string;
  shareholderId?: string;              // ID/Registration Number
  ownershipType: 'shareholder' | 'sale_of_assets' | 'equity_equivalent';
  
  // Ownership percentages (can be different from voting/economic)
  blackOwnership: number;
  blackWomenOwnership: number;
  
  // NEW: Separate voting and economic interest
  votingRightsPercent: number;         // Can differ from ownership %
  economicInterestPercent: number;      // Can differ from ownership %
  
  // NEW: Designated group (orphans, youth, military, disability)
  isDesignatedGroup: boolean;
  designatedGroupType?: 'youth' | 'orphan' | 'disabled' | 'military';
  
  // Graduation tracking
  blackNewEntrant?: boolean;
  yearsHeld?: number;                  // For graduation factor calculation
  graduationFactor?: number;            // 1.0 (0-1yr), 0.9 (2-3yr), 0.8 (4-5yr), 0.7 (6-10yr)
  
  // Shares and value
  shares: number;
  shareValue: number;
}

export interface OwnershipData {
  id: string;
  clientId: string;
  shareholders: Shareholder[];
  companyValue: number;
  outstandingDebt: number;
  yearsHeld: number;
  
  // NEW: Valuation details
  valuationDate?: string;
  valuationMethod?: 'independent' | 'internal' | 'last_financial';
  
  // NEW: Recognition info
  ownershipScorePoints: number;
  ownershipScorePercent: number;        // 0-25 points
  netValuePoints: number;                 // 0-7 points
  netValuePercent: number;
}

export interface Employee {
  id: string;
  name: string;
  idNumber?: string;              // SA ID for EAP validation
  gender: 'Male' | 'Female';
  race: 'African' | 'Coloured' | 'Indian' | 'White';
  designation: 'Board' | 'Executive' | 'Executive Director' | 'Other Executive Management' | 'Senior' | 'Middle' | 'Junior' | 'Skilled Technical' | 'Semi-skilled' | 'Unskilled';
  isDisabled: boolean;
  isForeign: boolean;               // Critical: excludes from BEE calcs
  province?: 'Gauteng' | 'Western Cape' | 'KZN' | 'Eastern Cape' | 'Free State' | 'Limpopo' | 'Mpumalanga' | 'North West' | 'Northern Cape' | 'National';
  hireDate?: string;
  terminationDate?: string;
  
  // Computed fields for measurement period
  isActiveDuringMeasurement?: boolean;
}

export interface ManagementData {
  id: string;
  clientId: string;
  employees: Employee[];
}

export type TrainingCategoryCode = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

export interface TrainingProgram {
  id: string;
  // Program identification
  programName: string;
  trainingProvider?: string;
  categoryCode: TrainingCategoryCode;

  // Learner identification
  learnerName: string;
  learnerIdNumber?: string;
  employeeId?: string;  // Links to Management Control employee

  // Demographics
  gender: 'Male' | 'Female';
  race: 'African' | 'Coloured' | 'Indian' | 'White';
  isDisabled: boolean;
  isForeign: boolean;  // Excludes from BEE calcs if true

  // Employment status
  employmentStatus: 'Permanent' | 'Fixed-Term' | 'Unemployed';

  // YES 4 Youth linkage
  isYesEmployee: boolean;
  isCompleted: boolean;
  isAbsorbed: boolean;

  // Dates
  transactionDate: string;  // Invoice/transaction date
  startDate?: string;
  endDate?: string;

  // Cost breakdown (per toolkit)
  courseCost: number;
  travelCost: number;
  accommodationCost: number;
  cateringCost: number;
  stationeryCost: number;
  facilityCost: number;
  salaryCost: number;  // Stipends for B/C/D
  otherCosts: number;

  // Total cost (computed)
  totalCost?: number;

  // Flags
  isAbet: boolean;
  isMandatory: boolean;
  isBursary: boolean;  // Explicit bursary flag

  // Legacy fields (for backward compatibility)
  name?: string;  // Deprecated: use programName
  category?: 'bursary' | 'learnership' | 'internship' | 'short_course' | 'other';  // Deprecated
  cost?: number;  // Deprecated: use totalCost
  isEmployed?: boolean;  // Deprecated: use employmentStatus
  isBlack?: boolean;  // Deprecated: computed from race
}

export interface SkillsData {
  id: string;
  clientId: string;
  leviableAmount: number;
  trainingPrograms: TrainingProgram[];
  
  // Tracking for YES absorption (cross-pillar linkage)
  yesCandidatesCount: number;  // From isYesEmployee flag
  yesAbsorbedCount: number;    // From isAbsorbed flag
}

// YES 4 Youth Initiative
export interface YESCandidate {
  id: string;
  name: string;
  idNumber?: string;
  race: 'African' | 'Coloured' | 'Indian' | 'White';
  gender: 'Male' | 'Female';
  isDisabled: boolean;
  isBlack: boolean;  // Computed: African/Coloured/Indian

  // Employment dates
  startDate: string;
  endDate?: string;
  
  // Absorption status
  isAbsorbed: boolean;
  absorptionDate?: string;
  
  // Cost tracking
  cost: number;
  
  // Links to skills intervention
  trainingInterventionId?: string;
}

export interface YESData {
  id: string;
  clientId: string;
  
  // Target calculation (based on total employees)
  totalEmployees: number;        // From Management Control
  yesHeadcountTarget: number;    // <500 = 2.5%, 500-1000 = 1.5%, >1000 = 1%
  
  // Youth enrolled
  candidates: YESCandidate[];
  yesYouthEnrolled: number;
  yesBlackYouthCount: number;    // For 50% threshold check
  yesBlackYouthPercentage: number;
  
  // Absorption
  yesAbsorbedCount: number;
  yesAbsorptionRate: number;     // absorbed / enrolled
  
  // Cost tracking
  totalYesCost: number;
  yesCostPerCandidate: number;
  
  // Tier achievement
  yesTierAchieved: 'None' | 'Tier 1' | 'Tier 2' | 'Tier 3';
  
  // BEE level impact
  yesBeeLevelIncrease: number;   // 0, 1, or 2 levels
  qualifiesForLevelUplift: boolean;  // Requires 50% black youth for Tier 1/2
}

export interface Supplier {
  id: string;
  name: string;
  vatNumber?: string;                    // VAT number for verification
  beeLevel: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 0;
  
  // Ownership details
  blackOwnership: number;
  blackWomenOwnership: number;
  youthOwnership: number;
  disabledOwnership: number;
  flowThroughOwnership?: number;         // For trusts - flow-through percentage
  designatedGroupOwnership?: number;     // For PROC-DG recognition
  
  // Enterprise size
  enterpriseType: 'eme' | 'qse' | 'generic';
  
  // Supplier status
  isEmpoweringSupplier: boolean;         // Mandatory for Generic/QSE
  isSupplierDevRecipient: boolean;       // Links to ESD
  hasThreeYearContract: boolean;         // For graduation bonus
  
  // Dates
  firstProcurementDate?: string;
  sizeAtFirstProcurement?: 'eme' | 'qse' | 'generic';  // For graduation bonus
  certificateExpiryDate?: string;
  
  // Spend
  spend: number;
  location?: 'local' | 'provincial' | 'national' | 'imported';
  
  // Benefits for bonus points
  jobsCreated?: number;
  
  // Foreign supplier indicator (Issue 3)
  isForeignSupplier?: boolean;
}

export interface ProcurementData {
  id: string;
  clientId: string;
  tmps: number;
  tmpsManualOverride?: boolean;
  suppliers: Supplier[];
  // Note: graduation/jobs bonuses removed - these are ED only (Issue 3)
}

// Expanded SED contribution types per toolkit
export type SEDContributionType = 
  | 'grant'
  | 'direct_cost'
  | 'discounts'
  | 'overhead_costs'
  | 'professional_services_free'
  | 'professional_services_discounted'
  | 'employee_time';

// ESD contribution types per toolkit
export type ESDContributionType =
  | 'equity_investment'
  | 'loan'
  | 'interest_free_loan'
  | 'lower_interest_loan'
  | 'guarantee'
  | 'collateral'
  | 'credit_facility'
  | 'direct_cost'
  | 'overhead_costs'
  | 'professional_services_free'
  | 'professional_services_discounted'
  | 'employee_secondment'
  | 'employee_mentorship'
  | 'non_core_business_transfer';

export interface Contribution {
  id: string;
  beneficiary: string;
  description?: string;
  
  // Type depends on category
  type: SEDContributionType | ESDContributionType;
  
  amount: number;
  category: 'supplier_development' | 'enterprise_development' | 'socio_economic';
  
  // NEW: For SED weighting
  blackBenefitPercent?: number;          // 0-100%, critical for SED scoring
  
  // NEW: Transaction date
  transactionDate?: string;
  
  // NEW: Location tracking
  province?: string;
  businessUnit?: string;
  
  // NEW: For SED demographic tracking
  beneficiaryCount?: {
    africanMale: number;
    africanFemale: number;
    colouredMale: number;
    colouredFemale: number;
    indianMale: number;
    indianFemale: number;
  };
  
  // NEW: Benefit factor for ESD (for NDI scoring)
  benefitFactor?: number;                  // 1x, 3x, or 5x multiplier
}

export interface ESDData {
  id: string;
  clientId: string;
  contributions: Contribution[];
  graduationBonus: boolean;
  graduationEvidence?: string;
  jobsCreatedBonus: boolean;
  jobsCreatedCount?: number;
  jobsCreatedEvidence?: string;
}

export interface SEDData {
  id: string;
  clientId: string;
  contributions: Contribution[];
}

export interface PillarScore {
  score: number;
  target: number;
  weighting: number;
  subMinimumMet?: boolean;
}

export interface ScorecardResult {
  ownership: PillarScore & { subMinimumMet: boolean };
  managementControl: PillarScore;
  skillsDevelopment: PillarScore & { subMinimumMet: boolean };
  procurement: PillarScore & { subMinimumMet: boolean };
  supplierDevelopment: PillarScore & { subMinimumMet: boolean };
  enterpriseDevelopment: PillarScore & { subMinimumMet: boolean };
  socioEconomicDevelopment: PillarScore;
  yesInitiative: PillarScore;
  total: PillarScore;
  achievedLevel: number;
  discountedLevel: number;
  isDiscounted: boolean;
  recognitionLevel: string;
}
