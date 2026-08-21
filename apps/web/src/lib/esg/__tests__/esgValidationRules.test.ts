import { describe, expect, it } from "vitest";
import { buildSgConsumerGoldenWorkbook } from "../../../../EsgToolkit/src/lib/fixtures/esg-consumer-golden";
import {
  ESG_BASELINE_YEAR_MAX,
  ESG_MONTH_SERIES,
  ESG_PHASE1_RULES,
  KING5_PRINCIPLE_COUNT,
  esgGovernanceMaturityTotal,
  esgLtifr,
  esgReportingMonths,
  esgSeriesMonths,
  evaluateEsgRules,
} from "../esgValidationRules";
import { deriveEsgSummaryCells } from "../esgDeriveSummary";
import { mergeEsgSectionCells } from "../esgGridRows";
import type { EsgWorkbookData } from "../esgWorkbookStorage";

function wb(sections: Record<string, Record<string, unknown>>): EsgWorkbookData {
  const out: EsgWorkbookData["sections"] = {};
  for (const [id, cells] of Object.entries(sections)) {
    out[id] = { cells: cells as EsgWorkbookData["sections"][string]["cells"] };
  }
  return { companyId: "T-1", sections: out, updatedAt: new Date().toISOString() };
}

const blankWorkbook = (): EsgWorkbookData =>
  wb({
    "company-reporting-setup": {},
    assumptions: {},
    "e-data": {},
    "s-data": {},
    "g-data": {},
    ee: {},
    king5: {},
    fleet: {},
    ifrs: {},
  });

function submit(workbook: EsgWorkbookData, touched = {}) {
  return evaluateEsgRules(deriveEsgSummaryCells(workbook), touched, "submit");
}

function byId(workbook: EsgWorkbookData, id: string, touched = {}) {
  return submit(workbook, touched).find((r) => r.id === id);
}

describe("evaluateEsgRules", () => {
  it("does not fail untouched rules in live mode", () => {
    const results = evaluateEsgRules(buildSgConsumerGoldenWorkbook(), {}, "live");
    expect(results.filter((r) => r.pending).length).toBeGreaterThan(0);
    expect(results.filter((r) => !r.pass && !r.pending)).toEqual([]);
  });

  it("returns nothing in silent mode and a single blocker with no workbook", () => {
    expect(evaluateEsgRules(null, {}, "silent")).toEqual([]);
    const none = evaluateEsgRules(null, {}, "submit");
    expect(none).toHaveLength(1);
    expect(none[0].id).toBe("no-workbook");
  });
});

/* -------------------------------------------------------------------------- */

describe("no rule reads a cell nothing writes, and every rule can fail", () => {
  it("every rule fails on a blank workbook or is explicitly unset-tolerant", () => {
    const results = submit(blankWorkbook());
    // Rules that legitimately pass when nothing is captured, each because the
    // absence is owned by a different rule.
    const unsetTolerant = new Set([
      "company-reporting-setup.baseline-year-valid", // required-field rules own "unset"
      "assumptions.stance-valid", // unset defaults to Standard in the calculators
      "s-data.ltifr-threshold", // not computable — s-data.hours-worked reports it
    ]);
    for (const r of results) {
      if (unsetTolerant.has(r.id)) {
        expect(r.pass, `${r.id} should tolerate unset`).toBe(true);
      } else {
        expect(r.pass, `${r.id} must fail on a blank workbook`).toBe(false);
      }
    }
  });

  it("every submit-mode rule passes on some workbook (no unsatisfiable gate)", () => {
    // The golden fixture plus the two registers it does not carry.
    const filled = buildSgConsumerGoldenWorkbook();
    filled.sections.fleet = {
      cells: mergeEsgSectionCells("fleet", [
        { _id: "f1", reg: "AB 12 CD GP", monthlyKm: 4000, monthlyLitres: 1200 },
      ]),
    };
    filled.sections.ifrs = { cells: { _yes_count: 4, _total: 10 } };
    filled.sections["s-data"] = {
      cells: {
        ...filled.sections["s-data"].cells,
        hc_0_0: 120,
        L12: 120, // the fixture pins L12: 0, and derived values never overwrite
        B45: "Yes",
        C27: 400000,
        C29: 1,
      },
    };
    filled.sections["e-data"] = { cells: { ...filled.sections["e-data"].cells, B90: 3200000 } };
    filled.sections["company-reporting-setup"] = {
      cells: { ...filled.sections["company-reporting-setup"].cells, baselineYear: "2025" },
    };

    const failing = submit(filled, { "company-reporting-setup": { baselineYear: true } })
      .filter((r) => !r.pass)
      .map((r) => `${r.id}: ${r.message}`);
    expect(failing).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */

describe("pillar-total gates evaluate the computed scorecard", () => {
  it("blocks a blank workbook on all three pillars", () => {
    const blockers = submit(blankWorkbook())
      .filter((r) => !r.pass && r.severity === "error")
      .map((r) => r.id)
      .sort();
    expect(blockers).toEqual(["e-score", "g-score", "king5-principles", "s-score"]);
  });

  it("passes on the golden fixture, which stores no D30/D28/D26 cell at all", () => {
    const golden = buildSgConsumerGoldenWorkbook();
    for (const id of ["e-score", "s-score", "g-score"]) {
      expect(byId(golden, id)?.pass, id).toBe(true);
    }
    expect(golden.sections["e-data"].cells.D30).toBeUndefined();
    expect(golden.sections["s-data"].cells.D28).toBeUndefined();
    expect(golden.sections["g-data"].cells.D26).toBeUndefined();
  });

  it("does not accept governance's free d25 points as evidence", () => {
    // One cell in an unrelated section: scoreGovernance still returns 5 (the
    // documented G_Data!B25 defect), but no governance input exists.
    const almostBlank = wb({ "company-reporting-setup": { entity: "Acme" }, "g-data": {} });
    expect(byId(almostBlank, "g-score")?.pass).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */

describe("each E series checks its own data", () => {
  const months = (prefix: string, row: number, n: number) =>
    Object.fromEntries(
      Array.from({ length: n }, (_, i) => [`${prefix}_${String.fromCharCode(67 + i)}${row}`, 100]),
    );

  it("counts only its own prefix", () => {
    const dieselOnly = wb({ "e-data": months("s1a", 14, 9) });
    expect(esgSeriesMonths(dieselOnly, ESG_MONTH_SERIES.diesel)).toBe(9);
    expect(esgSeriesMonths(dieselOnly, ESG_MONTH_SERIES.electricity)).toBe(0);
    expect(esgSeriesMonths(dieselOnly, ESG_MONTH_SERIES.water)).toBe(0);
  });

  it("reports diesel complete and electricity/water missing independently", () => {
    const dieselOnly = wb({ "e-data": months("s1a", 14, 9) });
    expect(byId(dieselOnly, "e-diesel")?.pass).toBe(true);
    expect(byId(dieselOnly, "e-electricity")?.pass).toBe(false);
    expect(byId(dieselOnly, "e-water")?.pass).toBe(false);
  });

  it("flags a partially-captured series", () => {
    const short = wb({ "e-data": months("s2", 41, 5) });
    expect(esgSeriesMonths(short, ESG_MONTH_SERIES.electricity)).toBe(5);
    expect(byId(short, "e-electricity")?.pass).toBe(false);
  });

  it("accepts an imported roll-up carrying the legacy month marker", () => {
    const imported = wb({ "e-data": { L63: 4356.41, _months_C_K: 9 } });
    expect(esgSeriesMonths(imported, ESG_MONTH_SERIES.water)).toBe(9);
    // …but the marker cannot resurrect a series with no total of its own.
    expect(esgSeriesMonths(imported, ESG_MONTH_SERIES.diesel)).toBe(0);
  });

  it("honours the reporting window from Assumptions!B111", () => {
    const twelve = wb({ assumptions: { B111: 12 }, "e-data": months("s1a", 14, 9) });
    expect(esgReportingMonths(twelve)).toBe(12);
    expect(byId(twelve, "e-diesel")?.pass).toBe(false);
    expect(esgReportingMonths(wb({ assumptions: {} }))).toBe(9);
    expect(esgReportingMonths(wb({ assumptions: { B111: 99 } }))).toBe(9);
  });

  it("passes all three on the golden fixture", () => {
    const golden = buildSgConsumerGoldenWorkbook();
    for (const id of ["e-diesel", "e-electricity", "e-water"]) {
      expect(byId(golden, id)?.pass, id).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- */

describe("assumptions.stance-valid", () => {
  it("replaces the always-true stance rule", () => {
    expect(ESG_PHASE1_RULES.some((r) => r.id === "assumptions.stance-required")).toBe(false);
    const rule = ESG_PHASE1_RULES.find((r) => r.id === "assumptions.stance-valid");
    expect(rule?.fieldRef).toBe("B8");
  });

  it("tolerates unset, accepts the vocabulary, rejects anything else", () => {
    expect(byId(wb({ assumptions: {} }), "assumptions.stance-valid")?.pass).toBe(true);
    expect(byId(wb({ assumptions: { B8: "standard" } }), "assumptions.stance-valid")?.pass).toBe(
      true,
    );
    expect(byId(wb({ assumptions: { B8: "Aggressive" } }), "assumptions.stance-valid")?.pass).toBe(
      false,
    );
  });

  it("reads the sector from B10, not the stance cell", () => {
    expect(byId(wb({ assumptions: { B8: "Standard" } }), "assumptions.sector-required")?.pass).toBe(
      false,
    );
    expect(byId(wb({ assumptions: { B10: "Mining" } }), "assumptions.sector-required")?.pass).toBe(
      true,
    );
  });
});

/* -------------------------------------------------------------------------- */

describe("g-data.score-positive reads a cell the app writes", () => {
  it("recomputes SUM(F5:F24) when no F26 was stored", () => {
    // EsgMaturityGrid renders the total and captions it "stored at F26" but
    // never writes it; only the F-cells esgDeriveSummary produces are on disk.
    const noTotal = wb({ "g-data": { B5: 7, F5: 5, B15: "Yes", F15: 5, B17: "Partial", F17: 2.5 } });
    expect(noTotal.sections["g-data"].cells.F26).toBeUndefined();
    expect(esgGovernanceMaturityTotal(noTotal)).toBe(12.5);
    expect(byId(noTotal, "g-data.score-positive")?.pass).toBe(true);
  });

  it("passes for a workbook captured only through the maturity grid's B-cells", () => {
    const manual = deriveEsgSummaryCells(wb({ "g-data": { B5: 7, B15: "Yes", B17: "Partial" } }));
    expect(esgGovernanceMaturityTotal(manual)).toBeGreaterThan(0);
    expect(byId(manual, "g-data.score-positive")?.pass).toBe(true);
  });

  it("still prefers an explicit imported F26", () => {
    expect(esgGovernanceMaturityTotal(wb({ "g-data": { F26: 66.07 } }))).toBeCloseTo(66.07);
  });

  it("fails when no governance value is captured", () => {
    expect(byId(wb({ "g-data": { B5: "" } }), "g-data.score-positive")?.pass).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */

describe("LTIFR", () => {
  it("computes from hours worked when G35 holds the template's placeholder text", () => {
    const w = wb({
      "s-data": { G35: "Awaiting hours worked", C27: 500000, D27: 500000, C29: 3, D29: 2 },
    });
    expect(esgLtifr(w)).toBeCloseTo(5);
    expect(byId(w, "s-data.ltifr-threshold", { "s-data": { G35: true } })?.pass).toBe(false);
  });

  it("uses an explicit G35 when it is numeric, against the Assumptions threshold", () => {
    const under = wb({ "s-data": { G35: 1.4 }, assumptions: { B55: 2 } });
    const over = wb({ "s-data": { G35: 1.4 }, assumptions: { B55: 1 } });
    const touched = { "s-data": { G35: true as const } };
    expect(byId(under, "s-data.ltifr-threshold", touched)?.pass).toBe(true);
    expect(byId(over, "s-data.ltifr-threshold", touched)?.pass).toBe(false);
  });

  it("reports missing hours through its own rule instead of passing silently", () => {
    const w = wb({ "s-data": { G35: "Awaiting hours worked" } });
    expect(esgLtifr(w)).toBeNull();
    expect(byId(w, "s-data.hours-worked")?.pass).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */

describe("fleet.has-rows sees saved rows", () => {
  it("counts flat A4/B4… refs, not the stripped _rows draft key", () => {
    const cells = mergeEsgSectionCells("fleet", [{ _id: "f1", reg: "AB 12 CD GP" }]);
    expect(cells._rows).toBeUndefined();
    expect(byId(wb({ fleet: cells }), "fleet.has-rows")?.pass).toBe(true);
    expect(byId(wb({ fleet: {} }), "fleet.has-rows")?.pass).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */

describe("king5-principles", () => {
  it(`accepts ${KING5_PRINCIPLE_COUNT} captured statuses`, () => {
    const rows = Array.from({ length: KING5_PRINCIPLE_COUNT }, (_, i) => ({
      _id: `k${i}`,
      num: i + 1,
      principle: `Principle ${i + 1}`,
      status: "Applied",
      weight: 6,
    }));
    expect(byId(wb({ king5: mergeEsgSectionCells("king5", rows) }), "king5-principles")?.pass).toBe(
      true,
    );
  });

  it("accepts an imported King V total with no per-principle rows", () => {
    expect(byId(wb({ king5: { E21: 135 } }), "king5-principles")?.pass).toBe(true);
  });

  it("blocks when the assessment is absent entirely", () => {
    expect(byId(wb({ king5: {} }), "king5-principles")?.pass).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */

describe("baseline year window", () => {
  const touched = { "company-reporting-setup": { baselineYear: true as const } };
  const check = (v: string) =>
    byId(wb({ "company-reporting-setup": { baselineYear: v } }), "company-reporting-setup.baseline-year-valid", touched)
      ?.pass;

  it("parses a fiscal-year label instead of silently skipping it", () => {
    expect(check("FY 2025/26")).toBe(true);
    expect(check("2025")).toBe(true);
  });

  it("rejects out-of-window and unparseable values", () => {
    expect(check("1975")).toBe(false);
    expect(check(String(ESG_BASELINE_YEAR_MAX + 1))).toBe(false);
    expect(check("TBC")).toBe(false);
  });

  it("does not expire — the window tracks the current year", () => {
    expect(ESG_BASELINE_YEAR_MAX).toBeGreaterThanOrEqual(new Date().getFullYear());
  });
});
