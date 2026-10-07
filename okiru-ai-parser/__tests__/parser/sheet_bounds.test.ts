/**
 * A spreadsheet's declared size is checked before the parser reads rows
 * (`sheetBounds.ts`). Both workbook readers built a row for every cell the
 * file CLAIMED — a 2 KB upload claiming A1:XFD1048576 asked for seventeen
 * billion of them. The files here are built by hand: SheetJS's own writer
 * walks the claim too, so it cannot write the attack without hanging.
 */
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { extractWorkbookText } from '../../src/services/fileExtraction.js';
import { splitWorkbookIntoSheets } from '../../src/services/workbookSheetSplit.js';
import { boundWorkbookSheets, SHEET_AREA_CAP } from '../../src/services/sheetBounds.js';

/** A minimal, valid one-sheet .xlsx whose declared dimension is whatever we say. */
async function craft(dimension: string, cells: Record<string, number | string>): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
  );
  zip
    .folder('_rels')!
    .file(
      '.rels',
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    );
  const xl = zip.folder('xl')!;
  xl.file(
    'workbook.xml',
    '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Fuel" sheetId="1" r:id="rId1"/></sheets></workbook>',
  );
  xl.folder('_rels')!.file(
    'workbook.xml.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
  );
  const byRow = new Map<number, string[]>();
  for (const [ref, v] of Object.entries(cells)) {
    const row = XLSX.utils.decode_cell(ref).r + 1;
    const xml = typeof v === 'number' ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${v}</t></is></c>`;
    byRow.set(row, [...(byRow.get(row) ?? []), xml]);
  }
  const rowsXml = [...byRow.entries()]
    .sort(([a], [b]) => a - b)
    .map(([r, c]) => `<row r="${r}">${c.join('')}</row>`)
    .join('');
  xl.folder('worksheets')!.file(
    'sheet1.xml',
    `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="${dimension}"/><sheetData>${rowsXml}</sheetData></worksheet>`,
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

const FUEL = { A1: 'Vehicle', B1: 'Litres', A2: 'AB56STGP', B2: 412, A3: 'KX11AAGP', B3: 380 };

describe('the parser, given a workbook that lies about its size', () => {
  it('reads a sheet claiming the whole grid in milliseconds, with the same text an honest one gives', async () => {
    const honest = await craft('A1:B3', FUEL);
    const inflated = await craft('A1:XFD1048576', FUEL);
    expect(XLSX.read(inflated, { type: 'buffer' }).Sheets.Fuel!['!ref']).toBe('A1:XFD1048576');

    const startedAt = Date.now();
    const fromInflated = extractWorkbookText(inflated);
    const split = splitWorkbookIntoSheets(inflated);
    expect(Date.now() - startedAt).toBeLessThan(2_000);

    expect(fromInflated).toEqual(extractWorkbookText(honest));
    expect(split).toEqual(splitWorkbookIntoSheets(honest));
    expect(fromInflated.text).toContain('AB56STGP');
  });

  it('keeps a bounded block when the cells themselves are spread across the grid', async () => {
    const bomb = await craft('A1:XFD1048576', { A1: 'Vehicle', XFD1048576: 1 });
    const book = XLSX.read(bomb, { type: 'buffer' });
    const notes = boundWorkbookSheets(book);
    const x = XLSX.utils.decode_range(book.Sheets.Fuel!['!ref']!);
    expect((x.e.r - x.s.r + 1) * (x.e.c - x.s.c + 1)).toBeLessThanOrEqual(SHEET_AREA_CAP);
    expect(notes[0]?.droppedCells).toBe(1);
  });
});
