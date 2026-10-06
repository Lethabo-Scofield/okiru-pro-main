/**
 * @vitest-environment jsdom
 *
 * The panel exists so that confirming an import means something.
 *
 * The dialog it replaces said "4 section(s) will be updated" and offered
 * Confirm — a user agreeing to something nobody had described. These tests pin
 * the parts that make the confirmation informed: the replacement shows BOTH
 * values, a partial upload says what it leaves alone, and the reassuring counts
 * never appear above the decisions.
 */
import { describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EsgImportAnalysisPanel } from "../EsgImportAnalysisPanel";
import { analyseEsgImport } from "@/lib/esg/esgImportAnalysis";
import { mergeEsgSectionCells } from "@/lib/esg/esgGridRows";
import type { EsgImportPreview } from "@/lib/esg/esgWorkbookImport";

const preview = (sections: Record<string, Record<string, unknown>>): EsgImportPreview => ({
  sections: Object.fromEntries(Object.entries(sections).map(([id, cells]) => [id, { cells }])),
  warnings: [],
  unmatchedSheets: [],
}) as unknown as EsgImportPreview;

const workbook = (sections: Record<string, Record<string, unknown>>) => ({
  sections: Object.fromEntries(Object.entries(sections).map(([id, cells]) => [id, { cells }])),
});

describe("EsgImportAnalysisPanel", () => {
  it("shows a replacement as before AND after, not as a count", () => {
    // "300 cells changed" is not a decision. "1,240 → 1,310" is.
    const analysis = analyseEsgImport(
      preview({ "e-data": { B4: 1310 } }),
      workbook({ "e-data": { B4: 1240 } }),
    );
    render(<EsgImportAnalysisPanel analysis={analysis} sectionLabels={{ "e-data": "Environmental" }} />);

    const block = screen.getByTestId("esg-import-overwrites");
    expect(block).toHaveTextContent("1240");
    expect(block).toHaveTextContent("1310");
    expect(block).toHaveTextContent(/already captured will be replaced/i);
  });

  it("says nothing about replacements when there is nothing to replace", () => {
    const analysis = analyseEsgImport(preview({ fleet: { B4: 1310 } }), null);
    render(<EsgImportAnalysisPanel analysis={analysis} />);
    expect(screen.queryByTestId("esg-import-overwrites")).not.toBeInTheDocument();
  });

  it("states that a partial upload leaves the other sections alone", () => {
    // The fear this answers: "if I import just my fleet list, do I lose
    // everything else?"
    const analysis = analyseEsgImport(preview({ fleet: { B4: 1 } }), null);
    render(<EsgImportAnalysisPanel analysis={analysis} sectionLabels={{ fleet: "Fleet" }} />);

    const scope = screen.getByTestId("esg-import-scope");
    expect(scope).toHaveTextContent(/partial upload/i);
    expect(scope).toHaveTextContent(/left\s+unchanged/i);
    expect(scope).toHaveTextContent(/never clears the rest/i);
  });

  it("flags a value repeated inside the file", () => {
    const analysis = analyseEsgImport(
      preview({ fleet: { B4: "JR45DZGP", B5: "JR45DZGP" } }),
      null,
    );
    render(<EsgImportAnalysisPanel analysis={analysis} sectionLabels={{ fleet: "Fleet" }} />);
    expect(screen.getByTestId("esg-import-duplicates")).toHaveTextContent("JR45DZGP");
  });

  it("carries unmatched sheets through so a foreign workbook explains itself", () => {
    const p = preview({ fleet: { B4: 1 } });
    (p as unknown as { unmatchedSheets: string[] }).unmatchedSheets = ["Client Sector Data"];
    render(<EsgImportAnalysisPanel analysis={analyseEsgImport(p, null)} />);
    expect(screen.getByText(/Client Sector Data/)).toBeInTheDocument();
  });

  it("never uses colour as the only signal — each warning carries words", () => {
    const analysis = analyseEsgImport(
      preview({ "e-data": { B4: 1310, B5: "JR45DZGP", B6: "JR45DZGP" } }),
      workbook({ "e-data": { B4: 1240 } }),
    );
    render(<EsgImportAnalysisPanel analysis={analysis} sectionLabels={{ "e-data": "Environmental" }} />);
    expect(screen.getByTestId("esg-import-overwrites")).toHaveTextContent(/replaced/i);
    expect(screen.getByTestId("esg-import-duplicates")).toHaveTextContent(/more than once/i);
  });

  it("says what happens to a register in words: rows updated and added, none removed", () => {
    const fleetRow = (reg: string, km: number) => ({ A: reg, I: km });
    const cells = (rows: Array<{ A: string; I: number }>) => {
      const out: Record<string, unknown> = { _row_count: rows.length };
      rows.forEach((r, i) => {
        out[`A${4 + i}`] = r.A;
        out[`I${4 + i}`] = r.I;
      });
      return out;
    };
    const analysis = analyseEsgImport(
      preview({ fleet: cells([fleetRow("JR45DZGP", 1300), fleetRow("NEW001GP", 400)]) }),
      workbook({ fleet: cells([fleetRow("JR45DZGP", 1200), fleetRow("KX11AAGP", 900)]) }),
    );
    render(<EsgImportAnalysisPanel analysis={analysis} sectionLabels={{ fleet: "Fleet" }} />);
    const block = screen.getByTestId("esg-import-registers");
    expect(block).toHaveTextContent(/none removed/i);
    expect(block).toHaveTextContent("Fleet: 1 row added, 1 updated (2 already there)");
  });

  it("offers to replace a register that already has rows, and says plainly what a replace removes", () => {
    const rows = (regs: string[]) =>
      mergeEsgSectionCells("fleet", regs.map((reg, i) => ({ _id: String(i), reg })), {});
    const imported = preview({ fleet: rows(["AA11BBGP"]) });
    const current = workbook({ fleet: rows(["AA11BBGP", "CC22DDGP", "EE33FFGP"]) });
    const choices: Array<[string, boolean]> = [];

    const { unmount } = render(
      <EsgImportAnalysisPanel
        analysis={analyseEsgImport(imported, current)}
        sectionLabels={{ fleet: "Fleet" }}
        onReplaceChange={(id, on) => choices.push([id, on])}
      />,
    );
    const choose = screen.getByLabelText("How to import Fleet");
    expect(choose).toHaveValue("merge");
    fireEvent.change(choose, { target: { value: "replace" } });
    expect(choices).toEqual([["fleet", true]]);
    unmount();

    render(
      <EsgImportAnalysisPanel
        analysis={analyseEsgImport(imported, current, new Set(["fleet"]))}
        sectionLabels={{ fleet: "Fleet" }}
        replace={new Set(["fleet"])}
        onReplaceChange={() => {}}
      />,
    );
    expect(screen.getByTestId("esg-import-register-fleet")).toHaveTextContent(
      "Fleet: replaced with the file's 1 row — the 3 rows in the workbook now go",
    );
  });
});
