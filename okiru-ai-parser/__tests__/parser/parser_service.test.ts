import { describe, expect, it } from 'vitest';
import { parserOutputSchema } from '../../schemas/parser_output.js';
import { ParserService } from '../../parser/parser_service.js';

describe('ParserService', () => {
  it('returns a valid passed parser output for high-confidence complete evidence', async () => {
    const service = new ParserService();
    const result = await service.resolve({
      file_id: 'doc_001',
      filename: 'supplier_certificate.pdf',
      mime_type: 'application/pdf',
      raw_text: [
        'B-BBEE Certificate',
        'Enterprise Name: ABC Suppliers Pty Ltd',
        'B-BBEE Status Level: Level Two',
        'Black Ownership: 51%',
        'Expiry Date: 01 Feb 2027',
      ].join('\n'),
      tables: [],
      metadata: { source: 'upload' },
    });

    expect(() => parserOutputSchema.parse(result)).not.toThrow();
    expect(result.status).toBe('passed');
    expect(result.calculator_payload['supplier.name']).toBe('ABC Suppliers Pty Ltd');
    expect(result.calculator_payload['supplier.bee_level']).toBe(2);
  });

  it('returns review_required when required evidence is missing', async () => {
    const service = new ParserService();
    const result = await service.resolve({
      file_id: 'doc_002',
      filename: 'certificate_unclear.pdf',
      mime_type: 'application/pdf',
      raw_text: [
        'B-BBEE Certificate',
        'Enterprise Name: ABC Suppliers Pty Ltd',
        'B-BBEE Status Level: Level Two',
      ].join('\n'),
      tables: [],
      metadata: {},
    });

    expect(result.status).toBe('review_required');
    expect(result.audit_trail.requires_human_review).toBe(true);
    expect(result.validation.missing_fields).toContain('expiry_date');
  });
});
