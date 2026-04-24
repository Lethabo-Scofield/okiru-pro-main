// User and Organization Types
export interface User {
  id: string;
  username: string;
  password: string;
  email: string | null;
  fullName: string | null;
  role: string;
  organizationId: string | null;
  profilePicture: string | null;
  createdAt: string;
}

export interface InsertUser {
  username: string;
  password: string;
  email?: string | null;
  fullName?: string | null;
  role?: string;
  organizationId?: string;
  profilePicture?: string | null;
}

export interface Organization {
  id: string;
  name: string;
  createdAt: string;
}

export interface InsertOrganization {
  name: string;
}

// Client Types
export interface Client {
  id: string;
  organizationId: string;
  name: string;
  financialYear: string;
  revenue: number;
  npat: number;
  leviableAmount: number;
  industrySector: string;
  eapProvince: string;
  industryNorm: number | null;
  logo: string | null;
  pipelineOverrides: unknown;
  createdAt: string;
}

export interface InsertClient {
  organizationId: string;
  name: string;
  financialYear: string;
  revenue?: number;
  npat?: number;
  leviableAmount?: number;
  industrySector?: string;
  eapProvince?: string;
  industryNorm?: number | null;
  logo?: string | null;
  pipelineOverrides?: unknown;
}

// Financial Year Types
export interface FinancialYear {
  id: string;
  clientId: string;
  year: string;
  revenue: number;
  npat: number;
  indicativeNpat: number | null;
  notes: string | null;
}

export interface InsertFinancialYear {
  clientId: string;
  year: string;
  revenue?: number;
  npat?: number;
  indicativeNpat?: number | null;
  notes?: string | null;
}

// Ownership Types
export interface Shareholder {
  id: string;
  clientId: string;
  name: string;
  blackOwnership: number;
  blackWomenOwnership: number;
  shares: number;
  shareValue: number;
}

export interface InsertShareholder {
  clientId: string;
  name: string;
  blackOwnership?: number;
  blackWomenOwnership?: number;
  shares?: number;
  shareValue?: number;
}

export interface OwnershipDataRow {
  id: string;
  clientId: string;
  companyValue: number;
  outstandingDebt: number;
  yearsHeld: number;
}

// Management Control Types
export interface Employee {
  id: string;
  clientId: string;
  name: string;
  gender: string;
  race: string;
  designation: string;
  isDisabled: boolean;
}

export interface InsertEmployee {
  clientId: string;
  name: string;
  gender: string;
  race: string;
  designation: string;
  isDisabled?: boolean;
}

// Skills Development Types
export interface TrainingProgram {
  id: string;
  clientId: string;
  name: string;
  category: string;
  cost: number;
  employeeId: string | null;
  isEmployed: boolean;
  isBlack: boolean;
}

export interface InsertTrainingProgram {
  clientId: string;
  name: string;
  category: string;
  cost?: number;
  employeeId?: string | null;
  isEmployed?: boolean;
  isBlack?: boolean;
}

// Procurement Types
export interface Supplier {
  id: string;
  clientId: string;
  name: string;
  beeLevel: number;
  blackOwnership: number;
  spend: number;
}

export interface InsertSupplier {
  clientId: string;
  name: string;
  beeLevel?: number;
  blackOwnership?: number;
  spend?: number;
}

export interface ProcurementDataRow {
  id: string;
  clientId: string;
  tmps: number;
}

// ESD and SED Contribution Types
export interface EsdContribution {
  id: string;
  clientId: string;
  beneficiary: string;
  type: string;
  amount: number;
  category: string;
}

export interface InsertEsdContribution {
  clientId: string;
  beneficiary: string;
  type: string;
  amount?: number;
  category: string;
}

export interface SedContribution {
  id: string;
  clientId: string;
  beneficiary: string;
  type: string;
  amount: number;
  category: string;
}

export interface InsertSedContribution {
  clientId: string;
  beneficiary: string;
  type: string;
  amount?: number;
  category: string;
}

// Scenario Types
export interface Scenario {
  id: string;
  clientId: string;
  name: string;
  snapshot: unknown;
  createdAt: string;
}

export interface InsertScenario {
  clientId: string;
  name: string;
  snapshot: unknown;
}

// Import/Export Log Types
export interface ImportLog {
  id: string;
  clientId: string | null;
  userId: string;
  fileName: string;
  status: string;
  sheetsFound: number;
  sheetsMatched: number;
  entitiesExtracted: number;
  errors: unknown;
  createdAt: string;
}

export interface InsertImportLog {
  userId: string;
  clientId?: string | null;
  fileName: string;
  status: string;
  sheetsFound?: number;
  sheetsMatched?: number;
  entitiesExtracted?: number;
  errors?: unknown;
}

export interface InsertExportLog {
  userId: string;
  clientId: string;
  exportType: string;
  fileName?: string | null;
}

export interface ExportLog {
  id: string;
  clientId: string;
  userId: string;
  exportType: string;
  fileName: string | null;
  createdAt: string;
}

// API Response Types
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

// Auth Types
export interface AuthSession {
  userId: string;
  organizationId: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
  fullName?: string;
  email?: string;
  organizationName?: string;
}

export interface AuthResponse {
  user: Omit<User, 'password'>;
  organization?: Organization;
}
