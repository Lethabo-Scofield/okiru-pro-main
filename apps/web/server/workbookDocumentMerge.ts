/**
 * Adding documents to a workbook that already exists.
 *
 * The document flow used to be able to CREATE a B-BBEE workbook and nothing
 * else: a document that arrived after the company was set up had no way in,
 * and the only bulk door — the import route — replaces each section it is
 * given wholesale. Running a single late payroll through that would have
 * wiped every row typed or uploaded since.
 *
 * So documents added later MERGE:
 *   - a blank meta field takes the document's value; a filled one keeps its
 *     value, and a disagreement is reported rather than overwritten;
 *   - a register row that is already there (same ID number, same supplier
 *     registration, same name — see IDENTITY) gets only its EMPTY cells
 *     filled; a new row is added;
 *   - nothing is ever deleted.
 *
 * What was typed in the workbook always outranks what a document says: the
 * user may have typed it precisely because the document was wrong.
 */

export type WorkbookRow = Record<string, unknown>;
export interface WorkbookSectionLike {
  rows?: WorkbookRow[];
  meta?: Record<string, unknown>;
}

/** "Same record" per section — narrow on purpose (see registerReconcile.ts for why). */
const IDENTITY: Record<string, string[][]> = {
  ownership: [["idNumber"], ["shareholderName"]],
  "management-control": [["idNumber"], ["name", "surname"]],
  employees: [["idNumber"], ["name", "surname"]],
  "skills-development": [["idNumber", "programName"], ["learnerName", "programName"]],
  procurement: [["registrationNumber"], ["vatNumber"], ["supplierName"]],
  suppliers: [["registrationNumber"], ["vatNumber"], ["supplierName"]],
  esd: [["supplierName", "contributionType", "amount"]],
  sed: [["beneficiaryName", "contributionType", "amount"]],
};

function blank(value: unknown): boolean {
  return value == null || (typeof value === "string" && value.trim() === "") || (Array.isArray(value) && value.length === 0);
}

function norm(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\b(pty|ltd|\(pty\)|proprietary|limited)\b\.?/g, "")
    .replace(/[^a-z0-9%.]/g, "");
}

function signature(section: string, row: WorkbookRow): string | null {
  for (const fields of IDENTITY[section] ?? []) {
    const parts = fields.map((f) => norm(row[f]));
    if (parts.every(Boolean)) return `${fields.join("+")}=${parts.join("|")}`;
  }
  return null;
}

export interface MergeConflict {
  section: string;
  field: string;
  kept: unknown;
  offered: unknown;
  /** Which row, in words ("Thandi Dlamini"), when it is a register row. */
  row?: string;
}

export interface MergeReport {
  /** Rows added, per section. */
  added: Record<string, number>;
  /** Blank cells/fields that took a document's value. */
  filled: number;
  /** Where the document disagreed with what was already there — the existing value was kept. */
  conflicts: MergeConflict[];
  /** Sections this caller may not write; left untouched. */
  blocked: string[];
}

function rowLabel(row: WorkbookRow): string {
  const name = [row.name, row.surname].filter((v) => !blank(v)).join(" ");
  return String(name || row.shareholderName || row.supplierName || row.beneficiaryName || row.learnerName || row.idNumber || "a row");
}

function same(a: unknown, b: unknown): boolean {
  const na = typeof a === "number" || typeof b === "number" ? String(Number(a)) : norm(a);
  const nb = typeof a === "number" || typeof b === "number" ? String(Number(b)) : norm(b);
  return na === nb;
}

/**
 * Fold `incoming` into `existing`. Returns ONLY the sections that changed, so
 * the caller writes nothing it did not have to.
 */
export function mergeDocumentSections(
  existing: Record<string, WorkbookSectionLike | undefined>,
  incoming: Record<string, WorkbookSectionLike | undefined>,
  canWrite: (section: string) => boolean = () => true,
): { changed: Record<string, WorkbookSectionLike>; report: MergeReport } {
  const changed: Record<string, WorkbookSectionLike> = {};
  const report: MergeReport = { added: {}, filled: 0, conflicts: [], blocked: [] };

  for (const [key, inSection] of Object.entries(incoming)) {
    if (!inSection) continue;
    const hasContent = (inSection.rows?.length ?? 0) > 0 || Object.values(inSection.meta ?? {}).some((v) => !blank(v));
    if (!hasContent) continue;
    if (!canWrite(key)) {
      report.blocked.push(key);
      continue;
    }

    const current = existing[key] ?? {};
    const meta: Record<string, unknown> = { ...(current.meta ?? {}) };
    const rows: WorkbookRow[] = (current.rows ?? []).map((r) => ({ ...r }));
    let touched = false;

    for (const [field, offered] of Object.entries(inSection.meta ?? {})) {
      if (blank(offered)) continue;
      if (blank(meta[field])) {
        meta[field] = offered;
        report.filled += 1;
        touched = true;
      } else if (!field.startsWith("_") && !same(meta[field], offered)) {
        report.conflicts.push({ section: key, field, kept: meta[field], offered });
      }
    }

    const bySignature = new Map<string, WorkbookRow>();
    for (const row of rows) {
      const sig = signature(key, row);
      if (sig) bySignature.set(sig, row);
    }
    for (const offeredRow of inSection.rows ?? []) {
      const sig = signature(key, offeredRow);
      const match = sig ? bySignature.get(sig) : undefined;
      if (!match) {
        rows.push({ ...offeredRow });
        if (sig) bySignature.set(sig, rows[rows.length - 1]);
        report.added[key] = (report.added[key] ?? 0) + 1;
        touched = true;
        continue;
      }
      for (const [field, value] of Object.entries(offeredRow)) {
        if (field === "_id" || blank(value)) continue;
        if (field === "_sourceFiles") {
          const merged = Array.from(new Set([...((match._sourceFiles as unknown[]) ?? []), ...(value as unknown[])]));
          if (merged.length !== ((match._sourceFiles as unknown[]) ?? []).length) {
            match._sourceFiles = merged;
            touched = true;
          }
          continue;
        }
        if (field.startsWith("_")) continue;
        if (blank(match[field])) {
          match[field] = value;
          report.filled += 1;
          touched = true;
        } else if (!same(match[field], value)) {
          report.conflicts.push({ section: key, field, kept: match[field], offered: value, row: rowLabel(match) });
        }
      }
    }

    if (touched) {
      changed[key] = {
        ...current,
        rows,
        ...(Object.keys(meta).length ? { meta } : {}),
      };
    }
  }
  return { changed, report };
}
