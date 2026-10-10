/**
 * A gathering template's unfilled rows are not records.
 *
 * The B-BBEE information-gathering template numbers thousands of rows below
 * each register (`=A19+1`), presets a dropdown's default ("No") on some, and
 * runs its formulas down every one (an age of 0.00). Read as continuation rows
 * they inherited the last record's name, race and level: one real pack's
 * thirteen-person employee register came out as 3,000 employees, its two-row
 * management sheet as 500 and its single owner as 100 shareholders.
 *
 * All names and numbers here are invented.
 */
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { splitWorkbookIntoSheets } from '../../src/services/workbookSheetSplit.js';
import { counterColumns, dittoFill, PLAIN_DITTO, sheetGridToMarkdown, templateResidueRows } from '../../src/services/sheetRegions.js';

function workbook(sheets: Record<string, unknown[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/** An employee register the way the template lays it out, with `tail` unfilled template rows below it. */
function employeeRegister(tail: number): unknown[][] {
  const rows: unknown[][] = [
    ['', 'Measured Entity: Example Freight', '', '', '', '', '', '', ''],
    ['', 'Name & Surname', 'ID Number', 'Job title', 'Race', 'Gender', 'Occupational Level', 'Gross Monthly Salary', 'Technician', 'Age'],
    [1, 'Dlamini, Ayanda', '9001015800081', 'Driver', 'African', 'Male', 'Semi-Skilled', 18000, 'No', 34.2],
    [2, 'Mokoena, Lerato', '8803030200082', 'Administrator', 'African', 'Female', 'Semi-Skilled', 15500, 'No', 36.9],
    [3, 'Pillay, Kavitha', '7505050100083', 'Office Manager', 'Indian', 'Female', 'Senior Management', 24000, 'No', 49.6],
  ];
  for (let i = 0; i < tail; i += 1) {
    // The template's own row: its number, a preset "No" on the first few, a formula's 0.
    rows.push([4 + i, '', '', '', '', '', '', '', i < 2 ? 'No' : '', 0]);
  }
  return rows;
}

describe('template residue rows', () => {
  it('a register keeps its records and none of the template rows below them', () => {
    const [doc] = splitWorkbookIntoSheets(workbook({ 'Employment Equity': employeeRegister(400) }));
    expect(doc.rows).toHaveLength(3);
    expect(doc.rows.map((r) => r['Name & Surname'])).toEqual(['Dlamini, Ayanda', 'Mokoena, Lerato', 'Pillay, Kavitha']);
    // The markdown the model reads is the same three records, not 403.
    expect(doc.markdown.split('\n').filter((line) => line.includes('Pillay'))).toHaveLength(1);
  });

  it('a numbered sheet with one filled row is one record (an owner is not cloned a hundred times)', () => {
    const owners: unknown[][] = [
      ['', 'Name & Surname', 'ID Number', 'Race', 'Gender', 'New Entrant', 'Voting Rights'],
      [1, 'Nkosi, Thabo', '7001015800084', 'Black', 'Male', 'Yes', '100.00%'],
      ...Array.from({ length: 99 }, (_, i) => [2 + i]),
    ];
    const [doc] = splitWorkbookIntoSheets(workbook({ Ownership: owners }));
    expect(doc.rows).toHaveLength(1);
  });

  it('real continuation rows still inherit their block: a dated payment, a learner on a course', () => {
    const ledger = [
      ['Beneficiary', 'Description of Contribution', 'Date of Contribution', 'Amount of Contribution'],
      ['Example Youth Centre', 'Donation', '31 Mar 2024', 500],
      ['', '', '30 Apr 2024', 500],
      ['', '', '31 May 2024', 500],
    ];
    const [doc] = splitWorkbookIntoSheets(workbook({ 'Social Development': ledger }));
    expect(doc.rows).toHaveLength(3);
    expect(doc.rows.every((r) => r.Beneficiary === 'Example Youth Centre')).toBe(true);
  });

  it('a counter column is a run of whole numbers stepping by one; an amount column is not', () => {
    const body = [['1', 'x', '500'], ['2', '', '500'], ['3', '', '250'], ['4', '', '0'], ['5', '', '']];
    expect(counterColumns(body, 3)).toEqual([true, false, false]);
    expect(templateResidueRows(body, 3, 1)).toEqual([false, false, false, true, true]);
  });

  it('the ESG reading is unchanged: its plain ditto keeps every row it kept before', () => {
    const body = employeeRegister(5).slice(2).map((row) => row.map((c) => String(c ?? '')));
    const filled = dittoFill(body, 10, PLAIN_DITTO);
    expect(filled).toHaveLength(8);
    // The plain ditto still fills the first template row from the last record, as recorded.
    expect(filled[3][1]).toBe('Pillay, Kavitha');
    const markdown = sheetGridToMarkdown('EE', employeeRegister(5).map((row) => row.map((c) => String(c ?? ''))), PLAIN_DITTO);
    expect(markdown.split('\n').filter((line) => line.includes('Pillay'))).not.toHaveLength(1);
  });

  it('the B-BBEE markdown of a whole sheet drops the template rows too', () => {
    const markdown = sheetGridToMarkdown('EE', employeeRegister(5).map((row) => row.map((c) => String(c ?? ''))));
    expect(markdown.split('\n').filter((line) => line.includes('Pillay'))).toHaveLength(1);
  });
});
