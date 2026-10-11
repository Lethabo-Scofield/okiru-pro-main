/**
 * Transport QSE ownership, line by line as the Codes name them
 * (docs/Transport Codes.xlsx, Road Freight QSE): voting 6, economic interest 9,
 * OWNERSHIP FULFILMENT (Yes) 1, net value 9, bonus black women 2, bonus
 * ESOP/BBOS/co-ops 10% 1 = 28.
 *
 * Fulfilment used to be scored as black-new-entrant economic interest and the
 * ESOP bonus as black-women economic interest. (Invented holders.)
 */
import { describe, expect, it } from 'vitest';
import { calculateOwnershipScore } from '../ownership';
// HELD BACK: the live TRANSPORT_QSE config still scores the borrowed slots
// (transportOwnershipLiveHeld.test.ts); these lines are what the expert reviews.
import { TRANSPORT_QSE_CODES_LINES_CALCULATOR_CONFIG as CFG } from '../../sectors/transport-qse';
import type { OwnershipData, Shareholder } from '../../types';

function holder(over: Partial<Shareholder>): Shareholder {
  return {
    id: 'h', name: 'Sipho Ndlovu', ownershipType: 'shareholder', blackOwnership: 1, blackWomenOwnership: 0,
    votingRightsPercent: 1, economicInterestPercent: 1, isDesignatedGroup: false, shares: 100, shareValue: 0, ...over,
  };
}
const data = (shareholders: Shareholder[], outstandingDebt = 0): OwnershipData =>
  ({ id: '', clientId: '', shareholders, companyValue: 0, outstandingDebt, yearsHeld: 0 }) as OwnershipData;

describe('Transport QSE ownership lines', () => {
  it('a 100% black male owner whose acquisition debt is stated nil scores the full 25 base points', () => {
    const r = calculateOwnershipScore(data([holder({ outstandingDebt: 0 })]), CFG);
    expect(r.ownershipFulfilment).toBe(1);
    expect(r.total).toBe(25);
  });

  it('the same owner with NO debt stated does not earn fulfilment (unanswered is not nil)', () => {
    const r = calculateOwnershipScore(data([holder({})]), CFG);
    expect(r.ownershipFulfilment).toBe(0);
    expect(r.total).toBe(24);
  });

  it('a black new entrant flag alone is not ownership fulfilment', () => {
    const r = calculateOwnershipScore(data([holder({ blackNewEntrant: true })]), CFG);
    expect(r.ownershipFulfilment).toBe(0);
    expect(r.total).toBe(24);
  });

  it('outstanding acquisition debt withholds fulfilment', () => {
    expect(calculateOwnershipScore(data([holder({ outstandingDebt: 250_000 })]), CFG).ownershipFulfilment).toBe(0);
    expect(calculateOwnershipScore(data([holder({ outstandingDebt: 0 })], 400_000), CFG).ownershipFulfilment).toBe(0);
  });

  it('a black woman owner with no scheme does not earn the ESOP/BBOS bonus', () => {
    const r = calculateOwnershipScore(data([holder({ blackWomenOwnership: 1, outstandingDebt: 0 })]), CFG);
    const esop = r.subLines.find((l) => /ESOP/.test(l.name));
    expect(esop?.score).toBe(0);
    // 6 + 9 + 1 + 9 base, plus the black-women bonus 2 = 27.
    expect(r.total).toBe(27);
  });

  it('the ESOP bonus is earned by economic interest held through a scheme, against 10%', () => {
    const r = calculateOwnershipScore(data([
      holder({ shares: 95, outstandingDebt: 0 }),
      holder({ id: 's', name: 'Staff Trust', ownershipType: 'ESOP / Employee Share Scheme', shares: 5, outstandingDebt: 0 }),
    ]), CFG);
    expect(r.subLines.find((l) => /ESOP/.test(l.name))?.score).toBe(0.5);
  });

  it('the breakdown has exactly the six Road Freight QSE lines, weighting 28', () => {
    const r = calculateOwnershipScore(data([holder({ outstandingDebt: 0 })]), CFG);
    expect(r.subLines.map((l) => l.name)).toEqual([
      'Exercisable voting rights of black individuals',
      'Exercisable voting rights of black females',
      'Economic interest of black individuals',
      'Ownership fulfilment',
      'Net value',
      'ESOP / broad-based scheme / co-op participation (bonus)',
    ]);
    expect(r.subLines.reduce((s, l) => s + l.weighting, 0)).toBe(28);
  });
});
