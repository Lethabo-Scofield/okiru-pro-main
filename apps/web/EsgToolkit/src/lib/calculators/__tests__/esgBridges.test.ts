/**
 * Carbon tax, net-zero roadmap and the B-BBEE bridge.
 *
 * Formulas quoted from `docs/esg/extracted/Carbon_Tax.json`,
 * `NetZero_Roadmap.json` and `B_BBEE_ESG.json`.
 */
import { describe, expect, it } from "vitest";
import { deriveEsgSummaryCells } from "@/lib/esg/esgDeriveSummary";
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { buildSgConsumerGoldenWorkbook } from "../../fixtures/esg-consumer-golden";
import { computeBbbeeBridge } from "../bbbeeBridge";
import { computeCarbonTax } from "../carbonTax";
import { computeNetZeroRoadmap, netZeroReductionAt } from "../netZero";

type Cells = Record<string, string | number | boolean | null>;

function wb(sections: Record<string, Cells>): EsgWorkbookData {
  return {
    companyId: "test",
    sections: Object.fromEntries(Object.entries(sections).map(([id, cells]) => [id, { cells }])),
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

/* ================================================================== *
 * CARBON TAX
 * ================================================================== */

describe("Carbon_Tax", () => {
  it("reproduces the workbook's C11 / E11 / B16 / C16 on the golden dataset", () => {
    const tax = computeCarbonTax(deriveEsgSummaryCells(buildSgConsumerGoldenWorkbook()));
    expect(tax.ytdTco2e).toBeCloseTo(3184558.93, 6); // Carbon_Tax!C11
    /*
     * The annualised figures carry ~1e-4 of drift against the workbook because
     * the golden fixture stores `Assumptions!B112` as the 10-dp literal
     * 1.3333333333 rather than the sheet's live `=12/9`. That is a fixture
     * artefact, not a calculation difference — the relative error is 2.5e-11.
     */
    expect(tax.annualisedTco2e).toBeCloseTo(4246078.57333333, 3); // D11
    expect(tax.taxableTco2e).toBeCloseTo(1698431.42933333, 3); // E11
    expect(tax.tier1Liability).toBeCloseTo(400829817.322667, 1); // B16
    expect(tax.tier2Liability).toBeCloseTo(1086996114.77333, 1); // C16
  });

  it("is NOT R0 for a manually-entered workbook — the monthly grids now reach it", () => {
    const raw = wb({
      assumptions: { B111: 9, B37: 236, B38: 640, B39: 0.6 },
      "e-data": {
        s1a_C14: 1000, s1a_C15: 500, // L75 = 1500  (fleet diesel)
        s1b_C23: 200, //               L76 = 200    (generator diesel)
        s1c_C32: 100, //               L77 = 100    (LPG)
        s1d_C37: 50, //                L78 = 50     (business cars)
        s2_C41: 4000, //               L80 = L82 = 4000 (electricity)
      },
    });
    const tax = computeCarbonTax(deriveEsgSummaryCells(raw));
    expect(tax.ytdTco2e).toBe(5850);
    expect(tax.annualiseFactor).toBeCloseTo(12 / 9, 9);
    expect(tax.annualisedTco2e).toBeCloseTo(7800, 6);
    expect(tax.taxableTco2e).toBeCloseTo(3120, 6);
    expect(tax.tier1Liability).toBeCloseTo(736320, 4);
    expect(tax.tier2Liability).toBeCloseTo(1996800, 4);
  });

  it("does not apply the source client's 9-month annualiser to another company", () => {
    // No B112 and no B111 → factor 1, not SG Consumer's 1.3333.
    const tax = computeCarbonTax(deriveEsgSummaryCells(wb({ "e-data": { s2_C41: 1000 } })));
    expect(tax.annualiseFactor).toBe(1);
    expect(tax.annualisedTco2e).toBe(1000);
  });

  it("prefers an explicit Assumptions!B112 over recomputing from B111", () => {
    const tax = computeCarbonTax(
      deriveEsgSummaryCells(wb({ assumptions: { B111: 9, B112: 2 }, "e-data": { s2_C41: 1000 } })),
    );
    expect(tax.annualiseFactor).toBe(2);
  });
});

/* ================================================================== *
 * NET-ZERO ROADMAP
 * ================================================================== */

describe("NetZero_Roadmap", () => {
  it("reads the workbook's published Scope 1+2 trajectory", () => {
    // NetZero_Roadmap!C5:L5 = B5*(1-x)
    expect(netZeroReductionAt(2025)).toBe(0);
    expect(netZeroReductionAt(2028)).toBeCloseTo(0.2, 9);
    expect(netZeroReductionAt(2030)).toBeCloseTo(0.5, 9);
    expect(netZeroReductionAt(2035)).toBeCloseTo(0.65, 9);
    expect(netZeroReductionAt(2050)).toBeCloseTo(0.95, 9);
  });

  it("clamps outside the published range and interpolates inside it", () => {
    expect(netZeroReductionAt(2020)).toBe(0);
    expect(netZeroReductionAt(2060)).toBeCloseTo(0.95, 9);
    // Between 2030 (0.50) and 2035 (0.65): 0.50 + 0.15 × 2/5
    expect(netZeroReductionAt(2032)).toBeCloseTo(0.56, 9);
  });

  it("gives every milestone its OWN target and gap (they used to be identical)", () => {
    const nz = computeNetZeroRoadmap(
      wb({ "e-data": { B90: 1000, F90: 900 }, assumptions: { B107: 2050 } }),
    );
    expect(nz.milestones.map((m) => m.year)).toEqual([2025, 2028, 2035, 2050]);
    [1000, 800, 350, 50].forEach((target, i) => {
      expect(nz.milestones[i].targetTco2e).toBeCloseTo(target, 9);
    });
    [0, 100, 550, 850].forEach((gap, i) => {
      expect(nz.milestones[i].gapTco2e).toBeCloseTo(gap, 9);
    });
    // The defect this replaces: all four milestones shared one `gapTco2e`.
    expect(new Set(nz.milestones.map((m) => m.gapTco2e)).size).toBe(4);
  });

  it("tracks each milestone independently", () => {
    const nz = computeNetZeroRoadmap(
      wb({ "e-data": { B90: 1000, F90: 900 }, assumptions: { B107: 2050 } }),
    );
    expect(nz.milestones.map((m) => m.onTrack)).toEqual([true, false, false, false]);
    expect(nz.gapTco2e).toBe(850); // gap to the terminal milestone
    expect(nz.available).toBe(true);
  });

  it("uses Assumptions!B107 for the terminal milestone year (it was ignored)", () => {
    const nz = computeNetZeroRoadmap(
      wb({ "e-data": { B90: 1000, F90: 900 }, assumptions: { B107: 2040 } }),
    );
    expect(nz.targetYear).toBe(2040);
    const terminal = nz.milestones[nz.milestones.length - 1];
    expect(terminal.tier).toBe("Net-Zero");
    expect(terminal.year).toBe(2040);
    expect(terminal.reductionRequired).toBeCloseTo(0.78, 9);
    expect(terminal.targetTco2e).toBeCloseTo(220, 9);
  });

  it("reports unavailable rather than a fake zero gap when no baseline exists", () => {
    const nz = computeNetZeroRoadmap(wb({ "e-data": { F90: 900 } }));
    expect(nz.available).toBe(false);
    expect(nz.milestones.every((m) => m.gapTco2e === 0 && !m.onTrack)).toBe(true);
  });

  it("returns no levers rather than the source client's action plan", () => {
    expect(computeNetZeroRoadmap(wb({ "e-data": { B90: 1000 } })).levers).toEqual([]);
  });

  it("surfaces levers when a NetZero_Roadmap sheet actually carries them", () => {
    const nz = computeNetZeroRoadmap(
      wb({
        "e-data": { B90: 1000 },
        netzero: { A20: "EV Fleet Transition", B20: "Urban routes first", D20: "20% EV by 2030", F20: "Fleet" },
      }),
    );
    expect(nz.levers).toEqual([
      { lever: "EV Fleet Transition", action: "Urban routes first", target: "20% EV by 2030", timeline: "", owner: "Fleet" },
    ]);
  });
});

/* ================================================================== *
 * B-BBEE BRIDGE
 * ================================================================== */

describe("B_BBEE_ESG bridge", () => {
  const golden = deriveEsgSummaryCells(buildSgConsumerGoldenWorkbook());

  it("reproduces the workbook's Management Control points (B_BBEE_ESG!E7 = 6.65)", () => {
    const bridge = computeBbbeeBridge(golden);
    expect(bridge.eeScorecardPoints).toBe(35); // EE_Scorecard!E15
    const mc = bridge.elements.find((e) => e.id === "managementControl")!;
    expect(mc.actual).toBeCloseTo(0.35, 9); // D7 = E15/100
    expect(mc.points).toBeCloseTo(6.65, 9); // E7 = D7 × 19
    expect(mc.available).toBe(true);
  });

  it("scores Skills Development from training spend ÷ leviable payroll (D8)", () => {
    const bridge = computeBbbeeBridge(
      deriveEsgSummaryCells(wb({ "s-data": { B43: 10_000_000, B50: 600_000 } })),
    );
    const sd = bridge.elements.find((e) => e.id === "skillsDevelopment")!;
    expect(sd.actual).toBeCloseTo(0.06, 9);
    expect(sd.points).toBe(25); // full Statement 300 weighting at the 6% target
  });

  it("reports elements with no input as NOT AVAILABLE instead of printing 0", () => {
    const bridge = computeBbbeeBridge(golden);
    const unavailable = bridge.elements.filter((e) => !e.available).map((e) => e.id);
    expect(unavailable).toEqual([
      "ownership",
      "skillsDevelopment",
      "enterpriseSupplierDevelopment",
      "socioEconomicDevelopment",
      "bonus",
    ]);
    for (const el of bridge.elements.filter((e) => !e.available)) {
      expect(el.points).toBeNull();
      expect(el.note).toBeTruthy();
    }
  });

  it("carries the Generic Scorecard weights from the workbook (25/19/25/40/5 + 5 bonus)", () => {
    const bridge = computeBbbeeBridge(golden);
    expect(bridge.elements.map((e) => e.weight)).toEqual([25, 19, 25, 40, 5, 5]);
    expect(bridge.totalWeight).toBe(119); // B_BBEE_ESG!B12
  });

  it("refuses to report a status level while the ladder has blank rungs", () => {
    // Assumptions!B79 (Level 4) and B81 (Level 6) are blank in the source
    // workbook, which is why B_BBEE_ESG!B15 says "Level 4" for a score of 6.65.
    const bridge = computeBbbeeBridge(golden);
    expect(bridge.statusLevel).toBeNull();
    expect(bridge.statusLevelNote).toContain("B79");
    expect(bridge.statusLevelNote).toContain("B81");
  });

  it("refuses to report a level from a partially measured scorecard", () => {
    const bridge = computeBbbeeBridge(
      deriveEsgSummaryCells(
        wb({
          assumptions: {
            B76: 100, B77: 95, B78: 90, B79: 80, B80: 75, B81: 65, B82: 55, B83: 40,
          },
          ee: { E15: 50 },
        }),
      ),
    );
    expect(bridge.statusLevel).toBeNull();
    expect(bridge.statusLevelNote).toMatch(/not every Generic Scorecard element/i);
  });

  it("reports a level once the ladder is complete AND every element is measured", () => {
    // The ladder values here are supplied BY THE TEST WORKBOOK. The calculator
    // never invents them — that is the whole point of the assertion above.
    const bridge = computeBbbeeBridge(
      deriveEsgSummaryCells(
        wb({
          assumptions: {
            B9: 0.5, B56: 0.01,
            B76: 100, B77: 95, B78: 90, B79: 80, B80: 75, B81: 65, B82: 55, B83: 40,
          },
          ee: { E15: 50 },
          "s-data": { B43: 10_000_000, B50: 600_000 },
          bbbee: { D6: 0.3, D9: 0.5, D10: 0.02, D11: 3 },
        }),
      ),
    );
    // 25 (own) + 9.5 (MC) + 25 (SD) + 20 (ESD) + 5 (SED) + 3 (bonus)
    expect(bridge.totalPoints).toBeCloseTo(87.5, 9);
    expect(bridge.measuredWeight).toBe(119);
    expect(bridge.statusLevel).toBe("Level 4");
  });

  it("reports Non-compliant below the bottom rung rather than defaulting to Level 4", () => {
    const bridge = computeBbbeeBridge(
      deriveEsgSummaryCells(
        wb({
          assumptions: {
            B9: 0.5, B56: 0.01,
            B76: 100, B77: 95, B78: 90, B79: 80, B80: 75, B81: 65, B82: 55, B83: 40,
          },
          ee: { E15: 0 },
          "s-data": { B43: 10_000_000, B50: 0 },
          bbbee: { D6: 0, D9: 0, D10: 0, D11: 0 },
        }),
      ),
    );
    expect(bridge.totalPoints).toBe(0);
    expect(bridge.statusLevel).toBe("Non-compliant");
  });
});
