/**
 * Structural / checksum validation for SA identifiers.
 *
 * The regex extractor captures these at a FIXED confidence (e.g. a 13-digit run
 * scores 0.88), which means an OCR misread (6→8, 1→7) sails through unnoticed.
 * These validators turn the identifier's own check digit / format into a signal:
 * a pass lets us raise confidence, a fail drops it below the review threshold so
 * validate.ts flags the field instead of feeding a corrupted value to the calc.
 */

export interface ChecksumResult {
  valid: boolean;
  reason?: string;
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/** Luhn (mod-10) — the algorithm South African ID numbers use for their 13th digit. */
function passesLuhn(digits: string): boolean {
  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = Number(digits[i]);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

/**
 * SA ID: 13 digits, `YYMMDD` prefix must be a plausible date, Luhn check digit.
 */
export function validateSaId(raw: unknown): ChecksumResult {
  const digits = digitsOnly(String(raw ?? ''));
  if (digits.length !== 13) return { valid: false, reason: 'ID must be 13 digits' };

  const month = Number(digits.slice(2, 4));
  const day = Number(digits.slice(4, 6));
  if (month < 1 || month > 12) return { valid: false, reason: 'ID month out of range' };
  if (day < 1 || day > 31) return { valid: false, reason: 'ID day out of range' };

  if (!passesLuhn(digits)) return { valid: false, reason: 'ID checksum (Luhn) failed' };
  return { valid: true };
}

/**
 * CIPC company registration: `YYYY/NNNNNN/NN`. We validate the shape and a
 * plausible incorporation year. The `/NN` entity-type suffix is left informational
 * (unknown suffixes are not treated as failures — the vocabulary evolves).
 */
export function validateCipcRegistration(raw: unknown): ChecksumResult {
  const value = String(raw ?? '').trim();
  const match = value.match(/\b(\d{4})\/(\d{6})\/(\d{2})\b/);
  if (!match) return { valid: false, reason: 'Registration must be YYYY/NNNNNN/NN' };

  const year = Number(match[1]);
  const currentYear = new Date().getFullYear();
  if (year < 1900 || year > currentYear + 1) return { valid: false, reason: 'Registration year implausible' };
  return { valid: true };
}

/**
 * SARS VAT number: 10 digits beginning with 4 (the reliable public rule; SARS's
 * internal check-digit algorithm is not published, so we do not assert it).
 */
export function validateVatNumber(raw: unknown): ChecksumResult {
  const digits = digitsOnly(String(raw ?? ''));
  if (digits.length !== 10) return { valid: false, reason: 'VAT number must be 10 digits' };
  if (!digits.startsWith('4')) return { valid: false, reason: 'VAT number must start with 4' };
  return { valid: true };
}

/**
 * Pick the checksum validator for a field by name, or null if the field carries
 * no checksummable identifier. Mirrors the field-name cues extract_fields uses.
 */
export function checksumForField(fieldName: string, value: unknown): ChecksumResult | null {
  if (/id_number|identity|sa_id/.test(fieldName)) return validateSaId(value);
  if (/registration_number|cipc|company_number/.test(fieldName)) return validateCipcRegistration(value);
  if (/vat/.test(fieldName)) return validateVatNumber(value);
  return null;
}
