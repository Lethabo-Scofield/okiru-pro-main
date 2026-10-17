/**
 * Preferential Procurement, ESD and SED — one test per rule the Empower
 * toolkit (RCOGP Generic v1.4) scores by, so each can be read against the
 * formula it reproduces ('Procurement Scorecard', 'Procurement Data',
 * 'ESD Data', 'ESD and SED Calcs', Summary Scorecard).
 */
import { describe, it, expect } from 'vitest';
import { calculateProcurementScore, qualifiesForEnhancedRecognition } from '../procurement';
import { calculateEsdScore, calculateSedScore } from '../esd-sed';
import { RCOGP_GENERIC_CALCULATOR_CONFIG as RCOGP } from '../../sectors/rcogp-generic';
import { parseCalcDate, yearFrac30360US, yearFracActual360 } from '../toolkitDates';
import type { Contribution, ESDData, ProcurementData, SEDData, Supplier } from '../../types';

const supplier = (o: Partial<Supplier> = {}): Supplier => ({
  id: 's', name: 'Supplier', beeLevel: 4, blackOwnership: 0, blackWomenOwnership: 0,
  youthOwnership: 0, disabledOwnership: 0, enterpriseType: 'generic',
  isEmpoweringSupplier: true, isSupplierDevRecipient: false, hasThreeYearContract: false,
  spend: 1_000_000, ...o,
});
const pp = (suppliers: Supplier[], o: Partial<ProcurementData> = {}): ProcurementData => ({
  id: 'pp', clientId: 'c', tmps: 10_000_000, suppliers, ...o,
});
const line = (r: { subLines: Array<{ name: string; score: number; spend: number; note?: string }> }, prefix: string) =>
  r.subLines.find((l) => l.name.startsWith(prefix))!;

describe('procurement denominator: MAX(TMPS, supplier listing × (1 + buffer))', () => {
  it('uses TMPS when it is the larger', () => {
    expect(calculateProcurementScore(pp([supplier()]), RCOGP).denominator).toBe(10_000_000);
  });
  it('uses the listing when TMPS is smaller, and says so', () => {
    const r = calculateProcurementScore(pp([supplier({ spend: 1_500_000 })], { tmps: 1_000_000 }), RCOGP);
    expect(r.denominator).toBe(1_500_000);
    expect(r.dataFlags).toEqual([]);
    expect(r.coverageNotes?.join(' ')).toContain('larger of the two');
  });
  it('grosses the listing up by the buffer', () => {
    const r = calculateProcurementScore(pp([supplier({ spend: 1_000_000 })], { tmps: 0, tmpsBuffer: 0.1 }), RCOGP);
    expect(r.denominator).toBeCloseTo(1_100_000, 2);
  });
});

describe('the 1.2 recognition factor', () => {
  it('RCOGP Generic: ≥51% black AND ≥51% flow-through black owned, any size', () => {
    expect(qualifiesForEnhancedRecognition(supplier({ blackOwnership: 0.6, flowThroughOwnership: 0.6 }), 'flow_through')).toBe(true);
    expect(qualifiesForEnhancedRecognition(supplier({ blackOwnership: 0.6 }), 'flow_through')).toBe(false);
  });
  it('RCOGP Generic: a QSE/EME at ≥51% flow-through that is an SD beneficiary on a 3-year contract', () => {
    const s = supplier({ enterpriseType: 'qse', blackOwnership: 0.3, flowThroughOwnership: 0.6, isSupplierDevRecipient: true, hasThreeYearContract: true });
    expect(qualifiesForEnhancedRecognition(s, 'flow_through')).toBe(true);
    expect(qualifiesForEnhancedRecognition({ ...s, hasThreeYearContract: false }, 'flow_through')).toBe(false);
  });
  it('other templates: a QSE/EME ≥51% black owned that is an SD beneficiary or holds a 3-year contract', () => {
    expect(qualifiesForEnhancedRecognition(supplier({ enterpriseType: 'eme', blackOwnership: 0.6, isSupplierDevRecipient: true }))).toBe(true);
    expect(qualifiesForEnhancedRecognition(supplier({ enterpriseType: 'eme', blackOwnership: 0.6, hasThreeYearContract: true }))).toBe(true);
    expect(qualifiesForEnhancedRecognition(supplier({ enterpriseType: 'generic', blackOwnership: 0.6, isSupplierDevRecipient: true }))).toBe(false);
  });
  it('multiplies the recognised spend every line sums', () => {
    // L4 (1.00) × R1m × 1.2 = R1.2m on the 51% black-owned line.
    const r = calculateProcurementScore(pp([supplier({ blackOwnership: 0.6, flowThroughOwnership: 0.6 })]), RCOGP);
    expect(line(r, 'Spend on Empowering Suppliers ≥51%').spend).toBe(1_200_000);
    expect(r.recognisedSpend).toBe(1_200_000);
  });
});

describe('all-suppliers line (row 51)', () => {
  const notEmpowering = supplier({ isEmpoweringSupplier: false });
  it('RCOGP Generic counts every supplier, as the toolkit does, and notes the ones marked "not empowering"', () => {
    const r = calculateProcurementScore(pp([notEmpowering]), RCOGP);
    expect(line(r, 'B-BBEE Procurement Spend').spend).toBe(1_000_000);
    expect(r.coverageNotes?.join(' ')).toContain('not empowering');
  });
  it('elsewhere an explicit "No" still excludes the supplier', () => {
    const r = calculateProcurementScore(pp([notEmpowering]));
    expect(line(r, 'B-BBEE Procurement Spend').spend).toBe(0);
  });
  it('carries its arithmetic as a note', () => {
    const r = calculateProcurementScore(pp([supplier({ spend: 4_000_000 })]), RCOGP);
    // R4m × 1.00 ÷ R10m = 40% ÷ 80% × 5 = 2.50
    expect(line(r, 'B-BBEE Procurement Spend').note).toBe('R4.00m ÷ R10.0m (TMPS) = 40% ÷ 80% × 5 = 2.50');
    expect(line(r, 'B-BBEE Procurement Spend').score).toBe(2.5);
  });
});

describe('QSE / EME lines: a supplier that grew out of QSE/EME (RCOGP Generic)', () => {
  const grown = supplier({
    blackOwnership: 0.6, flowThroughOwnership: 0.6, sizeAtFirstProcurement: 'qse', firstProcurementDate: '2023-01-01',
  });
  it('counts on the QSE line within five years of first procurement, measured to the period end', () => {
    const r = calculateProcurementScore(pp([grown], { measurementPeriodEnd: '2026-02-28' }), RCOGP);
    expect(line(r, 'Spend on QSE').spend).toBeGreaterThan(0);
    expect(line(r, 'Spend on EME').spend).toBe(0);
  });
  it('does not after five years', () => {
    const r = calculateProcurementScore(pp([{ ...grown, firstProcurementDate: '2020-06-01' }], { measurementPeriodEnd: '2026-02-28' }), RCOGP);
    expect(line(r, 'Spend on QSE').spend).toBe(0);
  });
  it('is not judged without the period end, and says so', () => {
    const r = calculateProcurementScore(pp([grown]), RCOGP);
    expect(line(r, 'Spend on QSE').spend).toBe(0);
    expect(r.coverageNotes?.join(' ')).toContain('measurement-period end');
  });
  it('is RCOGP Generic only', () => {
    const r = calculateProcurementScore(pp([grown], { measurementPeriodEnd: '2026-02-28' }));
    expect(line(r, 'Spend on QSE').spend).toBe(0);
  });
});

describe('designated-group bonus (row 56): ≥51% black AND ≥51% designated-group owned', () => {
  it('reads the designated-group ownership figure when there is one', () => {
    const yes = calculateProcurementScore(pp([supplier({ blackOwnership: 0.6, designatedGroupOwnership: 0.55 })]), RCOGP);
    const no = calculateProcurementScore(pp([supplier({ blackOwnership: 0.6, designatedGroupOwnership: 0.3, youthOwnership: 0.3 })]), RCOGP);
    expect(yes.designatedGroup).toBeGreaterThan(0);
    expect(no.designatedGroup).toBe(0);
  });
  it('falls back to the flags when no figure was captured', () => {
    const r = calculateProcurementScore(pp([supplier({ blackOwnership: 0.6, isDesignatedGroup: true })]), RCOGP);
    expect(r.designatedGroup).toBeGreaterThan(0);
  });
});

describe('black-women-owned line (row 55): the supplier qualifies at ≥30%, the 12% is the spend target', () => {
  it('does not count a 20% black-women-owned supplier', () => {
    const r = calculateProcurementScore(pp([supplier({ blackWomenOwnership: 0.2 })]), RCOGP);
    expect(line(r, 'Spend on Empowering Suppliers >30%').spend).toBe(0);
  });
});

// ── ESD / SED ─────────────────────────────────────────────────────────────

const NPAT = 10_000_000;
const contribution = (o: Partial<Contribution>): Contribution => ({
  id: 'c', beneficiary: 'B', type: 'grant', amount: 100_000, category: 'supplier_development', ...o,
} as Contribution);
const esd = (contributions: Contribution[], o: Partial<ESDData> = {}): ESDData => ({
  id: 'e', clientId: 'c', contributions, graduationBonus: false, jobsCreatedBonus: false, ...o,
});
const sed = (contributions: Contribution[]): SEDData => ({ id: 's', clientId: 'c', contributions });

describe('contribution-type aliases: the capture form\'s own types are priced', () => {
  it.each([
    ['loan', 0.5], ['guarantee', 0.03], ['collateral', 0.03], ['equity_investment', 0.7],
    ['employee_secondment', 0.6], ['employee_mentorship', 0.6], ['professional_services_discounted', 0.6],
  ])('%s → factor %s', (type, factor) => {
    const r = calculateEsdScore(esd([contribution({ type: type as Contribution['type'] })]), NPAT);
    expect(r.sdSpend).toBeCloseTo(100_000 * factor, 2);
    expect(r.unrecognisedTypes).toEqual([]);
  });
  it('leaves credit_facility for a reviewer — a loan or payment terms, the substance decides', () => {
    const r = calculateEsdScore(esd([contribution({ type: 'credit_facility' })]), NPAT);
    expect(r.sdSpend).toBe(0);
    expect(r.unrecognisedTypes).toContain('credit_facility');
  });
  it('a sector list keyed by an alias cannot zero the canonical type', () => {
    // The bundled lists still carry equity_investment: 0.0 — it must not reach minority_investment.
    const r = calculateEsdScore(esd([contribution({ type: 'equity_investment' })]), NPAT, RCOGP);
    expect(r.sdSpend).toBeCloseTo(70_000, 2);
  });
});

describe('guarantees: 50% in the Empower templates (RCOGP Generic), 3% in the Codes', () => {
  it('RCOGP Generic recognises 50%', () => {
    expect(calculateEsdScore(esd([contribution({ type: 'guarantees' })]), NPAT, RCOGP).sdSpend).toBeCloseTo(50_000, 2);
  });
  it('without the sector override the Codes\' 3% stands', () => {
    expect(calculateEsdScore(esd([contribution({ type: 'guarantees' })]), NPAT).sdSpend).toBeCloseTo(3_000, 2);
  });
});

describe('SED scores on its own table, never the sector\'s ESD list', () => {
  it('overhead, professional services and employee time are 80% even under RCOGP Generic', () => {
    for (const type of ['overhead_costs', 'professional_services_free', 'professional_services_discounted', 'employee_time']) {
      const r = calculateSedScore(sed([contribution({ type: type as Contribution['type'], category: 'socio_economic' })]), NPAT, RCOGP);
      expect(r.actualSpend).toBeCloseTo(80_000, 2);
    }
  });
  it('loans, guarantees and investments are not SED contributions', () => {
    const r = calculateSedScore(sed([contribution({ type: 'interest_free_loan', category: 'socio_economic' })]), NPAT, RCOGP);
    expect(r.actualSpend).toBe(0);
  });
  it('ignores "% of spend benefiting black people", as the toolkit does', () => {
    const r = calculateSedScore(sed([contribution({ category: 'socio_economic', blackBenefitPercent: 10 })]), NPAT, RCOGP);
    expect(r.actualSpend).toBe(100_000);
  });
  it('carries its arithmetic as a note', () => {
    const r = calculateSedScore(sed([contribution({ category: 'socio_economic', amount: 50_000 })]), NPAT, RCOGP);
    expect(r.subLines[0].note).toBe('R50.0k ÷ R10.0m (NPAT) = 0.5% ÷ 1% × 5 = 2.50');
  });
});

describe('ESD beneficiary qualification (RCOGP Generic, ESD Data[Recognised Amount])', () => {
  it('counts an EME/QSE at least 51% black owned', () => {
    const r = calculateEsdScore(esd([contribution({ beneficiaryCurrentSize: 'eme', beneficiaryBlackOwnership: 0.51 })]), NPAT, RCOGP);
    expect(r.sdSpend).toBe(100_000);
  });
  it('counts a Generic that was an EME/QSE when first assisted, still ≥51% black and flow-through black owned', () => {
    const c = contribution({ beneficiaryCurrentSize: 'generic', beneficiarySizeWhenFirstAssisted: 'qse', beneficiaryBlackOwnership: 0.6, beneficiaryFlowThroughOwnership: 0.6 });
    expect(calculateEsdScore(esd([c]), NPAT, RCOGP).sdSpend).toBe(100_000);
    expect(calculateEsdScore(esd([{ ...c, beneficiaryFlowThroughOwnership: 0 }]), NPAT, RCOGP).sdSpend).toBe(0);
  });
  it('does not count a beneficiary under 51% black owned, and reports it on the line', () => {
    const r = calculateEsdScore(esd([contribution({ beneficiaryCurrentSize: 'qse', beneficiaryBlackOwnership: 0.3 })]), NPAT, RCOGP);
    expect(r.sdSpend).toBe(0);
    expect(r.nonQualifyingSpend).toBe(100_000);
    expect(r.sdSubLines[0].note).toContain('not counted');
  });
  it('leaves rows without beneficiary facts as they always scored', () => {
    expect(calculateEsdScore(esd([contribution({})]), NPAT, RCOGP).sdSpend).toBe(100_000);
  });
  it('is RCOGP Generic only', () => {
    const r = calculateEsdScore(esd([contribution({ beneficiaryCurrentSize: 'qse', beneficiaryBlackOwnership: 0.3 })]), NPAT);
    expect(r.sdSpend).toBe(100_000);
  });
});

describe('computed ESD factors', () => {
  const qualifying = { beneficiaryCurrentSize: 'eme' as const, beneficiaryBlackOwnership: 1 };
  it('lower interest: (prime − actual) × amount', () => {
    const c = contribution({ ...qualifying, type: 'lower_interest_loan', primeRate: 0.1175, actualInterestRate: 0.05 });
    expect(calculateEsdScore(esd([c]), NPAT, RCOGP).sdSpend).toBeCloseTo(6_750, 2);
  });
  it('lower interest without the rates: 0 (the toolkit table cell is blank)', () => {
    const c = contribution({ ...qualifying, type: 'lower_interest_loan' });
    expect(calculateEsdScore(esd([c]), NPAT, RCOGP).sdSpend).toBe(0);
  });
  it('shorter payments: 15% less a point per day to pay; nothing past 14 days', () => {
    const c = contribution({ ...qualifying, type: 'shorter_payment_terms', invoiceDate: '2025-06-01', paymentDate: '2025-06-06' });
    expect(calculateEsdScore(esd([c]), NPAT, RCOGP).sdSpend).toBeCloseTo(10_000, 2);
    expect(calculateEsdScore(esd([{ ...c, paymentDate: '2025-06-20' }]), NPAT, RCOGP).sdSpend).toBe(0);
  });
  it('shorter payments with no dates on an older row: the table\'s 15%', () => {
    const c = contribution({ type: 'shorter_payment_terms' });
    expect(calculateEsdScore(esd([c]), NPAT, RCOGP).sdSpend).toBeCloseTo(15_000, 2);
  });
  it('a graduate past five years is still recognised, but on the table factor, not the computed one', () => {
    const c = contribution({
      type: 'shorter_payment_terms', invoiceDate: '2025-06-01', paymentDate: '2025-06-06',
      beneficiaryCurrentSize: 'generic', beneficiarySizeWhenFirstAssisted: 'eme', beneficiaryBlackOwnership: 1,
      beneficiaryBlackOwnershipWhenFirstAssisted: 1, beneficiaryFlowThroughOwnership: 0.6, firstAssistanceDate: '2019-08-01',
    });
    expect(calculateEsdScore(esd([c], { measurementPeriodEnd: '2026-02-28' }), NPAT, RCOGP).sdSpend).toBeCloseTo(15_000, 2);
  });
});

describe('ED sub-minimum: 40% of the 5-point BASE line, bonuses excluded (Summary Scorecard H61)', () => {
  const ed = (amount: number) => contribution({ category: 'enterprise_development', amount });
  it('fails on a weak base line even when the bonuses lift the total', () => {
    // R30k ÷ (1% × R10m) × 5 = 1.5 base; +1 graduation +1 jobs = 3.5 total.
    const r = calculateEsdScore(esd([ed(30_000)], { graduationBonus: true, jobsCreatedBonus: true }), NPAT, RCOGP);
    expect(r.edTotal).toBe(3.5);
    expect(r.edSubMinimumMet).toBe(false);
  });
  it('passes at 2 base points', () => {
    expect(calculateEsdScore(esd([ed(40_000)]), NPAT, RCOGP).edSubMinimumMet).toBe(true);
  });
});

describe('toolkit date arithmetic', () => {
  it('YEARFRAC basis 0 (ESD years since first assistance) matches the workbook', () => {
    // 'ESD Data' row: first assisted 2019-09-01, data date 2026-02-28 → 6.4916…
    expect(yearFrac30360US(parseCalcDate('2019-09-01')!, parseCalcDate('2026-02-28')!)).toBeCloseTo(6.491667, 5);
  });
  it('YEARFRAC basis 2 (years of being a supplier) is days / 360', () => {
    expect(yearFracActual360(parseCalcDate('2022-10-01')!, parseCalcDate('2026-02-28')!)).toBeCloseTo(1246 / 360, 6);
  });
  it('reads ISO, dd/mm/yyyy and Excel serial dates, and nothing else', () => {
    expect(parseCalcDate('2026-02-28')?.toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(parseCalcDate('28/02/2026')?.toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(parseCalcDate(45108)?.toISOString().slice(0, 10)).toBe('2023-07-01');
    expect(parseCalcDate('2026')).toBeNull();
    expect(parseCalcDate('not a date')).toBeNull();
  });
});
