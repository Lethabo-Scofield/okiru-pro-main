import { describe, expect, it } from 'vitest';
import { canonicalizeName, levenshtein, nameSimilarity, bestMatch } from '../../parser/fuzzyMatch.js';

describe('canonicalizeName', () => {
  it('strips legal suffixes, punctuation and casing', () => {
    expect(canonicalizeName('ABC Traders (PTY) LTD')).toBe('abc traders');
    expect(canonicalizeName('ABC  Traders Pty Ltd.')).toBe('abc traders');
    expect(canonicalizeName('Smith & Sons Incorporated')).toBe('smith and sons');
  });
});

describe('levenshtein', () => {
  it('computes edit distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('abc', 'abc')).toBe(0);
  });
});

describe('nameSimilarity', () => {
  it('treats legal-suffix variants of the same company as identical', () => {
    expect(nameSimilarity('ABC Traders (Pty) Ltd', 'ABC Traders Pty Ltd')).toBe(1);
  });
  it('scores an OCR-noisy variant high', () => {
    expect(nameSimilarity('ABC Traders', 'ABC Traderz')).toBeGreaterThan(0.85);
  });
  it('scores genuinely different companies low', () => {
    expect(nameSimilarity('ABC Traders', 'XYZ Holdings')).toBeLessThan(0.5);
  });
});

describe('bestMatch', () => {
  const known = [{ id: 1, name: 'ABC Traders (Pty) Ltd' }, { id: 2, name: 'XYZ Holdings' }];

  it('matches an OCR/suffix variant to the right known supplier', () => {
    const m = bestMatch('abc traderz pty ltd', known, (c) => c.name);
    expect(m?.candidate.id).toBe(1);
  });

  it('returns null when nothing clears the threshold', () => {
    expect(bestMatch('Completely Different Co', known, (c) => c.name)).toBeNull();
  });
});
