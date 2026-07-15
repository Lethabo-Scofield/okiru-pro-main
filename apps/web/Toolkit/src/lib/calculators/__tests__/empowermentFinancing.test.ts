/**
 * FSC Empowerment Financing calculator — EF-proper (Targeted Investments 12 +
 * Transaction Financing 3 = 15 pts), Banks/LTI only.
 *
 * Sources: EF & ESD Scorecard - Banks/Long Term + Transaction Financing Data,
 * BBBEE Toolkit (FSC) Template v1.0.xlsx (FSC_Generic.md L15882–16145);
 * facility fixture = the real Sechaba_Financial_Group_FSC_Banks_LongTerm
 * test workbook's Empowerment Financing sheet (6 facilities, R9.8bn advanced,
 * all Qualifying % = 100).
 */
import { describe, it, expect } from 'vitest';
import { calculateEmpowermentFinancingScore } from '../empowermentFinancing';
import type { CalculatorConfig } from '../../../../shared/schema';
import type { EmpowermentFinancingData, EfFacility } from '../../types';

const EF_CFG = {
  empowermentFinancing: {
    maxPoints: 15,
    targetedInvestmentMaxPts: 12,
    transactionFinancingMaxPts: 3,
    sdMaxPts: 7,
    sdTarget: 0.018,
    edMaxPts: 3,
    edTarget: 0.002,
    graduationBonusMaxPts: 1,
    jobsBonusMaxPts: 1,
  },
} as CalculatorConfig;

const ZERO_CFG = {
  // STI-shaped placeholder: pillar exists but EF-proper points are 0.
  empowermentFinancing: {
    maxPoints: 0,
    targetedInvestmentMaxPts: 0,
    transactionFinancingMaxPts: 0,
    sdMaxPts: 10,
    sdTarget: 0.018,
    edMaxPts: 5,
    edTarget: 0.002,
    graduationBonusMaxPts: 1,
    jobsBonusMaxPts: 1,
  },
} as CalculatorConfig;

const base = (extra: Partial<EmpowermentFinancingData>): EmpowermentFinancingData => ({
  id: '',
  clientId: '',
  ...extra,
});

// The real Sechaba Banks workbook EF sheet (values in Rand).
const SECHABA_FACILITIES: EfFacility[] = [
  { id: '1', name: 'Renewable energy IPP facility', category: 'Transformational Infrastructure', valueAdvanced: 3_200_000_000, qualifyingPercent: 100 },
  { id: '2', name: 'Affordable housing development fund', category: 'Affordable Housing', valueAdvanced: 2_100_000_000, qualifyingPercent: 100 },
  { id: '3', name: 'Black commercial farmer funding', category: 'Agricultural Development', valueAdvanced: 900_000_000, qualifyingPercent: 100 },
  { id: '4', name: 'Black SME credit facility', category: 'Black SME Financing', valueAdvanced: 1_600_000_000, qualifyingPercent: 100 },
  { id: '5', name: 'B-BBEE ownership transaction funding', category: 'B-BBEE Transaction Financing', valueAdvanced: 1_200_000_000, qualifyingPercent: 100 },
  { id: '6', name: 'Black business growth fund', category: 'Black Business Growth / PE', valueAdvanced: 800_000_000, qualifyingPercent: 100 },
];

describe('calculateEmpowermentFinancingScore — gating (null outside Banks/LTI)', () => {
  it('returns null when no empowermentFinancing config (FSC Others / non-FSC)', () => {
    expect(calculateEmpowermentFinancingScore(base({}), {} as CalculatorConfig)).toBeNull();
  });

  it('returns null when EF-proper points are zero (STI-shaped config)', () => {
    expect(calculateEmpowermentFinancingScore(base({ facilities: SECHABA_FACILITIES }), ZERO_CFG)).toBeNull();
  });
});

describe('template-scalar path (EF & ESD Scorecard exact semantics)', () => {
  it('Banks TI: achieved D7 / SUM(C5:C6) × 12, capped', () => {
    // I14 =IFERROR(MIN(K14/SUM(C5:C6)*C14,C14),0)
    const half = calculateEmpowermentFinancingScore(
      base({ balanceSheetExposure: 800, additionalTiExposure: 200, newLoansExposure: 500 }),
      EF_CFG,
    )!;
    expect(half.lines[0].score).toBe(6); // 500/1000 × 12
    const over = calculateEmpowermentFinancingScore(
      base({ balanceSheetExposure: 800, additionalTiExposure: 200, newLoansExposure: 2_000 }),
      EF_CFG,
    )!;
    expect(over.lines[0].score).toBe(12); // capped at maxPts
  });

  it('LTI TI: achieved C6 / Qualifying Exposure C5 × 12', () => {
    const r = calculateEmpowermentFinancingScore(
      base({ qualifyingExposure: 400, targetedInvestmentPortion: 300 }),
      EF_CFG,
    )!;
    expect(r.lines[0].score).toBe(9); // 300/400 × 12
  });

  it('TF: SUM(tblTransactionFinancingData[Value]) / portfolio × 3', () => {
    // H15 =SUMIFS(tblTransactionFinancingData[Value],…); I15 =MIN(K15/C9*C15,C15)
    const r = calculateEmpowermentFinancingScore(
      base({ tfPortfolioValue: 300, tfTransactions: [{ value: 100 }, { value: 50 }] }),
      EF_CFG,
    )!;
    expect(r.lines[1].score).toBe(1.5); // 150/300 × 3
  });
});

describe('gathering-workbook facility path (qualifying-weighted ratio)', () => {
  it('scores the real Sechaba portfolio full 15/15 (all facilities 100% qualifying)', () => {
    const r = calculateEmpowermentFinancingScore(base({ facilities: SECHABA_FACILITIES }), EF_CFG)!;
    expect(r.total).toBe(15);
    expect(r.maxPoints).toBe(15);
    // Category split: 4 TI facilities (R7.8bn) vs 2 TF facilities (R2.0bn).
    expect(r.lines[0].target).toBe(7_800_000_000);
    expect(r.lines[1].target).toBe(2_000_000_000);
    expect(r.lines[0].score).toBe(12);
    expect(r.lines[1].score).toBe(3);
  });

  it('weights by Qualifying % (50% qualifying → half points)', () => {
    const r = calculateEmpowermentFinancingScore(
      base({
        facilities: [
          { id: '1', name: 'a', category: 'Affordable Housing', valueAdvanced: 1_000, qualifyingPercent: 50 },
          { id: '2', name: 'b', category: 'B-BBEE Transaction Financing', valueAdvanced: 1_000, qualifyingPercent: 50 },
        ],
      }),
      EF_CFG,
    )!;
    expect(r.lines[0].score).toBe(6);   // 12 × 0.5
    expect(r.lines[1].score).toBe(1.5); // 3 × 0.5
    expect(r.total).toBe(7.5);
  });

  it('does not fabricate: missing Qualifying % counts as 0; empty portfolio scores 0', () => {
    const noQ = calculateEmpowermentFinancingScore(
      base({ facilities: [{ id: '1', name: 'a', category: 'Affordable Housing', valueAdvanced: 1_000 }] }),
      EF_CFG,
    )!;
    expect(noQ.total).toBe(0);
    const empty = calculateEmpowermentFinancingScore(base({ facilities: [] }), EF_CFG)!;
    expect(empty.total).toBe(0);
  });

  it('template scalars take precedence over facilities when both present', () => {
    const r = calculateEmpowermentFinancingScore(
      base({
        balanceSheetExposure: 1_000, newLoansExposure: 250,
        facilities: SECHABA_FACILITIES, // would give 12; scalars must win
      }),
      EF_CFG,
    )!;
    expect(r.lines[0].score).toBe(3); // 250/1000 × 12
  });
});
