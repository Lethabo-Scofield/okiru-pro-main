import mongoose, { Schema, Document } from "mongoose";
import { v4 as uuid } from "uuid";

const userSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  email: { type: String, default: null },
  fullName: { type: String, default: null },
  role: { type: String, default: "user" },
  organizationId: { type: String, default: null },
  profilePicture: { type: String, default: null },
  createdAt: { type: String, default: () => new Date().toISOString() },
}, { collection: "users" });

const organizationSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  name: { type: String, required: true },
  createdAt: { type: String, default: () => new Date().toISOString() },
}, { collection: "organizations" });

const clientSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  organizationId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  financialYear: { type: String, required: true },
  revenue: { type: Number, default: 0 },
  npat: { type: Number, default: 0 },
  leviableAmount: { type: Number, default: 0 },
  industrySector: { type: String, default: "Generic" },
  eapProvince: { type: String, default: "National" },
  industryNorm: { type: Number, default: null },
  logo: { type: String, default: null },
  pipelineOverrides: { type: Schema.Types.Mixed, default: null },
  createdAt: { type: String, default: () => new Date().toISOString() },
}, { collection: "clients" });

const financialYearSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  clientId: { type: String, required: true, index: true },
  year: { type: String, required: true },
  revenue: { type: Number, default: 0 },
  npat: { type: Number, default: 0 },
  indicativeNpat: { type: Number, default: null },
  notes: { type: String, default: null },
}, { collection: "financialYears" });

const shareholderSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  clientId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  blackOwnership: { type: Number, default: 0 },
  blackWomenOwnership: { type: Number, default: 0 },
  shares: { type: Number, default: 0 },
  shareValue: { type: Number, default: 0 },
}, { collection: "shareholders" });

const ownershipDataSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  clientId: { type: String, required: true, unique: true },
  companyValue: { type: Number, default: 0 },
  outstandingDebt: { type: Number, default: 0 },
  yearsHeld: { type: Number, default: 0 },
}, { collection: "ownershipData" });

const employeeSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  clientId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  gender: { type: String, required: true },
  race: { type: String, required: true },
  designation: { type: String, required: true },
  isDisabled: { type: Boolean, default: false },
}, { collection: "employees" });

const trainingProgramSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  clientId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  category: { type: String, required: true },
  cost: { type: Number, default: 0 },
  employeeId: { type: String, default: null },
  isEmployed: { type: Boolean, default: false },
  isBlack: { type: Boolean, default: false },
}, { collection: "trainingPrograms" });

const supplierSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  clientId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  beeLevel: { type: Number, default: 4 },
  blackOwnership: { type: Number, default: 0 },
  spend: { type: Number, default: 0 },
}, { collection: "suppliers" });

const procurementDataSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  clientId: { type: String, required: true, unique: true },
  tmps: { type: Number, default: 0 },
}, { collection: "procurementData" });

const esdContributionSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  clientId: { type: String, required: true, index: true },
  beneficiary: { type: String, required: true },
  type: { type: String, required: true },
  amount: { type: Number, default: 0 },
  category: { type: String, required: true },
}, { collection: "esdContributions" });

const sedContributionSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  clientId: { type: String, required: true, index: true },
  beneficiary: { type: String, required: true },
  type: { type: String, required: true },
  amount: { type: Number, default: 0 },
  category: { type: String, required: true },
}, { collection: "sedContributions" });

const scenarioSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  clientId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  snapshot: { type: Schema.Types.Mixed, required: true },
  createdAt: { type: String, default: () => new Date().toISOString() },
}, { collection: "scenarios" });

const importLogSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  clientId: { type: String, default: null, index: true },
  userId: { type: String, required: true },
  fileName: { type: String, required: true },
  status: { type: String, required: true },
  sheetsFound: { type: Number, default: 0 },
  sheetsMatched: { type: Number, default: 0 },
  entitiesExtracted: { type: Number, default: 0 },
  importErrors: { type: Schema.Types.Mixed, default: null },
  createdAt: { type: String, default: () => new Date().toISOString() },
}, { collection: "importLogs", suppressReservedKeysWarning: true });

const exportLogSchema = new Schema({
  id: { type: String, default: uuid, unique: true },
  clientId: { type: String, required: true, index: true },
  userId: { type: String, required: true },
  exportType: { type: String, required: true },
  fileName: { type: String, default: null },
  createdAt: { type: String, default: () => new Date().toISOString() },
}, { collection: "exportLogs" });

export const UserModel = mongoose.model("User", userSchema);
export const OrganizationModel = mongoose.model("Organization", organizationSchema);
export const ClientModel = mongoose.model("Client", clientSchema);
export const FinancialYearModel = mongoose.model("FinancialYear", financialYearSchema);
export const ShareholderModel = mongoose.model("Shareholder", shareholderSchema);
export const OwnershipDataModel = mongoose.model("OwnershipData", ownershipDataSchema);
export const EmployeeModel = mongoose.model("Employee", employeeSchema);
export const TrainingProgramModel = mongoose.model("TrainingProgram", trainingProgramSchema);
export const SupplierModel = mongoose.model("Supplier", supplierSchema);
export const ProcurementDataModel = mongoose.model("ProcurementData", procurementDataSchema);
export const EsdContributionModel = mongoose.model("EsdContribution", esdContributionSchema);
export const SedContributionModel = mongoose.model("SedContribution", sedContributionSchema);
export const ScenarioModel = mongoose.model("Scenario", scenarioSchema);
export const ImportLogModel = mongoose.model("ImportLog", importLogSchema);
export const ExportLogModel = mongoose.model("ExportLog", exportLogSchema);
