import { describe, expect, it } from 'vitest';
import { InMemoryOntologyRepository } from '../../graph/ontology_queries.js';
import type { DocumentKnowledge } from '../../graph/ontology_models.js';
import { classifyDocument } from '../../parser/classify_document.js';
import { ParserService } from '../../parser/parser_service.js';

function rawText(raw_text: string) {
  return {
    file_id: 'doc_classifier',
    filename: 'evidence.txt',
    mime_type: 'text/plain',
    raw_text,
    tables: [],
    metadata: {},
  };
}

function customRepository(seed: DocumentKnowledge[]): InMemoryOntologyRepository {
  return new InMemoryOntologyRepository(seed);
}

const graphVersion = 'test';

/**
 * Two deliberately near-identical types, used to exercise the "too close to
 * call" branch.
 *
 * The names are fictional on purpose. classifyDocument always merges the
 * canonical ontology over whatever the repository returns, so a fixture named
 * after a real document (these were once "CIPC COR39…" and "CIPC registration
 * documents…") is silently shadowed by the real entry once that document exists
 * in the ontology — and the test stops exercising its own fixture.
 */
const ambiguousDocs: DocumentKnowledge[] = [
  {
    document: {
      name: 'Testco Form AA — certificate of director amendments',
      aliases: ['Form AA director amendments'],
      description: 'Current directors appointment resignation active director list',
      required: true,
      pillar_code: 'OWNERSHIP',
      graph_version: graphVersion,
    },
    fields: [],
  },
  {
    document: {
      name: 'Testco Form AB — registration documents',
      aliases: ['Form AB registration'],
      description: 'Company registration entity registration number directors',
      required: true,
      pillar_code: 'OWNERSHIP',
      graph_version: graphVersion,
    },
    fields: [],
  },
];

describe('document type classification', () => {
  it('classifies a clear B-BBEE certificate and exposes candidates', async () => {
    const result = await classifyDocument(rawText([
      'B-BBEE Certificate',
      'Enterprise Name: ABC Suppliers Pty Ltd',
      'B-BBEE Status Level: Level Two',
      'Black Ownership: 51%',
      'Expiry Date: 01 Feb 2027',
    ].join('\n')), new InMemoryOntologyRepository());

    expect(result.status).toBe('classified');
    expect(result.document_type).toBe('B-BBEE Certificate');
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    expect(result.candidates?.[0].document_type).toBe('B-BBEE Certificate');
    expect(result.reason).toContain('sufficient confidence');
  });

  it('keeps canonical B-BBEE certificate classification when repository contains noisy ontology records', async () => {
    const result = await classifyDocument(rawText([
      'B-BBEE CERTIFICATE',
      'Enterprise Name: ABC Suppliers Pty Ltd',
      'Registration Number: 2020/123456/07',
      'B-BBEE Status Level: Level Two',
      'Black Ownership: 51%',
      'Expiry Date: 01 Feb 2027',
    ].join('\n')), customRepository(ambiguousDocs));

    expect(result.status).toBe('classified');
    expect(result.document_type).toBe('B-BBEE Certificate');
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('uses canonical fallback knowledge when the primary repository lacks the classified document', async () => {
    const service = new ParserService(customRepository(ambiguousDocs));
    const result = await service.resolve(rawText([
      'B-BBEE CERTIFICATE',
      'Enterprise Name: ABC Suppliers Pty Ltd',
      'B-BBEE Status Level: Level Two',
      'Black Ownership: 51%',
      'Expiry Date: 01 Feb 2027',
    ].join('\n')));

    expect(result.status).toBe('passed');
    expect(result.document_type).toBe('B-BBEE Certificate');
    expect(result.calculator_payload).toEqual({
      'supplier.name': 'ABC Suppliers Pty Ltd',
      'supplier.bee_level': 2,
      'supplier.black_ownership': 51,
      'supplier.certificate_expiry': '2027-02-01',
    });
  });

  it('does not infer expiry date from issue date when expiry label is missing', async () => {
    const service = new ParserService();
    const result = await service.resolve(rawText([
      'B-BBEE CERTIFICATE',
      'Enterprise Name: Missing Expiry Suppliers Pty Ltd',
      'B-BBEE Status Level: Level 3',
      'Black Ownership: 45%',
      'Issue Date: 01 Mar 2026',
    ].join('\n')));

    expect(result.status).toBe('review_required');
    expect(result.extracted_fields.expiry_date?.normalized_value).toBeNull();
    expect(result.validation.missing_fields).toContain('expiry_date');
    expect(result.calculator_payload).not.toHaveProperty('supplier.certificate_expiry');
  });

  it('marks close document-type candidates as ambiguous', async () => {
    const result = await classifyDocument(rawText([
      'Testco document',
      'Form AA director amendments',
      'Form AB registration',
      'Registration number 2018/123456/07',
      'Director list active directors registration amendments',
    ].join('\n')), customRepository(ambiguousDocs));

    expect(result.status).toBe('ambiguous');
    const topCandidateText = result.candidates?.slice(0, 2).map((candidate) => candidate.document_type).join('\n') ?? '';
    expect(topCandidateText).toContain('Testco Form AA');
    expect(topCandidateText).toContain('Testco Form AB');
    expect(result.reason).toContain('too close');
  });

  it('does not extract or map calculator payload when classification is ambiguous', async () => {
    const service = new ParserService(customRepository(ambiguousDocs));
    const result = await service.resolve(rawText([
      'Testco document',
      'Form AA director amendments',
      'Form AB registration',
      'Registration number 2018/123456/07',
      'Director list active directors registration amendments',
    ].join('\n')));

    expect(result.status).toBe('review_required');
    expect(result.extracted_fields).toEqual({});
    expect(result.calculator_payload).toEqual({});
    expect(result.audit_trail.requires_human_review).toBe(true);
    expect(result.audit_trail.classification_candidates.length).toBeGreaterThan(1);
  });

  it('fails unsupported uploads with low confidence', async () => {
    const result = await classifyDocument(rawText('random lunch receipt with no B-BBEE evidence'), new InMemoryOntologyRepository());

    expect(result.status).toBe('low_confidence');
    expect(result.confidence).toBeLessThan(0.6);
  });
});

describe('workbook sheet name is authoritative for the element', () => {
  it('classifies a "Procurement" sheet to the ESD pillar, not an affidavit', async () => {
    // A supplier-schedule sheet's CONTENT (supplier names, spend, BEE levels)
    // matched the generic B-BBEE vocabulary and scored as a Sworn Affidavit,
    // so a "Procurement" sheet failed classification. The sheet NAME fixes it.
    const input = {
      file_id: 'sheet_proc',
      filename: 'BEE Information Gathering File - Thandanani Transport.xlsx › Procurement',
      mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      raw_text: [
        'Supplier Name  B-BBEE Level  Spend (excl VAT)  Empowering Supplier',
        'BP Edenvale  Level 1  1454114  Yes',
        'Safety Brake & Clutch  Level 2  14033  Yes',
        'Eden Machined Hydraulics  Level 4  88200  No',
      ].join('\n'),
      tables: [],
      metadata: { sheet_name: 'Procurement' },
    };
    const result = await classifyDocument(input, new InMemoryOntologyRepository());
    expect(result.pillar).toBe('ESD');
    expect(/affidavit/i.test(result.document_type)).toBe(false);
    // Sheet-name authority lifts it out of the "unreadable" band.
    expect(result.status).not.toBe('failed');
    expect(result.status).not.toBe('low_confidence');
  });

  it('classifies an "Ownership" sheet to the OWN pillar', async () => {
    const input = {
      file_id: 'sheet_own',
      filename: 'BEE Information Gathering File.xlsx › Ownership',
      mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      raw_text: 'Shareholder  ID Number  Voting %  Economic Interest %\nV L Naidoo  5608305112083  100  100',
      tables: [],
      metadata: { sheet_name: 'Ownership' },
    };
    const result = await classifyDocument(input, new InMemoryOntologyRepository());
    expect(result.pillar).toBe('OWN');
  });
});
