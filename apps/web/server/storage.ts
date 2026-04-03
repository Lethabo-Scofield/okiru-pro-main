import {
  UserModel,
  TemplateModel,
  CalculatorConfigModel,
  getNextSequence,
  type Template,
  type InsertTemplate,
  type User,
  type InsertUser,
  type CalculatorConfig,
  type CalculatorConfigRow,
} from "../shared/schema";

// Assessment types
export interface Assessment {
  id?: string;
  assessmentId: string;
  sessionId: string;
  clientId?: string;
  clientInfo?: any;
  financials?: any;
  pillars?: any;
  scorecardResult?: any;
  status: string;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Client {
  id?: string;
  name: string;
  registrationNumber?: string;
  vatNumber?: string;
  taxNumber?: string;
  industrySector?: string;
  physicalAddress?: string;
  postalAddress?: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  annualTurnover?: number;
  numberOfEmployees?: number;
  financialYear?: string;
  sectorCode?: string;
  companySize?: string;
  revenue?: number;
  npat?: number;
  leviableAmount?: number;
  financials?: any;
  beeCertificateNumber?: string;
  beeCertificateExpiry?: string;
  beeCertificateLevel?: number | null;
  verificationAgency?: string;
  userId?: string;
  updatedAt?: Date;
}

export interface IStorage {
  getTemplatesByUser(userId: string): Promise<Template[]>;
  getTemplates(): Promise<Template[]>;
  getTemplate(id: number): Promise<Template | undefined>;
  getTemplateForUser(id: number, userId: string): Promise<Template | undefined>;
  createTemplate(template: InsertTemplate): Promise<Template>;
  updateTemplate(id: number, template: Partial<InsertTemplate>): Promise<Template | undefined>;
  updateTemplateForUser(id: number, userId: string, template: Partial<InsertTemplate>): Promise<Template | undefined>;
  deleteTemplate(id: number): Promise<boolean>;
  deleteTemplateForUser(id: number, userId: string): Promise<boolean>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByUsernameOrEmail(loginId: string): Promise<User | undefined>;
  getUserById(id: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;
  setUserOtp(id: string, otpCode: string, otpExpiry: Date): Promise<void>;
  clearUserOtp(id: string): Promise<void>;
  incrementOtpAttempts(id: string): Promise<number>;
  setTwofaEnabled(id: string, enabled: boolean): Promise<User | undefined>;
  setLastLogin(id: string): Promise<void>;
  getAllUsers(): Promise<User[]>;
  getCalculatorConfig(clientId: string): Promise<CalculatorConfigRow | undefined>;
  saveCalculatorConfig(clientId: string, config: CalculatorConfig): Promise<CalculatorConfigRow>;
  
  setPasswordResetToken(userId: string, token: string, expiry: Date): Promise<void>;
  getPasswordResetToken(userId: string): Promise<{ token: string; expiry: Date } | null>;
  clearPasswordResetToken(userId: string): Promise<void>;

  // Assessment methods
  createOrUpdateAssessment(assessment: Partial<Assessment>): Promise<Assessment>;
  getAssessment(assessmentId: string): Promise<Assessment | undefined>;
  getUserAssessments(userId: string): Promise<Assessment[]>;
  
  // Client methods
  createOrUpdateClient(client: Partial<Client>): Promise<Client>;
  getClientById(clientId: string): Promise<Client | undefined>;
  updateClientPillarData(clientId: string, pillars: any): Promise<Client | undefined>;
}

export class MemoryStorage implements IStorage {
  private templates: Map<number, Template> = new Map();
  private users: Map<string, User> = new Map();
  private calculatorConfigs: Map<string, CalculatorConfigRow> = new Map();
  private templateSeq = 0;
  private userSeq = 0;
  private configSeq = 0;

  async getTemplatesByUser(userId: string): Promise<Template[]> {
    return Array.from(this.templates.values())
      .filter((t) => t.userId === userId || t.userId === null)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async getTemplates(): Promise<Template[]> {
    return Array.from(this.templates.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  async getTemplate(id: number): Promise<Template | undefined> {
    return this.templates.get(id);
  }

  async getTemplateForUser(id: number, userId: string): Promise<Template | undefined> {
    const t = this.templates.get(id);
    if (!t) return undefined;
    if (t.userId !== null && t.userId !== userId) return undefined;
    return t;
  }

  async createTemplate(template: InsertTemplate): Promise<Template> {
    const id = ++this.templateSeq;
    const now = new Date();
    const doc: Template = {
      id,
      userId: template.userId || null,
      name: template.name,
      description: template.description || null,
      version: template.version || "1.0",
      entities: template.entities,
      createdAt: now,
      updatedAt: now,
    };
    this.templates.set(id, doc);
    return doc;
  }

  async updateTemplate(id: number, template: Partial<InsertTemplate>): Promise<Template | undefined> {
    const existing = this.templates.get(id);
    if (!existing) return undefined;
    const updated: Template = {
      ...existing,
      ...template,
      id,
      userId: existing.userId,
      updatedAt: new Date(),
    };
    this.templates.set(id, updated);
    return updated;
  }

  async updateTemplateForUser(id: number, userId: string, template: Partial<InsertTemplate>): Promise<Template | undefined> {
    const existing = this.templates.get(id);
    if (!existing) return undefined;
    if (existing.userId !== userId) return undefined;
    const updated: Template = {
      ...existing,
      ...template,
      id,
      userId: existing.userId,
      updatedAt: new Date(),
    };
    this.templates.set(id, updated);
    return updated;
  }

  async deleteTemplate(id: number): Promise<boolean> {
    return this.templates.delete(id);
  }

  async deleteTemplateForUser(id: number, userId: string): Promise<boolean> {
    const existing = this.templates.get(id);
    if (!existing) return false;
    if (existing.userId !== userId) return false;
    return this.templates.delete(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((u) => u.username === username);
  }

  async getUserByUsernameOrEmail(loginId: string): Promise<User | undefined> {
    const lower = loginId.toLowerCase();
    return Array.from(this.users.values()).find(
      (u) => u.username.toLowerCase() === lower || (u.email && u.email.toLowerCase() === lower)
    );
  }

  async getUserById(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async createUser(user: InsertUser): Promise<User> {
    const id = String(++this.userSeq);
    const doc: User = {
      id,
      username: user.username,
      password: user.password,
      fullName: user.fullName || null,
      email: user.email || null,
      role: user.role || null,
      organizationId: user.organizationId || null,
      organizationName: user.organizationName || null,
      profilePicture: user.profilePicture || null,
      isVerified: user.isVerified ?? false,
      twofaEnabled: user.twofaEnabled ?? false,
      otpCode: null,
      otpExpiry: null,
      otpAttempts: 0,
      lastLogin: null,
      createdAt: new Date(),
    };
    this.users.set(id, doc);
    return doc;
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const existing = this.users.get(id);
    if (!existing) return undefined;
    const updated: User = { ...existing, ...data, id };
    this.users.set(id, updated);
    return updated;
  }

  async setUserOtp(id: string, otpCode: string, otpExpiry: Date): Promise<void> {
    const user = this.users.get(id);
    if (user) {
      user.otpCode = otpCode;
      user.otpExpiry = otpExpiry;
      user.otpAttempts = 0;
    }
  }

  async clearUserOtp(id: string): Promise<void> {
    const user = this.users.get(id);
    if (user) {
      user.otpCode = null;
      user.otpExpiry = null;
      user.otpAttempts = 0;
    }
  }

  async incrementOtpAttempts(id: string): Promise<number> {
    const user = this.users.get(id);
    if (user) {
      user.otpAttempts = (user.otpAttempts || 0) + 1;
      return user.otpAttempts;
    }
    return 0;
  }

  async setTwofaEnabled(id: string, enabled: boolean): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    user.twofaEnabled = enabled;
    return user;
  }

  async setLastLogin(id: string): Promise<void> {
    const user = this.users.get(id);
    if (user) user.lastLogin = new Date();
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async getCalculatorConfig(clientId: string): Promise<CalculatorConfigRow | undefined> {
    return this.calculatorConfigs.get(clientId);
  }

  async saveCalculatorConfig(clientId: string, config: CalculatorConfig): Promise<CalculatorConfigRow> {
    const existing = this.calculatorConfigs.get(clientId);
    const doc: CalculatorConfigRow = {
      id: existing?.id || ++this.configSeq,
      clientId,
      config,
      updatedAt: new Date(),
    };
    this.calculatorConfigs.set(clientId, doc);
    return doc;
  }
  
  private passwordResetTokens: Map<string, { token: string; expiry: Date }> = new Map();

  async setPasswordResetToken(userId: string, token: string, expiry: Date): Promise<void> {
    this.passwordResetTokens.set(userId, { token, expiry });
  }

  async getPasswordResetToken(userId: string): Promise<{ token: string; expiry: Date } | null> {
    return this.passwordResetTokens.get(userId) || null;
  }

  async clearPasswordResetToken(userId: string): Promise<void> {
    this.passwordResetTokens.delete(userId);
  }

  // Assessment and Client storage
  private assessments: Map<string, Assessment> = new Map();
  private clients: Map<string, Client> = new Map();
  private assessmentSeq = 0;
  private clientSeq = 0;
  
  async createOrUpdateAssessment(assessment: Partial<Assessment>): Promise<Assessment> {
    const existing = assessment.assessmentId 
      ? this.assessments.get(assessment.assessmentId)
      : undefined;
    
    const doc: Assessment = {
      id: existing?.id || (++this.assessmentSeq).toString(),
      assessmentId: assessment.assessmentId || `assessment-${Date.now()}`,
      sessionId: assessment.sessionId || existing?.sessionId || '',
      clientId: assessment.clientId || existing?.clientId,
      clientInfo: assessment.clientInfo || existing?.clientInfo,
      financials: assessment.financials || existing?.financials,
      pillars: assessment.pillars || existing?.pillars,
      scorecardResult: assessment.scorecardResult || existing?.scorecardResult,
      status: assessment.status || existing?.status || 'draft',
      createdBy: assessment.createdBy || existing?.createdBy,
      createdAt: existing?.createdAt || new Date(),
      updatedAt: new Date(),
    };
    
    this.assessments.set(doc.assessmentId, doc);
    return doc;
  }
  
  async getAssessment(assessmentId: string): Promise<Assessment | undefined> {
    return this.assessments.get(assessmentId);
  }
  
  async getUserAssessments(userId: string): Promise<Assessment[]> {
    return Array.from(this.assessments.values())
      .filter(a => a.createdBy === userId)
      .sort((a, b) => new Date(b.updatedAt!).getTime() - new Date(a.updatedAt!).getTime());
  }
  
  async createOrUpdateClient(client: Partial<Client>): Promise<Client> {
    const existing = client.id ? this.clients.get(client.id) : undefined;
    
    const doc: Client = {
      id: existing?.id || (++this.clientSeq).toString(),
      name: client.name || existing?.name || '',
      registrationNumber: client.registrationNumber || existing?.registrationNumber,
      vatNumber: client.vatNumber || existing?.vatNumber,
      taxNumber: client.taxNumber || existing?.taxNumber,
      industrySector: client.industrySector || existing?.industrySector,
      physicalAddress: client.physicalAddress || existing?.physicalAddress,
      postalAddress: client.postalAddress || existing?.postalAddress,
      contactPerson: client.contactPerson || existing?.contactPerson,
      contactEmail: client.contactEmail || existing?.contactEmail,
      contactPhone: client.contactPhone || existing?.contactPhone,
      annualTurnover: client.annualTurnover || existing?.annualTurnover,
      numberOfEmployees: client.numberOfEmployees || existing?.numberOfEmployees,
      financialYear: client.financialYear || existing?.financialYear,
      sectorCode: client.sectorCode || existing?.sectorCode,
      companySize: client.companySize || existing?.companySize,
      revenue: client.revenue || existing?.revenue,
      npat: client.npat || existing?.npat,
      leviableAmount: client.leviableAmount || existing?.leviableAmount,
      financials: client.financials || existing?.financials,
      beeCertificateNumber: client.beeCertificateNumber || existing?.beeCertificateNumber,
      beeCertificateExpiry: client.beeCertificateExpiry || existing?.beeCertificateExpiry,
      beeCertificateLevel: client.beeCertificateLevel !== undefined ? client.beeCertificateLevel : existing?.beeCertificateLevel,
      verificationAgency: client.verificationAgency || existing?.verificationAgency,
      userId: client.userId || existing?.userId,
      updatedAt: new Date(),
    };
    
    this.clients.set(doc.id!, doc);
    return doc;
  }
  
  async getClientById(clientId: string): Promise<Client | undefined> {
    return this.clients.get(clientId);
  }
  
  async updateClientPillarData(clientId: string, pillars: any): Promise<Client | undefined> {
    const client = this.clients.get(clientId);
    if (!client) return undefined;
    
    client.pillars = pillars;
    client.updatedAt = new Date();
    return client;
  }
}

function toUser(doc: any): User | undefined {
  if (!doc) return undefined;
  const obj = doc.toJSON ? doc.toJSON() : doc;
  return {
    id: obj.id || obj._id?.toString(),
    username: obj.username,
    password: obj.password,
    fullName: obj.fullName || null,
    email: obj.email || null,
    role: obj.role || null,
    organizationId: obj.organizationId || null,
    organizationName: obj.organizationName || null,
    profilePicture: obj.profilePicture || null,
    isVerified: obj.isVerified ?? false,
    twofaEnabled: obj.twofaEnabled ?? false,
    otpCode: obj.otpCode || null,
    otpExpiry: obj.otpExpiry || null,
    otpAttempts: obj.otpAttempts || 0,
    lastLogin: obj.lastLogin || null,
    createdAt: obj.createdAt,
  };
}

function toTemplate(doc: any): Template | undefined {
  if (!doc) return undefined;
  const obj = doc.toJSON ? doc.toJSON() : doc;
  return {
    id: obj.seqId || obj.id || obj._id,
    userId: obj.userId || null,
    name: obj.name,
    description: obj.description || null,
    version: obj.version || "1.0",
    entities: obj.entities || [],
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

export class DatabaseStorage implements IStorage {
  async getTemplatesByUser(userId: string): Promise<Template[]> {
    const docs = await TemplateModel.find({
      $or: [{ userId }, { userId: null }, { userId: { $exists: false } }],
    }).sort({ updatedAt: -1 });
    return docs.map((d) => toTemplate(d)!);
  }

  async getTemplates(): Promise<Template[]> {
    const docs = await TemplateModel.find().sort({ updatedAt: -1 });
    return docs.map((d) => toTemplate(d)!);
  }

  async getTemplate(id: number): Promise<Template | undefined> {
    const doc = await TemplateModel.findOne({ seqId: id });
    return toTemplate(doc);
  }

  async getTemplateForUser(id: number, userId: string): Promise<Template | undefined> {
    const doc = await TemplateModel.findOne({
      seqId: id,
      $or: [{ userId }, { userId: null }, { userId: { $exists: false } }],
    });
    return toTemplate(doc);
  }

  async createTemplate(template: InsertTemplate): Promise<Template> {
    const seqId = await getNextSequence("template");
    const doc = await TemplateModel.create({
      seqId,
      name: template.name,
      description: template.description || null,
      version: template.version || "1.0",
      entities: template.entities,
      userId: template.userId || null,
    });
    return toTemplate(doc)!;
  }

  async updateTemplate(id: number, template: Partial<InsertTemplate>): Promise<Template | undefined> {
    const doc = await TemplateModel.findOneAndUpdate(
      { seqId: id },
      { ...template, updatedAt: new Date() },
      { new: true }
    );
    return toTemplate(doc);
  }

  async updateTemplateForUser(id: number, userId: string, template: Partial<InsertTemplate>): Promise<Template | undefined> {
    const doc = await TemplateModel.findOneAndUpdate(
      { seqId: id, userId },
      { ...template, updatedAt: new Date() },
      { new: true }
    );
    return toTemplate(doc);
  }

  async deleteTemplate(id: number): Promise<boolean> {
    const result = await TemplateModel.deleteOne({ seqId: id });
    return result.deletedCount > 0;
  }

  async deleteTemplateForUser(id: number, userId: string): Promise<boolean> {
    const result = await TemplateModel.deleteOne({ seqId: id, userId });
    return result.deletedCount > 0;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const doc = await UserModel.findOne({ username });
    return toUser(doc);
  }

  async getUserByUsernameOrEmail(loginId: string): Promise<User | undefined> {
    const doc = await UserModel.findOne({
      $or: [
        { username: { $regex: new RegExp(`^${loginId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
        { email: { $regex: new RegExp(`^${loginId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
      ],
    });
    return toUser(doc);
  }

  async getUserById(id: string): Promise<User | undefined> {
    const doc = await UserModel.findById(id);
    return toUser(doc);
  }

  async createUser(user: InsertUser): Promise<User> {
    const doc = await UserModel.create(user);
    return toUser(doc)!;
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const doc = await UserModel.findByIdAndUpdate(id, data, { new: true });
    return toUser(doc);
  }

  async setUserOtp(id: string, otpCode: string, otpExpiry: Date): Promise<void> {
    await UserModel.findByIdAndUpdate(id, { otpCode, otpExpiry, otpAttempts: 0 });
  }

  async clearUserOtp(id: string): Promise<void> {
    await UserModel.findByIdAndUpdate(id, { otpCode: null, otpExpiry: null, otpAttempts: 0 });
  }

  async incrementOtpAttempts(id: string): Promise<number> {
    const doc = await UserModel.findByIdAndUpdate(id, { $inc: { otpAttempts: 1 } }, { new: true });
    return doc?.otpAttempts || 0;
  }

  async setTwofaEnabled(id: string, enabled: boolean): Promise<User | undefined> {
    const doc = await UserModel.findByIdAndUpdate(id, { twofaEnabled: enabled }, { new: true });
    return toUser(doc);
  }

  async setLastLogin(id: string): Promise<void> {
    await UserModel.findByIdAndUpdate(id, { lastLogin: new Date() });
  }

  async getAllUsers(): Promise<User[]> {
    const docs = await UserModel.find().sort({ createdAt: -1 });
    return docs.map((d) => toUser(d)!);
  }

  async getCalculatorConfig(clientId: string): Promise<CalculatorConfigRow | undefined> {
    const doc = await CalculatorConfigModel.findOne({ clientId });
    if (!doc) return undefined;
    const obj = doc.toJSON();
    return {
      id: obj.id || obj._id,
      clientId: obj.clientId,
      config: obj.config,
      updatedAt: obj.updatedAt,
    };
  }

  async saveCalculatorConfig(clientId: string, config: CalculatorConfig): Promise<CalculatorConfigRow> {
    const doc = await CalculatorConfigModel.findOneAndUpdate(
      { clientId },
      { config, updatedAt: new Date() },
      { new: true, upsert: true }
    );
    const obj = doc.toJSON();
    return {
      id: obj.id || obj._id,
      clientId: obj.clientId,
      config: obj.config,
      updatedAt: obj.updatedAt,
    };
  }
  
  async setPasswordResetToken(userId: string, token: string, expiry: Date): Promise<void> {
    await UserModel.findByIdAndUpdate(userId, {
      resetToken: token,
      resetTokenExpiry: expiry,
    });
  }

  async getPasswordResetToken(userId: string): Promise<{ token: string; expiry: Date } | null> {
    const doc = await UserModel.findById(userId);
    if (!doc || !doc.resetToken || !doc.resetTokenExpiry) return null;
    return { token: doc.resetToken, expiry: doc.resetTokenExpiry };
  }

  async clearPasswordResetToken(userId: string): Promise<void> {
    await UserModel.findByIdAndUpdate(userId, {
      resetToken: null,
      resetTokenExpiry: null,
    });
  }

  // Assessment methods - using ProcessorSessionModel as base
  async createOrUpdateAssessment(assessment: Partial<Assessment>): Promise<Assessment> {
    const { ProcessorSessionModel } = await import("../shared/schema");
    
    const updateData = {
      ...assessment,
      updatedAt: new Date(),
    };
    
    const doc = await ProcessorSessionModel.findOneAndUpdate(
      { assessmentId: assessment.assessmentId },
      updateData,
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    
    return toAssessment(doc) || {
      assessmentId: assessment.assessmentId || '',
      sessionId: assessment.sessionId || '',
      status: assessment.status || 'draft',
      updatedAt: new Date(),
    };
  }
  
  async getAssessment(assessmentId: string): Promise<Assessment | undefined> {
    const { ProcessorSessionModel } = await import("../shared/schema");
    const doc = await ProcessorSessionModel.findOne({ assessmentId });
    return toAssessment(doc);
  }
  
  async getUserAssessments(userId: string): Promise<Assessment[]> {
    const { ProcessorSessionModel } = await import("../shared/schema");
    const docs = await ProcessorSessionModel.find({ createdBy: userId })
      .sort({ updatedAt: -1 });
    return docs.map(d => toAssessment(d)!).filter(Boolean);
  }
  
  // Client methods - also using ProcessorSessionModel with client data
  async createOrUpdateClient(client: Partial<Client>): Promise<Client> {
    const { ClientModel } = await import("../shared/schema");
    
    const updateData = {
      ...client,
      updatedAt: new Date(),
    };
    
    const doc = await ClientModel.findOneAndUpdate(
      { registrationNumber: client.registrationNumber },
      updateData,
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    
    return toClient(doc) || {
      id: '',
      name: client.name || '',
    };
  }
  
  async getClientById(clientId: string): Promise<Client | undefined> {
    const { ClientModel } = await import("../shared/schema");
    const doc = await ClientModel.findById(clientId);
    return toClient(doc);
  }
  
  async updateClientPillarData(clientId: string, pillars: any): Promise<Client | undefined> {
    const { ClientModel } = await import("../shared/schema");
    const doc = await ClientModel.findByIdAndUpdate(
      clientId,
      { pillars, updatedAt: new Date() },
      { new: true }
    );
    return toClient(doc);
  }
}

// Helper functions for Assessment and Client
function toAssessment(doc: any): Assessment | undefined {
  if (!doc) return undefined;
  const obj = doc.toJSON ? doc.toJSON() : doc;
  return {
    id: obj.id || obj._id?.toString(),
    assessmentId: obj.assessmentId || obj.sessionId,
    sessionId: obj.sessionId,
    clientId: obj.clientId,
    clientInfo: obj.clientInfo,
    financials: obj.financials,
    pillars: obj.pillars,
    scorecardResult: obj.scorecardResult,
    status: obj.status || 'draft',
    createdBy: obj.createdBy || obj.userId,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

function toClient(doc: any): Client | undefined {
  if (!doc) return undefined;
  const obj = doc.toJSON ? doc.toJSON() : doc;
  return {
    id: obj.id || obj._id?.toString(),
    name: obj.name,
    registrationNumber: obj.registrationNumber,
    vatNumber: obj.vatNumber,
    taxNumber: obj.taxNumber,
    industrySector: obj.industrySector,
    physicalAddress: obj.physicalAddress,
    postalAddress: obj.postalAddress,
    contactPerson: obj.contactPerson,
    contactEmail: obj.contactEmail,
    contactPhone: obj.contactPhone,
    annualTurnover: obj.annualTurnover,
    numberOfEmployees: obj.numberOfEmployees,
    financialYear: obj.financialYear,
    sectorCode: obj.sectorCode,
    companySize: obj.companySize,
    revenue: obj.revenue,
    npat: obj.npat,
    leviableAmount: obj.leviableAmount,
    financials: obj.financials,
    beeCertificateNumber: obj.beeCertificateNumber,
    beeCertificateExpiry: obj.beeCertificateExpiry,
    beeCertificateLevel: obj.beeCertificateLevel,
    verificationAgency: obj.verificationAgency,
    userId: obj.userId,
    updatedAt: obj.updatedAt,
  };
}

const useDatabase = !!(process.env.MONGODB_URI || process.env.MONGO_URI);
export const storage: IStorage = useDatabase
  ? new DatabaseStorage()
  : new MemoryStorage();

if (!useDatabase) {
  console.log("Storage: Using in-memory storage (MONGODB_URI not set). Data will not persist across restarts.");
  (async () => {
    const bcrypt = await import("bcryptjs");
    const hashedPassword = await bcrypt.hash("demo", 8);
    await storage.createUser({
      username: "demo",
      password: hashedPassword,
      fullName: "Demo User",
      email: "demo@okiru.pro",
      role: "admin",
      organizationId: null,
      organizationName: "Okiru Demo",
      profilePicture: null,
    });
    console.log("Storage: Seeded dummy user — username: demo, password: demo");

    const { starterTemplates } = await import("../src/data/starterTemplates");
    for (const t of starterTemplates) {
      await storage.createTemplate({
        name: t.name,
        description: t.description,
        version: "1.0",
        entities: t.entities,
        userId: null,
      });
    }
    console.log(`Storage: Seeded ${starterTemplates.length} predefined templates`);
  })();
} else {
  console.log("Storage: Using MongoDB database storage.");
  (async () => {
    try {
      const { starterTemplates } = await import("../src/data/starterTemplates");
      const existing = await storage.getTemplates();
      const sharedTemplates = existing.filter(t => t.userId === null);
      const existingNames = new Set(sharedTemplates.map(t => t.name));
      const missing = starterTemplates.filter(t => !existingNames.has(t.name));
      if (missing.length > 0) {
        for (const t of missing) {
          await storage.createTemplate({
            name: t.name,
            description: t.description,
            version: "1.0",
            entities: t.entities,
            userId: null,
          });
        }
        console.log(`Storage: Seeded ${missing.length} missing default templates into database (total: ${sharedTemplates.length + missing.length})`);
      } else {
        console.log(`Storage: All ${sharedTemplates.length} default templates already exist, skipping seed`);
      }
    } catch (err) {
      console.error("Storage: Failed to seed default templates:", err);
    }
  })();
}
