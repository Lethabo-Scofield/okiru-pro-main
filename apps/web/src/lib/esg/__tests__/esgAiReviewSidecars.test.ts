/**
 * The AI review's sidecar sections (`ai-fills`, `ai-declined`, `disputes`)
 * describe the workbook; they are never part of it. Not exported, not scored,
 * not an input page — and a document read records its disagreements beside
 * the figures only when there are some. Invented data only.
 */
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildGoldenSections } from "../__fixtures__/esgSampleSections";
import { buildEsgWorkbookXlsx } from "../esgWorkbookExport";
import { computeEsgScorecard } from "../../../../EsgToolkit/src/lib/calculators";
import { ESG_INPUT_SECTIONS } from "../esgSections";
import {
  ESG_AI_DECLINED_SECTION,
  ESG_AI_FILLS_SECTION,
  ESG_DISPUTES_SECTION,
  ESG_REVIEW_SIDECAR_SECTIONS,
  esgReviewSaveOrder,
  saveEsgReviewPatches,
  serializeEsgFillMark,
  withEsgDisputes,
} from "../esgAiReviewFill";
import type { EsgWorkbookData } from "../esgWorkbookStorage";

const base = (): EsgWorkbookData => ({
  companyId: "C-SIDE",
  updatedAt: "2025-04-01T00:00:00.000Z",
  sections: buildGoldenSections() as EsgWorkbookData["sections"],
});

const withSidecars = (wb: EsgWorkbookData): EsgWorkbookData => ({
  ...wb,
  sections: {
    ...wb.sections,
    // Keys that look like real cells, holding JSON: none of it may leak into a sheet or a score.
    [ESG_AI_FILLS_SECTION]: {
      cells: {
        "g-data!B15": serializeEsgFillMark({ v: "Yes", kind: "read", reason: "r", evidence: [], replaced: null, origin: "model", at: "t" }),
        B15: "Yes",
        L68: 999_999,
      },
    },
    [ESG_AI_DECLINED_SECTION]: { cells: { "e-data!L68": "123", B44: 5 } },
    [ESG_DISPUTES_SECTION]: { cells: { "e-data!s2_C14": JSON.stringify({ candidates: [{ value: 1, sources: ["a"] }, { value: 2, sources: ["b"] }] }) } },
  },
});

const sheets = (buf: Buffer) => {
  const book = XLSX.read(buf, { type: "buffer" });
  return Object.fromEntries(book.SheetNames.map((name) => [name, XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1 })]));
};

describe("the review's sidecar sections", () => {
  it("never change a score", () => {
    const plain = computeEsgScorecard(base())!;
    const marked = computeEsgScorecard(withSidecars(base()))!;
    expect(marked.overallPercent).toBe(plain.overallPercent);
    expect(marked.environmentalRows).toEqual(plain.environmentalRows);
    expect(marked.socialRows).toEqual(plain.socialRows);
    expect(marked.governanceRows).toEqual(plain.governanceRows);
  });

  it("never reach the exported workbook", () => {
    const plain = sheets(buildEsgWorkbookXlsx(base()));
    const marked = sheets(buildEsgWorkbookXlsx(withSidecars(base())));
    expect(Object.keys(marked)).toEqual(Object.keys(plain));
    expect(marked).toEqual(plain);
  });

  it("are not input pages, so no page or copy walk lists them", () => {
    const ids = ESG_INPUT_SECTIONS.map((s) => s.id);
    for (const id of ESG_REVIEW_SIDECAR_SECTIONS) expect(ids).not.toContain(id);
  });

  it("are saved marks-first for a fill and figures-first for an undo", () => {
    const ids = ["e-data", ESG_AI_FILLS_SECTION, "g-data", ESG_AI_DECLINED_SECTION];
    expect(esgReviewSaveOrder(ids, true)).toEqual([ESG_AI_FILLS_SECTION, ESG_AI_DECLINED_SECTION, "e-data", "g-data"]);
    expect(esgReviewSaveOrder(ids, false)).toEqual(["e-data", "g-data", ESG_AI_FILLS_SECTION, ESG_AI_DECLINED_SECTION]);
  });

  it("go through the ordinary section save in that order, stopping at the first failure", async () => {
    const saved: string[] = [];
    const save = async (id: string) => {
      if (id === "g-data") throw new Error("offline");
      saved.push(id);
    };
    const patches = { "e-data": {}, [ESG_AI_FILLS_SECTION]: {}, "g-data": {}, "s-data": {} };
    await expect(saveEsgReviewPatches(patches, true, save)).rejects.toThrow("offline");
    expect(saved).toEqual([ESG_AI_FILLS_SECTION, "e-data"]);
  });

  it("record a document read's disagreements only when there are some", () => {
    const patches = { "e-data": { cells: { s2_C15: 10 } } };
    expect(withEsgDisputes(patches, [])).toBe(patches);
    expect(withEsgDisputes(patches, undefined)).toBe(patches);
    const out = withEsgDisputes(patches, [
      { sectionId: "e-data", cellRef: "s2_C14", label: "Electricity", candidates: [{ value: 1, sources: ["a.pdf"] }, { value: 2, sources: ["b.pdf"] }] },
      // One candidate is not a disagreement.
      { sectionId: "e-data", cellRef: "s2_D14", candidates: [{ value: 1, sources: ["a.pdf"] }] },
    ]);
    expect(Object.keys(out[ESG_DISPUTES_SECTION].cells)).toEqual(["e-data!s2_C14"]);
    expect(out["e-data"]).toBe(patches["e-data"]);
  });
});
