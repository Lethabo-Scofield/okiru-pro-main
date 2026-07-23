import { describe, expect, it } from 'vitest';
import { extractSupplierRows, extractMeasuredProcurementSpend } from '../../parser/extract_supplier_rows.js';

describe('procurement supplier fields — blackWomenOwnership + enterpriseType', () => {
  it('extracts black women ownership and enterprise type from a text schedule', () => {
    const rows = extractSupplierRows({ raw_text: [
      'Supplier Name: Alpha Trading Pty Ltd',
      'Amount Excl VAT: R 1250000',
      'B-BBEE Level: Level Two',
      'Black Ownership: 51%',
      'Black Women Ownership: 35%',
      'Enterprise Type: QSE',
    ].join('\n') });
    expect(rows).toHaveLength(1);
    expect(rows[0].black_women_ownership).toBe(35);
    expect(rows[0].enterprise_type).toBe('qse');
    expect(rows[0].calculator_fields).toMatchObject({
      'supplier.black_women_ownership': 35,
      'supplier.enterprise_type': 'qse',
    });
    expect(rows[0].status).toBe('passed');
  });

  it('extracts the fields from structured table columns', () => {
    const rows = extractSupplierRows({ tables: [{ sheetName: 'CSV', rows: [
      { 'Supplier Name': 'Table Co A', 'Amount Excl VAT': 'R 200000', 'B-BBEE Level': '2', 'Black Ownership': '55%', 'Black Women Ownership': '31%', 'Enterprise Type': 'EME' },
    ] }] });
    expect(rows[0]).toMatchObject({ black_women_ownership: 31, enterprise_type: 'eme' });
  });

  it('defaults a missing enterprise type to generic without forcing review (conservative)', () => {
    const rows = extractSupplierRows({ raw_text: [
      'Supplier Name: No Type Co',
      'Amount Excl VAT: R 90000',
      'B-BBEE Level: Level One',
      'Black Ownership: 100%',
    ].join('\n') });
    expect(rows[0].enterprise_type).toBe('generic');
    expect(rows[0].status).toBe('passed');
  });

  it('sends a stated-but-unrecognised enterprise type to review', () => {
    const rows = extractSupplierRows({ raw_text: [
      'Supplier Name: Weird Type Co',
      'Amount Excl VAT: R 90000',
      'Enterprise Type: Mega Corp',
    ].join('\n') });
    expect(rows[0].status).toBe('review_required');
    expect(rows[0].issues).toContain('enterprise type not recognised');
    expect(rows[0].enterprise_type).toBeNull();
    expect(rows[0].calculator_fields).not.toHaveProperty('supplier.enterprise_type');
  });

  it('sends an out-of-range black women ownership to review', () => {
    const rows = extractSupplierRows({ raw_text: [
      'Supplier Name: Bad BWO Co',
      'Amount Excl VAT: R 90000',
      'Black Women Ownership: 140%',
    ].join('\n') });
    expect(rows[0].status).toBe('review_required');
    expect(rows[0].issues).toContain('black women ownership out of range');
    expect(rows[0].calculator_fields).not.toHaveProperty('supplier.black_women_ownership');
  });
});

describe('TMPS (measured procurement spend) extraction', () => {
  it('extracts an explicit Total Measured Procurement Spend total', () => {
    expect(extractMeasuredProcurementSpend({ raw_text: 'Total Measured Procurement Spend: R 10,000,000' })).toBe(10000000);
    expect(extractMeasuredProcurementSpend({ raw_text: 'TMPS: R5m' })).toBe(5000000);
  });

  it('returns null when TMPS is not explicitly stated (never summed/guessed)', () => {
    expect(extractMeasuredProcurementSpend({ raw_text: [
      'Supplier Name: Alpha', 'Amount Excl VAT: R 1250000',
      'Supplier Name: Beta', 'Amount Excl VAT: R 480000',
    ].join('\n') })).toBeNull();
  });

  it('reads the labelled total from a markdown-table row with space thousands-separators', () => {
    // Thandanani's Preferential Procurement sheet converts to a table row like
    // this; the labelled total is R1,030,806.68 and must be read verbatim, not
    // summed from the supplier lines (which produced the wrong 8.1m).
    expect(extractMeasuredProcurementSpend({
      raw_text: '| Total Measured Procurement Spend (pre-exclusions) | | R 1 030 806.68 |',
    })).toBeCloseTo(1030806.68, 2);
  });

  it('reads a bare thousands-separated total when no R prefix is present', () => {
    expect(extractMeasuredProcurementSpend({ raw_text: 'TMPS | 1,030,806.68' })).toBeCloseTo(1030806.68, 2);
  });

  it('does not mistake a bare count on the label line for the total', () => {
    // "2 suppliers" is not money-shaped; the R figure is the total.
    expect(extractMeasuredProcurementSpend({
      raw_text: 'Total Measured Procurement Spend across 2 suppliers: R 1 030 806.68',
    })).toBeCloseTo(1030806.68, 2);
  });
});
