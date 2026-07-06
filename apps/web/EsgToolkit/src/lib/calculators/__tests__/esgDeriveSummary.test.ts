/**
 * ESG extraction-fidelity: a MANUALLY-filled workbook (raw grid cells only, no
 * hand-injected summary cells) must derive the template summary cells the
 * scorers read, so it scores like an imported/fixture workbook — the B-BBEE
 * parity the golden fixture masks (it injects L19/L12/F-cells directly).
 *
 * Derivation rules verified against
 * docs/esg/Okiru_ESG_Toolkit_v1_7_SG_Consumer_LiveData.xlsx:
 *   E_Data L19 = L14+..+L18 (each SUM(C:K)); L46 = s2; L63 = water
 *   S_Data L12 = SUM(L5..L11); G_Data F5 = IF(B5>0,5,0); F13.. = Y/N→5/2.5/0
 */
import { describe, it, expect } from "vitest";
import { deriveEsgSummaryCells } from "../esgDeriveSummary";
import { computeEsgScorecard } from "../index";
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";

function wb(sections: Record<string, Record<string, unknown>>): EsgWorkbookData {
  return {
    companyId: "t",
    sections: Object.fromEntries(
      Object.entries(sections).map(([k, cells]) => [k, { cells }]),
    ),
  } as unknown as EsgWorkbookData;
}

describe("deriveEsgSummaryCells — E_Data scope totals", () => {
  it("L19 = Σ all s1a_ month cells (diesel), L46 = s2, L63 = water", () => {
    const d = deriveEsgSummaryCells(
      wb({
        "e-data": {
          s1a_C14: 100, s1a_D14: 50, s1a_C15: 25,   // scope-1a diesel → 175
          s2_C14: 1000, s2_D14: 200,                 // scope-2 electricity → 1200
          water_C14: 30, water_E16: 70,              // water → 100
          solar_C14: 999,                            // not a scored total → ignored
        },
      }),
    );
    const c = d.sections!["e-data"]!.cells!;
    expect(c.L19).toBe(175);
    expect(c.L46).toBe(1200);
    expect(c.L63).toBe(100);
  });

  it("does not overwrite an explicit (imported/override) summary value", () => {
    const d = deriveEsgSummaryCells(
      wb({ "e-data": { s1a_C14: 100, L19: 9999 } }),
    );
    expect(d.sections!["e-data"]!.cells!.L19).toBe(9999);
  });
});

describe("deriveEsgSummaryCells — S_Data headcount L12", () => {
  it("L12 = Σ all hc_ headcount grid cells", () => {
    const d = deriveEsgSummaryCells(
      wb({ "s-data": { hc_0_0: 5, hc_0_1: 3, hc_1_0: 12, hc_4_9: 2 } }),
    );
    expect(d.sections!["s-data"]!.cells!.L12).toBe(22);
  });
});

describe("deriveEsgSummaryCells — G_Data governance scores", () => {
  it("F5 = board>0 ? 5 : 0; F13.. = Yes/Partial/No → 5/2.5/0", () => {
    const d = deriveEsgSummaryCells(
      wb({
        "g-data": {
          B5: 8,                 // board members > 0 → F5 = 5
          B13: "Yes",            // → F13 = 5
          B14: "Partial",        // → F14 = 2.5
          B15: "No",             // → F15 = 0
        },
      }),
    );
    const c = d.sections!["g-data"]!.cells!;
    expect(c.F5).toBe(5);
    expect(c.F13).toBe(5);
    expect(c.F14).toBe(2.5);
    expect(c.F15).toBe(0);
  });

  it("F5 = 0 when no board members", () => {
    const d = deriveEsgSummaryCells(wb({ "g-data": { B5: 0, B13: "Yes" } }));
    expect(d.sections!["g-data"]!.cells!.F5).toBe(0);
  });
});

describe("deriveEsgSummaryCells — CSI initiative count (no free points)", () => {
  it("_initiatives_count derived from the s-data-csi register rows", () => {
    const d = deriveEsgSummaryCells(
      wb({
        "s-data-csi": {
          A72: "Feeding scheme", A73: "Bursaries", A74: "Clinic build",
        },
      }),
    );
    expect(d.sections!["s-data"]!.cells!._initiatives_count).toBe(3);
  });

  it("empty CSI register → no _initiatives_count (social CSI must not be free)", () => {
    const d = deriveEsgSummaryCells(wb({ "s-data": { hc_0_0: 1 } }));
    expect(d.sections!["s-data"]!.cells!._initiatives_count).toBeUndefined();
  });
});

describe("manual-path fidelity: grids alone now move pillar scores", () => {
  it("a manual workbook scores social/governance > 0 (was 0 before derivation)", () => {
    const manual = wb({
      "s-data": { hc_0_0: 40, hc_1_0: 30, B45: "Yes", B46: "Yes" },
      "ee": { B5: 55, B8: 3, B9: "Yes", B10: "Yes", B12: "Yes" },
      "g-data": { B5: 9, B13: "Yes", B15: "Yes", B16: "Yes", B17: "Yes", B21: "Yes", B23: "Yes" },
      "s-data-csi": { A72: "a", A73: "b", A74: "c", A75: "d", A76: "e", A77: "f" },
    });
    const result = computeEsgScorecard(manual);
    expect(result).not.toBeNull();
    // Governance F-cells now derived → committee/ethics/POPIA points score.
    expect(result!.governance.score).toBeGreaterThan(0);
    // CSI now has 6 initiatives (≥ threshold) → its 5 pts are legitimately earned.
    expect(result!.social.score).toBeGreaterThan(0);
  });
});
