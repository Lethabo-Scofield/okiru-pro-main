/**
 * Deemed B-BBEE levels — the sworn-affidavit route (Amended Codes Statement
 * 000 §4). The properties that matter: the thresholds are exact, ownership is
 * flow-through (BOTH voting and economic interest must carry it), the deemed
 * level is a FLOOR never a cap, and legacy-code sectors (Transport) are
 * excluded because their codes contain no such provision.
 */
import { describe, expect, it } from 'vitest';
import { applyDeemedLevel, resolveDeemedLevel } from '../deemedLevel';

const base = { sectorCode: 'RCOGP', scorecardType: 'QSE', blackVotingPct: 0, blackEconomicInterestPct: 0 };

describe('QSE deeming', () => {
  it('deems Level 2 at 51% black-owned and Level 1 at 100%', () => {
    expect(resolveDeemedLevel({ ...base, blackVotingPct: 0.51, blackEconomicInterestPct: 0.51 })?.level).toBe(2);
    expect(resolveDeemedLevel({ ...base, blackVotingPct: 1, blackEconomicInterestPct: 1 })?.level).toBe(1);
  });

  it('gives a QSE below 51% NO deemed level', () => {
    expect(resolveDeemedLevel({ ...base, blackVotingPct: 0.5, blackEconomicInterestPct: 0.5 })).toBeNull();
  });

  it('measures ownership flow-through — BOTH voting and EI must carry the threshold', () => {
    // 100% voting through a trust with 40% black economic interest is not a
    // 51% black-owned enterprise.
    expect(resolveDeemedLevel({ ...base, blackVotingPct: 1, blackEconomicInterestPct: 0.4 })).toBeNull();
    expect(resolveDeemedLevel({ ...base, blackVotingPct: 0.6, blackEconomicInterestPct: 1 })?.level).toBe(2);
  });

  it('applies to QSFIs (FSC QSE) identically', () => {
    expect(resolveDeemedLevel({ ...base, sectorCode: 'FSC', blackVotingPct: 0.51, blackEconomicInterestPct: 0.51 })?.level).toBe(2);
  });
});

describe('EME deeming', () => {
  it('deems Level 4 automatically, enhanced to 2/1 by black ownership', () => {
    expect(resolveDeemedLevel({ ...base, scorecardType: 'EME' })?.level).toBe(4);
    expect(resolveDeemedLevel({ ...base, scorecardType: 'EME', blackVotingPct: 0.51, blackEconomicInterestPct: 0.51 })?.level).toBe(2);
    expect(resolveDeemedLevel({ ...base, scorecardType: 'EME', blackVotingPct: 1, blackEconomicInterestPct: 1 })?.level).toBe(1);
  });
});

describe('exclusions', () => {
  it('never deems a Transport entity — the legacy code has no such provision', () => {
    // Certificate BE13609 confirms in practice: a 100% black-owned Transport
    // QSE was scored on points (102), not deemed.
    expect(resolveDeemedLevel({ ...base, sectorCode: 'TRANSPORT', blackVotingPct: 1, blackEconomicInterestPct: 1 })).toBeNull();
    expect(resolveDeemedLevel({ ...base, sectorCode: 'TRANSPORT', scorecardType: 'EME' })).toBeNull();
  });

  it('never deems a Generic (large) entity', () => {
    expect(resolveDeemedLevel({ ...base, scorecardType: 'Generic', blackVotingPct: 1, blackEconomicInterestPct: 1 })).toBeNull();
  });
});

describe('the deemed level is a floor, never a cap', () => {
  it('lifts a worse computed level and never drags down a better one', () => {
    const deemed = { level: 2, reason: 'x' };
    expect(applyDeemedLevel(5, deemed)).toEqual({ level: 2, deemedApplied: true });
    expect(applyDeemedLevel(1, deemed)).toEqual({ level: 1, deemedApplied: false });
    expect(applyDeemedLevel(5, null)).toEqual({ level: 5, deemedApplied: false });
  });
});
