/**
 * @vitest-environment jsdom
 *
 * Both AI reviews (B-BBEE and ESG) use the whole screen, as the document review
 * does: the fills in as many columns as fit, the questions and what was filled
 * in a side pane the reader can drag wider or hide, and calm colours (no amber
 * or violet on a fill that is fine). They were a 768px column in the middle of
 * a wide screen. Every name and figure here is invented.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ExtractionReviewModal } from "@/components/workbook/ExtractionReviewModal";
import { EsgAiReviewModal } from "@/components/esg-workbook/EsgAiReviewModal";
import { applyFillProposals, buildRuleFills, type FillProposal } from "@/lib/aiReviewFill";
import { ESG_AI_FILLS_SECTION, serializeEsgFillMark, type EsgFillProposal, type EsgWorkbookLike } from "@/lib/esg/esgAiReviewFill";
import { writeEsgGridCells, type EsgGridRow } from "@/lib/esg/esgGridRows";
import type { WorkbookSectionsInput } from "@/components/workbook/workbookValidation";

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    // no storage in this environment
  }
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const bbbeeSections = (): WorkbookSectionsInput => ({
  "company-information": { meta: { companyName: "Example Co", financialYearEnd: "28/02/2025" } },
  "skills-development": {
    rows: [{ _id: "s1", programName: "Forklift course", learnerName: "Learner One", courseCost: 1200, travelCost: 300, _sourceFiles: ["training.xlsx"] }],
  },
});

function openBbbee(data = bbbeeSections()) {
  render(
    <ExtractionReviewModal
      sections={data}
      onApplyCellUpdates={vi.fn()}
      onNavigateToSection={vi.fn()}
      onApplyFills={vi.fn((list: FillProposal[]) => ({ applied: list.map((p) => p.id), skipped: [] }))}
      onUndoFill={vi.fn()}
      onUndoAllFills={vi.fn()}
      companyId="C-1"
    />,
  );
  fireEvent.click(screen.getByTestId("extraction-review-open"));
}

const esgWorkbook = (extra: Record<string, Record<string, unknown>> = {}): EsgWorkbookLike => ({
  sections: Object.fromEntries(
    Object.entries({
      "e-data": { eSites: "North\nSouth", eFirstMonth: "Jan-25", eMonthCount: 2 },
      waste: writeEsgGridCells(
        "waste",
        [
          { month: "Jan-25", depot: "North", wasteType: "Cardboard", totalKg: 100 },
          { month: "Feb-25", depot: "South", wasteType: "Plastic", totalKg: 200 },
        ].map((r, i) => ({ _id: `w${i}`, ...r }) as EsgGridRow),
      ),
      "company-reporting-setup": {},
      ...extra,
    }).map(([id, cells]) => [id, { cells }]),
  ),
});

function openEsg(wb = esgWorkbook()) {
  render(
    <EsgAiReviewModal
      companyId="C-LAYOUT"
      companyName="Kestrel Freight"
      workbook={wb}
      onApplyFills={vi.fn(async (list: EsgFillProposal[]) => ({ applied: list.map((p) => p.id), skipped: [] }))}
      onUndoFill={vi.fn(async () => {})}
      onUndoAllFills={vi.fn(async () => {})}
      onOpenSection={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByTestId("esg-ai-review-open"));
}

const SURFACES = [
  {
    name: "B-BBEE",
    open: () => openBbbee(),
    dialog: "extraction-review-dialog",
    grid: "review-fill-grid",
    side: "review-side",
    resize: "review-resize-side",
    toggle: "review-toggle-side",
    storageKey: "okiru-ai-review-side-width",
  },
  {
    name: "ESG",
    open: () => openEsg(),
    dialog: "esg-ai-review-dialog",
    grid: "esg-review-fill-grid",
    side: "esg-review-side",
    resize: "esg-review-resize",
    toggle: "esg-review-toggle-side",
    storageKey: "okiru-esg-ai-review-side-width",
  },
];

describe.each(SURFACES)("$name AI review layout", (s) => {
  it("takes the screen's width, not a 768px column", () => {
    s.open();
    const dialog = screen.getByTestId(s.dialog);
    expect(dialog.className).not.toMatch(/max-w-3xl/);
    expect(dialog.className).toMatch(/max-w-\[1760px\]/);
    expect(dialog.className).toMatch(/\bh-full\b/);
  });

  it("lays the fills out in as many columns as fit", () => {
    s.open();
    const grid = screen.getByTestId(s.grid);
    expect(grid.className).toMatch(/\bgrid\b/);
    expect(grid.className).toMatch(/repeat\(auto-fill/);
    expect(grid.children.length).toBeGreaterThan(0);
  });

  it("puts the questions and fills in a side pane the reader drags wider, and remembers the width", () => {
    s.open();
    const handle = screen.getByTestId(s.resize);
    expect(handle).toHaveAttribute("role", "separator");
    const before = Number(handle.getAttribute("aria-valuenow"));
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    const after = Number(screen.getByTestId(s.resize).getAttribute("aria-valuenow"));
    expect(after).toBe(before + 24);
    expect(window.localStorage.getItem(s.storageKey)).toBe(String(after));
  });

  it("hides the side pane and shows it again", () => {
    s.open();
    const toggle = screen.getByTestId(s.toggle);
    expect(toggle).toHaveTextContent("Hide the side");
    fireEvent.click(toggle);
    expect(screen.getByTestId(s.side).className).toMatch(/lg:hidden/);
    expect(screen.getByTestId(s.toggle)).toHaveTextContent(/^Show questions and fills \(\d+\)$/);
    fireEvent.click(screen.getByTestId(s.toggle));
    expect(screen.getByTestId(s.side).className).not.toMatch(/lg:hidden/);
  });
});

describe("AI review: what was filled takes the main pane once nothing is left to fill", () => {
  it("B-BBEE", () => {
    const data = bbbeeSections();
    const { patches } = applyFillProposals(data, buildRuleFills(data).proposals);
    const filled = { ...data };
    for (const p of patches) filled[p.section] = { ...filled[p.section], ...(p.rows ? { rows: p.rows } : {}), ...(p.meta ? { meta: p.meta } : {}) };
    openBbbee(filled);
    expect(screen.queryByTestId("review-suggestions")).toBeNull();
    const list = screen.getByTestId("review-ai-fills");
    expect(list).toHaveAttribute("data-placement", "main");
    expect(within(screen.getByTestId("review-main")).getByTestId("review-ai-fills")).toBe(list);
  });

  it("ESG", () => {
    const mark = serializeEsgFillMark({ v: "Kestrel Freight", kind: "read", rule: "copy", reason: "The company record names it.", evidence: [], replaced: null, origin: "rules", at: "2025-04-01T00:00:00.000Z" });
    const wasteTotal = serializeEsgFillMark({ v: "300", kind: "derived", rule: "sum", reason: "The register's sum.", evidence: [], replaced: null, origin: "rules", at: "2025-04-01T00:00:00.000Z" });
    openEsg(
      esgWorkbook({
        "company-reporting-setup": { entity: "Kestrel Freight" },
        "e-data": { eSites: "North\nSouth", eFirstMonth: "Jan-25", eMonthCount: 2, L68: 300 },
        [ESG_AI_FILLS_SECTION]: { "company-reporting-setup!entity": mark, "e-data!L68": wasteTotal },
      }),
    );
    expect(screen.queryByTestId("esg-review-suggestions")).toBeNull();
    const list = screen.getByTestId("esg-review-ai-fills");
    expect(list).toHaveAttribute("data-placement", "main");
    expect(within(screen.getByTestId("esg-review-main")).getByTestId("esg-review-ai-fills")).toBe(list);
  });
});

describe("AI review colours stay calm", () => {
  it.each(["../../workbook/ExtractionReviewModal.tsx", "../../esg-workbook/EsgAiReviewModal.tsx"])(
    "%s draws no violet, and no amber except on an error",
    (file) => {
      const source = readFileSync(resolve(__dirname, file), "utf8");
      expect(source).not.toMatch(/violet-/);
      const amber = source.split("\n").filter((l) => /amber-/.test(l));
      for (const line of amber) expect(line).toMatch(/error/i);
    },
  );
});
