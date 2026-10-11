/**
 * Claim-vs-evidence verification: each of the fourteen checks on an invented
 * company, the rule each result applies, and the CLAIMED / EVIDENCED totals.
 * (Invented people, suppliers, numbers and ID numbers.)
 */
import { describe, expect, it } from 'vitest';
import {
  applyOverlayToPillars, applyOverlayToSections, scoreBothWays, verifyClaims,
  type EvidenceRead, type VerificationSections,
} from '../verification/index.js';

const MALE_CITIZEN = '8501015009086';
const FEMALE_CITIZEN = '9002150012083';
const PERMANENT_RESIDENT = '7806305013180';

const read = (documentId: string, sourceFile: string, values: Record<string, unknown>): EvidenceRead => ({
  documentId, sourceFile, values: Object.entries(values).map(([field, value]) => ({ field, value })),
});

function company(): VerificationSections {
  return {
    'company-information': { meta: { companyName: 'Kestrel Haulage', financialYearEnd: '2025-02-28' } },
    'financial-information': { meta: { npat: 900_000, revenue: 20_000_000, tmps: 5_000_000, payroll: 2_000_000 } },
    ownership: { rows: [
      { _id: 'o1', shareholderName: 'Sipho Ndlovu', idNumber: MALE_CITIZEN, race: 'African', gender: 'Male', shareholding: 100, numberOfShares: 100, rowOutstandingDebt: 0, _sourceFiles: ['Gathering.xlsx › Ownership'] },
    ] },
    'management-control': { rows: [
      { _id: 'm1', name: 'Sipho', surname: 'Ndlovu', idNumber: MALE_CITIZEN, race: 'African', gender: 'Male', occupationalLevel: 'Executive Director', _sourceFiles: ['Gathering.xlsx › MC'] },
      { _id: 'm2', name: 'Lerato', surname: 'Khumalo', idNumber: FEMALE_CITIZEN, race: 'African', gender: 'Female', occupationalLevel: 'Senior Management',
        _conflicts: { occupationalLevel: [{ value: 'Senior Management', sources: ['Gathering v2.xlsx › MC'] }, { value: 'Other Executive Management', sources: ['Gathering v1.xlsx › MC'] }] },
        _sourceFiles: ['Gathering.xlsx › MC'] },
      { _id: 'm3', name: 'Thabo', surname: 'Zulu', idNumber: PERMANENT_RESIDENT, race: 'African', gender: 'Male', occupationalLevel: 'Middle Management', _sourceFiles: ['Gathering.xlsx › MC'] },
      { _id: 'm4', name: 'Pieter', surname: 'Smit', race: 'White', gender: 'Male', occupationalLevel: 'Junior Management', _sourceFiles: ['Gathering.xlsx › MC'] },
    ] },
    procurement: { rows: [
      { _id: 'p1', supplierName: 'Quarry Tools', spend: 400_000, bbbeeLevel: 1, currentBlackOwnership: 60, _sourceFiles: ['Gathering.xlsx › Procurement'] },
      { _id: 'p2', supplierName: 'Hilltop Fuel', spend: 900_000, bbbeeLevel: 2, _sourceFiles: ['Gathering.xlsx › Procurement'] },
      { _id: 'p3', supplierName: 'Hilltop Fuel', spend: 900_000, bbbeeLevel: 2, _sourceFiles: ['Gathering.xlsx › Procurement'] },
    ] },
    sed: { rows: [
      { _id: 's1', beneficiaryName: 'Riverside Creche', amount: 20_000, dateOfTransaction: '2024-06-10', _sourceFiles: ['Gathering.xlsx › SED'] },
      { _id: 's2', beneficiaryName: 'Riverside Creche', amount: 15_000, dateOfTransaction: '2024-09-01', _sourceFiles: ['Gathering.xlsx › SED'] },
      { _id: 's3', beneficiaryName: 'Old Grant', amount: 5_000, dateOfTransaction: '2023-01-01', _sourceFiles: ['Gathering.xlsx › SED'] },
    ] },
    'skills-development': { rows: [
      { _id: 't1', learnerName: 'Lerato Khumalo', programName: 'First Aid Level 1', totalCost: 2_500, startDate: '2024-05-01', _sourceFiles: ['Gathering.xlsx › Skills'] },
    ] },
  };
}

const evidence: EvidenceRead[] = [
  read('ownership__securities_share_register', 'Share Register.pdf', {
    registration_number: '2010/123456/07', entity_name: 'Kestrel Haulage (Pty) Ltd',
    holdings_table: [{ shareholder_name: 'Sipho Ndlovu', id_number: MALE_CITIZEN, number_of_shares: 100, percentage: '100%' }],
  }),
  read('ownership__cipc_registration_documents_c', 'CIPC.pdf', { registration_number: '2010/123456/07', entity_name: 'Kestrel Haulage (Pty) Ltd', incorporation_date: '2010-03-01', director_rows: [] }),
  read('esd__audited_financial_statements_or_sig', 'AFS 2025.pdf', {
    registration_number: '2010/654321/07', financial_year_end: '2025-02-28', current_year_npat: 950_000, current_year_revenue: 20_000_000, total_pre_exclusions_tmps: 6_000_000,
  }),
  read('skills_development__sars_emp201_submissi', 'EMP201.pdf', {
    emp201_rows: Array.from({ length: 12 }, (_, i) => { const m = ((i + 2) % 12) + 1; return { tax_period: `${m <= 2 ? 2025 : 2024}${String(m).padStart(2, "0")}`, sdl_amount: 1_500 }; }),
  }),
  read('management_control__payroll_as_at_measur', 'Payroll.pdf', {
    period_start: '2024-03-01', period_end: '2025-02-28',
    employee_rows: [{ employee_name: 'Sipho Ndlovu' }, { employee_name: 'Khumalo Lerato' }, { employee_name: 'Thabo Zulu' }],
  }),
  read('management_control__eea1_declaration_by_', 'EEA1 Smit.pdf', { employee_name: 'Pieter Smit', race: 'White', gender: 'Male', is_foreign: 'No' }),
  read('esd__valid_b_bbee_verification_certifica', 'Quarry Tools certificate.pdf', {
    supplier_name: 'Quarry Tools (Pty) Ltd', bee_level: 2, supplier_black_ownership_percentage: 60,
    certificate_issue_date: '2024-01-15', certificate_expiry_date: '2025-01-14',
  }),
  read('esd__detailed_ledger_accounts_payable_en', 'Ledger.xlsx', { supplier_name: 'Quarry Tools', ap_subledger_total: 380_000 }),
  read('sed__proof_of_payment_cash_grants_donati', 'Proof of payment.pdf', {
    beneficiary_rows: [{ beneficiary_name: 'Riverside Creche', amount_paid: 20_000, payment_date: '2024-06-12' }],
  }),
];

const byId = (report: ReturnType<typeof verifyClaims>, id: string) => report.checks.find((c) => c.id === id);

describe('verifyClaims', () => {
  const report = verifyClaims({ sections: company(), evidence });

  it('derives the measurement period from the year end', () => {
    expect(report.period).toEqual({ start: '2024-03-01', end: '2025-02-28' });
  });

  it('1. a holding the share register states passes', () => {
    expect(byId(report, 'ownership.holding:o1')?.status).toBe('pass');
  });

  it('2. gender is checked against the ID number', () => {
    const r = verifyClaims({ sections: { ...company(), ownership: { rows: [{ ...company().ownership.rows![0], gender: 'Female' }] } }, evidence });
    const c = byId(r, 'people.demographics:ownership:o1');
    expect(c?.rule).toBe('replaced-statutory');
    expect(c?.ops).toEqual([{ kind: 'set', basis: 'both', section: 'ownership', rowId: 'o1', column: 'gender', value: 'Male' }]);
  });

  it('3. a stated nil acquisition debt no financial statement confirms is unproven, out of EVIDENCED', () => {
    const c = byId(report, 'ownership.acquisitionDebt:o1');
    expect(c?.status).toBe('unproven');
    expect(c?.ops[0]).toMatchObject({ basis: 'evidenced', column: 'rowOutstandingDebt', value: null });
  });

  it('4. two versions disagreeing on a band is a needs-you with both answers', () => {
    const c = byId(report, 'management.band:management-control:m2:occupationalLevel');
    expect(c?.status).toBe('needs-you');
    expect(c?.choices?.map((x) => [x.value, x.held])).toEqual([['Senior Management', true], ['Other Executive Management', false]]);
  });

  it('5. a black permanent resident stops counting as black in EVIDENCED until the date is confirmed', () => {
    expect(byId(report, 'people.foreignNational:management-control:m3')?.ops).toEqual([{ kind: 'notBlack', basis: 'evidenced', section: 'management-control', rowId: 'm3' }]);
  });

  it('6. the payroll is matched by name in any order; who is missing from it is unproven', () => {
    expect(byId(report, 'people.payroll:management-control:m2')?.status).toBe('pass');
    // Removing a non-black person would RAISE the black share: reported, not removed.
    expect(byId(report, 'people.payroll:management-control:m4')).toMatchObject({ status: 'flag', ops: [] });
    expect(byId(report, 'people.payroll:headcount')?.status).toBe('flag');
  });

  it('7. the leviable amount is replaced by SDL x 100 over the EMP201 months', () => {
    const c = byId(report, 'skills.leviableAmount:leviable');
    expect(c?.rule).toBe('replaced-statutory');
    expect(c?.ops[0]).toMatchObject({ metaKey: 'payroll', value: 1_800_000 });
  });

  it('8. training with no invoice or register is unproven', () => {
    expect(byId(report, 'skills.trainingSpend:t1')?.status).toBe('unproven');
  });

  it('9. a certificate that states a lower level replaces the claim in both totals; no certificate is unproven', () => {
    const c = byId(report, 'procurement.supplierCertificate:p1');
    expect(c?.rule).toBe('replaced-certificate');
    expect(c?.ops).toEqual([{ kind: 'set', basis: 'both', section: 'procurement', rowId: 'p1', column: 'bbbeeLevel', value: 2 }]);
    expect(byId(report, 'procurement.supplierCertificate:p2')?.status).toBe('unproven');
  });

  it('9. a certificate that expired before the period starts is out of period', () => {
    const old = evidence.map((e) => (e.sourceFile === 'Quarry Tools certificate.pdf'
      ? read(e.documentId, e.sourceFile, { supplier_name: 'Quarry Tools', bee_level: 1, certificate_expiry_date: '2023-12-31' })
      : e));
    expect(byId(verifyClaims({ sections: company(), evidence: old }), 'procurement.supplierCertificate:p1')?.status).toBe('out-of-period');
  });

  it('10. the ledger replaces the schedule spend; one supplier twice from one document is flagged', () => {
    expect(byId(report, 'procurement.supplierSpend:ledger:p1')?.ops[0]).toMatchObject({ column: 'spend', value: 380_000 });
    expect(byId(report, 'procurement.supplierSpend:duplicate:p2,p3')?.status).toBe('flag');
  });

  it('11. a stated TMPS that is not the supplier sum is a flagged difference; the score stays on the sum', () => {
    // Decided 11 Oct 2026: the supplier sum by default; the stated figure is
    // shown beside it, never applied by this check.
    const c = byId(report, 'procurement.tmps:tmps');
    expect(c).toMatchObject({ status: 'flag', rule: 'flag-only', ops: [] });
    expect(c?.statement).toContain('scored against the supplier sum');
  });

  it('11. a stated TMPS equal to the supplier sum passes; one below it says it cannot be the TMPS', () => {
    const at = (tmps: number) => byId(verifyClaims({
      sections: { ...company(), 'financial-information': { meta: { ...company()['financial-information'].meta, tmps } } },
      evidence,
    }), 'procurement.tmps:tmps');
    expect(at(2_200_000)?.status).toBe('pass');
    expect(at(2_200_000.5)?.status).toBe('pass');
    const below = at(300_000);
    expect(below).toMatchObject({ status: 'flag', ops: [] });
    expect(below?.statement).toContain('cannot be the TMPS');
  });

  it('12. NPAT is replaced by the financial statements; revenue agrees', () => {
    expect(byId(report, 'financials.npatRevenue:npat')?.ops[0]).toMatchObject({ metaKey: 'npat', value: 950_000 });
    expect(byId(report, 'financials.npatRevenue:revenue')?.status).toBe('pass');
  });

  it('13. SED: paid within 7 days passes, unpaid is unproven, before the period is out of period', () => {
    expect(byId(report, 'sed.proofOfPayment:s1')?.status).toBe('pass');
    expect(byId(report, 'sed.proofOfPayment:s2')?.status).toBe('unproven');
    expect(byId(report, 'sed.proofOfPayment:s3')?.status).toBe('out-of-period');
  });

  it('14. two registration numbers across the documents are flagged', () => {
    expect(byId(report, 'entity.identity:registration_number')?.status).toBe('flag');
  });
});

describe('financial statements for another year (12)', () => {
  const AFS = 'esd__audited_financial_statements_or_sig';
  const withAfs = (...afs: EvidenceRead[]) => [...evidence.filter((e) => e.documentId !== AFS), ...afs];
  const meta = (r: ReturnType<typeof verifyClaims>, basis: 'claimed' | 'evidenced') =>
    applyOverlayToSections(company(), r, basis)['financial-information'].meta;

  it("a prior year's AFS never replaces NPAT or revenue in either total", () => {
    const prior = read(AFS, 'AFS 2022.pdf', { financial_year_end: '2022-02-28', current_year_npat: 150_000, current_year_revenue: 4_000_000 });
    const r = verifyClaims({ sections: company(), evidence: withAfs(prior) });
    for (const key of ['npat', 'revenue']) {
      const c = byId(r, `financials.npatRevenue:${key}`);
      expect(c).toMatchObject({ status: 'out-of-period', rule: 'flag-only', ops: [] });
    }
    expect(meta(r, 'claimed')).toMatchObject({ npat: 900_000, revenue: 20_000_000 });
    expect(meta(r, 'evidenced')).toMatchObject({ npat: 900_000, revenue: 20_000_000 });
  });

  it("the measured year's AFS replaces, whatever other years sit beside it", () => {
    const prior = read(AFS, 'AFS 2024.pdf', { financial_year_end: '2024-02-29', current_year_npat: 150_000 });
    const current = read(AFS, 'AFS 2025.pdf', { financial_year_end: '28 February 2025', current_year_npat: 950_000 });
    const r = verifyClaims({ sections: company(), evidence: withAfs(prior, current) });
    expect(byId(r, 'financials.npatRevenue:npat')?.ops).toEqual([{ kind: 'set', basis: 'both', section: 'financial-information', metaKey: 'npat', value: 950_000 }]);
  });

  it('an AFS that does not say which year it covers is reported, not used', () => {
    const undated = read(AFS, 'AFS.pdf', { current_year_npat: 150_000 });
    const c = byId(verifyClaims({ sections: company(), evidence: withAfs(undated) }), 'financials.npatRevenue:npat');
    expect(c).toMatchObject({ status: 'flag', rule: 'flag-only', ops: [] });
  });

  it('two AFS for the measured year that disagree are a question; the workbook figure is scored until it is answered', () => {
    const draft = read(AFS, 'AFS draft.pdf', { financial_year_end: '2025-02-28', current_year_npat: 800_000 });
    const signed = read(AFS, 'AFS signed.pdf', { financial_year_end: '2025-02-28', current_year_npat: 950_000 });
    const r = verifyClaims({ sections: company(), evidence: withAfs(draft, signed) });
    const c = byId(r, 'financials.npatRevenue:npat');
    expect(c).toMatchObject({ status: 'needs-you', ops: [] });
    expect(c?.choices?.map((x) => [x.value, x.held])).toEqual([[900_000, true], [800_000, false], [950_000, false]]);
    expect(meta(r, 'claimed')).toMatchObject({ npat: 900_000 });
  });
});

describe('loans from shareholders (3)', () => {
  it("are the company's liabilities, never a black holder's acquisition debt", () => {
    const afs = read('esd__audited_financial_statements_or_sig', 'AFS 2025.pdf', { financial_year_end: '2025-02-28', shareholder_loans: 2_500_000, loans_from_shareholders: 2_500_000 });
    const r = verifyClaims({ sections: company(), evidence: [...evidence.filter((e) => e.sourceFile !== 'AFS 2025.pdf'), afs] });
    const c = byId(r, 'ownership.acquisitionDebt:o1');
    expect(c?.ops.some((op) => op.basis === 'both' || op.value === 2_500_000)).toBe(false);
    expect(applyOverlayToSections(company(), r, 'claimed').ownership.rows![0].rowOutstandingDebt).toBe(0);
  });
});

describe('a holding stated as a bare number (1)', () => {
  const register = (percentage: unknown) => evidence.map((e) => (e.sourceFile === 'Share Register.pdf'
    ? read(e.documentId, e.sourceFile, { registration_number: '2010/123456/07', holdings_table: [{ shareholder_name: 'Sipho Ndlovu', id_number: MALE_CITIZEN, number_of_shares: 100, percentage }] })
    : e));
  const withHolding = (shareholding: unknown) => ({ ...company(), ownership: { rows: [{ ...company().ownership.rows![0], shareholding }] } });

  it('a 1% holder written as 1 agrees with a claimed 1%', () => {
    expect(byId(verifyClaims({ sections: withHolding('1%'), evidence: register(1) }), 'ownership.holding:o1')?.status).toBe('pass');
  });

  it('never replaces a claim: 1 could be 100% or 1%', () => {
    const c = byId(verifyClaims({ sections: withHolding(40), evidence: register(1) }), 'ownership.holding:o1');
    expect(c).toMatchObject({ status: 'flag', rule: 'flag-only', ops: [] });
  });

  it('a value with its % sign still replaces', () => {
    const c = byId(verifyClaims({ sections: withHolding(40), evidence: register('100%') }), 'ownership.holding:o1');
    expect(c?.rule).toBe('replaced-statutory');
    expect(c?.ops).toEqual([{ kind: 'set', basis: 'both', section: 'ownership', rowId: 'o1', column: 'shareholding', value: 100 }]);
  });
});

describe('names', () => {
  it('initials for the given names match the full name; a lone surname does not', async () => {
    const { sameName } = await import('../verification/evidence.js');
    expect(sameName('T.G. Dube', 'Thandi Grace Dube')).toBe(true);
    expect(sameName('DUBE, Thandi', 'Thandi Dube')).toBe(true);
    expect(sameName('Dube', 'Thandi Dube')).toBe(false);
    expect(sameName('S. Dube', 'Thandi Dube')).toBe(false);
  });
});

describe('the overlay', () => {
  const sections = company();
  const report = verifyClaims({ sections, evidence });

  it('CLAIMED applies only the rule-decided replacements', () => {
    const claimed = applyOverlayToSections(sections, report, 'claimed');
    expect(claimed.procurement.rows!.find((r) => r._id === 'p1')).toMatchObject({ bbbeeLevel: 2, spend: 380_000 });
    expect(claimed.sed.rows).toHaveLength(3);
    expect(claimed['financial-information'].meta).toMatchObject({ npat: 950_000, payroll: 1_800_000 });
    // The input is untouched.
    expect(sections.procurement.rows![0].bbbeeLevel).toBe(1);
  });

  it('EVIDENCED also removes the unproven and the out of period', () => {
    const ev = applyOverlayToSections(sections, report, 'evidenced');
    expect(ev.sed.rows!.map((r) => r._id)).toEqual(['s1']);
    expect(ev.procurement.rows!.find((r) => r._id === 'p2')?.bbbeeLevel).toBeUndefined();
    expect(ev.ownership.rows![0].rowOutstandingDebt).toBeUndefined();
  });

  it('scores both totals with the same scorer, and each needs-you answer', () => {
    // A toy scorer: SED rand / 1000 + 10 per Other Executive band.
    const score = (s: VerificationSections) =>
      (s.sed?.rows ?? []).reduce((n, r) => n + Number(r.amount) / 1000, 0)
      + (s['management-control']?.rows ?? []).filter((r) => /other executive/i.test(String(r.occupationalLevel))).length * 10;
    const totals = scoreBothWays(sections, report, score);
    expect(totals.claimed).toBe(40);
    expect(totals.evidenced).toBe(20);
    expect(totals.needsYou[0].choices.map((c) => c.total)).toEqual([40, 50]);
    expect(totals.needsYou[0].changesScore).toBe(true);
  });

  it('applies to pillar state by row id, mapping workbook columns to the calculator fields', () => {
    const state = {
      procurement: { tmps: 5_000_000, suppliers: [{ id: 'p1', beeLevel: 1, spend: 400_000 }, { id: 'p2', beeLevel: 2, spend: 900_000 }] },
      sed: { contributions: [{ id: 's1', amount: 20_000 }, { id: 's2', amount: 15_000 }] },
      management: { employees: [{ id: 'm2', designation: 'Senior' }, { id: 'm3', designation: 'Middle' }] },
      skills: { leviableAmount: 2_000_000, trainingPrograms: [] },
    };
    const ev = applyOverlayToPillars(state, report, 'evidenced');
    expect(ev.procurement.suppliers).toEqual([{ id: 'p1', beeLevel: 2, spend: 380_000 }, { id: 'p2', beeLevel: 0, spend: 900_000 }]);
    expect(ev.sed.contributions.map((c) => c.id)).toEqual(['s1']);
    // Kept (the denominators stand), no longer counted as black.
    expect(ev.management.employees).toEqual([{ id: 'm2', designation: 'Senior' }, { id: 'm3', designation: 'Middle', race: '' }]);
    expect(ev.skills.leviableAmount).toBe(1_800_000);
    expect(state.procurement.suppliers[0].beeLevel).toBe(1);
  });
});
