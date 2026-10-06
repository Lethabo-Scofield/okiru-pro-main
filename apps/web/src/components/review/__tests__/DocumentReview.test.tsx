/**
 * @vitest-environment jsdom
 *
 * The review: the document beside what we took from it, worst first, with a
 * plain reason and a one-click fix for anything we could not read.
 */
import { describe, expect, it, vi, beforeAll } from "vitest";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import * as React from "react";
import * as XLSX from "xlsx";
import { DocumentReview } from "../DocumentReview";
import type { ReviewDocument } from "@/lib/documentReview";

beforeAll(() => {
  // jsdom has no object URLs; the preview only needs them to exist.
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

const DOCS: ReviewDocument[] = [
  {
    filename: "blurry-id.jpg",
    documentType: "Unrecognised document",
    state: "not-read",
    summary: "",
    values: [],
    unplaced: [],
    problems: [
      {
        headline: "This looks like a scan or photo we couldn't read clearly.",
        fix: "Upload a clearer scan, or the original PDF if you have it.",
        replace: true,
      },
    ],
    notFound: [],
  },
  {
    filename: "register.xlsx",
    documentType: "Share register",
    state: "read",
    summary: "2 shareholders",
    values: [{ label: "Shareholder name", value: "T Dlamini", source: "Thandi Dlamini — 51 shares" }],
    unplaced: [{ label: "Economic Interest", value: "-", source: '"-" is not a number' }],
    problems: [],
    notFound: [],
  },
];

function registerWorkbook(): File {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Shareholder", "Shares", "Voting %"],
    ["Thandi Dlamini", 51, "51%"],
    ["Pieter Botha", 49, "49%"],
  ]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Register");
  const bytes = XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new File([bytes], "register.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("DocumentReview", () => {
  it("opens on the worst document, says why it wasn't read, and offers the fix", () => {
    const onAdd = vi.fn();
    render(
      <DocumentReview documents={DOCS} fileFor={() => null} documentIdFor={() => null} onAddDocuments={onAdd} />,
    );

    expect(screen.getByTestId("review-counts")).toHaveTextContent("1 read · 0 need a look · 1 not read");
    const detail = screen.getByTestId("review-detail");
    expect(within(detail).getByText("This looks like a scan or photo we couldn't read clearly.")).toBeInTheDocument();
    fireEvent.click(within(detail).getByTestId("review-upload-replacement"));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("shows a spreadsheet as a table beside what we took from it", async () => {
    const file = registerWorkbook();
    render(
      <DocumentReview
        documents={DOCS}
        fileFor={(name) => (name === "register.xlsx" ? file : null)}
        documentIdFor={() => null}
        onAddDocuments={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("review-doc-register.xlsx"));
    const sheet = await screen.findByTestId("document-preview-sheet");
    expect(within(sheet).getByText("Thandi Dlamini")).toBeInTheDocument();
    expect(within(sheet).getByText("Pieter Botha")).toBeInTheDocument();

    expect(screen.getByTestId("review-values")).toHaveTextContent("T Dlamini");
    expect(screen.getByTestId("review-values")).toHaveTextContent("Thandi Dlamini — 51 shares");
    expect(screen.getByTestId("review-unplaced")).toHaveTextContent('"-" is not a number');
  });

  it("previews a document from the library once the upload itself is gone", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, blob: async () => new Blob(["%PDF-1.4"], { type: "application/pdf" }) }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    const pdf: ReviewDocument = { ...DOCS[1], filename: "afs.pdf", state: "read" };
    render(
      <DocumentReview documents={[pdf]} fileFor={() => null} documentIdFor={() => "doc-42"} onAddDocuments={vi.fn()} />,
    );
    expect(await screen.findByTitle("afs.pdf")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/parser-documents/doc-42/download", { credentials: "include" });
    vi.unstubAllGlobals();
  });
});
