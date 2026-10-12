/**
 * @vitest-environment jsdom
 *
 * One marker per ESG cell: the AI review's fill (with its reason, evidence and
 * Undo), the document a value came from, or the documents' disagreement. It
 * shows only while the cell still holds what the mark is about, and nothing
 * at all without the workbook page's provider. Wired into the monthly grids,
 * the scalar forms, the maturity grids and the registers. Invented data only.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { EsgCellMarkContext, EsgCellSectionContext } from "../EsgCellMark";
import { EsgMonthlyGrid } from "../EsgMonthlyGrid";
import { EsgScalarForm } from "../EsgScalarForm";
import { EsgMaturityGrid } from "../EsgMaturityGrid";
import { EsgRegisterGrid } from "../EsgRegisterGrid";
import { G_DATA_MATURITY_ROWS } from "../esgSectionConfigs";
import { useEsgStore } from "../../../../EsgToolkit/src/lib/esgStore";
import {
  ESG_AI_FILLS_SECTION,
  ESG_DISPUTES_SECTION,
  buildEsgCellMarkIndex,
  esgDisputeCells,
  serializeEsgFillMark,
  type EsgWorkbookLike,
} from "@/lib/esg/esgAiReviewFill";
import { ESG_PROVENANCE_SECTION, provenanceCells } from "@/lib/esg/esgProvenance";
import { writeEsgGridCells, type EsgGridRow } from "@/lib/esg/esgGridRows";

afterEach(cleanup);

const fill = (v: string) =>
  serializeEsgFillMark({
    v,
    kind: "read",
    rule: "site",
    reason: "The bill's supply address is the South depot.",
    evidence: [{ type: "document", file: "harbour-mar.pdf", quote: "Unit 9, Harbour Park" }],
    replaced: null,
    origin: "model",
    at: "2025-04-01T00:00:00.000Z",
  });

const WB: EsgWorkbookLike = {
  sections: {
    [ESG_AI_FILLS_SECTION]: { cells: { "e-data!s2_C14": fill("700"), "g-data!B15": fill("Yes"), "fleet!B4": fill("North") } },
    [ESG_PROVENANCE_SECTION]: {
      cells: provenanceCells([{ sectionId: "e-data", cellRef: "s2_D14", value: 900, sourceFile: "north-feb.pdf", documentId: "d2" }]),
    },
    [ESG_DISPUTES_SECTION]: {
      cells: esgDisputeCells([{ sectionId: "e-data", cellRef: "s2_E14", candidates: [{ value: 410, sources: ["a.pdf"] }, { value: 440, sources: ["b.pdf"] }] }]),
    },
  },
};

function withMarks(section: string, children: ReactNode, onUndo?: (key: string) => void) {
  return (
    <EsgCellMarkContext.Provider value={{ index: buildEsgCellMarkIndex(WB), onUndo }}>
      <EsgCellSectionContext.Provider value={section}>{children}</EsgCellSectionContext.Provider>
    </EsgCellMarkContext.Provider>
  );
}

const grid = (values: Record<string, string | number | boolean | null>) => (
  <EsgMonthlyGrid rows={[{ depot: "North", months: [] }]} months={["Jan-25", "Feb-25", "Mar-25"]} cellPrefix="s2" unitLabel="kWh" values={values} onChange={() => {}} />
);

describe("EsgCellMark in the monthly grid", () => {
  it("marks a filled cell, a document's cell and a disputed blank cell — each once", () => {
    render(withMarks("e-data", grid({ s2_C14: 700, s2_D14: 900 })));
    expect(screen.getByTestId("esg-cell-mark-e-data!s2_C14")).toHaveAttribute("data-mark-kind", "ai");
    expect(screen.getByTestId("esg-cell-mark-e-data!s2_D14")).toHaveAttribute("data-mark-kind", "document");
    expect(screen.getByTestId("esg-cell-mark-e-data!s2_E14")).toHaveAttribute("data-mark-kind", "dispute");
    expect(screen.getByTestId("esg-cell-mark-e-data!s2_E14")).toHaveAttribute("title", "Documents disagree: 410 (a.pdf) or 440 (b.pdf)");
  });

  it("opens the fill's reason and evidence, and Undo hands back the cell's key", () => {
    const onUndo = vi.fn();
    render(withMarks("e-data", grid({ s2_C14: 700 }), onUndo));
    fireEvent.click(screen.getByTestId("esg-cell-mark-e-data!s2_C14"));
    const panel = screen.getByTestId("esg-cell-mark-e-data!s2_C14-panel");
    expect(panel).toHaveTextContent("Filled by AI review · Read · site");
    expect(panel).toHaveTextContent("The bill's supply address is the South depot.");
    expect(panel).toHaveTextContent("harbour-mar.pdf — “Unit 9, Harbour Park”");
    fireEvent.click(screen.getByTestId("esg-cell-mark-e-data!s2_C14-undo"));
    expect(onUndo).toHaveBeenCalledWith("e-data!s2_C14");
  });

  it("drops every mark once the user changes the value, and offers no Undo on a locked workbook", () => {
    render(withMarks("e-data", grid({ s2_C14: 701, s2_D14: 901, s2_E14: 420 })));
    expect(screen.queryByTestId("esg-cell-mark-e-data!s2_C14")).not.toBeInTheDocument();
    expect(screen.queryByTestId("esg-cell-mark-e-data!s2_D14")).not.toBeInTheDocument();
    expect(screen.queryByTestId("esg-cell-mark-e-data!s2_E14")).not.toBeInTheDocument();
    cleanup();
    render(withMarks("e-data", grid({ s2_C14: 700 })));
    fireEvent.click(screen.getByTestId("esg-cell-mark-e-data!s2_C14"));
    expect(screen.queryByTestId("esg-cell-mark-e-data!s2_C14-undo")).not.toBeInTheDocument();
  });

  it("renders nothing without the workbook page's provider", () => {
    render(grid({ s2_C14: 700, s2_D14: 900 }));
    expect(screen.queryByTestId(/esg-cell-mark-/)).not.toBeInTheDocument();
  });
});

describe("EsgCellMark in the other editors", () => {
  it("marks a scalar field and a governance answer", () => {
    render(
      withMarks(
        "g-data",
        <EsgMaturityGrid rows={G_DATA_MATURITY_ROWS.filter((r) => r.cell === "B15")} values={{ B15: "Yes" }} onChange={() => {}} />,
      ),
    );
    expect(screen.getByTestId("esg-cell-mark-g-data!B15")).toHaveAttribute("data-mark-kind", "ai");
    cleanup();
    const doc: EsgWorkbookLike = { sections: { [ESG_PROVENANCE_SECTION]: { cells: provenanceCells([{ sectionId: "s-data", cellRef: "B43", value: 500000, sourceFile: "payroll.xlsx", documentId: "p" }]) } } };
    render(
      <EsgCellMarkContext.Provider value={{ index: buildEsgCellMarkIndex(doc) }}>
        <EsgCellSectionContext.Provider value="s-data">
          <EsgScalarForm fields={[{ cell: "B43", label: "Leviable payroll (R)", type: "number" }]} values={{ B43: 500000 }} onChange={() => {}} />
        </EsgCellSectionContext.Provider>
      </EsgCellMarkContext.Provider>,
    );
    expect(screen.getByTestId("esg-cell-mark-s-data!B43")).toHaveAttribute("data-mark-kind", "document");
  });

  it("marks a register cell by its stored address", () => {
    const fleet = writeEsgGridCells("fleet", [{ _id: "v1", reg: "AB 12 CD", depot: "North" } as EsgGridRow]);
    useEsgStore.setState({ workbook: { companyId: "C", updatedAt: "", sections: { fleet: { cells: fleet } } } as never, submittedAt: null });
    render(
      <EsgCellMarkContext.Provider value={{ index: buildEsgCellMarkIndex(WB) }}>
        <EsgRegisterGrid sectionId="fleet" />
      </EsgCellMarkContext.Provider>,
    );
    // Row 1 of the fleet register is sheet row 4; Depot is column B.
    expect(screen.getByTestId("esg-cell-mark-fleet!B4")).toHaveAttribute("data-mark-kind", "ai");
  });
});
