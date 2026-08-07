import { describe, expect, it } from 'vitest';
import { CaseParserService } from '../../parser/case_parser_service.js';
import type { RawExtractionInput } from '../../schemas/parser_output.js';

function rawDoc(filename: string, raw_text: string): RawExtractionInput {
  return {
    file_id: filename,
    filename,
    mime_type: 'text/plain',
    raw_text,
    tables: [],
    metadata: {},
  };
}

const validCertificate = rawDoc('certificate.txt', [
  'B-BBEE CERTIFICATE',
  'Enterprise Name: Case Supplier Pty Ltd',
  'B-BBEE Status Level: Level Two',
  'Black Ownership: 51%',
  'Expiry Date: 01 Feb 2027',
].join('\n'));

const validSchedule = rawDoc('supplier_schedule.txt', [
  'Supplier Spend Schedule',
  'Supplier Name: Case Supplier Pty Ltd',
  'Amount Excl VAT: R 1250000',
  'B-BBEE Level: Level Two',
  'Black Ownership: 51%',
].join('\n'));

describe('CaseParserService', () => {
  it('returns a passed verification case when required document groups are present and safe', async () => {
    const result = await new CaseParserService().resolveCase([
      validCertificate,
      validSchedule,
    ], 'case_complete');

    expect(result.case_id).toBe('case_complete');
    expect(result.status).toBe('passed');
    expect(result.documents_detected.map((doc) => doc.document_type)).toEqual([
      'B-BBEE Certificate',
      'Supplier Spend Schedule',
    ]);
    expect(result.missing_required_documents).toEqual([]);
    expect(result.documents_needing_review).toEqual([]);
    expect(result.documents_detected[0].parser_output).toMatchObject({
      filename: 'certificate.txt',
      status: 'passed',
      audit_trail: expect.objectContaining({
        graph_version: expect.any(String),
        requires_human_review: false,
      }),
    });
    expect(result.calculator_payload).toMatchObject({
      'supplier.name': 'Case Supplier Pty Ltd',
      'supplier.bee_level': 2,
      'supplier.black_ownership': 51,
      'supplier.certificate_expiry': '2027-02-01',
      'supplier.spend': 1250000,
    });
    expect(result.audit_trail).toMatchObject({
      document_count: 2,
      passed_documents: 2,
      review_required_documents: 0,
      failed_documents: 0,
    });
  });

  it('returns review_required when a required document group is missing', async () => {
    const result = await new CaseParserService().resolveCase([
      validCertificate,
    ], 'case_missing_schedule');

    expect(result.status).toBe('review_required');
    expect(result.missing_required_documents).toEqual(['Supplier Spend Schedule']);
    expect(result.documents_detected).toHaveLength(1);
    expect(result.documents_needing_review).toEqual([]);
    expect(result.audit_trail.notes[0]).toContain('Supplier Spend Schedule');
  });

  it('lists documents needing review and excludes unsafe fields from case calculator_payload', async () => {
    const invalidCertificate = rawDoc('invalid_certificate.txt', [
      'B-BBEE CERTIFICATE',
      'Enterprise Name: Bad Ownership Supplier Pty Ltd',
      'B-BBEE Status Level: Level Two',
      'Black Ownership: 140%',
      'Expiry Date: 01 Feb 2027',
    ].join('\n'));

    const result = await new CaseParserService().resolveCase([
      invalidCertificate,
      validSchedule,
    ], 'case_review');

    expect(result.status).toBe('review_required');
    expect(result.documents_needing_review).toEqual([
      expect.objectContaining({
        filename: 'invalid_certificate.txt',
        document_type: 'B-BBEE Certificate',
        status: 'review_required',
        reasons: expect.arrayContaining(['Black ownership percentage must be between 0 and 100']),
      }),
    ]);
    expect(result.calculator_payload).not.toEqual(expect.objectContaining({
      'supplier.black_ownership': 140,
    }));
  });

  it('fails a case when every uploaded document fails classification', async () => {
    const result = await new CaseParserService().resolveCase([
      rawDoc('lunch_menu.txt', 'Lunch Menu\nChicken sandwich: R85\nOrange juice: R30'),
    ], 'case_failed');

    expect(result.status).toBe('failed');
    expect(result.documents_detected[0].status).toBe('failed');
    expect(result.calculator_payload).toEqual({});
    expect(result.missing_required_documents).toEqual([
      'B-BBEE Certificate or Sworn Affidavit',
      'Supplier Spend Schedule',
    ]);
  });
});
