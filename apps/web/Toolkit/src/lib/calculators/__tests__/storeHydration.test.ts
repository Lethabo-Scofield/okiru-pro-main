/**
 * Store loader hydration (BBEE-008) — the "Skills data disappears on calculate /
 * reload" bug. loadClientData previously dropped isAbsorbed, isForeign, isBursary,
 * employmentStatus, isYesEmployee, totalCost and cost components when mapping the
 * API payload, silently zeroing the Skills pillar on reload / _recalculateAll.
 * hydrateTrainingProgramFromApi must preserve every field the calculator reads.
 */
import { describe, it, expect } from 'vitest';
import { hydrateTrainingProgramFromApi } from '../../store';
import { calculateSkillsScore } from '../skills';

describe('hydrateTrainingProgramFromApi', () => {
  it('preserves YES / absorption / employment / bursary flags', () => {
    const out = hydrateTrainingProgramFromApi({
      id: 't1', programName: 'Learnership', categoryCode: 'D', race: 'African', gender: 'Male',
      isYesEmployee: true, isAbsorbed: true, employmentStatus: 'Unemployed', isForeign: false,
      totalCost: 120_000,
    });
    expect(out.isYesEmployee).toBe(true);
    expect(out.isAbsorbed).toBe(true);
    expect(out.employmentStatus).toBe('Unemployed');
    expect(out.totalCost).toBe(120_000);
    expect(out.cost).toBe(120_000); // calculator reads `cost`
    expect(out.isBlack).toBe(true); // derived from race
  });

  it('derives totalCost from cost components when no explicit total provided', () => {
    const out = hydrateTrainingProgramFromApi({
      id: 't2', categoryCode: 'E', race: 'Coloured', gender: 'Female',
      courseCost: 50_000, travelCost: 10_000, salaryCost: 5_000,
    });
    expect(out.totalCost).toBe(65_000);
    expect(out.cost).toBe(65_000);
  });

  it('round-trips through the calculator with a non-zero score (was 0 before the fix)', () => {
    const programs = [
      hydrateTrainingProgramFromApi({ id: 'a', categoryCode: 'E', race: 'African', gender: 'Male', totalCost: 200_000 }),
      hydrateTrainingProgramFromApi({ id: 'b', categoryCode: 'D', race: 'African', gender: 'Female', courseCost: 100_000, isAbsorbed: true }),
    ];
    const r = calculateSkillsScore({ id: '1', clientId: 'C', leviableAmount: 5_000_000, trainingPrograms: programs as any });
    expect(r.rawStats.blackSpend).toBeGreaterThan(0);
    expect(r.rawStats.absorbedCount).toBe(1);
    expect(r.total).toBeGreaterThan(0);
  });
});
