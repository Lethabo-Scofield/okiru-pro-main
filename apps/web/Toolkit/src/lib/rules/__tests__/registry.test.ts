import { describe, it, expect } from 'vitest';
import { SCORECARD_IDS, SCORECARD_SOURCES, type ScorecardId } from '../scorecards';
import { getRules, enumerateCandidateSourcePaths } from '../registry';
import { UNWIRED_SOURCE_PATHS } from '../registry/unwired';
import { buildEffectiveConfig, validateOverrides, RuleValidationError, hashEffectiveConfig } from '../buildEffectiveConfig';
import { canonicalize, hashOf } from '../canonical';
import { getAtPath } from '../paths';
import { EMPTY_OVERRIDES, type RuleOverrides, type RuleDef } from '../types';

const none = (): RuleOverrides => ({ source: {}, calculator: {} });

function perturb(rule: RuleDef, current: number): number {
  const step = Math.max((rule.max - rule.min) * 0.01, 0.001);
  const up = current + step;
  const next = up <= rule.max ? up : current - step;
  return Number(next.toFixed(6));
}

describe.each(SCORECARD_IDS)('rules registry - %s', (id: ScorecardId) => {
  const entry = SCORECARD_SOURCES[id];

  it('empty overrides reproduce the shipped CalculatorConfig exactly', () => {
    expect(canonicalize(buildEffectiveConfig(id, none()))).toBe(canonicalize(entry.shipped));
    expect(canonicalize(buildEffectiveConfig(id, EMPTY_OVERRIDES))).toBe(canonicalize(entry.shipped));
  });

  it('never mutates the shipped source or the shipped config', () => {
    const before = canonicalize([entry.source, entry.shipped]);
    const rules = getRules(id);
    if (rules.length) {
      const r = rules[0];
      const cur = getAtPath(entry.source, r.binding.path) as number;
      buildEffectiveConfig(id, { source: { [r.binding.path]: perturb(r, cur) }, calculator: {} });
    }
    expect(canonicalize([entry.source, entry.shipped])).toBe(before);
  });

  it('returns a deeply frozen config', () => {
    const cfg = buildEffectiveConfig(id, none());
    expect(Object.isFrozen(cfg)).toBe(true);
    expect(Object.isFrozen((cfg as unknown as { ownership: object }).ownership)).toBe(true);
  });

  it('exposes a non-trivial rule set', () => {
    expect(getRules(id).length).toBeGreaterThan(10);
  });

  it('has unique rule keys, valid bounds and a resolvable shipped value inside them', () => {
    const rules = getRules(id);
    expect(new Set(rules.map((r) => r.key)).size).toBe(rules.length);
    for (const r of rules) {
      expect(r.scorecardId).toBe(id);
      expect(r.min).toBeLessThan(r.max);
      const shipped = getAtPath(r.binding.layer === 'source' ? entry.source : entry.shipped, r.binding.path);
      expect(typeof shipped, r.key).toBe('number');
      expect(shipped as number, r.key).toBeGreaterThanOrEqual(r.min);
      expect(shipped as number, r.key).toBeLessThanOrEqual(r.max);
    }
  });

  it('every registered rule actually changes the effective config (no phantom controls)', () => {
    const phantom: string[] = [];
    for (const r of getRules(id).filter((x) => x.editability === 'expert')) {
      const { layer, path } = r.binding;
      const cur = getAtPath(layer === 'source' ? entry.source : entry.shipped, path) as number;
      const next = { [path]: perturb(r, cur) };
      const cfg = buildEffectiveConfig(id, { source: layer === 'source' ? next : {}, calculator: layer === 'calculator' ? next : {} });
      if (canonicalize(cfg) === canonicalize(entry.shipped)) phantom.push(path);
    }
    expect(phantom).toEqual([]);
  });

  it('the unwired list is exactly the candidate leaves that change nothing', () => {
    const unwired = new Set(UNWIRED_SOURCE_PATHS[id] ?? []);
    const inert: string[] = [];
    for (const path of enumerateCandidateSourcePaths(id)) {
      const cur = getAtPath(entry.source, path) as number;
      const probe = { key: path, min: 0, max: path.includes('Percent') ? 100 : path.includes('Target') ? 1 : 50 } as RuleDef;
      const cfg = (() => {
        const clone = structuredClone(entry.source);
        const parts = path;
        // apply via the public API using a permissive one-off rule
        return buildEffectiveConfig(
          id,
          { source: { [parts]: perturb(probe, cur) }, calculator: {} },
          { rules: [{ ...probe, binding: { layer: 'source', path } } as RuleDef] },
        );
      })();
      if (canonicalize(cfg) === canonicalize(entry.shipped)) inert.push(path);
    }
    expect(inert.sort()).toEqual([...unwired].sort());
  });

  it('rejects unknown, out-of-bounds, non-numeric and polluting overrides', () => {
    const rule = getRules(id)[0];
    const path = rule.binding.path;
    expect(() => buildEffectiveConfig(id, { source: { 'targets.ownership.doesNotExist': 1 }, calculator: {} })).toThrow(RuleValidationError);
    expect(() => buildEffectiveConfig(id, { source: { [path]: rule.max + 1 }, calculator: {} })).toThrow(/out-of-bounds/);
    expect(() => buildEffectiveConfig(id, { source: { [path]: rule.min - 1 }, calculator: {} })).toThrow(/out-of-bounds/);
    expect(() => buildEffectiveConfig(id, { source: { [path]: Number.NaN }, calculator: {} })).toThrow(/not-a-number/);
    expect(() => buildEffectiveConfig(id, { source: { [path]: '0.1' as unknown as number }, calculator: {} })).toThrow(/not-a-number/);
    expect(() => buildEffectiveConfig(id, { source: { '__proto__.x': 1 }, calculator: {} })).toThrow(RuleValidationError);
    expect(() => buildEffectiveConfig(id, { source: {}, calculator: { 'ownership.votingRightsMax': 1 } })).toThrow(/unknown-rule/);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  it('is deterministic: same overrides, same hash', async () => {
    const r = getRules(id)[0];
    const cur = getAtPath(entry.source, r.binding.path) as number;
    const ov: RuleOverrides = { source: { [r.binding.path]: perturb(r, cur) }, calculator: {} };
    expect(await hashEffectiveConfig(buildEffectiveConfig(id, ov))).toBe(await hashEffectiveConfig(buildEffectiveConfig(id, ov)));
    expect(await hashEffectiveConfig(buildEffectiveConfig(id, ov))).not.toBe(await hashOf(entry.shipped));
  });
});

describe('buildEffectiveConfig - calculator layer', () => {
  const injected: RuleDef = {
    key: 'rcogp-generic:calculator:ownership.votingRightsMax',
    scorecardId: 'rcogp-generic', element: 'Ownership', category: 'test', label: 'x', help: '', type: 'number',
    unit: 'points', min: 0, max: 50, binding: { layer: 'calculator', path: 'ownership.votingRightsMax' },
    editability: 'developer', affectedLines: [], rulings: [], invariants: [],
  };

  it('applies calculator overrides AFTER the converter, on the generated config', () => {
    const cfg = buildEffectiveConfig('rcogp-generic', { source: {}, calculator: { 'ownership.votingRightsMax': 7 } }, { rules: [injected] });
    expect((cfg as unknown as { ownership: { votingRightsMax: number } }).ownership.votingRightsMax).toBe(7);
    expect((SCORECARD_SOURCES['rcogp-generic'].shipped as unknown as { ownership: { votingRightsMax: number } }).ownership.votingRightsMax).toBe(4);
  });

  it('reports every issue, not just the first', () => {
    const issues = validateOverrides('rcogp-generic', { source: { a: 1, b: 2 }, calculator: {} });
    expect(issues.map((i) => i.path)).toEqual(['a', 'b']);
  });
});
