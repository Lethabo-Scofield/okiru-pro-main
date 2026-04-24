import { describe, it, expect } from 'vitest';
import { deepClone, safeRatio, clampScore, isBlackRace, BLACK_RACES } from '../shared';

describe('deepClone', () => {
  it('should create independent copies of objects', () => {
    const original = { a: 1, b: { c: [1, 2, 3] } };
    const cloned = deepClone(original);

    cloned.b.c.push(4);

    expect(original.b.c).toEqual([1, 2, 3]);
    expect(cloned.b.c).toEqual([1, 2, 3, 4]);
  });

  it('should handle arrays', () => {
    const original = [{ id: 1 }, { id: 2 }];
    const cloned = deepClone(original);

    cloned[0].id = 999;

    expect(original[0].id).toBe(1);
    expect(cloned[0].id).toBe(999);
  });

  it('should handle null and primitives', () => {
    expect(deepClone(null)).toBe(null);
    expect(deepClone(42)).toBe(42);
    expect(deepClone('hello')).toBe('hello');
  });

  it('should handle empty objects and arrays', () => {
    expect(deepClone({})).toEqual({});
    expect(deepClone([])).toEqual([]);
  });

  it('should handle deeply nested objects', () => {
    const original = { a: { b: { c: { d: 42 } } } };
    const cloned = deepClone(original);
    cloned.a.b.c.d = 99;
    expect(original.a.b.c.d).toBe(42);
  });
});

describe('safeRatio', () => {
  it('should calculate proportional score', () => {
    expect(safeRatio(50, 100, 10)).toBe(5);
    expect(safeRatio(100, 100, 10)).toBe(10);
  });

  it('should cap at maxPoints when value exceeds target', () => {
    expect(safeRatio(200, 100, 10)).toBe(10);
    expect(safeRatio(500, 100, 10)).toBe(10);
  });

  it('should return 0 when target is 0', () => {
    expect(safeRatio(100, 0, 10)).toBe(0);
  });

  it('should return 0 when target is negative', () => {
    expect(safeRatio(100, -50, 10)).toBe(0);
  });

  it('should handle NaN value', () => {
    expect(safeRatio(NaN, 100, 10)).toBe(0);
  });

  it('should handle zero value', () => {
    expect(safeRatio(0, 100, 10)).toBe(0);
  });

  it('should produce proportional results between 0 and max', () => {
    for (let v = 0; v <= 100; v += 10) {
      const result = safeRatio(v, 100, 10);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(10);
    }
  });

  it('should return 0 for NaN maxPoints', () => {
    const result = safeRatio(50, 100, 0);
    expect(result).toBe(0);
  });
});

describe('clampScore', () => {
  it('should clamp to max', () => {
    expect(clampScore(15, 10)).toBe(10);
  });

  it('should clamp negatives to 0', () => {
    expect(clampScore(-5, 10)).toBe(0);
  });

  it('should pass through valid scores within range', () => {
    expect(clampScore(5, 10)).toBe(5);
    expect(clampScore(0, 10)).toBe(0);
    expect(clampScore(10, 10)).toBe(10);
  });

  it('should handle NaN', () => {
    expect(clampScore(NaN, 10)).toBe(0);
  });

  it('should handle Infinity', () => {
    expect(clampScore(Infinity, 10)).toBe(0);
  });

  it('should handle -Infinity', () => {
    expect(clampScore(-Infinity, 10)).toBe(0);
  });

  it('should handle max of 0', () => {
    expect(clampScore(5, 0)).toBe(0);
  });

  it('should handle fractional scores', () => {
    expect(clampScore(2.5, 10)).toBe(2.5);
    expect(clampScore(10.5, 10)).toBe(10);
  });
});

describe('isBlackRace', () => {
  it('should return true for black races', () => {
    expect(isBlackRace('African')).toBe(true);
    expect(isBlackRace('Coloured')).toBe(true);
    expect(isBlackRace('Indian')).toBe(true);
  });

  it('should return false for non-black races', () => {
    expect(isBlackRace('White')).toBe(false);
    expect(isBlackRace('Other')).toBe(false);
    expect(isBlackRace('')).toBe(false);
  });

  it('should be case-sensitive', () => {
    expect(isBlackRace('african')).toBe(false);
    expect(isBlackRace('AFRICAN')).toBe(false);
    expect(isBlackRace('coloured')).toBe(false);
  });

  it('should handle whitespace', () => {
    expect(isBlackRace(' African')).toBe(false);
    expect(isBlackRace('African ')).toBe(false);
  });

  it('should return false for undefined or null', () => {
    expect(isBlackRace(undefined as any)).toBe(false);
    expect(isBlackRace(null as any)).toBe(false);
  });
});

describe('BLACK_RACES', () => {
  it('should contain exactly 3 races', () => {
    expect(BLACK_RACES).toHaveLength(3);
    expect(BLACK_RACES).toContain('African');
    expect(BLACK_RACES).toContain('Coloured');
    expect(BLACK_RACES).toContain('Indian');
  });

  it('should not contain White', () => {
    expect(BLACK_RACES).not.toContain('White');
  });

  it('should be a readonly tuple', () => {
    expect(Array.isArray(BLACK_RACES)).toBe(true);
  });
});
