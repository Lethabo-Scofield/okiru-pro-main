/**
 * @vitest-environment jsdom
 *
 * The review step, made roomier and calmer: labels wrap (never "Operating
 * ex…"), a broken workbook cell is said as one with a way to enter the
 * figure, a list opens into its entries, the values pane can be resized and
 * the document list folded away, and the "disagreements" count is only the
 * real ones. Names and figures are invented.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import * as React from "react";
import { DocumentReview } from "../DocumentReview";
import { EditableValue } from "../EditableValue";
import { ReconciliationFlagsSection } from "../ReconciliationFlagsSection";
import type { ReviewDocument } from "@/lib/documentReview";

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  try {
    window.localStorage.clear();
  } catch {
    // no storage in this environment
  }
});

const LONG_LABEL = "Operating expenditure excluding depreciation and amortisation";

const DOCS: ReviewDocument[] = [
  {
    filename: "Gathering.xlsx",
    documentType: "B-BBEE information-gathering workbook",
    state: "needs-look",
    summary: "4 suppliers",
    values: [
      { label: LONG_LABEL, value: "1 250 000", edit: { kind: "field", field: "operating_expenditure" } },
      { label: "Total measured procurement spend", value: "#REF!", cellError: "#REF!", edit: { kind: "field", field: "tmps" } },
      { label: "Months submitted", value: "3 entries: Mar 2025, Apr 2025, …", items: ["Mar 2025", "Apr 2025", "May 2025"] },
      { label: "Net profit after tax", value: "#DIV/0!", cellError: "#DIV/0!" },
    ],
    unplaced: [],
    problems: [],
    notFound: [],
  },
  {
    filename: "Profile.pdf",
    documentType: "Company profile",
    state: "read",
    summary: "",
    values: [{ label: "Entity name", value: "Example Freight" }],
    unplaced: [],
    problems: [],
    notFound: [],
  },
];

function renderReview(onEditValue = vi.fn()) {
  render(
    <DocumentReview documents={DOCS} fileFor={() => null} documentIdFor={() => null} onEditValue={onEditValue} />,
  );
  return { onEditValue, values: within(screen.getByTestId("review-values")) };
}

describe("the values pane", () => {
  it("wraps a long label to two lines instead of cutting it, and keeps it whole in a tooltip", () => {
    const { values } = renderReview();
    const label = values.getByText(LONG_LABEL);
    expect(label.className).toContain("line-clamp-2");
    expect(label.className).not.toContain("truncate");
    expect(label.closest("dt")).toHaveAttribute("title", LONG_LABEL);
  });

  it("says a broken cell is broken — never shows #REF! as the value — and offers to enter the figure", () => {
    const { values, onEditValue } = renderReview();
    expect(values.getByText("Broken cell in the workbook (#REF!)")).toBeInTheDocument();
    expect(values.queryByText("#REF!")).toBeNull();

    fireEvent.click(values.getByTestId("review-value-1-fix"));
    const input = values.getByTestId("review-value-1-input");
    expect(input).toHaveValue("");
    fireEvent.change(input, { target: { value: "980000" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onEditValue).toHaveBeenCalledWith("Gathering.xlsx", { kind: "field", field: "tmps" }, "980000");
  });

  it("says a broken cell is broken where the value cannot be corrected here", () => {
    const { values } = renderReview();
    expect(values.getByTestId("review-value-3-broken")).toHaveTextContent("Broken cell in the workbook (#DIV/0!)");
    expect(values.queryByText("#DIV/0!")).toBeNull();
  });

  it("opens a list into its entries", () => {
    const { values } = renderReview();
    const list = values.getByTestId("review-value-2-items");
    expect(within(list).getByText("Show all 3")).toBeInTheDocument();
    expect(within(list).getByText("May 2025")).toBeInTheDocument();
  });

  it("keeps the hint that a value can be clicked to correct it", () => {
    renderReview();
    expect(screen.getByText("Click a value to correct it")).toBeInTheDocument();
  });
});

describe("room for the three panes", () => {
  it("asks its host for the wide layout", () => {
    renderReview();
    expect(screen.getByTestId("document-review")).toHaveAttribute("data-wide-review");
  });

  it("resizes the values pane from the keyboard, within its limits, and remembers it", () => {
    renderReview();
    const handle = screen.getByTestId("review-resize");
    expect(handle).toHaveAttribute("role", "separator");
    const start = Number(handle.getAttribute("aria-valuenow"));
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    const wider = Number(handle.getAttribute("aria-valuenow"));
    expect(wider).toBeGreaterThan(start);
    for (let i = 0; i < 60; i++) fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(Number(handle.getAttribute("aria-valuenow"))).toBe(Number(handle.getAttribute("aria-valuemin")));
    expect(window.localStorage.getItem("okiru-review-values-width")).toBe(handle.getAttribute("aria-valuemin"));
  });

  it("folds the document list away and back", () => {
    renderReview();
    const toggle = screen.getByTestId("review-toggle-list");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent("Show the list (2)");
    expect(screen.getByRole("navigation", { name: "Documents" }).className).toContain("lg:hidden");
  });
});

describe("calm colour", () => {
  it("marks the selected document without the purple bar", () => {
    renderReview();
    const selected = screen.getByTestId("review-doc-Gathering.xlsx");
    expect(selected).toHaveAttribute("aria-selected", "true");
    expect(selected.className).not.toMatch(/violet/);
  });
});

describe("EditableValue", () => {
  it("never shows a spreadsheet error code as the value", () => {
    render(<EditableValue value="#VALUE!" label="Revenue" onSave={vi.fn()} testId="v" />);
    expect(screen.getByTestId("v-broken")).toHaveTextContent("Broken cell in the workbook (#VALUE!)");
    expect(screen.getByTestId("v-fix")).toHaveTextContent("Enter the right figure");
  });

  it("shows a broken cell, read-only, without the way to edit it", () => {
    render(<EditableValue value="#N/A" label="Revenue" onSave={vi.fn()} testId="v" disabled />);
    expect(screen.getByTestId("v-broken")).toHaveTextContent("(#N/A)");
    expect(screen.queryByTestId("v-fix")).toBeNull();
  });
});

describe("Disagreements between documents", () => {
  const FLAGS = [
    { sourceFile: "Kestrel Brakes", note: "states spend of 14,000 but the schedule says 14,000.35", values: [14000, 14000.35] as [unknown, unknown] },
    { sourceFile: "Heron Fuel", note: "states spend of 1,200,000 but the schedule says 400,000", values: [1200000, 400000] as [unknown, unknown] },
    { sourceFile: "Plover Insurance", note: "share 51% vs 0.51", values: ["51%", 0.51] as [unknown, unknown] },
    { sourceFile: "Plover Group", note: "is taken as Plover Insurance's certificate", kind: "linked" as const },
  ];

  it("counts only the real disagreements and folds the rest", () => {
    render(<ReconciliationFlagsSection flags={FLAGS} />);
    const panel = screen.getByTestId("reconciliation-flags");
    expect(within(panel).getByText("1")).toBeInTheDocument();
    expect(panel).toHaveTextContent("2 other differences were only rounding or the same value written differently.");
    fireEvent.click(within(panel).getByRole("button"));
    expect(within(screen.getByTestId("reconciliation-disagreements")).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByTestId("reconciliation-rounding")).toHaveTextContent("Differ only by rounding · 1");
    expect(screen.getByTestId("reconciliation-same-value")).toHaveTextContent("Same value, written differently · 1");
    expect(screen.getByTestId("reconciliation-notes")).toHaveTextContent("How we matched your documents · 1");
  });

  it("does not say the name twice when the note already starts with it", () => {
    render(<ReconciliationFlagsSection flags={[{ sourceFile: "Heron Fuel", note: "Heron Fuel: the ledger states 1,200 but the schedule says 400.", values: [1200, 400] }]} />);
    fireEvent.click(within(screen.getByTestId("reconciliation-flags")).getByRole("button"));
    const item = within(screen.getByTestId("reconciliation-disagreements")).getByRole("listitem");
    expect(item).toHaveTextContent(/^Heron Fuel: the ledger states/);
    expect(item.textContent?.match(/Heron Fuel/g)).toHaveLength(1);
  });

  it("says none when every difference is noise", () => {
    render(<ReconciliationFlagsSection flags={[FLAGS[0], FLAGS[3]]} />);
    const panel = screen.getByTestId("reconciliation-flags");
    expect(within(panel).getByText("none")).toBeInTheDocument();
    expect(panel).toHaveTextContent("Nothing your documents disagree on.");
  });

  it("shows nothing when there are no findings", () => {
    const { container } = render(<ReconciliationFlagsSection flags={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
