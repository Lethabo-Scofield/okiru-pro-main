/**
 * Field validation rejects wrong values instead of storing them.
 *
 * Context: a registry audit found 506 of 2,951 certificates carrying a VAT
 * number belonging to a different company, and 327 carrying the verification
 * agency's own reference as the "certificate number". A wrong value is worse
 * than a missing one — it is quietly authoritative — so every check fails
 * closed, to null plus a recorded reason.
 */
import { describe, expect, it } from 'vitest';
import {
  isValidSaVatNumber,
  looksLikeAgencyReference,
  ownershipPairIsCoherent,
  passesLuhn,
  validateCertificateFields,
} from '../certificateFieldValidation.js';

describe('SA VAT numbers', () => {
  it('accepts a well-formed number that passes the checksum', () => {
    // 4 + 9 digits where the last is a valid Luhn check digit.
    expect(passesLuhn('4000000002')).toBe(true);
    expect(isValidSaVatNumber('4000000002')).toBe(true);
  });

  it('rejects the wrong length or a bad prefix', () => {
    expect(isValidSaVatNumber('400000000')).toBe(false);   // 9 digits
    expect(isValidSaVatNumber('40000000020')).toBe(false); // 11 digits
    expect(isValidSaVatNumber('5000000009')).toBe(false);  // does not start with 4
  });

  it('rejects a transposition the checksum can catch', () => {
    const good = '4000000002';
    expect(isValidSaVatNumber(good)).toBe(true);
    // Change one digit — the check digit no longer agrees.
    expect(isValidSaVatNumber('4000000012')).toBe(false);
  });

  it('tolerates spacing and non-digits around the number', () => {
    expect(isValidSaVatNumber('4000 000 002')).toBe(true);
  });

  it('rejects null and empty', () => {
    expect(isValidSaVatNumber(null)).toBe(false);
    expect(isValidSaVatNumber('')).toBe(false);
  });
});

describe('agency references masquerading as certificate numbers', () => {
  it('catches the exact values found in production', () => {
    expect(looksLikeAgencyReference('MOORE10479 - 250523 - 02 (250528)')).toBe(true);
    expect(looksLikeAgencyReference('SLI00522 - REV 17')).toBe(true);
    expect(looksLikeAgencyReference('NGH010202-REV8')).toBe(true);
    expect(looksLikeAgencyReference('HR_GEN_3435_24'.replace(/_/g, '-'))).toBe(true);
  });

  it('catches a number embedding the agency name we already extracted', () => {
    expect(looksLikeAgencyReference('EMPOWERDEX-2024-113', 'Empowerdex (Pty) Ltd')).toBe(true);
  });

  it('leaves a genuine client certificate number alone', () => {
    expect(looksLikeAgencyReference('2024/00123')).toBe(false);
    expect(looksLikeAgencyReference('BEE-2025-0098', 'Moore Stephens')).toBe(false);
  });
});

describe('ownership coherence', () => {
  it('rejects black women ownership above total black ownership', () => {
    expect(ownershipPairIsCoherent(30, 55)).toBe(false);
  });

  it('allows equal values and normal subsets', () => {
    expect(ownershipPairIsCoherent(100, 100)).toBe(true);
    expect(ownershipPairIsCoherent(51, 25)).toBe(true);
  });

  it('does not judge when either side is missing', () => {
    expect(ownershipPairIsCoherent(null, 40)).toBe(true);
    expect(ownershipPairIsCoherent(40, null)).toBe(true);
  });
});

describe('validateCertificateFields', () => {
  it('nulls a bad VAT and says why, leaving good fields untouched', () => {
    const { fields, rejections } = validateCertificateFields({
      vatNumber: '1234567890',
      bbbeeLevel: 1,
      blackOwnership: 100,
    });
    expect(fields.vatNumber).toBeNull();
    expect(fields.bbbeeLevel).toBe(1);
    expect(fields.blackOwnership).toBe(100);
    expect(rejections).toHaveLength(1);
    expect(rejections[0].field).toBe('vatNumber');
    expect(rejections[0].reason).toMatch(/checksum/i);
  });

  it('rejects an out-of-range B-BBEE level', () => {
    const { fields, rejections } = validateCertificateFields({ bbbeeLevel: 47 });
    expect(fields.bbbeeLevel).toBeNull();
    expect(rejections[0].field).toBe('bbbeeLevel');
  });

  it('rejects an impossible ownership percentage', () => {
    const { fields } = validateCertificateFields({ blackOwnership: 2024 });
    expect(fields.blackOwnership).toBeNull();
  });

  it('is a no-op on a clean record', () => {
    const input = {
      vatNumber: '4000000002',
      certificateNumber: '2024/00123',
      bbbeeLevel: 2,
      blackOwnership: 51,
      blackWomenOwnership: 30,
    };
    const { fields, rejections } = validateCertificateFields(input);
    expect(rejections).toHaveLength(0);
    expect(fields).toEqual(input);
  });
});
