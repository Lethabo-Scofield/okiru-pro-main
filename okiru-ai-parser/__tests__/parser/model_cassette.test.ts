import { describe, expect, it } from 'vitest';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withCassette } from '../../src/services/modelCassette.js';
import type { ExtractionModel } from '../../src/services/aiExtraction.js';

function scripted(answers: Array<string | Error>): ExtractionModel & { calls: number } {
  const model = {
    name: 'scripted',
    calls: 0,
    async complete(): Promise<string> {
      const next = answers[model.calls];
      model.calls += 1;
      if (next instanceof Error) throw next;
      return next ?? 'unscripted';
    },
  };
  return model;
}

describe('model cassette', () => {
  it('answers a recorded prompt from disk, and misses an unrecorded one in replay', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cassette-'));
    const live = scripted(['{"a":1}']);
    expect(await withCassette(live, dir, 'auto').complete('s', 'u')).toBe('{"a":1}');

    const replay = withCassette(null, dir, 'replay');
    expect(await replay.complete('s', 'u')).toBe('{"a":1}');
    await expect(replay.complete('s', 'other')).rejects.toThrow(/no answer/);
    expect(replay.stats).toMatchObject({ hits: 1, misses: 1, replayedFailures: 0 });
  });

  it('keeps a failed call as its failure: replay fails the same way, auto asks again', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cassette-'));
    const first = withCassette(scripted([new Error('Azure OpenAI error 429')]), dir, 'auto');
    await expect(first.complete('s', 'u')).rejects.toThrow('Azure OpenAI error 429');
    expect(first.stats).toMatchObject({ failed: 1, recorded: 0 });
    expect(readdirSync(dir)).toHaveLength(1);

    const replay = withCassette(null, dir, 'replay');
    await expect(replay.complete('s', 'u')).rejects.toThrow('Azure OpenAI error 429');
    expect(replay.stats).toMatchObject({ misses: 0, replayedFailures: 1 });

    const retry = scripted(['{"ok":true}']);
    const again = withCassette(retry, dir, 'auto');
    expect(await again.complete('s', 'u')).toBe('{"ok":true}');
    expect(retry.calls).toBe(1);
    expect(await withCassette(null, dir, 'replay').complete('s', 'u')).toBe('{"ok":true}');
  });
});
