#!/usr/bin/env node
/**
 * Turn a document-by-document review of a B-BBEE evidence pack (the
 * "claude vs okiru" comparison JSON) into the pack's answer key for the gate
 * (__tests__/eval/packEval.test.ts).
 *
 *   node scripts/bbbee-key-from-review.mjs <review.json> "<pack>/.eval/answer-key.json"
 *
 * Both files are client data and stay out of the repository (docs/eval/ and
 * **\/.eval/ are gitignored). This script holds RULES only — which parser field
 * names a reviewed field corresponds to, what kind of value it is, and how to
 * read the value out of the reviewer's wording. Every value comes from the
 * review at run time.
 *
 * Verdicts:
 *   MATCH, OURS WRONG, OURS MISSED  → a keyed expectation
 *   DOC LACKS IT                    → absentOk: any value we give is invented
 *   DOC INVALID/CONFLICTING         → left out (the document disagrees with itself)
 * A reviewed value that says the document states nothing ("not stated", "none")
 * is absentOk whatever its verdict. A value with nothing checkable in it
 * ("per column J") is left out and reported.
 *
 * keys: the parser field names that carry this value — deterministic
 * extracted_fields names (matrix / canonical ontology), AI spec field names, or
 * `rows.column` inside a sheet table (shareholder_rows, employee_rows,
 * learner_rows, supplier_rows, beneficiary_rows). Empty only where nothing the
 * parser emits corresponds; such a field scores recall only.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const [reviewPath, outPath] = process.argv.slice(2);
if (!reviewPath || !outPath) {
  console.error('usage: node scripts/bbbee-key-from-review.mjs <review.json> <answer-key.json>');
  process.exit(2);
}

// ── reading values out of the reviewer's wording ────────────────────────────

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const year = (y) => (y < 100 ? 2000 + y : y);

/** Every date in the text, in order, as yyyy-mm-dd (day first, as South Africa writes them). */
export function datesIn(text) {
  const s = String(text ?? '');
  const found = [];
  const re = /(\d{4})-(\d{2})-(\d{2})|(\d{1,2})\/(\d{1,2})\/(\d{2,4})|(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,})\.?,?\s+(\d{4})/g;
  for (const m of s.matchAll(re)) {
    if (m[1]) found.push(iso(Number(m[1]), Number(m[2]), Number(m[3])));
    else if (m[4]) found.push(iso(year(Number(m[6])), Number(m[5]), Number(m[4])));
    else if (MONTHS[m[8].slice(0, 3).toLowerCase()]) found.push(iso(Number(m[9]), MONTHS[m[8].slice(0, 3).toLowerCase()], Number(m[7])));
  }
  return found;
}

/** Every Rand amount, signed ("-R54,321" is negative). */
export function amountsIn(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(/(-)?\s?R\s?(\d[\d\s,]*(?:\.\d+)?)/g)) {
    const n = Number(m[2].replace(/[\s,]/g, ''));
    if (Number.isFinite(n)) out.push(m[1] ? -n : n);
  }
  return out;
}

const firstNumber = (text) => {
  const m = String(text ?? '').match(/-?\d[\d,]*(?:\.\d+)?/);
  return m ? Number(m[0].replace(/,/g, '')) : null;
};
const percentIn = (text) => {
  const m = String(text ?? '').match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? Number(m[1]) : null;
};
const cipcRegIn = (text) => {
  const m = String(text ?? '').match(/\d{4}\s*\/\s*\d{6,7}\s*\/\s*\d{2}/);
  return m ? m[0].replace(/\s/g, '') : null;
};
const saIdIn = (text) => {
  const m = String(text ?? '').match(/\b\d{6}\s?\d{4}\s?\d{3}\b/);
  return m ? m[0].replace(/\s/g, '') : null;
};
const unquote = (text) => String(text ?? '').replace(/['‘’]([^'‘’]+)['‘’]/g, '$1').replace(/^['"‘’“”]+|['"‘’“”]+$/g, '').trim();
const beforeParen = (text) => unquote(String(text ?? '').split(/\s\(/)[0]);
const beforeComma = (text) => unquote(String(text ?? '').split(',')[0]);
const beforeSemicolon = (text) => unquote(String(text ?? '').split(';')[0]);
/** "SURNAME, Given Names" → "Given Names Surname" (the order the rest of the pack uses). */
const givenFirst = (text) => {
  const [surname, given] = beforeParen(text).split(',').map((p) => p.trim());
  return given ? `${given} ${surname}` : surname;
};

const DEFAULT_VALUE = {
  date: (c) => datesIn(c)[0] ?? null,
  money: (c) => amountsIn(c)[0] ?? null,
  percent: (c) => percentIn(c) ?? firstNumber(c),
  number: (c) => firstNumber(c),
  count: (c) => firstNumber(c),
  regno: (c) => cipcRegIn(c) ?? saIdIn(c) ?? String(c).replace(/\s/g, ''),
  level: (c) => beforeParen(c),
  bool: (c) => (/^\s*yes\b/i.test(c) ? 'Yes' : 'No'),
  text: (c) => beforeParen(c),
  list: (c) => String(c).split(/;\s*/).map(beforeParen).filter(Boolean),
};

// ── rules: per document kind, per reviewed field ────────────────────────────

const ENTITY = 'entity'; // alternatives: the measured entity's registered names

/** A document is recognised by the reviewer's description of it, never its file name. */
const DOCUMENT_KINDS = [
  {
    kind: 'cipc',
    is: /\bCIPC\b/i,
    typeAccepts: ['CIPC registration documents (COR14.1 / COR14.3)', 'ownership__cipc_registration_documents_cor14_1_cor14_3'],
    fields: [
      [/^Enterprise name$/i, { kind: 'text', keys: ['entity_name'] }],
      [/^Registration number$/i, { kind: 'regno', keys: ['registration_number'] }],
      [/^Registration date$/i, { kind: 'date', keys: ['incorporation_date', 'registration_date'] }],
      [/^Enterprise type$/i, { kind: 'text', keys: ['entity_type'], alternatives: () => ['CC'] }],
      [/^Enterprise status$/i, { kind: 'text', keys: [] }],
      [/^Financial year end$/i, { kind: 'text', keys: [] }],
      [/^Tax number$/i, { kind: 'regno', keys: [], value: (c) => String(c).replace(/\s/g, '') }],
      [/^Registered office$/i, { kind: 'text', keys: ['registered_address'], value: (c) => unquote(c) }],
      [/^Member$/i, { kind: 'text', keys: ['full_name', 'shareholder_name', 'holder_name'], value: givenFirst, alternatives: (c) => [beforeParen(c)] }],
      [/^Member's interest$/i, { kind: 'percent', keys: ['percentage'] }],
      [/^Member's ID number$/i, { kind: 'regno', keys: ['id_number'] }],
      [/^Accounting officer$/i, { kind: 'text', keys: ['signing_auditor'] }],
      [/^Certificate date$/i, { kind: 'date', keys: [] }],
    ],
  },
  {
    kind: 'share register',
    is: /^Share register/i,
    typeAccepts: ['Securities / share register', 'ownership__securities_share_register'],
    fields: [
      [/^Company name$/i, { kind: 'text', keys: ['entity_name'], alternatives: ENTITY }],
      [/^Registration number$/i, { kind: 'regno', keys: ['registration_number'] }],
      [/^Registration date$/i, { kind: 'date', keys: ['incorporation_date', 'registration_date'] }],
      [/^Entity type$/i, { kind: 'text', keys: ['entity_type'], alternatives: () => ['Close Corporation'] }],
      [/^Shareholder name$/i, { kind: 'text', keys: ['shareholder_name', 'holder_name', 'holdings_table.shareholder_name', 'shareholder_rows.shareholder_name'] }],
      [/^Shareholder ID$/i, { kind: 'regno', keys: ['id_number', 'shareholder_rows.id_number'] }],
      [/^Certificate number$/i, { kind: 'text', keys: ['certificate_number'] }],
      [/^Number of shares$/i, { kind: 'number', keys: ['number_of_shares', 'holdings_table.number_of_shares', 'shareholder_rows.number_of_shares'] }],
      [/^Share class$/i, { kind: 'text', keys: ['share_class', 'share_classes', 'holdings_table.share_class'], alternatives: () => ['Ordinary shares'] }],
      [/^% of shares$/i, { kind: 'percent', keys: ['percentage', 'holdings_table.percentage', 'shareholder_rows.economic_interest'] }],
      [/^Date issued$/i, { kind: 'date', keys: ['issue_date'] }],
      [/^Race \/ gender/i, { kind: 'text', keys: ['race', 'gender', 'race_declared', 'declared_race', 'shareholder_rows.race', 'shareholder_rows.gender', 'black_ownership', 'black_women_ownership'] }],
    ],
  },
  {
    kind: 'share certificate',
    is: /^Share certificate/i,
    typeAccepts: ['Share certificates / security certificates held by each BEE participant', 'ownership__share_certificates_security_certificates_held_by_each_bee_pa'],
    fields: [
      [/^Company name$/i, { kind: 'text', keys: ['entity_name'], alternatives: ENTITY }],
      [/^Registration number$/i, { kind: 'regno', keys: ['registration_number'] }],
      [/^Holder$/i, { kind: 'text', keys: ['holder_name', 'shareholder_name'] }],
      [/^Holder ID$/i, { kind: 'regno', keys: ['id_number'] }],
      [/^Certificate number$/i, { kind: 'text', keys: ['certificate_number'] }],
      [/^Share class$/i, { kind: 'text', keys: ['share_class'], alternatives: () => ['Ordinary'] }],
      [/^Number of shares$/i, { kind: 'number', keys: ['number_of_shares'] }],
      [/^Holding$/i, { kind: 'percent', keys: ['percentage'] }],
      [/^Issue date$/i, { kind: 'date', keys: ['issue_date'] }],
      // Initials on one side and full names on the other name the same people.
      [/^Signatories$/i, { kind: 'list', keys: ['signed_by'], tolerance: 0.5 }],
      [/^Black ownership/i, { kind: 'percent', keys: ['black_ownership', 'black_women_ownership'] }],
    ],
  },
  {
    kind: 'beneficial interest register',
    is: /Beneficial Interest Register/i,
    // No dedicated type exists; the review accepts the generic ownership one.
    typeAccepts: ['Ownership Confirmation'],
    fields: [
      [/^Company name$/i, { kind: 'text', keys: ['entity_name'], alternatives: ENTITY }],
      [/^Registration number$/i, { kind: 'regno', keys: ['registration_number'] }],
      [/^Registration date$/i, { kind: 'date', keys: ['incorporation_date', 'registration_date'] }],
      [/^Entity type$/i, { kind: 'text', keys: ['entity_type'], alternatives: () => ['Close Corporation'] }],
      [/^Beneficial owner$/i, { kind: 'text', keys: ['shareholder_name', 'holder_name', 'holdings_table.shareholder_name', 'shareholder_rows.shareholder_name'] }],
      [/^Owner ID$/i, { kind: 'regno', keys: ['id_number', 'shareholder_rows.id_number'] }],
      [/^Beneficial interest$/i, { kind: 'percent', keys: ['percentage', 'holdings_table.percentage', 'economic_interest', 'shareholder_rows.economic_interest'] }],
      [/^Race \/ gender$/i, { kind: 'text', keys: ['race', 'gender', 'shareholder_rows.race', 'shareholder_rows.gender', 'black_ownership', 'black_women_ownership'] }],
    ],
  },
  {
    kind: 'EEA1',
    is: /\bEEA1\b/i,
    typeAccepts: ['EEA1 — Declaration by Employee (disabled employees)', 'management_control__eea1_declaration_by_employee_disabled_employees'],
    fields: [
      [/^Name$/i, { kind: 'text', keys: ['employee_name'] }],
      [/^Gender$/i, { kind: 'text', keys: ['gender', 'derived_gender'] }],
      [/^Race$/i, { kind: 'text', keys: ['race', 'declared_race', 'race_declared'] }],
      [/^Foreign national$/i, { kind: 'bool', keys: ['foreign', 'foreign_national'], alternatives: () => ['N/A'] }],
      [/^Disability$/i, { kind: 'bool', keys: ['ee_act_disability_definition_met', 'disability'], alternatives: () => ['N/A', 'None'] }],
      [/^Signed and dated$/i, { kind: 'date', keys: ['eea1_date', 'signed_date', 'signing_date'] }],
    ],
  },
  {
    kind: 'management representation letter',
    is: /representation letter/i,
    typeAccepts: [
      'Management representation letter confirming no undisclosed acquisition debt or options',
      'ownership__management_representation_letter_confirming_no_undisclosed_a',
    ],
    fields: [
      [/^Letter date$/i, { kind: 'date', keys: ['signing_date', 'signed_date', 'letter_date'] }],
      [/^Entity$/i, {
        kind: 'text',
        keys: ['entity_or_participant', 'entity_name', 'supplier_name'],
        value: (c) => String(c).split(/\s+t\/a\s+/i)[0].trim(),
        alternatives: (c) => [String(c).split(/\s+t\/a\s+/i)[1]?.trim(), ...entityNames].filter(Boolean),
      }],
      [/^Owner$/i, { kind: 'text', keys: [] }],
      [/^Owner ID$/i, { kind: 'regno', keys: ['id_number'] }],
      [/^Black ownership$/i, { kind: 'percent', keys: ['black_ownership'] }],
      [/^Years in operation$/i, { kind: 'number', keys: [] }],
      [/^Control statement$/i, { kind: 'text', keys: ['scope_of_declaration'], value: (c) => (String(c).match(/['‘]([^'’]+)['’]/)?.[1] ?? unquote(c)) }],
      [/^Signatory$/i, { kind: 'text', keys: ['signatory_name'], value: beforeComma }],
      [/^Company and VAT numbers$/i, { kind: 'regno', keys: ['registration_number'] }],
      [/^B-BBEE level$/i, { kind: 'level', keys: ['bee_level'] }],
    ],
  },
  {
    kind: 'payroll report',
    is: /payroll/i,
    typeAccepts: ['Payroll as at Measurement Date', 'management_control__payroll_as_at_measurement_date'],
    fields: [
      [/^Entity$/i, { kind: 'text', keys: ['entity_name'], alternatives: ENTITY }],
      [/^Period$/i, { kind: 'date', keys: [], value: (c) => datesIn(c).at(-1) ?? null, alternatives: (c) => datesIn(c).slice(0, 1) }],
      [/^Number of employees$/i, { kind: 'count', keys: ['employee_rows'] }],
      [/^Employee names$/i, { kind: 'count', keys: ['employee_rows.employee_name'] }],
      [/^Total basic hourly pay$/i, { kind: 'money', keys: [] }],
      [/^Total basic salary$/i, { kind: 'money', keys: [] }],
      [/^Sign-off$/i, { kind: 'date', keys: ['signed_date', 'signing_date'] }],
      [/^Occupational level/i, { kind: 'text', keys: ['occupational_level', 'race', 'gender', 'employee_rows.occupational_level', 'employee_rows.race', 'employee_rows.gender'] }],
    ],
  },
  {
    kind: 'SED proof of payment',
    is: /^SED evidence/i,
    typeAccepts: [
      'Proof of payment — cash grants, donations, or monetary contributions',
      'sed__proof_of_payment_cash_grants_donations_or_monetary_contribut',
      'SED Contribution Confirmation',
    ],
    fields: [
      [/^Beneficiary$/i, { kind: 'text', keys: ['beneficiary_name', 'beneficiary_or_intermediary_name', 'beneficiary_rows.beneficiary_name'] }],
      [/^Beneficiary registration$/i, { kind: 'regno', keys: ['registration_number'] }],
      [/^Invoice \d+$/i, { kind: 'date', keys: ['sampled_invoices.invoice_date'] }],
      [/^Payment \d+$/i, { kind: 'date', keys: ['payment_date', 'sampled_invoices.payment_date', 'beneficiary_rows.date_of_contribution'] }],
      [/^Total evidenced$/i, { kind: 'money', keys: ['amount_paid', 'sed_contribution', 'total_claim_value'] }],
    ],
  },
  {
    kind: 'supplier B-BBEE certificate',
    is: /verification certificate/i,
    typeAccepts: [
      'B-BBEE Certificate',
      'Valid B-BBEE verification certificate per sampled supplier',
      'esd__valid_b_bbee_verification_certificate_per_sampled_supplier',
    ],
    fields: [
      [/^Entity$/i, { kind: 'text', keys: ['supplier_name', 'entity_name'] }],
      [/^B-BBEE level$/i, { kind: 'level', keys: ['bee_level', 'certificate_recognition_level'] }],
      [/^Total score$/i, { kind: 'number', keys: [] }],
      [/^Procurement recognition$/i, { kind: 'percent', keys: [] }],
      [/^Black ownership$/i, { kind: 'percent', keys: ['black_ownership'] }],
      [/^Black women ownership$/i, { kind: 'percent', keys: ['black_women_ownership'] }],
      [/^Empowering supplier$/i, { kind: 'bool', keys: ['empowering_supplier'] }],
      [/^Effective \(issue\) date$/i, { kind: 'date', keys: ['certificate_issue_date', 'issue_date'] }],
      [/^Expiry date$/i, { kind: 'date', keys: ['expiry_date', 'certificate_expiry_date'] }],
      [/^Verification agency$/i, { kind: 'text', keys: ['issuing_body'], value: beforeComma }],
      [/^Certificate number$/i, { kind: 'text', keys: ['certificate_number'] }],
      [/^Code and year end$/i, { kind: 'text', keys: [], value: beforeSemicolon }],
    ],
  },
  {
    kind: 'annual financial statements',
    is: /financial statements/i,
    typeAccepts: [
      'Audited financial statements or signed management accounts with detailed income statement',
      'esd__audited_financial_statements_or_signed_management_accounts_w',
      'Audited / reviewed annual financial statements (AFS)',
      'ownership__audited_reviewed_annual_financial_statements_afs',
      'Audited AFS or signed management accounts',
      'sed__audited_afs_or_signed_management_accounts',
      'Audited AFS or signed management accounts — for NPAT target determination',
      'esd__audited_afs_or_signed_management_accounts_for_npat_target_de',
      'AFS — staff costs / training expense note',
      'skills_development__afs_staff_costs_training_expense_note',
      'sheet_financials',
    ],
    fields: [
      [/^Entity and registration$/i, { kind: 'regno', keys: ['registration_number'] }],
      [/^Financial year end$/i, { kind: 'date', keys: [] }],
      [/^Revenue$/i, { kind: 'money', keys: ['current_year_revenue'] }],
      [/^Cost of sales$/i, { kind: 'money', keys: ['cost_of_sales'] }],
      [/^Gross profit$/i, { kind: 'money', keys: [] }],
      [/^Operating costs$/i, { kind: 'money', keys: ['operating_expenditure'] }],
      [/^Finance costs$/i, { kind: 'money', keys: ['finance_costs'] }],
      [/^Loss before tax$/i, { kind: 'money', keys: [] }],
      [/^Loss after tax/i, { kind: 'money', keys: ['current_year_npat', 'npat_per_year'] }],
      [/^Salaries$/i, { kind: 'money', keys: [] }],
      [/^Members' remuneration$/i, { kind: 'money', keys: [], value: (c) => (/^\s*nil\b/i.test(c) ? 0 : amountsIn(c)[0] ?? null) }],
      [/^Capital expenditure/i, { kind: 'money', keys: ['capital_expenditure'], value: (c) => (/^\s*nil\b/i.test(c) ? 0 : amountsIn(c)[0] ?? null) }],
      [/^Total assets$/i, { kind: 'money', keys: ['net_value_inputs.assets'] }],
      [/^Member's interest \(net asset value\)$/i, { kind: 'money', keys: ['net_value_inputs.equity'] }],
      [/^Accounting officer$/i, {
        kind: 'text',
        keys: ['signing_auditor'],
        value: (c) => String(c).split(/\s+t\/a\s+|,/i)[0].trim(),
        // The practice the officer trades as signs too.
        alternatives: (c) => [String(c).split(/\s+t\/a\s+/i)[1]?.split(',')[0].trim()],
      }],
      [/^TMPS$/i, { kind: 'money', keys: ['total_pre_exclusions_tmps', 'total_measured_procurement_spend', 'measured_procurement_spend'] }],
    ],
  },
  {
    kind: 'SARS EMP201 / EMP501',
    is: /\bEMP201\b/i,
    typeAccepts: ['SARS EMP201 submissions (monthly employer declarations)', 'skills_development__sars_emp201_submissions_monthly_employer_declarations'],
    fields: [
      [/^Employer and references$/i, { kind: 'regno', keys: ['sars_sdl_number'], value: (c) => String(c).match(/\bL\d{9}\b/)?.[0] ?? null }],
      [/^Months covered$/i, { kind: 'count', keys: ['months_submitted'], alternatives: (c) => [Number(String(c).match(/\((\d+) in /)?.[1])].filter(Number.isFinite) }],
      [/^SDL paid/i, { kind: 'money', keys: [] }],
      [/^Leviable amount/i, { kind: 'money', keys: ['sum_of_leviable_amount'] }],
      [/^PAYE/i, { kind: 'money', keys: [] }],
      [/^UIF/i, { kind: 'money', keys: [] }],
      [/^Total payroll taxes/i, { kind: 'money', keys: [] }],
      [/^EMP501/i, { kind: 'money', keys: [], value: (c) => amountsIn(c).at(-1) ?? null }],
      [/^Training learners/i, { kind: 'text', keys: ['learner_rows', 'learner_name', 'program_name', 'total_cost', 'skills_spend'] }],
    ],
  },
  {
    kind: 'company profile',
    is: /^Company profile/i,
    typeAccepts: [],
    fields: [
      [/^Trading name$/i, { kind: 'text', keys: ['entity_name', 'trading_name'] }],
      [/^Owner$/i, { kind: 'text', keys: [], value: beforeComma }],
      [/^Trading since$/i, { kind: 'text', keys: [] }],
      [/^Core business/i, { kind: 'text', keys: [], value: (c) => String(c).match(/the (\w+) sector/i)?.[1] ?? beforeSemicolon(c) }],
      [/^Ownership statement$/i, { kind: 'text', keys: [], value: unquote }],
      [/^Accountants$/i, { kind: 'text', keys: [] }],
    ],
  },
  {
    kind: 'supplier ledger',
    is: /ledger/i,
    typeAccepts: [
      'Detailed ledger / accounts payable entries per sampled supplier',
      'esd__detailed_ledger_accounts_payable_entries_per_sampled_supplie',
      'sheet_table__esd',
    ],
    fields: [
      [/^Supplier$/i, { kind: 'text', keys: ['supplier_name', 'supplier_rows.supplier_name'] }],
      [/^Stated period$/i, { kind: 'text', keys: [] }],
      [/^Entries$/i, { kind: 'count', keys: [] }],
      [/^Total$/i, { kind: 'money', keys: ['claimed_spend_ex_vat', 'ap_subledger_total', 'supplier_rows.claimed_spend_ex_vat'] }],
    ],
  },
  {
    kind: 'B-BBEE information-gathering workbook',
    is: /information-gathering workbook/i,
    typeAccepts: [],
    fields: [
      [/^Measured entity$/i, { kind: 'text', keys: ['entity_name', 'measured_entity_name'], alternatives: ENTITY }],
      [/^Sector$/i, { kind: 'text', keys: [] }],
      [/^Financial year end$/i, { kind: 'date', keys: [] }],
      [/^Revenue$/i, { kind: 'money', keys: ['current_year_revenue'] }],
      [/^NPAT$/i, { kind: 'money', keys: ['current_year_npat'] }],
      [/^Salaries/i, { kind: 'money', keys: [] }],
      [/^SDL paid \/ leviable amount$/i, { kind: 'money', keys: ['sum_of_leviable_amount'], value: (c) => amountsIn(c).at(-1) ?? null }],
      [/^TMPS inclusions$/i, { kind: 'money', keys: ['tmps_inclusions', 'total_pre_exclusions_tmps'] }],
      [/^Owner$/i, { kind: 'text', keys: ['shareholder_rows.shareholder_name', 'shareholder_name'], value: beforeComma }],
      [/^Owner voting rights$/i, { kind: 'percent', keys: ['shareholder_rows.voting_rights', 'voting_rights'] }],
      [/^Owner economic interest$/i, { kind: 'percent', keys: ['shareholder_rows.economic_interest', 'economic_interest'] }],
      [/^Owner is a new entrant$/i, { kind: 'bool', keys: [] }],
      [/^Management control: owner$/i, {
        kind: 'text',
        keys: ['employee_rows.occupational_level', 'employee_rows.designation'],
        value: beforeComma,
        alternatives: () => ['Top Management'],
      }],
      [/^Employee headcount$/i, { kind: 'count', keys: ['employee_rows'] }],
      [/^Employee names and IDs$/i, { kind: 'count', keys: ['employee_rows.employee_name'] }],
      [/^Employee race \/ gender$/i, { kind: 'text', keys: [], value: (c) => String(c) }],
      [/^Occupational levels$/i, { kind: 'text', keys: [], value: (c) => String(c) }],
      [/^Foreign nationals$/i, { kind: 'list', keys: [], value: (c) => String(c).split(/,\s*/).map((s) => s.trim()) }],
      [/^Gross monthly salaries$/i, { kind: 'money', keys: [], value: (c) => amountsIn(c).at(-1) ?? null }],
      [/^Supplier count$/i, { kind: 'count', keys: ['supplier_rows'] }],
      [/^Supplier names$/i, { kind: 'count', keys: ['supplier_rows.supplier_name'] }],
      [/^Supplier spend excl\. VAT$/i, { kind: 'money', keys: ['supplier_rows.claimed_spend_ex_vat'], aggregate: 'sum', value: (c) => amountsIn(c).at(-1) ?? null }],
      [/^B-BBEE levels$/i, { kind: 'count', keys: ['supplier_rows.bee_level'] }],
      // Columns the parser does not read yet: counted by the reviewer, never emitted.
      [/^Supplier black ownership %$/i, { kind: 'text', keys: [], value: (c) => String(c) }],
      [/^Supplier black women ownership %$/i, { kind: 'text', keys: [], value: (c) => String(c) }],
      [/^51%\+ black-owned flag$/i, { kind: 'text', keys: [], value: (c) => String(c) }],
      [/^30%\+ black-woman-owned flag$/i, { kind: 'text', keys: [], value: (c) => String(c) }],
      [/^Certificate expiry dates$/i, { kind: 'count', keys: ['supplier_rows.certificate_expiry_date'] }],
      [/^Supplier size/i, { skip: 'the review names the column, not its values' }],
      [/^Enterprise development$/i, { kind: 'money', keys: ['esd_contribution_rows', 'esd_contribution_rows.contribution_value'] }],
    ],
  },
  {
    kind: 'procurement workbook',
    is: /procurement-focused/i,
    typeAccepts: [],
    fields: [
      [/^TMPS$/i, { kind: 'money', keys: ['total_measured_procurement_spend', 'measured_procurement_spend'] }],
      [/^Revenue \/ NPAT \/ leviable amount$/i, {
        split: [
          { label: 'Revenue', kind: 'money', keys: ['current_year_revenue'], value: (c) => amountsIn(c)[0] ?? null },
          { label: 'NPAT', kind: 'money', keys: ['current_year_npat'], value: (c) => amountsIn(c)[1] ?? null },
          { label: 'Leviable amount', kind: 'money', keys: ['sum_of_leviable_amount'], value: (c) => amountsIn(c)[2] ?? null },
        ],
      }],
      [/^Supplier count$/i, { kind: 'count', keys: ['supplier_rows'] }],
      [/^Listed spend excl\. VAT$/i, { kind: 'money', keys: [] }],
      [/^Supplier spend$/i, { kind: 'money', keys: ['supplier_rows.claimed_spend_ex_vat'] }],
      [/^B-BBEE levels$/i, { kind: 'count', keys: ['supplier_rows.bee_level'] }],
      [/^Supplier black ownership \/ BWO \/ expiry$/i, { kind: 'text', keys: ['supplier_rows.certificate_expiry_date', 'supplier_rows.supplier_black_ownership_percentage', 'supplier_rows.supplier_black_women_ownership_percentage'] }],
      [/^Ownership and management control$/i, { kind: 'percent', keys: ['shareholder_rows.voting_rights', 'voting_rights'] }],
    ],
  },
  {
    kind: 'SED and skills workbook',
    is: /SED and skills/i,
    typeAccepts: [],
    fields: [
      [/^SED total$/i, { kind: 'money', keys: ['beneficiary_rows.contribution_value'], aggregate: 'sum', tolerance: 1 }],
      [/^SED by beneficiary$/i, { kind: 'count', keys: ['beneficiary_rows'] }],
      [/^Contribution type$/i, { kind: 'text', keys: ['beneficiary_rows.contribution_type'], value: (c) => String(c).match(/['‘]([^'’]+)['’]/)?.[1] ?? beforeParen(c) }],
      [/^Contribution dates$/i, {
        kind: 'count',
        keys: ['beneficiary_rows.date_of_contribution'],
        value: (c) => (String(c).match(/\d+/g) ?? []).map(Number).slice(0, 2).reduce((a, b) => a + b, 0),
        alternatives: (c) => [firstNumber(c)],
      }],
      [/^Training total$/i, { kind: 'money', keys: ['learner_rows.total_cost'], aggregate: 'sum', tolerance: 1 }],
      [/^Training courses$/i, { kind: 'list', keys: ['learner_rows.program_name'] }],
      [/^Training dates$/i, { kind: 'list', itemKind: 'date', keys: [], fromLabel: /^Training courses$/i, value: (c) => datesIn(c) }],
      [/^Training cost by course$/i, {
        kind: 'list',
        itemKind: 'money',
        keys: ['learner_rows.total_cost'],
        value: (c) => amountsIn(c),
      }],
      [/^Learner names, race, gender$/i, { kind: 'count', keys: [] }],
      [/^Learner-course entries$/i, { kind: 'count', keys: ['learner_rows'] }],
      [/^Learner employment status$/i, { kind: 'text', keys: [], value: () => 'Employed' }],
      [/^Management control: /i, {
        kind: 'text',
        keys: ['employee_rows.occupational_level', 'employee_rows.designation'],
        value: beforeComma,
      }],
    ],
  },
];

// ── conversion ──────────────────────────────────────────────────────────────

const review = JSON.parse(readFileSync(reviewPath, 'utf8'));
const KEYED = new Set(['MATCH', 'OURS WRONG', 'OURS MISSED']);
const STATES_NOTHING = /^\s*(not stated|none)\b/i;

// The measured entity's registered names, as its own registration documents
// print them: a trading or legal name elsewhere in the pack also counts.
const entityNames = [...new Set(review.documents.flatMap((doc) => (
  /\bCIPC\b|^Share register/i.test(doc.claude_type ?? '')
    ? doc.fields.filter((f) => /^(Enterprise|Company) name$/i.test(f.field)).map((f) => beforeParen(f.claude))
    : []
)))];

const stats = { documents: 0, fields: 0, keyed: 0, keysFilled: 0, keysEmpty: 0, absentOk: 0, leftOut: {} };
const leaveOut = (reason) => { stats.leftOut[reason] = (stats.leftOut[reason] ?? 0) + 1; };

function fieldFrom(reviewed, spec, doc) {
  const raw = reviewed.claude;
  const absentOk = reviewed.verdict === 'DOC LACKS IT' || STATES_NOTHING.test(String(raw));
  const source = spec.fromLabel ? doc.fields.find((f) => spec.fromLabel.test(f.field))?.claude ?? raw : raw;
  const value = absentOk ? null : (spec.value ?? DEFAULT_VALUE[spec.kind])(source);
  if (!absentOk && (value === null || value === undefined || (Array.isArray(value) && value.length === 0) || Number.isNaN(value))) {
    throw new Error(`No ${spec.kind} value could be read for "${doc.file}" / "${reviewed.field}"; give the rule a value reader`);
  }
  const alternatives = absentOk
    ? []
    : spec.alternatives === ENTITY ? entityNames
      : typeof spec.alternatives === 'function' ? spec.alternatives(String(raw)).filter((v) => v !== null && v !== undefined && v !== '')
        : [];
  const keyField = {
    label: spec.label ? `${reviewed.field}: ${spec.label}` : reviewed.field,
    keys: spec.keys,
    value,
    kind: spec.kind,
    ...(spec.itemKind ? { itemKind: spec.itemKind } : {}),
    tolerance: spec.tolerance ?? null,
    absentOk,
    ...(alternatives.length > 0 ? { alternatives } : {}),
    ...(spec.aggregate ? { aggregate: spec.aggregate } : {}),
    source: reviewed.where ?? null,
    review: reviewed.verdict,
  };
  if (absentOk) stats.absentOk += 1;
  else {
    stats.keyed += 1;
    if (spec.keys.length > 0) stats.keysFilled += 1;
    else stats.keysEmpty += 1;
  }
  return keyField;
}

const documents = review.documents.map((doc) => {
  const kind = DOCUMENT_KINDS.find((k) => k.is.test(doc.claude_type ?? ''));
  if (!kind) throw new Error(`No rules for a document described as "${doc.claude_type}" (${doc.file})`);
  stats.documents += 1;
  const fields = [];
  for (const reviewed of doc.fields) {
    stats.fields += 1;
    if (!KEYED.has(reviewed.verdict) && reviewed.verdict !== 'DOC LACKS IT') {
      leaveOut(`verdict ${reviewed.verdict}`);
      continue;
    }
    const rule = kind.fields.find(([label]) => label.test(reviewed.field));
    if (!rule) throw new Error(`No rule for "${reviewed.field}" on a ${kind.kind} (${doc.file})`);
    const spec = rule[1];
    if (spec.skip) {
      leaveOut(spec.skip);
      continue;
    }
    if (spec.split) {
      for (const part of spec.split) fields.push(fieldFrom(reviewed, part, doc));
      continue;
    }
    fields.push(fieldFrom(reviewed, spec, doc));
  }
  return { file: doc.file, path: doc.path, type: doc.claude_type, typeAccepts: kind.typeAccepts, fields };
});

const certified = review.certified_reference ?? {};
const yearEnd = documents
  .find((d) => /information-gathering workbook/i.test(d.type))
  ?.fields.find((f) => /^Financial year end$/i.test(f.label))?.value ?? null;

const key = {
  version: 1,
  from: { review: review.title ?? null, evaluated: review.evaluated ?? null },
  sector: certified.sector ?? null,
  size: certified.size ?? null,
  yearEnd,
  certified: {
    certificate: certified.certificate ?? null,
    score: certified.score ?? null,
    level: certified.level ?? null,
    elements: certified.elements ?? {},
  },
  documents,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(key, null, 2));
console.log(JSON.stringify(stats, null, 2));
