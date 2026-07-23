/**
 * parser case → workbook sections mapper.
 *
 * The document-upload start option must score through the SAME workbook path
 * as manual entry / Excel import, so this mapper's output shape is pinned to
 * the section grid column keys (PROCUREMENT_COLUMNS / OWNERSHIP_COLUMNS /
 * SED_COLUMNS in components/workbook/sections.ts). Fixture mirrors the real
 * /api/parser/resolve-case-files output captured from the running parser
 * (certificate + affidavit + spend schedule).
 */
import { describe, it, expect } from 'vitest';
import { mapParserCaseToWorkbookSections } from '../parserWorkbookMap';

const CASE = {
  status: 'review_required',
  calculator_payload: {
    'ownership.entity_name': 'Sechaba Trading (Pty) Ltd',
    'ownership.black_ownership': 51,
    'ownership.black_women_ownership': 30,
    'sed.beneficiary_name': 'Itireleng Primary School',
    'sed.contribution': 250000,
    'skills.total_spend': 1200000,
    'management.black_representation': 62,
  },
  supplier_rows: [
    { supplier_name: 'Acme Supplies (Pty) Ltd', spend_amount: 1200000, bee_level: 2, black_ownership: 51, status: 'passed' },
    { supplier_name: 'Thebe Logistics CC', spend_amount: 800000, bee_level: 1, black_ownership: 100, status: 'passed' },
    { supplier_name: 'Umoya Office Solutions', spend_amount: 450000, bee_level: 4, black_ownership: 30, status: 'passed' },
  ],
  documents_detected: [
    { filename: 'acme_cert.txt', document_type: 'B-BBEE Certificate', status: 'passed' },
    { filename: 'thebe_affidavit.txt', document_type: 'B-BBEE Sworn Affidavit', status: 'passed' },
    { filename: 'spend.csv', document_type: 'Supplier Spend Schedule', status: 'review_required' },
  ],
  fields_extracted: {
    'acme_cert.txt': {
      supplier_name: { normalized_value: 'Acme Supplies (Pty) Ltd', confidence: 0.9 },
      bee_level: { normalized_value: 2, confidence: 0.9 },
      black_ownership: { normalized_value: 51, confidence: 0.9 },
      expiry_date: { normalized_value: '2027-01-31', confidence: 0.9 },
    },
    'thebe_affidavit.txt': {
      supplier_name: { normalized_value: 'Thebe Logistics CC', confidence: 0.9 },
      bee_level: { normalized_value: 1, confidence: 0.9 },
      black_ownership: { normalized_value: 100, confidence: 0.9 },
      signed_date: { normalized_value: '2026-03-15', confidence: 0.9 },
    },
  },
  missing_required_documents: [],
};

describe('mapParserCaseToWorkbookSections — procurement', () => {
  it('maps supplier rows to PROCUREMENT_COLUMNS keys, enriched with cert expiry', () => {
    const { sections } = mapParserCaseToWorkbookSections(CASE as any);
    const rows = sections.procurement!.rows!;
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      supplierName: 'Acme Supplies (Pty) Ltd',
      spend: 1_200_000,
      bbbeeLevel: 2,
      currentBlackOwnership: 51,
      certificateExpiryDate: '2027-01-31',
    });
    expect(rows[1]).toMatchObject({
      supplierName: 'Thebe Logistics CC',
      spend: 800_000,
      bbbeeLevel: 1,
      currentBlackOwnership: 100,
      certificateExpiryDate: '2026-03-15', // affidavit signed date
    });
  });

  it('adds evidence-only rows for certificates whose supplier is not on the schedule', () => {
    const c = {
      ...CASE,
      supplier_rows: [],
      calculator_payload: {},
    };
    const { sections } = mapParserCaseToWorkbookSections(c as any);
    const rows = sections.procurement!.rows!;
    expect(rows.map((r) => r.supplierName)).toEqual([
      'Acme Supplies (Pty) Ltd',
      'Thebe Logistics CC',
    ]);
    expect(rows[0].spend).toBeUndefined(); // no spend fabricated
  });
});

describe('mapParserCaseToWorkbookSections — ownership + SED', () => {
  it('encodes the ownership confirmation as one aggregate 100%-equity row', () => {
    const { sections } = mapParserCaseToWorkbookSections(CASE as any);
    const row = sections.ownership!.rows![0];
    expect(row).toMatchObject({
      shareholding: 100,
      votingRights: 51,
      economicInterest: 51,
      blackOwnership: 51,
      blackWomenOwnership: 30,
    });
    expect(String(row.shareholderName)).toContain('Ownership Confirmation');
  });

  it('maps the SED contribution to a SED row', () => {
    const { sections } = mapParserCaseToWorkbookSections(CASE as any);
    expect(sections.sed!.rows![0]).toMatchObject({
      beneficiaryName: 'Itireleng Primary School',
      amount: 250_000,
    });
  });
});

describe('mapParserCaseToWorkbookSections — no fabrication + coverage', () => {
  it('does NOT write skills/management aggregates into the workbook', () => {
    const { sections } = mapParserCaseToWorkbookSections(CASE as any);
    expect(sections['skills-development']).toBeUndefined();
    expect(sections['management-control']).toBeUndefined();
  });

  it('reports coverage: mapped pillars, needs-detail with extracted values, and gaps', () => {
    const { coverage, mappedRowCount } = mapParserCaseToWorkbookSections(CASE as any);
    const byPillar = Object.fromEntries(coverage.map((c) => [c.pillar, c]));
    expect(byPillar['Preferential Procurement'].status).toBe('mapped');
    expect(byPillar['Ownership'].status).toBe('mapped');
    expect(byPillar['Socio-Economic Development'].status).toBe('mapped');
    expect(byPillar['Skills Development'].status).toBe('needs-detail');
    expect(byPillar['Skills Development'].extractedValue).toContain('1,200,000');
    expect(byPillar['Management Control'].status).toBe('needs-detail');
    expect(byPillar['Management Control'].extractedValue).toContain('62%');
    expect(byPillar['Financials'].status).toBe('no-document');
    expect(mappedRowCount).toBe(5); // 3 suppliers + 1 ownership + 1 sed
  });

  it('reports no-document coverage when nothing was uploaded', () => {
    const { sections, coverage, mappedRowCount } = mapParserCaseToWorkbookSections({} as any);
    expect(Object.keys(sections)).toHaveLength(0);
    expect(mappedRowCount).toBe(0);
    expect(coverage.every((c) => c.status === 'no-document')).toBe(true);
  });
});

describe('mapParserCaseToWorkbookSections — TMPS denominator', () => {
  it('routes the labelled measured procurement spend to financial-information.tmps', () => {
    // The deterministic case result reads TMPS as a labelled total; this is the
    // trustworthy denominator and (via the legacy-wins merge) overrides a model
    // that summed the wrong column to an inflated figure.
    const { sections } = mapParserCaseToWorkbookSections({ measured_procurement_spend: 1030806.68 } as any);
    expect((sections['financial-information']?.meta as Record<string, unknown>)?.tmps).toBeCloseTo(1030806.68, 2);
  });

  it('does not create a TMPS when no labelled total was read (never guessed/summed)', () => {
    // Suppliers present but no labelled TMPS: the mapper writes no denominator —
    // projectWorkbookToClient derives it from supplier spend as a fallback later.
    const { sections } = mapParserCaseToWorkbookSections({
      supplier_rows: [{ supplier_name: 'A', spend_amount: 500000, status: 'passed' }],
    } as any);
    expect(sections['financial-information']).toBeUndefined();
  });
});
