/**
 * Every derivation in `esgDeriveSummary.ts`, checked against the workbook
 * formula it implements (`docs/esg/ESG_FORMULA_LEDGER.md` Part 2 + the verbatim
 * dump in `docs/esg/extracted/*.json`).
 *
 * The three things these tests exist to protect:
 *   1. PRECEDENCE — a value the user typed is never overwritten, except for the
 *      four cells the ledger marks DERIVED-ONLY, and even those are only
 *      recomputed when their own source inputs are present.
 *   2. NO GARBAGE — an empty or partially-filled workbook derives to 0/absent.
 *      Never NaN, never Infinity, never a fabricated number.
 *   3. GOLDEN PARITY — deriving the SG Consumer fixture reproduces the
 *      workbook's own values rather than moving them.
 */
import { describe, expect, it } from "vitest";
import { buildSgConsumerGoldenWorkbook } from "../../../../EsgToolkit/src/lib/fixtures/esg-consumer-golden";
import { deriveEsgSummaryCells } from "../esgDeriveSummary";
import { ESG_GRID_SECTIONS } from "../esgGridSections";
import type { EsgWorkbookData } from "../esgWorkbookStorage";

type Cells = Record<string, unknown>;

function wb(sections: Record<string, Cells>): EsgWorkbookData {
  return {
    companyId: "derive-test",
    sections: Object.fromEntries(Object.entries(sections).map(([k, cells]) => [k, { cells }])),
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as EsgWorkbookData;
}

function cells(w: EsgWorkbookData, sectionId: string): Cells {
  return (w.sections?.[sectionId]?.cells ?? {}) as Cells;
}

function derive(sections: Record<string, Cells>): EsgWorkbookData {
  return deriveEsgSummaryCells(wb(sections));
}

/* ================================================================== *
 * 1. Precedence — fill vs force
 * ================================================================== */

describe("precedence: derived values never overwrite what a user entered", () => {
  it("keeps an explicit summary value and ignores the raw inputs behind it", () => {
    const d = derive({ "e-data": { s1a_C14: 100, L19: 9999, L75: 8888 } });
    expect(cells(d, "e-data").L19).toBe(9999);
    expect(cells(d, "e-data").L75).toBe(8888);
  });

  it("treats an explicit 0 as entered — not as an empty cell to fill", () => {
    const d = derive({ "e-data": { s1a_C14: 100, L19: 0 } });
    expect(cells(d, "e-data").L19).toBe(0);
  });

  it("treats an empty string as absent and fills it", () => {
    const d = derive({ "e-data": { s1a_C14: 100, L19: "" } });
    expect(cells(d, "e-data").L19).toBe(100);
  });

  it("is idempotent — deriving a derived workbook changes nothing", () => {
    const once = derive({
      "e-data": { s1a_C14: 100, s2_C14: 500, water_C14: 12, solar_C14: 40 },
      "s-data": { hc_0_0: 10, B43: 1_000_000, C27: 400_000, C29: 2 },
      "g-data": { B5: 7, B13: "Yes" },
      ee: { B9: "Yes" },
    });
    const twice = deriveEsgSummaryCells(once);
    expect(twice.sections).toEqual(once.sections);
  });

  describe("the DERIVED-ONLY cells the ledger says must overwrite", () => {
    it("Assumptions!B9 replaces the reporting-standard text the old form left there", () => {
      // The pre-migration form writes "Primary reporting standard" into B9.
      const d = derive({ assumptions: { B6: "Strict", B9: "King V + IFRS S1/S2" } });
      expect(cells(d, "assumptions").B9).toBe(0.7);
    });

    it("S_Data!B44 replaces an NPAT figure typed into the SDL-levy cell", () => {
      // `S_DATA_PAYROLL_FIELDS` mislabels B44 "NPAT (R)" — ledger Part 2E.
      const d = derive({ "s-data": { B43: 10_331_940.87, B44: 42_000_000 } });
      expect(cells(d, "s-data").B44).toBeCloseTo(103_319.4087, 4);
    });

    it("S_Data!B44 is left alone when there is no payroll to compute it from", () => {
      const d = derive({ "s-data": { B44: 103_319.4087 } });
      expect(cells(d, "s-data").B44).toBeCloseTo(103_319.4087, 4);
    });

    it("S_Data!G35 replaces a typed LTIFR once hours worked exist", () => {
      const d = derive({ "s-data": { C27: 400_000, C29: 4, G35: 0.1 } });
      expect(cells(d, "s-data").G35).toBeCloseTo(10, 6);
    });

    it("S_Data!G35 is left alone while hours worked are missing", () => {
      const d = derive({ "s-data": { C29: 4, G35: "Awaiting hours worked" } });
      expect(cells(d, "s-data").G35).toBe("Awaiting hours worked");
    });

    it("King5!E21 replaces the weighted total the grid mis-stores as the raw score", () => {
      // `esgGridRows.syncDerivedFields` writes SUM(E*D/10) — the workbook's F21 —
      // into E21. G_Scorecard!C5 = E21/170*25, so that understated King V.
      const d = derive({
        king5: {
          A4: 1, B4: "P1", C4: "Applied", D4: 8,
          A5: 2, B5: "P2", C5: "Explained", D5: 6,
          E21: 12.2, // what the grid stored (8 + 4.2 weighted)
        },
      });
      expect(cells(d, "king5").E21).toBe(17); // 10 + 7 raw
      expect(cells(d, "king5").F21).toBeCloseTo(12.2, 6);
    });

    it("King5!E21 injected with no grid behind it is left untouched", () => {
      const d = derive({ king5: { E21: 135 } });
      expect(cells(d, "king5").E21).toBe(135);
    });
  });
});

/* ================================================================== *
 * 2. Empty / partial workbooks
 * ================================================================== */

describe("empty and partial workbooks derive to nothing, never to garbage", () => {
  it("a workbook with no cells at all is returned unchanged", () => {
    const blank = wb({ "e-data": {}, "s-data": {}, "g-data": {}, waste: {}, fleet: {} });
    const d = deriveEsgSummaryCells(blank);
    expect(d).toBe(blank);
  });

  it("a workbook with no sections at all does not throw", () => {
    const empty = { companyId: "x", sections: {}, updatedAt: "" } as unknown as EsgWorkbookData;
    expect(() => deriveEsgSummaryCells(empty)).not.toThrow();
  });

  it("never produces NaN or Infinity from partial data", () => {
    const d = derive({
      assumptions: { B8: "Standard" },
      // Every denominator in the ledger, deliberately zero or missing.
      "e-data": { L46: 0, L63: 0, s1a_C14: 0, solar_C14: 0, waste_C14: 0 },
      "s-data": { hc_0_0: 0, B43: 0, C27: 0, C29: 3 },
      "g-data": { B5: 0, B6: 3, B7: 1, B8: 0, B10: 0, B22: 0 },
      ee: { B9: "" },
      waste: { A5: "Mar-26", C5: "Mixed", D5: 0, E5: 0, F5: 0 },
      fleet: { A4: "AB12CDGP", I4: 0, J4: 0, L4: 0 },
      king5: { A4: 1, B4: "P1", C4: "Not Applied", D4: 0 },
      ifrs: { A5: "Board oversight", C5: "Not Disclosed" },
    });
    const bad: string[] = [];
    for (const [sectionId, section] of Object.entries(d.sections ?? {})) {
      for (const [ref, v] of Object.entries(section.cells ?? {})) {
        if (typeof v === "number" && !Number.isFinite(v)) bad.push(`${sectionId}!${ref} = ${v}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("does not invent a headcount, a fleet, or a waste rate from an unrelated section", () => {
    const d = derive({ assumptions: { B8: "Lean" } });
    expect(cells(d, "s-data").L12).toBeUndefined();
    expect(cells(d, "fleet").B28).toBeUndefined();
    expect(cells(d, "waste").B16).toBeUndefined();
  });
});

/* ================================================================== *
 * 3. Assumptions!B9 — the banding floor
 * ================================================================== */

describe("Assumptions!B9 = IF(B8=\"Lean\",0.3,IF(B8=\"Strict\",0.7,0.5))", () => {
  it.each([
    ["Lean", 0.3],
    ["Standard", 0.5],
    ["Strict", 0.7],
  ])("stance %s at B8 → floor %s", (stance, floor) => {
    expect(cells(derive({ assumptions: { B8: stance } }), "assumptions").B9).toBe(floor);
  });

  it("falls back to the stance the current form writes at B6", () => {
    expect(cells(derive({ assumptions: { B6: "Lean" } }), "assumptions").B9).toBe(0.3);
  });

  it("defaults to 0.5 when the stance is unset or unrecognised", () => {
    expect(cells(derive({ assumptions: { B8: "Sector: Transport" } }), "assumptions").B9).toBe(0.5);
    expect(cells(derive({ "e-data": { s1a_C14: 1 } }), "assumptions").B9).toBe(0.5);
  });

  it("is case-insensitive so a stored lowercase key still resolves", () => {
    expect(cells(derive({ assumptions: { B8: "strict" } }), "assumptions").B9).toBe(0.7);
  });
});

/* ================================================================== *
 * 4. E_Data — monthly roll-ups and the GHG summary block
 * ================================================================== */

describe("E_Data monthly roll-ups and GHG summary (rows 14–90)", () => {
  const d = derive({
    "e-data": {
      s1a_C14: 100, s1a_D14: 50, // depot 1 → L14 = 150
      s1a_C15: 25,               // depot 2 → L15 = 25
      s1b_C14: 10,               // generator diesel  → L23
      s1c_C14: 4,                // LPG               → L32
      s1d_C14: 6,                // business cars     → L37
      s2_C14: 1000, s2_D14: 200, // electricity       → L41, L46
      solar_C14: 300,            // solar             → L50, L81
      water_C14: 30, water_E16: 70, // water          → L58/L59, L63
    },
  });
  const e = cells(d, "e-data");

  it("per-row YTD: Ln = SUM(Cn:Kn), positional within each monthly block", () => {
    expect(e.L14).toBe(150);
    expect(e.L15).toBe(25);
    expect(e.L23).toBe(10);
    expect(e.L32).toBe(4);
    expect(e.L37).toBe(6);
    expect(e.L41).toBe(1200);
    expect(e.L50).toBe(300);
    expect(e.L58).toBe(30);
    expect(e.L59).toBe(70);
  });

  it("block totals: L19 (diesel), L28 (generator), L46 (electricity), L63 (water)", () => {
    expect(e.L19).toBe(175);
    expect(e.L28).toBe(10);
    expect(e.L46).toBe(1200);
    expect(e.L63).toBe(100);
  });

  it("scope rows: L75 = Σs1a, L76 = Σs1b, L77 = Σs1c, L78 = Σs1d, L79 = SUM(L75:L78)", () => {
    expect(e.L75).toBe(175);
    expect(e.L76).toBe(10);
    expect(e.L77).toBe(4);
    expect(e.L78).toBe(6);
    expect(e.L79).toBe(195);
  });

  it("L80 = L46 and L81 = SUM(L50:L54) — the cells E_Scorecard!C7 should read", () => {
    // The workbook formula points at M80/M81, which do not exist (rows 80-81
    // stop at column L), which is why E d7 is permanently 0 — ledger 5.3.
    expect(e.L80).toBe(1200);
    expect(e.L81).toBe(300);
    expect(e.M80).toBeUndefined();
    expect(e.M81).toBeUndefined();
  });

  it("L82 = L80+L81, L83 = L63, L84 = L79+L82+L83, L85/L86 = share of total", () => {
    expect(e.L82).toBe(1500);
    expect(e.L83).toBe(100);
    expect(e.L84).toBe(1795);
    expect(e.L85).toBeCloseTo(195 / 1795, 10);
    expect(e.L86).toBeCloseTo(1500 / 1795, 10);
  });

  it("F90 = L79+L82 — the net-zero 'current YTD' the user had to type", () => {
    expect(e.F90).toBe(1695);
  });

  it("L67 = AVERAGE(C67:K67) — the Cority monthly % row", () => {
    const avg = derive({ "e-data": { waste_C14: 10.65, waste_D14: 16.24, waste_E14: 11.06 } });
    expect(cells(avg, "e-data").L67).toBeCloseTo((10.65 + 16.24 + 11.06) / 3, 10);
  });

  it("derives nothing for a block with no month cells", () => {
    const none = derive({ "e-data": { s1a_C14: 5 } });
    expect(cells(none, "e-data").L46).toBeUndefined();
    expect(cells(none, "e-data").L81).toBeUndefined();
    expect(cells(none, "e-data").L80).toBeUndefined();
  });

  it("reads a workbook that carries the sheet's real row numbers, not the grid's base-14", () => {
    const imported = derive({ "e-data": { s2_C41: 100, s2_C42: 200, s2_C43: 300 } });
    const c = cells(imported, "e-data");
    expect(c.L41).toBe(100);
    expect(c.L42).toBe(200);
    expect(c.L43).toBe(300);
    expect(c.L46).toBe(600);
  });
});

/* ================================================================== *
 * 5. Waste_Register — including the section-id mismatch
 * ================================================================== */

describe("Waste_Register B16/B17/B18", () => {
  const register = {
    A5: "Mar-26", B5: "CPT", C5: "Commercial/Industrial (landfill)", D5: 2000, E5: 0, F5: 2000,
    A6: "Mar-26", B6: "CPT", C6: "Paper/Cardboard K4", D6: 1100, E6: 1100, F6: 0,
  };

  it("B16 = Σ recycled ÷ Σ total over the register (workbook hardcodes =91.1%)", () => {
    const d = derive({ waste: register });
    expect(cells(d, "waste").B16).toBeCloseTo(1100 / 3100, 10);
  });

  it("B16 uses the Oricol 'TOTAL' row exclusively when one exists — no double count", () => {
    const d = derive({
      waste: {
        ...register,
        A9: "Mar-26", B9: "ALL", C9: "TOTAL (Oricol Big Numbers)",
        D9: 22470, E9: 20470, F9: 2000,
      },
    });
    // Reproduces the workbook's hardcoded 0.911 from the register's own tonnage.
    expect(cells(d, "waste").B16).toBeCloseTo(0.911, 3);
  });

  it("B16 falls back to the Oricol % Diversion scalar (E_Data!L70), normalised", () => {
    const d = derive({ "e-data": { L70: 91.1 } });
    expect(cells(d, "waste").B16).toBeCloseTo(0.911, 10);
  });

  it("B16 is clamped to 0–1 and never divides by zero", () => {
    expect(cells(derive({ waste: { C5: "Mixed", D5: 0, E5: 0 } }), "waste").B16).toBeUndefined();
    const over = derive({ waste: { C5: "Mixed", D5: 100, E5: 500 } });
    expect(cells(over, "waste").B16).toBe(1);
  });

  it("B17 = AVERAGE of the Cority monthly row, whichever section holds it", () => {
    // SECTION-ID MISMATCH: the monthly grid renders in the `e-data` "waste"
    // sub-tab and writes `waste_C14…`, but the scorer reads section `waste`!B17.
    const fromForm = derive({ "e-data": { waste_C14: 10.65, waste_D14: 16.24 } });
    expect(cells(fromForm, "waste").B17).toBeCloseTo(0.13445, 10);

    // An imported Waste_Register carries B13:J13 as fractions in section `waste`.
    const fromImport = derive({ waste: { B13: 0.1065, C13: 0.1624 } });
    expect(cells(fromImport, "waste").B17).toBeCloseTo(0.13445, 10);
  });

  it("B18 = Σ positive landfill kg × 0.58 / 1000, from the register only", () => {
    // The workbook's SUMIF(F4:F40) swallows F13 — a Cority *percentage* — giving
    // 2.320153236 instead of 2.32. Derived from the landfill column alone.
    const d = derive({ waste: { ...register, C9: "TOTAL", D9: 22470, E9: 20470, F9: 2000 } });
    expect(cells(d, "waste").B18).toBeCloseTo((2000 + 2000) * 0.58 / 1000, 10);
  });

  it("does not read the scorecard block at rows 16–19 as waste streams", () => {
    // Waste_Register!B16:B19 sit inside the register's own row range.
    const d = derive({ waste: { B16: 0.911, B17: 0.1242555556, B18: 2.320153236, B19: "Oricol" } });
    expect(cells(d, "waste").B16).toBe(0.911);
    expect(cells(d, "waste").G16).toBeUndefined();
    expect(cells(d, "waste").H16).toBeUndefined();
  });

  it("fills the per-row G = E/D and H = F*0.58/1000 columns", () => {
    const d = derive({ waste: register });
    expect(cells(d, "waste").G5).toBe(0);
    expect(cells(d, "waste").G6).toBe(1);
    expect(cells(d, "waste").H5).toBeCloseTo(1.16, 10);
    expect(cells(d, "waste").H6).toBe(0);
  });
});

/* ================================================================== *
 * 6. Fleet_Register
 * ================================================================== */

describe("Fleet_Register B28 / H28 and the per-vehicle derived columns", () => {
  // A=reg B=depot C=model D=gvm E=tare F=carry G=fuelCap H=tracking
  // I=monthlyKm J=monthlyLitres K=l100Actual L=l100Norm M=monthlyTco2 … P=isEv
  const fleet = {
    A4: "AB12CDGP", F4: 7820, I4: 4000, J4: 1000, L4: 26.5, P4: "No",
    A5: "EF34GHGP", F5: 1050, I5: 1000, J5: 400, L5: 30, P5: "Yes",
  };

  it("adds an EV column without disturbing any existing column letter", () => {
    const keys = ESG_GRID_SECTIONS.fleet.columns.map((c) => c.key);
    expect(keys.slice(0, 15)).toEqual([
      "reg", "depot", "model", "gvm", "tare", "carry", "fuelCap", "tracking",
      "monthlyKm", "monthlyLitres", "l100Actual", "l100Norm", "monthlyTco2",
      "serviceStatus", "licenceExpiry",
    ]);
    expect(keys[15]).toBe("isEv"); // index 15 → column P, past the sheet's last column O
  });

  it("K = IFERROR(J/I*100,0) per vehicle, and M = J*EF_diesel/1000", () => {
    const d = derive({ fleet, "e-data": { B4: 2.68 } });
    expect(cells(d, "fleet").K4).toBeCloseTo(25, 10);
    expect(cells(d, "fleet").K5).toBeCloseTo(40, 10);
    expect(cells(d, "fleet").M4).toBeCloseTo(2.68, 10);
  });

  it("B28 = vehicle count, H28 = EV count when no summary block was captured", () => {
    const d = derive({ fleet });
    expect(cells(d, "fleet").B28).toBe(2);
    expect(cells(d, "fleet").H28).toBe(1);
  });

  it("H28 = 0 (not absent) for an all-diesel fleet, so d17 scores 0 rather than skipping", () => {
    const d = derive({ fleet: { A4: "AB12CDGP", I4: 100, J4: 30 } });
    expect(cells(d, "fleet").B28).toBe(1);
    expect(cells(d, "fleet").H28).toBe(0);
  });

  it("prefers the depot summary block SUM(B23:B27) / SUM(H23:H27) when present", () => {
    const d = derive({
      fleet: {
        ...fleet,
        A22: "Depot", B22: "Total Vehicles",
        A23: "BLOEM", B23: "16", H23: "0",
        A24: "CPT", B24: "14", H24: "2",
        A28: "TOTAL",
      },
    });
    expect(cells(d, "fleet").B28).toBe(30);
    expect(cells(d, "fleet").H28).toBe(2);
  });

  it("never overwrites an imported B28/H28, including the sheet's text values", () => {
    const d = derive({ fleet: { ...fleet, B28: "134", H28: "0" } });
    expect(cells(d, "fleet").B28).toBe("134");
    expect(cells(d, "fleet").H28).toBe("0");
  });

  it("derives the SUMPRODUCT/COUNTIF aggregates E d15 and d16 need", () => {
    const d = derive({ fleet, assumptions: { B45: 1.05 } });
    const f = cells(d, "fleet");
    expect(f._vehicle_count).toBe(2);
    expect(f._l100_positive).toBe(2);
    // 25 <= 26.5*1.05 ✓ ; 40 <= 30*1.05 ✗
    expect(f._l100_within_norm).toBe(1);
    // tonne-km needs carry > 0 AND monthly km > 0 on the same row
    expect(f._tonne_km_rows).toBe(2);
  });

  it("derives nothing at all from an empty register", () => {
    const d = derive({ fleet: {}, "e-data": { s1a_C14: 1 } });
    expect(cells(d, "fleet").B28).toBeUndefined();
    expect(cells(d, "fleet")._vehicle_count).toBeUndefined();
  });
});

/* ================================================================== *
 * 7. S_Data — headcount matrix, H&S roll-ups, payroll, CSI
 * ================================================================== */

describe("S_Data headcount matrix B5:K12 and L5:L12", () => {
  // hc_{level}_{col}; columns 0-9 → B..K = Af M, Col M, Ind M, Wht M, Af F, Col F, Ind F, Wht F, For M, For F
  const d = derive({ "s-data": { hc_0_0: 10, hc_0_3: 5, hc_0_4: 5, hc_1_0: 4 } });
  const s = cells(d, "s-data");

  it("projects every hc_r_c cell onto its A1 address", () => {
    expect(s.B5).toBe(10);
    expect(s.E5).toBe(5);
    expect(s.F5).toBe(5);
    expect(s.B6).toBe(4);
  });

  it("Ln = SUM(Bn:Kn) per occupational level", () => {
    expect(s.L5).toBe(20);
    expect(s.L6).toBe(4);
  });

  it("B12:K12 = SUM(B5,…,B11) per column and L12 = SUM(L5,…,L11)", () => {
    expect(s.B12).toBe(14);
    expect(s.E12).toBe(5);
    expect(s.L12).toBe(24);
  });

  it("makes S_Scorecard!C6's cells (F5,F6,G5,G6,H5,H6) addressable", () => {
    const bfm = derive({ "s-data": { hc_0_4: 3, hc_0_5: 1, hc_1_6: 2, hc_0_0: 10, hc_1_0: 4 } });
    const c = cells(bfm, "s-data");
    expect(c.F5).toBe(3);
    expect(c.G5).toBe(1);
    expect(c.H6).toBe(2);
    expect(Number(c.L5) + Number(c.L6)).toBe(20);
  });

  it("leaves an imported L12 alone", () => {
    expect(cells(derive({ "s-data": { hc_0_0: 10, L12: 426 } }), "s-data").L12).toBe(426);
  });
});

describe("S_Data H&S roll-ups Gn = SUM(Cn:Fn)", () => {
  it("derives G27 hours, G29 LTIs and the rest of the incident rows", () => {
    const d = derive({ "s-data": { C27: 100_000, D27: 120_000, C29: 1, D29: 2, E29: 1, C33: 5 } });
    const s = cells(d, "s-data");
    expect(s.G27).toBe(220_000);
    expect(s.G29).toBe(4);
    expect(s.G33).toBe(5);
  });

  it("derives G28 fatalities — the hand-typed em-dash that gives 8 free points", () => {
    // `S_Scorecard!C18 = IF(OR(G28=0,G28="—",G28=""),8,0)`.
    expect(cells(derive({ "s-data": { C28: 1 } }), "s-data").G28).toBe(1);
    expect(cells(derive({ "s-data": { C28: 0, D28: 0 } }), "s-data").G28).toBe(0);
    // Nothing captured → nothing derived; the workbook's "—" is not contradicted.
    expect(cells(derive({ "s-data": { C29: 1 } }), "s-data").G28).toBeUndefined();
  });

  it("G35 = SUM(C29:F29)*1000000/SUM(C27:F27) and G36 adds MTIs (TRIFR)", () => {
    const d = derive({ "s-data": { C27: 400_000, C29: 4, C30: 2 } });
    expect(cells(d, "s-data").G35).toBeCloseTo(10, 10);
    expect(cells(d, "s-data").G36).toBeCloseTo(15, 10);
  });
});

describe("S_Data payroll and CSI", () => {
  it("B44 = IFERROR(B43*0.01,0) — SDL levy, never typed", () => {
    expect(cells(derive({ "s-data": { B43: 10_331_940.87 } }), "s-data").B44).toBeCloseTo(
      103_319.4087,
      6,
    );
  });

  it("counts CSI initiatives and totals D82 = SUM(D72:D81)", () => {
    const d = derive({
      "s-data-csi": {
        A72: "Feeding scheme", D72: 15_000,
        A73: "Bursaries", D73: 30_000,
        A74: "Clinic build",
      },
    });
    expect(cells(d, "s-data")._initiatives_count).toBe(3);
    expect(cells(d, "s-data").D82).toBe(45_000);
  });

  it("an empty CSI register earns nothing (no free 5 points)", () => {
    const d = derive({ "s-data": { hc_0_0: 1 } });
    expect(cells(d, "s-data")._initiatives_count).toBeUndefined();
    expect(cells(d, "s-data").D82).toBeUndefined();
  });
});

/* ================================================================== *
 * 8. EE_Scorecard
 * ================================================================== */

describe("EE_Scorecard demographic roll-ups and E5:E15", () => {
  const base = { "s-data": { hc_0_0: 10, hc_0_3: 5, hc_0_4: 5, hc_1_0: 4 } };

  it("B5 = (B5+C5+D5+F5+G5+H5)/L5 — Black % at EEA2 L1 (workbook divides by L5)", () => {
    expect(cells(derive(base), "ee").B5).toBeCloseTo(15 / 20, 10);
  });

  it("B7 = (S_Data!B5+S_Data!B6)/S_Data!L12 — Black top/senior management", () => {
    expect(cells(derive(base), "ee").B7).toBeCloseTo(14 / 24, 10);
  });

  it("B8 = PWD headcount / total — 0 until S_Data!B88 exists (workbook formula is =0)", () => {
    expect(cells(derive(base), "ee").B8).toBeUndefined();
    const withPwd = derive({ "s-data": { ...base["s-data"], B88: 2 } });
    expect(cells(withPwd, "ee").B8).toBeCloseTo(2 / 24, 10);
  });

  it("E5:E14 and E15 = SUM(E5,…,E14), matching the sheet's own weights", () => {
    const d = derive({
      ...base,
      ee: { B9: "Yes", B10: "Yes", B11: "Partial", B12: "Yes", B13: "No", B14: "Yes" },
    });
    const e = cells(d, "ee");
    expect(e.E5).toBe(20); // MIN(20, ROUND(0.75/0.6*20,2))
    expect(e.E7).toBe(20); // MIN(20, ROUND(0.5833/0.5*20,2))
    expect(e.E9).toBe(10); // Yes → 10
    expect(e.E10).toBe(5);
    expect(e.E11).toBe(2); // Partial → 2
    expect(e.E13).toBe(0); // No → 0
    expect(e.E15).toBe(20 + 0 + 20 + 0 + 10 + 5 + 2 + 5 + 0 + 5);
  });

  it("reproduces the golden fixture's EE total of 35", () => {
    const d = derive({
      ee: {
        B5: 0, B6: 0, B7: 0, B8: 0,
        B9: "Yes", B10: "Yes", B11: "Yes", B12: "Yes", B13: "Yes", B14: "Yes",
      },
    });
    expect(cells(d, "ee").E15).toBe(35); // 0+0+0+0+10+5+5+5+5+5
  });
});

/* ================================================================== *
 * 9. G_Data
 * ================================================================== */

describe("G_Data F5:F24", () => {
  it("reproduces every F value in the live workbook from its B values alone", () => {
    const d = derive({
      assumptions: { B8: "Standard", B50: 0.6 },
      "g-data": {
        B5: 7, B6: 5, B7: 2, B8: 0.4285714286, B9: 0.1428571429, B10: 4, B11: 4,
        B12: "Yes", B13: "Yes", B15: "Yes", B16: "Yes", B17: "Partial", B18: "Partial",
        B20: "Yes", B21: "Partial", B23: "Partial", B24: "Partial",
      },
    });
    const g = cells(d, "g-data");
    expect(g.F5).toBe(5);
    expect(g.F6).toBe(5);
    expect(g.F7).toBe(5);
    expect(g.F8).toBeCloseTo(3.5714285714, 8);
    expect(g.F9).toBe(0);
    expect(g.F10).toBe(5);
    expect(g.F11).toBe(5);
    expect(g.F12).toBe(5); // was missing from the old Y/N row list
    expect(g.F13).toBe(5);
    expect(g.F15).toBe(5);
    expect(g.F16).toBe(5);
    expect(g.F17).toBe(2.5);
    expect(g.F18).toBe(2.5);
    expect(g.F20).toBe(5);
    expect(g.F21).toBe(2.5);
    expect(g.F23).toBe(2.5);
    expect(g.F24).toBe(2.5);
  });

  it("scores nothing for an input that was never captured", () => {
    // F7 rewards a *low* exec-director ratio, so a missing B7 would otherwise
    // score the full 5. Uncaptured stays uncaptured.
    const g = cells(derive({ "g-data": { B5: 7 } }), "g-data");
    expect(g.F5).toBe(5);
    expect(g.F7).toBeUndefined();
    expect(g.F14).toBeUndefined();
    expect(g.F22).toBeUndefined();
  });

  it("uses the stance floor for the partial band", () => {
    const strict = derive({ assumptions: { B8: "Strict", B50: 0.6 }, "g-data": { B5: 7, B8: 0.35 } });
    // 0.35 >= 0.6*0.7 = 0.42 ? no → 0
    expect(cells(strict, "g-data").F8).toBe(0);
    const lean = derive({ assumptions: { B8: "Lean", B50: 0.6 }, "g-data": { B5: 7, B8: 0.35 } });
    // 0.35 >= 0.6*0.3 = 0.18 ? yes → 5*0.35/0.6
    expect(cells(lean, "g-data").F8).toBeCloseTo(5 * 0.35 / 0.6, 10);
  });
});

/* ================================================================== *
 * 10. King5_Scorecard and IFRS_S1_S2
 * ================================================================== */

describe("King5_Scorecard E21 / E22 / F21", () => {
  const d = derive({
    king5: {
      A4: 1, B4: "P1", C4: "Applied", D4: 8,
      A5: 2, B5: "P2", C5: "Explained", D5: 6,
      A6: 3, B6: "P3", C6: "Partially Applied", D6: 6,
      A7: 4, B7: "P4", C7: "Not Applied", D7: 6,
    },
  });

  it("E21 = SUM(E4:E20) with En = Applied 10 / Explained 7 / Partially 5 / else 0", () => {
    expect(cells(d, "king5").E21).toBe(22);
  });

  it("F21 = SUM(En*Dn/10) — the weighted score, kept separate from E21", () => {
    expect(cells(d, "king5").F21).toBeCloseTo(8 + 4.2 + 3 + 0, 10);
  });

  it("derives the /170 denominator instead of hardcoding it", () => {
    expect(cells(d, "king5")._max_score).toBe(170); // 17 principles × 10
    expect(cells(d, "king5").E22).toBeCloseTo(22 / 170, 10);
  });

  it("reproduces the workbook's 135 / 0.7941 from the live statuses", () => {
    const live = [
      "Applied", "Applied", "Explained", "Explained", "Partially Applied",
      "Explained", "Applied", "Applied", "Applied", "Partially Applied",
      "Partially Applied", "Applied", "Explained", "Explained", "Applied",
      "Partially Applied", "Applied",
    ];
    const grid: Cells = {};
    live.forEach((status, i) => {
      grid[`A${4 + i}`] = i + 1;
      grid[`B${4 + i}`] = `Principle ${i + 1}`;
      grid[`C${4 + i}`] = status;
    });
    const k = cells(derive({ king5: grid }), "king5");
    expect(k.E21).toBe(135);
    expect(k.E22).toBeCloseTo(0.7941176471, 9);
  });
});

describe("IFRS_S1_S2 E29 / E30", () => {
  it("E29 = Σ per-row score (Disclosed 5 / Partially 3 / N/A 5 / else 0)", () => {
    const d = derive({
      ifrs: {
        A5: "Board oversight", C5: "Disclosed",
        A6: "Management role", C6: "Partially Disclosed",
        A7: "Scenario analysis", C7: "Not Disclosed",
        A8: "Internal carbon price", C8: "N/A",
      },
    });
    expect(cells(d, "ifrs").E29).toBe(13);
    expect(cells(d, "ifrs")._max_score).toBe(110); // 22 requirements × 5
    expect(cells(d, "ifrs").E30).toBeCloseTo(13 / 110, 10);
  });

  it("reproduces the live workbook's 18 / 0.1636 from 8 partial + 4 not-disclosed", () => {
    const grid: Cells = {};
    const statuses = [
      ...Array(6).fill("Partially Disclosed"),
      ...Array(4).fill("Not Disclosed"),
      ...Array(2).fill("Partially Disclosed"),
    ];
    statuses.forEach((s, i) => {
      grid[`A${5 + i}`] = `Requirement ${i + 1}`;
      grid[`C${5 + i}`] = s;
    });
    const c = cells(derive({ ifrs: grid }), "ifrs");
    expect(c.E29).toBe(24); // 8 × 3
    expect(c.E30).toBeCloseTo(24 / 110, 10);
  });

  it("derives nothing when no status was captured", () => {
    expect(cells(derive({ ifrs: { _yes_count: 0, _total: 10 } }), "ifrs").E29).toBeUndefined();
  });
});

/* ================================================================== *
 * 11. Golden-fixture parity
 * ================================================================== */

describe("golden SG Consumer fixture — derivation must not move it", () => {
  const derived = deriveEsgSummaryCells(buildSgConsumerGoldenWorkbook());

  it("leaves every value the ledger's Part 4.5 table pins", () => {
    const e = cells(derived, "e-data");
    expect(e.L19).toBe(589465.53);
    expect(e.L46).toBe(2589578.44);
    expect(e.L63).toBe(4356.41);
    expect(e.L75).toBe(589465.53);
    expect(e.L82).toBe(2589578.44);
    expect(e.B90).toBe(0);
    expect(e.F90).toBe(3184558.93);
    expect(cells(derived, "assumptions").B9).toBe(0.5);
    expect(cells(derived, "waste").B16).toBe(0.911);
    expect(cells(derived, "waste").B17).toBe(0.1242555556);
    expect(cells(derived, "waste").B18).toBe(2.320153236);
    expect(cells(derived, "s-data").B44).toBe(103319.4087);
    expect(cells(derived, "s-data").G28).toBe("—");
    expect(cells(derived, "s-data").G35).toBe("Awaiting hours worked");
    expect(cells(derived, "s-data").L12).toBe(0);
    expect(cells(derived, "ee").B5).toBe(0);
    expect(cells(derived, "ee").B8).toBe(0);
    expect(cells(derived, "king5").E21).toBe(135);
    expect(cells(derived, "ifrs")._yes_count).toBe(0);
    expect(cells(derived, "ifrs")._total).toBe(10);
  });

  it("fills in the cells the fixture never carried, consistently with the workbook", () => {
    const e = cells(derived, "e-data");
    expect(e.L79).toBeCloseTo(594980.49, 6); // =SUM(L75,L76,L77,L78)
    expect(e.L80).toBeCloseTo(2589578.44, 6); // =L46
    expect(e.L83).toBeCloseTo(4356.41, 6); // =L63
    expect(e.L84).toBeCloseTo(3188915.34, 6); // =L79+L82+L83
    expect(cells(derived, "ee").E15).toBe(35); // =SUM(E5,…,E14)
    expect(cells(derived, "g-data").F26).toBe(66.0714285714); // imported, untouched
  });

  it("does not fabricate solar generation the fixture does not have", () => {
    const e = cells(derived, "e-data");
    expect(e.L50).toBeUndefined();
    expect(e.L81).toBeUndefined();
  });
});
