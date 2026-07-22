/**
 * Regression: the header row must be found past a banner.
 *
 * Real client workbooks open with a title banner, then a legend row, then the
 * actual column headers. The old rule — "first row with 2+ non-empty cells" —
 * picked the BANNER, so the parser looked for shareholder columns among title
 * text, matched nothing, and returned zero rows.
 *
 * Measured on the real Thandanani Transport workbook: the Ownership sheet
 * yielded 0 shareholders, scoring 0 of 25 Ownership points and reporting a
 * Level 1 entity (102 points, certificate 13609) as Level 4.
 */
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { normalizeExcelBuffer } from '../../src/lib/workbookExcelNormalizer';

/** Build a workbook shaped exactly like the client's Ownership sheet. */
function ownershipWorkbook(): ArrayBuffer {
  const aoa = [
    ['Measured Entity: Thandanani Packers & Haulers cc', 'Ownership Equity', 'Date & Initial:_______'],
    ['Year End: 28 February 2025'],
    ['Detail', 'Use dropdown', 'Use dropdown', 'Use dropdown', 'LSC'],
    // Leading blank cell: the row-number column has no header, exactly as in the
    // client workbook.
    ['', 'Name & Surname', 'ID Number', 'Race', 'Gender', 'Foreign'],
    [1, 'Venugopal Lutchman, Naidoo', '5608305112083', 'Black', 'Male', 0],
    [2, 'Nomsa Dlamini', '8801015800085', 'Black', 'Female', 0],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Ownership');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

describe('header-row detection', () => {
  it('finds the real header row beneath a title banner and legend', async () => {
    const result = await normalizeExcelBuffer(ownershipWorkbook(), 'client.xlsx');
    const rows = (result.sections?.ownership?.rows ?? []) as Array<Record<string, unknown>>;

    // The bug produced [].
    expect(rows.length).toBe(2);
    expect(rows[0].shareholderName).toBe('Venugopal Lutchman, Naidoo');
    expect(rows[0].idNumber).toBe('5608305112083');
    expect(rows[0].gender).toBe('Male');
    expect(rows[1].shareholderName).toBe('Nomsa Dlamini');
  });

  it('does not treat the banner text as shareholder data', async () => {
    const result = await normalizeExcelBuffer(ownershipWorkbook(), 'client.xlsx');
    const rows = (result.sections?.ownership?.rows ?? []) as Array<Record<string, unknown>>;

    const names = rows.map((row) => String(row.shareholderName ?? ''));
    expect(names.some((name) => name.includes('Measured Entity'))).toBe(false);
    expect(names.some((name) => name.includes('Use dropdown'))).toBe(false);
  });

  it('still reads a plain sheet whose headers are on the first row', async () => {
    // The fallback must survive: sheets we do not model keep old behaviour.
    const aoa = [
      ['', 'Name & Surname', 'ID Number', 'Race', 'Gender'],
      [1, 'Thabo Nkosi', '9001015800086', 'Black', 'Male'],
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Ownership');
    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

    const result = await normalizeExcelBuffer(buffer, 'plain.xlsx');
    const rows = (result.sections?.ownership?.rows ?? []) as Array<Record<string, unknown>>;
    expect(rows.length).toBe(1);
    expect(rows[0].shareholderName).toBe('Thabo Nkosi');
  });
});
