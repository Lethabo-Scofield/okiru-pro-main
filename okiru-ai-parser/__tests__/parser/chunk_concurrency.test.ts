/**
 * A long sheet is cut into chunks that were all sent to the model at once: one
 * 35-chunk sheet was 35 simultaneous calls on a deployment whose quota is
 * shared with production, and a wall of 429s. PARSER_CHUNK_CONCURRENCY bounds
 * the calls one document has in flight. Unset, every chunk still goes at once,
 * exactly as before.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ExtractionModel } from '../../src/services/aiExtraction.js';
import { extractDocument } from '../../src/services/aiExtraction.js';
import { resetExtractionCache } from '../../src/services/extractionCache.js';
import { boundedAll, chunkConcurrency } from '../../src/services/concurrentMap.js';

let saved: string | undefined;
beforeEach(() => {
  saved = process.env.PARSER_CHUNK_CONCURRENCY;
  resetExtractionCache();
});
afterEach(() => {
  if (saved === undefined) delete process.env.PARSER_CHUNK_CONCURRENCY;
  else process.env.PARSER_CHUNK_CONCURRENCY = saved;
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('boundedAll', () => {
  it('keeps at most the limit in flight and returns results in input order', async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await boundedAll([5, 4, 3, 2, 1, 0], 2, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, n * 3));
      inFlight -= 1;
      return n * 10;
    });
    expect(out).toEqual([50, 40, 30, 20, 10, 0]);
    expect(peak).toBe(2);
  });

  it('with no limit sends everything at once', async () => {
    let inFlight = 0;
    let peak = 0;
    await boundedAll([1, 2, 3, 4], Infinity, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await tick();
      inFlight -= 1;
    });
    expect(peak).toBe(4);
  });
});

describe('chunkConcurrency', () => {
  it('is unbounded unless PARSER_CHUNK_CONCURRENCY names a positive number', () => {
    delete process.env.PARSER_CHUNK_CONCURRENCY;
    expect(chunkConcurrency()).toBe(Infinity);
    process.env.PARSER_CHUNK_CONCURRENCY = 'nonsense';
    expect(chunkConcurrency()).toBe(Infinity);
    process.env.PARSER_CHUNK_CONCURRENCY = '3';
    expect(chunkConcurrency()).toBe(3);
  });
});

describe('a long document read under PARSER_CHUNK_CONCURRENCY', () => {
  function countingModel() {
    const state = { inFlight: 0, peak: 0, calls: 0 };
    const model: ExtractionModel = {
      name: 'stub',
      async complete() {
        state.calls += 1;
        state.inFlight += 1;
        state.peak = Math.max(state.peak, state.inFlight);
        await tick();
        state.inFlight -= 1;
        return '{}';
      },
    };
    return { model, state };
  }
  // Invented rows, long enough to be cut into many chunks.
  const longText = Array.from({ length: 4000 }, (_, i) => `Row ${i} | Depot A | Invented route ${i} | ${i * 3} km | ${i % 7} events`).join('\n');

  it('never has more chunk calls in flight than the limit', async () => {
    process.env.PARSER_CHUNK_CONCURRENCY = '2';
    const { model, state } = countingModel();
    await extractDocument(model, { filename: 'Invented debrief.xlsx › ROUTES', raw_text: longText }, { domain: 'esg', specIds: ['fleet__telematics_driver_debrief_report'] });
    expect(state.calls).toBeGreaterThan(2);
    expect(state.peak).toBeLessThanOrEqual(2);
  });

  it('unset, sends every chunk at once as before', async () => {
    delete process.env.PARSER_CHUNK_CONCURRENCY;
    const { model, state } = countingModel();
    await extractDocument(model, { filename: 'Invented debrief.xlsx › ROUTES', raw_text: longText }, { domain: 'esg', specIds: ['fleet__telematics_driver_debrief_report'] });
    expect(state.calls).toBeGreaterThan(2);
    expect(state.peak).toBeGreaterThan(2);
  });
});
