/**
 * Management Control — workbook per-demographic EAP fidelity.
 *
 * Proves the calculator reproduces the Lake Trading workbook `MC Scorecard`
 * formula (e.g. row 31: E31 = $E$30*EAP!C23, F31 = F$30*EAP!C23,
 * H31 = MIN(G31/E31*F31, F31)). When a band is 100% one demographic group g,
 * that group's score caps at `bandMaxPts × effEAP_g` (the workbook's F-column),
 * which is the cell value verified against the workbook (Senior AM L31 = 2×effAM).
 *
 * @see docs/eap-methodology + scripts/import-eap-norms.cjs
 */
import { describe, it, expect } from 'vitest';
import { calculateManagementScore } from '../management';
import type { Employee, ManagementData } from '../../types';
import { getEffectiveEap, getEffectiveBlackFemaleEap } from '../eapTargets';

const band = (n: number, race: string, gender: string, designation: string): Employee[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${designation}-${i}`,
    name: `${race} ${gender} ${i}`,
    gender,
    race,
    designation,
    isDisabled: false,
  }) as Employee);

const data = (employees: Employee[]): ManagementData => ({ id: '1', clientId: 'C', employees });

describe('MC per-demographic EAP — workbook fidelity', () => {
  it('Senior band of 100% African Male caps at seniorMaxPts × effEAP_AM (workbook F-column)', () => {
    const r = calculateManagementScore(data(band(10, 'African', 'Male', 'Senior')), undefined, 'Gauteng');
    const effAM = getEffectiveEap('Gauteng').AM;
    // RCOGP senior black maxPts = 2; band target 0.60. AM actual = 100% → capped at 2 × effAM.
    // (Returned scores are rounded to 2dp, so assert to 2 decimals.)
    expect(r.seniorBlack).toBeCloseTo(2 * effAM, 2);
    // No black females in the band → BWO row scores 0.
    expect(r.seniorBWO).toBeCloseTo(0, 6);
  });

  it('Senior band of 100% African Female caps black & black-female rows at their effEAP shares', () => {
    const r = calculateManagementScore(data(band(10, 'African', 'Female', 'Senior')), undefined, 'Gauteng');
    const effAF = getEffectiveEap('Gauteng').AF;       // 6-group set (black row)
    const effBfAF = getEffectiveBlackFemaleEap('Gauteng').AF; // female-only set (black-female row)
    expect(r.seniorBlack).toBeCloseTo(2 * effAF, 2);
    expect(r.seniorBWO).toBeCloseTo(1 * effBfAF, 2);
  });

  it('is province-sensitive (fixes the national-only breakdown bug)', () => {
    const emps = data(band(10, 'African', 'Male', 'Senior'));
    const gp = calculateManagementScore(emps, undefined, 'Gauteng').seniorBlack;
    const wc = calculateManagementScore(emps, undefined, 'Western Cape').seniorBlack;
    const effAmGp = getEffectiveEap('Gauteng').AM;
    const effAmWc = getEffectiveEap('Western Cape').AM;
    // Different provinces have materially different African-Male EAP availability.
    expect(effAmGp).not.toBeCloseTo(effAmWc, 2);
    expect(gp).toBeCloseTo(2 * effAmGp, 2);
    expect(wc).toBeCloseTo(2 * effAmWc, 2);
  });

  it('breakdown reports province effective EAP proportions, summing the 6 black groups to ~1.0', () => {
    const r = calculateManagementScore(data(band(6, 'African', 'Male', 'Senior')), undefined, 'Gauteng');
    const sum = r.eapBreakdowns.senior.reduce((s, g) => s + g.eapTarget, 0);
    expect(sum).toBeCloseTo(1.0, 2);
    const am = r.eapBreakdowns.senior.find(g => g.group === 'AM');
    expect(am?.eapTarget).toBeCloseTo(getEffectiveEap('Gauteng').AM, 4);
  });
});
