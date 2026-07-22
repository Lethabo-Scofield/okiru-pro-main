/**
 * Regression: large documents used to be classified with false certainty.
 *
 * Measured on the real Thandanani pack, EVERY substantial file — a 24MB toolkit
 * workbook, two strategy packs, the procurement schedule — classified as
 * "B-BBEE Certificate" at 0.99. The cause was unbounded bag-of-words matching:
 * evidence counted wherever it appeared, so confidence rose with document
 * LENGTH rather than with fit. A BEE workbook contains every BEE term somewhere,
 * so it matched every document type.
 */
import { describe, expect, it } from 'vitest';
import { classifyDocument } from '../../parser/classify_document.js';
import { InMemoryOntologyRepository } from '../../graph/ontology_queries.js';

const repo = new InMemoryOntologyRepository();

function input(filename: string, raw_text: string) {
  return { file_id: 'x', filename, raw_text, kind: 'text' } as never;
}

/**
 * A long, non-identifying preamble. The point of these tests is that evidence
 * buried in the BODY must not create confidence, so the term soup below has to
 * sit past the header window — otherwise the fixture is simply a document that
 * really does announce itself, and proves nothing.
 */
const PREAMBLE = `${'General notes and instructions for completing this file. '.repeat(40)}\n`;

/** Every B-BBEE term, as a big workbook would contain them — but no header. */
const WORKBOOK_TERMS = [
  'Sheet1', 'Sheet2', 'Sheet3',
  'black ownership', 'voting rights', 'economic interest', 'net value',
  'skills development', 'leviable amount', 'training spend', 'learnerships',
  'supplier name', 'procurement spend', 'bee level', 'certificate', 'expiry date',
  'socio economic development', 'beneficiary', 'contribution',
  'employment equity', 'management control', 'top management', 'directors',
  'enterprise development', 'affidavit', 'sworn', 'turnover', 'revenue',
].join('\n').repeat(40);

/** Terms only ever appear past the header window. */
const WORKBOOK_BODY = PREAMBLE + WORKBOOK_TERMS;

describe('a document is identified by what it says it is, not by what it mentions', () => {
  it('does not award high confidence to a workbook that merely contains every term', async () => {
    const result = await classifyDocument(
      input('Thandanani Toolkit (RCOGP).xlsx', WORKBOOK_BODY),
      repo,
    );

    // The bug: 0.99 "classified" as a B-BBEE Certificate.
    expect(result.confidence).toBeLessThan(0.85);
    expect(result.status).not.toBe('classified');
  });

  it('calls a multi-document upload a compendium instead of guessing one type', async () => {
    const result = await classifyDocument(
      input('BEE Information Gathering File.xlsm', WORKBOOK_BODY),
      repo,
    );

    // Naming one of many equally-matched types is a guess. Saying "this is a
    // pack" is actionable — the user can split it or we can process per sheet.
    if (result.status === 'compendium') {
      expect(result.reason).toMatch(/several documents|workbook or pack/i);
    } else {
      // If it did not trip the compendium rule it must at least not be confident.
      expect(result.confidence).toBeLessThan(0.85);
    }
  });

  it('still identifies a real certificate that names itself in its header', async () => {
    // The fix must not cost us the documents that DO work.
    const result = await classifyDocument(
      input('certificate.pdf', [
        'B-BBEE STATUS LEVEL VERIFICATION CERTIFICATE',
        'Certificate Number: BEE/2026/00184',
        'Issued to: Acme Trading (Pty) Ltd',
        'B-BBEE Status Level: Level 4 Contributor',
        'Black Ownership: 32.15%',
        'Expiry Date: 14 March 2027',
      ].join('\n')),
      repo,
    );

    expect(result.document_type).toBe('B-BBEE Certificate');
    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    expect(['classified', 'ambiguous']).toContain(result.status);
  });

  it('weights the header over the body: a passing mention is not an identity', async () => {
    const mentionsIt = await classifyDocument(
      input('strategy-pack.pdf', `Strategy overview\n${'filler '.repeat(400)}\nwe reviewed the B-BBEE Certificate on file`),
      repo,
    );
    const isIt = await classifyDocument(
      input('cert.pdf', 'B-BBEE Certificate\nCertificate Number: 123\nExpiry Date: 14 March 2027'),
      repo,
    );

    expect(isIt.confidence).toBeGreaterThan(mentionsIt.confidence);
  });
});
