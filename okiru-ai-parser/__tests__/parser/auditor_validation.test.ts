/**
 * The validation layer runs the expert's auditor tests against the evidence.
 *
 * The rules that matter are about not overstating confidence: an unreadable or
 * unrecognised answer must never be recorded as a pass, and the layer must stay
 * advisory — it flags, it never edits a value or blocks an upload.
 */
import { describe, expect, it } from 'vitest';
import {
  splitAuditorTests,
  validateCase,
  validateDocument,
} from '../../src/services/auditorValidation.js';
import type { ExtractionModel } from '../../src/services/aiExtraction.js';
import { VERIFICATION_DOCUMENT_MATRIX } from '../../schemas/verification_document_matrix.js';

/** A real matrix document with auditor tests, so the test is not synthetic. */
const REAL_DOC = VERIFICATION_DOCUMENT_MATRIX.find((doc) => doc.auditorTests.length > 60)!;

function model(reply: string): ExtractionModel {
  return { name: 'fake', complete: async () => reply };
}

const failingModel: ExtractionModel = {
  name: 'fake',
  complete: async () => { throw new Error('upstream 500'); },
};

describe('splitting the expert prose into tests', () => {
  it('splits a paragraph into separate testable statements', () => {
    const tests = splitAuditorTests(
      "Confirms the person qualifies as 'Black'. Auditor checks the ID number for SA citizenship. "
      + 'Confirms the copy is certified within 3 months.',
    );
    expect(tests).toHaveLength(3);
    expect(tests[1]).toContain('SA citizenship');
  });

  it('ignores fragments too short to be a real test', () => {
    expect(splitAuditorTests('N/A. Yes.')).toEqual([]);
  });
});

describe('running the tests', () => {
  it('returns a verdict per test with the evidence it relied on', async () => {
    const result = await validateDocument(REAL_DOC.id, 'id-copy.pdf', 'some document text', model(JSON.stringify({
      findings: [
        { test: 'Checks the ID number for SA citizenship', verdict: 'pass', evidence: 'ID 5608305112083', remedy: '' },
        { test: 'Confirms certified within 3 months', verdict: 'fail', evidence: 'Certified 14 Jan 2024', remedy: 'Supply a copy certified within the last 3 months' },
      ],
    })));

    expect(result).not.toBeNull();
    expect(result!.findings).toHaveLength(2);
    expect(result!.findings[0].verdict).toBe('pass');
    expect(result!.findings[1].remedy).toContain('certified within the last 3 months');
    expect(result!.requiresAttention).toBe(true);
  });

  it('treats an unrecognised verdict as cannot_tell, never as a pass', async () => {
    const result = await validateDocument(REAL_DOC.id, 'x.pdf', 'text', model(JSON.stringify({
      findings: [{ test: 'Some test', verdict: 'probably fine', evidence: '', remedy: '' }],
    })));

    // Overstating confidence is the dangerous direction: a wrongly-passed test
    // is evidence nobody looks at again.
    expect(result!.findings[0].verdict).toBe('cannot_tell');
    expect(result!.requiresAttention).toBe(false);
  });

  it('drops a pass remedy, because a passing test has nothing to fix', async () => {
    const result = await validateDocument(REAL_DOC.id, 'x.pdf', 'text', model(JSON.stringify({
      findings: [{ test: 'Some test', verdict: 'pass', evidence: 'ok', remedy: 'do something' }],
    })));
    expect(result!.findings[0].remedy).toBe('');
  });

  it('returns null for an unknown document rather than inventing tests', async () => {
    expect(await validateDocument('not_a_real_document', 'x.pdf', 'text', model('{}'))).toBeNull();
  });

  it('returns null when the model fails — validation is advisory', async () => {
    expect(await validateDocument(REAL_DOC.id, 'x.pdf', 'text', failingModel)).toBeNull();
  });

  it('returns null on unparseable output instead of a bogus finding', async () => {
    expect(await validateDocument(REAL_DOC.id, 'x.pdf', 'text', model('not json at all'))).toBeNull();
  });
});

describe('validating a whole case', () => {
  const text = new Map([['a.pdf', 'document a'], ['b.pdf', 'document b']]);

  it('collects failures and unresolved tests separately', async () => {
    const replies = model(JSON.stringify({
      findings: [
        { test: 'Test one', verdict: 'fail', evidence: 'expired', remedy: 'Renew it' },
        { test: 'Test two', verdict: 'cannot_tell', evidence: 'no signature block found', remedy: 'Supply a signed copy' },
        { test: 'Test three', verdict: 'pass', evidence: 'fine', remedy: '' },
      ],
    }));

    const result = await validateCase(
      [{ documentId: REAL_DOC.id, sourceFile: 'a.pdf', values: [{}] }],
      text,
      replies,
    );

    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].remedy).toBe('Renew it');
    // "Cannot tell" is its own category: usually missing evidence, which is a
    // different conversation with the user than a failed check.
    expect(result.unresolved).toHaveLength(1);
    expect(result.unresolved[0].test).toBe('Test two');
  });

  it('skips documents that produced no values — nothing to validate', async () => {
    const result = await validateCase(
      [{ documentId: REAL_DOC.id, sourceFile: 'a.pdf', values: [] }],
      text,
      model('{"findings":[{"test":"t","verdict":"fail","evidence":"e","remedy":"r"}]}'),
    );
    expect(result.documents).toHaveLength(0);
    expect(result.failures).toHaveLength(0);
  });

  it('produces an empty result for an empty case rather than throwing', async () => {
    const result = await validateCase([], new Map(), model('{}'));
    expect(result).toEqual({ documents: [], failures: [], unresolved: [] });
  });
});
