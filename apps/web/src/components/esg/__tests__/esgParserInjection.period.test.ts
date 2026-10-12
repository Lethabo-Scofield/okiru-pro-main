/**
 * A fact whose own document covers an earlier period is held, not placed.
 *
 * An invented 2023 Employment Equity return and an EE plan that lapsed two
 * months into the year, uploaded for an FY2026 workbook: the return's
 * headcount used to become this year's workforce, and the plan's assertions
 * earned S d9 and d10. Both are now held as out of period until a person
 * accepts the document. Every value here is invented.
 */
import { describe, expect, it } from "vitest";
import { applyEsgParserResult, esgDocumentKey, esgUnplacedKinds, type EsgParserCaseLike } from "../esgParserInjection";
import { esgOutOfPeriodReason, esgReportingYear, parseEsgDate } from "@/lib/esg/esgFactPeriod";
import { deriveEsgSummaryCells } from "@/lib/esg/esgDeriveSummary";
import { scoreSocial } from "../../../../EsgToolkit/src/lib/calculators/social";
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";

const AXES = { depots: ["Depot North", "Depot South"], months: ["Jul-25", "Aug-25", "Sep-25"] };
const FILE = "Invented EE submission 2023.pdf";
const CURRENT = "Invented EE plan 2026.pdf";

function eeCase(extra: Partial<EsgParserCaseLike> = {}, planEnd = "31/08/2025"): EsgParserCaseLike {
  return {
    ai_entities: {
      extractions: [
        {
          documentId: "employment_equity__eea2_eea4_report",
          sourceFile: FILE,
          element: "EMPLOYMENT_EQUITY",
          values: [
            { field: "ee_reporting_period_start", value: "01/09/2023" },
            { field: "ee_reporting_period_end", value: "30/11/2023" },
            { field: "ee_level_rows", value: [{ occupational_level: "Top management", headcount_white_male: "3" }] },
          ],
        },
        {
          documentId: "employment_equity__ee_plan_and_forum_minutes",
          sourceFile: FILE,
          element: "EMPLOYMENT_EQUITY",
          values: [
            { field: "ee_plan_start_date", value: "01/09/2023" },
            { field: "ee_plan_end_date", value: planEnd },
            { field: "ee_forum_consulted", value: "Partial" },
            { field: "numerical_targets_set", value: "Yes" },
          ],
        },
      ],
      calculator: {
        entries: [
          { key: "ee.forum_consulted", value: "Partial", sourceField: "ee_forum_consulted", sourceFiles: [FILE] },
          { key: "ee.numerical_targets_set", value: "Yes", sourceField: "numerical_targets_set", sourceFiles: [FILE] },
        ],
        rows: [
          {
            grid: "ee_level_rows",
            index: 0,
            cells: { "ee.occupational_level": "Top management", "ee.headcount_white_male": 3 },
            sourceFiles: [FILE],
          },
        ],
      },
    },
    ...extra,
  };
}

function scoreOf(patches: Record<string, { cells: Record<string, unknown> }>) {
  const workbook = {
    companyId: "period-test",
    sections: Object.fromEntries(Object.entries(patches).map(([id, s]) => [id, { cells: s.cells }])),
    updatedAt: "",
  } as unknown as EsgWorkbookData;
  return scoreSocial(deriveEsgSummaryCells(workbook));
}

describe("the reporting year and a document's period", () => {
  it("reads printed dates day-first, and a month by its edge", () => {
    expect(parseEsgDate("30/11/2023")).toBe("2023-11-30");
    expect(parseEsgDate("31/03/26")).toBe("2026-03-31");
    expect(parseEsgDate("1 July 2025", "start")).toBe("2025-07-01");
    expect(parseEsgDate("JUNE 2026", "end")).toBe("2026-06-30");
    expect(parseEsgDate("Mar-26", "start")).toBe("2026-03-01");
  });

  it("a year starting Jul-25 runs to 30 June 2026", () => {
    expect(esgReportingYear(AXES)).toEqual({ start: "2025-07-01", end: "2026-06-30" });
  });

  it("ended before the year, or an earlier cycle that lapsed in it, is out of period; the current year is not", () => {
    const year = esgReportingYear(AXES);
    expect(esgOutOfPeriodReason({ start: "2023-09-01", end: "2023-11-30" }, year)).toMatch(/ended before the reporting year/);
    expect(esgOutOfPeriodReason({ start: "2023-09-01", end: "2025-08-31" }, year)).toMatch(/lapsed during the reporting year/);
    expect(esgOutOfPeriodReason({ start: "2025-07-01", end: "2026-06-30" }, year)).toBeNull();
    expect(esgOutOfPeriodReason({ start: "2024-09-01", end: "2026-08-31" }, year)).toBeNull();
  });
});

describe("out-of-period facts are held, and earn nothing until accepted", () => {
  it("the 2023 return's headcount and the lapsed plan's assertions are held, not placed", () => {
    const result = applyEsgParserResult(eeCase(), { axes: AXES });
    expect(result.patches.ee?.cells?.B10).toBeUndefined();
    expect(result.patches.ee?.cells?.B12).toBeUndefined();
    expect(Object.keys(result.patches["s-data"]?.cells ?? {}).some((ref) => /^hc_/.test(ref))).toBe(false);
    const held = result.unplaced.filter((u) => u.rejection === "out_of_period").map((u) => u.field).sort();
    expect(held).toEqual(["ee_forum_consulted", "ee_level_rows", "numerical_targets_set"]);
    // Held facts ask a person; they are not evidence filed away.
    expect(esgUnplacedKinds(result.unplaced).toCheck).toBeGreaterThanOrEqual(3);
    const social = scoreOf(result.patches as never);
    expect(social.rows.d9 + social.rows.d10).toBe(0);
  });

  it("accepting the document places its facts", () => {
    const accepted = applyEsgParserResult(
      eeCase({
        accepted_out_of_period: [
          esgDocumentKey(FILE, "employment_equity__ee_plan_and_forum_minutes"),
          esgDocumentKey(FILE, "employment_equity__eea2_eea4_report"),
        ],
      }),
      { axes: AXES },
    );
    expect(accepted.patches.ee?.cells).toMatchObject({ B10: "Partial", B12: "Yes" });
    expect(accepted.unplaced.filter((u) => u.rejection === "out_of_period")).toEqual([]);
  });

  it("a plan in force for the year places as before", () => {
    const current = applyEsgParserResult(eeCase({}, "31/08/2027"), { axes: AXES });
    expect(current.patches.ee?.cells).toMatchObject({ B10: "Partial", B12: "Yes" });
  });

  it("a fact also read from a current document stays", () => {
    const both = eeCase();
    both.ai_entities!.extractions!.push({
      documentId: "employment_equity__ee_plan_and_forum_minutes",
      sourceFile: CURRENT,
      element: "EMPLOYMENT_EQUITY",
      values: [
        { field: "ee_plan_start_date", value: "01/09/2025" },
        { field: "ee_plan_end_date", value: "31/08/2028" },
        { field: "numerical_targets_set", value: "Yes" },
      ],
    });
    both.ai_entities!.calculator!.entries![1].sourceFiles = [FILE, CURRENT];
    const result = applyEsgParserResult(both, { axes: AXES });
    expect(result.patches.ee?.cells?.B12).toBe("Yes");
  });
});
