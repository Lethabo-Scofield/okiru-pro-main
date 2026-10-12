/**
 * @vitest-environment jsdom
 *
 * "The B-BBEE review still looks narrow." The "Check each document" step lives
 * in the create step's shell and card; while the review is on screen they must
 * give it the screen, and before it they stay the calm narrow card. jsdom has no
 * layout, so this pins the wiring: the review sits inside the shell that widens
 * for it, and the shell's widening selector matches only once it does. The
 * pixels are checked by the screenshot harness at 1920, 1366 and 390.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import * as React from "react";
import { writeFlowSnapshot } from "@/components/scorecard/flowSnapshot";
import { SETUP_CARD_CLASS, SETUP_SHELL_CLASS } from "../informationRequestLayout";

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@toolkit/lib/auth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@toolkit/lib/store", () => ({
  useBbeeStore: (select: (s: { loadClientData: () => Promise<void> }) => unknown) => select({ loadClientData: async () => {} }),
}));

import { CompanyPicker } from "../InformationRequest";

const FILE = "Share register - example.pdf";

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes("/api/parser/document-types")
        ? { sector_options: [{ code: "Generic", label: "Generic (RCOGP)" }], required_groups: [] }
        : {};
      return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body), clone() { return this; } };
    }) as unknown as typeof fetch,
  );
  window.history.pushState({}, "", "/bbbee/new?start=documents");
});

function restoreARead() {
  writeFlowSnapshot({
    savedAt: "2026-10-06T11:31:00.000Z",
    companyName: "Example Holdings (Pty) Ltd",
    sector: "RCOGP",
    subSector: "",
    size: "Generic",
    yearEnd: "2026-02-28",
    fileNames: [FILE],
    filedBatchByFile: {},
    documentIds: [],
    parserCase: {
      documents_detected: [{ filename: FILE, document_type: "Share register", status: "passed" }],
      ai_entities: {
        extractions: [
          {
            documentId: "own__register",
            sourceFile: FILE,
            element: "OWNERSHIP",
            values: [{ field: "black_ownership_percent", value: 51, sourceFile: FILE }],
          },
        ],
      },
    },
  });
}

describe("the create step's width around the document review", () => {
  it("is the calm narrow card before there is anything to review", async () => {
    render(<CompanyPicker onPick={vi.fn()} mode="create" />);
    await screen.findByTestId("document-upload-start");
    const shell = screen.getByTestId("setup-shell");
    expect(shell).toHaveClass("max-w-[980px]");
    expect(shell.matches(":has([data-wide-review])")).toBe(false);
  });

  it("gives the review the screen: the shell and card that hold it are the ones that widen for it", async () => {
    restoreARead();
    render(<CompanyPicker onPick={vi.fn()} mode="create" />);
    const review = await screen.findByTestId("document-review");
    const shell = screen.getByTestId("setup-shell");
    const card = screen.getByTestId("setup-card");

    expect(shell).toContainElement(review);
    expect(card).toContainElement(review);
    expect(shell.className).toBe(SETUP_SHELL_CLASS);
    expect(card.className).toBe(SETUP_CARD_CLASS);
    // The selector every wide variant hangs on now matches both.
    expect(shell.matches(":has([data-wide-review])")).toBe(true);
    expect(card.matches(":has([data-wide-review])")).toBe(true);
    expect(shell.className).toContain("has-[[data-wide-review]]:max-w-none");
    expect(shell.className).not.toContain("1760px");
  });
});
