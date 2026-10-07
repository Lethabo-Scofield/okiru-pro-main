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
 * A CIPC registration number as printed. Registers, share certificates and the
 * CIPC's own disclosure certificate write it with spaced slashes
 * ("2019 / 111222 / 07") as often as without, and both are the same number.
 */
export const CIPC_REGISTRATION_PATTERN = /(?<!\d)(\d{4})\s*\/\s*(\d{6})\s*\/\s*(\d{2})(?!\d)/;

/**
 * CIPC company registration: `YYYY/NNNNNN/NN`. We validate the shape and a
 * plausible incorporation year. The `/NN` entity-type suffix is left informational
 * (unknown suffixes are not treated as failures — the vocabulary evolves).
 */
export function validateCipcRegistration(raw: unknown): ChecksumResult {
  const value = String(raw ?? '').trim();
  const match = value.match(CIPC_REGISTRATION_PATTERN);
  if (!match) return { valid: false, reason: 'Registration must be YYYY/NNNNNN/NN' };

  const year = Number(match[1]);
  const currentYear = new Date().getFullYear();
  if (year < 1900 || year > currentYear + 1) return { valid: false, reason: 'Registration year implausible' };
  return { valid: true };
}

/**
 * The registration number in its one written form, `YYYY/NNNNNN/NN`, or null
 * when the value is not a valid registration number. Spaces around the slashes
 * are layout, not part of the number, so "2019 / 111222 / 07" and
 * "2019/111222/07" normalise to the same value and compare equal downstream.
 */
export function normalizeCipcRegistration(raw: unknown): string | null {
  if (!validateCipcRegistration(raw).valid) return null;
  const match = String(raw ?? '').match(CIPC_REGISTRATION_PATTERN)!;
  return `${match[1]}/${match[2]}/${match[3]}`;
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
 * Money, whatever else the name contains. "Excluding VAT" is the commonest
 * suffix on an amount in South African paperwork — claimed_spend_ex_vat on
 * every supplier row, fuel_rand_excl_vat on every vehicle sheet — and matching
 * the fragment "vat" sent each of those amounts through the VAT-number check,
 * which reported every one as "likely misread".
 */
const MONEY_FIELD =
  /(^|_)(ex|excl|incl|exclusive|inclusive)_vat(_|$)|(^|_)(rand|zar|amount|spend|cost|price|total|value|fee|charge|tariff)(_|$)/;

function plainName(fieldName: string): string {
  return String(fieldName ?? '').toLowerCase();
}

export function isSaIdField(fieldName: string): boolean {
  const f = plainName(fieldName);
  return !MONEY_FIELD.test(f) && /id_number|identity|sa_id/.test(f);
}

/** A VAT REGISTRATION number — a field that names the number, not one that mentions VAT. */
export function isVatNumberField(fieldName: string): boolean {
  const f = plainName(fieldName);
  return !MONEY_FIELD.test(f) && /(^|_)vat_?(number|no|nr|reg|registration)(_|$)/.test(f);
}

/** A company registration (CIPC) — never a vehicle's, and never a VAT registration. */
export function isCompanyRegistrationField(fieldName: string): boolean {
  const f = plainName(fieldName);
  if (MONEY_FIELD.test(f) || /vehicle|licen[cs]e|plate/.test(f) || isVatNumberField(f)) return false;
  // "cipc" names the NUMBER only on its own or as cipc_number/cipc_registration:
  // cipc_stamp_present and cipc_director_history_consistent are yes/no checks,
  // and reading them as registrations put "No" through the CIPC checksum.
  return /registration_number|company_number|(^|_)cipc(_(number|no|registration|reg_no|registration_number))?$/.test(f);
}

/**
 * Pick the checksum validator for a field by name, or null if the field carries
 * no checksummable identifier. extract_fields picks its identifier patterns
 * with the same three classifiers, so the two cannot drift apart again.
 */
export function checksumForField(fieldName: string, value: unknown): ChecksumResult | null {
  if (isSaIdField(fieldName)) return validateSaId(value);
  if (isCompanyRegistrationField(fieldName)) return validateCipcRegistration(value);
  if (isVatNumberField(fieldName)) return validateVatNumber(value);
  return null;
}
