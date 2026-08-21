/**
 * Strict allowlist of ESG calculator keys the parser is permitted to emit.
 *
 * The ESG analogue of `calculator_allowlist.ts`, and it exists for the same
 * safety reason: matrix data — especially fields a future generated or
 * user-supplied ESG matrix might introduce — must never be able to inject an
 * arbitrary calculator path. Only keys defined here may appear in an ESG
 * `calculator_payload`, and each emitted value must match the expected runtime
 * type. Anything else is dropped and recorded as a rejected key.
 *
 * Every key below corresponds to a value the ESG workbook genuinely consumes —
 * an E_Data / S_Data / G_Data cell, a register-grid column, or a scorecard
 * input. The namespaces mirror where the value lands rather than the E/S/G
 * triple, matching the element split in `esg_document_matrix.ts`:
 *
 *   energy.*     E_Data electricity, solar, generator, LPG
 *   emissions.*  E_Data GHG summary, Carbon_Tax
 *   climate.*    NetZero_Roadmap, SBTi targets, climate strategy
 *   fleet.*      Fleet_Register, Driver_Debrief, fuel statements
 *   waste.*      Waste_Register
 *   water.*      E_Data water block
 *   iso.*        ISO_Tracker, environmental policy, aspects, legal register
 *   ee.*         S_Data EE headcount block, EE_Scorecard
 *   hs.*         S_Data health and safety block
 *   training.*   S_Data WSP/ATR, SDL, OFO grid
 *   csi.*        S_Data community and social investment block
 *   supplier.*   SAQ_Supplier
 *   board.*      G_Data board block, King5_Scorecard
 *   ethics.*     G_Data ethics, POPIA and penalties rows
 *   risk.*       G_Data risk rows, GARP_GRAP, IFRS_S1_S2
 *   entity.*     Cover, Assumptions and the financial denominators
 *
 * NOTE ON `boolean`: the B-BBEE allowlist types values as string | number |
 * iso_date because its calculators read Yes/No as strings. ESG evidence carries
 * genuine booleans (a policy clause is present or it is not), so this file adds
 * a fourth runtime type. Workbook cells whose stored vocabulary is literally
 * "Yes" / "No" / "Partial" stay typed `string` — that tri-state is a value, not
 * a boolean, and collapsing it would silently lose "Partial".
 */

export type EsgCalculatorValueType = 'string' | 'number' | 'iso_date' | 'boolean';

export interface EsgCalculatorKeySpec {
  key: string;
  type: EsgCalculatorValueType;
  description: string;
}

export const ESG_CALCULATOR_KEY_ALLOWLIST: readonly EsgCalculatorKeySpec[] = [
  // ── Energy: electricity, solar, stationary fuels (E_Data rows 21-54) ──
  { key: 'energy.site_name', type: 'string', description: 'Depot / site the energy record belongs to' },
  { key: 'energy.utility_account_number', type: 'string', description: 'Municipal or utility account number' },
  { key: 'energy.supplier_name', type: 'string', description: 'Municipality, Eskom or landlord billing the account' },
  { key: 'energy.billing_period_start', type: 'iso_date', description: 'Start of the billed period (ISO yyyy-mm-dd)' },
  { key: 'energy.billing_period_end', type: 'iso_date', description: 'End of the billed period (ISO yyyy-mm-dd)' },
  { key: 'energy.electricity_kwh', type: 'number', description: 'Grid electricity consumed, kWh' },
  { key: 'energy.electricity_cost', type: 'number', description: 'Electricity charge excluding VAT' },
  { key: 'energy.electricity_tariff', type: 'number', description: 'Tariff, currency per kWh' },
  { key: 'energy.meter_number', type: 'string', description: 'Electricity meter number' },
  { key: 'energy.reading_type', type: 'string', description: 'Meter reading basis: actual | estimated' },
  { key: 'energy.max_demand_kva', type: 'number', description: 'Notified or recorded maximum demand, kVA' },
  { key: 'energy.is_landlord_recovery', type: 'boolean', description: 'Charge recovered by a landlord rather than billed directly' },
  { key: 'energy.solar_kwh_generated', type: 'number', description: 'On-site solar generation, kWh' },
  { key: 'energy.solar_kwh_self_consumed', type: 'number', description: 'Solar generation consumed on site, kWh' },
  { key: 'energy.solar_kwh_exported', type: 'number', description: 'Solar generation exported to grid, kWh' },
  { key: 'energy.solar_capacity_kwp', type: 'number', description: 'Installed PV capacity, kWp' },
  { key: 'energy.solar_owner', type: 'string', description: 'Solar system owner: entity | landlord | third_party_ppa' },
  { key: 'energy.renewable_share_percent', type: 'number', description: 'Renewable share of electricity (0-100)' },
  { key: 'energy.generator_diesel_litres', type: 'number', description: 'Standby generator diesel, litres (Scope 1B)' },
  { key: 'energy.generator_run_hours', type: 'number', description: 'Generator run hours in the period' },
  { key: 'energy.lpg_kg', type: 'number', description: 'LPG combusted, kilograms (Scope 1C)' },

  // ── Emissions and carbon tax (E_Data rows 73-90, Carbon_Tax) ──
  { key: 'emissions.scope1_fleet_tco2e', type: 'number', description: 'Scope 1A fleet diesel emissions, tCO2e' },
  { key: 'emissions.scope1_generator_tco2e', type: 'number', description: 'Scope 1B generator diesel emissions, tCO2e' },
  { key: 'emissions.scope1_lpg_tco2e', type: 'number', description: 'Scope 1C LPG emissions, tCO2e' },
  { key: 'emissions.scope1_business_car_tco2e', type: 'number', description: 'Scope 1D business vehicle emissions, tCO2e' },
  { key: 'emissions.scope1_total_tco2e', type: 'number', description: 'Scope 1 total, tCO2e' },
  { key: 'emissions.scope2_gross_tco2e', type: 'number', description: 'Scope 2 grid electricity, location-based, tCO2e' },
  { key: 'emissions.scope2_solar_offset_tco2e', type: 'number', description: 'Scope 2 reduction from on-site solar, tCO2e' },
  { key: 'emissions.scope2_net_tco2e', type: 'number', description: 'Scope 2 net of on-site generation, tCO2e' },
  { key: 'emissions.scope3_water_tco2e', type: 'number', description: 'Scope 3 water supply and treatment, tCO2e' },
  { key: 'emissions.scope3_total_tco2e', type: 'number', description: 'Scope 3 total across material categories, tCO2e' },
  { key: 'emissions.waste_landfill_tco2e', type: 'number', description: 'Emissions from waste sent to landfill, tCO2e' },
  { key: 'emissions.total_tco2e', type: 'number', description: 'Total GHG, Scope 1 + 2 + 3, tCO2e' },
  { key: 'emissions.baseline_tco2e', type: 'number', description: 'Net-zero baseline Scope 1+2, tCO2e' },
  { key: 'emissions.baseline_year', type: 'number', description: 'Baseline year for reduction targets' },
  { key: 'emissions.carbon_tax_licence_number', type: 'string', description: 'SARS carbon tax licence number' },
  { key: 'emissions.carbon_tax_period_start', type: 'iso_date', description: 'Carbon tax period start' },
  { key: 'emissions.carbon_tax_period_end', type: 'iso_date', description: 'Carbon tax period end' },
  { key: 'emissions.carbon_tax_taxable_tco2e', type: 'number', description: 'Taxable emissions declared, tCO2e' },
  { key: 'emissions.carbon_tax_allowance_percent', type: 'number', description: 'Total allowances claimed (0-100)' },
  { key: 'emissions.carbon_tax_rate', type: 'number', description: 'Carbon tax rate, currency per tCO2e' },
  { key: 'emissions.carbon_tax_liability', type: 'number', description: 'Carbon tax liability for the period' },
  { key: 'emissions.carbon_credits_tco2e', type: 'number', description: 'Carbon credits or offsets retired, tCO2e' },

  // ── Climate strategy and targets (NetZero_Roadmap, SBTi) ──
  { key: 'climate.sbti_commitment_status', type: 'string', description: 'SBTi status: committed | validated | not_stated' },
  { key: 'climate.sbti_commitment_date', type: 'iso_date', description: 'Date the commitment letter was signed or accepted' },
  { key: 'climate.validation_status', type: 'string', description: 'Target validation status as stated by SBTi' },
  { key: 'climate.net_zero_target_year', type: 'number', description: 'Net-zero target year' },
  { key: 'climate.near_term_target_year', type: 'number', description: 'Near-term target year' },
  { key: 'climate.target_reduction_percent', type: 'number', description: 'Target reduction against baseline (0-100)' },
  { key: 'climate.scopes_covered', type: 'string', description: 'Scopes the target covers, as stated' },
  { key: 'climate.scope3_target_included', type: 'boolean', description: 'Whether a Scope 3 target is included' },
  { key: 'climate.target_framework', type: 'string', description: 'Target framework, e.g. Corporate Net-Zero Standard 2.0' },
  { key: 'climate.scenario_analysis_performed', type: 'boolean', description: 'Whether climate scenario analysis was performed' },
  { key: 'climate.internal_carbon_price', type: 'number', description: 'Internal carbon price, currency per tCO2e' },
  { key: 'climate.climate_capex', type: 'number', description: 'Planned climate-related capital expenditure' },
  { key: 'climate.physical_risks_identified', type: 'string', description: 'Physical climate risks identified: Yes | No | Partial' },
  { key: 'climate.transition_risks_identified', type: 'string', description: 'Transition climate risks identified: Yes | No | Partial' },
  { key: 'climate.climate_risk_in_register', type: 'string', description: 'Climate risk present in the risk register: Yes | No | Partial' },

  // ── Fleet: register rows, fuel statements, telematics ──
  { key: 'fleet.vehicle_registration', type: 'string', description: 'Vehicle registration number' },
  { key: 'fleet.depot_name', type: 'string', description: 'Depot the vehicle or transaction belongs to' },
  { key: 'fleet.vehicle_make_model', type: 'string', description: 'Vehicle make and model' },
  { key: 'fleet.vehicle_category', type: 'string', description: 'Vehicle category, e.g. 32T horse, 8T fridge, trailer' },
  { key: 'fleet.fuel_type', type: 'string', description: 'Fuel type: diesel | petrol | electric | lpg | hybrid' },
  { key: 'fleet.is_electric_vehicle', type: 'boolean', description: 'Whether the vehicle is battery electric' },
  { key: 'fleet.gvm_kg', type: 'number', description: 'Gross vehicle mass, kg' },
  { key: 'fleet.tare_kg', type: 'number', description: 'Tare mass, kg' },
  { key: 'fleet.payload_kg', type: 'number', description: 'Carrying capacity, kg' },
  { key: 'fleet.fuel_tank_capacity_litres', type: 'number', description: 'Fuel tank capacity, litres' },
  { key: 'fleet.telematics_provider', type: 'string', description: 'Telematics system fitted to the vehicle' },
  { key: 'fleet.monthly_km', type: 'number', description: 'Distance travelled in the month, km' },
  { key: 'fleet.monthly_litres', type: 'number', description: 'Fuel drawn in the month, litres' },
  { key: 'fleet.l_per_100km_actual', type: 'number', description: 'Actual consumption, litres per 100 km' },
  { key: 'fleet.l_per_100km_norm', type: 'number', description: 'OEM or documented norm, litres per 100 km' },
  { key: 'fleet.monthly_tco2e', type: 'number', description: 'Vehicle emissions for the month, tCO2e' },
  { key: 'fleet.service_status', type: 'string', description: 'Service or maintenance status' },
  { key: 'fleet.licence_expiry_date', type: 'iso_date', description: 'Vehicle licence disc expiry date' },
  { key: 'fleet.total_vehicles', type: 'number', description: 'Total vehicles on the register' },
  { key: 'fleet.ev_count', type: 'number', description: 'Electric vehicles on the register' },
  { key: 'fleet.trailer_count', type: 'number', description: 'Trailers on the register' },
  { key: 'fleet.fuel_card_provider', type: 'string', description: 'Fuel card or fleet management provider' },
  { key: 'fleet.fuel_litres', type: 'number', description: 'Litres on a fuel transaction or statement total' },
  { key: 'fleet.fuel_cost', type: 'number', description: 'Fuel cost excluding VAT' },
  { key: 'fleet.odometer_reading', type: 'number', description: 'Odometer reading at fill' },
  { key: 'fleet.transaction_date', type: 'iso_date', description: 'Fuel transaction date' },
  { key: 'fleet.driver_name', type: 'string', description: 'Driver name on a debrief record' },
  { key: 'fleet.route_name', type: 'string', description: 'Route identifier on a debrief record' },
  { key: 'fleet.planned_stops', type: 'number', description: 'Planned stops on the route' },
  { key: 'fleet.actual_stops', type: 'number', description: 'Stops actually completed' },
  { key: 'fleet.customer_hit_percent', type: 'number', description: 'Customer hit rate (0-100)' },
  { key: 'fleet.driving_hours', type: 'number', description: 'Driving hours recorded' },
  { key: 'fleet.idling_hours', type: 'number', description: 'Idling hours recorded' },
  { key: 'fleet.harsh_events_count', type: 'number', description: 'Harsh braking / acceleration events' },
  { key: 'fleet.speeding_events_count', type: 'number', description: 'Speeding events recorded' },
  { key: 'fleet.fatigue_events_count', type: 'number', description: 'Driver fatigue alerts recorded' },

  // ── Waste (Waste_Register) ──
  { key: 'waste.contractor_name', type: 'string', description: 'Waste contractor or service provider' },
  { key: 'waste.site_name', type: 'string', description: 'Depot / site the waste was collected from' },
  { key: 'waste.period_start', type: 'iso_date', description: 'Waste reporting period start' },
  { key: 'waste.period_end', type: 'iso_date', description: 'Waste reporting period end' },
  { key: 'waste.stream_type', type: 'string', description: 'Waste stream, e.g. paper K4, LDPE, general landfill' },
  { key: 'waste.total_kg', type: 'number', description: 'Total waste collected, kg' },
  { key: 'waste.recycled_kg', type: 'number', description: 'Waste recycled or recovered, kg' },
  { key: 'waste.landfill_kg', type: 'number', description: 'Waste sent to landfill, kg' },
  { key: 'waste.hazardous_kg', type: 'number', description: 'Hazardous waste disposed, kg' },
  { key: 'waste.diversion_percent', type: 'number', description: 'Diversion from landfill (0-100)' },
  { key: 'waste.recycled_percent', type: 'number', description: 'Share of waste recycled (0-100)' },
  { key: 'waste.disposal_facility_name', type: 'string', description: 'Licensed disposal or recycling facility' },
  { key: 'waste.disposal_permit_number', type: 'string', description: 'Facility waste management licence number' },
  { key: 'waste.disposal_certificate_number', type: 'string', description: 'Safe disposal certificate number' },

  // ── Water (E_Data rows 56-63) ──
  { key: 'water.site_name', type: 'string', description: 'Depot / site the water account covers' },
  { key: 'water.utility_account_number', type: 'string', description: 'Water account number' },
  { key: 'water.supplier_name', type: 'string', description: 'Municipality or water board' },
  { key: 'water.billing_period_start', type: 'iso_date', description: 'Water billing period start' },
  { key: 'water.billing_period_end', type: 'iso_date', description: 'Water billing period end' },
  { key: 'water.kl', type: 'number', description: 'Water consumed, kilolitres' },
  { key: 'water.cost', type: 'number', description: 'Water charge excluding VAT' },
  { key: 'water.meter_number', type: 'string', description: 'Water meter number' },
  { key: 'water.reading_type', type: 'string', description: 'Meter reading basis: actual | estimated' },
  { key: 'water.sanitation_kl', type: 'number', description: 'Sanitation volume charged, kilolitres' },
  { key: 'water.alternative_source_kl', type: 'number', description: 'Borehole / harvested / tankered water, kilolitres' },

  // ── ISO and environmental management (ISO_Tracker + policy family) ──
  { key: 'iso.iso14001_certificate_number', type: 'string', description: 'ISO 14001 certificate number' },
  { key: 'iso.iso14001_status', type: 'string', description: 'ISO 14001 status: certified | in_progress | lapsed | not_certified' },
  { key: 'iso.iso14001_certification_body', type: 'string', description: 'ISO 14001 certification body' },
  { key: 'iso.iso14001_scope', type: 'string', description: 'ISO 14001 scope statement, verbatim' },
  { key: 'iso.iso14001_issue_date', type: 'iso_date', description: 'ISO 14001 issue date' },
  { key: 'iso.iso14001_expiry_date', type: 'iso_date', description: 'ISO 14001 expiry date' },
  { key: 'iso.iso45001_certificate_number', type: 'string', description: 'ISO 45001 certificate number' },
  { key: 'iso.iso45001_status', type: 'string', description: 'ISO 45001 status: certified | in_progress | lapsed | not_certified' },
  { key: 'iso.iso45001_certification_body', type: 'string', description: 'ISO 45001 certification body' },
  { key: 'iso.iso45001_scope', type: 'string', description: 'ISO 45001 scope statement, verbatim' },
  { key: 'iso.iso45001_issue_date', type: 'iso_date', description: 'ISO 45001 issue date' },
  { key: 'iso.iso45001_expiry_date', type: 'iso_date', description: 'ISO 45001 expiry date' },
  { key: 'iso.clause_reference', type: 'string', description: 'ISO clause the tracker row assesses, e.g. 6.1.2' },
  { key: 'iso.clause_status', type: 'string', description: 'Clause status: Fully Compliant | Partially Compliant | Gap | Not Applicable' },
  { key: 'iso.clause_evidence', type: 'string', description: 'Evidence recorded against the clause' },
  { key: 'iso.environmental_policy_approval_date', type: 'iso_date', description: 'Board approval date of the environmental policy' },
  { key: 'iso.environmental_policy_signatory', type: 'string', description: 'Signatory of the environmental policy' },
  { key: 'iso.net_zero_commitment_present', type: 'boolean', description: 'Environmental policy carries an explicit net-zero commitment' },
  { key: 'iso.aspects_register_present', type: 'boolean', description: 'Aspects and impacts register exists' },
  { key: 'iso.significant_aspects_count', type: 'number', description: 'Aspects rated significant' },
  { key: 'iso.total_aspects_count', type: 'number', description: 'Total aspects on the register' },
  { key: 'iso.legal_register_present', type: 'boolean', description: 'Environmental legal register exists' },
  { key: 'iso.environmental_permit_number', type: 'string', description: 'Environmental permit / licence number' },
  { key: 'iso.environmental_permit_expiry', type: 'iso_date', description: 'Environmental permit expiry date' },
  { key: 'iso.non_compliance_count', type: 'number', description: 'Open environmental non-compliances' },

  // ── Employment Equity (S_Data rows 3-21, EE_Scorecard) ──
  { key: 'ee.occupational_level', type: 'string', description: 'EEA2 occupational level' },
  { key: 'ee.headcount_african_male', type: 'number', description: 'African male headcount at the level' },
  { key: 'ee.headcount_coloured_male', type: 'number', description: 'Coloured male headcount at the level' },
  { key: 'ee.headcount_indian_male', type: 'number', description: 'Indian male headcount at the level' },
  { key: 'ee.headcount_white_male', type: 'number', description: 'White male headcount at the level' },
  { key: 'ee.headcount_african_female', type: 'number', description: 'African female headcount at the level' },
  { key: 'ee.headcount_coloured_female', type: 'number', description: 'Coloured female headcount at the level' },
  { key: 'ee.headcount_indian_female', type: 'number', description: 'Indian female headcount at the level' },
  { key: 'ee.headcount_white_female', type: 'number', description: 'White female headcount at the level' },
  { key: 'ee.headcount_foreign_male', type: 'number', description: 'Foreign national male headcount at the level' },
  { key: 'ee.headcount_foreign_female', type: 'number', description: 'Foreign national female headcount at the level' },
  { key: 'ee.headcount_disabled', type: 'number', description: 'Employees with disabilities at the level' },
  { key: 'ee.headcount_level_total', type: 'number', description: 'Total headcount at the level' },
  { key: 'ee.headcount_total', type: 'number', description: 'Total headcount, all levels' },
  { key: 'ee.non_permanent_headcount', type: 'number', description: 'Non-permanent employee headcount' },
  { key: 'ee.black_percent', type: 'number', description: 'Black employees as a share of headcount (0-100)' },
  { key: 'ee.black_female_percent', type: 'number', description: 'Black female employees as a share of headcount (0-100)' },
  { key: 'ee.disability_percent', type: 'number', description: 'Employees with disabilities as a share of headcount (0-100)' },
  { key: 'ee.submission_reference', type: 'string', description: 'Department of Employment and Labour submission reference' },
  { key: 'ee.submission_date', type: 'iso_date', description: 'EE report submission date' },
  { key: 'ee.plan_submitted', type: 'string', description: 'EE plan submitted to DoEL: Yes | No | Partial' },
  { key: 'ee.plan_start_date', type: 'iso_date', description: 'EE plan start date' },
  { key: 'ee.plan_end_date', type: 'iso_date', description: 'EE plan end date' },
  { key: 'ee.forum_consulted', type: 'string', description: 'EE forum consulted: Yes | No | Partial' },
  { key: 'ee.numerical_targets_set', type: 'string', description: 'Numerical targets set: Yes | No | Partial' },
  { key: 'ee.barriers_removed', type: 'string', description: 'Barriers to EE analysed and removed: Yes | No | Partial' },
  { key: 'ee.affirmative_measures', type: 'string', description: 'Affirmative measures implemented: Yes | No | Partial' },
  { key: 'ee.monitoring_and_reporting', type: 'string', description: 'EE monitoring and reporting in place: Yes | No | Partial' },
  { key: 'ee.manager_name', type: 'string', description: 'Employee assigned responsibility for employment equity' },

  // ── Health and safety (S_Data rows 24-39) ──
  { key: 'hs.site_name', type: 'string', description: 'Site the safety statistics cover' },
  { key: 'hs.period_start', type: 'iso_date', description: 'Safety reporting period start' },
  { key: 'hs.period_end', type: 'iso_date', description: 'Safety reporting period end' },
  { key: 'hs.employees_headcount', type: 'number', description: 'Employees used as the LTIFR exposure base' },
  { key: 'hs.hours_worked', type: 'number', description: 'Actual exposure hours worked' },
  { key: 'hs.fatalities_count', type: 'number', description: 'Work-related fatalities' },
  { key: 'hs.lost_time_injuries_count', type: 'number', description: 'Lost time injuries' },
  { key: 'hs.medical_treatment_injuries_count', type: 'number', description: 'Medical treatment injuries' },
  { key: 'hs.first_aid_cases_count', type: 'number', description: 'First aid cases' },
  { key: 'hs.near_miss_count', type: 'number', description: 'Near miss incidents' },
  { key: 'hs.vehicle_accidents_count', type: 'number', description: 'Fleet vehicle accidents' },
  { key: 'hs.driver_fatigue_incidents_count', type: 'number', description: 'Driver fatigue incidents from debriefs' },
  { key: 'hs.days_lost_count', type: 'number', description: 'Days lost to injury' },
  { key: 'hs.reportable_incidents_count', type: 'number', description: 'Incidents reportable under OHS Act section 24' },
  { key: 'hs.ltifr', type: 'number', description: 'Lost time injury frequency rate as reported' },
  { key: 'hs.trifr', type: 'number', description: 'Total recordable injury frequency rate as reported' },
  { key: 'hs.ltifr_rate_basis', type: 'string', description: 'Rate basis, e.g. per 200,000 hours' },
  { key: 'hs.training_hours', type: 'number', description: 'Health and safety training hours delivered' },
  { key: 'hs.induction_percent', type: 'number', description: 'Employees who completed H&S induction (0-100)' },
  { key: 'hs.safety_committee_meetings_count', type: 'number', description: 'Safety committee meetings held' },
  { key: 'hs.safety_representatives_count', type: 'number', description: 'Elected safety representatives' },
  { key: 'hs.first_aiders_count', type: 'number', description: 'Certified first aiders' },
  { key: 'hs.safety_files_active', type: 'string', description: 'Supplier safety files active: Yes | No | Partial' },
  { key: 'hs.hira_register_present', type: 'boolean', description: 'Hazard identification and risk assessment register exists' },

  // ── Training and skills (S_Data rows 41-67) ──
  { key: 'training.seta_name', type: 'string', description: 'SETA the WSP/ATR was submitted to' },
  { key: 'training.wsp_submitted', type: 'string', description: 'WSP submitted: Yes | No | Partial' },
  { key: 'training.wsp_submission_date', type: 'iso_date', description: 'WSP submission date' },
  { key: 'training.wsp_approval_date', type: 'iso_date', description: 'WSP approval date' },
  { key: 'training.atr_submitted', type: 'string', description: 'ATR submitted: Yes | No | Partial' },
  { key: 'training.atr_submission_date', type: 'iso_date', description: 'ATR submission date' },
  { key: 'training.submission_reference', type: 'string', description: 'SETA submission reference' },
  { key: 'training.mandatory_grant_claimed', type: 'number', description: 'Mandatory grant claimed' },
  { key: 'training.discretionary_grant_applied', type: 'number', description: 'Discretionary grant applied for' },
  { key: 'training.spend', type: 'number', description: 'Total training spend for the period' },
  { key: 'training.hours_total', type: 'number', description: 'Total training hours delivered' },
  { key: 'training.employees_trained_count', type: 'number', description: 'Employees who received training' },
  { key: 'training.employees_trained_percent', type: 'number', description: 'Employees trained as a share of headcount (0-100)' },
  { key: 'training.black_trained_percent', type: 'number', description: 'Black employees trained (0-100)' },
  { key: 'training.female_trained_percent', type: 'number', description: 'Female employees trained (0-100)' },
  { key: 'training.youth_trained_percent', type: 'number', description: 'Youth (35 and under) trained (0-100)' },
  { key: 'training.disabled_trained_percent', type: 'number', description: 'Employees with disabilities trained (0-100)' },
  { key: 'training.leviable_payroll', type: 'number', description: 'Leviable payroll — the training spend denominator' },
  { key: 'training.sdl_levy_paid', type: 'number', description: 'Skills development levy paid' },
  { key: 'training.sdl_reference_number', type: 'string', description: 'SARS SDL reference number' },
  { key: 'training.facilitator_name', type: 'string', description: 'Skills development facilitator' },
  { key: 'training.ofo_code', type: 'string', description: 'OFO occupation code for the intervention' },
  { key: 'training.occupation_title', type: 'string', description: 'Occupation trained' },
  { key: 'training.programme_name', type: 'string', description: 'Training programme name' },
  { key: 'training.programme_category', type: 'string', description: 'Programme category, e.g. learnership, short course' },
  { key: 'training.learners_count', type: 'number', description: 'Learners on the intervention' },
  { key: 'training.provider_name', type: 'string', description: 'Training provider' },
  { key: 'training.is_accredited_provider', type: 'boolean', description: 'Provider is SETA or QCTO accredited' },
  { key: 'training.nqf_level', type: 'string', description: 'NQF level of the intervention' },
  { key: 'training.start_date', type: 'iso_date', description: 'Intervention start date' },
  { key: 'training.end_date', type: 'iso_date', description: 'Intervention end date' },
  { key: 'training.status', type: 'string', description: 'Intervention status, e.g. planned, in progress, completed' },
  { key: 'training.cost', type: 'number', description: 'Cost of the intervention' },

  // ── Community and social investment (S_Data rows 70-82) ──
  { key: 'csi.initiative_name', type: 'string', description: 'CSI / SED initiative name' },
  { key: 'csi.month', type: 'string', description: 'Month or cadence of the initiative' },
  { key: 'csi.beneficiary_name', type: 'string', description: 'Beneficiary organisation or community' },
  { key: 'csi.beneficiary_type', type: 'string', description: 'Beneficiary type, e.g. NPO, school, community group' },
  { key: 'csi.spend', type: 'number', description: 'Spend on the initiative' },
  { key: 'csi.contribution_type', type: 'string', description: 'Contribution type: cash | in_kind | time | other' },
  { key: 'csi.category', type: 'string', description: 'CSI category, e.g. education, health, environment' },
  { key: 'csi.beneficiaries_count', type: 'number', description: 'Beneficiaries reached' },
  { key: 'csi.black_beneficiary_percent', type: 'number', description: 'Black beneficiaries as a share (0-100)' },
  { key: 'csi.initiative_count', type: 'number', description: 'Number of initiatives in the period' },
  { key: 'csi.total_spend', type: 'number', description: 'Total CSI / SED spend for the period' },
  { key: 'csi.spend_percent_of_npat', type: 'number', description: 'CSI spend as a share of NPAT (0-100)' },
  { key: 'csi.npo_number', type: 'string', description: 'Beneficiary NPO registration number' },
  { key: 'csi.pbo_number', type: 'string', description: 'Beneficiary PBO reference number' },
  { key: 'csi.section_18a_receipt_number', type: 'string', description: 'Section 18A receipt number' },

  // ── Supplier ESG (SAQ_Supplier) ──
  { key: 'supplier.name', type: 'string', description: 'Supplier legal or trading name' },
  { key: 'supplier.registration_number', type: 'string', description: 'Supplier company registration number' },
  { key: 'supplier.assessment_date', type: 'iso_date', description: 'Date the supplier assessment was completed' },
  { key: 'supplier.assessment_reference', type: 'string', description: 'Assessment or evaluation reference' },
  { key: 'supplier.delivery_score', type: 'string', description: 'On-time delivery score (1-5 or N/A)' },
  { key: 'supplier.quality_score', type: 'string', description: 'Quality score (1-5 or N/A)' },
  { key: 'supplier.health_safety_score', type: 'string', description: 'Health and safety score (1-5 or N/A)' },
  { key: 'supplier.environmental_score', type: 'string', description: 'Environmental score (1-5 or N/A)' },
  { key: 'supplier.food_safety_score', type: 'string', description: 'Food safety score (1-5 or N/A)' },
  { key: 'supplier.invoicing_score', type: 'string', description: 'Correct invoicing score (1-5 or N/A)' },
  { key: 'supplier.backup_support_score', type: 'string', description: 'Backup support score (1-5 or N/A)' },
  { key: 'supplier.overall_rating', type: 'string', description: 'Overall supplier rating, e.g. A / B / C' },
  { key: 'supplier.environmental_policy_in_place', type: 'boolean', description: 'Supplier has a formal environmental policy' },
  { key: 'supplier.iso14001_certified', type: 'boolean', description: 'Supplier claims ISO 14001 certification' },
  { key: 'supplier.iso45001_certified', type: 'boolean', description: 'Supplier claims ISO 45001 certification' },
  { key: 'supplier.ghg_targets_set', type: 'boolean', description: 'Supplier has set GHG or energy reduction targets' },
  { key: 'supplier.waste_diversion_reported', type: 'boolean', description: 'Supplier reports waste diversion performance' },
  { key: 'supplier.bbbee_level', type: 'number', description: 'Supplier B-BBEE status level (1-8)' },
  { key: 'supplier.code_acknowledged', type: 'boolean', description: 'Supplier signed the code of conduct acknowledgement' },
  { key: 'supplier.code_acknowledgement_date', type: 'iso_date', description: 'Date the supplier acknowledged the code' },
  { key: 'supplier.code_version', type: 'string', description: 'Version of the supplier code acknowledged' },
  { key: 'supplier.acknowledged_count', type: 'number', description: 'Suppliers that have acknowledged the code' },
  { key: 'supplier.total_count', type: 'number', description: 'Active suppliers in scope for the code' },

  // ── Board and governance (G_Data rows 3-13, King5_Scorecard) ──
  { key: 'board.members_total', type: 'number', description: 'Total board members' },
  { key: 'board.executive_directors', type: 'number', description: 'Executive directors' },
  { key: 'board.non_executive_directors', type: 'number', description: 'Non-executive directors' },
  { key: 'board.independent_non_executive_directors', type: 'number', description: 'Independent non-executive directors' },
  { key: 'board.black_percent', type: 'number', description: 'Black board members as a share (0-100)' },
  { key: 'board.female_percent', type: 'number', description: 'Female board members as a share (0-100)' },
  { key: 'board.meetings_held', type: 'number', description: 'Board meetings held in the period' },
  { key: 'board.chair_name', type: 'string', description: 'Board chair' },
  { key: 'board.chair_is_independent', type: 'boolean', description: 'Whether the chair is classified independent' },
  { key: 'board.lead_independent_director_name', type: 'string', description: 'Lead independent director' },
  { key: 'board.company_secretary_name', type: 'string', description: 'Company secretary' },
  { key: 'board.charter_present', type: 'string', description: 'Board charter in place: Yes | No | Partial' },
  { key: 'board.charter_approval_date', type: 'iso_date', description: 'Board charter approval date' },
  { key: 'board.director_name', type: 'string', description: 'Director name (one per composition row)' },
  { key: 'board.director_role', type: 'string', description: 'Director role, e.g. CEO, NED, Chair' },
  { key: 'board.director_is_independent', type: 'boolean', description: 'Director classified independent' },
  { key: 'board.director_gender', type: 'string', description: 'Director gender as classified by the entity' },
  { key: 'board.director_race', type: 'string', description: 'Director race as classified by the entity' },
  { key: 'board.director_appointment_date', type: 'iso_date', description: 'Director appointment date' },
  { key: 'board.committee_memberships', type: 'string', description: 'Committees the director sits on' },
  { key: 'board.audit_committee_meetings', type: 'number', description: 'Audit committee meetings held' },
  { key: 'board.risk_committee_active', type: 'string', description: 'Risk committee active: Yes | No | Partial' },
  { key: 'board.social_ethics_committee_active', type: 'string', description: 'Social and ethics committee active: Yes | No | Partial' },
  { key: 'board.remuneration_committee_active', type: 'string', description: 'Remuneration committee active: Yes | No | Partial' },
  { key: 'board.esg_linked_to_exec_remuneration', type: 'string', description: 'ESG linked to executive pay: Yes | No | Partial' },
  { key: 'board.integrated_report_published', type: 'string', description: 'Integrated report published: Yes | No | Partial' },
  { key: 'board.esg_report_published', type: 'string', description: 'ESG / sustainability report published: Yes | No | Partial' },
  { key: 'board.report_publication_date', type: 'iso_date', description: 'Publication date of the integrated or ESG report' },
  { key: 'board.king_code_version', type: 'string', description: 'King code version applied, e.g. King IV, King V' },
  { key: 'board.king_principle_number', type: 'number', description: 'King principle number' },
  { key: 'board.king_principle_name', type: 'string', description: 'King principle name' },
  { key: 'board.king_principle_status', type: 'string', description: 'Applied | Explained | Partially Applied | Not Applied' },
  { key: 'board.king_principle_evidence', type: 'string', description: 'Evidence recorded against the principle' },
  { key: 'board.king_principles_applied_count', type: 'number', description: 'Principles recorded as Applied' },
  { key: 'board.king_principles_total', type: 'number', description: 'Principles addressed in the register' },

  // ── Ethics, POPIA and compliance (G_Data rows 15-18, 24) ──
  { key: 'ethics.code_of_ethics_in_place', type: 'string', description: 'Code of ethics in place: Yes | No | Partial' },
  { key: 'ethics.policy_approval_date', type: 'iso_date', description: 'Board or executive approval date of the code' },
  { key: 'ethics.policy_version', type: 'string', description: 'Version of the code of ethics' },
  { key: 'ethics.whistleblower_hotline_active', type: 'string', description: 'Whistleblower hotline active: Yes | No | Partial' },
  { key: 'ethics.hotline_provider', type: 'string', description: 'Whistleblower service provider' },
  { key: 'ethics.hotline_number', type: 'string', description: 'Whistleblower hotline number' },
  { key: 'ethics.hotline_is_anonymous', type: 'boolean', description: 'Hotline accepts anonymous disclosures' },
  { key: 'ethics.incidents_reported_count', type: 'number', description: 'Ethics disclosures received in the period' },
  { key: 'ethics.incidents_resolved_count', type: 'number', description: 'Ethics disclosures investigated and closed' },
  { key: 'ethics.conflict_of_interest_register_maintained', type: 'boolean', description: 'Conflict of interest register maintained' },
  { key: 'ethics.gift_register_maintained', type: 'boolean', description: 'Gift register maintained' },
  { key: 'ethics.anti_corruption_training_done', type: 'string', description: 'Anti-corruption training done: Yes | No | Partial' },
  { key: 'ethics.anti_corruption_training_percent', type: 'number', description: 'Employees completing anti-corruption training (0-100)' },
  { key: 'ethics.popia_information_officer_appointed', type: 'string', description: 'POPIA information officer appointed: Yes | No | Partial' },
  { key: 'ethics.information_officer_name', type: 'string', description: 'Appointed information officer' },
  { key: 'ethics.information_officer_appointment_date', type: 'iso_date', description: 'Information officer appointment date' },
  { key: 'ethics.information_regulator_reference', type: 'string', description: 'Information Regulator registration reference' },
  { key: 'ethics.popia_impact_assessment_done', type: 'string', description: 'Personal information impact assessment done: Yes | No | Partial' },
  { key: 'ethics.paia_manual_published', type: 'string', description: 'PAIA manual published: Yes | No | Partial' },
  { key: 'ethics.data_breach_incidents_count', type: 'number', description: 'Security compromises in the period' },
  { key: 'ethics.penalties_count', type: 'number', description: 'Regulatory penalties incurred in the period' },
  { key: 'ethics.penalty_date', type: 'iso_date', description: 'Date the penalty notice was issued' },
  { key: 'ethics.penalty_authority', type: 'string', description: 'Regulator that issued the penalty' },
  { key: 'ethics.penalty_reference', type: 'string', description: 'Penalty or notice reference number' },
  { key: 'ethics.penalty_legislation', type: 'string', description: 'Legislation contravened' },
  { key: 'ethics.penalty_amount', type: 'number', description: 'Penalty amount' },
  { key: 'ethics.penalty_status', type: 'string', description: 'Penalty status, e.g. open, paid, under appeal' },

  // ── Risk, IFRS S1/S2 and assurance (G_Data rows 19-23, GARP_GRAP, IFRS_S1_S2) ──
  { key: 'risk.register_updated', type: 'string', description: 'Risk register updated: Yes | No | Partial' },
  { key: 'risk.register_version', type: 'string', description: 'Risk register version' },
  { key: 'risk.register_review_date', type: 'iso_date', description: 'Date the risk register was last reviewed' },
  { key: 'risk.material_risks_count', type: 'number', description: 'Risks rated material' },
  { key: 'risk.total_risks_count', type: 'number', description: 'Total risks on the register' },
  { key: 'risk.risk_id', type: 'string', description: 'Risk identifier on the register' },
  { key: 'risk.risk_description', type: 'string', description: 'Risk description' },
  { key: 'risk.risk_category', type: 'string', description: 'Risk category, e.g. physical climate, transition, operational' },
  { key: 'risk.likelihood', type: 'number', description: 'Likelihood rating (1-5)' },
  { key: 'risk.impact', type: 'number', description: 'Impact rating (1-5)' },
  { key: 'risk.control_status', type: 'string', description: 'Effective | Partially Effective | Ineffective | Not Assessed' },
  { key: 'risk.residual_rating', type: 'number', description: 'Residual risk rating' },
  { key: 'risk.risk_owner', type: 'string', description: 'Accountable risk owner' },
  { key: 'risk.mitigation_action', type: 'string', description: 'Mitigation or treatment action' },
  { key: 'risk.ifrs_standard', type: 'string', description: 'IFRS sustainability standard: S1 | S2' },
  { key: 'risk.ifrs_requirement', type: 'string', description: 'IFRS disclosure requirement assessed' },
  { key: 'risk.ifrs_pillar', type: 'string', description: 'Governance | Strategy | Risk Management | Metrics and Targets' },
  { key: 'risk.ifrs_status', type: 'string', description: 'Disclosed | Partially Disclosed | Not Disclosed | N/A' },
  { key: 'risk.ifrs_data_source', type: 'string', description: 'Data source cited for the disclosure' },
  { key: 'risk.ifrs_s1_disclosed_count', type: 'number', description: 'IFRS S1 requirements fully disclosed' },
  { key: 'risk.ifrs_s2_disclosed_count', type: 'number', description: 'IFRS S2 requirements fully disclosed' },
  { key: 'risk.ifrs_requirements_total', type: 'number', description: 'IFRS requirements assessed' },
  { key: 'risk.external_assurance_present', type: 'string', description: 'External assurance of ESG report: Yes | No | Partial' },
  { key: 'risk.assurance_provider', type: 'string', description: 'External assurance provider' },
  { key: 'risk.assurance_standard', type: 'string', description: 'Assurance standard, e.g. ISAE 3000, ISO 14064-3' },
  { key: 'risk.assurance_level', type: 'string', description: 'Assurance level: limited | reasonable' },
  { key: 'risk.assurance_scope', type: 'string', description: 'Metrics covered by the assurance engagement' },
  { key: 'risk.assurance_report_date', type: 'iso_date', description: 'Date of the assurance report' },
  { key: 'risk.assurance_conclusion', type: 'string', description: 'Assurance conclusion, verbatim' },

  // ── Entity-level facts and denominators (Cover, Assumptions, AFS) ──
  { key: 'entity.name', type: 'string', description: 'Measured entity name' },
  { key: 'entity.registration_number', type: 'string', description: 'Company registration number' },
  { key: 'entity.sector', type: 'string', description: 'Sector the toolkit is configured for' },
  { key: 'entity.reporting_period_start', type: 'iso_date', description: 'ESG reporting period start' },
  { key: 'entity.reporting_period_end', type: 'iso_date', description: 'ESG reporting period end' },
  { key: 'entity.reporting_currency', type: 'string', description: 'Reporting currency code' },
  { key: 'entity.financial_year_end', type: 'iso_date', description: 'Financial year end' },
  { key: 'entity.revenue', type: 'number', description: 'Annual revenue / turnover' },
  { key: 'entity.profit_before_tax', type: 'number', description: 'Profit before tax' },
  { key: 'entity.npat', type: 'number', description: 'Net profit after tax — the CSI / SED denominator' },
  { key: 'entity.payroll', type: 'number', description: 'Total payroll / employee costs' },
  { key: 'entity.total_assets', type: 'number', description: 'Total assets' },
  { key: 'entity.audit_opinion', type: 'string', description: 'Audit or review opinion on the financial statements' },
  { key: 'entity.auditor_name', type: 'string', description: 'Auditor or reviewer of the financial statements' },
  { key: 'entity.afs_signature_date', type: 'iso_date', description: 'Date the financial statements were signed' },
  { key: 'entity.public_interest_score', type: 'number', description: 'Public interest score (Companies Act regulation 26)' },
  { key: 'entity.bbbee_level', type: 'number', description: 'Entity B-BBEE status level (1-8)' },
  { key: 'entity.black_ownership_percent', type: 'number', description: 'Black ownership percentage (0-100)' },
  { key: 'entity.black_female_ownership_percent', type: 'number', description: 'Black female ownership percentage (0-100)' },
  { key: 'entity.bbbee_enterprise_type', type: 'string', description: 'Enterprise size: eme | qse | generic' },
  { key: 'entity.bbbee_sector_code', type: 'string', description: 'B-BBEE sector code applied' },
  { key: 'entity.bbbee_certificate_number', type: 'string', description: 'B-BBEE certificate or affidavit reference' },
  { key: 'entity.bbbee_certificate_expiry', type: 'iso_date', description: 'B-BBEE certificate expiry date' },
] as const;

const ESG_ALLOWLIST_BY_KEY = new Map<string, EsgCalculatorKeySpec>(
  ESG_CALCULATOR_KEY_ALLOWLIST.map((spec) => [spec.key, spec]),
);

export function isAllowedEsgCalculatorKey(key: string): boolean {
  return ESG_ALLOWLIST_BY_KEY.has(key);
}

export function esgCalculatorKeySpec(key: string): EsgCalculatorKeySpec | undefined {
  return ESG_ALLOWLIST_BY_KEY.get(key);
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Returns true only when `value` is a concrete, non-empty value of the exact
 * runtime type the ESG key expects. Rejects null/undefined/NaN, wrong types,
 * and malformed ISO dates.
 */
export function esgCalculatorValueMatchesType(type: EsgCalculatorValueType, value: unknown): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string' && value.trim().length > 0;
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'iso_date':
      return typeof value === 'string' && ISO_DATE_RE.test(value) && !Number.isNaN(new Date(value).getTime());
    default:
      return false;
  }
}

export interface EsgCalculatorAllowlistResult {
  accepted: boolean;
  reason?: 'unknown_key' | 'type_mismatch' | 'empty_value';
}

/** Decides whether a single (key, value) pair may enter the ESG payload. */
export function admitEsgCalculatorEntry(key: string, value: unknown): EsgCalculatorAllowlistResult {
  const spec = ESG_ALLOWLIST_BY_KEY.get(key);
  if (!spec) return { accepted: false, reason: 'unknown_key' };
  if (value == null) return { accepted: false, reason: 'empty_value' };
  if (!esgCalculatorValueMatchesType(spec.type, value)) return { accepted: false, reason: 'type_mismatch' };
  return { accepted: true };
}
