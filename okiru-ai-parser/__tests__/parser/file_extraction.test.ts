import { describe, expect, it } from 'vitest';
import { extractionInputsFromUpload, rawExtractionInputFromUpload } from '../../src/services/fileExtraction.js';

describe('file extraction upload input', () => {
  it('preserves CSV evidence values before parser resolution', async () => {
    const input = await rawExtractionInputFromUpload({
      originalname: 'supplier_certificate.csv',
      mimetype: 'text/csv',
      size: 128,
      buffer: Buffer.from([
        'Document,Value',
        'Document Type,B-BBEE Certificate',
        'Enterprise Name,ABC Suppliers Pty Ltd',
        'B-BBEE Status Level,Level Two',
        'Black Ownership,51%',
        'Expiry Date,01 Feb 2027',
      ].join('\n')),
    });

    expect(input.raw_text).toContain('Enterprise Name: ABC Suppliers Pty Ltd');
    expect(input.raw_text).toContain('B-BBEE Status Level: Level Two');
    expect(input.raw_text).toContain('Black Ownership: 51%');
    expect(input.raw_text).toContain('Expiry Date: 01 Feb 2027');
    expect(input.tables).toHaveLength(1);
  });
});

describe('a single-sheet workbook still carries its parsed rows', () => {
  it('attaches structured rows and the sheet name, so deterministic readers can run', async () => {
    // Supplier ledgers are ALWAYS single-sheet workbooks. The splitter only
    // engages at two or more sheets, so without this they reached extraction as
    // markdown alone and the ledger reader never ran — every ledger in the real
    // pack extracted nothing.
    const XLSX = await import('xlsx');
    const sheet = XLSX.utils.aoa_to_sheet([
      ['DATE', 'DESCRIPTION', 'DEBIT', 'O/S BALANCE'],
      ['31/03/2024', 'SEVERAL INVOICES', 220965.42, 220965.42],
    ]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Sheet1');
    const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const inputs = await extractionInputsFromUpload({
      originalname: 'B P EDENVALE LEDGER.xlsx',
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer,
      size: buffer.length,
    });

    expect(inputs).toHaveLength(1);
    // Filename is NOT decorated with a sheet suffix — the ledger's supplier name
    // is read from it.
    expect(inputs[0].filename).toBe('B P EDENVALE LEDGER.xlsx');
    const table = inputs[0].tables[0] as { sheetName: string; rows: Array<Record<string, unknown>> };
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0].DEBIT).toBeCloseTo(220965.42, 2);
  });
});
