import type { Express, Request, Response } from "express";
import * as XLSX from "xlsx";
import mongoose from "mongoose";
import { createLogger } from "./logger";
import { requireAuth } from "./routes";
import { WorkbookModel, ClientModel } from "../shared/schema";
import {
  validateWorkbook,
  formatWorkbookValidationSummary,
} from "../src/components/workbook/workbookValidation";

const logger = createLogger("Workbook");

export type WorkbookRow = Record<string, unknown> & { _id: string };
export type WorkbookSection = { rows: WorkbookRow[]; meta?: Record<string, unknown> };
export type WorkbookData = {
  companyId: string;
  ownerOrganizationId: string | null;
  ownerUserId: string;
  sections: Record<string, WorkbookSection>;
  submittedAt?: string | null;
  submittedByUserId?: string | null;
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

/**
 * Sheets in the export (in order). Modeled on the official
 * "Information Request" template: a checklist sheet first, followed by
 * one data sheet per major area with a title row + header row.
 */
type DataSheetSpec = {
  sheetName: string; // <= 31 chars
  title: string;
  headers: string[];
  rowToCells: (row: WorkbookRow) => unknown[];
  sectionKeys: string[];
  merge?: boolean;
};

const CHECKLIST_ROWS: Array<[string, string]> = [
  ["Phase 1: Current State Analysis:", "Please provide the following information:"],
  ["1.", "FINANCIAL INFORMATION:"],
  ["", "Historical Information: most recent completed financial year"],
  ["", "a. Revenue"],
  ["", "b. NPAT (Net Profit After Tax)"],
  ["", "c. Payroll (total salary bill for the 12 months of the financial year)"],
  ["", "Forecasts: current financial year"],
  ["", "a. Revenue - forecasted (estimate) revenue for this financial year"],
  ["", "b. NPAT (Net Profit After Tax) - forecasted (estimate) NPAT for this financial year"],
  ["", "c. Payroll (forecasted (estimate) total salary bill for the current financial year)"],
  ["2.", "EMPLOYMENT EQUITY PROFILE:"],
  ["", "a. Please provide the latest staff list (most recent employee profile). Important information is:"],
  ["", "    i.   Name of each employee"],
  ["", "    ii.  Gender of each"],
  ["", "    iii. Race"],
  ["", "    iv.  Designation (management tier in the company)"],
  ["", "    v.   Disability (if any employees are disabled)"],
  ["", "    vi.  Nationality (if you have any non-South African employees)"],
  ["", "    vii. Years of service / employment start date"],
  ["", "Complete the Management Control - Employees tab for this purpose."],
  ["3.", "SKILLS DEVELOPMENT"],
  ["", "a. Provide all training conducted for black persons during the previous financial year."],
  ["", "b. Include any planned training for the current period and any year-to-date training."],
  ["", "c. Only training conducted by the measured entity counts towards B-BBEE."],
  ["", "d. Complete the Skills Development tab for this purpose."],
  ["4.", "PREFERENTIAL PROCUREMENT:"],
  ["", "a. List of all suppliers/vendors and the spend amount (excl. VAT) for the previous financial year."],
  ["", "b. List of all suppliers/vendors and the spend amount (excl. VAT) for the current financial year to date."],
  ["", "c. B-BBEE certificates for suppliers will be sourced from our certificate database."],
  ["", "d. Highlight any foreign spend and foreign suppliers."],
  ["", "e. Complete the Procurement - Suppliers tab for this purpose."],
  ["5.", "ENTERPRISE AND SUPPLIER DEVELOPMENT"],
  [
    "",
    "a. Provide details of any support given to small black businesses (monetary support, donations, loans, non-monetary support, discounts, coaching/mentoring, free consulting).",
  ],
  ["", "b. If no support provided, this section may be left blank."],
  ["6.", "SOCIOECONOMIC DEVELOPMENT"],
  [
    "",
    "a. Provide any support given to charities, NPOs, or socioeconomic initiatives for black people (monetary support, donations, non-monetary support, discounts, coaching/mentoring, free consulting).",
  ],
  ["", "b. If no support provided, this section may be left blank."],
];

const EMPLOYEE_HEADERS = [
  "Full Name *",
  "Gender *",
  "Race *",
  "Designation *",
  "Disabled?",
  "Foreign?",
  "ID Number",
  "Voting Rights *",
  "Employee Code",
  "Start date / years of service",
];

const SKILLS_HEADERS = [
  "Training Program Name *",
  "Category *",
  "Training Provider",
  "Province",
  "Municipality",
  "Learner Name *",
  "ID Number",
  "Gender *",
  "Race *",
  "Disabled?",
  "Foreign?",
  "Age",
  "Employed?",
  "Completed?",
  "Absorbed?",
  "Course Cost",
  "Travel Cost",
  "Accommodation Cost",
  "Catering Cost",
  "Stationery Cost",
  "Training Facility Cost",
  "Salary Cost (category B,C,D only)",
  "Other Costs",
  "Start Date (dd/mm/yyyy)",
  "End Date (dd/mm/yyyy)",
  "Custom Data",
  "Man hours",
  "Location",
  "Business Unit",
  "Employee Code",
];

const PROCUREMENT_HEADERS = [
  "Supplier Name *",
  "Current Company Size *",
  "B-BBEE Level",
  "VAT Number",
  "Measured Under (CoGP/RCoGP)",
  "Empowering Supplier? (Yes/No)",
  "Date of first procurement (dd/mm/yyyy)",
  "Size at first procurement",
  "Current Black ownership",
  "Current Black Female ownership",
  "Has modified Black ownership? (Yes/No)",
  "Unmodified Black ownership",
  "Supplier development recipient? (Yes/No)",
  "3 year contract in place? (Yes/No)",
  "Designated? (Yes/No)",
  "Spend *",
  "Location",
  "Business Unit",
  "Certificate Expiry Date (dd/mm/yyyy)",
];

const ESD_HEADERS = [
  "Supplier Name *",
  "Current black ownership *",
  "Current size *",
  "Contribution Description *",
  "Date of Transaction (dd/mm/yyyy)",
  "Contribution Type *",
  "Amount *",
  "Invoice date (dd/mm/yyyy)",
  "Payment date (dd/mm/yyyy)",
  "Prime Rate",
  "Actual Rate",
  "Location",
  "Business Unit",
];

const SED_HEADERS = [
  "Beneficiary Name *",
  "Description of Spend *",
  "ICT Specific Initiative?",
  "Date of Transaction (dd/mm/yyyy)",
  "Contribution Type *",
  "% of Spend Benefiting Black Individuals",
  "Location",
  "Business Unit",
  "Amount *",
];

function s(v: unknown): string {
  return v === undefined || v === null ? "" : String(v);
}
function joinName(r: WorkbookRow): string {
  const name = s((r as any).name).trim();
  const surname = s((r as any).surname).trim();
  return [name, surname].filter(Boolean).join(" ") || s((r as any).fullName);
}
function yesNo(v: unknown): string {
  if (v === true) return "Yes";
  if (v === false) return "";
  const t = s(v).trim().toLowerCase();
  if (!t) return "";
  if (["true", "yes", "y", "1"].includes(t)) return "Yes";
  if (["false", "no", "n", "0"].includes(t)) return "No";
  return s(v);
}
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const DATA_SHEETS: DataSheetSpec[] = [
  {
    sheetName: "Management Control - Employees",
    title: "Management Control",
    headers: EMPLOYEE_HEADERS,
    sectionKeys: ["employees", "management-control"],
    merge: true,
    rowToCells: (r) => [
      joinName(r),
      s((r as any).gender),
      s((r as any).race),
      s((r as any).occupationalLevel ?? (r as any).designation ?? (r as any).department),
      yesNo((r as any).isDisabled ?? (r as any).disabled),
      yesNo((r as any).isForeign ?? (r as any).foreign),
      s((r as any).idNumber),
      s((r as any).votingRights),
      s((r as any).employeeCode),
      s((r as any).startDate ?? (r as any).yearsOfService),
    ],
  },
  {
    sheetName: "Skills Development",
    title: "Skills Development",
    headers: SKILLS_HEADERS,
    sectionKeys: ["skills-development"],
    rowToCells: (r) => [
      s((r as any).programName ?? (r as any).trainingProgramName),
      s((r as any).categoryCode ?? (r as any).category),
      s((r as any).trainingProvider ?? (r as any).provider),
      s((r as any).province),
      s((r as any).municipality),
      s((r as any).learnerName),
      s((r as any).idNumber),
      s((r as any).gender),
      s((r as any).race),
      yesNo((r as any).isDisabled ?? (r as any).disabled),
      yesNo((r as any).isForeign ?? (r as any).foreign),
      s((r as any).age),
      yesNo((r as any).employed),
      yesNo((r as any).completed),
      yesNo((r as any).absorbed),
      s((r as any).courseCost),
      s((r as any).travelCost),
      s((r as any).accommodationCost),
      s((r as any).cateringCost),
      s((r as any).stationeryCost),
      s((r as any).trainingFacilityCost),
      s((r as any).salaryCost),
      s((r as any).otherCosts),
      s((r as any).startDate),
      s((r as any).endDate),
      s((r as any).customData),
      s((r as any).manHours),
      s((r as any).location),
      s((r as any).businessUnit),
      s((r as any).employeeCode),
    ],
  },
  {
    sheetName: "Procurement - Suppliers",
    title: "Preferential Procurement",
    headers: PROCUREMENT_HEADERS,
    sectionKeys: ["procurement", "suppliers"],
    merge: true,
    rowToCells: (r) => [
      s((r as any).supplierName ?? (r as any).name),
      s((r as any).currentSize ?? (r as any).size),
      s((r as any).bbbeeLevel ?? (r as any).level),
      s((r as any).vatNumber),
      s((r as any).measuredUnder),
      yesNo((r as any).empoweringSupplier),
      s((r as any).firstProcurementDate),
      s((r as any).sizeAtFirstProcurement),
      s((r as any).currentBlackOwnership),
      s((r as any).currentBlackFemaleOwnership),
      yesNo((r as any).hasModifiedBlackOwnership),
      s((r as any).unmodifiedBlackOwnership),
      yesNo((r as any).sdRecipient),
      yesNo((r as any).threeYearContract),
      yesNo((r as any).designated),
      s((r as any).spend ?? (r as any).amount),
      s((r as any).location),
      s((r as any).businessUnit),
      s((r as any).certificateExpiryDate ?? (r as any).expiryDate),
    ],
  },
  {
    sheetName: "Enterprise & Supplier Developme",
    title: "Supplier Development",
    headers: ESD_HEADERS,
    sectionKeys: ["esd"],
    rowToCells: (r) => [
      s((r as any).supplierName ?? (r as any).name),
      s((r as any).currentBlackOwnership),
      s((r as any).currentSize ?? (r as any).size),
      s((r as any).contributionDescription ?? (r as any).description),
      s((r as any).dateOfTransaction ?? (r as any).date),
      s((r as any).contributionType),
      s((r as any).amount),
      s((r as any).invoiceDate),
      s((r as any).paymentDate),
      s((r as any).primeRate),
      s((r as any).actualRate),
      s((r as any).location),
      s((r as any).businessUnit),
    ],
  },
  {
    sheetName: "Socioeconomic Development",
    title: "Socioeconomic Development",
    headers: SED_HEADERS,
    sectionKeys: ["sed"],
    rowToCells: (r) => [
      s((r as any).beneficiaryName ?? (r as any).name),
      s((r as any).descriptionOfSpend ?? (r as any).description),
      yesNo((r as any).ictSpecificInitiative),
      s((r as any).dateOfTransaction ?? (r as any).date),
      s((r as any).contributionType),
      s((r as any).percentBenefitingBlack),
      s((r as any).location),
      s((r as any).businessUnit),
      s((r as any).amount),
    ],
  },
];

// In-memory fallback — only used in non-production when Mongo is unavailable.
// In production we refuse to silently divert writes to memory, since switching
// back to Mongo later would cause silent data loss.
const memoryStore = new Map<string, WorkbookData>();
const IS_PRODUCTION = process.env.NODE_ENV === "production";

function mongoReady(): boolean {
  return mongoose.connection.readyState === 1;
}

function canUseMemoryFallback(): boolean {
  return !IS_PRODUCTION && !mongoReady();
}

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
    submittedAt: null,
    submittedByUserId: null,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeWorkbookDoc(doc: any): WorkbookData {
  const sections: Record<string, WorkbookSection> = {};
  const raw = (doc?.sections ?? {}) as Record<string, any>;
  for (const key of SECTION_KEYS) {
    const src = raw[key] ?? {};
    sections[key] = {
      rows: Array.isArray(src.rows) ? (src.rows as WorkbookRow[]) : [],
      ...(src.meta && typeof src.meta === "object" ? { meta: src.meta } : {}),
    };
  }
  return {
    companyId: String(doc.companyId),
    ownerOrganizationId: doc.ownerOrganizationId ?? null,
    ownerUserId: String(doc.ownerUserId),
    sections,
    submittedAt: doc.submittedAt ? new Date(doc.submittedAt).toISOString() : null,
    submittedByUserId: doc.submittedByUserId ?? null,
    updatedAt: (doc.updatedAt ? new Date(doc.updatedAt) : new Date()).toISOString(),
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

async function loadOrCreateWorkbook(
  companyId: string,
  ownerOrgId: string | null,
  ownerUserId: string,
): Promise<WorkbookData> {
  if (mongoReady()) {
    const existing = await WorkbookModel.findOne({ companyId }).lean();
    if (existing) return normalizeWorkbookDoc(existing);
    const initial = emptyWorkbook(companyId, ownerOrgId, ownerUserId);
    try {
      await WorkbookModel.create({
        companyId,
        ownerOrganizationId: ownerOrgId,
        ownerUserId,
        sections: initial.sections,
      });
    } catch (err: any) {
      // Race: another request created it; re-read.
      if (err?.code === 11000) {
        const dup = await WorkbookModel.findOne({ companyId }).lean();
        if (dup) return normalizeWorkbookDoc(dup);
      } else {
        throw err;
      }
    }
    return initial;
  }
  if (!canUseMemoryFallback()) {
    throw new Error("DATABASE_UNAVAILABLE");
  }
  // Memory fallback (dev only)
  let wb = memoryStore.get(companyId);
  if (!wb) {
    wb = emptyWorkbook(companyId, ownerOrgId, ownerUserId);
    memoryStore.set(companyId, wb);
  }
  return wb;
}

async function persistSection(
  wb: WorkbookData,
  sectionKey: string,
  section: WorkbookSection,
): Promise<WorkbookData> {
  if (mongoReady()) {
    const update: Record<string, any> = {
      [`sections.${sectionKey}`]: section,
      updatedAt: new Date(),
    };
    const doc = await WorkbookModel.findOneAndUpdate(
      { companyId: wb.companyId },
      { $set: update },
      { new: true, upsert: false },
    ).lean();
    if (!doc) throw new Error("Workbook disappeared during save");
    return normalizeWorkbookDoc(doc);
  }
  if (!canUseMemoryFallback()) {
    throw new Error("DATABASE_UNAVAILABLE");
  }
  // Only mutate local cache after we know we're committed to the fallback path.
  wb.sections[sectionKey] = section;
  wb.updatedAt = new Date().toISOString();
  memoryStore.set(wb.companyId, wb);
  return wb;
}

function buildChecklistSheet(wb: WorkbookData): XLSX.WorkSheet {
  const meta = (wb.sections["company-information"]?.meta ?? {}) as Record<string, unknown>;
  const fin = (wb.sections["financial-information"]?.meta ?? {}) as Record<string, unknown>;
  const companyName = s(meta.companyName ?? meta.name);
  const titleRow: [string, string] = [
    `Information request checklist - ${companyName || "Company"}`,
    "",
  ];
  const aoa: unknown[][] = [titleRow, ...CHECKLIST_ROWS.map((r) => [...r])];

  const finKeys = Object.keys(fin).filter((k) => fin[k] !== "" && fin[k] != null);
  if (finKeys.length > 0) {
    aoa.push([""], ["Captured Financial Information", ""]);
    for (const k of finKeys) aoa.push([k, s(fin[k])]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 8 }, { wch: 90 }];
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
  return ws;
}

function buildDataSheet(wb: WorkbookData, spec: DataSheetSpec): XLSX.WorkSheet {
  const rows: WorkbookRow[] = [];
  if (spec.merge) {
    const seen = new Set<string>();
    for (const key of spec.sectionKeys) {
      for (const r of wb.sections[key]?.rows ?? []) {
        if (r._id && seen.has(r._id)) continue;
        if (r._id) seen.add(r._id);
        rows.push(r);
      }
    }
  } else {
    for (const key of spec.sectionKeys) {
      const sec = wb.sections[key];
      if (sec && sec.rows.length > 0) {
        rows.push(...sec.rows);
        break;
      }
    }
  }

  const titleRow: unknown[] = [spec.title, ...Array(spec.headers.length - 1).fill("")];
  const aoa: unknown[][] = [titleRow, spec.headers, ...rows.map((r) => spec.rowToCells(r))];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: spec.headers.length - 1 } }];
  ws["!cols"] = spec.headers.map((h) => ({ wch: Math.min(Math.max(h.length + 2, 14), 36) }));
  return ws;
}

export function buildXlsx(wb: WorkbookData): Buffer {
  const xwb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(xwb, buildChecklistSheet(wb), "Information Request");
  for (const spec of DATA_SHEETS) {
    XLSX.utils.book_append_sheet(xwb, buildDataSheet(wb, spec), spec.sheetName.slice(0, 31));
  }
  return XLSX.write(xwb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/**
 * Authorization for workbook access.
 *
 * Tenancy is anchored to the **client record** (not the workbook itself), so a
 * malicious caller cannot squat an arbitrary companyId by being the first to
 * touch it. We require:
 *   1. The client exists.
 *   2. The caller is the client's creator OR a member of the client's org.
 *   3. After we know the caller is authorized for the client, we load (or
 *      create) the workbook, and additionally enforce that the workbook owner's
 *      tenant matches.
 */
async function authorizeWorkbookAccess(
  req: Request,
  res: Response,
): Promise<WorkbookData | null> {
  const user = (req as any).user;
  const userId: string | undefined = user?.id || (req.session as any)?.userId;
  if (!userId) {
    res.status(401).json({ message: "Not authenticated" });
    return null;
  }
  const userOrgId: string | null = user?.organizationId ?? null;
  const companyId = req.params.companyId;

  try {
    if (!mongoReady() && IS_PRODUCTION) {
      res.status(503).json({ error: "Database unavailable" });
      return null;
    }

    // Step 1: client-level authorization.
    // In dev with no Mongo, we accept the caller as the de-facto owner
    // (memory-only mode); in prod or with Mongo connected, we enforce the check.
    let clientOrgId: string | null = null;
    let clientCreatorId: string | null = null;
    if (mongoReady()) {
      const client = await ClientModel.findOne({ clientId: companyId })
        .select({ organizationId: 1, createdByUserId: 1 })
        .lean();
      if (!client) {
        res.status(404).json({ error: "Company not found" });
        return null;
      }
      clientOrgId = (client as any).organizationId ?? null;
      clientCreatorId = (client as any).createdByUserId ?? null;
      const clientSameOrg = clientOrgId !== null && clientOrgId === userOrgId;
      const clientSameUser = clientCreatorId === userId;

      if (!clientOrgId && !clientCreatorId) {
        // Legacy record with no tenancy fields. Refuse access in production —
        // operators must backfill ownership via a controlled migration before
        // these clients can be edited. In dev we allow it for local testing.
        if (IS_PRODUCTION) {
          logger.warn("Refusing access to legacy client missing tenancy fields", {
            companyId,
            requesterUserId: userId,
          });
          res.status(403).json({ message: "Forbidden: client missing tenancy ownership" });
          return null;
        }
      } else if (!clientSameOrg && !clientSameUser) {
        logger.warn("Cross-tenant client access denied via workbook route", {
          companyId,
          requesterUserId: userId,
          requesterOrgId: userOrgId,
          clientOrgId,
          clientCreatorId,
        });
        res.status(403).json({ message: "Forbidden" });
        return null;
      }
    }

    // Step 2: load (or create) workbook, pinned to the *client's* tenancy
    // when present — not the caller's — so the first caller cannot redirect a
    // shared client's workbook to their personal scope.
    const workbookOrgId = clientOrgId ?? userOrgId;
    const workbookOwnerId = clientCreatorId ?? userId;
    const wb = await loadOrCreateWorkbook(companyId, workbookOrgId, workbookOwnerId);

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
  } catch (err: any) {
    if (err?.message === "DATABASE_UNAVAILABLE") {
      res.status(503).json({ error: "Database unavailable" });
      return null;
    }
    logger.error("Failed to load workbook", err);
    res.status(500).json({ error: "Failed to load workbook" });
    return null;
  }
}

// ---------- Submit: translate workbook into ClientModel bulk-import shape ----------

function projectWorkbookToClient(wb: WorkbookData) {
  const sec = wb.sections;
  const finMeta = (sec["financial-information"]?.meta ?? {}) as Record<string, unknown>;
  const companyMeta = (sec["company-information"]?.meta ?? {}) as Record<string, unknown>;

  const shareholders = (sec["ownership"]?.rows ?? []).map((r) => ({
    name: s((r as any).shareholderName ?? (r as any).name),
    idNumber: s((r as any).idNumber),
    race: s((r as any).race),
    gender: s((r as any).gender),
    isDisabled: Boolean((r as any).isDisabled),
    isYouth: Boolean((r as any).isYouth),
    votingRights: num((r as any).votingRights),
    economicInterest: num((r as any).economicInterest),
    shareholding: num((r as any).shareholding),
    modifiedFlowThrough: Boolean((r as any).modifiedFlowThrough),
  }));

  const empSeen = new Set<string>();
  const employees: any[] = [];
  for (const key of ["employees", "management-control"]) {
    for (const r of sec[key]?.rows ?? []) {
      const id = (r as any)._id as string | undefined;
      if (id && empSeen.has(id)) continue;
      if (id) empSeen.add(id);
      employees.push({
        name: s((r as any).name),
        surname: s((r as any).surname),
        fullName: joinName(r as any),
        idNumber: s((r as any).idNumber),
        race: s((r as any).race),
        gender: s((r as any).gender),
        occupationalLevel: s((r as any).occupationalLevel ?? (r as any).designation),
        designation: s((r as any).designation ?? (r as any).occupationalLevel),
        department: s((r as any).department),
        salary: num((r as any).salary),
        isDisabled: Boolean((r as any).isDisabled),
        isForeign: Boolean((r as any).isForeign),
        votingRights: num((r as any).votingRights),
        startDate: s((r as any).startDate),
      });
    }
  }

  const trainingPrograms = (sec["skills-development"]?.rows ?? []).map((r) => {
    const total =
      num((r as any).totalCost) ||
      num((r as any).courseCost) +
        num((r as any).travelCost) +
        num((r as any).accommodationCost) +
        num((r as any).cateringCost) +
        num((r as any).stationeryCost) +
        num((r as any).trainingFacilityCost) +
        num((r as any).salaryCost) +
        num((r as any).otherCosts);
    const absorbed = Boolean((r as any).absorbed);
    return {
      programName: s((r as any).programName),
      // Alias `name` for consumers keyed on it.
      name: s((r as any).programName),
      categoryCode: s((r as any).categoryCode),
      category: s((r as any).categoryCode),
      trainingProvider: s((r as any).trainingProvider),
      learnerName: s((r as any).learnerName),
      idNumber: s((r as any).idNumber),
      race: s((r as any).race),
      gender: s((r as any).gender),
      isBlack: ["African", "Coloured", "Indian"].includes(s((r as any).race)),
      isDisabled: Boolean((r as any).isDisabled),
      isForeign: Boolean((r as any).isForeign),
      employed: Boolean((r as any).employed),
      completed: Boolean((r as any).completed),
      absorbed,
      isAbsorbed: absorbed,
      courseCost: num((r as any).courseCost),
      travelCost: num((r as any).travelCost),
      accommodationCost: num((r as any).accommodationCost),
      salaryCost: num((r as any).salaryCost),
      otherCosts: num((r as any).otherCosts),
      totalCost: total,
      cost: total,
      startDate: s((r as any).startDate),
      endDate: s((r as any).endDate),
    };
  });

  const supSeen = new Set<string>();
  const suppliers: any[] = [];
  for (const key of ["procurement", "suppliers"]) {
    for (const r of sec[key]?.rows ?? []) {
      const id = (r as any)._id as string | undefined;
      if (id && supSeen.has(id)) continue;
      if (id) supSeen.add(id);
      const blackOwn = num((r as any).currentBlackOwnership);
      const blackFemOwn = num((r as any).currentBlackFemaleOwnership);
      const lvl = s((r as any).bbbeeLevel);
      suppliers.push({
        supplierName: s((r as any).supplierName),
        // Alias `name` for downstream consumers that key off it.
        name: s((r as any).supplierName),
        currentSize: s((r as any).currentSize),
        size: s((r as any).currentSize),
        bbbeeLevel: lvl,
        beeLevel: lvl,
        vatNumber: s((r as any).vatNumber),
        measuredUnder: s((r as any).measuredUnder),
        empoweringSupplier: Boolean((r as any).empoweringSupplier),
        currentBlackOwnership: blackOwn,
        blackOwnership: blackOwn,
        currentBlackFemaleOwnership: blackFemOwn,
        blackFemaleOwnership: blackFemOwn,
        sdRecipient: Boolean((r as any).sdRecipient),
        threeYearContract: Boolean((r as any).threeYearContract),
        designated: Boolean((r as any).designated),
        spend: num((r as any).spend),
        amount: num((r as any).spend),
        firstProcurementDate: s((r as any).firstProcurementDate),
        certificateExpiryDate: s((r as any).certificateExpiryDate),
      });
    }
  }

  const esdContributions = (sec["esd"]?.rows ?? []).map((r) => ({
    supplierName: s((r as any).supplierName),
    currentBlackOwnership: num((r as any).currentBlackOwnership),
    currentSize: s((r as any).currentSize),
    contributionDescription: s((r as any).contributionDescription),
    contributionType: s((r as any).contributionType),
    amount: num((r as any).amount),
    dateOfTransaction: s((r as any).dateOfTransaction),
    invoiceDate: s((r as any).invoiceDate),
    paymentDate: s((r as any).paymentDate),
    primeRate: num((r as any).primeRate),
    actualRate: num((r as any).actualRate),
  }));

  const sedContributions = (sec["sed"]?.rows ?? []).map((r) => ({
    beneficiaryName: s((r as any).beneficiaryName),
    descriptionOfSpend: s((r as any).descriptionOfSpend),
    ictSpecificInitiative: Boolean((r as any).ictSpecificInitiative),
    contributionType: s((r as any).contributionType),
    percentBenefitingBlack: num((r as any).percentBenefitingBlack),
    amount: num((r as any).amount),
    dateOfTransaction: s((r as any).dateOfTransaction),
  }));

  const financials = {
    revenue: num(finMeta.revenue),
    npat: num(finMeta.npat),
    leviableAmount: num(finMeta.leviableAmount) || num(finMeta.payroll),
    tmps: num(finMeta.tmps),
    industrySector: s(companyMeta.industrySector) || undefined,
  };

  return { shareholders, employees, trainingPrograms, suppliers, esdContributions, sedContributions, financials, companyMeta };
}

export function registerWorkbookRoutes(app: Express): void {
  app.get("/api/workbook/:companyId", requireAuth, async (req: Request, res: Response) => {
    const wb = await authorizeWorkbookAccess(req, res);
    if (!wb) return;
    res.json(wb);
  });

  app.put(
    "/api/workbook/:companyId/section/:sectionKey",
    requireAuth,
    async (req: Request, res: Response) => {
      const { sectionKey } = req.params;
      if (!SECTION_KEYS.includes(sectionKey as any)) {
        return res.status(400).json({ error: "Unknown section key" });
      }
      const wb = await authorizeWorkbookAccess(req, res);
      if (!wb) return;
      const rows = sanitizeRows((req.body as any)?.rows);
      const meta =
        (req.body as any)?.meta && typeof (req.body as any).meta === "object"
          ? ((req.body as any).meta as Record<string, unknown>)
          : undefined;
      try {
        const next = await persistSection(wb, sectionKey, { rows, ...(meta ? { meta } : {}) });
        res.json({ ok: true, updatedAt: next.updatedAt, rowCount: rows.length });
      } catch (err: any) {
        logger.error("Failed to save workbook section", err);
        res.status(500).json({ error: "Failed to save section" });
      }
    },
  );

  app.get(
    "/api/workbook/:companyId/export.xlsx",
    requireAuth,
    async (req: Request, res: Response) => {
      const wb = await authorizeWorkbookAccess(req, res);
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

  // Submit the workbook → write its contents into the associated client record
  // so the scorecard pipeline can pick it up. Returns row counts of what was synced.
  app.post(
    "/api/workbook/:companyId/submit",
    requireAuth,
    async (req: Request, res: Response) => {
      const wb = await authorizeWorkbookAccess(req, res);
      if (!wb) return;

      if (!mongoReady()) {
        return res
          .status(503)
          .json({ error: "Database unavailable — cannot submit workbook." });
      }

      const validationIssues = validateWorkbook(wb.sections);
      if (validationIssues.length > 0) {
        return res.status(400).json({
          error: "Workbook validation failed",
          issues: validationIssues,
          summary: formatWorkbookValidationSummary(validationIssues),
        });
      }

      const projected = projectWorkbookToClient(wb);
      try {
        const client = await ClientModel.findOne({ clientId: wb.companyId });
        if (!client) {
          return res
            .status(404)
            .json({ error: "Client not found for this workbook." });
        }

        const update: Record<string, any> = {
          updatedAt: new Date(),
          shareholders: projected.shareholders,
          employees: projected.employees,
          trainingPrograms: projected.trainingPrograms,
          suppliers: projected.suppliers,
          esdContributions: projected.esdContributions,
          sedContributions: projected.sedContributions,
        };
        const f = projected.financials;
        if (f.revenue > 0) update.revenue = f.revenue;
        if (typeof f.npat === "number") update.npat = f.npat;
        if (f.leviableAmount > 0) update.leviableAmount = f.leviableAmount;
        if (f.tmps > 0) update.tmps = f.tmps;
        if (f.industrySector) update.industrySector = f.industrySector;

        // Lift a handful of company-info fields into the client record too.
        const cm = projected.companyMeta;
        for (const key of [
          "tradingName",
          "registrationNumber",
          "vatNumber",
          "taxNumber",
          "physicalAddress",
          "postalAddress",
          "contactPerson",
          "contactEmail",
          "contactPhone",
        ] as const) {
          const v = cm[key];
          if (typeof v === "string" && v.trim()) update[key] = v.trim();
        }

        await ClientModel.updateOne({ clientId: wb.companyId }, { $set: update });

        const userId =
          (req as any).user?.id || (req.session as any)?.userId || wb.ownerUserId;
        await WorkbookModel.updateOne(
          { companyId: wb.companyId },
          { $set: { submittedAt: new Date(), submittedByUserId: userId, updatedAt: new Date() } },
        );

        res.json({
          ok: true,
          counts: {
            shareholders: projected.shareholders.length,
            employees: projected.employees.length,
            trainingPrograms: projected.trainingPrograms.length,
            suppliers: projected.suppliers.length,
            esdContributions: projected.esdContributions.length,
            sedContributions: projected.sedContributions.length,
          },
          submittedAt: new Date().toISOString(),
        });
      } catch (err: any) {
        logger.error("Failed to submit workbook", err);
        res.status(500).json({ error: "Failed to submit workbook" });
      }
    },
  );
}
