import { describe, expect, it } from "vitest";
import { buildSgConsumerGoldenWorkbook } from "../../../../EsgToolkit/src/lib/fixtures/esg-consumer-golden";
import { validateEsgWorkbook, validateEsgWorkbookForSubmit } from "../esgValidation";
import { mergeEsgSectionCells } from "../esgGridRows";
import { emptyEsgWorkbook } from "../esgWorkbookStorage";

describe("validateEsgWorkbookForSubmit", () => {
  /**
   * The proof the submit path is unblocked. Before this pass the three
   * pillar-total rules read E_/S_/G_Scorecard!D30/D28/D26 — cells only the XLSX
   * export ever writes — and every failing warning was promoted to a blocker on
   * submit, so no workbook could ever be submitted.
   */
  it("submits the fully-populated golden workbook with zero blockers", () => {
    const result = validateEsgWorkbookForSubmit(buildSgConsumerGoldenWorkbook());
    expect(result.blockers.map((b) => `${b.id}: ${b.label}`)).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("still surfaces the golden workbook's real gaps as warnings", () => {
    const { warnings } = validateEsgWorkbookForSubmit(buildSgConsumerGoldenWorkbook());
    const ids = warnings.map((w) => w.id);
    // These are genuinely absent from the source workbook — they must be
    // reported, just not as a reason to refuse the submission.
    expect(ids).toContain("fleet.has-rows");
    expect(ids).toContain("ifrs.disclosures-started");
    expect(ids).toContain("s-data.headcount-positive");
    expect(warnings.every((w) => w.severity === "warning")).toBe(true);
  });

  it("blocks a blank workbook with a short, actionable list", () => {
    const result = validateEsgWorkbookForSubmit(emptyEsgWorkbook("C-blank"));
    expect(result.ok).toBe(false);
    expect(result.blockers.map((b) => b.id).sort()).toEqual([
      "e-score",
      "g-score",
      "king5-principles",
      "s-score",
    ]);
    // Sensible blockers, not a wall: warnings outnumber them and every blocker
    // names something to capture.
    expect(result.warnings.length).toBeGreaterThan(result.blockers.length);
    for (const b of result.blockers) expect(b.label.length).toBeGreaterThan(0);
  });

  it("blocks when there is no workbook at all", () => {
    const result = validateEsgWorkbookForSubmit(null);
    expect(result.ok).toBe(false);
    expect(result.blockers.map((b) => b.id)).toEqual(["no-workbook"]);
  });

  it("keeps King5 satisfiable from the grid as well as from an import", () => {
    const wb = buildSgConsumerGoldenWorkbook();
    wb.sections.king5 = {
      cells: mergeEsgSectionCells(
        "king5",
        Array.from({ length: 17 }, (_, i) => ({
          _id: `k${i}`,
          num: i + 1,
          principle: `Principle ${i + 1}`,
          status: "Applied",
          weight: 6,
        })),
      ),
    };
    const king5 = validateEsgWorkbookForSubmit(wb).issues.find((i) => i.id === "king5-principles");
    expect(king5?.pass).toBe(true);
  });
});

describe("validateEsgWorkbook severity contract", () => {
  it("does not promote failing warnings to critical on submit", () => {
    const issues = validateEsgWorkbook(emptyEsgWorkbook("C-blank"), {}, "submit");
    const criticalIds = issues.filter((i) => i.severity === "critical").map((i) => i.id).sort();
    expect(criticalIds).toEqual(["e-score", "g-score", "king5-principles", "s-score"]);
    expect(issues.some((i) => i.severity === "warning" && !i.pass)).toBe(true);
  });
});
