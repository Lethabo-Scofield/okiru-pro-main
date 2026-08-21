/**
 * SG Consumer v1.7 — the two baselines.
 *
 * 1. **Workbook parity ("as-was")** — the client's spreadsheet reproduced
 *    verbatim, defects included. This is the audit trail: it proves we can still
 *    land on the numbers the client signed off (E 36 / S 33 / G 64.8529411765 /
 *    overall 0.4461764706). It is NOT what the app ships.
 *
 * 2. **Corrected baseline (the live gate)** — what `computeEsgScorecard`
 *    actually returns. Two indicators move, both of them unearned points that
 *    the workbook handed out for free:
 *      · `S d18` "Zero fatalities"        8 → 0  (blank ≠ zero fatalities)
 *      · `G d25` "No material penalties"  5 → 0  (`G_Data!B25` does not exist)
 *
 * Full reasoning and evidence: `docs/esg/ESG_SCORING_DELTA.md`.
 */
import { describe, expect, it } from "vitest";
import { deriveEsgSummaryCells } from "@/lib/esg/esgDeriveSummary";
import { ESG_GOLDEN_SG_CONSUMER, esgOverallPercent } from "@/lib/esgScoringDefaults";
import { buildSgConsumerGoldenWorkbook } from "../../fixtures/esg-consumer-golden";
import { scoreEnvironmental } from "../environmental";
import { scoreGovernance } from "../governance";
import { scoreSocial } from "../social";
import { computeEsgScorecard } from "../index";

const KING5_D5 = 135 / 170 * 25; // 19.8529411765 — G_Scorecard!C5

describe("AS-WAS — workbook parity fixture (audit reference, NOT the live calculation)", () => {
  const workbook = deriveEsgSummaryCells(buildSgConsumerGoldenWorkbook());
  const opts = { mode: "workbook-parity" } as const;
  const e = scoreEnvironmental(workbook, opts);
  const s = scoreSocial(workbook, opts);
  const g = scoreGovernance(workbook, opts);

  it("reproduces E_Scorecard!D30 = 36", () => {
    expect(e.score).toBeCloseTo(ESG_GOLDEN_SG_CONSUMER.environmentalPoints, 6);
    expect(e.max).toBe(108);
  });

  it("reproduces S_Scorecard!D28 = 33", () => {
    expect(s.score).toBeCloseTo(ESG_GOLDEN_SG_CONSUMER.socialPoints, 6);
    expect(s.max).toBe(100);
  });

  it("reproduces G_Scorecard!D26 = 64.8529411765", () => {
    expect(g.score).toBeCloseTo(ESG_GOLDEN_SG_CONSUMER.governancePoints, 6);
    expect(g.max).toBe(100);
  });

  it("reproduces ESG_Dashboard!D9 = 0.4461764706", () => {
    expect(esgOverallPercent(e.score, s.score, g.score)).toBeCloseTo(
      ESG_GOLDEN_SG_CONSUMER.overallPercent,
      8,
    );
  });

  it("carries the three workbook defects that parity mode exists to preserve", () => {
    // E d7 reads E_Data!M80/M81, cells that do not exist → 0 forever.
    expect(e.rows.d7).toBe(0);
    // S d18 awards 8 points for a hand-typed em-dash.
    expect(s.rows.d18).toBe(8);
    // G d25 awards 5 points because G_Data has no row 25 at all.
    expect(g.rows.d25).toBe(5);
  });

  it("matches the ledger's Part 4.2–4.4 per-indicator D column", () => {
    expect(e.rows).toEqual({
      d5: 5, d6: 0, d7: 0, d8: 5, d9: 5, d11: 5, d12: 0, d13: 0, d15: 0, d16: 0,
      d17: 0, d19: 5, d20: 4, d21: 3, d23: 4, d24: 0, d26: 0, d27: 0, d28: 0, d29: 0,
    });
    expect(s.rows).toEqual({
      d5: 0, d6: 0, d7: 5, d8: 0, d9: 3, d10: 3, d12: 0, d13: 0, d14: 0, d15: 0,
      d17: 0, d18: 8, d19: 5, d20: 4, d22: 0, d23: 5, d24: 0, d26: 0, d27: 0,
    });
    expect(g.rows.d5).toBeCloseTo(KING5_D5, 9);
    expect({ ...g.rows, d5: 0 }).toEqual({
      d5: 0, d6: 5, d7: 0, d9: 0, d10: 2.5, d12: 8, d14: 5, d16: 2.5, d17: 2.5,
      d19: 8, d20: 0, d22: 4, d24: 2.5, d25: 5,
    });
  });
});

describe("LIVE — corrected baseline (the regression gate)", () => {
  const result = computeEsgScorecard(buildSgConsumerGoldenWorkbook())!;

  it("E pillar is unchanged at 36/108 — no E indicator moved on this dataset", () => {
    expect(result.environmental.score).toBeCloseTo(36, 6);
    expect(result.environmental.max).toBe(108);
  });

  it("S pillar drops 33 → 25 (fatalities attestation required)", () => {
    expect(result.social.score).toBeCloseTo(25, 6);
    expect(result.socialRows.d18).toBe(0);
  });

  it("G pillar drops 64.8529411765 → 59.8529411765 (penalties assertion required)", () => {
    expect(result.governance.score).toBeCloseTo(59.8529411765, 6);
    expect(result.governanceRows.d25).toBe(0);
  });

  it("overall drops 0.4461764706 → 0.4028431373", () => {
    expect(result.overallPercent).toBeCloseTo(0.4028431373, 8);
  });

  it("asserts every indicator individually", () => {
    expect(result.environmentalRows).toEqual({
      d5: 5, d6: 0, d7: 0, d8: 5, d9: 5, d11: 5, d12: 0, d13: 0, d15: 0, d16: 0,
      d17: 0, d19: 5, d20: 4, d21: 3, d23: 4, d24: 0, d26: 0, d27: 0, d28: 0, d29: 0,
    });
    expect(result.socialRows).toEqual({
      d5: 0, d6: 0, d7: 5, d8: 0, d9: 3, d10: 3, d12: 0, d13: 0, d14: 0, d15: 0,
      d17: 0, d18: 0, d19: 5, d20: 4, d22: 0, d23: 5, d24: 0, d26: 0, d27: 0,
    });
    expect(result.governanceRows.d5).toBeCloseTo(KING5_D5, 9);
    expect({ ...result.governanceRows, d5: 0 }).toEqual({
      d5: 0, d6: 5, d7: 0, d9: 0, d10: 2.5, d12: 8, d14: 5, d16: 2.5, d17: 2.5,
      d19: 8, d20: 0, d22: 4, d24: 2.5, d25: 0,
    });
  });

  it("the corrected calculation differs from parity on exactly two indicators here", () => {
    const workbook = deriveEsgSummaryCells(buildSgConsumerGoldenWorkbook());
    const parity = {
      e: scoreEnvironmental(workbook, { mode: "workbook-parity" }).rows,
      s: scoreSocial(workbook, { mode: "workbook-parity" }).rows,
      g: scoreGovernance(workbook, { mode: "workbook-parity" }).rows,
    };
    const moved: string[] = [];
    for (const [pillar, rows] of [
      ["E", result.environmentalRows] as const,
      ["S", result.socialRows] as const,
      ["G", result.governanceRows] as const,
    ]) {
      const before = parity[pillar.toLowerCase() as "e" | "s" | "g"];
      for (const key of Object.keys(rows)) {
        if (Math.abs(rows[key] - before[key]) > 1e-9) moved.push(`${pillar} ${key}`);
      }
    }
    expect(moved.sort()).toEqual(["G d25", "S d18"]);
  });
});
