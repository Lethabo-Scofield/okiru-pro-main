/**
 * The workbook page's AI review wiring. The page pulls in the whole app, so it
 * is pinned by its source, the way EsgCreateStartChoice.test pins the import
 * wiring; the behaviour behind each call is tested in the lib and component
 * tests.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as path from "node:path";

const APP_ROOT = path.resolve(__dirname, "../../../..");
const read = (rel: string) => readFileSync(path.resolve(APP_ROOT, rel), "utf8");
const PAGE = read("src/pages/EsgInformationRequest.tsx");

describe("EsgInformationRequest wires the AI review", () => {
  it("mounts the review in the workbook toolbar, locked once submitted", () => {
    expect(PAGE).toMatch(/<EsgAiReviewModal[\s\S]*?locked=\{Boolean\(submittedAt\)\}/);
  });

  it("saves the open section before any fill or undo, and re-checks against the workbook as saved", () => {
    for (const fn of ["applyReviewFills", "undoReviewFill", "undoAllReviewFills"]) {
      const at = PAGE.indexOf(`const ${fn} = useCallback(`);
      expect(at, fn).toBeGreaterThan(-1);
      const body = PAGE.slice(at, at + 500);
      expect(body.indexOf("await flushOpenSection()"), fn).toBeGreaterThan(-1);
      expect(body).toMatch(/latestWorkbook\(\)/);
    }
    expect(PAGE).toMatch(/saveEsgReviewPatches\(patches, marksFirst, updateSectionCells\)/);
  });

  it("gives every editor cell its marker, with Undo only while the workbook is open", () => {
    expect(PAGE).toMatch(/<EsgCellMarkContext\.Provider value=\{cellMarks\}>\s*<EsgWorkbookSectionEditor/);
    expect(PAGE).toMatch(/onUndo: submittedAt\s*\?\s*undefined/);
    expect(read("src/components/esg-workbook/EsgWorkbookSectionEditor.tsx")).toMatch(/<EsgCellSectionContext\.Provider value=\{sectionId\}>/);
  });

  it("records the documents' disagreements beside the figures on both write paths", () => {
    expect(PAGE).toMatch(/withEsgDisputes\(injection\.patches, injection\.conflicts\)/);
    expect(read("src/components/esg/EsgCreateFlow.tsx")).toMatch(/withEsgDisputes\(patches, run\?\.conflicts\)/);
  });
});
