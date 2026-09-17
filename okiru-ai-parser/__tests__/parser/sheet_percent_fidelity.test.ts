/**
 * A percentage cell must not reach the model as a bare ratio.
 *
 * `32%` is stored as 0.32. Read without its number format it becomes the text
 * "0.32", and every layer downstream then has to guess whether that means 32%
 * or 0.32% — the guess that made the deterministic Excel importer beat the
 * parser on the same workbook.
 */
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { cellValue, isPercentFormat, sheetMatrix } from '../../src/services/sheetCellValues.js';
import { splitWorkbookIntoSheets } from '../../src/services/workbookSheetSplit.js';
import { extractWorkbookText } from '../../src/services/fileExtraction.js';

/** A sheet whose ownership columns are percent-formatted, as real files are. */
function ownershipWorkbook(): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Shareholder', 'Black Ownership', 'Black Women Ownership', 'Shares'],
    ['Sipho Ndlovu', 0.32, 0.155, 3200],
    ['Thandi Mokoena', 0.51, 0.51, 5100],
  ]);
  // Percent-format the two ownership columns (B2:C3), leaving Shares numeric.
  for (const address of ['B2', 'C2', 'B3', 'C3']) {
    (sheet[address] as XLSX.CellObject).z = '0.00%';
  }
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Ownership');
  // A second sheet so the workbook takes the multi-sheet split path.
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([['Supplier', 'Spend'], ['Acme', 125000]]),
    'Procurement',
  );
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('percentage-formatted cells', () => {
  it('recognises a percent number format', () => {
    const sheet = XLSX.utils.aoa_to_sheet([[0.32]]);
    expect(isPercentFormat(sheet.A1 as XLSX.CellObject)).toBe(false);
    (sheet.A1 as XLSX.CellObject).z = '0.00%';
    expect(isPercentFormat(sheet.A1 as XLSX.CellObject)).toBe(true);
  });

  it('does not mistake a quoted percent sign for a percentage format', () => {
    // `"%"` in a format string is a literal character, not a multiplier.
    const sheet = XLSX.utils.aoa_to_sheet([[42]]);
    (sheet.A1 as XLSX.CellObject).z = '0" %"';
    expect(isPercentFormat(sheet.A1 as XLSX.CellObject)).toBe(false);
  });

  it('carries the percent sign rather than the stored ratio', () => {
    const sheet = XLSX.utils.aoa_to_sheet([[0.32]]);
    (sheet.A1 as XLSX.CellObject).z = '0.00%';
    delete (sheet.A1 as XLSX.CellObject).w; // machine-generated file: no cached display text
    expect(cellValue(sheet.A1 as XLSX.CellObject)).toBe('32%');
  });

  it('leaves non-percentage cells numeric so money keeps its precision', () => {
    const sheet = XLSX.utils.aoa_to_sheet([[1234.567]]);
    expect(cellValue(sheet.A1 as XLSX.CellObject)).toBe(1234.567);
    expect(sheetMatrix(sheet)[0][0]).toBe(1234.567);
  });

  it('reaches the model as a percentage through the multi-sheet split', () => {
    const [ownership] = splitWorkbookIntoSheets(ownershipWorkbook());
    expect(ownership.sheetName).toBe('Ownership');
    // The cell's own format (0.00%) decides the precision shown; what matters
    // is that the unit survives.
    expect(ownership.markdown).toContain('32.00%');
    expect(ownership.markdown).toContain('51.00%');
    expect(ownership.markdown).toContain('15.50%');
    // The bare ratio must NOT be what the model sees.
    expect(ownership.markdown).not.toMatch(/\|\s*0\.32\s*\|/);
    // Non-percentage columns stay numeric.
    expect(ownership.markdown).toContain('3200');
  });

  it('carries the percent sign through the single-workbook table path', () => {
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([['Black Ownership'], [0.32]]);
    (sheet.A2 as XLSX.CellObject).z = '0.00%';
    XLSX.utils.book_append_sheet(book, sheet, 'Ownership');
    const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const { tables } = extractWorkbookText(buffer);
    const rows = (tables[0] as { rows: Array<Record<string, unknown>> }).rows;
    expect(rows[0]['Black Ownership']).toBe('32.00%');
  });
});
