/**
 * The column-name matching contract.
 *
 * Three defects are pinned here, all of the same family: the matcher resolved
 * something it did not actually know, and said nothing about it.
 *
 *   1. A column that lost its first choice was DISCARDED rather than offered
 *      its second — and an unmapped column scores zero, silently.
 *   2. A tie was broken by whichever field happened to be declared first, at
 *      confidence 1.00, so nothing downstream could tell it apart from a real
 *      match.
 *   3. A two-letter alias matched a run of letters inside an unrelated word.
 */
import { describe, it, expect } from "vitest";
import {
  buildFieldMapping,
  matchHeaderToField,
  aliasSimilarity,
  headerSimilarity,
  AMBIGUITY_MARGIN,
  FUZZY_ACCEPT,
  type TargetField,
} from "../columnMatch";

const field = (key: string, label: string, aliases?: string[]): TargetField => ({
  key,
  label,
  aliases,
});

describe("a column that loses its first choice gets its second", () => {
  /**
   * Both headers score 1.00 for `supplierName` ("beneficiary" and "supplier"
   * are both its synonyms). One of them must move.
   */
  const FIELDS = [field("supplierName", "Supplier Name"), field("beneficiaryName", "Beneficiary Name")];

  it("maps BOTH columns rather than discarding one", () => {
    const mapping = buildFieldMapping(["Beneficiary", "Supplier"], FIELDS);
    const keys = mapping.map((m) => m.targetKey);
    expect(keys).not.toContain(null);
    expect(new Set(keys)).toEqual(new Set(["supplierName", "beneficiaryName"]));
  });

  it("asks the incumbent to move rather than dropping the newcomer", () => {
    const mapping = buildFieldMapping(["Beneficiary", "Supplier"], FIELDS);
    const byHeader = Object.fromEntries(mapping.map((m) => [m.sourceHeader, m.targetKey]));
    // "Supplier" can ONLY be supplierName, so "Beneficiary" is the one that moves.
    expect(byHeader.Supplier).toBe("supplierName");
    expect(byHeader.Beneficiary).toBe("beneficiaryName");
  });

  it("still leaves a column unmapped when it genuinely matches nothing", () => {
    const mapping = buildFieldMapping(["Supplier", "Zzzz Qqqq"], FIELDS);
    expect(mapping[1].targetKey).toBeNull();
    expect(mapping[1].method).toBe("unmapped");
  });

  it("never assigns one field to two columns", () => {
    const mapping = buildFieldMapping(
      ["Supplier", "Supplier Name", "Vendor", "Vendor Name"],
      FIELDS,
    );
    const claimed = mapping.map((m) => m.targetKey).filter(Boolean);
    expect(claimed.length).toBe(new Set(claimed).size);
  });
});

describe("a tie is reported, not silently broken", () => {
  /** "Level" is a synonym of BOTH. On a supplier schedule it means one; on an
   *  employee register the other. The name alone cannot say. */
  const FIELDS = [
    field("bbbeeLevel", "B-BBEE Level"),
    field("occupationalLevel", "Occupational Level"),
  ];

  it("flags the pick as ambiguous", () => {
    const match = matchHeaderToField("Level", FIELDS);
    expect(match).not.toBeNull();
    expect(match!.ambiguous).toBe(true);
  });

  it("names what else it could have been", () => {
    const match = matchHeaderToField("Level", FIELDS)!;
    const all = [match.targetKey, ...match.alternatives.map((a) => a.targetKey)];
    expect(new Set(all)).toEqual(new Set(["bbbeeLevel", "occupationalLevel"]));
  });

  it("carries the flag through to the built mapping", () => {
    const mapping = buildFieldMapping(["Level"], FIELDS);
    expect(mapping[0].ambiguous).toBe(true);
    expect(mapping[0].alternatives?.length).toBeGreaterThan(0);
  });

  it("does NOT flag a header that clearly names one of them", () => {
    const match = matchHeaderToField("Occupational Level", FIELDS)!;
    expect(match.targetKey).toBe("occupationalLevel");
    expect(match.ambiguous).toBe(false);
    expect(match.alternatives).toEqual([]);
  });

  it("keeps confidence honest — ambiguity is reported alongside, not deflated", () => {
    // looksLikeHeaderRow gates header DETECTION on confidence; a row of
    // ambiguous headers is still a header row.
    const match = matchHeaderToField("Level", FIELDS)!;
    expect(match.confidence).toBe(1);
  });

  it("only counts a runner-up inside the margin", () => {
    const FAR = [field("supplierName", "Supplier Name"), field("spend", "Spend")];
    const match = matchHeaderToField("Supplier Name", FAR)!;
    expect(match.targetKey).toBe("supplierName");
    const runnerUp = match.alternatives[0];
    if (runnerUp) {
      expect(match.confidence - runnerUp.confidence).toBeLessThanOrEqual(AMBIGUITY_MARGIN);
    }
  });
});

describe("short aliases must match a whole word, not a run of letters", () => {
  const FIELDS = [
    field("currentBlackOwnership", "Black Ownership", ["bo"]),
    field("carbonTonnes", "Carbon Tonnes"),
  ];

  it("does not map a carbon column to black ownership via 'bo'", () => {
    // "carbon" contains the letters b-o. The old character-containment rule
    // scored that 0.717, over the 0.62 accept floor.
    expect(aliasSimilarity("Carbon", "bo")).toBeLessThan(FUZZY_ACCEPT);
    const mapping = buildFieldMapping(["Carbon"], FIELDS);
    expect(mapping[0].targetKey).not.toBe("currentBlackOwnership");
  });

  it("still matches a short alias when it IS the column name", () => {
    expect(aliasSimilarity("BO", "bo")).toBe(1);
    expect(aliasSimilarity("BO %", "bo")).toBe(1);
  });

  it("still matches a short alias standing as its own word", () => {
    // Whole-word containment is untouched — only letter-runs are rejected.
    expect(aliasSimilarity("Supplier BO", "bo")).toBeGreaterThanOrEqual(FUZZY_ACCEPT);
  });

  it("keeps long-alias containment working across concatenated headers", () => {
    // No separator to tokenise on, so this relies on character containment —
    // which stays allowed because "ownership" is long enough to be meant.
    expect(aliasSimilarity("BlackOwnership", "ownership")).toBeGreaterThanOrEqual(FUZZY_ACCEPT);
  });

  it("leaves cell-value matching alone — that is a different problem", () => {
    // selectOptionMatch uses headerSimilarity to suggest "Male" for "M".
    // Tightening column matching must not cost that.
    expect(headerSimilarity("M", "Male")).toBeGreaterThan(0.6);
    expect(aliasSimilarity("M", "Male")).toBeLessThan(FUZZY_ACCEPT);
  });
});

describe("the result is deterministic", () => {
  const FIELDS = [
    field("supplierName", "Supplier Name"),
    field("spend", "Spend"),
    field("bbbeeLevel", "B-BBEE Level"),
    field("beneficiaryName", "Beneficiary Name"),
  ];
  const HEADERS = ["Beneficiary", "Supplier", "Amount", "Level", "Unrelated Column"];

  it("gives the same mapping on every run", () => {
    const first = JSON.stringify(buildFieldMapping(HEADERS, FIELDS));
    for (let i = 0; i < 20; i++) {
      expect(JSON.stringify(buildFieldMapping(HEADERS, FIELDS))).toBe(first);
    }
  });

  it("returns one entry per header, in header order", () => {
    const mapping = buildFieldMapping(HEADERS, FIELDS);
    expect(mapping.map((m) => m.sourceHeader)).toEqual(HEADERS);
    expect(mapping.map((m) => m.sourceIndex)).toEqual([0, 1, 2, 3, 4]);
  });

  it("handles blank and duplicate headers without crashing", () => {
    const mapping = buildFieldMapping(["", "   ", "Supplier", "Supplier"], FIELDS);
    expect(mapping).toHaveLength(4);
    expect(mapping[0].targetKey).toBeNull();
    expect(mapping[1].targetKey).toBeNull();
    const claimed = mapping.map((m) => m.targetKey).filter(Boolean);
    expect(claimed.length).toBe(new Set(claimed).size);
  });

  it("handles no fields and no headers", () => {
    expect(buildFieldMapping([], [])).toEqual([]);
    expect(buildFieldMapping(["Supplier"], [])[0].targetKey).toBeNull();
  });
});

describe("a realistic supplier schedule still maps the way it always did", () => {
  const FIELDS = [
    field("supplierName", "Supplier Name"),
    field("spend", "Spend"),
    field("bbbeeLevel", "B-BBEE Level"),
    field("currentBlackOwnership", "Black Ownership"),
    field("currentSize", "Enterprise Size"),
  ];

  it("maps every column of a normal header row", () => {
    const mapping = buildFieldMapping(
      ["Supplier Name", "Total Spend", "B-BBEE Level", "Black Ownership %", "Enterprise Type"],
      FIELDS,
    );
    expect(mapping.map((m) => m.targetKey)).toEqual([
      "supplierName",
      "spend",
      "bbbeeLevel",
      "currentBlackOwnership",
      "currentSize",
    ]);
  });
});
