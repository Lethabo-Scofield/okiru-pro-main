/**
 * Splitting a multi-sheet workbook into per-sheet documents.
 *
 * Phase 4's first real run classified a 17-sheet BEE workbook as one "Skills
 * Development schedule" and got almost nothing. The fix: each sheet is its own
 * document. The properties under test — a multi-sheet book yields many
 * documents, boilerplate sheets are dropped, a single-sheet book is not split,
 * and provenance names the sheet — are what make per-sheet classification work.
 */
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  shouldSplitWorkbook,
  splitWorkbookIntoSheets,
} from '../../src/services/workbookSheetSplit.js';
import { extractionInputsFromUpload } from '../../src/services/fileExtraction.js';

/** Build an .xlsm buffer from named sheets of array-of-arrays. */
function workbook(sheets: Record<string, Array<Array<string | number>>>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('structured rows — the data region, ditto-filled', () => {
  /**
   * The real Skills sheet: a training event stated once (date, course,
   * provider, cost, participants) with the other learners on it as rows that
   * carry only a name and ID — and a category KEY laid out to the right of
   * the table, separated by blank columns but sharing the header row.
   */
  const skillsSheet: Array<Array<string | number>> = [
    ['Measured Entity: Acme', '', '', '', '', '', '', '', '', ''],
    ['Date', 'Training Course', 'Provider', 'Learner Name & Surname', 'ID Number', 'Total Expenditure', 'Participants', '', 'Category F', 'Informal Training'],
    ['15 Dec 2024', 'First Aid Training', 'AA Forklift', 'Tholakele Makhanya', '8902220505084', 2850, 3, '', 'Category G', 'Internal Training'],
    ['', '', '', 'Siyanda Mkhulise', '9605056533083', '', '', '', 'Category BR', 'Bursaries'],
    ['', '', '', 'Thapelo Mmako', '9505275828084', '', '', '', 'Category MST', 'Mandatory Sectoral Training'],
    ['16 Apr 2025', 'Working at Heights', 'AA Forklift', 'Andile Khumalo', '8307275381086', 33600, 1, '', '', ''],
    // Empty template rows: the "Total Expenditure" formula shows 0 all the way
    // down. They are not learners, and must not be filled with the last one.
    ['', '', '', '', '', 0, '', '', '', ''],
    ['', '', '', '', '', 0, '', '', '', ''],
  ];

  it('keys rows by the data table only — the category key beside it is not a column', () => {
    const [doc] = splitWorkbookIntoSheets(workbook({ 'Skills Development': skillsSheet }), { minContentRows: 1 });
    const keys = new Set(doc.rows.flatMap((r) => Object.keys(r)));
    expect(keys.has('Category F')).toBe(false);
    expect(keys.has('Informal Training')).toBe(false);
    expect(keys.has('Learner Name & Surname')).toBe(true);
    // No learner "is" Category G/BR/MST because the key happened to sit on their row.
    expect(doc.rows.some((r) => Object.values(r).some((v) => /^Category (G|BR|MST)$/.test(String(v))))).toBe(false);
  });

  it('continuation learners inherit the event they are on, never its cost', () => {
    const [doc] = splitWorkbookIntoSheets(workbook({ 'Skills Development': skillsSheet }), { minContentRows: 1 });
    const siyanda = doc.rows.find((r) => r['Learner Name & Surname'] === 'Siyanda Mkhulise')!;
    expect(siyanda['Training Course']).toBe('First Aid Training');
    expect(siyanda['Provider']).toBe('AA Forklift');
    expect(siyanda['Total Expenditure']).toBeUndefined(); // counted once, on the stating row
    const andile = doc.rows.find((r) => r['Learner Name & Surname'] === 'Andile Khumalo')!;
    expect(andile['Training Course']).toBe('Working at Heights'); // a new event resets the memory
    expect(andile['Total Expenditure']).toBe(33600);
    expect(doc.rows.filter((r) => r['Learner Name & Surname'])).toHaveLength(4);
  });
});

describe('splitting into sheets', () => {
  it('produces one document per sheet with content', () => {
    const buf = workbook({
      Ownership: [['Name', 'Race'], ['V Naidoo', 'Indian']],
      Procurement: [['Supplier', 'Spend'], ['Alpha', 1000]],
      'Social Development': [['Beneficiary', 'Amount'], ['Trust', 500]],
    });

    const docs = splitWorkbookIntoSheets(buf);
    expect(docs.map((d) => d.sheetName)).toEqual(['Ownership', 'Procurement', 'Social Development']);
  });

  it('drops instruction/definition/lookup sheets', () => {
    const buf = workbook({
      Instructions: [['Fill this in']],
      Definitions: [['Black', 'African, Coloured, Indian']],
      Lookups: [['Level', '1', '2']],
      Ownership: [['Name'], ['V Naidoo']],
    });

    const docs = splitWorkbookIntoSheets(buf);
    expect(docs.map((d) => d.sheetName)).toEqual(['Ownership']);
  });

  it('drops a sheet whose rows are all empty or zero', () => {
    // The real Thandanani Procurement sheet in the gathering file: 1,991 rows of
    // "0 | 0". Not evidence.
    const empty = Array.from({ length: 50 }, () => ['', 0]);
    const buf = workbook({
      Procurement: [['Supplier', 'Spend'], ...empty],
      Ownership: [['Name'], ['V Naidoo']],
    });

    const docs = splitWorkbookIntoSheets(buf);
    expect(docs.map((d) => d.sheetName)).toEqual(['Ownership']);
  });

  it('renders each sheet as its own markdown table', () => {
    const buf = workbook({ Ownership: [['Name', 'Shares'], ['V Naidoo', 100]] });
    const [doc] = splitWorkbookIntoSheets(buf);
    expect(doc.markdown).toContain('## Ownership');
    expect(doc.markdown).toContain('| Name | Shares |');
    expect(doc.markdown).toContain('| V Naidoo | 100 |');
  });

  it('finds the real header beneath a banner and legend (the client layout)', () => {
    // The exact shape that broke extraction: banner, year, legend, THEN header,
    // THEN data. Taking row 0 as the header makes the banner the column names
    // and the sheet unreadable.
    const buf = workbook({
      Ownership: [
        ['Measured Entity: Thandanani', 'Ownership Equity', 'Date & Initial:___'],
        ['Year End: 28 Feb 2025'],
        ['Use dropdown', 'Use dropdown', 'Use dropdown', 'Use dropdown'],
        ['Name & Surname', 'ID Number', 'Race', 'Gender', 'Foreign'],
        ['Venugopal Lutchman', '5608305112083', 'Black', 'Male', 'No'],
        ['Nomsa Dlamini', '8801015800085', 'Black', 'Female', 'No'],
      ],
    });

    const [doc] = splitWorkbookIntoSheets(buf);
    // The header row is used, so the columns are meaningful and the banner is
    // not a data row.
    expect(doc.markdown).toContain('| Name & Surname | ID Number | Race | Gender | Foreign |');
    expect(doc.markdown).toContain('Venugopal Lutchman');
    expect(doc.markdown).not.toContain('Measured Entity');
    expect(doc.rows).toHaveLength(2);
  });

  it('returns nothing for a buffer that is not a workbook', () => {
    expect(splitWorkbookIntoSheets(Buffer.from('not a spreadsheet'))).toEqual([]);
  });
});

describe('deciding whether to split', () => {
  it('splits when there are two or more content sheets', () => {
    expect(shouldSplitWorkbook([{ sheetName: 'a' }, { sheetName: 'b' }] as never)).toBe(true);
  });

  it('does not split a single-sheet workbook', () => {
    expect(shouldSplitWorkbook([{ sheetName: 'only' }] as never)).toBe(false);
    expect(shouldSplitWorkbook([])).toBe(false);
  });
});

describe('extractionInputsFromUpload', () => {
  it('turns a multi-sheet workbook into one input per sheet, named File › Sheet', async () => {
    const buf = workbook({
      Ownership: [['Name'], ['V Naidoo']],
      Procurement: [['Supplier', 'Spend'], ['Alpha', 1000]],
    });

    const inputs = await extractionInputsFromUpload({
      buffer: buf,
      originalname: 'BEE Gathering File.xlsm',
      mimetype: 'application/vnd.ms-excel.sheet.macroEnabled.12',
      size: buf.length,
    });

    expect(inputs).toHaveLength(2);
    expect(inputs.map((i) => i.filename)).toEqual([
      'BEE Gathering File.xlsm › Ownership',
      'BEE Gathering File.xlsm › Procurement',
    ]);
    // Each carries only its own sheet's markdown — the whole point.
    expect(inputs[0].markdown).toContain('## Ownership');
    expect(inputs[0].markdown).not.toContain('Procurement');
    expect(inputs[1].metadata.sheet_name).toBe('Procurement');
    expect(inputs[1].metadata.parent_file).toBe('BEE Gathering File.xlsm');
  });

  it('leaves a single-sheet workbook as one whole-file input', async () => {
    const buf = workbook({ Suppliers: [['Supplier', 'Spend'], ['Alpha', 1000]] });
    const inputs = await extractionInputsFromUpload({
      buffer: buf,
      originalname: 'suppliers.xlsx',
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: buf.length,
    });

    expect(inputs).toHaveLength(1);
    expect(inputs[0].filename).toBe('suppliers.xlsx');
  });
});
