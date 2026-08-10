/**
 * Mapping Document Intelligence key/value pairs onto certificate fields.
 *
 * The fixtures are real shapes taken from the probe against production
 * certificates (Hudaco/Ambro Steel and a Bidvest group certificate), including
 * the awkward ones: an empty VAT value, an ownership block collapsed into a
 * single run of percentages, and a certificate number that embeds the issuing
 * agency's name (which is legitimate — it is what the document calls it).
 */
import { describe, expect, it } from 'vitest';
import {
  detectDocumentKind,
  parseCheckedLevel,
  mapKeyValuePairs,
  parseCertDate,
  parseLevel,
  parsePercent,
  parseRegistrationNumber,
  parseVat,
} from '../certificateDocIntelligence.js';

const kv = (pairs: Array<[string, string]>) =>
  pairs.map(([k, v]) => ({ key: { content: k }, value: { content: v } }));

describe('field parsers', () => {
  it('reads a CIPC registration number', () => {
    expect(parseRegistrationNumber('1984/005432/07')).toBe('1984/005432/07');
    expect(parseRegistrationNumber('Reg 1946/021180/06 issued')).toBe('1946/021180/06');
    expect(parseRegistrationNumber('no number here')).toBeNull();
  });

  it('reads a VAT number and ignores other 10-digit runs', () => {
    expect(parseVat('4740230513')).toBe('4740230513');
    expect(parseVat('VAT 4740 230 513')).toBe('4740230513');
    expect(parseVat('1234567890')).toBeNull(); // does not start with 4
  });

  it('reads a level as digit or word', () => {
    expect(parseLevel('Level 4')).toBe(4);
    expect(parseLevel('Level One')).toBe(1);
    expect(parseLevel('8')).toBe(8);
    expect(parseLevel('Level 9')).toBeNull();
  });

  it('reads a percentage, rejecting impossible ones', () => {
    expect(parsePercent('50.27%')).toBe(50.27);
    expect(parsePercent('100 %')).toBe(100);
    expect(parsePercent('135.00%')).toBeNull(); // procurement recognition, not ownership
  });

  it('normalises dates to ISO', () => {
    expect(parseCertDate('28 September 2026')).toBe('2026-09-28');
    expect(parseCertDate('22 May 2026')).toBe('2026-05-22');
    expect(parseCertDate('not a date')).toBeNull();
  });
});

describe('mapKeyValuePairs', () => {
  it('maps the Hudaco/Ambro Steel shape', () => {
    const fields = mapKeyValuePairs(kv([
      ['Company Address:', 'Building 9, Greenstone Hill Office Park'],
      ['Company Certificate No:', 'Moore10479 - 250523 - 02 (250528)'],
      ['VAT Registration No:', '4740230513'],
      ['Company Registration No:', '1984/005432/07'],
      ['Expiry Date:', '22 May 2026'],
    ]));
    expect(fields.companyRegistrationNumber).toBe('1984/005432/07');
    expect(fields.vatNumber).toBe('4740230513');
    // Legitimate: this is what the document itself labels "Company Certificate No".
    expect(fields.certificateNumber).toBe('Moore10479 - 250523 - 02 (250528)');
    expect(fields.expiryDate).toBe('2026-05-22');
  });

  it('does not mistake VAT Registration No for the company registration number', () => {
    const fields = mapKeyValuePairs(kv([['VAT Registration No:', '4740230513']]));
    expect(fields.companyRegistrationNumber).toBeNull();
    expect(fields.vatNumber).toBe('4740230513');
  });

  it('ignores a labelled field with an empty value', () => {
    // The Bidvest certificate prints "VAT Number" with nothing after it.
    const fields = mapKeyValuePairs(kv([['VAT Number', ''], ['Registration Number:', '1946/021180/06']]));
    expect(fields.vatNumber).toBeNull();
    expect(fields.companyRegistrationNumber).toBe('1946/021180/06');
  });

  it('does not read procurement recognition level as a B-BBEE level or ownership', () => {
    const fields = mapKeyValuePairs(kv([['Procurement Recognition Level', '135.00%']]));
    expect(fields.bbbeeLevel).toBeNull();
    expect(fields.blackOwnership).toBeNull();
  });

  it('separates black women ownership from total black ownership', () => {
    const fields = mapKeyValuePairs(kv([
      ['Black Ownership', '50.27%'],
      ['Black Women Ownership', '22.99%'],
    ]));
    expect(fields.blackOwnership).toBe(50.27);
    expect(fields.blackWomenOwnership).toBe(22.99);
  });

  it('keeps the first labelled expiry when the document repeats it', () => {
    const fields = mapKeyValuePairs(kv([
      ['Expiry Date:', '22 May 2026'],
      ['Expiry Date:', '31 December 2099'],
    ]));
    expect(fields.expiryDate).toBe('2026-05-22');
  });

  it('returns all nulls for pairs that mean nothing to us', () => {
    const fields = mapKeyValuePairs(kv([['Technical Signatory:', 'Stanley Grau']]));
    expect(fields.vatNumber).toBeNull();
    expect(fields.companyRegistrationNumber).toBeNull();
    expect(fields.bbbeeLevel).toBeNull();
  });
});

describe('affidavits (a large share of the archive)', () => {
  const AFFIDAVIT = kv([
    ['Full name & Surname', 'SARHA WILHELMINA THYSSEN'],
    ['Identity number', '521206 0072 085'],
    ['Enterprise Name:', 'PAYROLL EDUCATION (PTY) LTD'],
    ['Registration Number:', '1997/001443/07'],
    ['Vat Number (If applicable)', '4020165520'],
    ['Level Four (100% B-BBEE procurement recognition)', ':selected:'],
    ['Deponent Signature:', 'A Pensar'],
    ['commissioner', 'Reinhart van Zyl Chartered Accountant (SA)'],
  ]);

  it('recognises a sworn affidavit', () => {
    expect(detectDocumentKind(AFFIDAVIT)).toBe('affidavit');
  });

  it('reads the level from a TICKED box, where the level is in the label', () => {
    expect(parseCheckedLevel('Level Four (100% B-BBEE procurement recognition)', ':selected:')).toBe(4);
    expect(mapKeyValuePairs(AFFIDAVIT).bbbeeLevel).toBe(4);
  });

  it('ignores an UNticked box carrying the same label', () => {
    expect(parseCheckedLevel('Level One (135% B-BBEE procurement recognition)', ':unselected:')).toBeNull();
  });

  it('still recovers registration number and VAT from the affidavit form', () => {
    const f = mapKeyValuePairs(AFFIDAVIT);
    expect(f.companyRegistrationNumber).toBe('1997/001443/07');
    expect(f.vatNumber).toBe('4020165520');
  });

  it('recognises an agency certificate as the other kind', () => {
    expect(detectDocumentKind(kv([
      ['Company Certificate No:', 'Moore10479 - 250523 - 02'],
      ['Expiry Date:', '22 May 2026'],
      ['Verification Agency', 'Moore Stephens'],
    ]))).toBe('certificate');
  });
});
