/**
 * Ownership, scored the way the Empower toolkit (RCOGP Generic template) does.
 *
 * The arithmetic was reproduced by hand to Excel's own numbers, and the parity
 * harness (toolkitParity.harness.test.ts) checks it line by line against the
 * workbook recalculated by Excel. These tests pin each rule on its own:
 *   - holders weigh by share value (shares, then equal split, as fallbacks);
 *   - designated-group / new-entrant shares are read per holder (BDG% / BNE%);
 *   - a black holder's acquisition debt is netted against the company value,
 *     into economic interest and net value; non-black debt is not netted;
 *   - with no valuation, indebted holders' stakes add nothing;
 *   - net value is scored against 100% of debt-netted black economic interest;
 *   - the sub-minimum is 40% of the 8 net value points (3.2);
 *   - the graduation factor plays no part.
 */
import { describe, it, expect } from 'vitest';
import { calculateOwnershipScore, ownershipHolderWeights } from '../ownership';
import { RCOGP_GENERIC_CALCULATOR_CONFIG } from '../../sectors/rcogp-generic';
import { RCOGP_QSE_CALCULATOR_CONFIG } from '../../sectors/rcogp-qse';
import { ICT_GENERIC_CALCULATOR_CONFIG } from '../../sectors/ict-generic';
import { TRANSPORT_GENERIC_CALCULATOR_CONFIG } from '../../sectors/transport-generic';
import { TRANSPORT_QSE_CALCULATOR_CONFIG } from '../../sectors/transport-qse';
import { buildConstructionCalculatorConfig } from '../../sectors/construction';
import type { OwnershipData, Shareholder } from '../../types';

const CFG = RCOGP_GENERIC_CALCULATOR_CONFIG;

const holder = (o: Partial<Shareholder> = {}): Shareholder => ({
  id: o.name ?? 'h',
  name: 'Holder',
  ownershipType: 'shareholder',
  blackOwnership: 0,
  blackWomenOwnership: 0,
  votingRightsPercent: 0,
  economicInterestPercent: 0,
  isDesignatedGroup: false,
  shares: 100,
  shareValue: 1_000_000,
  ...o,
});

const own = (shareholders: Shareholder[], o: Partial<OwnershipData> = {}): OwnershipData => ({
  id: 'own',
  clientId: 'c',
  shareholders,
  companyValue: 100_000_000,
  outstandingDebt: 0,
  yearsHeld: 0,
  ownershipScorePoints: 0,
  ownershipScorePercent: 0,
  netValuePoints: 0,
  netValuePercent: 0,
  ...o,
});

const line = (r: ReturnType<typeof calculateOwnershipScore>, name: string) => {
  const l = r.subLines.find((s) => s.name === name);
  if (!l) throw new Error(`no line ${name}`);
  return l;
};

describe('which sectors score ownership the toolkit way', () => {
  it('RCOGP Generic does, with a 100% net value target', () => {
    expect(CFG.ownership.ownershipMethod).toBe('toolkit');
    expect(CFG.ownership.netValueTarget).toBe(1);
  });

  it.each([
    ['RCOGP QSE', RCOGP_QSE_CALCULATOR_CONFIG],
    ['ICT Generic', ICT_GENERIC_CALCULATOR_CONFIG],
    ['Transport Generic', TRANSPORT_GENERIC_CALCULATOR_CONFIG],
    ['Transport QSE', TRANSPORT_QSE_CALCULATOR_CONFIG],
    ['Construction (built on RCOGP Generic)', buildConstructionCalculatorConfig('construction_contractor')],
  ])('%s keeps the original method until its own template is checked', (_name, cfg) => {
    expect(cfg.ownership.ownershipMethod ?? 'legacy').toBe('legacy');
  });
});

describe('holder weights', () => {
  it('weigh by share value, never by number of shares, when every holder has a value', () => {
    // Equal share counts, but the black holder's stake is worth three times as much.
    const r = calculateOwnershipScore(own([
      holder({ name: 'A', blackOwnership: 1, shares: 100, shareValue: 75 }),
      holder({ name: 'B', blackOwnership: 0, shares: 100, shareValue: 25 }),
    ]), CFG);
    expect(r.rawStats.blackVotingPercentage).toBeCloseTo(0.75, 6);
    expect(line(r, 'Exercisable voting rights of black individuals').note).toContain('value of their shares');
  });

  it('fall back to number of shares when any holder has no value, then to an equal split', () => {
    expect(ownershipHolderWeights([{ shares: 30, shareValue: 10 }, { shares: 10, shareValue: 0 }]))
      .toEqual({ weights: [0.75, 0.25], basis: 'shares' });
    expect(ownershipHolderWeights([{ shares: 0, shareValue: 0 }, { shares: 0, shareValue: 0 }]))
      .toEqual({ weights: [0.5, 0.5], basis: 'equal' });
    expect(ownershipHolderWeights([])).toEqual({ weights: [], basis: 'none' });
  });
});

describe('designated groups and new entrants', () => {
  it('read the share each holder states (BDG% / BNE%)', () => {
    const r = calculateOwnershipScore(own([
      holder({ name: 'A', blackOwnership: 1, designatedGroupOwnership: 0.02, blackNewEntrantOwnership: 0.01, shareValue: 50 }),
      holder({ name: 'B', blackOwnership: 0, shareValue: 50 }),
    ]), CFG);
    // 50% × 2% = 1% of the entity → 1% ÷ 3% × 3 = 1.00; 0.5% ÷ 2% × 2 = 0.50.
    expect(r.rawStats.designatedGroupPercentage).toBeCloseTo(0.01, 6);
    expect(r.designatedGroups).toBeCloseTo(1, 2);
    expect(r.newEntrants).toBeCloseTo(0.5, 2);
  });

  it('fall back to the yes/no flag (all of the holder\'s black share) when no share is stated', () => {
    const r = calculateOwnershipScore(own([
      holder({ name: 'A', blackOwnership: 0.02, isDesignatedGroup: true, blackNewEntrant: true }),
    ]), CFG);
    expect(r.designatedGroups).toBeCloseTo(2, 2); // 2% ÷ 3% × 3 = 2.00
    expect(r.newEntrants).toBeCloseTo(2, 2); // 2% ÷ 2% × 2
  });

  it('a stated share of 0 outranks the flag', () => {
    const r = calculateOwnershipScore(own([
      holder({ name: 'A', blackOwnership: 1, isDesignatedGroup: true, designatedGroupOwnership: 0 }),
    ]), CFG);
    expect(r.designatedGroups).toBe(0);
  });
});

describe('acquisition debt', () => {
  // A: black, 40% of the value, owes R10m; B: not black, owes R20m.
  // V = R100m. A's stake nets to (100m × 40% − 10m) ÷ 100m = 30%.
  const indebted = (bo = 1) => own([
    holder({ name: 'A', blackOwnership: bo, blackWomenOwnership: bo / 2, shareValue: 40, outstandingDebt: 10_000_000 }),
    holder({ name: 'B', blackOwnership: 0, shareValue: 60, outstandingDebt: 20_000_000 }),
  ]);

  it('counts an indebted black holder\'s stake in full once its net value reaches 40% of it; non-black debt is not netted', () => {
    const r = calculateOwnershipScore(indebted(), CFG);
    expect(r.rawStats.blackVotingPercentage).toBeCloseTo(0.4, 6); // voting is never netted
    // Net value 30% ≥ 40% × 40% stake → the whole 40% stake counts
    // (toolkit 'Oustanding Debts Calcs'!H3, its first debt row).
    expect(r.rawStats.economicInterestPercentage).toBeCloseTo(0.4, 6);
    expect(r.rawStats.economicInterestBWOPercentage).toBeCloseTo(0.15, 6); // black women: netted plainly, 30% × 50%
    expect(r.rawStats.netValuePercentage).toBeCloseTo(0.4, 6);
    expect(r.economicInterestBlack).toBe(4); // 40% ÷ 25% × 4, capped
    expect(r.netValue).toBeCloseTo(3.2, 6); // 40% ÷ 100% × 8
    expect(line(r, 'Economic interest of black individuals').note)
      .toContain('net value of the indebted black shareholders');
  });

  it('credits a stake pro rata when its net value is below 40% of it', () => {
    const r = calculateOwnershipScore(own([
      holder({ name: 'A', blackOwnership: 1, shareValue: 40, outstandingDebt: 36_000_000 }),
      holder({ name: 'B', blackOwnership: 0, shareValue: 60 }),
    ]), CFG);
    // Net value (40m − 36m) ÷ 100m = 4% against 40% × 40% = 16% → a quarter of the stake: 10%.
    expect(r.rawStats.economicInterestPercentage).toBeCloseTo(0.1, 6);
    expect(r.netValue).toBeCloseTo(0.8, 6);
  });

  it('credits only the black share of an indebted holder\'s stake (the toolkit credits the whole stake)', () => {
    const r = calculateOwnershipScore(indebted(0.5), CFG);
    // W4 = 40% × 50% = 20%, all of it indebted; credited in full, for its black half: 20%.
    expect(r.rawStats.economicInterestPercentage).toBeCloseTo(0.2, 6);
    expect(r.netValue).toBeCloseTo(1.6, 6);
  });

  it('with no valuation, the indebted holders\' stakes add nothing', () => {
    const r = calculateOwnershipScore(own([
      holder({ name: 'A', blackOwnership: 1, shareValue: 40, outstandingDebt: 10_000_000 }),
      holder({ name: 'C', blackOwnership: 1, shareValue: 20 }),
      holder({ name: 'B', blackOwnership: 0, shareValue: 40 }),
    ], { companyValue: 0 }), CFG);
    // Only C's 20% is free of debt: EI = 20%, net value = 20% × 8 = 1.6.
    expect(r.rawStats.economicInterestPercentage).toBeCloseTo(0.2, 6);
    expect(r.economicInterestBlack).toBeCloseTo(3.2, 6);
    expect(r.netValue).toBeCloseTo(1.6, 6);
    expect(line(r, 'Economic interest of black individuals').note).toContain('no company value on file');
  });

  it('an entity-level debt with no holder debt is not deducted, and the note says so', () => {
    const r = calculateOwnershipScore(own([holder({ name: 'A', blackOwnership: 0.5 })], { outstandingDebt: 5_000_000 }), CFG);
    expect(r.netValue).toBe(4); // 50% ÷ 100% × 8
    expect(line(r, 'Net value').note).toContain('no shareholder states their own acquisition debt');
  });
});

describe('net value', () => {
  it('is scored against 100% of debt-netted black economic interest (not 25%)', () => {
    const r = calculateOwnershipScore(own([holder({ name: 'A', blackOwnership: 0.3 })]), CFG);
    expect(r.netValue).toBeCloseTo(2.4, 6);
    expect(line(r, 'Net value').note).toContain('30% ÷ 100% × 8 = 2.40');
  });

  it('meets the sub-minimum at 3.2 points (40% of 8)', () => {
    const at = calculateOwnershipScore(own([holder({ name: 'A', blackOwnership: 0.4 })]), CFG);
    expect(at.netValue).toBeCloseTo(3.2, 6);
    expect(at.subMinimumMet).toBe(true);
    const below = calculateOwnershipScore(own([holder({ name: 'A', blackOwnership: 0.39 })]), CFG);
    expect(below.subMinimumMet).toBe(false);
    expect(line(below, 'Net value').note).toContain('not met');
  });

  it('does not move with the years held (the graduation factor is not used)', () => {
    const shs = [holder({ name: 'A', blackOwnership: 0.3, outstandingDebt: 100_000 })];
    const young = calculateOwnershipScore(own(shs, { yearsHeld: 1 }), CFG);
    const old = calculateOwnershipScore(own(shs, { yearsHeld: 10 }), CFG);
    expect(young.netValue).toBe(old.netValue);
    expect(young.total).toBe(old.total);
  });
});

describe('lines and total', () => {
  it('keeps the seven Generic lines in order, sums them, and writes the working on each', () => {
    const r = calculateOwnershipScore(own([
      holder({ name: 'A', blackOwnership: 0.6, blackWomenOwnership: 0.3, designatedGroupOwnership: 0.06, blackNewEntrantOwnership: 0.03 }),
    ]), CFG);
    expect(r.subLines.map((l) => [l.name, l.weighting])).toEqual([
      ['Exercisable voting rights of black individuals', 4],
      ['Exercisable voting rights of black females', 2],
      ['Economic interest of black individuals', 4],
      ['Economic interest of black females', 2],
      ['Economic interest of black designated groups or participants in ownership schemes', 3],
      ['Economic interest of black new entrants', 2],
      ['Net value', 8],
    ]);
    // 4 + 2 + 4 + 2 + 3 + 2 + (60% × 8 = 4.8)
    expect(r.total).toBeCloseTo(21.8, 6);
    expect(r.subLines.reduce((a, l) => a + l.score, 0)).toBeCloseTo(r.total, 6);
    for (const l of r.subLines) expect(l.note).toMatch(/÷ .* × \d+ = /);
    expect(line(r, 'Exercisable voting rights of black individuals').note).toContain('60% ÷ 25% × 4 = 9.60, capped at 4');
  });

  it('scores nothing for an empty register', () => {
    const r = calculateOwnershipScore(own([]), CFG);
    expect(r.total).toBe(0);
    expect(r.subMinimumMet).toBe(false);
  });
});

describe('a case Excel scored (synthetic parity case gen_1)', () => {
  // Four holders weighed by share value; holder 2 (not black) and holder 3
  // (black) carry debt. Excel: 4 / 2 / 4 / 2 / 0 / 0 / 2.4659 (its designated-
  // group and new-entrant lines read their targets as 0 — not copied here).
  const r = calculateOwnershipScore(own([
    holder({ name: 'H1', blackOwnership: 0.25, blackWomenOwnership: 0.125, shares: 9700, shareValue: 133_317_576 }),
    holder({ name: 'H2', blackOwnership: 0, shares: 3700, shareValue: 50_853_096, outstandingDebt: 15_667_324 }),
    holder({ name: 'H3', blackOwnership: 1, blackWomenOwnership: 0.5, designatedGroupOwnership: 0.1, blackNewEntrantOwnership: 1, shares: 6400, shareValue: 87_962_112, outstandingDebt: 45_302_044 }),
    holder({ name: 'H4', blackOwnership: 0.75, blackWomenOwnership: 0.1875, designatedGroupOwnership: 0.075, blackNewEntrantOwnership: 0.15, shares: 1300, shareValue: 17_867_304 }),
  ], { companyValue: 290_000_000 }), CFG);

  it('matches Excel on every line the toolkit computes correctly', () => {
    expect(r.votingRightsBlack).toBe(4);
    expect(r.votingRightsBWO).toBe(2);
    expect(r.economicInterestBlack).toBe(4);
    expect(r.economicInterestBWO).toBe(2);
  });

  it('nets holder 3 by the toolkit\'s first-row formula, which the toolkit skips here only because holder 2 is listed first', () => {
    // Excel shows 2.47: holder 2 (not black, indebted) takes its first debt row,
    // so holder 3 falls to the plain formula. Holder 3's net value 14.7% is at
    // least 40% of its 30.3% stake, so the stake counts in full:
    // 16.1% free + 30.3% = 46.4% → × 8 = 3.72.
    expect(r.netValue).toBeCloseTo(3.72, 2);
  });
});
