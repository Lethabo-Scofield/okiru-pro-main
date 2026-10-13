/**
 * Record and replay model calls, so an evaluation run costs nothing the second
 * time it is made.
 *
 * Scoring a parser change against a real evidence pack means running the whole
 * pipeline over it — dozens of model calls. Paying for those on every change
 * would make the score a thing people stop checking. A cassette sits between
 * the pipeline and the model: a call whose exact prompt has been seen before is
 * answered from disk; a new one goes to the model once and is kept.
 *
 * The key is the method and the full prompt text, so a code change that alters
 * what the model is asked misses the cassette and is paid for — exactly the
 * calls whose answers could have changed. Everything else replays verbatim,
 * which also makes two evaluation runs comparable: the same prompt gets the
 * same answer, rather than whatever the model says this time.
 *
 * Evaluation tooling only. Production never wraps its model in this.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExtractionModel } from './aiExtraction.js';

/**
 * replay: answer only from disk; a miss is an error (the cassette is stale).
 * record: always ask the model and overwrite what is kept.
 * auto:   answer from disk when possible, ask the model and keep the answer when not.
 */
export type CassetteMode = 'replay' | 'record' | 'auto';

export interface CassetteStats {
  hits: number;
  recorded: number;
  misses: number;
}

type Method = 'complete' | 'completeHard' | 'completeReview';

export function withCassette(
  inner: ExtractionModel | null,
  dir: string,
  mode: CassetteMode = 'auto',
): ExtractionModel & { stats: CassetteStats } {
  mkdirSync(dir, { recursive: true });
  const stats: CassetteStats = { hits: 0, recorded: 0, misses: 0 };

  const call = (method: Method) => async (system: string, user: string): Promise<string> => {
    const key = createHash('sha256').update(JSON.stringify([method, system, user])).digest('hex');
    const file = join(dir, `${key}.json`);
    if (mode !== 'record' && existsSync(file)) {
      stats.hits += 1;
      return (JSON.parse(readFileSync(file, 'utf8')) as { response: string }).response;
    }
    if (mode === 'replay' || !inner) {
      stats.misses += 1;
      throw new Error(`Model cassette has no answer for this ${method} call (mode ${mode})`);
    }
    // An absent tier falls back exactly as the pipeline's own callers do.
    const ask = method === 'complete'
      ? inner.complete.bind(inner)
      : (inner[method]?.bind(inner) ?? inner.complete.bind(inner));
    const response = await ask(system, user);
    writeFileSync(file, JSON.stringify({ method, response }));
    stats.recorded += 1;
    return response;
  };

  return {
    name: `cassette(${inner?.name ?? 'none'})`,
    complete: call('complete'),
    completeHard: call('completeHard'),
    completeReview: call('completeReview'),
    stats,
  };
}
