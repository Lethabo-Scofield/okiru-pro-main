/**
 * ICT Generic's ESD computed factors ('ESD Data'!V of the Empower ICT Generic
 * template): every shorter-payment row is scored on 15% less a point per day
 * to pay (AD:AE, 0 after 14 days or without both dates) and every
 * lower-interest / lower-dividend row on prime less the actual rate (AF),
 * whether or not the beneficiary qualifies. Our two deliberate differences:
 * AF has no floor (a loan above prime would cancel other contributions) and
 * reads a blank rate as 0%; we floor at 0 and want both rates.
 * Excel-checked row by row in the ICT parity gate (cases 108 and 115).
 */
import { describe, it, expect } from 'vitest';
import { calculateEsdScore, esdRecognisedValue } from '../esd-sed';
import { ICT_GENERIC_CALCULATOR_CONFIG as ICT, ICT_GENERIC_CODES_CALCULATOR_CONFIG as ICT_CODES } from '../../sectors/ict-generic';
import type { Contribution, ESDData } from '../../types';

const NPAT = 100_000_000;
const contribution = (o: Partial<Contribution>): Contribution => ({
  id: 'c', beneficiary: 'Invented Beneficiary', type: 'shorter_payment_terms', amount: 100_000, category: 'supplier_development', ...o,
} as Contribution);
const esd = (contributions: Contribution[]): ESDData => ({
  id: 'e', clientId: 'c', contributions, graduationBonus: false, jobsCreatedBonus: false,
});

describe('ICT Generic shorter payments: the computed factor on every row', () => {
  it.each([
    ['paid the same day', '2025-06-01', '2025-06-01', 15_000],
    ['paid in 6 days', '2025-06-01', '2025-06-07', 9_000],
    ['paid in 14 days', '2025-06-01', '2025-06-15', 1_000],
    ['paid in 15 days', '2025-06-01', '2025-06-16', 0],
    ['paid before the invoice', '2025-06-10', '2025-06-01', 0],
  ])('%s', (_label, invoiceDate, paymentDate, expected) => {
    const c = contribution({ invoiceDate, paymentDate });
    expect(esdRecognisedValue(c, ICT)).toBeCloseTo(expected, 6);
    expect(calculateEsdScore(esd([c]), NPAT, ICT).sdSpend).toBeCloseTo(expected, 2);
  });

  it('without both dates the row is recognised at 0, not at the table\'s 15%, and the line says why', () => {
    for (const c of [contribution({}), contribution({ invoiceDate: '2025-06-01' }), contribution({ paymentDate: '2025-06-01' })]) {
      expect(esdRecognisedValue(c, ICT)).toBe(0);
    }
    const r = calculateEsdScore(esd([contribution({}), contribution({ id: 'c2', category: 'enterprise_development' })]), NPAT, ICT);
    expect(r.sdSpend).toBe(0);
    expect(r.edSpend).toBe(0);
    expect(r.sdSubLines[0].note).toMatch(/1 shorter-payment contribution recognised at 0: no invoice and payment dates/);
    expect(r.edSubLines[0].note).toMatch(/1 shorter-payment contribution recognised at 0/);
  });

  it('is ICT Generic\'s toolkit method only: the Codes reading keeps the 15% for an undated row', () => {
    expect(esdRecognisedValue(contribution({}), ICT_CODES)).toBeCloseTo(15_000, 6);
    expect(esdRecognisedValue(contribution({}))).toBeCloseTo(15_000, 6);
  });
});

describe('ICT Generic lower interest and lower dividends: prime less the actual rate', () => {
  it.each([
    ['lower_interest_loan', 0.06, 4_750],
    ['lower_interest_loan', 0, 10_750],
    ['lower_dividend_investment', 0.1, 750],
  ] as const)('%s at %s', (type, actualInterestRate, expected) => {
    const c = contribution({ type, primeRate: 0.1075, actualInterestRate });
    expect(esdRecognisedValue(c, ICT)).toBeCloseTo(expected, 6);
  });

  it('a loan above prime is recognised at 0, never at a negative amount that cancels other rows', () => {
    const above = contribution({ type: 'lower_interest_loan', primeRate: 0.1075, actualInterestRate: 0.12 });
    expect(esdRecognisedValue(above, ICT)).toBe(0);
    const grant = contribution({ id: 'g', type: 'grant', amount: 50_000 });
    expect(calculateEsdScore(esd([above, grant]), NPAT, ICT).sdSpend).toBeCloseTo(50_000, 2);
  });

  it('a row without both rates is recognised at 0 until they are entered', () => {
    expect(esdRecognisedValue(contribution({ type: 'lower_interest_loan', primeRate: 0.1075 }), ICT)).toBe(0);
    expect(esdRecognisedValue(contribution({ type: 'lower_interest_loan', actualInterestRate: 0.05 }), ICT)).toBe(0);
  });
});

describe('esdRecognisedValue matches what calculateEsdScore sums', () => {
  it('row by row, for a mixed register', () => {
    const rows = [
      contribution({ id: 'a', type: 'grant', amount: 120_000 }),
      contribution({ id: 'b', type: 'guarantees', amount: 300_000, category: 'enterprise_development' }),
      contribution({ id: 'c', invoiceDate: '2025-07-01', paymentDate: '2025-07-04', amount: 80_000 }),
      contribution({ id: 'd', type: 'lower_interest_loan', primeRate: 0.1075, actualInterestRate: 0.04, amount: 900_000, category: 'enterprise_development' }),
      contribution({ id: 'e', type: 'grant', amount: 10_000, category: 'socio_economic' as Contribution['category'] }),
    ];
    const r = calculateEsdScore(esd(rows), NPAT, ICT);
    const sum = (cat: string) => rows.filter((c) => c.category === cat).reduce((a, c) => a + esdRecognisedValue(c, ICT), 0);
    expect(sum('supplier_development')).toBeCloseTo(r.sdSpend, 2);
    expect(sum('enterprise_development')).toBeCloseTo(r.edSpend, 2);
    expect(esdRecognisedValue(rows[4], ICT)).toBe(0);
  });
});
