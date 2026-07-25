/**
 * The OCR sidecar client — a long-document OCR model (reference: Baidu
 * Unlimited-OCR) behind an OpenAI-compatible API.
 *
 * Two properties matter. It must speak the model's exact decode recipe (no
 * chat template, literal `<image>` prefix, special tokens kept) or the model
 * returns nothing; and it must be a pure enhancement — every failure path
 * returns null so the caller falls back to the general vision model.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isOcrSidecarEnabled,
  transcribeWithOcrSidecar,
  unwrapGroundingTokens,
} from '../../src/services/ocrClient.js';

const originalFetch = globalThis.fetch;
const PAGES = ['iVBORw0KGgoAAA', 'iVBORw0KGgoBBB'];

function mockReply(content: string | null, ok = true): void {
  globalThis.fetch = vi.fn(async () => ({
    ok,
    status: ok ? 200 : 503,
    text: async () => 'unavailable',
    json: async () => ({ choices: content === null ? [] : [{ message: { content } }] }),
  })) as never;
}

function body(): Record<string, never> {
  const calls = (globalThis.fetch as never as { mock: { calls: Array<[string, { body: string }]> } }).mock.calls;
  return JSON.parse(calls[0][1].body);
}

beforeEach(() => { process.env.PARSER_OCR_ENDPOINT = 'http://ocr:8000/v1'; });
afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.PARSER_OCR_ENDPOINT;
  delete process.env.PARSER_OCR_MODEL;
  delete process.env.PARSER_OCR_API_KEY;
  vi.clearAllMocks();
});

describe('enablement', () => {
  it('is off unless an endpoint is configured', () => {
    delete process.env.PARSER_OCR_ENDPOINT;
    expect(isOcrSidecarEnabled()).toBe(false);
  });

  it('returns null when disabled, so the caller keeps its own path', async () => {
    delete process.env.PARSER_OCR_ENDPOINT;
    expect(await transcribeWithOcrSidecar(PAGES, 'a.pdf')).toBeNull();
  });

  it('returns null when there are no pages', async () => {
    expect(await transcribeWithOcrSidecar([], 'a.pdf')).toBeNull();
  });
});

describe('the request the model requires', () => {
  it('sends every page in ONE call — the whole point of long-document OCR', async () => {
    mockReply('# Register');
    await transcribeWithOcrSidecar(PAGES, 'register.pdf');

    expect((globalThis.fetch as never as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(1);
    const content = (body() as never as { messages: Array<{ content: Array<{ type: string }> }> }).messages[0].content;
    expect(content.filter((p) => p.type === 'image_url')).toHaveLength(2);
  });

  it("leads with the literal '<image>' prompt the model is trained on", async () => {
    // Without this exact prefix Unlimited-OCR returns empty output: it has no
    // chat template and is trained for one prompt recipe.
    mockReply('text');
    await transcribeWithOcrSidecar(PAGES, 'a.pdf');

    const content = (body() as never as { messages: Array<{ content: Array<{ type: string; text?: string }> }> }).messages[0].content;
    expect(content[0].text).toBe('<image>document parsing.');
  });

  it('keeps special tokens and stays deterministic', async () => {
    // Grounding tokens ARE special tokens; dropping them server-side deletes the
    // text they wrap. Temperature 0 so one scan cannot score two ways.
    mockReply('text');
    await transcribeWithOcrSidecar(PAGES, 'a.pdf');

    const sent = body() as never as { skip_special_tokens: boolean; temperature: number; vllm_xargs: { window_size: number } };
    expect(sent.skip_special_tokens).toBe(false);
    expect(sent.temperature).toBe(0);
    expect(sent.vllm_xargs.window_size).toBe(1024);
  });

  it('passes a bearer token only when one is configured', async () => {
    mockReply('text');
    await transcribeWithOcrSidecar(PAGES, 'a.pdf');
    const first = (globalThis.fetch as never as { mock: { calls: Array<[string, { headers: Record<string, string> }]> } }).mock.calls[0][1];
    expect(first.headers.Authorization).toBeUndefined();

    process.env.PARSER_OCR_API_KEY = 'secret';
    mockReply('text');
    await transcribeWithOcrSidecar(PAGES, 'a.pdf');
    const second = (globalThis.fetch as never as { mock: { calls: Array<[string, { headers: Record<string, string> }]> } }).mock.calls[0][1];
    expect(second.headers.Authorization).toBe('Bearer secret');
  });
});

describe('grounding tokens', () => {
  it('keeps the text and drops the coordinates', () => {
    const raw = '<|grounding|><|ref|>Share Register<|/ref|><|det|>[[10, 20, 30, 40]]<|/det|>\n\n<|ref|>T Nkosi<|/ref|><|det|>[[1,2,3,4]]<|/det|>';
    const out = unwrapGroundingTokens(raw);
    expect(out).toContain('Share Register');
    expect(out).toContain('T Nkosi');
    expect(out).not.toContain('<|ref|>');
    expect(out).not.toContain('[[10, 20, 30, 40]]');
  });

  it('leaves clean markdown untouched', () => {
    const md = '# Register\n\n| Holder | Shares |\n| --- | --- |\n| T Nkosi | 100 |';
    expect(unwrapGroundingTokens(md)).toBe(md);
  });

  it('returns the transcription with tokens already unwrapped', async () => {
    mockReply('<|ref|>Certificate 13609<|/ref|><|det|>[[0,0,1,1]]<|/det|>');
    const result = await transcribeWithOcrSidecar(PAGES, 'cert.pdf');
    expect(result!.markdown).toBe('Certificate 13609');
    expect(result!.pagesRead).toBe(2);
  });
});

describe('it never takes uploads down', () => {
  it('returns null when the sidecar rejects the request', async () => {
    mockReply('text', false);
    expect(await transcribeWithOcrSidecar(PAGES, 'a.pdf')).toBeNull();
  });

  it('returns null when the sidecar returns nothing usable', async () => {
    mockReply(null);
    expect(await transcribeWithOcrSidecar(PAGES, 'a.pdf')).toBeNull();
    mockReply('<|det|>[[1,2,3,4]]<|/det|>'); // coordinates only, no text
    expect(await transcribeWithOcrSidecar(PAGES, 'a.pdf')).toBeNull();
  });

  it('returns null when the network throws', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED'); }) as never;
    expect(await transcribeWithOcrSidecar(PAGES, 'a.pdf')).toBeNull();
  });
});
