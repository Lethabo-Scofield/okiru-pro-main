import { describe, expect, it } from 'vitest';
import { normalizeBeeLevel, normalizeDate, normalizeMoney, normalizePercentage } from '../../parser/normalize.js';

describe('parser normalization', () => {
  it('normalizes money values', () => {
    expect(normalizeMoney('R 1,250,000')).toBe(1250000);
    expect(normalizeMoney('R8.2m')).toBe(8200000);
  });

  it('normalizes percentage values', () => {
    expect(normalizePercentage('51%')).toBe(51);
  });

  it('normalizes dates to ISO yyyy-mm-dd', () => {
    expect(normalizeDate('01 Feb 2025')).toBe('2025-02-01');
  });

  it('normalizes B-BBEE levels', () => {
    expect(normalizeBeeLevel('Level Two')).toBe(2);
    expect(normalizeBeeLevel('Level 2')).toBe(2);
  });
});
