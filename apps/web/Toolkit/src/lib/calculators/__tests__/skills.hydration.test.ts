/**
 * Skills hydration regression (BBEE-008/009).
 *
 * The Skills pillar previously scored 0 when the input layer populated `totalCost`
 * but not the legacy `cost`, or `race` but not the legacy `isBlack` flag — the
 * "skills info doesn't reflect after items are added" complaint. These tests lock
 * in that the calculator hydrates from either representation.
 */
import { describe, it, expect } from 'vitest';
import { calculateSkillsScore } from '../skills';
import type { SkillsData, TrainingProgram } from '../../types';

const skillsData = (programs: Partial<TrainingProgram>[]): SkillsData => ({
  id: '1',
  clientId: 'C-1',
  leviableAmount: 10_000_000,
  trainingPrograms: programs as TrainingProgram[],
});

describe('Skills hydration', () => {
  it('scores a program that has totalCost but no legacy cost field', () => {
    const r = calculateSkillsScore(skillsData([
      { id: '1', categoryCode: 'E', race: 'African', gender: 'Male', isBlack: true, totalCost: 200_000 },
    ]));
    expect(r.rawStats.blackSpend).toBeGreaterThan(0);
    expect(r.total).toBeGreaterThan(0);
  });

  it('treats a learner as black from race even when isBlack flag is absent', () => {
    const r = calculateSkillsScore(skillsData([
      { id: '1', categoryCode: 'E', race: 'African', gender: 'Female', cost: 200_000 },
    ]));
    expect(r.rawStats.totalBlackLearners).toBe(1);
    expect(r.total).toBeGreaterThan(0);
  });

  it('counts absorption from isAbsorbed (not employment status)', () => {
    const r = calculateSkillsScore(skillsData([
      { id: '1', categoryCode: 'D', race: 'African', gender: 'Male', isBlack: true, cost: 100_000, isAbsorbed: true, employmentStatus: 'Unemployed' },
    ]));
    expect(r.rawStats.absorbedCount).toBe(1);
  });

  // Polo feedback #9: learnership/apprenticeship participation must count the
  // proper RCOGP category codes C (apprenticeship) and D (learnership), not just
  // B/legacy strings. Previously these scored zero.
  it('counts learnership (D), apprenticeship (C) and internship (B) participation', () => {
    const r = calculateSkillsScore(skillsData([
      { id: '1', categoryCode: 'D', race: 'African', gender: 'Male', isBlack: true, cost: 50_000 },
      { id: '2', categoryCode: 'C', race: 'Coloured', gender: 'Female', isBlack: true, cost: 50_000 },
      { id: '3', categoryCode: 'B', race: 'Indian', gender: 'Male', isBlack: true, cost: 50_000 },
    ]));
    expect(r.rawStats.learnershipCount).toBe(3);
    expect(r.learnerships).toBeGreaterThan(0);
  });

  it('does not count non-participation categories (E) as learnerships', () => {
    const r = calculateSkillsScore(skillsData([
      { id: '1', categoryCode: 'E', race: 'African', gender: 'Male', isBlack: true, cost: 50_000 },
    ]));
    expect(r.rawStats.learnershipCount).toBe(0);
  });
});
