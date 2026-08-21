/**
 * The ESG parser→workbook mapping, under the rules that make it worth having.
 *
 * Every test here is one of the ways a mapping layer lies:
 *   - it writes a value into a plausible cell that scores nothing;
 *   - it rounds an option to the nearest one the dropdown holds;
 *   - it collapses "Partial" to a boolean;
 *   - it writes a cell the workbook calculates, freezing a stale number;
 *   - it picks one of two figures the documents disagree about;
 *   - or it gets the units wrong, which is invisible until an auditor asks.
 */
import { describe, expect, it } from "vitest";
import {
  mapEsgCalculatorToWorkbook,
  type EsgCalculatorResultLike,
} from "../esgParserToWorkbook";
import { ESG_UNIT_NOTES, isEsgDerivedCell } from "../esgParserFieldBridge";
import { matchEsgOption, normaliseEsgValue } from "../esgWorkbookInjection";

/** Build a calculator result out of `key: value` pairs from one file. */
function calc(
  payload: Record<string, unknown>,
  extra: Partial<EsgCalculatorResultLike> = {},
  sourceFile = "evidence.pdf",
): EsgCalculatorResultLike {
  return {
    payload,
    rows: [],
    unmapped: [],
    needsReview: [],
    entries: Object.entries(payload).map(([key, value]) => ({
      key,
      value,
      sourceField: key.split(".")[1] ?? key,
      sourceFiles: [sourceFile],
      agreementCount: 1,
    })),
    ...extra,
  };
}

function cells(result: ReturnType<typeof mapEsgCalculatorToWorkbook>, sectionId: string) {
  return result.patches[sectionId]?.cells ?? {};
}

describe("scalar mapping — one declared cell per key", () => {
  it("fills the governance sheet's own counts and assertions", () => {
    const result = mapEsgCalculatorToWorkbook(
      calc({
        "board.members_total": 8,
        "board.independent_non_executive_directors": 3,
        "board.executive_directors": 2,
        "board.meetings_held": 4,
        "board.audit_committee_meetings": 4,
        "board.risk_committee_active": "Yes",
        "ethics.code_of_ethics_in_place": "Yes",
        "ethics.penalties_count": 0,
        "risk.material_risks_count": 12,
        "risk.register_updated": "Partial",
      }),
    );

    expect(cells(result, "g-data")).toMatchObject({
      B5: 8,
      B6: 3,
      B7: 2,
      B10: 4,
      B11: 4,
      B12: "Yes",
      B15: "Yes",
      // A declared nil return. Blank would score nothing; 0 is an assertion.
      B25: 0,
      B21: "Partial",
      B22: 12,
    });
  });

  it("fills the employment-equity assertions the scorecard reads", () => {
    const result = mapEsgCalculatorToWorkbook(
      calc({
        "ee.plan_submitted": "Yes",
        "ee.forum_consulted": "Yes",
        "ee.monitoring_and_reporting": "Partial",
        "ee.numerical_targets_set": "Yes",
        "ee.barriers_removed": "No",
        "ee.affirmative_measures": "Yes",
      }),
    );

    expect(cells(result, "ee")).toEqual({
      B9: "Yes",
      B10: "Yes",
      B11: "Partial",
      B12: "Yes",
      B13: "No",
      B14: "Yes",
    });
  });

  it("fills the skills sheet, and keeps leviable payroll out of the derived levy", () => {
    const result = mapEsgCalculatorToWorkbook(
      calc({
        "training.leviable_payroll": 12_400_000,
        "training.wsp_submitted": "Yes",
        "training.atr_submitted": "Yes",
        "training.mandatory_grant_claimed": 148_800,
        "training.hours_total": 3_200,
        "training.spend": 610_000,
        "training.employees_trained_percent": 64,
        // The SDL levy is 1 % of B43 and is computed, never captured.
        "training.sdl_levy_paid": 124_000,
      }),
    );

    const sData = cells(result, "s-data");
    expect(sData).toMatchObject({ B43: 12_400_000, B45: "Yes", B47: 148_800, B49: 3_200, B50: 610_000, B51: 64 });
    expect(sData.B44).toBeUndefined();
    expect(result.outcomes.sdl_levy_paid.reason).toMatch(/S_Data!B44/);
  });

  it("writes the entity and its sector to every cell the workbook keeps them in", () => {
    const result = mapEsgCalculatorToWorkbook(
      calc({
        "entity.name": "Lake Trading",
        "entity.sector": "Transport / Logistics",
        "entity.reporting_currency": "ZAR",
        "entity.npat": 4_150_000,
        "climate.net_zero_target_year": 2050,
        "emissions.baseline_year": 2019,
        "emissions.baseline_tco2e": 1_842,
      }),
    );

    expect(cells(result, "company-reporting-setup")).toMatchObject({
      entity: "Lake Trading",
      sector: "Transport / Logistics",
      baselineYear: 2019,
      netZeroTargetYear: 2050,
    });
    expect(cells(result, "assumptions")).toMatchObject({ B10: "Transport / Logistics", B13: "ZAR", B107: 2050 });
    expect(cells(result, "s-data")).toMatchObject({ B84: 4_150_000 });
    expect(cells(result, "e-data")).toMatchObject({ B90: 1_842 });
  });

  it("reports a key with no workbook cell in language a client can act on", () => {
    const result = mapEsgCalculatorToWorkbook(
      calc({ "energy.meter_number": "0421-9987", "board.director_name": "N Mokoena" }),
    );

    expect(result.patches).toEqual({});
    expect(result.outcomes.meter_number.status).toBe("unplaced");
    expect(result.outcomes.meter_number.reason).toMatch(/no cell/i);
    expect(result.outcomes.director_name.reason).toMatch(/not a directors or committee register/i);
  });
});

describe("vocabulary — the workbook's own options, or a rejection", () => {
  it("normalises to the workbook's wording rather than the document's", () => {
    const result = mapEsgCalculatorToWorkbook(
      calc({
        "board.risk_committee_active": true,
        "ethics.whistleblower_hotline_active": "y",
        "risk.external_assurance_present": "partially",
      }),
    );

    expect(cells(result, "g-data")).toMatchObject({ B12: "Yes", B16: "Yes", B19: "Partial" });
  });

  it("NEVER picks the nearest option — an unknown sector is rejected, not defaulted", () => {
    const result = mapEsgCalculatorToWorkbook(calc({ "entity.sector": "Road freight" }));

    expect(result.patches).toEqual({});
    expect(result.outcomes.sector.rejection).toBe("no_matching_option");
    expect(result.outcomes.sector.reason).toMatch(/we do not pick the nearest/i);
  });

  it("keeps Partial as a value in its own right, never a boolean", () => {
    expect(normaliseEsgValue("select", "Partial", ["Yes", "Partial", "No"])).toEqual({
      ok: true,
      value: "Partial",
    });
    // And the reverse widening — a real boolean → the sheet's own wording.
    expect(matchEsgOption(["Yes", "Partial", "No"], false)).toBe("No");
    // "Partial" against a Yes/No-only list has no home and is refused.
    expect(matchEsgOption(["Yes", "No"], "Partial")).toBeNull();
  });

  it("speaks each register's own vocabulary", () => {
    expect(matchEsgOption(["Applied", "Explained", "Partially Applied", "Not Applied"], "partially applied")).toBe("Partially Applied");
    expect(matchEsgOption(["Disclosed", "Partially Disclosed", "Not Disclosed", "N/A"], "not disclosed")).toBe("Not Disclosed");
    expect(matchEsgOption(["Fully Compliant", "Partially Compliant", "Gap", "Not Applicable"], "non-compliant")).toBe("Gap");
    expect(matchEsgOption(["Effective", "Partially Effective", "Ineffective", "Not Assessed"], "not assessed")).toBe("Not Assessed");
    expect(matchEsgOption(["5", "4", "3", "2", "1", "N/A"], "4/5")).toBe("4");
    expect(matchEsgOption(["5", "4", "3", "2", "1", "N/A"], "n/a")).toBe("N/A");
    // A rating the register does not hold is refused rather than clamped.
    expect(matchEsgOption(["5", "4", "3", "2", "1", "N/A"], "7")).toBeNull();
  });
});

describe("registers — one array field, N rows", () => {
  const fleetRows: EsgCalculatorResultLike = {
    entries: [],
    rows: [
      {
        grid: "fleet_vehicle_rows",
        index: 0,
        sourceFiles: ["fleet.xlsx"],
        cells: {
          "fleet.vehicle_registration": "KY75THGP",
          "fleet.depot_name": "ISANDO",
          "fleet.vehicle_make_model": "Isuzu FTR 850",
          "fleet.monthly_km": 8_400,
          "fleet.monthly_litres": 2_940,
          "fleet.licence_expiry_date": "2026-03-31",
          "fleet.is_electric_vehicle": false,
        },
      },
      {
        grid: "fleet_vehicle_rows",
        index: 1,
        sourceFiles: ["fleet.xlsx"],
        cells: { "fleet.vehicle_registration": "JX09EVGP", "fleet.is_electric_vehicle": true },
      },
    ],
  };

  it("expands the fleet register into rows, including the EV column", () => {
    const result = mapEsgCalculatorToWorkbook(fleetRows);
    const fleet = cells(result, "fleet");

    expect(fleet.A4).toBe("KY75THGP");
    expect(fleet.B4).toBe("ISANDO");
    expect(fleet.I4).toBe(8_400);
    expect(fleet.O4).toBe("2026-03-31");
    // `isEv` is column P — appended after the v1.7 sheet's last column so every
    // existing letter stays put. A real boolean widens to the column's Yes/No.
    expect(fleet.P4).toBe("No");
    expect(fleet.A5).toBe("JX09EVGP");
    expect(fleet.P5).toBe("Yes");
    expect(result.outcomes.fleet_vehicle_rows.status).toBe("placed");
  });

  it("writes the ISO and IFRS registers at the columns those sheets actually use", () => {
    const result = mapEsgCalculatorToWorkbook({
      entries: [],
      rows: [
        {
          grid: "risk_ifrs_requirement_rows",
          index: 0,
          cells: {
            "risk.ifrs_requirement": "Governance — oversight of climate risk",
            "risk.ifrs_pillar": "Governance",
            "risk.ifrs_status": "Partially Disclosed",
            "risk.ifrs_data_source": "Board minutes",
          },
        },
      ],
    });

    const ifrs = cells(result, "ifrs");
    // Requirement=B, pillar=C, status=D, evidence=G — E is the sheet's own
    // derived `Score /5` and is never written.
    expect(ifrs.B5).toBe("Governance — oversight of climate risk");
    expect(ifrs.C5).toBe("Governance");
    expect(ifrs.D5).toBe("Partially Disclosed");
    expect(ifrs.G5).toBe("Board minutes");
    expect(ifrs.E5).toBeUndefined();
  });

  it("expands the King V application register and leaves E21 to the derivation", () => {
    const result = mapEsgCalculatorToWorkbook({
      entries: [],
      rows: [1, 2].map((n) => ({
        grid: "board_king_principle_rows",
        index: n - 1,
        cells: {
          "board.king_principle_number": n,
          "board.king_principle_name": `Principle ${n}`,
          "board.king_principle_status": n === 1 ? "Applied" : "partially applied",
        },
      })),
    });

    const king5 = cells(result, "king5");
    expect(king5.A4).toBe(1);
    expect(king5.C4).toBe("Applied");
    expect(king5.C5).toBe("Partially Applied");
    // `writeEsgGridCells` writes a WEIGHTED total into E21; the sheet's E21 is
    // the raw score sum and `esgDeriveSummary` forces it. We emit neither.
    expect(king5.E21).toBeUndefined();
  });

  it("expands the CSI, OFO, waste and risk registers", () => {
    const result = mapEsgCalculatorToWorkbook({
      entries: [],
      rows: [
        {
          grid: "csi_initiative_rows",
          index: 0,
          cells: { "csi.initiative_name": "Soup kitchen", "csi.spend": 25_000, "csi.category": "Food security" },
        },
        {
          grid: "training_intervention_rows",
          index: 0,
          cells: { "training.ofo_code": "2016-862101", "training.occupation_title": "Truck Driver", "training.learners_count": 12 },
        },
        {
          grid: "waste_stream_rows",
          index: 0,
          cells: { "waste.stream_type": "Paper K4", "waste.total_kg": 22_470, "waste.recycled_kg": 20_470 },
        },
        {
          grid: "risk_register_rows",
          index: 0,
          cells: {
            "risk.risk_id": "R-07",
            "risk.risk_description": "Flooding at the Durban depot",
            "risk.control_status": "Partially Effective",
            "risk.likelihood": 3,
          },
        },
      ],
    });

    expect(cells(result, "s-data-csi")).toMatchObject({ A72: "Soup kitchen", D72: 25_000 });
    expect(cells(result, "s-data-ofo")).toMatchObject({ A59: "2016-862101", C59: 12 });
    expect(cells(result, "waste")).toMatchObject({ C5: "Paper K4", D5: 22_470, E5: 20_470 });
    expect(cells(result, "garp")).toMatchObject({ A5: "R-07", E5: "Partially Effective", G5: 3 });
    // The register's own derived columns stay for the derivation to fill.
    expect(cells(result, "waste").G5).toBeUndefined();
  });

  it("reports rows it has no register for, rather than inventing one", () => {
    const result = mapEsgCalculatorToWorkbook({
      entries: [],
      rows: [
        { grid: "board_director_rows", index: 0, cells: { "board.director_name": "N Mokoena" } },
        { grid: "fleet_fuel_transaction_rows", index: 0, cells: { "fleet.fuel_litres": 410 } },
      ],
    });

    expect(result.patches).toEqual({});
    expect(result.outcomes.board_director_rows.status).toBe("unplaced");
    expect(result.outcomes.fleet_fuel_transaction_rows.reason).toMatch(/no register/i);
  });
});

describe("the EEA2 headcount matrix", () => {
  it("writes the workforce grid the derivation projects onto S_Data", () => {
    const result = mapEsgCalculatorToWorkbook({
      entries: [],
      rows: [
        {
          grid: "ee_level_rows",
          index: 0,
          cells: {
            "ee.occupational_level": "Top management",
            "ee.headcount_african_male": 2,
            "ee.headcount_white_female": 1,
          },
        },
        {
          grid: "ee_level_rows",
          index: 1,
          cells: {
            "ee.occupational_level": "Semi-skilled and discretionary decision making",
            "ee.headcount_african_male": 40,
            "ee.headcount_foreign_female": 3,
          },
        },
      ],
    });

    const sData = cells(result, "s-data");
    // Level 1, African male is column 0; level 5 (semi-skilled) is row index 4.
    expect(sData.hc_0_0).toBe(2);
    expect(sData.hc_0_7).toBe(1);
    expect(sData.hc_4_0).toBe(40);
    expect(sData.hc_4_9).toBe(3);
    // The sheet references themselves are the derivation's, not ours.
    expect(sData.B5).toBeUndefined();
    expect(sData.L12).toBeUndefined();
  });

  it("rejects an occupational level it does not recognise instead of guessing a band", () => {
    const result = mapEsgCalculatorToWorkbook({
      entries: [],
      rows: [
        {
          grid: "ee_level_rows",
          index: 0,
          cells: { "ee.occupational_level": "Shift crew", "ee.headcount_african_male": 9 },
        },
      ],
    });

    expect(result.patches).toEqual({});
    expect(result.outcomes.ee_level_rows.reason).toMatch(/Shift crew/);
    expect(result.outcomes.ee_level_rows.reason).toMatch(/nearest band/i);
  });
});

describe("site and month context — exact, or reported", () => {
  const bill = (siteName: string, period: string, kwh: number): EsgCalculatorResultLike => ({
    entries: [],
    rows: [
      {
        grid: "energy_site_rows",
        index: 0,
        sourceFiles: ["bill.pdf"],
        cells: {
          "energy.site_name": siteName,
          "energy.billing_period_end": period,
          "energy.electricity_kwh": kwh,
        },
      },
    ],
  });

  it("places a multi-site bill's kWh at its own depot row and month column", () => {
    const result = mapEsgCalculatorToWorkbook(bill("ISANDO", "2025-10-31", 35_332));

    // ISANDO is the 4th depot on the workbook's axis (row base 14) and Oct-25
    // is the 4th reporting month (columns run C…K).
    expect(cells(result, "e-data")).toEqual({ s2_F17: 35_332 });
  });

  it("refuses a site the workbook does not report on", () => {
    const result = mapEsgCalculatorToWorkbook(bill("NELSPRUIT", "2025-10-31", 12_000));

    expect(result.patches).toEqual({});
    expect(result.outcomes.energy_site_rows.rejection).toBe("needs_context");
    expect(result.outcomes.energy_site_rows.reason).toMatch(/site "NELSPRUIT"/);
  });

  it("refuses a month outside the workbook's reporting year", () => {
    const result = mapEsgCalculatorToWorkbook(bill("ISANDO", "2024-10-31", 12_000));

    expect(result.patches).toEqual({});
    expect(result.outcomes.energy_site_rows.reason).toMatch(/outside the workbook's reporting year/);
  });

  it("combines case-level readings ONLY when they came from one document", () => {
    const together = mapEsgCalculatorToWorkbook({
      entries: [
        { key: "water.kl", value: 318, sourceField: "water_kl", sourceFiles: ["water-oct.pdf"] },
        { key: "water.site_name", value: "CPT", sourceField: "site_name", sourceFiles: ["water-oct.pdf"] },
        { key: "water.billing_period_end", value: "2025-08-31", sourceField: "billing_period_end", sourceFiles: ["water-oct.pdf"] },
      ],
    });
    // UNIT: kilolitres, stored as billed. The ×1000 in the editor belongs to the
    // tCO₂e preview (the factor is 0.000344 tonnes per kL), not to the cell.
    expect(cells(together, "e-data")).toEqual({ water_D15: 318 });

    const apart = mapEsgCalculatorToWorkbook({
      entries: [
        { key: "water.kl", value: 318, sourceField: "water_kl", sourceFiles: ["water-oct.pdf"] },
        { key: "water.site_name", value: "CPT", sourceField: "site_name", sourceFiles: ["a-different-bill.pdf"] },
        { key: "water.billing_period_end", value: "2025-08-31", sourceField: "billing_period_end", sourceFiles: ["water-oct.pdf"] },
      ],
    });
    expect(apart.patches).toEqual({});
    expect(apart.outcomes.water_kl.reason).toMatch(/same single document/);
  });

  it("places health-and-safety figures in the quarter their own report covers", () => {
    const result = mapEsgCalculatorToWorkbook({
      entries: [
        { key: "hs.period_start", value: "2025-10-01", sourceField: "reporting_period_start", sourceFiles: ["hs-q2.pdf"] },
        { key: "hs.period_end", value: "2025-12-31", sourceField: "reporting_period_end", sourceFiles: ["hs-q2.pdf"] },
        { key: "hs.hours_worked", value: 184_000, sourceField: "hours_worked", sourceFiles: ["hs-q2.pdf"] },
        { key: "hs.lost_time_injuries_count", value: 1, sourceField: "lost_time_injuries_count", sourceFiles: ["hs-q2.pdf"] },
      ],
    });

    // Q2 is Oct–Dec, which is column D on the S_Data health-and-safety block.
    expect(cells(result, "s-data")).toEqual({ D27: 184_000, D29: 1 });
  });

  it("refuses a health-and-safety report that spans more than one quarter", () => {
    const result = mapEsgCalculatorToWorkbook({
      entries: [
        { key: "hs.period_start", value: "2025-07-01", sourceField: "reporting_period_start", sourceFiles: ["hs-year.pdf"] },
        { key: "hs.period_end", value: "2026-03-31", sourceField: "reporting_period_end", sourceFiles: ["hs-year.pdf"] },
        { key: "hs.hours_worked", value: 740_000, sourceField: "hours_worked", sourceFiles: ["hs-year.pdf"] },
      ],
    });

    expect(result.patches).toEqual({});
    expect(result.outcomes.hours_worked.reason).toMatch(/more than one quarter/);
  });
});

describe("conflict — two answers, one cell, nobody picks", () => {
  it("withholds a cell two documents disagree about and names both candidates", () => {
    const result = mapEsgCalculatorToWorkbook({
      entries: [],
      rows: [
        {
          grid: "energy_site_rows",
          index: 0,
          sourceFiles: ["bill-original.pdf"],
          cells: { "energy.site_name": "DBN", "energy.billing_period_end": "2025-09-30", "energy.electricity_kwh": 41_002 },
        },
        {
          grid: "energy_site_rows",
          index: 1,
          sourceFiles: ["bill-revised.pdf"],
          cells: { "energy.site_name": "DBN", "energy.billing_period_end": "2025-09-30", "energy.electricity_kwh": 39_880 },
        },
      ],
    });

    expect(result.patches).toEqual({});
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({ sectionId: "e-data", cellRef: "s2_E16" });
    expect(result.conflicts[0].candidates.map((c) => c.value).sort()).toEqual([39_880, 41_002]);
    expect(result.outcomes.energy_site_rows.status).toBe("conflict");
  });

  it("writes the cell when both documents agree, rather than calling it a conflict", () => {
    const agreed = mapEsgCalculatorToWorkbook({
      entries: [],
      rows: [1, 2].map((n) => ({
        grid: "energy_site_rows",
        index: n - 1,
        sourceFiles: [`bill-${n}.pdf`],
        cells: { "energy.site_name": "DBN", "energy.billing_period_end": "2025-09-30", "energy.electricity_kwh": 41_002 },
      })),
    });

    expect(cells(agreed, "e-data")).toEqual({ s2_E16: 41_002 });
    expect(agreed.conflicts).toEqual([]);
  });
});

describe("the derived-cell guarantee", () => {
  /**
   * The whole point: `esgDeriveSummary.ts` computes the summary layer from the
   * inputs. Writing one of its cells either gets overwritten (`force`) or —
   * worse — BLOCKS the derivation, because `fill` only writes a blank cell. A
   * stale roll-up frozen into a scored workbook is invisible.
   */
  it("never emits a cell esgDeriveSummary computes, whatever the source", () => {
    const kitchenSink = mapEsgCalculatorToWorkbook({
      entries: [
        ...Object.entries({
          "emissions.scope1_total_tco2e": 412,
          "emissions.scope2_net_tco2e": 980,
          "emissions.total_tco2e": 1_500,
          "emissions.waste_landfill_tco2e": 2.3,
          "fleet.total_vehicles": 134,
          "fleet.ev_count": 0,
          "ee.headcount_total": 210,
          "ee.headcount_level_total": 12,
          "hs.ltifr": 1.4,
          "hs.trifr": 3.1,
          "training.sdl_levy_paid": 124_000,
          "csi.total_spend": 180_000,
          "board.king_principles_applied_count": 14,
          "risk.ifrs_s1_disclosed_count": 9,
          // …alongside values that DO have inputs, so the sweep is not vacuous.
          "board.members_total": 8,
          "training.leviable_payroll": 12_400_000,
          "ee.plan_submitted": "Yes",
        }).map(([key, value]) => ({ key, value, sourceField: key.split(".")[1], sourceFiles: ["afs.pdf"] })),
      ],
      rows: [
        {
          grid: "fleet_vehicle_rows",
          index: 0,
          cells: { "fleet.vehicle_registration": "KY75THGP", "fleet.monthly_litres": 2_940 },
        },
        {
          grid: "waste_stream_rows",
          index: 0,
          cells: { "waste.stream_type": "General", "waste.total_kg": 900, "waste.landfill_kg": 900 },
        },
        {
          grid: "ee_level_rows",
          index: 0,
          cells: { "ee.occupational_level": "Top management", "ee.headcount_african_male": 2 },
        },
      ],
    });

    const emitted: string[] = [];
    for (const [sectionId, section] of Object.entries(kitchenSink.patches)) {
      for (const cellRef of Object.keys(section.cells)) {
        if (cellRef.startsWith("_")) continue; // grid meta, not a sheet cell
        expect(isEsgDerivedCell(sectionId, cellRef)).toBe(false);
        emitted.push(`${sectionId}!${cellRef}`);
      }
    }
    // The sweep must have had something to sweep.
    expect(emitted.length).toBeGreaterThan(5);
  });

  it("names the specific cells the brief calls out as derived", () => {
    const derived: Array<[string, string]> = [
      ["assumptions", "B9"],
      ["s-data", "B44"],
      ["s-data", "G35"],
      ["s-data", "L12"],
      ["king5", "E21"],
      ["e-data", "L75"],
      ["e-data", "L84"],
      ["e-data", "F90"],
      ["waste", "B16"],
      ["waste", "B17"],
      ["waste", "B18"],
      ["fleet", "B28"],
      ["fleet", "H28"],
      ["ee", "B5"],
      ["ee", "B7"],
      ["ee", "B8"],
      ["ee", "E15"],
      ["g-data", "F12"],
      ["ifrs", "E5"],
      ["iso-tracker", "E16"],
    ];
    for (const [sectionId, cell] of derived) {
      expect(isEsgDerivedCell(sectionId, cell)).toBe(true);
    }

    // …and the inputs beside them are NOT derived, or the guard would be a wall.
    const inputs: Array<[string, string]> = [
      ["assumptions", "B8"],
      ["assumptions", "B10"],
      ["s-data", "B43"],
      ["s-data", "B84"],
      ["s-data", "B88"],
      ["s-data", "C27"],
      ["e-data", "B90"],
      ["e-data", "B92"],
      ["g-data", "B25"],
      ["ee", "B9"],
      ["fleet", "A4"],
      ["ifrs", "D5"],
      ["iso-tracker", "D5"],
    ];
    for (const [sectionId, cell] of inputs) {
      expect(isEsgDerivedCell(sectionId, cell)).toBe(false);
    }
  });
});

describe("units", () => {
  it("converts a board percentage to the fraction the sheet bands against", () => {
    const result = mapEsgCalculatorToWorkbook(
      calc({ "board.black_percent": 62.5, "board.female_percent": 37.5 }),
    );

    expect(cells(result, "g-data")).toEqual({ B8: 0.625, B9: 0.375 });
  });

  it("leaves a percentage the sheet stores as printed alone", () => {
    const result = mapEsgCalculatorToWorkbook(
      calc({ "training.black_trained_percent": 71, "waste.diversion_percent": 91.1 }),
    );

    expect(cells(result, "s-data")).toEqual({ B52: 71 });
    expect(cells(result, "e-data")).toEqual({ L70: 91.1 });
  });

  it("documents every conversion it performs", () => {
    expect(ESG_UNIT_NOTES.map((n) => n.key)).toContain("board.black_percent");
    expect(ESG_UNIT_NOTES.find((n) => n.key === "water.kl")?.conversion).toMatch(/none/);
  });
});

describe("the supplier questionnaire", () => {
  it("assembles one register row out of one completed questionnaire", () => {
    const result = mapEsgCalculatorToWorkbook(
      calc({
        "supplier.name": "Oricol Environmental",
        "supplier.health_safety_score": "4",
        "supplier.food_safety_score": "5",
        "supplier.environmental_score": "3",
      }),
    );

    expect(cells(result, "saq")).toMatchObject({ A5: "Oricol Environmental", D5: "4", E5: "3", F5: "5" });
  });

  it("writes no row at all when nothing named the supplier", () => {
    const result = mapEsgCalculatorToWorkbook(calc({ "supplier.health_safety_score": "4" }));

    expect(result.patches).toEqual({});
    expect(result.outcomes.health_safety_score.reason).toMatch(/needs a supplier name/i);
  });
});
