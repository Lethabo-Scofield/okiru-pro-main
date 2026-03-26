import mongoose, { Schema, Document } from "mongoose";

export interface TemplateEntity {
  label: string;
  definition: string;
  synonyms: string[];
  positives: string[];
  negatives: string[];
  zones: string[];
  keywords: { must: string[]; nice: string[]; neg: string[] };
  pattern: string;
}

export interface CalculatorConfig {
  ownership: {
    votingRightsMax: number;
    womenBonusMax: number;
    economicInterestMax: number;
    netValueMax: number;
    targetEconomicInterest: number;
    subMinNetValue: number;
  };
  management: {
    boardBlackTarget: number;
    boardBlackPoints: number;
    boardWomenTarget: number;
    boardWomenPoints: number;
    execBlackTarget: number;
    execBlackPoints: number;
    execWomenTarget: number;
    execWomenPoints: number;
  };
  skills: {
    generalMax: number;
    bursaryMax: number;
    overallTarget: number;
    bursaryTarget: number;
    subMinThreshold: number;
  };
  procurement: {
    baseMax: number;
    bonusMax: number;
    tmpsTarget: number;
    subMinThreshold: number;
    blackOwnedThreshold: number;
  };
  esd: {
    supplierDevMax: number;
    enterpriseDevMax: number;
    supplierDevTarget: number;
    enterpriseDevTarget: number;
  };
  sed: {
    maxPoints: number;
    npatTarget: number;
  };
  discounting: {
    dropLevels: number;
    maxDropLevel: number;
  };
  benefitFactors: { type: string; factor: number }[];
  industryNorms: { name: string; norm: string }[];
}

export interface User {
  id: string;
  username: string;
  password: string;
  fullName: string | null;
  email: string | null;
  role: string | null;
  organizationId: string | null;
  organizationName: string | null;
  profilePicture: string | null;
  isVerified: boolean;
  twofaEnabled: boolean;
  otpCode: string | null;
  otpExpiry: Date | null;
  otpAttempts: number;
  lastLogin: Date | null;
  createdAt: Date;
}

export interface InsertUser {
  username: string;
  password: string;
  fullName?: string | null;
  email?: string | null;
  role?: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  profilePicture?: string | null;
  isVerified?: boolean;
  twofaEnabled?: boolean;
}

export interface Template {
  id: number;
  userId: string | null;
  name: string;
  description: string | null;
  version: string;
  entities: TemplateEntity[];
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertTemplate {
  name: string;
  description?: string | null;
  version?: string;
  entities: TemplateEntity[];
  userId?: string | null;
}

export interface CalculatorConfigRow {
  id: number;
  clientId: string;
  config: CalculatorConfig;
  updatedAt: Date;
}

export interface Conversation {
  id: number;
  title: string;
  createdAt: Date;
}

export interface Message {
  id: number;
  conversationId: number;
  role: string;
  content: string;
  createdAt: Date;
}

const userSchema = new Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  fullName: { type: String, default: null },
  email: { type: String, default: null },
  role: { type: String, default: "user" },
  organizationId: { type: String, default: null },
  organizationName: { type: String, default: null },
  profilePicture: { type: String, default: null },
  isVerified: { type: Boolean, default: false },
  twofaEnabled: { type: Boolean, default: false },
  otpCode: { type: String, default: null },
  otpExpiry: { type: Date, default: null },
  otpAttempts: { type: Number, default: 0 },
  lastLogin: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

userSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

const templateSchema = new Schema({
  name: { type: String, required: true },
  description: { type: String, default: null },
  version: { type: String, default: "1.0" },
  entities: { type: Schema.Types.Mixed, required: true },
  userId: { type: String, default: null, index: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const counterSchema = new Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

const CounterModel = mongoose.models.Counter || mongoose.model("Counter", counterSchema);

async function getNextSequence(name: string): Promise<number> {
  const counter = await CounterModel.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter.seq;
}

templateSchema.pre("save", async function () {
  if (this.isNew && !(this as any).seqId) {
    (this as any).seqId = await getNextSequence("template");
  }
});

templateSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc: any, ret: any) => {
    ret.id = ret.seqId || ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

templateSchema.add({ seqId: { type: Number, unique: true, sparse: true } });

const calculatorConfigSchema = new Schema({
  clientId: { type: String, required: true, unique: true },
  config: { type: Schema.Types.Mixed, required: true },
  updatedAt: { type: Date, default: Date.now },
});

calculatorConfigSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

const conversationSchema = new Schema({
  seqId: { type: Number, unique: true },
  title: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

conversationSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc: any, ret: any) => {
    ret.id = ret.seqId || ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

const messageSchema = new Schema({
  seqId: { type: Number, unique: true },
  conversationId: { type: Number, required: true },
  role: { type: String, required: true },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

messageSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc: any, ret: any) => {
    ret.id = ret.seqId || ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

const processorSessionSchema = new Schema({
  sessionId: { type: String, required: true, unique: true, index: true },
  organizationId: { type: String, default: null, index: true },
  createdByUserId: { type: String, default: null },
  companyInfo: {
    name: { type: String, required: true },
    registrationNumber: { type: String, default: '' },
    sector: { type: String, default: '' },
    annualTurnover: { type: String, default: '' },
    employees: { type: String, default: '' },
    financialYearEnd: { type: String, default: '' },
    address: { type: String, default: '' },
    contactName: { type: String, default: '' },
    contactEmail: { type: String, default: '' },
    contactPhone: { type: String, default: '' },
    currentBBEELevel: { type: String, default: '' },
    notes: { type: String, default: '' },
    logo: { type: String, default: '' },
  },
  currentStep: { type: String, default: 'company-info' },
  filesData: { type: Schema.Types.Mixed, default: [] },
  fileClassifications: { type: Schema.Types.Mixed, default: {} },
  extractionResults: { type: Schema.Types.Mixed, default: [] },
  docStatuses: { type: Schema.Types.Mixed, default: {} },
  isComplete: { type: Boolean, default: false },
  scorecardResult: { type: Schema.Types.Mixed, default: null },
  toolkitClientId: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

processorSessionSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc: any, ret: any) => {
    ret.id = ret.sessionId;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export interface Client {
  id: string;
  name: string;
  financialYear: string;
  industrySector: string | null;
  eapProvince: string | null;
  logo: string | null;
  revenue: number;
  npat: number;
  leviableAmount: number;
  organizationId: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertClient {
  name: string;
  financialYear?: string;
  industrySector?: string | null;
  eapProvince?: string | null;
  revenue?: number;
  npat?: number;
  leviableAmount?: number;
}

const clientSchema = new Schema({
  clientId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  financialYear: { type: String, default: () => new Date().getFullYear().toString() },
  industrySector: { type: String, default: null },
  eapProvince: { type: String, default: null },
  logo: { type: String, default: null },
  revenue: { type: Number, default: 0 },
  npat: { type: Number, default: 0 },
  leviableAmount: { type: Number, default: 0 },
  tmps: { type: Number, default: 0 },
  companyValue: { type: Number, default: 0 },
  outstandingDebt: { type: Number, default: 0 },
  organizationId: { type: String, default: null, index: true },
  createdByUserId: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  shareholders: { type: [Schema.Types.Mixed], default: [] },
  employees: { type: [Schema.Types.Mixed], default: [] },
  trainingPrograms: { type: [Schema.Types.Mixed], default: [] },
  suppliers: { type: [Schema.Types.Mixed], default: [] },
  esdContributions: { type: [Schema.Types.Mixed], default: [] },
  sedContributions: { type: [Schema.Types.Mixed], default: [] },
});

clientSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc: any, ret: any) => {
    ret.id = ret.clientId;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const UserModel = mongoose.models.User || mongoose.model("User", userSchema);
export const TemplateModel = mongoose.models.Template || mongoose.model("Template", templateSchema);
export const CalculatorConfigModel = mongoose.models.CalculatorConfig || mongoose.model("CalculatorConfig", calculatorConfigSchema);
export const ConversationModel = mongoose.models.Conversation || mongoose.model("Conversation", conversationSchema);
export const MessageModel = mongoose.models.Message || mongoose.model("Message", messageSchema);
export const ProcessorSessionModel = mongoose.models.ProcessorSession || mongoose.model("ProcessorSession", processorSessionSchema);
export const ClientModel = mongoose.models.Client || mongoose.model("Client", clientSchema);

export { getNextSequence };
