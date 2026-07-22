/**
 * Merge several workbooks into one scorecard.
 *
 * WHY: a B-BBEE submission is not one file. Measured on the real Thandanani
 * pack, the main "BEE Information Gathering File" has its Procurement and Social
 * Development sheets completely EMPTY — every detail row reads `0 | 0`, and the
 * sheets' own summary cells say 0. The actual evidence lives in separate
 * workbooks the client filled in alongside it:
 *
 *   BEE Information Gathering File.xlsm      ownership + management control
 *   Preferential Procurement_FY2025.xlsm     23 populated supplier rows
 *   SED Info Gathering_FY2024.xlsm           77 populated contribution rows
 *
 * Importing any ONE of them scores a fraction of the truth. The verification
 * agency read all of them; so must we.
 *
 * THE MERGE RULE — evidence is ADDITIVE, never overwritten:
 *
 *  - Grid sections (suppliers, employees, contributions) CONCATENATE. Two files
 *    listing different suppliers means more suppliers, not a choice between
 *    them. Rows that are entirely blank are dropped, since an unfilled template
 *    contributes 1,991 empty rows that would otherwise drown the real 23.
 *  - Meta sections (financials, company info) take the FIRST non-empty value per
 *    field, and record a conflict when a later file disagrees. Silently picking
 *    one revenue figure over another is how a wrong score gets certified.
 *  - Duplicate rows are collapsed on their identifying content, so re-uploading
 *    the same file twice does not double a supplier's spend.
 *
 * Nothing here invents a value. It only combines what the files actually say and
 * reports where they disagree.
 */
import type {
  ExcelImportResult,
  WorkbookRow,
  WorkbookSectionPayload,
  WorkbookSectionsInput,
} from "./workbookExcelNormalizer";

export interface MergeConflict {
  section: string;
  field: string;
  /** value → the files that assert it. */
  values: Array<{ value: unknown; sources: string[] }>;
}

export interface MergedWorkbook {
  sections: WorkbookSectionsInput;
  /** Per-file contribution, so a user can see which upload supplied what. */
  contributions: Array<{ filename: string; section: string; rows: number }>;
  /** Fields where two files disagree. Held for review, never auto-resolved. */
  conflicts: MergeConflict[];
  warnings: string[];
}

export interface NamedImport {
  filename: string;
  result: Pick<ExcelImportResult, "sections">;
}

/** Fields that only ever identify a row, never carry evidence. */
const NON_EVIDENCE_KEYS = new Set(["_id"]);

/** True when a row carries no actual data — an unfilled template line. */
export function isBlankRow(row: WorkbookRow): boolean {
  return !Object.entries(row).some(([key, value]) => {
    if (NON_EVIDENCE_KEYS.has(key)) return false;
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim() !== "" && value.trim() !== "0";
    if (typeof value === "number") return value !== 0;
    if (typeof value === "boolean") return value;
    return true;
  });
}

/** Identity of a row by its evidence, so the same row from two files collapses. */
function rowFingerprint(row: WorkbookRow): string {
  const entries = Object.entries(row)
    .filter(([key]) => !NON_EVIDENCE_KEYS.has(key))
    .map(([key, value]) => `${key}=${String(value ?? "").trim().toLowerCase()}`)
    .sort();
  return entries.join("|");
}

function isEmptyMetaValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  return false;
}

/**
 * Merge normalised workbooks in the order given. Earlier files win on meta
 * conflicts (the caller should pass the primary gathering file first), and every
 * disagreement is reported rather than resolved.
 */
export function mergeWorkbooks(imports: NamedImport[]): MergedWorkbook {
  const sections: WorkbookSectionsInput = {};
  const contributions: MergedWorkbook["contributions"] = [];
  const conflicts: MergeConflict[] = [];
  const warnings: string[] = [];

  // section → field → value → files asserting it
  const metaClaims = new Map<string, Map<string, Map<string, { value: unknown; sources: string[] }>>>();
  // section → fingerprint, to collapse duplicates across files
  const seenRows = new Map<string, Set<string>>();

  for (const { filename, result } of imports) {
    for (const [sectionKey, payload] of Object.entries(result.sections ?? {})) {
      const target: WorkbookSectionPayload = sections[sectionKey] ?? { rows: [] };

      // ── Grid rows: additive ──
      const incoming = (payload.rows ?? []).filter((row) => !isBlankRow(row));
      const fingerprints = seenRows.get(sectionKey) ?? new Set<string>();
      let added = 0;
      for (const row of incoming) {
        const fingerprint = rowFingerprint(row);
        if (fingerprints.has(fingerprint)) continue;
        fingerprints.add(fingerprint);
        target.rows.push(row);
        added += 1;
      }
      seenRows.set(sectionKey, fingerprints);
      if (added > 0) contributions.push({ filename, section: sectionKey, rows: added });

      // ── Meta: first non-empty wins, disagreements recorded ──
      if (payload.meta) {
        const bySection = metaClaims.get(sectionKey) ?? new Map();
        for (const [field, value] of Object.entries(payload.meta)) {
          if (isEmptyMetaValue(value)) continue;
          const byField = bySection.get(field) ?? new Map();
          const key = String(value).trim().toLowerCase();
          const existing = byField.get(key);
          if (existing) existing.sources.push(filename);
          else byField.set(key, { value, sources: [filename] });
          bySection.set(field, byField);
        }
        metaClaims.set(sectionKey, bySection);
      }

      sections[sectionKey] = target;
    }
  }

  // Resolve meta: take the first claim, flag anything contested.
  for (const [sectionKey, byField] of Array.from(metaClaims.entries())) {
    const target = sections[sectionKey] ?? { rows: [] };
    const meta: Record<string, unknown> = { ...(target.meta ?? {}) };

    for (const [field, byValue] of Array.from(byField.entries())) {
      const claims: Array<{ value: unknown; sources: string[] }> = Array.from(byValue.values());
      meta[field] = claims[0].value;
      if (claims.length > 1) {
        conflicts.push({ section: sectionKey, field, values: claims });
      }
    }

    target.meta = meta;
    sections[sectionKey] = target;
  }

  if (conflicts.length > 0) {
    warnings.push(
      `${conflicts.length} field(s) differ between the uploaded files and need a decision `
      + `before the score is final.`,
    );
  }

  return { sections, contributions, conflicts, warnings };
}

/** Human-readable summary of what each file contributed. */
export function summariseContributions(merged: MergedWorkbook): string[] {
  const byFile = new Map<string, number>();
  for (const contribution of merged.contributions) {
    byFile.set(contribution.filename, (byFile.get(contribution.filename) ?? 0) + contribution.rows);
  }
  return Array.from(byFile.entries()).map(([filename, rows]) => `${filename}: ${rows} rows`);
}
