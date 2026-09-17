/**
 * The resolver's one pure decision: admit an option only if it is on the
 * menu, treat an invented one as none, keep a considered null as null.
 */
import { describe, expect, it } from "vitest";
import { decideFromReply, decisionKey } from "../vocabularyRoutes";

const items = [
  { column: "designation", value: "Fleet Controller", options: ["Senior Manager", "Middle Manager", "Junior Manager", "Semi-skilled", "Unskilled"] },
  { column: "categoryCode", value: "Learnership (registered)", options: ["A", "B", "C", "D", "E", "F", "G"] },
];

describe("decideFromReply — the model chooses from the menu, or nothing", { timeout: 30_000 }, () => {
  it("admits options verbatim (case-insensitively) and keeps their confidence", () => {
    const d = decideFromReply('{"decisions":[{"i":0,"option":"junior manager","confidence":0.92},{"i":1,"option":"C","confidence":0.95}]}', items);
    expect(d.get(0)).toEqual({ option: "Junior Manager", confidence: 0.92 });
    expect(d.get(1)).toEqual({ option: "C", confidence: 0.95 });
  });

  it("treats an invented option as none, and null as a considered none", () => {
    const d = decideFromReply('{"decisions":[{"i":0,"option":"Fleet Manager","confidence":0.99},{"i":1,"option":null,"confidence":0.7}]}', items);
    expect(d.get(0)).toEqual({ option: null, confidence: 0 });
    expect(d.get(1)).toEqual({ option: null, confidence: 0.7 });
  });

  it("survives an unusable reply as no decisions", () => {
    expect(decideFromReply("I cannot help with that", items).size).toBe(0);
    expect(decideFromReply("{not json", items).size).toBe(0);
  });

  it("keys a decision by column, normalised wording and the option set", () => {
    const a = decisionKey(items[0]);
    const b = decisionKey({ ...items[0], value: "FLEET  controller" });
    const c = decisionKey({ ...items[0], options: [...items[0].options, "Executive Director"] });
    expect(a).toBe(b); // same wording, differently written
    expect(a).not.toBe(c); // a different menu is a different question
  });
});
