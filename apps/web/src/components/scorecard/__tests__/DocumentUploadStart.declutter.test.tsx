/**
 * @vitest-environment jsdom
 *
 * "I really hate how cluttered it feels in the parser process."
 *
 * Every step now does one job with one filled button, and everything not
 * needed for the next decision sits behind a closed "details" — still on the
 * page, never gone. These pin that down: what is closed by default, that there
 * is one list of files, one status line while reading, and that a file the
 * parser cannot open is named on the way in rather than refused by the picker.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { DocumentUploadStart } from "../DocumentUploadStart";

const CATALOG = { sector_options: [{ code: "Generic", label: "Generic (RCOGP)" }], required_groups: [] };

function json(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) };
}

/** A stream that stays open until `finish` is called — a read in progress. */
function heldStream(text: string) {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let sent = false;
  return {
    finish: () => release(),
    body: {
      getReader: () => ({
        read: async () => {
          if (sent) return { done: true, value: undefined };
          await gate;
          sent = true;
          return { done: false, value: new TextEncoder().encode(text) };
        },
      }),
    },
  };
}

let held: ReturnType<typeof heldStream> | null = null;

function stubServer() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body;
      const files = body instanceof FormData ? [...body.getAll("files"), ...body.getAll("file")].map((f) => (f as File).name) : [];
      if (url.includes("/api/parser/document-types")) return json(CATALOG);
      if (url.includes("/api/parser/required-documents")) {
        return json({ data: { elements: [{ element: "OWNERSHIP", documentCount: 1, documents: [{ id: "own__register", name: "Share register", whatTheAuditorTests: "Who owns what." }] }] } });
      }
      if (url.includes("/api/parser-documents/upload")) return json({ document: { id: `doc-${files[0]}` } }, 201);
      if (url.includes("/api/parser/quote-files")) {
        return json({
          data: {
            quoteId: "q-1",
            paymentRequired: true,
            expiresAt: "2026-10-07T00:00:00Z",
            totals: { isUpperBound: false },
            files: files.map((filename) => ({ filename, requiresOcr: false, tokens: { input: 100 }, structure: { pages: 2, sheets: null, rows: null } })),
          },
        });
      }
      if (url.includes("/api/tokens/quote/")) {
        return json({
          tokens: 250,
          balance: 3_000,
          balanceAfter: 2_750,
          sufficient: true,
          shortfall: 0,
          alreadyAuthorized: false,
          files: files.map((filename) => ({ filename, tokens: 250, effort: "standard" })),
          effortRules: [{ tier: "standard", label: "Standard", rule: "Digital documents up to 20 pages." }],
        });
      }
      if (url.includes("/api/tokens/authorize")) return json({ balance: 2_750 });
      if (url.includes("/api/parser/resolve-case-files-stream")) {
        const result = {
          case_id: "case",
          documents_detected: files.map((filename) => ({ filename, document_type: "Share register", status: "passed" })),
          ai_entities: { extractions: [] },
        };
        held = heldStream(`event: doc-start\ndata: {"fileName":"${files[0]}"}\n\nevent: result\ndata: ${JSON.stringify(result)}\n\n`);
        return { ok: true, status: 200, body: held.body };
      }
      if (url.includes("/settle-outcome")) return json({ state: "settled", refundedTokens: 0 });
      return json({});
    }) as unknown as typeof fetch,
  );
}

beforeEach(() => {
  held = null;
  sessionStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  stubServer();
});

/** Filled buttons: the one main action per step (white, or the ESG green). */
function filledButtons(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("button, a")).filter(
    (el) => String(el.className).split(/\s+/).includes("bg-white") && !el.closest("details:not([open])"),
  );
}

describe("DocumentUploadStart — decluttered", () => {
  it("opens on the drop zone alone: one main button, the checklist and company details closed", async () => {
    render(<DocumentUploadStart onCreate={vi.fn()} creating={false} />);
    const root = await screen.findByTestId("document-upload-start");
    await screen.findByTestId("batch-OWNERSHIP");

    expect(filledButtons(root).map((b) => b.textContent)).toEqual(["Upload files"]);

    const checklist = screen.getByTestId("pillar-upload-batches");
    expect(checklist.tagName).toBe("DETAILS");
    expect(checklist).not.toHaveAttribute("open");
    expect(checklist).toHaveTextContent("Checklist: what to include");
    // Closed, not gone: every group still takes files.
    expect(within(checklist).getByTestId("batch-upload-files-OWNERSHIP")).toBeEnabled();

    const company = screen.getByTestId("company-details");
    expect(company.tagName).toBe("DETAILS");
    expect(company).not.toHaveAttribute("open");
    expect(within(company).getByTestId("sector-select-side")).toBeInTheDocument();

    // The pickers do not grey anything out.
    expect(screen.getByTestId("docs-file-input")).not.toHaveAttribute("accept");
    expect(screen.getByTestId("batch-file-input")).not.toHaveAttribute("accept");
  });

  it("stages into ONE list with one status word, and the read bar is the one main button", async () => {
    const user = userEvent.setup();
    render(<DocumentUploadStart onCreate={vi.fn()} creating={false} />);
    await user.upload(await screen.findByTestId("docs-file-input"), new File(["%PDF a"], "register.pdf", { type: "application/pdf" }));

    await waitFor(() => expect(screen.getByTestId("read-bar-price")).toHaveTextContent(/250 tokens \(you have 3\s?000\)/));
    expect(screen.getByTestId("read-bar")).toHaveTextContent("1 document ready to read");
    // The file is listed once — no side panel copy, no Digital/Scan column.
    expect(screen.getAllByText("register.pdf")).toHaveLength(1);
    expect(screen.getByTestId("document-row-register.pdf")).toHaveTextContent("Ready to read");
    expect(screen.queryByText("Digital")).not.toBeInTheDocument();

    const root = screen.getByTestId("document-upload-start");
    expect(filledButtons(root).map((b) => b.textContent)).toEqual(["Read 1 document"]);
  });

  it("opens the cost inline and moves the read button into it — still one main button", async () => {
    const user = userEvent.setup();
    render(<DocumentUploadStart onCreate={vi.fn()} creating={false} />);
    await user.upload(await screen.findByTestId("docs-file-input"), new File(["%PDF a"], "register.pdf", { type: "application/pdf" }));
    await waitFor(() => expect(screen.getByTestId("read-bar-price")).toHaveTextContent("250 tokens"));

    const toggle = screen.getByTestId("button-done-staging");
    expect(toggle).toHaveTextContent("Cost details");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("payment-summary")).not.toBeInTheDocument();

    await user.click(toggle);
    const panel = screen.getByTestId("payment-summary");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(within(panel).getByTestId("quote-total-cost")).toHaveTextContent("250 tokens");
    // The pricing rules and the balance after sit one more "details" down.
    expect(within(panel).getByTestId("effort-rules").closest("details")).not.toHaveAttribute("open");
    expect(within(panel).getByTestId("balance-after")).toHaveTextContent(/2\s?750 tokens left of 3\s?000/);
    // The stage did not swap away: the uploader and the list are still there.
    expect(screen.getByTestId("docs-drop-zone")).toBeInTheDocument();
    expect(screen.getByTestId("document-row-register.pdf")).toBeInTheDocument();

    const root = screen.getByTestId("document-upload-start");
    expect(screen.queryByTestId("button-read-now")).not.toBeInTheDocument();
    expect(filledButtons(root)).toEqual([screen.getByTestId("button-spend-tokens")]);
  });

  it("names a file the parser cannot open instead of refusing it silently, and a lock file is a notice, not an error", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<DocumentUploadStart onCreate={vi.fn()} creating={false} />);
    const input = await screen.findByTestId("docs-file-input");

    await user.upload(input, [
      new File(["x"], "site-plan.dwg"),
      new File(["%PDF a"], "register.pdf", { type: "application/pdf" }),
      new File(["x"], "~$Pack.xlsx"),
    ]);

    expect(await screen.findByTestId("skipped-files-warning")).toHaveTextContent("We can't open this file (.dwg)");
    expect(screen.getByTestId("skipped-temporary-files")).toHaveTextContent("Skipped 1 temporary Office file");
    expect(screen.queryByTestId("parse-error")).not.toBeInTheDocument();
    // The readable one went in; the others did not.
    expect(screen.getByTestId("document-row-register.pdf")).toBeInTheDocument();
    expect(screen.queryByTestId("document-row-site-plan.dwg")).not.toBeInTheDocument();
  });

  it("while reading: one status line, the files behind Show documents, and nothing else to fiddle with", async () => {
    const user = userEvent.setup();
    render(<DocumentUploadStart onCreate={vi.fn()} creating={false} />);
    await user.upload(await screen.findByTestId("docs-file-input"), new File(["%PDF a"], "register.pdf", { type: "application/pdf" }));
    const read = await screen.findByTestId("button-read-now");
    await waitFor(() => expect(read).not.toBeDisabled());
    await user.click(read);

    const phase = await screen.findByTestId("extraction-phase");
    const line = within(phase).getByRole("status");
    expect(line).toHaveAttribute("aria-live", "polite");
    await waitFor(() => expect(line).toHaveTextContent("Reading 1 of 1 document…"));
    const documents = within(phase).getByTestId("extraction-documents");
    expect(documents.tagName).toBe("DETAILS");
    expect(documents).not.toHaveAttribute("open");
    expect(documents).toHaveTextContent("Show documents");
    // Nothing that cannot change while reading is on screen.
    expect(screen.queryByTestId("pillar-upload-batches")).not.toBeInTheDocument();
    expect(screen.queryByTestId("company-details")).not.toBeInTheDocument();
    expect(screen.queryByTestId("read-bar")).not.toBeInTheDocument();

    held!.finish();
    await screen.findByTestId("button-create-from-documents");
    expect(screen.queryByTestId("extraction-phase")).not.toBeInTheDocument();
  });

  it("after the read: Build says what it does, and the detail panels are closed", async () => {
    const user = userEvent.setup();
    render(<DocumentUploadStart onCreate={vi.fn()} creating={false} />);
    await user.upload(await screen.findByTestId("docs-file-input"), new File(["%PDF a"], "register.pdf", { type: "application/pdf" }));
    const read = await screen.findByTestId("button-read-now");
    await waitFor(() => expect(read).not.toBeDisabled());
    await user.click(read);
    await waitFor(() => expect(held).not.toBeNull());
    held!.finish();

    const build = await screen.findByTestId("button-create-from-documents");
    expect(build).toHaveTextContent(/^Build scorecard$/);
    // The checklist and company profile are gone after the read; the Build bar asks.
    expect(screen.queryByTestId("pillar-upload-batches")).not.toBeInTheDocument();
    expect(screen.getByTestId("sector-select-build")).toBeInTheDocument();
    // One way to add a forgotten document here: the review's own button.
    expect(screen.getByTestId("review-add-documents")).toBeInTheDocument();
    expect(screen.queryByTestId("docs-drop-zone")).not.toBeInTheDocument();
  });
});
