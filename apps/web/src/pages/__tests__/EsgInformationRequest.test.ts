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

  it("gates continue to summary on critical validation", () => {
    expect(PAGE).toMatch(/criticalFails\.length/);
    expect(PAGE).toMatch(/validateEsgWorkbook/);
  });
});
