/**
 * Entity → calculator mapping.
 *
 * This is the step where extracted text becomes a number on a B-BBEE
 * certificate, so the tests are mostly about what must NOT happen: no inferred
 * mappings, no contested value scored, no un-allowlisted key, no lost provenance.
 */
import { describe, expect, it } from 'vitest';
import {
  mapEntitiesToCalculator,
  fieldElementIndex,
} from '../../src/services/entityCalculatorMapping.js';
import { resolveCaseEntities } from '../../src/services/entityResolution.js';
import type { DocumentExtraction } from '../../src/services/aiExtraction.js';
import { isAllowedCalculatorKey } from '../../schemas/calculator_allowlist.js';
import { VERIFICATION_DOCUMENT_MATRIX, type VerificationElement } from '../../schemas/verification_document_matrix.js';

/** A real matrix document id for a given element, so elements resolve honestly. */
function docIdFor(element: VerificationElement): string {
  return VERIFICATION_DOCUMENT_MATRIX.find((doc) => doc.element === element)!.id;
}

function extraction(
  element: VerificationElement,
  sourceFile: string,
  values: Array<[string, unknown]>,
): DocumentExtraction {
  const documentId = docIdFor(element);
  return {
    documentId,
    documentName: documentId,
    sourceFile,
    values: values.map(([field, value]) => ({ field, value, sourceFile, sourceDocumentId: documentId })),
    missingFields: [],
    unexpectedFields: [],
    exceptions: [],
  };
}

function mapFrom(extractions: DocumentExtraction[]) {
  const entities = resolveCaseEntities(extractions);
  return mapEntitiesToCalculator(entities, fieldElementIndex(extractions));
}

describe('mapping produces a calculator payload', () => {
  it('maps ownership evidence onto allowlisted keys', () => {
    const result = mapFrom([
      extraction('OWNERSHIP', 'cipc.pdf', [
        ['entity_name', 'Thandanani Packers & Haulers cc'],
        ['black_ownership', '100%'],
        ['black_women_ownership', '0%'],
      ]),
    ]);

    expect(result.payload['ownership.entity_name']).toBe('Thandanani Packers & Haulers cc');
    expect(result.payload['ownership.black_ownership']).toBe(100);
    expect(result.payload['ownership.black_women_ownership']).toBe(0);
  });

  it('keeps provenance for every mapped key', () => {
    const result = mapFrom([
      extraction('OWNERSHIP', 'cipc.pdf', [['entity_name', 'Acme Trading']]),
    ]);

    const entry = result.entries.find((e) => e.key === 'ownership.entity_name')!;
    expect(entry.sourceFiles).toEqual(['cipc.pdf']);
    expect(entry.sourceField).toBe('entity_name');
    // Anything that reaches a scorecard must be traceable to a file.
    expect(result.entries.every((e) => e.sourceFiles.length > 0)).toBe(true);
  });

  it('only ever emits allowlisted keys', () => {
    const result = mapFrom([
      extraction('OWNERSHIP', 'a.pdf', [['entity_name', 'Acme'], ['black_ownership', 51]]),
      extraction('SED', 'b.pdf', [['beneficiary_name', 'Rural Schools Trust']]),
    ]);

    for (const key of Object.keys(result.payload)) {
      expect(isAllowedCalculatorKey(key), `not allowlisted: ${key}`).toBe(true);
    }
  });
});

describe('normalising values as they appear in real documents', () => {
  it('reads money written the South African way', () => {
    const result = mapFrom([
      extraction('SED', 'sed.pdf', [['contribution_amount', 'R 356 010']]),
    ]);
    expect(result.payload['sed.contribution']).toBe(356010);
  });

  it('reads bracketed negatives from financial statements', () => {
    const result = mapFrom([
      extraction('SED', 'afs.pdf', [['contribution_amount', '(4 157 140)']]),
    ]);
    expect(result.payload['sed.contribution']).toBe(-4157140);
  });

  it('treats a sub-1 ratio as the percentage it represents', () => {
    // Spreadsheets store 32.15% as 0.3215.
    const result = mapFrom([
      extraction('OWNERSHIP', 'sheet.xlsx', [['black_ownership', 0.3215]]),
    ]);
    expect(result.payload['ownership.black_ownership']).toBe(32.15);
  });

  it('reads dates day-first, as South African documents write them', () => {
    const longForm = mapFrom([extraction('ESD', 'cert.pdf', [['expiry_date', '14 March 2027']])]);
    expect(longForm.payload['supplier.certificate_expiry']).toBe('2027-03-14');

    // 03/04/2027 is 3 April, never 4 March.
    const slashed = mapFrom([extraction('ESD', 'cert.pdf', [['expiry_date', '03/04/2027']])]);
    expect(slashed.payload['supplier.certificate_expiry']).toBe('2027-04-03');
  });

  it('reads a B-BBEE level from prose', () => {
    const worded = mapFrom([extraction('ESD', 'cert.pdf', [['bee_level', 'Level 4 Contributor']])]);
    expect(worded.payload['supplier.bee_level']).toBe(4);

    const spelled = mapFrom([extraction('ESD', 'cert.pdf', [['bee_level', 'Level Two']])]);
    expect(spelled.payload['supplier.bee_level']).toBe(2);
  });

  it('drops values it cannot coerce rather than passing junk to the calculator', () => {
    const result = mapFrom([
      extraction('ESD', 'cert.pdf', [['bee_level', 'Level 12']]),      // out of range
      extraction('OWNERSHIP', 'a.pdf', [['black_ownership', '150%']]), // impossible
    ]);

    expect(result.payload['supplier.bee_level']).toBeUndefined();
    expect(result.payload['ownership.black_ownership']).toBeUndefined();
    expect(result.unmapped.map((u) => u.reason)).toContain('uncoercible');
  });
});

describe('the safety rules', () => {
  it('never maps a field whose sources disagree', () => {
    const result = mapFrom([
      extraction('SED', 'afs.pdf', [['contribution_amount', 356010]]),
      extraction('SED', 'accounts.xlsx', [['contribution_amount', 412000]]),
    ]);

    // The case does not yet know what this is, so it scores nothing from it.
    expect(result.payload['sed.contribution']).toBeUndefined();
    expect(result.unmapped).toContainEqual({ field: 'contribution_amount', reason: 'conflicted' });

    // But the disagreement is handed to a human with both values and both files.
    const review = result.needsReview.find((r) => r.field === 'contribution_amount')!;
    expect(review.values).toEqual([356010, 412000]);
    expect(review.sources).toEqual(['afs.pdf', 'accounts.xlsx']);
  });

  it('maps a field that AGREES across files, and records the corroboration', () => {
    const result = mapFrom([
      extraction('OWNERSHIP', 'cipc.pdf', [['entity_name', 'Acme Trading (Pty) Ltd']]),
      extraction('OWNERSHIP', 'afs.pdf', [['entity_name', 'Acme Trading (Pty) Ltd.']]),
    ]);

    expect(result.payload['ownership.entity_name']).toBe('Acme Trading (Pty) Ltd');
    expect(result.entries.find((e) => e.key === 'ownership.entity_name')!.agreementCount).toBe(2);
  });

  it('does not guess a mapping for a field it was never taught', () => {
    const result = mapFrom([
      extraction('OWNERSHIP', 'reg.pdf', [['total_shares_in_issue', 100]]),
    ]);

    // total_shares_in_issue is real evidence, but no calculator key takes it.
    // Inventing one is how a wrong level gets certified.
    expect(Object.keys(result.payload)).toHaveLength(0);
    expect(result.unmapped).toContainEqual({ field: 'total_shares_in_issue', reason: 'no_mapping' });
  });

  it('respects context: the same field name means different things per element', () => {
    // entity_name from an Ownership document is the measured entity...
    const ownership = mapFrom([extraction('OWNERSHIP', 'cipc.pdf', [['entity_name', 'Acme']])]);
    expect(ownership.payload['ownership.entity_name']).toBe('Acme');

    // ...but the same field from an ESD document is not, so it must not silently
    // become the measured entity's name.
    const esd = mapFrom([extraction('ESD', 'supplier_cert.pdf', [['entity_name', 'Beta Logistics']])]);
    expect(esd.payload['ownership.entity_name']).toBeUndefined();
  });

  it('prefers the better-corroborated value when two fields target one key', () => {
    const result = mapFrom([
      extraction('SED', 'a.pdf', [['contribution_amount', 1000]]),
      extraction('SED', 'b.pdf', [['contribution_amount', 1000]]),
      extraction('SED', 'c.pdf', [['total_sed_contributions', 9999]]),
    ]);

    // Two files agree on 1000; one file alone says 9999.
    expect(result.payload['sed.contribution']).toBe(1000);
  });
});

describe('coverage is reported honestly', () => {
  it('lists what was extracted but not mapped, and why', () => {
    const result = mapFrom([
      extraction('SKILLS_DEVELOPMENT', 'wsp.pdf', [
        ['submission_date', '2026-04-28'],
        ['sum_of_leviable_amount', 'R 4 249 500'],
      ]),
    ]);

    expect(result.payload['skills.total_spend']).toBe(4249500);
    // A WSP acknowledgement proves compliance but no calculator key consumes it —
    // reported rather than quietly dropped.
    expect(result.unmapped).toContainEqual({ field: 'submission_date', reason: 'no_mapping' });
  });

  it('produces an empty payload, not a broken one, from an empty case', () => {
    const result = mapFrom([]);
    expect(result.payload).toEqual({});
    expect(result.entries).toEqual([]);
    expect(result.needsReview).toEqual([]);
  });
});
