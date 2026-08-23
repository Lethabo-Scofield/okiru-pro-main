import type { Express, Request, Response } from "express";
import * as XLSX from "xlsx";
import mongoose from "mongoose";
import { createLogger } from "./logger";
import { requireAuth } from "./routes";
import { hasAnyRole } from "./roles";
import { seedLakeTradingDemo } from "./lakeTradingDemoSeed";
import { LAKE_TRADING_DEMO_CLIENT_ID } from "../src/lib/lakeTradingWorkbookFixture";
import { WorkbookModel, ClientModel, ProcessorSessionModel, WorkspaceMemberModel } from "../shared/schema";
import {
  canSyncScorecard,
  canWriteSection,
  filterReadableSections,
  resolveWorkbookPillarAccess,
} from "./pillarAccess";
import { handleBackSync, rebuildWorkbookFromEntities } from "./workbookBackSync";
import {
  validateWorkbook,
  validateWorkbookForSubmit,
  formatWorkbookValidationSummary,
} from "../src/components/workbook/workbookValidation";
import {
  SED_CONTRIBUTION_GUIDANCE,
  ESD_CONTRIBUTION_GUIDANCE,
  SECTIONS,
  type ColumnDef,
  type SectionDef,
} from "../src/components/workbook/sections";
import { mapWorkbookFinancialsToClient } from "../src/components/workbook/workbookClientSync";
import { coerceYesNo } from "../src/lib/yesNoValue";
import { isBlackRace, isScoringDesignation, normalizeRace, normalizeDesignationForScoring } from "@toolkit/lib/calculators/shared";
import { createChatCompletion } from "./openaiCompat";
import {
  getClient as memGetClient,
  canAccessClient as memCanAccessClient,
  updateClient as memUpdateClient,
} from "./clientsMemoryStore";

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
  "afs-additions",
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
// Tolerant numeric parse: Number("1,000,000") / Number("R 1 000 000") / Number("60%")
// are all NaN, which previously coerced to 0 and silently zeroed revenue / payroll /
// spend / ownership% from text-formatted Excel cells or pasted values. Strip currency
// symbols, thousands separators (commas + ordinary/narrow/non-breaking spaces) and a
// trailing percent sign before parsing.
function parseLooseNumber(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v === null || v === undefined) return 0;
  const cleaned = String(v)
    .replace(/[\s  ]/g, "")
    .replace(/[R$,%]/gi, "");
  if (cleaned === "" || cleaned === "-") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}
function num(v: unknown): number {
  return parseLooseNumber(v);
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

// In-memory fallback Î“Ã‡Ã¶ only used in non-production when Mongo is unavailable.
// In production we refuse to silently divert writes to memory, since switching
// back to Mongo later would cause silent data loss.
const memoryStore = new Map<string, WorkbookData>();
const IS_PRODUCTION = process.env.NODE_ENV === "production";

/** Remove workbook data when a client is deleted (Mongo or dev memory fallback). */
export async function deleteWorkbookForClient(companyId: string): Promise<void> {
  if (mongoReady()) {
    await WorkbookModel.deleteOne({ companyId });
    return;
  }
  if (canUseMemoryFallback()) {
    memoryStore.delete(companyId);
  }
}

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

/**
 * Builds a stand-alone "Instructions" sheet placed at the front of the
 * Information Request workbook. Spells out per-sheet column meanings,
 * required fields, accepted picklist values, date format, numeric format,
 * and short B-BBEE-code-aligned guidance for SED / ESD contribution types.
 *
 * Kept in sync with `apps/web/src/components/workbook/sections.ts` (the
 * source of truth for column metadata used in the in-app grid) — when you
 * add columns / picklists there, mirror them here.
 */
/**
 * Per-section column rows derived from `SECTIONS` (the source of truth used
 * by the in-app workbook grid). Keeping the Instructions sheet generated from
 * the same `ColumnDef[]` means a column rename / new picklist / new required
 * flag only has to be set in one place.
 */
function columnRowsForSection(section: SectionDef): unknown[][] {
  const cols: ColumnDef[] =
    (section.meta && section.meta.length > 0 ? section.meta : section.columns) ?? [];
  if (cols.length === 0) return [];
  const rows: unknown[][] = [];
  rows.push([section.label, "Required", "Type", "Accepted values / format"]);
  for (const c of cols) {
    const req = c.required ? "Yes" : "";
    let accepted: string;
    if (c.options && c.options.length > 0) {
      accepted = c.options.join(" / ");
    } else if (c.type === "boolean") {
      accepted = "Yes / No";
    } else if (c.type === "date") {
      accepted = "YYYY-MM-DD (preferred) or dd/mm/yyyy";
    } else if (c.type === "number") {
      accepted = "Rand amount — digits only; commas, spaces, and a leading 'R' are tolerated";
    } else if (c.type === "id") {
      accepted = "6–13 digit ID / registration number";
    } else {
      accepted = "Free text";
    }
    rows.push([c.label, req, c.type, accepted]);
  }
  rows.push([""]);
  return rows;
}

export function buildInstructionsSheet(): XLSX.WorkSheet {
  const aoa: unknown[][] = [];
  aoa.push(["Information Request — How to fill in this workbook"]);
  aoa.push([
    "Use one row per record. Required columns are marked with * in each sheet's header. Leave a cell blank if the value is unknown — do not write 'N/A' or '-' (this is treated as text).",
  ]);
  aoa.push([""]);
  aoa.push(["General conventions"]);
  aoa.push([
    "Dates",
    "YYYY-MM-DD (e.g. 2026-03-31). dd/mm/yyyy is also accepted. Avoid Excel's serial-number display — format the cell as Date.",
  ]);
  aoa.push([
    "Amounts",
    "Numbers in Rand, excluding VAT. Plain digits are preferred (e.g. 1500000), but thousands separators (1,500,000), spaces, and a leading 'R' are tolerated and stripped on import.",
  ]);
  aoa.push(["Yes / No fields", "Type 'Yes' or 'No'. Anything else is treated as blank."]);
  aoa.push(["Race", "African / Coloured / Indian / White (the first three count as 'Black' for B-BBEE)."]);
  aoa.push(["Gender", "Male / Female."]);
  aoa.push([""]);

  aoa.push(["Skills Development — accepted values"]);
  aoa.push(["Category", "A (Bursaries), B (Learnerships/Internships), C (Accredited short courses), D (Other accredited), E (Non-accredited/Informal, capped at 25%), F (External unaccredited, capped at 15%), G (Informal — non-black, no points)."]);
  aoa.push(["Costs", "Provide a breakdown across Course / Travel / Accommodation / Catering / Stationery / Training Facility / Salary (Cat B/C/D only) / Other. Each cost column is in Rand."]);
  aoa.push(["Salary Cost", "Only allowed for learners on Category B, C or D programmes."]);
  aoa.push([""]);

  aoa.push(["Procurement / Suppliers — accepted values"]);
  aoa.push(["Current Company Size", "Large / QSE / EME."]);
  aoa.push(["B-BBEE Level", "1 / 2 / 3 / 4 / 5 / 6 / 7 / 8 / Non-compliant."]);
  aoa.push(["Measured Under", "CoGP (Codes of Good Practice) or RCoGP (Revised CoGP)."]);
  aoa.push(["Empowering Supplier?", "Yes / No. Required for points from Apr 2025 onwards."]);
  aoa.push(["Black / Black Female Ownership", "Percentage 0–100 (e.g. 51 for 51%). Black Female cannot exceed Black."]);
  aoa.push(["Certificate Expiry Date", "Optional. When supplied (especially with a B-BBEE Level), must match the certificate / sworn affidavit on file and helps the AI parser extract supplier data."]);
  aoa.push([""]);

  aoa.push(["Enterprise & Supplier Development — Contribution Type"]);
  aoa.push(["Type", "What it means"]);
  for (const [type, desc] of Object.entries(ESD_CONTRIBUTION_GUIDANCE)) {
    aoa.push([type, desc]);
  }
  aoa.push(["Note", "Use the 'Category (SD / ED)' column to flag whether each row is Supplier Development (51%+ black, EME/QSE) or Enterprise Development."]);
  aoa.push([""]);

  aoa.push(["Socio-Economic Development — Contribution Type"]);
  aoa.push(["Type", "What it means"]);
  for (const [type, desc] of Object.entries(SED_CONTRIBUTION_GUIDANCE)) {
    aoa.push([type, desc]);
  }
  aoa.push(["% Benefiting Black", "Percentage of the contribution that flows to black beneficiaries (0–100). Only this portion is recognised."]);
  aoa.push([""]);

  // Per-sheet column reference — derived from the same SECTIONS / ColumnDef
  // metadata that drives the in-app workbook grid, so accepted values can
  // never drift out of sync with what the parser actually accepts.
  aoa.push(["Per-sheet column reference (auto-generated from in-app metadata)"]);
  aoa.push([""]);
  for (const section of SECTIONS) {
    if (!section.enabled) continue;
    const rows = columnRowsForSection(section);
    for (const r of rows) aoa.push(r);
  }

  aoa.push(["Tips"]);
  aoa.push([
    "•",
    "You can paste rows from your own spreadsheet — match the header names where possible.",
  ]);
  aoa.push([
    "•",
    "Re-opening this file in the Okiru web app will validate every row and flag missing or out-of-range values.",
  ]);
  aoa.push([
    "•",
    "Leave columns you don't track empty rather than guessing — blank is treated as 'not captured'.",
  ]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 38 }, { wch: 12 }, { wch: 10 }, { wch: 90 }];
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
  ];
  return ws;
}

export function buildXlsx(wb: WorkbookData): Buffer {
  const xwb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(xwb, buildInstructionsSheet(), "Instructions");
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

    // Step 1: client-level authorization (P3) â€” Mongo and in-memory dev paths.
    let clientOrgId: string | null = null;
    let clientCreatorId: string | null = null;

    if (!mongoReady()) {
      const memClient = memGetClient(companyId);
      if (!memClient) {
        res.status(404).json({ error: "Company not found" });
        return null;
      }
      const sameOrg = memClient.organizationId !== null && memClient.organizationId === userOrgId;
      const sameUser = memClient.createdByUserId === userId;
      const superAdmin = hasAnyRole(user, "super_admin");
      const isLakeDemo = companyId === LAKE_TRADING_DEMO_CLIENT_ID;
      if (!sameOrg && !sameUser && !(superAdmin && isLakeDemo)) {
        logger.warn("Cross-tenant client access denied via workbook route (memory)", {
          companyId,
          requesterUserId: userId,
          requesterOrgId: userOrgId,
          clientOrgId: memClient.organizationId,
          clientCreatorId: memClient.createdByUserId,
        });
        res.status(404).json({ error: "Company not found" });
        return null;
      }
      clientOrgId = memClient.organizationId;
      clientCreatorId = memClient.createdByUserId;
    } else {
      const client = await ClientModel.findOne({ clientId: companyId })
        .select({ organizationId: 1, createdByUserId: 1, lakeTradingDemo: 1 })
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
        if (IS_PRODUCTION) {
          logger.warn("Refusing access to legacy client missing tenancy fields", {
            companyId,
            requesterUserId: userId,
          });
          res.status(403).json({ message: "Forbidden: client missing tenancy ownership" });
          return null;
        }
      } else if (!clientSameOrg && !clientSameUser) {
        const isDemoClient = Boolean((client as any).lakeTradingDemo);
        const superAdmin = hasAnyRole(user, "super_admin");
        if (!(isDemoClient && superAdmin)) {
          logger.warn("Cross-tenant client access denied via workbook route", {
            companyId,
            requesterUserId: userId,
            requesterOrgId: userOrgId,
            clientOrgId,
            clientCreatorId,
          });
          res.status(404).json({ error: "Company not found" });
          return null;
        }
      }
    }

    const workbookOrgId = clientOrgId ?? userOrgId;
    const workbookOwnerId = clientCreatorId ?? userId;
    const wb = await loadOrCreateWorkbook(companyId, workbookOrgId, workbookOwnerId);

    const sameOrg = wb.ownerOrganizationId !== null && wb.ownerOrganizationId === userOrgId;
    const sameUser = wb.ownerUserId === userId;
    const superAdmin = hasAnyRole(user, "super_admin");
    const isLakeDemo = companyId === LAKE_TRADING_DEMO_CLIENT_ID;
    if (!sameOrg && !sameUser && !(superAdmin && isLakeDemo)) {
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

    // Phase 6 RBAC: if the client has a workspace-bound assessment, the
    // requester must also be a member of that workspace (creators and the
    // workspace owner are always allowed). This stops a same-org user who
    // wasn't invited to the workspace from bypassing pillar scoping via the
    // workbook route. Mirrors the apps/api verifyPillarAccess pattern.
    if (mongoReady() && !sameUser && !superAdmin) {
      try {
        const session = await ProcessorSessionModel.findOne({
          clientId: companyId,
          workspaceId: { $nin: [null, ''] },
        }).sort({ updatedAt: -1 }).lean() as any;
        if (session?.workspaceId) {
          const ownerId = session.createdBy ?? session.createdByUserId ?? null;
          const isAssessmentOwner = ownerId && ownerId === userId;
          if (!isAssessmentOwner) {
            const member = await WorkspaceMemberModel.findOne({
              workspaceId: String(session.workspaceId),
              userId,
            }).lean();
            if (!member) {
              logger.warn("Workbook access denied — not a workspace member", {
                companyId,
                requesterUserId: userId,
                workspaceId: session.workspaceId,
              });
              res.status(403).json({ message: "Forbidden — not a member of this workspace" });
              return null;
            }
          }
        }
      } catch (err: any) {
        // Don't mask transient infra failures behind a 403 — the org/creator
        // check above is still enforcing tenancy. Log + fall through.
        logger.warn("workbook RBAC check failed (non-fatal)", { companyId, error: err?.message });
      }
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

// Lake Trading Fix Plan — ownership helpers (race/designation normalisation in shared.ts)
function mapDesignation(raw: string): string {
  return normalizeDesignationForScoring(raw);
}

// Lake Trading Fix Plan â”¬Âº1 Bug 4 + 5 (ESD/SED type)
// Map human-friendly workbook contributionType labels Î“Ã¥Ã† calculator snake_case keys
function mapContributionType(raw: string): string {
  const t = (raw ?? "").toLowerCase().replace(/\s+/g, "_");
  if (t.includes("grant")) return "grant";
  if (t.includes("interest") && t.includes("free")) return "interest_free_loan";
  if (t.includes("loan")) return "standard_loan";
  if (t.includes("guarantee")) return "guarantees";
  if (t.includes("discount")) return "discounts";
  if (t.includes("payment") && t.includes("period")) return "shorter_payment_terms";
  if (t.includes("professional")) return "professional_services_free";
  if (t.includes("human") || t.includes("employee_time")) return "employee_time";
  if (t.includes("direct")) return "direct_cost";
  // "Other monetary" is a genuine direct cost, so it keeps its factor.
  if (t.includes("other") && t.includes("monetary")) return "direct_cost";
  // Everything else ABSTAINS. This used to return "direct_cost" for any
  // unmatched string, and direct_cost is recognised at 100%, so a type we
  // could not read was not flagged - it was scored in full. That fallback was
  // chosen to make a fixture pass, then applied to every real client upload.
  return "unclassified";
}

function mapEsdCategory(raw: string): "supplier_development" | "enterprise_development" | "unclassified" {
  const t = (raw ?? "").trim().toLowerCase().replace(/[^a-z]/g, "");
  if (t === "ed" || t.startsWith("enterprise") || t.includes("enterprise development")) return "enterprise_development";
  if (t === "sd" || t.startsWith("supplier")) return "supplier_development";
  // Unknown used to default to supplier_development — "counts toward SD
  // sub-min" — which decided a compliance sub-minimum on a guess. Unknown now
  // stays unclassified: the calculator excludes it AND flags it, and the
  // workbook's category dropdown is where a person settles it.
  return "unclassified";
}

// Lake Trading Fix Plan â”¬Âº1 Bug 3 + 7: supplier size Î“Ã¥Ã† enterpriseType + unit normalisation
function mapEnterpriseType(rawSize: string): "eme" | "qse" | "generic" {
  const t = (rawSize ?? "").trim().toLowerCase();
  if (t === "eme") return "eme";
  if (t === "qse") return "qse";
  return "generic";
}

// Lake Trading Fix Plan â”¬Âº1 Bug 7: workbook stores % (0Î“Ã‡Ã´100); calculators expect fractions (0Î“Ã‡Ã´1)
function pctToFraction(v: unknown): number {
  // parseLooseNumber strips "%", currency and thousands separators so "51.5%" /
  // "60" / "0,6" still parse instead of NaN→0 (which failed every BO51/BWO30 check).
  const n = parseLooseNumber(v);
  if (n <= 1) return Math.max(0, n);
  return Math.max(0, n / 100);
}

// Lake Trading Fix Plan â”¬Âº1 Bug 3: beeLevel must be a number 1Î“Ã‡Ã´8 (0 = non-compliant)
function parseBeeLevel(raw: unknown): number {
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 1 && n <= 8) return Math.round(n);
  return 0;
}

/**
 * The workbook stores a human industry label in company-information.industrySector
 * ("Generic", "ICT", "FSC", "AGRI", "CONSTRUCTION", "TRANSPORT"), but the Toolkit
 * calculator config is keyed by sector CODE. Every label already equals its code
 * EXCEPT the Generic Codes, whose code is "RCOGP". Without this remap an explicit
 * "Generic" pick yields sectorCode "GENERIC", which matches no calculator config
 * (isRcogpGenericSector wants "RCOGP") → every pillar weighting resolves to 0 →
 * the scorecard totals 0. Blank scorecards escape this only because an EMPTY
 * sectorCode defaults to RCOGP in the store; an explicit "Generic" does not.
 */
export function toCalculatorSectorCode(industrySector: unknown): string {
  const code = s(industrySector).trim().toUpperCase();
  return code === "GENERIC" ? "RCOGP" : code;
}

export function projectWorkbookToClient(wb: WorkbookData) {
  const sec = wb.sections;
  const finMeta = (sec["financial-information"]?.meta ?? {}) as Record<string, unknown>;
  const companyMeta = (sec["company-information"]?.meta ?? {}) as Record<string, unknown>;

  // Lake Trading Fix Plan â”¬Âº1 Bug 1: write every scoring field the calculators read,
  // derived from the workbook columns (race, gender, votingRights%, economicInterest%, etc.).
  // For trust / multi-beneficiary holders the workbook row can also carry an
  // explicit `blackOwnership` / `blackWomenOwnership` fraction (used by the
  // Lake demo seed for the Family Trust shareholder); when present we prefer it.
  const sectorCode = toCalculatorSectorCode(companyMeta.industrySector);
  const farmWorkersIncluded = companyMeta.farmWorkersIncluded !== false;

  const shareholders = (sec["ownership"]?.rows ?? []).map((r) => {
    const race = normalizeRace(s((r as any).race));
    const gender = s((r as any).gender);
    const isBlack = isBlackRace(race);
    const isFemale = gender === "Female";
    const votingPct = pctToFraction((r as any).votingRights);
    const eiPct = pctToFraction((r as any).economicInterest);
    const sharePct = pctToFraction((r as any).shareholding);
    const isYouth = coerceYesNo((r as any).isYouth);
    const isDisabled = coerceYesNo((r as any).isDisabled);
    // Credit a black new entrant from the explicit flag OR a positive BNE%
    // column (mirrors how designated groups are credited from their % below).
    // Without this, a workbook / bulk-upload row that supplies only BNE% never
    // scores the new-entrant points.
    const isNewEntrant =
      coerceYesNo((r as any).isNewEntrant ?? (r as any).blackNewEntrant) ||
      pctToFraction((r as any).blackNewEntrantOwnership) > 0;
    // AGRI-specific: farm workers as a 5th Designated Group category.
    const isFarmWorker = sectorCode === "AGRI" && coerceYesNo((r as any).isFarmWorker) && farmWorkersIncluded;

    // Prefer explicit blackOwnership / blackWomenOwnership when the workbook row
    // supplies them (trust holders, multi-beneficiary shareholders). Fall back
    // to race+gender+voting/EI derivation for individual shareholders.
    const explicitBlackOwn = (r as any).blackOwnership;
    const explicitBlackWomenOwn = (r as any).blackWomenOwnership;
    // blackOwnership is the BLACK FRACTION of the holder (the calc multiplies it by the
    // holder's share fraction). A black individual is 100% black-owned — their holding
    // SIZE comes from `shares` (voting/EI), NOT from blackOwnership. The old code set it
    // to max(voting,EI), which the calc then squared (28% voting -> 14% black). (W-own)
    const blackOwnership =
      explicitBlackOwn != null
        ? pctToFraction(explicitBlackOwn)
        : isBlack
          ? 1
          : 0;
    const blackWomenOwnership =
      explicitBlackWomenOwn != null
        ? pctToFraction(explicitBlackWomenOwn)
        : isBlack && isFemale
          ? 1
          : 0;

    return {
      name: s((r as any).shareholderName ?? (r as any).name),
      idNumber: s((r as any).idNumber),
      race,
      gender,
      isDisabled,
      isYouth,
      votingRights: num((r as any).votingRights),
      economicInterest: num((r as any).economicInterest),
      shareholding: num((r as any).shareholding),
      modifiedFlowThrough: coerceYesNo((r as any).modifiedFlowThrough),
      // NEW (fix plan Bug 1) Î“Ã‡Ã¶ scoring-engine fields the loader reads.
      blackOwnership,
      blackWomenOwnership,
      // Use integer "shares" derived from shareholding %; only relative weight matters
      // (calculators normalise by total shares). 1 minimum keeps the totalShares > 0
      // branch in calculateOwnershipScore so blackOwnership flows through.
      // Share weight: real export sheets carry Voting Rights % / Economic Interest %
      // but no explicit shareholding column, so the share-weighted ownership calc was
      // diluting every holder to 1 equal share (black voting read ~6% not ~63%). Fall
      // back to voting% (then EI%) as the weight so ownership scores from real %s. (W-own)
      shares:
        num((r as any).numberOfShares) > 0
          ? Math.round(num((r as any).numberOfShares))
          : Math.max(1, Math.round((sharePct > 0 ? sharePct : Math.max(votingPct, eiPct)) * 10_000)),
      shareValue: num((r as any).shareValue) > 0 ? num((r as any).shareValue) : 1,
      yearsHeld: num((r as any).yearsHeld),
      isDesignatedGroup:
        coerceYesNo((r as any).isDesignatedGroup) ||
        pctToFraction((r as any).designatedGroupOwnership) > 0 ||
        isYouth ||
        isDisabled ||
        isFarmWorker,
      isFarmWorker,
      blackNewEntrant: isNewEntrant,
      votingRightsPercent: votingPct,
      economicInterestPercent: eiPct,
      // Pass the workbook's stated type through — the ownership calculator
      // detects ESOP/BBOS scheme rows from it (the scheme bonus must never be
      // awarded without a scheme actually appearing in the register).
      ownershipType: s((r as any).ownershipType) || "shareholder",
    };
  }).filter((sh) => {
    // Drop summary / total / note rows the grid parser ingests below the shareholder
    // data (e.g. "TOTALS" with voting 100%, "Black voting rights", a "Net value:" note).
    // These were polluting the share-weighted ownership calc. (W-own)
    const nm = String(sh.name ?? "").trim().toLowerCase();
    if (!nm) return false;
    if (/^(totals?|sub-?totals?|grand\s+total|net\s+value|black\s+(voting|women|economic|new|people|disabled))/i.test(nm)) return false;
    // A real shareholder has a recognised race or some ownership signal.
    return sh.race !== "" || sh.blackOwnership > 0 || sh.votingRightsPercent > 0 || sh.economicInterestPercent > 0;
  });

  const empSeen = new Set<string>();
  const employees: any[] = [];
  for (const key of ["employees", "management-control"]) {
    for (const r of sec[key]?.rows ?? []) {
      const id = (r as any)._id as string | undefined;
      if (id && empSeen.has(id)) continue;
      if (id) empSeen.add(id);
      // Lake Trading Fix Plan â”¬Âº1 Bug 2: translate workbook label Î“Ã¥Ã† calculator enum
      // Real workbooks carry BOTH a job title and an occupational level, in
      // whichever order the sheet happens to use:
      //   Position (Occupational Level): "Executive Management"   <- scores
      //   Job Title:                     "Member"                 <- does not
      // Taking `designation` first put the JOB TITLE into the scoring field, it
      // matched no band, and Management Control scored 0 for an entity whose
      // sole top manager is Black. So prefer whichever column actually names a
      // band the scorecard counts, and only fall back to raw order when neither
      // does (which leaves previous behaviour untouched).
      const rawDesigCell = s((r as any).designation);
      const rawOccCell = s((r as any).occupationalLevel);
      const scoringCell = isScoringDesignation(rawDesigCell)
        ? rawDesigCell
        : isScoringDesignation(rawOccCell)
          ? rawOccCell
          : (rawDesigCell || rawOccCell);
      const designation = mapDesignation(scoringCell);
      const occupationalLevel = mapDesignation(rawOccCell || scoringCell);
      employees.push({
        name: s((r as any).name),
        surname: s((r as any).surname),
        fullName: joinName(r as any),
        idNumber: s((r as any).idNumber),
        race: normalizeRace(s((r as any).race)) || s((r as any).race),
        gender: s((r as any).gender),
        occupationalLevel,
        designation,
        department: s((r as any).department),
        salary: num((r as any).salary),
        isDisabled: coerceYesNo((r as any).isDisabled),
        isForeign: coerceYesNo((r as any).isForeign),
        votingRights: num((r as any).votingRights),
        startDate: s((r as any).startDate),
        // Construction-only template fields (professional registration, youth).
        professionallyRegistered: coerceYesNo((r as any).professionallyRegistered),
        isYouthEmployee: coerceYesNo((r as any).isYouthEmployee),
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
    const absorbed = coerceYesNo((r as any).absorbed);
    const employed = coerceYesNo((r as any).employed);
    const categoryCode = s((r as any).categoryCode);
    // Derive employmentStatus (calculator reads this for unemployed/learnership/
    // absorption scoring) and the explicit YES / bursary flags, so the first
    // calculation after submit matches what the loader reconstructs on reload.
    const rawEmpStatus = s((r as any).employmentStatus);
    const employmentStatus = rawEmpStatus || (employed ? "Permanent" : "Unemployed");
    return {
      programName: s((r as any).programName),
      // Alias `name` for consumers keyed on it.
      name: s((r as any).programName),
      categoryCode,
      category: categoryCode,
      trainingProvider: s((r as any).trainingProvider),
      learnerName: s((r as any).learnerName),
      idNumber: s((r as any).idNumber),
      learnerIdNumber: s((r as any).idNumber),
      race: normalizeRace(s((r as any).race)) || s((r as any).race),
      gender: s((r as any).gender),
      isBlack: isBlackRace(s((r as any).race)),
      isDisabled: coerceYesNo((r as any).isDisabled),
      isForeign: coerceYesNo((r as any).isForeign),
      employed,
      employmentStatus,
      isYesEmployee: coerceYesNo((r as any).isYesEmployee ?? (r as any).yesEmployee),
      completed: coerceYesNo((r as any).completed),
      isCompleted: coerceYesNo((r as any).completed),
      absorbed,
      isAbsorbed: absorbed,
      isBursary: coerceYesNo((r as any).isBursary) || categoryCode === "A",
      courseCost: num((r as any).courseCost),
      travelCost: num((r as any).travelCost),
      accommodationCost: num((r as any).accommodationCost),
      cateringCost: num((r as any).cateringCost),
      stationeryCost: num((r as any).stationeryCost),
      facilityCost: num((r as any).trainingFacilityCost ?? (r as any).facilityCost),
      salaryCost: num((r as any).salaryCost),
      otherCosts: num((r as any).otherCosts),
      totalCost: total,
      cost: total,
      startDate: s((r as any).startDate),
      endDate: s((r as any).endDate),
      // Construction-only template fields (industry registration, learner mgmt
      // level, mentorship) for the construction skills indicators.
      industryRegistered: coerceYesNo((r as any).industryRegistered),
      learnerMgmtLevel: s((r as any).learnerMgmtLevel),
      mentorship: coerceYesNo((r as any).mentorship),
      mentorshipPromotion: coerceYesNo((r as any).mentorshipPromotion),
    };
  });

  const supSeen = new Set<string>();
  const suppliers: any[] = [];
  for (const key of ["procurement", "suppliers"]) {
    for (const r of sec[key]?.rows ?? []) {
      const id = (r as any)._id as string | undefined;
      if (id && supSeen.has(id)) continue;
      if (id) supSeen.add(id);
      // Lake Trading Fix Plan â”¬Âº1 Bug 7: workbook stores % (0Î“Ã‡Ã´100); calculators
      // expect fractions (0Î“Ã‡Ã´1). Normalise once at projection.
      const blackOwnershipFraction = pctToFraction((r as any).currentBlackOwnership);
      const blackFemaleOwnershipFraction = pctToFraction(
        (r as any).currentBlackFemaleOwnership,
      );
      // Lake Trading Fix Plan â”¬Âº1 Bug 3: map workbook size Î“Ã¥Ã† enterpriseType, parse
      // beeLevel to a number (loader default of 4 hides non-compliant suppliers
      // Î“Ã‡Ã¶ see Bug 8 Î“Ã‡Ã¶ but here we just carry the parsed value through).
      const sizeRaw = s((r as any).currentSize);
      const enterpriseType = mapEnterpriseType(sizeRaw);
      const beeLevel = parseBeeLevel((r as any).bbbeeLevel);
      // Empowering-supplier flag: UNKNOWN (undefined) when the row does not carry
      // the column at all — parser-extracted supplier rows have supplierName/spend/
      // level but no "Empowering Supplier" cell. The procurement calc reads
      // `isEmpoweringSupplier ?? (beeLevel 1-8)`, so coercing an absent value to
      // `false` (as coerceYesNo does) is NOT nullish and wrongly EXCLUDES every
      // such supplier from the empowering-spend line — which is the ONLY scoring
      // line for Transport QSE PP, zeroing the pillar. A row that DOES carry the
      // cell keeps its explicit value (importer path unchanged).
      const empoweringRaw = (r as any).empoweringSupplier;
      const isEmpowering = empoweringRaw === undefined || empoweringRaw === null || String(empoweringRaw).trim() === ''
        ? undefined
        : coerceYesNo(empoweringRaw);
      suppliers.push({
        id: id ?? undefined,
        supplierName: s((r as any).supplierName),
        // Alias `name` for downstream consumers that key off it.
        name: s((r as any).supplierName),
        // Polo feedback #8: carry the supplier registration number through.
        registrationNumber: s((r as any).registrationNumber),
        currentSize: sizeRaw,
        size: sizeRaw,
        enterpriseType, // Lake Trading Fix Plan â”¬Âº1 Bug 3
        bbbeeLevel: beeLevel,
        beeLevel,
        vatNumber: s((r as any).vatNumber),
        measuredUnder: s((r as any).measuredUnder),
        empoweringSupplier: isEmpowering,
        isEmpoweringSupplier: isEmpowering,
        // Carry both the raw % (for audit) and the fraction (for scoring)
        currentBlackOwnership: num((r as any).currentBlackOwnership),
        blackOwnership: blackOwnershipFraction,
        currentBlackFemaleOwnership: num((r as any).currentBlackFemaleOwnership),
        blackFemaleOwnership: blackFemaleOwnershipFraction,
        blackWomenOwnership: blackFemaleOwnershipFraction,
        sdRecipient: coerceYesNo((r as any).sdRecipient),
        isSupplierDevRecipient: coerceYesNo((r as any).sdRecipient),
        threeYearContract: coerceYesNo((r as any).threeYearContract),
        hasThreeYearContract: coerceYesNo((r as any).threeYearContract),
        designated: coerceYesNo((r as any).designated),
        isDesignatedGroup: coerceYesNo((r as any).designated),
        spend: num((r as any).spend),
        amount: num((r as any).spend),
        // Calculators check these flags when present
        isBlackOwned51: blackOwnershipFraction >= 0.51,
        isBlackWomanOwned30: blackFemaleOwnershipFraction >= 0.30,
        firstProcurementDate: s((r as any).firstProcurementDate),
        certificateExpiryDate: s((r as any).certificateExpiryDate),
      });
    }
  }

  // Lake Trading Fix Plan â”¬Âº1 Bug 4: include `category` (supplier_development /
  // enterprise_development) and map contributionType labels Î“Ã¥Ã† calculator keys.
  const esdContributions = (sec["esd"]?.rows ?? []).map((r) => {
    const rawType = s((r as any).contributionType);
    // The export ESD sheet has no category column — SD vs ED is encoded in the
    // Contribution Description ("ENTERPRISE DEVELOPMENT (non-supplier…)" vs "SD
    // beneficiary (existing supplier…)"). Fall back to it so ED rows score. (W1b)
    const rawCategory = s((r as any).esdCategory) || s((r as any).contributionDescription);
    return {
      id: (r as any)._id ?? undefined,
      // Calculator reads `beneficiary` + `type` + `category` + `amount`
      beneficiary: s((r as any).supplierName),
      supplierName: s((r as any).supplierName),
      type: mapContributionType(rawType),
      contributionType: rawType,
      category: mapEsdCategory(rawCategory),
      currentBlackOwnership: num((r as any).currentBlackOwnership),
      blackBenefitPercent: num((r as any).currentBlackOwnership),
      currentSize: s((r as any).currentSize),
      contributionDescription: s((r as any).contributionDescription),
      amount: num((r as any).amount),
      dateOfTransaction: s((r as any).dateOfTransaction),
      invoiceDate: s((r as any).invoiceDate),
      paymentDate: s((r as any).paymentDate),
      primeRate: num((r as any).primeRate),
      actualRate: num((r as any).actualRate),
      // Construction-only: recognised Supplier & Contractor Development programme.
      supplierDevProgramme: coerceYesNo((r as any).supplierDevProgramme),
    };
  });

  // Lake Trading Fix Plan â”¬Âº1 Bug 5: rename to `beneficiary` + map type to
  // calculator keys (SED has no category filter, but factor must still apply).
  const sedContributions = (sec["sed"]?.rows ?? []).map((r) => {
    const rawType = s((r as any).contributionType);
    return {
      id: (r as any)._id ?? undefined,
      beneficiary: s((r as any).beneficiaryName),
      beneficiaryName: s((r as any).beneficiaryName),
      type: mapContributionType(rawType),
      contributionType: rawType,
      category: "socio_economic" as const,
      descriptionOfSpend: s((r as any).descriptionOfSpend),
      ictSpecificInitiative: coerceYesNo((r as any).ictSpecificInitiative),
      percentBenefitingBlack: num((r as any).percentBenefitingBlack),
      blackBenefitPercent: num((r as any).percentBenefitingBlack),
      amount: num((r as any).amount),
      dateOfTransaction: s((r as any).dateOfTransaction),
    };
  });

  const skillsMeta = (sec["skills-development"]?.meta ?? {}) as Record<string, unknown>;
  const sedMeta = (sec["sed"]?.meta ?? {}) as Record<string, unknown>;
  const afsMeta = (sec["afs-additions"]?.meta ?? {}) as Record<string, unknown>;
  const financials = mapWorkbookFinancialsToClient(finMeta, companyMeta, skillsMeta, sedMeta, afsMeta);

  // FSC Banks/LTI Empowerment Financing — the normalizer parses the workbook's
  // "Empowerment Financing" facility table into esd.meta.efFacilities (the EF
  // pillar shares the template's "EF & ESD Scorecard"). Carry it on financials
  // (like afs) so it persists in the client financials blob and hydrates into
  // calculateEmpowermentFinancingScore.
  const esdMeta = (sec["esd"]?.meta ?? {}) as Record<string, unknown>;
  if (Array.isArray(esdMeta.efFacilities) && (esdMeta.efFacilities as unknown[]).length > 0) {
    (financials as any).empowermentFinancing = { facilities: esdMeta.efFacilities };
  }

  // Procurement TMPS fallback (Polo feedback #10): suppliers were saved but never
  // scored because procurement targets are tmps × pct, and tmps only came from the
  // Financials TMPS field. If that wasn't supplied, derive tmps from total supplier
  // spend so entered suppliers actually produce a score.
  if (!(financials.tmps > 0)) {
    const supplierSpendTotal = suppliers.reduce(
      (acc, sup) => acc + (num((sup as any).spend) || 0),
      0,
    );
    if (supplierSpendTotal > 0) financials.tmps = supplierSpendTotal;
  }

  // Connect the skills headcount to the actual employee register — the user
  // shouldn't have to enter it twice. When no headcount was supplied, use the
  // number of employees captured in Management Control. The skills calculator
  // scores learnership / absorption participation as a % of this headcount.
  if (!((financials as any).headcount > 0) && employees.length > 0) {
    (financials as any).headcount = employees.length;
  }

  const ownershipMeta = {
    companyValue: financials.companyValue ?? 0,
    outstandingDebt: financials.outstandingDebt ?? 0,
    yearsHeld: Math.max(
      0,
      ...shareholders.map((sh) => num((sh as any).yearsHeld)),
    ),
  };

  return {
    shareholders,
    employees,
    trainingPrograms,
    suppliers,
    esdContributions,
    sedContributions,
    financials,
    companyMeta,
    ownershipMeta,
  };
}

function requireSuperAdmin(req: Request, res: Response): boolean {
  const user = (req as any).user;
  if (!hasAnyRole(user, "super_admin")) {
    res.status(403).json({ message: "Super-admin access required" });
    return false;
  }
  return true;
}

export function registerWorkbookRoutes(app: Express): void {
  app.get("/api/admin/demo/lake-trading", requireAuth, async (req: Request, res: Response) => {
    if (!requireSuperAdmin(req, res)) return;
    if (!mongoReady()) {
      return res.status(503).json({ error: "Database unavailable" });
    }
    const client = await ClientModel.findOne({ clientId: LAKE_TRADING_DEMO_CLIENT_ID })
      .select({ clientId: 1, name: 1, lakeTradingDemo: 1 })
      .lean();
    if (!client) {
      return res.json({ exists: false, clientId: LAKE_TRADING_DEMO_CLIENT_ID, name: null });
    }
    const wb = await WorkbookModel.findOne({ companyId: LAKE_TRADING_DEMO_CLIENT_ID })
      .select({ submittedAt: 1, updatedAt: 1 })
      .lean();
    return res.json({
      exists: true,
      clientId: LAKE_TRADING_DEMO_CLIENT_ID,
      name: (client as any).name,
      submittedAt: wb?.submittedAt ? new Date(wb.submittedAt).toISOString() : null,
      updatedAt: wb?.updatedAt ? new Date(wb.updatedAt).toISOString() : null,
    });
  });

  app.post("/api/admin/demo/lake-trading", requireAuth, async (req: Request, res: Response) => {
    if (!requireSuperAdmin(req, res)) return;
    const user = (req as any).user;
    const userId: string = user?.id || (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    try {
      const result = await seedLakeTradingDemo(userId, user?.organizationId ?? null);
      return res.json({ ok: true, ...result });
    } catch (err: any) {
      if (err?.message === "DATABASE_UNAVAILABLE") {
        return res.status(503).json({ error: "Database unavailable" });
      }
      logger.error("Lake Trading demo seed failed", err);
      return res.status(500).json({ error: "Failed to seed Lake Trading demo" });
    }
  });

  app.get("/api/workbook/:companyId", requireAuth, async (req: Request, res: Response) => {
    const wb = await authorizeWorkbookAccess(req, res);
    if (!wb) return;
    // Phase 5: read-time rebuild — make the workbook a true derived view of
    // the live per-entity collections, so even if a back-sync fan-out was
    // dropped the workbook self-heals on open. Opt-out with ?rebuild=0 (for
    // perf debugging or to inspect the persisted shape unmodified).
    if (req.query.rebuild !== '0') {
      try {
        await rebuildWorkbookFromEntities(wb);
      } catch (err) {
        logger.warn('workbook rebuild failed (returning stored doc)', { err: err instanceof Error ? err.message : String(err) });
      }
    }
    // Pillar-scope filter (audit B15, workbook half): the workbook carries
    // EVERY pillar, and until now a pillar-scoped collaborator whose client
    // read was stripped could open the workbook and see it all anyway.
    const userId: string = (req as any).user?.id || (req.session as any)?.userId;
    const access = await resolveWorkbookPillarAccess(String(req.params.companyId), userId);
    if (access && access.mode === "scoped") {
      return res.json({ ...wb, sections: filterReadableSections(access, wb.sections ?? {}) });
    }
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
      // Per-section write gate: viewers write nothing; pillar-scoped members
      // write only their pillar's section; the meta sections (financials,
      // company info) are cross-pillar and need full access.
      const writerId: string = (req as any).user?.id || (req.session as any)?.userId;
      const writeAccess = await resolveWorkbookPillarAccess(String(req.params.companyId), writerId);
      if (!canWriteSection(writeAccess, sectionKey)) {
        return res.status(403).json({ error: `Access denied (section '${sectionKey}' is outside your workspace scope)` });
      }
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

  // Import normalized workbook sections (client-side Excel parse or manual JSON).
  app.post(
    "/api/workbook/:companyId/import",
    requireAuth,
    async (req: Request, res: Response) => {
      const wb = await authorizeWorkbookAccess(req, res);
      if (!wb) return;
      const incoming = (req.body as any)?.sections;
      if (!incoming || typeof incoming !== "object") {
        return res.status(400).json({ error: "Missing sections payload." });
      }
      // Bulk import applies only the sections this caller may write; the rest
      // are REPORTED as blocked, never silently dropped.
      const importerId: string = (req as any).user?.id || (req.session as any)?.userId;
      const importAccess = await resolveWorkbookPillarAccess(String(req.params.companyId), importerId);
      const blockedSections: string[] = [];
      try {
        let next = wb;
        for (const key of Object.keys(incoming)) {
          if (!SECTION_KEYS.includes(key as (typeof SECTION_KEYS)[number])) continue;
          if (!canWriteSection(importAccess, key)) {
            blockedSections.push(key);
            continue;
          }
          const sec = incoming[key];
          const rows = sanitizeRows(sec?.rows);
          const meta =
            sec?.meta && typeof sec.meta === "object"
              ? (sec.meta as Record<string, unknown>)
              : undefined;
          next = await persistSection(next, key, {
            rows,
            ...(meta ? { meta } : {}),
          });
        }
        const validationIssues = validateWorkbook(next.sections);
        res.json({
          ok: true,
          updatedAt: next.updatedAt,
          validationIssues,
          ...(blockedSections.length ? { blockedSections } : {}),
          summary: validationIssues.length
            ? formatWorkbookValidationSummary(validationIssues)
            : null,
        });
      } catch (err: any) {
        logger.error("Failed to import workbook sections", err);
        res.status(500).json({ error: "Failed to import workbook" });
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
        // An export is a read: a pillar-scoped member downloads only the
        // sections they can see on screen.
        const exporterId: string = (req as any).user?.id || (req.session as any)?.userId;
        const exportAccess = await resolveWorkbookPillarAccess(String(req.params.companyId), exporterId);
        const buf = buildXlsx(
          exportAccess && exportAccess.mode === "scoped"
            ? { ...wb, sections: filterReadableSections(exportAccess, wb.sections ?? {}) }
            : wb,
        );
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

  // Submit the workbook Î“Ã¥Ã† write its contents into the associated client record
  // so the scorecard pipeline can pick it up. Returns row counts of what was synced.
  const handleWorkbookScorecardSync = async (req: Request, res: Response) => {
      const wb = await authorizeWorkbookAccess(req, res);
      if (!wb) return;

      // Submitting the workbook rewrites the client's records across EVERY
      // pillar — the most cross-pillar write on this router. Pillar-scoped and
      // read-only members cannot.
      const syncerId: string = (req as any).user?.id || (req.session as any)?.userId;
      const syncAccess = await resolveWorkbookPillarAccess(String(wb.companyId), syncerId);
      if (!canSyncScorecard(syncAccess)) {
        return res.status(403).json({ error: "Access denied (submitting the workbook requires full scorecard access)" });
      }

      if (!mongoReady() && !canUseMemoryFallback()) {
        return res
          .status(503)
          .json({ error: "Database unavailable — cannot submit workbook." });
      }

      const allValidationIssues = validateWorkbook(wb.sections);
      const blockingIssues = validateWorkbookForSubmit(wb.sections);

      const projected = projectWorkbookToClient(wb);
      console.log("[SCORING-TRACE] projectWorkbookToClient input:", {
        companyId: wb.companyId,
        sectionIds: Object.keys(wb.sections),
        finMeta: wb.sections["financial-information"]?.meta,
        companyMeta: wb.sections["company-information"]?.meta,
      });
      console.log("[SCORING-TRACE] projectWorkbookToClient output:", {
        ownership: projected.shareholders.length,
        employees: projected.employees.length,
        skills: projected.trainingPrograms.length,
        procurement: projected.suppliers.length,
        esd: projected.esdContributions.length,
        sed: projected.sedContributions.length,
        sampleShareholder: projected.shareholders[0],
        sampleEmployee: projected.employees[0],
      });
      try {
        const buildUpdate = (): Record<string, any> => {
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
          if (f.leviableAmount > 0) update.leviableAmount = f.leviableAmount;
          if (f.tmps > 0) update.tmps = f.tmps;
          if (f.effectiveNpat != null) update.npat = f.effectiveNpat;
          else if (typeof f.npat === "number") update.npat = f.npat;
          if (projected.ownershipMeta?.companyValue > 0) {
            update.companyValue = projected.ownershipMeta.companyValue;
          } else if (f.companyValue != null && f.companyValue > 0) {
            update.companyValue = f.companyValue;
          }
          if (projected.ownershipMeta?.outstandingDebt != null) {
            update.outstandingDebt = projected.ownershipMeta.outstandingDebt;
          } else if (f.outstandingDebt != null) {
            update.outstandingDebt = f.outstandingDebt;
          }
          if (f.industrySector) {
            update.industrySector = f.industrySector;
            update.sectorCode = toCalculatorSectorCode(f.industrySector);
          }
          if (f.scorecardType) {
            update.scorecardType = f.scorecardType;
            update.companySize = f.scorecardType;
          }
          if (f.annualTurnover > 0) update.annualTurnover = f.annualTurnover;
          // Cover-sheet global inputs
          if (f.measurementPeriodStart) update.measurementPeriodStart = f.measurementPeriodStart;
          if (f.measurementPeriodEnd) update.measurementPeriodEnd = f.measurementPeriodEnd;
          // Skills aggregate inputs — persist to dedicated client fields where they exist,
          // and into the mixed `financials` blob for fields without a top-level column.
          if (f.eapProvince) update.eapProvince = f.eapProvince;
          if (f.headcount != null && f.headcount > 0) update.numberOfEmployees = f.headcount;
          const skillsExtra: Record<string, unknown> = {};
          if (f.deemedNpatUsed != null) skillsExtra.deemedNpatUsed = f.deemedNpatUsed;
          if (f.deemedNpat != null) skillsExtra.deemedNpat = f.deemedNpat;
          if (f.effectiveNpat != null) skillsExtra.effectiveNpat = f.effectiveNpat;
          if (f.industryNormPercent != null) skillsExtra.industryNormPercent = f.industryNormPercent;
          if (f.combineExcoSenior != null) skillsExtra.combineExcoSenior = f.combineExcoSenior;
          if (f.headcount != null) skillsExtra.headcount = f.headcount;
          if (f.groupLeviableAmount != null) skillsExtra.groupLeviableAmount = f.groupLeviableAmount;
          if (f.eapYear != null) skillsExtra.eapYear = f.eapYear;
          if (f.trainingManagerSalary != null) skillsExtra.trainingManagerSalary = f.trainingManagerSalary;
          if (f.trainingOverheadCost != null) skillsExtra.trainingOverheadCost = f.trainingOverheadCost;
          if (f.selectPeriod) skillsExtra.selectPeriod = f.selectPeriod;
          if (f.dataDate) skillsExtra.dataDate = f.dataDate;
          // AGRI-specific
          if (f.farmWorkersIncluded !== undefined) skillsExtra.farmWorkersIncluded = f.farmWorkersIncluded;
          // FSC-specific
          if (f.fscSubSector) update.fscSubSector = f.fscSubSector;
          if (f.fscReinsurer !== undefined) update.fscReinsurer = f.fscReinsurer;
          if (f.afs) skillsExtra.afs = f.afs;
          if ((f as any).empowermentFinancing) skillsExtra.empowermentFinancing = (f as any).empowermentFinancing;
          if (f.ceSpend != null) skillsExtra.ceSpend = f.ceSpend;
          if (f.ceBonusSpend != null) skillsExtra.ceBonusSpend = f.ceBonusSpend;
          if (f.fundisaSpend != null) skillsExtra.fundisaSpend = f.fundisaSpend;
          // FSC-specific: prior year revenue for FSC SED/income scoring.
          if (f.priorYearRevenue != null) skillsExtra.priorYearRevenue = f.priorYearRevenue;
          if (Object.keys(skillsExtra).length > 0) {
            update.financials = { ...(update.financials ?? {}), ...skillsExtra };
          }
          const cm = projected.companyMeta;
          // Construction sub-sector (Contractor / BEP / Built-Environment QSE)
          // lives in company-information meta. Persist it so the live store
          // hydrates the correct construction CalculatorConfig on GET instead
          // of defaulting to Contractor. Input ingestion only — never the engine.
          const csub = String(cm.constructionSubSector ?? "").trim();
          if (csub) update.constructionSubSector = csub;
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
            "financialYearEnd",
          ] as const) {
            const v = cm[key];
            if (typeof v === "string" && v.trim()) {
              if (key === "financialYearEnd") {
                update.financialYear = v.trim();
              } else {
                update[key] = v.trim();
              }
            }
          }
          return update;
        };

        const update = buildUpdate();

        if (!mongoReady()) {
          const userId =
            (req as any).user?.id || (req.session as any)?.userId || wb.ownerUserId;
          const submittedAt = new Date().toISOString();
          const updated = memUpdateClient(wb.companyId, update);
          if (!updated) {
            return res
              .status(404)
              .json({ error: "Client not found for this workbook." });
          }
          wb.submittedAt = submittedAt;
          wb.submittedByUserId = userId;
          wb.updatedAt = submittedAt;
          memoryStore.set(wb.companyId, wb);
          return res.json({
            ok: true,
            clientId: wb.companyId,
            counts: {
              shareholders: projected.shareholders.length,
              employees: projected.employees.length,
              trainingPrograms: projected.trainingPrograms.length,
              suppliers: projected.suppliers.length,
              esdContributions: projected.esdContributions.length,
              sedContributions: projected.sedContributions.length,
            },
            submittedAt,
            validationIssues: allValidationIssues,
            blockingIssues,
            warnings: allValidationIssues.filter((i) => !blockingIssues.includes(i)),
          });
        }

        const client = await ClientModel.findOne({ clientId: wb.companyId });
        if (!client) {
          return res
            .status(404)
            .json({ error: "Client not found for this workbook." });
        }

        // Phase 3 (sync plan): financials merge fix. `update.financials` is a
        // Mixed-typed blob — using $set on it whole-replaces the field,
        // silently dropping sub-keys that other paths wrote (e.g. CE/Fundisa
        // spends set via Toolkit Settings, deemedNpat flags from prior
        // submissions). Merge over the existing blob so workbook-owned keys
        // win while other keys pass through unchanged. The set of keys the
        // workbook OWNS is whatever projectWorkbookToClient + buildUpdate
        // here actually populate (skillsExtra at line ~1484), so spreading
        // workbook-owned LAST preserves the right precedence.
        if (update.financials && typeof update.financials === 'object') {
          const currentFinancials = ((client as any).financials && typeof (client as any).financials === 'object')
            ? (client as any).financials
            : {};
          update.financials = { ...currentFinancials, ...update.financials };
        }

        await ClientModel.updateOne({ clientId: wb.companyId }, { $set: update });

        const saved = await ClientModel.findOne({ clientId: wb.companyId })
          .select({ sectorCode: 1, scorecardType: 1, companySize: 1, shareholders: 1, employees: 1 })
          .lean();
        console.log("[SCORING-TRACE] Client saved to DB:", {
          clientId: wb.companyId,
          sector: (saved as any)?.sectorCode,
          scorecardType: (saved as any)?.scorecardType ?? (saved as any)?.companySize,
          shareholders: ((saved as any)?.shareholders ?? []).length,
          employees: ((saved as any)?.employees ?? []).length,
        });

        const userId =
          (req as any).user?.id || (req.session as any)?.userId || wb.ownerUserId;
        await WorkbookModel.updateOne(
          { companyId: wb.companyId },
          { $set: { submittedAt: new Date(), submittedByUserId: userId, updatedAt: new Date() } },
        );

        res.json({
          ok: true,
          clientId: wb.companyId,
          counts: {
            shareholders: projected.shareholders.length,
            employees: projected.employees.length,
            trainingPrograms: projected.trainingPrograms.length,
            suppliers: projected.suppliers.length,
            esdContributions: projected.esdContributions.length,
            sedContributions: projected.sedContributions.length,
          },
          submittedAt: new Date().toISOString(),
          validationIssues: allValidationIssues,
          blockingIssues,
          warnings: allValidationIssues.filter((i) => !blockingIssues.includes(i)),
        });
      } catch (err: any) {
        logger.error("Failed to submit workbook", err);
        res.status(500).json({ error: "Failed to submit workbook" });
      }
  };

  app.post("/api/workbook/:companyId/submit", requireAuth, handleWorkbookScorecardSync);
  app.post("/api/workbook/:companyId/sync", requireAuth, handleWorkbookScorecardSync);

  // ---------------------------------------------------------------------------
  // POST /api/internal/workbook-backsync
  // Toolkit→Workbook back-sync: apps/api per-entity routes fire this after
  // every successful entity write (employees / suppliers / training-programs /
  // shareholders / ESD / SED contributions). Token-protected (shared secret).
  // ---------------------------------------------------------------------------
  app.post(
    "/api/internal/workbook-backsync",
    handleBackSync(process.env.INTERNAL_BACKSYNC_TOKEN),
  );

  // ---------------------------------------------------------------------------
  // POST /api/workbook/suggest-value
  // AI fallback for single-cell normalization when the deterministic engine
  // can't produce a confident suggestion. Returns { suggestion, explanation }.
  // ---------------------------------------------------------------------------
  app.post("/api/workbook/suggest-value", requireAuth, async (req, res) => {
    try {
      const body = req.body ?? {};
      const fieldKey = typeof body.fieldKey === "string" ? body.fieldKey.trim() : "";
      const fieldLabel = typeof body.fieldLabel === "string" ? body.fieldLabel.trim() : fieldKey;
      const rawValue = typeof body.rawValue === "string" ? body.rawValue.trim() : "";
      const fieldType = typeof body.fieldType === "string" ? body.fieldType.trim() : "text";
      const allowedValues: string[] = Array.isArray(body.allowedValues)
        ? body.allowedValues.map(String)
        : [];

      if (!rawValue) {
        return res.status(400).json({ message: "rawValue is required" });
      }

      if (fieldType === "select" && allowedValues.length > 0) {
        const { suggestSelectOption, FUZZY_SELECT_HINT } = await import("../src/lib/selectOptionMatch");
        const match = suggestSelectOption(rawValue, allowedValues, fieldKey || undefined);
        if (match.suggestion && match.confidence >= FUZZY_SELECT_HINT) {
          return res.json({
            suggestion: match.suggestion,
            explanation: `Did you mean "${match.suggestion}"?`,
          });
        }
      }

      const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
      const apiKey = process.env.AZURE_OPENAI_API_KEY;
      const deployment =
        process.env.AZURE_OPENAI_FAST_DEPLOYMENT || process.env.AZURE_OPENAI_DEPLOYMENT;
      const openaiKey = process.env.OPENAI_API_KEY;

      if (!((endpoint && apiKey && deployment) || openaiKey)) {
        return res.status(503).json({ message: "AI not configured" });
      }

      const { AzureOpenAI, default: OpenAI } = await import("openai");
      let client: InstanceType<typeof OpenAI>;
      let model: string;
      if (endpoint && apiKey && deployment) {
        client = new AzureOpenAI({
          endpoint,
          apiKey,
          deployment,
          apiVersion: process.env.AZURE_OPENAI_API_VERSION || "2024-08-01-preview",
        });
        model = deployment;
      } else {
        client = new OpenAI({ apiKey: openaiKey! });
        model = process.env.OPENAI_MODEL || "gpt-4o-mini";
      }

      const validationMessage =
        typeof body.validationMessage === "string" ? body.validationMessage.trim() : "";
      const dateFormat = typeof body.dateFormat === "string" ? body.dateFormat.trim() : "";
      const allowedList =
        allowedValues.length > 0
          ? `Allowed values: ${allowedValues.map((v) => `"${v}"`).join(", ")}.`
          : "";
      const system = [
        "You normalize a single user-entered value for a South African B-BBEE scorecard field.",
        "Return JSON only: { \"suggestion\": string|null, \"explanation\": string }.",
        "suggestion should be the best normalized value, or null if you cannot confidently normalize.",
        "explanation should be a single short sentence (≤20 words) explaining the normalization.",
        "Never invent values that aren't in the allowed list (when provided).",
        dateFormat ? `Dates must use format ${dateFormat}.` : "",
        validationMessage ? `Validation rule: ${validationMessage}` : "",
      ]
        .filter(Boolean)
        .join(" ");
      const user =
        `Field: "${fieldLabel}" (type: ${fieldType}). ${allowedList}\n` +
        (validationMessage ? `Rule: ${validationMessage}\n` : "") +
        (dateFormat ? `Format: ${dateFormat}\n` : "") +
        `User typed: "${rawValue}"\n` +
        `What is the correct normalized value?`;

      const response = await createChatCompletion(client, {
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      const text = response.choices?.[0]?.message?.content;
      if (!text) return res.json({ suggestion: null, explanation: "" });

      const parsed = JSON.parse(text) as { suggestion?: string | null; explanation?: string };
      const suggestion = typeof parsed.suggestion === "string" ? parsed.suggestion.trim() : null;
      const validSuggestion =
        suggestion && (allowedValues.length === 0 || allowedValues.includes(suggestion))
          ? suggestion
          : null;

      return res.json({ suggestion: validSuggestion, explanation: parsed.explanation ?? "" });
    } catch (err) {
      logger.error("suggest-value failed", err);
      return res.status(500).json({ message: "suggest-value failed" });
    }
  });
}
