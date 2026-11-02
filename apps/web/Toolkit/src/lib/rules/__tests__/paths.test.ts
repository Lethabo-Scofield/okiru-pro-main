import { describe, it, expect } from 'vitest';
import { parsePath, getAtPath, setAtPath, pathResolves, RulePathError } from '../paths';

const fixture = () => ({
  targets: { ownership: { votingRightsTarget: 0.25, label: 'x' } },
  benefitFactors: [
    { contributionType: 'grant', sdFactor: 1, edFactor: 1 },
    { contributionType: 'guarantees', sdFactor: 0.03, edFactor: 0.03 },
  ],
  dotted: [{ code: 'v1.2', n: 1 }],
});

describe('rule paths', () => {
  it('reads dotted paths and array selectors', () => {
    const o = fixture();
    expect(getAtPath(o, 'targets.ownership.votingRightsTarget')).toBe(0.25);
    expect(getAtPath(o, 'benefitFactors[contributionType=guarantees].sdFactor')).toBe(0.03);
    expect(getAtPath(o, 'dotted[code=v1.2].n')).toBe(1);
  });

  it('writes only to existing primitive leaves of the same type', () => {
    const o = fixture();
    setAtPath(o, 'benefitFactors[contributionType=guarantees].sdFactor', 0.5);
    expect(o.benefitFactors[1].sdFactor).toBe(0.5);
    expect(o.benefitFactors[0].sdFactor).toBe(1); // the sibling is untouched
    expect(() => setAtPath(o, 'targets.ownership.votingRightsTarget', '0.3')).toThrow(/Type mismatch/);
    expect(() => setAtPath(o, 'targets.ownership', 1)).toThrow(RulePathError);
  });

  it('never creates keys or array elements', () => {
    const o = fixture();
    expect(() => setAtPath(o, 'targets.ownership.newKey', 1)).toThrow(/does not resolve/);
    expect(() => setAtPath(o, 'targets.nothere.x', 1)).toThrow(/does not resolve/);
    expect(() => setAtPath(o, 'benefitFactors[contributionType=missing].sdFactor', 1)).toThrow(/does not resolve/);
    expect(o).toEqual(fixture());
  });

  it('rejects an ambiguous selector rather than guessing', () => {
    const o = { list: [{ id: 'a', v: 1 }, { id: 'a', v: 2 }] };
    expect(pathResolves(o, 'list[id=a].v')).toBe(false);
  });

  it.each([
    '__proto__.polluted', 'targets.__proto__.x', 'constructor.prototype.x', 'a.prototype',
    'targets..x', '', '.a', 'a.', 'a[b=c', 'a[b=c]]', 'a[__proto__=x].y', 'a b', 'a-b', '1a',
  ])('rejects the malformed or dangerous path %j', (p) => {
    expect(() => parsePath(p)).toThrow(RulePathError);
  });

  it('does not touch Object.prototype even when asked to', () => {
    const o: Record<string, unknown> = {};
    expect(() => setAtPath(o, '__proto__.polluted', 1)).toThrow();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('does not follow inherited keys', () => {
    expect(getAtPath({}, 'toString')).toBeUndefined();
    expect(pathResolves({}, 'hasOwnProperty')).toBe(false);
  });
});
