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

/**
 * Sheets in the export (in order). Modeled on the official
 * "Information Request" template: a checklist sheet first, followed by
 * one data sheet per major area with a title row + header row.
 */
type DataSheetSpec = {
  sheetName: string; // <= 31 chars
  title: string;
  headers: string[];
  /** Maps a workbook row to a value array aligned with `headers`. */
  rowToCells: (row: WorkbookRow) => unknown[];
  /** Which workbook section keys feed this sheet (first non-empty wins, or merged). */
  sectionKeys: string[];
  merge?: boolean; // if true, concatenate rows from all sectionKeys
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
  return [name, surname].filter(Boolean).join(" ");
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
      s((r as any).category ?? (r as any).categoryCode),
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

function buildChecklistSheet(wb: WorkbookData): XLSX.WorkSheet {
  const meta = (wb.sections["company-information"]?.meta ?? {}) as Record<string, unknown>;
  const fin = (wb.sections["financial-information"]?.meta ?? {}) as Record<string, unknown>;
  const companyName = s(meta.companyName ?? meta.name);
  const titleRow: [string, string] = [
    `Information request checklist - ${companyName || "Company"}`,
    "",
  ];
  const aoa: unknown[][] = [titleRow, ...CHECKLIST_ROWS.map((r) => [...r])];

  // If financial info has been captured, append a small summary block at the bottom.
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

  // Title row spans all header columns; header row; then data rows (or empty).
  const titleRow: unknown[] = [spec.title, ...Array(spec.headers.length - 1).fill("")];
  const aoa: unknown[][] = [titleRow, spec.headers, ...rows.map((r) => spec.rowToCells(r))];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: spec.headers.length - 1 } },
  ];
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
