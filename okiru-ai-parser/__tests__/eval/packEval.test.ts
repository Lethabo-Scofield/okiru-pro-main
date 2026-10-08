/**
 * The answer-key gate on a real evidence pack: B-BBEE, or ESG at document level.
 *
 *   PACK_EVAL_CASE=<run>/case.json PACK_EVAL_KEY=<pack>/.eval/answer-key.json pnpm eval:pack
 *   PACK_EVAL_CASE=<esg run>/case.json PACK_EVAL_KEY=<esg pack>/.eval/doc-answer-key.json pnpm eval:pack
 *
 * Skipped unless pointed at a case: the pack and its key are client data and
 * never live in the repository. scripts/pack-eval.ts --domain bbbee|esg produces
 * the case (and summary.json beside it); scripts/bbbee-key-from-review.mjs
 * produces the B-BBEE key. The scorer itself is packScore.ts, tested on
 * synthetic data in packScore.test.ts.
 *
 * - The key is validated first (answerKeyProblems): a malformed key fails
 *   before it can mis-score anything.
 * - B-BBEE writes score.json, score.md and score-key-names-only.json beside the
 *   case, and its baseline is baseline.json beside the key.
 * - An ESG case (case.domain 'esg') writes doc-score.json, doc-score.md and
 *   doc-score-key-names-only.json, and its baseline is doc-baseline.json beside
 *   the key. The ESG workbook gate (apps/web .../esgPackEval.test.ts) owns
 *   score.json beside the same case and baseline.json beside its own
 *   answer-key.json; this gate never touches either.
 * - PACK_EVAL_BASELINE overrides the baseline path.
 * - PACK_EVAL_SCORE_ONLY=1 writes the scores and stops: no gate, no baseline.
 *   For a run that cannot be a baseline yet (a replay with known cassette misses).
 * - First run (or UPDATE_BASELINE=1) records the baseline.
 * - FAILS when a replay missed the cassette (always, baseline or not), or when,
 *   against the baseline: union correct falls, any document's correct count
 *   falls, wrong+invented rises, type_ok falls, or more documents are unreadable.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  answerKeyProblems,
  baselineFrom,
  gateFailures,
  isEsgCase,
  packEvalOutputs,
  scoreMarkdown,
  scorePack,
  type AnswerKey,
  type PackBaseline,
  type PackCase,
  type RunSummary,
} from './packScore.js';

const CASE = process.env.PACK_EVAL_CASE;
const KEY = process.env.PACK_EVAL_KEY;

describe.skipIf(!CASE || !KEY)('pack answer-key gate (B-BBEE, or ESG at document level)', () => {
  it('scores at least as well as the baseline, on a run that is the recorded one', () => {
    const caseResult = JSON.parse(readFileSync(CASE!, 'utf8')) as PackCase;
    const rawKey = JSON.parse(readFileSync(KEY!, 'utf8')) as unknown;
    const problems = answerKeyProblems(rawKey);
    expect(problems, problems.join('\n')).toEqual([]);
    const key = rawKey as AnswerKey;
    const esg = isEsgCase(caseResult);
    // An ESG key on a B-BBEE case (or the reverse) would score every field missing.
    expect(key.domain ?? 'bbbee', 'the key and the case are different domains').toBe(esg ? 'esg' : 'bbbee');

    const runDir = dirname(CASE!);
    const summaryPath = join(runDir, 'summary.json');
    // Without the run summary there is no telling whether this run replayed the
    // recorded one, so a missing summary.json fails rather than skipping the check.
    expect(existsSync(summaryPath), `no summary.json beside ${CASE}`).toBe(true);
    const summary = JSON.parse(readFileSync(summaryPath, 'utf8')) as RunSummary;
    const out = packEvalOutputs(esg, KEY!, process.env.PACK_EVAL_BASELINE);

    const score = scorePack(caseResult, key);
    writeFileSync(join(runDir, `${out.prefix}.json`), JSON.stringify({ ...score, run: summary }, null, 2));
    writeFileSync(join(runDir, `${out.prefix}.md`), scoreMarkdown(score, summary));
    // The same run scored on the key's own field names only (no aliases), so
    // what the aliases changed is always visible beside the gated score.
    const keyNamesOnly = scorePack(caseResult, key, { aliases: false });
    writeFileSync(join(runDir, `${out.prefix}-key-names-only.json`), JSON.stringify({ ...keyNamesOnly, run: summary }, null, 2));
    expect(score.totals.fields).toBeGreaterThan(0);
    if (process.env.PACK_EVAL_SCORE_ONLY === '1') return;

    const writeBaseline = !existsSync(out.baseline) || process.env.UPDATE_BASELINE === '1';
    const baseline = writeBaseline ? null : JSON.parse(readFileSync(out.baseline, 'utf8')) as PackBaseline;

    // A replay that missed the cassette fails before anything else — and is
    // never allowed to become the baseline.
    const failures = gateFailures(score, baseline, summary);
    expect(failures, failures.join('\n')).toEqual([]);

    if (writeBaseline) {
      // Only a faithful replay may become the baseline.
      expect(summary.mode, 'a baseline must come from a replay run').toBe('replay');
      expect(summary.cassette?.misses ?? 0).toBe(0);
      writeFileSync(out.baseline, JSON.stringify(baselineFrom(score, new Date().toISOString()), null, 2));
    }
  });
});

describe('pack gate outputs', () => {
  it('the ESG document gate never writes the workbook gate\'s score.json or baseline.json', () => {
    const esg = packEvalOutputs(true, '/pack/.eval/doc-answer-key.json');
    expect(esg.prefix).toBe('doc-score');
    expect(esg.baseline.replace(/\\/g, '/')).toBe('/pack/.eval/doc-baseline.json');
    const bbbee = packEvalOutputs(false, '/pack/.eval/answer-key.json');
    expect(bbbee.prefix).toBe('score');
    expect(bbbee.baseline.replace(/\\/g, '/')).toBe('/pack/.eval/baseline.json');
    expect(packEvalOutputs(true, '/k.json', '/elsewhere/b.json').baseline).toBe('/elsewhere/b.json');
  });
});
