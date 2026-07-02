import {

  getSection,

  getCompanyInfoMetaFields,

  getOrderedSectionKeysForSector,

  getScorecardTypeOptions,

  validateFinancialMetaCrossFields,

  filterVisibleFinancialMetaFields,

  fscSubSectorHasAfs,

  type ColumnDef,

  type SectionDef,

} from "./sections";

import { coerceYesNo } from "@/lib/yesNoValue";



/** Sector codes supported by apps/api/pipeline/sectorConfig.ts */

export const SECTOR_CODE_OPTIONS = [

  "RCOGP",

  "ICT",

  "FSC",

  "AGRI",

  "TRANSPORT",

  "CONSTRUCTION",

] as const;



export type WorkbookValidationIssue = {

  sectionKey: string;

  sectionLabel: string;

  rowId?: string;

  field?: string;

  message: string;

};



export type WorkbookValidationRowIssue = WorkbookValidationIssue & {

  /** 1-based row number within the section grid (for line-item navigation). */

  rowNumber?: number;

  fieldLabel?: string;

};



export type WorkbookValidationSectionSummary = {

  sectionKey: string;

  sectionLabel: string;

  issues: WorkbookValidationRowIssue[];

  issueCount: number;

};



export type WorkbookValidationAggregate = {

  totalIssues: number;

  criticalCount: number;

  advisoryCount: number;

  sections: WorkbookValidationSectionSummary[];

};



export type WorkbookSectionsInput = Record<

  string,

  { rows?: Array<Record<string, unknown>>; meta?: Record<string, unknown> }

>;



/**
 * Whether a value satisfies a select column's allowed options, tolerantly.
 * Strict exact-match flagged thousands of false "Not an allowed option" warnings
 * per import: Yes/No columns are `yesNoBoolean`, so the importer stores real JS
 * booleans (true/false) which stringify to "true"/"false" — never matching
 * ["Yes","No"]; values also differ only by case/whitespace. Accept case-insensitive
 * matches and map boolean / 1-0 / y-n to a Yes/No option set. Pure validation
 * leniency — stored values and scoring are unchanged. (W-validate)
 */
function selectValueAllowed(v: unknown, options: ReadonlyArray<string | number>): boolean {
  let value: unknown = v;
  if (typeof value === "boolean") value = value ? "Yes" : "No";
  const sv = String(value).trim().toLowerCase();
  if (options.some((opt) => String(opt).trim().toLowerCase() === sv)) return true;
  const optSet = options.map((opt) => String(opt).trim().toLowerCase());
  if (optSet.includes("yes") && optSet.includes("no")) {
    if (["true", "yes", "y", "1"].includes(sv)) return true;
    if (["false", "no", "n", "0"].includes(sv)) return true;
  }
  // Accept common ESD/SED contribution-type shorthands as valid so they don't flag
  // (validation only — the stored value and scoring are untouched; the underlying
  // category vocabulary is an expert question, not a reason to block the import).
  const SELECT_SYNONYMS: Record<string, string> = {
    grant: "grant contribution",
    grants: "grant contribution",
    donation: "grant contribution",
    donations: "grant contribution",
    "early payment": "payment period reduction",
    "early payment discount": "payment period reduction",
  };
  const synonym = SELECT_SYNONYMS[sv];
  if (synonym && optSet.includes(synonym)) return true;
  return false;
}

function isBlank(v: unknown): boolean {

  return (

    v === "" ||

    v === undefined ||

    v === null ||

    (typeof v === "string" && v.trim() === "")

  );

}



function isRowEmpty(row: Record<string, unknown>, columns: ColumnDef[]): boolean {

  for (const c of columns) {

    const v = row[c.key];

    if (c.type === "boolean") {

      if (v === true) return false;

      continue;

    }

    if (v === undefined || v === null) continue;

    if (typeof v === "string" && v.trim() === "") continue;

    return false;

  }

  return true;

}



function validateMetaFields(

  section: Pick<SectionDef, "key" | "label" | "meta">,

  meta: Record<string, unknown>,

): WorkbookValidationIssue[] {

  const issues: WorkbookValidationIssue[] = [];

  const metaFields =
    section.key === "financial-information"
      ? filterVisibleFinancialMetaFields(section.meta ?? [], meta)
      : section.meta ?? [];

  for (const f of metaFields) {

    const v = meta[f.key];

    const blank = isBlank(v);

    if (f.required && blank) {

      issues.push({

        sectionKey: section.key,

        sectionLabel: section.label,

        field: f.key,

        message: `${f.label}: Required`,

      });

      continue;

    }

    if (f.validate) {

      const err = f.validate(v);

      if (err) {

        issues.push({

          sectionKey: section.key,

          sectionLabel: section.label,

          field: f.key,

          message: `${f.label}: ${err}`,

        });

      }

    }

  }

  return issues;

}



function validateGridRow(

  section: SectionDef,

  row: Record<string, unknown>,

  opts: { strictSelectOptions?: boolean } = {},

): Record<string, string> {

  const columns = section.columns!;

  const errors: Record<string, string> = {};

  const empty = isRowEmpty(row, columns);

  for (const col of columns) {

    const v = row[col.key];

    const blank = isBlank(v);

    if (!empty && col.required && blank) {

      errors[col.key] = "Required";

      continue;

    }

    if (

      opts.strictSelectOptions &&

      !blank &&

      col.type === "select" &&

      Array.isArray(col.options) &&

      col.options.length > 0

    ) {

      const allowed = selectValueAllowed(v, col.options);

      if (!allowed) {

        errors[col.key] = `Not an allowed option. Use one of: ${col.options.join(", ")}`;

        continue;

      }

    }

    if (col.validate) {

      const err = col.validate(v);

      if (err) errors[col.key] = err;

    }

  }

  if (!empty && section.rowValidate) {

    for (const [k, msg] of Object.entries(section.rowValidate(row))) {

      if (!errors[k]) errors[k] = msg;

    }

  }

  return errors;

}



function sectionHasSupplierSpend(sections: WorkbookSectionsInput): boolean {

  for (const key of ["procurement", "suppliers"]) {

    for (const row of sections[key]?.rows ?? []) {

      const spend = Number((row as Record<string, unknown>).spend);

      if (Number.isFinite(spend) && spend > 0) return true;

    }

  }

  return false;

}



function sectionHasNonEmptyRows(sections: WorkbookSectionsInput, key: string, sectorCode?: string): boolean {

  const section = getSection(key, sectorCode);

  if (!section?.columns) return false;

  for (const row of sections[key]?.rows ?? []) {

    if (!isRowEmpty(row as Record<string, unknown>, section.columns)) return true;

  }

  return false;

}



function finMetaNumber(meta: Record<string, unknown>, key: string): number | null {

  const n = Number(meta[key]);

  return Number.isFinite(n) ? n : null;

}



function hasLeviableAmount(meta: Record<string, unknown>): boolean {

  // Leviable Amount is always derived as payroll × 1%, so we only need payroll > 0.

  const n = finMetaNumber(meta, "payroll");

  return n !== null && n > 0;

}



function hasNpat(meta: Record<string, unknown>): boolean {

  for (const key of ["npat", "deemedNpatOverride"]) {

    // Skip blank values — Number("") === 0 is finite but not a user-entered value.

    if (isBlank(meta[key])) continue;

    const n = finMetaNumber(meta, key);

    if (n !== null) return true;

  }

  return false;

}



function resolveTmpsForValidation(finMeta: Record<string, unknown>): number {

  const basis = String(finMeta.tmpsBasis ?? "").trim().toLowerCase();

  const projected = finMetaNumber(finMeta, "forecastTmps") ?? 0;

  const actual = finMetaNumber(finMeta, "tmps") ?? 0;

  if (basis === "projected" && projected > 0) return projected;

  return actual > 0 ? actual : projected;

}



export function validateScorecardTypeForSector(

  sectorCode: string,

  scorecardType: unknown,

): string | null {

  if (isBlank(sectorCode)) return null;

  if (isBlank(scorecardType)) return "Required when sector is set";

  const allowed = getScorecardTypeOptions(String(sectorCode));

  const value = String(scorecardType).trim();

  if (!allowed.some((opt) => opt.toLowerCase() === value.toLowerCase())) {

    return `Use one of: ${allowed.join(", ")} for ${String(sectorCode).toUpperCase()}`;

  }

  return null;

}



function validateOwnershipVotingRights(

  sections: WorkbookSectionsInput,

  sectorCode?: string,

): WorkbookValidationIssue[] {

  const section = getSection("ownership", sectorCode);

  if (!section?.columns) return [];



  let total = 0;

  let hasAny = false;

  for (const row of sections["ownership"]?.rows ?? []) {

    if (isRowEmpty(row as Record<string, unknown>, section.columns)) continue;

    const voting = Number((row as Record<string, unknown>).votingRights);

    if (Number.isFinite(voting) && voting > 0) {

      total += voting;

      hasAny = true;

    }

  }

  if (!hasAny || total <= 100) return [];

  return [

    {

      sectionKey: "ownership",

      sectionLabel: section.label,

      field: "votingRights",

      message: `Total voting rights (${total.toFixed(1)}%) must not exceed 100%`,

    },

  ];

}



/**

 * Validates all enabled workbook sections (meta forms + grid rows).

 * Uses sector-aware section definitions via getSection(key, sectorCode).

 */

export function validateWorkbook(

  sections: WorkbookSectionsInput,

  opts: { strictSelectOptions?: boolean } = {},

): WorkbookValidationIssue[] {

  const issues: WorkbookValidationIssue[] = [];



  const companyMeta = (sections["company-information"]?.meta ?? {}) as Record<string, unknown>;

  const sectorCode = String(companyMeta.industrySector ?? "").trim();
  const scorecardType = String(companyMeta.scorecardType ?? "").trim();
  const fscSubSector = String(companyMeta.fscSubSector ?? "").trim();
  const fscReinsurer = coerceYesNo(companyMeta.fscReinsurer);



  // Company information — sector-specific meta (FSC sub-sector, AGRI farm workers, etc.)

  const companyFields = getCompanyInfoMetaFields(sectorCode);

  issues.push(

    ...validateMetaFields(

      { key: "company-information", label: "Company Information", meta: companyFields },

      companyMeta,

    ),

  );



  const sectionKeys = getOrderedSectionKeysForSector(sectorCode, fscSubSector);

  for (const key of sectionKeys) {

    if (key === "company-information") continue;

    const section = getSection(key, sectorCode, scorecardType, fscSubSector, fscReinsurer);

    if (!section?.enabled) continue;

    const data = sections[key];

    if (!data) continue;



    if (section.meta) {

      const meta = (data.meta ?? {}) as Record<string, unknown>;

      issues.push(...validateMetaFields(section, meta));

      if (key === "financial-information") {

        for (const [field, message] of Object.entries(validateFinancialMetaCrossFields(meta))) {

          issues.push({

            sectionKey: section.key,

            sectionLabel: section.label,

            field,

            message,

          });

        }

      }

      if (!section.columns) continue;

    }



    if (!section.columns) continue;

    for (const row of data.rows ?? []) {

      const errs = validateGridRow(section, row, opts);

      const rowId = String((row as Record<string, unknown>)._id ?? "");

      for (const [field, message] of Object.entries(errs)) {

        issues.push({

          sectionKey: section.key,

          sectionLabel: section.label,

          rowId: rowId || undefined,

          field,

          message,

        });

      }

    }

  }



  const finMeta = (sections["financial-information"]?.meta ?? {}) as Record<string, unknown>;



  const scorecardErr = validateScorecardTypeForSector(

    sectorCode,

    companyMeta.scorecardType,

  );

  if (scorecardErr) {

    issues.push({

      sectionKey: "company-information",

      sectionLabel: "Company Information",

      field: "scorecardType",

      message: `Scorecard Type: ${scorecardErr}`,

    });

  }

  if (sectorCode === "FSC" && fscSubSectorHasAfs(fscSubSector)) {
    const afsMeta = (sections["afs-additions"]?.meta ?? {}) as Record<string, unknown>;
    const legacyFinAfs = Object.keys(afsMeta).length === 0
      ? (sections["financial-information"]?.meta ?? {}) as Record<string, unknown>
      : {};
    const combined = Object.keys(afsMeta).length > 0 ? afsMeta : legacyFinAfs;
    const hasAfsData = Object.entries(combined).some(([k, v]) => {
      if (!k.startsWith("afs")) return false;
      return v !== "" && v != null;
    });
    if (!hasAfsData) {
      issues.push({
        sectionKey: "afs-additions",
        sectionLabel: "AFS Additions",
        message: "AFS Additions inputs are required for the selected FSC sub-sector",
      });
    }
  }



  if (sectionHasSupplierSpend(sections)) {

    const tmps = resolveTmpsForValidation(finMeta);

    if (!Number.isFinite(tmps) || tmps <= 0) {

      issues.push({

        sectionKey: "financial-information",

        sectionLabel: "Financial Information",

        field: "tmps",

        message:

          "Total Measured Procurement Spend (TMPS) is required when supplier/procurement rows have spend",

      });

    }

  }



  if (sectionHasNonEmptyRows(sections, "skills-development", sectorCode)) {

    if (!hasLeviableAmount(finMeta)) {

      issues.push({

        sectionKey: "financial-information",

        sectionLabel: "Financial Information",

        field: "payroll",

        message:

          "Total Payroll is required when skills development rows are present (Leviable Amount is derived as 1% of Payroll)",

      });

    }

  }



  const needsNpat =

    sectionHasNonEmptyRows(sections, "esd", sectorCode) ||

    sectionHasNonEmptyRows(sections, "sed", sectorCode);

  if (needsNpat && !hasNpat(finMeta)) {

    issues.push({

      sectionKey: "financial-information",

      sectionLabel: "Financial Information",

      field: "npat",

      message: "NPAT is required when ESD or SED rows are present",

    });

  }



  issues.push(...validateOwnershipVotingRights(sections, sectorCode));



  return issues;

}



function buildRowIndexLookup(sections: WorkbookSectionsInput): Map<string, number> {

  const lookup = new Map<string, number>();

  for (const [sectionKey, data] of Object.entries(sections)) {

    for (let i = 0; i < (data.rows?.length ?? 0); i++) {

      const rowId = String((data.rows![i] as Record<string, unknown>)._id ?? "");

      if (rowId) lookup.set(`${sectionKey}:${rowId}`, i + 1);

    }

  }

  return lookup;

}



function resolveFieldLabel(

  sectionKey: string,

  field: string | undefined,

  sectorCode?: string,

  scorecardType?: string,

): string | undefined {

  if (!field) return undefined;

  const section = getSection(sectionKey, sectorCode, scorecardType);

  const fromColumn = section?.columns?.find((c) => c.key === field)?.label;

  if (fromColumn) return fromColumn.replace(/\*+$/, "").trim();

  const fromMeta = section?.meta?.find((f) => f.key === field)?.label;

  if (fromMeta) return fromMeta.replace(/\*+$/, "").trim();

  if (sectionKey === "company-information") {

    const fromCompany = getCompanyInfoMetaFields(sectorCode ?? "").find((f) => f.key === field)?.label;

    if (fromCompany) return fromCompany.replace(/\*+$/, "").trim();

  }

  return field;

}



/**

 * Cross-pillar validation rollup with per-section grouping and 1-based row

 * numbers so large workbooks (1000+ line items) can locate every issue.

 */

export function aggregateWorkbookValidation(

  sections: WorkbookSectionsInput,

  opts: { strictSelectOptions?: boolean } = {},

): WorkbookValidationAggregate {

  const companyMeta = (sections["company-information"]?.meta ?? {}) as Record<string, unknown>;

  const sectorCode = String(companyMeta.industrySector ?? "").trim();

  const scorecardType = String(companyMeta.scorecardType ?? "").trim();

  const issues = validateWorkbook(sections, opts);

  const rowLookup = buildRowIndexLookup(sections);

  const enriched: WorkbookValidationRowIssue[] = issues.map((issue) => {

    const rowNumber =

      issue.rowId != null

        ? rowLookup.get(`${issue.sectionKey}:${issue.rowId}`)

        : undefined;

    return {

      ...issue,

      rowNumber,

      fieldLabel: resolveFieldLabel(issue.sectionKey, issue.field, sectorCode, scorecardType),

    };

  });



  const bySection = new Map<string, WorkbookValidationSectionSummary>();

  for (const issue of enriched) {

    const existing = bySection.get(issue.sectionKey);

    if (existing) {

      existing.issues.push(issue);

      existing.issueCount++;

    } else {

      bySection.set(issue.sectionKey, {

        sectionKey: issue.sectionKey,

        sectionLabel: issue.sectionLabel,

        issues: [issue],

        issueCount: 1,

      });

    }

  }



  const sectionOrder = getOrderedSectionKeysForSector(sectorCode);

  const sectionsSummary = [

    ...sectionOrder

      .map((key) => bySection.get(key))

      .filter((s): s is WorkbookValidationSectionSummary => Boolean(s)),

    ...[...bySection.values()].filter((s) => !sectionOrder.includes(s.sectionKey)),

  ];



  const criticalCount = issues.filter(isCriticalWorkbookIssue).length;

  return {

    totalIssues: issues.length,

    criticalCount,

    advisoryCount: issues.length - criticalCount,

    sections: sectionsSummary,

  };

}



export function formatValidationIssueLine(issue: WorkbookValidationRowIssue): string {

  if (issue.rowNumber != null) {

    const field = issue.fieldLabel ?? issue.field ?? "Field";

    return `Row ${issue.rowNumber} · ${field}: ${issue.message}`;

  }

  if (issue.fieldLabel) {

    return `${issue.fieldLabel}: ${issue.message}`;

  }

  return issue.message;

}



/** Issues that block accurate scoring identity — company profile only. Pillar/financial gaps are advisory. */

export function isCriticalWorkbookIssue(issue: WorkbookValidationIssue): boolean {

  if (issue.sectionKey === "company-information") {

    if (

      issue.field === "companyName" ||

      issue.field === "industrySector" ||

      issue.field === "scorecardType" ||

      issue.field === "fscSubSector"

    ) {

      return true;

    }

    if (issue.message.toLowerCase().includes("required")) return true;

    if (issue.message.toLowerCase().includes("scorecard type")) return true;

  }

  if (issue.sectionKey === "afs-additions") {

    return true;

  }

  return false;

}



/**

 * Minimum validation for submit: compulsory client + financial meta only.

 * Pillar grid row completeness is advisory — empty pillars score as zero.

 */

export function validateWorkbookForSubmit(

  sections: WorkbookSectionsInput,

): WorkbookValidationIssue[] {

  return validateWorkbook(sections).filter(isCriticalWorkbookIssue);

}



export function formatWorkbookValidationSummary(

  issues: WorkbookValidationIssue[],

  max = 5,

): string {

  const lines = issues.slice(0, max).map((i) => {

    const rowIssue = i as WorkbookValidationRowIssue;

    if (rowIssue.rowNumber != null) {

      return formatValidationIssueLine(rowIssue);

    }

    const where = i.rowId

      ? `${i.sectionLabel} (row): ${i.message}`

      : `${i.sectionLabel}: ${i.message}`;

    return where;

  });

  if (issues.length > max) {

    lines.push(`…and ${issues.length - max} more issue(s)`);

  }

  return lines.join("; ");

}

