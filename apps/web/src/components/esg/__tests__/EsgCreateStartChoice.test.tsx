/**
 * @vitest-environment jsdom
 *
 * Flow parity with `/create-scorecard`.
 *
 * ESG used to offer exactly one way in — an `.xlsx` file input in the workbook
 * toolbar — so the document route had nowhere to be found and manual entry was
 * simply "whatever happens if you do nothing". These tests pin the three doors
 * open, and pin the two that already existed to the paths they already used:
 * adding the document route must not cost the Excel import or manual entry
 * anything.
 */
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import EsgCreateStartChoice from "../EsgCreateStartChoice";

const PAGE = readFileSync(
  path.resolve(__dirname, "../../../pages/EsgInformationRequest.tsx"),
  "utf8",
);

describe("EsgCreateStartChoice", () => {
  it("offers the same three ways in the B-BBEE flow offers", async () => {
    render(
      <EsgCreateStartChoice
        companyName="Lake Trading"
        onChooseUpload={vi.fn()}
        onChooseExcel={vi.fn()}
        onChooseManual={vi.fn()}
      />,
    );

    expect(screen.getByTestId("esg-start-upload")).toHaveTextContent("Upload documents");
    expect(screen.getByTestId("esg-start-manual")).toHaveTextContent("Enter details manually");
    expect(screen.getByTestId("esg-start-excel")).toHaveTextContent("Import Excel workbook");
    // The cost signal is the thing people scan for, and only one of the three
    // spends anything.
    expect(screen.getByTestId("esg-start-upload")).toHaveTextContent("Uses tokens");
    expect(screen.getByTestId("esg-start-manual")).toHaveTextContent("Free");
    expect(screen.getByTestId("esg-start-excel")).toHaveTextContent("Free");
  });

  it("routes each choice to its own path and commits nothing by itself", async () => {
    const user = userEvent.setup();
    const onChooseUpload = vi.fn();
    const onChooseManual = vi.fn();
    const onChooseExcel = vi.fn();
    render(
      <EsgCreateStartChoice
        onChooseUpload={onChooseUpload}
        onChooseExcel={onChooseExcel}
        onChooseManual={onChooseManual}
      />,
    );

    await user.click(screen.getByTestId("esg-start-upload"));
    expect(onChooseUpload).toHaveBeenCalledTimes(1);
    expect(onChooseExcel).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("esg-start-manual"));
    expect(onChooseManual).toHaveBeenCalledTimes(1);

    // The Excel door hands the file up; the host runs the SAME preview the
    // workbook toolbar runs, so there is only ever one import path.
    const file = new File(["PK"], "esg-data.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    await user.upload(screen.getByTestId("esg-start-excel-input") as HTMLInputElement, file);
    expect(onChooseExcel).toHaveBeenCalledTimes(1);
    expect(onChooseExcel.mock.calls[0]![0]).toBe(file);
  });
});

describe("EsgInformationRequest wiring", () => {
  it("hosts all three entry routes on the ESG create page", () => {
    expect(PAGE).toMatch(/EsgCreateStartChoice/);
    expect(PAGE).toMatch(/EsgDocumentUploadStart/);
    // Manual entry is "go to the workbook" — the same workbook it always was.
    expect(PAGE).toMatch(/onChooseManual=\{goToWorkbook\}/);
  });

  it("keeps the existing .xlsx import path exactly where it was", () => {
    // Same endpoint, same preview modal, same confirm — the document route was
    // added beside it, not on top of it.
    expect(PAGE).toMatch(/api\/esg\/workbook\/\$\{encodeURIComponent\(companyId\)\}\/import/);
    expect(PAGE).toMatch(/EsgImportPreviewModal/);
    expect(PAGE).toMatch(/data-testid="button-esg-import-xlsx"/);
    expect(PAGE).toMatch(/confirm: true, sections: importPreview\.sections/);
  });

  it("writes parsed documents through that same import endpoint, never a second one", () => {
    expect(PAGE).toMatch(/persistEsgSectionPatches/);
    // No bespoke parser→workbook write on the page.
    expect(PAGE).not.toMatch(/updateSectionCells\(/);
  });

  it("still lands the user on the summary the same way", () => {
    expect(PAGE).toMatch(/handleContinueToSummary/);
    expect(PAGE).toMatch(/esgSummaryHref\(companyId\)/);
  });
});
