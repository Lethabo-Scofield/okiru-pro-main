import { describe, expect, it } from "vitest";
import { answerEsgQuestion } from "../esgKnowledge";

describe("ESG grounded knowledge", () => {
  it("answers materiality questions from the ESG ontology", () => {
    const result = answerEsgQuestion("What is double materiality?");
    expect(result.matched).toBe(true);
    expect(result.answer).toContain("outside-in and inside-out");
    expect(result.sources.some((source) => source.id === "materiality.double")).toBe(true);
  });

  it("adds the current ESG scorecard context", () => {
    const result = answerEsgQuestion("Which pillar is weakest?", {
      companyName: "E2E Company",
      scorecard: {
        overallPercent: 0.61,
        environmental: { score: 40, max: 108, percent: 40 / 108 },
        social: { score: 82, max: 100, percent: 0.82 },
        governance: { score: 70, max: 100, percent: 0.7 },
      },
    });
    expect(result.answer).toContain("overall ESG 61.0%");
    expect(result.answer).toContain("Lowest-performing pillar: environmental");
    expect(result.answer).not.toContain("Candidate metrics");
    expect(result.sources[0].id).toBe("current-esg-scorecard");
  });

  it("flags time-sensitive framework guidance", () => {
    const result = answerEsgQuestion("Does CSRD apply to a non-EU company?");
    expect(result.warnings.join(" ")).toMatch(/time-sensitive/);
  });
});
