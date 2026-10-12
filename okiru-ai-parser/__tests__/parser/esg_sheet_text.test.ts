/**
 * What an ESG sheet prints that no register, month grid or caption/value pair
 * reads: its title lines and its notes (kept as printed), a register's own
 * TOTAL line, a month captioned as a month, a caption printed twice, and the
 * title lines offered to the label mapping as their own values. Synthetic data.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import type { ExtractionModel } from '../../src/services/aiExtraction.js';
import {
  extractEsgSheetFacts,
  findSheetFacts,
  findSheetText,
  periodInFileName,
  PRINTED_NOTES_FIELD,
  PRINTED_TITLE_FIELD,
  printedDateIso,
  registerTotalFacts,
  titleValueFor,
  wholeMonthOf,
} from '../../src/services/esgSheetFacts.js';
import { resetDecisionCacheForTest } from '../../src/services/semanticDecisionCache.js';
import { isPlaceholderHeaderRow, splitWorkbookIntoSheets } from '../../src/services/workbookSheetSplit.js';

beforeEach(() => resetDecisionCacheForTest());

const FUEL = 'fleet__fuel_card_statement';
const BOWSER = 'ghg_energy__generator_diesel_bowser_reconciliation';

describe('a sheet\'s title lines and notes, as printed', () => {
  it('keeps the lone lines over the first table and the tab\'s own name as titles', () => {
    const { titles } = findSheetText([
      ['Example Monthly Report'],
      ['Example Depot North'],
      [],
      ['Date', 'Litres', 'Amount'],
      [46100, 10, 200],
    ], new Set(), 'Mar 26 - Apr 26');
    expect(titles).toEqual(['Mar 26 - Apr 26', 'Example Monthly Report', 'Example Depot North']);
  });

  it('never takes a generic tab name or an exported table\'s placeholder header for a title', () => {
    const { titles } = findSheetText([
      ['Column1', 'Column2', 'Column3'],
      ['', 'EXAMPLE INCIDENT REPORT', ''],
      ['Date', 'Site', 'Lost time'],
    ], new Set(), 'Sheet1');
    expect(titles).toEqual(['EXAMPLE INCIDENT REPORT']);
  });

  it('reads a date printed alone over the table as that date', () => {
    expect(findSheetText([[46112], ['Litres', 'Amount'], [5, 10]]).titles).toEqual(['2026-03-31']);
  });

  it('keeps a lone line, a legend line and a remark at the end of a row of figures as notes', () => {
    const { notes } = findSheetText([
      ['SITE', 'LANDLORD', 'JUL', 'AUG', 'SEP', ''],
      ['North', 'Owner A', 10, 11, 12, ''],
      ['South', 'Owner B', 20, 21, 22, 'no reading this quarter - estimated'],
      ['East', 'Owner C', 30, 31, 32, ''],
      ['West', 'Owner D', 40, 41, 42, ''],
      ['AUGUST'],
      [],
      ['Export may be incomplete'],
      ['X', 'Training required'],
    ]);
    expect(notes).toEqual(['no reading this quarter - estimated', 'Export may be incomplete', 'X: Training required']);
  });

  it('leaves a register\'s own text column alone: it is not a remark', () => {
    const { notes } = findSheetText([
      ['Date', 'Litres', 'Comment'],
      [46100, 10, 'filled at the north depot'],
      [46101, 11, 'filled at the south depot'],
      [46102, 12, 'filled at the west depot'],
    ]);
    expect(notes).toEqual([]);
  });

  it('a sheet\'s title lines and notes reach its read as printed lines, never as a field', async () => {
    const reads = await extractEsgSheetFacts(null, {
      filename: 'Example.xlsx › Report',
      sheetName: 'Report',
      matrix: [['Example Logistics - Internal'], [], ['Export may be incomplete'], ['Weight', 'Charge'], [12, 40]],
      specIds: [FUEL],
    });
    const values = reads?.flatMap((read) => read.values) ?? [];
    expect(values.find((v) => v.field === PRINTED_TITLE_FIELD)?.value).toEqual(['Report', 'Example Logistics - Internal', 'Export may be incomplete']);
    expect(values.some((v) => v.field === PRINTED_NOTES_FIELD)).toBe(false);
  });

  it('a hidden sheet keeps no title lines or notes', async () => {
    const reads = await extractEsgSheetFacts(null, {
      filename: 'Example.xlsx › Old', sheetName: 'Old', matrix: [['Old list as of 2023'], ['A', 'B'], [1, 2]], hidden: true,
    });
    expect((reads ?? []).flatMap((read) => read.values)).toEqual([]);
  });
});

describe('a register\'s own TOTAL line', () => {
  const SHEET: unknown[][] = [
    ['Example Depot North'],
    ['Issued for the month of:-', '', 46082],
    ['DATE', 'REG NR', 'BUSINESS UNIT', 'LITERS', 'AMOUNT'],
    [],
    ['', '', 'TOTAL TO BE INVOICED:- ', 30, 540.5],
    ['04-03-2026', 'AB12CDGP', 'NORTH', 10, 180.2],
    ['05-03-2026', 'AB12CDGP', 'NORTH', 20, 360.3],
  ];

  it('is read cell by cell under its columns\' headers', () => {
    const facts = registerTotalFacts(SHEET, { top: 2, bottom: 6, headerRow: 2 });
    expect(facts.map((f) => [f.label, f.value, f.kind])).toEqual([
      ['TOTAL TO BE INVOICED › LITERS', 30, 'total'],
      ['TOTAL TO BE INVOICED › AMOUNT', 540.5, 'total'],
    ]);
  });

  it('is mapped like any labelled cell, while the register\'s rows stay the register\'s', async () => {
    const model: ExtractionModel = {
      name: 'fake',
      async complete() {
        return JSON.stringify({ mapping: {
          'TOTAL TO BE INVOICED › LITERS': `${FUEL}/total_litres_period`,
          'TOTAL TO BE INVOICED › AMOUNT': `${FUEL}/total_fuel_rand_excl_vat`,
        } });
      },
    };
    const reads = await extractEsgSheetFacts(model, {
      filename: 'Example ext.xlsx › ext',
      sheetName: 'ext',
      matrix: SHEET,
      read: [{ top: 2, bottom: 6, left: 0, right: 4 }],
      register: { top: 2, bottom: 6, left: 0, right: 4, headerRow: 2 },
      specIds: [FUEL],
    });
    const fuel = reads?.find((r) => r.documentId === FUEL);
    expect(fuel?.values.find((v) => v.field === 'total_litres_period')?.value).toBe(30);
    expect(fuel?.values.find((v) => v.field === 'total_fuel_rand_excl_vat')?.value).toBe(540.5);
  });
});

describe('a month captioned as a month is the whole month', () => {
  it('gives a period field both ends of the month', () => {
    expect(wholeMonthOf('reporting_period_start', 'Issued for the month of', '2026-03-01')).toEqual(['2026-03-01', '2026-03-31']);
    expect(wholeMonthOf('statement_period_end', 'Month', 'February 2028')).toEqual(['2028-02-01', '2028-02-29']);
    // A caption that names no month, or a field that is no period end, is not.
    expect(wholeMonthOf('reporting_period_start', 'Date', '2026-03-01')).toBeNull();
    expect(wholeMonthOf('report_date', 'Month', '2026-03-01')).toBeNull();
  });

  it('fills the period\'s start and end from one cell', async () => {
    const reads = await extractEsgSheetFacts(null, {
      filename: 'Example.xlsx › ext',
      sheetName: 'ext',
      matrix: [['Month:', 46082], [], ['Opening stock (dip)', 100]],
      specIds: [BOWSER],
    });
    const model: ExtractionModel = { name: 'fake', async complete() { return JSON.stringify({ mapping: { Month: `${BOWSER}/reporting_period_start` } }); } };
    const mapped = await extractEsgSheetFacts(model, {
      filename: 'Example.xlsx › ext2',
      sheetName: 'ext2',
      matrix: [['Month:', 46082], [], ['Opening stock (dip)', 100]],
      specIds: [BOWSER],
    });
    expect(reads).not.toBeNull();
    const bowser = mapped?.find((r) => r.documentId === BOWSER);
    expect(bowser?.values.find((v) => v.field === 'reporting_period_start')?.value).toBe('2026-03-01');
    expect(bowser?.values.find((v) => v.field === 'reporting_period_end')?.value).toBe('2026-03-31');
  });
});

describe('a caption printed twice with different figures', () => {
  it('is named by the caption it follows, so each can be told apart', () => {
    const facts = findSheetFacts([
      ['Meter reading', 500],
      ['Difference', 0],
      [],
      ['Theoretical stock', 800],
      ['Difference', 2],
    ]);
    expect(facts.map((f) => [f.label, f.value])).toEqual([
      ['Meter reading', 500],
      ['Meter reading › Difference', 0],
      ['Theoretical stock', 800],
      ['Theoretical stock › Difference', 2],
    ]);
  });

  it('keeps its words when the captions above cannot tell them apart', () => {
    const facts = findSheetFacts([['Closing stock', 900], ['Difference', 0], ['Difference', 5]]);
    expect(facts.filter((f) => /Difference/.test(f.label)).map((f) => f.label)).toEqual(['Difference', 'Difference']);
  });
});

describe('a title line offered to the label mapping', () => {
  it('becomes a value only of a field it can be: a name, a date, a month', () => {
    expect(titleValueFor({ field: 'depot_name', type: 'text' }, 'Example Depot North')).toBe('Example Depot North');
    expect(titleValueFor({ field: 'report_date', type: 'date' }, '06-Aug-2026 09:41:12 PM')).toBe('2026-08-06');
    expect(titleValueFor({ field: 'register_as_at_date', type: 'date' }, 'SUMMARY FEBRUARY 2028')).toBe('SUMMARY FEBRUARY 2028');
    expect(titleValueFor({ field: 'register_as_at_date', type: 'date' }, 'Fleet summary')).toBeNull();
    expect(titleValueFor({ field: 'fleet_total_vehicles', type: 'count' }, 'Fleet 2026')).toBeNull();
    expect(printedDateIso('23-Sep-2026')).toBe('2026-09-23');
  });

  it('is asked as a "title line" and read when the model maps it, yielding to a labelled cell', async () => {
    let asked = '';
    const model: ExtractionModel = {
      name: 'fake',
      async complete(system: string, user: string) {
        asked = `${system}\n${user}`;
        return JSON.stringify({ mapping: { 'Example Depot North': `${FUEL}/depot_name`, 'Example Monthly Report': `${FUEL}/total_litres_period` } });
      },
    };
    const reads = await extractEsgSheetFacts(model, {
      filename: 'Example.xlsx › Report',
      sheetName: 'Report',
      matrix: [['Example Monthly Report'], ['Example Depot North'], ['Litres', 'Amount'], [5, 10]],
      specIds: [FUEL],
    });
    expect(asked).toMatch(/"kind":"title line"/);
    const fuel = reads?.find((r) => r.documentId === FUEL);
    expect(fuel?.values.find((v) => v.field === 'depot_name')?.value).toBe('Example Depot North');
    // A title is never a figure.
    expect(fuel?.values.some((v) => v.field === 'total_litres_period')).toBe(false);
  });

  it('never asks about a template tab\'s own lines', async () => {
    let asked = '';
    const model: ExtractionModel = { name: 'fake', async complete(_s: string, user: string) { asked = user; return '{"mapping":{}}'; } };
    await extractEsgSheetFacts(model, {
      filename: 'Example.xlsx › AB12CDGP', sheetName: 'AB12CDGP', template: 'Vehicle fuel log',
      matrix: [['AB12CDGP fuel log'], ['Opening km:', 1000]],
      specIds: [FUEL],
    });
    expect(asked).not.toMatch(/title line/);
  });
});

describe('an exported table\'s placeholder header', () => {
  it('is never the header row: the real one under the title is', () => {
    expect(isPlaceholderHeaderRow(['Column1', 'Column2', ''])).toBe(true);
    expect(isPlaceholderHeaderRow(['Date', 'Column2'])).toBe(false);
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Column1', 'Column2', 'Column3', 'Column4'],
      ['', 'EXAMPLE INCIDENT REPORT', '', ''],
      ['DATE', 'SITE', 'LOST TIME', 'FATALITY'],
      ['01-08-2025', 'Depot North', 'Yes', 'No'],
      ['02-09-2025', 'Depot South', 'No', 'No'],
    ]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Sheet1');
    const [split] = splitWorkbookIntoSheets(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
    expect(split.region?.headerRow).toBe(2);
    expect(split.rows[0]).toMatchObject({ DATE: '01-08-2025', SITE: 'Depot North', 'LOST TIME': 'Yes' });
    expect(split.rows).toHaveLength(2);
  });
});

describe('the period a file\'s name states', () => {
  it('is a title line of every sheet: two dates joined by "to" or a dash, as written', () => {
    expect(periodInFileName('Route Summary 01 July 2025 to JUNE 2026.xlsx › Summary')).toBe('01 July 2025 to JUNE 2026');
    expect(periodInFileName('Course Register - Jul 25- Apr 26.xlsx')).toBe('Jul 25- Apr 26');
    expect(periodInFileName('Report 01.03.2026 - 31.03.2026.xlsx')).toBe('01.03.2026 - 31.03.2026');
    const { titles } = findSheetText([['Report'], ['Date', 'Litres'], [46100, 5]], new Set(), 'Sheet1', [], 'Route Summary 01 July 2025 to JUNE 2026.xlsx › Sheet1');
    expect(titles).toEqual(['01 July 2025 to JUNE 2026', 'Report']);
  });

  it('is nothing when the name states one month or a document code', () => {
    expect(periodInFileName('Fleet List February 2026.xlsx')).toBeNull();
    expect(periodInFileName('DOC-T-512-07 Factors.pdf')).toBeNull();
    expect(periodInFileName(undefined)).toBeNull();
  });
});
