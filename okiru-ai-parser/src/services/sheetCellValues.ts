/**
 * Format-aware cell reading — keep what the cell MEANS, not just what it stores.
 *
 * A spreadsheet cell showing `32%` stores the number `0.32`. Excel knows the
 * difference because it keeps the number format alongside the value; a plain
 * `sheet_to_json` read throws that format away and hands downstream code a bare
 * `0.32`.
 *
 * That single loss is why the deterministic Excel importer beat the parser on
 * the same workbook. Once the format is gone nothing downstream can recover the
 * fact — the mapping layer is reduced to GUESSING whether `0.32` means "32%" or
 * "0.32%", and a guess in a scored field is how a wrong B-BBEE level gets
 * certified.
 *
 * So: percentage-formatted cells keep their percent sign. Everything else keeps
 * its raw value, because money and counts must stay numeric — rendering
 * `1234.567` as the display string `"R 1 234.57"` would lose real precision to
 * fix a problem those cells do not have.
 */
import * as XLSX from 'xlsx';

/** Does this cell's number format make it a percentage? */
export function isPercentFormat(cell: XLSX.CellObject | undefined): boolean {
  if (!cell || cell.t !== 'n') return false;
  const format = typeof cell.z === 'string' ? cell.z : '';
  // A literal percent sign in the format is the signal. Escaped quotes ("%")
  // are a literal character in the display text, not a percent multiplier.
  return format.replace(/"[^"]*"/g, '').includes('%');
}

/**
 * SheetJS stores an ERROR cell (`#REF!`, `#DIV/0!`, …) as `{ t: 'e', v: <code> }`,
 * where the code is a small integer: `#REF!` is 23. Handing `v` on as the
 * cell's value turns a broken formula into a plausible-looking number. That is
 * exactly how a client's Total Measured Procurement Spend was read as 23: its
 * `=TMPS_Inc-H74` formula pointed at a deleted cell. (It was long put down to a
 * supplier row count, because the schedule beside it happened to have 23 rows.)
 */
const ERROR_TEXT_BY_CODE: Record<number, string> = {
  0: '#NULL!',
  7: '#DIV/0!',
  15: '#VALUE!',
  23: '#REF!',
  29: '#NAME?',
  36: '#NUM!',
  42: '#N/A',
  43: '#GETTING_DATA',
};

const ERROR_TEXT = /^#(?:NULL!|DIV\/0!|VALUE!|REF!|NAME\?|NUM!|N\/A|GETTING_DATA|SPILL!|CALC!|FIELD!|BLOCKED!|CONNECT!|UNKNOWN!|BUSY!)$/;

/** The error text a SheetJS error cell displays (`"#REF!"`), or null for any other cell. */
export function spreadsheetErrorText(cell: XLSX.CellObject | undefined): string | null {
  if (!cell || cell.t !== 'e') return null;
  if (typeof cell.w === 'string' && ERROR_TEXT.test(cell.w.trim())) return cell.w.trim();
  const code = typeof cell.v === 'number' ? cell.v : Number(cell.v);
  return ERROR_TEXT_BY_CODE[code] ?? '#ERROR!';
}

/** Is this value a spreadsheet error marker, as `cellValue` emits for an error cell? */
export function isSpreadsheetError(value: unknown): value is string {
  return typeof value === 'string' && (ERROR_TEXT.test(value.trim()) || value.trim() === '#ERROR!');
}

export interface CellReadOptions {
  /**
   * Read a percent cell as its EXACT percentage whenever its display text
   * rounds it. A supplier stored as 0.506 in a "0%" cell DISPLAYS "51%", and
   * read as displayed it cleared the 51% black-owned procurement line it does
   * not meet; exact, it reads "50.6%". Display text that already states the
   * stored value ("36.59%") is kept as is. Default on (the B-BBEE reading). The
   * ESG reading turns it off and keeps the display text its recordings were
   * made from.
   */
  exactPercent?: boolean;
  /**
   * Read an error cell as its error text ("#REF!", "#DIV/0!") rather than the
   * numeric code SheetJS stores (23, 7). Default on (the B-BBEE reading). The
   * ESG reading turns it off, so its registers read exactly as they did when
   * they were recorded and checked against the ESG answer key: a fuel log's
   * "#DIV/0!" consumption cells still arrive there as 7. Changing that is an
   * ESG change, to be made and measured against the ESG key on its own.
   */
  errorText?: boolean;
}

/**
 * The value to carry forward for one cell.
 *
 * Percentage cells become their DISPLAY text (`"32%"`), which is both what the
 * user sees and an unambiguous statement of the unit — or, where that text
 * rounds the stored value, the exact percentage (see CellReadOptions). Error cells become their
 * error text (`"#REF!"`), never their numeric error code: no reader may take a
 * broken formula for a figure, but a reader that looks for one (a labelled
 * total) can see the error and report it. Every other cell keeps the raw value
 * untouched.
 */
export function cellValue(cell: XLSX.CellObject | undefined, options: CellReadOptions = {}): unknown {
  if (!cell) return undefined;
  const error = options.errorText === false ? null : spreadsheetErrorText(cell);
  if (error) return error;
  if (!isPercentFormat(cell)) return cell.v;

  const display = typeof cell.w === 'string' && cell.w.trim() ? cell.w.trim() : null;
  const raw = typeof cell.v === 'number' ? cell.v : Number(cell.v);
  if (options.exactPercent !== false && Number.isFinite(raw)) {
    // Six decimals drop float noise (0.506 * 100 = 50.60000000000001) and
    // nothing a threshold could turn on.
    const exact = Number((raw * 100).toFixed(6));
    const shown = display === null ? NaN : Number(display.replace(/[\s,%]/g, ''));
    return shown === exact ? display : `${exact}%`;
  }

  // `w` is the formatted text Excel would render. Prefer it, but fall back to
  // computing the percentage ourselves when the file carries no cached display
  // string (common in machine-generated workbooks).
  if (display) return display;
  if (!Number.isFinite(raw)) return cell.v;
  // Trailing zeros are noise in a label the model reads: 0.32 → "32%".
  return `${Number((raw * 100).toFixed(4))}%`;
}

/**
 * Read a worksheet as a matrix of format-aware values, mirroring
 * `sheet_to_json(sheet, { header: 1, defval: '' })` but preserving percentages.
 *
 * Returns `''` for empty cells so callers can keep treating blanks as blanks.
 */
export function sheetMatrix(sheet: XLSX.WorkSheet, options: CellReadOptions = {}): unknown[][] {
  const ref = sheet['!ref'];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const matrix: unknown[][] = [];

  for (let r = range.s.r; r <= range.e.r; r += 1) {
    const row: unknown[] = [];
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const address = XLSX.utils.encode_cell({ r, c });
      const value = cellValue(sheet[address] as XLSX.CellObject | undefined, options);
      row.push(value === undefined || value === null ? '' : value);
    }
    matrix.push(row);
  }

  return matrix;
}

/**
 * The workbook's own NAMED single cells that sit on this sheet, with their
 * format-aware values: `{ TMPS_Inc: 9200000, TMPS_Excl: '#REF!' }`.
 *
 * A defined name is the workbook stating what a cell holds, so it is a label
 * even where the sheet prints none: the BEE gathering template's TMPS
 * inclusions total (C74) has no caption on its row, only the name `TMPS_Inc`.
 * Ranges are left out; this never evaluates a formula, it only reads the cell
 * the name points at.
 *
 * Scope: a name's reference already says which sheet and cell it means, so a
 * name scoped to another sheet still counts. Real workbooks need this: the
 * client's updated gathering file carries its `TMPS_Inc` scoped to the
 * Instructions sheet while pointing at Finance!C74. Where one name exists in
 * several scopes, a name scoped to this sheet wins, then a workbook-wide one.
 */
export function namedSheetCells(
  workbook: XLSX.WorkBook,
  sheetName: string,
  options: CellReadOptions = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return out;
  const sheetIndex = workbook.SheetNames.indexOf(sheetName);
  const priorityOf = new Map<string, number>();

  for (const named of workbook.Workbook?.Names ?? []) {
    if (!named?.Name || typeof named.Ref !== 'string') continue;
    const match = /^(?:'((?:[^']|'')+)'|([^!'"]+))!\$?([A-Z]{1,3})\$?(\d+)$/i.exec(named.Ref.trim());
    if (!match) continue;
    const target = (match[1] ?? match[2] ?? '').replace(/''/g, "'");
    if (target !== sheetName) continue;
    const priority = typeof named.Sheet !== 'number' ? 1 : named.Sheet === sheetIndex ? 2 : 0;
    if ((priorityOf.get(named.Name) ?? -1) >= priority) continue;
    const value = cellValue(sheet[`${match[3].toUpperCase()}${match[4]}`] as XLSX.CellObject | undefined, options);
    if (value === undefined || value === null || value === '') continue;
    out[named.Name] = value;
    priorityOf.set(named.Name, priority);
  }
  return out;
}
