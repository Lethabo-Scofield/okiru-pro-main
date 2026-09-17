/**
 * The two halves of "a low keyword score must never bin a document":
 *
 *   1. ParserService no longer discards a low-confidence classification — it
 *      extracts under the best candidate and carries the doubt as a warning.
 *   2. When a reader (adjudicator) is available, an undecided classification is
 *      settled from the lexical SHORTLIST by purpose, and the result — type,
 *      confidence, status — comes from that verdict.
 *
 * Measured motivation: on a real evidence pack every SETA certificate, EEA1
 * declaration, supplier affidavit and graduation invoice came back `failed`
 * with zero fields, and in all of them the classifier's top pick was already
 * the correct type — scored 0.11–0.56 by keyword overlap.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ParserService } from '../../parser/parser_service.js';
import type { DocumentTypeAdjudicator } from '../../parser/type_adjudicator.js';
import {
  adjudicateDocumentType,
  describeCandidates,
  resetAdjudicationCacheForTest,
} from '../../src/services/documentTypeAdjudication.js';
import type { ExtractionModel } from '../../src/services/aiExtraction.js';

/** A SETA certificate as a scanner renders it — no title token the keyword scorer loves. */
const SETA_INPUT = {
  file_id: 'doc_seta',
  filename: 'scan_0417.pdf',
  mime_type: 'application/pdf',
  raw_text: [
    'Sector Education and Training Authority',
    'This is to certify that the employer below is registered.',
    'Entity name: Acme Holdings (Pty) Ltd',
    'SARS SDL number: L470012345',
    'SETA name: BANKSETA',
    'Registration date: 12 April 2018',
    'Current status: current',
  ].join('\n'),
  tables: [],
  metadata: {},
};

describe('ParserService — a low keyword score no longer discards the document', () => {
  it('extracts under the best candidate and flags the doubt instead of failing with nothing', async () => {
    const service = new ParserService();
    const result = await service.resolve(SETA_INPUT);

    // Whatever the lexical score, the document is READ, not binned.
    expect(result.status).not.toBe('failed');
    expect(result.document_type).toBe('SETA registration certificate');
    // The doubt is visible — as a warning, alongside whatever was extracted.
    expect(result.validation.warnings.join(' ')).toMatch(/confidence|review/i);
    // The label-regex fallback lands the declared fields the scan states.
    expect(Object.keys(result.extracted_fields)).toEqual(
      expect.arrayContaining(['entity_name', 'sars_sdl_number', 'seta_name']),
    );
  });
});

/**
 * A poor scan with no title: the keyword scorer has almost nothing to go on,
 * so it cannot decide — exactly the case the reader exists for.
 */
const UNDECIDED_INPUT = {
  file_id: 'doc_scan',
  filename: 'scan_0418.pdf',
  mime_type: 'application/pdf',
  raw_text: [
    'Entity name: Acme Holdings (Pty) Ltd',
    'Reference: L470012345',
    'Registered on 12 April 2018',
    'Signed by the authorised officer.',
  ].join('\n'),
  tables: [],
  metadata: {},
};

describe('ParserService — adjudication settles what the keyword scorer could not', () => {
  it('adopts the adjudicated type, confidence and reason from the lexical shortlist', async () => {
    let offered: string[] = [];
    let chosen = '';
    const adjudicator: DocumentTypeAdjudicator = vi.fn(async (_input, candidates: Array<{ name: string }>) => {
      // The reader is only ever offered types the classifier shortlisted —
      // and it may pick one the scorer did NOT rank first.
      offered = candidates.map((c) => c.name);
      chosen = offered[offered.length - 1];
      return { documentType: chosen, confidence: 0.92, reason: 'Names the SETA and an SDL number' };
    });
    const baseline = await new ParserService().resolve(UNDECIDED_INPUT);
    const service = new ParserService(undefined, { adjudicator });
    const result = await service.resolve(UNDECIDED_INPUT);

    expect(adjudicator).toHaveBeenCalledTimes(1);
    expect(offered.length).toBeGreaterThan(1);
    expect(offered[0]).toBe(baseline.document_type); // the scorer's own pick led the shortlist
    expect(result.document_type).toBe(chosen); // the reader's verdict won
    expect(result.overall_confidence).toBe(0.92);
    expect(result.audit_trail.classification_reason).toMatch(new RegExp(`Read as ${chosen.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    expect(result.audit_trail.classification_reason).toMatch(/SDL number/);
  });

  it('keeps the lexical decision when the reader declines (null) or names a type off the shortlist', async () => {
    const declined = new ParserService(undefined, { adjudicator: async () => null });
    const offList = new ParserService(undefined, {
      adjudicator: async () => ({ documentType: 'Not A Real Type', confidence: 0.99, reason: 'x' }),
    });
    const baseline = await new ParserService().resolve(UNDECIDED_INPUT);

    for (const service of [declined, offList]) {
      const result = await service.resolve(UNDECIDED_INPUT);
      expect(result.document_type).toBe(baseline.document_type);
      expect(result.overall_confidence).toBe(baseline.overall_confidence);
    }
  });

  it('never lets a reader failure take the document down — the lexical result stands', async () => {
    const baseline = await new ParserService().resolve(UNDECIDED_INPUT);
    const service = new ParserService(undefined, {
      adjudicator: async () => { throw new Error('model unavailable'); },
    });
    const result = await service.resolve(UNDECIDED_INPUT);
    expect(result.document_type).toBe(baseline.document_type);
    expect(result.status).toBe(baseline.status);
  });

  it('still reads nothing out of a document it cannot identify and that labels nothing', async () => {
    const result = await new ParserService().resolve({
      file_id: 'doc_menu',
      filename: 'lunch_menu.txt',
      mime_type: 'text/plain',
      raw_text: 'Lunch Menu\nChicken sandwich: R85\nOrange juice: R30\nToday only: free delivery for orders above R250',
      tables: [],
      metadata: {},
    });
    // Junk stays junk: no heuristic "beneficiary" read out of a menu.
    expect(result.status).toBe('failed');
    expect(result.extracted_fields).toEqual({});
  });

  it('does not second-guess a confident lexical classification', async () => {
    const adjudicator = vi.fn(async () => null);
    const service = new ParserService(undefined, { adjudicator });
    const result = await service.resolve({
      file_id: 'doc_cert',
      filename: 'supplier_certificate.pdf',
      mime_type: 'application/pdf',
      raw_text: [
        'B-BBEE Certificate',
        'Enterprise Name: ABC Suppliers Pty Ltd',
        'B-BBEE Status Level: Level Two',
        'Black Ownership: 51%',
        'Expiry Date: 01 Feb 2027',
      ].join('\n'),
      tables: [],
      metadata: { source: 'upload' },
    });
    expect(result.status).toBe('passed');
    expect(adjudicator).not.toHaveBeenCalled();
  });
});

describe('adjudicateDocumentType — the model chooses from a closed menu, by purpose', () => {
  const fakeModel = (reply: string): ExtractionModel => ({ name: 'fake', complete: vi.fn(async () => reply) });
  const candidates = [
    { name: 'Memorandum of Incorporation (MOI)', pillar: 'OWN', lexicalConfidence: 0.41, description: 'Memorandum of Incorporation (MOI)', expectedFields: [] },
    { name: 'Ownership Confirmation', pillar: 'OWN', lexicalConfidence: 0.39, description: 'Ownership Confirmation', expectedFields: [] },
  ];
  const input = {
    filename: 'moi.pdf',
    raw_text: 'MEMORANDUM OF INCORPORATION of Acme (Pty) Ltd adopted in terms of the Companies Act, 2008. Article 3: Share classes. Article 7: Powers of directors.',
  };

  beforeEach(() => resetAdjudicationCacheForTest());

  it('is briefed on what each candidate is FOR, from the matrix, not just its name', () => {
    const described = describeCandidates(candidates);
    const moi = described.find((c) => c.name.startsWith('Memorandum'));
    // The matrix's auditor test replaces a name-only description.
    expect(moi?.description).not.toBe('Memorandum of Incorporation (MOI)');
    expect(moi?.description.length).toBeGreaterThan(40);
  });

  it('adopts a confident verdict for a shortlisted type', async () => {
    const model = fakeModel('{"document_type":"Memorandum of Incorporation (MOI)","confidence":0.93,"reason":"Adopted under the Companies Act with share-class articles"}');
    const verdict = await adjudicateDocumentType(model, input, candidates);
    expect(verdict).toEqual({
      documentType: 'Memorandum of Incorporation (MOI)',
      confidence: 0.93,
      reason: 'Adopted under the Companies Act with share-class articles',
    });
    // The brief names purposes, so the model can distinguish look-alikes.
    const [, user] = (model.complete as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(user)).toMatch(/For:/);
    expect(String(user)).toMatch(/Ownership Confirmation/);
  });

  it('declines on NONE, on a guess below the floor, and on a name that is not on the menu', async () => {
    expect(await adjudicateDocumentType(fakeModel('{"document_type":"NONE","confidence":0.9}'), input, candidates)).toBeNull();
    resetAdjudicationCacheForTest();
    expect(await adjudicateDocumentType(fakeModel('{"document_type":"Ownership Confirmation","confidence":0.4}'), input, candidates)).toBeNull();
    resetAdjudicationCacheForTest();
    expect(await adjudicateDocumentType(fakeModel('{"document_type":"Share Register","confidence":0.95}'), input, candidates)).toBeNull();
  });

  it('survives a model failure as a null, never a throw', async () => {
    const model: ExtractionModel = { name: 'down', complete: vi.fn(async () => { throw new Error('429'); }) };
    await expect(adjudicateDocumentType(model, input, candidates)).resolves.toBeNull();
  });
});
