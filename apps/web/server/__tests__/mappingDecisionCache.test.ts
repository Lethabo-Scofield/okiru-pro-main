/**
 * The mapping decision cache exists for ONE reason: the same workbook must map
 * the same way twice. Everything here tests that, or tests that a cache problem
 * degrades to "ask again" rather than to a failed import.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  rememberDecision,
  columnQuestionFingerprint,
  decisionFingerprint,
  resetMappingCacheForTest,
  EmptyModelReplyError,
  suggestValueFingerprint,
  excelImportNormalizeFingerprint,
} from "../mappingDecisionCache";

beforeEach(() => {
  resetMappingCacheForTest();
  delete process.env.MAPPING_DECISION_CACHE;
});

describe("a decision is made once and replayed", () => {
  it("does not re-ask for the same fingerprint", async () => {
    let asked = 0;
    const compute = async () => {
      asked += 1;
      return { spend: "totalCost" };
    };

    const first = await rememberDecision("t", "fp-1", compute);
    const second = await rememberDecision("t", "fp-1", compute);

    expect(asked).toBe(1);
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.value).toEqual(first.value);
  });

  it("remembers a considered 'nothing maps' — re-rolling a non-answer IS the drift", async () => {
    let asked = 0;
    const compute = async () => {
      asked += 1;
      return null;
    };
    await rememberDecision("t", "fp-empty", compute);
    const replayed = await rememberDecision("t", "fp-empty", compute);
    expect(asked).toBe(1);
    expect(replayed.replayed).toBe(true);
    expect(replayed.value).toBeNull();
  });

  it("keeps different questions apart", async () => {
    await rememberDecision("t", "fp-a", async () => "A");
    const b = await rememberDecision("t", "fp-b", async () => "B");
    expect(b.value).toBe("B");
    expect(b.replayed).toBe(false);
  });

  it("keeps namespaces apart", async () => {
    await rememberDecision("one", "same-fp", async () => "first");
    const other = await rememberDecision("two", "same-fp", async () => "second");
    expect(other.value).toBe("second");
  });
});

describe("a transient failure is never frozen", () => {
  it("propagates a throw without caching it", async () => {
    await expect(
      rememberDecision("t", "fp-throw", async () => {
        throw new Error("429 rate limited");
      }),
    ).rejects.toThrow("429");

    // A 429 must not become "this template has no mapping" for thirty days.
    const retry = await rememberDecision("t", "fp-throw", async () => "recovered");
    expect(retry.value).toBe("recovered");
    expect(retry.replayed).toBe(false);
  });

  it("does not freeze an EMPTY reply — that is a hiccup, not a verdict", async () => {
    // The distinction the routes depend on: `null` is a considered "nothing
    // maps" and IS cached; an empty response is a blank and must not be.
    await expect(
      rememberDecision("t", "fp-empty-reply", async () => {
        throw new EmptyModelReplyError();
      }),
    ).rejects.toBeInstanceOf(EmptyModelReplyError);

    const retry = await rememberDecision("t", "fp-empty-reply", async () => "Senior Manager");
    expect(retry.value).toBe("Senior Manager");
    expect(retry.replayed).toBe(false);
  });
});

/**
 * The two value-normalisation routes build their own fingerprints. The mistake
 * that would matter is omitting part of the question — leave `rawValue` out of
 * `suggest-value` and every value typed into a field replays the first one's
 * answer, which is far worse than the drift the cache was added to stop.
 */
describe("the value-normalisation routes fingerprint the whole question", () => {
  // The routes call these exact functions — the key cannot be built two ways.
  const suggestValueFp = (o: {
    fieldKey?: string;
    fieldType?: string;
    allowed?: string[];
    rule?: string;
    rawValue: string;
  }) =>
    suggestValueFingerprint({
      fieldKey: o.fieldKey ?? "designation",
      fieldLabel: o.fieldKey ?? "designation",
      fieldType: o.fieldType ?? "select",
      allowedValues: o.allowed ?? ["Senior Manager", "Middle Manager"],
      validationMessage: o.rule ?? "",
      dateFormat: "",
      rawValue: o.rawValue,
    });

  it("gives a DIFFERENT answer slot to a different typed value", () => {
    // The bug this guards: "Snr Mgr" and "Mid Mgr" sharing one cached answer.
    expect(suggestValueFp({ rawValue: "Snr Mgr" })).not.toBe(
      suggestValueFp({ rawValue: "Mid Mgr" }),
    );
  });

  it("replays the same typed value in the same field", () => {
    expect(suggestValueFp({ rawValue: "Snr Mgr" })).toBe(suggestValueFp({ rawValue: "Snr Mgr" }));
  });

  it("re-asks when the field's allowed values change", () => {
    // Otherwise a replayed suggestion could name an option the field dropped.
    expect(suggestValueFp({ rawValue: "Snr Mgr" })).not.toBe(
      suggestValueFp({ rawValue: "Snr Mgr", allowed: ["Senior Manager"] }),
    );
  });

  it("re-asks when the same string is typed into a different field", () => {
    expect(suggestValueFp({ rawValue: "1" })).not.toBe(
      suggestValueFp({ rawValue: "1", fieldKey: "bbbeeLevel" }),
    );
  });

  it("re-asks when the validation rule changes", () => {
    expect(suggestValueFp({ rawValue: "Snr Mgr" })).not.toBe(
      suggestValueFp({ rawValue: "Snr Mgr", rule: "Must be an occupational level" }),
    );
  });

  const importFp = (o: { sector?: string; type?: string; sectors?: string }) =>
    excelImportNormalizeFingerprint({
      sector: o.sector ?? "Road Freight",
      scorecardType: o.type,
      allowedSectors: o.sectors ?? "TRANSPORT, CONSTRUCTION, ICT",
      allowedTypes: "Generic, QSE, Contractor, BEP",
    });

  it("replays the same sector string", () => {
    expect(importFp({})).toBe(importFp({}));
  });

  it("re-asks for a different sector string", () => {
    expect(importFp({})).not.toBe(importFp({ sector: "Freight Handling" }));
  });

  it("re-asks when a sector is added to the enum", () => {
    // A replayed answer must never be chosen from a menu that has since changed.
    expect(importFp({})).not.toBe(
      importFp({ sectors: "TRANSPORT, CONSTRUCTION, ICT, MAC" }),
    );
  });
});

describe("the cache can be turned off", () => {
  it("asks every time when disabled", async () => {
    process.env.MAPPING_DECISION_CACHE = "false";
    let asked = 0;
    const compute = async () => {
      asked += 1;
      return "x";
    };
    await rememberDecision("t", "fp", compute);
    await rememberDecision("t", "fp", compute);
    expect(asked).toBe(2);
  });
});

describe("the fingerprint identifies a TEMPLATE, not a file", () => {
  it("ignores column order — order is a property of an export", () => {
    const a = columnQuestionFingerprint(["Supplier", "Spend", "Level"], ["supplierName", "spend"]);
    const b = columnQuestionFingerprint(["Level", "Spend", "Supplier"], ["spend", "supplierName"]);
    expect(a).toBe(b);
  });

  it("ignores case and surrounding whitespace", () => {
    const a = columnQuestionFingerprint(["Total Cost (R)"], ["totalCost"]);
    const b = columnQuestionFingerprint(["  total cost (r) "], ["totalCost"]);
    expect(a).toBe(b);
  });

  it("changes when the columns genuinely differ", () => {
    const a = columnQuestionFingerprint(["Supplier"], ["supplierName"]);
    const b = columnQuestionFingerprint(["Supplier", "Beneficiary"], ["supplierName"]);
    expect(a).not.toBe(b);
  });

  it("changes when the fields on offer differ", () => {
    const a = columnQuestionFingerprint(["Level"], ["bbbeeLevel"]);
    const b = columnQuestionFingerprint(["Level"], ["bbbeeLevel", "occupationalLevel"]);
    expect(a).not.toBe(b);
  });

  it("is stable across runs for the same input", () => {
    const once = decisionFingerprint(["a", "b", 1]);
    for (let i = 0; i < 10; i++) expect(decisionFingerprint(["a", "b", 1])).toBe(once);
  });
});
