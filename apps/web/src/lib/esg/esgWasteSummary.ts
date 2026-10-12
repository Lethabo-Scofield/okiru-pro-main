/**
 * Where the waste register's three summary figures live, and how to read them.
 *
 * The reference workbook parks its waste scorecard INSIDE the register's own
 * row range: the register starts at row 5, the contractor's monthly
 * "% recycled" row is row 13 (`B13:J13`), and the diversion rate, the monthly
 * recycled share and landfill tCO₂e are `B16`, `B17` and `B18`. That works
 * while a register holds seven streams. A register of a hundred streams — one
 * a parser writes from a year of a dashboard — runs straight through rows
 * 12–20, and then:
 *
 *   - row 13 is a register row, and its depot and quantity were averaged as
 *     the contractor's "% recycled" (a 14.38 kg cardboard line became a 14.38 %
 *     recycling rate, and 4 points);
 *   - `B16`, `B17` and `B18` are register rows' DEPOT cells: the derived rate
 *     was written into a stream's depot, or a depot's name was read as the rate.
 *
 * So the summary keeps its sheet address only while the register does not
 * reach it. Where the register owns the row, the figure lives under a private
 * key of the same section instead, and every reader asks here which one.
 */
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { ESG_GRID_SECTIONS } from "./esgGridSections";

type Cells = Record<string, unknown>;

export const ESG_WASTE_SUMMARY = {
  /** `Waste_Register!B16` — diverted ÷ total, a 0–1 fraction. */
  diversion: { row: 16, cell: "B16", key: "_diversion_rate" },
  /** `Waste_Register!B17` — the contractor's mean monthly recycled share, a 0–1 fraction. */
  recycledMonthly: { row: 17, cell: "B17", key: "_recycled_monthly_share" },
  /** `Waste_Register!B18` — landfill tCO₂e. */
  landfillTco2e: { row: 18, cell: "B18", key: "_landfill_tco2e" },
} as const;

export type EsgWasteSummaryItem = keyof typeof ESG_WASTE_SUMMARY;

/** Why the diversion rate is unknown, when the register cannot state it. */
export const ESG_WASTE_DIVERSION_REASON_KEY = "_diversion_unknown_reason";

/** The legacy contractor "% recycled" monthly row (`B13:J13`). */
export const ESG_WASTE_CORITY_ROW = 13;

const START_ROW = ESG_GRID_SECTIONS.waste.startRow;

const isNumericText = (value: unknown): boolean =>
  typeof value === "number" || (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)));

/**
 * The last sheet row the register occupies, or null when it holds no rows.
 *
 * A register the app wrote is stamped (`_row_count`) and owns exactly that
 * many rows from row 5. An unstamped one (an imported legacy sheet) owns the
 * run of rows from row 5 that name a waste stream in words; the first row
 * without one ends it — which is what keeps a legacy sheet's own `B13:J13`
 * and `B16:B18` outside it.
 */
export function wasteRegisterLastRow(cells: Cells | undefined): number | null {
  const source = cells ?? {};
  const stamped = Number(source._row_count);
  if (source._row_count !== undefined && source._row_count !== null && Number.isFinite(stamped)) {
    return stamped > 0 ? START_ROW + stamped - 1 : null;
  }
  const rows = source._rows;
  if (Array.isArray(rows) && rows.length > 0) return START_ROW + rows.length - 1;
  let last: number | null = null;
  for (let row = START_ROW; ; row += 1) {
    const stream = source[`C${row}`];
    if (stream === undefined || stream === null || String(stream).trim() === "" || isNumericText(stream)) break;
    last = row;
  }
  return last;
}

/** Does the register itself hold this sheet row? */
export function wasteRegisterOwnsRow(cells: Cells | undefined, row: number): boolean {
  const last = wasteRegisterLastRow(cells);
  return last !== null && row >= START_ROW && row <= last;
}

/** The cell (sheet address, or private key) this workbook keeps a summary figure in. */
export function wasteSummaryRef(cells: Cells | undefined, item: EsgWasteSummaryItem): string {
  const spec = ESG_WASTE_SUMMARY[item];
  return wasteRegisterOwnsRow(cells, spec.row) ? spec.key : spec.cell;
}

function toNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "" || typeof value === "boolean") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** A summary figure from the waste section's cells, wherever this workbook keeps it. */
export function readWasteSummaryFromCells(cells: Cells | undefined, item: EsgWasteSummaryItem): number | null {
  return toNumber((cells ?? {})[wasteSummaryRef(cells, item)]);
}

/** A summary figure of a (derived) workbook, or null when it is not known. */
export function readEsgWasteSummary(workbook: EsgWorkbookData, item: EsgWasteSummaryItem): number | null {
  return readWasteSummaryFromCells(workbook.sections?.waste?.cells as Cells | undefined, item);
}

/** Why the diversion rate is unknown, when the derivation said. */
export function esgWasteDiversionUnknownReason(workbook: EsgWorkbookData): string | null {
  const reason = (workbook.sections?.waste?.cells as Cells | undefined)?.[ESG_WASTE_DIVERSION_REASON_KEY];
  return typeof reason === "string" && reason.trim() ? reason : null;
}

/** Is this waste cell one of the derived summary cells, for THIS register? */
export function isWasteSummaryCell(cells: Cells | undefined, cellRef: string): boolean {
  return (Object.keys(ESG_WASTE_SUMMARY) as EsgWasteSummaryItem[]).some(
    (item) => ESG_WASTE_SUMMARY[item].cell === cellRef && wasteSummaryRef(cells, item) === cellRef,
  );
}
