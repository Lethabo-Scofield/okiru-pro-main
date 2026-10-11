/**
 * The Toolkit recalculates on load, so a change to how a sector scores moves
 * every live client of that sector the day the web ships, with no re-sync.
 * The Transport ownership lines as the Codes name them (ownership fulfilment
 * from a stated nil debt, the scheme bonus from scheme economic interest) are
 * HELD BACK until the sector expert accepts that movement. Until then the live
 * configs must score exactly as they do in production:
 *   - Transport QSE: the fulfilment point is black-new-entrant participation
 *     and the ESOP/BBOS point is black-women economic interest (borrowed slots);
 *   - Transport Large: the scheme bonus is full points once a scheme row appears.
 * (Invented holders.)
 */
import { describe, expect, it } from 'vitest';
import { calculateOwnershipScore } from '../ownership';
import {
  TRANSPORT_QSE_CALCULATOR_CONFIG as LIVE_QSE,
  TRANSPORT_QSE_CODES_LINES_CALCULATOR_CONFIG as HELD_QSE,
} from '../../sectors/transport-qse';
import { TRANSPORT_GENERIC_CALCULATOR_CONFIG as LIVE_LARGE } from '../../sectors/transport-generic';
import type { OwnershipData, Shareholder } from '../../types';

function holder(over: Partial<Shareholder>): Shareholder {
  return {
    id: 'h', name: 'Thabo Mokoena', ownershipType: 'shareholder', blackOwnership: 1, blackWomenOwnership: 0,
    votingRightsPercent: 1, economicInterestPercent: 1, isDesignatedGroup: false, shares: 100, shareValue: 0, ...over,
  };
}
const data = (shareholders: Shareholder[]): OwnershipData =>
  ({ id: '', clientId: '', shareholders, companyValue: 0, outstandingDebt: 0, yearsHeld: 0 }) as OwnershipData;

describe('Transport QSE live ownership is unchanged while the Codes lines are held back', () => {
  it('a flagged black new entrant with no stated debt keeps the fulfilment point', () => {
    const r = calculateOwnershipScore(data([holder({ blackNewEntrant: true })]), LIVE_QSE);
    expect(r.newEntrants).toBe(1);
    expect(r.ownershipFulfilment).toBe(0);
    // 6 voting + 9 EI + 1 new entrant + 9 net value
    expect(r.total).toBe(25);
  });

  it('a black woman owner keeps the black-women economic interest point', () => {
    const r = calculateOwnershipScore(data([holder({ blackWomenOwnership: 1 })]), LIVE_QSE);
    expect(r.economicInterestBWO).toBe(1);
    // 6 + 2 black-women voting + 9 + 1 black-women EI + 9
    expect(r.total).toBe(27);
  });

  it('the breakdown keeps the live six lines, weighting 28', () => {
    const r = calculateOwnershipScore(data([holder({})]), LIVE_QSE);
    expect(r.subLines.map((l) => l.name)).toEqual([
      'Exercisable voting rights of black individuals',
      'Exercisable voting rights of black females',
      'Economic interest of black individuals',
      'Economic interest of black females',
      'Economic interest of black new entrants',
      'Net value',
    ]);
    expect(r.subLines.reduce((s, l) => s + l.weighting, 0)).toBe(28);
  });

  it('the held-back config is the only one that scores the Codes lines', () => {
    const r = calculateOwnershipScore(data([holder({ blackNewEntrant: true })]), HELD_QSE);
    expect(r.newEntrants).toBe(0);
    expect(r.ownershipFulfilment).toBe(0);
    expect(r.total).toBe(24);
  });
});

describe('Transport Large live scheme bonus is unchanged', () => {
  it('a scheme row earns the full bonus, whatever its stake', () => {
    const r = calculateOwnershipScore(data([
      holder({ shares: 95 }),
      holder({ id: 's', name: 'Staff Share Trust', ownershipType: 'ESOP / Employee Share Scheme', shares: 5 }),
    ]), LIVE_LARGE);
    const line = r.subLines.find((l) => /ESOP/.test(l.name));
    expect(line?.name).toBe('ESOP / broad-based scheme participation (bonus)');
    expect(line?.score).toBe(LIVE_LARGE.ownership.esopBonusMaxPts);
  });

  it('a co-operative row is not a scheme under the live rule', () => {
    const r = calculateOwnershipScore(data([
      holder({ shares: 95 }),
      holder({ id: 'c', name: 'Riverside Co-operative', ownershipType: 'shareholder', shares: 5 }),
    ]), LIVE_LARGE);
    expect(r.subLines.find((l) => /ESOP/.test(l.name))?.score).toBe(0);
  });
});
