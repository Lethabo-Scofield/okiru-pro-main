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
import { CostDetails } from "../CostDetails";
import type { TokenCost, TokenCostFile } from "../tokenCost";

const file = (name: string, size = 10) => ({ name, size });

describe("readableFiles", () => {
  it("mirrors the parser's seventeen readable extensions", () => {
    expect(READABLE_EXTENSIONS).toHaveLength(17);
    // A saved e-mail (a data request and its replies) is evidence too.
    for (const ext of [".ppt", ".tif", ".tiff", ".webp", ".xlsm", ".eml"]) expect(READABLE_EXTENSIONS).toContain(ext);
    expect(sortPickedFiles([file("Data request.eml")]).usable).toHaveLength(1);
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
    // It opens the picker for a better copy; it does not take the file off, so it does not say "Replace".
    expect(within(error).queryByRole("button", { name: "Replace" })).not.toBeInTheDocument();
    fireEvent.click(within(error).getByRole("button", { name: "Choose another file" }));
    expect(onReplace).toHaveBeenCalledTimes(1);
    fireEvent.click(within(error).getByRole("button", { name: "Remove" }));
    expect(onRemove).toHaveBeenCalledWith("bad.pdf");
    // The row's extra detail is behind its own closed details.
    expect(bad.querySelector("details")).not.toHaveAttribute("open");
    expect(bad).toHaveTextContent("3 pages · scanned");
  });

  it("announces failures once, politely, for the batch, not with an alert per row", () => {
    render(
      <DocumentList
        testIdPrefix="esg-"
        rows={[
          { name: "a.pdf", status: "failed", removable: true, error: "We couldn't read this file." },
          { name: "b.pdf", status: "failed", removable: true, error: "We couldn't read this file." },
          { name: "c.pdf", status: "read", removable: false },
        ]}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
    const status = screen.getByTestId("esg-document-list-status");
    expect(status).toHaveAttribute("role", "status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("2 documents couldn't be read.");
  });

  it("adds no status region when nothing failed, so a running read keeps one status line", () => {
    render(
      <DocumentList
        testIdPrefix=""
        rows={[{ name: "a.pdf", status: "reading", removable: false }]}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
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

describe("CostDetails", () => {
  const files = [
    { filename: "register.pdf", requiresOcr: false, structure: { pages: 2, sheets: null, rows: null } },
    { filename: "scan.pdf", requiresOcr: true, structure: { pages: 9, sheets: null, rows: null } },
  ];
  const priced = (filename: string, tokens: number, effort: TokenCostFile["effort"], pages: number): TokenCostFile => ({
    filename, tokens, effort, requiresOcr: effort === "high", pages, sheets: null, rows: null,
  });
  const tokenCost: TokenCost = {
    quoteId: "q", tokens: 900, balance: 2_000, balanceAfter: 1_100, sufficient: true, shortfall: 0, alreadyAuthorized: false,
    files: [priced("register.pdf", 300, "standard", 2), priced("scan.pdf", 600, "high", 9)],
    effortRules: [{ tier: "standard", label: "Standard", rule: "Digital documents up to 20 pages." }],
  };

  it("is a price per document and a total, with the rules behind a closed details and one read button", () => {
    render(<CostDetails testIdPrefix="" files={files} tokenCost={tokenCost} charging isUpperBound onRead={vi.fn()} busy={false} />);
    const panel = screen.getByTestId("payment-summary");
    expect(within(panel).getByRole("table", { name: "Cost per document" })).toBeInTheDocument();
    expect(screen.getByTestId("quote-total-cost")).toHaveTextContent(/900 tokens/);
    expect(panel).toHaveTextContent("Price: scanned or long");
    expect(panel).not.toHaveTextContent("Effort");
    // Rules, balance after and the upper-bound note sit in one closed details.
    const how = screen.getByTestId("effort-rules").closest("details")!;
    expect(how).not.toHaveAttribute("open");
    expect(within(how).getByTestId("balance-after")).toHaveTextContent(/You'll have 1\s?100 tokens left of 2\s?000\./);
    expect(how).toHaveTextContent("You won't pay more than this.");
    // One button outside the details: the read.
    expect(within(panel).getAllByRole("button").filter((b) => !b.closest("details"))).toHaveLength(1);
    expect(screen.getByTestId("button-spend-tokens")).toHaveTextContent("Read 2 documents");
  });

  it("disables the read and offers Add tokens when the balance is short", () => {
    render(
      <CostDetails
        testIdPrefix="esg-"
        files={files}
        tokenCost={{ ...tokenCost, sufficient: false, shortfall: 400, balance: 500, balanceAfter: -400 }}
        charging
        onRead={vi.fn()}
        busy={false}
      />,
    );
    expect(screen.getByTestId("esg-insufficient-tokens")).toHaveTextContent("400 tokens short.");
    expect(screen.getByTestId("esg-button-spend-tokens")).toBeDisabled();
  });

  // jsdom does no layout, so this pins the layout contract a browser needs to
  // keep a long filename inside the box: a fixed table layout, a price column
  // of fixed width, and a name cell that clips and truncates. Under the
  // automatic layout a 50-character name pushed the table past a phone-width
  // box and the price column off-screen.
  it.each(["", "esg-"] as const)("keeps a long filename inside the box (prefix %j)", (p) => {
    const longName = "a-very-long-supporting-document-name-for-testing.pdf";
    render(
      <CostDetails
        testIdPrefix={p}
        files={[{ filename: longName, requiresOcr: false, structure: { pages: 2, sheets: null, rows: null } }]}
        tokenCost={{ ...tokenCost, files: [priced(longName, 300, "standard", 2)] }}
        charging
        onRead={vi.fn()}
        busy={false}
      />,
    );
    const table = screen.getByTestId(`${p}cost-table`);
    expect(table.className).toMatch(/\bw-full\b/);
    expect(table.className).toMatch(/\btable-fixed\b/);
    expect(screen.getByTestId(`${p}cost-price-column`).className).toMatch(/\bw-\[\d+(\.\d+)?rem\]/);
    const name = within(table).getByTitle(longName);
    expect(name.className).toMatch(/\btruncate\b/);
    expect(name.closest("td")!.className).toMatch(/\boverflow-hidden\b/);
    // The price stays in its own cell, never wrapped under the name.
    expect(within(table).getByText("300 tokens").closest("td")!.className).toMatch(/\bwhitespace-nowrap\b/);
  });
});
