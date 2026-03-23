import type {
  User, InsertUser, Organization, InsertOrganization,
  Client, InsertClient, PaginatedResponse,
  Shareholder, InsertShareholder,
  OwnershipDataRow,
  Employee, InsertEmployee,
  TrainingProgram, InsertTrainingProgram,
  Supplier, InsertSupplier,
  ProcurementDataRow,
  EsdContribution, InsertEsdContribution,
  SedContribution, InsertSedContribution,
  Scenario, InsertScenario,
  FinancialYear, InsertFinancialYear,
  ImportLog, InsertImportLog,
  ExportLog, InsertExportLog,
} from "../../schema.js";

export interface IUserRepository {
  findById(id: string): Promise<User | undefined>;
  findByUsername(username: string): Promise<User | undefined>;
  create(data: InsertUser & { organizationId?: string }): Promise<User>;
  updateProfile(id: string, data: Partial<{ fullName: string; email: string; profilePicture: string }>): Promise<User | undefined>;
}

export interface IOrganizationRepository {
  findById(id: string): Promise<Organization | undefined>;
  create(data: InsertOrganization): Promise<Organization>;
}

export interface IClientRepository {
  findById(id: string): Promise<Client | undefined>;
  findByOrg(orgId: string): Promise<Client[]>;
  findByOrgPaginated(orgId: string, page: number, limit: number): Promise<PaginatedResponse<Client>>;
  create(data: InsertClient): Promise<Client>;
  update(id: string, data: Partial<InsertClient>): Promise<Client | undefined>;
  delete(id: string): Promise<void>;
}

export interface IShareholderRepository {
  findByClient(clientId: string): Promise<Shareholder[]>;
  create(data: InsertShareholder): Promise<Shareholder>;
  update(id: string, data: Partial<InsertShareholder>): Promise<Shareholder | undefined>;
  delete(id: string): Promise<void>;
}

export interface IOwnershipRepository {
  findByClient(clientId: string): Promise<OwnershipDataRow | undefined>;
  upsert(clientId: string, data: { companyValue?: number; outstandingDebt?: number; yearsHeld?: number }): Promise<OwnershipDataRow>;
}

export interface IEmployeeRepository {
  findByClient(clientId: string): Promise<Employee[]>;
  create(data: InsertEmployee): Promise<Employee>;
  delete(id: string): Promise<void>;
}

export interface ITrainingRepository {
  findByClient(clientId: string): Promise<TrainingProgram[]>;
  create(data: InsertTrainingProgram): Promise<TrainingProgram>;
  delete(id: string): Promise<void>;
}

export interface ISupplierRepository {
  findByClient(clientId: string): Promise<Supplier[]>;
  create(data: InsertSupplier): Promise<Supplier>;
  delete(id: string): Promise<void>;
}

export interface IProcurementRepository {
  findByClient(clientId: string): Promise<ProcurementDataRow | undefined>;
  upsert(clientId: string, tmps: number): Promise<ProcurementDataRow>;
}

export interface IContributionRepository {
  findEsdByClient(clientId: string): Promise<EsdContribution[]>;
  createEsd(data: InsertEsdContribution): Promise<EsdContribution>;
  deleteEsd(id: string): Promise<void>;
  findSedByClient(clientId: string): Promise<SedContribution[]>;
  createSed(data: InsertSedContribution): Promise<SedContribution>;
  deleteSed(id: string): Promise<void>;
}

export interface IScenarioRepository {
  findByClient(clientId: string): Promise<Scenario[]>;
  create(data: InsertScenario): Promise<Scenario>;
  delete(id: string): Promise<void>;
}

export interface IFinancialYearRepository {
  findByClient(clientId: string): Promise<FinancialYear[]>;
  create(data: InsertFinancialYear): Promise<FinancialYear>;
  delete(id: string): Promise<void>;
}

export interface ILogRepository {
  createImportLog(data: InsertImportLog): Promise<ImportLog>;
  getImportLogsByUser(userId: string): Promise<ImportLog[]>;
  getImportLogsByUserPaginated(userId: string, page: number, limit: number): Promise<PaginatedResponse<ImportLog>>;
  createExportLog(data: InsertExportLog): Promise<ExportLog>;
  getExportLogs(clientId: string): Promise<ExportLog[]>;
}
