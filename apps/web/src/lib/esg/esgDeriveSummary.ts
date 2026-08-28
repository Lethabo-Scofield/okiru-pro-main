/**
 * ESG summary-cell derivation — the workbook's formula layer, in code.
 *
 * The manual input grids write raw cells (per-depot months `s1a_C14…`,
 * headcount `hc_r_c`, register rows `A4/B4/…`, governance value cells `B5/B13…`),
 * but the pillar scorers read the *summary* cells the Excel template computes
 * with formulas (`E_Data!L19`, `S_Data!L12`, `G_Data!F5/F13…`, `Waste_Register!B16`,
 * `Fleet_Register!B28`, `EE_Scorecard!B5/E15`, `King5_Scorecard!E21`, …). In the
 * real workbook those are live formulas; in the app almost nothing recomputed
 * them, so a manually-filled workbook scored as if empty (only golden fixtures
 * that hand-injected the summary cells scored). This mirrors B-BBEE's
 * projectWorkbookToClient: derive every scorer-read summary cell from the raw
 * inputs before scoring.
 *
 * SOURCE OF TRUTH: `docs/esg/ESG_FORMULA_LEDGER.md` Part 2 (cell provenance) and
 * `docs/esg/extracted/*.json` (the verbatim formula dump of
 * `docs/esg/Okiru_ESG_Toolkit_v1_7_SG_Consumer_LiveData.xlsx`). Every rule below
 * cites the workbook formula it implements.
 *
 * PRECEDENCE (tested in `__tests__/esgDeriveSummary.derivations.test.ts`):
 *   • `fill()`  — default. Writes only when the cell is absent or blank, so an
 *     explicit value (typed by a user, or imported from a real workbook, or a
 *     deliberate manual override such as the GHG-summary fields) always wins.
 *     A derived value therefore fabricates nothing: an empty grid yields nothing.
 *   • `force()` — reserved for the cells the ledger marks DERIVED-ONLY, i.e. a
 *     user must never be able to type them because the workbook computes them:
 *       - `Assumptions!B9`      banding floor      `=IF(B8="Lean",0.3,…)`
 *       - `S_Data!B44`          SDL levy           `=IFERROR(B43*0.01,0)`
 *       - `S_Data!G35`          LTIFR              `=IF(SUM(C27:F27)>0,…)`
 *       - `King5_Scorecard!E21` King V raw total   `=SUM(E4:E20)`
 *     `force()` is applied ONLY when the derivation's own source inputs are
 *     present, so it can never blank out a value it has nothing to replace with.
 *
 * PURITY: `(workbook) => workbook'` is pure and deterministic — no I/O, no
 * randomness, no clock. A blank workbook is returned unchanged (never NaN /
 * Infinity / fabricated zeroes).
 */
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { ESG_GRID_SECTIONS, type EsgGridSectionId } from "@/lib/esg/esgGridSections";
import { king5Weight } from "@/lib/esg/esgGridRows";
import { toFractionOrZero } from "../../../../api/pipeline/units/percentage";

type CellValue = string | number | boolean | null;
type Cells = Record<string, CellValue>;

/* ------------------------------------------------------------------ *
 * Workbook constants (verbatim from the v1.7 template)
 * ------------------------------------------------------------------ */

/** `Assumptions!B9 = IF(B8="Lean",0.3,IF(B8="Strict",0.7,0.5))` — STANCE_FLR. */
const STANCE_FLOORS: Record<string, number> = { lean: 0.3, standard: 0.5, strict: 0.7 };
const STANCE_FLOOR_DEFAULT = 0.5;

/** `E_Data!B10` — landfill emission factor used by `Waste_Register!B18`. */
const WASTE_LANDFILL_EF = 0.58;

/** King V: 17 principles × 10 pts. `G_Scorecard!C5 = King5!E21/170*25`. */
const KING5_PRINCIPLE_COUNT = 17;
const KING5_POINTS_PER_PRINCIPLE = 10;

/** IFRS S1/S2: 22 requirement rows × 5 pts. `IFRS_S1_S2!E30 = E29/110`. */
const IFRS_REQUIREMENT_COUNT = 22;
const IFRS_POINTS_PER_REQUIREMENT = 5;

/** `S_Data!B5:K11` — EEA2 headcount matrix: 7 occupational levels × 10 race/gender columns. */
const HEADCOUNT_COLS = ["B", "C", "D", "E", "F", "G", "H", "I", "J", "K"] as const;
const HEADCOUNT_FIRST_ROW = 5;
const HEADCOUNT_ROW_COUNT = 7;
/** Black = African + Coloured + Indian, male (B,C,D) and female (F,G,H) — `EE_Scorecard!B5`. */
const BLACK_COL_INDEXES = [0, 1, 2, 4, 5, 6] as const;

/** `G_Data!F12:F21`,`F23`,`F24` — `=IF(Bn="Yes",5,IF(Bn="Partial",2.5,0))`. */
const GOV_YN_ROWS = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 23, 24] as const;

/**
 * `E_Data` monthly blocks. Each row's `L` cell is `=SUM(Cn:Kn)`; the block total
 * is `=L{first}+…+L{last}`. The app's `EsgMonthlyGrid` hardcodes row base 14 for
 * EVERY prefix (`EsgMonthlyGrid.tsx` line 52), while imported workbooks carry the
 * sheet's real row numbers — so rows are matched by *ordinal position* within the
 * prefix, not by literal row number, and the block total sums every month cell.
 */
const E_MONTHLY_BLOCKS: ReadonlyArray<{
  prefix: string;
  firstRow: number;
  rowCount: number;
  totalRef?: string;
}> = [
  // Scope 1A road-freight diesel — L14…L18, L19 = =L14+L15+L16+L17+L18
  { prefix: "s1a", firstRow: 14, rowCount: 5, totalRef: "L19" },
  // Scope 1B generator diesel — L23…L27, L28 = =L23+L24+L25+L26+L27
  { prefix: "s1b", firstRow: 23, rowCount: 5, totalRef: "L28" },
  // Scope 1C LPG forklifts — single row, L32 = =SUM(C32:K32)
  { prefix: "s1c", firstRow: 32, rowCount: 1 },
  // Scope 1D business cars — single row, L37 = =SUM(C37:K37)
  { prefix: "s1d", firstRow: 37, rowCount: 1 },
  // Scope 2 electricity — L41…L45, L46 = =L41+L42+L43+L44+L45
  { prefix: "s2", firstRow: 41, rowCount: 5, totalRef: "L46" },
  // Solar generation — L50…L54 (no TOTAL row; rolled into L81)
  { prefix: "solar", firstRow: 50, rowCount: 5 },
  // Scope 3 water — L58…L62, L63 = =L58+L59+L60+L61+L62
  { prefix: "water", firstRow: 58, rowCount: 5, totalRef: "L63" },
];

/* ------------------------------------------------------------------ *
 * Primitives
 * ------------------------------------------------------------------ */

function toNum(v: unknown): number | null {
  if (v == null || v === "" || typeof v === "boolean") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Division that can never produce NaN/Infinity — the app-side `IFERROR(…,0)`. */
function safeDiv(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return 0;
  const q = numerator / denominator;
  return Number.isFinite(q) ? q : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function text(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

/** Excel `IF(x="Yes",hi,IF(x="Partial",mid,0))`. */
function ynScore(v: unknown, hi: number, mid: number): number {
  const s = text(v).toLowerCase();
  if (s === "yes") return hi;
  if (s === "partial") return mid;
  return 0;
}

function colLetter(index: number): string {
  let n = index;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/**
 * Mutable working copy of the workbook's sections. Cells are cloned lazily on
 * first write, so untouched sections keep their original object identity.
 */
class Draft {
  private readonly sections: Record<string, { cells?: Cells }>;
  private readonly cloned = new Set<string>();
  private dirty = false;

  constructor(workbook: EsgWorkbookData) {
    this.sections = { ...((workbook.sections ?? {}) as Record<string, { cells?: Cells }>) };
  }

  cells(sectionId: string): Cells {
    return this.sections[sectionId]?.cells ?? {};
  }

  raw(sectionId: string, ref: string): CellValue | undefined {
    return this.cells(sectionId)[ref];
  }

  /** Present = not undefined, not null, not empty string (an explicit 0 IS present). */
  has(sectionId: string, ref: string): boolean {
    const v = this.raw(sectionId, ref);
    return v != null && v !== "";
  }

  /** Numeric read, `IFERROR`-style: non-numeric / absent → 0. */
  num(sectionId: string, ref: string): number {
    return toNum(this.raw(sectionId, ref)) ?? 0;
  }

  text(sectionId: string, ref: string): string {
    return text(this.raw(sectionId, ref));
  }

  private mutable(sectionId: string): Cells {
    if (!this.cloned.has(sectionId)) {
      this.sections[sectionId] = { ...this.sections[sectionId], cells: { ...this.cells(sectionId) } };
      this.cloned.add(sectionId);
    }
    this.dirty = true;
    return this.sections[sectionId].cells as Cells;
  }

  /** Derived value — an explicit (typed / imported / overridden) value wins. */
  fill(sectionId: string, ref: string, value: CellValue): void {
    if (value == null || (typeof value === "number" && !Number.isFinite(value))) return;
    if (this.has(sectionId, ref)) return;
    this.mutable(sectionId)[ref] = value;
  }

  /** DERIVED-ONLY value — overwrites, because the workbook never lets a user type it. */
  force(sectionId: string, ref: string, value: CellValue): void {
    if (value == null || (typeof value === "number" && !Number.isFinite(value))) return;
    if (this.raw(sectionId, ref) === value) return;
    this.mutable(sectionId)[ref] = value;
  }

  result(workbook: EsgWorkbookData): EsgWorkbookData {
    if (!this.dirty) return workbook;
    return { ...workbook, sections: this.sections } as EsgWorkbookData;
  }
}

/* ------------------------------------------------------------------ *
 * Grid + monthly-cell readers
 * ------------------------------------------------------------------ */

type NumberedRow = { rowNum: number; values: Record<string, unknown> };

/**
 * A real register row has at least one of the grid's *required* (identifying)
 * columns filled. This matters because several sheets park scorecard blocks
 * inside the register's own row range — `Waste_Register!B16:B19` sit at rows
 * 16–19 while the register starts at row 5, so a naive "any cell in a row ≥
 * startRow" scan reads the diversion-rate scorecard as four phantom waste
 * streams and skews every register aggregate.
 */
function isRealRow(values: Record<string, unknown>, sectionId: EsgGridSectionId): boolean {
  const required = ESG_GRID_SECTIONS[sectionId].columns.filter((c) => c.required);
  const keys = required.length > 0 ? required.map((c) => c.key) : Object.keys(values);
  return keys.some((k) => {
    const v = values[k];
    return v !== undefined && v !== null && v !== "";
  });
}

/**
 * Register-grid rows *with their sheet row numbers* — needed because several
 * derivations write per-row cells back (e.g. `Fleet_Register!K4:K19`).
 * Accepts both storage shapes: the `_rows` array the editor holds in memory and
 * the flat `A4/B4/…` cells `writeEsgGridCells` persists.
 */
function gridRows(cells: Cells | undefined, sectionId: EsgGridSectionId): NumberedRow[] {
  const def = ESG_GRID_SECTIONS[sectionId];
  const source = (cells ?? {}) as Record<string, unknown>;

  const stored = source._rows;
  if (Array.isArray(stored) && stored.length > 0) {
    const out: NumberedRow[] = [];
    stored.forEach((r, i) => {
      const values = { ...(r as Record<string, unknown>) };
      delete values._id;
      if (isRealRow(values, sectionId)) out.push({ rowNum: def.startRow + i, values });
    });
    return out;
  }

  const rowNums = new Set<number>();
  for (const ref of Object.keys(source)) {
    if (ref.startsWith("_")) continue;
    const m = /^([A-Z]+)(\d+)$/.exec(ref);
    if (!m) continue;
    const n = parseInt(m[2], 10);
    if (n >= def.startRow) rowNums.add(n);
  }
  const out: NumberedRow[] = [];
  for (const rowNum of Array.from(rowNums).sort((a, b) => a - b)) {
    const values: Record<string, unknown> = {};
    def.columns.forEach((col, idx) => {
      const v = source[`${colLetter(idx)}${rowNum}`];
      if (v !== undefined) values[col.key] = v;
    });
    if (isRealRow(values, sectionId)) out.push({ rowNum, values });
  }
  return out;
}

type MonthlyBlock = {
  /** Per-source-row totals in sheet order (each = `SUM(Cn:Kn)`). */
  rowTotals: number[];
  /** Number of month cells actually present — 0 means "user entered nothing". */
  cellCount: number;
  /** Σ of every month cell in the block. */
  total: number;
  /** Every present month value, for AVERAGE-style rules. */
  values: number[];
};

/** Read `${prefix}_{C..K}{row}` monthly cells, grouped by row in ascending row order. */
function readMonthlyBlock(cells: Cells, prefix: string): MonthlyBlock {
  const re = new RegExp(`^${prefix}_([C-K])(\\d+)$`);
  const byRow = new Map<number, number>();
  const values: number[] = [];
  let cellCount = 0;
  let total = 0;
  for (const [ref, raw] of Object.entries(cells)) {
    const m = re.exec(ref);
    if (!m) continue;
    const n = toNum(raw);
    if (n == null) continue;
    const rowNum = parseInt(m[2], 10);
    byRow.set(rowNum, (byRow.get(rowNum) ?? 0) + n);
    values.push(n);
    cellCount += 1;
    total += n;
  }
  const rowTotals = Array.from(byRow.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => v);
  return { rowTotals, cellCount, total, values };
}

/* ------------------------------------------------------------------ *
 * The derivation
 * ------------------------------------------------------------------ */

function hasAnyCells(workbook: EsgWorkbookData): boolean {
  return Object.values(workbook.sections ?? {}).some(
    (s) => Object.keys(s?.cells ?? {}).length > 0,
  );
}

/**
 * Return a shallow copy of the workbook with every scorer-read summary cell
 * derived from the raw grid inputs. Idempotent; explicit values are preserved
 * (except the four DERIVED-ONLY cells listed in the module header).
 */
export function deriveEsgSummaryCells(workbook: EsgWorkbookData): EsgWorkbookData {
  // A blank workbook derives to nothing at all — never a fabricated 0.
  if (!hasAnyCells(workbook)) return workbook;

  const d = new Draft(workbook);

  deriveAssumptions(d);
  deriveEData(d);
  deriveWasteRegister(d);
  deriveFleetRegister(d);
  deriveSData(d);
  deriveEeScorecard(d);
  deriveGData(d);
  deriveKing5(d);
  deriveIfrs(d);

  return d.result(workbook);
}

/* ---------------------------- Assumptions --------------------------- */

/**
 * `Assumptions!B9 = =IF(B8="Lean",0.3,IF(B8="Strict",0.7,0.5))` — the numeric
 * banding floor (`STANCE_FLR`) read by ~20 scorecard formulas as
 * `target × floor`. DERIVED-ONLY: the workbook gives the user no way to type it.
 *
 * Ledger Part 3: `esgSectionConfigs.ts` currently writes the *scoring stance*
 * label to `B6` and the *reporting standard* text to `B9` (a 2-row offset in
 * Assumptions Block 0). Until that config migration lands, the stance label is
 * read from `B8` (correct address) and falls back to `B6` (current form address),
 * so choosing Lean/Strict now moves E, S **and** the B-BBEE bridge together
 * instead of only E. Anything else — including the reporting-standard text that
 * the old form leaves in `B9` — falls through to the formula's 0.5 branch.
 */
function deriveAssumptions(d: Draft): void {
  const stance =
    matchStance(d.text("assumptions", "B8")) ?? matchStance(d.text("assumptions", "B6"));
  d.force("assumptions", "B9", stance ?? STANCE_FLOOR_DEFAULT);
}

function matchStance(label: string): number | undefined {
  return STANCE_FLOORS[label.toLowerCase()];
}

/* ------------------------------- E_Data ----------------------------- */

function deriveEData(d: Draft): void {
  const cells = d.cells("e-data");
  const blocks = new Map<string, MonthlyBlock>();

  for (const block of E_MONTHLY_BLOCKS) {
    const read = readMonthlyBlock(cells, block.prefix);
    blocks.set(block.prefix, read);
    if (read.cellCount === 0) continue;

    // Per-source-row YTD: `L14 = =SUM(C14:K14)` … `L62 = =SUM(C62:K62)`.
    read.rowTotals.slice(0, block.rowCount).forEach((v, i) => {
      d.fill("e-data", `L${block.firstRow + i}`, v);
    });
    // Block total: `L19 = =L14+…+L18`, `L28`, `L46`, `L63`.
    if (block.totalRef) d.fill("e-data", block.totalRef, read.total);
  }

  const blockTotal = (prefix: string): number => blocks.get(prefix)?.total ?? 0;
  const blockFilled = (prefix: string): boolean => (blocks.get(prefix)?.cellCount ?? 0) > 0;

  // `L67 = =AVERAGE(C67:K67)` — Cority "% Waste Recycled (all depots)" monthly row.
  const waste = readMonthlyBlock(cells, "waste");
  if (waste.cellCount > 0) {
    d.fill("e-data", "L67", waste.total / waste.cellCount);
  }

  /*
   * GHG summary block, rows 75–86. NOTE (ledger Part 2A data-integrity warning):
   * these rows are LABELLED tCO₂e but the workbook formulas copy the *raw
   * activity* rows (litres / kWh / kL), so `L84` is a mixed-unit sum. Reproduced
   * bit-for-bit for regression parity — do not "fix" the units here.
   *
   *   L75 = =SUM(C75:K75) where C75 = =C14+C15+C16+C17+C18  → Σ scope-1A months
   *   L76 = =SUM(C76:K76) where C76 = =C23+…+C27            → Σ scope-1B months
   *   L77 = =SUM(C77:K77) where C77 = =C32                  → Σ scope-1C months
   *   L78 = =SUM(C78:K78) where C78 = =C37                  → Σ scope-1D months
   */
  if (blockFilled("s1a")) d.fill("e-data", "L75", blockTotal("s1a"));
  if (blockFilled("s1b")) d.fill("e-data", "L76", blockTotal("s1b"));
  if (blockFilled("s1c")) d.fill("e-data", "L77", blockTotal("s1c"));
  if (blockFilled("s1d")) d.fill("e-data", "L78", blockTotal("s1d"));

  // `L79 = =SUM(L75,L76,L77,L78)` — SCOPE 1 TOTAL.
  const s1Rows = ["L75", "L76", "L77", "L78"] as const;
  if (s1Rows.some((r) => d.has("e-data", r))) {
    d.fill("e-data", "L79", s1Rows.reduce((a, r) => a + d.num("e-data", r), 0));
  }

  /*
   * `L80 = =E_Data!L46` (Scope 2 gross) and `L81 = =SUM(L50+L51+L52+L53+L54)`
   * (solar offset). These are the two cells `E_Scorecard!C7` *should* read — the
   * workbook formula points at `M80`/`M81`, which do not exist (rows 80–81 stop
   * at column L), which is why `E d7` is permanently 0. Ledger 5.3: the
   * calculator repoints to L80/L81 and drops the leading minus sign, because
   * `L81` is a positive kWh figure.
   */
  if (d.has("e-data", "L46")) d.fill("e-data", "L80", d.num("e-data", "L46"));
  if (blockFilled("solar")) d.fill("e-data", "L81", blockTotal("solar"));

  // `L82 = =L80+L81` — SCOPE 2 NET.
  if (d.has("e-data", "L80") || d.has("e-data", "L81")) {
    d.fill("e-data", "L82", d.num("e-data", "L80") + d.num("e-data", "L81"));
  }

  // `L83 = =E_Data!L63` — Scope 3 water.
  // (Config bug, ledger Part 2A: `E_DATA_GHG_SUMMARY_FIELDS` labels L84 "Scope 3 —
  //  Water" and L86 "TOTAL GHG"; both are off by 1–2 rows. Owned by esgSectionConfigs.)
  if (d.has("e-data", "L63")) d.fill("e-data", "L83", d.num("e-data", "L63"));

  // `L84 = =L79+L82+L83` — TOTAL GHG (Scope 1+2+3).
  const totalParts = ["L79", "L82", "L83"] as const;
  if (totalParts.some((r) => d.has("e-data", r))) {
    d.fill("e-data", "L84", totalParts.reduce((a, r) => a + d.num("e-data", r), 0));
  }

  // `L85 = =IFERROR(L79/L84,0)`, `L86 = =IFERROR(L82/L84,0)` — % by scope.
  if (d.has("e-data", "L84")) {
    const l84 = d.num("e-data", "L84");
    d.fill("e-data", "L85", safeDiv(d.num("e-data", "L79"), l84));
    d.fill("e-data", "L86", safeDiv(d.num("e-data", "L82"), l84));
  }

  // `F90 = =L79+L82` — current YTD Scope 1+2, the net-zero "Current" column.
  if (d.has("e-data", "L79") || d.has("e-data", "L82")) {
    d.fill("e-data", "F90", d.num("e-data", "L79") + d.num("e-data", "L82"));
  }
}

/* --------------------------- Waste_Register ------------------------- */

/**
 * SECTION-ID MISMATCH RESOLUTION.
 *
 * `environmental.ts` reads section `waste` (refs `B16`/`B17`/`B18`), and the
 * waste *register* grid (`ESG_GRID_SECTIONS.waste`, Total/Recycled/Landfill kg)
 * does live there. But two of the three inputs are written elsewhere: the Cority
 * monthly "% Recycled" row and the Oricol scalars (`L68`/`L69`/`L70`) are
 * rendered by the **e-data** "waste" sub-tab (`EsgWorkbookSectionEditor.tsx`),
 * so they land in section `e-data` as `waste_C14…waste_K14` / `L68…L70`.
 * That split is why 12 waste points (`E d19` 5 + `d20` 4 + `d21` 3) were
 * unreachable from the manual form.
 *
 * Resolved here rather than by moving the editor: the derivation reads from
 * BOTH sections and always writes the three summary cells into `waste`, the
 * section the scorer reads. No stored data moves, and imported workbooks (whose
 * Waste_Register sheet lands wholly in `waste`) keep working — each source is
 * looked up in `waste` first, then `e-data`.
 */
function deriveWasteRegister(d: Draft): void {
  const rows = gridRows(d.cells("waste"), "waste");
  const isTotalRow = (r: NumberedRow) => /\btotals?\b/i.test(text(r.values.wasteType));
  const totalRows = rows.filter(isTotalRow);
  const streamRows = rows.filter((r) => !isTotalRow(r));

  /*
   * `Waste_Register!B16` — diversion rate.
   *
   * DIVERGENCE FROM THE WORKBOOK (deliberate, ledger Part 2B): the workbook's
   * B16 is `=91.1%` — a "formula" whose entire body is a hardcoded constant. It
   * is not computed from anything, so no input can ever move it and `E d19`
   * (5 pts) is unreachable from the form. Derived properly here from the
   * register's own tonnage columns: Σ recycled kg ÷ Σ total kg.
   *
   * The register carries both itemised streams and Oricol "Big Numbers" TOTAL
   * rows (workbook row 9: D=22470, E=20470 → 0.911). Summing both would
   * double-count, so a TOTAL row, when present, is used exclusively — which
   * reproduces the workbook's 0.911 from real data instead of hardcoding it.
   * Falls back to the Oricol `% Diversion` scalar (`E_Data!L70`, entered as
   * 91.1) when no register rows exist.
   */
  if (!d.has("waste", "B16")) {
    const basis = totalRows.length > 0 ? totalRows : streamRows;
    const totalKg = sumColumn(basis, "totalKg");
    const recycledKg = sumColumn(basis, "recycledKg");
    if (totalKg > 0) {
      d.fill("waste", "B16", clamp01(safeDiv(recycledKg, totalKg)));
    } else {
      const scalar = firstPresentNumber(d, "L70", ["waste", "e-data"]);
      if (scalar != null) d.fill("waste", "B16", clamp01(asFraction(scalar)));
    }
  }

  /*
   * `Waste_Register!B17 = =AVERAGE(B13:J13)` — the Cority monthly "% Recycled
   * (all depots)" row. Stored as fractions on Waste_Register (0.1065…) but as
   * percentages on `E_Data!C67:K67` (10.65…), and the app's monthly grid writes
   * whichever the user types, so the mean is normalised to a fraction.
   */
  if (!d.has("waste", "B17")) {
    const monthly = corityMonthlyValues(d);
    if (monthly.length > 0) {
      const mean = monthly.reduce((a, b) => a + b, 0) / monthly.length;
      d.fill("waste", "B17", asFraction(mean));
    }
  }

  /*
   * `Waste_Register!B18 = =SUMIF(F4:F40,">0",F4:F40)*0.58/1000` — landfill tCO₂e.
   *
   * DIVERGENCE FROM THE WORKBOOK (deliberate): the workbook's `F4:F40` range
   * swallows `F13` — a cell in the *Cority percentage* row (0.2642), not a
   * landfill tonnage — which is why the live value is 2.320153236 rather than
   * 2.32. Derived here from the register's `Landfill kg` column only.
   */
  if (!d.has("waste", "B18")) {
    const landfillKg = rows.reduce((a, r) => {
      const v = toNum(r.values.landfillKg) ?? 0;
      return v > 0 ? a + v : a;
    }, 0);
    if (landfillKg > 0) {
      const ef = firstPresentNumber(d, "B10", ["e-data"]) ?? WASTE_LANDFILL_EF;
      d.fill("waste", "B18", (landfillKg * ef) / 1000);
    }
  }

  // Per-row `G5 = =IFERROR(E5/D5,0)` and `H5 = =F5*0.58/1000` (grid columns are
  // plain number inputs in the app; fill them so the register reconciles).
  const ef = firstPresentNumber(d, "B10", ["e-data"]) ?? WASTE_LANDFILL_EF;
  for (const r of rows) {
    const totalKg = toNum(r.values.totalKg);
    const recycledKg = toNum(r.values.recycledKg);
    if (totalKg != null && recycledKg != null) {
      d.fill("waste", `G${r.rowNum}`, safeDiv(recycledKg, totalKg));
    }
    const landfillKg = toNum(r.values.landfillKg);
    if (landfillKg != null) {
      d.fill("waste", `H${r.rowNum}`, (landfillKg * ef) / 1000);
    }
  }
}

/** Cority monthly % values — `e-data!waste_C14…` (form) or `waste!B13:J13` (import). */
function corityMonthlyValues(d: Draft): number[] {
  const fromForm = readMonthlyBlock(d.cells("e-data"), "waste");
  if (fromForm.cellCount > 0) return fromForm.values;
  const out: number[] = [];
  for (const col of ["B", "C", "D", "E", "F", "G", "H", "I", "J"]) {
    const n = toNum(d.raw("waste", `${col}13`));
    if (n != null) out.push(n);
  }
  return out;
}

function sumColumn(rows: NumberedRow[], key: string): number {
  return rows.reduce((a, r) => a + (toNum(r.values[key]) ?? 0), 0);
}

/** Percentages may arrive as 91.1 or 0.911 — normalise to a 0–1 fraction. */
function asFraction(n: number): number {
  return toFractionOrZero(n);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function firstPresentNumber(d: Draft, ref: string, sectionIds: string[]): number | null {
  for (const id of sectionIds) {
    const n = toNum(d.raw(id, ref));
    if (n != null) return n;
  }
  return null;
}

/* --------------------------- Fleet_Register ------------------------- */

/**
 * `Fleet_Register` — the whole block was MISSING (ledger Part 2C): `B28`/`H28`
 * are literal *text* (`"134"`/`"0"`) with no formula and no config entry, and
 * the per-vehicle `K` (L/100km actual) column is a plain input rather than
 * `=IFERROR(J4/I4*100,0)`. `E d15`/`d16`/`d17` (18 pts) were unreachable.
 */
function deriveFleetRegister(d: Draft): void {
  const cells = d.cells("fleet");
  // Rows 21–28 are the sheet's own FLEET SUMMARY block (depot names in column A),
  // not vehicles — exclude them whenever that block is present, e.g. after an
  // import of the real Fleet_Register sheet.
  const summaryPresent = hasFleetSummaryBlock(d);
  const rows = gridRows(cells, "fleet")
    .filter((r) => !summaryPresent || r.rowNum < 21)
    .filter((r) => !/^(total|depot|reg)$/i.test(text(r.values.reg)));
  if (rows.length === 0 && !summaryPresent) return;

  // Per-vehicle `K4 = =IFERROR(J4/I4*100,0)` — L/100 km actual from litres ÷ km.
  const efDiesel = firstPresentNumber(d, "B4", ["e-data"]) ?? 2.68;
  for (const r of rows) {
    const km = toNum(r.values.monthlyKm);
    const litres = toNum(r.values.monthlyLitres);
    if (km != null && litres != null) {
      d.fill("fleet", `K${r.rowNum}`, safeDiv(litres, km) * 100);
    }
    // `M4 = =J4*E_Data!$B$4/1000` — monthly tCO₂e at the diesel factor.
    if (litres != null) {
      d.fill("fleet", `M${r.rowNum}`, (litres * efDiesel) / 1000);
    }
  }

  /*
   * `B28` TOTAL vehicles / `H28` EV vehicles — the workbook's fleet-summary
   * TOTAL row (should be `=SUM(B23:B27)` / `=SUM(H23:H27)`, but is hand-typed
   * text). Precedence: an explicit value (import) → the depot summary block if
   * one was captured → a count over the register itself.
   */
  // Only trust rows 23–27 as a summary block when the sheet's own labels say so;
  // otherwise they are just vehicles 20+ of a large app-authored register.
  const summaryVehicles = summaryPresent ? sumSummaryBlock(d, "B") : null;
  const summaryEvs = summaryPresent ? sumSummaryBlock(d, "H") : null;
  const vehicleCount = rows.filter((r) => text(r.values.reg) !== "").length;
  const evCount = rows.filter((r) => isEv(r.values.isEv)).length;

  d.fill("fleet", "B28", summaryVehicles ?? (vehicleCount > 0 ? vehicleCount : null));
  // EVs legitimately total 0 — write it whenever there is a fleet to divide by,
  // so `d17` scores 0 rather than short-circuiting on a missing denominator.
  d.fill("fleet", "H28", summaryEvs ?? (vehicleCount > 0 ? evCount : null));

  /*
   * Aggregates for `E_Scorecard!C15`/`C16`, which are SUMPRODUCT/COUNTIF over the
   * register — cheaper and less error-prone to derive once than to re-walk the
   * grid inside the calculator:
   *   C15 = 8*SUMPRODUCT((K4:K19>0)*(K4:K19<=L4:L19*Assumptions!B45))
   *           / MAX(1,COUNTIF(K4:K19,">0"))
   *   C16 = IF(SUMPRODUCT((F4:F19>0)*(I4:I19>0))>0,5,0)
   */
  const tolerance = toNum(d.raw("assumptions", "B45")) ?? 1.05;
  let l100Positive = 0;
  let l100WithinNorm = 0;
  let tonneKmRows = 0;
  for (const r of rows) {
    const actual = toNum(d.raw("fleet", `K${r.rowNum}`)) ?? toNum(r.values.l100Actual) ?? 0;
    const norm = toNum(r.values.l100Norm) ?? 0;
    if (actual > 0) {
      l100Positive += 1;
      if (actual <= norm * tolerance) l100WithinNorm += 1;
    }
    const carry = toNum(r.values.carry) ?? 0;
    const km = toNum(r.values.monthlyKm) ?? 0;
    if (carry > 0 && km > 0) tonneKmRows += 1;
  }
  if (rows.length > 0) {
    d.fill("fleet", "_vehicle_count", vehicleCount);
    d.fill("fleet", "_l100_positive", l100Positive);
    d.fill("fleet", "_l100_within_norm", l100WithinNorm);
    d.fill("fleet", "_tonne_km_rows", tonneKmRows);
  }
}

/**
 * Detects the sheet's own FLEET SUMMARY block by its literal header/total labels
 * (`A22="Depot"`, `B22="Total Vehicles"`, `A28="TOTAL"`). Only an imported
 * Fleet_Register carries those; an app-authored register never writes them, so a
 * fleet larger than the sheet's 16-row range is not mistaken for a summary.
 */
function hasFleetSummaryBlock(d: Draft): boolean {
  return (
    /^total$/i.test(d.text("fleet", "A28")) ||
    /^total vehicles$/i.test(d.text("fleet", "B22")) ||
    /^depot$/i.test(d.text("fleet", "A22"))
  );
}

/** `=SUM(B23:B27)` / `=SUM(H23:H27)` over the per-depot summary block, if captured. */
function sumSummaryBlock(d: Draft, col: "B" | "H"): number | null {
  let total = 0;
  let found = false;
  for (let row = 23; row <= 27; row++) {
    const n = toNum(d.raw("fleet", `${col}${row}`));
    if (n == null) continue;
    total += n;
    found = true;
  }
  return found ? total : null;
}

function isEv(v: unknown): boolean {
  if (v === true) return true;
  const s = text(v).toLowerCase();
  return s === "yes" || s === "y" || s === "true" || s === "ev" || s === "1";
}

/* ------------------------------- S_Data ----------------------------- */

function deriveSData(d: Draft): void {
  deriveHeadcount(d);
  deriveHealthSafety(d);

  /*
   * `S_Data!B44 = =IFERROR(B43*0.01,0)` — SDL levy paid, 1 % of leviable payroll.
   * DERIVED-ONLY: `S_DATA_PAYROLL_FIELDS` mislabels B44 "NPAT (R)" (ledger Part
   * 2E), so a user can type an unrelated number straight into the denominator of
   * `S_Scorecard!C15` (grant recovery = B47/B44). Recomputed from B43 whenever
   * payroll is present; when payroll is absent there is nothing to compute from,
   * so an imported B44 is left alone rather than being blanked to 0.
   */
  if (d.has("s-data", "B43")) {
    d.force("s-data", "B44", d.num("s-data", "B43") * 0.01);
  }

  /*
   * CSI register (`S_Data!A72:A79`) → `COUNTA` for `S_Scorecard!C23`, and
   * `D82 = =SUM(D72:D81)` (total CSI spend, needed by the `S d22` remediation).
   * Previously `scoreSocial` defaulted a missing count to the full threshold →
   * everyone got CSI's 5 pts for free.
   */
  const csiRows = gridRows(d.cells("s-data-csi"), "s-data-csi").filter(
    (r) => text(r.values.initiative) !== "",
  );
  if (csiRows.length > 0) {
    d.fill("s-data", "_initiatives_count", csiRows.length);
    const spend = sumColumn(csiRows, "spend");
    if (spend > 0) d.fill("s-data", "D82", spend);
  }
}

/**
 * EE headcount matrix. The grid writes `hc_{rowIdx}_{colIdx}`; the workbook
 * addresses the same numbers as `S_Data!B5:K11` (7 EEA2 levels × Af/Col/Ind/Wht
 * M+F, For M+F) with `Ln = =SUM(Bn:Kn)`, `B12 = =SUM(B5,…,B11)` per column and
 * `L12 = =SUM(L5,…,L11)`. Only `L12` was derived before, so `S_Scorecard!C6`
 * (Black female management, 6 pts) and `EE_Scorecard!B5/B7` had no inputs at all.
 */
function deriveHeadcount(d: Draft): void {
  const cells = d.cells("s-data");
  const matrix: (number | null)[][] = Array.from({ length: HEADCOUNT_ROW_COUNT }, () =>
    Array.from({ length: HEADCOUNT_COLS.length }, () => null),
  );
  let any = false;
  for (const [ref, raw] of Object.entries(cells)) {
    const m = /^hc_(\d+)_(\d+)$/.exec(ref);
    if (!m) continue;
    const r = parseInt(m[1], 10);
    const c = parseInt(m[2], 10);
    if (r >= HEADCOUNT_ROW_COUNT || c >= HEADCOUNT_COLS.length) continue;
    const n = toNum(raw);
    if (n == null) continue;
    matrix[r][c] = n;
    any = true;
  }
  if (!any) return;

  const colTotals = HEADCOUNT_COLS.map(() => 0);
  let grandTotal = 0;

  for (let r = 0; r < HEADCOUNT_ROW_COUNT; r++) {
    const rowNum = HEADCOUNT_FIRST_ROW + r;
    let rowFilled = false;
    let rowTotal = 0;
    for (let c = 0; c < HEADCOUNT_COLS.length; c++) {
      const v = matrix[r][c];
      if (v == null) continue;
      rowFilled = true;
      rowTotal += v;
      colTotals[c] += v;
      // `S_Data!B5` … `K11` — the addressable race/gender matrix.
      d.fill("s-data", `${HEADCOUNT_COLS[c]}${rowNum}`, v);
    }
    if (!rowFilled) continue;
    // `L5 = =SUM(B5:K5)` … `L11 = =SUM(B11:K11)`.
    d.fill("s-data", `L${rowNum}`, rowTotal);
    grandTotal += rowTotal;
  }

  // `B12 = =SUM(B5,…,B11)` per column, `L12 = =SUM(L5,…,L11)` overall.
  for (let c = 0; c < HEADCOUNT_COLS.length; c++) {
    d.fill("s-data", `${HEADCOUNT_COLS[c]}12`, colTotals[c]);
  }
  d.fill("s-data", "L12", grandTotal);
}

/**
 * H&S quarterly roll-ups. Every row is `Gn = =SUM(Cn:Fn)` — except `G28`
 * (fatalities), which the workbook author hand-typed as `"—"`. `S_Scorecard!C18`
 * (8 pts) reads it, so with no derivation the app awards those 8 points
 * unconditionally; deriving it means a company that reports a fatality loses them.
 */
function deriveHealthSafety(d: Draft): void {
  for (const row of [27, 28, 29, 30, 31, 32, 33, 34]) {
    const quarters = ["C", "D", "E", "F"].map((col) => toNum(d.raw("s-data", `${col}${row}`)));
    if (quarters.every((q) => q == null)) continue;
    d.fill("s-data", `G${row}`, quarters.reduce<number>((a, q) => a + (q ?? 0), 0));
  }

  /*
   * `G35 = =IF(SUM(C27:F27)>0,SUM(C29:F29)*1000000/SUM(C27:F27),"Awaiting hours worked")`
   * — LTIFR per 1,000,000 hours. DERIVED-ONLY: the config exposes it as a manual
   * number field, so a typed value would silently outrank the computed one. Only
   * recomputed when hours worked are actually present; otherwise whatever is
   * there (including the workbook's "Awaiting hours worked" string) is untouched.
   */
  const hours = quarterSum(d, 27);
  if (hours != null && hours > 0) {
    const lti = quarterSum(d, 29) ?? 0;
    d.force("s-data", "G35", (lti * 1_000_000) / hours);
    // `G36` — TRIFR = (LTI + MTI) per 1,000,000 hours.
    const mti = quarterSum(d, 30) ?? 0;
    d.fill("s-data", "G36", ((lti + mti) * 1_000_000) / hours);
  }
}

function quarterSum(d: Draft, row: number): number | null {
  let total = 0;
  let found = false;
  for (const col of ["C", "D", "E", "F"]) {
    const n = toNum(d.raw("s-data", `${col}${row}`));
    if (n == null) continue;
    total += n;
    found = true;
  }
  return found ? total : null;
}

/* ---------------------------- EE_Scorecard -------------------------- */

/**
 * `EE_Scorecard` — the demographic roll-ups and the sheet's own 100-point score.
 * Today only `B5` exists in the app, as a *hand-typed* number, so the 70-cell
 * headcount matrix fed nothing. `B5`/`B7` are now projected from `S_Data`, and
 * `E5:E15` derived so `bbbeeBridge` reads a real `E15`.
 */
function deriveEeScorecard(d: Draft): void {
  // `B5 = =IFERROR((S_Data!B5+C5+D5+F5+G5+H5)/(S_Data!L5)*1,0)`
  // NOTE the workbook divides by `L5` (Top Management only) despite the label
  // "all levels combined". Reproduced verbatim — `S_Scorecard!C5` is calibrated
  // against it, and changing the denominator is a scoring decision, not a fix.
  if (d.has("s-data", "L5")) {
    const black = BLACK_COL_INDEXES.reduce<number>(
      (a, c) => a + d.num("s-data", `${HEADCOUNT_COLS[c]}${HEADCOUNT_FIRST_ROW}`),
      0,
    );
    d.fill("ee", "B5", safeDiv(black, d.num("s-data", "L5")));
  }

  // `B7 = =IFERROR((S_Data!B5+S_Data!B6)/S_Data!L12,0)` — Black Top/Senior Mgmt.
  if (d.has("s-data", "L12")) {
    d.fill(
      "ee",
      "B7",
      safeDiv(d.num("s-data", "B5") + d.num("s-data", "B6"), d.num("s-data", "L12")),
    );
  }

  /*
   * `B8` — % Persons with Disabilities. The workbook's formula is the constant
   * `=0`: PWD % is never computed anywhere, which is why `S d8` (5 pts) can
   * never score (ledger 5.3). Derived here from a PWD headcount at the ledger's
   * proposed cell `S_Data!B88` ÷ total headcount. Until `esgSectionConfigs.ts`
   * exposes `B88` as an input there is no path to fill it, so this stays inert
   * rather than fabricating a number.
   */
  if (d.has("s-data", "B88") && d.has("s-data", "L12")) {
    d.fill("ee", "B8", safeDiv(d.num("s-data", "B88"), d.num("s-data", "L12")));
  }

  /*
   * `E5:E14` — the sheet's own weighted score column, then
   * `E15 = =SUM(E5,…,E14)` (out of `F15` = 100), read by `bbbeeBridge.ts`.
   *   E5  = =IFERROR(MIN(20,ROUND(B5/0.6*20,2)),0)
   *   E6  = =IFERROR(MIN(15,ROUND(B6/0.3*15,2)),0)
   *   E7  = =IFERROR(MIN(20,ROUND(B7/0.5*20,2)),0)
   *   E8  = =IFERROR(MIN(10,ROUND(B8/0.02*10,2)),0)
   *   E9  = =IF(B9="Yes",10,IF(B9="Partial",5,0))
   *   E10…E14 = =IF(Bn="Yes",5,IF(Bn="Partial",2,0))
   */
  const eeCells = d.cells("ee");
  if (Object.keys(eeCells).length === 0) return;

  const ratioScore = (ref: string, target: number, max: number): number =>
    Math.min(max, round2(safeDiv(d.num("ee", ref), target) * max));

  d.fill("ee", "E5", ratioScore("B5", 0.6, 20));
  d.fill("ee", "E6", ratioScore("B6", 0.3, 15));
  d.fill("ee", "E7", ratioScore("B7", 0.5, 20));
  d.fill("ee", "E8", ratioScore("B8", 0.02, 10));
  d.fill("ee", "E9", ynScore(d.raw("ee", "B9"), 10, 5));
  for (let row = 10; row <= 14; row++) {
    d.fill("ee", `E${row}`, ynScore(d.raw("ee", `B${row}`), 5, 2));
  }
  let total = 0;
  for (let row = 5; row <= 14; row++) total += d.num("ee", `E${row}`);
  d.fill("ee", "E15", total);
}

/* ------------------------------- G_Data ----------------------------- */

function deriveGData(d: Draft): void {
  const cells = d.cells("g-data");
  if (Object.keys(cells).length === 0) return;

  const floor = d.num("assumptions", "B9") || STANCE_FLOOR_DEFAULT;
  const b5 = d.num("g-data", "B5");

  /*
   * Every numeric row below is gated on its own `B` input being present.
   * The workbook can afford to evaluate a blank cell as 0 — an unfilled
   * Excel sheet is a transient state — but here an absent cell means "not
   * captured yet", and some formulas reward a zero (`F7` gives the full 5 when
   * `B7/B5 <= 0.4`, which a missing exec-director count satisfies). Gating keeps
   * uncaptured inputs worth nothing instead of silently worth full marks.
   */

  // `F5 = =IF(B5>0,5,0)` — board exists.
  d.fill("g-data", "F5", b5 > 0 ? 5 : 0);

  // `F6 = =IFERROR(IF(B5=0,0,IF(B6/B5>=0.5,5,IF(B6/B5>=0.5*B9,5*B6/B5/0.5,0))),0)` — INED ratio.
  if (d.has("g-data", "B6")) {
    d.fill("g-data", "F6", band(safeDiv(d.num("g-data", "B6"), b5), 0.5, 5, floor, b5 > 0));
  }

  // `F7 = =IFERROR(IF(B5=0,0,IF(B7/B5<=0.4,5,MAX(0,5*(1-((B7/B5)-0.4)*2)))),0)` — exec-director cap.
  if (d.has("g-data", "B7")) {
    const ratio = safeDiv(d.num("g-data", "B7"), b5);
    d.fill("g-data", "F7", b5 > 0 && ratio <= 0.4 ? 5 : b5 > 0 ? Math.max(0, 5 * (1 - (ratio - 0.4) * 2)) : 0);
  }

  // `F8 = =IFERROR(IF(B8>=B50,5,IF(B8>=B50*B9,5*B8/B50,0)),0)` — % Black board.
  const thrBlack = toNum(d.raw("assumptions", "B50")) ?? 0.6;
  if (d.has("g-data", "B8")) {
    d.fill("g-data", "F8", band(d.num("g-data", "B8"), thrBlack, 5, floor, true));
  }

  // `F9 = =IFERROR(IF(B9>=0.5,5,IF(B9>=0.5*B9,5*B9/0.5,0)),0)` — % female board.
  if (d.has("g-data", "B9")) {
    d.fill("g-data", "F9", band(d.num("g-data", "B9"), 0.5, 5, floor, true));
  }

  // `F10`/`F11 = =IFERROR(IF(Bn>=4,5,IF(Bn>=4*B9,5*Bn/4,0)),0)` — meetings held.
  for (const row of [10, 11]) {
    if (!d.has("g-data", `B${row}`)) continue;
    d.fill("g-data", `F${row}`, band(d.num("g-data", `B${row}`), 4, 5, floor, true));
  }

  // `F12`…`F21`, `F23`, `F24` = `=IF(Bn="Yes",5,IF(Bn="Partial",2.5,0))`.
  // (`F12` was missing from the previous list — harmless for the scorecard rows,
  //  but it under-counted the `F5:F24` governance roll-up.)
  for (const row of GOV_YN_ROWS) {
    if (!d.has("g-data", `B${row}`)) continue;
    d.fill("g-data", `F${row}`, ynScore(d.raw("g-data", `B${row}`), 5, 2.5));
  }

  // `F22 = =IFERROR(IF(B22>=B61,5,IF(B22>=B61*B9,5*B22/B61,0)),0)` — material risks.
  const thrRisks = toNum(d.raw("assumptions", "B61")) ?? 10;
  if (d.has("g-data", "B22")) {
    d.fill("g-data", "F22", band(d.num("g-data", "B22"), thrRisks, 5, floor, true));
  }

  /*
   * `F26 = =SUM(F5:F24)` is deliberately NOT written here. It has no scorecard
   * reader — only `g-data.score-positive` — and `esgValidationRules.ts` already
   * owns the roll-up (`esgGovernanceMaturityTotal` recomputes SUM(F5:F24) on
   * read and prefers an explicit imported `F26`). Deriving it too would give the
   * same number two owners.
   */
}

/**
 * The workbook's universal banding shape:
 *   `IF(actual>=target, max, IF(actual>=target*floor, max*actual/target, 0))`
 * `gate` is the formula's leading `IF(denominator=0,0,…)` guard.
 */
function band(actual: number, target: number, max: number, floor: number, gate: boolean): number {
  if (!gate || target <= 0 || !Number.isFinite(actual)) return 0;
  if (actual >= target) return max;
  if (actual >= target * floor) return (max * actual) / target;
  return 0;
}

/* --------------------------- King5_Scorecard ------------------------ */

/**
 * `King5_Scorecard` — `E4:E20 = =IF(Cn="Applied",10,IF(Cn="Explained",7,
 * IF(Cn="Partially Applied",5,0)))`, `E21 = =SUM(E4,…,E20)` → 135,
 * `E22 = =IFERROR(E21/170,0)`, `F21 = =SUM(F4,…,F20)` where `Fn = =En*Dn/10`.
 *
 * `E21` is DERIVED-ONLY here for a specific reason: `esgGridRows.syncDerivedFields`
 * already writes an `E21` when the grid is saved, but it writes the **weighted**
 * total (the workbook's `F21` = 87), not the raw score sum (`E21` = 135). Since
 * `G_Scorecard!C5 = King5!E21/170*25`, that understated King V by ~7 points on
 * every manually-filled workbook. Recomputed from the statuses whenever the grid
 * has rows; an injected `E21` with no grid behind it (the golden fixture) is
 * left untouched.
 *
 * Per-row `E4:E20` are deliberately NOT written: in `ESG_GRID_SECTIONS.king5`
 * column E is the `evidence` text column (the app's grid is offset from the
 * sheet), so writing scores there would destroy user text. Same for IFRS below.
 */
function deriveKing5(d: Draft): void {
  const rows = gridRows(d.cells("king5"), "king5").filter(
    (r) => text(r.values.status) !== "",
  );
  if (rows.length === 0) return;

  let raw = 0;
  let weighted = 0;
  for (const r of rows) {
    const score = king5Score(text(r.values.status));
    raw += score;
    // `?? 0` here was the same silent zero `esgGridRows` carried: a principle
    // marked "Applied" with an untyped weight contributed nothing to F21. Both
    // copies now read one function, so the rule cannot be fixed in one place
    // and left in the other again.
    weighted += (score * king5Weight(r.values.weight)) / 10;
  }
  const max =
    KING5_POINTS_PER_PRINCIPLE * Math.max(KING5_PRINCIPLE_COUNT, rows.length);

  d.force("king5", "E21", raw);
  d.fill("king5", "F21", weighted);
  d.fill("king5", "E22", safeDiv(raw, max));
  // The `/170` divisor `governance.ts` hardcodes — derived, so it stops being magic.
  d.fill("king5", "_max_score", max);
}

function king5Score(status: string): number {
  const s = status.toLowerCase();
  if (s === "applied") return 10;
  if (s === "explained") return 7;
  if (s === "partially applied") return 5;
  return 0;
}

/* ----------------------------- IFRS_S1_S2 --------------------------- */

/**
 * `IFRS_S1_S2!E5:E28 = =IF(Dn="Disclosed",5,IF(Dn="Partially Disclosed",3,
 * IF(Dn="N/A",5,0)))`, `E29 = =SUMIF(E5:E28,"<>0",E5:E28)` → 18,
 * `E30 = =IFERROR(E29/110,0)`.
 *
 * `G_Scorecard!C9` instead runs `COUNTIF(IFRS_S1_S2!D4:D40,"Yes")` against a
 * `Disclosed / Partially Disclosed / Not Disclosed / N/A` vocabulary, so it is
 * structurally 0 forever (ledger 5.3). Deriving `E29`/`E30` lets the calculator
 * score `10*E29/110` off real statuses instead.
 *
 * Statuses are read from the grid's own `status` column rather than column `D`,
 * because the app's IFRS grid is offset from the sheet (app: requirement=A,
 * pillar=B, status=C, evidence=D, action=E; sheet: requirement=B, pillar=C,
 * status=D, score=E). Per-row `E` cells are not written — that is the grid's
 * `action` text column. `esgSectionConfigs.ts` owns realigning the columns.
 */
function deriveIfrs(d: Draft): void {
  const rows = gridRows(d.cells("ifrs"), "ifrs").filter((r) => text(r.values.status) !== "");
  if (rows.length === 0) return;

  const total = rows.reduce((a, r) => a + ifrsScore(text(r.values.status)), 0);
  const max = IFRS_POINTS_PER_REQUIREMENT * Math.max(IFRS_REQUIREMENT_COUNT, rows.length);

  d.fill("ifrs", "E29", total);
  d.fill("ifrs", "E30", safeDiv(total, max));
  d.fill("ifrs", "_max_score", max);
}

function ifrsScore(status: string): number {
  const s = status.toLowerCase();
  if (s === "disclosed") return 5;
  if (s === "partially disclosed") return 3;
  if (s === "n/a") return 5;
  return 0;
}
