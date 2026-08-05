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
    // Genuine trouble (expired) keeps this 'confused' under the yield-driven
    // rule; the missing signed_date is still surfaced as a gap.
    { filename: 'thebe_affidavit.jpg', reasons: ['signed_date missing', 'Certificate is expired'] },
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

  it('a genuinely-troubled document (expired) is "confused" — never "found" — and still names the gap', () => {
    const v = assessDocuments(CASE).verdicts.find((x) => x.filename === 'thebe_affidavit.jpg')!;
    expect(v.verdict).toBe('confused');
    expect(v.gaps.join(' ')).toMatch(/Signed Date/i);
    // It still reports what it DID get, so the user can judge.
    expect(v.summary).toContain('Level 1');
  });

  it('a document that yielded data but only lacks an OPTIONAL field is "found", with the gap listed', () => {
    // The yield-driven rule: a missing optional field is a gap we show, not a
    // reason to tell the user the document did not work. (This is what fixed the
    // "0 found while the score is 87" contradiction.)
    const withOptionalGap: any = {
      documents_detected: [{
        filename: 'partial_cert.pdf',
        document_type: 'B-BBEE Certificate',
        status: 'review_required',
        overall_confidence: 0.8,
        validation: { warnings: [], errors: [], missing_fields: ['signed_date'] },
      }],
      fields_extracted: { 'partial_cert.pdf': { bee_level: { normalized_value: 2 }, black_ownership: { normalized_value: 60 } } },
      documents_needing_review: [{ filename: 'partial_cert.pdf', reasons: ['signed_date missing'] }],
    };
    const v = assessDocuments(withOptionalGap).verdicts[0];
    expect(v.verdict).toBe('found');
    expect(v.gaps.join(' ')).toMatch(/Signed Date/i);
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

/**
 * The 87.93-vs-"0 found" bug: the AI-entity path attributes its yield as
 * workbook rows carrying `_sourceFiles`, not as fields_extracted — so documents
 * whose data was busy scoring on the next page showed as "nothing". Verdicts
 * are now assessed against the merged sections.
 */
describe('assessDocuments — merged section-row attribution', () => {
  const SECTIONS = {
    ownership: {
      rows: [
        { _id: 'r1', shareholderName: 'N Dlamini', _sourceFiles: ['share_register.pdf'] },
        { _id: 'r2', shareholderName: 'P Naidoo', _sourceFiles: ['share_register.pdf'] },
        { _id: 'r3', shareholderName: 'T Molefe', _sourceFiles: ['share_register.pdf', 'ids.pdf'] },
      ],
    },
    'skills-development': {
      rows: [{ _id: 's1', learnerName: 'A Learner', _sourceFiles: ['training_report.xlsx'] }],
    },
    'company-information': { meta: { companyName: 'X' } },
  };

  it('a detected doc whose only yield is section rows is "found", summarised by its rows', () => {
    const parserCase: any = {
      documents_detected: [
        { filename: 'share_register.pdf', document_type: 'Share Register' },
      ],
      fields_extracted: { 'share_register.pdf': {} },
    };
    const v = assessDocuments(parserCase, SECTIONS as any).verdicts.find(
      (x) => x.filename === 'share_register.pdf',
    )!;
    expect(v.verdict).toBe('found');
    expect(v.summary).toContain('3 shareholders');
  });

  it('a file only the AI path saw gets a synthesized verdict instead of vanishing', () => {
    const r = assessDocuments({} as any, SECTIONS as any);
    const training = r.verdicts.find((x) => x.filename === 'training_report.xlsx')!;
    expect(training.verdict).toBe('found');
    expect(training.summary).toContain('1 learner');
    expect(r.anyUsable).toBe(true);
  });

  it('a financial doc misclassified as a supplier schedule is relabelled by what we read, with no false gap', () => {
    // The BM25 classifier calls an AFS / Finance sheet "Supplier Spend Schedule"
    // because it contains the words "procurement spend". The AI path read revenue
    // + NPAT out of it, so it IS a financial statement — labelled as one, and its
    // supplier-spend "gaps" (a document type it never was) are dropped.
    const parserCase: any = {
      documents_detected: [{
        filename: 'AFS Extract.pdf',
        document_type: 'Supplier Spend Schedule',
        status: 'review_required',
        validation: { errors: [], warnings: [], missing_fields: ['supplier_name', 'spend_amount'] },
      }],
      fields_extracted: { 'AFS Extract.pdf': {} },
      ai_entities: {
        extractions: [{
          documentId: 'sheet_financials',
          sourceFile: 'AFS Extract.pdf',
          values: [{ field: 'current_year_revenue', value: 24000000 }, { field: 'current_year_npat', value: 1850000 }],
        }],
      },
    };
    const v = assessDocuments(parserCase).verdicts.find((x) => x.filename === 'AFS Extract.pdf')!;
    expect(v.verdict).toBe('found');
    expect(v.documentType).toBe('Financial statements / summary');
    expect(v.gaps.join(' ')).not.toMatch(/supplier|spend/i);
  });

  it('genuine trouble outranks rows: a doc with rows but a real conflict stays "confused"', () => {
    const parserCase: any = {
      documents_detected: [
        {
          filename: 'share_register.pdf',
          document_type: 'Share Register',
          status: 'review_required',
          validation: { errors: ['Black ownership conflicts with the certificate'], missing_fields: ['shareholding_percent'] },
        },
      ],
    };
    const v = assessDocuments(parserCase, SECTIONS as any).verdicts.find(
      (x) => x.filename === 'share_register.pdf',
    )!;
    expect(v.verdict).toBe('confused');
    expect(v.gaps.join(' ')).toMatch(/Shareholding Percent/i);
  });
});
