import { describe, expect, it } from "vitest";
import { applyPasteToCells } from "../esgGridPaste";

describe("applyPasteToCells", () => {
  it("preserves empty middle cells in fixed grid", () => {
    const refs = [["a", "b", "c"]];
    const next = applyPasteToCells({ a: "X", b: "Y", c: "Z" }, refs, [["1", "", "3"]], {
      row: 0,
      col: 0,
    });
    expect(next.a).toBe(1);
    expect(next.b).toBe("");
    expect(next.c).toBe(3);
  });
});
