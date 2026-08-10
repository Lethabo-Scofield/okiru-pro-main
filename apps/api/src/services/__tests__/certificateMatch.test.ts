/**
 * Matcher tests.
 *
 * The interesting cases are all REFUSALS. A matcher that finds the right
 * certificate for a clean name is easy; one that declines to guess when the
 * evidence is thin is the whole point, because a wrong certificate silently
 * inflates a client's score with another company's B-BBEE level.
 */
import { describe, it, expect } from 'vitest';
import {
  buildMatchIndex,
  canonicalName,
  certificateToProcurementFields,
  matchSupplierInIndex,
  nameSortKey,
  normalizeRegistrationNumber,
  normalizeVatKey,
} from '../certificateMatch.js';

/** A valid SA VAT number (10 digits, leading 4, passes Luhn). */
const VALID_VAT_A = '4010101014';
const VALID_VAT_B = '4230187058';

function cert(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'cert-1',
    supplierName: 'Thandanani Packers and Hauliers',
    registrationNumber: '2015/123456/07',
    vatNumber: null,
    companySize: 'QSE',
    bbbeeLevel: 2,
    blackOwnership: 100,
    blackWomenOwnership: 60,
    empoweringSupplier: true,
    expiryDate: new Date('2030-01-01'),
    issueDate: new Date('2029-01-01'),
    verified: true,
    certificateNumber: 'ABC-123',
    verificationAgency: 'Empowerlogic',
    ...over,
  };
}

const ASOF = new Date('2029-06-01');

describe('normalisation', () => {
  it('strips legal suffixes and punctuation so certificate spellings collapse', () => {
    expect(canonicalName('ABC Traders (PTY) LTD')).toBe('abc traders');
    expect(canonicalName('ABC  Traders Pty Ltd')).toBe('abc traders');
    expect(canonicalName('A&B Holdings CC')).toBe('a and b holdings');
  });

  it('treats word order as formatting, not identity', () => {
    expect(nameSortKey('Hauliers, Thandanani')).toBe(nameSortKey('Thandanani Hauliers'));
  });

  it('canonicalises a registration number with or without separators', () => {
    expect(normalizeRegistrationNumber('2015/123456/07')).toBe('2015/123456/07');
    expect(normalizeRegistrationNumber('201512345607')).toBe('2015/123456/07');
    expect(normalizeRegistrationNumber(' 2015 / 123456 / 07 ')).toBe('2015/123456/07');
  });

  it('rejects a VAT number that fails the SA checksum', () => {
    expect(normalizeVatKey(VALID_VAT_A)).toBe(VALID_VAT_A);
    expect(normalizeVatKey('4010101011')).toBeNull(); // checksum broken
    expect(normalizeVatKey('1010101014')).toBeNull(); // does not start with 4
  });
});

describe('identifier precedence', () => {
  it('matches on registration number even when the name is nothing alike', () => {
    const index = buildMatchIndex([cert()]);
    const result = matchSupplierInIndex(
      { key: 'r1', name: 'TPH Logistics', registrationNumber: '2015/123456/07' },
      index,
      { asOf: ASOF },
    );
    expect(result.match?.basis).toBe('registration');
    expect(result.match?.confidence).toBe(1);
  });

  it('matches on VAT when there is no registration number', () => {
    const index = buildMatchIndex([
      cert({ registrationNumber: null, vatNumber: VALID_VAT_A }),
    ]);
    const result = matchSupplierInIndex(
      { key: 'r1', name: 'Something Else Entirely', vatNumber: VALID_VAT_A },
      index,
      { asOf: ASOF },
    );
    expect(result.match?.basis).toBe('vat');
  });

  it('will not use a VAT number that two different companies both carry', () => {
    // The registry audit case: 506 certificates carrying someone else's VAT,
    // usually the verification agency's, read off the same page.
    const index = buildMatchIndex([
      cert({ id: 'a', supplierName: 'Alpha Trading', registrationNumber: null, vatNumber: VALID_VAT_A }),
      cert({ id: 'b', supplierName: 'Beta Freight', registrationNumber: null, vatNumber: VALID_VAT_A }),
    ]);
    const result = matchSupplierInIndex(
      { key: 'r1', name: 'Completely Unrelated Co', vatNumber: VALID_VAT_A },
      index,
      { asOf: ASOF },
    );
    expect(result.match).toBeNull();
  });

  it('still matches by name when the shared VAT is dropped as a key', () => {
    const index = buildMatchIndex([
      cert({ id: 'a', supplierName: 'Alpha Trading', registrationNumber: null, vatNumber: VALID_VAT_A }),
      cert({ id: 'b', supplierName: 'Beta Freight', registrationNumber: null, vatNumber: VALID_VAT_A }),
    ]);
    const result = matchSupplierInIndex(
      { key: 'r1', name: 'Alpha Trading (Pty) Ltd', vatNumber: VALID_VAT_A },
      index,
      { asOf: ASOF },
    );
    expect(result.match?.basis).toBe('name-exact');
    expect(result.match?.companyName).toBe('Alpha Trading');
  });
});

describe('name matching', () => {
  it('matches an exact canonical name through suffix and spacing noise', () => {
    const index = buildMatchIndex([cert({ supplierName: 'ABC Traders (PTY) LTD' })]);
    const result = matchSupplierInIndex(
      { key: 'r1', name: 'ABC  Traders Pty Ltd' },
      index,
      { asOf: ASOF },
    );
    expect(result.match?.basis).toBe('name-exact');
  });

  it('matches reordered names', () => {
    const index = buildMatchIndex([cert({ supplierName: 'Thandanani Hauliers' })]);
    const result = matchSupplierInIndex(
      { key: 'r1', name: 'Hauliers, Thandanani' },
      index,
      { asOf: ASOF },
    );
    expect(result.match?.basis).toBe('name-reordered');
  });

  it('resolves a trailing plural exactly rather than falling through to fuzzy', () => {
    // "Service" vs "Services" is settled by the de-pluralising sort key, which
    // is an exact transformation — it never has to guess, so it reports the
    // stronger basis and a higher confidence than a fuzzy hit would.
    const index = buildMatchIndex([cert({ supplierName: 'Lakeside Freight Services' })]);
    const result = matchSupplierInIndex(
      { key: 'r1', name: 'Lakeside Freight Service' },
      index,
      { asOf: ASOF },
    );
    expect(result.match?.basis).toBe('name-reordered');
    expect(result.match?.confidence).toBeGreaterThan(0.9);
  });

  it('matches a genuinely misspelt name above the threshold', () => {
    const index = buildMatchIndex([cert({ supplierName: 'Lakesido Freight Holdings' })]);
    const result = matchSupplierInIndex(
      { key: 'r1', name: 'Lakeside Freight Holdings' },
      index,
      { asOf: ASOF },
    );
    expect(result.match?.basis).toBe('name-fuzzy');
    expect(result.match?.confidence).toBeGreaterThanOrEqual(0.88);
  });

  it('refuses a name that is merely similar', () => {
    // "Lake Trading" must never pick up "Blake Motors" — this is the failure
    // the registry's own unanchored regex search would produce.
    const index = buildMatchIndex([cert({ supplierName: 'Blake Motors', registrationNumber: null })]);
    const result = matchSupplierInIndex({ key: 'r1', name: 'Lake Trading' }, index, { asOf: ASOF });
    expect(result.match).toBeNull();
    expect(result.reason).toMatch(/below-threshold|no-candidate/);
  });

  it('refuses when two different companies are equally close', () => {
    // Both certificates are one character from the query and neither is an
    // exact or reordered hit. Nothing here can tell which is the real supplier,
    // so nothing is filled.
    const index = buildMatchIndex([
      cert({ id: 'a', supplierName: 'Ubuntu Cartage Alpna', registrationNumber: '2001/111111/07' }),
      cert({ id: 'b', supplierName: 'Ubuntu Cartage Alpma', registrationNumber: '2002/222222/07' }),
    ]);
    const result = matchSupplierInIndex(
      { key: 'r1', name: 'Ubuntu Cartage Alpha' },
      index,
      { asOf: ASOF },
    );
    expect(result.match).toBeNull();
    expect(result.reason).toBe('ambiguous');
    expect(result.ambiguousWith).toHaveLength(2);
  });

  it('refuses an exact name shared by two registered companies', () => {
    const index = buildMatchIndex([
      cert({ id: 'a', supplierName: 'Peninsula Logistics', registrationNumber: '2001/111111/07' }),
      cert({ id: 'b', supplierName: 'Peninsula Logistics', registrationNumber: '2002/222222/07' }),
    ]);
    const result = matchSupplierInIndex({ key: 'r1', name: 'Peninsula Logistics' }, index, { asOf: ASOF });
    expect(result.match).toBeNull();
    expect(result.reason).toBe('ambiguous');
  });

  it('reports no identifiers when the row is empty', () => {
    const index = buildMatchIndex([cert()]);
    const result = matchSupplierInIndex({ key: 'r1', name: '   ' }, index, { asOf: ASOF });
    expect(result.reason).toBe('no-identifiers');
  });
});

describe('choosing between a company’s certificates', () => {
  it('prefers the certificate valid at the measurement date, not the newest', () => {
    // Measured for a period ending 2029-06-01. The 2030 renewal is current
    // today but was not live then; the certificate that WAS live must win.
    const index = buildMatchIndex([
      cert({
        id: 'lapsed',
        registrationNumber: '2015/123456/07',
        issueDate: new Date('2028-06-01'),
        expiryDate: new Date('2029-05-31'),
      }),
      cert({
        id: 'live-then',
        registrationNumber: '2015/123456/07',
        issueDate: new Date('2029-01-01'),
        expiryDate: new Date('2029-12-31'),
      }),
    ]);
    const result = matchSupplierInIndex(
      { key: 'r1', registrationNumber: '2015/123456/07' },
      index,
      { asOf: ASOF },
    );
    expect(result.match?.certificateId).toBe('live-then');
    expect(result.match?.validAtAsOf).toBe(true);
    expect(result.alternatives.map((a) => a.certificateId)).toContain('lapsed');
  });

  it('flags a match whose only certificate had lapsed by the measurement date', () => {
    const index = buildMatchIndex([
      cert({ registrationNumber: '2015/123456/07', expiryDate: new Date('2029-01-31') }),
    ]);
    const result = matchSupplierInIndex(
      { key: 'r1', registrationNumber: '2015/123456/07' },
      index,
      { asOf: ASOF },
    );
    expect(result.match).not.toBeNull();
    expect(result.match?.validAtAsOf).toBe(false);
  });

  it('groups renewals as alternatives, never as separate companies', () => {
    const index = buildMatchIndex([
      cert({ id: 'y1', registrationNumber: '2015/123456/07', expiryDate: new Date('2028-01-01') }),
      cert({ id: 'y2', registrationNumber: '2015/123456/07', expiryDate: new Date('2029-01-01') }),
      cert({ id: 'y3', registrationNumber: '2015/123456/07', expiryDate: new Date('2030-01-01') }),
    ]);
    const result = matchSupplierInIndex(
      { key: 'r1', registrationNumber: '2015/123456/07' },
      index,
      { asOf: ASOF },
    );
    expect(result.match).not.toBeNull();
    expect(result.alternatives).toHaveLength(2);
  });
});

describe('certificate → procurement columns', () => {
  const fieldsFor = (over: Record<string, unknown>) => {
    const index = buildMatchIndex([cert(over)]);
    return certificateToProcurementFields(index.certificates[0]);
  };

  it('maps the scoring fields into workbook column keys', () => {
    const f = fieldsFor({});
    expect(f).toMatchObject({
      bbbeeLevel: '2',
      currentSize: 'QSE',
      currentBlackOwnership: 100,
      currentBlackFemaleOwnership: 60,
      empoweringSupplier: 'Yes',
      certificateExpiryDate: '2030-01-01',
      registrationNumber: '2015/123456/07',
    });
  });

  it('folds Large and Generic Enterprise onto the workbook’s three sizes', () => {
    expect(fieldsFor({ companySize: 'Large Enterprise' }).currentSize).toBe('Generic');
    expect(fieldsFor({ companySize: 'Generic Enterprise' }).currentSize).toBe('Generic');
    expect(fieldsFor({ companySize: 'Exempt Micro Enterprise' }).currentSize).toBe('EME');
  });

  it('offers no size at all rather than guess at an unmodelled one', () => {
    expect(fieldsFor({ companySize: 'Specialised' }).currentSize).toBeUndefined();
  });

  it('withholds an implausible B-BBEE level instead of passing it on', () => {
    expect(fieldsFor({ bbbeeLevel: 47 }).bbbeeLevel).toBeUndefined();
    expect(fieldsFor({ bbbeeLevel: 0 }).bbbeeLevel).toBeUndefined();
  });

  it('withholds an incoherent ownership PAIR entirely', () => {
    // More black women than black owners means one of the two was misread, and
    // there is no way to tell which — so neither is offered.
    const f = fieldsFor({ blackOwnership: 30, blackWomenOwnership: 80 });
    expect(f.currentBlackOwnership).toBeUndefined();
    expect(f.currentBlackFemaleOwnership).toBeUndefined();
  });

  it('withholds an ownership percentage outside 0–100', () => {
    expect(fieldsFor({ blackOwnership: 510, blackWomenOwnership: null }).currentBlackOwnership)
      .toBeUndefined();
  });

  it('drops a certificate number that is really the agency’s own reference', () => {
    const index = buildMatchIndex([
      cert({ certificateNumber: 'MOORE10479', verificationAgency: 'Moore Stephens' }),
    ]);
    const result = matchSupplierInIndex(
      { key: 'r1', registrationNumber: '2015/123456/07' },
      index,
      { asOf: ASOF },
    );
    expect(result.match?.certificateNumber).toBeNull();
  });

  it('reads Non-compliant from the status when there is no numeric level', () => {
    expect(fieldsFor({ bbbeeLevel: null, bbbeeLevelStatus: 'Non-Compliant Contributor' }).bbbeeLevel)
      .toBe('Non-compliant');
  });
});

describe('index hygiene', () => {
  it('skips registry rows with no name and no identifier', () => {
    const index = buildMatchIndex([
      cert(),
      { id: 'junk', supplierName: null, registrationNumber: null, vatNumber: null },
    ]);
    expect(index.certificates).toHaveLength(1);
  });

  it('records identifiers held by more than one company as unusable', () => {
    const index = buildMatchIndex([
      cert({ id: 'a', supplierName: 'Alpha', registrationNumber: '2001/111111/07', vatNumber: VALID_VAT_B }),
      cert({ id: 'b', supplierName: 'Beta', registrationNumber: '2001/111111/07', vatNumber: VALID_VAT_B }),
    ]);
    expect(index.sharedRegistrations.has('2001/111111/07')).toBe(true);
    expect(index.sharedVats.has(VALID_VAT_B)).toBe(true);
  });

  it('never groups two different companies under a shared registration number', () => {
    // Found by the dry run over the real corpus. Certificate text carries the
    // verification AGENCY's registration number alongside the client's, so one
    // agency number can appear on hundreds of certificates. Grouping by that
    // number fused unrelated companies into one "entity" — and because the
    // fuzzy tier scores per entity then returns a certificate FROM that entity,
    // a query for one company came back with another company's certificate at
    // the first company's confidence.
    const index = buildMatchIndex([
      cert({ id: 'a', supplierName: 'Standard Bank Of South Africa', registrationNumber: '1999/999999/07' }),
      cert({ id: 'b', supplierName: 'Sandoz South Africa', registrationNumber: '1999/999999/07' }),
    ]);
    const keys = new Set(index.certificates.map((c) => c.entityKey));
    expect(keys.size).toBe(2);

    const result = matchSupplierInIndex(
      { key: 'r1', name: 'Standard Bank Of South Africa' },
      index,
      { asOf: ASOF },
    );
    expect(result.match?.companyName).toBe('Standard Bank Of South Africa');
  });

  it('never returns a certificate that scored below the threshold', () => {
    // The consequence of the grouping bug: the returned certificate must be the
    // one the score belongs to, always.
    const index = buildMatchIndex([
      cert({ id: 'a', supplierName: 'Aqumaat South Africa', registrationNumber: '1998/888888/07' }),
      cert({ id: 'b', supplierName: 'Nestle South Africa', registrationNumber: '1998/888888/07' }),
    ]);
    const result = matchSupplierInIndex(
      { key: 'r1', name: 'Aqumaat South Africa (Pty) Ltd' },
      index,
      { asOf: ASOF },
    );
    expect(result.match?.companyName).not.toBe('Nestle South Africa');
  });

  it('does not treat one company’s own renewals as a shared identifier', () => {
    const index = buildMatchIndex([
      cert({ id: 'a', registrationNumber: '2001/111111/07' }),
      cert({ id: 'b', registrationNumber: '2001/111111/07' }),
    ]);
    expect(index.sharedRegistrations.size).toBe(0);
  });
});
