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
  /**
   * FSC sub-sector picker (Bug #6). Drives EF + AFS pillar routing.
   * Others = FS700 (generic, no EF/AFS). Banks = FS701. LTI = FS702. STI = FS703.
   */
  fscSubSector?: 'Others' | 'Banks' | 'LTI' | 'STI';
  /** FSC Reinsurer flag — reduces Consumer Education to Additional CE (1 pt, no CE bonus). */
  fscReinsurer?: boolean;
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
  scorecardType?: 'EME' | 'QSE' | 'Generic' | 'Contractor' | 'BEP';
  annualTurnover: number;
  numberOfEmployees: number;
  
  // EAP targeting
  eapProvince: 'National' | 'Western Cape' | 'Eastern Cape' | 'Northern Cape' | 'Free State' | 'KwaZulu-Natal' | 'KZN' | 'North West' | 'Gauteng' | 'Mpumalanga' | 'Limpopo';
  /**
   * CEE report vintage the MC/Skills EAP targets score against (e.g. 2026 =
   * 26th CEE Report pp.33-34, QLFS Q3 2025). Undefined = latest ingested year.
   * Pinned on legacy fixtures/workbooks produced under an older CEE dataset.
   */
  eapYear?: number;
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
  // Widened from the closed union: the workbook grid carries free-text types
  // (ESOP / BBOS / trust …) that the ownership calculator reads for the
  // scheme-bonus evidence check.
  ownershipType: 'shareholder' | 'sale_of_assets' | 'equity_equivalent' | (string & {});
  
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

  // Remuneration & control (optional)
  annualSalary?: number;          // Total annual salary / cost to company
  votingRightsPercent?: number;   // % of voting rights held (0-100)

  // Computed fields for measurement period
  isActiveDuringMeasurement?: boolean;
}

export interface ManagementData {
  id: string;
  clientId: string;
  employees: Employee[];
  /** When true, merge Other Executive + Senior Management into one MC band (toolkit toggle). */
  combineExcoSenior?: boolean;
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

  // Location
  municipality?: string;  // Municipality / district where training delivered

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

  /** Entity headcount (grey cell) — LAI / absorption / headcount-based indicators. */
  headcount?: number;
  /** Group-level leviable amount when measuring at group level (grey cell). */
  groupLeviableAmount?: number;
  /** Training manager / SDF salary — capped at 15% of total skills spend each. */
  trainingManagerSalary?: number;
  /** Training overhead — capped at 15% of total skills spend each. */
  trainingOverheadCost?: number;
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
  registrationNumber?: string;           // Company registration number (optional)
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

  // Explicit designated-group flag (workbook captures a boolean; the Toolkit form
  // also derives DG from youth/disabled ownership). Used by the procurement DG line.
  isDesignatedGroup?: boolean;
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

  // Construction-specific beneficiary flags (Phase 1 wiring — see docs/construction-wiring-spec.md)
  isBlackWomenOwnedBeneficiary?: boolean;  // ESD: ≥51% Black-Women-Owned SD beneficiary
  isStructuredProject?: boolean;           // SED: Structured SED Project
  isLimitedServicesCommunity?: boolean;    // SED: Community with Limited Services
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
  /**
   * Jobs created as a fraction of the prior-year workforce. Drives the ICT
   * two-tier jobs bonus: < 0.11 (≤10%) → 1 pt, ≥ 0.11 (≥11%) → 2 pts.
   * Only applied when the sector config sets esd.edJobsBonusMax ≥ 2.
   */
  jobsCreatedPercent?: number;
  /**
   * FSC-only: recognised (benefit-adjusted) ED spend supporting black
   * stockbrokers / fund managers / intermediaries. Scored against 0.5% of NPAT
   * for the separate 2-pt FSC stockbroker bonus.
   */
  stockbrokerSpend?: number;
}

export interface SEDData {
  id: string;
  clientId: string;
  contributions: Contribution[];
  /** FSC Consumer Education aggregate inputs (sed section meta — not SED rows). */
  ceSpend?: number;
  ceBonusSpend?: number;
  fundisaSpend?: number;
}

/**
 * FSC Access to Financial Services input data.
 * Fields are sub-sector-specific; only the relevant fields for the active sub-sector
 * need to be populated. Unused fields are ignored by the calculator.
 */
export interface AfsData {
  id: string;
  clientId: string;
  // ---- Banks (FS701) ----
  /** % of qualifying area with a Transaction Point within 5km (target 85%). */
  transactionPointCoverage?: number;
  /** % of qualifying area with a Service Point within 10km (target 70%). */
  servicePointCoverage?: number;
  /** % of qualifying area with a Sales Point within 15km (target 60%). */
  salesPointCoverage?: number;
  /** % of account holders with Electronic Access (target: national — treated as yes/no). */
  electronicAccessCompliant?: boolean;
  /** At least one Point of Presence per measurement unit in Target Market. */
  hasPointOfPresence?: boolean;
  /** Sufficient active accounts with Qualifying Products in Target Market. */
  activeAccountsCompliant?: boolean;
  // ---- Long-Term Insurers (FS702) ----
  /** Number of developed products that are compliant (Appropriate Products numerator). */
  appropriateProductsNumerator?: number;
  /** Total number of developed products (Appropriate Products denominator). */
  appropriateProductsDenominator?: number;
  /** Number of on-book policies (Market Penetration numerator). */
  marketPenetrationPolicies?: number;
  /** SAIA communicated reference number of policies (denominator). */
  saiaCommunicatedPolicies?: number;
  /** % of polygons covered (Transactional Accesses; target 80%). */
  transactionalAccessCoverage?: number;
  // ---- Short-Term Insurers (FS703) ----
  commercialEquipment?: boolean;
  commercialLiability?: boolean;
  commercialProperty?: boolean;
  commercialAgriculture?: boolean;
  commercialLivestock?: boolean;
  commercialOther?: boolean;
  /** Meets the Insurance Policies target (yes/no simplified from SAIA policy count). */
  insurancePoliciesCompliant?: boolean;
}

/**
 * One Empowerment Financing facility / transaction row, as captured by the
 * BEE information-gathering workbook ("Empowerment Financing" sheet:
 * Facility | EF Category | Counterparty | Date | Rand Value Advanced (R) |
 * Outstanding Balance (R) | Qualifying %).
 */
export interface EfFacility {
  id: string;
  name: string;
  /** EF Category — Targeted-Investment categories (Transformational
   * Infrastructure, Affordable Housing, Agricultural Development, Black SME
   * Financing) vs Transaction-Financing/Risk-Capital categories (B-BBEE
   * Transaction Financing, Black Business Growth / PE). */
  category: string;
  /** Rand Value Advanced (R). */
  valueAdvanced: number;
  outstandingBalance?: number;
  /** Qualifying % (0–100). Left unset when the workbook doesn't state it —
   * never fabricated (unstated qualification scores 0, mirroring AFS). */
  qualifyingPercent?: number;
  date?: string;
}

/**
 * FSC Banks (FS701) / Long-Term Insurers (FS702) Empowerment Financing inputs.
 * Two shapes, both grounded in the master template / gathering workbook:
 * - Template-exact scalars + Transaction Financing table (EF & ESD Scorecard -
 *   Banks/Long Term sheets + tblTransactionFinancingData) — preferred when present.
 * - Gathering-workbook facility table (EfFacility rows) — achieved/target derived
 *   as the qualifying-weighted fraction of the declared EF portfolio.
 */
export interface EmpowermentFinancingData {
  id: string;
  clientId: string;
  // ---- Template-exact scalar inputs ----
  /** Banks C5: Balance Sheet Exposure (TI target component). */
  balanceSheetExposure?: number;
  /** Banks C6: Additional Targeted Investment exposure (TI target component). */
  additionalTiExposure?: number;
  /** Banks C7/D7: Balance Sheet Exposure relating to new loans written (TI achieved). */
  newLoansExposure?: number;
  /** LTI C5: Qualifying Exposure (TI target). */
  qualifyingExposure?: number;
  /** LTI C6: Portion of targeted investment target (TI achieved). */
  targetedInvestmentPortion?: number;
  /** Banks C9 / LTI C8: Portion of B-BBEE Transaction Financing and Risk Capital (TF target). */
  tfPortfolioValue?: number;
  /** Template tblTransactionFinancingData rows (plain SUM of Value = TF achieved). */
  tfTransactions?: Array<{ value: number; endOfMonth?: string }>;
  // ---- Gathering-workbook facility table ----
  facilities?: EfFacility[];
}

/** One line of a pillar's scored breakdown, emitted by the calculator that
 *  produced the pillar score (so the breakdown always reconciles to the total,
 *  even for sectors whose scoring calculator differs from the generic one). */
export interface BreakdownLine {
  name: string;
  target: string;
  weighting: number;
  score: number;
  isBonus?: boolean;
  /** Methodology note attached to this line (e.g. why a bonus scored 0). */
  note?: string;
}

export interface PillarScore {
  score: number;
  target: number;
  weighting: number;
  subMinimumMet?: boolean;
  /** The scored breakdown, straight from the calculator that scored this pillar.
   *  When present the UI renders these verbatim instead of re-deriving lines
   *  from a (possibly different) generic calculator. */
  subLines?: BreakdownLine[];
  /** Coverage / methodology notes shown under the pillar (honest gaps, not scores). */
  coverageNotes?: string[];
}

export interface ScorecardResult {
  ownership: PillarScore & { subMinimumMet: boolean };
  managementControl: PillarScore;
  /** Separate EE pillar when sector config sets employmentEquity.maxPoints > 0 (e.g. Transport QSE). */
  employmentEquity?: PillarScore;
  skillsDevelopment: PillarScore & { subMinimumMet: boolean; isChosenElective?: boolean; isElectiveNotChosen?: boolean };
  procurement: PillarScore & { subMinimumMet: boolean; isChosenElective?: boolean; isElectiveNotChosen?: boolean };
  supplierDevelopment: PillarScore & { subMinimumMet: boolean };
  enterpriseDevelopment: PillarScore & { subMinimumMet: boolean; isChosenElective?: boolean; isElectiveNotChosen?: boolean };
  socioEconomicDevelopment: PillarScore & { isChosenElective?: boolean; isElectiveNotChosen?: boolean };
  yesInitiative: PillarScore;
  /** FSC Banks/LTI — Empowerment Financing & ESD combined pillar (FS701/FS702 only). */
  empowermentFinancing?: PillarScore;
  /** FSC Banks/LTI/STI — Access to Financial Services pillar (12 pts, FS701/702/703 only). */
  accessToFinancialServices?: PillarScore;
  total: PillarScore;
  achievedLevel: number;
  discountedLevel: number;
  isDiscounted: boolean;
  recognitionLevel: string;
  /**
   * Set when the Amended Codes' deemed-level floor determined the final level
   * (EME automatic Level 4; ≥51%/100% black-owned EME/QSE → Level 2/1 via
   * annual sworn affidavit). The reason is display text — the level did not
   * come from scorecard points and must never read as if it did.
   */
  deemedLevel?: number;
  deemedLevelReason?: string;
  /** Transport QSE: which elective pillar was auto-selected (highest score). */
  chosenElectivePillar?: string | null;
}
