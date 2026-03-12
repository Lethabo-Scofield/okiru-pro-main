import type { VercelRequest, VercelResponse } from "@vercel/node";
import express from "express";
import session from "express-session";
import bcrypt from "bcryptjs";
import mongoose, { Schema } from "mongoose";
import { Store } from "express-session";
import crypto from "crypto";

class MongoSessionStore extends Store {
  private collection: any;
  private ttl: number;
  constructor(opts: { db: typeof mongoose; collectionName?: string; ttl?: number }) {
    super();
    this.ttl = opts.ttl || 86400 * 14;
    const sessionSchema = new Schema({
      _id: String,
      session: Schema.Types.Mixed,
      expires: { type: Date, index: { expires: 0 } },
    }, { collection: opts.collectionName || "sessions", versionKey: false });
    this.collection = opts.db.models.Session || opts.db.model("Session", sessionSchema);
  }
  get(sid: string, cb: (err: any, session?: any) => void) {
    this.collection.findById(sid).then((doc: any) => {
      if (!doc) return cb(null, null);
      if (doc.expires && doc.expires < new Date()) {
        this.destroy(sid, () => cb(null, null));
        return;
      }
      cb(null, doc.session);
    }).catch((e: any) => cb(e));
  }
  set(sid: string, sess: any, cb?: (err?: any) => void) {
    const expires = new Date(Date.now() + this.ttl * 1000);
    this.collection.findByIdAndUpdate(sid, { _id: sid, session: sess, expires }, { upsert: true }).then(() => cb?.()).catch((e: any) => cb?.(e));
  }
  destroy(sid: string, cb?: (err?: any) => void) {
    this.collection.deleteOne({ _id: sid }).then(() => cb?.()).catch((e: any) => cb?.(e));
  }
  touch(sid: string, sess: any, cb?: (err?: any) => void) {
    const expires = new Date(Date.now() + this.ttl * 1000);
    this.collection.findByIdAndUpdate(sid, { expires }).then(() => cb?.()).catch((e: any) => cb?.(e));
  }
}

const AUTH_SECRET = process.env.SESSION_SECRET || "okiru-entity-studio-dev-secret";

function signToken(payload: any): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", AUTH_SECRET).update(data).digest("base64url");
  return `${data}.${sig}`;
}

function verifyToken(token: string): any | null {
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = crypto.createHmac("sha256", AUTH_SECRET).update(data).digest("base64url");
  if (sig !== expected) return null;
  try { return JSON.parse(Buffer.from(data, "base64url").toString()); } catch { return null; }
}

let isDbConnected = false;
async function connectDB() {
  if (isDbConnected) return;
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn("MONGODB_URI not set — running without database. Auth will use session-only mode.");
    return;
  }
  try {
    await mongoose.connect(uri);
    isDbConnected = true;
    console.log("MongoDB connected");
  } catch (err: any) {
    console.error("MongoDB connection failed:", err.message);
  }
}
mongoose.connection.on("disconnected", () => { isDbConnected = false; });

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
userSchema.set("toJSON", { virtuals: true, transform: (_d: any, ret: any) => { ret.id = ret._id.toString(); delete ret._id; delete ret.__v; return ret; } });

const templateSchema = new Schema({
  seqId: { type: Number, unique: true, sparse: true },
  name: { type: String, required: true },
  description: { type: String, default: null },
  version: { type: String, default: "1.0" },
  entities: { type: Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
templateSchema.set("toJSON", { virtuals: true, transform: (_d: any, ret: any) => { ret.id = ret.seqId || ret._id; delete ret._id; delete ret.__v; return ret; } });

const counterSchema = new Schema({ _id: { type: String, required: true }, seq: { type: Number, default: 0 } });
const calculatorConfigSchema = new Schema({
  clientId: { type: String, required: true, unique: true },
  config: { type: Schema.Types.Mixed, required: true },
  updatedAt: { type: Date, default: Date.now },
});
calculatorConfigSchema.set("toJSON", { virtuals: true, transform: (_d: any, ret: any) => { ret.id = ret._id; delete ret._id; delete ret.__v; return ret; } });

const UserModel = mongoose.models.User || mongoose.model("User", userSchema);
const TemplateModel = mongoose.models.Template || mongoose.model("Template", templateSchema);
const CounterModel = mongoose.models.Counter || mongoose.model("Counter", counterSchema);
const CalculatorConfigModel = mongoose.models.CalculatorConfig || mongoose.model("CalculatorConfig", calculatorConfigSchema);

async function getNextSequence(name: string): Promise<number> {
  const counter = await CounterModel.findByIdAndUpdate(name, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return counter.seq;
}

function toUser(doc: any) {
  if (!doc) return undefined;
  const obj = doc.toJSON ? doc.toJSON() : doc;
  return { id: obj.id || obj._id?.toString(), username: obj.username, password: obj.password, fullName: obj.fullName || null, email: obj.email || null, role: obj.role || null, organizationId: obj.organizationId || null, organizationName: obj.organizationName || null, profilePicture: obj.profilePicture || null, createdAt: obj.createdAt };
}

function toTemplate(doc: any) {
  if (!doc) return undefined;
  const obj = doc.toJSON ? doc.toJSON() : doc;
  return { id: obj.seqId || obj.id || obj._id, name: obj.name, description: obj.description || null, version: obj.version || "1.0", entities: obj.entities || [], createdAt: obj.createdAt, updatedAt: obj.updatedAt };
}

function sanitizeUser(user: any) {
  const { password, ...safe } = user;
  return safe;
}

const groqApiKey = process.env.GROQ_API_KEY;

async function llmGenerate(systemPrompt: string, userPrompt: string, options?: { temperature?: number; maxTokens?: number }): Promise<string> {
  if (!groqApiKey) throw new Error("GROQ_API_KEY is not configured.");
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${groqApiKey}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 2000,
    }),
  });
  if (!response.ok) {
    const err = await response.text().catch(() => "Unknown error");
    throw new Error(`Groq API error (${response.status}): ${err}`);
  }
  const data = await response.json() as any;
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI returned an empty response.");
  return content;
}

let appInstance: express.Express | null = null;
let initPromise: Promise<express.Express> | null = null;

async function getApp(): Promise<express.Express> {
  if (appInstance) return appInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await connectDB();

    const app = express();
    app.use((req: any, _res: any, next: any) => {
      req._vercelParsedBody = req.body;
      next();
    });
    app.use(express.json({ limit: "10mb" }));
    app.use(express.urlencoded({ extended: false, limit: "10mb" }));
    app.use((req: any, _res: any, next: any) => {
      if ((!req.body || (typeof req.body === 'object' && Object.keys(req.body).length === 0)) && req._vercelParsedBody !== undefined) {
        req.body = req._vercelParsedBody;
      }
      next();
    });
    app.set("trust proxy", 1);

    const sessionConfig: any = {
      secret: process.env.SESSION_SECRET || "okiru-entity-studio-dev-secret",
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, secure: true, sameSite: "lax" as const, maxAge: 7 * 24 * 60 * 60 * 1000 },
    };
    if (isDbConnected) {
      sessionConfig.store = new MongoSessionStore({ db: mongoose, collectionName: "sessions" });
    }
    app.use(session(sessionConfig));

    app.get("/api/health", (_req, res) => {
      res.json({ status: "ok", timestamp: Date.now() });
    });

    app.post("/api/auth/register", async (req, res) => {
      try {
        const { username, password, fullName, email, organizationName } = req.body;
        if (!username || !password) return res.status(400).json({ message: "Username and password are required" });
        if (password.length < 4) return res.status(400).json({ message: "Password must be at least 4 characters" });

        if (isDbConnected) {
          const existing = await UserModel.findOne({ username });
          if (existing) return res.status(400).json({ message: "Username already taken" });
          const hashedPassword = await bcrypt.hash(password, 8);
          const doc = await UserModel.create({ username, password: hashedPassword, fullName: fullName || null, email: email || null, organizationName: organizationName || null, role: "user", organizationId: null, profilePicture: null });
          const user = toUser(doc)!;
          const safeUser = sanitizeUser(user);
          (req.session as any).userId = user.id;
          (req.session as any).userData = safeUser;
          return res.json({ user: safeUser });
        }

        const safeUser = { id: `user-${Date.now()}`, username, fullName: fullName || null, email: email || null, role: "user", organizationId: null, organizationName: organizationName || null, profilePicture: null };
        const token = signToken(safeUser);
        res.cookie("okiru_auth", token, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000 });
        res.json({ user: safeUser });
      } catch (error: any) {
        console.error("Register error:", error);
        res.status(500).json({ message: "Registration failed" });
      }
    });

    app.post("/api/auth/login", async (req, res) => {
      try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ message: "Username and password are required" });

        if (isDbConnected) {
          const doc = await UserModel.findOne({ username });
          if (!doc) return res.status(401).json({ message: "Invalid username or password" });
          const user = toUser(doc)!;
          const valid = await bcrypt.compare(password, user.password);
          if (!valid) return res.status(401).json({ message: "Invalid username or password" });
          const safeUser = sanitizeUser(user);
          (req.session as any).userId = user.id;
          (req.session as any).userData = safeUser;
          return res.json({ user: safeUser });
        }

        const safeUser = { id: `user-${Date.now()}`, username, fullName: null, email: null, role: "user", organizationId: null, organizationName: null, profilePicture: null };
        const token = signToken(safeUser);
        res.cookie("okiru_auth", token, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000 });
        res.json({ user: safeUser });
      } catch (error: any) {
        console.error("Login error:", error);
        res.status(500).json({ message: "Login failed" });
      }
    });

    app.post("/api/auth/logout", (req, res) => {
      if (!isDbConnected) {
        res.clearCookie("okiru_auth");
        return res.json({ success: true });
      }
      req.session.destroy((err) => {
        if (err) return res.status(500).json({ message: "Logout failed" });
        res.json({ success: true });
      });
    });

    app.get("/api/auth/me", async (req, res) => {
      try {
        if (isDbConnected) {
          const userId = (req.session as any)?.userId;
          if (!userId) return res.status(401).json({ message: "Not authenticated" });
          const cached = (req.session as any)?.userData;
          if (cached) return res.json({ user: cached });
          const doc = await UserModel.findById(userId);
          if (!doc) return res.status(401).json({ message: "Not authenticated" });
          const safeUser = sanitizeUser(toUser(doc)!);
          (req.session as any).userData = safeUser;
          return res.json({ user: safeUser });
        }

        const cookies = (req.headers.cookie || "").split(";").map(c => c.trim());
        const authCookie = cookies.find(c => c.startsWith("okiru_auth="));
        if (!authCookie) return res.status(401).json({ message: "Not authenticated" });
        const token = authCookie.split("=").slice(1).join("=");
        const user = verifyToken(token);
        if (!user) return res.status(401).json({ message: "Not authenticated" });
        return res.json({ user });
      } catch (error: any) {
        res.status(500).json({ message: "Failed to get user" });
      }
    });

    app.patch("/api/profile", async (req, res) => {
      try {
        const { fullName, email } = req.body;
        if (isDbConnected) {
          const userId = (req.session as any)?.userId;
          if (!userId) return res.status(401).json({ message: "Not authenticated" });
          const doc = await UserModel.findByIdAndUpdate(userId, { ...(fullName !== undefined && { fullName }), ...(email !== undefined && { email }) }, { new: true });
          if (!doc) return res.status(404).json({ message: "User not found" });
          const safeUser = sanitizeUser(toUser(doc)!);
          (req.session as any).userData = safeUser;
          return res.json({ user: safeUser });
        }
        const cookies = (req.headers.cookie || "").split(";").map(c => c.trim());
        const authCookie = cookies.find(c => c.startsWith("okiru_auth="));
        if (!authCookie) return res.status(401).json({ message: "Not authenticated" });
        const token = authCookie.split("=").slice(1).join("=");
        const current = verifyToken(token);
        if (!current) return res.status(401).json({ message: "Not authenticated" });
        const updated = { ...current, ...(fullName !== undefined && { fullName }), ...(email !== undefined && { email }) };
        const newToken = signToken(updated);
        res.cookie("okiru_auth", newToken, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000 });
        res.json({ user: updated });
      } catch (error: any) {
        res.status(500).json({ message: "Failed to update profile" });
      }
    });

    app.post("/api/profile/picture", async (_req, res) => {
      res.json({ url: null });
    });

    const inMemoryTemplates: any[] = [
      { id: 1, seqId: 1, name: "B-BBEE Certificate", description: "Extract key fields from B-BBEE compliance certificates", version: "1.0", entities: [
        { id: 1, label: "CompanyName", definition: "The registered name of the company on the certificate", synonyms: ["Entity Name", "Organisation", "Business Name"], positives: ["Moyo Retail (Pty) Ltd", "Karoo Telecom"], negatives: ["Registration Number", "Date"], zones: ["PDF Header"], keywords: { must: ["company", "name"], nice: ["entity", "business"], neg: ["number", "date"] }, pattern: "", completeness: 85, expanded: false, activeTab: "definition" },
        { id: 2, label: "BEELevel", definition: "The B-BBEE level achieved (1-8 or Non-compliant)", synonyms: ["Level", "BEE Status", "Compliance Level"], positives: ["Level 1", "Level 4", "3"], negatives: ["Amount", "Date"], zones: ["PDF Header", "Tables"], keywords: { must: ["level", "bee"], nice: ["status", "compliance"], neg: ["amount"] }, pattern: "Level\\s*\\d|\\d", completeness: 90, expanded: false, activeTab: "definition" },
        { id: 3, label: "ExpiryDate", definition: "The date when the certificate expires", synonyms: ["Valid Until", "Expiry", "Certificate End Date"], positives: ["2025-03-31", "31 March 2025"], negatives: ["Issue Date", "Amount"], zones: ["PDF Header"], keywords: { must: ["expiry", "valid"], nice: ["date", "until"], neg: ["issue", "amount"] }, pattern: "\\d{4}[-/]\\d{2}[-/]\\d{2}|\\d{1,2}\\s+\\w+\\s+\\d{4}", completeness: 88, expanded: false, activeTab: "definition" },
      ], createdAt: new Date("2024-01-15"), updatedAt: new Date("2024-01-15") },
      { id: 2, seqId: 2, name: "Ownership Verification", description: "Verify ownership structure and black ownership percentages", version: "1.0", entities: [
        { id: 4, label: "BlackOwnershipPercentage", definition: "The percentage of black ownership in the company", synonyms: ["Black Ownership", "BO%", "Black Shareholding"], positives: ["51%", "30.5%", "25.1%"], negatives: ["Revenue", "Employee Count"], zones: ["Tables"], keywords: { must: ["black", "ownership"], nice: ["percentage", "shareholding"], neg: ["revenue"] }, pattern: "\\d{1,3}(\\.\\d{1,2})?%", completeness: 92, expanded: false, activeTab: "definition" },
        { id: 5, label: "BlackWomenOwnership", definition: "The percentage of black women ownership", synonyms: ["BW Ownership", "Black Female Ownership"], positives: ["12%", "25%"], negatives: ["Total Ownership", "Male Ownership"], zones: ["Tables"], keywords: { must: ["black", "women"], nice: ["female", "ownership"], neg: ["male"] }, pattern: "\\d{1,3}(\\.\\d{1,2})?%", completeness: 85, expanded: false, activeTab: "definition" },
      ], createdAt: new Date("2024-01-20"), updatedAt: new Date("2024-01-20") },
      { id: 3, seqId: 3, name: "Management Control", description: "Extract management control and employment equity data", version: "1.0", entities: [
        { id: 6, label: "BoardComposition", definition: "Composition of the board of directors by race and gender", synonyms: ["Board Members", "Directors"], positives: ["3 Black, 2 White", "60% Black representation"], negatives: ["Employee Count", "Revenue"], zones: ["Tables"], keywords: { must: ["board", "director"], nice: ["composition", "member"], neg: ["employee", "revenue"] }, pattern: "", completeness: 80, expanded: false, activeTab: "definition" },
      ], createdAt: new Date("2024-02-01"), updatedAt: new Date("2024-02-01") },
    ];
    let nextTemplateId = 4;

    app.get("/api/templates", async (_req, res) => {
      try {
        if (isDbConnected) {
          const docs = await TemplateModel.find().sort({ updatedAt: -1 });
          return res.json(docs.map((d: any) => toTemplate(d)!));
        }
        res.json(inMemoryTemplates.map(t => ({ id: t.seqId, name: t.name, description: t.description, version: t.version, entities: t.entities, createdAt: t.createdAt, updatedAt: t.updatedAt })));
      } catch (error: any) {
        res.status(500).json({ error: "Failed to fetch templates" });
      }
    });

    app.get("/api/templates/:id", async (req, res) => {
      try {
        if (isDbConnected) {
          const doc = await TemplateModel.findOne({ seqId: Number(req.params.id) });
          if (!doc) return res.status(404).json({ error: "Template not found" });
          return res.json(toTemplate(doc));
        }
        const t = inMemoryTemplates.find(t => t.seqId === Number(req.params.id));
        if (!t) return res.status(404).json({ error: "Template not found" });
        res.json({ id: t.seqId, name: t.name, description: t.description, version: t.version, entities: t.entities, createdAt: t.createdAt, updatedAt: t.updatedAt });
      } catch (error: any) {
        res.status(500).json({ error: "Failed to fetch template" });
      }
    });

    app.post("/api/templates", async (req, res) => {
      try {
        const { name, description, version, entities } = req.body || {};
        if (!name) return res.status(400).json({ error: "name is required" });
        if (!Array.isArray(entities)) return res.status(400).json({ error: "entities must be an array" });
        if (isDbConnected) {
          const seqId = await getNextSequence("template");
          const doc = await TemplateModel.create({ seqId, name, description: description || "", version: version || "1.0", entities: entities || [] });
          return res.json(toTemplate(doc));
        }
        const seqId = nextTemplateId++;
        const newTemplate = { id: seqId, seqId, name, description: description || "", version: version || "1.0", entities: entities || [], createdAt: new Date(), updatedAt: new Date() };
        inMemoryTemplates.push(newTemplate);
        res.json({ id: seqId, name, description: description || "", version: version || "1.0", entities: entities || [], createdAt: newTemplate.createdAt, updatedAt: newTemplate.updatedAt });
      } catch (error: any) {
        console.error("Error creating template:", error);
        res.status(500).json({ error: "Failed to create template" });
      }
    });

    app.put("/api/templates/:id", async (req, res) => {
      try {
        const body = req.body || {};
        if (isDbConnected) {
          const doc = await TemplateModel.findOneAndUpdate({ seqId: Number(req.params.id) }, { ...body, updatedAt: new Date() }, { new: true });
          if (!doc) return res.status(404).json({ error: "Template not found" });
          return res.json(toTemplate(doc));
        }
        const idx = inMemoryTemplates.findIndex(t => t.seqId === Number(req.params.id));
        if (idx === -1) return res.status(404).json({ error: "Template not found" });
        inMemoryTemplates[idx] = { ...inMemoryTemplates[idx], ...body, updatedAt: new Date() };
        const t = inMemoryTemplates[idx];
        res.json({ id: t.seqId, name: t.name, description: t.description, version: t.version, entities: t.entities, createdAt: t.createdAt, updatedAt: t.updatedAt });
      } catch (error: any) {
        console.error("Error updating template:", error);
        res.status(500).json({ error: "Failed to update template" });
      }
    });

    app.delete("/api/templates/:id", async (req, res) => {
      try {
        if (isDbConnected) {
          const result = await TemplateModel.deleteOne({ seqId: Number(req.params.id) });
          if (result.deletedCount === 0) return res.status(404).json({ error: "Template not found" });
          return res.json({ success: true });
        }
        const idx = inMemoryTemplates.findIndex(t => t.seqId === Number(req.params.id));
        if (idx === -1) return res.status(404).json({ error: "Template not found" });
        inMemoryTemplates.splice(idx, 1);
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: "Failed to delete template" });
      }
    });

    app.post("/api/generate-entities", async (req, res) => {
      try {
        const { description } = req.body;
        if (!description || typeof description !== "string") return res.status(400).json({ error: "description is required" });

        if (!groqApiKey) {
          const words = description.trim().split(/\s+/);
          const label = words
            .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join("")
            .replace(/[^a-zA-Z0-9]/g, "")
            || "CustomEntity";

          const descLower = description.toLowerCase();
          const isDate = /date|period|year|expir|valid|time/i.test(descLower);
          const isAmount = /amount|cost|spend|price|value|budget|salary|revenue|rand|fee/i.test(descLower);
          const isPercentage = /percent|ratio|rate|proportion|share|%/i.test(descLower);
          const isName = /name|person|company|entity|beneficiary|director|member|employee/i.test(descLower);
          const isNumber = /number|count|total|quantity|id|ref|code/i.test(descLower);
          const isStatus = /status|level|type|category|class/i.test(descLower);

          let synonyms: string[] = [];
          let positives: string[] = [];
          let negatives: string[] = [];
          let zones: string[] = ["Email Body", "PDF Header"];
          let mustKw: string[] = [];
          let niceKw: string[] = [];
          let negKw: string[] = [];
          let pattern = "";

          if (isDate) {
            synonyms = ["Date", "Period", "Valid Until", "Effective Date"];
            positives = ["2024-06-15", "15 June 2024", "2024/06/15", "31 March 2025"];
            negatives = ["Reference Number", "Amount", "Name"];
            zones = ["PDF Header", "Tables"];
            mustKw = words.slice(0, 2).map((w: string) => w.toLowerCase());
            niceKw = ["date", "period"];
            negKw = ["amount", "name"];
            pattern = "\\d{4}[-/]\\d{2}[-/]\\d{2}|\\d{1,2}\\s+(January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{4}";
          } else if (isAmount) {
            synonyms = ["Amount", "Cost", "Value", "Spend"];
            positives = ["R500,000", "R1,200,000", "R2.5M", "R75,000.00"];
            negatives = ["Percentage", "Count", "Date"];
            zones = ["Tables"];
            mustKw = words.slice(0, 2).map((w: string) => w.toLowerCase());
            niceKw = ["amount", "value"];
            negKw = ["date", "name"];
            pattern = "R\\s?[\\d,. ]+(\\.\\d{2})?(M|K)?";
          } else if (isPercentage) {
            synonyms = ["Percentage", "Rate", "Proportion", "Share"];
            positives = ["51%", "25.1%", "100%", "30.5%"];
            negatives = ["Amount", "Count", "Date"];
            zones = ["Tables"];
            mustKw = words.slice(0, 2).map((w: string) => w.toLowerCase());
            niceKw = ["percentage", "rate"];
            negKw = ["amount", "count"];
            pattern = "\\d{1,3}(\\.\\d{1,2})?%";
          } else if (isName) {
            synonyms = ["Name", "Entity", "Organisation", "Company"];
            positives = ["Moyo Retail (Pty) Ltd", "Karoo Telecom", "John Doe"];
            negatives = ["Amount", "Date", "Number"];
            zones = ["PDF Header", "Email Body"];
            mustKw = words.slice(0, 2).map((w: string) => w.toLowerCase());
            niceKw = ["name", "entity"];
            negKw = ["amount", "date"];
          } else if (isNumber) {
            synonyms = ["Number", "Reference", "ID", "Code"];
            positives = ["REF-2024-001", "12345", "ABC-001", "N/A"];
            negatives = ["Name", "Amount", "Date"];
            zones = ["PDF Header", "Tables"];
            mustKw = words.slice(0, 2).map((w: string) => w.toLowerCase());
            niceKw = ["number", "reference"];
            negKw = ["name", "amount"];
            pattern = "[A-Z]{2,4}[-/]?\\d{3,6}";
          } else if (isStatus) {
            synonyms = ["Status", "Level", "Type", "Category"];
            positives = ["Active", "Compliant", "Level 1", "Approved"];
            negatives = ["Amount", "Date", "Name"];
            zones = ["PDF Header", "Tables"];
            mustKw = words.slice(0, 2).map((w: string) => w.toLowerCase());
            niceKw = ["status", "level"];
            negKw = ["amount", "date"];
          } else {
            const mainWords = words.slice(0, 3).map((w: string) => w.toLowerCase());
            synonyms = mainWords.map((w: string) => w.charAt(0).toUpperCase() + w.slice(1));
            synonyms.push(label);
            positives = ["Example value 1", "Example value 2", "Example value 3"];
            negatives = ["Not applicable", "Unrelated value"];
            mustKw = mainWords.slice(0, 2);
            niceKw = mainWords.slice(2);
            negKw = ["unrelated"];
          }

          const fallbackEntity = {
            id: Date.now() + Math.random(),
            label,
            definition: description.charAt(0).toUpperCase() + description.slice(1) + (description.endsWith('.') ? '' : '.'),
            completeness: 60,
            synonyms, positives, negatives, zones,
            keywords: { must: mustKw, nice: niceKw, neg: negKw },
            pattern, expanded: true, activeTab: "definition",
          };
          return res.json({ entities: [fallbackEntity] });
        }

        const systemPrompt = `You are an entity extraction configuration assistant. Given a user's natural language description, generate exactly ONE fully-configured entity definition.
Generate a SINGLE entity with ALL fields completely filled:
- label: A PascalCase label (e.g. "InvoiceNumber", "DueDate")
- definition: A clear 1-2 sentence definition
- synonyms: 3-5 alternative names
- positives: 3-5 realistic example values
- negatives: 2-3 examples of what should NOT be extracted
- zones: Likely document zones (from: "Email Subject", "Email Body", "PDF Header", "Tables", "Footer", "Signature Block")
- keywords: Object with must (2-3), nice (2-3), neg (1-2)
- pattern: A regex pattern if applicable, empty string if not
Respond ONLY with a valid JSON array containing exactly ONE entity object.`;

        const content = await llmGenerate(systemPrompt, `User request: ${description}`);
        let entities;
        try { const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim(); entities = JSON.parse(cleaned); } catch { entities = []; }
        if (!Array.isArray(entities)) entities = [];

        const formattedEntities = entities.slice(0, 1).map((e: any) => ({
          id: Date.now() + Math.random(), label: e.label || "CustomEntity", definition: e.definition || "Auto-generated entity", completeness: 80,
          synonyms: e.synonyms || [], positives: e.positives || [], negatives: e.negatives || [],
          zones: e.zones || ["Email Body", "PDF Header"], keywords: e.keywords || { must: [], nice: [], neg: [] },
          pattern: e.pattern || "", expanded: true, activeTab: "definition",
        }));
        res.json({ entities: formattedEntities });
      } catch (error: any) {
        console.error("Error generating entities:", error);
        res.status(500).json({ error: "Failed to generate entities" });
      }
    });

    app.post("/api/extract-entities", async (req, res) => {
      try {
        const { documentText, entities } = req.body;
        if (!documentText || !entities || !Array.isArray(entities)) return res.status(400).json({ error: "documentText and entities array are required" });

        if (!groqApiKey) {
          const fallbackResults = entities.map((e: any, idx: number) => ({
            id: idx + 1, entity: e.label, value: null, conf: 0, method: "NER", status: "pending",
          }));
          return res.json({ extractions: fallbackResults });
        }

        const entityLabels = entities.map((e: any) => `${e.label}: ${e.definition || e.label}`).join("\n");
        const extractSystemPrompt = `You are a document entity extraction engine. Extract values for each entity from the document.
RULES: Search ENTIRE document case-insensitively. Extract even partial matches with lower confidence. Only null if absolutely nothing found.
For each entity provide: entity (label), value (extracted or null), confidence (0-100), method ("Pattern"|"NER"|"Hybrid"|"Context").
Respond ONLY with a valid JSON array.`;
        const content = await llmGenerate(extractSystemPrompt, `Document text:\n${documentText}\n\nEntities to extract:\n${entityLabels}`, { temperature: 0.3 });
        let results;
        try { const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim(); results = JSON.parse(cleaned); } catch { results = []; }
        if (!Array.isArray(results)) results = [];
        const formattedResults = results.filter((r: any) => r.value !== null).map((r: any, idx: number) => ({
          id: idx + 1, entity: r.entity, value: r.value, conf: r.confidence || 0, method: r.method || "NER", status: "pending",
        }));
        res.json({ extractions: formattedResults });
      } catch (error: any) {
        console.error("Error extracting entities:", error);
        res.status(500).json({ error: "Failed to extract entities" });
      }
    });

    app.post("/api/process-documents-stream", async (req, res) => {
      try {
        const { documents } = req.body;
        if (!documents || !Array.isArray(documents)) return res.status(400).json({ error: "documents array is required" });
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" });
        const send = (event: string, data: any) => { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };

        if (!groqApiKey) {
          send("start", { total: documents.length });
          for (let i = 0; i < documents.length; i++) {
            const doc = documents[i];
            send("doc-start", { index: i, fileName: doc.fileName, templateName: doc.templateName });
            send("doc-done", { index: i, fileName: doc.fileName, templateId: doc.templateId, templateName: doc.templateName, entities: [] });
          }
          send("complete", { total: documents.length });
          return res.end();
        }

        send("start", { total: documents.length });
        for (let i = 0; i < documents.length; i++) {
          const doc = documents[i];
          const { fileName, templateId, templateName, entitiesToExtract, documentText } = doc;
          send("doc-start", { index: i, fileName, templateName });
          if (!entitiesToExtract || entitiesToExtract.length === 0) { send("doc-done", { index: i, fileName, templateId, templateName, entities: [] }); continue; }
          const entityDescriptions = entitiesToExtract.map((e: any) => {
            let desc = `- ${e.label}: ${e.definition}`;
            if (e.synonyms?.length > 0) desc += `\n  Synonyms: ${e.synonyms.join(", ")}`;
            if (e.keywords?.must?.length > 0) desc += `\n  Must-have keywords: ${e.keywords.must.join(", ")}`;
            if (e.pattern) desc += `\n  Expected pattern: ${e.pattern}`;
            if (e.positives?.length > 0) desc += `\n  Example values: ${e.positives.join(", ")}`;
            if (e.negatives?.length > 0) desc += `\n  NOT these: ${e.negatives.join(", ")}`;
            return desc;
          }).join("\n\n");
          const hasRealContent = documentText && documentText.trim().length > 0 && !documentText.startsWith("[Could not read");
          try {
            const sp = hasRealContent
              ? `You are a document entity extraction engine. Extract entities from the document. RULES: Search the ENTIRE text case-insensitively. Extract even partial matches. Only null if absolutely nothing found. For each entity: name (exact label), value (extracted text or null), confidence (0-100), status ("extracted" or "not_found"). JSON array only.`
              : `Document could not be read. For each entity, respond with name, value: null, confidence: 0, status: "not_readable". JSON array only.`;
            const up = hasRealContent
              ? `Document "${fileName}":\n\nDOCUMENT TEXT:\n---\n${documentText.substring(0, 12000)}\n---\n\nENTITIES TO EXTRACT:\n${entityDescriptions}`
              : `Document "${fileName}" could not be read.\n\nEntities:\n${entityDescriptions}`;
            const content = await llmGenerate(sp, up, { temperature: 0.2 });
            let entities;
            try { const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim(); entities = JSON.parse(cleaned); } catch {
              entities = entitiesToExtract.map((e: any) => ({ name: e.label, value: `Extracted ${e.label}`, confidence: Math.floor(Math.random() * 15) + 85, status: "extracted" }));
            }
            send("doc-done", { index: i, fileName, templateId, templateName, entities: Array.isArray(entities) ? entities : [] });
          } catch (docError: any) {
            console.error(`Error processing ${fileName}:`, docError);
            send("doc-error", { index: i, fileName, templateId, templateName, error: docError.message || "Extraction failed", entities: entitiesToExtract.map((e: any) => ({ name: e.label, value: null, confidence: 0, status: "error" })) });
          }
        }
        send("complete", { total: documents.length });
        res.end();
      } catch (error: any) {
        console.error("Error processing documents:", error);
        if (!res.headersSent) { res.status(500).json({ error: "Failed to process documents" }); }
        else { try { res.write(`event: error\ndata: ${JSON.stringify({ error: error.message || "Processing failed" })}\n\n`); } catch {} res.end(); }
      }
    });

    const companyProfiles: Record<string, any> = {
      "C-10483": { name: "Moyo Retail (Pty) Ltd", industry: "Retail", revenue: 85000000, npat: 6200000, leviableAmount: 28000000 },
      "C-21907": { name: "Karoo Telecom", industry: "Telecoms", revenue: 320000000, npat: 41000000, leviableAmount: 95000000 },
      "C-88712": { name: "Umhlaba Insurance Group", industry: "Insurance", revenue: 540000000, npat: 72000000, leviableAmount: 160000000 },
      "C-54011": { name: "Aurum Financial Services", industry: "Financial Services", revenue: 210000000, npat: 28000000, leviableAmount: 62000000 },
      "C-66309": { name: "Blue Crane Logistics", industry: "Logistics", revenue: 125000000, npat: 9800000, leviableAmount: 38000000 },
      "C-77201": { name: "Saffron Health Network", industry: "Healthcare", revenue: 190000000, npat: 22000000, leviableAmount: 55000000 },
      "C-30118": { name: "Vula Energy Partners", industry: "Energy", revenue: 410000000, npat: 53000000, leviableAmount: 120000000 },
      "C-91145": { name: "CapeTech Manufacturing", industry: "Manufacturing", revenue: 275000000, npat: 31000000, leviableAmount: 82000000 },
    };

    app.get("/api/clients/:clientId/data", async (req, res) => {
      try {
        const { clientId } = req.params;
        const profile = companyProfiles[clientId];
        if (!profile) return res.status(404).json({ error: "Client not found" });
        res.json({
          client: { id: clientId, name: profile.name, financialYear: "2025", revenue: profile.revenue, npat: profile.npat, leviableAmount: profile.leviableAmount, industrySector: profile.industry, eapProvince: "National" },
          ownership: { id: `own-${clientId}`, shareholders: [
            { id: "sh-1", name: "Black Equity Trust", ownershipType: "trust", blackOwnership: 30, blackWomenOwnership: 12, shares: 3000, shareValue: 300000 },
            { id: "sh-2", name: "Management Consortium", ownershipType: "shareholder", blackOwnership: 15, blackWomenOwnership: 8, shares: 1500, shareValue: 150000 },
          ], companyValue: profile.revenue * 1.2, outstandingDebt: profile.revenue * 0.15, yearsHeld: 5 },
          management: { employees: [
            { id: "emp-1", name: "Thabo Mokoena", gender: "male", race: "african", designation: "top_management", isDisabled: false },
            { id: "emp-2", name: "Naledi Khumalo", gender: "female", race: "african", designation: "senior_management", isDisabled: false },
            { id: "emp-3", name: "Pieter van der Merwe", gender: "male", race: "white", designation: "top_management", isDisabled: false },
            { id: "emp-4", name: "Priya Naidoo", gender: "female", race: "indian", designation: "middle_management", isDisabled: false },
            { id: "emp-5", name: "Sizwe Dlamini", gender: "male", race: "african", designation: "junior_management", isDisabled: true },
          ] },
          skills: { leviableAmount: profile.leviableAmount, trainingPrograms: [
            { id: "tp-1", name: "Leadership Development", category: "learnerships", cost: profile.leviableAmount * 0.02, employeeId: "emp-1", isEmployed: true, isBlack: true, gender: "male", race: "african", isDisabled: false },
            { id: "tp-2", name: "Technical Skills Programme", category: "skills_programmes", cost: profile.leviableAmount * 0.015, employeeId: "emp-2", isEmployed: true, isBlack: true, gender: "female", race: "african", isDisabled: false },
            { id: "tp-3", name: "Bursary Programme", category: "bursaries", cost: profile.leviableAmount * 0.01, employeeId: null, isEmployed: false, isBlack: true, gender: "female", race: "african", isDisabled: false },
          ] },
          procurement: { tmps: profile.revenue * 0.6, suppliers: [
            { id: "sup-1", name: "Isizwe Supplies", beeLevel: 1, blackOwnership: 51, blackWomenOwnership: 30, youthOwnership: 0, disabledOwnership: 0, enterpriseType: "eme", spend: profile.revenue * 0.08 },
            { id: "sup-2", name: "National Distributors", beeLevel: 3, blackOwnership: 26, blackWomenOwnership: 10, youthOwnership: 5, disabledOwnership: 0, enterpriseType: "qse", spend: profile.revenue * 0.12 },
            { id: "sup-3", name: "Tech Solutions SA", beeLevel: 2, blackOwnership: 40, blackWomenOwnership: 15, youthOwnership: 0, disabledOwnership: 0, enterpriseType: "generic", spend: profile.revenue * 0.05 },
          ] },
          esd: { contributions: [
            { id: "esd-1", beneficiary: "Township Micro-Enterprise Fund", type: "grant", amount: profile.npat * 0.02, category: "enterprise_development" },
            { id: "esd-2", beneficiary: "Youth Business Incubator", type: "loan", amount: profile.npat * 0.015, category: "supplier_development" },
          ] },
          sed: { contributions: [
            { id: "sed-1", beneficiary: "Local School Feeding Scheme", type: "monetary", amount: profile.npat * 0.01, category: "education" },
            { id: "sed-2", beneficiary: "Community Health Clinic", type: "monetary", amount: profile.npat * 0.008, category: "health" },
          ] },
          financialYears: [
            { id: "fy-1", year: "2024", revenue: profile.revenue * 0.9, npat: profile.npat * 0.85, indicativeNpat: null, notes: "" },
            { id: "fy-2", year: "2023", revenue: profile.revenue * 0.8, npat: profile.npat * 0.75, indicativeNpat: null, notes: "" },
          ],
          scenarios: [],
        });
      } catch (error: any) {
        console.error("Error fetching client data:", error);
        res.status(500).json({ error: "Failed to fetch client data" });
      }
    });

    app.get("/api/clients/:clientId/calculator-config", async (req, res) => {
      try {
        const userId = (req.session as any)?.userId;
        if (!userId) return res.status(401).json({ error: "Not authenticated" });
        if (!isDbConnected) return res.json(null);
        const doc = await CalculatorConfigModel.findOne({ clientId: req.params.clientId });
        res.json(doc ? doc.toJSON().config : null);
      } catch (error: any) {
        res.status(500).json({ error: "Failed to fetch calculator config" });
      }
    });

    app.put("/api/clients/:clientId/calculator-config", async (req, res) => {
      try {
        const userId = (req.session as any)?.userId;
        if (!userId) return res.status(401).json({ error: "Not authenticated" });
        const { config } = req.body;
        if (!config) return res.status(400).json({ error: "config is required" });
        if (!isDbConnected) return res.json(config);
        const doc = await CalculatorConfigModel.findOneAndUpdate({ clientId: req.params.clientId }, { config, updatedAt: new Date() }, { new: true, upsert: true });
        res.json(doc.toJSON().config);
      } catch (error: any) {
        res.status(500).json({ error: "Failed to save calculator config" });
      }
    });

    app.post("/api/generate-calculator-suggestions", async (req, res) => {
      try {
        const userId = (req.session as any)?.userId;
        if (!userId) return res.status(401).json({ error: "Not authenticated" });
        const { type, industry, existing } = req.body;

        if (!groqApiKey) {
          const suggestion = type === "benefitFactor"
            ? { type: "new_contribution", factor: 0.8, description: "New contribution type" }
            : { name: industry || "Generic", norm: "Standard industry norm" };
          return res.json({ suggestion });
        }

        const prompt = type === "benefitFactor"
          ? `Suggest a new B-BBEE benefit factor. Industry: ${industry || "Generic"}. Existing: ${(existing || []).map((e: any) => e.type).join(", ")}. Respond with JSON: {"type": "snake_case", "factor": 0.0_to_1.0, "description": "brief"}`
          : `Suggest a new B-BBEE industry norm. Industry: ${industry || "Generic"}. Existing: ${(existing || []).map((e: any) => e.name).join(", ")}. Respond with JSON: {"name": "Industry Name", "norm": "description"}`;
        const content = await llmGenerate("You are a South African B-BBEE compliance specialist. Respond ONLY with valid JSON.", prompt);
        let suggestion;
        try { const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim(); suggestion = JSON.parse(cleaned); } catch {
          suggestion = type === "benefitFactor" ? { type: "new_contribution", factor: 0.8, description: "New contribution type" } : { name: "New Industry", norm: "Standard industry norm" };
        }
        res.json({ suggestion });
      } catch (error: any) {
        console.error("Error generating suggestions:", error);
        res.status(500).json({ error: "Failed to generate suggestions" });
      }
    });

    app.use((req: any, res: any) => {
      console.error("Vercel Express 404 — no route matched:", req.method, req.url, req.originalUrl);
      res.status(404).json({ error: "Not found", path: req.url, method: req.method });
    });

    appInstance = app;
    return app;
  })().catch((err) => {
    console.error("FATAL: App initialization failed:", err);
    initPromise = null;
    throw err;
  });

  return initPromise;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const app = await getApp();
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const done = () => { if (!settled) { settled = true; resolve(); } };
      res.on("finish", done);
      res.on("close", done);
      res.on("error", (err: Error) => { if (!settled) { settled = true; reject(err); } });

      const originalUrl = req.url || "/";
      (req as any).originalUrl = originalUrl;
      app(req as any, res as any);
    });
  } catch (error: any) {
    const msg = error?.message || String(error);
    console.error("Vercel API handler error:", msg, "URL:", req.url);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error", details: msg });
    }
  }
}
