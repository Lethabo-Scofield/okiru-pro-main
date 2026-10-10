/**
 * @vitest-environment jsdom
 *
 * The shared parts of the parser flow, on their own: the one rule for which
 * files can be read, the one status line, the one file list, and the read
 * bar's single main button.
 */
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import * as React from "react";
import { READABLE_EXTENSIONS, sortPickedFiles, temporarySentence, unreadableSentence } from "../readableFiles";
import { StatusLine, statusLineText } from "../StatusLine";
import { DocumentList } from "../DocumentList";
import { ReadBar } from "../ReadBar";

const file = (name: string, size = 10) => ({ name, size });

describe("readableFiles", () => {
  it("mirrors the parser's sixteen readable extensions", () => {
    expect(READABLE_EXTENSIONS).toHaveLength(16);
    for (const ext of [".ppt", ".tif", ".tiff", ".webp", ".xlsm"]) expect(READABLE_EXTENSIONS).toContain(ext);
  });

  it("sorts a pick into readable, temporary and unreadable — and drops OS bookkeeping silently", () => {
    const sorted = sortPickedFiles([
      file("Pack/Report.PDF"),
      file("Pack/~$Report.xlsx"),
      file("Pack/._Report.pdf"),
      file("Pack/Thumbs.db"),
      file("Pack/.DS_Store"),
      file("Pack/site-plan.dwg"),
      file("Pack/empty.pdf", 0),
    ]);
    expect(sorted.usable.map((f) => f.name)).toEqual(["Pack/Report.PDF"]);
    expect(sorted.temporary).toEqual(["~$Report.xlsx", "._Report.pdf"]);
    expect(sorted.unreadable).toEqual(["site-plan.dwg", "empty.pdf"]);
  });

  it("names what it cannot open, and why, in one sentence", () => {
    expect(unreadableSentence(["a.dwg", "b.mp4"])).toBe(
      "We can't open these 2 files (.dwg, .mp4). If one is evidence, save it as a PDF and add it.",
    );
    expect(unreadableSentence(["empty.pdf"])).toBe("This file is empty, so there is nothing to read.");
    expect(temporarySentence(["~$Book.xlsx"])).toMatch(/^Skipped 1 temporary Office file \(~\$Book\.xlsx\)/);
  });
});

describe("StatusLine", () => {
  it("is one polite live line, with the per-file list closed behind Show documents", () => {
    render(
      <StatusLine testIdPrefix="" total={9} done={3} failed={0} checking={false}>
        <p>files</p>
      </StatusLine>,
    );
    const line = screen.getByRole("status");
    expect(line).toHaveAttribute("aria-live", "polite");
    expect(line).toHaveTextContent("Reading 4 of 9 documents…");
    const details = screen.getByTestId("extraction-documents");
    expect(details).not.toHaveAttribute("open");
    expect(details).toHaveTextContent("Show documents");
  });

  it("says what is happening in plain words, including a file that could not be read", () => {
    expect(statusLineText({ total: 9, done: 7, failed: 1, checking: false })).toBe("Reading 9 of 9 documents… · 1 couldn't be read");
    expect(statusLineText({ total: 9, done: 9, failed: 0, checking: true, checkProgress: { done: 2, total: 9 } })).toBe(
      "Checking your documents against each other… (3 of 9)",
    );
  });

  it("lets a resume notice take the line's place", () => {
    render(<StatusLine testIdPrefix="esg-" total={1} done={0} failed={0} checking={false} notice="Still reading on our side." />);
    expect(screen.getByTestId("esg-read-resume-notice")).toHaveTextContent("Still reading on our side.");
  });
});

describe("DocumentList", () => {
  it("puts a failure on its own row, with the way on next to it", () => {
    const onRemove = vi.fn();
    const onReplace = vi.fn();
    render(
      <DocumentList
        testIdPrefix=""
        rows={[
          { name: "ok.pdf", status: "ready", removable: true },
          { name: "bad.pdf", status: "failed", removable: true, error: "We couldn't read this file.", details: ["3 pages", "scanned"] },
        ]}
        onRemove={onRemove}
        onReplace={onReplace}
      />,
    );
    expect(screen.getByTestId("document-row-ok.pdf")).toHaveTextContent("Ready to read");
    const bad = screen.getByTestId("document-row-bad.pdf");
    expect(bad).toHaveTextContent("Couldn't read");
    const error = within(bad).getByTestId("document-error-bad.pdf");
    expect(error).toHaveTextContent("We couldn't read this file.");
    fireEvent.click(within(error).getByRole("button", { name: "Replace" }));
    expect(onReplace).toHaveBeenCalledTimes(1);
    fireEvent.click(within(error).getByRole("button", { name: "Remove" }));
    expect(onRemove).toHaveBeenCalledWith("bad.pdf");
    // The row's extra detail is behind its own closed details.
    expect(bad.querySelector("details")).not.toHaveAttribute("open");
    expect(bad).toHaveTextContent("3 pages · scanned");
  });
});

describe("ReadBar", () => {
  const base = {
    testIdPrefix: "" as const,
    count: 2,
    newRound: false,
    charging: true,
    free: false,
    tokenCost: { quoteId: "q", tokens: 400, balance: 1_000, balanceAfter: 600, sufficient: true, shortfall: 0, alreadyAuthorized: false },
    onToggleCost: vi.fn(),
    onRetry: vi.fn(),
    onRead: vi.fn(),
    busy: false,
  };

  it("hides its read button while the cost details are open, so only one main button shows", () => {
    const { rerender } = render(<ReadBar {...base} state="priced" costOpen={false} />);
    expect(screen.getByTestId("button-read-now")).toHaveTextContent("Read 2 documents");
    rerender(<ReadBar {...base} state="priced" costOpen>{<p data-testid="panel">panel</p>}</ReadBar>);
    expect(screen.queryByTestId("button-read-now")).not.toBeInTheDocument();
    expect(screen.getByTestId("panel")).toBeInTheDocument();
  });

  it("offers Add tokens in place of Read when the balance is short", () => {
    render(
      <ReadBar {...base} state="priced" costOpen={false} tokenCost={{ ...base.tokenCost, sufficient: false, shortfall: 150 }} />,
    );
    expect(screen.queryByTestId("button-read-now")).not.toBeInTheDocument();
    expect(screen.getByTestId("button-add-tokens")).toHaveTextContent("Add tokens — 150 short");
  });
});
