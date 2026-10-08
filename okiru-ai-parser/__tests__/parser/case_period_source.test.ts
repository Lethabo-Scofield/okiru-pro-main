/**
 * The measurement period every period-dependent derived figure is computed
 * over is the MEASURED ENTITY's own financial year — from the workbook's
 * Instructions sheet or its own financial statements. A supplier's B-BBEE
 * certificate prints the SUPPLIER's year end; taking it shifted the EMP201 and
 * SED totals onto the wrong twelve months ("Only 5 of the period's months")
 * while they were shown to reviewers as derived figures.
 *
 * And an AFS prints its year end the way people write dates ("Friday,
 * 28 February 2025"): a date reader that refuses that form lets the next
 * document's date win. All values are invented.
 */
import { describe, expect, it } from 'vitest';
import { addSkillDerivations, casePeriod } from '../../src/services/caseExtraction.js';
import { dateOf } from '../../src/services/skillDerivations.js';
import type { DocumentExtraction } from '../../src/services/aiExtraction.js';

const EMP201 = 'skills_development__sars_emp201_submissions_monthly_employer_declarations';
const ESD_AFS = 'esd__audited_financial_statements_or_signed_management_accounts_w';

function extraction(documentId: string, values: Record<string, unknown>, element?: string): DocumentExtraction {
  return {
    documentId,
    documentName: documentId,
    ...(element ? { element } : {}),
    sourceFile: 'evidence.pdf',
    values: Object.entries(values).map(([field, value]) => ({ field, value, sourceFile: 'evidence.pdf', sourceDocumentId: documentId })),
    missingFields: [],
    unexpectedFields: [],
    exceptions: [],
  };
}

describe('the measurement period comes only from the measured entity\'s own documents', () => {
  it('a supplier\'s certificate never sets it', () => {
    const supplierCertificate = extraction('B-BBEE Certificate', { financial_year_end: '30 June 2024' }, 'ESD');
    const sampledCertificate = extraction('esd__valid_b_bbee_verification_certificate_per_sampled_supplier', { financial_year_end: '2024-03-31' }, 'ESD');
    expect(casePeriod([supplierCertificate, sampledCertificate])).toBeNull();
  });

  it('the AFS sets it even when a supplier certificate is read first and the AFS prints its weekday', () => {
    const supplierCertificate = extraction('B-BBEE Certificate', { financial_year_end: '30 June 2024' }, 'ESD');
    const afs = extraction(ESD_AFS, { financial_year_end: 'Friday, 28 February 2025' }, 'ESD');
    expect(casePeriod([supplierCertificate, afs])).toEqual({ start: '2024-03-01', end: '2025-02-28' });
  });

  it('every AFS / management-accounts type counts, under whichever element it was read', () => {
    for (const id of [
      'ownership__audited_reviewed_annual_financial_statements_afs',
      'esd__audited_afs_or_signed_management_accounts_for_npat_target_de',
      'sed__audited_afs_or_signed_management_accounts',
      'annual_financial_statements',
    ]) {
      expect(casePeriod([extraction(id, { financial_year_end: '28 February 2025' })]), id)
        .toEqual({ start: '2024-03-01', end: '2025-02-28' });
    }
  });

  it('a management company\'s or scheme\'s statements never set it', () => {
    const scheme = extraction('ownership__annual_financial_statements_of_the_management_company_scheme', { financial_year_end: '30 June 2024' }, 'OWNERSHIP');
    const afs = extraction(ESD_AFS, { financial_year_end: '28 February 2025' }, 'ESD');
    expect(casePeriod([scheme])).toBeNull();
    expect(casePeriod([scheme, afs])).toEqual({ start: '2024-03-01', end: '2025-02-28' });
  });

  it('the statements for the prior financial years never set it', () => {
    const prior = extraction('sed__afs_for_each_of_the_prior_5_financial_years_where_5_year_ave', { financial_year_end: '28 February 2021' }, 'SED');
    const afs = extraction(ESD_AFS, { financial_year_end: '28 February 2025' }, 'ESD');
    expect(casePeriod([prior])).toBeNull();
    expect(casePeriod([prior, afs])).toEqual({ start: '2024-03-01', end: '2025-02-28' });
  });

  it('when the entity\'s own statements disagree, the latest year end wins whatever the upload order', () => {
    // A pack holding last year's AFS beside this year's must not derive the
    // EMP201 and SED totals over last year because that file was read first.
    const lastYear = extraction('ownership__audited_reviewed_annual_financial_statements_afs', { financial_year_end: '29 February 2024' }, 'OWNERSHIP');
    const thisYear = extraction(ESD_AFS, { financial_year_end: '28 February 2025' }, 'ESD');
    expect(casePeriod([lastYear, thisYear])).toEqual({ start: '2024-03-01', end: '2025-02-28' });
    expect(casePeriod([thisYear, lastYear])).toEqual({ start: '2024-03-01', end: '2025-02-28' });
  });

  it('the Instructions sheet still comes first', () => {
    const afs = extraction(ESD_AFS, { financial_year_end: '31 March 2025' });
    const profile = extraction('sheet_instructions', { financial_year_end: '2025-02-28' });
    expect(casePeriod([afs, profile])).toEqual({ start: '2024-03-01', end: '2025-02-28' });
  });

  it('a PDF-only pack derives the EMP201 over the client\'s year, not the supplier\'s', () => {
    const supplierCertificate = extraction('B-BBEE Certificate', { financial_year_end: '30 June 2024' }, 'ESD');
    const afs = extraction(ESD_AFS, { financial_year_end: 'Friday, 28 February 2025' }, 'ESD');
    const months = Array.from({ length: 12 }, (_, i) => {
      const month = ((i + 2) % 12) + 1; // March .. February
      const year = month >= 3 ? 2024 : 2025;
      return { tax_period: `${year}${String(month).padStart(2, '0')}`, paye_amount: '1 000.00', sdl_amount: '100.00', uif_amount: '50.00', total_liability: '1 150.00' };
    });
    const emp201 = extraction(EMP201, { emp201_rows: months });
    addSkillDerivations([supplierCertificate, afs, emp201]);
    expect(emp201.values.find((v) => v.field === 'derived_leviable_amount')?.value).toBe(120000);
    expect(emp201.exceptions.some((e) => /Only \d+ of the period's months/.test(e))).toBe(false);
  });
});

describe('a year end is read in the forms it is printed in', () => {
  it.each([
    ['Friday, 28 February 2025', '2025-02-28'],
    ['Fri 28 Feb 2025', '2025-02-28'],
    ['28-Feb-2025', '2025-02-28'],
    ['28 Feb. 2025', '2025-02-28'],
    ['28th of February 2025', '2025-02-28'],
    ['February 28, 2025', '2025-02-28'],
    ['For the year ended 28 February 2025', '2025-02-28'],
    ['2025-02-28T00:00:00', '2025-02-28'],
  ])('%s', (printed, iso) => {
    expect(dateOf(printed)).toBe(iso);
  });

  it('still refuses what is not a full date', () => {
    expect(dateOf('12345678')).toBeNull();
    expect(dateOf('February 2025')).toBeNull();
    expect(dateOf('Friday')).toBeNull();
    expect(dateOf('28 Febtober 2025')).toBeNull();
    expect(dateOf('Friday, 31 February 2025')).toBeNull();
  });
});
