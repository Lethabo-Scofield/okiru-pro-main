/**
 * The runnable extraction eval. Run it with:  pnpm eval:extraction
 *
 * Behaviour:
 *  - Always prints a scorecard (per-field misses included).
 *  - First run (or UPDATE_BASELINE=1) writes __tests__/eval/baseline.json.
 *  - Subsequent runs FAIL if any fixture scores fewer correct fields than its
 *    recorded baseline — a no-regression gate. New fixtures never fail the gate;
 *    they just extend the baseline on the next update.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadFixtures } from './fixtures.js';
import { runEval, formatScorecard, type EvalScorecard } from './harness.js';

const here = dirname(fileURLToPath(import.meta.url));
const BASELINE = join(here, 'baseline.json');

interface Baseline {
  accuracy: number;
  totalCorrect: number;
  totalFields: number;
  fixtures: Record<string, { correct: number; total: number }>;
}

function toBaseline(card: EvalScorecard): Baseline {
  return {
    accuracy: card.accuracy,
    totalCorrect: card.totalCorrect,
    totalFields: card.totalFields,
    fixtures: Object.fromEntries(card.fixtures.map((f) => [f.name, { correct: f.correct, total: f.total }])),
  };
}

describe('extraction eval', () => {
  it('scores fixtures and does not regress the baseline', async () => {
    const card = await runEval(await loadFixtures());
    // Surface the scorecard in test output / CI logs.
    // eslint-disable-next-line no-console
    console.log('\n' + formatScorecard(card) + '\n');

    const fresh = !existsSync(BASELINE) || process.env.UPDATE_BASELINE === '1';
    if (fresh) {
      writeFileSync(BASELINE, JSON.stringify(toBaseline(card), null, 2) + '\n');
      // eslint-disable-next-line no-console
      console.log(`Baseline written to ${BASELINE}`);
      expect(card.totalFields).toBeGreaterThan(0);
      return;
    }

    const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline;
    for (const fx of card.fixtures) {
      const prior = baseline.fixtures[fx.name];
      if (!prior) continue; // new fixture — not part of the gate yet
      expect(
        fx.correct,
        `regression in "${fx.name}": ${fx.correct}/${fx.total} correct, baseline was ${prior.correct}/${prior.total}`,
      ).toBeGreaterThanOrEqual(prior.correct);
    }
  });
});
