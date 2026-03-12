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
}

export interface Template {
  id: number;
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

export const UserModel = mongoose.models.User || mongoose.model("User", userSchema);
export const TemplateModel = mongoose.models.Template || mongoose.model("Template", templateSchema);
export const CalculatorConfigModel = mongoose.models.CalculatorConfig || mongoose.model("CalculatorConfig", calculatorConfigSchema);
export const ConversationModel = mongoose.models.Conversation || mongoose.model("Conversation", conversationSchema);
export const MessageModel = mongoose.models.Message || mongoose.model("Message", messageSchema);

export { getNextSequence };
