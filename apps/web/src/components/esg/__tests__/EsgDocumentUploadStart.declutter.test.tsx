/**
 * @vitest-environment jsdom
 *
 * The ESG upload step, decluttered the same way as the B-BBEE one: one main
 * button, the fifteen element groups folded into a closed checklist, the
 * evidence types said once, and any file accepted by the picker.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { EsgDocumentUploadStart } from "../EsgDocumentUploadStart";

beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/parser/esg/document-types")) {
        return { ok: true, status: 200, json: async () => ({ elements: [{ element: "WATER", documents: [{ id: "water__bill", name: "Municipal water bill" }] }] }) };
      }
      // Pricing never answers in these tests: the stage is what is under test.
      return new Promise(() => {});
    }) as unknown as typeof fetch,
  );
});

function filledButtons(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("button, a")).filter(
    (el) => /esg-acc-e|(^|\s)bg-white(\s|$)/.test(String(el.className)) && !el.closest("details:not([open])"),
  );
}

describe("EsgDocumentUploadStart — decluttered", () => {
  it("opens with one main button, and the element groups closed under a checklist", async () => {
    render(<EsgDocumentUploadStart companyId="company-1" companyName="Example Co" onComplete={vi.fn(async () => {})} />);
    const root = screen.getByTestId("esg-document-upload-start");
    await screen.findByTestId("esg-batch-WATER");

    expect(filledButtons(root).map((b) => b.textContent)).toEqual(["Upload files"]);
    // The evidence types are said once — in the drop zone, not the heading too.
    expect(root).toHaveTextContent("We'll show the cost before anything is read.");
    expect(screen.getByTestId("esg-docs-drop-zone")).toHaveTextContent("Utility bills, fuel statements");
    expect(screen.queryByText(/15 batches/)).not.toBeInTheDocument();

    const checklist = screen.getByTestId("esg-upload-batches");
    expect(checklist.tagName).toBe("DETAILS");
    expect(checklist).not.toHaveAttribute("open");
    expect(within(checklist).getByTestId("esg-batch-upload-files-WATER")).toBeEnabled();

    expect(screen.getByTestId("esg-docs-file-input")).not.toHaveAttribute("accept");
  });

  it("names a file it cannot open instead of the picker refusing it", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<EsgDocumentUploadStart companyId="company-1" onComplete={vi.fn(async () => {})} />);
    await user.upload(screen.getByTestId("esg-docs-file-input"), [new File(["x"], "site-visit.mp4")]);
    expect(await screen.findByTestId("esg-skipped-files-warning")).toHaveTextContent("We can't open this file (.mp4)");
    expect(screen.queryByTestId("esg-read-bar")).not.toBeInTheDocument();
  });
});
