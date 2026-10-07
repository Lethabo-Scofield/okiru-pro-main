/**
 * One percent convention for a supplier's ownership, from the parser to the score.
 *
 * The workbook stores supplier ownership in percent (51, not 0.51), and the
 * projection reads any value of 1 or less as a FRACTION (pctToFraction). The
 * Excel normalizer lives with that on purpose: it never rescales a percent cell
 * of 1% or less, so 0.8% stays 0.008 and still reads as 0.8%.
 *
 * The parser path broke the convention. A schedule cell showing "1%" reached
 * the grid as 1 (the % sign stripped), and the projection then read 1 as the
 * fraction 1.0: a 1%-black-owned supplier scored as 100% black-owned and
 * cleared the 51% line. "0.5%" became 50% and cleared the 30% black-woman line.
 *
 * All names and figures are invented.
 */
import { describe, expect, it } from 'vitest';
import type { WorkbookData } from '../workbookRoutes';
import { projectWorkbookToClient } from '../workbookRoutes';
import { parserExtractionsToWorkbook, type ParserExtraction } from '../../src/lib/parserToWorkbook';

function scheduleOf(rows: Array<Record<string, unknown>>): ParserExtraction {
  return {
    documentId: 'sheet_table__esd',
    sourceFile: 'Supplier Spend.xlsm › Procurement',
    element: 'ESD',
    values: [{ field: 'supplier_rows', value: rows }],
  } as ParserExtraction;
}

function project(procurementRows: unknown[]): ReturnType<typeof projectWorkbookToClient> {
  return projectWorkbookToClient({
    companyId: 'c1',
    sections: {
      'company-information': { meta: { industrySector: 'RCOGP' } },
      'financial-information': { meta: { tmps: 5_000_000 } },
      procurement: { rows: procurementRows },
    },
  } as unknown as WorkbookData);
}

describe('a supplier stated as 1% is 1%, not 100%', () => {
  const result = parserExtractionsToWorkbook([scheduleOf([
    { supplier_name: 'Low Co', claimed_spend_ex_vat: 100000, supplier_black_ownership_percentage: '1%', supplier_black_women_ownership_percentage: '0.5%' },
    { supplier_name: 'High Co', claimed_spend_ex_vat: 200000, supplier_black_ownership_percentage: '51%', supplier_black_women_ownership_percentage: '30%' },
    { supplier_name: 'Mid Co', claimed_spend_ex_vat: 300000, supplier_black_ownership_percentage: '36.59%', supplier_black_women_ownership_percentage: '1.5%' },
  ])]);
  const rows = result.rows.procurement!;
  const row = (name: string) => rows.find((r) => r.supplierName === name)!;

  it('lands in the grid in the convention the projection reads', () => {
    // ≤ 1% is stored as the fraction it is, exactly as the Excel normalizer stores it.
    expect(row('Low Co').currentBlackOwnership).toBe(0.01);
    expect(row('Low Co').currentBlackFemaleOwnership).toBe(0.005);
    // Above 1% stays in percent.
    expect(row('High Co').currentBlackOwnership).toBe(51);
    expect(row('Mid Co').currentBlackOwnership).toBe(36.59);
    expect(row('Mid Co').currentBlackFemaleOwnership).toBe(1.5);
  });

  it('scores 1% and 0.5% suppliers as neither 51% black-owned nor 30% black-woman-owned', () => {
    const suppliers = project(rows).suppliers;
    const supplier = (name: string) => suppliers.find((s: { name?: string }) => s.name === name)!;
    const low = supplier('Low Co');
    expect(low.blackOwnership).toBeCloseTo(0.01, 6);
    expect(low.isBlackOwned51).toBe(false);
    expect(low.isBlackWomanOwned30).toBe(false);
    const high = supplier('High Co');
    expect(high.isBlackOwned51).toBe(true);
    expect(high.isBlackWomanOwned30).toBe(true);
  });

  it('a "1%" string typed into the grid itself reads as 1% too', () => {
    const [low] = project([
      { _id: 's1', supplierName: 'Typed Co', currentSize: 'Generic', bbbeeLevel: '1', currentBlackOwnership: '1%', currentBlackFemaleOwnership: '0.5%', spend: 1000 },
    ]).suppliers;
    expect(low.blackOwnership).toBeCloseTo(0.01, 6);
    expect(low.isBlackOwned51).toBe(false);
    expect(low.isBlackWomanOwned30).toBe(false);
  });

  it('a supplier read as exactly 50.6% does not clear the 51% line', () => {
    const exact = parserExtractionsToWorkbook([scheduleOf([
      { supplier_name: 'Edge Co', claimed_spend_ex_vat: 1000, supplier_black_ownership_percentage: '50.6%' },
    ])]);
    const [edge] = project(exact.rows.procurement!).suppliers;
    expect(edge.isBlackOwned51).toBe(false);
  });
});
