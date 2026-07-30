import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchAzureWithRetry } from '../../src/services/azureRetry.js';

function response(status: number, retryAfter?: string): Response {
  return {
    status,
    headers: new Headers(retryAfter ? { 'retry-after': retryAfter } : {}),
  } as unknown as Response;
}

describe('fetchAzureWithRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('retries a 429 and returns the eventual success', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(429, '1'))
      .mockResolvedValueOnce(response(200));
    vi.stubGlobal('fetch', fetchMock);

    const promise = fetchAzureWithRetry('https://x/', {});
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after the attempt cap so a hard limit still surfaces as 429', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(429, '1'));
    vi.stubGlobal('fetch', fetchMock);

    const promise = fetchAzureWithRetry('https://x/', {});
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('does not retry non-retryable statuses — a 400 is the caller\'s problem', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(400));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchAzureWithRetry('https://x/', {});

    expect(result.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
