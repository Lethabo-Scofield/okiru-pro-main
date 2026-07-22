/**
 * Vision transcription of scanned documents.
 *
 * Same non-negotiable as every other optional enrichment: it must never take an
 * upload down. Unconfigured, unrenderable, rejected, or a thrown network error
 * all return null so the caller keeps whatever the text layer gave it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const renderMock = vi.fn();
vi.mock('pdf2pic', () => ({
  fromBuffer: () => renderMock,
}));

const { extractScannedPdfWithVision, visionExtractionConfigured } = await import('../../src/services/visionExtraction.js');

/** Real PNG magic bytes, long enough to clear the sanity guard. */
const PNG_B64 = `iVBORw0KGgo${'A'.repeat(200)}`;

const originalFetch = globalThis.fetch;

function configure(): void {
  process.env.AZURE_OPENAI_ENDPOINT = 'https://example.openai.azure.com';
  process.env.AZURE_OPENAI_API_KEY = 'test-key';
  process.env.AZURE_MODEL_DEPLOYMENT = 'gpt-4o';
}

function unconfigure(): void {
  delete process.env.AZURE_OPENAI_ENDPOINT;
  delete process.env.AZURE_OPENAI_API_KEY;
  delete process.env.AZURE_MODEL_DEPLOYMENT;
}

/** Render `pages` pages, then behave like pdf2pic does past the end: throw. */
function mockPages(pages: number): void {
  renderMock.mockReset();
  renderMock.mockImplementation(async (page: number) => {
    if (page > pages) throw new Error('page out of range');
    // Alternate the two shapes pdf2pic actually returns: raw base64 and a full
    // data URI. Both must reach Azure as a single, correctly-prefixed URI.
    return { base64: page % 2 === 0 ? `data:image/png;base64,${PNG_B64}` : PNG_B64 };
  });
}

function mockModel(content: string | null, ok = true): void {
  globalThis.fetch = vi.fn(async () => ({
    ok,
    status: ok ? 200 : 429,
    text: async () => 'rate limited',
    json: async () => ({ choices: content === null ? [] : [{ message: { content } }] }),
  })) as never;
}

beforeEach(() => { configure(); mockPages(2); });
afterEach(() => { globalThis.fetch = originalFetch; unconfigure(); vi.clearAllMocks(); });

describe('configuration', () => {
  it('is off without Azure OpenAI credentials', async () => {
    unconfigure();
    expect(visionExtractionConfigured()).toBe(false);
    expect(await extractScannedPdfWithVision(Buffer.from('x'), 'a.pdf')).toBeNull();
  });
});

describe('transcribing a scan', () => {
  it('renders the pages and returns the transcription', async () => {
    mockModel('# Share Register\n\n| Shareholder | Shares |\n| --- | --- |\n| T Nkosi | 100 |');

    const result = await extractScannedPdfWithVision(Buffer.from('scan'), 'register.pdf');

    expect(result).not.toBeNull();
    expect(result!.pagesRead).toBe(2);
    expect(result!.markdown).toContain('| T Nkosi | 100 |');
    expect(result!.truncated).toBe(false);
  });

  it('sends every rendered page as an image to the model', async () => {
    mockModel('text');
    await extractScannedPdfWithVision(Buffer.from('scan'), 'r.pdf');

    const body = JSON.parse(((globalThis.fetch as never as { mock: { calls: Array<[string, { body: string }]> } }).mock.calls[0][1]).body);
    const parts = body.messages[1].content as Array<{ type: string; image_url?: { url: string } }>;
    const images = parts.filter((p) => p.type === 'image_url');
    expect(images).toHaveLength(2);
    // Exactly one prefix, whichever shape pdf2pic handed back. Double-prefixing
    // is what Azure rejected in production with "unsupported image".
    for (const image of images) {
      expect(image.image_url!.url).toBe(`data:image/png;base64,${PNG_B64}`);
      expect(image.image_url!.url.match(/base64,/g)).toHaveLength(1);
    }
  });

  it('refuses to send a rendered page that is not actually a PNG', async () => {
    renderMock.mockReset();
    renderMock.mockImplementation(async () => ({ base64: `JVBERi0x${'A'.repeat(200)}` })); // a PDF, not a PNG
    mockModel('text');

    expect(await extractScannedPdfWithVision(Buffer.from('x'), 'a.pdf')).toBeNull();
  });

  it('is deterministic — the same scan must not score differently between runs', async () => {
    mockModel('text');
    await extractScannedPdfWithVision(Buffer.from('scan'), 'r.pdf');

    const body = JSON.parse(((globalThis.fetch as never as { mock: { calls: Array<[string, { body: string }]> } }).mock.calls[0][1]).body);
    expect(body.temperature).toBe(0);
  });

  it('caps the page count and says so, rather than billing a 300-page pack', async () => {
    mockPages(500);
    mockModel('text');

    const result = await extractScannedPdfWithVision(Buffer.from('huge'), 'huge.pdf');
    expect(result!.pagesRead).toBeLessThanOrEqual(12);
    expect(result!.truncated).toBe(true);
  });
});

describe('it never takes uploads down', () => {
  it('returns null when no page can be rendered', async () => {
    mockPages(0);
    mockModel('text');
    expect(await extractScannedPdfWithVision(Buffer.from('x'), 'a.pdf')).toBeNull();
  });

  it('returns null when the model rejects the request', async () => {
    mockModel('text', false);
    expect(await extractScannedPdfWithVision(Buffer.from('x'), 'a.pdf')).toBeNull();
  });

  it('returns null when the model returns no content', async () => {
    mockModel(null);
    expect(await extractScannedPdfWithVision(Buffer.from('x'), 'a.pdf')).toBeNull();
  });

  it('returns null when the network throws', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('ECONNRESET'); }) as never;
    expect(await extractScannedPdfWithVision(Buffer.from('x'), 'a.pdf')).toBeNull();
  });
});
