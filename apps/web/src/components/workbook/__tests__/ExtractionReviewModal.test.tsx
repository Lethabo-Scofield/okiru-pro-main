/**
 * @vitest-environment jsdom
 *
 * The AI review modal's contract with the user: fills show their kind, reason
 * and evidence; "Apply all" lists what changes the score before it writes;
 * the model pass is one request and its answers join the list; every fill
 * already made can be undone.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ExtractionReviewModal } from "../ExtractionReviewModal";
import { applyFillProposals, buildRuleFills, type FillProposal } from "@/lib/aiReviewFill";
import type { WorkbookSectionsInput } from "../workbookValidation";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const sections = (): WorkbookSectionsInput => ({
  "company-information": { meta: { companyName: "Example Co", financialYearEnd: "28/02/2025" } },
  "skills-development": {
    rows: [{ _id: "s1", programName: "Forklift course", learnerName: "Learner One", courseCost: 1200, travelCost: 300, _sourceFiles: ["training.xlsx"] }],
  },
  sed: {
    rows: [{ _id: "d1", beneficiaryName: "Riverside Trust", descriptionOfSpend: "Bursary for learners", amount: 2000, percentBenefitingBlack: 100, _sourceFiles: ["sed.xlsx"] }],
  },
});

function renderModal(over: Partial<Parameters<typeof ExtractionReviewModal>[0]> = {}, data = sections()) {
  const onApplyFills = vi.fn((list: FillProposal[]) => ({ applied: list.map((p) => p.id), skipped: [] }));
  const onUndoFill = vi.fn();
  const onUndoAllFills = vi.fn();
  render(
    <ExtractionReviewModal
      sections={data}
      onApplyCellUpdates={vi.fn()}
      onNavigateToSection={vi.fn()}
      onApplyFills={onApplyFills}
      onUndoFill={onUndoFill}
      onUndoAllFills={onUndoAllFills}
      companyId="C-1"
      {...over}
    />,
  );
  fireEvent.click(screen.getByTestId("extraction-review-open"));
  return { onApplyFills, onUndoFill, onUndoAllFills };
}

describe("ExtractionReviewModal", () => {
  it("shows each fill with its kind, reason and evidence, derived never shown as read", () => {
    renderModal();
    const total = screen.getByTestId("review-fill-fill_skills-development_s1_totalCost");
    expect(within(total).getByText("1500")).toBeInTheDocument();
    expect(screen.getByTestId("review-fill-kind-fill_skills-development_s1_totalCost")).toHaveTextContent(/^Derived · sum$/);
    expect(total).toHaveTextContent(/Total of this row's 2 cost lines/);
    expect(total).toHaveTextContent(/Changes your score/);
    expect(within(total).getByText(/Evidence \(2\)/)).toBeInTheDocument();
    expect(total).toHaveTextContent(/Course Cost \(R\) = 1200 \(from training\.xlsx\)/);
  });

  it("lists what changes the score before Apply all writes, then applies them all", async () => {
    const { onApplyFills } = renderModal();
    fireEvent.click(screen.getByTestId("review-apply-all-suggestions"));
    expect(onApplyFills).not.toHaveBeenCalled();
    const summary = screen.getByTestId("review-score-summary");
    expect(summary).toHaveTextContent(/These change your score/);
    expect(summary).toHaveTextContent(/Total Cost \(R\) → 1500/);
    fireEvent.click(screen.getByTestId("review-confirm-apply"));
    await waitFor(() => expect(onApplyFills).toHaveBeenCalledTimes(1));
    expect(onApplyFills.mock.calls[0][0].map((p: FillProposal) => p.column).sort()).toEqual(["measurementPeriodEnd", "totalCost"]);
    expect(await screen.findByTestId("review-apply-notice")).toHaveTextContent("Filled 2 cells.");
  });

  it("confirms a single score-changing fill before writing it; a fill that does not change the score applies at once", async () => {
    const { onApplyFills } = renderModal();
    fireEvent.click(screen.getByTestId("review-fill-apply-fill_skills-development_s1_totalCost"));
    expect(onApplyFills).not.toHaveBeenCalled();
    const summary = screen.getByTestId("review-score-summary");
    expect(summary).toHaveTextContent(/This changes your score/);
    expect(summary).toHaveTextContent(/Total Cost \(R\) → 1500/);
    expect(screen.getByTestId("review-confirm-apply")).toHaveTextContent(/^Apply$/);
    fireEvent.click(screen.getByTestId("review-confirm-apply"));
    await waitFor(() => expect(onApplyFills).toHaveBeenCalledTimes(1));
    expect(onApplyFills.mock.calls[0][0].map((p: FillProposal) => p.column)).toEqual(["totalCost"]);
  });

  it("asks instead of filling what nothing backs", () => {
    renderModal();
    expect(screen.getByTestId("review-questions")).toHaveTextContent(/full 12-month financial year, starting 01\/03\/2024/);
  });

  it("runs the AI pass as one request and adds its checked fills", async () => {
    const model: FillProposal = {
      id: "fill_sed_d1_contributionType", section: "sed", sectionLabel: "Socio-Economic Development", rowId: "d1", rowLabel: "Riverside Trust",
      column: "contributionType", columnLabel: "Contribution Type", value: "Grant Contribution", kind: "derived", rule: "classify",
      reasoning: "The description says bursary.", evidence: [], affectsScore: true, origin: "model",
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ proposals: [model], questions: [], considered: 1, rejected: 0, truncated: 0, modelCalls: 1 }), { status: 200 }),
    );
    renderModal();
    fireEvent.click(screen.getByTestId("review-run-ai"));
    await screen.findByTestId("review-fill-fill_sed_d1_contributionType");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/workbook\/C-1\/ai-review$/);
    expect(screen.getByTestId("review-ai-summary")).toHaveTextContent(/AI checked 1 cell: 1 fill, 0 questions/);
    expect(screen.getByTestId("review-fill-kind-fill_sed_d1_contributionType")).toHaveTextContent(/Derived · classify/);
  });

  it("drops a model fill once its cell holds a value", async () => {
    const model: FillProposal = {
      id: "fill_sed_d1_contributionType", section: "sed", sectionLabel: "", rowId: "d1", column: "contributionType", columnLabel: "Contribution Type",
      value: "Grant Contribution", kind: "derived", rule: "classify", reasoning: "r", evidence: [], affectsScore: true, origin: "model",
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ proposals: [model], questions: [], considered: 1, rejected: 0, truncated: 0 }), { status: 200 }),
    );
    const data = sections();
    const view = render(
      <ExtractionReviewModal sections={data} onApplyCellUpdates={vi.fn()} onNavigateToSection={vi.fn()} onApplyFills={vi.fn()} companyId="C-1" />,
    );
    fireEvent.click(screen.getByTestId("extraction-review-open"));
    fireEvent.click(screen.getByTestId("review-run-ai"));
    await screen.findByTestId("review-fill-fill_sed_d1_contributionType");
    const typed = sections();
    (typed.sed!.rows![0] as Record<string, unknown>).contributionType = "Other Monetary";
    view.rerender(
      <ExtractionReviewModal sections={typed} onApplyCellUpdates={vi.fn()} onNavigateToSection={vi.fn()} onApplyFills={vi.fn()} companyId="C-1" />,
    );
    expect(screen.queryByTestId("review-fill-fill_sed_d1_contributionType")).toBeNull();
  });

  it("lists the fills already made, each undoable, and undo all", () => {
    const data = sections();
    const { patches } = applyFillProposals(data, buildRuleFills(data).proposals);
    const filled = { ...data };
    for (const p of patches) filled[p.section] = { ...filled[p.section], ...(p.rows ? { rows: p.rows } : {}), ...(p.meta ? { meta: p.meta } : {}) };
    const { onUndoFill, onUndoAllFills } = renderModal({}, filled);
    const list = screen.getByTestId("review-ai-fills");
    expect(list).toHaveTextContent(/Filled by AI review · 2/);
    fireEvent.click(screen.getByTestId("review-undo-skills-development-s1-totalCost"));
    expect(onUndoFill).toHaveBeenCalledWith({ section: "skills-development", rowId: "s1", column: "totalCost" });
    fireEvent.click(screen.getByTestId("review-undo-all"));
    expect(onUndoAllFills).toHaveBeenCalledTimes(1);
  });
});
