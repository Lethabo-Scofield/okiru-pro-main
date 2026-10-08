/**
 * The figures the skills forbid the model to compute (sums, x100, counts,
 * "inside the measurement period") are derived in code from the rows the
 * skills return, and every one is labelled derived. All values are invented.
 */
import { describe, expect, it } from 'vitest';
import {
  amountOf,
  dateOf,
  deriveEmp201,
  deriveEmployeeCount,
  deriveLedger,
  deriveSedPayments,
  taxPeriodOf,
} from '../../src/services/skillDerivations.js';

const FEB_YEAR = { start: '2024-03-01', end: '2025-02-28' };

describe('reading printed values', () => {
  it('reads South African amounts, brackets and a decimal comma', () => {
    expect(amountOf('1 455.30')).toBe(1455.3);
    expect(amountOf('R12 500.00')).toBe(12500);
    expect(amountOf('(48 210)')).toBe(-48210);
    expect(amountOf('1 234 567,89')).toBe(1234567.89);
    expect(amountOf('1.234,56')).toBe(1234.56);
    expect(amountOf('1,234,567.89')).toBe(1234567.89);
    expect(amountOf('n/a')).toBeNull();
    expect(amountOf('')).toBeNull();
  });

  it('reads dates day-first, and tax periods as months', () => {
    expect(dateOf('03/04/2025')).toBe('2025-04-03');
    expect(dateOf('2025-04-03')).toBe('2025-04-03');
    expect(dateOf('3 April 2025')).toBe('2025-04-03');
    expect(dateOf('31/02/2025')).toBeNull();
    expect(taxPeriodOf('202503')).toEqual({ year: 2025, month: 3 });
    expect(taxPeriodOf('2025/03')).toEqual({ year: 2025, month: 3 });
    expect(taxPeriodOf('March 2025')).toEqual({ year: 2025, month: 3 });
    expect(taxPeriodOf('202513')).toBeNull();
  });
});

describe('EMP201: totals, months and the leviable amount are derived in code', () => {
  const twelve = Array.from({ length: 12 }, (_, i) => {
    const month = ((i + 2) % 12) + 1; // March .. February
    const year = month >= 3 ? 2024 : 2025;
    return { tax_period: `${year}${String(month).padStart(2, '0')}`, paye_amount: '1 000.00', sdl_amount: '100.25', uif_amount: '50.00', total_liability: '1 150.25' };
  });

  it('sums only the in-period months and derives leviable = SDL x 100, labelled derived', () => {
    const rows = [{ tax_period: '202402', paye_amount: '999.00', sdl_amount: '99.00', uif_amount: '49.00', total_liability: '1 147.00' }, ...twelve];
    const result = deriveEmp201(rows, FEB_YEAR);
    expect(result.values.months_submitted).toHaveLength(12);
    expect(result.values.derived_sdl_total).toBe(1203);
    expect(result.values.derived_paye_total).toBe(12000);
    expect(result.values.derived_leviable_amount).toBe(120300);
    expect(result.derived.derived_leviable_amount).toMatch(/derived: SDL total x 100/);
    expect(result.derived.derived_sdl_total).toMatch(/^derived:/);
    expect(result.notes.join(' ')).toMatch(/outside the measurement period.*202402/);
  });

  it('totals nothing without a measurement period', () => {
    const result = deriveEmp201(twelve, null);
    expect(result.values.derived_sdl_total).toBeNull();
    expect(result.values.derived_leviable_amount).toBeNull();
    expect(Object.keys(result.derived)).toEqual([]);
  });

  it('refuses to total when one month has two different returns', () => {
    const rows = [...twelve, { ...twelve[0], sdl_amount: '200.00' }];
    const result = deriveEmp201(rows, FEB_YEAR);
    expect(result.values.derived_sdl_total).toBeNull();
    expect(result.notes.join(' ')).toMatch(/Two different returns/);
  });

  it('a month filed twice with the same figures counts once', () => {
    const result = deriveEmp201([...twelve, { ...twelve[3] }], FEB_YEAR);
    expect(result.values.derived_sdl_total).toBe(1203);
  });

  it('an SDL-exempt employer gets no derived leviable amount', () => {
    const rows = twelve.map((row) => ({ ...row, sdl_amount: '0.00' }));
    const result = deriveEmp201(rows, FEB_YEAR);
    expect(result.values.derived_sdl_total).toBe(0);
    expect(result.values.derived_leviable_amount).toBeNull();
    expect(result.notes.join(' ')).toMatch(/SDL-exempt/);
  });

  it('never names a derived value as TMPS or procurement, and never overwrites the printed leviable amount', () => {
    const result = deriveEmp201(twelve, FEB_YEAR);
    for (const key of Object.keys(result.values)) {
      expect(key).not.toMatch(/tmps|procurement/);
      expect(key).not.toBe('sum_of_leviable_amount');
    }
  });
});

describe('SED proof of payment: period checks and totals in code', () => {
  it('flags each payment against the period and sums the evidenced amounts', () => {
    const rows = [
      { beneficiary_name: 'Sunrise Early Learning Centre NPC', payment_date: '05/11/2024', amount_paid: 'R12 500.00' },
      { beneficiary_name: 'Thembalethu Feeding Scheme', payment_date: '17/03/2025', amount_paid: 'R4 000.00' },
      { beneficiary_name: 'Thembalethu Feeding Scheme', payment_date: null, amount_paid: null },
    ];
    const result = deriveSedPayments(rows, FEB_YEAR);
    expect(result.rows.map((row) => row.payment_within_measurement_period)).toEqual([true, false, null]);
    expect(result.values.derived_amount_paid_total).toBe(16500);
    expect(result.values.derived_amount_paid_in_period).toBe(12500);
    expect(result.derived.derived_amount_paid_total).toMatch(/^derived:/);
  });

  it('a printout that says it is not a proof of payment evidences no payment in the period', () => {
    const rows = [
      { beneficiary_name: 'Sunrise Early Learning Centre NPC', payment_date: '04/03/2025', amount_paid: 'R500.00', marked_not_proof_of_payment: null },
      { beneficiary_name: 'Sunrise Early Learning Centre NPC', payment_date: '27/08/2024', amount_paid: 'R500.00', marked_not_proof_of_payment: true },
    ];
    const result = deriveSedPayments(rows, FEB_YEAR);
    // The in-period row is the one the bank marked: nothing paid in the period is evidenced.
    expect(result.values.derived_amount_paid_in_period).toBe(0);
    // The printed total is still every amount the document shows.
    expect(result.values.derived_amount_paid_total).toBe(1000);
    expect(result.notes.join(' ')).toMatch(/Row 2.*not a proof of payment/);
  });

  it('does not judge the period without one', () => {
    const result = deriveSedPayments([{ payment_date: '05/11/2024', amount_paid: '100.00' }], undefined);
    expect(result.rows[0].payment_within_measurement_period).toBeNull();
    expect(result.values.derived_amount_paid_in_period).toBeNull();
  });
});

describe('supplier ledger: counts and the total check in code', () => {
  const ledger = {
    supplier_name: 'Bright Office Supplies',
    ap_subledger_total: '15 765.75',
    ledger_entry_rows: [
      { entry_date: '2023-07-15', entry_reference: 'INV 3301', entry_amount: '4 812.50' },
      { entry_date: '2023-08-15', entry_reference: 'INV 3388', entry_amount: '4 812.50' },
      { entry_date: '2023-09-15', entry_reference: '', entry_amount: '6 140.75' },
    ],
  };

  it('counts referenced entries and checks the printed total against them', () => {
    const result = deriveLedger(ledger);
    expect(result.values.supporting_invoices_reviewed).toBe(2);
    expect(result.values.derived_entries_total).toBe(15765.75);
    expect(result.values.ledger_total_matches_entries).toBe(true);
    expect(result.derived.supporting_invoices_reviewed).toMatch(/^derived:/);
  });

  it('flags a printed total that does not equal its entries', () => {
    const result = deriveLedger({ ...ledger, ap_subledger_total: '15 000.00' });
    expect(result.values.ledger_total_matches_entries).toBe(false);
    expect(result.notes.join(' ')).toMatch(/does not equal/);
  });
});

describe('payroll: the headcount is counted in code', () => {
  it('counts named employee rows only', () => {
    const result = deriveEmployeeCount([{ employee_name: 'Mokoena Thabo' }, { employee_name: 'Dlamini Nomsa' }, { employee_name: '' }]);
    expect(result.values.derived_employee_count).toBe(2);
    expect(result.derived.derived_employee_count).toMatch(/^derived:/);
  });
});
