/**
 * Per-indicator tests for every formula ported out of `const dN = 0;`.
 *
 * Two layers:
 *  · CALCULATOR CONTRACT — summary cells injected directly, so the assertion is
 *    about the scorecard formula itself.
 *  · END TO END — raw grid inputs only, run through `deriveEsgSummaryCells`, so
 *    the assertion is that a manually-filled workbook actually reaches the score.
 *
 * Formulas are quoted from `docs/esg/ESG_FORMULA_LEDGER.md` Part 1.
 */
import { describe, expect, it } from "vitest";
import { deriveEsgSummaryCells } from "@/lib/esg/esgDeriveSummary";
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { scoreEnvironmental } from "../environmental";
import { scoreGovernance } from "../governance";
import { scoreSocial } from "../social";

type Cells = Record<string, string | number | boolean | null>;

function wb(sections: Record<string, Cells>): EsgWorkbookData {
  return {
    companyId: "test",
    sections: Object.fromEntries(Object.entries(sections).map(([id, cells]) => [id, { cells }])),
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

/** Workbook thresholds every band below is measured against (Assumptions block 2). */
const ASSUMPTIONS: Cells = {
  B8: "Standard",
  B9: 0.5, // stance floor
  B43: 0.1, // THR_GHG_YOY
  B44: 0.2, // THR_RE
  B45: 1.05, // THR_FUEL_TOL
  B46: 0.05, // THR_EV_MIN
  B48: 0.75, // THR_WASTE
  B50: 0.6, // THR_BLACK
  B51: 0.3, // THR_BFM
  B52: 0.02, // THR_PWD
  B53: 40, // THR_TRAIN_HR
  B54: 0.8, // THR_GRANT
  B55: 2, // THR_LTIFR
};

const E = (sections: Record<string, Cells>) =>
  scoreEnvironmental(wb({ assumptions: ASSUMPTIONS, ...sections })).rows;
const S = (sections: Record<string, Cells>) =>
  scoreSocial(wb({ assumptions: ASSUMPTIONS, ...sections })).rows;
const G = (sections: Record<string, Cells>) =>
  scoreGovernance(wb({ assumptions: ASSUMPTIONS, ...sections })).rows;

/* ================================================================== *
 * ENVIRONMENTAL
 * ================================================================== */

describe("E d7 — Scope 2 net reduction (solar offset), 8 pts", () => {
  // C7 = IF(L80=0,0,IF(L81/L80>=B44,8,IF(L81/L80>=B44*B9,8*(L81/L80)/B44,0)))
  // Repointed from the non-existent M80/M81; leading minus dropped (L81 > 0).
  it("awards full points once solar covers the renewable threshold (20%)", () => {
    expect(E({ "e-data": { L80: 1000, L81: 250 } }).d7).toBe(8);
  });

  it("pro-rates between the stance floor and the threshold", () => {
    // 120/1000 = 0.12 → ≥ 0.2×0.5 → 8 × 0.12 / 0.2 = 4.8
    expect(E({ "e-data": { L80: 1000, L81: 120 } }).d7).toBeCloseTo(4.8, 9);
  });

  it("scores 0 below the stance floor", () => {
    expect(E({ "e-data": { L80: 1000, L81: 50 } }).d7).toBe(0);
  });

  it("scores 0 with no Scope 2 gross to divide by", () => {
    expect(E({ "e-data": { L81: 250 } }).d7).toBe(0);
  });

  it("stays 0 in workbook-parity mode, which reads the non-existent M80/M81", () => {
    const workbook = wb({ assumptions: ASSUMPTIONS, "e-data": { L80: 1000, L81: 250 } });
    expect(scoreEnvironmental(workbook, { mode: "workbook-parity" }).rows.d7).toBe(0);
  });

  it("END TO END — solar and electricity monthly grids reach d7", () => {
    const raw = wb({
      assumptions: ASSUMPTIONS,
      "e-data": {
        s2_C41: 500, s2_C42: 500, // Scope 2 → L46 = L80 = 1000
        solar_C14: 150, solar_C15: 100, // Solar → L50/L51 → L81 = 250
      },
    });
    expect(scoreEnvironmental(deriveEsgSummaryCells(raw)).rows.d7).toBe(8);
  });
});

describe("E d9 — Net-zero target formally set (SBTi), 5 pts", () => {
  // C9 = IF(AND(B107>=2030,B107<=2060),5,IF(B107>0,2.5,0))
  it("awards 0 when no target year was entered (was 5 via a config fallback)", () => {
    expect(E({}).d9).toBe(0);
  });
  it("awards 5 for a target inside the SBTi window", () => {
    expect(E({ assumptions: { ...ASSUMPTIONS, B107: 2050 } }).d9).toBe(5);
  });
  it("awards 2.5 for a target outside the window", () => {
    expect(E({ assumptions: { ...ASSUMPTIONS, B107: 2025 } }).d9).toBe(2.5);
    expect(E({ assumptions: { ...ASSUMPTIONS, B107: 2065 } }).d9).toBe(2.5);
  });
});

describe("E d13 — % renewable electricity ≥20%, 8 pts", () => {
  // C13 = IF(L46=0,0,IF((L50+…+L54)/L46>=B44,8,IF(…>=B44*B9,8*(…)/B44,0)))
  it("sums all five depot solar rows over total electricity", () => {
    expect(
      E({ "e-data": { L46: 1000, L50: 50, L51: 50, L52: 50, L53: 50, L54: 50 } }).d13,
    ).toBe(8);
  });
  it("pro-rates a partial renewable share", () => {
    expect(E({ "e-data": { L46: 1000, L50: 150 } }).d13).toBeCloseTo(6, 9);
  });
  it("scores 0 with no electricity data", () => {
    expect(E({ "e-data": { L50: 150 } }).d13).toBe(0);
  });
  it("END TO END — monthly solar grid reaches d13", () => {
    const raw = wb({
      assumptions: ASSUMPTIONS,
      "e-data": { s2_C41: 1000, solar_C14: 100, solar_C15: 100 },
    });
    expect(scoreEnvironmental(deriveEsgSummaryCells(raw)).rows.d13).toBe(8);
  });
});

describe("E d15 / d16 / d17 — Fleet_Register, 18 pts", () => {
  // C15 = IF(COUNTA(A4:A19)=0,0, 8*SUMPRODUCT((K>0)*(K<=L*B45)) / MAX(1,COUNTIF(K,">0")))
  it("d15 scores the share of vehicles inside their OEM norm", () => {
    expect(
      E({ fleet: { _vehicle_count: 4, _l100_positive: 4, _l100_within_norm: 3 } }).d15,
    ).toBe(6);
  });
  it("d15 scores 0 with an empty register", () => {
    expect(E({ fleet: { _vehicle_count: 0, _l100_positive: 0, _l100_within_norm: 0 } }).d15).toBe(0);
    expect(E({}).d15).toBe(0);
  });

  // C16 = IF(SUMPRODUCT((F4:F19>0)*(I4:I19>0))>0,5,0)
  it("d16 needs at least one vehicle with BOTH carry kg and monthly km", () => {
    expect(E({ fleet: { _tonne_km_rows: 1 } }).d16).toBe(5);
    expect(E({ fleet: { _tonne_km_rows: 0 } }).d16).toBe(0);
  });

  // C17 = IF(B28=0,0,IF(H28/B28>=B46,5,IF(H28/B28>=B46*B9,5*(H28/B28)/B46,0)))
  it("d17 scores EV share and number-coerces the workbook's TEXT totals", () => {
    expect(E({ fleet: { B28: "134", H28: "10" } }).d17).toBe(5);
    expect(E({ fleet: { B28: "134", H28: "0" } }).d17).toBe(0);
    expect(E({ fleet: { B28: 100, H28: 4 } }).d17).toBeCloseTo(4, 9); // 0.04 → 5×0.04/0.05
  });
  it("d17 scores 0 with no fleet to divide by", () => {
    expect(E({ fleet: { H28: 10 } }).d17).toBe(0);
  });

  it("END TO END — a raw fleet register reaches d15, d16 and d17", () => {
    const raw = wb({
      assumptions: ASSUMPTIONS,
      fleet: {
        // A=reg F=carry I=monthlyKm J=monthlyLitres L=l100Norm P=isEv
        A4: "V1", F4: 1000, I4: 1000, J4: 300, L4: 32, P4: "Yes", // 30 L/100km ≤ 33.6 ✓
        A5: "V2", F5: 1000, I5: 1000, J5: 500, L5: 32, // 50 L/100km > 33.6 ✗
      },
    });
    const rows = scoreEnvironmental(deriveEsgSummaryCells(raw)).rows;
    expect(rows.d15).toBe(4); // 8 × 1 within-norm / 2 measured
    expect(rows.d16).toBe(5); // both rows carry kg + km
    expect(rows.d17).toBe(5); // 1 of 2 vehicles is an EV → 50% ≥ 5%
  });
});

describe("E d19 / d20 / d21 — Waste_Register", () => {
  it("scores diversion, Cority tracking and landfill tCO₂e from the waste summary", () => {
    const rows = E({ waste: { B16: 0.911, B17: 0.124, B18: 2.32 } });
    expect(rows.d19).toBe(5);
    expect(rows.d20).toBe(4);
    expect(rows.d21).toBe(3);
  });
  it("END TO END — a raw waste register reaches d19 and d21", () => {
    const raw = wb({
      assumptions: ASSUMPTIONS,
      // A=month B=depot C=wasteType D=totalKg E=recycledKg F=landfillKg
      waste: { A5: "Jul", B5: "ISANDO", C5: "General", D5: 1000, E5: 800, F5: 200 },
    });
    const rows = scoreEnvironmental(deriveEsgSummaryCells(raw)).rows;
    expect(rows.d19).toBe(5); // 800/1000 = 80% ≥ 75%
    expect(rows.d21).toBe(3); // 200 kg × 0.58 / 1000 > 0
  });
});

describe("E d12 — Energy efficiency improvement YoY, 5 pts (MANUAL_ZERO now scored)", () => {
  // Ledger 5.1: IF(B92=0,0,IF((B92-L46)/B92>=B43,5,IF(…>=B43*B9,5*(…)/B43,0)))
  it("awards full points for a 10% YoY electricity reduction", () => {
    expect(E({ "e-data": { B92: 1000, L46: 900 } }).d12).toBe(5);
  });
  it("pro-rates a 6% reduction", () => {
    // 0.06 ≥ 0.1×0.5 → 5 × 0.06 / 0.1 = 3
    expect(E({ "e-data": { B92: 1000, L46: 940 } }).d12).toBeCloseTo(3, 9);
  });
  it("scores 0 for consumption that went up, and with no prior-year baseline", () => {
    expect(E({ "e-data": { B92: 1000, L46: 1100 } }).d12).toBe(0);
    expect(E({ "e-data": { L46: 900 } }).d12).toBe(0);
    expect(E({}).d12).toBe(0);
  });
  it("stays 0 in workbook-parity mode — the workbook never computed it", () => {
    const workbook = wb({ assumptions: ASSUMPTIONS, "e-data": { B92: 1000, L46: 900 } });
    expect(scoreEnvironmental(workbook, { mode: "workbook-parity" }).rows.d12).toBe(0);
  });
});

describe("E d24 — Water efficiency initiative active, 3 pts (MANUAL_ZERO now scored)", () => {
  // Ledger 5.1: IF(B94="Yes",3,IF(B94="Partial",1.5,0))
  it("scores the Yes / Partial / No ladder", () => {
    expect(E({ "e-data": { B94: "Yes" } }).d24).toBe(3);
    expect(E({ "e-data": { B94: "Partial" } }).d24).toBe(1.5);
    expect(E({ "e-data": { B94: "No" } }).d24).toBe(0);
    expect(E({ "e-data": { B94: "N/A" } }).d24).toBe(0);
    expect(E({}).d24).toBe(0);
  });
  it("stays 0 in workbook-parity mode", () => {
    const workbook = wb({ assumptions: ASSUMPTIONS, "e-data": { B94: "Yes" } });
    expect(scoreEnvironmental(workbook, { mode: "workbook-parity" }).rows.d24).toBe(0);
  });
});

/* ================================================================== *
 * SOCIAL
 * ================================================================== */

describe("S d6 — % Black female management (EEA2 L1+L2), 6 pts", () => {
  // C6 = IF((L5+L6)=0,0,IF((F5+F6+G5+G6+H5+H6)/(L5+L6)>=B51,6,IF(…>=B51*B9,6*(…)/B51,0)))
  it("awards full points at the 30% target", () => {
    expect(S({ "s-data": { F5: 2, F6: 1, L5: 5, L6: 5 } }).d6).toBe(6);
  });
  it("counts African, Coloured and Indian women across both management levels", () => {
    expect(S({ "s-data": { F5: 1, G5: 1, H5: 1, L5: 10, L6: 0 } }).d6).toBeCloseTo(6, 9);
  });
  it("pro-rates between the floor and the target", () => {
    // 2/10 = 0.2 → ≥ 0.3×0.5 → 6 × 0.2 / 0.3 = 4
    expect(S({ "s-data": { F5: 2, L5: 10 } }).d6).toBeCloseTo(4, 9);
  });
  it("scores 0 with no management headcount", () => {
    expect(S({ "s-data": { F5: 2 } }).d6).toBe(0);
  });
  it("END TO END — the headcount matrix reaches d6", () => {
    // hc_{level}_{col}: level 0 = EEA2 L1, level 1 = L2; cols B,C,D,E,F,G,H,I,J,K
    const raw = wb({
      assumptions: ASSUMPTIONS,
      "s-data": { hc_0_0: 3, hc_0_4: 2, hc_1_0: 4, hc_1_4: 1 },
    });
    expect(scoreSocial(deriveEsgSummaryCells(raw)).rows.d6).toBe(6); // 3/10 = 30%
  });
});

describe("S d17 — LTIFR ≤ 2.0, 8 pts", () => {
  // C17 = IF(G35=0,0,IF(G35<=B55,8,IF(G35<=B55/B9,MAX(0,8*(1+B9-G35/B55)),0)))
  it("awards full points at or under the target", () => {
    expect(S({ "s-data": { G35: 1.5 } }).d17).toBe(8);
    expect(S({ "s-data": { G35: 2 } }).d17).toBe(8);
  });
  it("bands down above the target", () => {
    expect(S({ "s-data": { G35: 2.5 } }).d17).toBeCloseTo(2, 9);
  });
  it("scores 0 beyond target/floor and for the 'Awaiting hours worked' string", () => {
    expect(S({ "s-data": { G35: 5 } }).d17).toBe(0);
    expect(S({ "s-data": { G35: "Awaiting hours worked" } }).d17).toBe(0);
    expect(S({}).d17).toBe(0);
  });
  it("END TO END — quarterly hours and LTIs derive G35 and reach d17", () => {
    const raw = wb({
      assumptions: ASSUMPTIONS,
      "s-data": {
        C27: 100000, D27: 100000, E27: 100000, F27: 100000, // 400,000 hours
        C29: 1, // 1 LTI → 1 × 1e6 / 4e5 = 2.5
      },
    });
    expect(scoreSocial(deriveEsgSummaryCells(raw)).rows.d17).toBeCloseTo(2, 9);
  });
});

describe("S d18 — Zero fatalities, 8 pts (unconditional score removed)", () => {
  it("requires a reported fatality count of zero", () => {
    expect(S({ "s-data": { G28: 0 } }).d18).toBe(8);
  });
  it("scores 0 for a reported fatality", () => {
    expect(S({ "s-data": { G28: 1 } }).d18).toBe(0);
  });
  it("scores 0 for the template's em-dash placeholder and for nothing at all", () => {
    expect(S({ "s-data": { G28: "—" } }).d18).toBe(0);
    expect(S({ "s-data": { G28: "" } }).d18).toBe(0);
    expect(S({}).d18).toBe(0);
  });
  it("workbook-parity mode still hands 8 points to a blank cell", () => {
    const opts = { mode: "workbook-parity" } as const;
    expect(scoreSocial(wb({ assumptions: ASSUMPTIONS }), opts).rows.d18).toBe(8);
    expect(scoreSocial(wb({ assumptions: ASSUMPTIONS, "s-data": { G28: "—" } }), opts).rows.d18).toBe(8);
  });
  it("END TO END — a 0/0/0/0 quarterly fatality return earns the points", () => {
    const raw = wb({
      assumptions: ASSUMPTIONS,
      "s-data": { C28: 0, D28: 0, E28: 0, F28: 0 },
    });
    expect(scoreSocial(deriveEsgSummaryCells(raw)).rows.d18).toBe(8);
  });
});

describe("S d20 — Incident investigation rate, 4 pts (wrong-cells fix)", () => {
  // C20 = IF(SUM(G29:G33)>0,4,0) — not G29 alone.
  it("counts MTIs, near-misses, vehicle and property incidents too", () => {
    expect(S({ "s-data": { G30: 2 } }).d20).toBe(4);
    expect(S({ "s-data": { G33: 1 } }).d20).toBe(4);
    expect(S({ "s-data": { G29: 4 } }).d20).toBe(4);
    expect(S({}).d20).toBe(0);
  });
});

describe("S d22 — CSI/SED spend ≥1% NPAT, 5 pts (MANUAL_ZERO now scored)", () => {
  // Ledger 5.2: IF(B84<=0,0,IF(D82/B84>=B56,5,IF(…>=B56*B9,5*(…)/B56,0)))
  const A = { ...ASSUMPTIONS, B56: 0.01 };
  it("awards full points at 1% of NPAT", () => {
    expect(
      scoreSocial(wb({ assumptions: A, "s-data": { B84: 10_000_000, D82: 100_000 } })).rows.d22,
    ).toBe(5);
  });
  it("pro-rates a 0.6% contribution", () => {
    expect(
      scoreSocial(wb({ assumptions: A, "s-data": { B84: 10_000_000, D82: 60_000 } })).rows.d22,
    ).toBeCloseTo(3, 9);
  });
  it("uses NPAT (B84), never the derived SDL levy (B44)", () => {
    const rows = scoreSocial(
      wb({ assumptions: A, "s-data": { B44: 100_000, D82: 100_000 } }),
    ).rows;
    expect(rows.d22).toBe(0); // no NPAT → no score, despite B44 being present
  });
  it("scores 0 with a loss or no NPAT", () => {
    expect(scoreSocial(wb({ assumptions: A, "s-data": { B84: -5, D82: 100 } })).rows.d22).toBe(0);
    expect(scoreSocial(wb({ assumptions: A, "s-data": { D82: 100_000 } })).rows.d22).toBe(0);
  });
  it("END TO END — the CSI register derives D82 and reaches d22", () => {
    // s-data-csi columns: A=initiative B=month C=beneficiaries D=spend
    const raw = wb({
      assumptions: A,
      "s-data": { B84: 10_000_000 },
      "s-data-csi": { A72: "Food drive", D72: 60_000, A73: "Bursaries", D73: 40_000 },
    });
    expect(scoreSocial(deriveEsgSummaryCells(raw)).rows.d22).toBe(5); // 100k / 10m = 1%
  });
  it("stays 0 in workbook-parity mode", () => {
    const workbook = wb({ assumptions: A, "s-data": { B84: 10_000_000, D82: 100_000 } });
    expect(scoreSocial(workbook, { mode: "workbook-parity" }).rows.d22).toBe(0);
  });
});

describe("S d24 — Local labour procurement ≥40%, 5 pts (MANUAL_ZERO now scored)", () => {
  // Ledger 5.2: IF(B87=0,0,IF(B86/B87>=B57,5,IF(…>=B57*B9,5*(…)/B57,0)))
  const A = { ...ASSUMPTIONS, B57: 0.4 };
  it("awards full points at the 40% target", () => {
    expect(
      scoreSocial(wb({ assumptions: A, "s-data": { B86: 400, B87: 1000 } })).rows.d24,
    ).toBe(5);
  });
  it("pro-rates a 25% local share", () => {
    expect(
      scoreSocial(wb({ assumptions: A, "s-data": { B86: 250, B87: 1000 } })).rows.d24,
    ).toBeCloseTo(3.125, 9);
  });
  it("scores 0 below the floor and with no total spend", () => {
    expect(scoreSocial(wb({ assumptions: A, "s-data": { B86: 100, B87: 1000 } })).rows.d24).toBe(0);
    expect(scoreSocial(wb({ assumptions: A, "s-data": { B86: 400 } })).rows.d24).toBe(0);
  });
  it("stays 0 in workbook-parity mode", () => {
    const workbook = wb({ assumptions: A, "s-data": { B86: 400, B87: 1000 } });
    expect(scoreSocial(workbook, { mode: "workbook-parity" }).rows.d24).toBe(0);
  });
});

describe("S d8 — % Persons with Disabilities, 5 pts (now reachable)", () => {
  // EE_Scorecard!B8 was the constant-zero formula `=0`. The PWD headcount input
  // (`S_Data!B88`) now exists and esgDeriveSummary computes B8 = B88 / L12.
  it("END TO END — a PWD headcount reaches d8", () => {
    const raw = wb({
      assumptions: ASSUMPTIONS,
      // 100 employees across the matrix, 3 of them with disabilities → 3% ≥ 2%
      "s-data": { hc_0_0: 50, hc_1_0: 50, B88: 3 },
    });
    expect(scoreSocial(deriveEsgSummaryCells(raw)).rows.d8).toBe(5);
  });
  it("pro-rates below the 2% target", () => {
    const raw = wb({
      assumptions: ASSUMPTIONS,
      "s-data": { hc_0_0: 50, hc_1_0: 50, B88: 1 }, // 1% → 5 × 0.01 / 0.02
    });
    expect(scoreSocial(deriveEsgSummaryCells(raw)).rows.d8).toBeCloseTo(2.5, 9);
  });
  it("scores 0 with no PWD data", () => {
    const raw = wb({ assumptions: ASSUMPTIONS, "s-data": { hc_0_0: 100 } });
    expect(scoreSocial(deriveEsgSummaryCells(raw)).rows.d8).toBe(0);
  });
});

describe("S d10 — EE numerical targets set, 3 pts (now reachable)", () => {
  // The formula always read EE_Scorecard!B12; the cell simply had no UI until
  // EE_MATURITY_ROWS gained B11–B14.
  it("scores the Yes / Partial / No ladder off EE_Scorecard!B12", () => {
    expect(S({ ee: { B12: "Yes" } }).d10).toBe(3);
    expect(S({ ee: { B12: "Partial" } }).d10).toBe(1.5);
    expect(S({ ee: { B12: "No" } }).d10).toBe(0);
    expect(S({}).d10).toBe(0);
  });
});

/* ================================================================== *
 * GOVERNANCE
 * ================================================================== */

describe("G d5 — King V score, 25 pts (magic /170 removed)", () => {
  it("uses the derived king5!_max_score when the grid supplies one", () => {
    expect(G({ king5: { E21: 100, _max_score: 200 } }).d5).toBeCloseTo(12.5, 9);
    expect(G({ king5: { E21: 170, _max_score: 170 } }).d5).toBe(25);
  });
  it("falls back to the workbook's own 17 × 10 = 170 when only a total was imported", () => {
    expect(G({ king5: { E21: 135 } }).d5).toBeCloseTo((135 / 170) * 25, 9);
  });
  it("scores 0 with no King V data", () => {
    expect(G({}).d5).toBe(0);
  });
  it("END TO END — a King V grid derives its own total and denominator", () => {
    // A=num B=principle C=status D=weight
    const raw = wb({
      assumptions: ASSUMPTIONS,
      king5: {
        A4: 1, B4: "P1", C4: "Applied", D4: 8,
        A5: 2, B5: "P2", C5: "Explained", D5: 6,
      },
    });
    // 10 + 7 = 17 raw, out of 10 × max(17, 2) = 170
    expect(scoreGovernance(deriveEsgSummaryCells(raw)).rows.d5).toBeCloseTo((17 / 170) * 25, 9);
  });
});

describe("G d9 — IFRS S1/S2 disclosures, 10 pts (fabricated denominator removed)", () => {
  // Corrected: 10 × IFRS_S1_S2!E29 / 110 (the sheet's own scoring).
  it("scores the sheet's own disclosure total out of 110", () => {
    expect(G({ ifrs: { E29: 18, _max_score: 110 } }).d9).toBeCloseTo((10 * 18) / 110, 9);
  });
  it("falls back to the sheet's 22 × 5 = 110 maximum", () => {
    expect(G({ ifrs: { E29: 55 } }).d9).toBeCloseTo(5, 9);
  });
  it("no longer reads the fabricated `_total ?? 10` denominator", () => {
    // Under the old code `_yes_count: 5, _total: 10` scored 5 points.
    expect(G({ ifrs: { _yes_count: 5, _total: 10 } }).d9).toBe(0);
  });
  it("caps at the indicator maximum", () => {
    expect(G({ ifrs: { E29: 500, _max_score: 110 } }).d9).toBe(10);
  });
  it("END TO END — an IFRS grid derives E29 and reaches d9", () => {
    // A=requirement B=pillar C=status
    const raw = wb({
      assumptions: ASSUMPTIONS,
      ifrs: {
        A5: "Governance a", C5: "Disclosed", // 5
        A6: "Strategy b", C6: "Partially Disclosed", // 3
      },
    });
    expect(scoreGovernance(deriveEsgSummaryCells(raw)).rows.d9).toBeCloseTo((10 * 8) / 110, 9);
  });
});

describe("G d25 — No material regulatory penalties, 5 pts (unconditional score removed)", () => {
  it("requires an explicit nil assertion", () => {
    expect(G({ "g-data": { B25: 0 } }).d25).toBe(5);
  });
  it("scores 0 for a reported penalty", () => {
    expect(G({ "g-data": { B25: 3 } }).d25).toBe(0);
  });
  it("scores 0 when the assertion is absent or blank — the free-points defect", () => {
    expect(G({}).d25).toBe(0);
    expect(G({ "g-data": { B25: "" } }).d25).toBe(0);
    expect(G({ "g-data": { B5: 7 } }).d25).toBe(0);
  });
  it("workbook-parity mode still hands 5 points to a cell that does not exist", () => {
    expect(scoreGovernance(wb({ assumptions: ASSUMPTIONS }), { mode: "workbook-parity" }).rows.d25).toBe(5);
  });
});
