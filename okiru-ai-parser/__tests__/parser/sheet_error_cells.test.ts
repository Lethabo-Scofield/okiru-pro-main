/**
 * A spreadsheet ERROR cell is not a number.
 *
 * SheetJS stores `#REF!` as `{ t: 'e', v: 23 }`. Passing `v` on made a client's
 * broken `=TMPS_Inc-H74` formula arrive as TMPS = 23. That figure was long
 * mistaken for a supplier row count because the schedule beside it happened to
 * have 23 rows. These tests build the gathering template's Finance block
 * synthetically: a `#REF!` TMPS in one workbook and a stated TMPS in its sibling.
 */
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  cellValue,
  isSpreadsheetError,
  namedSheetCells,
  sheetMatrix,
  spreadsheetErrorText,
} from '../../src/services/sheetCellValues.js';
import { splitWorkbookIntoSheets } from '../../src/services/workbookSheetSplit.js';
import { extractionInputsFromUpload, extractWorkbookText } from '../../src/services/fileExtraction.js';
import { extractSheetFinancials } from '../../src/services/sheetFinancialsExtraction.js';
import { extractCaseEntities } from '../../src/services/caseExtraction.js';
import type { ExtractionModel } from '../../src/services/aiExtraction.js';

const REF: XLSX.CellObject = { t: 'e', v: 23, w: '#REF!' };

/**
 * The template's Finance sheet, rows 51-76: a heading, the inclusions block
 * (C74 named TMPS_Inc), the exclusions block (H74 named TMPS_Excl), and the
 * labelled TMPS on row 76. `tmps` is either the stated figure or `#REF!`.
 */
function financeSheet(tmps: number | 'REF'): XLSX.WorkSheet {
  // The banner row spans every column, as the template's does; its year labels
  // sit over the wrong columns, which is why the readers scan cells.
  const sheet = XLSX.utils.aoa_to_sheet([
    ['FINANCIAL INFORMATION', 'Year 0', 'Year -1', 'Year -2', 'Year -3', 'Year -4', 'Year -5', 'Year -6'],
    ['Turnover', 12345678],
  ]);
  XLSX.utils.sheet_add_aoa(sheet, [
    ['TOTAL MEASURED PROCUREMENT SPEND'],
    ['Inclusions', '', '', '', 'Exclusions'],
    ['Expenses', '', 1500000, '', 'Council Levies/Rates', '', '', 400000],
    ['Cost of Sales', '', 7700000, '', 'SDL, UIF, PAYE', '', '', 300000.5],
  ], { origin: 'A51' });
  XLSX.utils.sheet_add_aoa(sheet, [['', '', 9200000, '', '', '', '', 4076543.22]], { origin: 'A74' });
  XLSX.utils.sheet_add_aoa(sheet, [['Total Measured Procurement Spend  ', '', tmps === 'REF' ? 0 : tmps]], { origin: 'A76' });
  if (tmps === 'REF') {
    sheet.C76 = { ...REF };
    sheet.H74 = { ...REF };
  }
  return sheet;
}

/** A two-sheet gathering workbook, written and read back as a real upload is. */
function gatheringWorkbook(tmps: number | 'REF', imports = 0): Buffer {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, financeSheet(tmps), 'Finance');
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([
      ['Supplier Name', 'Expenditure (excluding VAT)'],
      ['Acme Logistics', 450000],
      ['Bongi Fuels', 700000.25],
    ]),
    'Procurement',
  );
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([
      ['Summary'],
      ['Value of Imports Procurement that can be excluded from Total Measured Procurement Spend (TMPS):', '', '', 0],
      ['Total Procurement Expenditure from foreign suppliers (Per the schedule below):', '', '', imports],
    ]),
    'Imports',
  );
  book.Workbook = {
    Names: [
      { Name: 'TMPS_Inc', Ref: "'Finance'!$C$74" },
      { Name: 'TMPS_Excl', Ref: 'Finance!$H$74' },
      { Name: 'PP_ExclVAT', Ref: 'Procurement!$B$2:$B$65535' },
    ],
  };
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

const upload = (name: string, buffer: Buffer) => ({
  originalname: name,
  mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  buffer,
  size: buffer.length,
});

describe('error cells', () => {
  it('reads an error cell as its error text, never its numeric code', () => {
    expect(cellValue({ ...REF })).toBe('#REF!');
    expect(cellValue({ t: 'e', v: 7 })).toBe('#DIV/0!');
    expect(cellValue({ t: 'e', v: 42 })).toBe('#N/A');
    expect(spreadsheetErrorText({ t: 'n', v: 23 })).toBeNull();
    expect(cellValue({ t: 'n', v: 23 })).toBe(23);
  });

  it('recognises the error markers it emits, and nothing else', () => {
    expect(isSpreadsheetError('#REF!')).toBe(true);
    expect(isSpreadsheetError('#DIV/0!')).toBe(true);
    expect(isSpreadsheetError('#REF! (see note)')).toBe(false);
    expect(isSpreadsheetError('REF')).toBe(false);
    expect(isSpreadsheetError(23)).toBe(false);
  });

  it('survives a real write and read: the split rows hold "#REF!", not 23', () => {
    const [finance] = splitWorkbookIntoSheets(gatheringWorkbook('REF')).filter((s) => s.sheetName === 'Finance');
    // The value row, not the section heading above it (same words, upper case).
    const tmpsRow = finance.rows.find((row) => Object.values(row).includes('Total Measured Procurement Spend  '));
    expect(tmpsRow).toBeDefined();
    expect(Object.values(tmpsRow!)).toContain('#REF!');
    expect(Object.values(tmpsRow!)).not.toContain(23);
    expect(finance.markdown).not.toMatch(/\|\s*23\s*\|/);
  });

  it('covers the whole-workbook path too (single-sheet fallback rows and tables)', () => {
    const { tables } = extractWorkbookText(gatheringWorkbook('REF'));
    const finance = (tables as Array<{ sheetName: string; rows: Array<Record<string, unknown>> }>).find((t) => t.sheetName === 'Finance')!;
    const cells = finance.rows.flatMap((row) => Object.values(row));
    expect(cells).toContain('#REF!');
    expect(cells).not.toContain(23);
    const matrix = sheetMatrix(XLSX.read(gatheringWorkbook('REF'), { type: 'buffer', cellNF: true }).Sheets.Finance);
    expect(matrix[75][2]).toBe('#REF!');
  });
});

describe('named cells', () => {
  it('reads the single cells a defined name points at, on this sheet only', () => {
    const book = XLSX.read(gatheringWorkbook('REF'), { type: 'buffer', cellNF: true });
    expect(namedSheetCells(book, 'Finance')).toEqual({ TMPS_Inc: 9200000, TMPS_Excl: '#REF!' });
    // A range is not a single stated figure.
    expect(namedSheetCells(book, 'Procurement')).toEqual({});
  });

  it('counts a name scoped to another sheet that points here, preferring this sheet\'s own scope', () => {
    // The client's updated workbook scopes TMPS_Inc to its Instructions sheet
    // while pointing at Finance!C74.
    const book = XLSX.read(gatheringWorkbook('REF'), { type: 'buffer', cellNF: true });
    book.Workbook = {
      Names: [
        { Name: 'TMPS_Inc', Ref: "'Finance'!$C$74", Sheet: 2 },
        { Name: 'Turnover', Ref: "'Finance'!$B$2", Sheet: 2 },
        { Name: 'Turnover', Ref: "'Finance'!$C$74", Sheet: 0 },
      ],
    };
    expect(namedSheetCells(book, 'Finance')).toEqual({ TMPS_Inc: 9200000, Turnover: 9200000 });
  });

  it('travels with the split sheet into the extraction input', async () => {
    const inputs = await extractionInputsFromUpload(upload('Pack_Updated.xlsx', gatheringWorkbook('REF')));
    const finance = inputs.find((i) => i.metadata?.sheet_name === 'Finance')!;
    expect((finance.tables?.[0] as { namedCells?: unknown }).namedCells).toEqual({ TMPS_Inc: 9200000, TMPS_Excl: '#REF!' });
  });
});

describe('labelled TMPS from a Finance sheet holding #REF!', () => {
  const silent: ExtractionModel = { name: 'fake', complete: async () => '{}' };

  async function financials(buffer: Buffer, filename: string) {
    const [finance] = splitWorkbookIntoSheets(buffer).filter((s) => s.sheetName === 'Finance');
    return extractSheetFinancials(silent, {
      filename: `${filename} › Finance`,
      raw_text: finance.text,
      markdown: finance.markdown,
      rows: finance.rows,
      namedCells: finance.namedCells,
    });
  }

  it('reports the broken TMPS cell instead of reading a figure from it', async () => {
    const result = await financials(gatheringWorkbook('REF'), 'Pack_Updated.xlsx');
    expect(result).not.toBeNull();
    const fields = result!.values.map((v) => v.field);
    expect(fields).not.toContain('total_measured_procurement_spend');
    expect(result!.exceptions.some((e) => /TMPS cell holds #REF!/.test(e))).toBe(true);
  });

  it('never computes TMPS from the inclusions and exclusions it can see', async () => {
    const result = await financials(gatheringWorkbook('REF'), 'Pack_Updated.xlsx');
    const numbers = result!.values.map((v) => v.value);
    expect(numbers).not.toContain(9200000 - 4076543.22);
    expect(numbers).not.toContain(23);
  });

  it('emits the inclusions total under its own field, from the workbook\'s defined name', async () => {
    const result = await financials(gatheringWorkbook('REF'), 'Pack_Updated.xlsx');
    const byField = Object.fromEntries(result!.values.map((v) => [v.field, v.value]));
    expect(byField.tmps_inclusions).toBe(9200000);
  });

  it('reads the stated TMPS from the sibling workbook whose formula is intact', async () => {
    const result = await financials(gatheringWorkbook(5123456.78), 'Supplier Spend_FY2030.xlsm');
    const byField = Object.fromEntries(result!.values.map((v) => [v.field, v.value]));
    expect(byField.total_measured_procurement_spend).toBe(5123456.78);
    expect(byField.tmps_inclusions).toBe(9200000);
    expect(result!.exceptions).toEqual([]);
  });

  it('reads a captioned inclusions row when the workbook has no defined name', async () => {
    const rows = [
      { 'FINANCIAL INFORMATION': 'Total Inclusions', 'Year -1': 9200000 },
      { 'FINANCIAL INFORMATION': 'Total Measured Procurement Spend', 'Year -1': 5123456.78 },
    ];
    const result = await extractSheetFinancials(silent, { filename: 'wb.xlsx › Finance', raw_text: 'x', rows });
    const byField = Object.fromEntries(result!.values.map((v) => [v.field, v.value]));
    expect(byField.tmps_inclusions).toBe(9200000);
    expect(byField.total_measured_procurement_spend).toBe(5123456.78);
  });
});

describe('a case with the broken workbook and a sibling that states TMPS', () => {
  const silent: ExtractionModel = { name: 'fake', complete: async () => '{}' };

  for (const order of ['broken first', 'broken last'] as const) {
    it(`takes the stated TMPS and reports the #REF! (${order})`, async () => {
      const broken = await extractionInputsFromUpload(upload('Pack_Updated.xlsx', gatheringWorkbook('REF', 312345)));
      const stated = await extractionInputsFromUpload(upload('Supplier Spend_FY2030.xlsm', gatheringWorkbook(5123456.78)));
      const inputs = order === 'broken first' ? [...broken, ...stated] : [...stated, ...broken];

      const result = await extractCaseEntities(inputs, silent);
      expect(result).not.toBeNull();
      expect(result!.fields.total_measured_procurement_spend?.value).toBe(5123456.78);
      expect(result!.fields.total_measured_procurement_spend?.conflicted).toBe(false);
      // The inclusions total is reported, never placed on the denominator.
      expect(result!.fields.tmps_inclusions?.value).toBe(9200000);
      expect(result!.calculator.payload['procurement.tmps']).not.toBe(9200000);

      const finance = result!.extractions.find((e) => e.documentId === 'sheet_financials' && e.sourceFile === 'Pack_Updated.xlsx › Finance');
      expect(finance?.exceptions.some((e) => /TMPS cell holds #REF!/.test(e))).toBe(true);
      // Nothing anywhere carried the error code as a figure, and the foreign
      // spend on the Imports sheet was never read as TMPS.
      const tmpsReadings = result!.extractions.flatMap((e) => e.values)
        .filter((v) => v.field === 'total_measured_procurement_spend')
        .map((v) => v.value);
      expect(tmpsReadings).not.toContain(23);
      expect(tmpsReadings).not.toContain(312345);
    });
  }
});
