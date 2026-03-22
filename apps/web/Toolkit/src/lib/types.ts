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
  financialYear: string;
  measurementPeriodStart?: string;
  measurementPeriodEnd?: string;
  revenue: number;
  npat: number;
  leviableAmount: number;
  industrySector: string;
  eapProvince: 'Gauteng' | 'Western Cape' | 'KZN' | 'Eastern Cape' | 'National';
  industryNorm?: number;
  financialHistory: FinancialYear[];
}

export interface Shareholder {
  id: string;
  name: string;
  ownershipType: 'shareholder' | 'sale_of_assets' | 'equity_equivalent';
  blackOwnership: number;
  blackWomenOwnership: number;
  shares: number;
  shareValue: number;
  blackNewEntrant?: boolean;
}

export interface OwnershipData {
  id: string;
  clientId: string;
  shareholders: Shareholder[];
  companyValue: number;
  outstandingDebt: number;
  yearsHeld: number;
}

export interface Employee {
  id: string;
  name: string;
  gender: 'Male' | 'Female';
  race: 'African' | 'Coloured' | 'Indian' | 'White';
  designation: 'Board' | 'Executive' | 'Executive Director' | 'Other Executive Management' | 'Senior' | 'Middle' | 'Junior';
  isDisabled: boolean;
}

export interface ManagementData {
  id: string;
  clientId: string;
  employees: Employee[];
}

export type TrainingCategoryCode = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface TrainingProgram {
  id: string;
  name: string;
  category: 'bursary' | 'learnership' | 'internship' | 'short_course' | 'other';
  categoryCode: TrainingCategoryCode;
  cost: number;
  courseCost?: number;
  travelCost?: number;
  accommodationCost?: number;
  cateringCost?: number;
  employeeId?: string;
  isEmployed: boolean;
  isBlack: boolean;
  gender?: 'Male' | 'Female' | null;
  race?: 'African' | 'Coloured' | 'Indian' | 'White' | null;
  isDisabled: boolean;
  startDate?: string;
  endDate?: string;
}

export interface SkillsData {
  id: string;
  clientId: string;
  leviableAmount: number;
  trainingPrograms: TrainingProgram[];
}

export interface Supplier {
  id: string;
  name: string;
  beeLevel: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 0;
  blackOwnership: number;
  blackWomenOwnership: number;
  youthOwnership: number;
  disabledOwnership: number;
  enterpriseType: 'eme' | 'qse' | 'generic';
  spend: number;
  certificateExpiryDate?: string;
}

export interface ProcurementData {
  id: string;
  clientId: string;
  tmps: number;
  tmpsManualOverride?: boolean;
  suppliers: Supplier[];
  graduationBonus: boolean;
  graduationEvidence?: string;
  jobsCreatedBonus: boolean;
  jobsCreatedEvidence?: string;
}

export interface Contribution {
  id: string;
  beneficiary: string;
  type: 'grant' | 'interest_free_loan' | 'lower_interest_loan' | 'overhead_costs' | 'professional_services' | 'employee_time';
  amount: number;
  category: 'supplier_development' | 'enterprise_development' | 'socio_economic';
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
