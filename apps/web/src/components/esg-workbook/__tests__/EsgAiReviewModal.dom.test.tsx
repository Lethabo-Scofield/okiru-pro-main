/**
 * @vitest-environment jsdom
 *
 * The ESG AI review: fills with their reason and evidence, Read and Derived
 * never confused, a confirm before anything that changes the score, the model
 * pass through the server, questions, and undo. Every name and figure here is
 * invented; the "model" is a literal server reply.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { EsgAiReviewModal } from "../EsgAiReviewModal";
import {
  ESG_AI_FILLS_SECTION,
  serializeEsgFillMark,
  type EsgFillProposal,
  type EsgWorkbookLike,
} from "@/lib/esg/esgAiReviewFill";
import { writeEsgGridCells, type EsgGridRow } from "@/lib/esg/esgGridRows";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const AXES = { eSites: "North\nSouth", eFirstMonth: "Jan-25", eMonthCount: 3 };

const WASTE = writeEsgGridCells(
  "waste",
  [
    { month: "Jan-25", depot: "North", wasteType: "Cardboard", totalKg: 100 },
    { month: "Feb-25", depot: "North", wasteType: "Cardboard", totalKg: 200 },
    { month: "Mar-25", depot: "South", wasteType: "Plastic", totalKg: 300 },
  ].map((r, i) => ({ _id: `w${i}`, ...r }) as EsgGridRow),
);

const workbook = (extra: Record<string, Record<string, unknown>> = {}): EsgWorkbookLike => ({
  sections: Object.fromEntries(
    Object.entries({ "e-data": { ...AXES }, waste: WASTE, "company-reporting-setup": {}, ...extra }).map(([id, cells]) => [id, { cells }]),
  ),
});

function setup(wb: EsgWorkbookLike, opts: { locked?: boolean } = {}) {
  const onApplyFills = vi.fn(async (list: EsgFillProposal[]) => ({ applied: list.map((p) => p.id), skipped: [] }));
  const onUndoFill = vi.fn(async () => {});
  const onUndoAllFills = vi.fn(async () => {});
  const onOpenSection = vi.fn();
  render(
    <EsgAiReviewModal
      companyId="C-REVIEW"
      companyName="Kestrel Freight"
      workbook={wb}
      locked={opts.locked}
      onApplyFills={onApplyFills}
      onUndoFill={onUndoFill}
      onUndoAllFills={onUndoAllFills}
      onOpenSection={onOpenSection}
    />,
  );
  return { onApplyFills, onUndoFill, onUndoAllFills, onOpenSection };
}

describe("EsgAiReviewModal", () => {
  it("shows each fill with its value, kind, reason and evidence, and applies one that leaves the score alone", async () => {
    const { onApplyFills } = setup(workbook());
    expect(screen.getByTestId("esg-ai-review-badge")).toHaveTextContent("2");
    fireEvent.click(screen.getByTestId("esg-ai-review-open"));
    const modal = screen.getByTestId("esg-ai-review-modal");
    const waste = within(modal).getByTestId("esg-review-fill-esgfill_e-data-L68");
    expect(waste).toHaveTextContent("Environmental data · Total waste (kg)");
    expect(waste).toHaveTextContent("600");
    expect(within(waste).getByTestId("esg-review-fill-kind-esgfill_e-data-L68")).toHaveTextContent("Derived · sum");
    expect(waste).toHaveTextContent("Evidence (3)");
    const entity = within(modal).getByTestId("esg-review-fill-esgfill_company-reporting-setup-entity");
    expect(within(entity).getByTestId("esg-review-fill-kind-esgfill_company-reporting-setup-entity")).toHaveTextContent("Read · copy");
    expect(entity).not.toHaveTextContent("Changes your score");

    fireEvent.click(within(entity).getByTestId("esg-review-fill-apply-esgfill_company-reporting-setup-entity"));
    await waitFor(() => expect(onApplyFills).toHaveBeenCalledTimes(1));
    expect(onApplyFills.mock.calls[0][0].map((p) => p.key)).toEqual(["company-reporting-setup!entity"]);
    expect(await screen.findByTestId("esg-review-apply-notice")).toHaveTextContent("Filled 1 cell.");
  });

  it("runs the model pass through the server, and confirms a fill that changes the score before applying it", async () => {
    const proposal: EsgFillProposal = {
      id: "esgfill_g-data-B15",
      section: "g-data",
      cell: "B15",
      key: "g-data!B15",
      sectionLabel: "Governance data",
      cellLabel: "Governance data · Code of ethics in place (Y/N)",
      value: "Yes",
      kind: "read",
      rule: "policy",
      reasoning: "The policy says the board approved it.",
      evidence: [{ type: "document", file: "ethics-policy.pdf", quote: "The board approved the code of ethics" }],
      origin: "model",
    };
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({
        proposals: [proposal],
        questions: [{ id: "esgask_g-data-B16_model", section: "g-data", cell: "B16", key: "g-data!B16", cellLabel: "Governance data · Whistleblower hotline active (Y/N)", question: "Is the hotline running?", origin: "model" }],
        considered: 2,
        rejected: 1,
        truncated: 0,
        documents: 1,
        notes: ["1 document is for months outside your reporting year and was left out: old.pdf (Dec-24)."],
        modelCalls: 1,
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { onApplyFills, onOpenSection } = setup(workbook());
    fireEvent.click(screen.getByTestId("esg-ai-review-open"));
    fireEvent.click(screen.getByTestId("esg-review-run-ai"));
    expect(await screen.findByTestId("esg-review-ai-summary")).toHaveTextContent(
      "Read 1 filed document and checked 2 cells with AI: 1 fill, 1 question, 1 answer dropped because your documents did not back it.",
    );
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/esg\/workbook\/C-REVIEW\/ai-review$/);
    expect(screen.getByTestId("esg-review-notes")).toHaveTextContent("outside your reporting year");

    const card = screen.getByTestId("esg-review-fill-esgfill_g-data-B15");
    expect(card).toHaveTextContent("Read · policy");
    expect(within(card).getByTestId("esg-review-fill-score-esgfill_g-data-B15")).toHaveTextContent("Changes your score");

    fireEvent.click(within(card).getByTestId("esg-review-fill-apply-esgfill_g-data-B15"));
    const summary = screen.getByTestId("esg-review-score-summary");
    expect(summary).toHaveTextContent("This changes your score");
    expect(summary).toHaveTextContent("Governance data · Code of ethics in place (Y/N) → Yes (read)");
    expect(within(summary).getByTestId("esg-review-score-change")).toHaveTextContent(
      /^Overall score \d+(\.\d+)?% → \d+(\.\d+)?% · Governance \d+(\.\d+)? → \d+(\.\d+)? points$/,
    );
    expect(onApplyFills).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("esg-review-confirm-apply"));
    await waitFor(() => expect(onApplyFills).toHaveBeenCalledTimes(1));
    expect(onApplyFills.mock.calls[0][0][0].key).toBe("g-data!B15");

    const question = screen.getByTestId("esg-review-question-esgask_g-data-B16_model");
    expect(question).toHaveTextContent("Is the hotline running?");
    fireEvent.click(within(question).getByText("Open"));
    expect(onOpenSection).toHaveBeenCalledWith("g-data");
  });

  it("shows a stated unit conversion on the card", () => {
    setup(
      workbook({
        disputes: {
          "e-data!water_C14": JSON.stringify({ candidates: [{ value: 0.79, sources: ["a.pdf"], unit: "kL" }, { value: 790, sources: ["b.pdf"], unit: "L" }] }),
        },
      }),
    );
    fireEvent.click(screen.getByTestId("esg-ai-review-open"));
    const water = screen.getByTestId("esg-review-fill-esgfill_e-data-water_C14");
    expect(water).toHaveTextContent("Read · units");
    expect(within(water).getByTestId("esg-review-fill-conversion-esgfill_e-data-water_C14")).toHaveTextContent("Converted: 790 L = 0.79 kL (÷1000)");
  });

  it("asks before Apply all when a fill changes the score, lists only those, and Cancel applies nothing", async () => {
    const policyFill: EsgFillProposal = {
      id: "esgfill_g-data-B15",
      section: "g-data",
      cell: "B15",
      key: "g-data!B15",
      sectionLabel: "Governance data",
      cellLabel: "Governance data · Code of ethics in place (Y/N)",
      value: "Yes",
      kind: "read",
      rule: "policy",
      reasoning: "The policy says so.",
      evidence: [{ type: "document", file: "ethics-policy.pdf", quote: "The board approved the code of ethics" }],
      origin: "model",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ proposals: [policyFill], questions: [], considered: 1, rejected: 0, truncated: 0, documents: 1, notes: [] }) })),
    );
    const { onApplyFills } = setup(workbook());
    fireEvent.click(screen.getByTestId("esg-ai-review-open"));
    fireEvent.click(screen.getByTestId("esg-review-run-ai"));
    await screen.findByTestId("esg-review-fill-esgfill_g-data-B15");
    expect(screen.getByTestId("esg-review-ready-line")).toHaveTextContent("3 fills ready · 1 changes your score");

    fireEvent.click(screen.getByTestId("esg-review-apply-all"));
    const summary = screen.getByTestId("esg-review-score-summary");
    expect(summary).toHaveTextContent("These change your score");
    expect(summary).toHaveTextContent("Code of ethics");
    expect(summary).not.toHaveTextContent("Total waste");
    fireEvent.click(screen.getByTestId("esg-review-cancel-apply"));
    expect(screen.queryByTestId("esg-review-score-summary")).not.toBeInTheDocument();
    expect(onApplyFills).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("esg-review-apply-all"));
    fireEvent.click(screen.getByTestId("esg-review-confirm-apply"));
    await waitFor(() => expect(onApplyFills).toHaveBeenCalledTimes(1));
    expect(onApplyFills.mock.calls[0][0].map((p) => p.key).sort()).toEqual(["company-reporting-setup!entity", "e-data!L68", "g-data!B15"]);
  });

  it("lists the review's standing fills with Undo and Undo all", async () => {
    const mark = serializeEsgFillMark({ v: "Kestrel Freight", kind: "read", rule: "copy", reason: "The company record names it.", evidence: [], replaced: null, origin: "rules", at: "2025-04-01T00:00:00.000Z" });
    const wb = workbook({ "company-reporting-setup": { entity: "Kestrel Freight" }, [ESG_AI_FILLS_SECTION]: { "company-reporting-setup!entity": mark } });
    const { onUndoFill, onUndoAllFills } = setup(wb);
    fireEvent.click(screen.getByTestId("esg-ai-review-open"));
    const list = screen.getByTestId("esg-review-ai-fills");
    expect(list).toHaveTextContent("Filled by AI review · 1");
    expect(list).toHaveTextContent("Kestrel Freight · read · copy — The company record names it.");
    fireEvent.click(screen.getByTestId("esg-review-undo-company-reporting-setup!entity"));
    await waitFor(() => expect(onUndoFill).toHaveBeenCalledWith("company-reporting-setup!entity"));
    fireEvent.click(screen.getByTestId("esg-review-undo-all"));
    await waitFor(() => expect(onUndoAllFills).toHaveBeenCalledTimes(1));
  });

  it("offers nothing to apply or undo on a submitted workbook", () => {
    setup(workbook(), { locked: true });
    fireEvent.click(screen.getByTestId("esg-ai-review-open"));
    expect(screen.getByTestId("esg-review-locked")).toBeInTheDocument();
    expect(screen.queryByTestId("esg-review-apply-all")).not.toBeInTheDocument();
    expect(screen.queryByTestId("esg-review-fill-apply-esgfill_e-data-L68")).not.toBeInTheDocument();
    expect(screen.queryByTestId("esg-review-run-ai")).not.toBeInTheDocument();
  });
});
