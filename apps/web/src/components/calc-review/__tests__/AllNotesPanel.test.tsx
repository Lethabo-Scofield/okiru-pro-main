// @vitest-environment jsdom
/**
 * The "All notes" view on the Calculation Review: one list of every reviewer's
 * notes, grouped by scorecard in words, with a way to the line each is on.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReviewNoteSummary } from "@/lib/calcReview/allNotes";
import type { WorkedScorecard } from "@/lib/calcReview/workedScorecard";

// The lines of a worked scorecard, without scoring a whole sample company here
// (the registry's own tests do that).
vi.mock("@/lib/calcReview/registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/calcReview/registry")>();
  return {
    ...actual,
    loadWorkedScorecard: vi.fn(async (id: string) => {
      if (id !== "rcogp-generic") throw new Error(`unexpected ${id}`);
      return {
        pillars: [
          {
            key: "ownership",
            label: "Ownership",
            lines: [{ anchor: "indicator:line-20", label: "Voting rights: black" }],
          },
        ],
      } as unknown as WorkedScorecard;
    }),
  };
});

import { AllNotesPanel } from "../AllNotesPanel";
import { lineDomId } from "../WorkedScorecardView";

function note(over: Partial<ReviewNoteSummary>): ReviewNoteSummary {
  return {
    id: "n",
    sectorCode: "RCOGP",
    scorecardType: "Generic",
    pillarKey: "ownership",
    anchor: "indicator:line-20",
    body: "",
    verdict: "note",
    authorName: "Reviewer B",
    createdAt: "2026-10-20T08:00:00.000Z",
    updatedAt: "2026-10-20T08:00:00.000Z",
    ...over,
  };
}

function serve(notes: ReviewNoteSummary[]) {
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).endsWith("/api/calculation-review/notes")) {
      return new Response(JSON.stringify({ success: true, notes }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderPanel(onOpenScorecard = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AllNotesPanel sectors={[]} onOpenScorecard={onOpenScorecard} />
    </QueryClientProvider>,
  );
  return { onOpenScorecard, client };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("All notes", () => {
  it("says plainly when there are no notes yet", async () => {
    serve([]);
    renderPanel();
    expect(await screen.findByTestId("all-notes-count")).toHaveTextContent("0 notes");
    fireEvent.click(screen.getByTestId("all-notes-toggle"));
    expect(await screen.findByTestId("all-notes-empty")).toHaveTextContent(
      "No notes yet. Notes left on any line or ruling appear here.",
    );
    expect(screen.queryAllByTestId("all-notes-group")).toHaveLength(0);
  });

  it("lists every note under its scorecard's name, saying who, when and on what", async () => {
    serve([
      note({ id: "mine", body: "Matches the gazette.", verdict: "confirmed", mine: true, updatedAt: "2026-10-21T08:00:00.000Z" }),
      note({
        id: "shared",
        sectorCode: "FSC",
        anchor: "indicator:decision-fsc-skills-within-year",
        pillarKey: "decisions",
        body: "Every row in the year counts.",
        updatedAt: "2026-10-19T08:00:00.000Z",
      }),
    ]);
    renderPanel();
    expect(await screen.findByTestId("all-notes-count")).toHaveTextContent("2 notes");
    fireEvent.click(screen.getByTestId("all-notes-toggle"));

    const groups = await screen.findAllByTestId("all-notes-group");
    expect(groups.map((g) => within(g).getByRole("heading").textContent)).toEqual([
      expect.stringContaining("RCOGP Generic"),
      expect.stringContaining("FSC rulings shared by all four scorecards"),
    ]);

    const [rcogp, fsc] = groups;
    expect(within(rcogp).getByText("You")).toBeInTheDocument();
    expect(within(rcogp).getByText("Matches the gazette.")).toBeInTheDocument();
    expect(within(rcogp).getByText("Confirmed correct")).toBeInTheDocument();
    // The line is named once its scorecard is worked.
    expect(await within(rcogp).findByText("Ownership · Voting rights: black")).toBeInTheDocument();

    expect(within(fsc).getByText("Reviewer B")).toBeInTheDocument();
    expect(within(fsc).getByText(/^Ruling: The "within the financial year" test moves down the page$/)).toBeInTheDocument();
    expect(within(fsc).getByText(/one ruling covers all four/)).toBeInTheDocument();
    expect(within(fsc).getByText(/20 Oct|19 Oct/)).toBeInTheDocument();

    // No codes or identifiers anywhere in the view.
    expect(screen.getByTestId("all-notes").textContent).not.toMatch(/indicator:|pillar:|line-\d|decision-|fsc-|rcogp-/);
  });

  it("opens the scorecard and goes to the line, marking it", async () => {
    serve([note({ id: "a", body: "Check the 25% target." })]);
    // The line as the worked scorecard renders it.
    const line = document.createElement("div");
    line.id = lineDomId("indicator:line-20");
    const toggle = document.createElement("button");
    toggle.setAttribute("aria-expanded", "false");
    const opened = vi.fn(() => toggle.setAttribute("aria-expanded", "true"));
    toggle.addEventListener("click", opened);
    line.appendChild(toggle);
    document.body.appendChild(line);

    const { onOpenScorecard } = renderPanel();
    fireEvent.click(await screen.findByTestId("all-notes-toggle"));
    fireEvent.click(await screen.findByRole("button", { name: /^Go to line/ }));

    expect(onOpenScorecard).toHaveBeenCalledWith({ kind: "worked", id: "rcogp-generic" });
    await waitFor(() => expect(line).toHaveClass("ring-2"));
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it("goes to a ruling on the first scorecard that asks it", async () => {
    serve([note({ id: "r", sectorCode: "FSC", anchor: "indicator:decision-fsc-ownership-bonus-negative", pillarKey: "decisions" })]);
    const { onOpenScorecard } = renderPanel();
    fireEvent.click(await screen.findByTestId("all-notes-toggle"));
    fireEvent.click(await screen.findByRole("button", { name: /^Go to ruling/ }));
    expect(onOpenScorecard).toHaveBeenCalledWith({ kind: "worked", id: "fsc-banks" });
  });
});
