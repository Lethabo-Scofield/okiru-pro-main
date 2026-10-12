/**
 * A document's own facts (its statement date, title, tariff, a printed history
 * total, a filing label, a policy's author or disclosure class) are read as
 * named skill fields and kept with the document. They never reach the case
 * resolution, where every bill's statement date would be a rival answer to
 * every other bill's, and a twelve-month total would be offered to the
 * calculator as if it were the year's figure. Every value is invented.
 */
import { describe, expect, it } from 'vitest';
import { buildSkillRegistry, loadSkills, SkillLoadError } from '../../src/services/skills.js';
import { withoutDocumentFacts } from '../../src/services/esgCaseExtraction.js';
import type { DocumentExtraction } from '../../src/services/aiExtraction.js';

const skillFile = (scope: string | null) => ({
  file: 'invented_bill.md',
  content: [
    '---',
    'id: invented_bill',
    'appliesTo: [ghg_energy__municipal_electricity_bill]',
    'element: GHG_ENERGY',
    'version: 1',
    'classify: { is: "An invented bill.", isNot: [], filenameHints: [], contentSignals: [] }',
    'fields:',
    '  - name: statement_date',
    '    type: date',
    ...(scope === null ? [] : [`    scope: ${scope}`]),
    '    labels: ["Statement date"]',
    '    description: "The date the account was issued."',
    'newFields: [statement_date]',
    '---',
    '## What it is / is not',
    'An invented bill.',
    '## Where values sit',
    'Top right.',
    '## Traps',
    'None.',
    '## Worked example',
    'None.',
  ].join('\n'),
});

describe('a skill field scope', () => {
  it('reads "document", defaults to "case", and refuses anything else', () => {
    const doc = buildSkillRegistry('esg', [skillFile('document')], 'x').skillFor('ghg_energy__municipal_electricity_bill');
    expect(doc?.fields.find((f) => f.name === 'statement_date')?.scope).toBe('document');
    const plain = buildSkillRegistry('esg', [skillFile(null)], 'x').skillFor('ghg_energy__municipal_electricity_bill');
    expect(plain?.fields.find((f) => f.name === 'statement_date')?.scope).toBe('case');
    expect(() => buildSkillRegistry('esg', [skillFile('site')], 'x')).toThrow(SkillLoadError);
  });

  it('the ESG bill and policy skills name their document facts', () => {
    const esg = loadSkills('esg');
    const scoped = (spec: string) => (esg.skillFor(spec)?.fields ?? []).filter((f) => f.scope === 'document').map((f) => f.name);
    expect(scoped('ghg_energy__municipal_electricity_bill')).toEqual(expect.arrayContaining([
      'statement_date', 'tariff_name', 'daily_average_kwh', 'history_total_kwh', 'filing_label',
    ]));
    expect(scoped('water__municipal_water_bill')).toEqual(expect.arrayContaining(['statement_date', 'history_total_kl', 'filing_label']));
  });

  it('the EE, supplier-form, risk-register, waste and privacy skills name the facts their documents print', () => {
    const esg = loadSkills('esg');
    const skill = (spec: string) => esg.skillFor(spec);
    const scoped = (spec: string) => (skill(spec)?.fields ?? []).filter((f) => f.scope === 'document').map((f) => f.name);
    // The workforce profile's TOTAL PERMANENT row, column by column, and the employer details.
    expect(scoped('employment_equity__eea2_eea4_report')).toEqual(expect.arrayContaining([
      'total_permanent_african_male', 'total_permanent_white_female', 'total_permanent_foreign_female',
      'employer_ceo_name', 'employer_sars_reference', 'employer_industry',
    ]));
    // A plan that assigns several senior managers: all of them, not the first.
    const plan = skill('employment_equity__ee_plan_and_forum_minutes');
    expect(plan?.fields.find((f) => f.name === 'ee_manager_assigned_name')?.description).toMatch(/EVERY senior manager/);
    expect(scoped('employment_equity__ee_plan_and_forum_minutes')).toContain('ee_plan_signed_date');
    // What a supplier form asks (questions, criteria, certifications, bands), blank or filled.
    const form = skill('supplier_esg__self_assessment_questionnaire');
    expect(form?.rowsField).toBe('form_item_rows');
    expect(form?.fields.filter((f) => f.rowLevel).map((f) => f.name)).toEqual(['form_item', 'form_item_kind', 'form_section', 'form_item_band']);
    expect(scoped('risk_assurance__risk_register_including_climate')).toContain('register_prepared_by');
    expect(scoped('waste__contractor_report_safe_disposal_certificate')).toEqual(expect.arrayContaining(['contractor_vat_number', 'contractor_registration_number']));
    // A POPIA document, a consent letter included, has a skill, with its letterhead's facts.
    expect(scoped('ethics_compliance__popia_information_officer_and_pia')).toEqual(expect.arrayContaining([
      'document_date', 'act_cited', 'issuing_entity', 'issuer_registration_number', 'issuer_directors',
      'issuer_company_secretary', 'issuer_executives',
    ]));
  });
});

function bill(values: Record<string, unknown>): DocumentExtraction {
  return {
    documentId: 'ghg_energy__municipal_electricity_bill',
    documentName: 'Municipal electricity account',
    element: 'GHG_ENERGY',
    sourceFile: 'invented-account.pdf',
    values: Object.entries(values).map(([field, value]) => ({ field, value, sourceFile: 'invented-account.pdf', sourceDocumentId: 'x' })),
    missingFields: [],
    unexpectedFields: [],
    exceptions: [],
  };
}

describe('withoutDocumentFacts', () => {
  it('drops the document-scoped facts from what the case resolution sees', () => {
    const out = withoutDocumentFacts(bill({
      site_name: 'Depot North',
      billing_period_end: '28/02/2026',
      electricity_kwh: '12 345.6',
      statement_date: '03/03/2026',
      history_total_kwh: '98 765.4',
      filing_label: 'Depot North Feb',
    }));
    expect(out.values.map((v) => v.field)).toEqual(['site_name', 'billing_period_end', 'electricity_kwh']);
  });

  it("keeps a letterhead's directors and registration number off the case", () => {
    const letter: DocumentExtraction = {
      ...bill({}),
      documentId: 'ethics_compliance__popia_information_officer_and_pia',
      documentName: 'POPIA',
      element: 'ETHICS_COMPLIANCE',
      values: [
        { field: 'information_officer_name', value: 'A Person', sourceFile: 'invented-letter.docx', sourceDocumentId: 'x' },
        { field: 'issuer_directors', value: 'A Director; B Director', sourceFile: 'invented-letter.docx', sourceDocumentId: 'x' },
        { field: 'issuer_registration_number', value: '2001/123456/07', sourceFile: 'invented-letter.docx', sourceDocumentId: 'x' },
      ],
    };
    expect(withoutDocumentFacts(letter).values.map((v) => v.field)).toEqual(['information_officer_name']);
  });

  it('returns a read with no document facts unchanged', () => {
    const plain = bill({ electricity_kwh: '12 345.6' });
    expect(withoutDocumentFacts(plain)).toBe(plain);
  });
});
