/**
 * @vitest-environment jsdom
 *
 * The extraction-confidence panel turns the injector's own reports into
 * something a client can act on. The point under test: a low score reads as a
 * to-do list, not a mystery — missing required fields are named, values we could
 * not place are shown with what was read, and a clean run says so.
 */
import { describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import * as React from "react";
import { ExtractionConfidence } from "../ExtractionConfidence";
import type { ParserToWorkbookResult } from "@/lib/parserToWorkbook";

function result(over: Partial<ParserToWorkbookResult> = {}): ParserToWorkbookResult {
  return {
    rows: {},
    meta: {},
    rejected: [],
    coverage: { gaps: [], unmapped: [], complete: true },
    ...over,
  };
}

describe("ExtractionConfidence", () => {
  it("renders nothing when there was no injection", () => {
    const { container } = render(<ExtractionConfidence injected={null} rowCount={0} />);
    expect(container.firstChild).toBeNull();
  });

  it("says nothing is outstanding on a clean run", () => {
    render(<ExtractionConfidence injected={result()} rowCount={12} />);
    expect(screen.getByText(/nothing outstanding/i)).toBeInTheDocument();
    expect(screen.getByText(/12 values placed/i)).toBeInTheDocument();
  });

  it("names the required fields still needed, by their human label", () => {
    render(
      <ExtractionConfidence
        rowCount={3}
        injected={result({
          coverage: {
            gaps: [{ section: "procurement", column: "supplierName", label: "Supplier Name" }],
            unmapped: [],
            complete: false,
          },
        })}
      />,
    );

    expect(screen.getByText(/still needed/i)).toBeInTheDocument();
    expect(screen.getByText("Supplier Name")).toBeInTheDocument();
    // Named by pillar, so the client knows where it belongs.
    expect(screen.getByText(/Preferential procurement/i)).toBeInTheDocument();
  });

  it("shows a value it could not place, with what was read", () => {
    render(
      <ExtractionConfidence
        rowCount={1}
        injected={result({
          rejected: [{
            field: "race",
            value: "Black",
            reason: "no_matching_option",
            detail: '"Black" is not one of: African, Coloured, Indian, White',
            sourceFile: "register.pdf",
          }],
          coverage: { gaps: [], unmapped: [], complete: false },
        })}
      />,
    );

    expect(screen.getByText(/could not be placed/i)).toBeInTheDocument();
    // The user sees WHAT was read and WHY it did not fit — enough to correct it.
    expect(screen.getByText(/is not one of: African/i)).toBeInTheDocument();
    expect(screen.getByText(/register\.pdf/)).toBeInTheDocument();
  });

  it("counts gaps and rejections together in the review badge", () => {
    render(
      <ExtractionConfidence
        rowCount={5}
        injected={result({
          rejected: [{ field: "a", value: "x", reason: "empty", detail: "d1", sourceFile: "f" }],
          coverage: {
            gaps: [
              { section: "sed", column: "amount", label: "Amount" },
              { section: "sed", column: "beneficiaryName", label: "Beneficiary" },
            ],
            unmapped: [],
            complete: false,
          },
        })}
      />,
    );
    expect(screen.getByText(/3 to review/i)).toBeInTheDocument();
  });

  it("mentions unmapped fields as kept-not-scored, not as missing", () => {
    render(
      <ExtractionConfidence
        rowCount={2}
        injected={result({ coverage: { gaps: [], unmapped: ["hpcsa_number", "sworn_before_commissioner"], complete: true } })}
      />,
    );
    // These must not read as something we failed to get.
    expect(screen.getByText(/does not use directly/i)).toBeInTheDocument();
  });
});
