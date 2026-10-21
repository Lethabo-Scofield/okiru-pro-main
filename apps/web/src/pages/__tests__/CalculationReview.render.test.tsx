/**
 * @vitest-environment jsdom
 *
 * The Calculation Review page, rendered for every scorecard checked against an
 * Empower toolkit: picking one shows its summary, every line of its worked
 * scorecard and its rulings, without crashing; a scorecard not checked yet
 * says so plainly. The api is stubbed: the reviewer is allowed, the sector
 * registry is empty, and there is one ruling note, one open question on
 * another ruling and one note written against the earlier description.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@toolkit/lib/queryClient";
import { REVIEW_SCORECARDS, decisionAnchor, loadWorkedScorecard } from "@/lib/calcReview/registry";
import { workedLines } from "@/lib/calcReview/workedScorecard";
import CalculationReview from "../CalculationReview";

const NOW = "2026-10-20T09:00:00.000Z";
const note = (id: string, sectorCode: string, scorecardType: string, anchor: string, body: string, verdict = "note") => ({
  id, sectorCode, scorecardType, pillarKey: "decisions", anchor, body, verdict,
  authorUserId: "reviewer-1", authorName: "Reviewer", createdAt: NOW, updatedAt: NOW, mine: false,
});

const NOTES = [
  note("n1", "RCOGP", "Generic", decisionAnchor(REVIEW_SCORECARDS[0].decisions[0]), "Empower scores it at 100%."),
  note("n2", "RCOGP", "Generic", "indicator:own.voting.black", "An earlier note on the description."),
  // An open question asks; it does not answer the ruling it sits under.
  note("n3", "RCOGP", "Generic", decisionAnchor(REVIEW_SCORECARDS[0].decisions[1]), "Which edition?", "question"),
];

function respond(url: string): unknown {
  if (url.includes("/api/calculation-review/access")) return { success: true, allowed: true };
  if (url.includes("/api/sectors")) return { success: true, sectors: [] };
  if (url.includes("/api/calculation-review/notes")) {
    const q = new URLSearchParams(url.split("?")[1] ?? "");
    return {
      success: true,
      notes: NOTES.filter((n) => n.sectorCode === q.get("sectorCode") && n.scorecardType === q.get("scorecardType")),
    };
  }
  return {};
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  queryClient.clear();
  window.history.pushState({}, "", "/calculation-review");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const body = respond(String(input));
      return {
        ok: true,
        status: 200,
        json: async () => body,
        text: async () => JSON.stringify(body),
        clone() {
          return this;
        },
      };
    }) as unknown as typeof fetch,
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderPage = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <CalculationReview />
    </QueryClientProvider>,
  );

describe("the Calculation Review page", () => {
  it("opens on RCOGP Generic, counts the rulings still unanswered and keeps earlier notes", async () => {
    renderPage();
    const summary = await screen.findByTestId("worked-summary", {}, { timeout: 20_000 });
    expect(within(summary).getByText(/RCOGP Generic against the Empower toolkit/)).toBeInTheDocument();
    expect(within(summary).getByTestId("worked-all-match")).toBeInTheDocument();
    const decisions = REVIEW_SCORECARDS[0].decisions.length;
    expect(within(summary).getByText(`${decisions - 1} of ${decisions}`)).toBeInTheDocument();
    const rulings = screen.getByTestId("worked-rulings");
    expect(within(rulings).getByText(`${decisions - 1} of ${decisions} awaiting a ruling`)).toBeInTheDocument();
    const answered = within(rulings).getByTestId(`decision-${REVIEW_SCORECARDS[0].decisions[0].id}`);
    expect(answered).toHaveTextContent("1 note");
    expect(answered).not.toHaveTextContent("Awaiting a ruling");
    const asked = within(rulings).getByTestId(`decision-${REVIEW_SCORECARDS[0].decisions[1].id}`);
    expect(asked).toHaveTextContent("1 note");
    expect(asked).toHaveTextContent("Awaiting a ruling");
    // Each level note says which level it is about.
    const levels = within(summary).getByTestId("worked-level-notes");
    expect(levels).toHaveTextContent(/Level, before discounting: The toolkit shows Level 5/);
    expect(levels).toHaveTextContent(/Level after discounting: The toolkit shows Level 6/);
    expect(screen.getByRole("button", { name: /RCOGP Generic: checked/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Earlier notes on this scorecard")).toBeInTheDocument();
    expect(screen.getByText("An earlier note on the description.")).toBeInTheDocument();
  });

  for (const entry of REVIEW_SCORECARDS) {
    it(`shows ${entry.title}: its summary, every line and its rulings`, async () => {
      renderPage();
      await screen.findByTestId("worked-summary", {}, { timeout: 20_000 });
      fireEvent.click(screen.getByTestId(`pick-scorecard-${entry.id}`));
      const view = await screen.findByTestId(`worked-scorecard-${entry.id}`, {}, { timeout: 20_000 });
      expect(screen.getByTestId(`pick-scorecard-${entry.id}`)).toHaveAttribute("aria-pressed", "true");
      expect(window.location.search).toBe(`?scorecard=${entry.id}`);

      const summary = within(view).getByTestId("worked-summary");
      expect(within(summary).getByText(`${entry.title} against the Empower toolkit`)).toBeInTheDocument();
      expect(within(summary).getByTestId("worked-all-match")).toBeInTheDocument();

      const worked = await loadWorkedScorecard(entry.id);
      const lines = workedLines(worked);
      expect(within(summary).getByText(String(lines.length))).toBeInTheDocument();
      for (const line of lines) {
        expect(within(view).getByTestId(`worked-line-${line.row}`)).toHaveTextContent(line.label);
      }
      const rulings = within(view).getByTestId("worked-rulings");
      for (const d of entry.decisions) expect(within(rulings).getByTestId(`decision-${d.id}`)).toBeInTheDocument();

      // A line opens to Okiru's working, the toolkit's chain behind a plain toggle, and its notes.
      const first = within(view).getByTestId(`worked-line-${lines[0].row}`);
      fireEvent.click(within(first).getAllByRole("button")[0]);
      const toggle = within(first).getByRole("button", { name: "Show how the toolkit works it out" });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      fireEvent.click(toggle);
      expect(within(first).getByRole("table")).toBeInTheDocument();
      expect(within(first).getByTestId(`add-note-${lines[0].anchor}`)).toBeInTheDocument();
    }, 60_000);
  }

  it("says plainly when a scorecard has not been checked against a toolkit", async () => {
    window.history.pushState({}, "", "/calculation-review?sector=TRANSPORT&type=QSE");
    renderPage();
    const card = await screen.findByTestId("not-checked", {}, { timeout: 20_000 });
    expect(card).toHaveTextContent("Not checked against an Empower toolkit yet");
    expect(screen.queryByTestId("worked-summary")).not.toBeInTheDocument();
  });
});
