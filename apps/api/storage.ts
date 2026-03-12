import { v4 as uuid } from "uuid";
import {
  UserModel, OrganizationModel, ClientModel, FinancialYearModel,
  ShareholderModel, OwnershipDataModel, EmployeeModel, TrainingProgramModel,
  SupplierModel, ProcurementDataModel, EsdContributionModel, SedContributionModel,
  ScenarioModel, ImportLogModel, ExportLogModel,
} from "./models.js";
import type {
  User, InsertUser, Organization, InsertOrganization,
  Client, InsertClient, Shareholder, InsertShareholder,
  OwnershipDataRow, Employee, InsertEmployee,
  TrainingProgram, InsertTrainingProgram,
  Supplier, InsertSupplier, ProcurementDataRow,
  EsdContribution, InsertEsdContribution,
  SedContribution, InsertSedContribution,
  Scenario, InsertScenario, ImportLog, ExportLog, FinancialYear,
} from "./schema.js";

function clean<T>(doc: any): T {
  if (!doc) return doc;
  const obj = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  delete obj._id;
  delete obj.__v;
  return obj as T;
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser & { organizationId?: string }): Promise<User>;
  updateUser(id: string, data: Partial<{ fullName: string; email: string; profilePicture: string }>): Promise<User | undefined>;

  createOrganization(org: InsertOrganization): Promise<Organization>;
  getOrganization(id: string): Promise<Organization | undefined>;

  getClientsByOrg(orgId: string): Promise<Client[]>;
  getClient(id: string): Promise<Client | undefined>;
  createClient(client: InsertClient): Promise<Client>;
  updateClient(id: string, data: Partial<InsertClient>): Promise<Client | undefined>;
  deleteClient(id: string): Promise<void>;

  getFinancialYears(clientId: string): Promise<FinancialYear[]>;
  createFinancialYear(data: any): Promise<FinancialYear>;
  deleteFinancialYear(id: string): Promise<void>;

  getShareholdersByClient(clientId: string): Promise<Shareholder[]>;
  createShareholder(data: InsertShareholder): Promise<Shareholder>;
  updateShareholder(id: string, data: Partial<InsertShareholder>): Promise<Shareholder | undefined>;
  deleteShareholder(id: string): Promise<void>;

  getOwnershipData(clientId: string): Promise<OwnershipDataRow | undefined>;
  upsertOwnershipData(clientId: string, data: { companyValue?: number; outstandingDebt?: number; yearsHeld?: number }): Promise<OwnershipDataRow>;

  getEmployeesByClient(clientId: string): Promise<Employee[]>;
  createEmployee(data: InsertEmployee): Promise<Employee>;
  deleteEmployee(id: string): Promise<void>;

  getTrainingProgramsByClient(clientId: string): Promise<TrainingProgram[]>;
  createTrainingProgram(data: InsertTrainingProgram): Promise<TrainingProgram>;
  deleteTrainingProgram(id: string): Promise<void>;

  getSuppliersByClient(clientId: string): Promise<Supplier[]>;
  createSupplier(data: InsertSupplier): Promise<Supplier>;
  deleteSupplier(id: string): Promise<void>;

  getProcurementData(clientId: string): Promise<ProcurementDataRow | undefined>;
  upsertProcurementData(clientId: string, tmps: number): Promise<ProcurementDataRow>;

  getEsdContributions(clientId: string): Promise<EsdContribution[]>;
  createEsdContribution(data: InsertEsdContribution): Promise<EsdContribution>;
  deleteEsdContribution(id: string): Promise<void>;

  getSedContributions(clientId: string): Promise<SedContribution[]>;
  createSedContribution(data: InsertSedContribution): Promise<SedContribution>;
  deleteSedContribution(id: string): Promise<void>;

  getScenariosByClient(clientId: string): Promise<Scenario[]>;
  createScenario(data: InsertScenario): Promise<Scenario>;
  deleteScenario(id: string): Promise<void>;

  createImportLog(data: any): Promise<ImportLog>;
  getImportLogs(clientId: string): Promise<ImportLog[]>;
  getImportLogsByUser(userId: string): Promise<ImportLog[]>;

  createExportLog(data: any): Promise<ExportLog>;
  getExportLogs(clientId: string): Promise<ExportLog[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const doc = await UserModel.findOne({ id }).lean();
    return doc ? clean<User>(doc) : undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const doc = await UserModel.findOne({ username }).lean();
    return doc ? clean<User>(doc) : undefined;
  }

  async createUser(insertUser: InsertUser & { organizationId?: string }): Promise<User> {
    const doc = await UserModel.create({ id: uuid(), ...insertUser });
    return clean<User>(doc);
  }

  async updateUser(id: string, data: Partial<{ fullName: string; email: string; profilePicture: string }>): Promise<User | undefined> {
    const doc = await UserModel.findOneAndUpdate({ id }, { $set: data }, { new: true }).lean();
    return doc ? clean<User>(doc) : undefined;
  }

  async createOrganization(org: InsertOrganization): Promise<Organization> {
    const doc = await OrganizationModel.create({ id: uuid(), ...org });
    return clean<Organization>(doc);
  }

  async getOrganization(id: string): Promise<Organization | undefined> {
    const doc = await OrganizationModel.findOne({ id }).lean();
    return doc ? clean<Organization>(doc) : undefined;
  }

  async getClientsByOrg(orgId: string): Promise<Client[]> {
    const docs = await ClientModel.find({ organizationId: orgId }).lean();
    return docs.map((d) => clean<Client>(d));
  }

  async getClient(id: string): Promise<Client | undefined> {
    const doc = await ClientModel.findOne({ id }).lean();
    return doc ? clean<Client>(doc) : undefined;
  }

  async createClient(client: InsertClient): Promise<Client> {
    const doc = await ClientModel.create({ id: uuid(), ...client });
    return clean<Client>(doc);
  }

  async updateClient(id: string, data: Partial<InsertClient>): Promise<Client | undefined> {
    const doc = await ClientModel.findOneAndUpdate({ id }, { $set: data }, { returnDocument: 'after' }).lean();
    return doc ? clean<Client>(doc) : undefined;
  }

  async deleteClient(id: string): Promise<void> {
    await ClientModel.deleteOne({ id });
  }

  async getFinancialYears(clientId: string): Promise<FinancialYear[]> {
    const docs = await FinancialYearModel.find({ clientId }).lean();
    return docs.map((d) => clean<FinancialYear>(d));
  }

  async createFinancialYear(data: any): Promise<FinancialYear> {
    const doc = await FinancialYearModel.create({ id: uuid(), ...data });
    return clean<FinancialYear>(doc);
  }

  async deleteFinancialYear(id: string): Promise<void> {
    await FinancialYearModel.deleteOne({ id });
  }

  async getShareholdersByClient(clientId: string): Promise<Shareholder[]> {
    const docs = await ShareholderModel.find({ clientId }).lean();
    return docs.map((d) => clean<Shareholder>(d));
  }

  async createShareholder(data: InsertShareholder): Promise<Shareholder> {
    const doc = await ShareholderModel.create({ id: uuid(), ...data });
    return clean<Shareholder>(doc);
  }

  async updateShareholder(id: string, data: Partial<InsertShareholder>): Promise<Shareholder | undefined> {
    const doc = await ShareholderModel.findOneAndUpdate({ id }, { $set: data }, { returnDocument: 'after' }).lean();
    return doc ? clean<Shareholder>(doc) : undefined;
  }

  async deleteShareholder(id: string): Promise<void> {
    await ShareholderModel.deleteOne({ id });
  }

  async getOwnershipData(clientId: string): Promise<OwnershipDataRow | undefined> {
    const doc = await OwnershipDataModel.findOne({ clientId }).lean();
    return doc ? clean<OwnershipDataRow>(doc) : undefined;
  }

  async upsertOwnershipData(clientId: string, data: { companyValue?: number; outstandingDebt?: number; yearsHeld?: number }): Promise<OwnershipDataRow> {
    const doc = await OwnershipDataModel.findOneAndUpdate(
      { clientId },
      { $set: data, $setOnInsert: { id: uuid(), clientId } },
      { upsert: true, returnDocument: 'after' }
    ).lean();
    return clean<OwnershipDataRow>(doc!);
  }

  async getEmployeesByClient(clientId: string): Promise<Employee[]> {
    const docs = await EmployeeModel.find({ clientId }).lean();
    return docs.map((d) => clean<Employee>(d));
  }

  async createEmployee(data: InsertEmployee): Promise<Employee> {
    const doc = await EmployeeModel.create({ id: uuid(), ...data });
    return clean<Employee>(doc);
  }

  async deleteEmployee(id: string): Promise<void> {
    await EmployeeModel.deleteOne({ id });
  }

  async getTrainingProgramsByClient(clientId: string): Promise<TrainingProgram[]> {
    const docs = await TrainingProgramModel.find({ clientId }).lean();
    return docs.map((d) => clean<TrainingProgram>(d));
  }

  async createTrainingProgram(data: InsertTrainingProgram): Promise<TrainingProgram> {
    const doc = await TrainingProgramModel.create({ id: uuid(), ...data });
    return clean<TrainingProgram>(doc);
  }

  async deleteTrainingProgram(id: string): Promise<void> {
    await TrainingProgramModel.deleteOne({ id });
  }

  async getSuppliersByClient(clientId: string): Promise<Supplier[]> {
    const docs = await SupplierModel.find({ clientId }).lean();
    return docs.map((d) => clean<Supplier>(d));
  }

  async createSupplier(data: InsertSupplier): Promise<Supplier> {
    const doc = await SupplierModel.create({ id: uuid(), ...data });
    return clean<Supplier>(doc);
  }

  async deleteSupplier(id: string): Promise<void> {
    await SupplierModel.deleteOne({ id });
  }

  async getProcurementData(clientId: string): Promise<ProcurementDataRow | undefined> {
    const doc = await ProcurementDataModel.findOne({ clientId }).lean();
    return doc ? clean<ProcurementDataRow>(doc) : undefined;
  }

  async upsertProcurementData(clientId: string, tmps: number): Promise<ProcurementDataRow> {
    const doc = await ProcurementDataModel.findOneAndUpdate(
      { clientId },
      { $set: { tmps }, $setOnInsert: { id: uuid(), clientId } },
      { upsert: true, returnDocument: 'after' }
    ).lean();
    return clean<ProcurementDataRow>(doc!);
  }

  async getEsdContributions(clientId: string): Promise<EsdContribution[]> {
    const docs = await EsdContributionModel.find({ clientId }).lean();
    return docs.map((d) => clean<EsdContribution>(d));
  }

  async createEsdContribution(data: InsertEsdContribution): Promise<EsdContribution> {
    const doc = await EsdContributionModel.create({ id: uuid(), ...data });
    return clean<EsdContribution>(doc);
  }

  async deleteEsdContribution(id: string): Promise<void> {
    await EsdContributionModel.deleteOne({ id });
  }

  async getSedContributions(clientId: string): Promise<SedContribution[]> {
    const docs = await SedContributionModel.find({ clientId }).lean();
    return docs.map((d) => clean<SedContribution>(d));
  }

  async createSedContribution(data: InsertSedContribution): Promise<SedContribution> {
    const doc = await SedContributionModel.create({ id: uuid(), ...data });
    return clean<SedContribution>(doc);
  }

  async deleteSedContribution(id: string): Promise<void> {
    await SedContributionModel.deleteOne({ id });
  }

  async getScenariosByClient(clientId: string): Promise<Scenario[]> {
    const docs = await ScenarioModel.find({ clientId }).lean();
    return docs.map((d) => clean<Scenario>(d));
  }

  async createScenario(data: InsertScenario): Promise<Scenario> {
    const doc = await ScenarioModel.create({ id: uuid(), ...data });
    return clean<Scenario>(doc);
  }

  async deleteScenario(id: string): Promise<void> {
    await ScenarioModel.deleteOne({ id });
  }

  async createImportLog(data: any): Promise<ImportLog> {
    const { errors, ...rest } = data;
    const doc = await ImportLogModel.create({ id: uuid(), importErrors: errors ?? null, ...rest });
    const obj = clean<any>(doc);
    obj.errors = obj.importErrors ?? null;
    delete obj.importErrors;
    return obj as ImportLog;
  }

  async getImportLogs(clientId: string): Promise<ImportLog[]> {
    const docs = await ImportLogModel.find({ clientId }).lean();
    return docs.map((d) => {
      const obj = clean<any>(d);
      obj.errors = obj.importErrors ?? null;
      delete obj.importErrors;
      return obj as ImportLog;
    });
  }

  async getImportLogsByUser(userId: string): Promise<ImportLog[]> {
    const docs = await ImportLogModel.find({ userId }).sort({ createdAt: -1 }).limit(20).lean();
    return docs.map((d) => {
      const obj = clean<any>(d);
      obj.errors = obj.importErrors ?? null;
      delete obj.importErrors;
      return obj as ImportLog;
    });
  }

  async createExportLog(data: any): Promise<ExportLog> {
    const doc = await ExportLogModel.create({ id: uuid(), ...data });
    return clean<ExportLog>(doc);
  }

  async getExportLogs(clientId: string): Promise<ExportLog[]> {
    const docs = await ExportLogModel.find({ clientId }).lean();
    return docs.map((d) => clean<ExportLog>(d));
  }
}

export const storage = new DatabaseStorage();
