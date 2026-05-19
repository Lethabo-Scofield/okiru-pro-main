import {
  UserModel,
  TemplateModel,
  CalculatorConfigModel,
  CompanyProfileModel,
  WorkspaceModel,
  WorkspaceMemberModel,
  WorkspaceInviteModel,
  getNextSequence,
  type Template,
  type InsertTemplate,
  type User,
  type InsertUser,
  type CalculatorConfig,
  type CalculatorConfigRow,
  type CompanyProfile,
  type InsertCompanyProfile,
  type Workspace,
  type WorkspaceMember,
  type WorkspaceInvite,
  type WorkspaceRole,
} from "../shared/schema";
import crypto from "crypto";
import mongoose from "mongoose";

/** Match user by API-style UUID `id` or legacy MongoDB `_id` string. */
function userByKeyFilter(key: string): mongoose.RootFilterQuery<Record<string, unknown>> {
  const parts: mongoose.RootFilterQuery<Record<string, unknown>>[] = [{ id: key }];
  if (/^[a-f0-9]{24}$/i.test(key)) {
    parts.push({ _id: new mongoose.Types.ObjectId(key) });
  }
  return parts.length > 1 ? { $or: parts } : { id: key };
}

// Assessment types
export interface ScorecardSnapshotRecord {
  snapshotId: string;
  label?: string;
  pillars: unknown;
  scorecardResult?: unknown;
  createdAt: string;
  createdBy: string;
}

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
  /** @deprecated use createdBy — kept for legacy payloads */
  userId?: string;
  createdBy?: string;
  workspaceId?: string | null;
  pillarActivity?: Record<string, { at: string; userId: string }>;
  scorecardSnapshots?: ScorecardSnapshotRecord[];
  organizationId?: string | null;
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

  // Company profile (onboarding) methods
  getCompanyProfileByUserId(userId: string): Promise<CompanyProfile | undefined>;
  upsertCompanyProfile(profile: InsertCompanyProfile): Promise<CompanyProfile>;

  // Workspace methods
  createWorkspace(name: string, ownerUserId: string): Promise<Workspace>;
  getWorkspaceById(workspaceId: string): Promise<Workspace | undefined>;
  renameWorkspace(workspaceId: string, name: string): Promise<Workspace | undefined>;
  listWorkspacesForUser(userId: string): Promise<Array<Workspace & { role: WorkspaceRole }>>;
  getMember(workspaceId: string, userId: string): Promise<WorkspaceMember | undefined>;
  listMembers(workspaceId: string): Promise<WorkspaceMember[]>;
  addMember(workspaceId: string, userId: string, role: WorkspaceRole): Promise<WorkspaceMember>;
  updateMemberRole(workspaceId: string, userId: string, role: WorkspaceRole): Promise<WorkspaceMember | undefined>;
  updateWorkspaceMember(
    workspaceId: string,
    userId: string,
    patch: { role?: WorkspaceRole; pillarScopes?: string[] | null },
  ): Promise<WorkspaceMember | undefined>;
  removeMember(workspaceId: string, userId: string): Promise<boolean>;

  createInvite(invite: { workspaceId: string; email: string; role: WorkspaceRole; invitedByUserId: string; ttlDays?: number }): Promise<WorkspaceInvite>;
  getInviteByToken(token: string): Promise<WorkspaceInvite | undefined>;
  listInvites(workspaceId: string): Promise<WorkspaceInvite[]>;
  findActivePendingInvite(workspaceId: string, email: string): Promise<WorkspaceInvite | undefined>;
  acceptInvite(token: string): Promise<WorkspaceInvite | undefined>;
  revokeInvite(workspaceId: string, inviteId: string): Promise<boolean>;
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
      clientId: assessment.clientId ?? existing?.clientId,
      clientInfo: assessment.clientInfo ?? existing?.clientInfo,
      financials: assessment.financials ?? existing?.financials,
      pillars: assessment.pillars !== undefined ? assessment.pillars : existing?.pillars,
      scorecardResult: assessment.scorecardResult !== undefined ? assessment.scorecardResult : existing?.scorecardResult,
      status: assessment.status || existing?.status || 'draft',
      createdBy: assessment.createdBy || assessment.userId || existing?.createdBy,
      workspaceId: assessment.workspaceId !== undefined ? assessment.workspaceId : existing?.workspaceId,
      pillarActivity: assessment.pillarActivity !== undefined ? assessment.pillarActivity : existing?.pillarActivity,
      scorecardSnapshots: assessment.scorecardSnapshots !== undefined ? assessment.scorecardSnapshots : existing?.scorecardSnapshots,
      createdAt: existing?.createdAt || new Date(),
      updatedAt: new Date(),
    };
    
    this.assessments.set(doc.assessmentId, doc);
    return doc;
  }
  
  async getAssessment(assessmentId: string): Promise<Assessment | undefined> {
    return this.assessments.get(assessmentId);
  }
  
  private workspaceIdsForUser(userId: string): Set<string> {
    const s = new Set<string>();
    for (const m of this.workspaceMembers.values()) {
      if (m.userId === userId) s.add(m.workspaceId);
    }
    return s;
  }

  async getUserAssessments(userId: string): Promise<Assessment[]> {
    const wsIds = this.workspaceIdsForUser(userId);
    return Array.from(this.assessments.values())
      .filter(
        (a) =>
          a.createdBy === userId ||
          (a.workspaceId != null && a.workspaceId !== "" && wsIds.has(String(a.workspaceId))),
      )
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

  private companyProfiles: Map<string, CompanyProfile> = new Map();

  async getCompanyProfileByUserId(userId: string): Promise<CompanyProfile | undefined> {
    return this.companyProfiles.get(userId);
  }

  async upsertCompanyProfile(profile: InsertCompanyProfile): Promise<CompanyProfile> {
    const existing = this.companyProfiles.get(profile.userId);
    const now = new Date();
    const doc: CompanyProfile = {
      id: existing?.id || `cp_${profile.userId}`,
      ...profile,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    this.companyProfiles.set(profile.userId, doc);
    return doc;
  }

  // ----- Workspace methods (in-memory) -----
  private workspaces: Map<string, Workspace> = new Map();
  private workspaceMembers: Map<string, WorkspaceMember> = new Map(); // key: `${wsId}:${userId}`
  private workspaceInvites: Map<string, WorkspaceInvite> = new Map(); // key: inviteId

  async createWorkspace(name: string, ownerUserId: string): Promise<Workspace> {
    const id = `ws_${crypto.randomBytes(8).toString("hex")}`;
    const now = new Date();
    const ws: Workspace = { id, name, ownerUserId, createdAt: now, updatedAt: now };
    this.workspaces.set(id, ws);
    await this.addMember(id, ownerUserId, "owner");
    return ws;
  }

  async getWorkspaceById(workspaceId: string): Promise<Workspace | undefined> {
    return this.workspaces.get(workspaceId);
  }

  async renameWorkspace(workspaceId: string, name: string): Promise<Workspace | undefined> {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) return undefined;
    ws.name = name;
    ws.updatedAt = new Date();
    return ws;
  }

  async listWorkspacesForUser(userId: string): Promise<Array<Workspace & { role: WorkspaceRole }>> {
    const out: Array<Workspace & { role: WorkspaceRole }> = [];
    for (const m of this.workspaceMembers.values()) {
      if (m.userId !== userId) continue;
      const ws = this.workspaces.get(m.workspaceId);
      if (ws) out.push({ ...ws, role: m.role });
    }
    return out.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  }

  async getMember(workspaceId: string, userId: string): Promise<WorkspaceMember | undefined> {
    return this.workspaceMembers.get(`${workspaceId}:${userId}`);
  }

  async listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    return Array.from(this.workspaceMembers.values())
      .filter((m) => m.workspaceId === workspaceId)
      .sort((a, b) => +new Date(a.joinedAt) - +new Date(b.joinedAt));
  }

  async addMember(workspaceId: string, userId: string, role: WorkspaceRole): Promise<WorkspaceMember> {
    const key = `${workspaceId}:${userId}`;
    const existing = this.workspaceMembers.get(key);
    if (existing) {
      existing.role = role;
      return existing;
    }
    const m: WorkspaceMember = {
      id: `wm_${crypto.randomBytes(8).toString("hex")}`,
      workspaceId,
      userId,
      role,
      joinedAt: new Date(),
    };
    this.workspaceMembers.set(key, m);
    return m;
  }

  async updateMemberRole(workspaceId: string, userId: string, role: WorkspaceRole): Promise<WorkspaceMember | undefined> {
    return this.updateWorkspaceMember(workspaceId, userId, { role });
  }

  async updateWorkspaceMember(
    workspaceId: string,
    userId: string,
    patch: { role?: WorkspaceRole; pillarScopes?: string[] | null },
  ): Promise<WorkspaceMember | undefined> {
    const m = this.workspaceMembers.get(`${workspaceId}:${userId}`);
    if (!m) return undefined;
    if (patch.role !== undefined) m.role = patch.role;
    if (patch.pillarScopes === null) delete m.pillarScopes;
    else if (patch.pillarScopes !== undefined) m.pillarScopes = patch.pillarScopes;
    return m;
  }

  async removeMember(workspaceId: string, userId: string): Promise<boolean> {
    return this.workspaceMembers.delete(`${workspaceId}:${userId}`);
  }

  async createInvite(invite: { workspaceId: string; email: string; role: WorkspaceRole; invitedByUserId: string; ttlDays?: number }): Promise<WorkspaceInvite> {
    const ttlDays = invite.ttlDays ?? 14;
    const inv: WorkspaceInvite = {
      id: `inv_${crypto.randomBytes(8).toString("hex")}`,
      workspaceId: invite.workspaceId,
      email: invite.email.toLowerCase(),
      role: invite.role,
      token: crypto.randomBytes(24).toString("base64url"),
      invitedByUserId: invite.invitedByUserId,
      expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
      acceptedAt: null,
      revokedAt: null,
      createdAt: new Date(),
    };
    this.workspaceInvites.set(inv.id, inv);
    return inv;
  }

  async getInviteByToken(token: string): Promise<WorkspaceInvite | undefined> {
    for (const inv of this.workspaceInvites.values()) {
      if (inv.token === token) return inv;
    }
    return undefined;
  }

  async listInvites(workspaceId: string): Promise<WorkspaceInvite[]> {
    return Array.from(this.workspaceInvites.values())
      .filter((i) => i.workspaceId === workspaceId)
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }

  async findActivePendingInvite(workspaceId: string, email: string): Promise<WorkspaceInvite | undefined> {
    const target = email.toLowerCase();
    const now = Date.now();
    for (const inv of this.workspaceInvites.values()) {
      if (
        inv.workspaceId === workspaceId &&
        inv.email.toLowerCase() === target &&
        !inv.acceptedAt &&
        !inv.revokedAt &&
        new Date(inv.expiresAt).getTime() > now
      ) {
        return inv;
      }
    }
    return undefined;
  }

  async acceptInvite(token: string): Promise<WorkspaceInvite | undefined> {
    const inv = await this.getInviteByToken(token);
    if (!inv) return undefined;
    inv.acceptedAt = new Date();
    return inv;
  }

  async revokeInvite(workspaceId: string, inviteId: string): Promise<boolean> {
    const inv = this.workspaceInvites.get(inviteId);
    if (!inv || inv.workspaceId !== workspaceId) return false;
    inv.revokedAt = new Date();
    return true;
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
    secondaryRoles: Array.isArray(obj.secondaryRoles) ? obj.secondaryRoles : [],
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
    const doc = await UserModel.findOne(userByKeyFilter(id));
    return toUser(doc);
  }

  async createUser(user: InsertUser): Promise<User> {
    const doc = await UserModel.create({
      id: crypto.randomUUID(),
      ...user,
    });
    return toUser(doc)!;
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const doc = await UserModel.findOneAndUpdate(userByKeyFilter(id), data, { new: true });
    return toUser(doc);
  }

  async setUserOtp(id: string, otpCode: string, otpExpiry: Date): Promise<void> {
    await UserModel.findOneAndUpdate(userByKeyFilter(id), { otpCode, otpExpiry, otpAttempts: 0 });
  }

  async clearUserOtp(id: string): Promise<void> {
    await UserModel.findOneAndUpdate(userByKeyFilter(id), {
      otpCode: null,
      otpExpiry: null,
      otpAttempts: 0,
    });
  }

  async incrementOtpAttempts(id: string): Promise<number> {
    const doc = await UserModel.findOneAndUpdate(userByKeyFilter(id), { $inc: { otpAttempts: 1 } }, { new: true });
    return doc?.otpAttempts || 0;
  }

  async setTwofaEnabled(id: string, enabled: boolean): Promise<User | undefined> {
    const doc = await UserModel.findOneAndUpdate(userByKeyFilter(id), { twofaEnabled: enabled }, { new: true });
    return toUser(doc);
  }

  async setLastLogin(id: string): Promise<void> {
    await UserModel.findOneAndUpdate(userByKeyFilter(id), { lastLogin: new Date() });
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
    await UserModel.findOneAndUpdate(userByKeyFilter(userId), {
      resetToken: token,
      resetTokenExpiry: expiry,
    });
  }

  async getPasswordResetToken(userId: string): Promise<{ token: string; expiry: Date } | null> {
    const doc = await UserModel.findOne(userByKeyFilter(userId));
    if (!doc || !doc.resetToken || !doc.resetTokenExpiry) return null;
    return { token: doc.resetToken, expiry: doc.resetTokenExpiry };
  }

  async clearPasswordResetToken(userId: string): Promise<void> {
    await UserModel.findOneAndUpdate(userByKeyFilter(userId), {
      resetToken: null,
      resetTokenExpiry: null,
    });
  }

  // Assessment methods - using ProcessorSessionModel as base
  async createOrUpdateAssessment(assessment: Partial<Assessment>): Promise<Assessment> {
    const { ProcessorSessionModel } = await import("../shared/schema");

    const aid = assessment.assessmentId;
    if (!aid) {
      return {
        assessmentId: "",
        sessionId: assessment.sessionId || "",
        status: assessment.status || "draft",
        updatedAt: new Date(),
      };
    }

    const sidCandidate = assessment.sessionId || aid;
    const existingDoc = await ProcessorSessionModel.findOne({
      $or: [{ assessmentId: aid }, { sessionId: sidCandidate }, { sessionId: aid }],
    }).lean();

    const prev = (existingDoc || {}) as Record<string, unknown>;
    const sessionId =
      (typeof assessment.sessionId === "string" && assessment.sessionId
        ? assessment.sessionId
        : typeof prev.sessionId === "string" && prev.sessionId
          ? prev.sessionId
          : sidCandidate) || aid;

    const createdBy =
      assessment.createdBy ||
      assessment.userId ||
      (typeof prev.createdBy === "string" ? prev.createdBy : null) ||
      (typeof prev.createdByUserId === "string" ? prev.createdByUserId : null) ||
      undefined;

    const $set: Record<string, unknown> = {
      sessionId,
      assessmentId: aid,
      updatedAt: new Date(),
    };

    if (createdBy !== undefined) {
      $set.createdBy = createdBy;
      $set.createdByUserId = createdBy;
    }

    const assignIfIncoming = (key: keyof Assessment) => {
      const v = assessment[key];
      if (v !== undefined) $set[key as string] = v;
    };

    assignIfIncoming("clientId");
    assignIfIncoming("clientInfo");
    assignIfIncoming("financials");
    assignIfIncoming("pillars");
    assignIfIncoming("scorecardResult");
    assignIfIncoming("workspaceId");
    assignIfIncoming("pillarActivity");
    assignIfIncoming("scorecardSnapshots");

    if (assessment.status !== undefined) $set.status = assessment.status;
    else if (prev.status !== undefined) $set.status = prev.status;
    else $set.status = "draft";

    if (assessment.pillars === undefined && prev.pillars !== undefined) $set.pillars = prev.pillars;
    if (assessment.scorecardResult === undefined && prev.scorecardResult !== undefined)
      $set.scorecardResult = prev.scorecardResult;
    if (assessment.clientInfo === undefined && prev.clientInfo !== undefined) $set.clientInfo = prev.clientInfo;
    if (assessment.financials === undefined && prev.financials !== undefined) $set.financials = prev.financials;
    if (assessment.workspaceId === undefined && prev.workspaceId !== undefined) $set.workspaceId = prev.workspaceId;
    if (assessment.pillarActivity === undefined && prev.pillarActivity !== undefined)
      $set.pillarActivity = prev.pillarActivity;
    if (assessment.scorecardSnapshots === undefined && prev.scorecardSnapshots !== undefined)
      $set.scorecardSnapshots = prev.scorecardSnapshots;

    if (!existingDoc) {
      if ($set.companyInfo === undefined) {
        $set.companyInfo = {
          name: "Assessment",
          registrationNumber: "",
          sector: "",
          annualTurnover: "",
          employees: "",
          financialYearEnd: "",
          address: "",
          contactName: "",
          contactEmail: "",
          contactPhone: "",
          currentBBEELevel: "",
          notes: "",
          logo: "",
        };
      }
    }

    if (!prev.createdAt) {
      $set.createdAt = assessment.createdAt || new Date();
    }

    const doc = await ProcessorSessionModel.findOneAndUpdate({ sessionId }, { $set }, { new: true, upsert: true, setDefaultsOnInsert: true });

    return toAssessment(doc) || {
      assessmentId: aid,
      sessionId,
      status: (assessment.status as string) || "draft",
      updatedAt: new Date(),
    };
  }

  async getAssessment(assessmentId: string): Promise<Assessment | undefined> {
    const { ProcessorSessionModel } = await import("../shared/schema");
    const doc = await ProcessorSessionModel.findOne({
      $or: [{ assessmentId: assessmentId }, { sessionId: assessmentId }],
    });
    return toAssessment(doc);
  }

  async getUserAssessments(userId: string): Promise<Assessment[]> {
    const { ProcessorSessionModel } = await import("../shared/schema");
    const memberships = await WorkspaceMemberModel.find({ userId }).select("workspaceId").lean();
    const wsIds = memberships.map((m: { workspaceId: string }) => m.workspaceId).filter(Boolean);

    const orClause: Record<string, unknown>[] = [{ createdBy: userId }, { createdByUserId: userId }];
    if (wsIds.length > 0) {
      orClause.push({ workspaceId: { $in: wsIds } });
    }

    const docs = await ProcessorSessionModel.find({ $or: orClause }).sort({ updatedAt: -1 });
    return docs.map((d) => toAssessment(d)!).filter(Boolean);
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

  async getCompanyProfileByUserId(userId: string): Promise<CompanyProfile | undefined> {
    const doc = await CompanyProfileModel.findOne({ userId });
    return doc ? (doc.toJSON() as CompanyProfile) : undefined;
  }

  async upsertCompanyProfile(profile: InsertCompanyProfile): Promise<CompanyProfile> {
    const now = new Date();
    const uid = String(profile.userId);
    const filter = { userId: uid };
    const newDocId = `cp_${crypto.randomBytes(8).toString("hex")}`;
    const $set = {
      companyName: profile.companyName,
      role: profile.role ?? null,
      beeLevel: profile.beeLevel ?? null,
      employeeRange: profile.employeeRange ?? null,
      industry: profile.industry ?? null,
      industryOther: profile.industryOther ?? null,
      annualRevenue: profile.annualRevenue ?? null,
      acquisitionSource: profile.acquisitionSource ?? null,
      acquisitionSourceOther: profile.acquisitionSourceOther ?? null,
      toolsUsed: Array.isArray(profile.toolsUsed) ? profile.toolsUsed : [],
      toolsUsedOther: profile.toolsUsedOther ?? null,
      biggestChallenge: profile.biggestChallenge ?? null,
      updatedAt: now,
    };
    try {
      await CompanyProfileModel.updateOne(
        filter,
        { $set, $setOnInsert: { userId: uid, id: newDocId, createdAt: now } },
        { upsert: true },
      );
    } catch (err: unknown) {
      const code = err && typeof err === "object" && "code" in err ? (err as { code: number }).code : 0;
      if (code === 11000) {
        await CompanyProfileModel.updateOne(filter, { $set });
      } else {
        throw err;
      }
    }
    let doc = await CompanyProfileModel.findOne(filter);
    if (!doc) {
      throw new Error("CompanyProfile upsert: document missing after write");
    }
    if (!(doc as { id?: string }).id) {
      const fixId = `cp_${crypto.randomBytes(8).toString("hex")}`;
      await CompanyProfileModel.updateOne(filter, { $set: { id: fixId } });
      doc = await CompanyProfileModel.findOne(filter);
    }
    if (!doc) {
      throw new Error("CompanyProfile upsert: document missing after repair");
    }
    return doc.toJSON() as CompanyProfile;
  }

  // ----- Workspace methods (Mongo) -----
  async createWorkspace(name: string, ownerUserId: string): Promise<Workspace> {
    const workspaceId = `ws_${crypto.randomBytes(8).toString("hex")}`;
    const now = new Date();
    const doc = await WorkspaceModel.create({
      workspaceId,
      name,
      ownerUserId,
      createdAt: now,
      updatedAt: now,
    });
    await WorkspaceMemberModel.create({
      memberId: `wm_${crypto.randomBytes(8).toString("hex")}`,
      workspaceId,
      userId: ownerUserId,
      role: "owner",
      joinedAt: now,
    });
    const obj = doc.toJSON() as any;
    return { id: obj.id, name: obj.name, ownerUserId: obj.ownerUserId, createdAt: obj.createdAt, updatedAt: obj.updatedAt };
  }

  async getWorkspaceById(workspaceId: string): Promise<Workspace | undefined> {
    const doc = await WorkspaceModel.findOne({ workspaceId });
    if (!doc) return undefined;
    const obj = doc.toJSON() as any;
    return { id: obj.id, name: obj.name, ownerUserId: obj.ownerUserId, createdAt: obj.createdAt, updatedAt: obj.updatedAt };
  }

  async renameWorkspace(workspaceId: string, name: string): Promise<Workspace | undefined> {
    const doc = await WorkspaceModel.findOneAndUpdate(
      { workspaceId },
      { name, updatedAt: new Date() },
      { new: true }
    );
    if (!doc) return undefined;
    const obj = doc.toJSON() as any;
    return { id: obj.id, name: obj.name, ownerUserId: obj.ownerUserId, createdAt: obj.createdAt, updatedAt: obj.updatedAt };
  }

  async listWorkspacesForUser(userId: string): Promise<Array<Workspace & { role: WorkspaceRole }>> {
    const memberships = await WorkspaceMemberModel.find({ userId }).lean();
    if (memberships.length === 0) return [];
    const ids = memberships.map((m: any) => m.workspaceId);
    const workspaces = await WorkspaceModel.find({ workspaceId: { $in: ids } }).lean();
    const roleByWs = new Map<string, WorkspaceRole>(memberships.map((m: any) => [m.workspaceId, m.role]));
    return workspaces
      .map((w: any) => ({
        id: w.workspaceId,
        name: w.name,
        ownerUserId: w.ownerUserId,
        createdAt: w.createdAt,
        updatedAt: w.updatedAt,
        role: roleByWs.get(w.workspaceId)!,
      }))
      .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  }

  async getMember(workspaceId: string, userId: string): Promise<WorkspaceMember | undefined> {
    const doc = await WorkspaceMemberModel.findOne({ workspaceId, userId });
    if (!doc) return undefined;
    const obj = doc.toJSON() as any;
    return {
      id: obj.id,
      workspaceId: obj.workspaceId,
      userId: obj.userId,
      role: obj.role,
      pillarScopes: Array.isArray(obj.pillarScopes) ? obj.pillarScopes : undefined,
      joinedAt: obj.joinedAt,
    };
  }

  async listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    const docs = await WorkspaceMemberModel.find({ workspaceId }).sort({ joinedAt: 1 });
    return docs.map((d: any) => {
      const obj = d.toJSON();
      return {
        id: obj.id,
        workspaceId: obj.workspaceId,
        userId: obj.userId,
        role: obj.role,
        pillarScopes: Array.isArray(obj.pillarScopes) ? obj.pillarScopes : undefined,
        joinedAt: obj.joinedAt,
      };
    });
  }

  async addMember(workspaceId: string, userId: string, role: WorkspaceRole): Promise<WorkspaceMember> {
    const doc = await WorkspaceMemberModel.findOneAndUpdate(
      { workspaceId, userId },
      {
        $setOnInsert: {
          memberId: `wm_${crypto.randomBytes(8).toString("hex")}`,
          workspaceId,
          userId,
          joinedAt: new Date(),
        },
        $set: { role },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    const obj = doc.toJSON() as any;
    return { id: obj.id, workspaceId: obj.workspaceId, userId: obj.userId, role: obj.role, joinedAt: obj.joinedAt };
  }

  async updateMemberRole(workspaceId: string, userId: string, role: WorkspaceRole): Promise<WorkspaceMember | undefined> {
    return this.updateWorkspaceMember(workspaceId, userId, { role });
  }

  async updateWorkspaceMember(
    workspaceId: string,
    userId: string,
    patch: { role?: WorkspaceRole; pillarScopes?: string[] | null },
  ): Promise<WorkspaceMember | undefined> {
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, 1> = {};
    if (patch.role !== undefined) $set.role = patch.role;
    if (patch.pillarScopes === null) $unset.pillarScopes = 1;
    else if (patch.pillarScopes !== undefined) $set.pillarScopes = patch.pillarScopes;

    const updatePayload: Record<string, unknown> = {};
    if (Object.keys($set).length) updatePayload.$set = $set;
    if (Object.keys($unset).length) updatePayload.$unset = $unset;
    if (!updatePayload.$set && !updatePayload.$unset) {
      return this.getMember(workspaceId, userId);
    }

    const doc = await WorkspaceMemberModel.findOneAndUpdate({ workspaceId, userId }, updatePayload, { new: true });
    if (!doc) return undefined;
    const obj = doc.toJSON() as any;
    return {
      id: obj.id,
      workspaceId: obj.workspaceId,
      userId: obj.userId,
      role: obj.role,
      pillarScopes: Array.isArray(obj.pillarScopes) ? obj.pillarScopes : undefined,
      joinedAt: obj.joinedAt,
    };
  }

  async removeMember(workspaceId: string, userId: string): Promise<boolean> {
    const result = await WorkspaceMemberModel.deleteOne({ workspaceId, userId });
    return (result.deletedCount || 0) > 0;
  }

  async createInvite(invite: { workspaceId: string; email: string; role: WorkspaceRole; invitedByUserId: string; ttlDays?: number }): Promise<WorkspaceInvite> {
    const ttlDays = invite.ttlDays ?? 14;
    const doc = await WorkspaceInviteModel.create({
      inviteId: `inv_${crypto.randomBytes(8).toString("hex")}`,
      workspaceId: invite.workspaceId,
      email: invite.email.toLowerCase(),
      role: invite.role,
      token: crypto.randomBytes(24).toString("base64url"),
      invitedByUserId: invite.invitedByUserId,
      expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
      acceptedAt: null,
      revokedAt: null,
      createdAt: new Date(),
    });
    const obj = doc.toJSON() as any;
    return {
      id: obj.id, workspaceId: obj.workspaceId, email: obj.email, role: obj.role,
      token: obj.token, invitedByUserId: obj.invitedByUserId, expiresAt: obj.expiresAt,
      acceptedAt: obj.acceptedAt, revokedAt: obj.revokedAt, createdAt: obj.createdAt,
    };
  }

  async getInviteByToken(token: string): Promise<WorkspaceInvite | undefined> {
    const doc = await WorkspaceInviteModel.findOne({ token });
    if (!doc) return undefined;
    const obj = doc.toJSON() as any;
    return {
      id: obj.id, workspaceId: obj.workspaceId, email: obj.email, role: obj.role,
      token: obj.token, invitedByUserId: obj.invitedByUserId, expiresAt: obj.expiresAt,
      acceptedAt: obj.acceptedAt, revokedAt: obj.revokedAt, createdAt: obj.createdAt,
    };
  }

  async listInvites(workspaceId: string): Promise<WorkspaceInvite[]> {
    const docs = await WorkspaceInviteModel.find({ workspaceId }).sort({ createdAt: -1 });
    return docs.map((d: any) => {
      const obj = d.toJSON();
      return {
        id: obj.id, workspaceId: obj.workspaceId, email: obj.email, role: obj.role,
        token: obj.token, invitedByUserId: obj.invitedByUserId, expiresAt: obj.expiresAt,
        acceptedAt: obj.acceptedAt, revokedAt: obj.revokedAt, createdAt: obj.createdAt,
      };
    });
  }

  async findActivePendingInvite(workspaceId: string, email: string): Promise<WorkspaceInvite | undefined> {
    const doc = await WorkspaceInviteModel.findOne({
      workspaceId,
      email: email.toLowerCase(),
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });
    if (!doc) return undefined;
    const obj = doc.toJSON() as any;
    return {
      id: obj.id, workspaceId: obj.workspaceId, email: obj.email, role: obj.role,
      token: obj.token, invitedByUserId: obj.invitedByUserId, expiresAt: obj.expiresAt,
      acceptedAt: obj.acceptedAt, revokedAt: obj.revokedAt, createdAt: obj.createdAt,
    };
  }

  async acceptInvite(token: string): Promise<WorkspaceInvite | undefined> {
    const doc = await WorkspaceInviteModel.findOneAndUpdate(
      { token },
      { acceptedAt: new Date() },
      { new: true }
    );
    if (!doc) return undefined;
    const obj = doc.toJSON() as any;
    return {
      id: obj.id, workspaceId: obj.workspaceId, email: obj.email, role: obj.role,
      token: obj.token, invitedByUserId: obj.invitedByUserId, expiresAt: obj.expiresAt,
      acceptedAt: obj.acceptedAt, revokedAt: obj.revokedAt, createdAt: obj.createdAt,
    };
  }

  async revokeInvite(workspaceId: string, inviteId: string): Promise<boolean> {
    const result = await WorkspaceInviteModel.findOneAndUpdate(
      { inviteId, workspaceId },
      { revokedAt: new Date() }
    );
    return !!result;
  }
}

// Helper functions for Assessment and Client
function toAssessment(doc: any): Assessment | undefined {
  if (!doc) return undefined;
  const obj = doc.toJSON ? doc.toJSON() : doc;
  const snaps = Array.isArray(obj.scorecardSnapshots) ? obj.scorecardSnapshots : [];
  const activity =
    obj.pillarActivity && typeof obj.pillarActivity === "object" ? obj.pillarActivity : {};
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
    createdBy: obj.createdBy || obj.userId || obj.createdByUserId,
    workspaceId: obj.workspaceId ?? null,
    pillarActivity: activity,
    scorecardSnapshots: snaps,
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

import { createLogger } from "./logger";
const storageLogger = createLogger("Storage");

if (!useDatabase) {
  storageLogger.warn("Using in-memory storage (MONGODB_URI not set) - data will not persist across restarts");
  (async () => {
    const bcrypt = await import("bcryptjs");
    const hashedPassword = await bcrypt.hash("demo", 8);
    const demoUser = await storage.createUser({
      username: "demo",
      password: hashedPassword,
      fullName: "Netbank",
      email: "demo@okiru.pro",
      role: "admin",
      organizationId: null,
      organizationName: "Netbank",
      profilePicture: null,
    });
    storageLogger.info("Seeded demo user", { username: "demo" });

    await storage.upsertCompanyProfile({
      userId: demoUser.id,
      companyName: "Netbank",
      role: "admin",
      beeLevel: "Level 4",
      employeeRange: "11-50",
      industry: "Technology",
      annualRevenue: "R10M - R50M",
      acquisitionSource: "demo",
      toolsUsed: [],
      biggestChallenge: "Demo account - onboarding pre-completed",
    });
    storageLogger.info("Seeded demo user company profile", { userId: demoUser.id });

    try {
      const demoWorkspace = await storage.createWorkspace("Netbank", demoUser.id);
      await storage.updateUser(demoUser.id, { organizationId: demoWorkspace.id } as any);
      storageLogger.info("Seeded demo user workspace", {
        userId: demoUser.id,
        workspaceId: demoWorkspace.id,
      });
    } catch (wsErr) {
      storageLogger.error("Failed to seed demo workspace", wsErr as Error);
    }

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
    storageLogger.info("Seeded predefined templates", { count: starterTemplates.length });
  })();
} else {
  storageLogger.info("Using MongoDB database storage");
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
        storageLogger.info("Seeded missing default templates", { seeded: missing.length, total: sharedTemplates.length + missing.length });
      } else {
        storageLogger.debug("All default templates already exist", { count: sharedTemplates.length });
      }
    } catch (err) {
      storageLogger.error("Failed to seed default templates", err);
    }
  })();
}
