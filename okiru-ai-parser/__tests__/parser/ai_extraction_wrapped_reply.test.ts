/**
 * A single-record answer nested one level down.
 *
 * A spec that reads ONE record ("Return JSON per letter: signatory_name, …")
 * can be answered two ways: flat ({"signatory_name": …}) or wrapped
 * ({"letters": [{"signatory_name": …}], "expected_parties": …}). Both carry the
 * same values. The wrapped shape used to be read as "nothing found" — every
 * expected key was absent at the top level — so the letter's whole extraction
 * was dropped. These tests pin the shapes that must now read the same as flat,
 * and the ones that must not be guessed at.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetExtractionCache } from '../../src/services/extractionCache.js';
import { extractWithSpec, unwrapSingleRecord, type ExtractionModel } from '../../src/services/aiExtraction.js';
import { VERIFICATION_DOCUMENT_MATRIX } from '../../schemas/verification_document_matrix.js';

const sweepBefore = process.env.AI_EXTRACTION_SWEEP;
beforeEach(() => {
  resetExtractionCache();
  process.env.AI_EXTRACTION_SWEEP = 'false';
});
afterEach(() => {
  if (sweepBefore === undefined) delete process.env.AI_EXTRACTION_SWEEP;
  else process.env.AI_EXTRACTION_SWEEP = sweepBefore;
});

function modelReplying(reply: unknown): ExtractionModel {
  return { name: 'scripted', complete: async () => JSON.stringify(reply) };
}

const LETTER_SPEC = VERIFICATION_DOCUMENT_MATRIX.find((d) =>
  d.expectedFields.includes('signatory_name') && d.expectedFields.includes('scope_of_declaration'))!;

const LETTER_TEXT = [
  'Acme Trading (Pty) Ltd',
  'MANAGEMENT REPRESENTATION',
  'We confirm that Acme Trading (Pty) Ltd is 100% black owned.',
  'Signed: J Mokoena, Financial Director, 3 March 2026',
].join('\n');

const LETTER = {
  signatory_name: 'J Mokoena',
  signatory_role: 'Financial Director',
  signing_date: '3 March 2026',
  scope_of_declaration: ['Acme Trading (Pty) Ltd is 100% black owned.'],
  entity_or_participant: 'Acme Trading (Pty) Ltd',
};

const fieldsOf = (values: Array<{ field: string; value: unknown }>) =>
  Object.fromEntries(values.map((v) => [v.field, v.value]));

describe('a single-record spec answered inside a wrapper', () => {
  it('reads a record wrapped in a one-element array the same as a flat reply', async () => {
    const result = await extractWithSpec(modelReplying({
      letters: [LETTER],
      expected_parties: { measured_entity: 'one letter expected' },
      exceptions: ['Only one letter present'],
    }), LETTER_SPEC, { filename: 'letter.pdf', raw_text: LETTER_TEXT });

    expect(fieldsOf(result.values)).toEqual(LETTER);
    expect(result.missingFields).toEqual([]);
    // The wrapper key is not reported as an unexpected field: its contents were read.
    expect(result.unexpectedFields).not.toContain('letters');
    expect(result.exceptions).toContain('Only one letter present');
  });

  it('reads a record wrapped in a single object the same way', async () => {
    const result = await extractWithSpec(modelReplying({ letter: LETTER }), LETTER_SPEC, {
      filename: 'letter.pdf', raw_text: LETTER_TEXT,
    });
    expect(fieldsOf(result.values)).toEqual(LETTER);
  });

  it('keeps the record\'s own exceptions', async () => {
    const result = await extractWithSpec(modelReplying({
      letters: [{ ...LETTER, exceptions: ['No handwritten signature'] }],
      exceptions: ['Only one letter present'],
    }), LETTER_SPEC, { filename: 'letter.pdf', raw_text: LETTER_TEXT });
    expect(result.exceptions).toEqual(expect.arrayContaining(['Only one letter present', 'No handwritten signature']));
  });

  it('treats a reply that names an expected field at the top level as the record itself', () => {
    // A nested record beside it may be a different party; nothing is lifted from it.
    const { record, wrapper } = unwrapSingleRecord(
      { signatory_name: 'Top Level', letters: [{ signatory_name: 'Nested', signing_date: '1 May 2026' }] },
      ['signatory_name', 'signing_date'],
    );
    expect(wrapper).toBeUndefined();
    expect(record.signatory_name).toBe('Top Level');
    expect(record.signing_date).toBeUndefined();
  });
});

describe('shapes that are not one record and must not be guessed at', () => {
  it('does not pick one of several wrapped records', () => {
    const second = { ...LETTER, signatory_name: 'P Dlamini' };
    const { record, multiple } = unwrapSingleRecord({ letters: [LETTER, second] }, LETTER_SPEC.expectedFields);
    expect(record.signatory_name).toBeUndefined();
    expect(multiple).toEqual({ key: 'letters', count: 2 });
  });

  it('does not unwrap a key the spec itself expects (an array-valued field)', () => {
    const { record, wrapper } = unwrapSingleRecord(
      { shareholder_rows: [{ entity_name: 'Row Holder' }] },
      ['entity_name', 'shareholder_rows'],
    );
    expect(wrapper).toBeUndefined();
    expect(record.entity_name).toBeUndefined();
  });

  it('does not unwrap a nested object that carries none of the expected fields', () => {
    const parsed = { signatory_name: 'J Mokoena', expected_parties: { measured_entity: 'one letter' } };
    const { record, wrapper } = unwrapSingleRecord(parsed, LETTER_SPEC.expectedFields);
    expect(wrapper).toBeUndefined();
    expect(record).toEqual(parsed);
  });

  it('never reads a sub-entity beside the record as the record (an auditor is not the company)', () => {
    const parsed = { entity_name: null, auditor: { entity_name: 'Auditors Inc', signatory_name: 'K Naidu' } };
    const { record, wrapper } = unwrapSingleRecord(parsed, ['entity_name', 'signatory_name']);
    expect(wrapper).toBeUndefined();
    expect(record.entity_name).toBeNull();
    expect(record.signatory_name).toBeUndefined();
  });

  it('does not choose between two different wrappers', () => {
    const { record, wrapper } = unwrapSingleRecord(
      { letter: { signatory_name: 'A' }, declaration: { signatory_name: 'B' } },
      ['signatory_name'],
    );
    expect(wrapper).toBeUndefined();
    expect(record.signatory_name).toBeUndefined();
  });
});
