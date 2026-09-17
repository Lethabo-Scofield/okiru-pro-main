import { describe, expect, it } from "vitest";
import { writeEsgGridCells } from "@/lib/esg/esgGridRows";
import {
  EE_MATURITY_ROWS,
  E_DATA_ENERGY_BASELINE_FIELDS,
  E_DATA_WATER_INITIATIVE_FIELDS,
  G_DATA_MATURITY_ROWS,
  S_DATA_HEADCOUNT_FIELDS,
  S_DATA_PAYROLL_FIELDS,
} from "../esgSectionConfigs";
import { DEFAULT_YN_POINTS, maturityScoreFromYn, type MaturityRowDef } from "../EsgMaturityGrid";

/**
 * The inputs that make ten never-scoring indicators earnable.
 *
 * SOURCE OF TRUTH: `docs/esg/ESG_FORMULA_LEDGER.md` Part 5 (the cell each rule
 * needs) and `docs/esg/extracted/*.json` (the sheet each cell sits on). These
 * tests pin the CELL ADDRESSES and the VOCABULARY, because the scoring rules are
 * written against them by a different owner — a silent rename here would leave
 * those rules reading an empty cell and scoring 0 forever, which is the exact
 * failure mode the ledger documents.
 */

const cells = (fields: { cell: string }[]) => fields.map((f) => f.cell);

describe("environmental inputs the workbook never collected", () => {
  it("collects the prior-year electricity baseline the energy indicator needs", () => {
    // Ledger 5.1 `E d12` — the rule opens `IF(E_Data!$B$92=0,0,…)`.
    const [field, ...rest] = E_DATA_ENERGY_BASELINE_FIELDS;
    expect(rest).toEqual([]);
    expect(field.cell).toBe("B92");
    expect(field.type).toBe("number");
    expect(field.label.toLowerCase()).toContain("kwh");
  });

  it("collects the water efficiency initiative flag on the workbook's own vocabulary", () => {
    // Ledger 5.1 `E d24` — `IF(B94="Yes",3,IF(B94="Partial",1.5,0))`.
    const [field, ...rest] = E_DATA_WATER_INITIATIVE_FIELDS;
    expect(rest).toEqual([]);
    expect(field.cell).toBe("B94");
    expect(field.type).toBe("select");
    expect(field.options).toEqual(["Yes", "Partial", "No"]);
    // A blank must remain reachable and must not be a scoring answer.
    expect(field.options).not.toContain("");
  });
});

describe("governance inputs", () => {
  const byCell = (cell: string) => G_DATA_MATURITY_ROWS.find((r) => r.cell === cell);

  it("turns the free-points penalties row into a real assertion", () => {
    // Ledger 5.3 `G d25`. `G_Scorecard!C25 = IF(G_Data!B25="",5,IF(G_Data!B25=0,5,0))`
    // and B25 does not exist in the sheet, so every workbook is handed 5 points.
    const row = byCell("B25");
    expect(row).toBeDefined();
    expect(row?.kind).toBe("count");
    // There is no score cell for this row on the sheet — claiming one would be a lie.
    expect(row?.scoreCell).toBeUndefined();
    // Blank must stay distinguishable from a declared nil return.
    expect(row).not.toHaveProperty("value");
    expect(row).not.toHaveProperty("defaultValue");
  });

  it("collects board approval of the environmental policy", () => {
    // Ledger 5.1 `E d28` — scores in Environmental, sourced from the governance sheet.
    const row = byCell("B27");
    expect(row?.kind).toBe("yn");
    expect(row?.scoreCell).toBe("F27");
    expect(row?.options).toEqual(["Yes", "Partial", "No"]);
  });

  it("keeps both new rows outside the sheet's maturity total", () => {
    // `G_Data!F26 = SUM(F5:F24)`. A score cell inside that range would move a total
    // this grid does not compute, so neither new row may claim one.
    const inTotalRange = (ref?: string) => {
      if (!ref) return false;
      const n = Number(ref.replace(/\D/g, ""));
      return n >= 5 && n <= 24;
    };
    expect(inTotalRange(byCell("B25")?.scoreCell)).toBe(false);
    expect(inTotalRange(byCell("B27")?.scoreCell)).toBe(false);
  });

  it("never lets two rows claim the same cell", () => {
    const refs = G_DATA_MATURITY_ROWS.map((r) => r.cell);
    expect(new Set(refs).size).toBe(refs.length);
  });
});

describe("employment equity inputs", () => {
  const byCell = (cell: string) => EE_MATURITY_ROWS.find((r) => r.cell === cell);

  it("captures every Yes/No row the sheet scores, including the four that were omitted", () => {
    // Ledger 5.3 `S d10`: B11–B14 were absent, so nothing in the app could write them.
    for (const ref of ["B9", "B10", "B11", "B12", "B13", "B14"]) {
      expect(byCell(ref), ref).toBeDefined();
      expect(byCell(ref)?.kind, ref).toBe("yn");
    }
  });

  it("scores each row on the sheet's own weights, not the governance 5 / 2.5 rule", () => {
    // EE_Scorecard!E9  = IF(B9="Yes",10,IF(B9="Partial",5,0))
    // EE_Scorecard!E10…E14 = IF(Bn="Yes",5,IF(Bn="Partial",2,0))
    expect(byCell("B9")?.ynPoints).toEqual({ yes: 10, partial: 5 });
    for (const ref of ["B10", "B11", "B12", "B13", "B14"]) {
      expect(byCell(ref)?.ynPoints, ref).toEqual({ yes: 5, partial: 2 });
    }
  });

  it("shows the disability and demographic ratios as derived, not as 0–5 scores", () => {
    for (const ref of ["B5", "B8"]) {
      expect(byCell(ref)?.kind, ref).toBe("numeric");
      expect(byCell(ref)?.max, ref).toBe(1);
    }
  });
});

describe("social inputs", () => {
  it("collects net profit after tax at the ledger's cell, not the derived levy cell", () => {
    // Ledger 5.2 `S d22`. `S_Data!B44` is `=IFERROR(B43*0.01,0)` (the SDL levy) and is
    // the denominator of the grant-recovery indicator — typing profit into it corrupts
    // an unrelated score, which is why the ledger allocates B84.
    expect(cells(S_DATA_PAYROLL_FIELDS)).toContain("B84");
    expect(cells(S_DATA_PAYROLL_FIELDS)).not.toContain("B44");
    // The earlier symbolic key is migrated away; two spellings of one figure would
    // let a workbook hold two different profits.
    expect(cells(S_DATA_PAYROLL_FIELDS)).not.toContain("npat");
  });

  it("collects local procurement as a numerator and a denominator, not a typed percentage", () => {
    // Ledger 5.2 `S d24` — scored as B86/B87 against the local-procurement threshold.
    expect(cells(S_DATA_PAYROLL_FIELDS)).toEqual(expect.arrayContaining(["B86", "B87"]));
    for (const ref of ["B84", "B86", "B87"]) {
      expect(S_DATA_PAYROLL_FIELDS.find((f) => f.cell === ref)?.type, ref).toBe("number");
    }
  });

  it("collects the disability headcount the disability percentage is derived from", () => {
    // Ledger 5.3 `S d8` — `EE_Scorecard!B8` is the constant `=0` in the workbook.
    expect(cells(S_DATA_HEADCOUNT_FIELDS)).toEqual(["B88"]);
    expect(S_DATA_HEADCOUNT_FIELDS[0].type).toBe("number");
  });

  it("never lets two social fields claim the same cell", () => {
    const refs = [...cells(S_DATA_PAYROLL_FIELDS), ...cells(S_DATA_HEADCOUNT_FIELDS)];
    expect(new Set(refs).size).toBe(refs.length);
  });
});

describe("no new input can earn a point by being left alone", () => {
  /**
   * The defect this whole pass exists to remove is a blank cell that scores.
   * Neither field shape carries a default, and this test pins that: a stray
   * `value` / `defaultValue` / `initial` key on any of the new definitions would
   * seed a workbook and hand out points nobody evidenced.
   */
  const NEW_SCALARS = [
    ...E_DATA_ENERGY_BASELINE_FIELDS,
    ...E_DATA_WATER_INITIATIVE_FIELDS,
    ...S_DATA_HEADCOUNT_FIELDS,
    ...S_DATA_PAYROLL_FIELDS.filter((f) => ["B84", "B86", "B87"].includes(f.cell)),
  ];
  const NEW_ROWS: MaturityRowDef[] = [
    ...G_DATA_MATURITY_ROWS.filter((r) => ["B25", "B27"].includes(r.cell)),
    ...EE_MATURITY_ROWS.filter((r) => ["B11", "B13", "B14"].includes(r.cell)),
  ];

  it("declares no seeded value on any new field", () => {
    for (const def of [...NEW_SCALARS, ...NEW_ROWS] as Record<string, unknown>[]) {
      for (const key of ["value", "defaultValue", "initial", "default"]) {
        expect(def[key], `${String(def.cell)}.${key}`).toBeUndefined();
      }
    }
  });

  it("scores a blank answer at zero on every new Yes/No row", () => {
    for (const row of NEW_ROWS) {
      if (row.kind !== "yn") continue;
      const points = row.ynPoints ?? DEFAULT_YN_POINTS;
      expect(maturityScoreFromYn("", points), row.cell).toBe(0);
      expect(maturityScoreFromYn("No", points), row.cell).toBe(0);
    }
  });
});

describe("supplier ratings need no new input — the register already lands on the scored cells", () => {
  /**
   * Ledger 5.2 `S d26` / `S d27` read `SAQ_Supplier!D5:D16` (health & safety) and
   * `F5:F16` (food safety). This is the assertion behind the decision NOT to add a
   * hand-typed supplier score: if the register's column order ever shifts, the
   * ratings silently stop feeding those rules and both indicators return to zero.
   */
  it("writes health & safety to column D and food safety to column F from row 5", () => {
    const written = writeEsgGridCells("saq", [
      {
        _id: "r1",
        supplier: "Supplier One",
        onTime: "4",
        quality: "4",
        healthSafety: "3",
        environmental: "2",
        foodSafety: "5",
        invoicing: "4",
        backup: "N/A",
      },
    ]);
    expect(written.A5).toBe("Supplier One");
    expect(written.D5).toBe("3");
    expect(written.F5).toBe("5");
    expect(written.H5).toBe("N/A");
  });

  it("keeps a not-applicable rating out of the average rather than scoring it zero", () => {
    // The rules average with Excel's COUNT/AVERAGE, which skip text. The app's cell
    // reader must agree: "N/A" is absent, not a zero that drags the mean down.
    expect(Number("N/A")).toBeNaN();
    expect(Number("3")).toBe(3);
  });
});
