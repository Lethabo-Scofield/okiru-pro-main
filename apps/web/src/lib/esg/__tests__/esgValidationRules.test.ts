import { describe, expect, it } from "vitest";
import { buildSgConsumerGoldenWorkbook } from "../../../../EsgToolkit/src/lib/fixtures/esg-consumer-golden";
import { evaluateEsgRules } from "../esgValidationRules";

describe("evaluateEsgRules", () => {
  it("does not fail untouched rules in live mode", () => {
    const wb = buildSgConsumerGoldenWorkbook();
    const results = evaluateEsgRules(wb, {}, "live");
    const pending = results.filter((r) => r.pending);
    expect(pending.length).toBeGreaterThan(0);
    const failedLive = results.filter((r) => !r.pass && !r.pending);
    expect(failedLive.length).toBe(0);
  });

  it("reports King5 blocker on submit", () => {
    const wb = buildSgConsumerGoldenWorkbook();
    const king5 = evaluateEsgRules(wb, {}, "submit").find((r) => r.id === "king5-principles");
    expect(king5?.pass).toBe(false);
    expect(king5?.severity).toBe("error");
  });
});
