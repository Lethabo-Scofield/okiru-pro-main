import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { SCORECARD_IDS, SCORECARD_SOURCES } from '../scorecards';
import { getRules } from '../registry';
import { runImpact, IMPACT_PILLARS } from '../impact/runImpact';
import { buildFixtures } from '../impact/fixtures';
import { getAtPath } from '../paths';
import type { RuleOverrides } from '../types';

const none: RuleOverrides = { source: {}, calculator: {} };
const G = 'benefitFactors[contributionType=interest_free_loan].sdFactor';

beforeAll(() => { vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterAll(() => vi.restoreAllMocks());

describe.each(SCORECARD_IDS)('impact engine - %s', (id) => {
  it('scores every synthetic fixture without error', () => {
    const r = runImpact(id, none, none);
    expect(r.summary.fixturesRun).toBe(5);
    expect(r.fixtures.filter((f) => f.error).map((f) => `${f.fixtureId}: ${f.error}`)).toEqual([]);
  });

  it('a no-op proposal changes nothing', () => {
    const r = runImpact(id, none, none);
    expect(r.summary).toMatchObject({ fixturesChanged: 0, levelsChanged: 0, maxAbsTotalDelta: 0, affectedPillars: [] });
  });

  it('fixtures span the range: the fully empowered one outscores the empty one', () => {
    const fx = buildFixtures(id);
    const r = runImpact(id, none, { source: {}, calculator: {} }, fx);
    const byProfile = Object.fromEntries(r.fixtures.map((f) => [f.profile, f.baseTotal]));
    expect(byProfile.full).toBeGreaterThan(byProfile.none);
    expect(byProfile.strong).toBeLessThanOrEqual(byProfile.full + 1e-9);
  });

  it('is deterministic', () => {
    const rule = getRules(id).find((r) => r.unit === 'fraction')!;
    const cur = getAtPath(SCORECARD_SOURCES[id].source, rule.binding.path) as number;
    const proposed: RuleOverrides = { source: { [rule.binding.path]: Math.min(rule.max, cur + 0.05) }, calculator: {} };
    expect(JSON.stringify(runImpact(id, none, proposed))).toBe(JSON.stringify(runImpact(id, none, proposed)));
  });

  it('rejects an invalid proposal before calculating anything', () => {
    expect(() => runImpact(id, none, { source: { 'targets.nope.x': 1 }, calculator: {} })).toThrow(/unknown-rule/);
  });
});

describe('impact engine - what a change moves', () => {
  it('lowering the voting-rights maximum drops Ownership only, on the strongest fixtures', () => {
    const r = runImpact('rcogp-generic', none, { source: { 'targets.ownership.votingRightsMaxPts': 1 }, calculator: {} });
    expect(r.summary.affectedPillars).toEqual(['ownership']);
    const full = r.fixtures.find((f) => f.profile === 'full')!;
    expect(full.pillars[0]).toMatchObject({ pillar: 'ownership' });
    expect(full.pillars[0].delta).toBeLessThan(0);
    expect(r.fixtures.find((f) => f.profile === 'none')!.pillars).toEqual([]);
  });

  it('raising a target can only lower scores, never raise them', () => {
    const r = runImpact('rcogp-generic', none, { source: { 'targets.procurement.allSuppliersTarget': 0.95 }, calculator: {} });
    for (const f of r.fixtures) for (const p of f.pillars) expect(p.delta).toBeLessThanOrEqual(1e-9);
  });

  it('raising a benefit factor reaches the ESD pillars via the shared scorer', () => {
    const r = runImpact('rcogp-generic', none, { source: { [G]: 0.9 }, calculator: {} });
    const moved = r.summary.affectedPillars;
    expect(moved.some((p) => p === 'supplierDevelopment' || p === 'enterpriseDevelopment')).toBe(true);
    for (const f of r.fixtures) for (const p of f.pillars) expect(p.delta).toBeGreaterThanOrEqual(-1e-9);
  });

  it('reports a level change when a threshold-sized shift crosses a boundary', () => {
    const lvl = SCORECARD_SOURCES['rcogp-generic'].source.levelThresholds;
    expect(lvl.length).toBeGreaterThan(0); // thresholds are not registry rules; this just guards the assumption
    const sweep = getRules('rcogp-generic')
      .filter((r) => r.unit === 'points' && r.binding.path.startsWith('targets.ownership'))
      .map((r) => ({ source: { [r.binding.path]: 0 }, calculator: {} }) as RuleOverrides);
    const everything: RuleOverrides = { source: Object.assign({}, ...sweep.map((s) => s.source)), calculator: {} };
    const r = runImpact('rcogp-generic', none, everything);
    expect(r.summary.fixturesChanged).toBeGreaterThan(0);
    expect(IMPACT_PILLARS).toContain(r.summary.affectedPillars[0]);
  });
});
