/**
 * The ESG answer-key gate (sprint task B1).
 *
 *   ESG_EVAL_CASE=<run>/case.json ESG_EVAL_KEY=<pack>/.eval/answer-key.json npx vitest run src/lib/esg/__eval__/esgPackEval.test.ts
 *
 * Skipped unless pointed at a case: the pack is client data and never lives in
 * the repository. The parser half (`okiru-ai-parser/scripts/esg-pack-eval.ps1`)
 * produces the case; this places it exactly as the upload screen does and
 * scores the cells against the key.
 *
 * - Writes `score.md` and `score.json` beside the case.
 * - First run (or UPDATE_BASELINE=1) records `baseline.json` beside the key.
 * - After that, FAILS if fewer cells are placed correctly than the baseline:
 *   the placed-correctly count may only go up.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { applyEsgParserResult, type EsgParserCaseLike } from "@/components/esg/esgParserInjection";
import { resolveEsgReportingAxes, type EsgReportingAxes } from "@/components/esg-workbook/esgDefaults";
import { formatEsgPackScore, scoreEsgPlacement, type EsgExpectedCell } from "./esgPackScore";

interface AnswerKey {
  /** The company's own sites and reporting months, as its workbook carries them. */
  axes?: Partial<EsgReportingAxes>;
  cells: EsgExpectedCell[];
}

const CASE = process.env.ESG_EVAL_CASE;
const KEY = process.env.ESG_EVAL_KEY;

describe.skipIf(!CASE || !KEY)("ESG answer-key gate", () => {
  it("places at least as many cells correctly as the baseline", () => {
    const caseResult = JSON.parse(readFileSync(CASE!, "utf8")) as EsgParserCaseLike;
    const key = JSON.parse(readFileSync(KEY!, "utf8")) as AnswerKey;
    const axes = resolveEsgReportingAxes(key.axes);

    const injection = applyEsgParserResult(caseResult, { axes });
    const score = scoreEsgPlacement(injection.patches, key.cells);
    const context = {
      "Values read": injection.valuesRead,
      "Placed (any cell)": injection.placed.length,
      "Not placed": injection.unplaced.length,
      Conflicts: injection.conflicts.length,
    };

    const runDir = dirname(CASE!);
    writeFileSync(join(runDir, "score.md"), formatEsgPackScore(score, context));
    writeFileSync(
      join(runDir, "score.json"),
      JSON.stringify({ ...score, ...context, conflicts: injection.conflicts }, null, 2),
    );
    // Everything the run would write, and everything it would not and why —
    // what to read when a score moves.
    writeFileSync(
      join(runDir, "placement.json"),
      JSON.stringify({ patches: injection.patches, unplaced: injection.unplaced }, null, 2),
    );

    const baselinePath = join(dirname(KEY!), "baseline.json");
    if (!existsSync(baselinePath) || process.env.UPDATE_BASELINE === "1") {
      writeFileSync(
        baselinePath,
        JSON.stringify({ correct: score.correct, expected: score.expected, values: score.values, at: new Date().toISOString() }, null, 2),
      );
      expect(score.expected).toBeGreaterThan(0);
      return;
    }
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as {
      correct: number;
      expected: number;
      values?: { correct: number; expected: number };
    };
    expect(
      score.values.correct,
      `values placed correctly ${score.values.correct}/${score.values.expected}; the baseline was ${baseline.values?.correct ?? 0}`,
    ).toBeGreaterThanOrEqual(baseline.values?.correct ?? 0);
    expect(
      score.correct,
      `cells right ${score.correct}/${score.expected}; the baseline was ${baseline.correct}/${baseline.expected}`,
    ).toBeGreaterThanOrEqual(baseline.correct);
  });
});
