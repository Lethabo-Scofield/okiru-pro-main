/**
 * E2 — every row explains itself, and the explanation is the calculation.
 *
 * Three promises: recording a trace changes no score; every row the scorecard
 * has, the trace covers; and a banded row's points follow from ITS OWN trace —
 * the measured value and the target it shows really are the ones that scored.
 */
import { describe, expect, it } from "vitest";
import golden from "../../fixtures/esg-consumer-golden.generated.json";
import { deriveEsgSummaryCells } from "@/lib/esg/esgDeriveSummary";
import { SCORECARD_INDICATORS } from "@/lib/esg/esgScorecardDefinitions";
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { scoreEnvironmental } from "../environmental";
import { scoreSocial } from "../social";
import { scoreGovernance } from "../governance";
import { computeEsgScorecard } from "..";
import { EsgTraceRecorder } from "../esgTrace";
import { pr } from "../shared";

/** The golden fixture stores each section as its bare cell map; the app wraps it in `{ cells }`. */
function goldenWorkbook(assumptions: Record<string, unknown> = {}): EsgWorkbookData {
  const raw = JSON.parse(JSON.stringify(golden)) as Record<string, Record<string, unknown>>;
  const sections = Object.fromEntries(Object.entries(raw).map(([id, cells]) => [id, { cells }]));
  sections.assumptions = { cells: { ...(raw.assumptions ?? {}), ...assumptions } };
  return deriveEsgSummaryCells({ companyId: "golden", sections, updatedAt: "2026-10-07" } as unknown as EsgWorkbookData);
}

const OWN = "Company's own targets";
const BBBEE = "B-BBEE / Employment Equity targets";
const SCORERS = { environmental: scoreEnvironmental, social: scoreSocial, governance: scoreGovernance } as const;
const WORKBOOKS: Array<[string, EsgWorkbookData]> = [
  ["golden, no basis declared", goldenWorkbook()],
  ["golden, own targets", goldenWorkbook({ _targetBasis: OWN })],
  ["golden, B-BBEE targets", goldenWorkbook({ _targetBasis: BBBEE })],
  ["empty", deriveEsgSummaryCells({ companyId: "e", sections: {}, updatedAt: "" } as unknown as EsgWorkbookData)],
];

describe("recording a trace changes no score", () => {
  for (const [name, wb] of WORKBOOKS) {
    for (const mode of ["corrected", "workbook-parity"] as const) {
      it(`${name}, ${mode}`, () => {
        for (const score of Object.values(SCORERS)) {
          const plain = score(wb, { mode });
          const traced = score(wb, { mode, trace: new EsgTraceRecorder() });
          expect(traced.rows).toEqual(plain.rows);
          expect(traced.score).toBe(plain.score);
          expect(traced.scoringDenominator).toBe(plain.scoringDenominator);
          expect(traced.excluded).toEqual(plain.excluded);
        }
      });
    }
  }
});

describe("every row has its trace", () => {
  it("covers every indicator of every pillar, with a rule in words", () => {
    const result = computeEsgScorecard(goldenWorkbook({ _targetBasis: OWN }))!;
    for (const pillar of ["environmental", "social", "governance"] as const) {
      const traces = result.traces[pillar];
      for (const def of SCORECARD_INDICATORS[pillar]) {
        const t = traces[def.key];
        expect(t, `${pillar} ${def.key}`).toBeTruthy();
        expect(t!.rule.length, `${pillar} ${def.key} rule`).toBeGreaterThan(20);
        for (const input of t!.inputs) expect(input.ref, `${pillar} ${def.key}`).toMatch(/\S/);
      }
    }
  });
});

describe("a banded row's points follow from its own trace", () => {
  const BANDED: Record<"environmental" | "social", string[]> = {
    environmental: ["d6", "d7", "d12", "d13", "d17", "d19"],
    social: ["d5", "d6", "d8", "d14", "d22", "d24"],
  };

  for (const [name, wb] of WORKBOOKS.slice(0, 3)) {
    it(name, () => {
      const floor = Number(wb.sections?.assumptions?.cells?.B9 ?? 0.5);
      let compared = 0;
      for (const pillar of ["environmental", "social"] as const) {
        const recorder = new EsgTraceRecorder();
        const result = SCORERS[pillar](wb, { trace: recorder });
        for (const key of BANDED[pillar]) {
          const t = recorder.traces[key]!;
          const excluded = result.excluded.some((x) => x.key === key);
          const points = result.rows[key as keyof typeof result.rows] as number;
          if (excluded || t.measured == null || t.target == null) continue;
          const max = SCORECARD_INDICATORS[pillar].find((d) => d.key === key)!.maxPoints;
          const recomputed = pr(Number(t.measured.value), Number(t.target.value), max, floor);
          expect(recomputed, `${pillar} ${key}`).toBeCloseTo(points, 6);
          compared++;
        }
      }
      // Not vacuous: rows really were rebuilt from their traces.
      if (name !== "golden, no basis declared") expect(compared).toBeGreaterThanOrEqual(3);
    });
  }
});

describe("a trace says where its target came from", () => {
  it("the company's own, an elected B-BBEE target as stated, or the code's figure", () => {
    const own = computeEsgScorecard(goldenWorkbook({ _targetBasis: OWN }))!;
    expect(own.traces.environmental.d19?.target?.source).toContain("company's own target (Assumptions!B48)");

    const bbbee = computeEsgScorecard(goldenWorkbook({ _targetBasis: BBBEE }))!;
    expect(bbbee.traces.social.d5?.target?.source).toMatch(/elected, as it stated it|code's figure/);
    // E under a B-BBEE election is the company's own: B-BBEE sets no E targets.
    expect(bbbee.traces.environmental.d19?.target?.source).toContain("company's own target");

    // No row is banded against a number nobody set: community initiatives, the
    // last one, waits for the company's own figure.
    expect(own.traces.social.d23?.target).toBeNull();
    expect(own.excluded.social.find((x) => x.key === "d23")?.reason).toMatch(/has not set one for community initiatives/);
  });

  it("shows the measured value, not the points, as the row's actual", () => {
    const result = computeEsgScorecard(goldenWorkbook({ _targetBasis: OWN }))!;
    const diversion = result.traces.environmental.d19!;
    expect(diversion.measured?.unit).toBe("ratio");
    expect(diversion.measured?.value).toBe(Number(goldenWorkbook().sections?.waste?.cells?.B16));
  });
});
