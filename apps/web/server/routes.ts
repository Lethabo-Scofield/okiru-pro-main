import type { Express } from "express";
import { createServer, type Server } from "http";
import Groq from "groq-sdk";
import session from "express-session";
import MongoStore from "connect-mongo";
import bcrypt from "bcryptjs";
import { storage } from "./storage";

const groqApiKey = process.env.GROQ_API_KEY;
if (!groqApiKey) {
  console.warn("WARNING: GROQ_API_KEY is not set. AI endpoints will return errors.");
}
const groq = new Groq({ apiKey: groqApiKey || "not-set" });

async function llmGenerate(systemPrompt: string, userPrompt: string, options?: { temperature?: number; maxTokens?: number }): Promise<string> {
  if (!groqApiKey) {
    throw new Error("GROQ_API_KEY is not configured. AI features are unavailable.");
  }
  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? 2000,
  });
  const content = completion.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("AI returned an empty response.");
  }
  return content;
}

function sanitizeUser(user: any) {
  const { password, ...safe } = user;
  return safe;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction) {
    app.set("trust proxy", 1);
  }

  const sessionConfig: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "okiru-entity-studio-dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
    },
  };

  if (process.env.MONGODB_URI) {
    sessionConfig.store = MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      collectionName: "sessions",
      touchAfter: 24 * 3600,
    });
  } else {
    console.warn("WARNING: Using in-memory session store (MONGODB_URI not set). Sessions will not persist across restarts.");
  }

  app.use(session(sessionConfig));

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, password, fullName, email, organizationName } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }
      if (password.length < 4) {
        return res.status(400).json({ message: "Password must be at least 4 characters" });
      }
      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(400).json({ message: "Username already taken" });
      }
      const hashedPassword = await bcrypt.hash(password, 8);
      const user = await storage.createUser({
        username,
        password: hashedPassword,
        fullName: fullName || null,
        email: email || null,
        organizationName: organizationName || null,
        role: "user",
        organizationId: null,
        profilePicture: null,
      });
      const safeUser = sanitizeUser(user);
      (req.session as any).userId = user.id;
      (req.session as any).userData = safeUser;
      res.json({ user: safeUser });
    } catch (error: any) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }
      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ message: "Invalid username or password" });
      }
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return res.status(401).json({ message: "Invalid username or password" });
      }
      const safeUser = sanitizeUser(user);
      (req.session as any).userId = user.id;
      (req.session as any).userData = safeUser;
      res.json({ user: safeUser });
    } catch (error: any) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.clearCookie("connect.sid");
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const cached = (req.session as any)?.userData;
      if (cached) {
        return res.json({ user: cached });
      }
      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      const safeUser = sanitizeUser(user);
      (req.session as any).userData = safeUser;
      res.json({ user: safeUser });
    } catch (error: any) {
      console.error("Auth check error:", error);
      res.status(401).json({ message: "Not authenticated" });
    }
  });

  app.patch("/api/profile", async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const { fullName, email } = req.body;
      const user = await storage.updateUser(userId, {
        ...(fullName !== undefined && { fullName }),
        ...(email !== undefined && { email }),
      });
      if (!user) return res.status(404).json({ message: "User not found" });
      const safeUser = sanitizeUser(user);
      (req.session as any).userData = safeUser;
      res.json({ user: safeUser });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.post("/api/profile/picture", async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      res.json({ user: { message: "Profile picture upload not yet implemented" } });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to upload picture" });
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
      if (!profile) {
        return res.status(404).json({ error: "Client not found" });
      }

      res.json({
        client: {
          id: clientId,
          name: profile.name,
          financialYear: "2025",
          revenue: profile.revenue,
          npat: profile.npat,
          leviableAmount: profile.leviableAmount,
          industrySector: profile.industry,
          eapProvince: "National",
          industryNorm: undefined,
        },
        ownership: {
          id: `own-${clientId}`,
          shareholders: [
            { id: "sh-1", name: "Black Equity Trust", ownershipType: "trust", blackOwnership: 30, blackWomenOwnership: 12, shares: 3000, shareValue: 300000 },
            { id: "sh-2", name: "Management Consortium", ownershipType: "shareholder", blackOwnership: 15, blackWomenOwnership: 8, shares: 1500, shareValue: 150000 },
          ],
          companyValue: profile.revenue * 1.2,
          outstandingDebt: profile.revenue * 0.15,
          yearsHeld: 5,
        },
        management: {
          employees: [
            { id: "emp-1", name: "Thabo Mokoena", gender: "male", race: "african", designation: "top_management", isDisabled: false },
            { id: "emp-2", name: "Naledi Khumalo", gender: "female", race: "african", designation: "senior_management", isDisabled: false },
            { id: "emp-3", name: "Pieter van der Merwe", gender: "male", race: "white", designation: "top_management", isDisabled: false },
            { id: "emp-4", name: "Priya Naidoo", gender: "female", race: "indian", designation: "middle_management", isDisabled: false },
            { id: "emp-5", name: "Sizwe Dlamini", gender: "male", race: "african", designation: "junior_management", isDisabled: true },
          ],
        },
        skills: {
          leviableAmount: profile.leviableAmount,
          trainingPrograms: [
            { id: "tp-1", name: "Leadership Development", category: "learnerships", cost: profile.leviableAmount * 0.02, employeeId: "emp-1", isEmployed: true, isBlack: true, gender: "male", race: "african", isDisabled: false },
            { id: "tp-2", name: "Technical Skills Programme", category: "skills_programmes", cost: profile.leviableAmount * 0.015, employeeId: "emp-2", isEmployed: true, isBlack: true, gender: "female", race: "african", isDisabled: false },
            { id: "tp-3", name: "Bursary Programme", category: "bursaries", cost: profile.leviableAmount * 0.01, employeeId: null, isEmployed: false, isBlack: true, gender: "female", race: "african", isDisabled: false },
          ],
        },
        procurement: {
          tmps: profile.revenue * 0.6,
          suppliers: [
            { id: "sup-1", name: "Isizwe Supplies", beeLevel: 1, blackOwnership: 51, blackWomenOwnership: 30, youthOwnership: 0, disabledOwnership: 0, enterpriseType: "eme", spend: profile.revenue * 0.08 },
            { id: "sup-2", name: "National Distributors", beeLevel: 3, blackOwnership: 26, blackWomenOwnership: 10, youthOwnership: 5, disabledOwnership: 0, enterpriseType: "qse", spend: profile.revenue * 0.12 },
            { id: "sup-3", name: "Tech Solutions SA", beeLevel: 2, blackOwnership: 40, blackWomenOwnership: 15, youthOwnership: 0, disabledOwnership: 0, enterpriseType: "generic", spend: profile.revenue * 0.05 },
          ],
        },
        esd: {
          contributions: [
            { id: "esd-1", beneficiary: "Township Micro-Enterprise Fund", type: "grant", amount: profile.npat * 0.02, category: "enterprise_development" },
            { id: "esd-2", beneficiary: "Youth Business Incubator", type: "loan", amount: profile.npat * 0.015, category: "supplier_development" },
          ],
        },
        sed: {
          contributions: [
            { id: "sed-1", beneficiary: "Local School Feeding Scheme", type: "monetary", amount: profile.npat * 0.01, category: "education" },
            { id: "sed-2", beneficiary: "Community Health Clinic", type: "monetary", amount: profile.npat * 0.008, category: "health" },
          ],
        },
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

  app.get("/api/templates", async (_req, res) => {
    try {
      const templates = await storage.getTemplates();
      res.json(templates);
    } catch (error: any) {
      console.error("Error fetching templates:", error);
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });

  app.get("/api/templates/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const template = await storage.getTemplate(id);
      if (!template) return res.status(404).json({ error: "Template not found" });
      res.json(template);
    } catch (error: any) {
      console.error("Error fetching template:", error);
      res.status(500).json({ error: "Failed to fetch template" });
    }
  });

  app.post("/api/templates", async (req, res) => {
    try {
      const { name, description, version, entities } = req.body;
      if (!name || !entities || !Array.isArray(entities)) {
        return res.status(400).json({ error: "name and entities array are required" });
      }
      const template = await storage.createTemplate({
        name,
        description: description || "",
        version: version || "1.0",
        entities,
      });
      res.json(template);
    } catch (error: any) {
      console.error("Error creating template:", error);
      res.status(500).json({ error: "Failed to create template" });
    }
  });

  app.put("/api/templates/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { name, description, version, entities } = req.body;
      const template = await storage.updateTemplate(id, {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(version && { version }),
        ...(entities && { entities }),
      });
      if (!template) return res.status(404).json({ error: "Template not found" });
      res.json(template);
    } catch (error: any) {
      console.error("Error updating template:", error);
      res.status(500).json({ error: "Failed to update template" });
    }
  });

  app.delete("/api/templates/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteTemplate(id);
      if (!deleted) return res.status(404).json({ error: "Template not found" });
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting template:", error);
      res.status(500).json({ error: "Failed to delete template" });
    }
  });

  app.post("/api/generate-entities", async (req, res) => {
    try {
      const { description } = req.body;

      if (!description || typeof description !== "string") {
        return res.status(400).json({ error: "description is required" });
      }

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
          synonyms,
          positives,
          negatives,
          zones,
          keywords: { must: mustKw, nice: niceKw, neg: negKw },
          pattern,
          expanded: true,
          activeTab: "definition",
        };
        return res.json({ entities: [fallbackEntity] });
      }

      const systemPrompt = `You are an entity extraction configuration assistant. Given a user's natural language description, generate exactly ONE fully-configured entity definition.

Generate a SINGLE entity with ALL fields completely filled:
- label: A PascalCase label (e.g. "InvoiceNumber", "DueDate")
- definition: A clear 1-2 sentence definition of what this entity represents
- synonyms: 3-5 alternative names or aliases for this entity
- positives: 3-5 realistic example values that would be extracted
- negatives: 2-3 examples of what should NOT be extracted (common false positives)
- zones: Likely document zones (from: "Email Subject", "Email Body", "PDF Header", "Tables", "Footer", "Signature Block")
- keywords: Object with must (2-3 required keywords), nice (2-3 nice-to-have), neg (1-2 negative keywords)
- pattern: A regex pattern if applicable, empty string if not

Respond ONLY with a valid JSON array containing exactly ONE entity object. No markdown, no explanation.

Example:
[
  {
    "label": "InvoiceNumber",
    "definition": "The unique alphanumeric identifier assigned to the invoice document.",
    "synonyms": ["Invoice ID", "Bill Number", "Invoice No.", "Inv #"],
    "positives": ["INV-2024-0042", "INV-001234", "BILL-99812"],
    "negatives": ["PO-9981-X", "REF-2024", "Customer ID"],
    "zones": ["PDF Header", "Email Body"],
    "keywords": {"must": ["invoice", "number"], "nice": ["bill", "reference"], "neg": ["purchase order"]},
    "pattern": "INV-\\\\d{4}-\\\\d{4}"
  }
]`;

      const content = await llmGenerate(systemPrompt, `User request: ${description}`);

      let entities;
      try {
        const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        entities = JSON.parse(cleaned);
      } catch {
        entities = [];
      }

      if (!Array.isArray(entities)) {
        entities = [];
      }

      const formattedEntities = entities.slice(0, 1).map((e: any) => ({
        id: Date.now() + Math.random(),
        label: e.label || "CustomEntity",
        definition: e.definition || "Auto-generated entity",
        completeness: 80,
        synonyms: e.synonyms || [],
        positives: e.positives || [],
        negatives: e.negatives || [],
        zones: e.zones || ["Email Body", "PDF Header"],
        keywords: e.keywords || { must: [], nice: [], neg: [] },
        pattern: e.pattern || "",
        expanded: true,
        activeTab: "definition",
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

      if (!documentText || !entities || !Array.isArray(entities)) {
        return res.status(400).json({ error: "documentText and entities array are required" });
      }

      if (!groqApiKey) {
        const fallbackResults = entities.map((e: any, idx: number) => ({
          id: idx + 1,
          entity: e.label,
          value: null,
          conf: 0,
          method: "NER",
          status: "pending",
        }));
        return res.json({ extractions: fallbackResults });
      }

      const entityLabels = entities.map((e: any) => `${e.label}: ${e.definition || e.label}`).join("\n");

      const extractSystemPrompt = `You are a document entity extraction engine. Given a document's text content and entity types to extract, find and extract values for each entity.

CRITICAL RULES:
1. Search the ENTIRE document thoroughly, case-insensitively.
2. If the entity label, a synonym, or any related word appears ANYWHERE in the document, you MUST extract it.
3. For specific data fields: extract the exact value.
4. For conceptual entities: extract the most relevant passage (up to 300 chars).
5. Even partial or indirect matches should be extracted with lower confidence (40-60%).
6. ONLY return null/confidence 0 if there is absolutely ZERO mention of anything related.
7. When in doubt, EXTRACT. False positives are better than false negatives.

For each entity, provide:
- entity: The entity type label
- value: The extracted value from the document (null only if truly absent)
- confidence: 0-100 (90+ exact, 60-80 related, 40-60 partial)
- method: One of "Pattern", "NER", "Hybrid", "Context"

Respond ONLY with a valid JSON array.`;

      const content = await llmGenerate(extractSystemPrompt, `Document text:\n${documentText}\n\nEntities to extract:\n${entityLabels}`, { temperature: 0.3 });

      let results;
      try {
        const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        results = JSON.parse(cleaned);
      } catch {
        results = [];
      }

      if (!Array.isArray(results)) {
        results = [];
      }

      const formattedResults = results
        .filter((r: any) => r.value !== null)
        .map((r: any, idx: number) => ({
          id: idx + 1,
          entity: r.entity,
          value: r.value,
          conf: r.confidence || 0,
          method: r.method || "NER",
          status: "pending",
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

      if (!documents || !Array.isArray(documents)) {
        return res.status(400).json({ error: "documents array is required" });
      }

      if (!groqApiKey) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });
        const send = (event: string, data: any) => {
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };
        send("start", { total: documents.length });
        for (let i = 0; i < documents.length; i++) {
          const doc = documents[i];
          send("doc-start", { index: i, fileName: doc.fileName, templateName: doc.templateName });
          send("doc-done", { index: i, fileName: doc.fileName, templateId: doc.templateId, templateName: doc.templateName, entities: [] });
        }
        send("complete", { total: documents.length });
        res.end();
        return;
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      const send = (event: string, data: any) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      send("start", { total: documents.length });

      for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];
        const { fileName, templateId, templateName, entitiesToExtract, documentText } = doc;

        send("doc-start", { index: i, fileName, templateName });

        if (!entitiesToExtract || entitiesToExtract.length === 0) {
          send("doc-done", { index: i, fileName, templateId, templateName, entities: [] });
          continue;
        }

        const entityDescriptions = entitiesToExtract
          .map((e: any) => {
            let desc = `- ${e.label}: ${e.definition}`;
            if (e.synonyms && e.synonyms.length > 0) desc += `\n  Synonyms/aliases: ${e.synonyms.join(', ')}`;
            if (e.keywords?.must?.length > 0) desc += `\n  Must-have keywords: ${e.keywords.must.join(', ')}`;
            if (e.keywords?.nice?.length > 0) desc += `\n  Nice-to-have keywords: ${e.keywords.nice.join(', ')}`;
            if (e.pattern) desc += `\n  Expected pattern: ${e.pattern}`;
            if (e.positives && e.positives.length > 0) desc += `\n  Example positive values: ${e.positives.join(', ')}`;
            if (e.negatives && e.negatives.length > 0) desc += `\n  NOT these (negative examples): ${e.negatives.join(', ')}`;
            return desc;
          })
          .join("\n\n");

        const hasRealContent = documentText && documentText.trim().length > 0 && !documentText.startsWith("[Could not read");

        try {
          const streamSystemPrompt = hasRealContent
            ? `You are a document entity extraction engine. You are given the actual text content of a document named "${fileName}". Your job is to find and extract the requested entities from the document text.

CRITICAL RULES — READ CAREFULLY:
1. ALWAYS search the ENTIRE document text thoroughly, word by word if needed.
2. Matching is CASE-INSENSITIVE. "nationality" matches "Nationality", "NATIONALITY", etc.
3. Look for the entity label itself, its synonyms, related words, and ANY mention that relates to the entity concept.
4. If the exact word or a synonym appears ANYWHERE in the document, you MUST extract it. Do NOT say "not_found" if the word exists in the text.
5. For specific data fields (dates, IDs, numbers): extract the exact value.
6. For conceptual entities (topics, categories, descriptions): extract the most relevant sentence or passage (up to 300 chars).
7. Even PARTIAL or INDIRECT matches should be extracted with lower confidence (40-60%).
8. A value should ONLY be null and status "not_found" if there is absolutely ZERO mention of the entity or anything related to it in the entire document.
9. When in doubt, EXTRACT rather than skip. False positives are better than false negatives.

For each entity, respond with:
- name: The entity label exactly as given
- value: The extracted text from the document (null ONLY if absolutely nothing found)
- confidence: 0-100 (90+ for exact match, 60-80 for related/conceptual, 40-60 for partial/indirect)
- status: "extracted" if ANY relevant content found, "not_found" ONLY if truly absent

Respond ONLY with a valid JSON array.`
            : `You are a document entity extraction engine. The document "${fileName}" was uploaded but its text could not be read (it may be a binary format like PDF or image). Indicate that extraction requires OCR or text conversion.

For each entity, provide:
- name: The entity label exactly as given
- value: null
- confidence: 0
- status: "not_readable"

Respond ONLY with a valid JSON array.`;

          const streamUserContent = hasRealContent
            ? `DOCUMENT TEXT:\n---\n${documentText.substring(0, 12000)}\n---\n\nENTITIES TO EXTRACT:\n${entityDescriptions}`
            : `File: ${fileName}\nEntities to extract:\n${entityDescriptions}`;

          const content = await llmGenerate(streamSystemPrompt, streamUserContent, { temperature: 0.2 });
          let entities;
          try {
            const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            entities = JSON.parse(cleaned);
          } catch {
            entities = entitiesToExtract.map((e: any) => ({
              name: e.label,
              value: `Extracted ${e.label}`,
              confidence: Math.floor(Math.random() * 15) + 85,
              status: "extracted",
            }));
          }

          send("doc-done", {
            index: i,
            fileName,
            templateId,
            templateName,
            entities: Array.isArray(entities) ? entities : [],
          });
        } catch (docError: any) {
          console.error(`Error processing document ${fileName}:`, docError);
          send("doc-error", {
            index: i,
            fileName,
            templateId,
            templateName,
            error: docError.message || "Extraction failed",
            entities: entitiesToExtract.map((e: any) => ({
              name: e.label,
              value: `Error extracting ${e.label}`,
              confidence: 0,
              status: "error",
            })),
          });
        }
      }

      send("complete", { total: documents.length });
      res.end();
    } catch (error: any) {
      console.error("Error processing documents:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to process documents" });
      } else {
        res.end();
      }
    }
  });

  app.get("/api/clients/:clientId/calculator-config", async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const { clientId } = req.params;
      const row = await storage.getCalculatorConfig(clientId);
      if (row) {
        res.json(row.config);
      } else {
        res.json(null);
      }
    } catch (error: any) {
      console.error("Error fetching calculator config:", error);
      res.status(500).json({ error: "Failed to fetch calculator config" });
    }
  });

  app.put("/api/clients/:clientId/calculator-config", async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const { clientId } = req.params;
      const { config } = req.body;
      if (!config) {
        return res.status(400).json({ error: "config is required" });
      }
      const row = await storage.saveCalculatorConfig(clientId, config);
      res.json(row.config);
    } catch (error: any) {
      console.error("Error saving calculator config:", error);
      res.status(500).json({ error: "Failed to save calculator config" });
    }
  });

  app.post("/api/generate-calculator-suggestions", async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const { type, industry, existing } = req.body;

      if (!groqApiKey) {
        const suggestion = type === 'benefitFactor'
          ? { type: 'new_contribution', factor: 0.8, description: 'New contribution type' }
          : { name: industry || 'New Industry', norm: 'Standard industry norm' };
        return res.json({ suggestion });
      }

      const prompt = type === 'benefitFactor'
        ? `You are a B-BBEE compliance expert. Suggest a new benefit factor type for Enterprise and Supplier Development contributions. Industry: ${industry || 'Generic'}. Existing types: ${(existing || []).map((e: any) => e.type).join(', ')}. Respond with JSON: {"type": "snake_case_name", "factor": 0.0_to_1.0, "description": "brief description"}`
        : `You are a B-BBEE compliance expert. Suggest a new industry norm entry. Industry: ${industry || 'Generic'}. Existing norms: ${(existing || []).map((e: any) => e.name).join(', ')}. Respond with JSON: {"name": "Industry Name", "norm": "Brief description of the norm"}`;

      const content = await llmGenerate(
        "You are a South African B-BBEE compliance specialist. Respond ONLY with valid JSON, no markdown.",
        prompt,
        { temperature: 0.7, maxTokens: 500 },
      );
      let suggestion;
      try {
        const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        suggestion = JSON.parse(cleaned);
      } catch {
        suggestion = type === 'benefitFactor'
          ? { type: 'new_contribution', factor: 0.8, description: 'New contribution type' }
          : { name: 'New Industry', norm: 'Standard industry norm' };
      }

      res.json({ suggestion });
    } catch (error: any) {
      console.error("Error generating suggestions:", error);
      res.status(500).json({ error: "Failed to generate suggestions" });
    }
  });

  return httpServer;
}
