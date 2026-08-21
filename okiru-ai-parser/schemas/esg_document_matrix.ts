/**
 * The ESG evidence matrix — what an ESG assurance provider actually asks for.
 *
 * This is the ESG analogue of `verification_document_matrix.ts`. The B-BBEE
 * matrix exists because a verification asks for 109 documents while the parser
 * knew 7; ESG has exactly the same shape of problem. A King V / IFRS S1-S2 /
 * ISO 14001 engagement is fed by municipal bills, fuel card statements, waste
 * manifests, certificates, registers and policies — none of which the parser
 * currently has a concept of, so a client folder full of real evidence comes
 * back empty.
 *
 * Each entry carries the same four things extraction needs:
 *   - `auditorTests`      what an assurance provider checks → validation layer
 *   - `exampleData`       what good data looks like → grounding for extraction
 *   - `extractionPrompt`  the instruction to run against the document
 *   - `expectedFields`    the JSON keys that prompt asks for → output schema
 *
 * Unlike the B-BBEE matrix this file is HAND-AUTHORED rather than generated from
 * a workbook (there is no expert-authored ESG source workbook). It is
 * deliberately structured identically — same field names, same helper surface —
 * so `selectSpecsForDocument`, the sweep pass, the review-flag layer and the
 * matrix tooling can be shared without a second code path.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THESE FOURTEEN ELEMENTS
 *
 * B-BBEE has five elements because the Codes define five. ESG has no statutory
 * element list, so the element here is chosen for ONE job: routing a document to
 * the right extraction spec and then to the right block of workbook cells. The
 * split therefore follows where the data LANDS in the toolkit, not the tidy
 * E/S/G triple — "Environmental" as a single element would route a municipal
 * water bill and an ISO 14001 certificate to the same spec, which is exactly the
 * failure the B-BBEE matrix was built to avoid.
 *
 *   GHG_ENERGY        E_Data rows 39-54 + 73-90, Carbon_Tax, NetZero_Roadmap.
 *                     Energy bought or generated, and everything that converts
 *                     to tCO2e. Includes the carbon tax return: it is a tax
 *                     filing whose payload is emissions, so it routes on
 *                     emissions vocabulary, not financial vocabulary.
 *   FLEET             E_Data rows 12-19/35-37, Fleet_Register, Driver_Debrief.
 *                     Split from GHG_ENERGY because fleet evidence is
 *                     per-vehicle and per-trip: it fills register GRIDS, not
 *                     scalar cells, and the same litres also drive L/100km and
 *                     EV-mix scoring that have nothing to do with energy bills.
 *   WASTE             Waste_Register. Its own element because waste evidence
 *                     comes from a contractor, in tonnes, with a diversion rate
 *                     and a disposal certificate number — no other document
 *                     type shares that vocabulary.
 *   WATER             E_Data rows 56-63. Kept apart from GHG_ENERGY because a
 *                     municipal account can be water-only, electricity-only or
 *                     combined; routing both to one spec loses the kL when the
 *                     kWh dominates the page.
 *   ISO_ENVIRONMENTAL The EMS evidence family: ISO 14001 certificate,
 *                     board-approved environmental policy, aspects and impacts
 *                     register, NEMA/NWA/NEMWA legal register. These are the
 *                     ISO_Tracker 14001 block and are qualitative/status data,
 *                     not measurements — a different extraction problem from a
 *                     bill.
 *   EMPLOYMENT_EQUITY S_Data rows 3-21, EE_Scorecard. Isolated from TRAINING
 *                     because EEA2 is a race x gender x occupational-level
 *                     matrix — the one genuinely two-dimensional table in the
 *                     whole ESG set.
 *   HEALTH_SAFETY     S_Data rows 24-39, ISO_Tracker 45001 block. Holds the
 *                     ISO 45001 certificate too: 45001 is the OHS management
 *                     system, and its certificate belongs beside LTIFR rather
 *                     than beside the EMS.
 *   TRAINING          S_Data rows 41-67. WSP/ATR, SDL and the OFO grid. Split
 *                     from EMPLOYMENT_EQUITY because the denominator is
 *                     leviable payroll, not headcount.
 *   COMMUNITY_CSI     S_Data rows 70-82. CSI/SED spend and its beneficiary
 *                     evidence; scored against NPAT, so it needs FINANCIAL but
 *                     is not part of it.
 *   SUPPLIER_ESG      SAQ_Supplier. Third-party data about someone else — the
 *                     only element whose subject is not the measured entity,
 *                     which is why it must never merge with the entity-level
 *                     ISO or ethics elements.
 *   BOARD_GOVERNANCE  G_Data rows 3-13, King5_Scorecard. Composition,
 *                     committees, King application, integrated report.
 *   ETHICS_COMPLIANCE G_Data rows 15-18/24. Ethics, whistleblowing, POPIA,
 *                     penalties. Separated from BOARD_GOVERNANCE because the
 *                     evidence is policies and incident registers rather than
 *                     minutes and registers of people.
 *   RISK_ASSURANCE    G_Data rows 19-23, GARP_GRAP, IFRS_S1_S2. Risk register,
 *                     IFRS S1/S2 readiness, external assurance statements.
 *   FINANCIAL         Cover + the entity-level denominators every ESG ratio
 *                     divides by (NPAT, revenue, payroll, PI score) plus the
 *                     entity B-BBEE status the B_BBEE_ESG bridge sheet reads.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FIELD NAMING
 *
 * `expectedFields` are snake_case and predictable so a later mapping layer can
 * bind them to workbook cells without per-document special cases:
 *   - a measurement carries its unit: `electricity_kwh`, `water_kl`,
 *     `fuel_litres`, `lpg_kg`, `waste_recycled_kg`, `*_tco2e`, `*_rand`
 *   - a period is always `<thing>_period_start` / `<thing>_period_end`
 *   - a certificate field is prefixed by its standard: `iso14001_status`
 *   - a count ends `_count`, a share ends `_percent`, a date ends `_date`
 *   - `site_name` is the depot/branch dimension everywhere it appears
 *   - every entry ends with `exceptions`, matching the B-BBEE convention
 */

/**
 * ESG evidence element. Chosen for document routing and cell binding — see the
 * header comment for why each one earns its place.
 */
export type EsgElement =
  | 'GHG_ENERGY'
  | 'FLEET'
  | 'WASTE'
  | 'WATER'
  | 'ISO_ENVIRONMENTAL'
  | 'EMPLOYMENT_EQUITY'
  | 'HEALTH_SAFETY'
  | 'TRAINING'
  | 'COMMUNITY_CSI'
  | 'SUPPLIER_ESG'
  | 'BOARD_GOVERNANCE'
  | 'ETHICS_COMPLIANCE'
  | 'RISK_ASSURANCE'
  | 'FINANCIAL';

export interface EsgDocument {
  /** Stable id, `element__document_name`. Safe to persist against. */
  id: string;
  element: EsgElement;
  /** The document name as a South African ESG practitioner would write it. */
  name: string;
  /**
   * Strings a classifier can match in the document itself. Includes provider
   * and statute names (Eskom, Oricol, NEMA, EEA2, EMP201, ISO 14001) — usually
   * the only text that reliably appears, since documents rarely restate their
   * own title. Keep aliases 5 characters or longer: the document selector
   * discards shorter ones as too loose to route on.
   */
  aliases: string[];
  /** What an assurance provider tests. Drives review flags and validation. */
  auditorTests: string;
  /** A worked example of correct data for this document. */
  exampleData: string;
  /** The extraction instruction run against the document. */
  extractionPrompt: string;
  /** JSON keys the prompt asks for → the output schema for this document. */
  expectedFields: string[];
}

export const ESG_DOCUMENT_MATRIX: readonly EsgDocument[] = [
  // ────────────────────────────────────────────────────────────────────────
  // GHG_ENERGY
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'ghg_energy__municipal_electricity_bill',
    element: 'GHG_ENERGY',
    name: 'Municipal electricity bill / utility statement',
    aliases: [
      'Municipal electricity bill',
      'municipal account',
      'electricity invoice',
      'utility statement',
      'electricity statement',
      'consumption charge',
      'kWh consumed',
      'units consumed',
      'City Power',
      'City of Cape Town',
      'City of Johannesburg',
      'City of Tshwane',
      'eThekwini Municipality',
      'Nelson Mandela Bay Municipality',
      'Mangaung Metropolitan',
      'Eskom account',
      'notified maximum demand',
      'landlord electricity recovery',
      'meter reading',
    ],
    auditorTests:
      'Confirms Scope 2 grid electricity per site for the reporting period. The assurance provider: (1) agrees the kWh on the bill to the kWh captured in E_Data for that depot and month; (2) checks the billing period falls inside the reporting period and that consecutive bills neither overlap nor leave a gap; (3) rejects estimated readings where an actual reading exists; (4) confirms landlord recovery statements are not double-counted against a direct municipal account for the same site.',
    exampleData:
      'City of Johannesburg account 5104238771, site ISANDO, period 01 Oct 2025 to 31 Oct 2025, meter 71344220, previous reading 482,110, current reading 517,442, actual reading, 35,332 kWh at R2.48/kWh = R87,623.36 excl VAT, notified maximum demand 320 kVA.',
    extractionPrompt:
      'You are extracting Scope 2 electricity evidence from a South African municipal or utility account. Read the attached statement and return JSON with: site_name (the service address or depot the account is billed for), utility_account_number, municipality_or_supplier_name, billing_period_start, billing_period_end, electricity_kwh (units consumed for the period), electricity_rand_excl_vat, electricity_tariff_rand_per_kwh, meter_number, meter_reading_previous, meter_reading_current, reading_type (actual or estimated), max_demand_kva, is_landlord_recovery (true when the charge is recovered by a landlord rather than billed by the municipality), exceptions (list). Copy every figure exactly as printed — do not convert units, do not re-date, do not net VAT in or out, and never infer a value the statement does not state; use null instead. Where the statement covers several meters or sites, return one object per site under a sites array. If this is not an electricity or utility account, return { "not_this_document": true }.',
    expectedFields: [
      'site_name',
      'utility_account_number',
      'municipality_or_supplier_name',
      'billing_period_start',
      'billing_period_end',
      'electricity_kwh',
      'electricity_rand_excl_vat',
      'electricity_tariff_rand_per_kwh',
      'meter_number',
      'meter_reading_previous',
      'meter_reading_current',
      'reading_type',
      'max_demand_kva',
      'is_landlord_recovery',
      'exceptions',
    ],
  },
  {
    id: 'ghg_energy__solar_generation_report',
    element: 'GHG_ENERGY',
    name: 'Solar generation report / PV inverter statement',
    aliases: [
      'solar generation report',
      'PV inverter report',
      'photovoltaic yield',
      'solar production',
      'SolarEdge monitoring',
      'FusionSolar',
      'Sungrow',
      'Victron',
      'Goodwe',
      'embedded generation',
      'kWh generated',
      'energy yield report',
      'small scale embedded generation',
    ],
    auditorTests:
      'Confirms on-site renewable generation used to reduce net Scope 2. The assurance provider: (1) agrees generated kWh to the inverter or monitoring-portal export, not to a marketing estimate or a modelled yield; (2) confirms who owns the system, since a landlord-owned or third-party PPA system changes whether the entity may claim the generation; (3) checks that self-consumed kWh, not gross generation, is what offsets purchased electricity; (4) confirms the reporting period matches the electricity account period for the same site.',
    exampleData:
      'SolarEdge site "SG ISANDO Roof", inverter SN 7E14F2C9, 01 Oct 2025 to 31 Oct 2025, 412 kWp installed, 58,940 kWh generated, 54,110 kWh self-consumed, 4,830 kWh exported. System owner: SG-owned (Graeme Barand installation).',
    extractionPrompt:
      'You are extracting on-site renewable generation evidence. Read the attached solar or PV generation report and return JSON with: site_name, solar_system_owner (entity-owned, landlord-owned, or third-party PPA, exactly as stated), solar_installed_capacity_kwp, reporting_period_start, reporting_period_end, solar_kwh_generated, solar_kwh_self_consumed, solar_kwh_exported_to_grid, inverter_serial_number, monitoring_platform, exceptions (list). Copy the figures exactly as reported — never annualise a monthly figure, never model a value from capacity, and never infer ownership; where the report does not state a value use null. If this is not a solar or renewable generation report, return { "not_this_document": true }.',
    expectedFields: [
      'site_name',
      'solar_system_owner',
      'solar_installed_capacity_kwp',
      'reporting_period_start',
      'reporting_period_end',
      'solar_kwh_generated',
      'solar_kwh_self_consumed',
      'solar_kwh_exported_to_grid',
      'inverter_serial_number',
      'monitoring_platform',
      'exceptions',
    ],
  },
  {
    id: 'ghg_energy__sbti_commitment_letter',
    element: 'GHG_ENERGY',
    name: 'SBTi commitment letter / net-zero target statement',
    aliases: [
      'Science Based Targets initiative',
      'SBTi commitment letter',
      'Corporate Net-Zero Standard',
      'near-term target validation',
      'target validation letter',
      'net-zero commitment',
      'net zero by 2050',
      'science-based target',
      'commitment letter emissions',
      'decarbonisation target',
    ],
    auditorTests:
      'Distinguishes a COMMITMENT from a VALIDATED target — the two score differently and are routinely conflated. The assurance provider: (1) reads whether SBTi has validated the target or merely acknowledged a commitment letter; (2) confirms the baseline year and baseline tonnage are stated, since a target without a baseline is unverifiable; (3) checks which scopes the target covers and whether Scope 3 is included; (4) confirms the letter is signed by a person with authority to bind the entity.',
    exampleData:
      'SBTi commitment letter signed 14 Feb 2026 by P. Mountford (Chief Executive Officer). Commitment acknowledged, target not yet validated. Baseline year FY2025/26, baseline Scope 1+2 of 27,480 tCO2e. Near-term target: -50% Scope 1+2 by 2030. Net-zero by 2050 under Corporate Net-Zero Standard 2.0. Scope 3 target to follow.',
    extractionPrompt:
      'You are extracting a climate target commitment. Read the attached letter or target statement and return JSON with: commitment_status (committed, validated, or not_stated — use the exact status the document supports and nothing stronger), sbti_commitment_date, validation_status, net_zero_target_year, near_term_target_year, baseline_year, baseline_scope1_2_tco2e, target_reduction_percent, scopes_covered, scope3_target_included, target_framework (for example Corporate Net-Zero Standard 2.0), signatory_name, signatory_role, exceptions (list). Copy dates, years and tonnages verbatim. Never upgrade a commitment to a validated target, never infer a baseline the document does not state, and never compute a reduction percentage the document does not print; use null. If this is not a climate target commitment or validation document, return { "not_this_document": true }.',
    expectedFields: [
      'commitment_status',
      'sbti_commitment_date',
      'validation_status',
      'net_zero_target_year',
      'near_term_target_year',
      'baseline_year',
      'baseline_scope1_2_tco2e',
      'target_reduction_percent',
      'scopes_covered',
      'scope3_target_included',
      'target_framework',
      'signatory_name',
      'signatory_role',
      'exceptions',
    ],
  },
  {
    id: 'ghg_energy__carbon_tax_return',
    element: 'GHG_ENERGY',
    name: 'Carbon tax return / carbon tax licence (SARS)',
    aliases: [
      'carbon tax return',
      'Carbon Tax Act',
      'carbon tax licence',
      'environmental levy account',
      'customs and excise licence',
      'basic tax-free allowance',
      'taxable emissions',
      'carbon tax liability',
      'DA 180',
      'carbon tax rate per tonne',
    ],
    auditorTests:
      'Confirms the declared taxable emissions and reconciles them to the GHG inventory. The assurance provider: (1) agrees taxable tCO2e on the return to the Scope 1 total in the inventory, explaining any allowance-driven difference; (2) confirms the allowances claimed (basic 60%, trade exposure, performance, carbon budget, offset) are those the entity is entitled to; (3) checks the tax period matches the licensed period; (4) confirms the licence number is current and the return was filed by the due date.',
    exampleData:
      'SARS carbon tax return, licence CT/0091/2026, tax period 01 Jan 2025 to 31 Dec 2025. Taxable emissions 24,116 tCO2e, basic allowance 60%, total allowances 60%, rate R236/tCO2e, liability R2,276,550. Filed 29 Jul 2026.',
    extractionPrompt:
      'You are extracting a South African carbon tax filing. Read the attached return or licence and return JSON with: taxpayer_name, carbon_tax_licence_number, tax_period_start, tax_period_end, taxable_emissions_tco2e, basic_allowance_percent, total_allowances_percent, carbon_tax_rate_rand_per_tco2e, carbon_tax_liability_rand, filing_date, allowances_claimed (list of each allowance named on the return), exceptions (list). Copy every figure and every allowance name exactly as printed. Never recompute the liability, never convert tonnages, and never assume the basic 60% allowance applies if the return does not show it; use null where the document is silent. If this is not a carbon tax return or licence, return { "not_this_document": true }.',
    expectedFields: [
      'taxpayer_name',
      'carbon_tax_licence_number',
      'tax_period_start',
      'tax_period_end',
      'taxable_emissions_tco2e',
      'basic_allowance_percent',
      'total_allowances_percent',
      'carbon_tax_rate_rand_per_tco2e',
      'carbon_tax_liability_rand',
      'filing_date',
      'allowances_claimed',
      'exceptions',
    ],
  },
  {
    id: 'ghg_energy__generator_diesel_bowser_reconciliation',
    element: 'GHG_ENERGY',
    name: 'Generator diesel / bulk fuel bowser reconciliation',
    aliases: [
      'bowser reconciliation',
      'bulk fuel reconciliation',
      'bulk diesel delivery note',
      'generator diesel',
      'standby generator',
      'tank dip reading',
      'diesel stock reconciliation',
      'generator run hours',
      'fuel tank opening balance',
    ],
    auditorTests:
      'Confirms Scope 1 stationary combustion and prevents double counting against fleet diesel. The assurance provider: (1) reconciles opening stock plus deliveries less closing stock to litres issued; (2) confirms litres issued into vehicles are excluded from the generator figure and appear in the fleet fuel data instead; (3) checks run hours are plausible against litres at the generator consumption rate; (4) confirms the delivery notes support the deliveries claimed.',
    exampleData:
      'DBN depot bowser recon, October 2025: opening dip 4,120 L, deliveries 6,000 L (delivery notes 88214, 88397), closing dip 3,480 L, total issued 6,640 L, of which 6,001 L issued to vehicles and 639 L to the standby generator over 41 run hours.',
    extractionPrompt:
      'You are extracting Scope 1 stationary fuel evidence. Read the attached bowser reconciliation, tank dip sheet or bulk fuel delivery note and return JSON with: site_name, reporting_period_start, reporting_period_end, opening_stock_litres, deliveries_litres, closing_stock_litres, issued_total_litres, issued_to_fleet_litres, generator_diesel_litres, generator_run_hours, fuel_supplier_name, delivery_note_numbers (list), exceptions (list). Copy litres exactly as recorded and keep generator litres separate from litres issued into vehicles — never merge them. Never infer a closing dip or back-calculate a missing figure; use null. If this is not a bulk fuel reconciliation or delivery record, return { "not_this_document": true }.',
    expectedFields: [
      'site_name',
      'reporting_period_start',
      'reporting_period_end',
      'opening_stock_litres',
      'deliveries_litres',
      'closing_stock_litres',
      'issued_total_litres',
      'issued_to_fleet_litres',
      'generator_diesel_litres',
      'generator_run_hours',
      'fuel_supplier_name',
      'delivery_note_numbers',
      'exceptions',
    ],
  },
  {
    id: 'ghg_energy__lpg_gas_supply_invoice',
    element: 'GHG_ENERGY',
    name: 'LPG / bulk gas supply invoice',
    aliases: [
      'LPG delivery note',
      'liquefied petroleum gas',
      'bulk gas supply',
      'forklift gas cylinders',
      'gas cylinder exchange',
      'Easigas',
      'Afrox invoice',
      'Oryx Energies',
      'LPG kilograms delivered',
    ],
    auditorTests:
      'Confirms Scope 1 LPG combustion, which is measured in kilograms and is routinely mis-recorded in litres or cylinder counts. The assurance provider: (1) confirms the quantity is stated in kg, or that a cylinder count has been converted at the stated cylinder mass; (2) confirms the gas is combusted (forklifts, heating) and not merely stored; (3) confirms the depot served, since LPG forklift fleets are usually site-specific.',
    exampleData:
      'Easigas invoice INV-2025-40218, DBN depot, 12 Nov 2025, 12 x 48 kg cylinders exchanged = 570 kg, R14,820 excl VAT. Equipment served: gas forklifts (DBN warehouse).',
    extractionPrompt:
      'You are extracting Scope 1 LPG evidence. Read the attached gas invoice or delivery note and return JSON with: site_name, gas_supplier_name, delivery_period_start, delivery_period_end, lpg_kg, lpg_cylinders_delivered, lpg_cylinder_mass_kg, lpg_rand_excl_vat, equipment_served, invoice_number, exceptions (list). Copy the quantity exactly as billed. If the document states cylinders only, return the cylinder count and the stated cylinder mass and leave lpg_kg null rather than multiplying them yourself. Never convert litres to kilograms. If this is not an LPG or bulk gas supply document, return { "not_this_document": true }.',
    expectedFields: [
      'site_name',
      'gas_supplier_name',
      'delivery_period_start',
      'delivery_period_end',
      'lpg_kg',
      'lpg_cylinders_delivered',
      'lpg_cylinder_mass_kg',
      'lpg_rand_excl_vat',
      'equipment_served',
      'invoice_number',
      'exceptions',
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  // FLEET
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'fleet__fuel_card_statement',
    element: 'FLEET',
    name: 'Fuel card statement / fleet fuel consumption report',
    aliases: [
      'fuel card statement',
      'fleet card statement',
      'fuel consumption report',
      'litres dispensed',
      'WesBank Fleet',
      'Standard Bank Fleet Management',
      'Nedfleet',
      'Absa Fleet',
      'Engen fuel card',
      'Shell Card',
      'Sasol fleet card',
      'fuel transaction listing',
      'odometer at fill',
    ],
    auditorTests:
      'Primary source for Scope 1 mobile combustion. The assurance provider: (1) totals litres per depot and agrees them to the fleet diesel captured in E_Data for that month; (2) traces each registration on the statement to the fleet register, flagging fuel drawn by a vehicle not on the register; (3) checks odometer sequences for reversals or impossible jumps that indicate a mis-keyed reading; (4) confirms litres are excluded where the transaction is for a subcontractor vehicle.',
    exampleData:
      'Standard Bank Fleet Management statement, account 3021-4457-88, 01 Nov 2025 to 30 Nov 2025, ISANDO depot. 214 transactions, 36,773.79 litres diesel, R732,104.11 excl VAT. Example line: 12 Nov 2025, KY75THGP, Engen Alrode, 318.4 L, odometer 284,117.',
    extractionPrompt:
      'You are extracting fleet fuel evidence. Read the attached fuel card statement or fuel consumption report and return JSON with: fuel_card_provider, account_number, statement_period_start, statement_period_end, depot_name, total_litres_period, total_fuel_rand_excl_vat, and a transactions array where each row has: transaction_date, vehicle_registration, fuel_type, fuel_litres, fuel_rand_excl_vat, odometer_reading, transaction_site. Copy registrations exactly as printed including spacing, and copy litres and odometer readings verbatim. Never convert rands to litres or infer a fuel type the statement does not name; use null. If the statement summarises by depot rather than by transaction, return the depot totals and leave the transactions array empty. If this is not a fuel card or fuel consumption document, return { "not_this_document": true }.',
    expectedFields: [
      'fuel_card_provider',
      'account_number',
      'statement_period_start',
      'statement_period_end',
      'depot_name',
      'total_litres_period',
      'total_fuel_rand_excl_vat',
      'transaction_date',
      'vehicle_registration',
      'fuel_type',
      'fuel_litres',
      'fuel_rand_excl_vat',
      'odometer_reading',
      'transaction_site',
      'exceptions',
    ],
  },
  {
    id: 'fleet__vehicle_register',
    element: 'FLEET',
    name: 'Fleet vehicle register / vehicle asset list',
    aliases: [
      'fleet register',
      'fleet list',
      'vehicle asset register',
      'vehicle schedule',
      'fleet summary totals per type',
      'vehicle master list',
      'licence disc expiry',
      'gross vehicle mass',
      'tare weight',
      'payload capacity',
      'horse and trailer schedule',
      'telematics fitted',
    ],
    auditorTests:
      'Establishes the denominator for every fleet intensity and EV-mix metric. The assurance provider: (1) counts vehicles by category and agrees the total to the fleet summary; (2) confirms each vehicle drawing fuel in the period appears on the register; (3) checks that fuel type and EV flags are consistent (a vehicle flagged electric may not draw diesel); (4) confirms the L/100km norm is an OEM or documented figure rather than the actual restated as a norm; (5) checks licence disc expiry dates for vehicles operated while unlicensed.',
    exampleData:
      'Fleet register, February 2026, 134 vehicles. Example row: KY75THGP, depot SGTSPFMCG, HINO 1627 8T Fridge, GVM 16,000 kg, tare 8,180 kg, payload 7,820 kg, tank 390 L, diesel, telematics I-CAM, 8,940 km and 3,112 L in the month, 34.8 L/100km actual against a 32.0 norm, licence expiry 31 Aug 2026. EV count 0 of 134.',
    extractionPrompt:
      'You are extracting the fleet asset register. Read the attached vehicle register or asset list and return JSON with a vehicles array where each row has: vehicle_registration, depot_name, vehicle_make_model, vehicle_category, fuel_type, is_electric_vehicle, gvm_kg, tare_kg, payload_kg, fuel_tank_capacity_litres, telematics_provider, monthly_km, monthly_litres, l_per_100km_actual, l_per_100km_norm, monthly_tco2e, service_status, licence_expiry_date. Also return the register totals: fleet_total_vehicles, fleet_ev_count, fleet_trailer_count, register_as_at_date, exceptions (list). Copy registrations, masses and dates exactly as listed. Never derive L/100km yourself, never infer a norm, and never mark a vehicle electric unless the register says so; use null where a column is blank. Ignore any header, legend or category-key rows — they are template vocabulary, not vehicles. If this is not a vehicle register, return { "not_this_document": true }.',
    expectedFields: [
      'vehicle_registration',
      'depot_name',
      'vehicle_make_model',
      'vehicle_category',
      'fuel_type',
      'is_electric_vehicle',
      'gvm_kg',
      'tare_kg',
      'payload_kg',
      'fuel_tank_capacity_litres',
      'telematics_provider',
      'monthly_km',
      'monthly_litres',
      'l_per_100km_actual',
      'l_per_100km_norm',
      'monthly_tco2e',
      'service_status',
      'licence_expiry_date',
      'fleet_total_vehicles',
      'fleet_ev_count',
      'fleet_trailer_count',
      'register_as_at_date',
      'exceptions',
    ],
  },
  {
    id: 'fleet__telematics_driver_debrief_report',
    element: 'FLEET',
    name: 'Telematics report / driver debrief report',
    aliases: [
      'driver debrief',
      'telematics report',
      'MiX Telematics',
      'Cartrack report',
      'Netstar report',
      'driver scorecard',
      'route completion report',
      'harsh braking events',
      'excess kilometres',
      'idling hours',
      'fatigue alert report',
      'customer hit rate',
    ],
    auditorTests:
      'Supports fleet efficiency and driver-fatigue disclosure. The assurance provider: (1) agrees distance travelled to the odometer movement implied by the fuel statement; (2) confirms fatigue and harsh-event counts come from the system rather than from a manual tally; (3) confirms planned against actual stops reconcile to the route plan; (4) checks the report period matches the fuel and fleet periods for the same depot.',
    exampleData:
      'I-CAM driver debrief, DBN, 14 Nov 2025. Driver N. Mkhize, vehicle KZ00LCGP, route DBN-North-2, planned stops 18, actual stops 17, customer hit 94.4%, 214 km, 9.2 driving hours, 3 harsh braking events, 1 speeding event, 0 fatigue alerts, 1.4 idling hours.',
    extractionPrompt:
      'You are extracting telematics and driver debrief evidence. Read the attached report and return JSON with a debriefs array where each row has: report_date, depot_name, driver_name, vehicle_registration, route_name, planned_stops, actual_stops, customer_hit_percent, distance_km, driving_hours, idling_hours, harsh_events_count, speeding_events_count, fatigue_events_count. Also return period totals: reporting_period_start, reporting_period_end, total_distance_km, total_fatigue_events_count, exceptions (list). Copy every count and percentage exactly as the system printed it. Never compute a hit rate from stops yourself and never infer a driver name from a vehicle; use null. If this is not a telematics or driver debrief report, return { "not_this_document": true }.',
    expectedFields: [
      'report_date',
      'depot_name',
      'driver_name',
      'vehicle_registration',
      'route_name',
      'planned_stops',
      'actual_stops',
      'customer_hit_percent',
      'distance_km',
      'driving_hours',
      'idling_hours',
      'harsh_events_count',
      'speeding_events_count',
      'fatigue_events_count',
      'reporting_period_start',
      'reporting_period_end',
      'total_distance_km',
      'total_fatigue_events_count',
      'exceptions',
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  // WASTE
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'waste__contractor_report_safe_disposal_certificate',
    element: 'WASTE',
    name: 'Waste contractor report / safe disposal certificate',
    aliases: [
      'safe disposal certificate',
      'certificate of safe disposal',
      'waste manifest',
      'waste transfer note',
      'waste contractor report',
      'Oricol Environmental',
      'EnviroServ',
      'Interwaste',
      'Averda',
      'Don t Waste',
      'Wasteplan',
      'Cority waste',
      'diversion rate',
      'tonnes to landfill',
      'recycling report',
      'hazardous waste manifest',
      'waste management licence',
    ],
    auditorTests:
      'Substantiates the diversion rate and the landfill tonnage that drives the waste emission factor. The assurance provider: (1) agrees tonnes recycled and tonnes landfilled to the contractor report rather than to an internal estimate; (2) confirms recycled plus landfilled equals total collected, and that the diversion percentage is calculated on that basis; (3) confirms hazardous streams are manifested to a licensed facility and the licence number is quoted; (4) confirms the depot and period, since contractor reports frequently aggregate several sites.',
    exampleData:
      'Oricol Environmental monthly report, CPT depot, March 2026. Commercial/industrial landfill 2,000 kg; commercial/industrial recycled 6,580 kg; paper and cardboard K4 1,100 kg; LDPE shrinkwrap 880 kg. Total 22,470 kg, recycled 20,470 kg, landfilled 2,000 kg, diversion 91.1%. Safe disposal certificate SDC-2026-03-1147, facility Vissershok landfill, licence 12/9/11/L1157/1.',
    extractionPrompt:
      'You are extracting waste evidence from a contractor report or safe disposal certificate. Read the attached document and return JSON with: waste_contractor_name, site_name, reporting_period_start, reporting_period_end, waste_total_kg, waste_recycled_kg, waste_landfill_kg, waste_diversion_percent, hazardous_waste_kg, disposal_facility_name, disposal_permit_number, safe_disposal_certificate_number, and a streams array where each row has waste_stream_type, waste_total_kg, waste_recycled_kg, waste_landfill_kg. Copy masses in the unit printed and record that unit in waste_mass_unit — never convert kilograms to tonnes or the reverse. Never derive a diversion percentage the report does not print. Use null where the report is silent. If this is not a waste contractor report, manifest or disposal certificate, return { "not_this_document": true }.',
    expectedFields: [
      'waste_contractor_name',
      'site_name',
      'reporting_period_start',
      'reporting_period_end',
      'waste_stream_type',
      'waste_total_kg',
      'waste_recycled_kg',
      'waste_landfill_kg',
      'waste_diversion_percent',
      'waste_mass_unit',
      'hazardous_waste_kg',
      'disposal_facility_name',
      'disposal_permit_number',
      'safe_disposal_certificate_number',
      'exceptions',
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  // WATER
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'water__municipal_water_bill',
    element: 'WATER',
    name: 'Municipal water bill / water and sanitation account',
    aliases: [
      'municipal water account',
      'water and sanitation',
      'water invoice',
      'kilolitres consumed',
      'water meter reading',
      'sewerage charge',
      'sanitation charge',
      'Rand Water',
      'Umgeni Water',
      'Johannesburg Water',
      'water consumption statement',
      'borehole abstraction',
    ],
    auditorTests:
      'Substantiates water withdrawal, which feeds the Scope 3 water emission line. The assurance provider: (1) agrees kL on the account to the kL captured for that depot and month; (2) confirms the consumption charge is separated from the fixed availability and sanitation charges; (3) rejects estimated readings where an actual reading exists; (4) confirms alternative sources (borehole, harvested rainwater, tanker deliveries) are captured separately and not merged into the municipal figure.',
    exampleData:
      'City of Cape Town account 3009884120, site CPT depot, 01 Feb 2026 to 28 Feb 2026, meter A14-772301, previous 8,412 kL, current 8,489 kL, actual reading, 77 kL consumed, R2,918.40 excl VAT, sanitation 61.6 kL charged.',
    extractionPrompt:
      'You are extracting water withdrawal evidence from a South African municipal account. Read the attached statement and return JSON with: site_name, utility_account_number, municipality_or_supplier_name, billing_period_start, billing_period_end, water_kl, water_rand_excl_vat, water_meter_number, water_meter_reading_previous, water_meter_reading_current, reading_type (actual or estimated), sanitation_kl, borehole_or_alternative_source_kl, exceptions (list). Copy the kilolitre figures exactly as printed and keep the consumption quantity separate from the sanitation quantity — never add them. Never infer a reading, never annualise, and never carry an electricity figure into a water field on a combined account; use null where the account is silent. If this is not a water or water-and-sanitation account, return { "not_this_document": true }.',
    expectedFields: [
      'site_name',
      'utility_account_number',
      'municipality_or_supplier_name',
      'billing_period_start',
      'billing_period_end',
      'water_kl',
      'water_rand_excl_vat',
      'water_meter_number',
      'water_meter_reading_previous',
      'water_meter_reading_current',
      'reading_type',
      'sanitation_kl',
      'borehole_or_alternative_source_kl',
      'exceptions',
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  // ISO_ENVIRONMENTAL
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'iso_environmental__iso14001_certificate',
    element: 'ISO_ENVIRONMENTAL',
    name: 'ISO 14001 environmental management system certificate',
    aliases: [
      'ISO 14001',
      'ISO 14001:2015',
      'environmental management system certificate',
      'certificate of registration environmental',
      'EMS certificate',
      'SANAS accredited certification body',
      'TUV Rheinland',
      'DEKRA Certification',
      'SGS South Africa',
      'BSI Group certificate',
      'surveillance audit',
      'scope of certification',
    ],
    auditorTests:
      'Confirms the EMS is certified, still valid, and covers the sites being reported. The assurance provider: (1) confirms the certificate has not expired at the measurement date; (2) reads the scope statement and confirms it covers the operations and the depots being claimed, not one pilot site; (3) confirms the certification body is accredited (SANAS or an IAF signatory) rather than a self-issued mark; (4) treats "certification in progress" as not certified and records the stage reached.',
    exampleData:
      'ISO 14001:2015 certificate 14001-2024-0417, issued by DEKRA Certification (SANAS accredited), issued 03 Sep 2024, expires 02 Sep 2027, last surveillance audit 11 Aug 2025. Scope: warehousing and road distribution of consumer goods. Sites: ISANDO, DBN, CPT, BLOEM, PE.',
    extractionPrompt:
      'You are extracting ISO 14001 certification status. Read the attached certificate and return JSON with: iso14001_certificate_number, iso14001_status (certified, in_progress, lapsed, or not_certified — choose only what the document proves), iso14001_certification_body, iso14001_standard_version, iso14001_scope_statement (copied verbatim), iso14001_sites_covered (list exactly as listed on the certificate), iso14001_issue_date, iso14001_expiry_date, iso14001_last_surveillance_audit_date, accreditation_mark, exceptions (list). Copy the certificate number character for character. Never treat a stage-1 audit report, a gap analysis or a quotation as certification — those are in_progress. Never infer coverage of a site the certificate does not name; use null. If this is not an ISO 14001 certificate or certification correspondence, return { "not_this_document": true }.',
    expectedFields: [
      'iso14001_certificate_number',
      'iso14001_status',
      'iso14001_certification_body',
      'iso14001_standard_version',
      'iso14001_scope_statement',
      'iso14001_sites_covered',
      'iso14001_issue_date',
      'iso14001_expiry_date',
      'iso14001_last_surveillance_audit_date',
      'accreditation_mark',
      'exceptions',
    ],
  },
  {
    id: 'iso_environmental__environmental_policy',
    element: 'ISO_ENVIRONMENTAL',
    name: 'Environmental policy (board approved)',
    aliases: [
      'environmental policy',
      'environmental management policy',
      'sustainability policy',
      'climate policy',
      'environmental commitment statement',
      'board-approved environmental policy',
      'policy approved by the board',
      'continual improvement environmental',
    ],
    auditorTests:
      'ISO 14001 clause 5.2 requires a documented policy authorised at the top of the organisation. The assurance provider: (1) confirms a dated board or executive approval and a named signatory with authority; (2) confirms the policy commits to legal compliance, pollution prevention and continual improvement; (3) records whether an explicit net-zero or GHG-reduction commitment appears, because a policy that omits it scores differently; (4) confirms the version is current and a review frequency is stated.',
    exampleData:
      'Environmental Policy Rev 2, approved by the Executive Committee 30 Jan 2023, signed P. Mountford (Chief Executive Officer), effective 01 Feb 2023, reviewed every two years. Commits to GHG quantification and reduction, energy efficiency, water reduction, waste minimisation, biodiversity and noise. No explicit net-zero year stated.',
    extractionPrompt:
      'You are extracting an environmental policy for ISO 14001 clause 5.2 and King V purposes. Read the attached policy and return JSON with: policy_title, policy_version, board_approval_date, policy_effective_date, signatory_name, signatory_role, review_frequency, and booleans for each commitment actually present in the text: net_zero_commitment_present, ghg_reduction_commitment_present, energy_commitment_present, water_commitment_present, waste_commitment_present, biodiversity_commitment_present, legal_compliance_commitment_present, continual_improvement_commitment_present. Also return commitment_quotes (short verbatim extracts supporting each true flag) and exceptions (list). Mark a commitment true only where the policy states it — a general aspiration to be responsible is not a net-zero commitment. Never infer an approval date from a document date; use null. If this is not an environmental or sustainability policy, return { "not_this_document": true }.',
    expectedFields: [
      'policy_title',
      'policy_version',
      'board_approval_date',
      'policy_effective_date',
      'signatory_name',
      'signatory_role',
      'review_frequency',
      'net_zero_commitment_present',
      'ghg_reduction_commitment_present',
      'energy_commitment_present',
      'water_commitment_present',
      'waste_commitment_present',
      'biodiversity_commitment_present',
      'legal_compliance_commitment_present',
      'continual_improvement_commitment_present',
      'commitment_quotes',
      'exceptions',
    ],
  },
  {
    id: 'iso_environmental__aspects_and_impacts_register',
    element: 'ISO_ENVIRONMENTAL',
    name: 'Environmental aspects and impacts register',
    aliases: [
      'aspects and impacts register',
      'environmental aspects register',
      'significant environmental aspects',
      'aspect impact assessment',
      'environmental risk assessment register',
      'significance rating',
      'clause 6.1.2',
    ],
    auditorTests:
      'ISO 14001 clause 6.1.2 requires aspects to be identified and significance determined against documented criteria. The assurance provider: (1) confirms the register covers all sites and activities in the EMS scope; (2) confirms significance is scored against stated criteria rather than asserted; (3) confirms each significant aspect has an operational control and a named owner; (4) confirms the dominant emission source appears — for a distribution business, an aspects register with no vehicle emissions aspect is incomplete on its face.',
    exampleData:
      'Aspects and impacts register v3, reviewed 18 Mar 2026, 42 aspects across 5 depots, 9 rated significant. Example: activity "road distribution", aspect "diesel combustion emissions from heavy vehicles", impact "atmospheric emissions and climate change", severity 5, likelihood 5, significance 25, significant yes, control "route optimisation and eco-driving programme", owner SHEQ Manager.',
    extractionPrompt:
      'You are extracting an ISO 14001 aspects and impacts register. Read the attached register and return JSON with: register_version, register_last_review_date, sites_covered, significance_criteria (copied verbatim), total_aspects_count, significant_aspects_count, and an aspects array where each row has: activity_or_process, aspect_description, associated_impact, significance_rating, is_significant_aspect, control_measure, responsible_owner. Also return exceptions (list). Copy ratings exactly as scored and never re-rank an aspect. Ignore legend, scoring-key and dropdown-option rows — those are template vocabulary, not aspects. If this is not an aspects and impacts register, return { "not_this_document": true }.',
    expectedFields: [
      'register_version',
      'register_last_review_date',
      'sites_covered',
      'significance_criteria',
      'total_aspects_count',
      'significant_aspects_count',
      'activity_or_process',
      'aspect_description',
      'associated_impact',
      'significance_rating',
      'is_significant_aspect',
      'control_measure',
      'responsible_owner',
      'exceptions',
    ],
  },
  {
    id: 'iso_environmental__environmental_legal_register',
    element: 'ISO_ENVIRONMENTAL',
    name: 'Environmental legal register (NEMA / NWA / NEMWA / AQA)',
    aliases: [
      'legal compliance register',
      'environmental legal register',
      'National Environmental Management Act',
      'National Water Act',
      'National Environmental Management Waste Act',
      'Air Quality Act',
      'atmospheric emission licence',
      'water use licence',
      'waste management licence',
      'environmental authorisation',
      'NEMWA licence',
      'section 24 environmental authorisation',
      'compliance obligation register',
    ],
    auditorTests:
      'ISO 14001 clause 6.1.3 requires compliance obligations to be identified and kept current. The assurance provider: (1) confirms the register names the applicable statutes and the specific sections, not just the Act titles; (2) confirms every permit or licence held is listed with number, issuing authority and expiry, and that none has lapsed; (3) confirms the register has been reviewed within the stated frequency; (4) traces any non-compliance recorded in the register to the penalties disclosure.',
    exampleData:
      'Legal register v6, reviewed 31 Mar 2026. Entries include NEMA s28 duty of care (compliant), NEMWA s16 waste holder duty (compliant), National Water Act s21 water use (general authorisation, no licence required), Air Quality Act listed activity (not applicable). Permits: waste management licence 12/9/11/L1157/1 issued by Western Cape DEADP, expires 14 Jun 2028. Non-compliances open: 0.',
    extractionPrompt:
      'You are extracting an environmental legal or compliance obligations register. Read the attached register and return JSON with: register_version, register_last_review_date, review_frequency, non_compliance_count, and an obligations array where each row has: legislation_name, legislation_section, applicable_requirement, compliance_status, permit_or_licence_number, permit_issue_date, permit_expiry_date, issuing_authority, responsible_owner. Also return exceptions (list). Copy statute names, section numbers and licence numbers exactly as written. Never mark an obligation compliant where the register leaves the status blank, and never infer a permit expiry; use null. If this is not a legal or compliance obligations register, return { "not_this_document": true }.',
    expectedFields: [
      'register_version',
      'register_last_review_date',
      'review_frequency',
      'non_compliance_count',
      'legislation_name',
      'legislation_section',
      'applicable_requirement',
      'compliance_status',
      'permit_or_licence_number',
      'permit_issue_date',
      'permit_expiry_date',
      'issuing_authority',
      'responsible_owner',
      'exceptions',
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  // EMPLOYMENT_EQUITY
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'employment_equity__eea2_eea4_report',
    element: 'EMPLOYMENT_EQUITY',
    name: 'Employment Equity report (EEA2 / EEA4)',
    aliases: [
      'EEA2 report',
      'EEA4 income differential',
      'employment equity report',
      'Department of Employment and Labour',
      'workforce profile',
      'occupational level',
      'Top Management',
      'Senior Management',
      'Professionally qualified',
      'Skilled technical',
      'Semi-skilled',
      'designated groups',
      'EE Online submission',
      'employment equity submission receipt',
    ],
    auditorTests:
      'The EEA2 is the authoritative workforce profile and the only source that carries occupational level, race and gender in one table. The assurance provider: (1) confirms the report is the submitted version with a Department of Employment and Labour acknowledgement, not a working draft; (2) agrees the grand total to payroll headcount at the same date; (3) confirms each occupational level row sums to the stated level total and that the level totals sum to the grand total; (4) confirms foreign nationals and non-permanent employees are shown separately, since they are treated differently in the scoring.',
    exampleData:
      'EEA2 for 01 Sep 2025 to 31 Aug 2026, submitted 12 Jan 2026, reference EE2026/0114/778. Top Management: African male 1, Coloured male 0, Indian male 1, White male 4, African female 0, Coloured female 0, Indian female 0, White female 1 — total 7. Grand total all levels 426, of whom disabled 4, non-permanent 38.',
    extractionPrompt:
      'You are extracting an EEA2 or EEA4 employment equity return. Read the attached report and return JSON with: entity_name, ee_reporting_period_start, ee_reporting_period_end, ee_submission_date, ee_submission_reference, headcount_total_all_levels, headcount_disabled_total, non_permanent_headcount, and a levels array with one row per occupational level, each carrying: occupational_level, headcount_african_male, headcount_coloured_male, headcount_indian_male, headcount_white_male, headcount_african_female, headcount_coloured_female, headcount_indian_female, headcount_white_female, headcount_foreign_male, headcount_foreign_female, headcount_disabled, headcount_level_total. Also return exceptions (list). Copy each cell exactly as printed, including zeros — a zero is data, an empty cell is null. Use the occupational level names exactly as the form prints them. Never total a row yourself and never redistribute a figure between levels. Ignore the form instructions, category legends and dropdown lists. If this is not an employment equity return, return { "not_this_document": true }.',
    expectedFields: [
      'entity_name',
      'ee_reporting_period_start',
      'ee_reporting_period_end',
      'ee_submission_date',
      'ee_submission_reference',
      'occupational_level',
      'headcount_african_male',
      'headcount_coloured_male',
      'headcount_indian_male',
      'headcount_white_male',
      'headcount_african_female',
      'headcount_coloured_female',
      'headcount_indian_female',
      'headcount_white_female',
      'headcount_foreign_male',
      'headcount_foreign_female',
      'headcount_disabled',
      'headcount_level_total',
      'headcount_total_all_levels',
      'headcount_disabled_total',
      'non_permanent_headcount',
      'exceptions',
    ],
  },
  {
    id: 'employment_equity__ee_plan_and_forum_minutes',
    element: 'EMPLOYMENT_EQUITY',
    name: 'Employment Equity plan and EE consultative forum minutes',
    aliases: [
      'employment equity plan',
      'EE plan',
      'employment equity forum',
      'EE consultative committee minutes',
      'numerical targets',
      'barriers to employment equity',
      'affirmative action measures',
      'Employment Equity Act section 20',
      'EE analysis report',
      'EEA13',
    ],
    auditorTests:
      'Employment Equity Act sections 16, 19 and 20 require consultation, an analysis, and a plan with numerical goals. The assurance provider: (1) confirms the plan has a start and end date and has not expired; (2) confirms numerical targets are stated per occupational level rather than as a single company figure; (3) confirms the forum met and that minutes show consultation before the plan was finalised; (4) confirms the barriers analysis and the affirmative measures address the gaps the analysis found.',
    exampleData:
      'EE Plan 01 Sep 2024 to 31 Aug 2029, submitted to the Department of Employment and Labour 12 Jan 2026. EE Forum constituted 14 Mar 2024, met 4 times (18 Apr 2025, 17 Jul 2025, 16 Oct 2025, 22 Jan 2026). Targets: 60% Black overall, 30% Black female, 2% employees with disabilities. Barriers analysis completed 02 Feb 2024. EE Manager: T. Ndlovu.',
    extractionPrompt:
      'You are extracting an Employment Equity plan and its consultation evidence. Read the attached plan or forum minutes and return JSON with: ee_plan_start_date, ee_plan_end_date, ee_plan_submitted_to_doel, ee_plan_submission_date, ee_forum_established, ee_forum_meeting_dates (list), ee_forum_consulted, numerical_targets_set, target_black_percent, target_black_female_percent, target_disability_percent, barriers_analysis_done, affirmative_measures_implemented, ee_monitoring_and_reporting, ee_manager_assigned_name, exceptions (list). For each yes/no field return exactly Yes, No or Partial based on what the document evidences — Partial where the plan states an intention but shows no completed action. Copy targets and dates verbatim; never infer a target from a national demographic table. If this is not an EE plan or EE forum record, return { "not_this_document": true }.',
    expectedFields: [
      'ee_plan_start_date',
      'ee_plan_end_date',
      'ee_plan_submitted_to_doel',
      'ee_plan_submission_date',
      'ee_forum_established',
      'ee_forum_meeting_dates',
      'ee_forum_consulted',
      'numerical_targets_set',
      'target_black_percent',
      'target_black_female_percent',
      'target_disability_percent',
      'barriers_analysis_done',
      'affirmative_measures_implemented',
      'ee_monitoring_and_reporting',
      'ee_manager_assigned_name',
      'exceptions',
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  // HEALTH_SAFETY
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'health_safety__iso45001_certificate',
    element: 'HEALTH_SAFETY',
    name: 'ISO 45001 occupational health and safety certificate',
    aliases: [
      'ISO 45001',
      'ISO 45001:2018',
      'occupational health and safety management system certificate',
      'OHSAS 18001',
      'OH&S management system certificate',
      'safety management system certificate',
      'certificate of registration occupational health',
    ],
    auditorTests:
      'Confirms the OHS management system is certified, current and scoped to the operations being reported. The assurance provider: (1) confirms validity at the measurement date; (2) reads the scope and confirms it covers the depots and the driving operation, not head office alone; (3) confirms the certification body is accredited; (4) treats a stage-1 report or a readiness assessment as in progress rather than certified.',
    exampleData:
      'ISO 45001:2018 certificate 45001-2025-0092, issued by SGS South Africa (SANAS accredited), issued 21 Feb 2025, expires 20 Feb 2028, first surveillance audit due Feb 2026. Scope: road distribution and warehousing operations, all depots.',
    extractionPrompt:
      'You are extracting ISO 45001 certification status. Read the attached certificate and return JSON with: iso45001_certificate_number, iso45001_status (certified, in_progress, lapsed, or not_certified — only what the document proves), iso45001_certification_body, iso45001_standard_version, iso45001_scope_statement (verbatim), iso45001_sites_covered (as listed), iso45001_issue_date, iso45001_expiry_date, iso45001_last_surveillance_audit_date, accreditation_mark, exceptions (list). Copy the certificate number character for character. Never read an OHSAS 18001 certificate as ISO 45001 — record the standard actually named. Never infer coverage of a site the certificate does not name; use null. If this is not an occupational health and safety certification document, return { "not_this_document": true }.',
    expectedFields: [
      'iso45001_certificate_number',
      'iso45001_status',
      'iso45001_certification_body',
      'iso45001_standard_version',
      'iso45001_scope_statement',
      'iso45001_sites_covered',
      'iso45001_issue_date',
      'iso45001_expiry_date',
      'iso45001_last_surveillance_audit_date',
      'accreditation_mark',
      'exceptions',
    ],
  },
  {
    id: 'health_safety__injury_statistics_report',
    element: 'HEALTH_SAFETY',
    name: 'OHS injury statistics report (LTIFR / incident register)',
    aliases: [
      'injury statistics',
      'lost time injury frequency rate',
      'disabling injury frequency rate',
      'safety performance report',
      'SHE incidents register',
      'incident register',
      'near miss report',
      'lost time injuries',
      'medical treatment injury',
      'first aid case',
      'recordable injuries',
      'hours worked',
      'COIDA report',
      'W.Cl.2 accident report',
      'section 24 reportable incident',
    ],
    auditorTests:
      'LTIFR is meaningless without the exposure hours behind it, and the rate basis differs by convention. The assurance provider: (1) confirms hours worked are actual exposure hours, not headcount multiplied by a nominal year; (2) confirms the rate basis (per 200,000 or per 1,000,000 hours) is stated and used consistently; (3) reconciles the injury counts to the underlying incident register line by line; (4) confirms every fatality and section 24 reportable incident is disclosed and reported to the Department of Employment and Labour.',
    exampleData:
      'Accidently safety report, FY2025/26 year to date, all depots. Employees 426, hours worked 812,340, fatalities 0, lost time injuries 4 (W. Arends, N. Mkhize, J. Sebeko, T. Matumba), medical treatment injuries 3, first aid cases 0, near misses 1, vehicle accidents 8, driver fatigue incidents 2. LTIFR 0.98 per 200,000 hours, TRIFR 1.72. Days lost 61.',
    extractionPrompt:
      'You are extracting occupational health and safety performance data. Read the attached injury statistics report or incident register and return JSON with: reporting_period_start, reporting_period_end, site_name, employees_headcount_for_ltifr, hours_worked, fatalities_count, lost_time_injuries_count, medical_treatment_injuries_count, first_aid_cases_count, near_miss_count, vehicle_accidents_count, driver_fatigue_incidents_count, days_lost_count, dol_section24_reportable_count, ltifr, trifr, ltifr_rate_basis (for example per 200,000 hours), exceptions (list). Copy each count and each rate exactly as reported and record the rate basis the report states. Never calculate LTIFR yourself, never convert between rate bases, and never treat a near miss as an injury; use null where a figure is absent. Where the report is split by quarter, return a periods array with the same fields per quarter alongside the year-to-date totals. If this is not a health and safety performance or incident document, return { "not_this_document": true }.',
    expectedFields: [
      'reporting_period_start',
      'reporting_period_end',
      'site_name',
      'employees_headcount_for_ltifr',
      'hours_worked',
      'fatalities_count',
      'lost_time_injuries_count',
      'medical_treatment_injuries_count',
      'first_aid_cases_count',
      'near_miss_count',
      'vehicle_accidents_count',
      'driver_fatigue_incidents_count',
      'days_lost_count',
      'dol_section24_reportable_count',
      'ltifr',
      'trifr',
      'ltifr_rate_basis',
      'exceptions',
    ],
  },
  {
    id: 'health_safety__training_and_induction_register',
    element: 'HEALTH_SAFETY',
    name: 'Health and safety induction, training and appointments register',
    aliases: [
      'health and safety induction register',
      'safety training register',
      'toolbox talk attendance',
      'SHE induction record',
      'first aider certificate',
      'safety representative appointment',
      'section 16(2) appointment',
      'section 17 appointment',
      'safety committee minutes',
      'OHS Act appointment letter',
      'hazard identification and risk assessment',
    ],
    auditorTests:
      'The OHS Act requires named appointments, elected representatives and functioning committees; ISO 45001 clause 5.4 requires worker consultation. The assurance provider: (1) confirms appointment letters are signed, dated and accepted by the appointee; (2) confirms safety representatives are elected at the ratio the Act requires for the headcount; (3) confirms committee minutes show the required meeting frequency; (4) agrees induction coverage to headcount, since a percentage without a denominator cannot be tested.',
    exampleData:
      'FY2025/26 year to date: 1,412 H&S training hours delivered, 402 of 426 employees inducted (94.4%). Safety committee met 11 times. 9 safety representatives appointed under section 17, 14 certified first aiders. Section 16(2) appointment signed 04 Aug 2025 (C. Brown, accepted 04 Aug 2025).',
    extractionPrompt:
      'You are extracting health and safety training, consultation and statutory appointment evidence. Read the attached register, minutes or appointment letters and return JSON with: reporting_period_start, reporting_period_end, site_name, hs_training_hours, employees_inducted_count, employees_total_count, hs_induction_percent, safety_committee_meetings_count, safety_committee_meeting_dates (list), safety_representatives_appointed_count, first_aiders_certified_count, ohs_appointment_letters_present, appointment_holder_name, appointment_section, appointment_date, hira_register_present, exceptions (list). Copy hours, counts and dates verbatim. Never derive an induction percentage the document does not print, and never treat an unsigned draft appointment as an appointment. If this is not a health and safety training, committee or appointment record, return { "not_this_document": true }.',
    expectedFields: [
      'reporting_period_start',
      'reporting_period_end',
      'site_name',
      'hs_training_hours',
      'employees_inducted_count',
      'employees_total_count',
      'hs_induction_percent',
      'safety_committee_meetings_count',
      'safety_committee_meeting_dates',
      'safety_representatives_appointed_count',
      'first_aiders_certified_count',
      'ohs_appointment_letters_present',
      'appointment_holder_name',
      'appointment_section',
      'appointment_date',
      'hira_register_present',
      'exceptions',
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  // TRAINING
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'training__wsp_atr_skills_report',
    element: 'TRAINING',
    name: 'Workplace Skills Plan / Annual Training Report (WSP-ATR)',
    aliases: [
      'Workplace Skills Plan',
      'Annual Training Report',
      'WSP ATR submission',
      'SETA submission receipt',
      'mandatory grant',
      'discretionary grant',
      'skills development facilitator',
      'pivotal training report',
      'TETA submission',
      'Services SETA',
      'merSETA',
      'W&RSETA',
      'Wholesale and Retail SETA',
      'SETA approval letter',
    ],
    auditorTests:
      'Training claimed but never reported to the SETA cannot be relied on. The assurance provider: (1) confirms the WSP was approved, not merely submitted, and that the ATR reports the same period; (2) agrees training spend and hours in the ATR to the internal training records; (3) confirms the submission was inside the SETA deadline, since a late submission forfeits the mandatory grant; (4) confirms the training spend percentage is calculated on leviable payroll and not on total payroll.',
    exampleData:
      'TETA WSP/ATR for 01 Apr 2025 to 31 Mar 2026, submitted 28 Apr 2026, reference TETA/WSP/2026/11842, approved 12 Jun 2026. Mandatory grant claimed R20,663.88, discretionary grant applied R450,000. Training spend R612,400, 4,180 hours, 318 of 426 employees trained (74.6%), of whom Black 81%, female 34%, youth 42%, employees with disabilities 1%. SDF: M. Prinsloo.',
    extractionPrompt:
      'You are extracting a Workplace Skills Plan or Annual Training Report submission. Read the attached document and return JSON with: seta_name, wsp_atr_period_start, wsp_atr_period_end, wsp_submitted, wsp_submission_date, wsp_approval_date, atr_submitted, atr_submission_date, seta_submission_reference, mandatory_grant_claimed_rand, discretionary_grant_applied_rand, training_spend_rand, training_hours_total, employees_trained_count, employees_trained_percent, black_employees_trained_percent, female_employees_trained_percent, youth_trained_percent, disabled_employees_trained_percent, skills_development_facilitator_name, exceptions (list). For wsp_submitted and atr_submitted return exactly Yes, No or Partial. Copy rands, hours and percentages exactly as stated; never convert a headcount into a percentage or a percentage into a headcount. If this is not a WSP, ATR or SETA submission document, return { "not_this_document": true }.',
    expectedFields: [
      'seta_name',
      'wsp_atr_period_start',
      'wsp_atr_period_end',
      'wsp_submitted',
      'wsp_submission_date',
      'wsp_approval_date',
      'atr_submitted',
      'atr_submission_date',
      'seta_submission_reference',
      'mandatory_grant_claimed_rand',
      'discretionary_grant_applied_rand',
      'training_spend_rand',
      'training_hours_total',
      'employees_trained_count',
      'employees_trained_percent',
      'black_employees_trained_percent',
      'female_employees_trained_percent',
      'youth_trained_percent',
      'disabled_employees_trained_percent',
      'skills_development_facilitator_name',
      'exceptions',
    ],
  },
  {
    id: 'training__sdl_payroll_certificate',
    element: 'TRAINING',
    name: 'SDL / payroll certificate (EMP201, EMP501)',
    aliases: [
      'EMP201',
      'EMP501',
      'PAYE reconciliation',
      'skills development levy',
      'SDL certificate',
      'SARS statement of account',
      'leviable amount',
      'payroll certificate',
      'monthly employer declaration',
      'employer reconciliation declaration',
    ],
    auditorTests:
      'The leviable amount is the denominator for training spend, so an error here moves every skills ratio. The assurance provider: (1) agrees the leviable amount on the EMP501 to the payroll records; (2) confirms SDL paid equals 1% of the leviable amount, investigating any difference; (3) confirms all twelve EMP201 periods in the year are present and that the reconciliation covers the same year; (4) confirms the SDL reference number belongs to the measured entity and not to a group payroll company.',
    exampleData:
      'EMP501 reconciliation for 01 Mar 2025 to 28 Feb 2026, SDL reference L370114882. Leviable amount R10,331,940.87, SDL paid R103,319.41, PAYE R2,880,412.06, UIF R201,338.60, 426 employees on payroll at year end.',
    extractionPrompt:
      'You are extracting the payroll and skills development levy base. Read the attached EMP201, EMP501 or payroll certificate and return JSON with: entity_name, sdl_reference_number, paye_reference_number, payroll_period_start, payroll_period_end, leviable_payroll_rand, sdl_levy_paid_rand, paye_paid_rand, uif_paid_rand, employees_on_payroll_count, exceptions (list). Copy the leviable amount exactly as declared — never substitute total payroll, total cost to company or a gross remuneration figure for it, and never derive the levy from the payroll or the payroll from the levy. Where the document is a single month, return that month and say so in the period fields rather than annualising. If this is not a SARS payroll declaration or payroll certificate, return { "not_this_document": true }.',
    expectedFields: [
      'entity_name',
      'sdl_reference_number',
      'paye_reference_number',
      'payroll_period_start',
      'payroll_period_end',
      'leviable_payroll_rand',
      'sdl_levy_paid_rand',
      'paye_paid_rand',
      'uif_paid_rand',
      'employees_on_payroll_count',
      'exceptions',
    ],
  },
  {
    id: 'training__ofo_intervention_register',
    element: 'TRAINING',
    name: 'Training intervention register (OFO coded)',
    aliases: [
      'OFO code',
      'organising framework for occupations',
      'training intervention schedule',
      'learnership register',
      'learner attendance register',
      'certificate of competence',
      'unit standard',
      'NQF level',
      'training matrix',
      'accredited training provider',
      'statement of results',
    ],
    auditorTests:
      'Every intervention claimed must trace to a learner, a provider and an occupation code. The assurance provider: (1) confirms each intervention carries a valid OFO code matching the occupation trained; (2) confirms the provider is accredited by the relevant SETA or QCTO where accreditation is claimed; (3) agrees learner counts to attendance registers and completion certificates; (4) confirms the intervention dates fall inside the measurement period.',
    exampleData:
      'Training register FY2025/26. OFO 911101 Heavy Motor Vehicle Drivers, "Professional Driving and Dangerous Goods refresher", 34 learners, provider Fleet Skills Academy (TETA accredited, TETA/PROV/0918), NQF 3, 14 Aug 2025 to 22 Aug 2025, completed, R168,300. OFO 334101 SHEQ Officers, "SAMTRAC", 3 learners, NOSA, NQF 5, completed.',
    extractionPrompt:
      'You are extracting a training intervention register. Read the attached register and return JSON with an interventions array where each row has: ofo_code, occupation_title, programme_name, programme_category, learners_count, learner_name, training_provider_name, is_accredited_provider, seta_name, nqf_level, training_start_date, training_end_date, training_duration, training_status, training_cost_rand. Also return reporting_period_start, reporting_period_end, interventions_total_count, learners_total_count, exceptions (list). Copy OFO codes as six-digit strings exactly as written and copy programme names verbatim. Ignore any OFO reference list, dropdown catalogue or occupation legend — those are template vocabulary, not interventions. Where a continuation row carries only a date or a cost, attach it to the last row that named the programme. If this is not a training register, return { "not_this_document": true }.',
    expectedFields: [
      'ofo_code',
      'occupation_title',
      'programme_name',
      'programme_category',
      'learners_count',
      'learner_name',
      'training_provider_name',
      'is_accredited_provider',
      'seta_name',
      'nqf_level',
      'training_start_date',
      'training_end_date',
      'training_duration',
      'training_status',
      'training_cost_rand',
      'reporting_period_start',
      'reporting_period_end',
      'interventions_total_count',
      'learners_total_count',
      'exceptions',
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  // COMMUNITY_CSI
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'community_csi__csi_sed_spend_records',
    element: 'COMMUNITY_CSI',
    name: 'CSI / SED spend records',
    aliases: [
      'corporate social investment',
      'socio-economic development',
      'CSI report',
      'SED contribution schedule',
      'community investment register',
      'donation schedule',
      'beneficiary spend',
      'social calendar',
      'Mandela Day',
      'CSI budget',
      'community engagement report',
    ],
    auditorTests:
      'Confirms the contribution actually left the business and reached a qualifying beneficiary. The assurance provider: (1) traces each contribution to a payment in the general ledger or bank statement; (2) confirms the beneficiary qualifies and that black beneficiaries are at least the required share; (3) values in-kind and time contributions at cost rather than at retail or notional value; (4) confirms the total against the 1% of NPAT target using the NPAT from the annual financial statements.',
    exampleData:
      'CSI register FY2025/26: Mandela Day (Jul-25) R48,000, beneficiary Jicama 89 (education), 240 beneficiaries reached; CHOC Foundation (ongoing) R120,000 (health); SA Guide Dog Association (ongoing) R60,000; Blanket Drive (May-26) R31,500 in-kind at cost. 10 initiatives, total CSI/SED spend R612,800, 100% black beneficiaries.',
    extractionPrompt:
      'You are extracting corporate social investment and socio-economic development spend. Read the attached register, schedule or report and return JSON with an initiatives array where each row has: initiative_name, initiative_month, beneficiary_name, beneficiary_type, csi_spend_rand, csi_contribution_type (cash, in-kind, time, or other as stated), csi_category, beneficiaries_reached_count, black_beneficiary_percent. Also return reporting_period_start, reporting_period_end, initiative_count, csi_total_spend_rand, csi_spend_percent_of_npat, exceptions (list). Copy amounts exactly as recorded and keep in-kind contributions in their own rows with the contribution type stated. Never value an in-kind item yourself, never merge budget with actual spend, and never infer a beneficiary demographic; use null. If this is not a CSI, SED or community investment record, return { "not_this_document": true }.',
    expectedFields: [
      'initiative_name',
      'initiative_month',
      'beneficiary_name',
      'beneficiary_type',
      'csi_spend_rand',
      'csi_contribution_type',
      'csi_category',
      'beneficiaries_reached_count',
      'black_beneficiary_percent',
      'reporting_period_start',
      'reporting_period_end',
      'initiative_count',
      'csi_total_spend_rand',
      'csi_spend_percent_of_npat',
      'exceptions',
    ],
  },
  {
    id: 'community_csi__beneficiary_confirmation_and_npo_registration',
    element: 'COMMUNITY_CSI',
    name: 'Beneficiary confirmation letter / NPO registration and section 18A receipt',
    aliases: [
      'beneficiary confirmation letter',
      'NPO registration certificate',
      'section 18A receipt',
      'public benefit organisation',
      'PBO reference number',
      'non-profit organisation number',
      'letter of thanks donation',
      'donation acknowledgement',
      'NPC registration certificate',
    ],
    auditorTests:
      'Confirms the beneficiary exists, qualifies, and received what was claimed. The assurance provider: (1) confirms the NPO or PBO number is valid and quoted on the confirmation; (2) confirms the amount on the beneficiary confirmation equals the amount claimed in the CSI register; (3) confirms the confirmation is signed by an office bearer of the beneficiary, not by the donor; (4) confirms the section 18A receipt, where one is claimed, carries the PBO reference and the correct tax year.',
    exampleData:
      'Beneficiary confirmation on CHOC Foundation letterhead, dated 14 Mar 2026, signed by the Regional Manager. NPO 003-967, PBO 930003587. Confirms receipt of R120,000 in cash donations during FY2025/26. Section 18A receipt 18A/2026/00412 attached.',
    extractionPrompt:
      'You are extracting beneficiary confirmation and registration evidence. Read the attached letter, certificate or receipt and return JSON with: beneficiary_name, beneficiary_registration_number, npo_number, pbo_number, section_18a_receipt_number, donation_date, donation_amount_rand, donation_type, beneficiary_confirmation_signed, signatory_name, signatory_role, black_beneficiary_percent, beneficiary_focus_area, exceptions (list). Copy registration numbers exactly, including prefixes and hyphens. Never treat a donor-issued schedule as a beneficiary confirmation, and never infer a registration number from an organisation name; use null. If this is not a beneficiary confirmation, NPO/PBO registration or section 18A receipt, return { "not_this_document": true }.',
    expectedFields: [
      'beneficiary_name',
      'beneficiary_registration_number',
      'npo_number',
      'pbo_number',
      'section_18a_receipt_number',
      'donation_date',
      'donation_amount_rand',
      'donation_type',
      'beneficiary_confirmation_signed',
      'signatory_name',
      'signatory_role',
      'black_beneficiary_percent',
      'beneficiary_focus_area',
      'exceptions',
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  // SUPPLIER_ESG
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'supplier_esg__self_assessment_questionnaire',
    element: 'SUPPLIER_ESG',
    name: 'Supplier ESG self-assessment questionnaire (SAQ)',
    aliases: [
      'supplier ESG questionnaire',
      'self assessment questionnaire',
      'supplier sustainability assessment',
      'vendor ESG survey',
      'EcoVadis assessment',
      'CDP supply chain response',
      'environmental questionnaire supplier',
      'external service provider evaluation',
      'supplier evaluation scorecard',
      'IMS-T-149',
      'supplier audit questionnaire',
      'supplier pre-qualification questionnaire',
    ],
    auditorTests:
      'A self-assessment is a claim, not evidence, so it is tested for corroboration. The assurance provider: (1) confirms the questionnaire was completed by the supplier and is signed and dated; (2) checks that any certification claimed (ISO 14001, ISO 45001) is supported by an attached certificate; (3) confirms the scoring scale is the one the buyer defines and that scores are per criterion rather than a single overall impression; (4) confirms the assessment falls within the review cycle and has not gone stale.',
    exampleData:
      'IMS-T-149-02 external service provider evaluation, Oricol Environmental, completed 18 Feb 2026 by M. Fourie (Operations Manager). On-time delivery 4, quality 4, health and safety 3, environmental 5, food safety not applicable, invoicing 4, backup support 3. Overall 85% (rating B). ISO 14001 certified: yes (certificate attached). B-BBEE level 2.',
    extractionPrompt:
      'You are extracting a supplier ESG self-assessment. Read the attached questionnaire or evaluation and return JSON with: supplier_name, supplier_registration_number, saq_reference, saq_completion_date, saq_respondent_name, saq_respondent_role, supplier_delivery_score, supplier_quality_score, supplier_health_safety_score, supplier_environmental_score, supplier_food_safety_score, supplier_invoicing_score, supplier_backup_support_score, supplier_overall_rating, supplier_environmental_policy_in_place, supplier_iso14001_certified, supplier_iso45001_certified, supplier_ghg_targets_set, supplier_waste_diversion_reported, supplier_bbbee_level, saq_responses (array of question, category, response), exceptions (list). Copy each score exactly as marked, including N/A — do not convert N/A to zero and do not average scores yourself. Record a certification as claimed only if the questionnaire asserts it, and note in exceptions where a claim has no attached certificate. If this is not a supplier assessment questionnaire, return { "not_this_document": true }.',
    expectedFields: [
      'supplier_name',
      'supplier_registration_number',
      'saq_reference',
      'saq_completion_date',
      'saq_respondent_name',
      'saq_respondent_role',
      'supplier_delivery_score',
      'supplier_quality_score',
      'supplier_health_safety_score',
      'supplier_environmental_score',
      'supplier_food_safety_score',
      'supplier_invoicing_score',
      'supplier_backup_support_score',
      'supplier_overall_rating',
      'supplier_environmental_policy_in_place',
      'supplier_iso14001_certified',
      'supplier_iso45001_certified',
      'supplier_ghg_targets_set',
      'supplier_waste_diversion_reported',
      'supplier_bbbee_level',
      'saq_responses',
      'exceptions',
    ],
  },
  {
    id: 'supplier_esg__code_of_conduct_acknowledgement',
    element: 'SUPPLIER_ESG',
    name: 'Supplier code of conduct acknowledgement',
    aliases: [
      'supplier code of conduct',
      'supplier code acknowledgement',
      'vendor code of conduct',
      'business partner code of conduct',
      'ethical sourcing declaration',
      'anti-bribery supplier declaration',
      'modern slavery declaration',
      'supplier declaration signed',
      'responsible sourcing commitment',
    ],
    auditorTests:
      'Confirms the code has been cascaded and accepted, and that the code itself carries the clauses the disclosure claims. The assurance provider: (1) confirms the acknowledgement is signed by someone able to bind the supplier and is dated; (2) confirms the version acknowledged is the current version; (3) reads the code for labour rights, anti-corruption and environmental clauses rather than assuming them; (4) agrees the count of acknowledgements to the count of active suppliers to test coverage.',
    exampleData:
      'Supplier Code of Conduct Rev 2 (30 Jan 2023) acknowledged by Oricol Environmental, signed 22 Feb 2026 by M. Fourie (Operations Manager). Code sections cover legislative compliance (5), human rights and labour (7), health and safety (7), environment and spill response (8). 148 of 212 active suppliers have acknowledged (69.8%).',
    extractionPrompt:
      'You are extracting supplier code of conduct acknowledgement evidence. Read the attached code or signed acknowledgement and return JSON with: supplier_name, code_version, code_acknowledged, acknowledgement_date, signatory_name, signatory_role, labour_rights_clause_present, anti_corruption_clause_present, environmental_clause_present, health_safety_clause_present, suppliers_acknowledged_count, suppliers_total_count, suppliers_acknowledged_percent, exceptions (list). Mark a clause present only where the code text contains it, and quote the clause reference in exceptions if it is ambiguous. Never treat an unsigned copy of the code as an acknowledgement, and never infer coverage counts the document does not state; use null. If this is not a supplier code of conduct or its acknowledgement, return { "not_this_document": true }.',
    expectedFields: [
      'supplier_name',
      'code_version',
      'code_acknowledged',
      'acknowledgement_date',
      'signatory_name',
      'signatory_role',
      'labour_rights_clause_present',
      'anti_corruption_clause_present',
      'environmental_clause_present',
      'health_safety_clause_present',
      'suppliers_acknowledged_count',
      'suppliers_total_count',
      'suppliers_acknowledged_percent',
      'exceptions',
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  // BOARD_GOVERNANCE
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'board_governance__board_charter_and_composition',
    element: 'BOARD_GOVERNANCE',
    name: 'Board charter and board composition schedule',
    aliases: [
      'board charter',
      'board composition',
      'register of directors',
      'board of directors schedule',
      'non-executive director',
      'lead independent director',
      'independent non-executive',
      'director independence classification',
      'board skills matrix',
      'board attendance register',
      'chairman of the board',
      'company secretary appointment',
    ],
    auditorTests:
      'Board composition drives most of the governance score, and independence is routinely overstated. The assurance provider: (1) agrees the director list to the CIPC record and to the annual report; (2) tests each independence classification against the King criteria (tenure, shareholding, related-party relationships) rather than accepting the label; (3) confirms the chair is non-executive and that a lead independent director is appointed where the chair is not independent; (4) agrees meeting counts to the attendance register; (5) records race and gender only as the entity itself has classified them.',
    exampleData:
      'Board of SG Holdings Ltd at 27 May 2026: 7 members — 2 executive (P. Mountford, Chief Executive Officer; C. Brown, Chief Financial Officer) and 5 non-executive, all classified independent (M. Chitalu chair, D. Cathrall lead independent, S. Mehlomakulu, P. Mnisi, K. Phalane). Black directors 3 of 7 (42.9%), female 1 of 7 (14.3%). Board met 4 times. Company secretary J. Mackay. Board charter approved 18 Nov 2021.',
    extractionPrompt:
      'You are extracting board composition and charter evidence. Read the attached charter, board schedule or directors register and return JSON with: board_charter_present, board_charter_approval_date, board_as_at_date, board_members_total, executive_directors_count, non_executive_directors_count, independent_non_executive_directors_count, board_chair_name, board_chair_is_independent, lead_independent_director_name, company_secretary_name, board_meetings_held, board_black_percent, board_female_percent, and a directors array where each row has: director_name, director_role, director_is_independent, director_gender, director_race, director_appointment_date, committee_memberships. Also return exceptions (list). Copy names and dates exactly. Record independence only as the document classifies it, and note in exceptions any classification the document asserts without support. Never infer race or gender from a name — use null where the document does not state it. If this is not a board charter, composition schedule or directors register, return { "not_this_document": true }.',
    expectedFields: [
      'board_charter_present',
      'board_charter_approval_date',
      'board_as_at_date',
      'board_members_total',
      'executive_directors_count',
      'non_executive_directors_count',
      'independent_non_executive_directors_count',
      'board_chair_name',
      'board_chair_is_independent',
      'lead_independent_director_name',
      'company_secretary_name',
      'board_meetings_held',
      'board_black_percent',
      'board_female_percent',
      'director_name',
      'director_role',
      'director_is_independent',
      'director_gender',
      'director_race',
      'director_appointment_date',
      'committee_memberships',
      'exceptions',
    ],
  },
  {
    id: 'board_governance__committee_terms_of_reference_and_minutes',
    element: 'BOARD_GOVERNANCE',
    name: 'Board committee terms of reference and meeting minutes',
    aliases: [
      'audit committee terms of reference',
      'risk committee charter',
      'social and ethics committee',
      'remuneration committee report',
      'nomination committee',
      'committee meeting minutes',
      'committee attendance register',
      'Companies Act section 72',
      'social and ethics committee report',
      'Remco report',
    ],
    auditorTests:
      'Committees must exist in fact, not only on an organogram. The assurance provider: (1) confirms terms of reference are approved and dated for each committee claimed; (2) agrees the number of meetings to dated minutes and an attendance register; (3) confirms the social and ethics committee report was presented at the annual general meeting as the Companies Act requires; (4) reads the remuneration report for an explicit ESG or climate metric in executive incentives, since a general sustainability mention is not an ESG-linked KPI.',
    exampleData:
      'Audit Committee terms of reference approved 18 Nov 2021, chaired by D. Cathrall, 4 meetings held (14 Apr 2025, 11 Jul 2025, 10 Oct 2025, 16 Jan 2026). Risk Committee active, chaired by D. Cathrall. Group Social and Ethics Committee active per CSI/SED Policy section 7. Remuneration Committee active; no ESG metric in the executive short-term incentive scorecard.',
    extractionPrompt:
      'You are extracting board committee evidence. Read the attached terms of reference, minutes or committee report and return JSON with a committees array where each row has: committee_name, committee_terms_of_reference_present, committee_approval_date, committee_chair_name, committee_members (list), committee_meetings_held, committee_meeting_dates (list). Also return the governance flags the document supports: audit_committee_meetings_held, risk_committee_active, social_and_ethics_committee_active, remuneration_committee_active, esg_linked_to_executive_remuneration, esg_remuneration_metrics (list of the actual metrics named), exceptions (list). For each active flag return exactly Yes, No or Partial — Partial where a committee exists but the document evidences no meetings. Copy dates and names verbatim; never infer a meeting that has no minute. If this is not a board committee document, return { "not_this_document": true }.',
    expectedFields: [
      'committee_name',
      'committee_terms_of_reference_present',
      'committee_approval_date',
      'committee_chair_name',
      'committee_members',
      'committee_meetings_held',
      'committee_meeting_dates',
      'audit_committee_meetings_held',
      'risk_committee_active',
      'social_and_ethics_committee_active',
      'remuneration_committee_active',
      'esg_linked_to_executive_remuneration',
      'esg_remuneration_metrics',
      'exceptions',
    ],
  },
  {
    id: 'board_governance__king_application_register',
    element: 'BOARD_GOVERNANCE',
    name: 'King IV / King V application register',
    aliases: [
      'King IV application register',
      'King V application register',
      'apply and explain',
      'King Code disclosure register',
      'King IV principle',
      'governance outcomes register',
      'principle-by-principle application',
      'King IV disclosure',
      'corporate governance register',
    ],
    auditorTests:
      'King is an apply-and-explain code: the register must say how each principle is applied, not merely that it is. The assurance provider: (1) confirms all principles are addressed and none silently omitted; (2) confirms each status is supported by named evidence, treating an unevidenced Applied as at best Partially Applied; (3) confirms the register is dated and refers to the current financial year; (4) confirms the code version, since King IV and King V differ in principle numbering.',
    exampleData:
      'King V application register published 30 Sep 2026 for FY2025/26. Principle 1 Ethical leadership: Applied — Code of Business Standards and Ethics Rev 2 plus Be Heard hotline. Principle 3 Board composition: Explained — composition disclosed, diversity targets not yet set. Principle 10 Risk governance: Partially Applied — ERM in place, climate risk not yet integrated. Totals: 10 Applied, 5 Explained, 2 Partially Applied, 0 Not Applied of 17.',
    extractionPrompt:
      'You are extracting a King IV or King V application register. Read the attached register and return JSON with: king_code_version, king_register_publication_date, king_reporting_period, and a principles array where each row has: king_principle_number, king_principle_name, king_principle_status (Applied, Explained, Partially Applied, or Not Applied — use exactly one of these four), king_principle_evidence (the evidence named, copied verbatim), king_principle_action. Also return king_principles_total, king_principles_applied_count, king_principles_explained_count, king_principles_partially_applied_count, king_principles_not_applied_count, exceptions (list). Never upgrade a status: an entry with no evidence is not Applied. Never invent a principle the register omits — list omissions in exceptions instead. Ignore the status dropdown legend. If this is not a King application or governance disclosure register, return { "not_this_document": true }.',
    expectedFields: [
      'king_code_version',
      'king_register_publication_date',
      'king_reporting_period',
      'king_principle_number',
      'king_principle_name',
      'king_principle_status',
      'king_principle_evidence',
      'king_principle_action',
      'king_principles_total',
      'king_principles_applied_count',
      'king_principles_explained_count',
      'king_principles_partially_applied_count',
      'king_principles_not_applied_count',
      'exceptions',
    ],
  },
  {
    id: 'board_governance__integrated_annual_report',
    element: 'BOARD_GOVERNANCE',
    name: 'Integrated annual report / sustainability (ESG) report',
    aliases: [
      'integrated annual report',
      'integrated report',
      'sustainability report',
      'ESG report',
      'annual report and financial statements',
      'GRI content index',
      'six capitals',
      'value creation model',
      'materiality matrix',
      'material topics',
      'stakeholder engagement report',
    ],
    auditorTests:
      'Establishes what has already been published, because a disclosure claim that contradicts the published report is the fastest way to lose credibility. The assurance provider: (1) confirms the report covers the same financial year being assured; (2) confirms which frameworks are actually applied against those merely mentioned; (3) confirms the materiality process and the resulting material topics are disclosed; (4) confirms any assurance claim names the provider, scope and level.',
    exampleData:
      'Integrated Annual Report FY2025/26, published 30 Sep 2026, incorporating the ESG Report. Frameworks applied: King V, IFRS Accounting Standards, GRI Standards (with content index), partial TCFD alignment. Materiality matrix disclosed; material topics: climate and emissions, road safety, employment equity, energy security, ethics. Limited assurance over selected non-financial metrics by an external provider.',
    extractionPrompt:
      'You are extracting a published integrated or sustainability report. Read the attached report and return JSON with: report_title, report_financial_year, report_publication_date, integrated_report_published, esg_report_published, reporting_frameworks_applied (list, only frameworks the report states it applies), gri_index_present, materiality_matrix_present, material_topics (list as named), six_capitals_disclosed, external_assurance_stated, assurance_provider_name, assurance_scope, exceptions (list). For the published flags return exactly Yes, No or Partial. Copy the material topics verbatim and do not group or rename them. Never treat a mention of a framework as application of it, and never infer assurance from the presence of an auditor report over the financial statements. If this is not an integrated, annual or sustainability report, return { "not_this_document": true }.',
    expectedFields: [
      'report_title',
      'report_financial_year',
      'report_publication_date',
      'integrated_report_published',
      'esg_report_published',
      'reporting_frameworks_applied',
      'gri_index_present',
      'materiality_matrix_present',
      'material_topics',
      'six_capitals_disclosed',
      'external_assurance_stated',
      'assurance_provider_name',
      'assurance_scope',
      'exceptions',
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  // ETHICS_COMPLIANCE
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'ethics_compliance__ethics_whistleblower_policy_and_register',
    element: 'ETHICS_COMPLIANCE',
    name: 'Code of ethics, whistleblower policy and incident register',
    aliases: [
      'code of ethics',
      'code of business conduct',
      'code of business standards',
      'whistleblower policy',
      'whistle-blowing policy',
      'protected disclosures',
      'ethics hotline',
      'Tip-offs Anonymous',
      'ethics incident register',
      'conflict of interest declaration',
      'gift register',
      'anti-bribery policy',
      'fraud prevention plan',
    ],
    auditorTests:
      'A hotline that nobody uses and a policy nobody approved both fail the same test. The assurance provider: (1) confirms the code carries a dated board or executive approval and a named signatory; (2) confirms the hotline is independently operated, anonymous and reachable, and that its number is published to staff; (3) reviews the incident register for reports received, investigated and closed, and for the turnaround; (4) confirms the conflict of interest and gift registers are maintained and reviewed at board level.',
    exampleData:
      'Code of Business Standards and Ethics Rev 2, approved by the Executive Committee 30 Jan 2023. Whistleblower service: Be Heard, 0800-007-117, anonymous, 24 hours a day. FY2025/26: 11 disclosures received, 9 investigated and closed, 2 open. Conflict of interest register maintained and tabled at each board meeting; gift register maintained.',
    extractionPrompt:
      'You are extracting ethics and whistleblowing governance evidence. Read the attached policy, code or incident register and return JSON with: policy_title, policy_version, board_approval_date, policy_effective_date, signatory_name, code_of_ethics_in_place, whistleblower_hotline_active, whistleblower_hotline_provider, whistleblower_hotline_number, hotline_is_anonymous, hotline_is_independent, ethics_incidents_reported_count, ethics_incidents_investigated_count, ethics_incidents_resolved_count, conflict_of_interest_register_maintained, gift_register_maintained, reporting_period_start, reporting_period_end, exceptions (list). For the in-place and active flags return exactly Yes, No or Partial. Copy the hotline number and provider exactly. Never infer an incident count from a narrative statement, and never treat a policy commitment to investigate as evidence that investigations happened; use null. If this is not an ethics, code of conduct or whistleblowing document, return { "not_this_document": true }.',
    expectedFields: [
      'policy_title',
      'policy_version',
      'board_approval_date',
      'policy_effective_date',
      'signatory_name',
      'code_of_ethics_in_place',
      'whistleblower_hotline_active',
      'whistleblower_hotline_provider',
      'whistleblower_hotline_number',
      'hotline_is_anonymous',
      'hotline_is_independent',
      'ethics_incidents_reported_count',
      'ethics_incidents_investigated_count',
      'ethics_incidents_resolved_count',
      'conflict_of_interest_register_maintained',
      'gift_register_maintained',
      'reporting_period_start',
      'reporting_period_end',
      'exceptions',
    ],
  },
  {
    id: 'ethics_compliance__anti_corruption_training_records',
    element: 'ETHICS_COMPLIANCE',
    name: 'Anti-corruption and anti-bribery training records',
    aliases: [
      'anti-corruption training',
      'anti-bribery training',
      'ethics training attendance',
      'PRECCA training',
      'FICA awareness training',
      'compliance training completion report',
      'code of conduct training',
      'fraud awareness training',
    ],
    auditorTests:
      'GRI 205-2 and King require the training to be evidenced by person and by category, not asserted. The assurance provider: (1) agrees attendees to an attendance register or a learning management system completion report; (2) tests coverage against the headcount, and separately against the governing body and high-risk roles; (3) confirms the training content covers bribery, facilitation payments and reporting channels; (4) confirms the training falls inside the reporting period.',
    exampleData:
      'Learning management system completion report, FY2025/26: "Ethics and Anti-Bribery Essentials", 388 of 426 employees completed (91.1%), all 7 directors completed, completion window 01 Aug 2025 to 30 Sep 2025. Provider: internal Compliance function. Topics: bribery, facilitation payments, gifts and hospitality, conflicts of interest, reporting channels.',
    extractionPrompt:
      'You are extracting anti-corruption training evidence. Read the attached completion report, attendance register or training record and return JSON with: reporting_period_start, reporting_period_end, anti_corruption_training_done, training_name, training_completion_date, employees_trained_count, employees_total_count, anti_corruption_training_percent, directors_trained_count, training_provider_name, training_topics_covered (list as named), exceptions (list). For anti_corruption_training_done return exactly Yes, No or Partial — Partial where a policy commits to training but no completion evidence is present. Copy counts and dates verbatim; never derive a completion percentage the record does not print. If this is not an anti-corruption or ethics training record, return { "not_this_document": true }.',
    expectedFields: [
      'reporting_period_start',
      'reporting_period_end',
      'anti_corruption_training_done',
      'training_name',
      'training_completion_date',
      'employees_trained_count',
      'employees_total_count',
      'anti_corruption_training_percent',
      'directors_trained_count',
      'training_provider_name',
      'training_topics_covered',
      'exceptions',
    ],
  },
  {
    id: 'ethics_compliance__popia_information_officer_and_pia',
    element: 'ETHICS_COMPLIANCE',
    name: 'POPIA information officer appointment and impact assessment',
    aliases: [
      'Protection of Personal Information Act',
      'POPIA compliance',
      'information officer appointment',
      'deputy information officer',
      'personal information impact assessment',
      'Information Regulator registration',
      'PAIA manual',
      'data privacy policy',
      'data breach notification',
      'privacy notice',
    ],
    auditorTests:
      'POPIA requires a registered information officer and a documented assessment; a general privacy statement satisfies neither. The assurance provider: (1) confirms a signed appointment letter naming the information officer and the date of appointment; (2) confirms registration with the Information Regulator and quotes the reference; (3) confirms a personal information impact assessment was performed and dated; (4) confirms the PAIA manual is published and current; (5) confirms any security compromise was notified as section 22 requires.',
    exampleData:
      'Information Officer appointment: C. Brown, appointed 14 Jun 2023, registered with the Information Regulator, reference IR/IO/2023/44117. Two deputy information officers appointed. Personal information impact assessment completed 08 Nov 2024. PAIA manual published on the corporate website 01 Mar 2024. Security compromises in the period: 0.',
    extractionPrompt:
      'You are extracting POPIA compliance evidence. Read the attached appointment letter, registration, assessment or privacy documentation and return JSON with: popia_information_officer_appointed, information_officer_name, information_officer_appointment_date, deputy_information_officers_count, information_regulator_registration_reference, popia_impact_assessment_done, popia_impact_assessment_date, paia_manual_published, paia_manual_date, data_breach_incidents_count, privacy_policy_present, exceptions (list). For each yes/no field return exactly Yes, No or Partial — Partial where a compliance framework is described but the specific appointment or assessment document is absent. Copy names, dates and reference numbers verbatim; never infer an appointment from a job title. If this is not a POPIA or data privacy compliance document, return { "not_this_document": true }.',
    expectedFields: [
      'popia_information_officer_appointed',
      'information_officer_name',
      'information_officer_appointment_date',
      'deputy_information_officers_count',
      'information_regulator_registration_reference',
      'popia_impact_assessment_done',
      'popia_impact_assessment_date',
      'paia_manual_published',
      'paia_manual_date',
      'data_breach_incidents_count',
      'privacy_policy_present',
      'exceptions',
    ],
  },
  {
    id: 'ethics_compliance__regulatory_penalties_and_sanctions',
    element: 'ETHICS_COMPLIANCE',
    name: 'Regulatory penalties, fines and sanctions disclosure',
    aliases: [
      'penalty notice',
      'administrative fine',
      'compliance notice',
      'prohibition notice',
      'directive notice',
      'notice of non-compliance',
      'regulatory fine register',
      'sanctions disclosure',
      'Competition Commission penalty',
      'Department of Employment and Labour notice',
      'environmental compliance notice',
      'admission of guilt fine',
    ],
    auditorTests:
      'GRI 2-27 requires significant instances of non-compliance to be disclosed, including a nil return. The assurance provider: (1) confirms a positive statement covering the whole period, since silence is not a nil return; (2) traces each penalty to the notice and to the payment; (3) confirms the disclosure covers environmental, labour, competition, tax and safety regulators rather than one of them; (4) confirms remediation actions are tracked to closure.',
    exampleData:
      'Compliance register FY2025/26: 1 penalty. Department of Employment and Labour contravention notice DOL/GP/2025/8841 issued 17 Sep 2025, Occupational Health and Safety Act section 8, R25,000 administrative fine, paid 12 Oct 2025, status closed. Remediation: machine guarding replaced and re-inspected 30 Sep 2025. No environmental, competition or tax penalties in the period.',
    extractionPrompt:
      'You are extracting regulatory penalties and sanctions disclosure. Read the attached notice, register or disclosure and return JSON with: reporting_period_start, reporting_period_end, penalties_incurred_count, material_non_compliance_disclosed, nil_return_stated, and a penalties array where each row has: penalty_date, issuing_authority, penalty_reference, penalty_legislation, penalty_description, penalty_amount_rand, penalty_status, remediation_action. Also return exceptions (list). Copy notice references and amounts exactly. Never record a nil return unless the document positively states there were none, and never soften the description of a contravention; where the document is silent use null and note it in exceptions. If this is not a penalty notice or a regulatory compliance disclosure, return { "not_this_document": true }.',
    expectedFields: [
      'reporting_period_start',
      'reporting_period_end',
      'penalties_incurred_count',
      'material_non_compliance_disclosed',
      'nil_return_stated',
      'penalty_date',
      'issuing_authority',
      'penalty_reference',
      'penalty_legislation',
      'penalty_description',
      'penalty_amount_rand',
      'penalty_status',
      'remediation_action',
      'exceptions',
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  // RISK_ASSURANCE
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'risk_assurance__risk_register_including_climate',
    element: 'RISK_ASSURANCE',
    name: 'Enterprise risk register including climate risk (GARP / ERM)',
    aliases: [
      'risk register',
      'enterprise risk management',
      'ERM register',
      'risk heat map',
      'top risks',
      'residual risk rating',
      'inherent risk rating',
      'risk appetite statement',
      'climate risk register',
      'physical and transition risk',
      'combined assurance model',
      'risk owner',
    ],
    auditorTests:
      'King principle 10 and IFRS S2 both need the register, and both need climate to be in it rather than beside it. The assurance provider: (1) confirms the register is version controlled and reviewed within the stated frequency; (2) confirms each risk carries an owner, a control and both inherent and residual ratings; (3) confirms climate physical and transition risks appear as risks in the main register, not only in a sustainability annexure; (4) agrees the count of material or top risks to what the board pack reports.',
    exampleData:
      'ERM register v11, reviewed 31 Mar 2026. 42 risks, 9 rated material. R-07 "Carbon tax escalation and fuel cost exposure" — category transition climate, likelihood 4, impact 4, inherent 16, control partially effective, residual 12, owner Chief Financial Officer. R-19 "Flooding of KZN distribution routes" — category physical climate, residual 9, owner Regional Operations Manager. Climate risk in register: yes.',
    extractionPrompt:
      'You are extracting an enterprise risk register. Read the attached register and return JSON with: register_version, register_last_review_date, review_frequency, material_risks_count, total_risks_count, risk_register_updated, climate_risk_in_register, physical_climate_risks_identified, transition_climate_risks_identified, and a risks array where each row has: risk_id, risk_description, risk_category, inherent_likelihood, inherent_impact, control_status, residual_risk_rating, risk_owner, mitigation_action. Also return exceptions (list). For the yes/no flags return exactly Yes, No or Partial — Partial where climate is mentioned but not scored as a risk. Copy ratings exactly as scored and never re-rate a risk. Ignore scoring legends, heat-map keys and dropdown lists. If this is not a risk register, return { "not_this_document": true }.',
    expectedFields: [
      'register_version',
      'register_last_review_date',
      'review_frequency',
      'material_risks_count',
      'total_risks_count',
      'risk_register_updated',
      'climate_risk_in_register',
      'physical_climate_risks_identified',
      'transition_climate_risks_identified',
      'risk_id',
      'risk_description',
      'risk_category',
      'inherent_likelihood',
      'inherent_impact',
      'control_status',
      'residual_risk_rating',
      'risk_owner',
      'mitigation_action',
      'exceptions',
    ],
  },
  {
    id: 'risk_assurance__ifrs_s1_s2_readiness_assessment',
    element: 'RISK_ASSURANCE',
    name: 'IFRS S1 / S2 readiness or gap assessment',
    aliases: [
      'IFRS S1',
      'IFRS S2',
      'ISSB readiness assessment',
      'climate-related disclosures',
      'sustainability disclosure gap analysis',
      'TCFD alignment assessment',
      'climate disclosure tracker',
      'scenario analysis',
      'transition plan disclosure',
      'internal carbon price',
      'climate-related capital expenditure',
    ],
    auditorTests:
      'IFRS S1 and S2 are disclosure standards, so readiness is tested requirement by requirement. The assurance provider: (1) confirms each disclosure requirement carries a status and a data source, not a general readiness score; (2) confirms scenario analysis, where claimed, names the scenarios and the time horizons used; (3) confirms Scope 1, 2 and material Scope 3 figures exist and tie to the GHG inventory; (4) confirms the stated first reporting period and any transitional reliefs being taken.',
    exampleData:
      'IFRS S1/S2 readiness assessment dated 30 Apr 2026, prepared by Okiru Consulting. S1: board oversight of climate risk Partially Disclosed (G_Data, King V principle 10); management role Not Disclosed. S2: physical risks on board agenda Not Disclosed; energy intensity Not Disclosed. Of 24 requirements: 0 fully disclosed, 8 partially, 16 not. Scenario analysis not performed. Internal carbon price not set. Climate-related capex planned R42m (EV fleet and solar). First reporting period FY2026/27.',
    extractionPrompt:
      'You are extracting an IFRS S1 / S2 (ISSB) readiness or gap assessment. Read the attached assessment and return JSON with: assessment_date, assessment_preparer, first_reporting_period, and a requirements array where each row has: ifrs_standard (S1 or S2), ifrs_disclosure_requirement, ifrs_pillar (Governance, Strategy, Risk Management, or Metrics and Targets), ifrs_disclosure_status (Disclosed, Partially Disclosed, Not Disclosed, or N/A — use exactly one), ifrs_data_source, ifrs_action_required. Also return ifrs_requirements_total, ifrs_s1_requirements_disclosed_count, ifrs_s2_requirements_disclosed_count, scenario_analysis_performed, scenario_analysis_scenarios (list), internal_carbon_price_rand_per_tco2e, climate_related_capex_rand, carbon_credits_used_tco2e, exceptions (list). Never upgrade a status and never treat an action plan as a disclosure. Ignore the status dropdown legend. If this is not an IFRS S1/S2, ISSB or TCFD readiness assessment, return { "not_this_document": true }.',
    expectedFields: [
      'assessment_date',
      'assessment_preparer',
      'first_reporting_period',
      'ifrs_standard',
      'ifrs_disclosure_requirement',
      'ifrs_pillar',
      'ifrs_disclosure_status',
      'ifrs_data_source',
      'ifrs_action_required',
      'ifrs_requirements_total',
      'ifrs_s1_requirements_disclosed_count',
      'ifrs_s2_requirements_disclosed_count',
      'scenario_analysis_performed',
      'scenario_analysis_scenarios',
      'internal_carbon_price_rand_per_tco2e',
      'climate_related_capex_rand',
      'carbon_credits_used_tco2e',
      'exceptions',
    ],
  },
  {
    id: 'risk_assurance__external_assurance_statement',
    element: 'RISK_ASSURANCE',
    name: 'External assurance statement / GHG verification statement',
    aliases: [
      'independent assurance report',
      'assurance statement',
      'limited assurance',
      'reasonable assurance',
      'ISAE 3000',
      'ISAE 3410',
      'ISO 14064-3',
      'greenhouse gas verification statement',
      'verification opinion',
      'assurance conclusion',
      'materiality threshold assurance',
    ],
    auditorTests:
      'Assurance level and assurance scope are the whole content of the statement; a claim of assurance over a report is almost always assurance over selected metrics. The assurance provider: (1) reads which metrics are in scope and which are excluded; (2) confirms the level (limited or reasonable) and the standard applied; (3) confirms the conclusion is unmodified and records any qualification; (4) confirms the provider is independent of the preparer; (5) confirms the assured figures equal the figures published.',
    exampleData:
      'Independent limited assurance report under ISAE 3000 (Revised) and ISO 14064-3, dated 12 Oct 2026. Scope: Scope 1 (24,116 tCO2e), Scope 2 location-based (9,841 tCO2e), water withdrawal (12,447 kL) for FY2025/26. Scope 3 excluded. Conclusion: nothing has come to our attention. One qualification: generator diesel at two depots estimated from run hours.',
    extractionPrompt:
      'You are extracting an external assurance or GHG verification statement. Read the attached statement and return JSON with: assurance_provider_name, assurance_standard, assurance_level (limited or reasonable, exactly as stated), assurance_scope, assured_metrics (list of each metric and its assured value), metrics_excluded (list), assurance_report_date, assurance_conclusion, qualifications_or_exceptions (list), external_assurance_of_esg_report, ghg_verified_scope1_tco2e, ghg_verified_scope2_tco2e, ghg_verified_scope3_tco2e, exceptions (list). Copy the conclusion wording verbatim; never paraphrase an assurance conclusion and never describe limited assurance as reasonable. Never treat an audit opinion on financial statements as ESG assurance. If this is not an assurance or verification statement, return { "not_this_document": true }.',
    expectedFields: [
      'assurance_provider_name',
      'assurance_standard',
      'assurance_level',
      'assurance_scope',
      'assured_metrics',
      'metrics_excluded',
      'assurance_report_date',
      'assurance_conclusion',
      'qualifications_or_exceptions',
      'external_assurance_of_esg_report',
      'ghg_verified_scope1_tco2e',
      'ghg_verified_scope2_tco2e',
      'ghg_verified_scope3_tco2e',
      'exceptions',
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  // FINANCIAL
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'financial__annual_financial_statements',
    element: 'FINANCIAL',
    name: 'Annual financial statements (NPAT, revenue, payroll)',
    aliases: [
      'annual financial statements',
      'audited financial statements',
      'statement of profit or loss',
      'statement of comprehensive income',
      'independent auditor report',
      'directors report',
      'signed management accounts',
      'employee costs note',
      'public interest score',
      'financial year ended',
    ],
    auditorTests:
      'The financial statements supply every ESG denominator: NPAT for the CSI target, revenue for intensity metrics, payroll for training spend and the public interest score for the GARP/GRAP assessment. The assurance provider: (1) confirms the statements are signed and carry an audit or review opinion; (2) takes NPAT after tax rather than operating profit; (3) takes employee costs from the note rather than from a payroll estimate; (4) confirms the financial year end matches the ESG reporting period, and flags the difference where it does not.',
    exampleData:
      'Annual financial statements for the year ended 30 June 2026, signed 28 Sep 2026, unmodified audit opinion. Revenue R2,184,332,000. Profit before tax R94,118,000. Net profit after tax R67,764,000. Employee costs (note 6) R412,880,000. Total assets R1,904,221,000. Public interest score 612.',
    extractionPrompt:
      'You are extracting the entity financial denominators used by the ESG scorecards. Read the attached annual financial statements or signed management accounts and return JSON with: entity_name, entity_registration_number, financial_year_end, revenue_rand, profit_before_tax_rand, npat_rand, employee_costs_rand, total_payroll_rand, total_assets_rand, audit_opinion, auditor_name, afs_signature_date, public_interest_score, exceptions (list). Take net profit AFTER tax for npat_rand — never substitute operating profit, EBITDA or profit before tax. Copy figures at the scale printed and record that scale in amounts_stated_in (for example thousands). Never convert currency and never annualise a part-year. If this is not a set of financial statements or management accounts, return { "not_this_document": true }.',
    expectedFields: [
      'entity_name',
      'entity_registration_number',
      'financial_year_end',
      'revenue_rand',
      'profit_before_tax_rand',
      'npat_rand',
      'employee_costs_rand',
      'total_payroll_rand',
      'total_assets_rand',
      'amounts_stated_in',
      'audit_opinion',
      'auditor_name',
      'afs_signature_date',
      'public_interest_score',
      'exceptions',
    ],
  },
  {
    id: 'financial__bbbee_certificate_or_affidavit',
    element: 'FINANCIAL',
    name: 'B-BBEE certificate or sworn affidavit (measured entity)',
    aliases: [
      'B-BBEE certificate',
      'BBBEE verification certificate',
      'B-BBEE status level contributor',
      'sworn affidavit',
      'EME affidavit',
      'QSE affidavit',
      'SANAS accredited verification agency',
      'procurement recognition level',
      'black ownership percentage',
      'black woman ownership',
      'broad-based black economic empowerment',
    ],
    auditorTests:
      'The B-BBEE status feeds the B-BBEE-to-ESG bridge and the social score, so it must be the entity own current certificate. The assurance provider: (1) confirms the certificate or affidavit is valid at the measurement date; (2) confirms a certificate is issued by a SANAS accredited verification agency and an affidavit is properly commissioned; (3) confirms the sector code applied matches the entity activity; (4) confirms the level and the ownership percentages are the ones the certificate states rather than the ones the entity quotes.',
    exampleData:
      'B-BBEE verification certificate BEE/2026/04417, SG Consumer (Pty) Ltd, registration 2011/004128/07, issued 14 Apr 2026, expires 13 Apr 2027, Amended Generic Codes, Level 4 contributor, procurement recognition 100%, black ownership 32.14%, black woman ownership 11.20%, issued by a SANAS accredited verification agency.',
    extractionPrompt:
      'You are extracting the measured entity own B-BBEE status. Read the attached certificate or sworn affidavit and return JSON with: entity_name, entity_registration_number, bbbee_level, black_ownership_percent, black_female_ownership_percent, bbbee_enterprise_type (EME, QSE, or Generic), bbbee_sector_code, bbbee_certificate_number, bbbee_issue_date, bbbee_expiry_date, verification_agency_name, procurement_recognition_percent, is_sworn_affidavit, exceptions (list). Copy the level, percentages and certificate number exactly as printed. Never derive a level from points, never infer an expiry twelve months after issue where the document prints one, and never treat a supplier certificate as the measured entity certificate — record the entity name exactly so the mismatch is visible. If this is not a B-BBEE certificate or affidavit, return { "not_this_document": true }.',
    expectedFields: [
      'entity_name',
      'entity_registration_number',
      'bbbee_level',
      'black_ownership_percent',
      'black_female_ownership_percent',
      'bbbee_enterprise_type',
      'bbbee_sector_code',
      'bbbee_certificate_number',
      'bbbee_issue_date',
      'bbbee_expiry_date',
      'verification_agency_name',
      'procurement_recognition_percent',
      'is_sworn_affidavit',
      'exceptions',
    ],
  },
];

/** Every document required for an ESG element. */
export function documentsForEsgElement(element: EsgElement): EsgDocument[] {
  return ESG_DOCUMENT_MATRIX.filter((doc) => doc.element === element);
}

export function findEsgDocumentById(id: string): EsgDocument | null {
  return ESG_DOCUMENT_MATRIX.find((doc) => doc.id === id) ?? null;
}

/** Element → its documents, for building a "what we need from you" request. */
export function esgDocumentsByElement(): Record<EsgElement, EsgDocument[]> {
  const grouped = {} as Record<EsgElement, EsgDocument[]>;
  for (const doc of ESG_DOCUMENT_MATRIX) {
    (grouped[doc.element] ??= []).push(doc);
  }
  return grouped;
}

/**
 * Alias → document, longest alias first.
 *
 * Longest-first matters for the same reason it does in the B-BBEE matrix:
 * "ISO 14001:2015 environmental management system certificate" must win over the
 * bare "environmental policy" that appears in half the ISO documents, otherwise
 * a specific document is claimed by a generic one.
 */
let esgAliasIndexCache: Array<{ alias: string; lower: string; doc: EsgDocument }> | null = null;

export function esgAliasIndex(): Array<{ alias: string; lower: string; doc: EsgDocument }> {
  if (esgAliasIndexCache) return esgAliasIndexCache;
  const entries: Array<{ alias: string; lower: string; doc: EsgDocument }> = [];
  for (const doc of ESG_DOCUMENT_MATRIX) {
    for (const alias of doc.aliases) {
      entries.push({ alias, lower: alias.toLowerCase(), doc });
    }
  }
  entries.sort((a, b) => b.alias.length - a.alias.length);
  esgAliasIndexCache = entries;
  return entries;
}
