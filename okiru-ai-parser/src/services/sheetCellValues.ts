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
 * The value to carry forward for one cell.
 *
 * Percentage cells become their DISPLAY text (`"32%"`), which is both what the
 * user sees and an unambiguous statement of the unit. Every other cell keeps
 * the raw value untouched.
 */
export function cellValue(cell: XLSX.CellObject | undefined): unknown {
  if (!cell) return undefined;
  if (!isPercentFormat(cell)) return cell.v;

  // `w` is the formatted text Excel would render. Prefer it, but fall back to
  // computing the percentage ourselves when the file carries no cached display
  // string (common in machine-generated workbooks).
  if (typeof cell.w === 'string' && cell.w.trim()) return cell.w.trim();
  const raw = typeof cell.v === 'number' ? cell.v : Number(cell.v);
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
export function sheetMatrix(sheet: XLSX.WorkSheet): unknown[][] {
  const ref = sheet['!ref'];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const matrix: unknown[][] = [];

  for (let r = range.s.r; r <= range.e.r; r += 1) {
    const row: unknown[] = [];
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const address = XLSX.utils.encode_cell({ r, c });
      const value = cellValue(sheet[address] as XLSX.CellObject | undefined);
      row.push(value === undefined || value === null ? '' : value);
    }
    matrix.push(row);
  }

  return matrix;
}
