/**
 * The last link on the ESG side: allowlisted calculator key → workbook cell.
 *
 * ── WHERE THIS SITS ────────────────────────────────────────────────────────────
 * The parser reads a document and names what it found in the ESG expert's
 * vocabulary (`electricity_kwh`, `ee_plan_submitted_to_doel`). The SERVER half
 * (`okiru-ai-parser/src/services/esgEntityCalculatorMapping.ts`) turns those
 * field names into allowlisted calculator keys (`energy.electricity_kwh`,
 * `ee.plan_submitted`), element by element, and refuses anything that is not on
 * the allowlist. This file is the CLIENT half of the same journey: allowlist key
 * → ESG section id + cell reference.
 *
 * ── THE RULES, WHICH ARE THE B-BBEE RULES ──────────────────────────────────────
 * 1. NOTHING IS INFERRED. Every mapping is one declared line. A key with no
 *    declared cell is reported unplaced with a plain-language reason, never
 *    written to a cell that "looks about right". The ESG workbook is a grid of
 *    Excel references whose meaning comes from the sheet layout, not from the
 *    key name, so a guess is invisible and scores wrongly.
 * 2. A DERIVED CELL IS NEVER WRITTEN. `esgDeriveSummary.ts` computes the summary
 *    layer (`Assumptions!B9`, `E_Data!L75:L86`, `S_Data!B44/G35`, `EE!B5/B7/B8`,
 *    `King5!E21`, every `G_Data!F*`…). Injecting into one of those either gets
 *    silently overwritten (`force`) or, worse, BLOCKS the derivation (`fill`
 *    only writes a blank cell) and freezes a stale number into the score. Keys
 *    whose only home is derived are listed in {@link ESG_DERIVED_KEY_HOMES} and
 *    rejected by name, so the refusal is explainable rather than accidental.
 * 3. CONTEXT DECIDES, AND MISSING CONTEXT REJECTS. Several cells are addressed
 *    by site AND month (`E_Data` scope grids) or by quarter (`S_Data` H&S
 *    block). A figure with no resolvable site/period is reported, never dropped
 *    into row 1 of the grid.
 *
 * ── UNITS ──────────────────────────────────────────────────────────────────────
 * The matrix names its units in its field names (`electricity_kwh`, `water_kl`,
 * `lpg_kg`, `*_tco2e`, `*_rand`). Where a workbook cell stores the same fact in
 * a different unit the conversion is declared on the target and commented at the
 * point of use. Every conversion in this pass is listed on {@link ESG_UNIT_NOTES}.
 */
import { ESG_FALLBACK_REPORTING_AXES, type EsgReportingAxes } from "@/components/esg-workbook/esgDefaults";
import type { EsgCellKind } from "./esgWorkbookInjection";
import type { EsgGridSectionId } from "./esgGridSections";

/** One workbook cell an allowlist key writes to. */
export interface EsgScalarTarget {
  /** An id from `ESG_SECTION_IDS` — the only keys the import endpoint accepts. */
  sectionId: string;
  /** The same reference the section editor and the `.xlsx` import use. */
  cell: string;
  kind: EsgCellKind;
}

/**
 * Allowlist key → the cell(s) it fills.
 *
 * A key may legitimately fill more than one cell where the workbook records the
 * same fact twice (the net-zero target year is on the Cover AND in Assumptions,
 * and both are read by different consumers). That is duplication in the
 * workbook, not ambiguity here, so both are written from the one reading.
 */
export const ESG_SCALAR_TARGETS: Readonly<Record<string, readonly EsgScalarTarget[]>> = {
  /* ── Entity, Cover and Assumptions ─────────────────────────────────────── */
  "entity.name": [{ sectionId: "company-reporting-setup", cell: "entity", kind: "text" }],
  // Sector is a dropdown on BOTH sheets; `esgCellOptions` supplies the 14
  // permitted values and an unrecognised sector is rejected, never defaulted to
  // Generic — a silent Generic default is what once cost a Transport QSE dozens
  // of points on the B-BBEE side.
  "entity.sector": [
    { sectionId: "company-reporting-setup", cell: "sector", kind: "select" },
    { sectionId: "assumptions", cell: "B10", kind: "select" },
  ],
  "entity.reporting_currency": [{ sectionId: "assumptions", cell: "B13", kind: "select" }],
  // `S_Data!B84` — NPAT, the CSI / SED 1 % denominator (ledger §5.2, `S d22`).
  // Explicitly NOT `B44`, which is the derived SDL levy.
  "entity.npat": [{ sectionId: "s-data", cell: "B84", kind: "number" }],

  /* ── Emissions and climate targets ─────────────────────────────────────── */
  // `E_Data!B90` "Scope 1+2 Combined" — a genuine input (literal 0 in the
  // workbook), NOT one of the derived `L*` roll-ups.
  "emissions.baseline_tco2e": [{ sectionId: "e-data", cell: "B90", kind: "number" }],
  "emissions.baseline_year": [
    { sectionId: "company-reporting-setup", cell: "baselineYear", kind: "year" },
  ],
  "climate.net_zero_target_year": [
    { sectionId: "company-reporting-setup", cell: "netZeroTargetYear", kind: "year" },
    // Assumptions!B107 — the SBTi Corporate Net-Zero Standard target year.
    { sectionId: "assumptions", cell: "B107", kind: "year" },
  ],
  "climate.climate_risk_in_register": [{ sectionId: "g-data", cell: "B23", kind: "select" }],

  /* ── Waste, at document level (the register rows are handled as a grid) ── */
  // `E_Data!L68`/`L70` — the third-party contractor report block
  // (`wasteScalarFields`). `L69` is "% Landfill", which the matrix does not
  // carry as a percentage, so it stays unfilled rather than being computed here.
  "waste.total_kg": [{ sectionId: "e-data", cell: "L68", kind: "number" }],
  "waste.diversion_percent": [{ sectionId: "e-data", cell: "L70", kind: "percentWhole" }],

  /* ── Employment equity (EE_Scorecard maturity rows) ────────────────────── */
  "ee.plan_submitted": [{ sectionId: "ee", cell: "B9", kind: "select" }],
  "ee.forum_consulted": [{ sectionId: "ee", cell: "B10", kind: "select" }],
  "ee.monitoring_and_reporting": [{ sectionId: "ee", cell: "B11", kind: "select" }],
  "ee.numerical_targets_set": [{ sectionId: "ee", cell: "B12", kind: "select" }],
  "ee.barriers_removed": [{ sectionId: "ee", cell: "B13", kind: "select" }],
  "ee.affirmative_measures": [{ sectionId: "ee", cell: "B14", kind: "select" }],

  /* ── Training and skills (S_Data rows 43–55) ───────────────────────────── */
  "training.leviable_payroll": [{ sectionId: "s-data", cell: "B43", kind: "number" }],
  "training.wsp_submitted": [{ sectionId: "s-data", cell: "B45", kind: "select" }],
  "training.atr_submitted": [{ sectionId: "s-data", cell: "B46", kind: "select" }],
  "training.mandatory_grant_claimed": [{ sectionId: "s-data", cell: "B47", kind: "number" }],
  "training.hours_total": [{ sectionId: "s-data", cell: "B49", kind: "number" }],
  "training.spend": [{ sectionId: "s-data", cell: "B50", kind: "number" }],
  // B51–B55 are labelled "%" on the form and are not read by any banded
  // formula, so the printed percentage is stored as printed (0–100). Only cells
  // scored against a fractional threshold are converted — see `percentFraction`.
  "training.employees_trained_percent": [{ sectionId: "s-data", cell: "B51", kind: "percentWhole" }],
  "training.black_trained_percent": [{ sectionId: "s-data", cell: "B52", kind: "percentWhole" }],
  "training.female_trained_percent": [{ sectionId: "s-data", cell: "B53", kind: "percentWhole" }],
  "training.youth_trained_percent": [{ sectionId: "s-data", cell: "B54", kind: "percentWhole" }],
  "training.disabled_trained_percent": [{ sectionId: "s-data", cell: "B55", kind: "percentWhole" }],

  /* ── Board and governance (G_Data maturity rows) ───────────────────────── */
  "board.members_total": [{ sectionId: "g-data", cell: "B5", kind: "count" }],
  "board.independent_non_executive_directors": [{ sectionId: "g-data", cell: "B6", kind: "count" }],
  "board.executive_directors": [{ sectionId: "g-data", cell: "B7", kind: "count" }],
  // UNIT: `G_Data!B8`/`B9` are FRACTIONS. `esgDeriveSummary` scores them as
  // `band(B8, Assumptions!B50 ?? 0.6)` and `band(B9, 0.5)`, so a printed 45
  // would beat a 0.6 target outright. Converted percentage → fraction.
  "board.black_percent": [{ sectionId: "g-data", cell: "B8", kind: "percentFraction" }],
  "board.female_percent": [{ sectionId: "g-data", cell: "B9", kind: "percentFraction" }],
  "board.meetings_held": [{ sectionId: "g-data", cell: "B10", kind: "count" }],
  "board.audit_committee_meetings": [{ sectionId: "g-data", cell: "B11", kind: "count" }],
  "board.risk_committee_active": [{ sectionId: "g-data", cell: "B12", kind: "select" }],
  "board.social_ethics_committee_active": [{ sectionId: "g-data", cell: "B13", kind: "select" }],
  "board.esg_linked_to_exec_remuneration": [{ sectionId: "g-data", cell: "B14", kind: "select" }],
  "board.integrated_report_published": [{ sectionId: "g-data", cell: "B20", kind: "select" }],

  /* ── Ethics and compliance (G_Data rows 15–18, 24, 25) ─────────────────── */
  "ethics.code_of_ethics_in_place": [{ sectionId: "g-data", cell: "B15", kind: "select" }],
  "ethics.whistleblower_hotline_active": [{ sectionId: "g-data", cell: "B16", kind: "select" }],
  "ethics.popia_information_officer_appointed": [{ sectionId: "g-data", cell: "B17", kind: "select" }],
  "ethics.popia_impact_assessment_done": [{ sectionId: "g-data", cell: "B18", kind: "select" }],
  "ethics.anti_corruption_training_done": [{ sectionId: "g-data", cell: "B24", kind: "select" }],
  // `G_Data!B25` — a COUNT, not a Yes/No. Blank means "not declared" and must
  // score nothing; a typed 0 is the company asserting a nil return, which is
  // exactly what a penalties register with no rows states.
  "ethics.penalties_count": [{ sectionId: "g-data", cell: "B25", kind: "count" }],

  /* ── Risk and assurance (G_Data rows 19–23) ────────────────────────────── */
  "risk.external_assurance_present": [{ sectionId: "g-data", cell: "B19", kind: "select" }],
  "risk.register_updated": [{ sectionId: "g-data", cell: "B21", kind: "select" }],
  "risk.material_risks_count": [{ sectionId: "g-data", cell: "B22", kind: "count" }],
};

/**
 * Keys whose ONLY workbook home is a cell `esgDeriveSummary.ts` computes.
 *
 * These are refused BY NAME rather than falling through to "no home", because
 * the honest answer is different: the workbook does hold this figure, it just
 * works it out from the inputs rather than accepting it. Telling a user their
 * Scope 1 total "has nowhere to go" would be wrong; telling them it is
 * calculated from the monthly grids is right.
 */
export const ESG_DERIVED_KEY_HOMES: Readonly<Record<string, { cell: string; detail: string }>> = {
  "emissions.scope1_fleet_tco2e": { cell: "E_Data!L75", detail: "Scope 1A is totalled from the monthly diesel grid" },
  "emissions.scope1_generator_tco2e": { cell: "E_Data!L76", detail: "Scope 1B is totalled from the monthly generator grid" },
  "emissions.scope1_lpg_tco2e": { cell: "E_Data!L77", detail: "Scope 1C is totalled from the monthly LPG grid" },
  "emissions.scope1_business_car_tco2e": { cell: "E_Data!L78", detail: "Scope 1D is totalled from the monthly business-car grid" },
  "emissions.scope1_total_tco2e": { cell: "E_Data!L79", detail: "Scope 1 is the sum of the four Scope 1 rows" },
  "emissions.scope2_gross_tco2e": { cell: "E_Data!L80", detail: "Scope 2 gross is totalled from the monthly electricity grid" },
  "emissions.scope2_solar_offset_tco2e": { cell: "E_Data!L81", detail: "the solar offset is totalled from the monthly solar grid" },
  "emissions.scope2_net_tco2e": { cell: "E_Data!L82", detail: "Scope 2 net is gross plus the solar offset" },
  "emissions.scope3_water_tco2e": { cell: "E_Data!L83", detail: "Scope 3 water is totalled from the monthly water grid" },
  "emissions.total_tco2e": { cell: "E_Data!L84", detail: "the total is the sum of Scope 1, 2 and 3" },
  "emissions.waste_landfill_tco2e": { cell: "Waste_Register!B18", detail: "landfill emissions are computed from the register's landfill kilograms" },
  "fleet.total_vehicles": { cell: "Fleet_Register!B28", detail: "the vehicle total is counted from the fleet register" },
  "fleet.ev_count": { cell: "Fleet_Register!H28", detail: "the electric-vehicle total is counted from the fleet register" },
  "ee.headcount_level_total": { cell: "S_Data!L5:L11", detail: "each level's total is summed from the race and gender columns" },
  "ee.headcount_total": { cell: "S_Data!L12", detail: "the workforce total is summed from the headcount matrix" },
  "hs.ltifr": { cell: "S_Data!G35", detail: "LTIFR is computed from lost-time injuries and hours worked" },
  "hs.trifr": { cell: "S_Data!G36", detail: "TRIFR is computed from the injury counts and hours worked" },
  "training.sdl_levy_paid": { cell: "S_Data!B44", detail: "the levy is computed as 1 % of leviable payroll" },
  "csi.total_spend": { cell: "S_Data!D82", detail: "total CSI spend is summed from the initiative register" },
  "csi.initiative_count": { cell: "S_Data!_initiatives_count", detail: "the initiative count is taken from the register" },
  "board.king_principles_applied_count": { cell: "King5_Scorecard!E21", detail: "the King V total is scored from the principle register" },
  "risk.ifrs_s1_disclosed_count": { cell: "IFRS_S1_S2!E29", detail: "the IFRS total is scored from the requirement register" },
  "risk.ifrs_s2_disclosed_count": { cell: "IFRS_S1_S2!E29", detail: "the IFRS total is scored from the requirement register" },
};

/* ------------------------------------------------------------------ *
 * Register grids
 * ------------------------------------------------------------------ */

/**
 * A parser rows-field → the register grid it becomes, column by column.
 *
 * The column KEYS are `esgGridSections.ts` keys; `writeEsgGridCells` turns them
 * into Excel letters (honouring the explicit `columnLetters` the ISO and IFRS
 * sheets need, which start at B and keep a sheet-derived `Score /5` in E). This
 * file therefore never hardcodes a letter, and a column that moves on the sheet
 * moves here for free.
 */
export interface EsgGridTarget {
  sectionId: EsgGridSectionId;
  /** Allowlist key → grid column key. */
  columns: Readonly<Record<string, string>>;
}

export const ESG_GRID_TARGETS: Readonly<Record<string, EsgGridTarget>> = {
  fleet_vehicle_rows: {
    sectionId: "fleet",
    columns: {
      "fleet.vehicle_registration": "reg",
      "fleet.depot_name": "depot",
      // The register has ONE "Model/Category" column. `vehicle_make_model` owns
      // it; `vehicle_category` is reported rather than overwriting the model.
      "fleet.vehicle_make_model": "model",
      "fleet.gvm_kg": "gvm",
      "fleet.tare_kg": "tare",
      "fleet.payload_kg": "carry",
      "fleet.fuel_tank_capacity_litres": "fuelCap",
      "fleet.telematics_provider": "tracking",
      "fleet.monthly_km": "monthlyKm",
      "fleet.monthly_litres": "monthlyLitres",
      "fleet.l_per_100km_actual": "l100Actual",
      "fleet.l_per_100km_norm": "l100Norm",
      "fleet.monthly_tco2e": "monthlyTco2",
      "fleet.service_status": "serviceStatus",
      "fleet.licence_expiry_date": "licenceExpiry",
      // The EV flag the register gained so `E_Scorecard!C17` (EV % of fleet)
      // is reachable at all. A genuine boolean widens to the column's Yes/No.
      "fleet.is_electric_vehicle": "isEv",
    },
  },
  fleet_debrief_rows: {
    sectionId: "driver-debrief",
    columns: {
      "fleet.depot_name": "depot",
      "fleet.driver_name": "driver",
      "fleet.vehicle_registration": "vehicleReg",
      "fleet.route_name": "route",
      "fleet.customer_hit_percent": "custHit",
      "fleet.planned_stops": "planStops",
      "fleet.actual_stops": "actStops",
    },
  },
  waste_stream_rows: {
    sectionId: "waste",
    columns: {
      "waste.site_name": "depot",
      "waste.stream_type": "wasteType",
      "waste.total_kg": "totalKg",
      "waste.recycled_kg": "recycledKg",
      "waste.landfill_kg": "landfillKg",
      // `divertedPct` (column G) and `landfillTco2` (column H) are DERIVED per
      // row by `esgDeriveSummary` from the three tonnage columns, so they are
      // deliberately absent here.
    },
  },
  training_intervention_rows: {
    sectionId: "s-data-ofo",
    columns: {
      "training.ofo_code": "ofoCode",
      "training.occupation_title": "occupation",
      "training.learners_count": "learners",
      "training.programme_name": "programme",
      "training.seta_name": "seta",
      "training.status": "status",
    },
  },
  csi_initiative_rows: {
    sectionId: "s-data-csi",
    columns: {
      "csi.initiative_name": "initiative",
      "csi.month": "month",
      "csi.beneficiary_name": "beneficiaries",
      "csi.spend": "spend",
      "csi.category": "category",
    },
  },
  board_king_principle_rows: {
    sectionId: "king5",
    columns: {
      "board.king_principle_number": "num",
      "board.king_principle_name": "principle",
      "board.king_principle_status": "status",
      "board.king_principle_evidence": "evidence",
      // `weight` is the sheet's own per-principle weighting, not a document
      // fact, so it is never injected.
    },
  },
  risk_ifrs_requirement_rows: {
    sectionId: "ifrs",
    columns: {
      "risk.ifrs_requirement": "requirement",
      "risk.ifrs_pillar": "pillar",
      "risk.ifrs_status": "status",
      "risk.ifrs_data_source": "evidence",
    },
  },
  risk_register_rows: {
    sectionId: "garp",
    columns: {
      // Column A is "Risk / Requirement" and is the register's identifying
      // column, so the risk's own identifier fills it and the narrative goes to
      // "Description" — both survive, neither is invented.
      "risk.risk_id": "risk",
      "risk.risk_description": "description",
      "risk.impact": "severity",
      "risk.control_status": "controlStatus",
      "risk.mitigation_action": "evidence",
      "risk.likelihood": "likelihood",
    },
  },
};

/**
 * The supplier self-assessment is the one register the parser reports as
 * document-level scalars rather than rows (one questionnaire is one supplier),
 * so its row is assembled from the payload. `supplier` is the grid's required
 * column: with no supplier name there is no row, and we do not invent one.
 */
export const ESG_SAQ_ROW_TARGET: EsgGridTarget = {
  sectionId: "saq",
  columns: {
    "supplier.name": "supplier",
    "supplier.delivery_score": "onTime",
    "supplier.quality_score": "quality",
    "supplier.health_safety_score": "healthSafety",
    "supplier.environmental_score": "environmental",
    "supplier.food_safety_score": "foodSafety",
    "supplier.invoicing_score": "invoicing",
    "supplier.backup_support_score": "backup",
  },
};

/* ------------------------------------------------------------------ *
 * Employment-equity headcount matrix
 * ------------------------------------------------------------------ */

/**
 * `ee_level_rows` is the one genuinely two-dimensional table in the ESG set:
 * one row per EEA2 occupational level, ten race/gender columns. The workbook
 * stores it as `S_Data!B5:K11`, and the app's headcount grid addresses the same
 * numbers as `hc_{levelIndex}_{columnIndex}` — which `esgDeriveSummary` then
 * projects onto `B5:K11`, `L5:L11` and `L12`. So the injection writes the GRID
 * keys, not the sheet references: writing `B5` directly would be writing a cell
 * the derivation owns.
 */
export const ESG_HEADCOUNT_COLUMN_ORDER: readonly string[] = [
  "ee.headcount_african_male",
  "ee.headcount_coloured_male",
  "ee.headcount_indian_male",
  "ee.headcount_white_male",
  "ee.headcount_african_female",
  "ee.headcount_coloured_female",
  "ee.headcount_indian_female",
  "ee.headcount_white_female",
  "ee.headcount_foreign_male",
  "ee.headcount_foreign_female",
];

/**
 * EEA2 occupational level → the headcount grid's row index.
 *
 * The keys are the wordings the EEA2/EEA4 return itself prints (the matrix
 * prompt tells the model to copy them verbatim). A level that is not one of
 * these is REJECTED rather than filed under the nearest band: putting senior
 * managers in the "Unskilled" row would move `EE_Scorecard!B5` and the Black
 * management indicators without anybody seeing it happen.
 */
const EEA2_LEVEL_ROWS: Record<string, number> = {
  // L1 Top management
  topmanagement: 0,
  top: 0,
  executivemanagement: 0,
  boardandtopmanagement: 0,
  // L2 Senior management
  seniormanagement: 1,
  senior: 1,
  // L3 Middle management — the EEA2 prints this as the "professionally
  // qualified" band.
  middlemanagement: 2,
  professionallyqualified: 2,
  professionallyqualifiedandexperiencedspecialistsandmidmanagement: 2,
  // L4 Junior management — the EEA2's "skilled technical" band.
  juniormanagement: 3,
  skilledtechnical: 3,
  skilledtechnicalandacademicallyqualifiedworkersjuniormanagementsupervisorsforemenandsuperintendents: 3,
  // L5 Semi-skilled
  semiskilled: 4,
  semiskilledanddiscretionarydecisionmaking: 4,
  // L6 Unskilled
  unskilled: 5,
  unskilledanddefineddecisionmaking: 5,
  // Temporary
  temporary: 6,
  temporaryemployees: 6,
  nonpermanent: 6,
};

function levelKey(value: string): string {
  return value.toLowerCase().replace(/^l\d+\s*/, "").replace(/[^a-z]+/g, "");
}

/** The headcount grid row for an occupational level, or null when unrecognised. */
export function esgHeadcountRowIndex(occupationalLevel: unknown): number | null {
  const text = String(occupationalLevel ?? "").trim();
  if (!text) return null;
  const direct = EEA2_LEVEL_ROWS[levelKey(text)];
  if (direct !== undefined) return direct;
  // The form's own labels ("L1 Top management") and the return's numbering.
  const numbered = text.match(/^l\s*([1-6])\b/i);
  if (numbered) return Number(numbered[1]) - 1;
  return null;
}

/* ------------------------------------------------------------------ *
 * Monthly and quarterly axes
 * ------------------------------------------------------------------ */

/**
 * The E_Data monthly grids, by the prefix `EsgMonthlyGrid` writes.
 *
 * A cell is `${prefix}_${monthColumn}${14 + rowIndex}` — the app addresses every
 * block from row base 14 regardless of the sheet row, and `esgDeriveSummary`
 * matches that convention by ordinal position.
 */
export const ESG_MONTHLY_PREFIXES = {
  fleetDiesel: "s1a",
  generatorDiesel: "s1b",
  lpg: "s1c",
  businessCars: "s1d",
  electricity: "s2",
  solar: "solar",
  water: "water",
} as const;

const MONTH_ABBREVIATIONS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

/** `"Oct-25"` → `{ year: 2025, month: 10 }`; null when the label is not a month. */
function parseAxisMonth(label: string): { year: number; month: number } | null {
  const m = /^([A-Za-z]{3})[-\s]?(\d{2}|\d{4})$/.exec(String(label ?? "").trim());
  if (!m) return null;
  const month = MONTH_ABBREVIATIONS.indexOf(m[1].toLowerCase()) + 1;
  if (month === 0) return null;
  const yearPart = Number(m[2]);
  const year = m[2].length === 2 ? 2000 + yearPart : yearPart;
  return { year, month };
}

/** Month columns run C…K, one per reporting month. */
function monthColumnLetter(index: number): string {
  return String.fromCharCode(67 + index);
}

/**
 * Which month column an ISO date belongs to, or null when the reporting year
 * does not cover it.
 *
 * Exact only. A bill for a month the workbook's axis does not carry is reported
 * unplaced — nudging it into the nearest column would move consumption between
 * periods, which is the one thing a year-on-year indicator cannot survive.
 */
export function esgMonthColumnFor(
  isoDate: unknown,
  axes: EsgReportingAxes = ESG_FALLBACK_REPORTING_AXES,
): string | null {
  const text = String(isoDate ?? "").trim();
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(text);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const index = axes.months.findIndex((label) => {
    const parsed = parseAxisMonth(label);
    return parsed !== null && parsed.year === year && parsed.month === month;
  });
  return index >= 0 ? monthColumnLetter(index) : null;
}

/**
 * Which grid row a site belongs to, or null when the site is not on the axis.
 *
 * Matched against the workbook's OWN depot axis, case- and punctuation-
 * insensitively. An unknown site name is rejected: row index, not label, is the
 * key in every monthly grid, so filing an unrecognised site under row 0 would
 * silently credit another depot's consumption.
 */
export function esgDepotRowIndex(
  siteName: unknown,
  axes: EsgReportingAxes = ESG_FALLBACK_REPORTING_AXES,
): number | null {
  const key = String(siteName ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!key) return null;
  const index = axes.depots.findIndex(
    (depot) => depot.toLowerCase().replace(/[^a-z0-9]+/g, "") === key,
  );
  return index >= 0 ? index : null;
}

/** `s2_F17` — the monthly cell for a block, site row and month column. */
export function esgMonthlyCellRef(prefix: string, rowIndex: number, monthColumn: string): string {
  return `${prefix}_${monthColumn}${14 + rowIndex}`;
}

/**
 * The S_Data health-and-safety block is quarterly, on the reference workbook's
 * July–June financial year: `C` = Q1 (Jul–Sep), `D` = Q2 (Oct–Dec), `E` = Q3
 * (Jan–Mar), `F` = Q4 (Apr–Jun) — verbatim from `S_DATA_HS_FIELDS`' own labels.
 *
 * A period that spans more than one quarter has no single column, so it is
 * reported rather than being assigned to the quarter it starts in.
 */
export function esgQuarterColumn(startIso: unknown, endIso: unknown): string | null {
  const quarterOf = (iso: unknown): string | null => {
    const m = /^\d{4}-(\d{2})-\d{2}$/.exec(String(iso ?? "").trim());
    if (!m) return null;
    const month = Number(m[1]);
    if (month >= 7 && month <= 9) return "C";
    if (month >= 10 && month <= 12) return "D";
    if (month >= 1 && month <= 3) return "E";
    if (month >= 4 && month <= 6) return "F";
    return null;
  };
  const start = quarterOf(startIso);
  const end = quarterOf(endIso);
  if (start === null || end === null || start !== end) return null;
  return start;
}

/**
 * Allowlist key → the H&S row it fills. The column is the quarter, resolved
 * from the report's own period.
 *
 * `hs.fatalities_count` is deliberately absent. `S_Data` row 28 exists and
 * `esgDeriveSummary` sums it into `G28` (8 points), but `S_DATA_HS_FIELDS`
 * exposes no field for it — so an injected fatality count would be a number the
 * user could neither see nor correct. Reported instead; add the row to the H&S
 * field group and this becomes one line.
 */
export const ESG_HS_QUARTERLY_ROWS: Readonly<Record<string, { row: number; kind: EsgCellKind }>> = {
  "hs.employees_headcount": { row: 26, kind: "count" },
  "hs.hours_worked": { row: 27, kind: "number" },
  "hs.lost_time_injuries_count": { row: 29, kind: "count" },
  "hs.medical_treatment_injuries_count": { row: 30, kind: "count" },
  "hs.first_aid_cases_count": { row: 31, kind: "count" },
  "hs.near_miss_count": { row: 32, kind: "count" },
  "hs.vehicle_accidents_count": { row: 33, kind: "count" },
  "hs.driver_fatigue_incidents_count": { row: 34, kind: "count" },
  "hs.training_hours": { row: 37, kind: "number" },
  "hs.induction_percent": { row: 38, kind: "percentWhole" },
};

/* ------------------------------------------------------------------ *
 * The derived-cell guard
 * ------------------------------------------------------------------ */

/**
 * Is this cell computed by `esgDeriveSummary.ts` (or by the sheet itself)?
 *
 * Every cell this layer emits is checked against this, not just the ones the
 * mapping table points at — a grid write, a monthly write and a hand-written
 * ref all pass through the same gate, so "never write a derived cell" is a
 * property of the module rather than a property of the table.
 *
 * Sources: `esgDeriveSummary.ts` (`fill`/`force` targets), the `Score /5`
 * columns the ISO and IFRS sheets compute, and `esgGridRows.syncDerivedFields`.
 */
export function isEsgDerivedCell(sectionId: string, cell: string): boolean {
  const ref = cell.trim();
  switch (sectionId) {
    case "assumptions":
      // B9 banding floor (=IF(B8="Lean",0.3,…)) and B14 currency symbol (auto).
      return ref === "B9" || ref === "B14";
    case "e-data":
      // Every `L*` roll-up (row YTDs, block totals, the GHG summary block and
      // the % by scope ratios) plus F90 = L79 + L82.
      //
      // EXCEPT L68/L69/L70: despite sitting in the L column, these are the
      // third-party waste contractor scalars (Oricol tonnes in/recycled and the
      // reported % diversion) — user INPUTS, not roll-ups. `esgDeriveSummary`
      // reads L70 as its fallback source for `Waste!B16` rather than writing
      // it. Blocking them here silently dropped every extracted waste-report
      // figure on the floor.
      if (ref === "L68" || ref === "L69" || ref === "L70") return false;
      return /^L\d+$/.test(ref) || ref === "F90";
    case "s-data":
      return (
        // B5:K12 — the headcount matrix and its column totals, projected from
        // the `hc_r_c` grid.
        /^[B-K](?:[5-9]|1[0-2])$/.test(ref) ||
        // L5:L12 — per-level and workforce totals.
        /^L\d+$/.test(ref) ||
        // G27:G36 — the quarterly roll-ups, LTIFR and TRIFR.
        /^G(?:2[7-9]|3[0-6])$/.test(ref) ||
        // SDL levy = 1 % of leviable payroll.
        ref === "B44" ||
        // Total CSI spend, summed from the initiative register.
        ref === "D82"
      );
    case "ee":
      // B5/B7/B8 are projected from S_Data; E5:E15 is the sheet's score column.
      return ref === "B5" || ref === "B7" || ref === "B8" || /^E\d+$/.test(ref);
    case "g-data":
      // F5:F27 — every governance score cell.
      return /^F\d+$/.test(ref);
    case "fleet":
      // The fleet-summary totals (B28 vehicles, H28 EVs).
      return ref === "B28" || ref === "H28";
    case "waste":
      // The diversion rate, the Cority monthly mean and landfill tCO₂e.
      return ref === "B16" || ref === "B17" || ref === "B18";
    case "king5":
      // E21 raw total (forced), F21 weighted total, E22 ratio.
      return ref === "E21" || ref === "F21" || ref === "E22";
    case "ifrs":
      // E29/E30 totals, and column E is the sheet's own `Score /5`.
      return /^E\d+$/.test(ref);
    case "iso-tracker":
      // Column E is the sheet's own `Score /5` (=IF(D="Fully Compliant",5,…)).
      return /^E\d+$/.test(ref);
    default:
      return false;
  }
}

/**
 * Every unit conversion this layer performs, named. Kept as data so the report
 * and the tests read from the same list rather than from prose.
 */
export const ESG_UNIT_NOTES: ReadonlyArray<{ key: string; conversion: string }> = [
  { key: "board.black_percent", conversion: "percentage (0–100) → fraction (0–1) for G_Data!B8, which is banded against Assumptions!B50 (0.6)" },
  { key: "board.female_percent", conversion: "percentage (0–100) → fraction (0–1) for G_Data!B9, which is banded against 0.5" },
  { key: "water.kl", conversion: "none — the water grid stores kilolitres; the ×1000 in the editor is the tCO₂e PREVIEW only (the factor is published in tonnes per kL while the preview divides by 1000)" },
  { key: "energy.electricity_kwh", conversion: "none — the Scope 2 grid stores kWh as billed" },
  { key: "waste.total_kg", conversion: "none — E_Data!L68 stores kilograms as reported" },
];
