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

function mockModel(content: string | null, ok = true, finishReason?: string): void {
  globalThis.fetch = vi.fn(async () => ({
    ok,
    status: ok ? 200 : 429,
    text: async () => 'rate limited',
    json: async () => ({
      choices: content === null ? [] : [{ message: { content }, finish_reason: finishReason }],
    }),
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

  it('sends gpt-5-compatible params — max_completion_tokens, no temperature', async () => {
    // gpt-5-family deployments reject `max_tokens` and any non-default
    // `temperature`, so the request must carry neither; determinism is now
    // best-effort (same document, same prompt, default sampling).
    mockModel('text');
    await extractScannedPdfWithVision(Buffer.from('scan'), 'r.pdf');

    const body = JSON.parse(((globalThis.fetch as never as { mock: { calls: Array<[string, { body: string }]> } }).mock.calls[0][1]).body);
    expect(body.temperature).toBeUndefined();
    expect(body.max_tokens).toBeUndefined();
    expect(body.max_completion_tokens).toBeGreaterThan(0);
  });

  it('caps the page count and REPORTS it, rather than reading a 500-page pack unbounded', async () => {
    // The cap is configurable (PARSER_MAX_VISION_PAGES) and was raised from 12
    // to 60 — cost is not the constraint, and stopping at page 12 silently
    // scored the rest of a scanned pack as absent. What must hold is that a cap
    // exists and that hitting it is VISIBLE.
    process.env.PARSER_MAX_VISION_PAGES = '5';
    try {
      mockPages(500);
      mockModel('text');

      const result = await extractScannedPdfWithVision(Buffer.from('huge'), 'huge.pdf');
      expect(result!.pagesRead).toBe(5);
      expect(result!.truncated).toBe(true);
    } finally {
      delete process.env.PARSER_MAX_VISION_PAGES;
    }
  });

  it('does not report truncation when the whole document fitted', async () => {
    mockPages(3);
    mockModel('text');

    const result = await extractScannedPdfWithVision(Buffer.from('small'), 'small.pdf');
    expect(result!.pagesRead).toBe(3);
    expect(result!.truncated).toBe(false);
  });
});

describe('the general-model fallback is batched, not one giant call', () => {
  it('splits pages into batches so the per-call output ceiling cannot swallow a document', async () => {
    // The old code showed up to 60 pages to one call with a few-thousand-token
    // output ceiling: the transcription stopped mid-document and reported
    // success. Batching bounds the ceiling per batch.
    process.env.PARSER_VISION_PAGES_PER_CALL = '2';
    try {
      mockPages(5);
      mockModel('page text');

      const result = await extractScannedPdfWithVision(Buffer.from('scan'), 'long.pdf');
      const calls = (globalThis.fetch as never as { mock: { calls: unknown[] } }).mock.calls;
      expect(calls).toHaveLength(3); // 2 + 2 + 1
      expect(result!.pagesRead).toBe(5);
      expect(result!.markdown.split('page text').length - 1).toBe(3);
    } finally {
      delete process.env.PARSER_VISION_PAGES_PER_CALL;
    }
  });

  it('REPORTS truncation when a batch hits the output ceiling', async () => {
    // A page silently half-read is indistinguishable from a page that is short.
    mockPages(2);
    mockModel('cut off here', true, 'length');

    const result = await extractScannedPdfWithVision(Buffer.from('scan'), 'dense.pdf');
    expect(result!.truncated).toBe(true);
  });

  it('keeps the pages that did transcribe when one batch fails', async () => {
    process.env.PARSER_VISION_PAGES_PER_CALL = '1';
    try {
      mockPages(3);
      let call = 0;
      globalThis.fetch = vi.fn(async () => {
        call += 1;
        const ok = call !== 2; // middle page fails
        return {
          ok,
          status: ok ? 200 : 500,
          text: async () => 'server error',
          json: async () => ({ choices: [{ message: { content: `page ${call}` } }] }),
        };
      }) as never;

      const result = await extractScannedPdfWithVision(Buffer.from('scan'), 'partial.pdf');
      expect(result).not.toBeNull();
      expect(result!.pagesRead).toBe(2);
    } finally {
      delete process.env.PARSER_VISION_PAGES_PER_CALL;
    }
  });
});

describe('the OCR sidecar takes precedence when configured', () => {
  afterEach(() => { delete process.env.PARSER_OCR_ENDPOINT; });

  it('uses the sidecar and never calls the general model', async () => {
    process.env.PARSER_OCR_ENDPOINT = 'http://ocr:8000/v1';
    mockPages(2);
    globalThis.fetch = vi.fn(async (url: string) => {
      expect(String(url)).toContain('ocr:8000');
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({ choices: [{ message: { content: '<|ref|>Register<|/ref|><|det|>[[1,2,3,4]]<|/det|>' } }] }),
      };
    }) as never;

    const result = await extractScannedPdfWithVision(Buffer.from('scan'), 'r.pdf');
    expect(result!.markdown).toBe('Register');
    expect(result!.engine).toBe('baidu/Unlimited-OCR');
    expect((globalThis.fetch as never as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(1);
  });

  it('falls back to the general model when the sidecar is down', async () => {
    process.env.PARSER_OCR_ENDPOINT = 'http://ocr:8000/v1';
    mockPages(2);
    globalThis.fetch = vi.fn(async (url: string) => {
      if (String(url).includes('ocr:8000')) throw new Error('ECONNREFUSED');
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({ choices: [{ message: { content: 'transcribed by the general model' } }] }),
      };
    }) as never;

    const result = await extractScannedPdfWithVision(Buffer.from('scan'), 'r.pdf');
    expect(result!.markdown).toContain('transcribed by the general model');
    expect(result!.engine).toBe('gpt-4o');
  });

  it('works with the sidecar alone, with no Azure credentials at all', async () => {
    unconfigure();
    process.env.PARSER_OCR_ENDPOINT = 'http://ocr:8000/v1';
    expect(visionExtractionConfigured()).toBe(true);
    mockPages(1);
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => ({ choices: [{ message: { content: 'sidecar only' } }] }),
    })) as never;

    const result = await extractScannedPdfWithVision(Buffer.from('scan'), 'r.pdf');
    expect(result!.markdown).toBe('sidecar only');
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
