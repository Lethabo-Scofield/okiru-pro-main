import {
  SECTIONS,
  getScorecardTypeOptions,
  type ColumnDef,
  type SectionDef,
} from "./sections";

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

export type WorkbookSectionsInput = Record<
  string,
  { rows?: Array<Record<string, unknown>>; meta?: Record<string, unknown> }
>;

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
  section: SectionDef,
  meta: Record<string, unknown>,
): WorkbookValidationIssue[] {
  const issues: WorkbookValidationIssue[] = [];
  for (const f of section.meta ?? []) {
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

function sectionHasNonEmptyRows(sections: WorkbookSectionsInput, key: string): boolean {
  const section = SECTIONS.find((s) => s.key === key);
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
  for (const key of ["forecastPayroll", "leviableAmount", "payroll"]) {
    const n = finMetaNumber(meta, key);
    if (n !== null && n > 0) return true;
  }
  return false;
}

function hasNpat(meta: Record<string, unknown>): boolean {
  for (const key of ["forecastNpat", "npat"]) {
    const n = finMetaNumber(meta, key);
    if (n !== null) return true;
  }
  return false;
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

function validateOwnershipVotingRights(sections: WorkbookSectionsInput): WorkbookValidationIssue[] {
  const section = SECTIONS.find((s) => s.key === "ownership");
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
      sectionLabel: "Ownership",
      field: "votingRights",
      message: `Total voting rights (${total.toFixed(1)}%) must not exceed 100%`,
    },
  ];
}

/**
 * Validates all enabled workbook sections (meta forms + grid rows).
 * Mirrors SpreadsheetGrid / MetaForm rules for submit-time enforcement.
 */
export function validateWorkbook(
  sections: WorkbookSectionsInput,
): WorkbookValidationIssue[] {
  const issues: WorkbookValidationIssue[] = [];

  for (const section of SECTIONS) {
    if (!section.enabled) continue;
    const data = sections[section.key];
    if (!data) continue;

    if (section.meta) {
      issues.push(
        ...validateMetaFields(section, (data.meta ?? {}) as Record<string, unknown>),
      );
      continue;
    }

    if (!section.columns) continue;
    for (const row of data.rows ?? []) {
      const errs = validateGridRow(section, row);
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

  const companyMeta = (sections["company-information"]?.meta ?? {}) as Record<string, unknown>;
  const finMeta = (sections["financial-information"]?.meta ?? {}) as Record<string, unknown>;
  const sectorCode = String(companyMeta.industrySector ?? "").trim();

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

  // Scoring needs TMPS when supplier spend rows exist.
  if (sectionHasSupplierSpend(sections)) {
    const tmps = Number(finMeta.tmps);
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

  if (sectionHasNonEmptyRows(sections, "skills-development") && !hasLeviableAmount(finMeta)) {
    issues.push({
      sectionKey: "financial-information",
      sectionLabel: "Financial Information",
      field: "forecastPayroll",
      message:
        "Forecast payroll (or leviable amount) is required when skills development rows are present",
    });
  }

  const needsNpat =
    sectionHasNonEmptyRows(sections, "esd") ||
    sectionHasNonEmptyRows(sections, "sed");
  if (needsNpat && !hasNpat(finMeta)) {
    issues.push({
      sectionKey: "financial-information",
      sectionLabel: "Financial Information",
      field: "forecastNpat",
      message: "Forecast NPAT is required when ESD or SED rows are present",
    });
  }

  issues.push(...validateOwnershipVotingRights(sections));

  return issues;
}

export function formatWorkbookValidationSummary(
  issues: WorkbookValidationIssue[],
  max = 5,
): string {
  const lines = issues.slice(0, max).map((i) => {
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
