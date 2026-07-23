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

    const allRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    const rows = allRows.slice(0, maxRows).filter(rowHasContent);
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
