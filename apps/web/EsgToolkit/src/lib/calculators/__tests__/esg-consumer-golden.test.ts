import { describe, expect, it } from "vitest";
import { ESG_GOLDEN_SG_CONSUMER } from "@/lib/esgScoringDefaults";
import { buildSgConsumerGoldenWorkbook } from "../../fixtures/esg-consumer-golden";
import { computeEsgScorecard } from "../index";

describe("ESG Consumer Goods — golden snapshot (v1.7)", () => {
  const workbook = buildSgConsumerGoldenWorkbook();
  const result = computeEsgScorecard(workbook)!;

  it("E pillar scores 36/108", () => {
    expect(result.environmental.score).toBeCloseTo(ESG_GOLDEN_SG_CONSUMER.environmentalPoints, 1);
    expect(result.environmental.max).toBe(108);
  });

  it("S pillar scores 33/100", () => {
    expect(result.social.score).toBeCloseTo(ESG_GOLDEN_SG_CONSUMER.socialPoints, 1);
    expect(result.social.max).toBe(100);
  });

  it("G pillar ≈ 64.85/100", () => {
    expect(result.governance.score).toBeCloseTo(ESG_GOLDEN_SG_CONSUMER.governancePoints, 2);
  });

  it("overall ESG is 44.6176% (workbook D9)", () => {
    expect(result.overallPercent).toBeCloseTo(ESG_GOLDEN_SG_CONSUMER.overallPercent, 4);
  });
});
