/**
 * @vitest-environment jsdom
 *
 * A value's citation opens the place it was read from: "Show in document" on
 * a value read from a workbook's Skills sheet opens that sheet's tab.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import * as XLSX from "xlsx";
import { DocumentPreview } from "../DocumentPreview";

function workbookFile(): File {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Shareholder", "Shares"], ["Holder A", 60]]), "Ownership");
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Learner", "Cost"], ["Learner A", 10]]), "Skills");
  const bytes = XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const file = new File([bytes], "pack.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  // jsdom's Blob has no arrayBuffer(); the preview reads the bytes with it.
  Object.defineProperty(file, "arrayBuffer", { value: async () => bytes });
  return file;
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
});

describe("DocumentPreview — a citation's place", () => {
  it("opens the cited sheet's tab, and again when asked again", async () => {
    const file = workbookFile();
    const { rerender } = render(<DocumentPreview name="pack.xlsx" file={file} />);
    await waitFor(() => expect(screen.getByTestId("document-preview-tab-Ownership")).toHaveAttribute("aria-selected", "true"));

    rerender(<DocumentPreview name="pack.xlsx" file={file} focus={{ sheet: "Skills", nonce: 1 }} />);
    await waitFor(() => expect(screen.getByTestId("document-preview-tab-Skills")).toHaveAttribute("aria-selected", "true"));
    expect(screen.getByTestId("document-preview-sheet")).toHaveTextContent("Learner A");

    // The user looks elsewhere, then asks for the same place again.
    screen.getByTestId("document-preview-tab-Ownership").click();
    await waitFor(() => expect(screen.getByTestId("document-preview-tab-Ownership")).toHaveAttribute("aria-selected", "true"));
    rerender(<DocumentPreview name="pack.xlsx" file={file} focus={{ sheet: "Skills", nonce: 2 }} />);
    await waitFor(() => expect(screen.getByTestId("document-preview-tab-Skills")).toHaveAttribute("aria-selected", "true"));
  });

  it("ignores a sheet the workbook does not have", async () => {
    const file = workbookFile();
    render(<DocumentPreview name="pack.xlsx" file={file} focus={{ sheet: "Procurement", nonce: 1 }} />);
    await waitFor(() => expect(screen.getByTestId("document-preview-tab-Ownership")).toHaveAttribute("aria-selected", "true"));
  });
});
