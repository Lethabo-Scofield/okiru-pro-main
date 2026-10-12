import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as path from "node:path";

const PAGE = readFileSync(
  path.resolve(__dirname, "../EsgInformationRequest.tsx"),
  "utf8",
);

describe("EsgInformationRequest (input layer)", () => {
  it("uses esg-workbook section editor, not toolkit editor", () => {
    expect(PAGE).toMatch(/EsgWorkbookSectionEditor/);
    expect(PAGE).not.toMatch(/EsgToolkit\/src\/components\/EsgSectionEditor/);
  });

  it("never blocks Continue to Summary on validation", () => {
    expect(PAGE).toMatch(/Continue to Summary/);
    expect(PAGE).toMatch(/handleContinueToSummary/);
    expect(PAGE).not.toMatch(/criticalFails\.length/);
    expect(PAGE).not.toMatch(/disabled=\{.*validationOk/);
  });

  it("shows per-section missing hints AND the full validation box", () => {
    // The panel-free layout was a deliberate early decision, reversed on
    // explicit user request (2026-08-28): imported registers were arriving full
    // of required-field gaps and off-vocabulary values that nothing on the page
    // surfaced — "the validator ignored required fields". The rules now carry
    // row-level detail, so the box earns its place beside the section hints.
    expect(PAGE).toMatch(/EsgSectionMissingPanel/);
    expect(PAGE).toMatch(/EsgValidationPanel/);
  });

  it("draws one trail and no raw id: the bar above names the company", () => {
    expect(PAGE).not.toMatch(/data-testid="esg-breadcrumb"/);
    expect(PAGE).not.toMatch(/font-mono truncate">\{companyId\}/);
    expect(PAGE).toMatch(/setShellCompanyName\(companyId, companyName\)/);
  });

  it("folds Template, Import and Export into More", () => {
    const more = PAGE.slice(PAGE.indexOf("<EsgWorkbookMoreMenu"), PAGE.indexOf("</EsgWorkbookMoreMenu>"));
    expect(more).toMatch(/data-testid="button-esg-import-xlsx"/);
    expect(more).toMatch(/data-testid="button-esg-export"/);
    expect(more).toMatch(/testId="button-esg-download-template"/);
  });

  it("toolbar Add documents goes straight to the reader, not the three ways in", () => {
    const button = PAGE.slice(PAGE.indexOf("<button", PAGE.indexOf("evidence pack should not have to leave")), PAGE.indexOf('data-testid="button-esg-add-documents"'));
    expect(button).toMatch(/addDocumentsToWorkbook/);
    expect(button).not.toMatch(/setStage\("choose"\)/);
  });

  it("adding to a workbook has no stepper, says where Back goes, and asks before writing", () => {
    expect(PAGE).toMatch(/uploadFrom === "choose" \? <EsgFlowSteps/);
    expect(PAGE).toMatch(/`Back to \$\{uploadFocus\.title\}`/);
    expect(PAGE).toMatch(/"Back to the workbook"/);
    expect(PAGE).toMatch(/<EsgDocumentWriteConfirm/);
    expect(PAGE).toMatch(/if \(totalCapturedCells > 0 && esgPatchCellCount\(injection\.patches\) > 0\)/);
    // A read that changes nothing writes without asking.
    expect(PAGE).toMatch(/if \(counts\.adds \+ counts\.replaces \+ counts\.rows > 0\)/);
  });
});
