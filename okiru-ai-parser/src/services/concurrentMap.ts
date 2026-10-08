/**
 * Run an async task over many items with BOUNDED concurrency, preserving order.
 *
 * A 26-document evidence pack was processed one document at a time. Each
 * document already fans its chunks out in parallel, but the documents
 * themselves ran serially, so a large pack was as slow as the sum of its parts.
 * Cost is not the constraint here; wall-clock latency at the point of sale is.
 *
 * TWO PROPERTIES THAT MATTER, both about NOT trading correctness for speed:
 *
 *  1. RESULTS COME BACK IN INPUT ORDER, regardless of which finished first.
 *     The reconciler downstream resolves conflicts by "first document wins", so
 *     a race that reordered documents would change a score between runs on
 *     identical evidence. Order-independence of the OUTPUT is the whole point.
 *
 *  2. ONE FAILURE IS ISOLATED, never fatal to the batch. A single unreadable
 *     file must not cost the user the rest of a pack they have paid to extract.
 *     Each task's outcome is captured; the caller decides what a failure means.
 *
 * Bounded, not unbounded: firing 300 model calls at once trips rate limits and
 * turns a latency win into a wall of 429s. The limit is the throttle.
 */

export interface SettledResult<T> {
  index: number;
  status: 'fulfilled' | 'rejected';
  value?: T;
  reason?: unknown;
}

/**
 * Map `worker` over `items` with at most `concurrency` in flight at once.
 * Results are returned in the SAME ORDER as `items`. A worker that throws
 * yields a `rejected` result for that item; the rest continue.
 */
export async function concurrentMap<I, O>(
  items: readonly I[],
  concurrency: number,
  worker: (item: I, index: number) => Promise<O>,
): Promise<Array<SettledResult<O>>> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results = new Array<SettledResult<O>>(items.length);
  let next = 0;

  async function runLane(): Promise<void> {
    // Each lane pulls the next unclaimed index until the queue is empty. A
    // shared cursor is what keeps exactly `limit` tasks in flight without a
    // scheduler.
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;

      try {
        results[index] = { index, status: 'fulfilled', value: await worker(items[index], index) };
      } catch (reason) {
        results[index] = { index, status: 'rejected', reason };
      }
    }
  }

  const lanes = Array.from({ length: Math.min(limit, items.length) }, () => runLane());
  await Promise.all(lanes);
  return results;
}

/** Concurrency limit for document extraction. Env-overridable; a sane default. */
export function documentConcurrency(): number {
  const configured = Number(process.env.PARSER_DOCUMENT_CONCURRENCY);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 10;
}

/**
 * Promise.all over `items` with at most `limit` workers in flight, results in
 * input order. With a limit at or above the item count it IS Promise.all: every
 * task starts at once, exactly as before. A rejection rejects the whole, as
 * Promise.all does; callers that must not fail catch inside the worker.
 */
export async function boundedAll<I, O>(
  items: readonly I[],
  limit: number,
  worker: (item: I, index: number) => Promise<O>,
): Promise<O[]> {
  if (!(limit < items.length)) return Promise.all(items.map(worker));
  const settled = await concurrentMap(items, limit, worker);
  return settled.map((result) => {
    if (result.status === 'rejected') throw result.reason;
    return result.value as O;
  });
}

/**
 * How many chunk calls ONE document may have in flight. Unbounded by default
 * (every chunk at once, as always); PARSER_CHUNK_CONCURRENCY lowers it, for a
 * run on a model quota shared with production. A 35-chunk sheet was 35
 * simultaneous calls.
 */
export function chunkConcurrency(): number {
  const configured = Number(process.env.PARSER_CHUNK_CONCURRENCY);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : Infinity;
}
