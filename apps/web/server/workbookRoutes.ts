import type { Express, Request, Response, NextFunction } from "express";
import * as XLSX from "xlsx";
import { createLogger } from "./logger";
import { requireAuth } from "./routes";

const logger = createLogger("Workbook");

export type WorkbookRow = Record<string, unknown> & { _id: string };
export type WorkbookSection = { rows: WorkbookRow[]; meta?: Record<string, unknown> };
export type WorkbookData = {
  companyId: string;
  ownerOrganizationId: string | null;
  ownerUserId: string;
  sections: Record<string, WorkbookSection>;
  updatedAt: string;
};

const SECTION_KEYS = [
  "company-information",
  "financial-information",
  "ownership",
  "management-control",
  "skills-development",
  "procurement",
  "esd",
  "sed",
  "employees",
  "suppliers",
] as const;

const SECTION_TITLES: Record<string, string> = {
  "company-information": "Company Information",
  "financial-information": "Financial Information",
  "ownership": "Ownership",
  "management-control": "Management Control",
  "skills-development": "Skills Development",
  "procurement": "Procurement",
  "esd": "Enterprise & Supplier Development",
  "sed": "Socio-Economic Development",
  "employees": "Employees",
  "suppliers": "Suppliers",
};

const EMPLOYEE_COLUMNS = [
  "name",
  "surname",
  "idNumber",
  "race",
  "gender",
  "occupationalLevel",
  "department",
  "salary",
  "isDisabled",
] as const;

const COLUMN_TITLES: Record<string, string> = {
  name: "First Name",
  surname: "Surname",
  idNumber: "ID Number",
  race: "Race",
  gender: "Gender",
  occupationalLevel: "Occupational Level",
  department: "Department",
  salary: "Annual Salary (R)",
  isDisabled: "Disabled",
};

const workbooks = new Map<string, WorkbookData>();

function emptyWorkbook(
  companyId: string,
  ownerOrganizationId: string | null,
  ownerUserId: string,
): WorkbookData {
  const sections: Record<string, WorkbookSection> = {};
  for (const key of SECTION_KEYS) sections[key] = { rows: [] };
  return {
    companyId,
    ownerOrganizationId,
    ownerUserId,
    sections,
    updatedAt: new Date().toISOString(),
  };
}

function sanitizeRows(rows: unknown): WorkbookRow[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r, idx) => {
    const obj = (r && typeof r === "object" ? (r as Record<string, unknown>) : {}) as WorkbookRow;
    if (!obj._id || typeof obj._id !== "string") {
      obj._id = `row_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 8)}`;
    }
    return obj;
  });
}

function buildXlsx(wb: WorkbookData): Buffer {
  const xwb = XLSX.utils.book_new();

  for (const key of SECTION_KEYS) {
    const section = wb.sections[key] || { rows: [] };
    const title = SECTION_TITLES[key];

    let aoa: unknown[][];
    if (key === "employees") {
      const header = EMPLOYEE_COLUMNS.map((c) => COLUMN_TITLES[c] || c);
      const body = section.rows.map((r) =>
        EMPLOYEE_COLUMNS.map((c) => {
          const v = (r as any)[c];
          if (v === undefined || v === null) return "";
          return v;
        }),
      );
      aoa = [header, ...body];
    } else {
      const allKeys = new Set<string>();
      for (const r of section.rows) {
        for (const k of Object.keys(r)) {
          if (k !== "_id") allKeys.add(k);
        }
      }
      const cols = Array.from(allKeys);
      if (cols.length === 0) {
        aoa = [["(no data captured yet)"]];
      } else {
        aoa = [cols, ...section.rows.map((r) => cols.map((c) => (r as any)[c] ?? ""))];
      }
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(xwb, ws, title.slice(0, 31));
  }

  return XLSX.write(xwb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/**
 * Owner check — workbook is pinned to the creating user's organization (or, if
 * the user has no org, to the user themselves). All subsequent access must come
 * from a member of the same org or the same user. Returns the workbook on
 * success, or sends a 403 and returns null if the caller is not allowed.
 */
function authorizeWorkbookAccess(req: Request, res: Response): WorkbookData | null {
  const user = (req as any).user;
  const userId: string | undefined = user?.id || (req.session as any)?.userId;
  if (!userId) {
    res.status(401).json({ message: "Not authenticated" });
    return null;
  }
  const userOrgId: string | null = user?.organizationId ?? null;
  const companyId = req.params.companyId;

  let wb = workbooks.get(companyId);
  if (!wb) {
    wb = emptyWorkbook(companyId, userOrgId, userId);
    workbooks.set(companyId, wb);
    return wb;
  }

  const sameOrg = wb.ownerOrganizationId !== null && wb.ownerOrganizationId === userOrgId;
  const sameUser = wb.ownerUserId === userId;
  if (!sameOrg && !sameUser) {
    logger.warn("Cross-tenant workbook access denied", {
      companyId,
      requesterUserId: userId,
      requesterOrgId: userOrgId,
      ownerOrgId: wb.ownerOrganizationId,
      ownerUserId: wb.ownerUserId,
    });
    res.status(403).json({ message: "Forbidden" });
    return null;
  }
  return wb;
}

export function registerWorkbookRoutes(app: Express): void {
  app.get("/api/workbook/:companyId", requireAuth, (req: Request, res: Response) => {
    const wb = authorizeWorkbookAccess(req, res);
    if (!wb) return;
    res.json(wb);
  });

  app.put(
    "/api/workbook/:companyId/section/:sectionKey",
    requireAuth,
    (req: Request, res: Response) => {
      const { sectionKey } = req.params;
      if (!SECTION_KEYS.includes(sectionKey as any)) {
        return res.status(400).json({ error: "Unknown section key" });
      }
      const wb = authorizeWorkbookAccess(req, res);
      if (!wb) return;
      const rows = sanitizeRows((req.body as any)?.rows);
      const meta =
        (req.body as any)?.meta && typeof (req.body as any).meta === "object"
          ? (req.body as any).meta
          : undefined;
      wb.sections[sectionKey] = { rows, ...(meta ? { meta } : {}) };
      wb.updatedAt = new Date().toISOString();
      workbooks.set(wb.companyId, wb);
      res.json({ ok: true, updatedAt: wb.updatedAt, rowCount: rows.length });
    },
  );

  app.get(
    "/api/workbook/:companyId/export.xlsx",
    requireAuth,
    (req: Request, res: Response) => {
      const wb = authorizeWorkbookAccess(req, res);
      if (!wb) return;
      try {
        const buf = buildXlsx(wb);
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="workbook_${wb.companyId}.xlsx"`,
        );
        res.send(buf);
      } catch (err: any) {
        logger.error("Failed to build workbook export", err);
        res.status(500).json({ error: "Failed to export workbook" });
      }
    },
  );
}
