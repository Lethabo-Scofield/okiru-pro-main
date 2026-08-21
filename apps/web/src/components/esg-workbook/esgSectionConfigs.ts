import type { EsgFieldDef } from "./EsgScalarForm";
import type { MaturityRowDef } from "./EsgMaturityGrid";
import { ESG_DEFAULT_DEPOTS } from "./esgDefaults";

export const COVER_FIELDS: EsgFieldDef[] = [
  { cell: "entity", label: "Entity" },
  { cell: "period", label: "Reporting period" },
  { cell: "baselineYear", label: "Baseline year", type: "number" },
  { cell: "netZeroTargetYear", label: "Net-zero target year", type: "number" },
  {
    cell: "sector",
    label: "Sector",
    type: "select",
    options: [
      "Generic",
      "FMCG / Distribution",
      "Transport / Logistics",
      "Manufacturing",
      "Financial Services",
      "ICT / Technology",
      "Agriculture",
      "Mining",
      "Construction",
      "Retail",
      "Hospitality",
      "Healthcare",
      "Education",
      "Public Sector",
    ],
  },
];

const REPORTING_STANDARD_OPTIONS = [
  "King V + IFRS S1/S2",
  "GRI Standards",
  "IFRS S1+S2 only",
  "ESRS (EU CSRD)",
  "TCFD",
  "Combined (all)",
] as const;

const MATERIALITY_OPTIONS = [
  "Single (financial — IFRS)",
  "Double (financial + impact — ESRS)",
  "Dynamic",
] as const;

const CURRENCY_OPTIONS = [
  "ZAR",
  "USD",
  "EUR",
  "GBP",
  "KES",
  "NGN",
  "BWP",
  "ZMW",
  "GHS",
  "EGP",
  "XOF",
  "MAD",
] as const;

const CARBON_TAX_MODE_OPTIONS = [
  "Current Tier 1 only",
  "Escalated Tier 2 only",
  "Both (current + escalated)",
] as const;

/**
 * Assumptions sheet inputs.
 *
 * ── Block 0 (rows 6–15) carried a two-row offset ──────────────────────────────────
 * The workbook's own "Cell ref" column F and its data validations are stale: two rows
 * (`A3` instance banner, `A4` fork warning) were inserted after the sheet was authored.
 * Excel re-pointed every *formula* reference but not the column-F text or the DV
 * `sqref`s, and this config was built from those. Column A is authoritative:
 *   A8 "Scoring stance" · A9 "Banding floor (auto from stance)" · A10 "Sector"
 *   A11 "Primary reporting standard" · A12 "Materiality basis" · A13 "Reporting currency"
 *   A14 "Currency symbol (auto)" · A15 "Carbon tax display"
 * (verbatim from `docs/esg/extracted/Assumptions.json`, rows 8–15).
 *
 * The offset is confined to Block 0. `B43`–`B112` are already correct — the scorecard
 * formulas that reference them were re-pointed by the insert. Do NOT shift them.
 *
 * Migration note for already-saved workbooks (old layout → new):
 *   B6 → B8, B8 → B10, B9 → B11, B10 → B12, B11 → B13, B13 → B15, then derive B9 from B8.
 */
export const ASSUMPTIONS_FIELDS: EsgFieldDef[] = [
  {
    // Assumptions!A8 = "Scoring stance" (code STANCE). Read as text by
    // stanceFloorFromWorkbook; the numeric floor it implies is B9 (derived, below).
    cell: "B8",
    label: "Scoring stance",
    type: "select",
    options: ["Lean", "Standard", "Strict"],
    helpText:
      "Sets the banding floor for partial credit on quantitative Environmental, Social, and Governance (ESG) indicators (Lean 30% / Standard 50% / Strict 70%).",
  },
  // NOT AN INPUT — Assumptions!B9 is derived: see esgDeriveSummary.
  //   Assumptions!A9 = "Banding floor (auto from stance)" (code STANCE_FLR)
  //   Assumptions!B9 = =IF(B8="Lean",0.3,IF(B8="Strict",0.7,0.5))   → 0.5
  // It is read as a NUMBER by ~20 scorecard formulas across E/S/G and B_BBEE_ESG
  // (every `…>=Assumptions!$B$44*Assumptions!$B$9…` term). A form field here would put
  // a string in B9, readEsgCell would coerce it to null, and every calculator would
  // silently fall back to 0.5 — which is exactly the defect this removal fixes.
  {
    // Assumptions!A10 = "Sector" (code SECTOR)
    cell: "B10",
    label: "Sector",
    type: "select",
    options: COVER_FIELDS[4].options,
    helpText:
      "Industry sector for sector-specific norms (e.g. fleet litres per 100 km, International Organization for Standardization (ISO) trackers).",
  },
  {
    // Assumptions!A11 = "Primary reporting standard" (code STD_PRIMARY).
    // Was written to B9, colliding with the derived banding floor.
    cell: "B11",
    label: "Primary reporting standard",
    type: "select",
    options: [...REPORTING_STANDARD_OPTIONS],
    helpText:
      "Main disclosure framework: King Code of Governance (King V), International Financial Reporting Standards (IFRS) S1/S2 climate disclosures, Global Reporting Initiative (GRI), European Sustainability Reporting Standards (ESRS), or Task Force on Climate-related Financial Disclosures (TCFD).",
  },
  {
    // Assumptions!A12 = "Materiality basis" (code MAT_BASIS)
    cell: "B12",
    label: "Materiality basis",
    type: "select",
    options: [...MATERIALITY_OPTIONS],
    helpText:
      "Single = financial materiality (IFRS); Double = financial plus impact (ESRS); Dynamic = both over time.",
  },
  {
    // Assumptions!A13 = "Reporting currency" (code CCY)
    cell: "B13",
    label: "Reporting currency",
    type: "select",
    options: [...CURRENCY_OPTIONS],
    helpText: "Currency for Corporate Social Investment (CSI), carbon tax, training spend, and procurement figures.",
  },
  // NOT AN INPUT — Assumptions!B14 is derived: see esgDeriveSummary.
  //   Assumptions!A14 = "Currency symbol (auto)"; the cell is blank in the workbook but
  //   is consumed as a prefix by Carbon_Tax!B17/C17/D17/B27/C27/B28/C28. Derive from B13.
  {
    // Assumptions!A15 = "Carbon tax display" (code TAX_MODE); read by Carbon_Tax!E15
    cell: "B15",
    label: "Carbon tax display",
    type: "select",
    options: [...CARBON_TAX_MODE_OPTIONS],
    helpText:
      "Shows current Tier 1 greenhouse gas (GHG) tax liability, escalated Tier 2 forward view, or both side by side.",
  },
  {
    cell: "B43",
    label: "Scope 1+2 year-on-year reduction target (THR_GHG_YOY)",
    type: "number",
    helpText:
      "Minimum annual reduction % for Scope 1 and Scope 2 emissions — aligned with Science Based Targets initiative (SBTi) near-term pace (threshold code THR_GHG_YOY).",
  },
  {
    cell: "B44",
    label: "Renewable electricity minimum (THR_RE)",
    type: "number",
    helpText:
      "Minimum renewable energy share of grid electricity (kilowatt-hours, kWh) — threshold code THR_RE.",
  },
  {
    cell: "B45",
    label: "Fleet fuel tolerance over norm (THR_FUEL_TOL)",
    type: "number",
    helpText: "Multiplier above original equipment manufacturer (OEM) litres per 100 km before flagged — THR_FUEL_TOL.",
  },
  {
    cell: "B46",
    label: "Electric vehicle fleet % minimum (THR_EV_MIN)",
    type: "number",
    helpText: "Minimum electric vehicle (EV) share of fleet — threshold code THR_EV_MIN.",
  },
  {
    cell: "B48",
    label: "Waste diversion target (THR_WASTE)",
    type: "number",
    helpText: "Minimum waste diverted from landfill (75% default) — threshold code THR_WASTE.",
  },
  {
    cell: "B50",
    label: "Black employees target (THR_BLACK)",
    type: "number",
    helpText: "Target % Black employees (Employment Equity, EE) — threshold code THR_BLACK.",
  },
  {
    cell: "B51",
    label: "Black female management target (THR_BFM)",
    type: "number",
    helpText: "Target % Black female at management levels L1+L2 — threshold code THR_BFM.",
  },
  {
    cell: "B52",
    label: "Persons with disabilities target (THR_PWD)",
    type: "number",
    helpText: "Target % employees with disabilities (PWD) — threshold code THR_PWD.",
  },
  {
    // Assumptions!A53 = "Training hours per employee target" (code THR_TRAIN_HR, 40 hours);
    // read by S_Scorecard!C14. Was absent, so the calculator fell back to a constant.
    cell: "B53",
    label: "Training hours per employee target (THR_TRAIN_HR)",
    type: "number",
    helpText:
      "Minimum training hours delivered per employee per year — Workplace Skills Plan (WSP) benchmark, threshold code THR_TRAIN_HR.",
  },
  {
    // Assumptions!A54 = "Mandatory grant recovery target" (code THR_GRANT, 0.8);
    // read by S_Scorecard!C15. Was absent, so the calculator fell back to a constant.
    cell: "B54",
    label: "Mandatory grant recovery target (THR_GRANT)",
    type: "number",
    helpText:
      "Minimum share of the Skills Development Levy (SDL) recovered as a Sector Education and Training Authority (SETA) mandatory grant — threshold code THR_GRANT.",
  },
  {
    // Assumptions!A55 = "LTIFR maximum (target ≤)" (code THR_LTIFR, 2).
    // Help text corrected: S_Data!G35 computes LTIFR per 1,000,000 hours (`*1000000`),
    // not per 200,000.
    cell: "B55",
    label: "Lost Time Injury Frequency Rate maximum (THR_LTIFR)",
    type: "number",
    helpText:
      "Maximum Lost Time Injury Frequency Rate (LTIFR) per 1,000,000 hours worked — threshold code THR_LTIFR.",
  },
  {
    cell: "B56",
    label: "CSI / SED spend minimum (THR_CSI)",
    type: "number",
    helpText:
      "Minimum Corporate Social Investment (CSI) / Socio-Economic Development (SED) spend as % of Net Profit After Tax (NPAT) — B-BBEE target 1% (THR_CSI).",
  },
  {
    // Assumptions!A58 = "Supplier H&S compliance minimum" (code THR_SUP_HS, 0.8).
    // Was mislabelled "King V Apply & Explain minimum (THR_KING)" — THR_KING is B59.
    cell: "B58",
    label: "Supplier health & safety compliance minimum (THR_SUP_HS)",
    type: "number",
    helpText:
      "Minimum supplier health and safety (H&S) compliance score before a supplier counts as compliant — threshold code THR_SUP_HS.",
  },
  {
    // Assumptions!A59 = "King V score minimum (Apply&Explain)" (code THR_KING, 0.7).
    // NB this is a RATING threshold, not the King V divisor: G_Scorecard!C5 hardcodes
    // `King5_Scorecard!E21/170*25` (17 principles × 10).
    cell: "B59",
    label: "King V Apply & Explain minimum (THR_KING)",
    type: "number",
    helpText: "Minimum % King V principles at Apply & Explain maturity — threshold code THR_KING.",
  },
  {
    cell: "B60",
    label: "Public interest score minimum (THR_PI)",
    type: "number",
    helpText:
      "Minimum public interest score for Governance, Accountability, Risk and Performance (GARP) / Generally Recognised Accounting Practice (GRAP) — THR_PI.",
  },
  {
    // Assumptions!A61 = "Material risks identified minimum" (code THR_RISKS, 10);
    // read by G_Data!F22. Was absent from the form entirely.
    cell: "B61",
    label: "Material risks identified minimum (THR_RISKS)",
    type: "number",
    helpText:
      "Minimum number of material risks a mature enterprise risk-management (ERM) register is expected to carry — threshold code THR_RISKS.",
  },
  {
    cell: "B107",
    label: "Net-zero target year (SBTi CNZS)",
    type: "number",
    helpText:
      "Target year for net-zero greenhouse gas (GHG) emissions under Science Based Targets initiative (SBTi) Corporate Net-Zero Standard (CNZS) 2.0 (typically 2050).",
  },
];

export const S_DATA_HS_FIELDS: EsgFieldDef[] = [
  { cell: "C26", label: "Total employees Q1 (Jul-Sep)", type: "number" },
  { cell: "D26", label: "Total employees Q2 (Oct-Dec)", type: "number" },
  { cell: "E26", label: "Total employees Q3 (Jan-Mar)", type: "number" },
  { cell: "F26", label: "Total employees Q4 (Apr-Jun)", type: "number" },
  { cell: "C27", label: "Hours worked Q1", type: "number" },
  { cell: "D27", label: "Hours worked Q2", type: "number" },
  { cell: "E27", label: "Hours worked Q3", type: "number" },
  { cell: "F27", label: "Hours worked Q4", type: "number" },
  { cell: "C29", label: "LTI Q1", type: "number" },
  { cell: "D29", label: "LTI Q2", type: "number" },
  { cell: "E29", label: "LTI Q3", type: "number" },
  { cell: "F29", label: "LTI Q4", type: "number" },
  { cell: "C30", label: "MTI Q1", type: "number" },
  { cell: "D30", label: "MTI Q2", type: "number" },
  { cell: "E30", label: "MTI Q3", type: "number" },
  { cell: "F30", label: "MTI Q4", type: "number" },
  { cell: "C31", label: "First Aid Q1", type: "number" },
  { cell: "D31", label: "First Aid Q2", type: "number" },
  { cell: "E31", label: "First Aid Q3", type: "number" },
  { cell: "F31", label: "First Aid Q4", type: "number" },
  { cell: "C32", label: "Near Miss Q1", type: "number" },
  { cell: "D32", label: "Near Miss Q2", type: "number" },
  { cell: "E32", label: "Near Miss Q3", type: "number" },
  { cell: "F32", label: "Near Miss Q4", type: "number" },
  { cell: "C33", label: "Vehicle accidents Q1", type: "number" },
  { cell: "D33", label: "Vehicle accidents Q2", type: "number" },
  { cell: "E33", label: "Vehicle accidents Q3", type: "number" },
  { cell: "F33", label: "Vehicle accidents Q4", type: "number" },
  { cell: "C34", label: "Driver fatigue Q1", type: "number" },
  { cell: "D34", label: "Driver fatigue Q2", type: "number" },
  { cell: "E34", label: "Driver fatigue Q3", type: "number" },
  { cell: "F34", label: "Driver fatigue Q4", type: "number" },
  { cell: "C37", label: "H&S training hrs Q1", type: "number" },
  { cell: "D37", label: "H&S training hrs Q2", type: "number" },
  { cell: "E37", label: "H&S training hrs Q3", type: "number" },
  { cell: "F37", label: "H&S training hrs Q4", type: "number" },
  { cell: "C38", label: "% employees H&S induction Q1", type: "number" },
  { cell: "D38", label: "% employees H&S induction Q2", type: "number" },
  { cell: "E38", label: "% employees H&S induction Q3", type: "number" },
  { cell: "F38", label: "% employees H&S induction Q4", type: "number" },
  // For the derive agent: S_Data!G35 is DERIVED, not typed —
  //   G35 = =IF(SUM(C27:F27)>0,SUM(C29:F29)*1000000/SUM(C27:F27),"Awaiting hours worked")
  // Presented here as a manual number field; the live workbook value is the STRING
  // "Awaiting hours worked", which readEsgCell coerces to null → S_Scorecard!C17 = 0.
  // The quarterly inputs it needs (C27:F27 hours, C29:F29 LTIs) are already above.
  // Same pattern for the unfilled roll-ups G27 = SUM(C27:F27) and G29:G33 = SUM(C29:F29)…
  { cell: "G35", label: "LTIFR (computed)", type: "number" },
];

export const S_DATA_TRAINING_FIELDS: EsgFieldDef[] = [
  { cell: "B45", label: "WSP submitted (Y/N)", type: "select", options: ["Yes", "No", "Partial"] },
  { cell: "B46", label: "ATR submitted (Y/N)", type: "select", options: ["Yes", "No", "Partial"] },
  { cell: "B47", label: "Mandatory grant claimed (R)", type: "number" },
  { cell: "B49", label: "Total training hours delivered", type: "number" },
  { cell: "B50", label: "Training spend (R)", type: "number" },
  { cell: "B51", label: "% employees trained YTD", type: "number" },
  { cell: "B52", label: "Black employees trained (%)", type: "number" },
  { cell: "B53", label: "Female employees trained (%)", type: "number" },
  { cell: "B54", label: "Youth (≤35) trained (%)", type: "number" },
  { cell: "B55", label: "PWD employees trained (%)", type: "number" },
];

export const S_DATA_PAYROLL_FIELDS: EsgFieldDef[] = [
  // S_Data!A43 = "Leviable payroll (R)"
  { cell: "B43", label: "Leviable payroll (R)", type: "number" },
  // NOT AN INPUT — S_Data!B44 is derived: see esgDeriveSummary.
  //   S_Data!A44 = "SDL levy paid (1% of payroll)"
  //   S_Data!B44 = =IFERROR(B43*0.01,0)
  // It is the DENOMINATOR of S_Scorecard!C15 (mandatory grant recovery = B47/B44).
  // This config previously labelled B44 "NPAT (R)" and let a user type net profit into
  // it, which silently corrupted the grant-recovery indicator.
  //
  /*
   * NPAT — `S_Data!B84`.
   *
   * LEDGER: `docs/esg/ESG_FORMULA_LEDGER.md` §5.2, `S d22` ("CSI/SED spend ≥1% NPAT",
   * 5 pts, MANUAL_ZERO). The workbook note on `S_Scorecard!I22` reads "Pending:
   * requires NPAT input in G_Data + sum of S_Data D72:D79 (CSI spend)". The ledger
   * allocates the input at `S_Data!B84` — explicitly NOT `B44`, which is the derived
   * SDL levy, and NOT the free-text `B_BBEE_ESG!D10` ratio.
   *
   * The sheet ends at row 82 (`docs/esg/extracted/S_Data.json`, `dimensions.max_row`),
   * so rows 83+ are unused and the ledger allocates its new inputs there — the same
   * convention as `B86`/`B87`/`B88` below and `E_Data!B92`/`B94`. A previous pass used
   * the symbolic key `npat` instead; it is migrated here so every new Social input is
   * addressable by the same A1 vocabulary the scoring formulas speak.
   *
   * MIGRATION for workbooks already saved with the symbolic key: `npat` → `B84`.
   *
   * Evidence: audited annual financial statements (document-matrix field `npat_rand`).
   */
  {
    cell: "B84",
    label: "Net profit after tax (R)",
    type: "number",
    helpText:
      "Net Profit After Tax (NPAT) from the audited annual financial statements — the base for the Corporate Social Investment (CSI) / Socio-Economic Development (SED) 1% target. Leave blank if the figure is not yet audited; a blank scores nothing rather than passing by default.",
  },
  /*
   * Local procurement — `S_Data!B86` / `S_Data!B87`.
   *
   * LEDGER §5.2, `S d24` ("Local labour procurement ≥40%", 5 pts, MANUAL_ZERO).
   * Workbook note: "Pending: requires local procurement % input in S_Data. Currently 0."
   * Two cells rather than one typed percentage, because the evidence a B-BBEE
   * verification agency requires under Statement 400 is the creditors-ledger split —
   * numerator and denominator — not a percentage somebody calculated off-system.
   * Scored against `Assumptions!B57` (THR_LOCAL, 0.4). A blank denominator scores 0.
   */
  {
    cell: "B86",
    label: "Local procurement spend (R)",
    type: "number",
    helpText:
      "Spend with suppliers based in the local economy, from the creditors ledger split by supplier locality.",
  },
  {
    cell: "B87",
    label: "Total measured procurement spend (R)",
    type: "number",
    helpText:
      "Total measured procurement spend for the same period — the denominator the local share is measured against.",
  },
];

/**
 * Employment-equity headcount detail captured beside the EEA2 matrix.
 *
 * LEDGER: `docs/esg/ESG_FORMULA_LEDGER.md` §5.3, `S d8` (5 pts). `EE_Scorecard!B8`
 * ("% Persons with Disabilities") is the constant-zero formula `=0` in the workbook —
 * the percentage is never computed anywhere — so `S_Scorecard!C8` can never score.
 * The ledger's fix is a real headcount at `S_Data!B88`, from which
 * `EE_Scorecard!B8 = =IFERROR(B88/S_Data!L12,0)` follows. `esgDeriveSummary.ts`
 * already implements that derivation and notes it stays inert "until
 * `esgSectionConfigs.ts` exposes `B88` as an input" — this is that input.
 *
 * Evidence: the EEA2/EEA4 return (document-matrix field `headcount_disabled_total`).
 */
export const S_DATA_HEADCOUNT_FIELDS: EsgFieldDef[] = [
  {
    cell: "B88",
    label: "Employees with disabilities (headcount)",
    type: "number",
    helpText:
      "Number of employees with disabilities as declared on the Employment Equity return (EEA2), across all occupational levels. The share of total headcount is worked out for you.",
  },
];

/** @deprecated Use split field groups (S_DATA_HS_FIELDS, etc.) */
export const S_DATA_SCALAR_FIELDS: EsgFieldDef[] = [
  ...S_DATA_HS_FIELDS,
  ...S_DATA_TRAINING_FIELDS.filter((f) => f.cell !== "B43"),
  ...S_DATA_PAYROLL_FIELDS,
];

/**
 * GHG summary YTD column — `E_Data!L75:L84`, verbatim from `docs/esg/extracted/E_Data.json`.
 *
 * The block was off by one and then two rows from L83 down: "Scope 3 — Water" was
 * addressed as L84 (really the TOTAL row) and "TOTAL GHG" as L86 (really "% by scope —
 * Scope 2"). L80/L81 were absent from the app entirely. Workbook column A:
 *   A75 "Scope 1A — Fleet Diesel"          A80 "Scope 2 — Grid Electricity (location-based)"
 *   A76 "Scope 1B — Generator Diesel"      A81 "Scope 2 Solar Offset (negative — enter generation)"
 *   A77 "Scope 1C — LPG Forklifts (DBN)"   A82 "SCOPE 2 NET (tCO₂e)"
 *   A78 "Scope 1D — Business Cars"         A83 "Scope 3 — Water Consumption"
 *   A79 "SCOPE 1 TOTAL (tCO₂e)"            A84 "TOTAL GHG (Scope 1+2+3)  tCO₂e"
 * L85/L86 are "% by scope" ratios, not totals, and are deliberately not inputs.
 *
 * ── Every cell below is DERIVED in the workbook, and now in the app too ────────────
 * The editor renders "Auto-calculated from the scope tabs above. Override only when
 * reconciling to audited totals." over this group (EsgWorkbookSectionEditor.tsx). That
 * copy used to be a promise the app did not keep. It is now true for all ten fields:
 * `esgDeriveSummary.ts#deriveEsgSummaryCells` writes L75–L84 (plus L85/L86 and F90)
 * from the monthly grids, using `fill()`, which only writes when the cell is absent or
 * blank — so a typed override still wins, exactly as the copy claims. Verified field by
 * field against the rules listed below; re-verify before changing that caption again.
 * These stay as manual override fields on purpose (do not delete):
 *   L75 = SUM(C75:K75)   where C75 = C14+C15+C16+C17+C18   (Σ `s1a_*`)
 *   L76 = SUM(C76:K76)   where C76 = C23+C24+C25+C26+C27   (Σ generator)
 *   L77 = SUM(C77:K77)   where C77 = C32                   (Σ LPG)
 *   L78 = SUM(C78:K78)   where C78 = C37                   (Σ business cars)
 *   L79 = SUM(L75,L76,L77,L78)
 *   L80 = E_Data!L46                                        (Scope 2 gross)
 *   L81 = SUM(E_Data!L50+L51+L52+L53+L54)                   (solar offset)
 *   L82 = L80+L81
 *   L83 = E_Data!L63
 *   L84 = L79+L82+L83
 * Data-integrity warning (preserve, do not silently "fix"): rows 75–84 are labelled
 * tCO₂e but the formulas copy the RAW ACTIVITY rows, so L75 is litres and L80 is kWh —
 * L84 is a mixed-unit sum. Keep it bit-for-bit for regression parity and raise it
 * separately as a workbook defect.
 */
export const E_DATA_GHG_SUMMARY_FIELDS: EsgFieldDef[] = [
  { cell: "L75", label: "Scope 1A Fleet Diesel YTD (tCO₂e)", type: "number" },
  { cell: "L76", label: "Scope 1B Generator YTD (tCO₂e)", type: "number" },
  { cell: "L77", label: "Scope 1C LPG YTD (tCO₂e)", type: "number" },
  { cell: "L78", label: "Scope 1D Business cars YTD (tCO₂e)", type: "number" },
  { cell: "L79", label: "SCOPE 1 TOTAL (tCO₂e)", type: "number" },
  { cell: "L80", label: "Scope 2 — Grid electricity, gross (tCO₂e)", type: "number" },
  { cell: "L81", label: "Scope 2 — Solar offset, negative (tCO₂e)", type: "number" },
  { cell: "L82", label: "SCOPE 2 NET (tCO₂e)", type: "number" },
  { cell: "L83", label: "Scope 3 — Water (tCO₂e)", type: "number" },
  { cell: "L84", label: "TOTAL GHG (Scope 1+2+3) tCO₂e", type: "number" },
];

/**
 * Prior-year electricity baseline — `E_Data!B92`.
 *
 * LEDGER: `docs/esg/ESG_FORMULA_LEDGER.md` §5.1, `E d12` ("Energy efficiency
 * improvement YoY", 5 pts, MANUAL_ZERO). Column C of `E_Scorecard!12` is a literal
 * `0` with no formula and the author's note reads "Pending: requires prior-year kWh
 * baseline. Add to E_Data and reformulate. Currently 0."
 *
 * The current-year figure already exists as the derived `E_Data!L46` (sum of the
 * electricity grid). The only thing missing is last year's total, which is why this
 * is one number and not a percentage: a typed "improvement %" would be unverifiable,
 * whereas a kWh total reconciles to municipal statements.
 *
 * The sheet ends at row 90 (`docs/esg/extracted/E_Data.json`, `dimensions.max_row`),
 * so rows 91+ are unused and the ledger allocates its new inputs there.
 *
 * Evidence: prior-year municipal electricity bills / statements for every site
 * (document-matrix fields `electricity_kwh` + `billing_period_start` /
 * `billing_period_end`, from the municipal electricity bill document).
 *
 * Blank scores nothing: the ledger's rule opens `IF(E_Data!$B$92=0,0,…)`.
 */
export const E_DATA_ENERGY_BASELINE_FIELDS: EsgFieldDef[] = [
  {
    cell: "B92",
    label: "Prior-year total electricity (kWh)",
    type: "number",
    helpText:
      "Total kilowatt-hours (kWh) bought across all sites in the previous reporting year, from the prior-year municipal statements. Used to measure this year's efficiency improvement; leave blank until you hold the prior-year bills.",
  },
];

/**
 * Water efficiency initiative — `E_Data!B94`.
 *
 * LEDGER: `docs/esg/ESG_FORMULA_LEDGER.md` §5.1, `E d24` ("Water efficiency
 * initiative active", 3 pts, MANUAL_ZERO). Workbook note: "Pending: requires water
 * efficiency initiative Y/N flag in G_Data. Currently 0." The ledger relocates the
 * flag to `E_Data!B94` (the water data lives here, not on the governance sheet) and
 * scores it on the workbook's standard binary band:
 * `=IF(B94="Yes",3,IF(B94="Partial",1.5,0))`.
 *
 * Evidence: a project charter or capital approval for a water-reduction project, or a
 * documented reduction target with a named owner. There is no document in the ESG
 * evidence matrix that carries this yet — see the note handed to the mapping owner.
 *
 * Blank scores nothing: only "Yes" and "Partial" earn.
 */
export const E_DATA_WATER_INITIATIVE_FIELDS: EsgFieldDef[] = [
  {
    cell: "B94",
    label: "Water efficiency initiative active",
    type: "select",
    options: ["Yes", "Partial", "No"],
    helpText:
      "Is a water-reduction project running in this period, with an approved scope and a named owner? Choose Partial where a project is approved but not yet under way.",
  },
];

export const E_DATA_NZ_FIELDS: EsgFieldDef[] = [
  // E_Data!A90 = "Scope 1+2 Combined"; B90 is a genuine input (literal 0 in the workbook).
  { cell: "B90", label: "Net-zero baseline tCO₂e (Scope 1+2)", type: "number" },
  // For the derive agent: E_Data!F90 = =L79+L82. Labelled "(derived)" but the user must
  // currently type it. Keep the field as an override; add the derivation behind it.
  { cell: "F90", label: "Current YTD Scope 1+2 (derived)", type: "number" },
  { cell: "G90", label: "On track for SBTi target (Y/N)", type: "select", options: ["Yes", "No", "Partial"] },
];

export const E_DATA_SUMMARY_FIELDS: EsgFieldDef[] = [
  ...E_DATA_GHG_SUMMARY_FIELDS,
  ...E_DATA_NZ_FIELDS,
];

export const G_DATA_MATURITY_ROWS: MaturityRowDef[] = [
  { cell: "B5",  scoreCell: "F5",  label: "Board members (total)",                kind: "numeric" },
  { cell: "B6",  scoreCell: "F6",  label: "Independent non-executive directors",  kind: "numeric" },
  { cell: "B7",  scoreCell: "F7",  label: "Executive directors",                  kind: "numeric" },
  { cell: "B8",  scoreCell: "F8",  label: "% Black board members",                kind: "numeric" },
  { cell: "B9",  scoreCell: "F9",  label: "% Female board members",               kind: "numeric" },
  { cell: "B10", scoreCell: "F10", label: "Board meetings held YTD",              kind: "numeric" },
  { cell: "B11", scoreCell: "F11", label: "Audit committee meetings YTD",         kind: "numeric" },
  { cell: "B12", scoreCell: "F12", label: "Risk committee active (Y/N)",          kind: "yn", options: ["Yes", "Partial", "No"] },
  { cell: "B13", scoreCell: "F13", label: "Social & Ethics committee active (Y/N)", kind: "yn", options: ["Yes", "Partial", "No"] },
  { cell: "B14", scoreCell: "F14", label: "ESG linked to exec remuneration (Y/N)",  kind: "yn", options: ["Yes", "Partial", "No"] },
  { cell: "B15", scoreCell: "F15", label: "Code of ethics in place (Y/N)",        kind: "yn", options: ["Yes", "Partial", "No"] },
  { cell: "B16", scoreCell: "F16", label: "Whistleblower hotline active (Y/N)",   kind: "yn", options: ["Yes", "Partial", "No"] },
  { cell: "B17", scoreCell: "F17", label: "POPIA Information Officer appointed (Y/N)", kind: "yn", options: ["Yes", "Partial", "No"] },
  { cell: "B18", scoreCell: "F18", label: "POPIA impact assessment done (Y/N)",   kind: "yn", options: ["Yes", "Partial", "No"] },
  { cell: "B19", scoreCell: "F19", label: "External assurance of ESG report (Y/N)", kind: "yn", options: ["Yes", "Partial", "No"] },
  { cell: "B20", scoreCell: "F20", label: "Integrated report published (Y/N)",    kind: "yn", options: ["Yes", "Partial", "No"] },
  { cell: "B21", scoreCell: "F21", label: "Risk register updated (Y/N)",          kind: "yn", options: ["Yes", "Partial", "No"] },
  { cell: "B22", scoreCell: "F22", label: "Number of material risks identified",  kind: "numeric" },
  { cell: "B23", scoreCell: "F23", label: "Climate risk in risk register (Y/N)",  kind: "yn", options: ["Yes", "Partial", "No"] },
  { cell: "B24", scoreCell: "F24", label: "Anti-corruption training done (Y/N)",  kind: "yn", options: ["Yes", "Partial", "No"] },
  /*
   * Material regulatory penalties — `G_Data!B25`.
   *
   * LEDGER: `docs/esg/ESG_FORMULA_LEDGER.md` §5.3, `G d25` (5 pts). This is the
   * "free points from a non-existent cell" row:
   *   `G_Scorecard!C25 = =IF(G_Data!B25="",5,IF(G_Data!B25=0,5,0))`
   * and `G_Data!B25` DOES NOT EXIST in the workbook (`G_Data` stops at row 24, with
   * row 26 the total). Because the cell is always blank, the test `B25=""` is always
   * true and every company has been handed 5 unearned points since the sheet was
   * authored. This input turns the row into an actual assertion.
   *
   * `count`, not `yn`, and deliberately NOT defaulted: blank means "not declared"
   * and must score 0; a typed `0` is the company asserting a nil return. The scoring
   * owner must therefore invert the blank arm to `IF(B25="",0,…)` — a blank workbook
   * scoring 5 here is the exact bug this cell exists to kill.
   *
   * `SUM(F5:F24)` (the governance maturity total) deliberately excludes this row, so
   * adding it cannot move that total. There is no `F25` score cell in the sheet.
   *
   * Evidence: the regulatory penalties and sanctions register (document-matrix fields
   * `penalties_incurred_count`, `nil_return_stated`, `material_non_compliance_disclosed`).
   */
  {
    cell: "B25",
    label: "Material regulatory penalties incurred in the period",
    kind: "count",
    unit: "penalties",
    min: 0,
    step: 1,
    helpText:
      "Count of material penalties, fines, sanctions or enforcement notices received in this reporting period. Enter 0 to declare a nil return; leaving it blank is not a nil return and earns nothing.",
  },
  /*
   * Environmental policy, board approval — `G_Data!B27`.
   *
   * LEDGER: `docs/esg/ESG_FORMULA_LEDGER.md` §5.1, `E d28` ("Environmental policy —
   * board approved", 4 pts, MANUAL_ZERO). The row scores in the Environmental pillar
   * but its data source (`E_Scorecard!E28`) is this governance sheet, which is why the
   * input lives here. The workbook note points at "G_Data row 23"; the ledger records
   * that as stale — row 23 is Climate risk in risk register — and allocates `B27`,
   * with the standard `F27 = =IF(B27="Yes",5,IF(B27="Partial",2.5,0))` score cell.
   * The ledger's rule then takes the STRICTER of `F27` and the ISO clause-5.2 view.
   *
   * Row 26 is the sheet's total (`F26 = SUM(F5:F24)`), so `B27`/`F27` sit below it and
   * cannot move it.
   *
   * Evidence: the board-approved environmental policy (document-matrix fields
   * `board_approval_date`, `policy_title`, `net_zero_commitment_present`).
   */
  {
    cell: "B27",
    scoreCell: "F27",
    label: "Environmental policy approved by the board (Y/N)",
    kind: "yn",
    options: ["Yes", "Partial", "No"],
    helpText:
      "Has the board (or its delegated committee) formally approved an environmental policy, with a minuted approval date? Choose Partial where a policy exists but board approval or a net-zero commitment is missing.",
  },
];

/**
 * Employment Equity inputs — labels verbatim from `EE_Scorecard!A5:A14`
 * (`docs/esg/extracted/EE_Scorecard.json`).
 *
 * B8 and B12 were both missing, and both are read by social.ts:
 *   S_Scorecard!C8  = …EE_Scorecard!$B$8 vs Assumptions!$B$52…  (5 pts, was dead)
 *   S_Scorecard!C10 = IF(EE_Scorecard!$B$12="Yes",3,…)          (3 pts, was dead)
 * In the workbook B8 is a constant-zero formula (`=0`) — PWD % is never computed there
 * — so an input is the only way those 5 points are reachable. `B8` is now ALSO derived
 * from the new PWD headcount at `S_Data!B88` (see S_DATA_HEADCOUNT_FIELDS); it stays
 * here as an override for entities that report the percentage directly, and because
 * `esgDeriveSummary.ts` uses `fill()` a typed value still wins.
 *
 * B11 / B13 / B14 are added per ledger §5.3 `S d10` ("EE_MATURITY_ROWS omits B11–B14").
 * No E/S/G scorecard row reads them directly — they feed `EE_Scorecard!E15`, which
 * `bbbeeBridge.ts` reads for B-BBEE Management Control. Adding the inputs cannot move
 * any score on its own (a blank workbook still contributes nothing), but a filled one
 * will now move the B-BBEE bridge, which is the point: they were collected nowhere.
 *
 * SCORING WEIGHTS ARE NOT UNIFORM on this sheet, which is why each row carries its own
 * `ynPoints` (verbatim from column E of the extracted sheet):
 *   E9  = =IF(B9="Yes",10,IF(B9="Partial",5,0))      → 10 / 5
 *   E10…E14 = =IF(Bn="Yes",5,IF(Bn="Partial",2,0))   → 5 / 2   (NOT the 5 / 2.5 rule)
 * The grid used to score all of them 5 / 2.5 and divide by a hardcoded 100.
 * B5 (weight 20) and B8 (weight 10) are ratios banded against targets, so the grid
 * shows their derived score rather than pretending the raw ratio is a score.
 */
export const EE_MATURITY_ROWS: MaturityRowDef[] = [
  // EE_Scorecard!A5 = "% Black (all levels combined)" — despite the label the workbook
  // formula covers L1 only: =IFERROR((S_Data!B5+C5+D5+F5+G5+H5)/(S_Data!L5)*1,0)
  {
    cell: "B5",
    scoreCell: "E5",
    label: "Black employees (share of headcount)",
    kind: "numeric",
    unit: "0–1",
    max: 1,
    step: 0.01,
  },
  // EE_Scorecard!A8 = "% Persons with Disabilities"
  {
    cell: "B8",
    scoreCell: "E8",
    label: "Employees with disabilities (share of headcount)",
    kind: "numeric",
    unit: "0–1",
    max: 1,
    step: 0.01,
    helpText:
      "Worked out for you from the disability headcount captured with the workforce profile. Enter a figure here only to override that.",
  },
  // EE_Scorecard!A9 = "EE Plan submitted to DoEL (Y/N)"
  {
    cell: "B9",
    scoreCell: "E9",
    label: "Employment Equity plan submitted to the Department of Employment and Labour",
    kind: "yn",
    options: ["Yes", "Partial", "No"],
    ynPoints: { yes: 10, partial: 5 },
  },
  // EE_Scorecard!A10 = "EE forum/TDs consulted (Y/N)"
  {
    cell: "B10",
    scoreCell: "E10",
    label: "Employment Equity forum consulted",
    kind: "yn",
    options: ["Yes", "Partial", "No"],
    ynPoints: { yes: 5, partial: 2 },
  },
  // EE_Scorecard!A11 = "EE monitoring & reporting (Y/N)"
  {
    cell: "B11",
    scoreCell: "E11",
    label: "Employment Equity progress monitored and reported",
    kind: "yn",
    options: ["Yes", "Partial", "No"],
    ynPoints: { yes: 5, partial: 2 },
  },
  // EE_Scorecard!A12 = "Numerical targets set (Y/N)"
  {
    cell: "B12",
    scoreCell: "E12",
    label: "Numerical targets set per level, race and gender",
    kind: "yn",
    options: ["Yes", "Partial", "No"],
    ynPoints: { yes: 5, partial: 2 },
  },
  // EE_Scorecard!A13 = "Barriers to EE removed (Y/N)"
  {
    cell: "B13",
    scoreCell: "E13",
    label: "Barriers to employment equity identified and removed",
    kind: "yn",
    options: ["Yes", "Partial", "No"],
    ynPoints: { yes: 5, partial: 2 },
  },
  // EE_Scorecard!A14 = "Affirmative measures implemented"
  {
    cell: "B14",
    scoreCell: "E14",
    label: "Affirmative measures implemented",
    kind: "yn",
    options: ["Yes", "Partial", "No"],
    ynPoints: { yes: 5, partial: 2 },
  },
];

/** Reporting-unit selector for Environmental data: per-site (the 5 depots) or one
 *  consolidated "Company wide" row, for entities that report environmental detail at
 *  company level rather than per depot. Stored on the e-data draft as `eScope`. */
export const E_DATA_SCOPE_FIELDS: EsgFieldDef[] = [
  {
    cell: "eScope",
    label: "Environmental data scope",
    type: "select",
    options: ["Per site / depot", "Company wide"],
  },
];

/**
 * E_Data monthly-grid row builders.
 *
 * Each takes the site axis as a parameter defaulting to {@link ESG_DEFAULT_DEPOTS};
 * the reference workbook's site names are a fallback, not the only permitted values.
 *
 * ROW COUNT AND ORDER ARE LOAD-BEARING. EsgMonthlyGrid addresses cells as
 * `${prefix}_${col}${14 + rowIndex}`, so a value is keyed by row INDEX, not by label.
 * Passing a different-length or differently-ordered axis re-points saved data.
 */
type MonthlyRowSeed = { depot: string; months: (number | "")[] };

const noMonths = (): (number | "")[] => [];

export function eDataDepotRows(companyWide = false, depots: readonly string[] = ESG_DEFAULT_DEPOTS): MonthlyRowSeed[] {
  if (companyWide) return [{ depot: "Company wide", months: noMonths() }];
  return depots.map((depot) => ({ depot, months: noMonths() }));
}

export function eDataGeneratorRows(
  companyWide = false,
  depots: readonly string[] = ESG_DEFAULT_DEPOTS,
): MonthlyRowSeed[] {
  if (companyWide) return [{ depot: "Generator – Company wide", months: noMonths() }];
  return depots.map((depot) => ({ depot: `Generator – ${depot}`, months: noMonths() }));
}

/**
 * Scope 1C LPG forklifts — a single row (workbook `E_Data!A32`), because only some sites
 * run gas forklifts. `site` names which one; omitted, the row stays site-neutral.
 */
export function eDataLpgRows(site?: string): MonthlyRowSeed[] {
  return [{ depot: site ? `LPG forklifts – ${site}` : "LPG forklifts", months: noMonths() }];
}

/**
 * Scope 1D business cars — a single row (workbook `E_Data!A37`, whose label names an
 * individual; replaced with the category label from `E_Data!A78`, "Scope 1D — Business
 * Cars"). `site` optionally names the site the vehicles are based at.
 */
export function eDataBusinessCarRows(site?: string): MonthlyRowSeed[] {
  return [{ depot: site ? `Business cars – ${site}` : "Business cars", months: noMonths() }];
}

/**
 * Solar generation rows, one per site, offsetting the Scope 2 rows of the same index.
 *
 * NB the source workbook orders its solar block (`A50:A54`: ISANDO, DBN, CPT, BLOEM, PE)
 * differently from its own electricity block (`A41:A45`: BLOEM, CPT, DBN, ISANDO, PE).
 * Since `L81` sums all five, the aggregate is unaffected, but any per-site pairing in the
 * workbook is mis-attributed. We use one axis for both so index i means the same site in
 * each grid.
 */
export function eDataSolarRows(companyWide = false, depots: readonly string[] = ESG_DEFAULT_DEPOTS): MonthlyRowSeed[] {
  if (companyWide) return [{ depot: "Solar – Company wide", months: noMonths() }];
  return depots.map((depot) => ({ depot: `Solar – ${depot}`, months: noMonths() }));
}

export function eDataWaterRows(companyWide = false, depots: readonly string[] = ESG_DEFAULT_DEPOTS): MonthlyRowSeed[] {
  if (companyWide) return [{ depot: "Water – Company wide", months: noMonths() }];
  return depots.map((depot) => ({ depot: `Water – ${depot}`, months: noMonths() }));
}

export function eDataWasteRows(): MonthlyRowSeed[] {
  return [{ depot: "% Waste Recycled (all sites)", months: noMonths() }];
}

/**
 * Third-party waste-contractor report — workbook `E_Data!L68:L70`
 * (`A68` "…Total Waste (kg)", `A69` "…% Landfill", `A70` "…% Diversion
 * (recycled+recovery)"). The workbook prefixes each with a site and contractor name;
 * pass `site` to reproduce that per entity instead of hardcoding one.
 *
 * For the derive agent: these three are the numbers that should feed
 * `Waste_Register!B16` (diversion rate, read by E_Scorecard!C19) — today they feed nothing.
 */
export function wasteScalarFields(site?: string): EsgFieldDef[] {
  const prefix = site ? `${site} – ` : "";
  return [
    { cell: "L68", label: `${prefix}Total waste (kg)`, type: "number" },
    { cell: "L69", label: `${prefix}% Landfill`, type: "number" },
    { cell: "L70", label: `${prefix}% Diversion (recycled + recovery)`, type: "number" },
  ];
}

export const WASTE_SCALAR_FIELDS: EsgFieldDef[] = wasteScalarFields();

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * Indicators that needed NO new input — deliberately not added here
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Four of the ten never-scoring indicators in `docs/esg/ESG_FORMULA_LEDGER.md`
 * Part 5 already have a complete input path. Adding a hand-typed field for any of
 * them would create a second, unverifiable source of truth beside a register the
 * user has already filled in — the defect this pass exists to remove, not repeat.
 * Recorded here so nobody "fixes" them by adding a number box.
 *
 * `S d26` Supplier health & safety compliance (5 pts) — ledger §5.2
 * `S d27` Supplier food safety rating (5 pts)         — ledger §5.2
 *   The supplier register (`ESG_GRID_SECTIONS.saq`, sheet `SAQ_Supplier`,
 *   `startRow` 5) already collects a 1–5 rating per supplier across seven
 *   criteria. `esgGridRows.ts#writeEsgGridCells` lays the columns out in
 *   declaration order from `A`, and the register's order matches the sheet
 *   exactly, so the ratings ALREADY land on the cells the ledger's rules read:
 *       column `healthSafety` → `D`  → `SAQ_Supplier!D5:D16`   (`S d26`)
 *       column `foodSafety`   → `F`  → `SAQ_Supplier!F5:F16`   (`S d27`)
 *   Values are stored as STRINGS ("5"…"1", "N/A") because the column is a select.
 *   `readEsgCell` number-coerces them, and "N/A" yields `null` — which is exactly
 *   Excel's `COUNT`/`AVERAGE` behaviour over a text cell, so the ledger's
 *   `AVERAGE(D5:D16)/5 vs Assumptions!B58` bands transfer unchanged.
 *   TWO THINGS FOR THE SCORING OWNER: (1) a nil register must score 0, not a free
 *   pass — `COUNT(...)=0 → 0` is already the first arm of both ledger rules;
 *   (2) the fixed `5:16` range assumes ≤12 suppliers, so read the register rows
 *   rather than a literal range if more can be captured.
 *   Evidence: the supplier self-assessment questionnaire (document-matrix fields
 *   `supplier_health_safety_score`, `supplier_food_safety_score`).
 *
 * `E d26` ISO 14001 certification (8 pts)   — ledger §5.1, reads `ISO_Tracker!D16`/`E16`/`E17`
 * `E d27` ISO 14001 aspects register (4 pts) — ledger §5.1, reads `ISO_Tracker!D10`/`E10`
 * `E d29` NEMA/NWA/NEMWA legal compliance (4 pts) — ledger §5.1, reads `ISO_Tracker!D11`/`E11`,
 *          gated on `G_Data!F21` (risk/legal register updated), which this config
 *          already captures at `B21`.
 *   The clause tracker is a register section and already collects a status per
 *   clause from the sheet's own `Fully Compliant / Partially Compliant / Gap /
 *   Not Applicable` vocabulary. Nothing new to type. BUT the register's columns
 *   are offset by one from the sheet — see the note handed to the grid owner in
 *   this pass's report — so the status a user picks currently lands in column `C`,
 *   not the `D` those three rules read. That realignment belongs to
 *   `esgGridSections.ts`, which this file does not own.
 *   Evidence: the ISO 14001 certificate, the aspects & impacts register and the
 *   environmental legal register (document-matrix fields `iso14001_status`,
 *   `significant_aspects_count` / `register_last_review_date`, and
 *   `non_compliance_count` / `permit_expiry_date` respectively).
 */
