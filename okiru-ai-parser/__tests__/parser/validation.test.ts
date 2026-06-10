import { describe, expect, it } from 'vitest';
import { InMemoryOntologyRepository } from '../../graph/ontology_queries.js';
import { extractFields } from '../../parser/extract_fields.js';
import { validateExtractedFields } from '../../parser/validate.js';

describe('parser validation', () => {
  it('flags missing required fields', async () => {
    const repo = new InMemoryOntologyRepository();
    const knowledge = await repo.getDocumentKnowledge('B-BBEE Certificate');
    expect(knowledge).toBeTruthy();
    const extracted = extractFields({
      file_id: 'doc_missing',
      filename: 'certificate.pdf',
      mime_type: 'application/pdf',
      raw_text: 'B-BBEE Status Level: Level Two',
      tables: [],
      metadata: {},
    }, knowledge!.fields);

    const validation = validateExtractedFields(knowledge!.fields, extracted, 0.95);
    expect(validation.passed).toBe(false);
    expect(validation.missing_fields).toContain('supplier_name');
    expect(validation.missing_fields).toContain('expiry_date');
  });

  it('flags expired certificates', async () => {
    const repo = new InMemoryOntologyRepository();
    const knowledge = await repo.getDocumentKnowledge('B-BBEE Certificate');
    const extracted = extractFields({
      file_id: 'doc_expired',
      filename: 'certificate.pdf',
      mime_type: 'application/pdf',
      raw_text: [
        'Enterprise Name: ABC Suppliers Pty Ltd',
        'B-BBEE Status Level: Level Two',
        'Expiry Date: 01 Feb 2025',
      ].join('\n'),
      tables: [],
      metadata: {},
    }, knowledge!.fields);

    const validation = validateExtractedFields(knowledge!.fields, extracted, 0.95, new Date('2026-06-07'));
    expect(validation.errors).toContain('Certificate is expired');
  });
});
