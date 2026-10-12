/**
 * @vitest-environment jsdom
 *
 * A cell the AI review filled is visibly marked in the grid, its reason is on
 * hover and on click, Undo puts the cell back — and once the user edits the
 * cell, the mark goes: the value is theirs.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SpreadsheetGrid } from "../SpreadsheetGrid";
import { SKILLS_COLUMNS } from "../sections";
import { AI_FILLS_KEY, type AiFillMark } from "@/lib/aiReviewFill";

afterEach(cleanup);

const mark: AiFillMark = {
  value: "1500",
  kind: "derived",
  rule: "sum",
  reasoning: "Total of this row's 2 cost lines: Course Cost (R) + Travel Cost (R).",
  evidence: [
    { type: "cell", section: "skills-development", sectionLabel: "Skills Development", rowLabel: "Learner One", column: "courseCost", columnLabel: "Course Cost (R)", value: "1200", files: ["training.xlsx"] },
  ],
  origin: "rules",
  at: "2026-10-11T10:00:00.000Z",
};

const row = (totalCost: unknown) => ({
  _id: "s1",
  programName: "Forklift course",
  learnerName: "Learner One",
  courseCost: 1200,
  travelCost: 300,
  totalCost,
  [AI_FILLS_KEY]: { totalCost: mark },
});

const columnIndexRow = 0;

describe("AI fill mark in the grid", () => {
  it("marks the filled cell with its reason, and Undo restores the blank", () => {
    const onChange = vi.fn();
    render(<SpreadsheetGrid columns={SKILLS_COLUMNS} rows={[row(1500)]} onChange={onChange} />);
    const marker = screen.getByTestId(`ai-fill-marker-${columnIndexRow}-totalCost`);
    expect(marker).toHaveAttribute("title", expect.stringContaining("Filled by AI review — derived"));
    expect(marker.getAttribute("title")).toContain("Total of this row's 2 cost lines");

    fireEvent.click(marker);
    const panel = screen.getByTestId(`ai-fill-marker-${columnIndexRow}-totalCost-panel`);
    expect(panel).toHaveTextContent(/Course Cost \(R\) = 1200 \(from training\.xlsx\)/);
    fireEvent.click(screen.getByTestId(`ai-fill-marker-${columnIndexRow}-totalCost-undo`));
    expect(onChange).toHaveBeenCalledTimes(1);
    const restored = onChange.mock.calls[0][0][0];
    expect(restored.totalCost).toBeUndefined();
    expect(restored[AI_FILLS_KEY]).toBeUndefined();
  });

  it("drops the mark once the user has changed the value", () => {
    render(<SpreadsheetGrid columns={SKILLS_COLUMNS} rows={[row(1750)]} onChange={vi.fn()} />);
    expect(screen.queryByTestId(`ai-fill-marker-${columnIndexRow}-totalCost`)).toBeNull();
  });

  it("offers no Undo on a read-only grid", () => {
    render(<SpreadsheetGrid columns={SKILLS_COLUMNS} rows={[row(1500)]} onChange={vi.fn()} readOnly />);
    fireEvent.click(screen.getByTestId(`ai-fill-marker-${columnIndexRow}-totalCost`));
    expect(screen.queryByTestId(`ai-fill-marker-${columnIndexRow}-totalCost-undo`)).toBeNull();
  });
});
