/**
 * The AI review's fills: values it can put into the workbook, each with its
 * reason and its evidence, applied on the user's click and undoable.
 *
 * WHY THIS EXISTS
 *
 * The review used to stop at flags. It listed the blank and disputed cells and
 * left every one of them for the user, even where the answer was already in the
 * workbook: a training row's total sitting next to its own line items, a
 * financial period end that is the year-end typed one section over, a
 * supplier's black ownership stated on its procurement row but blank on its ESD
 * row. This module turns those into fills.
 *
 * THE RULES IT KEEPS
 *
 *  - Nothing is invented. A value is either READ (another cell states it, and
 *    that cell came from a document) or DERIVED (computed from named cells by a
 *    named rule). The two are labelled differently everywhere, and a derived
 *    value is never presented as read.
 *  - Only blank cells are filled, plus a cell the documents disagree on that
 *    still holds the conservative value the build put there. A value the user
 *    typed is never overwritten. That includes a value the user put over an
 *    earlier AI fill, or a fill the user cleared or undid.
 *  - TMPS, the sector and the year-end are decisions, not fills. TMPS scores
 *    from the supplier schedule unless the client switches it to the stated
 *    figure; the review asks, it never writes either one.
 *  - No unit conversion without saying so. Every rule here works in the
 *    column's own unit; a model fill that scales a figure must state it.
 *  - Every filled cell carries a mark (`_aiFills`) with its value, reason,
 *    evidence and what it replaced, so the grid can show "Filled by AI review"
 *    and the user can undo one cell or all of them. The mark only counts while
 *    the cell still holds the filled value. Once the user edits the cell, the
 *    value is theirs.
 *
 * Pure: workbook sections in, proposals and patches out. Shared by the browser
 * (rules and apply) and the server (which verifies the model's proposals with
 * the same checks).
 */
import {
  getSection,
  parseAmount,
  parseWorkbookDate,
  type ColumnDef,
} from "@/components/workbook/sections";
import type { WorkbookSectionsInput } from "@/components/workbook/workbookValidation";
import { buildExtractionReview, rowLabel } from "./extractionReview";
import { tmpsHold } from "./extractionMetaKeys";

/** Row or meta key holding the marks of AI-filled cells. Column → mark. */
export const AI_FILLS_KEY = "_aiFills";
/** Row or meta key: values the user undid. Not proposed again. Column → value. */
export const AI_DECLINED_KEY = "_aiDeclined";
/** Row key holding the documents' rival values for a cell (parserToWorkbook's CONFLICTS_KEY). */
const ROW_CONFLICTS_KEY = "_conflicts";

export type FillKind = "read" | "derived";
export type FillOrigin = "rules" | "model";

/** One piece of evidence behind a fill. */
export type FillEvidence =
  | {
      type: "cell";
      section: string;
      sectionLabel: string;
      /** The row's handle. Absent for a section-level input. */
      rowLabel?: string;
      column: string;
      columnLabel: string;
      value: string;
      /** The documents that cell was read from, when it came from documents. */
      files: string[];
    }
  | {
      type: "document";
      file: string;
      /** What the document says, e.g. `states "Senior Management"`. */
      detail?: string;
    };

export interface FillProposal {
  /** Stable for the same cell: `fill_<section>_<rowId|meta>_<column>`. */
  id: string;
  section: string;
  sectionLabel: string;
  /** Absent for a section-level input (meta). */
  rowId?: string;
  rowLabel?: string;
  column: string;
  columnLabel: string;
  /** The value to write, as text. Coerced to the column's type on apply. */
  value: string;
  kind: FillKind;
  /** The rule that produced a derived value: "sum", "percent", "date", "classify", "SA ID". */
  rule?: string;
  /** One or two plain sentences: why this value. */
  reasoning: string;
  evidence: FillEvidence[];
  /** Set when the value had to be scaled; the user is told. */
  conversion?: string;
  /**
   * For a cell the documents disagree on: the conservative value it holds now.
   * The fill applies only while the cell still holds exactly this.
   */
  replaces?: string;
  /** Does this cell feed a score? Listed before "Apply all". */
  affectsScore: boolean;
  origin: FillOrigin;
}

/** A cell the review could not support with evidence: left empty, one question. */
export interface FillQuestion {
  id: string;
  section: string;
  sectionLabel: string;
  rowId?: string;
  column: string;
  /** "Section · row · column", for the list. */
  cellLabel: string;
  question: string;
}

/** What an applied fill leaves on its cell. */
export interface AiFillMark {
  value: string;
  kind: FillKind;
  rule?: string;
  reasoning: string;
  evidence: FillEvidence[];
  conversion?: string;
  /** The cell's value before the fill, restored by undo. Undefined = blank. */
  previous?: unknown;
  /** The documents' rival values the fill settled, restored by undo. */
  previousConflict?: unknown;
  origin: FillOrigin;
  at: string;
}

export interface CellRef {
  section: string;
  /** Absent for a section-level input (meta). */
  rowId?: string;
  column: string;
}

/** The new rows and/or meta for one section, ready for the section save. */
export interface SectionPatch {
  section: string;
  rows?: Array<Record<string, unknown>>;
  meta?: Record<string, unknown>;
}

type Row = Record<string, unknown> & { _id?: string; _sourceFiles?: string[] };

// ─── Small shared helpers ─────────────────────────────────────────────────

const str = (v: unknown): string => (v === undefined || v === null ? "" : String(v).trim());

export const isBlankCell = (v: unknown): boolean =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "");

/**
 * Do two cell values say the same thing? Numbers compare as numbers (a cell
 * holds 1500 or "1 500"), Yes/No compares to a stored boolean, dates compare
 * as calendar days, everything else as trimmed text, ignoring case.
 */
export function sameCellValue(a: unknown, b: unknown): boolean {
  if (isBlankCell(a) && isBlankCell(b)) return true;
  if (isBlankCell(a) || isBlankCell(b)) return false;
  const yes = (v: unknown) => (v === true || /^(yes|true)$/i.test(str(v)) ? "yes" : v === false || /^(no|false)$/i.test(str(v)) ? "no" : null);
  const ya = yes(a);
  const yb = yes(b);
  if (ya && yb) return ya === yb;
  const da = parseWorkbookDate(a);
  const db = parseWorkbookDate(b);
  if (da && db) return da.getTime() === db.getTime();
  const na = parseAmount(a);
  const nb = parseAmount(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return Math.abs(na - nb) < 1e-9;
  return str(a).toLowerCase() === str(b).toLowerCase();
}

export function sectionLabelOf(key: string): string {
  return getSection(key)?.label ?? key;
}

/** A column of the section's grid or, failing that, one of its section-level inputs. */
export function columnDefFor(section: string, column: string, meta = false): ColumnDef | undefined {
  const def = getSection(section);
  if (!def) return undefined;
  if (meta) return def.meta?.find((m) => m.key === column);
  return def.columns?.find((c) => c.key === column);
}

/**
 * Does this cell feed a score? Free text and ID numbers do not; every number,
 * choice, Yes/No and date does (a date decides certificate validity, a period,
 * a supplier's graduation). Erring towards "yes" only lengthens the list the
 * user sees before "Apply all".
 */
export function affectsScore(column: ColumnDef | undefined): boolean {
  if (!column) return true;
  return column.type !== "text" && column.type !== "id";
}

/**
 * Cells the review never fills. The sector, scorecard type and year-end are
 * decided at Build and drive every target; TMPS is the supplier sum unless the
 * client switches to the stated figure (decided 11 Oct 2026). ID numbers are
 * never written by inference.
 */
const DECISION_CELLS: Record<string, Set<string>> = {
  "company-information": new Set([
    "industrySector",
    "scorecardType",
    "financialYearEnd",
    "fscSubSector",
    "fscReinsurer",
    "constructionSubSector",
    "farmWorkersIncluded",
  ]),
  "financial-information": new Set(["tmps", "forecastTmps", "tmpsBasis"]),
};

export function isDecisionCell(section: string, column: string): boolean {
  if (column === "idNumber") return true;
  return DECISION_CELLS[section]?.has(column) ?? false;
}

function rowsOf(sections: WorkbookSectionsInput, key: string): Row[] {
  return ((sections[key]?.rows ?? []) as Row[]).filter((r) => r && typeof r === "object");
}

function metaOf(sections: WorkbookSectionsInput, key: string): Record<string, unknown> {
  return (sections[key]?.meta ?? {}) as Record<string, unknown>;
}

function filesOf(row: Row | undefined): string[] {
  return Array.isArray(row?._sourceFiles) ? row!._sourceFiles!.map(String) : [];
}

function marksOf(container: Record<string, unknown> | undefined): Record<string, AiFillMark> {
  const raw = container?.[AI_FILLS_KEY];
  return raw && typeof raw === "object" ? (raw as Record<string, AiFillMark>) : {};
}

function declinedOf(container: Record<string, unknown> | undefined): Record<string, unknown> {
  const raw = container?.[AI_DECLINED_KEY];
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

/**
 * The live mark on a cell: present only while the cell still holds the value
 * the review wrote. Once the user changes it, the value is theirs and the mark
 * stops counting.
 */
export function activeMark(container: Record<string, unknown> | undefined, column: string): AiFillMark | null {
  const mark = marksOf(container)[column];
  if (!mark) return null;
  return sameCellValue(container?.[column], mark.value) ? mark : null;
}

/**
 * May the review write this cell now? Blank, never touched by the user after
 * an AI fill, not a value the user undid, and not a decision cell.
 *
 * `replaces` admits a disputed cell: it must still hold exactly the
 * conservative value, and the documents' dispute must still be on the row.
 */
export function canFill(
  section: string,
  container: Record<string, unknown> | undefined,
  column: string,
  value: string,
  replaces?: string,
): { ok: true } | { ok: false; reason: string } {
  if (!container) return { ok: false, reason: "The row is gone." };
  if (isDecisionCell(section, column)) return { ok: false, reason: "This is a decision for you, not a fill." };
  const current = container[column];
  const mark = marksOf(container)[column];
  if (mark && !sameCellValue(current, mark.value)) {
    // An AI fill the user changed, or cleared, is the user's value now.
    return { ok: false, reason: "You changed this cell after an earlier fill." };
  }
  const declined = declinedOf(container);
  if (column in declined && sameCellValue(declined[column], value)) {
    return { ok: false, reason: "You undid this value before." };
  }
  if (replaces !== undefined) {
    const conflicts = (container[ROW_CONFLICTS_KEY] ?? {}) as Record<string, unknown>;
    const rivals = conflicts[column];
    if (!Array.isArray(rivals)) return { ok: false, reason: "The disagreement on this cell is settled." };
    if (!sameCellValue(current, replaces)) return { ok: false, reason: "The cell holds a different value now." };
    // Editing the cell does not clear the documents' dispute, so a value that
    // is none of the documents' own is one the user typed: theirs, never replaced.
    const stated = rivals.map((c) => (c && typeof c === "object" && "value" in c ? (c as { value?: unknown }).value : c));
    if (!isBlankCell(current) && !stated.some((v) => sameCellValue(current, v))) {
      return { ok: false, reason: "You entered your own value here." };
    }
    return { ok: true };
  }
  if (!isBlankCell(current)) return { ok: false, reason: "The cell holds a value now." };
  return { ok: true };
}

const proposalId = (section: string, rowId: string | undefined, column: string) =>
  `fill_${section}_${rowId ?? "meta"}_${column}`.replace(/[^A-Za-z0-9_-]+/g, "-");

const questionId = (section: string, rowId: string | undefined, column: string) =>
  `ask_${section}_${rowId ?? "meta"}_${column}`.replace(/[^A-Za-z0-9_-]+/g, "-");

export function cellLabelOf(section: string, rowLabelText: string | undefined, columnLabel: string): string {
  return [sectionLabelOf(section), rowLabelText, columnLabel].filter(Boolean).join(" · ");
}

const rands = (n: number) => `R ${Math.round(n).toLocaleString("en-ZA")}`;

function displayDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

/** The same calendar day, written the way the source cell writes dates. */
function dateLike(source: unknown, d: Date): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(str(source))) return d.toISOString().slice(0, 10);
  return displayDate(d);
}

function cellEvidence(
  section: string,
  row: Row | undefined,
  column: string,
  value: unknown,
  meta = false,
): FillEvidence {
  const def = columnDefFor(section, column, meta);
  return {
    type: "cell",
    section,
    sectionLabel: sectionLabelOf(section),
    ...(row ? { rowLabel: rowLabel(section, row) } : {}),
    column,
    columnLabel: def?.label ?? column,
    value: str(value),
    files: filesOf(row),
  };
}

// ─── The rules ────────────────────────────────────────────────────────────

/** A supplier's name reduced to what identifies it: no "(Pty) Ltd", punctuation or case. */
export function supplierKey(name: unknown): string {
  return str(name)
    .toLowerCase()
    .replace(/\((pty|proprietary)\)|\bpty\b|\bltd\b|\blimited\b|\bcc\b|\binc\b|\bnpc\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const SKILLS_COST_LINES = [
  "courseCost",
  "travelCost",
  "accommodationCost",
  "cateringCost",
  "stationeryCost",
  "trainingFacilityCost",
  "salaryCost",
  "otherCosts",
] as const;

/** Columns ESD and Procurement both carry for one supplier. */
const SHARED_SUPPLIER_COLUMNS = ["currentBlackOwnership", "currentSize"] as const;

/**
 * Everything the review can fill without a model, and the questions it asks
 * where the workbook does not support a value. Deterministic.
 */
export function buildRuleFills(sections: WorkbookSectionsInput): {
  proposals: FillProposal[];
  questions: FillQuestion[];
} {
  const proposals: FillProposal[] = [];
  const questions: FillQuestion[] = [];
  const taken = new Set<string>();

  const propose = (p: Omit<FillProposal, "id" | "sectionLabel" | "affectsScore" | "origin"> & { meta?: boolean }) => {
    const id = proposalId(p.section, p.rowId, p.column);
    if (taken.has(id)) return;
    const container = p.rowId
      ? rowsOf(sections, p.section).find((r) => str(r._id) === p.rowId)
      : metaOf(sections, p.section);
    if (!canFill(p.section, container, p.column, p.value, p.replaces).ok) return;
    taken.add(id);
    const { meta, ...rest } = p;
    proposals.push({
      ...rest,
      id,
      sectionLabel: sectionLabelOf(p.section),
      affectsScore: affectsScore(columnDefFor(p.section, p.column, Boolean(meta))),
      origin: "rules",
    });
  };
  const ask = (section: string, rowId: string | undefined, rowLabelText: string | undefined, column: string, columnLabel: string, question: string) => {
    const id = questionId(section, rowId, column);
    if (questions.some((q) => q.id === id)) return;
    questions.push({ id, section, sectionLabel: sectionLabelOf(section), rowId, column, cellLabel: cellLabelOf(section, rowLabelText, columnLabel), question });
  };

  // 1. People: the same ID elsewhere, and the gender the SA ID itself states.
  //    These are the review's existing grounded suggestions, now applied with a mark.
  for (const s of buildExtractionReview(sections).suggestions) {
    propose({
      section: s.section,
      rowId: s.rowId,
      rowLabel: s.rowLabel,
      column: s.column,
      columnLabel: s.columnLabel,
      value: s.value,
      kind: s.kind,
      ...(s.kind === "derived" ? { rule: "SA ID" } : {}),
      reasoning: s.basis,
      evidence: [{ type: "cell", ...s.evidence }],
    });
  }

  // 2. The financial period ends on the financial year-end, by definition.
  const company = metaOf(sections, "company-information");
  const fye = parseWorkbookDate(company.financialYearEnd);
  if (fye && isBlankCell(company.measurementPeriodEnd)) {
    propose({
      section: "company-information",
      column: "measurementPeriodEnd",
      columnLabel: columnDefFor("company-information", "measurementPeriodEnd", true)?.label ?? "Financial Period End",
      value: dateLike(company.financialYearEnd, fye),
      kind: "derived",
      rule: "date",
      reasoning: `The measured financial period ends on the financial year-end, ${displayDate(fye)}.`,
      evidence: [cellEvidence("company-information", undefined, "financialYearEnd", displayDate(fye), true)],
      meta: true,
    });
  }
  if (fye && isBlankCell(company.measurementPeriodStart)) {
    // Not filled: a first or changed financial year is not 12 months long, and
    // nothing in the workbook says which this is.
    // The day after the year-end, one year back: 28/02/2025 → 01/03/2024 (not
    // 29/02/2024, which "a year before, plus a day" gives in a leap year).
    const dayAfter = new Date(Date.UTC(fye.getUTCFullYear(), fye.getUTCMonth(), fye.getUTCDate() + 1));
    const start = new Date(Date.UTC(dayAfter.getUTCFullYear() - 1, dayAfter.getUTCMonth(), dayAfter.getUTCDate()));
    ask(
      "company-information",
      undefined,
      undefined,
      "measurementPeriodStart",
      columnDefFor("company-information", "measurementPeriodStart", true)?.label ?? "Financial Period Start",
      `Was this a full 12-month financial year, starting ${displayDate(start)}?`,
    );
  }

  // 3. A training row's total is the sum of its own cost lines.
  for (const row of rowsOf(sections, "skills-development")) {
    if (!isBlankCell(row.totalCost) || !str(row._id)) continue;
    const lines = SKILLS_COST_LINES.filter((k) => !isBlankCell(row[k]) && Number.isFinite(parseAmount(row[k])));
    if (lines.length === 0) continue;
    const total = lines.reduce((sum, k) => sum + parseAmount(row[k]), 0);
    if (total <= 0) continue;
    propose({
      section: "skills-development",
      rowId: str(row._id),
      rowLabel: rowLabel("skills-development", row),
      column: "totalCost",
      columnLabel: "Total Cost (R)",
      value: String(Math.round(total * 100) / 100),
      kind: "derived",
      rule: "sum",
      reasoning: `Total of this row's ${lines.length === 1 ? "only cost line" : `${lines.length} cost lines`}: ${lines
        .map((k) => columnDefFor("skills-development", k)?.label ?? k)
        .join(" + ")}.`,
      evidence: lines.map((k) => cellEvidence("skills-development", row, k, row[k])),
    });
  }

  // 4. Shareholding % from share counts — only when every holder's count is known.
  const owners = rowsOf(sections, "ownership").filter((r) => str(r._id));
  if (owners.length > 0) {
    const counts = owners.map((r) => parseAmount(r.numberOfShares));
    const complete = counts.every((n) => Number.isFinite(n) && n > 0);
    const total = complete ? counts.reduce((a, b) => a + b, 0) : 0;
    // Counts at or under 100 each may already be percentages — not derived from.
    const areCounts = complete && counts.some((n) => n > 100);
    owners.forEach((row, i) => {
      if (!isBlankCell(row.shareholding)) return;
      if (areCounts) {
        const pct = Math.round((counts[i] / total) * 10_000) / 100;
        propose({
          section: "ownership",
          rowId: str(row._id),
          rowLabel: rowLabel("ownership", row),
          column: "shareholding",
          columnLabel: "Share (%)",
          value: String(pct),
          kind: "derived",
          rule: "percent",
          reasoning: `${counts[i].toLocaleString("en-ZA")} of the ${total.toLocaleString("en-ZA")} shares on the register = ${pct}%.`,
          evidence: owners.map((r) => cellEvidence("ownership", r, "numberOfShares", r.numberOfShares)),
        });
      }
    });
    for (const row of owners) {
      if (isBlankCell(row.votingRights) && !isBlankCell(row.shareholding)) {
        // Voting rights often follow the shareholding, but share classes differ.
        ask(
          "ownership",
          str(row._id),
          rowLabel("ownership", row),
          "votingRights",
          "Voting Rights (%)",
          `Are ${rowLabel("ownership", row)}'s voting rights the same as their ${str(row.shareholding)}% shareholding?`,
        );
      }
    }
  }

  // 5. One supplier, two registers: a figure its procurement row states fills
  //    its blank ESD cell, and the other way round. Only an exact name (or
  //    registration number) match, and only a STATED value — a percentage the
  //    build derived from a "51% or more" flag is not a statement.
  const procurement = rowsOf(sections, "procurement");
  const esd = rowsOf(sections, "esd");
  const sameSupplier = (a: Row, b: Row) => {
    const ra = str(a.registrationNumber);
    const rb = str(b.registrationNumber);
    if (ra && rb) return ra === rb;
    const ka = supplierKey(a.supplierName);
    return ka.length > 0 && ka === supplierKey(b.supplierName);
  };
  const stated = (row: Row, column: string) => {
    const flagged = (row._derivedFromFlag ?? {}) as Record<string, unknown>;
    // An earlier derived AI fill is worked out too, not stated.
    return !isBlankCell(row[column]) && !(column in flagged) && activeMark(row, column)?.kind !== "derived";
  };
  for (const [fromKey, toKey, from, to] of [
    ["procurement", "esd", procurement, esd],
    ["esd", "procurement", esd, procurement],
  ] as const) {
    for (const target of to) {
      if (!str(target._id)) continue;
      for (const column of SHARED_SUPPLIER_COLUMNS) {
        if (!isBlankCell(target[column])) continue;
        const sources = from.filter((r) => sameSupplier(r, target) && stated(r, column));
        if (sources.length === 0) continue;
        const values = Array.from(new Set(sources.map((r) => str(r[column]))));
        const def = columnDefFor(toKey, column);
        if (values.length > 1) {
          ask(toKey, str(target._id), rowLabel(toKey, target), column, def?.label ?? column,
            `${rowLabel(toKey, target)} has ${values.length} different values for ${def?.label ?? column} on ${sectionLabelOf(fromKey)}: ${values.join(" or ")}. Which is right?`);
          continue;
        }
        const source = sources[0];
        propose({
          section: toKey,
          rowId: str(target._id),
          rowLabel: rowLabel(toKey, target),
          column,
          columnLabel: def?.label ?? column,
          value: values[0],
          kind: "read",
          reasoning: `${rowLabel(fromKey, source)} on ${sectionLabelOf(fromKey)} is the same supplier and states ${def?.label ?? column} = ${values[0]}.`,
          evidence: [cellEvidence(fromKey, source, column, source[column])],
        });
      }
    }
  }

  // 6. TMPS: never filled. When the documents' TMPS is held open, say what is
  //    scored meanwhile and ask which stated figure is right.
  const fin = metaOf(sections, "financial-information");
  const hold = tmpsHold(fin);
  if (isBlankCell(fin.tmps) && hold) {
    const supplierSum = procurement.reduce((sum, r) => {
      const n = parseAmount(r.spend);
      return sum + (Number.isFinite(n) && n > 0 ? n : 0);
    }, 0);
    ask(
      "financial-information",
      undefined,
      undefined,
      "tmps",
      "Total Measured Procurement Spend",
      supplierSum > 0
        ? `Procurement scores against your supplier schedule (${rands(supplierSum)}) unless you switch to a stated TMPS. ${hold === "contested" ? "Your documents state different TMPS figures" : "The stated TMPS could not be read"} — which figure is right?`
        : `${hold === "contested" ? "Your documents state different TMPS figures" : "The stated TMPS could not be read"} — which figure is right?`,
    );
  }

  return { proposals, questions };
}

// ─── Apply and undo ───────────────────────────────────────────────────────

/** The proposal's text value as the column stores it. */
export function coerceFillValue(column: ColumnDef | undefined, value: string): unknown {
  if (!column) return value;
  if (column.yesNoBoolean) return /^(yes|true)$/i.test(value.trim());
  if (column.type === "number") {
    const n = parseAmount(value);
    return Number.isFinite(n) ? n : value;
  }
  if (column.type === "select" && column.options) {
    return column.options.find((o) => o.toLowerCase() === value.trim().toLowerCase()) ?? value;
  }
  return value;
}

function cloneSection(sections: WorkbookSectionsInput, key: string, patches: Map<string, SectionPatch>): SectionPatch {
  let patch = patches.get(key);
  if (!patch) {
    patch = {
      section: key,
      rows: rowsOf(sections, key).map((r) => ({ ...r })),
      meta: { ...metaOf(sections, key) },
    };
    patches.set(key, patch);
  }
  return patch;
}

function containerIn(patch: SectionPatch, rowId: string | undefined): Record<string, unknown> | undefined {
  if (rowId === undefined) return patch.meta;
  return patch.rows?.find((r) => str(r._id) === rowId);
}

function finalise(patches: Map<string, SectionPatch>, touched: Set<string>): SectionPatch[] {
  return Array.from(patches.values())
    .filter((p) => touched.has(p.section))
    .map((p) => {
      // A section-level fill sends only the meta; a row fill only the rows.
      // The page merges each into the section it saves.
      const rowsTouched = touched.has(`${p.section}::rows`);
      const metaTouched = touched.has(`${p.section}::meta`);
      return {
        section: p.section,
        ...(rowsTouched ? { rows: p.rows } : {}),
        ...(metaTouched ? { meta: p.meta } : {}),
      };
    });
}

/**
 * Write proposals into the workbook, each with its mark. Every proposal is
 * re-checked against the cell as it is NOW: a cell the user filled since the
 * proposal was made is skipped, never overwritten.
 */
export function applyFillProposals(
  sections: WorkbookSectionsInput,
  proposals: FillProposal[],
  at: string = new Date().toISOString(),
): { patches: SectionPatch[]; applied: string[]; skipped: Array<{ id: string; reason: string }> } {
  const patches = new Map<string, SectionPatch>();
  const touched = new Set<string>();
  const applied: string[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const p of proposals) {
    const patch = cloneSection(sections, p.section, patches);
    const container = containerIn(patch, p.rowId);
    const check = canFill(p.section, container, p.column, p.value, p.replaces);
    if (!check.ok || !container) {
      skipped.push({ id: p.id, reason: check.ok ? "The row is gone." : check.reason });
      continue;
    }
    const def = columnDefFor(p.section, p.column, p.rowId === undefined);
    const previous = container[p.column];
    const mark: AiFillMark = {
      value: p.value,
      kind: p.kind,
      ...(p.rule ? { rule: p.rule } : {}),
      reasoning: p.reasoning,
      evidence: p.evidence,
      ...(p.conversion ? { conversion: p.conversion } : {}),
      ...(isBlankCell(previous) ? {} : { previous }),
      origin: p.origin,
      at,
    };
    if (p.replaces !== undefined) {
      const conflicts = { ...((container[ROW_CONFLICTS_KEY] ?? {}) as Record<string, unknown>) };
      mark.previousConflict = conflicts[p.column];
      delete conflicts[p.column];
      if (Object.keys(conflicts).length > 0) container[ROW_CONFLICTS_KEY] = conflicts;
      else delete container[ROW_CONFLICTS_KEY];
    }
    container[p.column] = coerceFillValue(def, p.value);
    container[AI_FILLS_KEY] = { ...marksOf(container), [p.column]: mark };
    touched.add(p.section);
    touched.add(`${p.section}::${p.rowId === undefined ? "meta" : "rows"}`);
    applied.push(p.id);
  }
  return { patches: finalise(patches, touched), applied, skipped };
}

function undoInto(container: Record<string, unknown>, column: string): boolean {
  const marks = marksOf(container);
  const mark = marks[column];
  if (!mark) return false;
  if (sameCellValue(container[column], mark.value)) {
    if (mark.previous === undefined) delete container[column];
    else container[column] = mark.previous;
    if (mark.previousConflict !== undefined) {
      container[ROW_CONFLICTS_KEY] = {
        ...((container[ROW_CONFLICTS_KEY] ?? {}) as Record<string, unknown>),
        [column]: mark.previousConflict,
      };
    }
    // Remember the refusal so the same value is not offered straight back.
    container[AI_DECLINED_KEY] = { ...declinedOf(container), [column]: mark.value };
  }
  // A cell the user changed keeps their value; only the stale mark goes.
  const rest = { ...marks };
  delete rest[column];
  if (Object.keys(rest).length > 0) container[AI_FILLS_KEY] = rest;
  else delete container[AI_FILLS_KEY];
  return true;
}

/** Undo one AI fill: the cell goes back to what it held before. */
export function undoAiFill(sections: WorkbookSectionsInput, ref: CellRef): SectionPatch[] {
  const patches = new Map<string, SectionPatch>();
  const touched = new Set<string>();
  const patch = cloneSection(sections, ref.section, patches);
  const container = containerIn(patch, ref.rowId);
  if (container && undoInto(container, ref.column)) {
    touched.add(ref.section);
    touched.add(`${ref.section}::${ref.rowId === undefined ? "meta" : "rows"}`);
  }
  return finalise(patches, touched);
}

/** Undo every AI fill still in the workbook. */
export function undoAllAiFills(sections: WorkbookSectionsInput): SectionPatch[] {
  const patches = new Map<string, SectionPatch>();
  const touched = new Set<string>();
  for (const fill of activeAiFills(sections)) {
    const patch = cloneSection(sections, fill.section, patches);
    const container = containerIn(patch, fill.rowId);
    if (container && undoInto(container, fill.column)) {
      touched.add(fill.section);
      touched.add(`${fill.section}::${fill.rowId === undefined ? "meta" : "rows"}`);
    }
  }
  return finalise(patches, touched);
}

/** Undo for one row, used by the grid's cell mark. */
export function undoRowFill<T extends Record<string, unknown>>(row: T, column: string): T {
  const next = { ...row } as Record<string, unknown>;
  undoInto(next, column);
  return next as T;
}

/** Every AI fill whose cell still holds the filled value. */
export function activeAiFills(sections: WorkbookSectionsInput): Array<CellRef & {
  sectionLabel: string;
  rowLabel?: string;
  columnLabel: string;
  mark: AiFillMark;
}> {
  const out: Array<CellRef & { sectionLabel: string; rowLabel?: string; columnLabel: string; mark: AiFillMark }> = [];
  for (const key of Object.keys(sections)) {
    const meta = metaOf(sections, key);
    for (const column of Object.keys(marksOf(meta))) {
      const mark = activeMark(meta, column);
      if (mark) out.push({ section: key, column, sectionLabel: sectionLabelOf(key), columnLabel: columnDefFor(key, column, true)?.label ?? column, mark });
    }
    for (const row of rowsOf(sections, key)) {
      for (const column of Object.keys(marksOf(row))) {
        const mark = activeMark(row, column);
        if (mark) {
          out.push({
            section: key,
            rowId: str(row._id),
            column,
            sectionLabel: sectionLabelOf(key),
            rowLabel: rowLabel(key, row),
            columnLabel: columnDefFor(key, column)?.label ?? column,
            mark,
          });
        }
      }
    }
  }
  return out;
}

/** One line per evidence item, for a tooltip or a list. */
export function describeEvidence(e: FillEvidence): string {
  if (e.type === "document") return `${e.file}${e.detail ? ` — ${e.detail}` : ""}`;
  const where = [e.sectionLabel, e.rowLabel, e.columnLabel].filter(Boolean).join(" · ");
  return `${where} = ${e.value}${e.files.length > 0 ? ` (from ${e.files.join(", ")})` : ""}`;
}

/** The text shown when the user points at a filled cell. */
export function describeMark(mark: AiFillMark): string {
  const head = mark.kind === "derived" ? "Filled by AI review — derived" : "Filled by AI review — read from your documents";
  const lines = [head, mark.reasoning];
  if (mark.conversion) lines.push(`Converted: ${mark.conversion}`);
  for (const e of mark.evidence.slice(0, 4)) lines.push(`• ${describeEvidence(e)}`);
  if (mark.evidence.length > 4) lines.push(`• +${mark.evidence.length - 4} more`);
  return lines.join("\n");
}
