import {
  SECTIONS,
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

  // Scoring needs TMPS when supplier spend rows exist.
  if (sectionHasSupplierSpend(sections)) {
    const fin = (sections["financial-information"]?.meta ?? {}) as Record<string, unknown>;
    const tmps = Number(fin.tmps);
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
