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

  it("shows per-section missing hints instead of full validation sidebar", () => {
    expect(PAGE).toMatch(/EsgSectionMissingPanel/);
    expect(PAGE).not.toMatch(/EsgValidationPanel/);
  });
});
