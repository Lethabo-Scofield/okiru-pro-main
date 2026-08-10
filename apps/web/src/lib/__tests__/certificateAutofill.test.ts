/**
 * Fill-algebra tests.
 *
 * What the registry FINDS is tested on the API side. This is about what we do
 * with a match — and the rules that matter are all about restraint: never
 * overwrite the user, never score a lapsed certificate, always leave a trail.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  applyCertificateMatches,
  autofillProcurementFromCertificates,
  rowsNeedingCertificateData,
  summariseAutofill,
  workbookDateToIso,
  type CertificateMatchCandidate,
  type ProcurementRow,
  type SupplierMatchResult,
} from '../certificateAutofill';

function candidate(over: Partial<CertificateMatchCandidate> = {}): CertificateMatchCandidate {
  return {
    certificateId: 'cert-1',
    slug: 'acme-cert-1',
    companyName: 'Acme Traders',
    certificateNumber: 'ABC-1',
    agency: 'Empowerlogic',
    issueDate: '2029-01-01',
    expiryDate: '2030-01-01',
    validAtAsOf: true,
    verified: true,
    basis: 'registration',
    confidence: 1,
    fields: {
      bbbeeLevel: '2',
      currentSize: 'QSE',
      currentBlackOwnership: 100,
      currentBlackFemaleOwnership: 60,
      empoweringSupplier: 'Yes',
      certificateExpiryDate: '2030-01-01',
      registrationNumber: '2015/123456/07',
    },
    ...over,
  };
}

function matchFor(key: string, over: Partial<CertificateMatchCandidate> = {}): SupplierMatchResult {
  return { key, match: candidate(over), alternatives: [] };
}

const row = (over: Partial<ProcurementRow> = {}): ProcurementRow => ({
  _id: 'r1',
  supplierName: 'Acme Traders',
  spend: 1_000_000,
  ...over,
});

describe('filling blanks', () => {
  it('fills every blank scoring column from the certificate', () => {
    const { rows, report } = applyCertificateMatches([row()], [matchFor('r1')]);
    expect(rows[0].bbbeeLevel).toBe('2');
    expect(rows[0].currentSize).toBe('QSE');
    expect(rows[0].currentBlackOwnership).toBe(100);
    expect(rows[0].empoweringSupplier).toBe('Yes');
    expect(report.cellsFilled).toBe(7);
    expect(report.rowsChanged).toBe(1);
  });

  it('never overwrites a value the user or the document already supplied', () => {
    const { rows, report } = applyCertificateMatches(
      [row({ bbbeeLevel: '4', currentBlackOwnership: 51 })],
      [matchFor('r1')],
    );
    expect(rows[0].bbbeeLevel).toBe('4');
    expect(rows[0].currentBlackOwnership).toBe(51);
    expect(report.conflicts).toHaveLength(1);
    expect(report.conflicts[0].conflicts.map((c) => c.column).sort()).toEqual([
      'bbbeeLevel',
      'currentBlackOwnership',
    ]);
  });

  it('does not report a conflict when the two agree', () => {
    const { report } = applyCertificateMatches(
      // Same values, different notation: "2" vs 2, 100 vs "100".
      [row({ bbbeeLevel: 2, currentBlackOwnership: '100' })],
      [matchFor('r1')],
    );
    expect(report.conflicts).toHaveLength(0);
  });

  it('never touches the supplier name or the spend', () => {
    const { rows } = applyCertificateMatches(
      [row()],
      [matchFor('r1', { fields: { ...candidate().fields, supplierName: 'Acme Traders (Pty) Ltd', spend: 99 } as never })],
    );
    expect(rows[0].supplierName).toBe('Acme Traders');
    expect(rows[0].spend).toBe(1_000_000);
  });

  it('leaves rows with no match completely untouched', () => {
    const input = [row()];
    const { rows } = applyCertificateMatches(input, [
      { key: 'r1', match: null, alternatives: [], reason: 'below-threshold' },
    ]);
    expect(rows[0]).toEqual(input[0]);
    expect(rows[0]._certificate).toBeUndefined();
  });

  it('does not mutate the rows it was given', () => {
    const input = [row()];
    applyCertificateMatches(input, [matchFor('r1')]);
    expect(input[0].bbbeeLevel).toBeUndefined();
    expect(input[0]._certificate).toBeUndefined();
  });
});

describe('expired certificates', () => {
  const expired = { validAtAsOf: false, expiryDate: '2024-03-31' };

  it('withholds the scoring columns when the certificate had lapsed', () => {
    const { rows, report } = applyCertificateMatches([row()], [matchFor('r1', expired)]);
    expect(rows[0].bbbeeLevel).toBeUndefined();
    expect(rows[0].currentSize).toBeUndefined();
    expect(rows[0].empoweringSupplier).toBeUndefined();
    expect(report.notValid).toHaveLength(1);
    expect(report.notValid[0].expiryDate).toBe('2024-03-31');
  });

  it('still fills the identity columns, so the lapse is visible in the grid', () => {
    const { rows } = applyCertificateMatches([row()], [matchFor('r1', expired)]);
    expect(rows[0].certificateExpiryDate).toBe('2030-01-01');
    expect(rows[0].registrationNumber).toBe('2015/123456/07');
  });

  it('fills the scoring columns anyway when the caller asks for it explicitly', () => {
    const { rows } = applyCertificateMatches([row()], [matchFor('r1', expired)], {
      allowExpired: true,
    });
    expect(rows[0].bbbeeLevel).toBe('2');
  });

  it('records which scoring columns were withheld', () => {
    const { rows } = applyCertificateMatches([row()], [matchFor('r1', expired)]);
    const provenance = rows[0]._certificate as { withheldExpired: string[] };
    expect(provenance.withheldExpired).toContain('bbbeeLevel');
    expect(provenance.withheldExpired).toContain('currentSize');
  });

  it('distinguishes a lapsed certificate from one with no expiry on record', () => {
    // Different fixes: one needs a renewal chased from the supplier, the other
    // needs the registry record corrected. Reporting both as "expired" would
    // send procurement after the wrong thing.
    const { report } = applyCertificateMatches(
      [row(), row({ _id: 'r2', supplierName: 'Beta Co' })],
      [
        matchFor('r1', expired),
        { ...matchFor('r2', { validAtAsOf: false, expiryDate: null }), key: 'r2' },
      ],
    );
    expect(report.notValid.map((n) => n.reason).sort()).toEqual(['expired', 'no-expiry-date']);
    expect(summariseAutofill(report)).toMatch(/1 certificate expired/);
    expect(summariseAutofill(report)).toMatch(/1 with no expiry date on record/);
  });
});

describe('provenance', () => {
  it('stamps the source certificate onto every row it touched', () => {
    const { rows } = applyCertificateMatches([row()], [matchFor('r1')]);
    const p = rows[0]._certificate as Record<string, unknown>;
    expect(p.certificateId).toBe('cert-1');
    expect(p.companyName).toBe('Acme Traders');
    expect(p.basis).toBe('registration');
    expect(p.confidence).toBe(1);
    expect(p.filled).toContain('bbbeeLevel');
  });

  it('records a match that added nothing, so "checked" is distinguishable from "never looked at"', () => {
    const complete = row({
      bbbeeLevel: '2',
      currentSize: 'QSE',
      currentBlackOwnership: 100,
      currentBlackFemaleOwnership: 60,
      empoweringSupplier: 'Yes',
      certificateExpiryDate: '2030-01-01',
      registrationNumber: '2015/123456/07',
    });
    const { rows, report } = applyCertificateMatches([complete], [matchFor('r1')]);
    expect(rows[0]._certificate).toBeDefined();
    expect(report.cellsFilled).toBe(0);
    expect(report.rowsChanged).toBe(0);
  });
});

describe('refusals are surfaced, not swallowed', () => {
  it('reports an ambiguous name with the companies that tied', () => {
    const { report } = applyCertificateMatches(
      [row({ supplierName: 'Ubuntu Cartage' })],
      [
        {
          key: 'r1',
          match: null,
          alternatives: [],
          reason: 'ambiguous',
          ambiguousWith: ['Ubuntu Cartage Alpna', 'Ubuntu Cartage Alpma'],
        },
      ],
    );
    expect(report.ambiguous).toHaveLength(1);
    expect(report.ambiguous[0].candidates).toHaveLength(2);
  });

  it('does not list a row that had nothing to look up as "unmatched"', () => {
    const { report } = applyCertificateMatches(
      [row({ supplierName: '' })],
      [{ key: 'r1', match: null, alternatives: [], reason: 'no-identifiers' }],
    );
    expect(report.unmatched).toHaveLength(0);
  });
});

describe('choosing which rows to look up', () => {
  it('skips rows that already have every fillable value', () => {
    const complete = row({
      bbbeeLevel: '2',
      currentSize: 'QSE',
      currentBlackOwnership: 100,
      currentBlackFemaleOwnership: 60,
      registrationNumber: '2015/123456/07',
      vatNumber: '4010101014',
      certificateExpiryDate: '2030-01-01',
      empoweringSupplier: 'Yes',
      sdRecipient: 'No',
      threeYearContract: 'No',
      designated: 'No',
      sizeAtFirstProcurement: 'QSE',
      firstProcurementDate: '2020-01-01',
      measuredUnder: 'RCoGP',
    });
    expect(rowsNeedingCertificateData([complete])).toHaveLength(0);
  });

  it('skips rows with nothing to match on', () => {
    expect(rowsNeedingCertificateData([row({ supplierName: '  ' })])).toHaveLength(0);
  });

  it('includes a row identified only by registration number', () => {
    expect(
      rowsNeedingCertificateData([row({ supplierName: '', registrationNumber: '2015/123456/07' })]),
    ).toHaveLength(1);
  });
});

describe('the registry being down never blocks data entry', () => {
  it('returns the rows untouched and says so', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const input = [row()];
    const { rows, report } = await autofillProcurementFromCertificates(input, {
      fetchImpl: failing as unknown as typeof fetch,
    });
    expect(rows).toBe(input);
    expect(report.registryUnavailable).toBe(true);
    expect(report.cellsFilled).toBe(0);
  });

  it('does not call the API at all when no row has a gap', async () => {
    const spy = vi.fn();
    await autofillProcurementFromCertificates([row({ supplierName: '' })], {
      fetchImpl: spy as unknown as typeof fetch,
    });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('measurement-period date parsing', () => {
  it('reads dd/mm/yyyy the South African way, not the American way', () => {
    // "03/02/2026" is 3 February here and 2 March to the Date constructor in a
    // US locale. Eight months of error, straddling most of the registry's
    // expiry dates — it would decide validity for thousands of certificates.
    expect(workbookDateToIso('3/2/2026')).toBe('2026-02-03');
    expect(workbookDateToIso('28/02/2026')).toBe('2026-02-28');
  });

  it('passes ISO through and rejects anything else', () => {
    expect(workbookDateToIso('2026-02-28')).toBe('2026-02-28');
    expect(workbookDateToIso('Feb 2026')).toBeUndefined();
    expect(workbookDateToIso('')).toBeUndefined();
    expect(workbookDateToIso(null)).toBeUndefined();
  });
});

describe('summary line', () => {
  it('leads with what was filled and names the exceptions', () => {
    const { report } = applyCertificateMatches(
      [row(), row({ _id: 'r2', supplierName: 'Beta Co', bbbeeLevel: '5' })],
      [matchFor('r1'), { ...matchFor('r2'), key: 'r2' }],
    );
    const line = summariseAutofill(report);
    expect(line).toMatch(/Auto-filled \d+ fields/);
    expect(line).toMatch(/disagree with entered data/);
  });

  it('says plainly when the registry could not be reached', () => {
    expect(
      summariseAutofill({
        requested: 3,
        matched: 0,
        rowsChanged: 0,
        cellsFilled: 0,
        conflicts: [],
        notValid: [],
        ambiguous: [],
        unmatched: [],
        registryUnavailable: true,
      }),
    ).toMatch(/unavailable/i);
  });
});
