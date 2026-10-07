import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../logger.js', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

import { DEFAULT_FILE_TIMEOUT_MS, resolvePaidFileWithParser } from '../parserClient.js';

const FILE = { buffer: Buffer.from('%PDF statements'), filename: 'afs.pdf', mimeType: 'application/pdf' };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete process.env.PARSER_FILE_TIMEOUT_MS;
});

function captureFetch(reply: unknown = { status: 'passed', extracted_fields: {} }) {
  const calls: Array<{ url: string; form: FormData }> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, form: init.body as FormData });
    return new Response(JSON.stringify(reply), { status: 200 });
  }));
  return calls;
}

describe('resolvePaidFileWithParser', () => {
  it('asks for the whole per-document read through the reader for the domain', async () => {
    const calls = captureFetch();
    await resolvePaidFileWithParser(FILE, 'quote-1', { domain: 'esg', full: true });
    expect(calls[0].url).toMatch(/\/api\/parser\/resolve-file-paid$/);
    expect(calls[0].form.get('quote_id')).toBe('quote-1');
    expect(calls[0].form.get('read')).toBe('full');
    expect(calls[0].form.get('domain')).toBe('esg');
  });

  it('sends neither when not asked — the rule-only read an older parser understands', async () => {
    const calls = captureFetch();
    await resolvePaidFileWithParser(FILE, 'quote-1');
    expect(calls[0].form.get('read')).toBeNull();
    expect(calls[0].form.get('domain')).toBeNull();
  });

  it('passes the signed run record through to the caller', async () => {
    const signed = { filename: 'afs.pdf', payload: '{"typ":"okiru.parser-run"}', signature: 'sig' };
    captureFetch({ status: 'passed', extracted_fields: {}, run_attestation: signed, ai_value_count: 3 });
    const outcome = await resolvePaidFileWithParser(FILE, 'quote-1', { full: true });
    expect(outcome.ok).toBe(true);
    expect(outcome.result?.run_attestation).toEqual(signed);
  });

  it('waits long enough for a full read, but gives up before the 600s proxy idle limit', async () => {
    expect(DEFAULT_FILE_TIMEOUT_MS).toBeGreaterThanOrEqual(480_000);
    expect(DEFAULT_FILE_TIMEOUT_MS).toBeLessThan(600_000);

    vi.useFakeTimers();
    let aborted: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => {
      aborted = init.signal ?? undefined;
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }));
    const pending = resolvePaidFileWithParser(FILE, 'quote-1', { full: true });
    await vi.advanceTimersByTimeAsync(180_000);
    // The old 180s default would have given up here, mid-read.
    expect(aborted?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(DEFAULT_FILE_TIMEOUT_MS - 180_000);
    expect(aborted?.aborted).toBe(true);
    expect((await pending).ok).toBe(false);
  });

  it('honours PARSER_FILE_TIMEOUT_MS when it is set', async () => {
    process.env.PARSER_FILE_TIMEOUT_MS = '1000';
    vi.useFakeTimers();
    let aborted: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => {
      aborted = init.signal ?? undefined;
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }));
    const pending = resolvePaidFileWithParser(FILE, 'quote-1');
    await vi.advanceTimersByTimeAsync(1_001);
    expect(aborted?.aborted).toBe(true);
    await pending;
  });
});
