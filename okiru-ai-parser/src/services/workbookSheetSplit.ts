/**
 * Split a multi-sheet workbook into one extraction document PER SHEET.
 *
 * WHY: Phase 4's first real run proved the pipeline sound but showed the
 * classifier and extractor drowning on real workbooks. A 17-sheet BEE
 * information-gathering file flattened into one markdown blob asks the model an
 * impossible question — "what ONE document is this?" — when it is really twelve
 * documents: an Ownership sheet, an Employees sheet, a Procurement sheet, a
 * Social Development sheet. Classified as a whole it landed as "Skills
 * Development schedule" and yielded almost nothing.
 *
 * The importer already treats each sheet as its own thing. The parser flattened.
 * This makes the parser agree: each meaningful sheet is classified and extracted
 * on its own, against the specs whose evidence IT contains, so the Ownership
 * sheet meets the ownership prompts and the Procurement sheet the procurement
 * prompts — instead of one prompt trying to read all of it at once.
 *
 * A single-sheet workbook (or a CSV) is unaffected: it produces one document,
 * exactly as before.
 */
import * as XLSX from 'xlsx';
import { dittoFill, mainColumnRegion, type DittoOptions } from './sheetRegions.js';
import { isSpreadsheetError, namedSheetCells, sheetMatrix, type CellReadOptions } from './sheetCellValues.js';
import { boundWorkbookSheets } from './sheetBounds.js';

export interface SheetDocument {
  /** Sheet name, verbatim. */
  sheetName: string;
  /** Rows as objects, header-keyed. */
  rows: Array<Record<string, unknown>>;
  /** Structure-preserving markdown for the model — one sheet's table. */
  markdown: string;
  /** Flat text for the deterministic path. */
  text: string;
  /**
   * The sheet's cells as laid out, trailing blanks trimmed — for readers that
   * need the layout itself (a block per measure, months across a row), which
   * header-keyed rows cannot express. Omitted for very large sheets.
   */
  matrix?: unknown[][];
  /** Hidden or very hidden in the workbook. */
  hidden?: boolean;
  /**
   * The workbook's defined names that point at a single cell on this sheet,
   * with that cell's value (see `namedSheetCells`). Omitted when there are none.
   */
  namedCells?: Record<string, unknown>;
  /**
   * The measured entity's profile as the workbook's Instructions sheet states
   * it. That sheet is never a document of its own (it carries no evidence), so
   * its facts ride on the workbook's FIRST document. Omitted when the workbook
   * has no such sheet, or it states none of them.
   */
  instructions?: WorkbookInstructions;
}

/**
 * What a B-BBEE gathering workbook's Instructions sheet says about the entity
 * being measured. Field names are the parser's (`sheet_instructions` emits them
 * as-is); every value is the workbook's own, never inferred.
 */
export interface WorkbookInstructions {
  /** The sheet the facts were read from, for provenance. */
  sheetName: string;
  /** The sector as the workbook names it ("Transport"), verbatim. */
  industry_sector?: string;
  /** ISO yyyy-mm-dd. */
  financial_year_end?: string;
  measured_entity_name?: string;
  /** "Revised Codes" / "Non Revised Codes", verbatim. */
  applicable_code?: string;
}

type InstructionField = Exclude<keyof WorkbookInstructions, 'sheetName'>;

/** The sheets a gathering template states the entity's profile on. */
const INSTRUCTION_SHEET_NAMES = new Set(['instructions', 'instruction']);

/** The template's own defined names for each fact (`Sector` → Instructions!I4). */
const INSTRUCTION_NAMES: Array<[RegExp, InstructionField]> = [
  [/^sector$/i, 'industry_sector'],
  [/^year_?end$/i, 'financial_year_end'],
  [/^company_?name$/i, 'measured_entity_name'],
  [/^codes?$/i, 'applicable_code'],
];

/** The captions beside each fact, for a copy whose defined names were lost. */
const INSTRUCTION_LABELS: Array<[RegExp, InstructionField]> = [
  [/^\s*industry\s+sector\s*:?\s*$/i, 'industry_sector'],
  [/^\s*financial\s+year[\s-]*end\s*:?\s*$/i, 'financial_year_end'],
  [/^\s*measured\s+entity(?:\s+name)?\s*:?\s*$/i, 'measured_entity_name'],
  [/^\s*applicable\s+codes?\s*:?\s*$/i, 'applicable_code'],
];

/**
 * How far right of a caption its value may sit. The template's value is the
 * very next cell; its dropdown lists start two columns further on, and a blank
 * value must read as blank, not as the first entry of the list beside it.
 */
const LABEL_VALUE_REACH = 2;

const DAY_MS = 86_400_000;

/**
 * An Excel date serial as ISO. A year end is a date cell, so it arrives as a
 * number (45716) once its display format is set aside; a number that is not a
 * plausible modern date is no year end at all.
 */
function serialToIso(serial: number, date1904: boolean): string | null {
  if (!Number.isFinite(serial) || serial < 1) return null;
  // Day 0 of the 1900 system is 1899-12-30 (Excel counts a 29 Feb 1900 that
  // never was); of the 1904 system, 1904-01-01.
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const date = new Date(epoch + Math.floor(serial) * DAY_MS);
  const year = date.getUTCFullYear();
  if (year < 1980 || year > 2100) return null;
  return date.toISOString().slice(0, 10);
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

/** A year end typed as text: ISO, day-first dd/mm/yyyy (South African), or "28 February 2025". */
function textDateToIso(text: string): string | null {
  const s = text.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (dmy && Number(dmy[2]) >= 1 && Number(dmy[2]) <= 12 && Number(dmy[1]) >= 1 && Number(dmy[1]) <= 31) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  const long = /(\d{1,2})\s+([A-Za-z]{3,9}),?\s+(\d{4})/.exec(s);
  const month = long ? MONTHS[long[2].slice(0, 3).toLowerCase()] : undefined;
  if (long && month) return `${long[3]}-${month}-${long[1].padStart(2, '0')}`;
  return null;
}

/** One stated value for a fact, or null when the cell states nothing usable. */
function instructionValue(field: InstructionField, raw: unknown, date1904: boolean): string | null {
  if (raw === undefined || raw === null || isSpreadsheetError(raw)) return null;
  if (field === 'financial_year_end') {
    if (typeof raw === 'number') return serialToIso(raw, date1904);
    if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw.toISOString().slice(0, 10);
    return textDateToIso(String(raw));
  }
  if (typeof raw !== 'string') return null;
  const text = raw.replace(/\s+/g, ' ').trim();
  return text === '' ? null : text;
}

/**
 * Read the entity's profile off the workbook's Instructions sheet.
 *
 * The gathering template states the sector, the financial year end, the
 * measured entity and the applicable Codes on its Instructions sheet — and
 * names those cells (`Sector`, `YearEnd`, `CompanyName`, `Codes`). The sheet is
 * skipped as a document because it holds no evidence, which is how those four
 * facts were lost and the client had to type them again. A defined name is
 * read first; where a copy lost its names, the caption beside the value
 * ("Industry Sector:") finds it.
 */
export function readWorkbookInstructions(workbook: XLSX.WorkBook, cells?: CellReadOptions): WorkbookInstructions | null {
  const date1904 = Boolean((workbook.Workbook?.WBProps as { date1904?: boolean } | undefined)?.date1904);
  for (const sheetName of workbook.SheetNames) {
    if (!INSTRUCTION_SHEET_NAMES.has(normSheetName(sheetName))) continue;
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const found: Partial<Record<InstructionField, string>> = {};
    for (const [name, raw] of Object.entries(namedSheetCells(workbook, sheetName, cells))) {
      const field = INSTRUCTION_NAMES.find(([pattern]) => pattern.test(name))?.[1];
      if (!field || found[field]) continue;
      const value = instructionValue(field, raw, date1904);
      if (value) found[field] = value;
    }

    const matrix = sheetMatrix(sheet, cells);
    for (const row of matrix.slice(0, 60)) {
      for (let c = 0; c < row.length; c += 1) {
        const caption = row[c];
        if (typeof caption !== 'string') continue;
        const field = INSTRUCTION_LABELS.find(([pattern]) => pattern.test(caption))?.[1];
        if (!field || found[field]) continue;
        for (let k = c + 1; k <= c + LABEL_VALUE_REACH && k < row.length; k += 1) {
          if (row[k] === '' || row[k] === null || row[k] === undefined) continue;
          const value = instructionValue(field, row[k], date1904);
          if (value) found[field] = value;
          break;
        }
      }
    }

    if (Object.keys(found).length > 0) return { sheetName, ...found };
  }
  return null;
}

/** Above this many rows a sheet is a register, not a layout to read cell by cell. */
const MAX_MATRIX_ROWS = 600;
const MAX_MATRIX_COLS = 80;

/** The matrix without its trailing blank rows and columns, or undefined when too large. */
function boundedMatrix(matrix: unknown[][]): unknown[][] | undefined {
  const filled = (c: unknown) => c !== null && c !== undefined && String(c).trim() !== '';
  let rows = matrix.length;
  while (rows > 0 && !(matrix[rows - 1] ?? []).some(filled)) rows -= 1;
  if (rows === 0 || rows > MAX_MATRIX_ROWS) return undefined;
  let cols = 0;
  for (let r = 0; r < rows; r += 1) {
    const row = matrix[r] ?? [];
    for (let c = row.length - 1; c >= cols; c -= 1) {
      if (filled(row[c])) {
        cols = c + 1;
        break;
      }
    }
  }
  if (cols > MAX_MATRIX_COLS) return undefined;
  return matrix.slice(0, rows).map((row) => row.slice(0, cols));
}

/**
 * Two columns under one label ("Fuel" | "Fuel" beneath "Internal" | "External")
 * collapsed into one key, the second silently overwriting the first. Name each
 * duplicate by the label above it — the other half of a two-row header — and
 * by its position when there is none.
 */
function distinctHeaders(labels: string[], above: unknown[]): string[] {
  const count = new Map<string, number>();
  for (const label of labels) count.set(label, (count.get(label) ?? 0) + 1);
  const named = labels.map((label, i) => {
    if ((count.get(label) ?? 0) < 2) return label;
    const parent = String(above[i] ?? '').replace(/\s+/g, ' ').trim();
    return parent ? `${parent} ${label}` : label;
  });
  const seen = new Map<string, number>();
  return named.map((label) => {
    const n = (seen.get(label) ?? 0) + 1;
    seen.set(label, n);
    return n === 1 ? label : `${label} (${n})`;
  });
}

/** Sheets that never carry scoreable evidence — instructions, legends, lookups. */
const SKIP_SHEET_NAMES = new Set([
  'instructions', 'instruction', 'definitions', 'definition', 'guide', 'guidance',
  'lookups', 'lookup', 'dropdowns', 'dropdown', 'lists', 'reference', 'notes',
  'cover', 'index', 'contents', 'readme', 'legend', 'key',
]);

function normSheetName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** A row carries evidence if any non-blank, non-zero cell is present. */
function rowHasContent(row: Record<string, unknown>): boolean {
  return Object.values(row).some((value) => {
    if (value === null || value === undefined) return false;
    const text = String(value).trim();
    return text !== '' && text !== '0';
  });
}

/** How many cells in a row-array are non-blank. */
function filledCount(row: unknown[]): number {
  return row.filter((c) => c !== null && c !== undefined && String(c).trim() !== '').length;
}

/**
 * Column labels that identify a REAL register header row across the client
 * workbooks. Deliberately narrow: generic words ("date", "amount", "total")
 * appear in banners and instruction blocks too — "Date & Initial: ____" on the
 * Finance sheet hijacked a looser version of this list. A row only earns the
 * vocabulary bonus when at least TWO of these labels appear together, which
 * banners and dropdown legends never manage.
 */
const HEADER_VOCABULARY = /name\s*&?\s*surname|\bid\s*number\b|supplier\s*name|beneficiar|learner|\brace\b|\bgender\b|occupational\s*level|designation|job\s*title|expenditure|salary/i;

/**
 * Find the header row in a sheet's array-of-arrays.
 *
 * Client workbooks open with a banner ("Measured Entity: …"), a legend ("Use
 * dropdown"), then the real column header, then data — exactly the layout that
 * broke the importer. Taking row 0 makes the banner the headers and turns the
 * whole sheet into garbage the model cannot read, which is why the Procurement,
 * Ownership and SED sheets extracted nothing while Finance (no banner) did.
 *
 * Width alone is NOT enough. The Employment Equity sheet hides wide dropdown-
 * LEGEND rows above the real header ("PROP_CON_TRANS_FOR_LSC", "LSC", "CONR"…)
 * that out-fill it, so the widest-row rule crowned a legend and every employee
 * landed under a column keyed "Employees with Disabilities". So each candidate
 * row is scored by fill PLUS a strong bonus per known header label ("Name &
 * Surname", "ID Number", "Race"…) — vocabulary a legend row never carries.
 */
function findHeaderRow(matrix: unknown[][]): number {
  let bestIdx = 0;
  let bestScore = 0;
  // 25 rows: the EE sheet stacks a summary MATRIX above the per-employee
  // register, pushing the register's header past row 15.
  for (let i = 0; i < Math.min(matrix.length, 25); i += 1) {
    const cells = matrix[i] ?? [];
    const fill = filledCount(cells);
    const vocabulary = cells.filter((c) => typeof c === 'string' && HEADER_VOCABULARY.test(c)).length;
    // Two or more recognised labels together mark a register header; each then
    // outweighs several filled legend cells. A single incidental match earns
    // nothing, so banner rows cannot hijack the pick.
    const score = fill + (vocabulary >= 2 ? vocabulary * 5 : 0);
    // Strictly greater, so a tie keeps the EARLIER row — in a clean sheet the
    // header row and its data rows are equally wide and the header comes first.
    // A banner is narrower than the header, so it loses on fill regardless.
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Build header-keyed row objects from a sheet, skipping banner/legend rows.
 *
 * Two things the markdown renderer (sheetRegions) already did that this
 * structured path did not, both measured on a real Skills sheet:
 *
 *  1. ONLY THE DATA REGION. A category key laid out beside the learner table
 *     ("Category F | Bursaries…") shares the header row, so keying every
 *     column made the key's cells look like each learner's category — every
 *     learner "was" Category G/BR/MST, and the real (blank) category column
 *     was never seen as blank.
 *  2. BLANK-MEANS-DITTO. A training event is stated once (date, course,
 *     provider, cost) and the other learners on it follow as rows carrying
 *     only a name and ID. Without forward-fill those learners have no course
 *     and no provider, and downstream cannot tell a continuation row from a
 *     fragment. Text columns inherit; numeric/date columns never do, so the
 *     event's cost is counted once, on the row that states it.
 */
function sheetRowsWithHeader(matrix: unknown[][], maxRows: number, ditto: DittoOptions = {}): Array<Record<string, unknown>> {
  if (matrix.length === 0) return [];

  const asText = matrix.map((row) => row.map((c) => String(c ?? '')));
  const region = mainColumnRegion(asText) ?? { start: 0, end: matrix.reduce((w, r) => Math.max(w, r.length), 0) - 1 }; // not Math.max(...rows): spreading every row as an argument overflows the stack past ~120k rows
  const inRegion = <T>(row: T[]): T[] => row.slice(region.start, region.end + 1);
  const regionMatrix = matrix.map(inRegion);

  const headerIdx = findHeaderRow(regionMatrix);
  const rawHeaders = distinctHeaders(
    (regionMatrix[headerIdx] ?? []).map((c, i) => {
      const label = String(c ?? '').replace(/\s+/g, ' ').trim();
      return label || `col_${i}`;
    }),
    headerIdx > 0 ? regionMatrix[headerIdx - 1] ?? [] : [],
  );
  const width = rawHeaders.length;

  // Ditto-fill on the TEXT projection, then read typed values back from the
  // original cells where they exist — a filled cell is a copied string, a
  // stated cell keeps its number/date/percent. A stated cell whose text the
  // fill CHANGED is a wrapped fragment it rejoined ("Truck Mounted Crane -" →
  // "Truck Mounted Crane operator"), and the rejoined text is the value.
  const bodyText = asText.slice(headerIdx + 1).map((row) => {
    const cells = inRegion(row);
    while (cells.length < width) cells.push('');
    return cells.slice(0, width);
  });
  const filled = dittoFill(bodyText, width, ditto);

  const rows: Array<Record<string, unknown>> = [];
  for (let i = 0; i < filled.length && rows.length < maxRows; i += 1) {
    const original = regionMatrix[headerIdx + 1 + i] ?? [];
    const obj: Record<string, unknown> = {};
    for (let c = 0; c < width; c += 1) {
      const stated = original[c];
      const hasStated = stated !== undefined && stated !== null && String(stated).trim() !== '';
      const rewritten = hasStated && filled[i][c] !== bodyText[i][c];
      const value = hasStated && !rewritten ? stated : filled[i][c];
      if (value !== undefined && value !== null && String(value).trim() !== '') obj[rawHeaders[c]] = value;
    }
    if (Object.keys(obj).length > 0) rows.push(obj);
  }
  return rows;
}

/**
 * Render one sheet's rows as a markdown table. Kept local (rather than reusing
 * the file-wide renderer) so a sheet split is self-contained and testable.
 */
function sheetToMarkdown(sheetName: string, rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return `## ${sheetName}\n(empty)`;
  const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const header = `| ${columns.join(' | ')} |`;
  const divider = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) =>
    `| ${columns.map((c) => String(row[c] ?? '').replace(/\s+/g, ' ').trim()).join(' | ')} |`);
  return [`## ${sheetName}`, header, divider, ...body].join('\n');
}

function sheetToText(sheetName: string, rows: Array<Record<string, unknown>>): string {
  const lines = [`Sheet: ${sheetName}`];
  for (const row of rows) {
    const pairs = Object.entries(row)
      .filter(([, v]) => String(v ?? '').trim() !== '')
      .map(([k, v]) => `${k}: ${String(v).trim()}`);
    if (pairs.length > 0) lines.push(pairs.join(', '));
  }
  return lines.join('\n');
}

export interface SplitOptions {
  /** Cap per sheet, to bound a pathological workbook. */
  maxRowsPerSheet?: number;
  /** Below this many content rows a sheet is dropped as empty/boilerplate. */
  minContentRows?: number;
  /** How block-layout continuation rows are read (see DittoOptions in sheetRegions.ts). */
  ditto?: DittoOptions;
  /** How cells are read (see CellReadOptions in sheetCellValues.ts). */
  cells?: CellReadOptions;
  /**
   * Attach each sheet's named single cells (`namedCells`). Default on; the
   * ESG reading turns it off, since nothing there reads them and its inputs
   * stay as they were recorded.
   */
  namedCells?: boolean;
  /**
   * Read the Instructions sheet's profile (`instructions`, see
   * readWorkbookInstructions). Default on; the ESG reading turns it off, so
   * its inputs stay exactly as they were recorded.
   */
  instructions?: boolean;
}

/**
 * Split a workbook buffer into per-sheet documents.
 *
 * Returns [] when the buffer is not a readable workbook or has no sheet with
 * real content — the caller then falls back to whole-file extraction, so this
 * can never make a file LESS readable than before.
 */
export function splitWorkbookIntoSheets(buffer: Buffer, options: SplitOptions = {}): SheetDocument[] {
  const maxRows = options.maxRowsPerSheet ?? 20_000;
  const minContent = options.minContentRows ?? 1;

  let workbook: XLSX.WorkBook;
  try {
    // cellNF keeps each cell's number format — without it a percentage cell is
    // indistinguishable from a bare ratio (see sheetCellValues.ts).
    workbook = XLSX.read(buffer, { type: 'buffer', cellNF: true });
  } catch {
    return [];
  }
  // A sheet's declared size is a claim, not a fact (sheetBounds.ts): checked
  // before sheetMatrix builds a row for every cell the file claims.
  boundWorkbookSheets(workbook);

  const documents: SheetDocument[] = [];
  for (const sheetName of workbook.SheetNames) {
    if (SKIP_SHEET_NAMES.has(normSheetName(sheetName))) continue;

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    // Format-aware: a cell displaying `32%` must not reach the model as `0.32`.
    // See sheetCellValues.ts — losing the percent format is unrecoverable
    // downstream and forces the mapping layer to guess the unit.
    const matrix = sheetMatrix(sheet, options.cells);

    // Header-aware: skip the banner/legend rows and key data by the REAL column
    // headers, so the markdown the model reads has meaningful columns.
    const rows = sheetRowsWithHeader(matrix, maxRows, options.ditto).filter(rowHasContent);
    if (rows.length < minContent) continue;

    const visibility = workbook.Workbook?.Sheets?.find((entry) => entry.name === sheetName)?.Hidden ?? 0;
    const namedCells = options.namedCells === false ? {} : namedSheetCells(workbook, sheetName, options.cells);
    documents.push({
      sheetName,
      rows,
      markdown: sheetToMarkdown(sheetName, rows),
      text: sheetToText(sheetName, rows),
      matrix: boundedMatrix(matrix),
      hidden: visibility !== 0,
      ...(Object.keys(namedCells).length > 0 ? { namedCells } : {}),
    });
  }

  // The Instructions sheet was skipped above as a document (SKIP_SHEET_NAMES),
  // but its profile is still read here, and carried by the first document so
  // it is emitted once per workbook.
  const instructions = options.instructions === false || documents.length === 0
    ? null
    : readWorkbookInstructions(workbook, options.cells);
  if (instructions) documents[0] = { ...documents[0], instructions };

  return documents;
}

/**
 * Is a split worth doing? A single-sheet workbook gains nothing from being
 * "split" into one document, so the caller keeps its existing single-input path.
 */
export function shouldSplitWorkbook(documents: SheetDocument[]): boolean {
  return documents.length >= 2;
}
