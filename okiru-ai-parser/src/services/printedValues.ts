/**
 * PRINTED VALUES, MADE READABLE — without changing what they say.
 *
 * The skills tell the model to copy values as printed, and it does: a year end
 * comes back as "Wednesday, 30 June 2027", a CIPC printout's date as
 * "Monday, August 3, 2026", and a verification agency as
 * "ACME VERIFICATION (PTY) LTD REG. 2001/012345/07" (the agency's own company
 * number, printed beside its name in the certificate's footer). All three are
 * right, and all three are hard to use: the weekday form is not a date most
 * readers parse, and the agency is not called "... REG. 2001/012345/07".
 *
 * Two rules, applied in code after the read, to the fields a document's skill
 * types:
 *
 *  - A `date` field holding a full date is written as yyyy-mm-dd (South African
 *    day-first order; skillDerivations.dateOf). Anything that is not one whole
 *    date (a month alone, "N/A", a two-digit year) is left exactly as printed.
 *  - An organisation's name loses a trailing company-registration number and
 *    its caption ("REG.", "Reg No:", "Registration number"). Only on name
 *    fields; never on a registration-number field, and never a practice or
 *    profession number (the skills ask for those with the name).
 *
 * Pure: no I/O, no model calls. caseExtraction runs it over every skill-read
 * document after the reads (and the agent pass) are done, so no model prompt
 * changes because of it.
 */
import type { DocumentExtraction } from './aiExtraction.js';
import { dateOf } from './skillDerivations.js';
import type { Skill, SkillField } from './skills.js';

/** A CIPC company number ("2001/012345/07", "2001 / 012345 / 07"), the form a registration suffix takes. */
const COMPANY_NUMBER = String.raw`\d{4}\s*\/\s*\d{4,7}\s*\/\s*\d{2}`;

/**
 * A trailing registration caption and number: "REG. 2001/012345/07",
 * "(Reg No: 2001/012345/07)", ", Registration number 2001/012345/07". The
 * caption is required unless the number sits in brackets: a bare trailing
 * number is left alone (it may be part of the name).
 */
const REGISTRATION_SUFFIX = new RegExp(
  String.raw`\s*[,;\-–]?\s*(?:\(\s*(?:(?:company\s+)?reg(?:istration)?\.?\s*(?:no\.?|nr\.?|number)?\s*:?\s*)?${COMPANY_NUMBER}\s*\)|(?:company\s+)?reg(?:istration)?\.?\s*(?:no\.?|nr\.?|number)?\s*:?\s*${COMPANY_NUMBER})\s*$`,
  'i',
);

/** "ACME (PTY) LTD REG. 2001/012345/07" → "ACME (PTY) LTD". Unchanged when there is no registration suffix. */
export function trimRegistrationSuffix(name: string): string {
  const trimmed = name.replace(REGISTRATION_SUFFIX, '').trim();
  // A value that was ONLY a registration number is not a name to shorten.
  return trimmed.length > 0 ? trimmed : name;
}

/** Fields that hold an organisation's or a person's name. */
function isNameField(field: SkillField): boolean {
  if (field.type !== 'text') return false;
  return /(?:^|_)name$/.test(field.name) || field.name === 'issuing_body' || field.name === 'entity_or_participant';
}

/** One printed value made readable under its skill field's type. The value itself when nothing applies. */
export function tidyPrintedValue(field: SkillField, value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (field.type === 'date') {
    const iso = dateOf(value);
    return iso ?? value;
  }
  if (isNameField(field)) return trimRegistrationSuffix(value);
  return value;
}

/**
 * Apply tidyPrintedValue to every document-level value of every skill-read
 * extraction (rows are left as read). `skillFor` names the skill a document id
 * was read under; a document without one is untouched.
 */
export function tidyPrintedValues(
  extractions: DocumentExtraction[],
  skillFor: (documentId: string) => Skill | null,
): void {
  for (const extraction of extractions) {
    if (extraction.error) continue;
    const skill = skillFor(extraction.documentId);
    if (!skill) continue;
    const fields = new Map(skill.fields.filter((f) => !f.rowLevel).map((f) => [f.name, f]));
    for (const value of extraction.values) {
      // A derived figure is already the code's own; only printed reads are tidied.
      if (value.source?.method === 'derived') continue;
      const field = fields.get(value.field);
      if (!field) continue;
      value.value = tidyPrintedValue(field, value.value);
    }
  }
}
