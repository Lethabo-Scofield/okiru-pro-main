/**
 * Every ownership indicator must score on ITS OWN measure (Statement 100,
 * Annexe 100) — which is exactly what we told the sector expert this engine
 * does: docs/Okiru-Sector-Configuration-Reference.pdf (Zoleka Mnanzana,
 * 2026-08-13) states "points = (actual / target) x weighting".
 *
 * It did not. Crossing the 25% black-VOTING target triggered a fast path that
 * awarded FULL economic interest, FULL black-women EI, a hardcoded 3
 * designated-group points and FULL net value regardless of the actual figures.
 * See docs/calculator-audit-2026-07-26.md item 12(a).
 *
 * The defect stayed invisible because every golden fixture uses a 100%-black
 * entity, which scores the same either way. These tests use a PARTIALLY black
 * entity, where the fast path and the correct maths diverge.
 */
import { describe, it, expect } from 'vitest';
import { calculateScorecard } from '../rules/calculationEngine.js';
import type { ShareholderInput, FinancialsInput } from '../rules/calculationEngine.js';

const BASE: FinancialsInput = {
  revenue: 50_000_000, npat: 4_000_000, leviableAmount: 10_000_000,
  tmps: 30_000_000, headcount: 10, companyValue: 10_000_000,
  outstandingDebt: 0, yearsHeld: 5,
} as FinancialsInput;

async function ownership(shareholders: ShareholderInput[], financials: Partial<FinancialsInput> = {}) {
  const r: any = await calculateScorecard({
    sectorCode: 'RCOGP', scorecardType: 'Generic',
    shareholders, financials: { ...BASE, ...financials },
    employees: [], trainingPrograms: [], suppliers: [],
    esdContributions: [], sedContributions: [],
    entityValues: new Map(), crossPillarValues: new Map(),
  } as any);
  return r.pillars.find((p: any) => p.pillarCode === 'ownership');
}

const BLACK_26: ShareholderInput[] = [
  { name: 'Black Holder', blackOwnership: 1.0, blackWomenOwnership: 0, shares: 26, shareValue: 2_600_000, yearsHeld: 5 },
  { name: 'Other Holder', blackOwnership: 0, blackWomenOwnership: 0, shares: 74, shareValue: 7_400_000, yearsHeld: 5 },
];
const BLACK_100: ShareholderInput[] = [
  { name: 'Black Holder', blackOwnership: 1.0, blackWomenOwnership: 1.0, shares: 100, shareValue: 10_000_000, yearsHeld: 5 },
];

describe('ownership — no points without evidence (audit 12a)', () => {
  it('a 26%-black entity with no black women scores far below a 100%-black one', async () => {
    const partial = await ownership(BLACK_26);
    const full = await ownership(BLACK_100);
    // Measured on RCOGP Generic: pre-fix 18 vs 20 (a 2-point gap — crossing the
    // 25% voting target bought the same EI, black-women EI, designated-group
    // and net-value maxima the fully black entity earned). Post-fix 16 vs 20.
    // The 26% entity still legitimately maxes voting and EI, because 26%
    // exceeds the 25% target; what it no longer collects is the black-women
    // and designated-group points it has no evidence for.
    expect(full.points).toBe(20);
    expect(partial.points).toBe(16);
    expect(full.points - partial.points).toBeGreaterThanOrEqual(4);
  });

  it('never reaches the element maximum on 26% black ownership', async () => {
    const partial = await ownership(BLACK_26);
    expect(partial.points).toBeLessThan(partial.maxPoints);
  });

  it('awards nothing for ownership with no black shareholders', async () => {
    const none = await ownership([
      { name: 'Other Holder', blackOwnership: 0, blackWomenOwnership: 0, shares: 100, shareValue: 10_000_000, yearsHeld: 5 },
    ]);
    expect(none.points).toBe(0);
  });

  it('awards no net value when acquisition debt has no valuation to net against', async () => {
    // Annexe 100(C) needs the equity value to weigh the debt against. The old
    // fallback scored net value from VOTING and ignored the debt entirely.
    const withDebt = await ownership(BLACK_26, { companyValue: 0, outstandingDebt: 5_000_000 });
    const noDebt = await ownership(BLACK_26, { companyValue: 0, outstandingDebt: 0 });
    expect(withDebt.points).toBeLessThan(noDebt.points);
  });

  it('does not treat crossing the voting target as meeting the sub-minimum', async () => {
    // `subMinimumMet` used to short-circuit on the same fast path, sparing the
    // entity its one-level discount without any net-value evidence.
    const noValuation = await ownership(BLACK_26, { companyValue: 0, outstandingDebt: 5_000_000 });
    expect(noValuation.subMinimumMet).toBe(false);
  });
});
