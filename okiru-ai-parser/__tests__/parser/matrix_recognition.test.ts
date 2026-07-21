/**
 * Recognition against the expert's document matrix.
 *
 * The parser knew 7 document types; a verification asks for 109. Real client
 * folders therefore classified almost entirely as "unsupported / low confidence",
 * which the service reports as a hard failure — the user uploads good evidence
 * and gets nothing back.
 *
 * These fixtures are shaped after documents in the real Thandanani Transport
 * folder (docs/testdocs/Thandanani Transport) and the matrix's own worked
 * examples.
 */
import { describe, expect, it } from 'vitest';
import { classifyDocument } from '../../parser/classify_document.js';
import { InMemoryOntologyRepository } from '../../graph/ontology_queries.js';
import {
  VERIFICATION_DOCUMENT_MATRIX,
  documentsForElement,
  aliasIndex,
} from '../../schemas/verification_document_matrix.js';
import { extractionSpecFor } from '../../graph/matrix_ontology.js';

const repo = new InMemoryOntologyRepository();

async function classify(filename: string, raw_text: string) {
  return classifyDocument({ file_id: 'f', filename, raw_text, kind: 'text' } as never, repo);
}

describe('verification document matrix', () => {
  it('carries all 109 documents with an extraction prompt and output schema', () => {
    expect(VERIFICATION_DOCUMENT_MATRIX).toHaveLength(109);

    for (const doc of VERIFICATION_DOCUMENT_MATRIX) {
      expect(doc.extractionPrompt.length, `${doc.name} has no prompt`).toBeGreaterThan(40);
      expect(doc.expectedFields.length, `${doc.name} has no output schema`).toBeGreaterThan(0);
      expect(doc.auditorTests.length, `${doc.name} has no auditor test`).toBeGreaterThan(20);
    }
  });

  it('covers every element a verification measures', () => {
    expect(documentsForElement('OWNERSHIP')).toHaveLength(32);
    expect(documentsForElement('MANAGEMENT_CONTROL')).toHaveLength(17);
    expect(documentsForElement('SKILLS_DEVELOPMENT')).toHaveLength(20);
    expect(documentsForElement('ESD')).toHaveLength(27);
    expect(documentsForElement('SED')).toHaveLength(13);
  });

  it('indexes aliases longest-first so a specific document beats a generic one', () => {
    const index = aliasIndex();
    for (let i = 1; i < index.length; i += 1) {
      expect(index[i - 1].alias.length).toBeGreaterThanOrEqual(index[i].alias.length);
    }
  });

  it('extracts statutory form codes as aliases — the text that is actually in the document', () => {
    // A COR14.3 does not say "CIPC registration documents" anywhere on it.
    const cipc = VERIFICATION_DOCUMENT_MATRIX.find((d) => d.name.includes('COR14.1'))!;
    expect(cipc.aliases).toContain('COR14.3');

    const eea2 = VERIFICATION_DOCUMENT_MATRIX.find((d) => d.name.startsWith('EEA2'))!;
    expect(eea2.aliases).toContain('EEA2');
  });
});

describe('the parser now recognises documents it previously could not', () => {
  // Each of these would have classified as unsupported/low-confidence before the
  // matrix merge, and been returned to the user as a failed document.
  const realDocuments: Array<[string, string, string]> = [
    [
      'CIPC registration',
      'Thandanani_COR14.3.pdf',
      'COR14.3 Registration Certificate\nThandanani Packers & Haulers cc\nRegistration Number 2006/037260/23\nDate of incorporation 2006-11-14',
    ],
    [
      'EEA2 employment equity report',
      'EEA2_2025.pdf',
      'EEA2 Employment Equity Report submitted to the Department of Labour\nReporting period 2025\nOccupational levels by race and gender',
    ],
    [
      'EMP201 SDL declarations',
      'EMP201_Mar2025.pdf',
      'SARS EMP201 Monthly Employer Declaration\nPAYE, UIF and SDL\nLeviable amount for the period',
    ],
    [
      'share register',
      'Thandanani Share Register.pdf',
      'Securities register / share register as at 28 February 2026\nTotal shares in issue: 100\nShareholder holdings and share classes',
    ],
    [
      'management representation letter',
      'Final_Management_Representation_Letters.pdf',
      'Management representation letter confirming no undisclosed acquisition debt or options over the equity of the measured entity',
    ],
  ];

  for (const [label, filename, text] of realDocuments) {
    it(`recognises a ${label}`, async () => {
      const result = await classify(filename, text);

      // The bar is recognition: not 'unsupported', and confident enough that the
      // service does not report it as a failed document.
      expect(result.status, `${label} → ${result.document_type} @ ${result.confidence}`).not.toBe('unsupported');
      expect(result.status, `${label} → ${result.document_type} @ ${result.confidence}`).not.toBe('low_confidence');
      expect(result.document_type).not.toBe('Unsupported');
    });
  }

  it('keeps the canonical B-BBEE certificate — matrix entries must not steal calculator-bearing types', async () => {
    // This type owns the supplier.* calculator keys. If a matrix entry outranked
    // it, certificates would still classify but stop producing a payload.
    const result = await classify('cert.pdf', [
      'B-BBEE STATUS LEVEL VERIFICATION CERTIFICATE',
      'Issued to: Acme Trading (Pty) Ltd',
      'B-BBEE Status Level: Level 4 Contributor',
      'Black Ownership: 32.15%',
      'Expiry Date: 14 March 2027',
    ].join('\n'));

    expect(result.document_type).toBe('B-BBEE Certificate');
  });
});

describe('extraction specs are reachable for the AI path', () => {
  it('returns the expert prompt and schema for a document type', () => {
    const spec = extractionSpecFor('SETA registration certificate');

    expect(spec).not.toBeNull();
    expect(spec!.extractionPrompt).toMatch(/Return JSON/i);
    expect(spec!.expectedFields).toContain('entity_name');
    expect(spec!.expectedFields).toContain('seta_name');
  });

  it('resolves by alias as well as by name', () => {
    expect(extractionSpecFor('EEA2')?.name).toMatch(/^EEA2/);
  });

  it('returns null for a document outside the matrix rather than guessing', () => {
    expect(extractionSpecFor('a lunch menu')).toBeNull();
  });
});
