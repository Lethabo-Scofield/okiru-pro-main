import { describe, expect, it } from 'vitest';
import { InMemoryOntologyRepository } from '../../graph/ontology_queries.js';
import { buildCalculatorPayload } from '../../parser/calculator_mapper.js';
import { extractFields } from '../../parser/extract_fields.js';
import { validateExtractedFields } from '../../parser/validate.js';

describe('calculator mapper', () => {
  it('only includes safe extracted and validated fields', async () => {
    const repo = new InMemoryOntologyRepository();
    const knowledge = await repo.getDocumentKnowledge('B-BBEE Certificate');
    const extracted = extractFields({
      file_id: 'doc_safe',
      filename: 'certificate.pdf',
      mime_type: 'application/pdf',
      raw_text: [
        'Enterprise Name: ABC Suppliers Pty Ltd',
        'B-BBEE Status Level: Level Two',
        'Black Ownership: 51%',
        'Expiry Date: 01 Feb 2027',
      ].join('\n'),
      tables: [],
      metadata: {},
    }, knowledge!.fields);

    extracted.black_ownership.confidence = 0.7;
    const validation = validateExtractedFields(knowledge!.fields, extracted, 0.95, new Date('2026-06-07'));
    const payload = buildCalculatorPayload(knowledge!.fields, extracted, validation.safe_fields);

    expect(payload['supplier.name']).toBe('ABC Suppliers Pty Ltd');
    expect(payload['supplier.bee_level']).toBe(2);
    expect(payload['supplier.black_ownership']).toBeUndefined();
  });
});
