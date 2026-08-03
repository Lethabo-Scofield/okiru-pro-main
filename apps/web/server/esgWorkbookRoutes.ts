import type { Express, Request, Response } from "express";
import mongoose from "mongoose";
import { requireAuth } from "./routes";
import { canAccessEsgToolkit } from "./esgAccess";
import { createLogger } from "./logger";
import { ClientModel } from "../shared/schema";
import { getClient as memGetClient } from "./clientsMemoryStore";
import { ESG_SECTION_IDS } from "../src/lib/esgSections";
import { validateEsgWorkbookForSubmit } from "../src/lib/esgValidation";
import { buildEsgWorkbookXlsx } from "../src/lib/esgWorkbookExport";
import { buildEsgWorkbookTemplateXlsx } from "../src/lib/esg/esgWorkbookTemplate";
import { computeEsgScores } from "../src/lib/esg/esgCalculators";
import { buildGoldenSections } from "./esgGoldenFixture";
import { parseEsgWorkbookXlsx } from "../src/lib/esg/esgWorkbookImport";

const logger = createLogger("EsgWorkbook");

export type EsgWorkbookSection = { cells: Record<string, unknown> };
export type EsgWorkbookData = {
  companyId: string;
  ownerUserId: string;
  ownerOrganizationId: string | null;
  sections: Record<string, EsgWorkbookSection>;
  updatedAt: string;
  submittedAt?: string | null;
};

const SECTION_KEYS = ESG_SECTION_IDS;

const esgWorkbookSchema = new mongoose.Schema(
  {
    companyId: { type: String, required: true, unique: true, index: true },
    ownerUserId: { type: String, required: true, index: true },
    ownerOrganizationId: { type: String, default: null, index: true },
    sections: { type: mongoose.Schema.Types.Mixed, default: {} },
    submittedAt: { type: Date, default: null },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "esg_workbooks", minimize: false },
);

const EsgWorkbookModel =
  mongoose.models.EsgWorkbook || mongoose.model("EsgWorkbook", esgWorkbookSchema);

const memoryStore = new Map<string, EsgWorkbookData & { submittedAt?: string | null }>();

function mongoReady(): boolean {
  return mongoose.connection.readyState === 1;
}

function requireEsgAccess(req: Request, res: Response): boolean {
  const user = (req as any).user;
  if (!canAccessEsgToolkit(user)) {
    res.status(403).json({ error: "ESG preview not available for this account" });
    return false;
  }
  return true;
}

async function authorizeEsgWorkbook(req: Request, res: Response): Promise<EsgWorkbookData | null> {
  if (!requireEsgAccess(req, res)) return null;
  const user = (req as any).user;
  const userId: string | undefined = user?.id || (req.session as any)?.userId;
  if (!userId) {
    res.status(401).json({ message: "Not authenticated" });
    return null;
  }
  const companyId = req.params.companyId;
  const userOrgId: string | null = user?.organizationId ?? null;

  let clientExists = false;
  let clientOrgId: string | null = null;
  let clientCreatedBy: string | null = null;
  if (mongoReady()) {
    const client = (await ClientModel.findOne({ clientId: companyId })
      .select({ clientId: 1, organizationId: 1, createdByUserId: 1 })
      .lean()) as { organizationId?: string | null; createdByUserId?: string | null } | null;
    if (client) {
      clientExists = true;
      clientOrgId = client.organizationId ?? null;
      clientCreatedBy = client.createdByUserId ?? null;
    }
  } else {
    const c = memGetClient(companyId) as { organizationId?: string | null; createdByUserId?: string | null } | undefined;
    if (c) {
      clientExists = true;
      clientOrgId = c.organizationId ?? null;
      clientCreatedBy = c.createdByUserId ?? null;
    }
  }
  if (!clientExists) {
    res.status(404).json({ error: "Company not found" });
    return null;
  }

  // Cross-tenant guard (audit): previously this function only checked that the
  // client EXISTED, so any ESG-enabled user could read/write ANY company's ESG
  // workbook by id. Enforce the same rule as the client/workbook paths — the
  // creator or a same-organization teammate only.
  const sameUser = clientCreatedBy != null && clientCreatedBy === userId;
  const sameOrg = !!userOrgId && !!clientOrgId && clientOrgId === userOrgId;
  if (!sameUser && !sameOrg) {
    res.status(403).json({ error: "You don't have access to this company's ESG workbook" });
    return null;
  }

  let wb: EsgWorkbookData | null = null;
  if (mongoReady()) {
    const doc = await EsgWorkbookModel.findOne({ companyId }).lean();
    if (doc) {
      wb = {
        companyId,
        ownerUserId: (doc as any).ownerUserId,
        ownerOrganizationId: (doc as any).ownerOrganizationId ?? null,
        sections: ((doc as any).sections ?? {}) as Record<string, EsgWorkbookSection>,
        updatedAt: new Date((doc as any).updatedAt).toISOString(),
        submittedAt: (doc as any).submittedAt
          ? new Date((doc as any).submittedAt).toISOString()
          : null,
      };
    }
  } else {
    wb = memoryStore.get(companyId) ?? null;
  }

  if (!wb) {
    wb = {
      companyId,
      ownerUserId: userId,
      ownerOrganizationId: userOrgId,
      sections: {},
      updatedAt: new Date().toISOString(),
      submittedAt: null,
    };
  }
  return wb;
}

async function persistEsgWorkbook(wb: EsgWorkbookData): Promise<void> {
  wb.updatedAt = new Date().toISOString();
  if (mongoReady()) {
    await EsgWorkbookModel.findOneAndUpdate(
      { companyId: wb.companyId },
      {
        companyId: wb.companyId,
        ownerUserId: wb.ownerUserId,
        ownerOrganizationId: wb.ownerOrganizationId,
        sections: wb.sections,
        submittedAt: wb.submittedAt ?? null,
        updatedAt: new Date(wb.updatedAt),
      },
      { upsert: true, new: true },
    );
  } else {
    memoryStore.set(wb.companyId, wb);
  }
}

export function registerEsgWorkbookRoutes(app: Express): void {
  app.get("/api/esg/access", requireAuth, (req: Request, res: Response) => {
    const user = (req as any).user;
    res.json({ allowed: canAccessEsgToolkit(user) });
  });

  function normalizeLegacySections(wb: EsgWorkbookData): void {
    const legacy = wb.sections?.cover;
    if (legacy?.cells && !wb.sections["company-reporting-setup"]) {
      wb.sections["company-reporting-setup"] = legacy;
      delete wb.sections.cover;
    }
  }

  app.get("/api/esg/workbook/template", requireAuth, async (req, res) => {
    if (!requireEsgAccess(req, res)) return;
    const buf = buildEsgWorkbookTemplateXlsx();
    res.setHeader("Content-Disposition", 'attachment; filename="esg-bulk-input-template.xlsx"');
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.send(buf);
  });

  app.get("/api/esg/workbook/:companyId", requireAuth, async (req, res) => {
    const wb = await authorizeEsgWorkbook(req, res);
    if (!wb) return;
    normalizeLegacySections(wb);
    res.json(wb);
  });

  app.put("/api/esg/workbook/:companyId/section/:sectionKey", requireAuth, async (req, res) => {
    let { sectionKey } = req.params;
    if (sectionKey === "cover") sectionKey = "company-reporting-setup";
    if (!SECTION_KEYS.includes(sectionKey)) {
      return res.status(400).json({ error: "Unknown section key" });
    }
    const wb = await authorizeEsgWorkbook(req, res);
    if (!wb) return;
    if (wb.submittedAt) {
      return res.status(423).json({ error: "Workbook is submitted and locked" });
    }
    const cells = (req.body as any)?.cells;
    if (!cells || typeof cells !== "object") {
      return res.status(400).json({ error: "Missing cells payload" });
    }
    try {
      wb.sections[sectionKey] = { cells };
      await persistEsgWorkbook(wb);
      res.json({ ok: true, updatedAt: wb.updatedAt });
    } catch (err) {
      logger.error("Failed to save ESG section", err);
      res.status(500).json({ error: "Failed to save section" });
    }
  });

  app.post("/api/esg/workbook/:companyId/validate", requireAuth, async (req, res) => {
    const wb = await authorizeEsgWorkbook(req, res);
    if (!wb) return;
    res.json({ ok: true, companyId: wb.companyId });
  });

  app.post("/api/esg/workbook/:companyId/submit", requireAuth, async (req, res) => {
    const wb = await authorizeEsgWorkbook(req, res);
    if (!wb) return;
    if (wb.submittedAt) {
      return res.json({ ok: true, submittedAt: wb.submittedAt });
    }
    const validation = validateEsgWorkbookForSubmit(wb);
    if (!validation.ok) {
      return res.status(400).json({
        error: "Workbook validation failed",
        blockers: validation.blockers,
      });
    }
    const iso = new Date().toISOString();
    wb.submittedAt = iso;
    wb.sections.assumptions = wb.sections.assumptions ?? { cells: {} };
    (wb.sections.assumptions.cells as Record<string, unknown>)["_submittedAt"] = iso;
    await persistEsgWorkbook(wb);
    res.json({ ok: true, submittedAt: iso });
  });

  app.get("/api/esg/workbook/:companyId/scores", requireAuth, async (req, res) => {
    const wb = await authorizeEsgWorkbook(req, res);
    if (!wb) return;
    const scores = computeEsgScores(wb);
    res.json({ companyId: wb.companyId, scores });
  });

  app.get("/api/esg/workbook/:companyId/export", requireAuth, async (req, res) => {
    const wb = await authorizeEsgWorkbook(req, res);
    if (!wb) return;
    const buf = buildEsgWorkbookXlsx(wb);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="esg-workbook-${wb.companyId}.xlsx"`,
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.send(buf);
  });

  app.post("/api/esg/workbook/:companyId/seed-demo", requireAuth, async (req, res) => {
    const wb = await authorizeEsgWorkbook(req, res);
    if (!wb) return;
    if (wb.submittedAt) {
      return res.status(423).json({ error: "Workbook is submitted and locked" });
    }
    // Sample seeding REPLACES every section, so it is admin-only and needs an
    // explicit confirm — a stray click must never wipe a client's entered data.
    const role = (req as any).user?.role;
    if (role !== "admin" && role !== "super_admin") {
      return res.status(403).json({ error: "Sample data can only be loaded by an administrator" });
    }
    if ((req.body as { confirm?: boolean } | undefined)?.confirm !== true) {
      return res.status(400).json({
        error: "Loading sample data replaces every section of this workbook. Resend with confirm: true.",
      });
    }
    try {
      wb.sections = buildGoldenSections();
      await persistEsgWorkbook(wb);
      res.json({ ok: true, sectionCount: Object.keys(wb.sections).length, updatedAt: wb.updatedAt });
    } catch (err) {
      logger.error("Failed to seed ESG demo", err);
      res.status(500).json({ error: "Failed to seed demo workbook" });
    }
  });

  app.post(
    "/api/esg/workbook/:companyId/import",
    requireAuth,
    async (req, res) => {
      const wb = await authorizeEsgWorkbook(req, res);
      if (!wb) return;
      if (wb.submittedAt) {
        return res.status(423).json({ error: "Workbook is submitted and locked" });
      }
      try {
        let buffer: Buffer | null = null;
        const body = req.body as { fileBase64?: string; confirm?: boolean; sections?: Record<string, { cells: Record<string, unknown> }> };
        if (body?.confirm && body.sections) {
          for (const [sectionKey, payload] of Object.entries(body.sections)) {
            if (!SECTION_KEYS.includes(sectionKey)) continue;
            wb.sections[sectionKey] = { cells: payload.cells ?? {} };
          }
          await persistEsgWorkbook(wb);
          return res.json({ ok: true, updatedAt: wb.updatedAt });
        }
        if (Buffer.isBuffer(req.body) && req.body.length > 0) {
          buffer = req.body;
        } else if (body?.fileBase64) {
          buffer = Buffer.from(body.fileBase64, "base64");
        }
        if (!buffer?.length) {
          return res.status(400).json({ error: "Missing xlsx file (multipart binary or fileBase64)" });
        }
        const preview = parseEsgWorkbookXlsx(buffer);
        res.json(preview);
      } catch (err) {
        logger.error("Failed to import ESG workbook", err);
        res.status(500).json({ error: "Failed to parse xlsx" });
      }
    },
  );
}
