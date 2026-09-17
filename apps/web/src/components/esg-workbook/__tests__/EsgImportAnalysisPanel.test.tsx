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
import { render, screen } from "@testing-library/react";
import { EsgImportAnalysisPanel } from "../EsgImportAnalysisPanel";
import { analyseEsgImport } from "@/lib/esg/esgImportAnalysis";
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
      preview({ fleet: { B4: 1310 } }),
      workbook({ fleet: { B4: 1240 } }),
    );
    render(<EsgImportAnalysisPanel analysis={analysis} sectionLabels={{ fleet: "Fleet" }} />);

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
      preview({ fleet: { B4: 1310, B5: "JR45DZGP", B6: "JR45DZGP" } }),
      workbook({ fleet: { B4: 1240 } }),
    );
    render(<EsgImportAnalysisPanel analysis={analysis} sectionLabels={{ fleet: "Fleet" }} />);
    expect(screen.getByTestId("esg-import-overwrites")).toHaveTextContent(/replaced/i);
    expect(screen.getByTestId("esg-import-duplicates")).toHaveTextContent(/more than once/i);
  });
});
