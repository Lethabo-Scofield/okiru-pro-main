/**
 * The AI review's fills: what it proposes, with what evidence, what it writes,
 * how it marks and undoes, and what it refuses to touch.
 */
import { describe, expect, it } from "vitest";
import type { WorkbookSectionsInput } from "@/components/workbook/workbookValidation";
import {
  AI_FILLS_KEY,
  activeAiFills,
  activeMark,
  applyFillProposals,
  buildRuleFills,
  undoAiFill,
  undoAllAiFills,
  undoRowFill,
  type FillProposal,
  type SectionPatch,
} from "../aiReviewFill";

/** Apply patches the way the page does: each section's rows and/or meta replaced. */
function merge(sections: WorkbookSectionsInput, patches: SectionPatch[]): WorkbookSectionsInput {
  const next = { ...sections };
  for (const p of patches) {
    next[p.section] = {
      ...(next[p.section] ?? {}),
      ...(p.rows ? { rows: p.rows } : {}),
      ...(p.meta ? { meta: p.meta } : {}),
    };
  }
  return next;
}

const company = (meta: Record<string, unknown> = {}) => ({
  "company-information": { meta: { companyName: "Example Co", industrySector: "RCOGP", scorecardType: "Generic", ...meta } },
});

const training = (row: Record<string, unknown>): WorkbookSectionsInput => ({
  ...company(),
  "skills-development": {
    rows: [{ _id: "s1", programName: "Forklift course", learnerName: "Learner One", _sourceFiles: ["training-register.xlsx"], ...row }],
  },
});

const find = (list: FillProposal[], section: string, column: string, rowId?: string) =>
  list.find((p) => p.section === section && p.column === column && (rowId === undefined || p.rowId === rowId));

describe("buildRuleFills — proposes with evidence", () => {
  it("totals a training row from its own cost lines, labelled derived, citing each line and its document", () => {
    const { proposals } = buildRuleFills(training({ courseCost: 1200, travelCost: "300", cateringCost: 50.5 }));
    const p = find(proposals, "skills-development", "totalCost", "s1")!;
    expect(p).toBeDefined();
    expect(p.value).toBe("1550.5");
    expect(p.kind).toBe("derived");
    expect(p.rule).toBe("sum");
    expect(p.affectsScore).toBe(true);
    expect(p.evidence).toHaveLength(3);
    for (const e of p.evidence) {
      expect(e.type).toBe("cell");
      if (e.type === "cell") expect(e.files).toEqual(["training-register.xlsx"]);
    }
    expect(p.reasoning).toMatch(/3 cost lines/);
  });

  it("sets the financial period end from the year-end, and only ASKS about the start", () => {
    const { proposals, questions } = buildRuleFills(company({ financialYearEnd: "28/02/2025" }));
    const end = find(proposals, "company-information", "measurementPeriodEnd")!;
    expect(end).toMatchObject({ value: "28/02/2025", kind: "derived", rule: "date" });
    expect(end.evidence[0]).toMatchObject({ type: "cell", column: "financialYearEnd", value: "28/02/2025" });
    expect(find(proposals, "company-information", "measurementPeriodStart")).toBeUndefined();
    const start = questions.find((q) => q.column === "measurementPeriodStart")!;
    expect(start.question).toMatch(/12-month.*01\/03\/2024/);
  });

  it("writes a derived date the way the year-end is written", () => {
    const { proposals } = buildRuleFills(company({ financialYearEnd: "2025-06-30" }));
    expect(find(proposals, "company-information", "measurementPeriodEnd")!.value).toBe("2025-06-30");
  });

  it("reads a supplier's stated figure across registers, naming the row and document it came from", () => {
    const sections: WorkbookSectionsInput = {
      ...company(),
      procurement: { rows: [{ _id: "p1", supplierName: "Sample Supplies (Pty) Ltd", currentBlackOwnership: 62.5, currentSize: "QSE", spend: 1000, _sourceFiles: ["supplier-schedule.xlsx"] }] },
      esd: { rows: [{ _id: "e1", supplierName: "Sample Supplies", contributionDescription: "Loan", amount: 500 }] },
    };
    const { proposals } = buildRuleFills(sections);
    const bo = find(proposals, "esd", "currentBlackOwnership", "e1")!;
    expect(bo).toMatchObject({ value: "62.5", kind: "read" });
    expect(bo.evidence[0]).toMatchObject({ type: "cell", section: "procurement", column: "currentBlackOwnership", files: ["supplier-schedule.xlsx"] });
    expect(find(proposals, "esd", "currentSize", "e1")!.value).toBe("QSE");
  });

  it("does not read a percentage the build derived from a yes/no flag as a statement", () => {
    const sections: WorkbookSectionsInput = {
      ...company(),
      procurement: { rows: [{ _id: "p1", supplierName: "Flagged Co", currentBlackOwnership: 51, _derivedFromFlag: { currentBlackOwnership: "51% or more black owned: Yes" } }] },
      esd: { rows: [{ _id: "e1", supplierName: "Flagged Co" }] },
    };
    expect(find(buildRuleFills(sections).proposals, "esd", "currentBlackOwnership")).toBeUndefined();
  });

  it("asks rather than picks when the same supplier's rows disagree", () => {
    const sections: WorkbookSectionsInput = {
      ...company(),
      procurement: { rows: [
        { _id: "p1", supplierName: "Twin Co", currentBlackOwnership: 40 },
        { _id: "p2", supplierName: "Twin Co", currentBlackOwnership: 70 },
      ] },
      esd: { rows: [{ _id: "e1", supplierName: "Twin Co" }] },
    };
    const { proposals, questions } = buildRuleFills(sections);
    expect(find(proposals, "esd", "currentBlackOwnership")).toBeUndefined();
    expect(questions.find((q) => q.section === "esd" && q.column === "currentBlackOwnership")!.question).toMatch(/40 or 70/);
  });

  it("derives a shareholding % only from a complete register of share counts", () => {
    const full: WorkbookSectionsInput = {
      ...company(),
      ownership: { rows: [
        { _id: "o1", shareholderName: "Holder A", numberOfShares: 600 },
        { _id: "o2", shareholderName: "Holder B", numberOfShares: 400 },
      ] },
    };
    const a = find(buildRuleFills(full).proposals, "ownership", "shareholding", "o1")!;
    expect(a).toMatchObject({ value: "60", kind: "derived", rule: "percent" });
    expect(a.evidence).toHaveLength(2);

    const partial: WorkbookSectionsInput = {
      ...company(),
      ownership: { rows: [
        { _id: "o1", shareholderName: "Holder A", numberOfShares: 600 },
        { _id: "o2", shareholderName: "Holder B" },
      ] },
    };
    expect(find(buildRuleFills(partial).proposals, "ownership", "shareholding")).toBeUndefined();
  });
});

describe("buildRuleFills — refuses to guess", () => {
  it("asks whether voting rights follow the shareholding instead of copying it", () => {
    const sections: WorkbookSectionsInput = {
      ...company(),
      ownership: { rows: [{ _id: "o1", shareholderName: "Holder A", shareholding: 40 }] },
    };
    const { proposals, questions } = buildRuleFills(sections);
    expect(find(proposals, "ownership", "votingRights")).toBeUndefined();
    expect(questions.find((q) => q.column === "votingRights")!.question).toMatch(/same as their 40% shareholding/);
  });

  it("never fills TMPS: a held TMPS gets a question naming the supplier schedule it scores against", () => {
    const sections: WorkbookSectionsInput = {
      ...company(),
      "financial-information": {
        meta: {
          revenue: 5_000_000,
          _metaConflicts: [{ column: "tmps", candidates: [{ value: 900_000, sources: ["afs.pdf"] }, { value: 1_200_000, sources: ["mgmt.pdf"] }] }],
        },
      },
      procurement: { rows: [{ _id: "p1", supplierName: "A", spend: 700_000 }, { _id: "p2", supplierName: "B", spend: 300_000 }] },
    };
    const { proposals, questions } = buildRuleFills(sections);
    expect(proposals.some((p) => p.column === "tmps")).toBe(false);
    const q = questions.find((x) => x.column === "tmps")!;
    expect(q.question).toMatch(/supplier schedule \(R 1[\s ]000[\s ]000\)/);
    // And even a hand-built TMPS proposal is refused on apply.
    const forced: FillProposal = {
      id: "x", section: "financial-information", sectionLabel: "", column: "tmps", columnLabel: "", value: "1000000",
      kind: "derived", rule: "sum", reasoning: "r", evidence: [], affectsScore: true, origin: "model",
    };
    const result = applyFillProposals(sections, [forced]);
    expect(result.applied).toEqual([]);
    expect(result.skipped[0].reason).toMatch(/decision/);
  });

  it("never fills the sector, scorecard type or year-end", () => {
    const sections: WorkbookSectionsInput = { "company-information": { meta: { companyName: "Example Co" } } };
    const decision = (column: string): FillProposal => ({
      id: column, section: "company-information", sectionLabel: "", column, columnLabel: "", value: "RCOGP",
      kind: "read", reasoning: "r", evidence: [], affectsScore: true, origin: "model",
    });
    const result = applyFillProposals(sections, ["industrySector", "scorecardType", "financialYearEnd"].map(decision));
    expect(result.applied).toEqual([]);
    expect(buildRuleFills(sections).proposals).toEqual([]);
  });
});

describe("applyFillProposals — applies and marks", () => {
  it("writes the value in the column's type and leaves a mark with reason, evidence and kind", () => {
    const sections = training({ courseCost: 1200, travelCost: 300 });
    const { proposals } = buildRuleFills(sections);
    const result = applyFillProposals(sections, proposals, "2026-10-11T10:00:00.000Z");
    expect(result.applied).toHaveLength(1);
    const after = merge(sections, result.patches);
    const row = after["skills-development"]!.rows![0] as Record<string, unknown>;
    expect(row.totalCost).toBe(1500);
    const mark = activeMark(row, "totalCost")!;
    expect(mark).toMatchObject({ value: "1500", kind: "derived", rule: "sum", origin: "rules", at: "2026-10-11T10:00:00.000Z" });
    expect(mark.evidence).toHaveLength(2);
    expect(activeAiFills(after)).toEqual([expect.objectContaining({ section: "skills-development", rowId: "s1", column: "totalCost" })]);
    // Once filled, it is no longer proposed.
    expect(buildRuleFills(after).proposals).toEqual([]);
  });

  it("writes a section-level fill into the meta only", () => {
    const sections: WorkbookSectionsInput = company({ financialYearEnd: "28/02/2025" });
    const result = applyFillProposals(sections, buildRuleFills(sections).proposals);
    expect(result.patches).toHaveLength(1);
    expect(result.patches[0].rows).toBeUndefined();
    expect(result.patches[0].meta).toMatchObject({ measurementPeriodEnd: "28/02/2025" });
    expect((result.patches[0].meta as Record<string, unknown>)[AI_FILLS_KEY]).toBeDefined();
  });

  it("settles a disputed cell and keeps what it replaced for undo", () => {
    const sections: WorkbookSectionsInput = {
      ...company(),
      "management-control": { rows: [{
        _id: "m1", name: "Person", surname: "One", designation: "Junior Manager",
        _conflicts: { designation: [{ value: "Junior Manager", sources: ["payroll.pdf"] }, { value: "Senior Manager", sources: ["ee-report.pdf"] }] },
      }] },
    };
    const proposal: FillProposal = {
      id: "fill_mc", section: "management-control", sectionLabel: "", rowId: "m1", column: "designation", columnLabel: "Designation",
      value: "Senior Manager", kind: "read", reasoning: "The EE report is the signed statement.", evidence: [{ type: "document", file: "ee-report.pdf" }],
      replaces: "Junior Manager", affectsScore: true, origin: "model",
    };
    const after = merge(sections, applyFillProposals(sections, [proposal]).patches);
    const row = after["management-control"]!.rows![0] as Record<string, unknown>;
    expect(row.designation).toBe("Senior Manager");
    expect(row._conflicts).toBeUndefined();

    const undone = merge(after, undoAiFill(after, { section: "management-control", rowId: "m1", column: "designation" }));
    const back = undone["management-control"]!.rows![0] as Record<string, unknown>;
    expect(back.designation).toBe("Junior Manager");
    expect((back._conflicts as Record<string, unknown[]>).designation).toHaveLength(2);
    expect(back[AI_FILLS_KEY]).toBeUndefined();
  });
});

describe("never overwrites what the user typed", () => {
  it("skips a cell the user filled after the proposal was made", () => {
    const sections = training({ courseCost: 1200 });
    const { proposals } = buildRuleFills(sections);
    const typed = training({ courseCost: 1200, totalCost: 999 });
    const result = applyFillProposals(typed, proposals);
    expect(result.applied).toEqual([]);
    expect(result.skipped[0].reason).toMatch(/holds a value/);
    expect(result.patches).toEqual([]);
  });

  it("treats an AI fill the user edited — or cleared — as the user's, and never fills it again", () => {
    const sections = training({ courseCost: 1200 });
    const filled = merge(sections, applyFillProposals(sections, buildRuleFills(sections).proposals).patches);
    const row = filled["skills-development"]!.rows![0] as Record<string, unknown>;

    const edited = { ...filled, "skills-development": { rows: [{ ...row, totalCost: 1300 }] } };
    expect(activeMark(edited["skills-development"].rows[0], "totalCost")).toBeNull();
    expect(activeAiFills(edited)).toEqual([]);
    expect(buildRuleFills(edited).proposals).toEqual([]);

    const cleared = { ...filled, "skills-development": { rows: [{ ...row, totalCost: "" }] } };
    expect(buildRuleFills(cleared).proposals).toEqual([]);
  });
});

describe("undo", () => {
  it("puts one cell back to blank, drops its mark, and does not offer the same value again", () => {
    const sections = training({ courseCost: 1200 });
    const filled = merge(sections, applyFillProposals(sections, buildRuleFills(sections).proposals).patches);
    const undone = merge(filled, undoAiFill(filled, { section: "skills-development", rowId: "s1", column: "totalCost" }));
    const row = undone["skills-development"]!.rows![0] as Record<string, unknown>;
    expect(row.totalCost).toBeUndefined();
    expect(row[AI_FILLS_KEY]).toBeUndefined();
    expect(activeAiFills(undone)).toEqual([]);
    expect(buildRuleFills(undone).proposals).toEqual([]);
  });

  it("keeps the user's value when they changed the cell after the fill", () => {
    const sections = training({ courseCost: 1200 });
    const filled = merge(sections, applyFillProposals(sections, buildRuleFills(sections).proposals).patches);
    const row = filled["skills-development"]!.rows![0] as Record<string, unknown>;
    const restored = undoRowFill({ ...row, totalCost: 1300 }, "totalCost");
    expect(restored.totalCost).toBe(1300);
    expect(restored[AI_FILLS_KEY]).toBeUndefined();
  });

  it("undo all restores every filled cell across sections", () => {
    const sections: WorkbookSectionsInput = {
      ...training({ courseCost: 1200 }),
      "company-information": { meta: { companyName: "Example Co", financialYearEnd: "30/06/2025" } },
    };
    const filled = merge(sections, applyFillProposals(sections, buildRuleFills(sections).proposals).patches);
    expect(activeAiFills(filled)).toHaveLength(2);
    const undone = merge(filled, undoAllAiFills(filled));
    expect(activeAiFills(undone)).toEqual([]);
    expect((undone["company-information"]!.meta as Record<string, unknown>).measurementPeriodEnd).toBeUndefined();
    expect((undone["skills-development"]!.rows![0] as Record<string, unknown>).totalCost).toBeUndefined();
  });
});

describe("derived values are labelled derived", () => {
  it("labels arithmetic and ID-digit fills derived, and a value stated elsewhere read", () => {
    // An SA ID with a valid check digit whose digits 7–10 (5xxx) say male.
    const id = (() => {
      const prefix = "900101512308";
      for (let c = 0; c <= 9; c++) {
        const full = prefix + c;
        let sum = 0;
        for (let i = 0; i < 13; i++) {
          let d = Number(full[12 - i]);
          if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
          sum += d;
        }
        if (sum % 10 === 0) return full;
      }
      throw new Error("unreachable");
    })();
    const sections: WorkbookSectionsInput = {
      ...company({ financialYearEnd: "28/02/2025" }),
      "management-control": { rows: [{ _id: "m1", name: "Person", surname: "Two", idNumber: id, race: "African", _sourceFiles: ["payroll.pdf"] }] },
      ownership: { rows: [{ _id: "o1", shareholderName: "Person Two", idNumber: id, _sourceFiles: ["register.pdf"] }] },
      ...{ "skills-development": training({ courseCost: 10 })["skills-development"] },
    };
    const { proposals } = buildRuleFills(sections);
    const gender = find(proposals, "management-control", "gender", "m1")!;
    expect(gender).toMatchObject({ value: "Male", kind: "derived", rule: "SA ID" });
    expect(gender.evidence[0]).toMatchObject({ type: "cell", column: "idNumber" });
    // The ID itself is never shown in full.
    expect(JSON.stringify(gender.evidence)).not.toContain(id);
    const race = find(proposals, "ownership", "race", "o1")!;
    expect(race).toMatchObject({ value: "African", kind: "read" });
    expect(race.evidence[0]).toMatchObject({ section: "management-control", files: ["payroll.pdf"] });
    for (const p of proposals.filter((x) => x.rule && x.rule !== undefined)) expect(p.kind).toBe("derived");
  });
});
