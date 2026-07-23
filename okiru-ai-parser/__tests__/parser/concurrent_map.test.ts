/**
 * Bounded-concurrency map.
 *
 * The properties under test are the ones that protect a score, not the speed:
 * results come back in INPUT order however the tasks race, the concurrency
 * limit is actually enforced, and one failure does not sink the batch.
 */
import { describe, expect, it } from 'vitest';
import { concurrentMap } from '../../src/services/concurrentMap.js';

/** Resolve after `ms`, so completion order can be made to differ from input order. */
function delayed<T>(value: T, ms: number): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

describe('order independence', () => {
  it('returns results in INPUT order even when later items finish first', async () => {
    // Item 0 is slowest, item 4 fastest — completion order is the reverse of
    // input order. The output must still be [0,1,2,3,4].
    const results = await concurrentMap([0, 1, 2, 3, 4], 5, (n) => delayed(n, (5 - n) * 10));

    expect(results.map((r) => r.value)).toEqual([0, 1, 2, 3, 4]);
    expect(results.map((r) => r.index)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('the concurrency limit is enforced', () => {
  it('never runs more than `concurrency` tasks at once', async () => {
    let inFlight = 0;
    let peak = 0;

    await concurrentMap(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await delayed(null, 5);
      inFlight -= 1;
    });

    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1); // it did actually parallelise
  });

  it('does not spawn more lanes than there are items', async () => {
    let peak = 0;
    let inFlight = 0;
    await concurrentMap([1, 2], 10, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await delayed(null, 5);
      inFlight -= 1;
    });
    expect(peak).toBeLessThanOrEqual(2);
  });
});

describe('failures are isolated', () => {
  it('captures a rejection without sinking the batch', async () => {
    const results = await concurrentMap([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error('item 2 failed');
      return n * 10;
    });

    expect(results[0]).toMatchObject({ status: 'fulfilled', value: 10 });
    expect(results[1].status).toBe('rejected');
    expect((results[1].reason as Error).message).toBe('item 2 failed');
    expect(results[2]).toMatchObject({ status: 'fulfilled', value: 30 });
  });

  it('runs every item even when several fail', async () => {
    const results = await concurrentMap([1, 2, 3, 4, 5], 2, async (n) => {
      if (n % 2 === 0) throw new Error(`fail ${n}`);
      return n;
    });

    expect(results).toHaveLength(5);
    expect(results.filter((r) => r.status === 'fulfilled').map((r) => r.value)).toEqual([1, 3, 5]);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(2);
  });
});

describe('edge cases', () => {
  it('handles an empty input', async () => {
    expect(await concurrentMap([], 4, async () => 1)).toEqual([]);
  });

  it('passes the index to the worker', async () => {
    const results = await concurrentMap(['a', 'b', 'c'], 2, async (item, index) => `${index}:${item}`);
    expect(results.map((r) => r.value)).toEqual(['0:a', '1:b', '2:c']);
  });

  it('treats a concurrency below 1 as serial rather than hanging', async () => {
    const results = await concurrentMap([1, 2, 3], 0, async (n) => n);
    expect(results.map((r) => r.value)).toEqual([1, 2, 3]);
  });
});
