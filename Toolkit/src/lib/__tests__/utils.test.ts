import { describe, it, expect } from 'vitest';
import { formatRand, cn, formatPercentage } from '../utils';

describe('formatRand', () => {
  it('should format millions correctly', () => {
    expect(formatRand(1_000_000)).toBe('R1.0M');
    expect(formatRand(2_500_000)).toBe('R2.5M');
    expect(formatRand(10_000_000)).toBe('R10.0M');
    expect(formatRand(999_999_999)).toBe('R1000.0M');
  });

  it('should format thousands correctly', () => {
    expect(formatRand(1_000)).toBe('R1K');
    expect(formatRand(50_000)).toBe('R50K');
    expect(formatRand(999_999)).toBe('R1000K');
    expect(formatRand(500_000)).toBe('R500K');
  });

  it('should format small values correctly', () => {
    expect(formatRand(0)).toBe('R0');
    expect(formatRand(100)).toBe('R100');
    expect(formatRand(999)).toBe('R999');
    expect(formatRand(1)).toBe('R1');
  });

  it('should handle negative values', () => {
    expect(formatRand(-1_000_000)).toBe('R-1.0M');
    expect(formatRand(-50_000)).toBe('R-50K');
    expect(formatRand(-500)).toBe('R-500');
  });

  it('should handle decimal values below 1000', () => {
    expect(formatRand(99.5)).toBe('R100');
    expect(formatRand(0.5)).toBe('R1');
  });

  it('should handle NaN and Infinity', () => {
    expect(formatRand(NaN)).toBe('R0');
    expect(formatRand(Infinity)).toBe('R0');
    expect(formatRand(-Infinity)).toBe('R0');
  });
});

describe('formatPercentage', () => {
  it('should format basic percentages', () => {
    expect(formatPercentage(0.5)).toBe('50.0%');
    expect(formatPercentage(1.0)).toBe('100.0%');
    expect(formatPercentage(0)).toBe('0.0%');
  });

  it('should respect decimal precision', () => {
    expect(formatPercentage(0.1234, 2)).toBe('12.34%');
    expect(formatPercentage(0.1234, 0)).toBe('12%');
  });

  it('should handle values over 100%', () => {
    expect(formatPercentage(1.35)).toBe('135.0%');
  });

  it('should handle negative values', () => {
    expect(formatPercentage(-0.1)).toBe('-10.0%');
  });

  it('should handle NaN and Infinity', () => {
    expect(formatPercentage(NaN)).toBe('0%');
    expect(formatPercentage(Infinity)).toBe('0%');
  });
});

describe('cn', () => {
  it('should merge class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('should handle conditional classes', () => {
    expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz');
  });

  it('should merge tailwind conflicts', () => {
    expect(cn('p-4', 'p-2')).toBe('p-2');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('should handle empty inputs', () => {
    expect(cn()).toBe('');
    expect(cn('')).toBe('');
  });
});
