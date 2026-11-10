/**
 * Parity with the REAL scoring engine (no mocks): for every Studio scorecard and every synthetic
 * profile, the full ScorecardResult calculated under the shipped CalculatorConfig is identical to
 * the one calculated under buildEffectiveConfig(empty overrides). This is what guarantees that
 * switching a deployment to the Studio changes nothing until a version is actually published.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { SCORECARD_IDS, SCORECARD_SOURCES } from '../scorecards';
import { buildEffectiveConfig } from '../buildEffectiveConfig';
import { buildFixtures } from '../impact/fixtures';
import { calculateScorecard } from '../../scoring/calculateScorecard';
import { canonicalize } from '../canonical';

beforeAll(() => { vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterAll(() => vi.restoreAllMocks());

describe.each(SCORECARD_IDS)('real scorer parity - %s', (id) => {
  it('empty-override config scores every fixture exactly like the shipped config', () => {
    const built = buildEffectiveConfig(id, { source: {}, calculator: {} });
    for (const fx of buildFixtures(id)) {
      const a = calculateScorecard({ ...fx.state, calculatorConfig: SCORECARD_SOURCES[id].shipped, ignoreSubMinimum: false }, null);
      const b = calculateScorecard({ ...fx.state, calculatorConfig: built, ignoreSubMinimum: false }, null);
      expect(canonicalize(b), `${id}/${fx.profile}`).toBe(canonicalize(a));
      expect(Number.isFinite(a.total.score)).toBe(true);
    }
  });

  it('the scorer is deterministic and does not mutate its inputs', () => {
    const cfg = buildEffectiveConfig(id, { source: {}, calculator: {} });
    const fx = buildFixtures(id)[3];
    const before = canonicalize([fx.state, cfg]);
    const r1 = calculateScorecard({ ...fx.state, calculatorConfig: cfg, ignoreSubMinimum: false }, null);
    const r2 = calculateScorecard({ ...fx.state, calculatorConfig: cfg, ignoreSubMinimum: false }, null);
    expect(canonicalize(r1)).toBe(canonicalize(r2));
    expect(canonicalize([fx.state, cfg])).toBe(before);
  });
});
