/**
 * A reader that AGREES with a confident pick confirms it; it does not re-grade it.
 *
 * A pick the lexical classifier made with confidence, but on a label only (an
 * alias or the filename), is sent to the adjudicator as a second look. When
 * the adjudicator names the SAME type, that is a confirmation. It used to
 * replace the pick's confidence with the reader's own, so a reader that agreed
 * at 0.6 turned a 'classified' document into 'ambiguous' and cost it the
 * calculator payload it had already earned. A reader that names a DIFFERENT
 * type still decides as before.
 *
 * The lexical classification is fixed here (classifyDocument is stubbed) so the
 * test pins the settling rule itself, not keyword scores.
 */
import { describe, expect, it, vi } from 'vitest';
import type { DocumentClassification } from '../../schemas/document_types.js';

const CERTIFICATE = 'B-BBEE Certificate';
const AFFIDAVIT = 'B-BBEE Sworn Affidavit';

let lexical: DocumentClassification;

vi.mock('../../parser/classify_document.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../parser/classify_document.js')>();
  return { ...actual, classifyDocument: vi.fn(async () => lexical) };
});

const { ParserService } = await import('../../parser/parser_service.js');

const INPUT = {
  file_id: 'doc_agree',
  filename: 'supplier_certificate.pdf',
  mime_type: 'application/pdf',
  raw_text: [
    'B-BBEE Certificate',
    'Enterprise Name: Acme Suppliers (Pty) Ltd',
    'B-BBEE Status Level: Level Two',
    'Black Ownership: 51%',
    'Expiry Date: 01 Feb 2027',
  ].join('\n'),
  tables: [],
  metadata: {},
};

function labelOnlyPick(status: DocumentClassification['status'] = 'classified', confidence = 0.9): DocumentClassification {
  const candidates = [
    { document_type: CERTIFICATE, pillar: 'PP', confidence, matched_evidence: [CERTIFICATE], reasons: [], evidence_basis: 'alias' as const },
    { document_type: AFFIDAVIT, pillar: 'PP', confidence: 0.4, matched_evidence: [], reasons: [], evidence_basis: 'alias' as const },
  ];
  return {
    document_type: CERTIFICATE,
    pillar: 'PP',
    confidence,
    matched_evidence: [CERTIFICATE],
    candidates,
    ranked: candidates,
    status,
    margin: confidence - 0.4,
    reason: 'Document type classified with sufficient confidence and margin',
  };
}

describe('a reader that agrees with a confident label-only pick', () => {
  it('keeps the pick\'s status, confidence and calculator payload', async () => {
    lexical = labelOnlyPick();
    const adjudicator = vi.fn(async () => ({ documentType: CERTIFICATE, confidence: 0.6, reason: 'a supplier certificate' }));
    const result = await new ParserService(undefined, { adjudicator }).resolve(INPUT);

    expect(adjudicator).toHaveBeenCalledTimes(1);
    expect(result.document_type).toBe(CERTIFICATE);
    expect(result.overall_confidence).toBeCloseTo(0.9, 5);
    expect(result.status).toBe('passed');
    expect(result.calculator_payload['supplier.name']).toBe('Acme Suppliers (Pty) Ltd');
    expect(result.audit_trail.classification_reason).toMatch(/confirmed/i);
  });

  it('still lets a reader that names a different type decide', async () => {
    lexical = labelOnlyPick();
    const adjudicator = vi.fn(async () => ({ documentType: AFFIDAVIT, confidence: 0.6, reason: 'an affidavit' }));
    const result = await new ParserService(undefined, { adjudicator }).resolve(INPUT);
    expect(result.document_type).toBe(AFFIDAVIT);
    expect(result.status).not.toBe('passed');
  });

  it('still takes the reader\'s confidence when the pick was undecided', async () => {
    lexical = labelOnlyPick('ambiguous', 0.7);
    const adjudicator = vi.fn(async () => ({ documentType: CERTIFICATE, confidence: 0.6, reason: 'probably a certificate' }));
    const result = await new ParserService(undefined, { adjudicator }).resolve(INPUT);
    expect(result.overall_confidence).toBeCloseTo(0.6, 5);
    expect(result.status).toBe('review_required');
  });

  it('is never asked about a confident pick that rests on content', async () => {
    lexical = { ...labelOnlyPick(), candidates: labelOnlyPick().candidates!.map((c) => ({ ...c, evidence_basis: 'content' as const })) };
    const adjudicator = vi.fn(async () => ({ documentType: CERTIFICATE, confidence: 0.6, reason: 'x' }));
    const result = await new ParserService(undefined, { adjudicator }).resolve(INPUT);
    expect(adjudicator).not.toHaveBeenCalled();
    expect(result.status).toBe('passed');
  });
});
