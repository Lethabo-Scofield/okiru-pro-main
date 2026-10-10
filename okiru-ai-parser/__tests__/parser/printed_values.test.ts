/**
 * Printed values made readable under their skill's field types.
 *
 * The skills copy values as printed: a year end as "Wednesday, 30 June 2027",
 * an agency as "ACME VERIFICATION (PTY) LTD REG. 2001/012345/07". Right, and
 * unusable: the weekday form is not a date most readers parse, and the agency
 * is not called "... REG. 2001/012345/07". All names and numbers here are
 * invented.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { resetExtractionCache } from '../../src/services/extractionCache.js';
import { extractCaseEntities } from '../../src/services/caseExtraction.js';
import { extractionDomain } from '../../src/services/extractionDomain.js';
import type { DocumentExtraction, ExtractionModel } from '../../src/services/aiExtraction.js';
import type { SkillField } from '../../src/services/skills.js';
import { tidyPrintedValue, tidyPrintedValues, trimRegistrationSuffix } from '../../src/services/printedValues.js';
import type { RawExtractionInput } from '../../schemas/document_types.js';

beforeEach(() => resetExtractionCache());

const field = (name: string, type: SkillField['type']): SkillField => ({
  name, type, required: false, rowLevel: false, labels: [], description: '',
});

describe('a date field holding a full date is written yyyy-mm-dd', () => {
  it('reads the weekday forms an AFS cover and a CIPC printout use', () => {
    expect(tidyPrintedValue(field('financial_year_end', 'date'), 'Wednesday, 30 June 2027')).toBe('2027-06-30');
    expect(tidyPrintedValue(field('certificate_date', 'date'), 'Monday, August 3, 2026')).toBe('2026-08-03');
    expect(tidyPrintedValue(field('certificate_issue_date', 'date'), '7 October 2025')).toBe('2025-10-07');
    expect(tidyPrintedValue(field('incorporation_date', 'date'), '14/07/2011')).toBe('2011-07-14');
  });

  it('leaves anything that is not one whole date exactly as printed', () => {
    expect(tidyPrintedValue(field('financial_year_end', 'date'), 'February')).toBe('February');
    expect(tidyPrintedValue(field('eea1_date', 'date'), '11/12/25')).toBe('11/12/25');
    expect(tidyPrintedValue(field('signing_date', 'date'), 'N/A')).toBe('N/A');
    expect(tidyPrintedValue(field('signing_date', 'date'), 45678)).toBe(45678);
  });

  it('never rewrites a text field that happens to hold a date', () => {
    expect(tidyPrintedValue(field('trading_since', 'text'), 'Wednesday, 30 June 2027')).toBe('Wednesday, 30 June 2027');
  });
});

describe('an organisation\'s name loses its trailing company number', () => {
  it('trims the registration captions a certificate footer prints', () => {
    expect(trimRegistrationSuffix('ACME VERIFICATION (PTY) LTD REG. 2001/012345/07')).toBe('ACME VERIFICATION (PTY) LTD');
    expect(trimRegistrationSuffix('Acme Verification (Pty) Ltd, Reg No: 2001 / 012345 / 07')).toBe('Acme Verification (Pty) Ltd');
    expect(trimRegistrationSuffix('Acme Verification (Pty) Ltd (2001/012345/07)')).toBe('Acme Verification (Pty) Ltd');
    expect(trimRegistrationSuffix('Acme Verification Registration number 2001/012345/07')).toBe('Acme Verification');
  });

  it('keeps a name with no registration suffix, and a practice number the skills ask for', () => {
    expect(trimRegistrationSuffix('ACME VERIFICATION (PTY) LTD')).toBe('ACME VERIFICATION (PTY) LTD');
    expect(trimRegistrationSuffix('P. van Wyk, Practice no. 12345')).toBe('P. van Wyk, Practice no. 12345');
    expect(trimRegistrationSuffix('Unit 2001 Trading')).toBe('Unit 2001 Trading');
    expect(trimRegistrationSuffix('REG. 2001/012345/07')).toBe('REG. 2001/012345/07');
  });

  it('only on name fields: a registration number stays a registration number', () => {
    expect(tidyPrintedValue(field('issuing_body', 'text'), 'ACME VERIFICATION REG. 2001/012345/07')).toBe('ACME VERIFICATION');
    expect(tidyPrintedValue(field('supplier_name', 'text'), 'Beta Cover Ltd Reg No 2010/005577/06')).toBe('Beta Cover Ltd');
    expect(tidyPrintedValue(field('registration_number', 'regno'), 'REG. 2001/012345/07')).toBe('REG. 2001/012345/07');
    expect(tidyPrintedValue(field('scope_of_declaration', 'text'), 'see REG. 2001/012345/07')).toBe('see REG. 2001/012345/07');
  });
});

describe('over a case\'s extractions', () => {
  const CERT = 'esd__valid_b_bbee_verification_certificate_per_sampled_supplier';
  const skillFor = (id: string) => extractionDomain('bbbee').skillFor(id);

  it('tidies the fields the document\'s own skill types, and leaves derived figures alone', () => {
    const cert: DocumentExtraction = {
      documentId: CERT, documentName: 'Supplier certificate', sourceFile: 'cert.pdf',
      values: [
        { field: 'issuing_body', value: 'ACME VERIFICATION (PTY) LTD REG. 2001/012345/07', sourceFile: 'cert.pdf', sourceDocumentId: CERT },
        { field: 'certificate_issue_date', value: 'Monday, 2 September 2024', sourceFile: 'cert.pdf', sourceDocumentId: CERT },
        { field: 'derived_total_score', value: 'Monday, 2 September 2024', sourceFile: 'cert.pdf', sourceDocumentId: CERT, source: { method: 'derived', quote: 'x' } },
      ],
      missingFields: [], unexpectedFields: [], exceptions: [],
    };
    tidyPrintedValues([cert], skillFor);
    const value = (name: string) => cert.values.find((v) => v.field === name)?.value;
    expect(value('issuing_body')).toBe('ACME VERIFICATION (PTY) LTD');
    expect(value('certificate_issue_date')).toBe('2024-09-02');
    expect(value('derived_total_score')).toBe('Monday, 2 September 2024');
  });

  it('runs inside extractCaseEntities, after the model read', async () => {
    const certificate: RawExtractionInput = {
      file_id: 'c1', filename: 'Beta Cover bbbee-certificate.pdf', mime_type: 'application/pdf', tables: [], metadata: {},
      raw_text: [
        'Generic B-BBEE Verification Certificate',
        'BETA COVER LIMITED',
        'LEVEL ONE CONTRIBUTOR',
        'Black Ownership Percentage 51.00%',
        'Effective Date Used Monday, 2 September 2024',
        'Expiry Date 3 March 2027',
        'ACME VERIFICATION (PTY) LTD REG. 2001/012345/07',
        'BVA 999',
      ].join('\n'),
    };
    const model: ExtractionModel = {
      name: 'stub',
      async complete(_system, user) {
        if (!/EXPECTED JSON KEYS: [^\n]*issuing_body/.test(user)) return JSON.stringify({ not_this_document: true });
        return JSON.stringify({
          supplier_name: 'BETA COVER LIMITED',
          bee_level: 'LEVEL ONE CONTRIBUTOR',
          certificate_issue_date: 'Monday, 2 September 2024',
          certificate_expiry_date: '3 March 2027',
          issuing_body: 'ACME VERIFICATION (PTY) LTD REG. 2001/012345/07',
        });
      },
    };
    const result = await extractCaseEntities([certificate], model);
    const values = result!.extractions.flatMap((e) => e.values);
    expect(values.find((v) => v.field === 'issuing_body')?.value).toBe('ACME VERIFICATION (PTY) LTD');
    expect(values.find((v) => v.field === 'certificate_issue_date')?.value).toBe('2024-09-02');
    expect(values.find((v) => v.field === 'certificate_expiry_date')?.value).toBe('2027-03-03');
  });
});
