/**
 * @vitest-environment jsdom
 *
 * "I pressed done and review after uploading docs and it didn't show me it
 * processing."
 *
 * Pressing "Done adding" sets doneStaging, which hides the staging bar — and
 * the review panel below it only renders once a quote exists. When pricing
 * failed there was therefore NOTHING on screen between the two: the button
 * appeared to do nothing, the only clue was a red line far below the fold, and
 * the only way out was adding or removing a file. The flow must always leave a
 * visible way forward.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { DocumentUploadStart } from "../DocumentUploadStart";

const CATALOG = {
  sector_options: [{ code: "Generic", label: "Generic (RCOGP)" }],
  required_groups: [],
};

/** Catalog loads; document persistence succeeds; pricing fails. */
function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/parser/quote-files")) {
        return { ok: false, status: 500, json: async () => ({}) };
      }
      if (url.includes("/api/parser-documents/upload")) {
        return { ok: true, status: 200, json: async () => ({ document: { id: "doc-1" } }) };
      }
      return { ok: true, status: 200, json: async () => CATALOG };
    }) as unknown as typeof fetch,
  );
}

async function stageAFile() {
  const user = userEvent.setup();
  render(<DocumentUploadStart onCreate={vi.fn()} creating={false} />);
  const input = (await screen.findByTestId("docs-file-input")) as HTMLInputElement;
  await user.upload(input, new File(["%PDF-1.4 evidence"], "ownership.pdf", { type: "application/pdf" }));
  return user;
}

describe("DocumentUploadStart — pressing Done when pricing failed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubFetch();
  });

  it("never leaves a blank screen: it names the failure and offers a way on", async () => {
    const user = await stageAFile();

    // The quote request has to settle before the button is enabled.
    const done = await screen.findByTestId("button-done-staging");
    await waitFor(() => expect(done).not.toBeDisabled());
    await user.click(done);

    // The staging bar is gone — that is the behaviour that created the dead end.
    expect(screen.queryByTestId("button-done-staging")).not.toBeInTheDocument();
    // ...so something must stand in its place.
    const panel = await screen.findByTestId("quote-unavailable");
    expect(panel).toBeInTheDocument();
    expect(screen.getByTestId("button-retry-quote")).toBeInTheDocument();
    expect(screen.getByTestId("button-back-to-staging")).toBeInTheDocument();
  });

  it("gives back the staging bar, so the user is never stuck at the checkout", async () => {
    const user = await stageAFile();

    const done = await screen.findByTestId("button-done-staging");
    await waitFor(() => expect(done).not.toBeDisabled());
    await user.click(done);

    await user.click(await screen.findByTestId("button-back-to-staging"));

    expect(await screen.findByTestId("button-done-staging")).toBeInTheDocument();
    expect(screen.queryByTestId("quote-unavailable")).not.toBeInTheDocument();
  });
});
