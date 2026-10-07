/**
 * The B-BBEE answer-key gate on a real evidence pack.
 *
 *   PACK_EVAL_CASE=<run>/case.json PACK_EVAL_KEY=<pack>/.eval/answer-key.json pnpm eval:pack
 *
 * Skipped unless pointed at a case: the pack and its key are client data and
 * never live in the repository. scripts/pack-eval.ts --domain bbbee produces the
 * case (and summary.json beside it); scripts/bbbee-key-from-review.mjs produces
 * the key. The scorer itself is packScore.ts, tested on synthetic data in
 * packScore.test.ts.
 *
 * - Writes score.json and score.md beside the case.
 * - First run (or UPDATE_BASELINE=1) records baseline.json beside the key.
 * - FAILS when a replay missed the cassette (always, baseline or not), or when,
 *   against the baseline: union correct falls, any document's correct count
 *   falls, wrong+invented rises, type_ok falls, or more documents are unreadable.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  baselineFrom,
  gateFailures,
  scoreMarkdown,
  scorePack,
  type AnswerKey,
  type PackBaseline,
  type PackCase,
  type RunSummary,
} from './packScore.js';

const CASE = process.env.PACK_EVAL_CASE;
const KEY = process.env.PACK_EVAL_KEY;

describe.skipIf(!CASE || !KEY)('B-BBEE pack answer-key gate', () => {
  it('scores at least as well as the baseline, on a run that is the recorded one', () => {
    const caseResult = JSON.parse(readFileSync(CASE!, 'utf8')) as PackCase;
    const key = JSON.parse(readFileSync(KEY!, 'utf8')) as AnswerKey;
    const runDir = dirname(CASE!);
    const summaryPath = join(runDir, 'summary.json');
    // Without the run summary there is no telling whether this run replayed the
    // recorded one, so a missing summary.json fails rather than skipping the check.
    expect(existsSync(summaryPath), `no summary.json beside ${CASE}`).toBe(true);
    const summary = JSON.parse(readFileSync(summaryPath, 'utf8')) as RunSummary;

    const score = scorePack(caseResult, key);
    writeFileSync(join(runDir, 'score.json'), JSON.stringify({ ...score, run: summary }, null, 2));
    writeFileSync(join(runDir, 'score.md'), scoreMarkdown(score, summary));
    // The same run scored on the key's own field names only (no aliases), so
    // what the aliases changed is always visible beside the gated score.
    const keyNamesOnly = scorePack(caseResult, key, { aliases: false });
    writeFileSync(join(runDir, 'score-key-names-only.json'), JSON.stringify({ ...keyNamesOnly, run: summary }, null, 2));

    const baselinePath = join(dirname(KEY!), 'baseline.json');
    const writeBaseline = !existsSync(baselinePath) || process.env.UPDATE_BASELINE === '1';
    const baseline = writeBaseline ? null : JSON.parse(readFileSync(baselinePath, 'utf8')) as PackBaseline;

    // A replay that missed the cassette fails before anything else — and is
    // never allowed to become the baseline.
    const failures = gateFailures(score, baseline, summary);
    expect(failures, failures.join('\n')).toEqual([]);

    if (writeBaseline) {
      expect(score.totals.fields).toBeGreaterThan(0);
      // Only a faithful replay may become the baseline.
      expect(summary.mode, 'a baseline must come from a replay run').toBe('replay');
      expect(summary.cassette?.misses ?? 0).toBe(0);
      writeFileSync(baselinePath, JSON.stringify(baselineFrom(score, new Date().toISOString()), null, 2));
    }
  });
});
