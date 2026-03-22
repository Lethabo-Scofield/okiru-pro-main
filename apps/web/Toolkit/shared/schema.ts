import { z } from "zod";

export interface User {
  id: string;
  username: string;
  password: string;
  email: string | null;
  fullName: string | null;
  role: string | null;
  organizationId: string | null;
  profilePicture: string | null;
  createdAt: string | null;
}

export interface Organization {
  id: string;
  name: string;
  createdAt: string | null;
}

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
  createdAt: string | null;
}

export interface FinancialYear {
  id: string;
  clientId: string;
  year: string;
  revenue: number;
  npat: number;
  indicativeNpat: number | null;
  notes: string | null;
}

export interface Shareholder {
  id: string;
  clientId: string;
  name: string;
  ownershipType: string;
  blackOwnership: number;
  blackWomenOwnership: number;
  shares: number;
  shareValue: number;
}

export interface OwnershipDataRow {
  id: string;
  clientId: string;
  companyValue: number;
  outstandingDebt: number;
  yearsHeld: number;
}

export interface Employee {
  id: string;
  clientId: string;
  name: string;
  gender: string;
  race: string;
  designation: string;
  isDisabled: boolean;
}

export interface TrainingProgram {
  id: string;
  clientId: string;
  name: string;
  category: string;
  cost: number;
  employeeId: string | null;
  isEmployed: boolean;
  isBlack: boolean;
  gender: string | null;
  race: string | null;
  isDisabled: boolean;
}

export interface Supplier {
  id: string;
  clientId: string;
  name: string;
  beeLevel: number;
  blackOwnership: number;
  blackWomenOwnership: number;
  youthOwnership: number;
  disabledOwnership: number;
  enterpriseType: string;
  spend: number;
}

export interface ProcurementDataRow {
  id: string;
  clientId: string;
  tmps: number;
}

export interface EsdContribution {
  id: string;
  clientId: string;
  beneficiary: string;
  type: string;
  amount: number;
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

export interface Scenario {
  id: string;
  clientId: string;
  name: string;
  snapshot: any;
  createdAt: string | null;
}

export interface ImportLog {
  id: string;
  clientId: string | null;
  userId: string;
  fileName: string;
  status: string;
  sheetsFound: number;
  sheetsMatched: number;
  entitiesExtracted: number;
  errors: any;
  createdAt: string | null;
}

export interface ExportLog {
  id: string;
  clientId: string;
  userId: string;
  exportType: string;
  fileName: string | null;
  createdAt: string | null;
}

export type InsertUser = Omit<User, 'id' | 'createdAt' | 'role'> & { organizationId?: string | null };
export type InsertOrganization = Pick<Organization, 'name'>;
export type InsertClient = Omit<Client, 'id' | 'createdAt'>;
export type InsertShareholder = Omit<Shareholder, 'id'>;
export type InsertEmployee = Omit<Employee, 'id'>;
export type InsertTrainingProgram = Omit<TrainingProgram, 'id'>;
export type InsertSupplier = Omit<Supplier, 'id'>;
export type InsertEsdContribution = Omit<EsdContribution, 'id'>;
export type InsertSedContribution = Omit<SedContribution, 'id'>;
export type InsertScenario = Omit<Scenario, 'id' | 'createdAt'>;

export const insertUserSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  email: z.string().email().nullable().optional(),
  fullName: z.string().nullable().optional(),
});

export const insertOrganizationSchema = z.object({
  name: z.string().min(1),
});

export const insertClientSchema = z.object({
  organizationId: z.string(),
  name: z.string().min(1),
  financialYear: z.string().min(1),
  revenue: z.number().default(0),
  npat: z.number().default(0),
  leviableAmount: z.number().default(0),
  industrySector: z.string().default("Generic"),
  eapProvince: z.string().default("National"),
  industryNorm: z.number().nullable().optional(),
  logo: z.string().nullable().optional(),
});

export const insertShareholderSchema = z.object({
  clientId: z.string(),
  name: z.string().min(1),
  ownershipType: z.string().default("shareholder"),
  blackOwnership: z.number().default(0),
  blackWomenOwnership: z.number().default(0),
  shares: z.number().default(0),
  shareValue: z.number().default(0),
});

export const insertEmployeeSchema = z.object({
  clientId: z.string(),
  name: z.string().min(1),
  gender: z.string(),
  race: z.string(),
  designation: z.string(),
  isDisabled: z.boolean().default(false),
});

export const insertTrainingProgramSchema = z.object({
  clientId: z.string(),
  name: z.string().min(1),
  category: z.string(),
  cost: z.number().default(0),
  employeeId: z.string().nullable().optional(),
  isEmployed: z.boolean().default(false),
  isBlack: z.boolean().default(false),
  gender: z.string().nullable().optional(),
  race: z.string().nullable().optional(),
  isDisabled: z.boolean().default(false),
});

export const insertSupplierSchema = z.object({
  clientId: z.string(),
  name: z.string().min(1),
  beeLevel: z.number().default(4),
  blackOwnership: z.number().default(0),
  blackWomenOwnership: z.number().default(0),
  youthOwnership: z.number().default(0),
  disabledOwnership: z.number().default(0),
  enterpriseType: z.string().default("generic"),
  spend: z.number().default(0),
});

export const insertEsdContributionSchema = z.object({
  clientId: z.string(),
  beneficiary: z.string().min(1),
  type: z.string(),
  amount: z.number().default(0),
  category: z.string(),
});

export const insertSedContributionSchema = z.object({
  clientId: z.string(),
  beneficiary: z.string().min(1),
  type: z.string(),
  amount: z.number().default(0),
  category: z.string(),
});

export const insertScenarioSchema = z.object({
  clientId: z.string(),
  name: z.string().min(1),
  snapshot: z.any(),
});
