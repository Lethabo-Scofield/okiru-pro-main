// @vitest-environment jsdom
/**
 * The ESG workbook, as the document flow leaves it:
 *  - a cell a document filled carries a mark naming the file and the day, and
 *    says "edited since" once someone changes it;
 *  - a cell two documents disagree on is marked, with both values and files;
 *  - a month's figure is never cropped ("8C" for 800), totals read "1 630";
 *  - the Source column names the documents behind a row;
 *  - the rule list is folded behind its count;
 *  - Template / Import / Export sit behind "More";
 *  - documents read from inside a filled workbook say what they add and what
 *    they replace before anything is written.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { EsgCellSourcesProvider, EsgCellMark, describeCellSource } from "../EsgCellSourceMark";
import { EsgMonthlyGrid } from "../EsgMonthlyGrid";
import { EsgValidationPanel } from "../EsgValidationPanel";
import { EsgWorkbookMoreMenu, ESG_MORE_ITEM } from "../EsgWorkbookMoreMenu";
import { EsgDocumentWriteConfirm, describeEsgWrite, esgWriteCounts } from "../EsgDocumentWriteConfirm";
import { conflictCells, provenanceCells } from "@/lib/esg/esgProvenance";
import { analyseEsgImport } from "@/lib/esg/esgImportAnalysis";

afterEach(() => cleanup());

const NOW = new Date("2025-10-06T09:00:00Z");
const workbook = {
  sections: {
    "e-data": { cells: { s1a_C14: 800, s1a_D14: 425 } },
    provenance: {
      cells: {
        ...provenanceCells(
          [
            { sectionId: "e-data", cellRef: "s1a_C14", value: 800, sourceFile: "Fills.xlsx › Fills", documentId: "d" },
            { sectionId: "e-data", cellRef: "s1a_D14", value: 425, sourceFile: "Fills.xlsx › Fills", documentId: "d" },
          ],
          NOW,
        ),
        ...conflictCells(
          [{ sectionId: "e-data", cellRef: "s1a_D15", candidates: [{ value: 773, sources: ["Fills.xlsx › Fills"] }, { value: 790, sources: ["Card.pdf"] }] }],
          NOW,
        ),
      },
    },
  },
};

describe("the mark on a cell", () => {
  it("names the document and the day, and nothing on a typed cell", () => {
    render(
      <EsgCellSourcesProvider workbook={workbook} sectionId="e-data">
        <EsgCellMark cellRef="s1a_C14" value={800} />
        <EsgCellMark cellRef="s1a_E14" value={405} testId="typed" />
      </EsgCellSourcesProvider>,
    );
    const mark = screen.getByTestId("esg-cell-mark-s1a_C14");
    expect(mark).toHaveAttribute("data-state", "placed");
    expect(mark).toHaveAttribute("title", "From Fills.xlsx › Fills, placed 6 Oct 2025.");
    expect(screen.queryByTestId("typed")).not.toBeInTheDocument();
    fireEvent.click(mark);
    expect(screen.getByTestId("esg-cell-mark-s1a_C14-panel")).toHaveTextContent("Fills.xlsx › Fills");
  });

  it("says 'edited since' once the cell no longer holds what the document said", () => {
    render(
      <EsgCellSourcesProvider workbook={workbook} sectionId="e-data">
        <EsgCellMark cellRef="s1a_D14" value={430} />
      </EsgCellSourcesProvider>,
    );
    const mark = screen.getByTestId("esg-cell-mark-s1a_D14");
    expect(mark).toHaveAttribute("data-state", "edited");
    fireEvent.click(mark);
    expect(screen.getByTestId("esg-cell-mark-s1a_D14-edited")).toHaveTextContent("the document said 425");
  });

  it("marks a cell the documents disagree on with both values and their files", () => {
    render(
      <EsgCellSourcesProvider workbook={workbook} sectionId="e-data">
        <EsgCellMark cellRef="s1a_D15" value="" />
      </EsgCellSourcesProvider>,
    );
    const mark = screen.getByTestId("esg-cell-mark-s1a_D15");
    expect(mark).toHaveAttribute("data-state", "conflict");
    expect(mark).toHaveAccessibleName("Documents disagree on this figure");
    fireEvent.click(mark);
    const panel = screen.getByTestId("esg-cell-mark-s1a_D15-panel");
    expect(panel).toHaveTextContent("773");
    expect(panel).toHaveTextContent("790");
    expect(panel).toHaveTextContent("Card.pdf");
  });

  it("says, once someone enters the figure, that the documents had disagreed", () => {
    expect(
      describeCellSource({ conflict: { sectionId: "e-data", cellRef: "x", foundAt: "", candidates: [{ value: 1, sources: [] }, { value: 2, sources: [] }] } }, 2),
    ).toContain("entered by hand");
  });
});

describe("the monthly grid", () => {
  const months = ["Jul-25", "Aug-25", "Sep-25"];
  const renderGrid = () =>
    render(
      <EsgCellSourcesProvider workbook={workbook} sectionId="e-data">
        <EsgMonthlyGrid
          rows={[{ depot: "Site A", months: [] }, { depot: "Site B", months: [] }]}
          months={months}
          cellPrefix="s1a"
          emissionFactor={2.68}
          unitLabel="L diesel"
          values={{ s1a_C14: 800, s1a_D14: 425, s1a_E14: 405 }}
          onChange={vi.fn()}
        />
      </EsgCellSourcesProvider>,
    );

  it("gives every month room for its figure, and widens the page while it is shown", () => {
    renderGrid();
    const grid = screen.getByTestId("esg-monthly-grid-s1a");
    expect(grid).toHaveAttribute("data-wide-grid");
    const input = within(grid).getAllByRole("spinbutton")[0];
    expect(input.className).toContain("min-w-[3.75rem]");
    expect(input.className).toContain("tabular-nums");
  });

  it("writes totals by the one ESG number rule", () => {
    renderGrid();
    expect(screen.getByTestId("ytd-0").textContent).toBe("1 630");
    expect(screen.getByTestId("tco2-0").textContent).toBe("4.37");
  });

  it("names the documents behind a row in its Source column, and marks the disputed cell", () => {
    renderGrid();
    expect(screen.getByTestId("esg-monthly-src-s1a-0")).toHaveAttribute("placeholder", "Fills.xlsx › Fills");
    expect(screen.getByTestId("esg-monthly-src-s1a-1")).toHaveAttribute("placeholder", "");
    expect(screen.getByTestId("esg-cell-mark-s1a_D15")).toHaveAttribute("data-state", "conflict");
  });
});

describe("the rule list", () => {
  it("is folded behind its count", () => {
    render(<EsgValidationPanel workbook={null} />);
    const panel = screen.getByTestId("esg-validation-panel");
    expect(panel.querySelector("details")).not.toHaveAttribute("open");
    expect(screen.getByTestId("esg-validation-summary")).toHaveTextContent(/passing/);
    expect(panel).not.toHaveTextContent("Active:");
  });
});

describe("More", () => {
  it("keeps the occasional actions folded, but in the page", () => {
    render(
      <EsgWorkbookMoreMenu>
        <button type="button" className={ESG_MORE_ITEM} data-closes-menu="" data-testid="button-esg-import-xlsx">
          Import
        </button>
        <a href="/export" className={ESG_MORE_ITEM} data-testid="button-esg-export">
          Export
        </a>
      </EsgWorkbookMoreMenu>,
    );
    const list = screen.getByTestId("esg-more-menu");
    expect(list).not.toBeVisible();
    expect(within(list).getByTestId("button-esg-import-xlsx")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("button-esg-more"));
    expect(list).toBeVisible();
    fireEvent.click(screen.getByTestId("button-esg-import-xlsx"));
    expect(list).not.toBeVisible();
  });
});

describe("adding documents to a filled workbook", () => {
  const filled = { sections: { "e-data": { cells: { s1a_C14: 790, eSites: "Site A" } } } };
  const patches = { "e-data": { cells: { s1a_C14: 800, s1a_D14: 425, eSites: "Site A" } } };

  it("counts what it adds and what it replaces, figures only", () => {
    const counts = esgWriteCounts(analyseEsgImport({ sections: patches, warnings: [], unmatchedSheets: [] }, filled));
    expect(counts).toEqual({ adds: 1, replaces: 1, rows: 0 });
    expect(describeEsgWrite(counts)).toBe("Adds 1 figure · replaces 1 you entered");
  });

  it("asks before writing, and writes only on a yes", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <EsgDocumentWriteConfirm
        open
        patches={patches}
        workbook={filled}
        target="Environmental data"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("Add these figures to Environmental data?");
    expect(screen.getByTestId("esg-write-confirm-summary")).toHaveTextContent("Adds 1 figure · replaces 1 you entered.");
    expect(screen.getByTestId("esg-write-confirm-yes")).toHaveTextContent("Add and replace 1");
    fireEvent.click(screen.getByTestId("esg-write-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("esg-write-confirm-yes"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
