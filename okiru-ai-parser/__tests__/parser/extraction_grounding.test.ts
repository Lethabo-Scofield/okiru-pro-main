/**
 * The verification pass: is each extracted value actually in the document?
 *
 * Confidence does not catch a confident hallucination — a model that invents
 * "Level 4" reports the same confidence as one that read it. Going back to the
 * source is the only reliable check.
 *
 * The properties that matter: a real value grounds despite formatting
 * differences, an invented one does not, and values that CANNOT be checked this
 * way are never reported as ungrounded (which would manufacture false alarms and
 * teach reviewers to ignore the signal).
 */
import { describe, expect, it } from 'vitest';
import { groundValues, isGrounded } from '../../src/services/extractionGrounding.js';

const CERTIFICATE = [
  'B-BBEE STATUS LEVEL VERIFICATION CERTIFICATE',
  'Certificate Number: BEE/2026/00184',
  'Issued to: Acme Trading (Pty) Ltd',
  'Registration Number: 2015/123456/07',
  'B-BBEE Status Level: Level 4 Contributor',
  'Black Ownership: 32.15%',
  'Total Procurement Expenditure: R 1 030 806.68',
  'Expiry Date: 14 March 2027',
].join('\n');

describe('a value that is really there grounds', () => {
  it('grounds a verbatim quotation', () => {
    expect(isGrounded('BEE/2026/00184', CERTIFICATE)).toBe(true);
    expect(isGrounded('Acme Trading (Pty) Ltd', CERTIFICATE)).toBe(true);
  });

  it('grounds despite currency and separator formatting', () => {
    // The document says "R 1 030 806.68"; the model may return any of these.
    expect(isGrounded('1030806.68', CERTIFICATE)).toBe(true);
    expect(isGrounded('R1 030 806.68', CERTIFICATE)).toBe(true);
    expect(isGrounded('1,030,806.68', CERTIFICATE)).toBe(true);
  });

  it('grounds an ISO date against a long-form date', () => {
    // Document: "14 March 2027". Model asked not to convert, but sometimes does.
    expect(isGrounded('2027-03-14', CERTIFICATE)).toBe(true);
  });

  it('grounds a percentage written with its symbol', () => {
    expect(isGrounded('32.15', CERTIFICATE)).toBe(true);
    expect(isGrounded('32.15%', CERTIFICATE)).toBe(true);
  });
});

describe('a value that is NOT there does not ground', () => {
  it('rejects an invented certificate number', () => {
    // The dangerous case: plausible, correctly formatted, entirely fabricated.
    expect(isGrounded('BEE/2026/99999', CERTIFICATE)).toBe(false);
  });

  it('rejects an invented company name', () => {
    expect(isGrounded('Beta Logistics CC', CERTIFICATE)).toBe(false);
  });

  it('rejects a number the document does not contain', () => {
    expect(isGrounded('9 999 999.00', CERTIFICATE)).toBe(false);
  });

  it('rejects a date the document does not contain', () => {
    expect(isGrounded('2028-01-01', CERTIFICATE)).toBe(false);
  });
});

describe('values that cannot be checked this way are not flagged', () => {
  it('does not flag booleans — they are judgements, not quotations', () => {
    // "certification_within_3_months: true" is a conclusion ABOUT the document.
    const results = groundValues(
      [{ field: 'certification_within_3_months', value: true }],
      CERTIFICATE,
      { file: 'c.pdf', document: 'cert' },
    );
    expect(results[0].verdict).toBe('not_applicable');
  });

  it('does not flag very short values, where a match would prove nothing', () => {
    // "4" appears in almost any document by chance; grounding it is noise.
    const results = groundValues(
      [{ field: 'bee_level', value: '4' }],
      CERTIFICATE,
      { file: 'c.pdf', document: 'cert' },
    );
    expect(results[0].verdict).toBe('not_applicable');
  });

  it('does not flag nulls, arrays or objects', () => {
    const results = groundValues(
      [
        { field: 'a', value: null },
        { field: 'b', value: ['x', 'y'] },
        { field: 'c', value: { nested: true } },
      ],
      CERTIFICATE,
      { file: 'c.pdf', document: 'cert' },
    );
    expect(results.every((r) => r.verdict === 'not_applicable')).toBe(true);
  });
});

describe('grounding a whole extraction', () => {
  it('separates the real values from the invented one', () => {
    const results = groundValues(
      [
        { field: 'certificate_number', value: 'BEE/2026/00184' },
        { field: 'entity_name', value: 'Acme Trading (Pty) Ltd' },
        { field: 'black_ownership', value: '32.15%' },
        { field: 'total_spend', value: '9 999 999.00' }, // fabricated
      ],
      CERTIFICATE,
      { file: 'cert.pdf', document: 'bbee_certificate' },
    );

    const byField = Object.fromEntries(results.map((r) => [r.field, r.verdict]));
    expect(byField.certificate_number).toBe('grounded');
    expect(byField.entity_name).toBe('grounded');
    expect(byField.black_ownership).toBe('grounded');
    expect(byField.total_spend).toBe('ungrounded');
  });

  it('never drops a value — an ungrounded value is evidence, not a verdict', () => {
    // A grounding miss goes to a reviewer. Silently discarding it would be the
    // same silent-zero failure in a new coat.
    const values = [{ field: 'x', value: 'not in the document at all' }];
    const results = groundValues(values, CERTIFICATE, { file: 'c.pdf', document: 'd' });

    expect(results).toHaveLength(1);
    expect(results[0].value).toBe('not in the document at all');
  });

  it('handles an empty extraction without throwing', () => {
    expect(groundValues([], CERTIFICATE, { file: 'c.pdf', document: 'd' })).toEqual([]);
  });
});
