/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE SEAM: ESG parser result → ESG workbook cells.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The upload flow (`EsgDocumentUploadStart`) reads forty kinds of document,
 * prices them, spends tokens and streams the extraction back without knowing a
 * single thing about where `electricity_kwh` lands in `E_Data`. Deciding that —
 * which parser field becomes which workbook cell, in which section, after which
 * unit and period reconciliation — is this file and the three modules under
 * `@/lib/esg` it delegates to:
 *
 *   `esgParserFieldBridge`  allowlisted calculator key → section id + cell ref,
 *                           one declared line each, plus the derived-cell guard.
 *   `esgWorkbookInjection`  the workbook's OWN dropdown vocabulary, and a typed
 *                           rejection for anything that does not match it.
 *   `esgParserToWorkbook`   registers, site/month and quarter context, and the
 *                           conflict rule.
 *
 * WHY IT IS BUILT THIS WAY
 *
 * A half-mapping is worse than no mapping. The ESG workbook is a grid of
 * Excel-style cell references (`B14`, `D39`) whose meaning comes from the sheet
 * layout, not from the key name. Guessing "electricity_kwh probably goes
 * somewhere in E_Data" writes a real number into a real cell that a real
 * calculator then scores — silently, and wrongly, with no signal to the user
 * that it was a guess. The B-BBEE flow learned this the expensive way: a silent
 * Generic default once scored a Transport QSE dozens of points too low. So
 * every value that cannot be placed EXACTLY is reported under `unplaced` with a
 * plain-language reason, and the user is told the truth about what was and was
 * not filled in.
 *
 * WHERE THE VALUES COME FROM
 *
 * `ai_entities.calculator` — the ESG parser's own mapping result. Its `payload`
 * and `entries` are allowlisted calculator keys (`energy.electricity_kwh`), its
 * `rows` are expanded register rows, and its `needsReview` holds the fields two
 * documents disagreed on, which the parser withholds BEFORE mapping them. That
 * server-side half owns "field name → calculator key"; this client half owns
 * "calculator key → cell". Neither restates the other.
 *
 * The contract this honours:
 *   - `patches` keys are ids from `ESG_SECTION_IDS` (`@/lib/esgSections`).
 *   - cell keys are the same references the section editor and the `.xlsx`
 *     import use for that section, so a parsed workbook and an imported one
 *     are indistinguishable once saved.
 *   - NEVER a cell for a value the parser did not extract. A missing value is
 *     an absent key, never `0`, never `""`, never a default.
 *   - NEVER a cell `esgDeriveSummary.ts` computes.
 *   - A cell two documents disagree on goes in `conflicts` and is left OUT of
 *     `patches`. The user picks in the workbook; we do not pick for them.
 *   - Every extracted value appears in exactly one of `placed`, `unplaced` or
 *     `conflicts`, so the counts always reconcile to `valuesRead`.
 *
 * On create, `persistEsgSectionPatches(companyId, patches)` POSTs to
 * `/api/esg/workbook/:companyId/import` with `{ confirm: true, sections }` —
 * the SAME endpoint and payload shape the `.xlsx` import confirms with. There
 * is no second write path to keep in sync.
 */

import { API_BASE } from "@toolkit/lib/config";
import type { EsgReportingAxes } from "@/components/esg-workbook/esgDefaults";
import {
  mapEsgCalculatorToWorkbook,
  type EsgCalculatorResultLike,
  type EsgPlacementChoice,
} from "@/lib/esg/esgParserToWorkbook";
import type { EsgRejectionReason } from "@/lib/esg/esgWorkbookInjection";
import { esgMonthlyCellRef } from "@/lib/esg/esgParserFieldBridge";
import {
  esgPlacementAxes,
  esgWorkbookAxisState,
  isEsgAxisCell,
  type EsgWorkbookAxisState,
} from "@/lib/esg/esgCaseAxes";

/** One field the parser read out of one document. */
export interface EsgParserValue {
  field: string;
  value: unknown;
  /** Provenance carried per value by `ExtractedValue` on the parser side. */
  sourceFile?: string;
  sourceDocumentId?: string;
  /** Present only when the parser reports one. Never fabricated. */
  confidence?: number;
}

/**
 * One spec's worth of extraction out of one file, as the ESG parser's
 * `DocumentExtraction` returns it. A single uploaded file can produce SEVERAL
 * of these (a workbook whose sheets match different specs), so this is keyed by
 * `documentId`, not by filename.
 */
export interface EsgParserExtraction {
  documentId?: string;
  /** The matrix document's display name. */
  documentName?: string;
  sourceFile?: string;
  /** An `EsgElement` code — GHG_ENERGY, FLEET, WASTE, … */
  element?: string;
  values?: EsgParserValue[];
  /** Schema fields the model did not return — what to ask the user for. */
  missingFields?: string[];
  /** Keys the model returned that the schema did not ask for. */
  unexpectedFields?: string[];
  /** Free-form notes the extraction raised (unreconciled totals, and such). */
  exceptions?: unknown[];
}

/** One document as the case parser classified it. */
export interface EsgParserDetectedDocument {
  filename: string;
  document_type?: string;
  element?: string;
  status?: string;
  validation?: {
    passed?: boolean;
    errors?: string[];
    warnings?: string[];
    missing_fields?: string[];
  };
  [key: string]: unknown;
}

/**
 * The narrow view of the ESG parser's `result` SSE payload this app depends on.
 *
 * The ESG routes report the file list as `documents: [{file_name}]` (plus
 * `unreadable_files` on the non-streaming variant) rather than the B-BBEE
 * `documents_detected`. Both are accepted here, and `esgCaseFileNames` is the
 * one place that knows the difference — nothing downstream should read either
 * key directly, or it will quietly do nothing the day the shape moves.
 *
 * `ai_entities` is NULL when the parser extracted nothing at all. That is a
 * real, expected outcome (a pack of unreadable scans), not an error state.
 */
export interface EsgParserCaseLike {
  case_id?: string;
  /** "resolved" | "failed" as the parser reports it. */
  status?: string;
  domain?: string;
  /** The ESG shape: every file the parser actually processed. */
  documents?: Array<{ file_name?: string }>;
  /** Files that could not be read at all, with the reason. */
  unreadable_files?: Array<{ file_name?: string; reason?: string }>;
  /** The B-BBEE shape, accepted for forward/backward compatibility. */
  documents_detected?: EsgParserDetectedDocument[];
  documents_needing_review?: Array<{ filename: string; reasons?: string[] }>;
  ai_entities?: {
    fields?: Record<string, { value?: unknown } | null>;
    extractions?: EsgParserExtraction[];
    /**
     * The parser's own calculator mapping: allowlisted keys, expanded register
     * rows, and the fields it held back because documents disagreed. Absent on
     * a case produced before that half existed — which is a reason to place
     * nothing, not a reason to fall back to guessing from raw field names.
     */
    calculator?: EsgCalculatorResultLike | null;
  } | null;
  /** Figures a person placed in the review — see `EsgManualPlacement`. Never set by the parser. */
  manual_placements?: EsgManualPlacement[];
  [key: string]: unknown;
}

/**
 * Every uploaded file this case covers, however the parser named the list.
 *
 * The union matters: a file can appear as a processed document, as the source
 * of an extraction, as an unreadable file, or (on the B-BBEE shape) as a
 * detected document — and a run record has to be written for all of them.
 */
export function esgCaseFileNames(caseResult: EsgParserCaseLike | null): string[] {
  const names = new Set<string>();
  const add = (value: unknown) => {
    const name = String(value ?? "").trim();
    if (name) names.add(name);
  };
  for (const doc of caseResult?.documents ?? []) add(doc?.file_name);
  for (const doc of caseResult?.unreadable_files ?? []) add(doc?.file_name);
  for (const doc of caseResult?.documents_detected ?? []) add(doc?.filename);
  for (const extraction of caseResult?.ai_entities?.extractions ?? []) add(extraction?.sourceFile);
  return Array.from(names);
}

/**
 * Fold a later round's calculator into an earlier one's — the half of a case
 * the workbook is actually filled from.
 *
 * The case merge spread `ai_entities` as one object, so a second round's
 * calculator REPLACED the first's: add a forgotten document and every value
 * read in round one — its monthly figures, its registers — silently left the
 * workbook. Now an earlier entry or row survives unless the new round re-read
 * the file it came from (the fresh read of that file stands); a key both
 * rounds mapped takes the new round's value, the rule the merge already
 * applies to extractions.
 */
export function mergeEsgCalculators(
  kept: EsgCalculatorResultLike | null | undefined,
  fresh: EsgCalculatorResultLike | null | undefined,
  rereadSources: ReadonlySet<string>,
): EsgCalculatorResultLike | null | undefined {
  if (!kept) return fresh;
  if (!fresh) return kept;
  const reread = (sources?: string[]) =>
    (sources ?? []).length > 0 && (sources ?? []).every((source) => rereadSources.has(String(source)));
  const freshKeys = new Set((fresh.entries ?? []).map((entry) => entry.key));
  const entries = [
    ...(kept.entries ?? []).filter((entry) => !freshKeys.has(entry.key) && !reread(entry.sourceFiles)),
    ...(fresh.entries ?? []),
  ];
  const freshReview = new Set((fresh.needsReview ?? []).map((item) => item.field));
  const freshUnmapped = new Set((fresh.unmapped ?? []).map((item) => item.field));
  return {
    // The payload mirrors the entries; rebuilt so a dropped entry's key goes with it.
    payload: Object.fromEntries(entries.map((entry) => [entry.key, entry.value])),
    entries,
    rows: [...(kept.rows ?? []).filter((row) => !reread(row.sourceFiles)), ...(fresh.rows ?? [])],
    unmapped: [...(kept.unmapped ?? []).filter((item) => !freshUnmapped.has(item.field)), ...(fresh.unmapped ?? [])],
    needsReview: [...(kept.needsReview ?? []).filter((item) => !freshReview.has(item.field)), ...(fresh.needsReview ?? [])],
  };
}

/**
 * The upload a parser source came from — the file itself, or the workbook a
 * sheet was split out of. The parser names a split sheet "File.xlsx › Sheet",
 * which matched no uploaded file, so every result read from a workbook was
 * dropped instead of archived: a paid read with nothing in the library.
 */
export function esgUploadNameForSource(source: unknown, uploadNames: readonly string[]): string | null {
  const name = String(source ?? "").trim();
  if (!name) return null;
  if (uploadNames.includes(name)) return name;
  const marker = name.indexOf("›");
  if (marker < 0) return null;
  const workbook = name.slice(0, marker).trim();
  return uploadNames.includes(workbook) ? workbook : null;
}

/** The value types an ESG workbook cell can hold. */
export type EsgCellValue = string | number | boolean | null;

/**
 * Workbook section id → the cells to write. Exactly the shape
 * `POST /api/esg/workbook/:companyId/import` accepts as `sections`, and
 * exactly the shape `EsgImportPreview.sections` carries for the `.xlsx` path.
 */
export type EsgSectionPatches = Record<string, { cells: Record<string, EsgCellValue> }>;

/** A parser value that WAS bound to a workbook cell. */
export interface EsgPlacedValue {
  sectionId: string;
  cellRef: string;
  field: string;
  value: EsgCellValue;
  sourceFile: string;
  documentId: string;
}

/** A parser value that was NOT bound to a workbook cell, and why. */
export interface EsgUnplacedValue {
  field: string;
  value: unknown;
  sourceFile: string;
  documentId: string;
  element: string;
  /** Plain-language reason, shown to the user verbatim. */
  reason: string;
  /** Why, typed: what tells a figure waiting for an answer from evidence no cell needs. */
  rejection?: EsgRejectionReason;
  /** The one question that places this figure, when a person can answer it. */
  choice?: EsgPlacementChoice;
  /** This reading is the site or period of the figure with this choice id. */
  partOf?: string;
}

/**
 * A figure a person placed in the review: the answer to its question, kept
 * ON the case (`manual_placements`) so it travels wherever the case does —
 * into the saved flow, through added documents, into the workbook.
 */
export interface EsgManualPlacement {
  /** The choice it answers (`EsgPlacementChoice.id`). */
  choiceId: string;
  sectionId: string;
  cellRef: string;
  value: number;
  /** Where it went, in words: "BKT, Jun-25". */
  where: string;
}

/** A figure placed by a person, as the review shows it — with the way back. */
export interface EsgAnsweredValue {
  placement: EsgManualPlacement;
  choice: EsgPlacementChoice;
  field: string;
  sourceFile: string;
}

/** One cell two or more documents disagree about. Left blank, never guessed. */
export interface EsgValueConflict {
  sectionId: string;
  cellRef: string;
  /** What to call this in the UI. */
  label: string;
  candidates: Array<{ value: unknown; sources: string[] }>;
}

export interface EsgInjectionResult {
  /**
   * True now that the mapping layer exists. The UI keys its honesty banner off
   * this: it says "read but not written" only while this is false.
   */
  implemented: boolean;
  /** Sections to write. EMPTY while `implemented` is false. */
  patches: EsgSectionPatches;
  placed: EsgPlacedValue[];
  unplaced: EsgUnplacedValue[];
  conflicts: EsgValueConflict[];
  /** placed + unplaced + conflicting values. The reconciliation invariant. */
  valuesRead: number;
  /** Figures a person placed by answering their question, with what they answered. */
  answered?: EsgAnsweredValue[];
  /** The sites and months the figures were placed on — the answers a question offers. */
  axes?: EsgReportingAxes;
  /**
   * Figures actually written to the workbook — one per cell. A dashboard is
   * ONE reading holding hundreds of figures, so `placed` (readings) said "32
   * placed" for a read that filled 1,600 cells; this is the number to show.
   * Absent on a result restored from before it existed.
   */
  figuresPlaced?: number;
}

/**
 * The reason a value carries when the case reached us with no calculator
 * mapping at all (a case produced before the parser emitted one).
 *
 * Exported so tests and the UI assert on it rather than on prose that may be
 * reworded. It is deliberately still the "nothing was written" wording: from
 * the user's point of view that is exactly what happened.
 */
export const ESG_MAPPING_PENDING_REASON =
  "The workbook mapping for ESG documents is not built yet — this value was read but not written to any cell.";

/**
 * The reason a reading carries when the parser mapped the case but said nothing
 * about this particular field — it never reached the calculator layer, so we
 * have nothing to place and nothing to explain beyond that.
 */
const ESG_UNTRACKED_REASON =
  "The parser read this value but did not carry it through to the scoring layer, so there is no cell to put it in.";

/** True when a parser value is worth reporting at all. */
function isRealValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Every value the ESG parser read, flattened, with its provenance.
 *
 * This is NOT a mapping — it makes no claim about where anything belongs. It
 * exists so the UI can report what was read even with the mapping layer
 * stubbed, and so the implementing agent has one place that already knows how
 * to walk the case result.
 */
export function collectEsgExtractedValues(
  caseResult: EsgParserCaseLike | null,
): EsgUnplacedValue[] {
  const out: EsgUnplacedValue[] = [];
  for (const extraction of caseResult?.ai_entities?.extractions ?? []) {
    const element = String(extraction.element ?? "");
    for (const entry of extraction.values ?? []) {
      const field = String(entry?.field ?? "").trim();
      if (!field || !isRealValue(entry?.value)) continue;
      out.push({
        field,
        value: entry.value,
        // The parser stamps provenance on each value AND on the extraction;
        // the per-value one is the more specific of the two.
        sourceFile: String(entry.sourceFile ?? extraction.sourceFile ?? ""),
        documentId: String(entry.sourceDocumentId ?? extraction.documentId ?? ""),
        element,
        reason: ESG_MAPPING_PENDING_REASON,
      });
    }
  }
  return out;
}

/**
 * Turn an ESG parser case into workbook section patches.
 *
 * ── THE ACCOUNTING UNIT IS ONE READING ─────────────────────────────────────
 * `valuesRead` counts what the parser actually read: one entry per (field,
 * document) pair, exactly what `collectEsgExtractedValues` returns. Three bills
 * that agree on a figure are three readings, and the panel says so.
 *
 * Each reading is then given a fate from what the mapping layer did with its
 * FIELD — the unit the parser resolves on:
 *   placed    the field reached at least one cell, and this reading is part of
 *             the evidence for it (so it carries its own file and document id).
 *   unplaced  the field reached no cell, with the reason in plain language.
 *   conflict  the field is contested; it is represented by an entry in
 *             `conflicts`, and never counted as placed or unplaced.
 *
 * So `placed + unplaced + (readings behind conflicts) === valuesRead`, and a
 * contested figure is never quietly dropped from the count.
 *
 * It never throws. Throwing here would take down a flow that is otherwise
 * correct and useful (the documents are read, priced, charged and archived) and
 * would hide the one thing the user most needs to be told — what was and was
 * not filled in. Visible and honest beats loud and broken.
 */
export function applyEsgParserResult(
  caseResult: EsgParserCaseLike | null,
  options: {
    /** Place on exactly these axes (the answer-key run). */
    axes?: EsgReportingAxes;
    /**
     * The workbook being filled. What it states about its sites and months
     * wins, and a workbook holding monthly figures keeps its axes; whatever
     * it leaves open is taken from the documents and recorded with the
     * figures. Absent — a company being created — everything is.
     */
    workbook?: EsgWorkbookAxisState | null;
  } = {},
): EsgInjectionResult {
  const readings = collectEsgExtractedValues(caseResult);
  const calculator = caseResult?.ai_entities?.calculator ?? null;

  // No calculator half at all: nothing can be placed without inventing a second
  // field→key table on the client, which is precisely the drift this design
  // exists to prevent. Report every reading, write nothing.
  if (!calculator) {
    return {
      implemented: true,
      patches: {},
      placed: [],
      unplaced: readings,
      conflicts: [],
      valuesRead: readings.length,
      figuresPlaced: 0,
    };
  }

  const placement = options.axes
    ? { axes: options.axes, cells: {} as Record<string, string | number> }
    : esgPlacementAxes(caseResult, options.workbook);
  const mapped = mapEsgCalculatorToWorkbook(calculator, { axes: placement.axes });

  const placed: EsgPlacedValue[] = [];
  const unplaced: EsgUnplacedValue[] = [];

  for (const reading of readings) {
    // A reading whose fate is known for its own document (a bill's figure, the
    // site and period that placed it) answers for itself; the rest share their
    // field's fate.
    const outcome = mapped.sourceOutcomes?.[reading.field]?.[reading.sourceFile] ?? mapped.outcomes[reading.field];

    if (outcome?.status === "conflict") continue; // accounted for by `conflicts`

    if (outcome?.status === "placed") {
      /*
       * ONE READING, ONE ENTRY. A reading can fill more than one cell (the
       * sector is written to the cover AND the assumptions sheet, because the
       * workbook records it twice) — but that is the workbook duplicating a
       * fact, not the parser reading it twice, so it is reported once against
       * the first cell. Keeping this 1:1 is what makes the reconciliation
       * invariant hold.
       */
      const cell = outcome.cells[0];
      placed.push({
        sectionId: cell?.sectionId ?? "",
        cellRef: cell?.cellRef ?? "",
        field: reading.field,
        value: (cell?.value ?? null) as EsgCellValue,
        sourceFile: reading.sourceFile,
        documentId: reading.documentId,
      });
      continue;
    }

    unplaced.push({
      ...reading,
      reason: outcome?.reason ?? ESG_UNTRACKED_REASON,
      // A reading the scoring layer never received has no cell either.
      ...(outcome?.rejection ? { rejection: outcome.rejection } : outcome ? {} : { rejection: "no_workbook_home" as const }),
      ...(outcome?.choice ? { choice: outcome.choice } : {}),
      ...(outcome?.partOf ? { partOf: outcome.partOf } : {}),
    });
  }

  // What a person answered in the review: each placed figure moves, with its
  // site and period, from "could not be placed" to the cell they chose.
  const answered: EsgAnsweredValue[] = [];
  for (const placement of esgManualPlacements(caseResult)) {
    const figure = unplaced.find((u) => u.choice?.id === placement.choiceId);
    if (!figure?.choice) continue; // the figure is no longer held: its document was replaced, or it now places itself
    const section = mapped.patches[placement.sectionId] ?? (mapped.patches[placement.sectionId] = { cells: {} });
    section.cells[placement.cellRef] = placement.value;
    answered.push({ placement, choice: figure.choice, field: figure.field, sourceFile: figure.sourceFile });
    for (let i = unplaced.length - 1; i >= 0; i -= 1) {
      const u = unplaced[i];
      // The figure — however many times it was read — and its site and period.
      if (u.choice?.id !== placement.choiceId && u.partOf !== placement.choiceId) continue;
      placed.push({
        sectionId: placement.sectionId,
        cellRef: placement.cellRef,
        field: u.field,
        value: placement.value,
        sourceFile: u.sourceFile,
        documentId: u.documentId,
      });
      unplaced.splice(i, 1);
    }
  }

  // The axes the figures were placed on travel WITH them: a workbook that
  // later read its axes from anywhere else would re-point every cell. With no
  // monthly figure placed — by the documents or by a person — there is
  // nothing to anchor, and the workbook's axes stay open for the documents
  // that do place one.
  const placedMonthly = esgWorkbookAxisState(mapped.patches["e-data"]?.cells).filled;
  if (placedMonthly && Object.keys(placement.cells).length > 0) {
    const eData = mapped.patches["e-data"] ?? (mapped.patches["e-data"] = { cells: {} });
    eData.cells = { ...placement.cells, ...eData.cells };
  }

  return {
    implemented: true,
    patches: mapped.patches,
    placed,
    unplaced,
    answered,
    axes: placement.axes,
    conflicts: mapped.conflicts.map((conflict) => ({
      sectionId: conflict.sectionId,
      cellRef: conflict.cellRef,
      label: conflict.label,
      candidates: conflict.candidates,
    })),
    valuesRead: readings.length,
    figuresPlaced: esgFigureCount(mapped.patches),
  };
}

/** Why a value has no cell at all: evidence a person reads, not a failure to place. */
export const ESG_NO_CELL_REJECTIONS: ReadonlySet<string> = new Set(["no_workbook_home", "derived_cell", "unknown_field"]);

/**
 * What the unplaced values ask of a person: figures to place by answering a
 * question, values to check or enter by hand, and evidence no cell needs.
 * A figure's site and period travel with it, and a figure read twice is one.
 */
export function esgUnplacedKinds(unplaced: EsgUnplacedValue[]): { toPlace: number; toCheck: number; evidence: number } {
  const questions = new Set<string>();
  let toCheck = 0;
  let evidence = 0;
  for (const u of unplaced) {
    if (u.partOf) continue;
    if (u.choice) questions.add(u.choice.id);
    else if (u.rejection && ESG_NO_CELL_REJECTIONS.has(u.rejection)) evidence += 1;
    else toCheck += 1;
  }
  return { toPlace: questions.size, toCheck, evidence };
}

/** The placements a person made in the review, as the case carries them. */
export function esgManualPlacements(caseResult: EsgParserCaseLike | null): EsgManualPlacement[] {
  const raw = caseResult?.manual_placements;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (p): p is EsgManualPlacement =>
      !!p && typeof p === "object" &&
      typeof (p as EsgManualPlacement).choiceId === "string" &&
      typeof (p as EsgManualPlacement).sectionId === "string" &&
      typeof (p as EsgManualPlacement).cellRef === "string" &&
      typeof (p as EsgManualPlacement).value === "number" && Number.isFinite((p as EsgManualPlacement).value),
  );
}

/**
 * The cell a figure's answer puts it in: the site's row and the month's column
 * of its grid. Null until every question it asks is answered.
 */
export function esgChoiceCell(
  choice: EsgPlacementChoice,
  answer: { siteRow?: number; month?: string },
): { sectionId: string; cellRef: string } | null {
  const siteRow = answer.siteRow ?? choice.siteRow ?? (choice.needs.includes("site") ? undefined : 0);
  const month = answer.month ?? choice.month;
  if (siteRow === undefined || siteRow < 0 || !month || !/^[A-Z]$/.test(month)) return null;
  return { sectionId: "e-data", cellRef: esgMonthlyCellRef(choice.prefix, siteRow, month) };
}

/**
 * The case with a figure placed where a person said — or, with no cell, its
 * placement taken back. Replaces any earlier answer to the same question.
 */
export function withEsgManualPlacement(
  caseResult: EsgParserCaseLike,
  choiceId: string,
  placement: Omit<EsgManualPlacement, "choiceId"> | null,
): EsgParserCaseLike {
  const kept = esgManualPlacements(caseResult).filter((p) => p.choiceId !== choiceId);
  return { ...caseResult, manual_placements: placement ? [...kept, { choiceId, ...placement }] : kept };
}

/**
 * Figures a patch set writes: its cells, less the furniture — register meta
 * (`_row_count`) and the sites and months recorded with the figures.
 */
export function esgFigureCount(patches: EsgSectionPatches): number {
  return Object.entries(patches).reduce(
    (sum, [sectionId, section]) =>
      sum +
      Object.keys(section?.cells ?? {}).filter(
        (ref) => !ref.startsWith("_") && (sectionId !== "e-data" || !isEsgAxisCell(ref)),
      ).length,
    0,
  );
}

/** How many cells a patch set would write. Used for honest UI counts. */
export function esgPatchCellCount(patches: EsgSectionPatches): number {
  // The sites and months recorded with the figures are settings, not values.
  return Object.entries(patches).reduce(
    (sum, [sectionId, section]) =>
      sum + Object.keys(section?.cells ?? {}).filter((ref) => sectionId !== "e-data" || !isEsgAxisCell(ref)).length,
    0,
  );
}

/**
 * Write the mapped sections into the company's ESG workbook.
 *
 * Uses the SAME endpoint and payload the `.xlsx` import confirms with, so a
 * document-parsed workbook and an Excel-imported one are the same thing by the
 * time anything scores. Returns false (never throws) when there is nothing to
 * write, so the caller can carry on to the workbook either way.
 */
export async function persistEsgSectionPatches(
  companyId: string,
  patches: EsgSectionPatches,
): Promise<boolean> {
  if (!companyId || esgPatchCellCount(patches) === 0) return false;
  const res = await fetch(
    `${API_BASE}/api/esg/workbook/${encodeURIComponent(companyId)}/import`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true, sections: patches }),
    },
  );
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(
      (detail as { error?: string } | null)?.error ??
        `Could not write the extracted values into the workbook (${res.status})`,
    );
  }
  return true;
}
