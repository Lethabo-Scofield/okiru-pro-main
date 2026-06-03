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
  if (mongoReady()) {
    const client = await ClientModel.findOne({ clientId: companyId })
      .select({ clientId: 1 })
      .lean();
    clientExists = Boolean(client);
  } else {
    clientExists = Boolean(memGetClient(companyId));
  }
  if (!clientExists) {
    res.status(404).json({ error: "Company not found" });
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

  app.get("/api/esg/workbook/:companyId", requireAuth, async (req, res) => {
    const wb = await authorizeEsgWorkbook(req, res);
    if (!wb) return;
    res.json(wb);
  });

  app.put("/api/esg/workbook/:companyId/section/:sectionKey", requireAuth, async (req, res) => {
    const { sectionKey } = req.params;
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
}
