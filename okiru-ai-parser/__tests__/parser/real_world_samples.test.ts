import { describe, expect, it } from 'vitest';
import { ParserService } from '../../parser/parser_service.js';

function rawText(filename: string, raw_text: string) {
  return {
    file_id: filename,
    filename,
    mime_type: 'text/plain',
    raw_text,
    tables: [],
    metadata: {},
  };
}

describe('real-world parser samples', () => {
  it('parses a certificate that uses alternate labels', async () => {
    const result = await new ParserService().resolve(rawText('alternate_bbee_certificate.txt', [
      'BBBEE CERTIFICATE',
      'Measured Entity Name: Real World Supplier (Pty) Ltd',
      'Registration No: 2019/111222/07',
      'BEE Level: Level Four',
      'Black Ownership Percentage: 56.5%',
      'Valid Until: 30 June 2027',
    ].join('\n')));

    expect(result.status).toBe('passed');
    expect(result.document_type).toBe('B-BBEE Certificate');
    expect(result.extracted_fields.supplier_name?.normalized_value).toBe('Real World Supplier (Pty) Ltd');
    expect(result.extracted_fields.bee_level?.normalized_value).toBe(4);
    expect(result.extracted_fields.black_ownership?.normalized_value).toBe(56.5);
    expect(result.extracted_fields.expiry_date?.normalized_value).toBe('2027-06-30');
  });

  it('parses a sworn affidavit sample with required safe fields', async () => {
    const result = await new ParserService().resolve(rawText('sworn_affidavit_sample.txt', [
      'B-BBEE SWORN AFFIDAVIT',
      'Enterprise Name: Kasi Logistics CC',
      'Annual Total Revenue: R7.5m',
      'Black Ownership: 100%',
      'B-BBEE Status Level: Level One',
      'Deponent Name: Naledi Maseko',
      'Signed Date: 12 May 2026',
    ].join('\n')));

    expect(result.status).toBe('passed');
    expect(result.document_type).toBe('B-BBEE Sworn Affidavit');
    expect(result.calculator_payload).toMatchObject({
      'supplier.name': 'Kasi Logistics CC',
      'supplier.bee_level': 1,
      'supplier.black_ownership': 100,
      'supplier.affidavit_signed_date': '2026-05-12',
    });
  });

  it('parses a supplier spend schedule style text sample', async () => {
    const result = await new ParserService().resolve(rawText('supplier_spend_schedule.txt', [
      'Supplier Spend Schedule',
      'Supplier Name: Township Supplies Pty Ltd',
      'Invoice Number: INV-889',
      'Invoice Date: 2026-05-10',
      'Amount Excl VAT: R 875,000',
      'B-BBEE Level: Level Two',
      'Black Ownership: 51%',
    ].join('\n')));

    expect(result.status).toBe('passed');
    expect(result.document_type).toBe('Supplier Spend Schedule');
    expect(result.calculator_payload).toMatchObject({
      'supplier.name': 'Township Supplies Pty Ltd',
      'supplier.spend': 875000,
      'supplier.bee_level': 2,
      'supplier.black_ownership': 51,
    });
  });

  it('returns review_required for a certificate missing expiry date', async () => {
    const result = await new ParserService().resolve(rawText('missing_expiry_certificate.txt', [
      'B-BBEE CERTIFICATE',
      'Enterprise Name: Missing Expiry Trading Pty Ltd',
      'B-BBEE Status Level: Level Three',
      'Black Ownership: 45%',
      'Issue Date: 01 March 2026',
    ].join('\n')));

    expect(result.status).toBe('review_required');
    expect(result.document_type).toBe('B-BBEE Certificate');
    expect(result.validation.missing_fields).toContain('expiry_date');
    // Safety gate: a review_required document emits no calculator payload,
    // even for the fields that were individually extracted safely.
    expect(result.calculator_payload).toEqual({});
  });

  it('returns review_required and filters invalid supplier schedule ownership', async () => {
    const result = await new ParserService().resolve(rawText('supplier_schedule_invalid_ownership.txt', [
      'Supplier Spend Schedule',
      'Supplier Name: Bad Ownership Supplier Pty Ltd',
      'Amount Excl VAT: R 350000',
      'B-BBEE Level: Level Two',
      'Black Ownership: 140%',
    ].join('\n')));

    expect(result.status).toBe('review_required');
    expect(result.document_type).toBe('Supplier Spend Schedule');
    expect(result.validation.errors).toContain('Black ownership percentage must be between 0 and 100');
    // Safety gate: the invalid ownership makes the whole document review_required,
    // so nothing (not even the valid spend/level) enters the calculator payload.
    expect(result.calculator_payload).toEqual({});
  });

  it('fails unsupported random text with an empty calculator payload', async () => {
    const result = await new ParserService().resolve(rawText('lunch_menu.txt', [
      'Lunch Menu',
      'Chicken sandwich: R85',
      'Orange juice: R30',
      'Today only: free delivery for orders above R250',
    ].join('\n')));

    expect(result.status).toBe('failed');
    expect(result.overall_confidence).toBeLessThan(0.6);
    expect(result.extracted_fields).toEqual({});
    expect(result.calculator_payload).toEqual({});
  });
});
