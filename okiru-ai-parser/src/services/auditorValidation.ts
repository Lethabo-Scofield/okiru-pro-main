/**
 * The validation layer — the expert's auditor tests, run against the evidence.
 *
 * The matrix does not only say WHICH documents a verification needs; for each
 * one it says what the auditor actually tests. For an ID copy that is:
 *
 *   "Auditor checks ID number for SA citizenship, inspects the photo to match
 *    the person, and confirms the document is original or a certified copy
 *    dated within 3 months."
 *
 * Those sentences are the difference between "we read a document" and "this
 * evidence would survive verification". A certificate that expired last month
 * extracts perfectly and is still worthless.
 *
 * WHY AI AND NOT RULES: the tests are prose written for humans, and they turn on
 * judgements ("photo matches the person", "signed by a commissioner of oaths")
 * that no regex expresses. Encoding 109 documents' worth of prose as rules would
 * be guesswork; asking the model to check the expert's own words is not.
 *
 * SAFETY — this layer is ADVISORY. It raises flags for a human; it never edits a
 * value, never changes the calculator payload, and never blocks an upload. The
 * worst case is a finding that turns out to be wrong, which a reviewer dismisses.
 * A validator that could silently drop evidence would be far more dangerous than
 * one that occasionally over-flags.
 */
import { createLogger } from '../logger.js';
import type { ExtractionModel } from './aiExtraction.js';
import { findDocumentById } from '../../schemas/verification_document_matrix.js';

const logger = createLogger('AuditorValidation');

/** Keep the prompt bounded — the tests judge the document, not its every page. */
const MAX_VALIDATION_CHARS = Number(process.env.AI_VALIDATION_MAX_CHARS ?? 24_000);

export type AuditorVerdict = 'pass' | 'fail' | 'cannot_tell';

export interface AuditorFinding {
  /** The auditor test being applied, in the expert's wording. */
  test: string;
  verdict: AuditorVerdict;
  /** What in the document supports the verdict. Quoted, never paraphrased away. */
  evidence: string;
  /** What the user should do about it. Empty when the test passed. */
  remedy: string;
}

export interface DocumentValidation {
  documentId: string;
  documentName: string;
  sourceFile: string;
  findings: AuditorFinding[];
  /** True when at least one test failed — the document needs attention. */
  requiresAttention: boolean;
}

const SYSTEM_PROMPT = [
  'You are a South African B-BBEE verification auditor reviewing a single piece of evidence.',
  'You are given the auditor tests for this document type and the document itself.',
  '',
  'For EACH test, return a verdict:',
  '  "pass"        — the document visibly satisfies the test.',
  '  "fail"        — the document visibly does NOT satisfy it (expired, unsigned, wrong entity, missing detail).',
  '  "cannot_tell" — the document does not contain what the test needs, or it is illegible.',
  '',
  'Rules:',
  '- Judge ONLY what is present. Never assume a missing signature, date or stamp is fine.',
  '- "cannot_tell" is the correct, honest answer when the evidence is absent. Do not guess "pass".',
  '- Quote the text you relied on in `evidence`, verbatim and short. If nothing supports it, say what is absent.',
  '- `remedy` tells the user what to supply or fix. Leave it empty for a pass.',
  '',
  'Return ONLY JSON: {"findings":[{"test":"...","verdict":"pass|fail|cannot_tell","evidence":"...","remedy":"..."}]}',
].join('\n');

/**
 * Split the expert's prose into individual testable statements.
 *
 * The auditorTests cell is one paragraph describing several checks. Sentence
 * splitting is crude but honest: the model sees the whole paragraph as context
 * regardless, and this only shapes how findings are reported back.
 */
export function splitAuditorTests(auditorTests: string): string[] {
  return auditorTests
    .split(/(?<=\.)\s+(?=[A-Z])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 15);
}

function parseFindings(raw: string): AuditorFinding[] {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return [];

  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as { findings?: unknown };
    if (!Array.isArray(parsed.findings)) return [];

    return parsed.findings.flatMap((entry): AuditorFinding[] => {
      if (!entry || typeof entry !== 'object') return [];
      const row = entry as Record<string, unknown>;
      const verdict = String(row.verdict ?? '').toLowerCase();
      // An unrecognised verdict becomes cannot_tell: an unreadable answer must
      // never be recorded as a pass.
      const safeVerdict: AuditorVerdict =
        verdict === 'pass' || verdict === 'fail' ? verdict : 'cannot_tell';
      const test = String(row.test ?? '').trim();
      if (!test) return [];
      return [{
        test,
        verdict: safeVerdict,
        evidence: String(row.evidence ?? '').trim().slice(0, 400),
        remedy: safeVerdict === 'pass' ? '' : String(row.remedy ?? '').trim().slice(0, 300),
      }];
    });
  } catch {
    return [];
  }
}

/**
 * Run the auditor tests for one document. Returns null when there is nothing to
 * check or the model is unavailable — validation is advisory, so its absence is
 * never an error.
 */
export async function validateDocument(
  documentId: string,
  sourceFile: string,
  documentText: string,
  model: ExtractionModel,
): Promise<DocumentValidation | null> {
  const spec = findDocumentById(documentId);
  if (!spec || !spec.auditorTests.trim()) return null;

  const tests = splitAuditorTests(spec.auditorTests);
  if (tests.length === 0) return null;

  const user = [
    `DOCUMENT TYPE: ${spec.name}`,
    '',
    'AUDITOR TESTS (evaluate each one):',
    ...tests.map((test, index) => `${index + 1}. ${test}`),
    '',
    'DOCUMENT:',
    documentText.slice(0, MAX_VALIDATION_CHARS),
  ].join('\n');

  try {
    const raw = await model.complete(SYSTEM_PROMPT, user);
    const findings = parseFindings(raw);
    if (findings.length === 0) return null;

    const validation: DocumentValidation = {
      documentId,
      documentName: spec.name,
      sourceFile,
      findings,
      requiresAttention: findings.some((finding) => finding.verdict === 'fail'),
    };

    logger.info('Auditor validation complete', {
      documentId,
      sourceFile,
      tests: findings.length,
      failed: findings.filter((f) => f.verdict === 'fail').length,
      unknown: findings.filter((f) => f.verdict === 'cannot_tell').length,
    });

    return validation;
  } catch (err) {
    logger.warn('Auditor validation failed — continuing without it', {
      documentId,
      sourceFile,
      reason: (err as Error).message,
    });
    return null;
  }
}

export interface CaseValidation {
  documents: DocumentValidation[];
  /** Every failed test across the case, for the review screen. */
  failures: Array<{ sourceFile: string; documentName: string; test: string; remedy: string }>;
  /** Tests that could not be judged — usually evidence that is simply absent. */
  unresolved: Array<{ sourceFile: string; documentName: string; test: string }>;
}

/** Validate every document that produced values, in parallel. */
export async function validateCase(
  extractions: Array<{ documentId: string; sourceFile: string; values: unknown[] }>,
  textByFile: Map<string, string>,
  model: ExtractionModel,
): Promise<CaseValidation> {
  const candidates = extractions.filter((extraction) => extraction.values.length > 0);

  const results = await Promise.all(candidates.map((extraction) =>
    validateDocument(
      extraction.documentId,
      extraction.sourceFile,
      textByFile.get(extraction.sourceFile) ?? '',
      model,
    )));

  const documents = results.filter((result): result is DocumentValidation => result !== null);

  return {
    documents,
    failures: documents.flatMap((doc) => doc.findings
      .filter((finding) => finding.verdict === 'fail')
      .map((finding) => ({
        sourceFile: doc.sourceFile,
        documentName: doc.documentName,
        test: finding.test,
        remedy: finding.remedy,
      }))),
    unresolved: documents.flatMap((doc) => doc.findings
      .filter((finding) => finding.verdict === 'cannot_tell')
      .map((finding) => ({
        sourceFile: doc.sourceFile,
        documentName: doc.documentName,
        test: finding.test,
      }))),
  };
}
