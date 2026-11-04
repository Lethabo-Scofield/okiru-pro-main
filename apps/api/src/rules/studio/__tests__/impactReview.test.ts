import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { reviewDraft, checkInvariants, changedRules, level1Check, classifyLines } from '../impactReview.js';
import { getRules } from '../../../../../web/Toolkit/src/lib/rules/registry';
import type { RuleOverrides } from '../../../../../web/Toolkit/src/lib/rules/types';

const none: RuleOverrides = { source: {}, calculator: {} };
const G = 'benefitFactors[contributionType=interest_free_loan].sdFactor';
beforeAll(() => { vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterAll(() => vi.restoreAllMocks());

describe('impact review', () => {
  it('a no-op draft is all match, nothing to acknowledge, nothing blocking', () => {
    const r = reviewDraft('rcogp-generic', none, none);
    expect(r.counts).toEqual({ match: 0, deliberate: 0, unexplained: 0, missing: 0 });
    expect(r.blocking).toEqual([]);
    expect(r.requiresAcknowledgement).toEqual([]);
  });

  it('attributes a guarantees change to the ESD pillars as deliberate lines needing acknowledgement', () => {
    const r = reviewDraft('rcogp-generic', none, { source: { [G]: 0.5 }, calculator: {} });
    expect(r.changed.map((c) => c.path)).toEqual([G]);
    expect(r.changed[0]).toMatchObject({ from: 0.7, to: 0.5 });
    expect(r.counts.deliberate).toBeGreaterThan(0);
    expect(r.counts.unexplained).toBe(0);
    expect(r.requiresAcknowledgement).toEqual(['rcogp-generic:source:' + G]);
    expect(r.blocking).toEqual([]);
    for (const l of r.lines.filter((x) => x.verdict === 'deliberate')) expect(['supplierDevelopment', 'enterpriseDevelopment']).toContain(l.pillar);
  });

  it('classifies lines: unexplained (no changed rule reaches the pillar), missing (errored line), deliberate, match', () => {
    const fx = (over: Record<string, unknown>) => ({ fixtureId: 'f', profile: 'mid', error: null, baseTotal: 10, proposedTotal: 10, totalDelta: 0, baseLevel: 4, proposedLevel: 4, levelChanged: false, pillars: [], ...over });
    const ownershipRule = { ruleKey: 'k', path: 'p', layer: 'source' as const, from: 1, to: 2, element: 'Ownership' };
    const report = { scorecardId: 'rcogp-generic', summary: {} as never, fixtures: [
      fx({ pillars: [{ pillar: 'skillsDevelopment', base: 5, proposed: 7, delta: 2 }] }),                // unexplained
      fx({ fixtureId: 'g', pillars: [{ pillar: 'ownership', base: 5, proposed: 7, delta: 2 }] }),          // deliberate
      fx({ fixtureId: 'h', pillars: [{ pillar: 'ownership', base: 5, proposed: 5.004, delta: 0.004 }] }),  // within tolerance
      fx({ fixtureId: 'i', error: 'boom' }),                                                                // missing
    ] } as never;
    const lines = classifyLines(report, [ownershipRule]);
    expect(lines.map((l) => [l.fixtureId, l.verdict])).toEqual([['f', 'unexplained'], ['g', 'deliberate'], ['h', 'match'], ['i', 'missing']]);
    expect(lines[1].attributedTo).toEqual(['k']);
  });

  it('level-1 check fails when the fully empowered fixture would fall from Level 1', () => {
    const r = reviewDraft('rcogp-generic', none, none);
    const full = r.report.fixtures.find((f) => f.profile === 'full')!;
    const worse = { ...r.report, fixtures: r.report.fixtures.map((f) => f === full ? { ...f, baseLevel: 1, proposedLevel: 3 } : f) };
    expect(level1Check(worse).ok).toBe(false);
    expect(level1Check(r.report).ok).toBe(true);
  });
});

describe('invariants', () => {
  it('pass for empty overrides on every scorecard', () => {
    for (const id of ['rcogp-generic', 'rcogp-qse', 'ict-generic', 'ict-qse', 'agri-generic', 'fsc-others', 'fsc-banks', 'fsc-lti', 'fsc-sti'] as const) {
      expect(checkInvariants(id, none).filter((i) => !i.ok), id).toEqual([]);
    }
  });

  it('catches a positive target being zeroed', () => {
    const r = checkInvariants('rcogp-generic', { source: { 'targets.procurement.allSuppliersTarget': 0 }, calculator: {} });
    expect(r.find((i) => i.id === 'no-target-set-to-zero')?.ok).toBe(false);
  });

  it('catches indicator points that no longer reconcile with the pillar maximum', () => {
    const r = checkInvariants('rcogp-generic', { source: { 'targets.ownership.votingRightsMaxPts': 9 }, calculator: {} });
    expect(r.find((i) => i.id === 'element-maxima-reconcile')?.ok).toBe(false);
  });

  it('catches out-of-range values and invalid overrides without throwing', () => {
    const rule = getRules('rcogp-generic').find((x) => x.unit === 'fraction')!;
    const bad = checkInvariants('rcogp-generic', { source: { [rule.binding.path]: 7 }, calculator: {} });
    expect(bad.some((i) => !i.ok)).toBe(true);
  });

  it('changedRules compares against the shipped value when a path is absent', () => {
    expect(changedRules('rcogp-generic', none, none)).toEqual([]);
    expect(changedRules('rcogp-generic', none, { source: { [G]: 0.7 }, calculator: {} })).toEqual([]); // equal to shipped
  });
});
