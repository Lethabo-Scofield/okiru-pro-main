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

export interface SheetDocument {
  /** Sheet name, verbatim. */
  sheetName: string;
  /** Rows as objects, header-keyed. */
  rows: Array<Record<string, unknown>>;
  /** Structure-preserving markdown for the model — one sheet's table. */
  markdown: string;
  /** Flat text for the deterministic path. */
  text: string;
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

/** Build header-keyed row objects from a sheet, skipping banner/legend rows. */
function sheetRowsWithHeader(sheet: XLSX.WorkSheet, maxRows: number): Array<Record<string, unknown>> {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][];
  if (matrix.length === 0) return [];

  const headerIdx = findHeaderRow(matrix);
  const rawHeaders = (matrix[headerIdx] ?? []).map((c, i) => {
    const label = String(c ?? '').replace(/\s+/g, ' ').trim();
    return label || `col_${i}`;
  });

  const rows: Array<Record<string, unknown>> = [];
  for (let i = headerIdx + 1; i < matrix.length && rows.length < maxRows; i += 1) {
    const cells = matrix[i] ?? [];
    const obj: Record<string, unknown> = {};
    for (let c = 0; c < rawHeaders.length; c += 1) {
      const value = cells[c];
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
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch {
    return [];
  }

  const documents: SheetDocument[] = [];
  for (const sheetName of workbook.SheetNames) {
    if (SKIP_SHEET_NAMES.has(normSheetName(sheetName))) continue;

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    // Header-aware: skip the banner/legend rows and key data by the REAL column
    // headers, so the markdown the model reads has meaningful columns.
    const rows = sheetRowsWithHeader(sheet, maxRows).filter(rowHasContent);
    if (rows.length < minContent) continue;

    documents.push({
      sheetName,
      rows,
      markdown: sheetToMarkdown(sheetName, rows),
      text: sheetToText(sheetName, rows),
    });
  }

  return documents;
}

/**
 * Is a split worth doing? A single-sheet workbook gains nothing from being
 * "split" into one document, so the caller keeps its existing single-input path.
 */
export function shouldSplitWorkbook(documents: SheetDocument[]): boolean {
  return documents.length >= 2;
}
