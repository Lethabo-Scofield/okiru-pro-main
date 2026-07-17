/**
 * Document verdicts (flow step 8).
 *
 * The rule that matters: we would rather under-claim than tell a user we read
 * something we didn't. So anything the parser flagged for review is `confused`,
 * never `found` — and a document that yielded nothing is `none`, not a silent
 * pass. The requote is argued from these verdicts, so they must be honest.
 */
import { describe, it, expect } from 'vitest';
import { assessDocuments } from '../documentVerdicts';

const CASE: any = {
  status: 'review_required',
  supplier_rows: [
    { supplier_name: 'Acme Supplies (Pty) Ltd', spend_amount: 1200000, source_file: 'spend.csv' },
    { supplier_name: 'Thebe Logistics CC', spend_amount: 800000, source_file: 'spend.csv' },
  ],
  documents_detected: [
    {
      filename: 'acme_cert.pdf',
      document_type: 'B-BBEE Certificate',
      status: 'passed',
      overall_confidence: 0.94,
      validation: { warnings: [], errors: [], missing_fields: [] },
    },
    {
      filename: 'spend.csv',
      document_type: 'Supplier Spend Schedule',
      status: 'passed',
      overall_confidence: 0.9,
      validation: { warnings: [], errors: [], missing_fields: [] },
    },
    {
      filename: 'thebe_affidavit.jpg',
      document_type: 'B-BBEE Sworn Affidavit',
      status: 'review_required',
      overall_confidence: 0.55,
      validation: { warnings: [], errors: [], missing_fields: ['signed_date'] },
    },
    {
      filename: 'lunch_menu.pdf',
      document_type: 'Unrecognised document',
      status: 'failed',
      overall_confidence: 0.1,
      validation: { warnings: [], errors: [], missing_fields: [] },
    },
  ],
  fields_extracted: {
    'acme_cert.pdf': {
      supplier_name: { normalized_value: 'Acme Supplies (Pty) Ltd' },
      bee_level: { normalized_value: 2 },
      black_ownership: { normalized_value: 51 },
      expiry_date: { normalized_value: '2027-01-31' },
    },
    'spend.csv': {},
    'thebe_affidavit.jpg': {
      supplier_name: { normalized_value: 'Thebe Logistics CC' },
      bee_level: { normalized_value: 1 },
    },
    'lunch_menu.pdf': {},
  },
  documents_needing_review: [
    { filename: 'thebe_affidavit.jpg', reasons: ['signed_date missing'] },
  ],
};

describe('assessDocuments', () => {
  it('a clean passed document with extracted values is "found", and says what it gave', () => {
    const v = assessDocuments(CASE).verdicts.find((x) => x.filename === 'acme_cert.pdf')!;
    expect(v.verdict).toBe('found');
    expect(v.summary).toContain('Level 2');
    expect(v.summary).toContain('51% black');
    expect(v.summary).toContain('2027-01-31');
    expect(v.gaps).toEqual([]);
  });

  it('a spend schedule is summarised by its rows, not a single field', () => {
    const v = assessDocuments(CASE).verdicts.find((x) => x.filename === 'spend.csv')!;
    expect(v.verdict).toBe('found');
    expect(v.summary).toContain('2 suppliers');
    expect(v.summary).toContain('R2.0M');
  });

  it('a review-flagged document is "confused" — never "found" — and names the gap', () => {
    const v = assessDocuments(CASE).verdicts.find((x) => x.filename === 'thebe_affidavit.jpg')!;
    expect(v.verdict).toBe('confused');
    expect(v.gaps.join(' ')).toMatch(/Signed Date/i);
    // It still reports what it DID get, so the user can judge.
    expect(v.summary).toContain('Level 1');
  });

  it('a failed / irrelevant document is "none" and says so plainly', () => {
    const v = assessDocuments(CASE).verdicts.find((x) => x.filename === 'lunch_menu.pdf')!;
    expect(v.verdict).toBe('none');
    expect(v.summary).toMatch(/nothing readable/i);
  });

  it('counts the three states and reports whether anything is usable', () => {
    const r = assessDocuments(CASE);
    expect(r.counts).toEqual({ found: 2, confused: 1, none: 1 });
    expect(r.anyUsable).toBe(true);
  });

  it('a passed document that yielded no values at all is "none", not a silent pass', () => {
    const empty: any = {
      documents_detected: [{ filename: 'blank.pdf', document_type: 'PDF evidence', status: 'passed', validation: {} }],
      fields_extracted: { 'blank.pdf': {} },
      supplier_rows: [],
    };
    const v = assessDocuments(empty).verdicts[0];
    expect(v.verdict).toBe('none');
    expect(assessDocuments(empty).anyUsable).toBe(false);
  });

  it('handles an empty case without throwing', () => {
    const r = assessDocuments({} as any);
    expect(r.verdicts).toEqual([]);
    expect(r.counts).toEqual({ found: 0, confused: 0, none: 0 });
    expect(r.anyUsable).toBe(false);
  });
});
