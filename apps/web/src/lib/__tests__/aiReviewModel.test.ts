/**
 * The model pass of the AI review: what it is shown, and the checks that
 * decide which of its answers become fills. The "model" here is a literal
 * reply — no model is called.
 */
import { describe, expect, it } from "vitest";
import type { WorkbookSectionsInput } from "@/components/workbook/workbookValidation";
import { buildAiReviewGrounding, parseAiReviewReply, unitOf, verifyAiReviewReply, type ContextCell, type ReviewGrounding, type ReviewTarget } from "../aiReviewModel";
import { getSection } from "@/components/workbook/sections";

const ID = ["800101", "5009", "087"].join("");

function workbook(): WorkbookSectionsInput {
  return {
    "company-information": { meta: { companyName: "Example Co", industrySector: "", scorecardType: "Generic" } },
    "financial-information": {
      meta: {
        _metaConflicts: [
          { column: "tmps", candidates: [{ value: 100, sources: ["a.pdf"] }, { value: 200, sources: ["b.pdf"] }] },
          { column: "revenue", candidates: [{ value: 5_000_000, sources: ["afs.pdf"] }, { value: 4_800_000, sources: ["mgmt-accounts.xlsx"] }] },
        ],
      },
    },
    sed: {
      rows: [
        { _id: "d1", beneficiaryName: "Hope Learners Trust", descriptionOfSpend: "Bursary for two matric learners", percentBenefitingBlack: 100, amount: 20000, _sourceFiles: ["sed-schedule.xlsx"] },
      ],
    },
    "management-control": {
      rows: [
        {
          _id: "m1", name: "Person", surname: "Three", idNumber: ID, race: "African", gender: "Female", designation: "Junior Manager",
          _conflicts: { designation: [{ value: "Junior Manager", sources: ["payroll.pdf"] }, { value: "Middle Manager", sources: ["ee-report.pdf"] }] },
        },
      ],
    },
    esd: {
      rows: [
        { _id: "e1", supplierName: "Sample Supplies", currentSize: "EME", contributionDescription: "Interest-free loan", contributionType: "Loan", amount: 500, _sourceFiles: ["esd.xlsx"] },
      ],
    },
    procurement: {
      rows: [
        { _id: "p1", supplierName: "Sample Supplies", currentSize: "EME", currentBlackOwnership: 80, spend: 1000, _sourceFiles: ["suppliers.xlsx"] },
      ],
    },
  };
}

const target = (g: ReturnType<typeof buildAiReviewGrounding>, section: string, column: string, rowId?: string) =>
  g.targets.find((t) => t.section === section && t.column === column && (rowId === undefined || t.rowId === rowId))!;
const ctx = (g: ReturnType<typeof buildAiReviewGrounding>, section: string, column: string) =>
  g.context.find((c) => c.section === section && c.column === column)!;

describe("buildAiReviewGrounding", () => {
  it("offers required blanks and disputed cells, never TMPS, the sector or an ID number", () => {
    const g = buildAiReviewGrounding(workbook());
    expect(target(g, "sed", "contributionType", "d1")).toBeDefined();
    expect(target(g, "management-control", "designation", "m1").candidates).toHaveLength(2);
    expect(target(g, "financial-information", "revenue")).toBeDefined();
    expect(g.targets.some((t) => t.column === "tmps")).toBe(false);
    expect(g.targets.some((t) => t.column === "industrySector")).toBe(false);
    expect(g.text).not.toContain(ID);
    expect(g.text).toContain("Bursary for two matric learners");
    expect(g.text).toMatch(/from: sed-schedule\.xlsx/);
  });

  it("leaves out cells the rules already fill", () => {
    // ESD row's black ownership is blank and procurement states it: a rule fill.
    const g = buildAiReviewGrounding(workbook());
    expect(g.targets.some((t) => t.section === "esd" && t.column === "currentBlackOwnership")).toBe(false);
  });

  it("opens only cells the caller can save", () => {
    const all = buildAiReviewGrounding(workbook());
    expect(all.targets.some((t) => t.section !== "sed")).toBe(true);
    const g = buildAiReviewGrounding(workbook(), undefined, { canWrite: (s) => s === "sed" });
    expect(g.targets.length).toBeGreaterThan(0);
    expect(g.targets.every((t) => t.section === "sed")).toBe(true);
    expect(g.text).toContain("Bursary for two matric learners");
  });

  it("caps the open cells per review and says how many wait", () => {
    const g = buildAiReviewGrounding(workbook(), 1);
    expect(g.targets).toHaveLength(1);
    expect(g.truncated).toBeGreaterThan(0);
  });
});

describe("verifyAiReviewReply", () => {
  it("accepts a classification whose quoted words are in a cited cell, labelled derived", () => {
    const sections = workbook();
    const g = buildAiReviewGrounding(sections);
    const t = target(g, "sed", "contributionType", "d1");
    const desc = ctx(g, "sed", "descriptionOfSpend");
    const option = t.options!.find((o) => /grant|bursar/i.test(o)) ?? t.options![0];
    const out = verifyAiReviewReply(sections, g, {
      fills: [{ target: t.id, value: option, kind: "derived", rule: "classify", evidence: [desc.id], quote: "Bursary for two", reasoning: "The description says bursary." }],
      questions: [],
    });
    expect(out.rejected).toBe(0);
    expect(out.proposals[0]).toMatchObject({ section: "sed", rowId: "d1", column: "contributionType", value: option, kind: "derived", rule: "classify", origin: "model" });
    expect(out.proposals[0].evidence[0]).toMatchObject({ type: "cell", column: "descriptionOfSpend", files: ["sed-schedule.xlsx"] });
  });

  it("refuses a quote that is not in the cited cell, and asks instead", () => {
    const sections = workbook();
    const g = buildAiReviewGrounding(sections);
    const t = target(g, "sed", "contributionType", "d1");
    const out = verifyAiReviewReply(sections, g, {
      fills: [{ target: t.id, value: t.options![0], kind: "derived", rule: "classify", evidence: [ctx(g, "sed", "descriptionOfSpend").id], quote: "feeding scheme", reasoning: "r" }],
      questions: [],
    });
    expect(out.proposals).toEqual([]);
    expect(out.rejected).toBe(1);
    expect(out.questions[0]).toMatchObject({ section: "sed", rowId: "d1", column: "contributionType" });
  });

  it("refuses a quote that is only a fragment of the cited words", () => {
    const sections = workbook();
    const g = buildAiReviewGrounding(sections);
    const t = target(g, "sed", "contributionType", "d1");
    const desc = ctx(g, "sed", "descriptionOfSpend");
    for (const quote of ["for", "two", "ursar", "Bursary fo"]) {
      const out = verifyAiReviewReply(sections, g, {
        fills: [{ target: t.id, value: t.options![0], kind: "derived", rule: "classify", evidence: [desc.id], quote, reasoning: "r" }],
        questions: [],
      });
      expect(out.proposals).toEqual([]);
    }
  });

  it("refuses an option that is not on the cell's list", () => {
    const sections = workbook();
    const g = buildAiReviewGrounding(sections);
    const t = target(g, "sed", "contributionType", "d1");
    const out = verifyAiReviewReply(sections, g, {
      fills: [{ target: t.id, value: "Charitable gift", kind: "derived", rule: "classify", evidence: [ctx(g, "sed", "descriptionOfSpend").id], quote: "Bursary", reasoning: "r" }],
      questions: [],
    });
    expect(out.proposals).toEqual([]);
  });

  it("settles a disputed cell only with a value a document gave, keeping what it replaces", () => {
    const sections = workbook();
    const g = buildAiReviewGrounding(sections);
    const t = target(g, "management-control", "designation", "m1");
    const ok = verifyAiReviewReply(sections, g, {
      fills: [{ target: t.id, value: "Middle Manager", kind: "read", document: "ee-report.pdf", reasoning: "The EE report is signed by the employer." }],
      questions: [],
    });
    expect(ok.proposals[0]).toMatchObject({ value: "Middle Manager", kind: "read", replaces: "Junior Manager" });
    expect(ok.proposals[0].evidence[0]).toMatchObject({ type: "document", file: "ee-report.pdf" });

    const invented = verifyAiReviewReply(sections, g, {
      fills: [{ target: t.id, value: "Senior Manager", kind: "read", reasoning: "Seems senior." }],
      questions: [],
    });
    expect(invented.proposals).toEqual([]);
  });

  it("never invents a figure: a read number must be stated in a cited cell of the same column", () => {
    const sections = workbook();
    const g = buildAiReviewGrounding(sections);
    const t = target(g, "financial-information", "revenue");
    const out = verifyAiReviewReply(sections, g, {
      fills: [{ target: t.id, value: "5100000", kind: "read", reasoning: "Probably about this." }],
      questions: [],
    });
    expect(out.proposals).toEqual([]);
    const picked = verifyAiReviewReply(sections, g, {
      fills: [{ target: t.id, value: "5000000", kind: "read", reasoning: "The audited statements." }],
      questions: [],
    });
    expect(picked.proposals[0]).toMatchObject({ column: "revenue", value: "5000000", kind: "read" });
    expect(picked.proposals[0].replaces).toBeUndefined();
  });

  it("re-runs arithmetic: a sum that does not come out is refused", () => {
    const sections: WorkbookSectionsInput = {
      "company-information": { meta: { companyName: "Example Co" } },
      esd: { rows: [{ _id: "e9", supplierName: "Calc Co", currentBlackOwnership: 51, currentSize: "EME", contributionDescription: "Two invoices 300 and 200", contributionType: "Grant" }] },
    };
    const g = buildAiReviewGrounding(sections);
    const t = target(g, "esd", "amount", "e9");
    // Context only carries the row's own columns; cite two numbers that exist.
    const bo = ctx(g, "esd", "currentBlackOwnership");
    const good = verifyAiReviewReply(sections, g, {
      fills: [{ target: t.id, value: "51", kind: "read", evidence: [bo.id], reasoning: "copy" }],
      questions: [],
    });
    // Reading a number from a DIFFERENT column is not a statement of this one.
    expect(good.proposals).toEqual([]);
    const badSum = verifyAiReviewReply(sections, g, {
      fills: [{ target: t.id, value: "600", kind: "derived", rule: "sum", evidence: [bo.id, bo.id], reasoning: "sum" }],
      questions: [],
    });
    expect(badSum.proposals).toEqual([]);
    const sum = verifyAiReviewReply(sections, g, {
      fills: [{ target: t.id, value: "102", kind: "derived", rule: "sum", evidence: [bo.id, bo.id], reasoning: "sum" }],
      questions: [],
    });
    // One cell cited twice is not two figures, and a Rand amount is never
    // built from a percentage: the arithmetic comes out, and means nothing.
    expect(sum.proposals).toEqual([]);
    expect(sum.rejected).toBe(1);
  });

  it("never reads a value the build worked out from a flag, nor an earlier derived fill", () => {
    const flagged: WorkbookSectionsInput = {
      "company-information": { meta: { companyName: "Example Co" } },
      procurement: { rows: [{ _id: "p1", supplierName: "Flag Co", currentBlackOwnership: 51, spend: 900, _derivedFromFlag: { currentBlackOwnership: "51% or more black owned: Yes" } }] },
      esd: { rows: [{ _id: "e1", supplierName: "Flag Co", currentSize: "EME", contributionDescription: "Grant", contributionType: "Grant", amount: 500 }] },
    };
    const derivedFill: WorkbookSectionsInput = {
      ...flagged,
      procurement: { rows: [{
        _id: "p1", supplierName: "Flag Co", currentBlackOwnership: 51, spend: 900,
        _aiFills: { currentBlackOwnership: { value: "51", kind: "derived", rule: "percent", reasoning: "r", evidence: [], origin: "model", at: "2026-01-01T00:00:00Z" } },
      }] },
    };
    for (const sections of [flagged, derivedFill]) {
      const g = buildAiReviewGrounding(sections);
      const t = target(g, "esd", "currentBlackOwnership", "e1");
      const c = ctx(g, "procurement", "currentBlackOwnership");
      expect(c.derived).toBe(true);
      expect(g.text).toContain("worked out, not stated");
      const out = verifyAiReviewReply(sections, g, {
        fills: [{ target: t.id, value: "51", kind: "read", evidence: [c.id], reasoning: "Same supplier on procurement." }],
        questions: [],
      });
      expect(out.proposals).toEqual([]);
      expect(out.rejected).toBe(1);
    }
  });

  it("refuses a disputed cell once the user has typed a value none of the documents gave", () => {
    const sections = workbook();
    (sections["management-control"]!.rows![0] as Record<string, unknown>).designation = "Executive Director";
    const g = buildAiReviewGrounding(sections);
    expect(g.targets.some((t) => t.section === "management-control" && t.column === "designation")).toBe(false);
    // A grounding built before the user typed: the reply cannot overwrite them either.
    const before = buildAiReviewGrounding(workbook());
    const t = target(before, "management-control", "designation", "m1");
    const stale = { ...t, current: "Executive Director" };
    const out = verifyAiReviewReply(sections, { ...before, targets: before.targets.map((x) => (x.id === t.id ? stale : x)) }, {
      fills: [{ target: t.id, value: "Middle Manager", kind: "read", document: "ee-report.pdf", reasoning: "r" }],
      questions: [],
    });
    expect(out.proposals).toEqual([]);
  });

  it("does not let a fill land on a cell the user has since typed into", () => {
    const sections = workbook();
    const g = buildAiReviewGrounding(sections);
    const t = target(g, "sed", "contributionType", "d1");
    const typed = workbook();
    (typed.sed!.rows![0] as Record<string, unknown>).contributionType = t.options![1];
    const out = verifyAiReviewReply(typed, g, {
      fills: [{ target: t.id, value: t.options![0], kind: "derived", rule: "classify", evidence: [ctx(g, "sed", "descriptionOfSpend").id], quote: "Bursary", reasoning: "r" }],
      questions: [],
    });
    expect(out.proposals).toEqual([]);
  });

  it("passes the model's own question through, one line", () => {
    const sections = workbook();
    const g = buildAiReviewGrounding(sections);
    const t = target(g, "sed", "contributionType", "d1");
    const out = verifyAiReviewReply(sections, g, { fills: [], questions: [{ target: t.id, question: "Is this a bursary\nor a donation?" }] });
    expect(out.questions[0].question).toBe("Is this a bursary or a donation?");
  });

  describe("arithmetic stays within one unit", () => {
    const sections: WorkbookSectionsInput = {
      "company-information": { meta: { companyName: "Example Co" } },
      esd: { rows: [{ _id: "e9", supplierName: "Calc Co", currentSize: "EME", contributionType: "Grant" }] },
      sed: { rows: [{ _id: "d9", beneficiaryName: "Calc Trust", amount: 100 }] },
    };
    const cell = (id: string, section: string, column: string, value: string): ContextCell => {
      const def = getSection(section)!.columns.find((c) => c.key === column)!;
      return { id, section, sectionLabel: section, rowId: "x", column, columnLabel: def.label, type: def.type, unit: unitOf(def), value, files: [] };
    };
    const tgt = (section: string, rowId: string, column: string, context: string[]): ReviewTarget => {
      const def = getSection(section)!.columns.find((c) => c.key === column)!;
      return { id: "T1", section, sectionLabel: section, rowId, column, columnLabel: def.label, type: def.type, unit: unitOf(def), context, affectsScore: true };
    };
    const context = [
      cell("C1", "procurement", "spend", "300"),
      cell("C2", "skills-development", "courseCost", "200"),
      cell("C3", "procurement", "currentBlackOwnership", "51"),
      cell("C4", "sed", "amount", "1000"),
    ];
    const grounding = (t: ReviewTarget): ReviewGrounding => ({ targets: [t], context, truncated: 0, text: "" });

    it("knows Rand, percent and count columns", () => {
      const col = (s: string, k: string) => getSection(s)!.columns.find((c) => c.key === k);
      expect(unitOf(col("esd", "amount"))).toBe("rand");
      expect(unitOf(col("procurement", "currentBlackOwnership"))).toBe("percent");
      expect(unitOf(col("skills-development", "manHours"))).toBe("count");
      expect(unitOf(col("esd", "supplierName"))).toBe("other");
    });

    it("accepts a Rand sum of distinct Rand cells", () => {
      const g = grounding(tgt("esd", "e9", "amount", ["C1", "C2", "C3"]));
      const out = verifyAiReviewReply(sections, g, { fills: [{ target: "T1", value: "500", kind: "derived", rule: "sum", evidence: ["C1", "C2"], reasoning: "r" }], questions: [] });
      expect(out.proposals[0]).toMatchObject({ value: "500", kind: "derived", rule: "sum" });
    });

    it("refuses a Rand sum or difference that takes in a percentage", () => {
      const g = grounding(tgt("esd", "e9", "amount", ["C1", "C2", "C3"]));
      const sum = verifyAiReviewReply(sections, g, { fills: [{ target: "T1", value: "351", kind: "derived", rule: "sum", evidence: ["C1", "C3"], reasoning: "r" }], questions: [] });
      expect(sum.proposals).toEqual([]);
      const diff = verifyAiReviewReply(sections, g, { fills: [{ target: "T1", value: "249", kind: "derived", rule: "difference", evidence: ["C1", "C3"], reasoning: "r" }], questions: [] });
      expect(diff.proposals).toEqual([]);
    });

    it("takes a percentage only as Rand of Rand (or count of count), into a percent cell", () => {
      const pct = grounding(tgt("sed", "d9", "percentBenefitingBlack", ["C1", "C3", "C4"]));
      const ok = verifyAiReviewReply(sections, pct, { fills: [{ target: "T1", value: "30", kind: "derived", rule: "percent", evidence: ["C1", "C4"], reasoning: "r" }], questions: [] });
      expect(ok.proposals[0]).toMatchObject({ value: "30", rule: "percent" });
      const mixed = verifyAiReviewReply(sections, pct, { fills: [{ target: "T1", value: "5.1", kind: "derived", rule: "percent", evidence: ["C3", "C4"], reasoning: "r" }], questions: [] });
      expect(mixed.proposals).toEqual([]);
      const intoRand = verifyAiReviewReply(sections, grounding(tgt("esd", "e9", "amount", ["C1", "C4"])), { fills: [{ target: "T1", value: "30", kind: "derived", rule: "percent", evidence: ["C1", "C4"], reasoning: "r" }], questions: [] });
      expect(intoRand.proposals).toEqual([]);
    });
  });

  it("parses a reply wrapped in prose or code fences, and survives garbage", () => {
    expect(parseAiReviewReply('Sure:\n```json\n{"fills":[{"target":"T1"}],"questions":[]}\n```').fills).toHaveLength(1);
    expect(parseAiReviewReply("not json")).toEqual({ fills: [], questions: [] });
  });
});
