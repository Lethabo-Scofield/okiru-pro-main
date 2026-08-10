/**
 * Field validation for certificate extraction — reject a WRONG value rather
 * than store it.
 *
 * WHY THIS EXISTS
 *
 * Field extraction runs regex over a flat text stream produced by the PDF text
 * layer, which has no notion of columns, table cells or key/value association.
 * On a B-BBEE certificate the verification AGENCY's own details sit on the same
 * page as the client's, so "the first VAT-looking number after the word VAT"
 * is frequently the agency's, not the supplier's. A registry audit found one VAT
 * number attached to 14 different companies, one certificate number
 * ("MOORE10479 — Moore Stephens' own reference) attached to 9, and 506 of 2,951
 * certificates carrying a VAT that belongs to someone else.
 *
 * A wrong value is worse than a missing one: a missing VAT shows as "not
 * captured" and invites a look at the document, while a wrong VAT is quietly
 * authoritative and will be copied into a supplier database. So every check here
 * fails CLOSED — the value becomes null and the record is flagged for review.
 *
 * These are pure functions over a single value. Cross-record checks (is this VAT
 * already held by a different company?) need the registry and live in
 * reconcileSharedCertificateFields.
 */

/** Why a value was rejected — recorded on the certificate so review is actionable. */
export interface FieldRejection {
  field: string;
  value: string;
  reason: string;
}

/**
 * South African VAT numbers are 10 digits, always begin with 4, and carry a
 * Luhn (mod-10) check digit. A transposed or mis-OCR'd digit fails the checksum,
 * which is exactly the failure mode of reading a number out of a text soup.
 */
export function isValidSaVatNumber(value: string | null | undefined): boolean {
  if (!value) return false;
  const digits = String(value).replace(/\D/g, '');
  if (digits.length !== 10) return false;
  if (!digits.startsWith('4')) return false;
  return passesLuhn(digits);
}

export function passesLuhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Verification agencies stamp their OWN reference on every certificate they
 * issue, in the same place a client certificate number would appear. Those
 * references carry the agency's name or acronym, so a "certificate number"
 * containing the agency's name is theirs, not the client's.
 *
 * Deliberately driven by the agency name we already extracted rather than a
 * hardcoded list of agencies — a new agency needs no code change. The static
 * hints only cover acronym forms that never appear in the agency NAME field.
 */
const AGENCY_REFERENCE_HINTS = [
  /^MOORE/i,
  /^SLI\d/i,
  /^NGH\d/i,
  /^HR[_-]GEN[_-]/i,
  /\bREV\s*\d+$/i, // "… - REV 17": a revision of the agency's own template
];

export function looksLikeAgencyReference(
  certificateNumber: string | null | undefined,
  verificationAgency?: string | null,
): boolean {
  if (!certificateNumber) return false;
  const value = String(certificateNumber).trim();
  if (!value) return false;

  if (AGENCY_REFERENCE_HINTS.some((re) => re.test(value))) return true;

  // Does the number embed the agency's own name? "MOORE10479" when the agency
  // is "Moore Stephens", "SANLAM…" when the agency is Sanlam, and so on.
  const agency = String(verificationAgency ?? '').trim();
  if (agency.length >= 3) {
    const firstWord = agency.split(/[\s(,.]+/)[0];
    if (firstWord.length >= 3 && new RegExp(`^${escapeRegExp(firstWord)}`, 'i').test(value)) {
      return true;
    }
  }
  return false;
}

function escapeRegExp(v: string): string {
  return v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * An ownership percentage must be a real percentage. Values outside 0–100 are a
 * misread (a score, a rand value, a year), and a black-women percentage can
 * never exceed total black ownership.
 */
export function isPlausibleOwnership(value: number | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

export function ownershipPairIsCoherent(
  blackOwnership: number | null | undefined,
  blackWomenOwnership: number | null | undefined,
): boolean {
  if (!isPlausibleOwnership(blackOwnership) || !isPlausibleOwnership(blackWomenOwnership)) return true;
  // Black women are a subset of black owners; more women than total is a misread.
  return (blackWomenOwnership as number) <= (blackOwnership as number) + 0.01;
}

/** A B-BBEE level is 1–8. Anything else came from the wrong part of the page. */
export function isPlausibleBbbeeLevel(value: number | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  return Number.isInteger(value) && value >= 1 && value <= 8;
}

export interface ValidatableFields {
  vatNumber?: string | null;
  certificateNumber?: string | null;
  verificationAgency?: string | null;
  bbbeeLevel?: number | null;
  blackOwnership?: number | null;
  blackWomenOwnership?: number | null;
}

/**
 * Apply every single-value check, returning the cleaned fields plus the reason
 * for each rejection. Never throws and never invents a value — a field is either
 * unchanged or nulled with a recorded reason.
 */
export function validateCertificateFields<T extends ValidatableFields>(
  fields: T,
): { fields: T; rejections: FieldRejection[] } {
  const out: T = { ...fields };
  const rejections: FieldRejection[] = [];

  if (out.vatNumber && !isValidSaVatNumber(out.vatNumber)) {
    rejections.push({
      field: 'vatNumber',
      value: String(out.vatNumber),
      reason: 'Not a valid SA VAT number (must be 10 digits, start with 4, and pass the checksum)',
    });
    out.vatNumber = null;
  }

  if (out.certificateNumber && looksLikeAgencyReference(out.certificateNumber, out.verificationAgency)) {
    rejections.push({
      field: 'certificateNumber',
      value: String(out.certificateNumber),
      reason: "Looks like the verification agency's own reference, not the client's certificate number",
    });
    out.certificateNumber = null;
  }

  if (out.bbbeeLevel !== null && out.bbbeeLevel !== undefined && !isPlausibleBbbeeLevel(out.bbbeeLevel)) {
    rejections.push({
      field: 'bbbeeLevel',
      value: String(out.bbbeeLevel),
      reason: 'B-BBEE level must be an integer 1–8',
    });
    out.bbbeeLevel = null;
  }

  for (const f of ['blackOwnership', 'blackWomenOwnership'] as const) {
    const v = out[f];
    if (v !== null && v !== undefined && !isPlausibleOwnership(v as number)) {
      rejections.push({ field: f, value: String(v), reason: 'Ownership percentage outside 0–100' });
      (out as ValidatableFields)[f] = null;
    }
  }

  if (!ownershipPairIsCoherent(out.blackOwnership, out.blackWomenOwnership)) {
    rejections.push({
      field: 'blackWomenOwnership',
      value: String(out.blackWomenOwnership),
      reason: 'Black women ownership exceeds total black ownership — one of the two was misread',
    });
    out.blackWomenOwnership = null;
  }

  return { fields: out, rejections };
}
