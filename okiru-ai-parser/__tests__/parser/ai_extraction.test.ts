/**
 * AI extraction — accuracy, mixed documents, and cross-format evidence.
 *
 * The model is injected, so these run offline and deterministically. What is
 * under test is everything around the call: which specs a file is run against,
 * how a reply becomes entities, what happens when the reply is malformed, and
 * how values from different files and formats resolve into one answer.
 */
import { describe, expect, it } from 'vitest';
import {
  extractDocument,
  extractWithSpec,
  parseModelJson,
  selectSpecsForDocument,
  type ExtractionModel,
  type DocumentExtraction,
} from '../../src/services/aiExtraction.js';
import { resolveCaseEntities, valuesAgree } from '../../src/services/entityResolution.js';
import { findDocumentById, VERIFICATION_DOCUMENT_MATRIX } from '../../schemas/verification_document_matrix.js';

/** A model that replies with whatever the test scripts, keyed by prompt content. */
function scriptedModel(replies: Array<string | ((user: string) => string)>): ExtractionModel & { calls: string[] } {
  const calls: string[] = [];
  let index = 0;
  return {
    name: 'scripted',
    calls,
    async complete(_system: string, user: string) {
      calls.push(user);
      const reply = replies[Math.min(index, replies.length - 1)];
      index += 1;
      return typeof reply === 'function' ? reply(user) : reply;
    },
  };
}

const SETA_SPEC = VERIFICATION_DOCUMENT_MATRIX.find((d) => d.name === 'SETA registration certificate')!;

describe('parsing the model reply', () => {
  it('accepts plain JSON', () => {
    expect(parseModelJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('recovers JSON wrapped in code fences or prose', () => {
    // Models do this even when instructed not to; losing the extraction over it
    // would waste a call the user has already paid for.
    expect(parseModelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseModelJson('Here is the result:\n{"a":1}\nHope that helps.')).toEqual({ a: 1 });
  });

  it('returns null for a reply with no object, rather than throwing', () => {
    expect(parseModelJson('I could not read the document.')).toBeNull();
    expect(parseModelJson('[1,2,3]')).toBeNull();
  });
});

describe('extracting one document', () => {
  it('returns the schema fields the model found, each tagged with its source file', async () => {
    const model = scriptedModel([JSON.stringify({
      entity_name: 'Thandanani Packers & Haulers cc',
      sars_sdl_number: 'L123456789',
      seta_name: 'TETA',
      registration_date: '2019-03-01',
      current_status: 'current',
      verified_on_portal: true,
      exceptions: [],
    })]);

    const result = await extractWithSpec(model, SETA_SPEC, {
      filename: 'seta_cert.pdf',
      raw_text: 'SETA registration certificate ...',
    });

    expect(result.error).toBeUndefined();
    expect(result.sourceFile).toBe('seta_cert.pdf');
    const byField = Object.fromEntries(result.values.map((v) => [v.field, v.value]));
    expect(byField.entity_name).toBe('Thandanani Packers & Haulers cc');
    expect(byField.seta_name).toBe('TETA');
    expect(result.values.every((v) => v.sourceFile === 'seta_cert.pdf')).toBe(true);
  });

  it('reports fields the model did not find instead of inventing them', async () => {
    const model = scriptedModel([JSON.stringify({
      entity_name: 'Acme',
      sars_sdl_number: null,
      seta_name: 'N/A',
      registration_date: '',
      current_status: 'not stated',
    })]);

    const result = await extractWithSpec(model, SETA_SPEC, { filename: 'x.pdf', raw_text: 'text' });

    // null, "N/A", "" and "not stated" are all absence — a model writes them
    // interchangeably, and treating any as a value would put junk on a scorecard.
    expect(result.missingFields).toEqual(
      expect.arrayContaining(['sars_sdl_number', 'seta_name', 'registration_date', 'current_status']),
    );
    expect(result.values.map((v) => v.field)).toEqual(['entity_name']);
  });

  it('carries through exceptions raised by the expert\'s own checks', async () => {
    const model = scriptedModel([JSON.stringify({
      entity_name: 'Acme',
      current_status: 'expired',
      exceptions: ['Registration expired 2024-06-30 — zero points awarded'],
    })]);

    const result = await extractWithSpec(model, SETA_SPEC, { filename: 'x.pdf', raw_text: 't' });
    expect(result.exceptions).toEqual(['Registration expired 2024-06-30 — zero points awarded']);
  });

  it('treats "not this document" as nothing found, not as an error', async () => {
    const model = scriptedModel([JSON.stringify({ not_this_document: true })]);
    const result = await extractWithSpec(model, SETA_SPEC, { filename: 'invoice.pdf', raw_text: 'invoice' });

    expect(result.values).toHaveLength(0);
    expect(result.error).toBeUndefined();
    expect(result.missingFields).toHaveLength(0);
  });

  it('surfaces a model failure without losing the document', async () => {
    const model: ExtractionModel = {
      name: 'broken',
      async complete() { throw new Error('429 rate limited'); },
    };
    const result = await extractWithSpec(model, SETA_SPEC, { filename: 'x.pdf', raw_text: 't' });

    expect(result.error).toContain('429');
    expect(result.missingFields).toEqual(SETA_SPEC.expectedFields);
  });

  it('prefers markdown over flat text, because values live in tables', async () => {
    const model = scriptedModel([JSON.stringify({ entity_name: 'Acme' })]);
    await extractWithSpec(model, SETA_SPEC, {
      filename: 'x.xlsx',
      markdown: '| Entity | SETA |\n| --- | --- |\n| Acme | TETA |',
      raw_text: 'Entity SETA Acme TETA',
    });

    expect(model.calls[0]).toContain('| Entity | SETA |');
  });
});

describe('mixed documents — one file carrying several documents worth of evidence', () => {
  it('runs every spec whose evidence appears in the file', async () => {
    // A real information-gathering workbook: ownership, employment equity and
    // skills evidence in one .xlsm. Classifying it as a single document type
    // would throw away two thirds of it.
    const specs = selectSpecsForDocument(
      [
        'BEE Information Gathering File',
        'Securities register: total shares in issue 100',
        'EEA2 forms submitted to the Department of Labour',
        'SARS EMP201 submissions for the period',
      ].join('\n'),
      'BEE Information Gathering File - Thandanani Transport.xlsm',
    );

    const names = specs.map((s) => s.name);
    expect(specs.length).toBeGreaterThan(1);
    expect(names.some((n) => /EEA2/.test(n))).toBe(true);
    expect(names.some((n) => /EMP201/.test(n))).toBe(true);
  });

  it('extracts from each matched spec and tags every value with its document', async () => {
    // Keyed on the spec's schema line, not the document text: the document is
    // included in every prompt, so matching on its content would answer every
    // call the same way.
    const model = scriptedModel([(user) => (
      user.includes('EXPECTED JSON KEYS: reporting_period')
        ? JSON.stringify({ reporting_period: '2025', submission_date: '2025-01-15' })
        : JSON.stringify({ months_submitted: ['Mar', 'Apr'], sum_of_leviable_amount: 4249500 })
    )]);

    const results = await extractDocument(model, {
      filename: 'workbook.xlsm',
      raw_text: 'EEA2 forms submitted to the Department of Labour\nSARS EMP201 submissions',
    }, { limit: 4 });

    expect(results.length).toBeGreaterThan(1);
    // Values from one file can belong to different documents — provenance keeps
    // them distinguishable downstream.
    const documentIds = new Set(results.flatMap((r) => r.values.map((v) => v.sourceDocumentId)));
    expect(documentIds.size).toBeGreaterThan(1);
  });

  it('ignores aliases too short to route work on', () => {
    // "VAT" and "AFS" appear in dozens of documents; matching on them would run
    // every spec against every file.
    const specs = selectSpecsForDocument('VAT AFS', 'notes.txt');
    expect(specs).toHaveLength(0);
  });

  it('returns nothing for a file with no B-BBEE evidence rather than guessing', async () => {
    const model = scriptedModel(['{}']);
    expect(await extractDocument(model, { filename: 'lunch.pdf', raw_text: 'lunch receipt' })).toEqual([]);
  });
});

describe('resolving entities across a whole case', () => {
  function extraction(over: Partial<DocumentExtraction>): DocumentExtraction {
    return {
      documentId: 'doc', documentName: 'Doc', sourceFile: 'f.pdf',
      values: [], missingFields: [], unexpectedFields: [], exceptions: [], ...over,
    };
  }

  it('treats agreement across files as corroboration', () => {
    const resolved = resolveCaseEntities([
      extraction({ sourceFile: 'certificate.pdf', values: [{ field: 'entity_name', value: 'Acme Trading (Pty) Ltd', sourceFile: 'certificate.pdf', sourceDocumentId: 'a' }] }),
      extraction({ sourceFile: 'cipc.pdf', values: [{ field: 'entity_name', value: 'Acme Trading (Pty) Ltd.', sourceFile: 'cipc.pdf', sourceDocumentId: 'b' }] }),
    ]);

    // Trailing punctuation is not a disagreement.
    expect(resolved.fields.entity_name.agreementCount).toBe(2);
    expect(resolved.fields.entity_name.conflicted).toBe(false);
    expect(resolved.fields.entity_name.sources).toEqual(['certificate.pdf', 'cipc.pdf']);
  });

  it('agrees across formats: a spreadsheet number and a PDF money string', () => {
    const resolved = resolveCaseEntities([
      extraction({ sourceFile: 'afs.pdf', values: [{ field: 'npat', value: 'R 356 010', sourceFile: 'afs.pdf', sourceDocumentId: 'a' }] }),
      extraction({ sourceFile: 'sed.xlsx', values: [{ field: 'npat', value: 356010, sourceFile: 'sed.xlsx', sourceDocumentId: 'b' }] }),
    ]);

    expect(resolved.fields.npat.conflicted).toBe(false);
    expect(resolved.fields.npat.agreementCount).toBe(2);
  });

  it('never resolves a real disagreement silently', () => {
    const resolved = resolveCaseEntities([
      extraction({ sourceFile: 'afs.pdf', values: [{ field: 'npat', value: 356010, sourceFile: 'afs.pdf', sourceDocumentId: 'a' }] }),
      extraction({ sourceFile: 'accounts.xlsx', values: [{ field: 'npat', value: 412000, sourceFile: 'accounts.xlsx', sourceDocumentId: 'b' }] }),
    ]);

    const npat = resolved.fields.npat;
    expect(npat.conflicted).toBe(true);
    // Both rival values survive with their sources, so an auditor can explain it.
    expect(npat.alternatives).toEqual([{ value: 412000, sources: ['accounts.xlsx'] }]);
    expect(resolved.conflicts.map((c) => c.field)).toEqual(['npat']);
  });

  it('prefers the value more files corroborate', () => {
    const resolved = resolveCaseEntities([
      extraction({ sourceFile: 'a.pdf', values: [{ field: 'shares', value: 100, sourceFile: 'a.pdf', sourceDocumentId: 'x' }] }),
      extraction({ sourceFile: 'b.pdf', values: [{ field: 'shares', value: 100, sourceFile: 'b.pdf', sourceDocumentId: 'y' }] }),
      extraction({ sourceFile: 'c.pdf', values: [{ field: 'shares', value: 90, sourceFile: 'c.pdf', sourceDocumentId: 'z' }] }),
    ]);

    expect(resolved.fields.shares.value).toBe(100);
    expect(resolved.fields.shares.conflicted).toBe(true);
  });

  it('a field found in one document is not missing because another lacked it', () => {
    const resolved = resolveCaseEntities([
      extraction({ sourceFile: 'a.pdf', missingFields: ['entity_name'] }),
      extraction({ sourceFile: 'b.pdf', values: [{ field: 'entity_name', value: 'Acme', sourceFile: 'b.pdf', sourceDocumentId: 'b' }] }),
    ]);

    expect(resolved.missingFields.map((m) => m.field)).not.toContain('entity_name');
    expect(resolved.fields.entity_name.value).toBe('Acme');
  });

  it('reports what is still genuinely missing, and which document should carry it', () => {
    const resolved = resolveCaseEntities([
      extraction({ documentName: 'SETA registration certificate', missingFields: ['sars_sdl_number'] }),
    ]);

    expect(resolved.missingFields).toEqual([
      { field: 'sars_sdl_number', expectedFrom: ['SETA registration certificate'] },
    ]);
  });

  it('names files nothing could be extracted from, so they can be queried', () => {
    const resolved = resolveCaseEntities(
      [extraction({ sourceFile: 'good.pdf', values: [{ field: 'a', value: 1, sourceFile: 'good.pdf', sourceDocumentId: 'd' }] })],
      { allFiles: ['good.pdf', 'blurry_scan.jpg'] },
    );

    expect(resolved.filesWithNoExtraction).toEqual(['blurry_scan.jpg']);
    expect(resolved.documentsExtracted).toBe(1);
  });
});

describe('value agreement', () => {
  it('matches the same number written different ways', () => {
    expect(valuesAgree('R 1 250 000', 1250000)).toBe(true);
    expect(valuesAgree('51%', 51)).toBe(true);
    expect(valuesAgree('1,250.50', 1250.5)).toBe(true);
  });

  it('does not match genuinely different numbers or unrelated text', () => {
    expect(valuesAgree(100, 90)).toBe(false);
    expect(valuesAgree('Acme Trading', 'Beta Logistics')).toBe(false);
    expect(valuesAgree(null, 0)).toBe(false);
  });
});

describe('every matrix document is runnable', () => {
  it('has a prompt and a schema, so no document type is a dead end', () => {
    for (const doc of VERIFICATION_DOCUMENT_MATRIX) {
      expect(findDocumentById(doc.id)).not.toBeNull();
      expect(doc.extractionPrompt.length).toBeGreaterThan(40);
      expect(doc.expectedFields.length).toBeGreaterThan(0);
    }
  });
});
