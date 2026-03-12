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

export interface IStorage {
  getTemplates(): Promise<Template[]>;
  getTemplate(id: number): Promise<Template | undefined>;
  createTemplate(template: InsertTemplate): Promise<Template>;
  updateTemplate(id: number, template: Partial<InsertTemplate>): Promise<Template | undefined>;
  deleteTemplate(id: number): Promise<boolean>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserById(id: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;
  getCalculatorConfig(clientId: string): Promise<CalculatorConfigRow | undefined>;
  saveCalculatorConfig(clientId: string, config: CalculatorConfig): Promise<CalculatorConfigRow>;
}

export class MemoryStorage implements IStorage {
  private templates: Map<number, Template> = new Map();
  private users: Map<string, User> = new Map();
  private calculatorConfigs: Map<string, CalculatorConfigRow> = new Map();
  private templateSeq = 0;
  private userSeq = 0;
  private configSeq = 0;

  async getTemplates(): Promise<Template[]> {
    return Array.from(this.templates.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  async getTemplate(id: number): Promise<Template | undefined> {
    return this.templates.get(id);
  }

  async createTemplate(template: InsertTemplate): Promise<Template> {
    const id = ++this.templateSeq;
    const now = new Date();
    const doc: Template = {
      id,
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
      updatedAt: new Date(),
    };
    this.templates.set(id, updated);
    return updated;
  }

  async deleteTemplate(id: number): Promise<boolean> {
    return this.templates.delete(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((u) => u.username === username);
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
    createdAt: obj.createdAt,
  };
}

function toTemplate(doc: any): Template | undefined {
  if (!doc) return undefined;
  const obj = doc.toJSON ? doc.toJSON() : doc;
  return {
    id: obj.seqId || obj.id || obj._id,
    name: obj.name,
    description: obj.description || null,
    version: obj.version || "1.0",
    entities: obj.entities || [],
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

export class DatabaseStorage implements IStorage {
  async getTemplates(): Promise<Template[]> {
    const docs = await TemplateModel.find().sort({ updatedAt: -1 });
    return docs.map((d) => toTemplate(d)!);
  }

  async getTemplate(id: number): Promise<Template | undefined> {
    const doc = await TemplateModel.findOne({ seqId: id });
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

  async deleteTemplate(id: number): Promise<boolean> {
    const result = await TemplateModel.deleteOne({ seqId: id });
    return result.deletedCount > 0;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const doc = await UserModel.findOne({ username });
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
}

const useDatabase = !!process.env.MONGODB_URI;
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
    const top3 = starterTemplates.slice(0, 3);
    for (const t of top3) {
      await storage.createTemplate({
        name: t.name,
        description: t.description,
        version: "1.0",
        entities: t.entities,
      });
    }
    console.log(`Storage: Seeded ${top3.length} predefined templates`);
  })();
} else {
  console.log("Storage: Using MongoDB database storage.");
}
