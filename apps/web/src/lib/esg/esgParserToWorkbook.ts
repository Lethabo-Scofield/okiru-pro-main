/**
 * ESG calculator payload → ESG workbook section patches.
 *
 * The engine that sits between `esgParserFieldBridge` (WHERE a value goes) and
 * `esgWorkbookInjection` (WHAT SHAPE it must be in to go there). It owns the
 * three things a table cannot express:
 *
 *   • REGISTERS. An array-valued field (`fleet_vehicle_rows`, `ee_level_rows`)
 *     expands into N rows through `writeEsgGridCells`, which resolves each
 *     column to its Excel letter — including the ISO and IFRS sheets, whose
 *     data starts at B and keeps a sheet-derived `Score /5` in E.
 *
 *   • CONTEXT. Several cells are addressed by site AND month, or by quarter. A
 *     figure only reaches one when its own site/period travels with it: inside
 *     the same register row, or on a case-level reading whose site, period and
 *     figure all came from ONE file. A figure with no resolvable address is
 *     reported, never dropped into the first row of the grid.
 *
 *   • CONFLICT. Two documents proposing different values for the same cell put
 *     that cell in `conflicts` and leave it OUT of `patches`. We never pick.
 *
 * Nothing here writes a cell `esgDeriveSummary.ts` computes: EVERY emitted cell
 * passes `isEsgDerivedCell` on the way out, so the guarantee holds for cells the
 * mapping table names, cells a grid produced, and cells built from an axis alike.
 */
import { writeEsgGridCells, type EsgGridRow } from "./esgGridRows";
import { ESG_GRID_SECTIONS, type EsgGridSectionId } from "./esgGridSections";
import {
  ESG_FALLBACK_REPORTING_AXES,
  type EsgReportingAxes,
} from "@/components/esg-workbook/esgDefaults";
import {
  esgCellOptions,
  esgGridColumnOptions,
  normaliseEsgValue,
  type EsgCellKind,
  type EsgCellValue,
  type EsgRejectionReason,
} from "./esgWorkbookInjection";
import {
  ESG_DERIVED_KEY_HOMES,
  ESG_GRID_TARGETS,
  ESG_HEADCOUNT_COLUMN_ORDER,
  ESG_HS_QUARTERLY_ROWS,
  ESG_MONTHLY_PREFIXES,
  ESG_SAQ_ROW_TARGET,
  ESG_SCALAR_TARGETS,
  esgDepotRowIndex,
  esgHeadcountRowIndex,
  esgMonthColumnFor,
  esgMonthlyCellRef,
  esgQuarterColumn,
  isEsgDerivedCell,
} from "./esgParserFieldBridge";

/* ------------------------------------------------------------------ *
 * The shape the ESG parser hands over
 * ------------------------------------------------------------------ */

/** One allowlisted key the parser mapped, with the files that agreed on it. */
export interface EsgCalculatorEntryLike {
  key: string;
  value: unknown;
  /** The matrix field name the key came from — how a reading is traced back. */
  sourceField: string;
  sourceFiles?: string[];
  agreementCount?: number;
}

/** One expanded register row: allowlisted key → typed value. */
export interface EsgCalculatorRowLike {
  /** The rows-field it came from, e.g. `fleet_vehicle_rows`. */
  grid: string;
  index?: number;
  cells: Record<string, unknown>;
  sourceFiles?: string[];
  droppedFields?: string[];
}

export interface EsgCalculatorResultLike {
  payload?: Record<string, unknown>;
  rows?: EsgCalculatorRowLike[];
  entries?: EsgCalculatorEntryLike[];
  unmapped?: Array<{ field: string; reason?: string }>;
  needsReview?: Array<{ field: string; values?: unknown[]; sources?: string[] }>;
}

/* ------------------------------------------------------------------ *
 * What this layer returns
 * ------------------------------------------------------------------ */

export type EsgSectionPatchMap = Record<string, { cells: Record<string, EsgCellValue> }>;

export interface EsgPlacedCell {
  sectionId: string;
  cellRef: string;
  value: EsgCellValue;
}

/** What became of every reading of one parser field. */
export interface EsgFieldOutcome {
  status: "placed" | "unplaced" | "conflict";
  /** Cells this field filled. Empty unless `status` is "placed". */
  cells: EsgPlacedCell[];
  /** Plain-language, shown to the user verbatim. */
  reason?: string;
  rejection?: EsgRejectionReason;
}

export interface EsgCellConflict {
  sectionId: string;
  cellRef: string;
  label: string;
  candidates: Array<{ value: unknown; sources: string[] }>;
  /** Parser fields whose readings this conflict accounts for. */
  fields: string[];
}

export interface EsgWorkbookMappingResult {
  patches: EsgSectionPatchMap;
  /** Parser field name → outcome. The UI attributes each reading through this. */
  outcomes: Record<string, EsgFieldOutcome>;
  conflicts: EsgCellConflict[];
}

/* ------------------------------------------------------------------ *
 * Monthly-grid targets
 * ------------------------------------------------------------------ */

/**
 * Keys that land in an `E_Data` monthly grid, and the context each needs.
 *
 * `siteKey` is omitted for blocks the workbook keeps as a single row (Scope 1C
 * LPG and Scope 1D business cars), which need only a month.
 */
const ESG_MONTHLY_TARGETS: Record<
  string,
  { prefix: string; siteKey?: string; periodKeys: string[]; unit: string }
> = {
  // UNIT: kWh as billed. The Scope 2 grid stores raw kWh; the tCO₂e column
  // beside it is a preview computed from `E_Data!B7`, not a stored value.
  "energy.electricity_kwh": {
    prefix: ESG_MONTHLY_PREFIXES.electricity,
    siteKey: "energy.site_name",
    periodKeys: ["energy.billing_period_end", "energy.billing_period_start"],
    unit: "kWh",
  },
  "energy.solar_kwh_generated": {
    prefix: ESG_MONTHLY_PREFIXES.solar,
    siteKey: "energy.site_name",
    periodKeys: ["energy.billing_period_end", "energy.billing_period_start"],
    unit: "kWh",
  },
  "energy.generator_diesel_litres": {
    prefix: ESG_MONTHLY_PREFIXES.generatorDiesel,
    siteKey: "energy.site_name",
    periodKeys: ["energy.billing_period_end", "energy.billing_period_start"],
    unit: "litres",
  },
  // Scope 1C is one row on the sheet (`E_Data!A32`), so a month is enough.
  "energy.lpg_kg": {
    prefix: ESG_MONTHLY_PREFIXES.lpg,
    periodKeys: ["energy.billing_period_end", "energy.billing_period_start"],
    unit: "kg",
  },
  /*
   * UNIT: kilolitres, stored as billed — NO conversion.
   *
   * The editor renders the water grid with `emissionFactor = waterPerKl × 1000`
   * and then divides by 1000 for the preview, because the published factor is
   * 0.000344 TONNES of CO₂e per kL while the grid's preview divides kilogram
   * factors by 1000. That ×1000 is a display arrangement inside the tCO₂e
   * preview; the stored cell is kilolitres and multiplying here would inflate
   * water consumption a thousandfold.
   */
  "water.kl": {
    prefix: ESG_MONTHLY_PREFIXES.water,
    siteKey: "water.site_name",
    periodKeys: ["water.billing_period_end", "water.billing_period_start"],
    unit: "kL",
  },
};

/** Row-level equivalents, for a register row that carries its own context. */
const ESG_ROW_MONTHLY_GRIDS: Record<
  string,
  { valueKey: string; prefix: string; siteKey?: string; periodKeys: string[] }
> = {
  energy_site_rows: {
    valueKey: "energy.electricity_kwh",
    prefix: ESG_MONTHLY_PREFIXES.electricity,
    siteKey: "energy.site_name",
    periodKeys: ["energy.billing_period_end", "energy.billing_period_start"],
  },
};

/* ------------------------------------------------------------------ *
 * Plain-language reasons
 * ------------------------------------------------------------------ */

/**
 * Why a key has no workbook cell.
 *
 * Specific first, then a per-namespace sentence. Every one of these is shown to
 * a user verbatim, so they say what the workbook DOES hold rather than only
 * what it does not — "no mapping" tells a client nothing they can act on.
 */
const NO_HOME_BY_KEY: Record<string, string> = {
  "board.non_executive_directors":
    "The governance sheet counts INDEPENDENT non-executive directors (G_Data!B6), not non-executives as a whole, so this count has no cell of its own.",
  "board.esg_report_published":
    "The governance sheet has one publication row, and it asks about the integrated report (G_Data!B20). A separate ESG report is not captured.",
  "board.charter_present":
    "The workbook has no board-charter row; the charter is evidence behind the board composition figures rather than a scored cell.",
  "ee.headcount_disabled":
    "The workforce grid records race and gender per level, not disability per level. The workbook wants ONE disability headcount (S_Data!B88), which the parser does not yet emit as its own value.",
  "ee.non_permanent_headcount":
    "The workforce grid's last row is Temporary employees, split by race and gender — a single non-permanent total has no cell to go in.",
  "hs.fatalities_count":
    "The workbook does hold quarterly fatalities (S_Data row 28) and scores them, but the health-and-safety form does not show that row yet — so we do not write a figure you could not see or correct.",
  "entity.reporting_period_start":
    "The cover sheet holds ONE free-text reporting period. We do not build a period label out of two dates.",
  "entity.reporting_period_end":
    "The cover sheet holds ONE free-text reporting period. We do not build a period label out of two dates.",
  "entity.payroll":
    "The training sheet's payroll cell is LEVIABLE payroll (S_Data!B43), which is a narrower figure than total employee cost, so a total payroll is not written there.",
};

const NO_HOME_BY_NAMESPACE: Record<string, string> = {
  energy:
    "The environmental sheet records energy per site per month, plus the totals it calculates. Account, tariff, meter and demand detail is evidence an assurance provider reads, and has no cell.",
  emissions:
    "The carbon-tax figures are calculated by the workbook from the emissions grids and the Assumptions thresholds; they are not captured.",
  climate:
    "Only the net-zero target year is captured (Assumptions!B107 and the cover sheet). The rest of the climate-strategy detail has no cell.",
  fleet:
    "The fleet register records a vehicle per row and the driver debrief a route per row. Fuel-card transactions and telematics event counts have no register in this workbook.",
  waste:
    "The waste register records a stream per row and the contractor block records the site totals. Permits, facilities and certificate numbers are evidence, not cells.",
  water:
    "The environmental sheet records water volume per site per month. Account, meter, sanitation and alternative-source detail has no cell.",
  iso:
    "The ISO tracker is a clause-by-clause register. A certificate's own details — number, body, scope, dates — have no cell on it.",
  ee: "The employment-equity sheet holds the workforce matrix and six Yes/Partial/No assertions. This fact is not one of them.",
  hs: "The health-and-safety block is quarterly and covers headcount, hours, injuries, training and induction. This figure is not one of its rows.",
  training:
    "The skills sheet holds the WSP/ATR assertions, the spend and hours totals, and the OFO intervention register. This detail has no cell.",
  csi: "The community sheet holds the initiative register and the NPAT denominator. This detail has no cell.",
  supplier:
    "The supplier register scores seven criteria from 1 to 5 per supplier. Certifications, codes and counts are not among them.",
  board:
    "The governance sheet records board COUNTS and Yes/Partial/No assertions, not a directors or committee register.",
  ethics:
    "The governance sheet records the ethics assertions and the COUNT of penalties (G_Data!B25). It has no penalties register.",
  risk:
    "The governance sheet records whether risk and assurance processes are in place. The engagement's own details have no cell.",
  entity:
    "The cover and assumptions sheets hold the entity, its sector and its currency. Financial and B-BBEE detail belongs to other scorecards.",
};

function noHomeReason(key: string): string {
  const specific = NO_HOME_BY_KEY[key];
  if (specific) return specific;
  const namespace = key.split(".")[0];
  return (
    NO_HOME_BY_NAMESPACE[namespace] ??
    "The ESG workbook has no cell for this value, so it was read and reported rather than written."
  );
}

/* ------------------------------------------------------------------ *
 * The engine
 * ------------------------------------------------------------------ */

interface Proposal {
  sectionId: string;
  cellRef: string;
  value: EsgCellValue;
  label: string;
  field: string;
  sources: string[];
}

class PatchBuilder {
  private readonly proposals = new Map<string, Proposal[]>();

  propose(p: Proposal): void {
    const id = `${p.sectionId}!${p.cellRef}`;
    const existing = this.proposals.get(id);
    if (existing) existing.push(p);
    else this.proposals.set(id, [p]);
  }

  /** Cells everyone agreed on, and the ones they did not. */
  settle(): { cells: Map<string, Proposal>; conflicts: EsgCellConflict[]; contestedFields: Set<string> } {
    const cells = new Map<string, Proposal>();
    const conflicts: EsgCellConflict[] = [];
    const contestedFields = new Set<string>();

    for (const [id, group] of this.proposals) {
      const distinct = new Map<string, Proposal[]>();
      for (const p of group) {
        const key = JSON.stringify(p.value);
        const bucket = distinct.get(key);
        if (bucket) bucket.push(p);
        else distinct.set(key, [p]);
      }
      if (distinct.size <= 1) {
        cells.set(id, group[0]);
        continue;
      }
      // Two documents, two answers, one cell. The user picks — we do not.
      const first = group[0];
      conflicts.push({
        sectionId: first.sectionId,
        cellRef: first.cellRef,
        label: first.label,
        candidates: Array.from(distinct.values()).map((bucket) => ({
          value: bucket[0].value,
          sources: Array.from(new Set(bucket.flatMap((p) => p.sources))).filter(Boolean),
        })),
        fields: Array.from(new Set(group.map((p) => p.field))),
      });
      for (const p of group) contestedFields.add(p.field);
    }
    return { cells, conflicts, contestedFields };
  }
}

function entryIndex(entries: readonly EsgCalculatorEntryLike[]): Map<string, EsgCalculatorEntryLike> {
  const index = new Map<string, EsgCalculatorEntryLike>();
  for (const entry of entries) {
    if (entry?.key) index.set(entry.key, entry);
  }
  return index;
}

/**
 * Two readings demonstrably came from the SAME single document.
 *
 * This is what makes case-level context safe. The parser resolves fields across
 * the whole case, so `electricity_kwh` and `site_name` are separate resolved
 * facts by the time they reach us — combining them would be a guess UNLESS both
 * were read from one file and one file only, in which case they are two columns
 * of the same row of the same bill.
 */
function sharesOneSource(a: EsgCalculatorEntryLike, b: EsgCalculatorEntryLike | undefined): boolean {
  if (!b) return false;
  const left = (a.sourceFiles ?? []).filter(Boolean);
  const right = (b.sourceFiles ?? []).filter(Boolean);
  return left.length === 1 && right.length === 1 && left[0] === right[0];
}

/** A readable name for a cell, for the conflict list. */
function cellLabel(sectionId: string, cellRef: string, key: string): string {
  return `${key} (${sectionId} ${cellRef})`;
}

function normaliseForCell(
  sectionId: string,
  cellRef: string,
  kind: EsgCellKind,
  raw: unknown,
): ReturnType<typeof normaliseEsgValue> {
  return normaliseEsgValue(kind, raw, esgCellOptions(sectionId, cellRef));
}

export function mapEsgCalculatorToWorkbook(
  calculator: EsgCalculatorResultLike | null | undefined,
  options: { axes?: EsgReportingAxes } = {},
): EsgWorkbookMappingResult {
  const axes = options.axes ?? ESG_FALLBACK_REPORTING_AXES;
  const outcomes: Record<string, EsgFieldOutcome> = {};
  const builder = new PatchBuilder();
  const gridCells = new Map<string, Record<string, EsgCellValue>>();

  const entries = (calculator?.entries ?? []).filter((e) => e && typeof e.key === "string");
  const byKey = entryIndex(entries);

  const record = (field: string, outcome: EsgFieldOutcome): void => {
    if (!field) return;
    const existing = outcomes[field];
    // A field that reached a cell stays placed even if another of its targets
    // could not be filled — the honest summary is "some of this landed".
    //
    // `conflict` is the one exception, because it is not a downgrade: it is
    // computed AFTER settling and means we deliberately wrote nothing. The
    // monthly-grid and register passes record "placed" optimistically while
    // proposing, so without this a cell two documents disagreed about reported
    // "placed" against an empty patch set — a phantom save.
    if (existing?.status === "placed" && outcome.status !== "placed" && outcome.status !== "conflict") {
      return;
    }
    outcomes[field] = outcome;
  };

  /* ---------------- Registers ---------------- */

  const rows = calculator?.rows ?? [];
  const rowsByGrid = new Map<string, EsgCalculatorRowLike[]>();
  for (const row of rows) {
    if (!row?.grid) continue;
    const bucket = rowsByGrid.get(row.grid);
    if (bucket) bucket.push(row);
    else rowsByGrid.set(row.grid, [row]);
  }

  for (const [gridField, gridRows] of rowsByGrid) {
    if (ESG_ROW_MONTHLY_GRIDS[gridField]) {
      applyMonthlyRows(gridField, gridRows, axes, builder, record);
      continue;
    }
    if (gridField === "ee_level_rows") {
      applyHeadcountRows(gridRows, builder, record);
      continue;
    }
    const target = ESG_GRID_TARGETS[gridField];
    if (!target) {
      record(gridField, {
        status: "unplaced",
        cells: [],
        rejection: "no_workbook_home",
        reason:
          "This workbook has no register for these rows, so they were read and reported rather than written to a sheet.",
      });
      continue;
    }
    applyRegisterRows(gridField, gridRows, target.sectionId, target.columns, gridCells, record);
  }

  /* ---------------- Supplier questionnaire ---------------- */

  applySaqRow(byKey, gridCells, record);

  /* ---------------- Scalars ---------------- */

  const saqKeys = new Set(Object.keys(ESG_SAQ_ROW_TARGET.columns));

  for (const entry of entries) {
    const key = entry.key;
    const field = entry.sourceField || key;
    if (saqKeys.has(key)) continue; // already handled as the SAQ row

    const derived = ESG_DERIVED_KEY_HOMES[key];
    if (derived) {
      record(field, {
        status: "unplaced",
        cells: [],
        rejection: "derived_cell",
        reason: `The workbook calculates this itself (${derived.cell}) — ${derived.detail}. Writing it would freeze a figure that should follow your inputs.`,
      });
      continue;
    }

    const targets = ESG_SCALAR_TARGETS[key];
    if (targets?.length) {
      let placedAny = false;
      let lastFailure: EsgFieldOutcome | null = null;
      for (const target of targets) {
        const result = normaliseForCell(target.sectionId, target.cell, target.kind, entry.value);
        if (!result.ok) {
          lastFailure = {
            status: "unplaced",
            cells: [],
            rejection: result.reason,
            reason: `We could not put this in ${target.sectionId} ${target.cell}: ${result.detail}.`,
          };
          continue;
        }
        builder.propose({
          sectionId: target.sectionId,
          cellRef: target.cell,
          value: result.value,
          label: cellLabel(target.sectionId, target.cell, key),
          field,
          sources: entry.sourceFiles ?? [],
        });
        placedAny = true;
      }
      if (placedAny) record(field, { status: "placed", cells: [] });
      else if (lastFailure) record(field, lastFailure);
      continue;
    }

    const quarterly = ESG_HS_QUARTERLY_ROWS[key];
    if (quarterly) {
      applyQuarterlyScalar(key, field, entry, quarterly, byKey, builder, record);
      continue;
    }

    const monthly = ESG_MONTHLY_TARGETS[key];
    if (monthly) {
      applyMonthlyScalar(key, field, entry, monthly, byKey, axes, builder, record);
      continue;
    }

    record(field, {
      status: "unplaced",
      cells: [],
      rejection: "no_workbook_home",
      reason: noHomeReason(key),
    });
  }

  /* ---------------- Everything the parser held back ---------------- */

  const conflicts: EsgCellConflict[] = [];

  for (const review of calculator?.needsReview ?? []) {
    const field = String(review?.field ?? "");
    if (!field) continue;
    /*
     * The parser withholds a contested field BEFORE mapping it, so its
     * destination cell is genuinely unknown here — there is no key, therefore no
     * section and no reference. `sectionId` is empty and `cellRef` carries the
     * contested field name so the entry still has a stable identity in the UI.
     */
    conflicts.push({
      sectionId: "",
      cellRef: field,
      label: `${field} — your documents disagree`,
      candidates: (review.values ?? []).map((value) => ({
        value,
        sources: (review.sources ?? []).filter(Boolean),
      })),
      fields: [field],
    });
    record(field, { status: "conflict", cells: [] });
  }

  for (const unmapped of calculator?.unmapped ?? []) {
    const field = String(unmapped?.field ?? "");
    if (!field || outcomes[field]) continue;
    record(field, {
      status: "unplaced",
      cells: [],
      rejection: unmapped.reason === "uncoercible" ? "failed_validation" : "unknown_field",
      reason:
        unmapped.reason === "uncoercible"
          ? "The value could not be read as the number, date or option this figure has to be."
          : "This is evidence the ESG scorecard does not consume, so it was read and reported rather than written.",
    });
  }

  /* ---------------- Settle, guard, and build the patches ---------------- */

  const settled = builder.settle();
  conflicts.push(...settled.conflicts);
  for (const field of settled.contestedFields) {
    record(field, { status: "conflict", cells: [] });
  }

  const patches: EsgSectionPatchMap = {};
  const addCell = (sectionId: string, cellRef: string, value: EsgCellValue): boolean => {
    // THE GATE. Every cell — table, grid or axis — passes here.
    if (isEsgDerivedCell(sectionId, cellRef)) return false;
    const section = patches[sectionId] ?? (patches[sectionId] = { cells: {} });
    section.cells[cellRef] = value;
    return true;
  };

  for (const [, proposal] of settled.cells) {
    const written = addCell(proposal.sectionId, proposal.cellRef, proposal.value);
    if (written) {
      const outcome = outcomes[proposal.field];
      if (outcome?.status === "placed") {
        outcome.cells.push({
          sectionId: proposal.sectionId,
          cellRef: proposal.cellRef,
          value: proposal.value,
        });
      }
    } else {
      record(proposal.field, {
        status: "unplaced",
        cells: [],
        rejection: "derived_cell",
        reason: `${proposal.sectionId} ${proposal.cellRef} is calculated by the workbook, so it is never written directly.`,
      });
    }
  }

  for (const [sectionId, cells] of gridCells) {
    for (const [cellRef, value] of Object.entries(cells)) {
      if (value === undefined || value === null) continue;
      // Grid meta (`_rows`, `_principles_filled`) is not a sheet cell and is
      // exempt from the derived-cell test, but a real reference is not.
      if (cellRef.startsWith("_")) {
        const section = patches[sectionId] ?? (patches[sectionId] = { cells: {} });
        section.cells[cellRef] = value;
        continue;
      }
      addCell(sectionId, cellRef, value);
    }
  }

  return { patches, outcomes, conflicts };
}

/* ------------------------------------------------------------------ *
 * Register expansion
 * ------------------------------------------------------------------ */

function applyRegisterRows(
  gridField: string,
  rows: EsgCalculatorRowLike[],
  sectionId: EsgGridSectionId,
  columns: Readonly<Record<string, string>>,
  gridCells: Map<string, Record<string, EsgCellValue>>,
  record: (field: string, outcome: EsgFieldOutcome) => void,
): void {
  const def = ESG_GRID_SECTIONS[sectionId];
  const built: EsgGridRow[] = [];
  const rejected: string[] = [];

  const ordered = [...rows].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

  for (const row of ordered) {
    const gridRow: EsgGridRow = { _id: `esg_parser_${sectionId}_${built.length}` };
    let filled = false;
    for (const [key, columnKey] of Object.entries(columns)) {
      if (!(key in row.cells)) continue;
      const column = def.columns.find((c) => c.key === columnKey);
      const kind = gridColumnKind(column?.type);
      const result = normaliseEsgValue(kind, row.cells[key], esgGridColumnOptions(sectionId, columnKey));
      if (!result.ok) {
        rejected.push(`${key}: ${result.detail}`);
        continue;
      }
      gridRow[columnKey] = result.value;
      filled = true;
    }
    if (filled) built.push(gridRow);
  }

  if (built.length === 0) {
    record(gridField, {
      status: "unplaced",
      cells: [],
      rejection: rejected.length > 0 ? "no_matching_option" : "empty",
      reason:
        rejected.length > 0
          ? `None of these rows could be written as the register records them (${rejected[0]}).`
          : "These rows carried nothing the register holds.",
    });
    return;
  }

  const cells = writeEsgGridCells(sectionId, built) as Record<string, EsgCellValue>;
  /*
   * `syncDerivedFields` inside `writeEsgGridCells` writes `King5_Scorecard!E21`
   * — and it writes the WEIGHTED total there, where the sheet's `E21` is the
   * RAW score sum. `esgDeriveSummary` forces the correct value on read, but
   * this layer never emits a derived cell, so it is dropped here rather than
   * relied on being overwritten.
   */
  delete cells.E21;

  const existing = gridCells.get(sectionId);
  gridCells.set(sectionId, existing ? { ...existing, ...cells } : cells);

  const lastColumn = def.columns[def.columns.length - 1];
  record(gridField, {
    status: "placed",
    cells: [
      {
        sectionId,
        cellRef: `${def.startRow}–${def.startRow + built.length - 1}`,
        value: built.length,
      },
    ],
    reason:
      rejected.length > 0
        ? `${built.length} row(s) written; ${rejected.length} value(s) did not match what the register accepts.`
        : undefined,
  });
  void lastColumn;
}

function gridColumnKind(type: string | undefined): EsgCellKind {
  switch (type) {
    case "number":
      return "number";
    case "date":
      return "date";
    case "select":
      return "select";
    default:
      return "text";
  }
}

/* ------------------------------------------------------------------ *
 * The EEA2 headcount matrix
 * ------------------------------------------------------------------ */

/**
 * `ee_level_rows` → the headcount grid's `hc_{level}_{column}` cells.
 *
 * Deliberately NOT `S_Data!B5:K11`: those are projected from this grid by
 * `esgDeriveSummary`, along with every row and column total, so writing them
 * directly would put a second, competing source under the same numbers.
 */
function applyHeadcountRows(
  rows: EsgCalculatorRowLike[],
  builder: PatchBuilder,
  record: (field: string, outcome: EsgFieldOutcome) => void,
): void {
  let placed = 0;
  const unmatchedLevels: string[] = [];

  for (const row of rows) {
    const level = row.cells["ee.occupational_level"];
    const rowIndex = esgHeadcountRowIndex(level);
    if (rowIndex === null) {
      // A level we do not recognise is REPORTED. Filing it under the nearest
      // band would move the Black-management indicators invisibly.
      unmatchedLevels.push(String(level ?? "(unnamed level)"));
      continue;
    }
    ESG_HEADCOUNT_COLUMN_ORDER.forEach((key, columnIndex) => {
      if (!(key in row.cells)) return;
      const result = normaliseEsgValue("count", row.cells[key], null);
      if (!result.ok) return;
      builder.propose({
        sectionId: "s-data",
        cellRef: `hc_${rowIndex}_${columnIndex}`,
        value: result.value,
        label: `${key} at ${String(level)}`,
        field: "ee_level_rows",
        sources: row.sourceFiles ?? [],
      });
      placed += 1;
    });
  }

  if (placed === 0) {
    record("ee_level_rows", {
      status: "unplaced",
      cells: [],
      rejection: unmatchedLevels.length > 0 ? "no_matching_option" : "empty",
      reason:
        unmatchedLevels.length > 0
          ? `We could not match the occupational level(s) ${unmatchedLevels.join(", ")} to the workbook's own levels, and we do not file a level under the nearest band.`
          : "These rows carried no headcount figures.",
    });
    return;
  }

  record("ee_level_rows", {
    status: "placed",
    cells: [],
    reason:
      unmatchedLevels.length > 0
        ? `Occupational level(s) ${unmatchedLevels.join(", ")} were not recognised and were left for you to enter.`
        : undefined,
  });
}

/* ------------------------------------------------------------------ *
 * Monthly grids
 * ------------------------------------------------------------------ */

function applyMonthlyRows(
  gridField: string,
  rows: EsgCalculatorRowLike[],
  axes: EsgReportingAxes,
  builder: PatchBuilder,
  record: (field: string, outcome: EsgFieldOutcome) => void,
): void {
  const spec = ESG_ROW_MONTHLY_GRIDS[gridField];
  let placed = 0;
  const unaddressed: string[] = [];

  for (const row of rows) {
    const raw = row.cells[spec.valueKey];
    if (raw === undefined) continue;

    const rowIndex = spec.siteKey ? esgDepotRowIndex(row.cells[spec.siteKey], axes) : 0;
    if (rowIndex === null) {
      unaddressed.push(`site "${String(row.cells[spec.siteKey ?? ""] ?? "unnamed")}"`);
      continue;
    }
    const month = firstMonthColumn(spec.periodKeys.map((k) => row.cells[k]), axes);
    if (!month) {
      unaddressed.push("a billing period outside the workbook's reporting year");
      continue;
    }
    const result = normaliseEsgValue("number", raw, null);
    if (!result.ok) continue;

    builder.propose({
      sectionId: "e-data",
      cellRef: esgMonthlyCellRef(spec.prefix, rowIndex, month),
      value: result.value,
      label: `${spec.valueKey} for ${String(row.cells[spec.siteKey ?? ""] ?? "the site")}`,
      field: gridField,
      sources: row.sourceFiles ?? [],
    });
    placed += 1;
  }

  if (placed === 0) {
    record(gridField, {
      status: "unplaced",
      cells: [],
      rejection: "needs_context",
      reason: unaddressed.length
        ? `The environmental sheet records this per site per month, and we could not place ${unaddressed[0]} on the workbook's own site and month axes.`
        : "These rows carried no figure the environmental sheet records.",
    });
    return;
  }

  record(gridField, {
    status: "placed",
    cells: [],
    reason: unaddressed.length
      ? `${unaddressed.length} row(s) named a site or period the workbook does not carry and were left for you to enter.`
      : undefined,
  });
}

function firstMonthColumn(candidates: unknown[], axes: EsgReportingAxes): string | null {
  for (const candidate of candidates) {
    const column = esgMonthColumnFor(candidate, axes);
    if (column) return column;
  }
  return null;
}

function applyMonthlyScalar(
  key: string,
  field: string,
  entry: EsgCalculatorEntryLike,
  spec: { prefix: string; siteKey?: string; periodKeys: string[]; unit: string },
  byKey: Map<string, EsgCalculatorEntryLike>,
  axes: EsgReportingAxes,
  builder: PatchBuilder,
  record: (field: string, outcome: EsgFieldOutcome) => void,
): void {
  const needsContext = (detail: string): void => {
    record(field, {
      status: "unplaced",
      cells: [],
      rejection: "needs_context",
      reason: `The environmental sheet records this in ${spec.unit} per site per month. ${detail}`,
    });
  };

  let rowIndex = 0;
  if (spec.siteKey) {
    const siteEntry = byKey.get(spec.siteKey);
    if (!sharesOneSource(entry, siteEntry)) {
      needsContext(
        "We could not tell which site this figure belongs to: the site name and the figure did not come from the same single document.",
      );
      return;
    }
    const resolved = esgDepotRowIndex(siteEntry?.value, axes);
    if (resolved === null) {
      needsContext(
        `"${String(siteEntry?.value ?? "")}" is not one of the sites this workbook reports on (${axes.depots.join(", ")}), and we do not file it under the nearest one.`,
      );
      return;
    }
    rowIndex = resolved;
  }

  let month: string | null = null;
  for (const periodKey of spec.periodKeys) {
    const periodEntry = byKey.get(periodKey);
    if (!sharesOneSource(entry, periodEntry)) continue;
    month = esgMonthColumnFor(periodEntry?.value, axes);
    if (month) break;
  }
  if (!month) {
    needsContext(
      "We could not tell which month this figure belongs to: the billing period either did not come from the same document or falls outside the workbook's reporting year.",
    );
    return;
  }

  const result = normaliseEsgValue("number", entry.value, null);
  if (!result.ok) {
    record(field, {
      status: "unplaced",
      cells: [],
      rejection: result.reason,
      reason: `We could not read this as a number: ${result.detail}.`,
    });
    return;
  }

  builder.propose({
    sectionId: "e-data",
    cellRef: esgMonthlyCellRef(spec.prefix, rowIndex, month),
    value: result.value,
    label: cellLabel("e-data", esgMonthlyCellRef(spec.prefix, rowIndex, month), key),
    field,
    sources: entry.sourceFiles ?? [],
  });
  record(field, { status: "placed", cells: [] });
}

/* ------------------------------------------------------------------ *
 * Quarterly health and safety
 * ------------------------------------------------------------------ */

function applyQuarterlyScalar(
  key: string,
  field: string,
  entry: EsgCalculatorEntryLike,
  spec: { row: number; kind: EsgCellKind },
  byKey: Map<string, EsgCalculatorEntryLike>,
  builder: PatchBuilder,
  record: (field: string, outcome: EsgFieldOutcome) => void,
): void {
  const startEntry = byKey.get("hs.period_start");
  const endEntry = byKey.get("hs.period_end");
  if (!sharesOneSource(entry, startEntry) || !sharesOneSource(entry, endEntry)) {
    record(field, {
      status: "unplaced",
      cells: [],
      rejection: "needs_context",
      reason:
        "The health-and-safety block is quarterly, and the reporting period did not come from the same single document as this figure, so we could not tell which quarter it belongs to.",
    });
    return;
  }

  const column = esgQuarterColumn(startEntry?.value, endEntry?.value);
  if (!column) {
    record(field, {
      status: "unplaced",
      cells: [],
      rejection: "needs_context",
      reason:
        "The health-and-safety block is quarterly and this report covers more than one quarter, so there is no single cell to put it in — split it by quarter in the workbook.",
    });
    return;
  }

  const cellRef = `${column}${spec.row}`;
  const result = normaliseForCell("s-data", cellRef, spec.kind, entry.value);
  if (!result.ok) {
    record(field, {
      status: "unplaced",
      cells: [],
      rejection: result.reason,
      reason: `We could not put this in the health-and-safety block: ${result.detail}.`,
    });
    return;
  }

  builder.propose({
    sectionId: "s-data",
    cellRef,
    value: result.value,
    label: cellLabel("s-data", cellRef, key),
    field,
    sources: entry.sourceFiles ?? [],
  });
  record(field, { status: "placed", cells: [] });
}

/* ------------------------------------------------------------------ *
 * Supplier questionnaire
 * ------------------------------------------------------------------ */

/**
 * One completed questionnaire is one supplier, and the parser reports it as
 * document-level values rather than rows — so the register row is assembled
 * here. `supplier` is the register's required column: with no supplier name
 * there is no row, because a rating attached to nobody scores a phantom.
 */
function applySaqRow(
  byKey: Map<string, EsgCalculatorEntryLike>,
  gridCells: Map<string, Record<string, EsgCellValue>>,
  record: (field: string, outcome: EsgFieldOutcome) => void,
): void {
  const present = Object.keys(ESG_SAQ_ROW_TARGET.columns).filter((key) => byKey.has(key));
  if (present.length === 0) return;

  const nameEntry = byKey.get("supplier.name");
  if (!nameEntry) {
    for (const key of present) {
      const entry = byKey.get(key);
      record(entry?.sourceField || key, {
        status: "unplaced",
        cells: [],
        rejection: "failed_validation",
        reason:
          "The supplier register needs a supplier name on every row, and none of these documents named one — a rating with no supplier against it scores nothing.",
      });
    }
    return;
  }

  const row: EsgGridRow = { _id: "esg_parser_saq_0" };
  const failures: string[] = [];
  for (const [key, columnKey] of Object.entries(ESG_SAQ_ROW_TARGET.columns)) {
    const entry = byKey.get(key);
    if (!entry) continue;
    const column = ESG_GRID_SECTIONS.saq.columns.find((c) => c.key === columnKey);
    const result = normaliseEsgValue(
      gridColumnKind(column?.type),
      entry.value,
      esgGridColumnOptions("saq", columnKey),
    );
    if (!result.ok) {
      failures.push(key);
      record(entry.sourceField || key, {
        status: "unplaced",
        cells: [],
        rejection: result.reason,
        reason: `We could not put this in the supplier register: ${result.detail}.`,
      });
      continue;
    }
    row[columnKey] = result.value;
    record(entry.sourceField || key, {
      status: "placed",
      cells: [
        {
          sectionId: "saq",
          cellRef: String(ESG_GRID_SECTIONS.saq.startRow),
          value: result.value,
        },
      ],
    });
  }

  const cells = writeEsgGridCells("saq", [row]) as Record<string, EsgCellValue>;
  const existing = gridCells.get("saq");
  gridCells.set("saq", existing ? { ...existing, ...cells } : cells);
  void failures;
}
