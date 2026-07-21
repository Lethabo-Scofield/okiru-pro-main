import { describe, expect, it } from 'vitest';
import {
  validateSaId,
  validateCipcRegistration,
  validateVatNumber,
  checksumForField,
} from '../../parser/checksums.js';
import { extractFields } from '../../parser/extract_fields.js';
import type { FieldKnowledge } from '../../graph/ontology_models.js';

describe('validateSaId (Luhn)', () => {
  it('accepts a Luhn-valid 13-digit ID', () => {
    // 8001015009087 is a canonical Luhn-valid SA ID test value.
    expect(validateSaId('8001015009087').valid).toBe(true);
  });
  it('rejects a single-digit OCR corruption (checksum breaks)', () => {
    expect(validateSaId('8001015009088').valid).toBe(false);
  });
  it('rejects wrong length and impossible dates', () => {
    expect(validateSaId('12345').valid).toBe(false);
    expect(validateSaId('8099015009087').valid).toBe(false); // month 99
  });
});

describe('validateCipcRegistration', () => {
  it('accepts a well-formed registration with a plausible year', () => {
    expect(validateCipcRegistration('2019/111222/07').valid).toBe(true);
  });
  it('rejects bad shape and implausible years', () => {
    expect(validateCipcRegistration('19/111222/07').valid).toBe(false);
    expect(validateCipcRegistration('1650/111222/07').valid).toBe(false);
  });
});

describe('validateVatNumber', () => {
  it('accepts 10 digits starting with 4', () => {
    expect(validateVatNumber('4123456789').valid).toBe(true);
  });
  it('rejects wrong length or wrong prefix', () => {
    expect(validateVatNumber('123456789').valid).toBe(false);
    expect(validateVatNumber('5123456789').valid).toBe(false);
  });
});

describe('checksumForField dispatch', () => {
  it('routes by field name and returns null for non-identifier fields', () => {
    expect(checksumForField('director_id_number', '8001015009087')?.valid).toBe(true);
    expect(checksumForField('company_registration_number', '2019/111222/07')?.valid).toBe(true);
    expect(checksumForField('vat_number', '4123456789')?.valid).toBe(true);
    expect(checksumForField('supplier_name', 'ABC')).toBeNull();
  });
});

function idField(): FieldKnowledge {
  return {
    field: { name: 'id_number', data_type: 'string', description: '', calculator_key: null },
    patterns: [{ name: 'sa_id', regex: '\\b(\\d{13})\\b' }],
    rules: [],
  } as unknown as FieldKnowledge;
}

describe('extractFields checksum integration', () => {
  it('boosts confidence for a checksum-valid ID', () => {
    const out = extractFields(
      { file_id: 'f', filename: 'f', mime_type: 'text/plain', raw_text: 'ID Number: 8001015009087', tables: [], metadata: {} },
      [idField()],
    );
    expect(out.id_number.confidence).toBeGreaterThanOrEqual(0.95);
    expect(out.id_number.matched_patterns).toContain('checksum_valid');
  });

  it('caps confidence below the pass threshold for a corrupted ID', () => {
    const out = extractFields(
      { file_id: 'f', filename: 'f', mime_type: 'text/plain', raw_text: 'ID Number: 8001015009088', tables: [], metadata: {} },
      [idField()],
    );
    expect(out.id_number.confidence).toBeLessThan(0.85);
    expect(out.id_number.matched_patterns.some((p) => p.startsWith('checksum_failed'))).toBe(true);
  });
});
