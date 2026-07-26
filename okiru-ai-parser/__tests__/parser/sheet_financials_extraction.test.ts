/**
 * Entity-level financials (revenue + NPAT) off a Finance sheet — the two labelled
 * figures the NPAT-based SED/ED targets need but the AFS matrix spec does not read.
 */
import { describe, expect, it } from 'vitest';
import { extractSheetFinancials, isFinancialsSheet } from '../../src/services/sheetFinancialsExtraction.js';
import type { ExtractionModel } from '../../src/services/aiExtraction.js';

function model(reply: unknown): ExtractionModel {
  return { name: 'fake', complete: async () => JSON.stringify(reply) };
}
const input = { filename: 'wb.xlsm › Finance', raw_text: 'finance', markdown: 'finance' };

describe('isFinancialsSheet', () => {
  it('matches Finance / financials / income statement / AFS names', () => {
    expect(isFinancialsSheet('wb.xlsm › Finance')).toBe(true);
    expect(isFinancialsSheet('Financials')).toBe(true);
    expect(isFinancialsSheet('Income Statement')).toBe(true);
    expect(isFinancialsSheet('AFS - LTI')).toBe(true);
  });
  it('does not match unrelated sheets', () => {
    expect(isFinancialsSheet('Procurement')).toBe(false);
    expect(isFinancialsSheet('Ownership')).toBe(false);
    expect(isFinancialsSheet(undefined)).toBe(false);
  });
});

describe('extractSheetFinancials', () => {
  it('returns revenue + npat as parser fields the bridge maps', async () => {
    const r = await extractSheetFinancials(model({ current_year_revenue: '10 826 271', current_year_npat: '(4 157 140)' }), input);
    expect(r).not.toBeNull();
    const byField = Object.fromEntries((r!.values).map((v) => [v.field, v.value]));
    expect(byField.current_year_revenue).toBe('10 826 271');
    expect(byField.current_year_npat).toBe('(4 157 140)');
  });

  it('omits a figure the sheet does not label', async () => {
    const r = await extractSheetFinancials(model({ current_year_revenue: '10826271' }), input);
    expect(r!.values).toHaveLength(1);
    expect(r!.values[0].field).toBe('current_year_revenue');
  });

  it('returns null when neither figure is present', async () => {
    expect(await extractSheetFinancials(model({}), input)).toBeNull();
  });

  it('returns null on a model failure or unparseable output', async () => {
    const failing: ExtractionModel = { name: 'x', complete: async () => { throw new Error('500'); } };
    expect(await extractSheetFinancials(failing, input)).toBeNull();
    expect(await extractSheetFinancials(model('not json'), input)).toBeNull();
  });
});

describe('labelled TMPS from parsed rows', () => {
  // The real Finance sheet's shape: a section HEADING row that carries the
  // label with no figure, then the VALUE row whose figure sits under a
  // misaligned banner column ("Year -1") — cells are scanned, columns are not
  // trusted.
  const rows = [
    { 'FINANCIAL INFORMATION': 'TOTAL MEASURED PROCUREMENT SPEND' },
    { 'FINANCIAL INFORMATION': 'Inclusions', 'Year -3': 'Exclusions' },
    { 'Year -3': 'Total Wages and Salaries', col_7: 2753331 },
    { 'FINANCIAL INFORMATION': 'Total Measured Procurement Spend  ', 'Year -1': 4674994.56 },
  ];

  it('reads the STATED total, skipping the heading row, wherever the figure sits', async () => {
    const r = await extractSheetFinancials(model({ current_year_revenue: '10 826 271' }), { ...input, rows });
    const byField = Object.fromEntries(r!.values.map((v) => [v.field, v.value]));
    expect(byField.total_measured_procurement_spend).toBe(4674994.56);
    expect(byField.current_year_revenue).toBe('10 826 271');
  });

  it('keeps the deterministic reading even when the model call fails', async () => {
    const failing: ExtractionModel = { name: 'x', complete: async () => { throw new Error('500'); } };
    const r = await extractSheetFinancials(failing, { ...input, rows });
    expect(r).not.toBeNull();
    expect(r!.values).toHaveLength(1);
    expect(r!.values[0].field).toBe('total_measured_procurement_spend');
  });

  it('emits no TMPS when the label never appears with a figure', async () => {
    const headingOnly = [{ 'FINANCIAL INFORMATION': 'TOTAL MEASURED PROCUREMENT SPEND' }];
    const r = await extractSheetFinancials(model({ current_year_npat: '(27 124)' }), { ...input, rows: headingOnly });
    expect(r!.values.map((v) => v.field)).toEqual(['current_year_npat']);
  });
});
