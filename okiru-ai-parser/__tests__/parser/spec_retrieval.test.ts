/**
 * BM25 spec retrieval — which of the 109 specs to extract a document against.
 *
 * This replaces the crude alias-substring match that made Phase 4 misfire: a
 * clean per-sheet "Ownership" document matched no ownership alias literally and
 * so extracted nothing. The properties under test: a document surfaces the specs
 * of its own element, the sheet-name hint routes a workbook sheet to its
 * element, and rare discriminating terms outrank common ones.
 */
import { describe, expect, it } from 'vitest';
import {
  elementFromContent,
  elementFromHint,
  rankSpecsForDocument,
  selectSpecIds,
} from '../../src/services/specRetrieval.js';

describe('sheet-name → element', () => {
  it('maps the workbook sheet names the real files use', () => {
    expect(elementFromHint('Ownership')).toBe('OWNERSHIP');
    expect(elementFromHint('Management Control')).toBe('MANAGEMENT_CONTROL');
    expect(elementFromHint('Preferential Procurement')).toBe('ESD');
    expect(elementFromHint('Social Development')).toBe('SED');
    expect(elementFromHint('Skills Development')).toBe('SKILLS_DEVELOPMENT');
  });

  it('returns null for a sheet name that names no element', () => {
    expect(elementFromHint('Instructions')).toBeNull();
    expect(elementFromHint(undefined)).toBeNull();
  });

  it('routes an Employment Equity sheet to Management Control, not Ownership', () => {
    // The bare `equity` in the ownership pattern used to claim this sheet
    // first, sending the employee register to shareholder extraction.
    expect(elementFromHint('Employment Equity')).toBe('MANAGEMENT_CONTROL');
    expect(elementFromHint('wb.xlsm › Employment Equity')).toBe('MANAGEMENT_CONTROL');
    // Genuine ownership names still route to OWNERSHIP.
    expect(elementFromHint('Ownership')).toBe('OWNERSHIP');
    expect(elementFromHint('Equity Ownership')).toBe('OWNERSHIP');
  });

  it('routes the real evidence-pack filenames — statutory forms, registers, ledgers', () => {
    expect(elementFromHint('Thandanani Share Certificate THA001 1 of 1.pdf')).toBe('OWNERSHIP');
    expect(elementFromHint('Thandanani BI Register.pdf')).toBe('OWNERSHIP');
    expect(elementFromHint('CIPC (1).pdf')).toBe('OWNERSHIP');
    expect(elementFromHint('EEA1.pdf')).toBe('MANAGEMENT_CONTROL');
    expect(elementFromHint('Thandanani November Salary Report.pdf')).toBe('MANAGEMENT_CONTROL');
    expect(elementFromHint('Pay roll Nov.pdf')).toBe('MANAGEMENT_CONTROL');
    expect(elementFromHint('TST TRUCK LEDGER.xlsx')).toBe('ESD');
  });

  it('does NOT misroute the generic gathering-file name', () => {
    // "BEE Information Gathering File" is every element at once; a hint here
    // would narrow retrieval to the wrong one.
    expect(elementFromHint('BEE Information Gathering File - Thandanani Transport.xlsm')).toBeNull();
  });
});

describe('content → element (anonymous scans)', () => {
  it('routes clear register language to OWNERSHIP', () => {
    expect(elementFromContent(
      'SECURITIES REGISTER of Thandanani Packers. This share register records… entries in the share register…',
    )).toBe('OWNERSHIP');
  });

  it('returns null when signals are mixed or weak', () => {
    expect(elementFromContent('share register mentioned once, plus accounts payable ledger entries')).toBeNull();
    expect(elementFromContent('one mention of a share certificate')).toBeNull();
    expect(elementFromContent('nothing relevant at all')).toBeNull();
    expect(elementFromContent(undefined)).toBeNull();
  });
});

describe('ranking specs for a document', () => {
  it('surfaces ownership specs for a share register', () => {
    const ranked = rankSpecsForDocument(
      'Securities register. Total shares in issue 100. Shareholder holdings and voting rights.',
      'Thandanani Share Register.pdf',
    );
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked.some((c) => c.spec.element === 'OWNERSHIP')).toBe(true);
  });

  it('routes an Ownership SHEET to ownership specs via the hint, even with thin text', () => {
    // The Phase 4 failure: a clean sheet whose content does not contain any
    // ownership spec's literal alias. The hint carries it.
    const ranked = rankSpecsForDocument(
      'Name Race Gender\nV Naidoo Black Male',
      'BEE File.xlsm › Ownership',
      { elementHint: 'Ownership' },
    );
    expect(ranked[0].spec.element).toBe('OWNERSHIP');
  });

  it('routes a Procurement sheet to ESD specs', () => {
    const ranked = rankSpecsForDocument(
      'Supplier Name Spend BEE Level\nDynamic Maintenance 4876 Level 4',
      'proc.xlsm › Preferential Procurement',
      { elementHint: 'Preferential Procurement' },
    );
    expect(ranked[0].spec.element).toBe('ESD');
  });

  it('routes a Social Development sheet to SED specs', () => {
    const ranked = rankSpecsForDocument(
      'Beneficiary Amount\nEssentially Edenvale 500',
      'sed.xlsm › Social Development',
      { elementHint: 'Social Development' },
    );
    expect(ranked[0].spec.element).toBe('SED');
  });

  it('rewards a rare discriminating term over common boilerplate', () => {
    // "leviable" appears in few specs; "date" in many. A document about the
    // leviable amount should surface the skills/EMP201 specs.
    const ranked = rankSpecsForDocument(
      'SARS EMP201 submission. Sum of leviable amount for the period.',
      'emp201.pdf',
    );
    expect(ranked.some((c) => c.spec.element === 'SKILLS_DEVELOPMENT')).toBe(true);
  });

  it('honours the limit', () => {
    const ids = selectSpecIds('ownership shares voting economic interest', 'x.pdf', { limit: 3 });
    expect(ids.length).toBeLessThanOrEqual(3);
  });

  it('returns nothing for text with no matching terms rather than everything', () => {
    const ranked = rankSpecsForDocument('zzzz qqqq', 'nonsense.pdf');
    // No spec has these terms; no element hint. Empty, not the whole matrix.
    expect(ranked.length).toBe(0);
  });
});
