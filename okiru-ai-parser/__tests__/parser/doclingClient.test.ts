import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';

/**
 * The Docling sidecar is an OPTIONAL enhancement. These tests lock the property
 * that matters most: every failure mode returns null so the caller falls back to
 * the built-in converters. A sidecar outage must never break extraction.
 */

const ORIGINAL_ENV = { ...process.env };

async function loadClient(env: Record<string, string | undefined>) {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV, ...env };
  return import('../../src/services/doclingClient.js');
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('doclingClient (disabled)', () => {
  it('is disabled and returns null when DOCLING_URL is unset', async () => {
    const { isDoclingEnabled, convertWithDocling } = await loadClient({ DOCLING_URL: undefined });
    expect(isDoclingEnabled()).toBe(false);
    await expect(convertWithDocling(Buffer.from('x'), 'a.pdf', 'application/pdf')).resolves.toBeNull();
  });
});

describe('doclingClient (enabled)', () => {
  beforeEach(() => {
    vi.stubGlobal('FormData', class { append() {} } as unknown as typeof FormData);
    vi.stubGlobal('Blob', class { constructor(_p?: unknown, _o?: unknown) {} } as unknown as typeof Blob);
  });

  it('returns the parsed result on success', async () => {
    const { convertWithDocling } = await loadClient({ DOCLING_URL: 'http://localhost:3400' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ markdown: '## Page 1\n\n| A | B |', tables: [], pages: 1, engine: 'docling', duration_ms: 12 }),
    }));

    const result = await convertWithDocling(Buffer.from('x'), 'cert.pdf', 'application/pdf');
    expect(result?.markdown).toContain('| A | B |');
    expect(result?.engine).toBe('docling');
  });

  it('falls back (null) on a non-OK response', async () => {
    const { convertWithDocling } = await loadClient({ DOCLING_URL: 'http://localhost:3400' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));
    await expect(convertWithDocling(Buffer.from('x'), 'cert.pdf', 'application/pdf')).resolves.toBeNull();
  });

  it('falls back (null) when the sidecar is unreachable', async () => {
    const { convertWithDocling } = await loadClient({ DOCLING_URL: 'http://localhost:3400' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    await expect(convertWithDocling(Buffer.from('x'), 'cert.pdf', 'application/pdf')).resolves.toBeNull();
  });

  it('falls back (null) on empty markdown', async () => {
    const { convertWithDocling } = await loadClient({ DOCLING_URL: 'http://localhost:3400' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ markdown: '   ', tables: [], pages: 0, engine: 'docling', duration_ms: 1 }),
    }));
    await expect(convertWithDocling(Buffer.from('x'), 'cert.pdf', 'application/pdf')).resolves.toBeNull();
  });
});

describe('doclingHandlesExtension', () => {
  it('covers the layout-heavy formats only', async () => {
    const { doclingHandlesExtension } = await loadClient({});
    expect(doclingHandlesExtension('.pdf')).toBe(true);
    expect(doclingHandlesExtension('.docx')).toBe(true);
    expect(doclingHandlesExtension('.pptx')).toBe(true);
    expect(doclingHandlesExtension('.csv')).toBe(false);
    expect(doclingHandlesExtension('.txt')).toBe(false);
  });
});
