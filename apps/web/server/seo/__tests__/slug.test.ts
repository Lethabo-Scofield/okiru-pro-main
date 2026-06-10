/**
 * Unit tests for certificate SEO slug helpers used by SSR pages.
 */
import { describe, it, expect } from 'vitest';
import { slugify, makeCertificateSlug, escapeHtml } from '../slug';

describe('slugify', () => {
  it('lowercases, strips accents, and hyphenates', () => {
    expect(slugify('Acme & Sons (Pty) Ltd')).toBe('acme-and-sons-pty-ltd');
    expect(slugify('  Café BEE  ')).toBe('cafe-bee');
  });

  it('returns empty string for nullish input', () => {
    expect(slugify(null)).toBe('');
    expect(slugify(undefined)).toBe('');
  });
});

describe('makeCertificateSlug', () => {
  it('combines company name and stable certificate id', () => {
    expect(makeCertificateSlug('Absa Group Limited', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(
      'absa-group-limited-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    );
  });

  it('returns empty string when id is missing', () => {
    expect(makeCertificateSlug('Only Co', null)).toBe('');
    expect(makeCertificateSlug('Only Co', '')).toBe('');
  });
});

describe('escapeHtml', () => {
  it('escapes characters that would break HTML', () => {
    expect(escapeHtml('<script>"x"&\'</script>')).toBe(
      '&lt;script&gt;&quot;x&quot;&amp;&#39;&lt;/script&gt;',
    );
  });
});
