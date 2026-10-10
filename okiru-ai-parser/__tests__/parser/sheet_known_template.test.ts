/**
 * A gathering template's registers, read by the code.
 *
 * - Its headings mean the same thing on every copy, so a register under the
 *   template's own headings is read without asking a model what its columns
 *   mean (that ask was sampled afresh on every upload).
 * - The rows carry what the register states: an owner's "New Entrant" flag, an
 *   employee's gross monthly salary.
 * - The totals a sheet states above its table come with the table, checked
 *   against the rows; an employee register's monthly payroll is summed.
 * - A learner on the entity's own payroll is an employed learner.
 * - A supplier ledger's entries and stated period travel with its total.
 *
 * All names and numbers here are invented.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { splitWorkbookIntoSheets, statedTotalsAbove } from '../../src/services/workbookSheetSplit.js';
import { extractSheetTable, tableFacts } from '../../src/services/sheetTableExtraction.js';
import { knownTemplateMapping, vocabularyMapping } from '../../src/services/sheetColumnMapping.js';
import { markRegisteredLearnersEmployed, structuredStatedTotals } from '../../src/services/caseExtraction.js';
import { extractLedgerTable, ledgerTitlePeriod } from '../../src/services/sheetLedgerExtraction.js';
import { isReportedNotScored } from '../../src/services/entityCalculatorMapping.js';
import { resetDecisionCacheForTest } from '../../src/services/semanticDecisionCache.js';
import { extractionInputsFromUpload } from '../../src/services/fileExtraction.js';
import type { DocumentExtraction, ExtractionModel } from '../../src/services/aiExtraction.js';

beforeEach(() => {
  resetDecisionCacheForTest();
});

function workbook(sheets: Record<string, unknown[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/** A model that must not be asked: every call fails the test. */
function noModel(asked: string[]): ExtractionModel {
  const refuse = async (_system: string, user: string) => {
    asked.push(user);
    throw new Error('the model was asked');
  };
  return { name: 'none', complete: refuse, completeHard: refuse };
}

const employeeSheet: unknown[][] = [
  ['', 'Name & Surname', 'ID Number', 'Job title', 'Race', 'Gender', 'Foreign', 'Occupational Level', 'Gross Monthly Salary'],
  [1, 'Dlamini, Ayanda', '9001015800081', 'Driver', 'African', 'Male', '', 'Semi-Skilled', 18000.5],
  [2, 'Mokoena, Lerato', '8803030200082', 'Administrator', 'African', 'Female', '', 'Semi-Skilled', 15500],
  [3, 'Okafor, Chidi', '', 'Operations Manager', 'African', 'Male', 'Yes', 'Middle Management', 26000],
];

const ownerSheet: unknown[][] = [
  ['', 'Name & Surname', 'ID Number', 'Race', 'Gender', 'New Entrant', 'Voting Rights'],
  [1, 'Nkosi, Thabo', '7001015800084', 'Black', 'Male', 'Yes', '100.00%'],
];

const procurementSheet: unknown[][] = [
  ['Measured Entity: Example Freight'],
  ['Total Procurement Expenditure', '', '', 1250.75],
  ['Supplier Name', 'Expenditure (excluding VAT)', 'BEE Level', 'Black Ownership (%)'],
  ['Alpha Tyres', 1000.5, 'Level 2', '51%'],
  ['Beta Diesel', 250.25, 'Level 4', ''],
];

async function readSheet(name: string, sheet: unknown[][], element: Parameters<typeof extractSheetTable>[1], asked: string[]) {
  const [input] = await extractionInputsFromUpload({
    buffer: workbook({ [name]: sheet, Notes: [['a', 'b'], ['c', 'd']] }),
    originalname: 'Example Gathering.xlsx',
    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: 1,
  });
  const table = (input.tables?.[0] ?? {}) as { rows?: Array<Record<string, unknown>> };
  return extractSheetTable(noModel(asked), element, {
    filename: input.filename,
    raw_text: input.raw_text,
    markdown: input.markdown,
    rows: table.rows,
    statedTotals: structuredStatedTotals(input.tables),
  });
}

describe('the template\'s own headings', () => {
  it('map to the table\'s fields without a model, the way a reader of the template would', () => {
    const headers = ['col_0', 'Name & Surname', 'ID Number', 'Position (Occupational Level)', 'Job Title', 'Race', 'Gender'];
    expect(vocabularyMapping(headers, ['employee_name', 'race', 'gender', 'designation', 'occupational_level', 'id_number'])).toEqual({
      'Name & Surname': 'employee_name',
      Race: 'race',
      Gender: 'gender',
      'Job Title': 'designation',
      'Position (Occupational Level)': 'occupational_level',
      'ID Number': 'id_number',
    });
    // A heading that only mentions a word is not that field.
    expect(vocabularyMapping(['Date of Training Program (Invoice Date)', 'Training Course'], ['program_name', 'start_date']))
      .toEqual({ 'Training Course': 'program_name', 'Date of Training Program (Invoice Date)': 'start_date' });
    expect(vocabularyMapping(['Expenditure (per Supplier Ledger) for the period (Including VAT)'], ['claimed_spend_ex_vat'])).toEqual({});
  });

  it('settle a table only with its key column and two more fields', () => {
    const shape = { columns: ['supplier_name', 'claimed_spend_ex_vat', 'bee_level'], what: 'a supplier' };
    expect(knownTemplateMapping([{ 'Supplier Name': 'A', 'BEE Level': 'Level 1', 'Expenditure (excluding VAT)': 1 }], shape)).not.toBeNull();
    expect(knownTemplateMapping([{ Creditor: 'A', 'BEE Level': 'Level 1', 'Expenditure (excluding VAT)': 1 }], shape)).toBeNull();
    expect(knownTemplateMapping([{ 'Supplier Name': 'A', Notes: 'x' }], shape)).toBeNull();
  });

  it('an employee register is read with no model asked, salaries and the foreign flag kept, and its monthly payroll summed', async () => {
    const asked: string[] = [];
    const result = await readSheet('Employment Equity', employeeSheet, 'MANAGEMENT_CONTROL', asked);
    expect(asked).toEqual([]);
    const rows = result!.values.find((v) => v.field === 'employee_rows')!.value as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(3);
    expect(rows[2]).toMatchObject({ employee_name: 'Okafor, Chidi', foreign: 'Yes', occupational_level: 'Middle Management', gross_monthly_salary: 26000 });
    const payroll = result!.values.find((v) => v.field === 'derived_gross_monthly_salary_total')!;
    expect(payroll.value).toBe(59500.5);
    expect(payroll.source?.method).toBe('derived');
  });

  it('an owner\'s New Entrant flag reaches the shareholder row', async () => {
    const result = await readSheet('Ownership', ownerSheet, 'OWNERSHIP', []);
    const [owner] = result!.values[0].value as Array<Record<string, unknown>>;
    expect(owner).toMatchObject({ shareholder_name: 'Nkosi, Thabo', new_entrant: 'Yes', voting_rights: '100.00%' });
  });
});

describe('the totals a sheet states above its table', () => {
  it('are read with their caption and cell, and only where one figure stands beside the caption', () => {
    const matrix = [
      ['Summary', '', ''],
      ['Total Procurement Expenditure', '', 1250.75],
      ['SUB TOTALS', 11, 1],
      ['Supplier Name', 'Expenditure (excluding VAT)', 'BEE Level'],
    ];
    expect(statedTotalsAbove(matrix, { headerIdx: 3, region: { start: 0, end: 2 } }, { r: 4, c: 1 }))
      .toEqual([{ label: 'Total Procurement Expenditure', value: 1250.75, cell: 'D6' }]);
  });

  it('come with the table, checked against its rows', async () => {
    const result = await readSheet('Procurement', procurementSheet, 'ESD', []);
    expect(result!.values.find((v) => v.field === 'stated_schedule_total')?.value).toBe(1250.75);
    expect(result!.exceptions.join(' ')).not.toMatch(/do not reconcile/);
  });

  it('a stated total the rows do not add up to is reported, never settled', () => {
    const facts = tableFacts('supplier_rows', [{ claimed_spend_ex_vat: 100 }, { claimed_spend_ex_vat: 50 }], [
      { label: 'Total Procurement Expenditure', value: 900, cell: 'K6' },
    ]);
    expect(facts.values).toEqual([{ field: 'stated_schedule_total', value: 900 }]);
    expect(facts.exceptions.join(' ')).toMatch(/K6.*add up to R150\.00.*do not reconcile/);
  });

  it('are reported, never scored', () => {
    expect(isReportedNotScored('stated_schedule_total')).toBe(true);
    expect(isReportedNotScored('derived_gross_monthly_salary_total')).toBe(true);
    expect(isReportedNotScored('ledger_entry_rows')).toBe(true);
    expect(isReportedNotScored('ledger_period')).toBe(true);
  });
});

function extraction(documentId: string, field: string, rows: Array<Record<string, unknown>>, sourceFile: string): DocumentExtraction {
  return { documentId, documentName: documentId, sourceFile, values: [{ field, value: rows, sourceFile, sourceDocumentId: documentId }], missingFields: [], unexpectedFields: [], exceptions: [] };
}

describe('a learner on the entity\'s payroll', () => {
  it('is an employed learner; a learner the payroll does not list is left as the register states', () => {
    const register = extraction('sheet_table__management_control', 'employee_rows', [
      { employee_name: 'Dlamini, Ayanda', id_number: '9001015800081', gross_monthly_salary: 18000 },
      { employee_name: 'Okafor, Chidi', id_number: 'A1234567', gross_monthly_salary: 26000 },
    ], 'Example Gathering.xlsx › Employment Equity');
    const training = extraction('sheet_table__skills_development', 'learner_rows', [
      { learner_name: 'Ayanda Dlamini', id_number: 9001015800081 },
      { learner_name: 'Chidi Okafor', id_number: "  'A1234567" },
      { learner_name: 'Visiting Trainee', id_number: '9505055800085' },
      { learner_name: 'Stated Learner', id_number: '9001015800081', employed: 'No' },
    ], 'Example Gathering.xlsx › Skills Development');
    markRegisteredLearnersEmployed([register, training]);
    const rows = training.values[0].value as Array<Record<string, unknown>>;
    expect(rows.map((r) => r.employed)).toEqual(['Yes', 'Yes', undefined, 'No']);
    expect(training.exceptions.join(' ')).toMatch(/2 learner row\(s\) marked employed/);
  });

  it('a register with no salaries (a board list) does not make anyone employed', () => {
    const board = extraction('sheet_table__management_control', 'employee_rows', [{ employee_name: 'Nkosi, Thabo', id_number: '7001015800084' }], 'Book.xlsx › Management Control');
    const training = extraction('sheet_table__skills_development', 'learner_rows', [{ learner_name: 'Thabo Nkosi', id_number: '7001015800084' }], 'Book.xlsx › Skills Development');
    markRegisteredLearnersEmployed([board, training]);
    expect((training.values[0].value as Array<Record<string, unknown>>)[0].employed).toBeUndefined();
  });
});

describe('a supplier ledger', () => {
  const rows = [
    { DATE: '25/03/2024', DESCRIPTION: 'DEBIT ORDER', CREDIT: 1200.5 },
    { DATE: '25/04/2024', DESCRIPTION: 'DEBIT ORDER', CREDIT: 1200.5 },
    { DESCRIPTION: 'DEBIT ORDER', CREDIT: 2401 },
  ];
  const matrix = [['', 'RECON : EXAMPLE INSURE FOR PERIOD 01 MARCH \'24 TO FEB \'25'], ['DATE', 'DESCRIPTION', 'CREDIT']];

  it('carries its entries and the period its title states beside its total', () => {
    const result = extractLedgerTable(rows, 'EXAMPLE INSURE LEDGER.xlsx', matrix)!;
    expect(result.values.find((v) => v.field === 'supplier_rows')?.value).toEqual([{ supplier_name: 'EXAMPLE INSURE', claimed_spend_ex_vat: 2401 }]);
    expect(result.values.find((v) => v.field === 'ledger_entry_rows')?.value).toEqual([
      { entry_date: '25/03/2024', entry_description: 'DEBIT ORDER', entry_amount: 1200.5 },
      { entry_date: '25/04/2024', entry_description: 'DEBIT ORDER', entry_amount: 1200.5 },
    ]);
    expect(result.values.find((v) => v.field === 'ledger_period')?.value).toBe('01 MARCH 2024 TO FEB 2025');
  });

  it('a title that names no period gives none', () => {
    expect(ledgerTitlePeriod([['Supplier statement'], ['DATE', 'DEBIT']])).toBeNull();
  });
});
