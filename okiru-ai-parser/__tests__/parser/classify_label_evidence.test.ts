/**
 * Three ways a word can say less about a document than it seems to.
 *
 *  1. "VAT Reg. No. 4000000000" on a letterhead or footer is the sender's tax
 *     number, not the document's subject. The shared alias "VAT" used to match
 *     it, so any letter on company letterhead ranked as a VAT declaration.
 *  2. "salary" (singular) is a payroll column, but it is also a word in every
 *     employment contract, income-differential statement and job description.
 *     On its own it only means payroll when the document is payroll-SHAPED:
 *     several employee rows, a total, and payroll-run columns.
 *  3. The filename is weighed below the text — but when there is no text (an
 *     unreadable scan, a blank page) the filename is all there is, and the
 *     adjudicator refuses to read under 20 characters. Then it carries the
 *     weight it had before content-first classification.
 *
 * Every document below is SYNTHETIC — invented names and numbers.
 */
import { describe, expect, it } from 'vitest';
import { classifyDocument, contentConcepts } from '../../parser/classify_document.js';
import { InMemoryOntologyRepository } from '../../graph/ontology_queries.js';
import { buildOntologyRecordsFromWorkbook } from '../../graph/ontology_loader.js';
import type { DocumentClassification } from '../../schemas/document_types.js';

function doc(filename: string, raw_text: string) {
  return { file_id: `f_${filename}`, filename, mime_type: 'application/pdf', raw_text, tables: [], metadata: {} };
}

const repositories = {
  bundled: async () => new InMemoryOntologyRepository(),
  workbook: async () => {
    const repo = new InMemoryOntologyRepository();
    await repo.upsertOntology(buildOntologyRecordsFromWorkbook('ontology/BBBEE_Verification_Document_Matrix_v3.xlsx'));
    return repo;
  },
};

const LETTER_WITH_VAT_FOOTER = [
  'Acme Trading (Pty) Ltd',
  '14 Long Street, Germiston',
  '3 March 2026',
  'TO WHOM IT MAY CONCERN',
  'RE: CONFIRMATION OF OWNERSHIP',
  'We confirm that J Mokoena holds 100% of the issued shares of Acme Trading (Pty) Ltd.',
  'Yours faithfully, J Mokoena, Director',
  'VAT Reg. No. 4000000000   Co. Reg. No. 2001/000000/07',
].join('\n');

const VAT_CONFIRMATION = [
  'VAT CONFIRMATION',
  'We confirm that VAT has been excluded from all amounts claimed in the B-BBEE submission.',
  'Every invoice reviewed was recorded at its VAT-exclusive value.',
  'Signed: Financial Director, Acme Trading (Pty) Ltd',
].join('\n');

const vatTypes = (result: DocumentClassification) =>
  (result.ranked ?? []).filter((c) => /\bVAT\b/.test(c.document_type));

describe.each(Object.entries(repositories))('a VAT number is not a VAT document (%s ontology)', (_label, makeRepo) => {
  it('does not match the alias "VAT" on a letterhead or footer tax number', async () => {
    const result = await classifyDocument(doc('letter.pdf', LETTER_WITH_VAT_FOOTER) as never, await makeRepo());
    expect(result.document_type).not.toMatch(/\bVAT\b/);
    for (const candidate of vatTypes(result)) {
      expect(candidate.matched_evidence).not.toContain('VAT');
      expect(candidate.reasons.join(' ')).not.toMatch(/alias\/name matched: VAT\b/);
    }
  });

  it('still matches "VAT" where VAT is what the document is about', async () => {
    const result = await classifyDocument(doc('confirmation.pdf', VAT_CONFIRMATION) as never, await makeRepo());
    expect(result.document_type).toMatch(/\bVAT\b/);
    expect(vatTypes(result).some((c) => c.matched_evidence.includes('VAT'))).toBe(true);
  });

  it('also ignores "VAT No:" and "VAT number" labels followed by the number', async () => {
    const text = LETTER_WITH_VAT_FOOTER.replace('VAT Reg. No. 4000000000', 'VAT No: 4000000000  VAT number 4000000000');
    const result = await classifyDocument(doc('letter.pdf', text) as never, await makeRepo());
    for (const candidate of vatTypes(result)) expect(candidate.matched_evidence).not.toContain('VAT');
  });
});

describe('"salary" alone is not payroll evidence', () => {
  it('does not read an employment contract as payroll', () => {
    expect(contentConcepts([
      'CONTRACT OF EMPLOYMENT',
      'between Acme Trading (Pty) Ltd and P Dlamini (the employee).',
      'The employee will be paid a monthly salary of R 25 000,00, subject to PAYE and UIF deductions.',
      'Total cost to company: R 312 000,00 per year.',
    ].join('\n'))).toEqual([]);
  });

  it('does not read an income-differential statement as payroll', () => {
    expect(contentConcepts([
      'EEA4 INCOME DIFFERENTIAL STATEMENT',
      '| Occupational level | Average salary | Number of employees |',
      '| Top management | R 1 200 000,00 | 2 |',
      '| Senior management | R 840 000,00 | 4 |',
      '| Skilled technical | R 310 000,00 | 18 |',
      '| Total | R 2 350 000,00 | 24 |',
    ].join('\n'))).toEqual([]);
  });

  it('does not read a job description as payroll', () => {
    expect(contentConcepts([
      'JOB DESCRIPTION',
      'Position: Fleet Manager',
      'Reports to: Operations Director',
      'Salary: market related',
    ].join('\n'))).toEqual([]);
  });

  it('reads a payroll run with a bare "Salary" column as payroll: employee rows, payroll columns, a total', () => {
    expect(contentConcepts([
      'November 2025 run',
      '| Employee | Salary | PAYE | UIF | Net Pay |',
      '| Dlamini, P | R 18 000,00 | R 1 900,00 | R 180,00 | R 15 920,00 |',
      '| Khoza, L | R 21 300,00 | R 2 610,00 | R 177,12 | R 18 512,88 |',
      '| Ndlovu, T | R 14 010,40 | R 1 100,00 | R 140,10 | R 12 770,30 |',
      '| TOTAL | R 53 310,40 | R 5 610,00 | R 497,22 | R 47 203,18 |',
    ].join('\n'))).toEqual(['payroll']);
  });

  it('keeps the payroll phrases that mean payroll on their own', () => {
    expect(contentConcepts('Employee  Basic Salary')).toEqual(['payroll']);
    expect(contentConcepts('Monthly salary report')).toEqual(['payroll']);
    expect(contentConcepts('Payslip for November')).toEqual(['payroll']);
  });
});

describe.each(Object.entries(repositories))('a document with no text (%s ontology)', (_label, makeRepo) => {
  async function classify(filename: string, text: string) {
    return classifyDocument(doc(filename, text) as never, await makeRepo());
  }

  it('lets the filename carry the weight the text would have', async () => {
    const empty = await classify('EMP201 March 2025.pdf', '');
    const asText = await classify('scan.pdf', 'EMP201 March 2025');
    expect(empty.document_type).toBe(asText.document_type);
    expect(empty.confidence).toBeCloseTo(asText.confidence, 5);
    // Still honest about where the evidence came from.
    expect(empty.candidates?.[0].evidence_basis).toBe('filename');
  });

  it('treats a near-empty text layer (a page number) the same way', async () => {
    const nearEmpty = await classify('EMP201 March 2025.pdf', 'Page 1 of 1');
    const empty = await classify('EMP201 March 2025.pdf', '');
    expect(nearEmpty.document_type).toBe(empty.document_type);
    expect(nearEmpty.confidence).toBeGreaterThan(0.3);
  });

  it('keeps the filename light when the document has text of its own', async () => {
    const withText = await classify('EMP201 March 2025.pdf', 'Lunch Menu\nChicken sandwich: R85\nOrange juice: R30');
    const empty = await classify('EMP201 March 2025.pdf', '');
    expect(withText.confidence).toBeLessThan(empty.confidence);
    expect(withText.status).toBe('low_confidence');
  });
});
