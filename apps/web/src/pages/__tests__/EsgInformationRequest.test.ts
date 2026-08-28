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
});
