import { describe, expect, it } from "vitest";
import { answerBbbeeQuestion } from "../bbbeeKnowledge";

describe("B-BBEE ontology knowledge retrieval", () => {
  it("answers scorecard classification questions from business rules", () => {
    const result = answerBbbeeQuestion("What determines whether a company is an EME, QSE or Generic?");
    expect(result.matched).toBe(true);
    expect(result.answer).toContain("R10M");
    expect(result.sources.some((source) => source.id === "entities.Company.properties.applicableScorecard")).toBe(true);
  });

  it("retrieves the SED target", () => {
    const result = answerBbbeeQuestion("What is the SED target?");
    expect(result.answer).toContain("1% of Net Profit After Tax");
    expect(result.sources[0].id).toBe("businessRules.sed");
  });

  it("does not invent an answer for unknown topics", () => {
    const result = answerBbbeeQuestion("quantum spaceship propulsion");
    expect(result.matched).toBe(false);
    expect(result.sources).toEqual([]);
  });
});
