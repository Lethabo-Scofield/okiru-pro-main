import { describe, expect, it } from 'vitest';
import { extractSupplierRows } from '../../parser/extract_supplier_rows.js';
import { ParserService } from '../../parser/parser_service.js';
import { CaseParserService } from '../../parser/case_parser_service.js';
import type { RawExtractionInput } from '../../schemas/parser_output.js';

function raw(fileId: string, text: string, tables: unknown[] = []): RawExtractionInput {
  return { file_id: fileId, filename: `${fileId}.txt`, mime_type: 'text/plain', raw_text: text, tables, metadata: {} };
}

const scheduleText = [
  'Supplier Spend Schedule',
  'Supplier Name: Alpha Trading Pty Ltd',
  'Amount Excl VAT: R 1250000',
  'B-BBEE Level: Level Two',
  'Black Ownership: 51%',
  'Supplier Name: Beta Logistics CC',
  'Amount Excl VAT: R 480000',
  'B-BBEE Level: Level Four',
  'Black Ownership: 30%',
  'Supplier Name: Gamma Services Pty Ltd',
  'Amount Excl VAT: R 90000',
  'B-BBEE Level: Level One',
  'Black Ownership: 100%',
].join('\n');

describe('supplier row extraction (multi-supplier)', () => {
  it('extracts one calculator-ready row per supplier from schedule text', () => {
    const rows = extractSupplierRows({ raw_text: scheduleText });
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.supplier_name)).toEqual([
      'Alpha Trading Pty Ltd',
      'Beta Logistics CC',
      'Gamma Services Pty Ltd',
    ]);
    expect(rows[0].calculator_fields).toMatchObject({
      'supplier.name': 'Alpha Trading Pty Ltd',
      'supplier.spend': 1250000,
      'supplier.bee_level': 2,
      'supplier.black_ownership': 51,
    });
    expect(rows.every((r) => r.status === 'passed')).toBe(true);
  });

  it('flags only the bad row for review and keeps the valid ones', () => {
    const rows = extractSupplierRows({
      raw_text: [
        'Supplier Name: Good Co',
        'Amount Excl VAT: R 100000',
        'B-BBEE Level: Level Two',
        'Black Ownership: 51%',
        'Supplier Name: Bad Co',
        'Amount Excl VAT: R 50000',
        'B-BBEE Level: Level Two',
        'Black Ownership: 140%',
      ].join('\n'),
    });
    expect(rows).toHaveLength(2);
    const good = rows.find((r) => r.supplier_name === 'Good Co')!;
    const bad = rows.find((r) => r.supplier_name === 'Bad Co')!;
    expect(good.status).toBe('passed');
    expect(bad.status).toBe('review_required');
    expect(bad.issues).toContain('black ownership out of range');
    // The out-of-range ownership is withheld; the valid spend/name still map.
    expect(bad.calculator_fields).not.toHaveProperty('supplier.black_ownership');
    expect(bad.calculator_fields).toMatchObject({ 'supplier.name': 'Bad Co', 'supplier.spend': 50000 });
  });

  it('extracts rows from structured tables when present', () => {
    const rows = extractSupplierRows({
      tables: [{
        sheetName: 'CSV',
        rows: [
          { 'Supplier Name': 'Table Co A', 'Amount Excl VAT': 'R 200000', 'B-BBEE Level': '2', 'Black Ownership': '55%' },
          { 'Supplier Name': 'Table Co B', 'Amount Excl VAT': 'R 300000', 'B-BBEE Level': '3', 'Black Ownership': '40%' },
        ],
      }],
    });
    expect(rows).toHaveLength(2);
    expect(rows[1].calculator_fields).toMatchObject({ 'supplier.name': 'Table Co B', 'supplier.spend': 300000, 'supplier.bee_level': 3 });
  });

  it('populates supplier_rows on the parser output for a schedule document', async () => {
    const result = await new ParserService().resolve(raw('sched', scheduleText));
    expect(result.document_type).toBe('Supplier Spend Schedule');
    expect(result.supplier_rows).toHaveLength(3);
  });

  it('does not populate supplier_rows for a certificate', async () => {
    const result = await new ParserService().resolve(raw('cert', [
      'B-BBEE CERTIFICATE',
      'Enterprise Name: Solo Supplier Pty Ltd',
      'B-BBEE Status Level: Level Two',
      'Black Ownership: 51%',
      'Expiry Date: 01 Feb 2035',
    ].join('\n')));
    expect(result.supplier_rows).toEqual([]);
  });

  it('aggregates supplier rows across documents in a case with source files', async () => {
    const result = await new CaseParserService().resolveCase([
      raw('cert', [
        'B-BBEE CERTIFICATE',
        'Enterprise Name: Alpha Trading Pty Ltd',
        'B-BBEE Status Level: Level Two',
        'Black Ownership: 51%',
        'Expiry Date: 01 Feb 2035',
      ].join('\n')),
      raw('schedule', scheduleText),
    ], 'case_supplier_list');
    expect(result.supplier_rows.length).toBe(3);
    expect(result.supplier_rows.every((r) => r.source_file === 'schedule.txt')).toBe(true);
  });
});
