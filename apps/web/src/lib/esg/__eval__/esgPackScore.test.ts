/**
 * The answer-key scorer itself — synthetic cells, no pack needed.
 */
import { describe, expect, it } from "vitest";
import { formatEsgPackScore, matchesExpected, scoreEsgPlacement, type EsgExpectedCell } from "./esgPackScore";

const key: EsgExpectedCell[] = [
  { section: "e-data", cell: "s1a_K14", value: 5922, label: "BLOEM fleet diesel, Mar-26" },
  { section: "e-data", cell: "s2_C14", value: 20495, label: "BLOEM electricity, Jul-25" },
  { section: "e-data", cell: "water_C15", value: 0, absentOk: true, label: "CPT water, Jul-25" },
  // A trap: a careless reading puts road diesel here.
  { section: "e-data", cell: "s1b_K14", value: 0, absentOk: true, label: "BLOEM generator diesel, Mar-26 (trap)" },
];

describe("scoreEsgPlacement", () => {
  it("credits right values, lists wrong before missing, and counts cells outside the key", () => {
    const score = scoreEsgPlacement(
      { "e-data": { cells: { s1a_K14: 5922.2, s1b_K14: 597, s2_D14: 1 } } },
      key,
    );
    expect(score.correct).toBe(2); // the diesel figure (within tolerance) and the empty water cell
    expect(score.values).toEqual({ expected: 2, correct: 1 });
    expect(score.wrong.map((v) => v.cell)).toEqual(["s1b_K14"]); // the trap caught
    expect(score.missing.map((v) => v.cell)).toEqual(["s2_C14"]);
    expect(score.unscored).toBe(1);
  });

  it("does not let a run that writes nothing look good", () => {
    const score = scoreEsgPlacement({}, key);
    expect(score.values.correct).toBe(0);
    expect(formatEsgPackScore(score)).toMatch(/Values placed correctly: \*\*0 of 2\*\*/);
  });
});

describe("matchesExpected", () => {
  it("compares numbers with a small slack, text without case, and booleans exactly", () => {
    expect(matchesExpected("5,922", { section: "x", cell: "y", value: 5922, label: "" })).toBe(true);
    expect(matchesExpected(5930, { section: "x", cell: "y", value: 5922, label: "" })).toBe(false);
    expect(matchesExpected(" yes ", { section: "x", cell: "y", value: "Yes", label: "" })).toBe(true);
    expect(matchesExpected("true", { section: "x", cell: "y", value: true, label: "" })).toBe(false);
  });
});
