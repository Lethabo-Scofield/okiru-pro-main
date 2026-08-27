/**
 * What an ESG spreadsheet import is actually about to DO to a workbook.
 *
 * WHY THIS EXISTS
 *
 * The import preview said "4 section(s) will be updated, 812 cells" and nothing
 * else. That sentence is true and almost useless: it cannot tell you that 300 of
 * those cells will REPLACE figures already in the workbook, that the file covers
 * four of fifteen sections so the other eleven are untouched, that a register
 * lists the same vehicle twice, or that the result will fail a rule the workbook
 * currently passes. A user confirming that dialog is agreeing to something
 * nobody has described.
 *
 * The document route already answers those questions — `EsgExtractionSummary`
 * shows what was read, what was placed and what conflicts. The spreadsheet route
 * is the SAME decision with better information available (we hold both sides of
 * every cell), and it was the one asking for blind consent.
 *
 * WHAT THIS IS NOT
 *
 * It is not a gate. Nothing here refuses an import; a partial upload is the
 * normal case — most clients send one register at a time — and an overwrite is
 * usually the point. This exists so the confirmation means something, which is
 * why every finding carries the BEFORE value as well as the after: "Fleet
 * monthly km: 1,240 → 1,310" is a decision, "300 cells changed" is not.
 *
 * Pure and synchronous by design: it takes the parsed preview and the workbook
 * as they already exist in memory, so both doors (the create flow's Excel option
 * and the in-workbook Import / bulk upload) can render the same panel without a
 * round trip, and it can be tested without either.
 */
import { ESG_INPUT_SECTIONS } from "./esgSections";
import type { EsgImportPreview } from "./esgWorkbookImport";
import { validateEsgWorkbook, type EsgValidationIssue } from "./esgValidation";
import type { EsgWorkbookData } from "./esgWorkbookStorage";

/** The workbook we compare against. `EsgWorkbookData` satisfies this. */
export interface EsgWorkbookLike {
  sections?: Record<string, { cells?: Record<string, unknown> } | undefined>;
}

/** Cell values the workbook type allows. */
type EsgCellValue = string | number | boolean | null;

/** One cell the import will change, with both sides of the change. */
export interface EsgCellChange {
  sectionId: string;
  cell: string;
  /** What the workbook holds now. `null` when the cell is empty. */
  before: unknown;
  /** What the import would write. */
  after: unknown;
}

/** A value repeated inside the IMPORT itself — usually a double-pasted row. */
export interface EsgImportDuplicate {
  sectionId: string;
  /** The repeated value, as text. */
  value: string;
  /** Cells carrying it, in sheet order. */
  cells: string[];
}

export interface EsgImportAnalysis {
  /** Cells that will replace an existing, DIFFERENT value. The consent question. */
  overwrites: EsgCellChange[];
  /** Cells that are empty today and will be filled. */
  additions: EsgCellChange[];
  /** Cells whose incoming value equals what is already there — a no-op. */
  unchanged: number;
  /** Sections the file carries. */
  sectionsCovered: string[];
  /** Input sections it does NOT carry — what this upload leaves alone. */
  sectionsUntouched: string[];
  /** True when the file covers only part of the workbook, which is normal. */
  isPartial: boolean;
  /** Repeated identifiers inside the import. */
  duplicates: EsgImportDuplicate[];
  /**
   * Rules the workbook passes NOW but would fail after the import.
   *
   * Only regressions are listed. A workbook that already fails a rule the import
   * does not touch is a pre-existing gap, and reporting it here would blame the
   * upload for it.
   */
  newIssues: EsgValidationIssue[];
  /** Rules the import FIXES — worth saying, it is the reason to confirm. */
  resolvedIssues: EsgValidationIssue[];
  /** Sheets in the file that matched no section, carried through from the parse. */
  unmatchedSheets: string[];
  /** Parse warnings, carried through. */
  warnings: string[];
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

/** Same-value test that does not care about "1200" vs 1200 or trailing spaces. */
function sameValue(a: unknown, b: unknown): boolean {
  if (isEmpty(a) && isEmpty(b)) return true;
  if (isEmpty(a) || isEmpty(b)) return false;
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  return String(a).trim() === String(b).trim();
}

/**
 * Values worth checking for repetition.
 *
 * Numbers repeat legitimately all over a workbook — three depots can each use
 * 35 kL of water — so only text that looks like an IDENTIFIER is considered. A
 * registration, a name or a code repeated in one section is a double-paste; the
 * number 0 appearing 40 times is a workbook.
 */
function identifierLike(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text.length < 4) return null;
  if (Number.isFinite(Number(text))) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return null; // a date is not an identifier
  return text;
}

/**
 * The workbook as it WOULD be after the import — the only way to ask the rules
 * what this upload changes rather than what the workbook already lacked.
 */
function mergedWorkbook(
  current: EsgWorkbookLike | null,
  preview: EsgImportPreview,
): EsgWorkbookData {
  const sections: Record<string, { cells: Record<string, EsgCellValue> }> = {};
  const put = (id: string, cells: Record<string, unknown>) => {
    const target = sections[id] ?? { cells: {} };
    for (const [cell, value] of Object.entries(cells)) {
      target.cells[cell] = value as EsgCellValue;
    }
    sections[id] = target;
  };
  for (const [id, section] of Object.entries(current?.sections ?? {})) put(id, section?.cells ?? {});
  for (const [id, section] of Object.entries(preview.sections)) put(id, section?.cells ?? {});
  return {
    companyId: "",
    sections,
    updatedAt: new Date(0).toISOString(),
  } as EsgWorkbookData;
}

/** `current` in the shape the rules expect, without inventing data. */
function asWorkbookData(current: EsgWorkbookLike | null): EsgWorkbookData | null {
  if (!current) return null;
  const sections: Record<string, { cells: Record<string, EsgCellValue> }> = {};
  for (const [id, section] of Object.entries(current.sections ?? {})) {
    sections[id] = { cells: { ...(section?.cells ?? {}) } as Record<string, EsgCellValue> };
  }
  return { companyId: "", sections, updatedAt: new Date(0).toISOString() } as EsgWorkbookData;
}

/**
 * Compare an import against the workbook it is destined for.
 *
 * `current` is null on the create flow, where there is no workbook yet — every
 * cell is then an addition and nothing can be overwritten, which is exactly
 * what the panel should say.
 */
export function analyseEsgImport(
  preview: EsgImportPreview,
  current: EsgWorkbookLike | null,
): EsgImportAnalysis {
  const overwrites: EsgCellChange[] = [];
  const additions: EsgCellChange[] = [];
  let unchanged = 0;

  for (const [sectionId, section] of Object.entries(preview.sections)) {
    const existing = current?.sections?.[sectionId]?.cells ?? {};
    for (const [cell, after] of Object.entries(section?.cells ?? {})) {
      if (isEmpty(after)) continue; // an import never blanks a cell
      const before = existing[cell];
      if (sameValue(before, after)) {
        unchanged += 1;
      } else if (isEmpty(before)) {
        additions.push({ sectionId, cell, before: null, after });
      } else {
        overwrites.push({ sectionId, cell, before, after });
      }
    }
  }

  // Duplicates WITHIN the import, per section.
  const duplicates: EsgImportDuplicate[] = [];
  for (const [sectionId, section] of Object.entries(preview.sections)) {
    const seen = new Map<string, string[]>();
    for (const [cell, value] of Object.entries(section?.cells ?? {})) {
      const id = identifierLike(value);
      if (!id) continue;
      const key = id.toLowerCase();
      const cells = seen.get(key) ?? [];
      cells.push(cell);
      seen.set(key, cells);
    }
    // Array.from: this project's tsconfig targets below ES2015 for iteration,
    // so spreading or for-of-ing a Map directly is a compile error here.
    for (const [key, cells] of Array.from(seen.entries())) {
      if (cells.length < 2) continue;
      const first = section?.cells?.[cells[0]];
      duplicates.push({ sectionId, value: String(first ?? key), cells });
    }
  }

  const sectionsCovered = Object.keys(preview.sections);
  const inputSectionIds = ESG_INPUT_SECTIONS.map((s) => s.id);
  const sectionsUntouched = inputSectionIds.filter((id) => !sectionsCovered.includes(id));

  // Validation is a BEFORE/AFTER diff so the panel can say what this upload
  // changes rather than restating every gap the workbook already had.
  const before = validateEsgWorkbook(asWorkbookData(current), undefined, "live");
  const after = validateEsgWorkbook(mergedWorkbook(current, preview), undefined, "live");
  const failingBefore = new Set(before.filter((i) => !i.pass).map((i) => i.id));
  const failingAfter = new Set(after.filter((i) => !i.pass).map((i) => i.id));

  const newIssues = after.filter((i) => !i.pass && !failingBefore.has(i.id));
  const resolvedIssues = before.filter((i) => !i.pass && !failingAfter.has(i.id));

  return {
    overwrites,
    additions,
    unchanged,
    sectionsCovered,
    sectionsUntouched,
    isPartial: sectionsUntouched.length > 0,
    duplicates,
    newIssues,
    resolvedIssues,
    unmatchedSheets: preview.unmatchedSheets ?? [],
    warnings: preview.warnings ?? [],
  };
}

/** One line for a toast or a heading — the shape of the change in words. */
export function describeEsgImport(analysis: EsgImportAnalysis): string {
  const parts: string[] = [];
  if (analysis.additions.length) parts.push(`${analysis.additions.length} new`);
  if (analysis.overwrites.length) parts.push(`${analysis.overwrites.length} replaced`);
  if (analysis.unchanged) parts.push(`${analysis.unchanged} unchanged`);
  const cells = parts.length ? parts.join(", ") : "no cells";
  const scope = analysis.isPartial
    ? `${analysis.sectionsCovered.length} of ${analysis.sectionsCovered.length + analysis.sectionsUntouched.length} sections`
    : "every section";
  return `${cells} across ${scope}`;
}
