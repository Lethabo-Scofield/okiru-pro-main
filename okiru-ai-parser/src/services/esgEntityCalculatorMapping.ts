/**
 * Map resolved ESG entities onto ESG calculator keys — the step that turns
 * extraction into a score.
 *
 * The ESG mirror of `entityCalculatorMapping.ts`, and it obeys the same four
 * rules for the same reason: these values become a published ESG number.
 *
 * 1. NOTHING IS INFERRED. Mappings are declared below, one line per field. A
 *    field with no declared mapping is reported unmapped, never guessed at.
 *    Guessing that `sanitation_kl` is water withdrawal double-counts a company's
 *    water footprint as surely as a wrong ownership percentage moves a level.
 *
 * 2. CONFLICTED FIELDS NEVER MAP. Two documents disagreeing on Scope 1 is not a
 *    number yet; it is a review item.
 *
 * 3. CONTEXT DECIDES. `site_name` on an electricity bill is `energy.site_name`;
 *    on a water account it is `water.site_name`; on a waste report it is
 *    `waste.site_name`. Same field name, three destinations, so mappings are
 *    scoped by the ESG element that produced them. This matters more here than
 *    in B-BBEE: the ESG matrix reuses period, site and meter vocabulary across
 *    four elements by design.
 *
 * 4. THE ALLOWLIST IS FINAL. Every candidate goes through
 *    `admitEsgCalculatorEntry`, so a mapping error cannot invent a calculator
 *    path.
 *
 * TWO THINGS THIS HAS THAT THE B-BBEE MAPPER DOES NOT
 *
 * A. BOOLEANS. The ESG allowlist has a fourth runtime type. `boolean` is used
 *    where the evidence is genuinely binary (a policy clause is present or it is
 *    not). The Yes/No/Partial fields are typed `string` ON PURPOSE and are
 *    coerced with `tri_state`, which PRESERVES "Partial" — collapsing it to a
 *    boolean would silently upgrade a partially-applied King principle to
 *    applied, which is precisely the overstatement assurance exists to catch.
 *
 * B. GRIDS. Several ESG documents are registers: a fleet list, an EEA2
 *    occupational-level matrix, a King application register. Extraction emits
 *    those as ONE array-valued field (`fleet_vehicle_rows`), following the
 *    convention the B-BBEE side already uses for `shareholder_rows`. This mapper
 *    EXPANDS that array into N mapped rows rather than dropping it as
 *    uncoercible.
 */
import { createLogger } from '../logger.js';
import {
  admitEsgCalculatorEntry,
  esgCalculatorKeySpec,
} from '../../schemas/esg_calculator_allowlist.js';
import type { EsgElement } from '../../schemas/esg_document_matrix.js';
import { findEsgDocumentById } from '../../schemas/esg_document_matrix.js';
import type { CaseEntities } from './entityResolution.js';

const logger = createLogger('EsgEntityCalculatorMapping');

type Coercion =
  | 'text'
  /** Yes / No / Partial — a value in its own right, never a boolean. */
  | 'tri_state'
  | 'number'
  | 'percentage'
  | 'money'
  | 'boolean'
  | 'iso_date'
  | 'year';

interface EsgFieldMapping {
  /** Extracted field name, as the matrix prompt names it. */
  field: string;
  /** Allowlisted calculator key it feeds. */
  calculatorKey: string;
  /**
   * Restrict to fields that came from these elements. Omit only where the field
   * name is unambiguous across the whole ESG matrix.
   */
  elements?: EsgElement[];
  coerce: Coercion;
}

/**
 * The mapping table.
 *
 * Conservative by design: only fields whose meaning is unambiguous and whose
 * target key already exists in the allowlist. Plenty of matrix fields are
 * evidence an assurance provider needs but no calculator cell consumes (an
 * accreditation mark, a signatory's role), so partial coverage is correct rather
 * than a gap to be filled by guessing.
 */
const FIELD_MAPPINGS: EsgFieldMapping[] = [
  // ── Energy: electricity, solar, stationary fuels ────────────────────────
  { field: 'site_name', calculatorKey: 'energy.site_name', elements: ['GHG_ENERGY'], coerce: 'text' },
  { field: 'utility_account_number', calculatorKey: 'energy.utility_account_number', elements: ['GHG_ENERGY'], coerce: 'text' },
  { field: 'municipality_or_supplier_name', calculatorKey: 'energy.supplier_name', elements: ['GHG_ENERGY'], coerce: 'text' },
  { field: 'billing_period_start', calculatorKey: 'energy.billing_period_start', elements: ['GHG_ENERGY'], coerce: 'iso_date' },
  { field: 'billing_period_end', calculatorKey: 'energy.billing_period_end', elements: ['GHG_ENERGY'], coerce: 'iso_date' },
  { field: 'electricity_kwh', calculatorKey: 'energy.electricity_kwh', elements: ['GHG_ENERGY'], coerce: 'number' },
  { field: 'electricity_rand_excl_vat', calculatorKey: 'energy.electricity_cost', elements: ['GHG_ENERGY'], coerce: 'money' },
  { field: 'electricity_tariff_rand_per_kwh', calculatorKey: 'energy.electricity_tariff', elements: ['GHG_ENERGY'], coerce: 'number' },
  { field: 'meter_number', calculatorKey: 'energy.meter_number', elements: ['GHG_ENERGY'], coerce: 'text' },
  { field: 'reading_type', calculatorKey: 'energy.reading_type', elements: ['GHG_ENERGY'], coerce: 'text' },
  { field: 'max_demand_kva', calculatorKey: 'energy.max_demand_kva', elements: ['GHG_ENERGY'], coerce: 'number' },
  { field: 'is_landlord_recovery', calculatorKey: 'energy.is_landlord_recovery', elements: ['GHG_ENERGY'], coerce: 'boolean' },
  { field: 'solar_kwh_generated', calculatorKey: 'energy.solar_kwh_generated', elements: ['GHG_ENERGY'], coerce: 'number' },
  { field: 'solar_kwh_self_consumed', calculatorKey: 'energy.solar_kwh_self_consumed', elements: ['GHG_ENERGY'], coerce: 'number' },
  { field: 'solar_kwh_exported_to_grid', calculatorKey: 'energy.solar_kwh_exported', elements: ['GHG_ENERGY'], coerce: 'number' },
  { field: 'solar_installed_capacity_kwp', calculatorKey: 'energy.solar_capacity_kwp', elements: ['GHG_ENERGY'], coerce: 'number' },
  { field: 'solar_system_owner', calculatorKey: 'energy.solar_owner', elements: ['GHG_ENERGY'], coerce: 'text' },
  { field: 'generator_diesel_litres', calculatorKey: 'energy.generator_diesel_litres', elements: ['GHG_ENERGY'], coerce: 'number' },
  { field: 'generator_run_hours', calculatorKey: 'energy.generator_run_hours', elements: ['GHG_ENERGY'], coerce: 'number' },
  { field: 'lpg_kg', calculatorKey: 'energy.lpg_kg', elements: ['GHG_ENERGY'], coerce: 'number' },

  // ── Emissions and carbon tax ───────────────────────────────────────────
  { field: 'carbon_tax_licence_number', calculatorKey: 'emissions.carbon_tax_licence_number', elements: ['GHG_ENERGY'], coerce: 'text' },
  { field: 'tax_period_start', calculatorKey: 'emissions.carbon_tax_period_start', elements: ['GHG_ENERGY'], coerce: 'iso_date' },
  { field: 'tax_period_end', calculatorKey: 'emissions.carbon_tax_period_end', elements: ['GHG_ENERGY'], coerce: 'iso_date' },
  { field: 'taxable_emissions_tco2e', calculatorKey: 'emissions.carbon_tax_taxable_tco2e', elements: ['GHG_ENERGY'], coerce: 'number' },
  { field: 'total_allowances_percent', calculatorKey: 'emissions.carbon_tax_allowance_percent', elements: ['GHG_ENERGY'], coerce: 'percentage' },
  { field: 'carbon_tax_rate_rand_per_tco2e', calculatorKey: 'emissions.carbon_tax_rate', elements: ['GHG_ENERGY'], coerce: 'money' },
  { field: 'carbon_tax_liability_rand', calculatorKey: 'emissions.carbon_tax_liability', elements: ['GHG_ENERGY'], coerce: 'money' },
  { field: 'baseline_scope1_2_tco2e', calculatorKey: 'emissions.baseline_tco2e', elements: ['GHG_ENERGY'], coerce: 'number' },
  { field: 'baseline_year', calculatorKey: 'emissions.baseline_year', elements: ['GHG_ENERGY'], coerce: 'year' },
  { field: 'ghg_verified_scope1_tco2e', calculatorKey: 'emissions.scope1_total_tco2e', elements: ['RISK_ASSURANCE'], coerce: 'number' },
  { field: 'ghg_verified_scope2_tco2e', calculatorKey: 'emissions.scope2_net_tco2e', elements: ['RISK_ASSURANCE'], coerce: 'number' },
  { field: 'ghg_verified_scope3_tco2e', calculatorKey: 'emissions.scope3_total_tco2e', elements: ['RISK_ASSURANCE'], coerce: 'number' },
  { field: 'carbon_credits_used_tco2e', calculatorKey: 'emissions.carbon_credits_tco2e', elements: ['RISK_ASSURANCE'], coerce: 'number' },

  // ── Climate strategy and targets ───────────────────────────────────────
  { field: 'commitment_status', calculatorKey: 'climate.sbti_commitment_status', elements: ['GHG_ENERGY'], coerce: 'text' },
  { field: 'sbti_commitment_date', calculatorKey: 'climate.sbti_commitment_date', elements: ['GHG_ENERGY'], coerce: 'iso_date' },
  { field: 'validation_status', calculatorKey: 'climate.validation_status', elements: ['GHG_ENERGY'], coerce: 'text' },
  { field: 'net_zero_target_year', calculatorKey: 'climate.net_zero_target_year', elements: ['GHG_ENERGY'], coerce: 'year' },
  { field: 'near_term_target_year', calculatorKey: 'climate.near_term_target_year', elements: ['GHG_ENERGY'], coerce: 'year' },
  { field: 'target_reduction_percent', calculatorKey: 'climate.target_reduction_percent', elements: ['GHG_ENERGY'], coerce: 'percentage' },
  { field: 'scopes_covered', calculatorKey: 'climate.scopes_covered', elements: ['GHG_ENERGY'], coerce: 'text' },
  { field: 'scope3_target_included', calculatorKey: 'climate.scope3_target_included', elements: ['GHG_ENERGY'], coerce: 'boolean' },
  { field: 'target_framework', calculatorKey: 'climate.target_framework', elements: ['GHG_ENERGY'], coerce: 'text' },
  { field: 'scenario_analysis_performed', calculatorKey: 'climate.scenario_analysis_performed', elements: ['RISK_ASSURANCE'], coerce: 'boolean' },
  { field: 'internal_carbon_price_rand_per_tco2e', calculatorKey: 'climate.internal_carbon_price', elements: ['RISK_ASSURANCE'], coerce: 'money' },
  { field: 'climate_related_capex_rand', calculatorKey: 'climate.climate_capex', elements: ['RISK_ASSURANCE'], coerce: 'money' },
  // Tri-state, not boolean: "Partial" means climate is mentioned but not scored.
  { field: 'physical_climate_risks_identified', calculatorKey: 'climate.physical_risks_identified', elements: ['RISK_ASSURANCE'], coerce: 'tri_state' },
  { field: 'transition_climate_risks_identified', calculatorKey: 'climate.transition_risks_identified', elements: ['RISK_ASSURANCE'], coerce: 'tri_state' },
  { field: 'climate_risk_in_register', calculatorKey: 'climate.climate_risk_in_register', elements: ['RISK_ASSURANCE'], coerce: 'tri_state' },

  // ── Fleet ───────────────────────────────────────────────────────────────
  { field: 'vehicle_registration', calculatorKey: 'fleet.vehicle_registration', elements: ['FLEET'], coerce: 'text' },
  { field: 'depot_name', calculatorKey: 'fleet.depot_name', elements: ['FLEET'], coerce: 'text' },
  { field: 'vehicle_make_model', calculatorKey: 'fleet.vehicle_make_model', elements: ['FLEET'], coerce: 'text' },
  { field: 'vehicle_category', calculatorKey: 'fleet.vehicle_category', elements: ['FLEET'], coerce: 'text' },
  { field: 'fuel_type', calculatorKey: 'fleet.fuel_type', elements: ['FLEET'], coerce: 'text' },
  { field: 'is_electric_vehicle', calculatorKey: 'fleet.is_electric_vehicle', elements: ['FLEET'], coerce: 'boolean' },
  { field: 'gvm_kg', calculatorKey: 'fleet.gvm_kg', elements: ['FLEET'], coerce: 'number' },
  { field: 'tare_kg', calculatorKey: 'fleet.tare_kg', elements: ['FLEET'], coerce: 'number' },
  { field: 'payload_kg', calculatorKey: 'fleet.payload_kg', elements: ['FLEET'], coerce: 'number' },
  { field: 'fuel_tank_capacity_litres', calculatorKey: 'fleet.fuel_tank_capacity_litres', elements: ['FLEET'], coerce: 'number' },
  { field: 'telematics_provider', calculatorKey: 'fleet.telematics_provider', elements: ['FLEET'], coerce: 'text' },
  { field: 'monthly_km', calculatorKey: 'fleet.monthly_km', elements: ['FLEET'], coerce: 'number' },
  { field: 'monthly_litres', calculatorKey: 'fleet.monthly_litres', elements: ['FLEET'], coerce: 'number' },
  { field: 'l_per_100km_actual', calculatorKey: 'fleet.l_per_100km_actual', elements: ['FLEET'], coerce: 'number' },
  { field: 'l_per_100km_norm', calculatorKey: 'fleet.l_per_100km_norm', elements: ['FLEET'], coerce: 'number' },
  { field: 'monthly_tco2e', calculatorKey: 'fleet.monthly_tco2e', elements: ['FLEET'], coerce: 'number' },
  { field: 'service_status', calculatorKey: 'fleet.service_status', elements: ['FLEET'], coerce: 'text' },
  { field: 'licence_expiry_date', calculatorKey: 'fleet.licence_expiry_date', elements: ['FLEET'], coerce: 'iso_date' },
  { field: 'fleet_total_vehicles', calculatorKey: 'fleet.total_vehicles', elements: ['FLEET'], coerce: 'number' },
  { field: 'fleet_ev_count', calculatorKey: 'fleet.ev_count', elements: ['FLEET'], coerce: 'number' },
  { field: 'fleet_trailer_count', calculatorKey: 'fleet.trailer_count', elements: ['FLEET'], coerce: 'number' },
  { field: 'fuel_card_provider', calculatorKey: 'fleet.fuel_card_provider', elements: ['FLEET'], coerce: 'text' },
  { field: 'fuel_litres', calculatorKey: 'fleet.fuel_litres', elements: ['FLEET'], coerce: 'number' },
  { field: 'fuel_rand_excl_vat', calculatorKey: 'fleet.fuel_cost', elements: ['FLEET'], coerce: 'money' },
  { field: 'odometer_reading', calculatorKey: 'fleet.odometer_reading', elements: ['FLEET'], coerce: 'number' },
  { field: 'transaction_date', calculatorKey: 'fleet.transaction_date', elements: ['FLEET'], coerce: 'iso_date' },
  { field: 'driver_name', calculatorKey: 'fleet.driver_name', elements: ['FLEET'], coerce: 'text' },
  { field: 'route_name', calculatorKey: 'fleet.route_name', elements: ['FLEET'], coerce: 'text' },
  { field: 'planned_stops', calculatorKey: 'fleet.planned_stops', elements: ['FLEET'], coerce: 'number' },
  { field: 'actual_stops', calculatorKey: 'fleet.actual_stops', elements: ['FLEET'], coerce: 'number' },
  { field: 'customer_hit_percent', calculatorKey: 'fleet.customer_hit_percent', elements: ['FLEET'], coerce: 'percentage' },
  { field: 'driving_hours', calculatorKey: 'fleet.driving_hours', elements: ['FLEET'], coerce: 'number' },
  { field: 'idling_hours', calculatorKey: 'fleet.idling_hours', elements: ['FLEET'], coerce: 'number' },
  { field: 'harsh_events_count', calculatorKey: 'fleet.harsh_events_count', elements: ['FLEET'], coerce: 'number' },
  { field: 'speeding_events_count', calculatorKey: 'fleet.speeding_events_count', elements: ['FLEET'], coerce: 'number' },
  { field: 'fatigue_events_count', calculatorKey: 'fleet.fatigue_events_count', elements: ['FLEET'], coerce: 'number' },

  // ── Waste ───────────────────────────────────────────────────────────────
  { field: 'waste_contractor_name', calculatorKey: 'waste.contractor_name', elements: ['WASTE'], coerce: 'text' },
  { field: 'site_name', calculatorKey: 'waste.site_name', elements: ['WASTE'], coerce: 'text' },
  { field: 'reporting_period_start', calculatorKey: 'waste.period_start', elements: ['WASTE'], coerce: 'iso_date' },
  { field: 'reporting_period_end', calculatorKey: 'waste.period_end', elements: ['WASTE'], coerce: 'iso_date' },
  { field: 'waste_stream_type', calculatorKey: 'waste.stream_type', elements: ['WASTE'], coerce: 'text' },
  { field: 'waste_total_kg', calculatorKey: 'waste.total_kg', elements: ['WASTE'], coerce: 'number' },
  { field: 'waste_recycled_kg', calculatorKey: 'waste.recycled_kg', elements: ['WASTE'], coerce: 'number' },
  { field: 'waste_landfill_kg', calculatorKey: 'waste.landfill_kg', elements: ['WASTE'], coerce: 'number' },
  { field: 'hazardous_waste_kg', calculatorKey: 'waste.hazardous_kg', elements: ['WASTE'], coerce: 'number' },
  { field: 'waste_diversion_percent', calculatorKey: 'waste.diversion_percent', elements: ['WASTE'], coerce: 'percentage' },
  { field: 'disposal_facility_name', calculatorKey: 'waste.disposal_facility_name', elements: ['WASTE'], coerce: 'text' },
  { field: 'disposal_permit_number', calculatorKey: 'waste.disposal_permit_number', elements: ['WASTE'], coerce: 'text' },
  { field: 'safe_disposal_certificate_number', calculatorKey: 'waste.disposal_certificate_number', elements: ['WASTE'], coerce: 'text' },

  // ── Water ───────────────────────────────────────────────────────────────
  // The same five field names as the electricity bill, scoped to WATER. This is
  // the whole reason mappings carry an element: a combined municipal account
  // produces both sets, and each must land in its own block.
  { field: 'site_name', calculatorKey: 'water.site_name', elements: ['WATER'], coerce: 'text' },
  { field: 'utility_account_number', calculatorKey: 'water.utility_account_number', elements: ['WATER'], coerce: 'text' },
  { field: 'municipality_or_supplier_name', calculatorKey: 'water.supplier_name', elements: ['WATER'], coerce: 'text' },
  { field: 'billing_period_start', calculatorKey: 'water.billing_period_start', elements: ['WATER'], coerce: 'iso_date' },
  { field: 'billing_period_end', calculatorKey: 'water.billing_period_end', elements: ['WATER'], coerce: 'iso_date' },
  { field: 'water_kl', calculatorKey: 'water.kl', elements: ['WATER'], coerce: 'number' },
  { field: 'water_rand_excl_vat', calculatorKey: 'water.cost', elements: ['WATER'], coerce: 'money' },
  { field: 'water_meter_number', calculatorKey: 'water.meter_number', elements: ['WATER'], coerce: 'text' },
  { field: 'reading_type', calculatorKey: 'water.reading_type', elements: ['WATER'], coerce: 'text' },
  { field: 'sanitation_kl', calculatorKey: 'water.sanitation_kl', elements: ['WATER'], coerce: 'number' },
  { field: 'borehole_or_alternative_source_kl', calculatorKey: 'water.alternative_source_kl', elements: ['WATER'], coerce: 'number' },

  // ── ISO / environmental management ─────────────────────────────────────
  { field: 'iso14001_certificate_number', calculatorKey: 'iso.iso14001_certificate_number', elements: ['ISO_ENVIRONMENTAL'], coerce: 'text' },
  { field: 'iso14001_status', calculatorKey: 'iso.iso14001_status', elements: ['ISO_ENVIRONMENTAL'], coerce: 'text' },
  { field: 'iso14001_certification_body', calculatorKey: 'iso.iso14001_certification_body', elements: ['ISO_ENVIRONMENTAL'], coerce: 'text' },
  { field: 'iso14001_scope_statement', calculatorKey: 'iso.iso14001_scope', elements: ['ISO_ENVIRONMENTAL'], coerce: 'text' },
  { field: 'iso14001_issue_date', calculatorKey: 'iso.iso14001_issue_date', elements: ['ISO_ENVIRONMENTAL'], coerce: 'iso_date' },
  { field: 'iso14001_expiry_date', calculatorKey: 'iso.iso14001_expiry_date', elements: ['ISO_ENVIRONMENTAL'], coerce: 'iso_date' },
  { field: 'board_approval_date', calculatorKey: 'iso.environmental_policy_approval_date', elements: ['ISO_ENVIRONMENTAL'], coerce: 'iso_date' },
  { field: 'signatory_name', calculatorKey: 'iso.environmental_policy_signatory', elements: ['ISO_ENVIRONMENTAL'], coerce: 'text' },
  { field: 'net_zero_commitment_present', calculatorKey: 'iso.net_zero_commitment_present', elements: ['ISO_ENVIRONMENTAL'], coerce: 'boolean' },
  { field: 'total_aspects_count', calculatorKey: 'iso.total_aspects_count', elements: ['ISO_ENVIRONMENTAL'], coerce: 'number' },
  { field: 'significant_aspects_count', calculatorKey: 'iso.significant_aspects_count', elements: ['ISO_ENVIRONMENTAL'], coerce: 'number' },
  { field: 'non_compliance_count', calculatorKey: 'iso.non_compliance_count', elements: ['ISO_ENVIRONMENTAL'], coerce: 'number' },
  { field: 'permit_or_licence_number', calculatorKey: 'iso.environmental_permit_number', elements: ['ISO_ENVIRONMENTAL'], coerce: 'text' },
  { field: 'permit_expiry_date', calculatorKey: 'iso.environmental_permit_expiry', elements: ['ISO_ENVIRONMENTAL'], coerce: 'iso_date' },
  { field: 'compliance_status', calculatorKey: 'iso.clause_status', elements: ['ISO_ENVIRONMENTAL'], coerce: 'text' },
  // ISO 45001 is the OHS management system, so it lives with health and safety.
  { field: 'iso45001_certificate_number', calculatorKey: 'iso.iso45001_certificate_number', elements: ['HEALTH_SAFETY'], coerce: 'text' },
  { field: 'iso45001_status', calculatorKey: 'iso.iso45001_status', elements: ['HEALTH_SAFETY'], coerce: 'text' },
  { field: 'iso45001_certification_body', calculatorKey: 'iso.iso45001_certification_body', elements: ['HEALTH_SAFETY'], coerce: 'text' },
  { field: 'iso45001_scope_statement', calculatorKey: 'iso.iso45001_scope', elements: ['HEALTH_SAFETY'], coerce: 'text' },
  { field: 'iso45001_issue_date', calculatorKey: 'iso.iso45001_issue_date', elements: ['HEALTH_SAFETY'], coerce: 'iso_date' },
  { field: 'iso45001_expiry_date', calculatorKey: 'iso.iso45001_expiry_date', elements: ['HEALTH_SAFETY'], coerce: 'iso_date' },

  // ── Employment equity ──────────────────────────────────────────────────
  { field: 'occupational_level', calculatorKey: 'ee.occupational_level', elements: ['EMPLOYMENT_EQUITY'], coerce: 'text' },
  { field: 'headcount_african_male', calculatorKey: 'ee.headcount_african_male', elements: ['EMPLOYMENT_EQUITY'], coerce: 'number' },
  { field: 'headcount_coloured_male', calculatorKey: 'ee.headcount_coloured_male', elements: ['EMPLOYMENT_EQUITY'], coerce: 'number' },
  { field: 'headcount_indian_male', calculatorKey: 'ee.headcount_indian_male', elements: ['EMPLOYMENT_EQUITY'], coerce: 'number' },
  { field: 'headcount_white_male', calculatorKey: 'ee.headcount_white_male', elements: ['EMPLOYMENT_EQUITY'], coerce: 'number' },
  { field: 'headcount_african_female', calculatorKey: 'ee.headcount_african_female', elements: ['EMPLOYMENT_EQUITY'], coerce: 'number' },
  { field: 'headcount_coloured_female', calculatorKey: 'ee.headcount_coloured_female', elements: ['EMPLOYMENT_EQUITY'], coerce: 'number' },
  { field: 'headcount_indian_female', calculatorKey: 'ee.headcount_indian_female', elements: ['EMPLOYMENT_EQUITY'], coerce: 'number' },
  { field: 'headcount_white_female', calculatorKey: 'ee.headcount_white_female', elements: ['EMPLOYMENT_EQUITY'], coerce: 'number' },
  { field: 'headcount_foreign_male', calculatorKey: 'ee.headcount_foreign_male', elements: ['EMPLOYMENT_EQUITY'], coerce: 'number' },
  { field: 'headcount_foreign_female', calculatorKey: 'ee.headcount_foreign_female', elements: ['EMPLOYMENT_EQUITY'], coerce: 'number' },
  { field: 'headcount_disabled', calculatorKey: 'ee.headcount_disabled', elements: ['EMPLOYMENT_EQUITY'], coerce: 'number' },
  { field: 'headcount_level_total', calculatorKey: 'ee.headcount_level_total', elements: ['EMPLOYMENT_EQUITY'], coerce: 'number' },
  { field: 'headcount_total_all_levels', calculatorKey: 'ee.headcount_total', elements: ['EMPLOYMENT_EQUITY'], coerce: 'number' },
  { field: 'non_permanent_headcount', calculatorKey: 'ee.non_permanent_headcount', elements: ['EMPLOYMENT_EQUITY'], coerce: 'number' },
  { field: 'ee_submission_reference', calculatorKey: 'ee.submission_reference', elements: ['EMPLOYMENT_EQUITY'], coerce: 'text' },
  { field: 'ee_submission_date', calculatorKey: 'ee.submission_date', elements: ['EMPLOYMENT_EQUITY'], coerce: 'iso_date' },
  { field: 'ee_plan_start_date', calculatorKey: 'ee.plan_start_date', elements: ['EMPLOYMENT_EQUITY'], coerce: 'iso_date' },
  { field: 'ee_plan_end_date', calculatorKey: 'ee.plan_end_date', elements: ['EMPLOYMENT_EQUITY'], coerce: 'iso_date' },
  { field: 'ee_plan_submitted_to_doel', calculatorKey: 'ee.plan_submitted', elements: ['EMPLOYMENT_EQUITY'], coerce: 'tri_state' },
  { field: 'ee_forum_consulted', calculatorKey: 'ee.forum_consulted', elements: ['EMPLOYMENT_EQUITY'], coerce: 'tri_state' },
  { field: 'numerical_targets_set', calculatorKey: 'ee.numerical_targets_set', elements: ['EMPLOYMENT_EQUITY'], coerce: 'tri_state' },
  { field: 'barriers_analysis_done', calculatorKey: 'ee.barriers_removed', elements: ['EMPLOYMENT_EQUITY'], coerce: 'tri_state' },
  { field: 'affirmative_measures_implemented', calculatorKey: 'ee.affirmative_measures', elements: ['EMPLOYMENT_EQUITY'], coerce: 'tri_state' },
  { field: 'ee_monitoring_and_reporting', calculatorKey: 'ee.monitoring_and_reporting', elements: ['EMPLOYMENT_EQUITY'], coerce: 'tri_state' },
  { field: 'ee_manager_assigned_name', calculatorKey: 'ee.manager_name', elements: ['EMPLOYMENT_EQUITY'], coerce: 'text' },
  { field: 'target_black_percent', calculatorKey: 'ee.black_percent', elements: ['EMPLOYMENT_EQUITY'], coerce: 'percentage' },
  { field: 'target_black_female_percent', calculatorKey: 'ee.black_female_percent', elements: ['EMPLOYMENT_EQUITY'], coerce: 'percentage' },
  { field: 'target_disability_percent', calculatorKey: 'ee.disability_percent', elements: ['EMPLOYMENT_EQUITY'], coerce: 'percentage' },

  // ── Health and safety ──────────────────────────────────────────────────
  { field: 'site_name', calculatorKey: 'hs.site_name', elements: ['HEALTH_SAFETY'], coerce: 'text' },
  { field: 'reporting_period_start', calculatorKey: 'hs.period_start', elements: ['HEALTH_SAFETY'], coerce: 'iso_date' },
  { field: 'reporting_period_end', calculatorKey: 'hs.period_end', elements: ['HEALTH_SAFETY'], coerce: 'iso_date' },
  { field: 'employees_headcount_for_ltifr', calculatorKey: 'hs.employees_headcount', elements: ['HEALTH_SAFETY'], coerce: 'number' },
  { field: 'hours_worked', calculatorKey: 'hs.hours_worked', elements: ['HEALTH_SAFETY'], coerce: 'number' },
  { field: 'fatalities_count', calculatorKey: 'hs.fatalities_count', elements: ['HEALTH_SAFETY'], coerce: 'number' },
  { field: 'lost_time_injuries_count', calculatorKey: 'hs.lost_time_injuries_count', elements: ['HEALTH_SAFETY'], coerce: 'number' },
  { field: 'medical_treatment_injuries_count', calculatorKey: 'hs.medical_treatment_injuries_count', elements: ['HEALTH_SAFETY'], coerce: 'number' },
  { field: 'first_aid_cases_count', calculatorKey: 'hs.first_aid_cases_count', elements: ['HEALTH_SAFETY'], coerce: 'number' },
  { field: 'near_miss_count', calculatorKey: 'hs.near_miss_count', elements: ['HEALTH_SAFETY'], coerce: 'number' },
  { field: 'vehicle_accidents_count', calculatorKey: 'hs.vehicle_accidents_count', elements: ['HEALTH_SAFETY'], coerce: 'number' },
  { field: 'driver_fatigue_incidents_count', calculatorKey: 'hs.driver_fatigue_incidents_count', elements: ['HEALTH_SAFETY'], coerce: 'number' },
  { field: 'days_lost_count', calculatorKey: 'hs.days_lost_count', elements: ['HEALTH_SAFETY'], coerce: 'number' },
  { field: 'dol_section24_reportable_count', calculatorKey: 'hs.reportable_incidents_count', elements: ['HEALTH_SAFETY'], coerce: 'number' },
  { field: 'ltifr', calculatorKey: 'hs.ltifr', elements: ['HEALTH_SAFETY'], coerce: 'number' },
  { field: 'trifr', calculatorKey: 'hs.trifr', elements: ['HEALTH_SAFETY'], coerce: 'number' },
  { field: 'ltifr_rate_basis', calculatorKey: 'hs.ltifr_rate_basis', elements: ['HEALTH_SAFETY'], coerce: 'text' },
  { field: 'hs_training_hours', calculatorKey: 'hs.training_hours', elements: ['HEALTH_SAFETY'], coerce: 'number' },
  { field: 'hs_induction_percent', calculatorKey: 'hs.induction_percent', elements: ['HEALTH_SAFETY'], coerce: 'percentage' },
  { field: 'safety_committee_meetings_count', calculatorKey: 'hs.safety_committee_meetings_count', elements: ['HEALTH_SAFETY'], coerce: 'number' },
  { field: 'safety_representatives_appointed_count', calculatorKey: 'hs.safety_representatives_count', elements: ['HEALTH_SAFETY'], coerce: 'number' },
  { field: 'first_aiders_certified_count', calculatorKey: 'hs.first_aiders_count', elements: ['HEALTH_SAFETY'], coerce: 'number' },
  { field: 'hira_register_present', calculatorKey: 'hs.hira_register_present', elements: ['HEALTH_SAFETY'], coerce: 'boolean' },

  // ── Training / skills ──────────────────────────────────────────────────
  { field: 'seta_name', calculatorKey: 'training.seta_name', elements: ['TRAINING'], coerce: 'text' },
  { field: 'wsp_submitted', calculatorKey: 'training.wsp_submitted', elements: ['TRAINING'], coerce: 'tri_state' },
  { field: 'wsp_submission_date', calculatorKey: 'training.wsp_submission_date', elements: ['TRAINING'], coerce: 'iso_date' },
  { field: 'wsp_approval_date', calculatorKey: 'training.wsp_approval_date', elements: ['TRAINING'], coerce: 'iso_date' },
  { field: 'atr_submitted', calculatorKey: 'training.atr_submitted', elements: ['TRAINING'], coerce: 'tri_state' },
  { field: 'atr_submission_date', calculatorKey: 'training.atr_submission_date', elements: ['TRAINING'], coerce: 'iso_date' },
  { field: 'seta_submission_reference', calculatorKey: 'training.submission_reference', elements: ['TRAINING'], coerce: 'text' },
  { field: 'mandatory_grant_claimed_rand', calculatorKey: 'training.mandatory_grant_claimed', elements: ['TRAINING'], coerce: 'money' },
  { field: 'discretionary_grant_applied_rand', calculatorKey: 'training.discretionary_grant_applied', elements: ['TRAINING'], coerce: 'money' },
  { field: 'training_spend_rand', calculatorKey: 'training.spend', elements: ['TRAINING'], coerce: 'money' },
  { field: 'training_hours_total', calculatorKey: 'training.hours_total', elements: ['TRAINING'], coerce: 'number' },
  { field: 'employees_trained_count', calculatorKey: 'training.employees_trained_count', elements: ['TRAINING'], coerce: 'number' },
  { field: 'employees_trained_percent', calculatorKey: 'training.employees_trained_percent', elements: ['TRAINING'], coerce: 'percentage' },
  { field: 'black_employees_trained_percent', calculatorKey: 'training.black_trained_percent', elements: ['TRAINING'], coerce: 'percentage' },
  { field: 'female_employees_trained_percent', calculatorKey: 'training.female_trained_percent', elements: ['TRAINING'], coerce: 'percentage' },
  { field: 'youth_trained_percent', calculatorKey: 'training.youth_trained_percent', elements: ['TRAINING'], coerce: 'percentage' },
  { field: 'disabled_employees_trained_percent', calculatorKey: 'training.disabled_trained_percent', elements: ['TRAINING'], coerce: 'percentage' },
  { field: 'skills_development_facilitator_name', calculatorKey: 'training.facilitator_name', elements: ['TRAINING'], coerce: 'text' },
  { field: 'leviable_payroll_rand', calculatorKey: 'training.leviable_payroll', elements: ['TRAINING'], coerce: 'money' },
  { field: 'sdl_levy_paid_rand', calculatorKey: 'training.sdl_levy_paid', elements: ['TRAINING'], coerce: 'money' },
  { field: 'sdl_reference_number', calculatorKey: 'training.sdl_reference_number', elements: ['TRAINING'], coerce: 'text' },
  { field: 'ofo_code', calculatorKey: 'training.ofo_code', elements: ['TRAINING'], coerce: 'text' },
  { field: 'occupation_title', calculatorKey: 'training.occupation_title', elements: ['TRAINING'], coerce: 'text' },
  { field: 'programme_name', calculatorKey: 'training.programme_name', elements: ['TRAINING'], coerce: 'text' },
  { field: 'programme_category', calculatorKey: 'training.programme_category', elements: ['TRAINING'], coerce: 'text' },
  { field: 'learners_count', calculatorKey: 'training.learners_count', elements: ['TRAINING'], coerce: 'number' },
  { field: 'training_provider_name', calculatorKey: 'training.provider_name', elements: ['TRAINING'], coerce: 'text' },
  { field: 'is_accredited_provider', calculatorKey: 'training.is_accredited_provider', elements: ['TRAINING'], coerce: 'boolean' },
  { field: 'nqf_level', calculatorKey: 'training.nqf_level', elements: ['TRAINING'], coerce: 'text' },
  { field: 'training_start_date', calculatorKey: 'training.start_date', elements: ['TRAINING'], coerce: 'iso_date' },
  { field: 'training_end_date', calculatorKey: 'training.end_date', elements: ['TRAINING'], coerce: 'iso_date' },
  { field: 'training_status', calculatorKey: 'training.status', elements: ['TRAINING'], coerce: 'text' },
  { field: 'training_cost_rand', calculatorKey: 'training.cost', elements: ['TRAINING'], coerce: 'money' },

  // ── Community / CSI ────────────────────────────────────────────────────
  { field: 'initiative_name', calculatorKey: 'csi.initiative_name', elements: ['COMMUNITY_CSI'], coerce: 'text' },
  { field: 'initiative_month', calculatorKey: 'csi.month', elements: ['COMMUNITY_CSI'], coerce: 'text' },
  { field: 'beneficiary_name', calculatorKey: 'csi.beneficiary_name', elements: ['COMMUNITY_CSI'], coerce: 'text' },
  { field: 'beneficiary_type', calculatorKey: 'csi.beneficiary_type', elements: ['COMMUNITY_CSI'], coerce: 'text' },
  { field: 'csi_spend_rand', calculatorKey: 'csi.spend', elements: ['COMMUNITY_CSI'], coerce: 'money' },
  { field: 'csi_contribution_type', calculatorKey: 'csi.contribution_type', elements: ['COMMUNITY_CSI'], coerce: 'text' },
  { field: 'csi_category', calculatorKey: 'csi.category', elements: ['COMMUNITY_CSI'], coerce: 'text' },
  { field: 'beneficiaries_reached_count', calculatorKey: 'csi.beneficiaries_count', elements: ['COMMUNITY_CSI'], coerce: 'number' },
  { field: 'black_beneficiary_percent', calculatorKey: 'csi.black_beneficiary_percent', elements: ['COMMUNITY_CSI'], coerce: 'percentage' },
  { field: 'initiative_count', calculatorKey: 'csi.initiative_count', elements: ['COMMUNITY_CSI'], coerce: 'number' },
  { field: 'csi_total_spend_rand', calculatorKey: 'csi.total_spend', elements: ['COMMUNITY_CSI'], coerce: 'money' },
  { field: 'csi_spend_percent_of_npat', calculatorKey: 'csi.spend_percent_of_npat', elements: ['COMMUNITY_CSI'], coerce: 'percentage' },
  { field: 'npo_number', calculatorKey: 'csi.npo_number', elements: ['COMMUNITY_CSI'], coerce: 'text' },
  { field: 'pbo_number', calculatorKey: 'csi.pbo_number', elements: ['COMMUNITY_CSI'], coerce: 'text' },
  { field: 'section_18a_receipt_number', calculatorKey: 'csi.section_18a_receipt_number', elements: ['COMMUNITY_CSI'], coerce: 'text' },
  { field: 'donation_amount_rand', calculatorKey: 'csi.spend', elements: ['COMMUNITY_CSI'], coerce: 'money' },

  // ── Supplier ESG (a THIRD PARTY, never the measured entity) ─────────────
  { field: 'supplier_name', calculatorKey: 'supplier.name', elements: ['SUPPLIER_ESG'], coerce: 'text' },
  { field: 'supplier_registration_number', calculatorKey: 'supplier.registration_number', elements: ['SUPPLIER_ESG'], coerce: 'text' },
  { field: 'saq_completion_date', calculatorKey: 'supplier.assessment_date', elements: ['SUPPLIER_ESG'], coerce: 'iso_date' },
  { field: 'saq_reference', calculatorKey: 'supplier.assessment_reference', elements: ['SUPPLIER_ESG'], coerce: 'text' },
  { field: 'supplier_delivery_score', calculatorKey: 'supplier.delivery_score', elements: ['SUPPLIER_ESG'], coerce: 'text' },
  { field: 'supplier_quality_score', calculatorKey: 'supplier.quality_score', elements: ['SUPPLIER_ESG'], coerce: 'text' },
  { field: 'supplier_health_safety_score', calculatorKey: 'supplier.health_safety_score', elements: ['SUPPLIER_ESG'], coerce: 'text' },
  { field: 'supplier_environmental_score', calculatorKey: 'supplier.environmental_score', elements: ['SUPPLIER_ESG'], coerce: 'text' },
  { field: 'supplier_food_safety_score', calculatorKey: 'supplier.food_safety_score', elements: ['SUPPLIER_ESG'], coerce: 'text' },
  { field: 'supplier_invoicing_score', calculatorKey: 'supplier.invoicing_score', elements: ['SUPPLIER_ESG'], coerce: 'text' },
  { field: 'supplier_backup_support_score', calculatorKey: 'supplier.backup_support_score', elements: ['SUPPLIER_ESG'], coerce: 'text' },
  { field: 'supplier_overall_rating', calculatorKey: 'supplier.overall_rating', elements: ['SUPPLIER_ESG'], coerce: 'text' },
  { field: 'supplier_environmental_policy_in_place', calculatorKey: 'supplier.environmental_policy_in_place', elements: ['SUPPLIER_ESG'], coerce: 'boolean' },
  { field: 'supplier_iso14001_certified', calculatorKey: 'supplier.iso14001_certified', elements: ['SUPPLIER_ESG'], coerce: 'boolean' },
  { field: 'supplier_iso45001_certified', calculatorKey: 'supplier.iso45001_certified', elements: ['SUPPLIER_ESG'], coerce: 'boolean' },
  { field: 'supplier_ghg_targets_set', calculatorKey: 'supplier.ghg_targets_set', elements: ['SUPPLIER_ESG'], coerce: 'boolean' },
  { field: 'supplier_waste_diversion_reported', calculatorKey: 'supplier.waste_diversion_reported', elements: ['SUPPLIER_ESG'], coerce: 'boolean' },
  { field: 'supplier_bbbee_level', calculatorKey: 'supplier.bbbee_level', elements: ['SUPPLIER_ESG'], coerce: 'number' },
  { field: 'code_acknowledged', calculatorKey: 'supplier.code_acknowledged', elements: ['SUPPLIER_ESG'], coerce: 'boolean' },
  { field: 'acknowledgement_date', calculatorKey: 'supplier.code_acknowledgement_date', elements: ['SUPPLIER_ESG'], coerce: 'iso_date' },
  { field: 'code_version', calculatorKey: 'supplier.code_version', elements: ['SUPPLIER_ESG'], coerce: 'text' },
  { field: 'suppliers_acknowledged_count', calculatorKey: 'supplier.acknowledged_count', elements: ['SUPPLIER_ESG'], coerce: 'number' },
  { field: 'suppliers_total_count', calculatorKey: 'supplier.total_count', elements: ['SUPPLIER_ESG'], coerce: 'number' },

  // ── Board and governance ───────────────────────────────────────────────
  { field: 'board_members_total', calculatorKey: 'board.members_total', elements: ['BOARD_GOVERNANCE'], coerce: 'number' },
  { field: 'executive_directors_count', calculatorKey: 'board.executive_directors', elements: ['BOARD_GOVERNANCE'], coerce: 'number' },
  { field: 'non_executive_directors_count', calculatorKey: 'board.non_executive_directors', elements: ['BOARD_GOVERNANCE'], coerce: 'number' },
  { field: 'independent_non_executive_directors_count', calculatorKey: 'board.independent_non_executive_directors', elements: ['BOARD_GOVERNANCE'], coerce: 'number' },
  { field: 'board_black_percent', calculatorKey: 'board.black_percent', elements: ['BOARD_GOVERNANCE'], coerce: 'percentage' },
  { field: 'board_female_percent', calculatorKey: 'board.female_percent', elements: ['BOARD_GOVERNANCE'], coerce: 'percentage' },
  { field: 'board_meetings_held', calculatorKey: 'board.meetings_held', elements: ['BOARD_GOVERNANCE'], coerce: 'number' },
  { field: 'board_chair_name', calculatorKey: 'board.chair_name', elements: ['BOARD_GOVERNANCE'], coerce: 'text' },
  { field: 'board_chair_is_independent', calculatorKey: 'board.chair_is_independent', elements: ['BOARD_GOVERNANCE'], coerce: 'boolean' },
  { field: 'lead_independent_director_name', calculatorKey: 'board.lead_independent_director_name', elements: ['BOARD_GOVERNANCE'], coerce: 'text' },
  { field: 'company_secretary_name', calculatorKey: 'board.company_secretary_name', elements: ['BOARD_GOVERNANCE'], coerce: 'text' },
  { field: 'board_charter_present', calculatorKey: 'board.charter_present', elements: ['BOARD_GOVERNANCE'], coerce: 'tri_state' },
  { field: 'board_charter_approval_date', calculatorKey: 'board.charter_approval_date', elements: ['BOARD_GOVERNANCE'], coerce: 'iso_date' },
  { field: 'director_name', calculatorKey: 'board.director_name', elements: ['BOARD_GOVERNANCE'], coerce: 'text' },
  { field: 'director_role', calculatorKey: 'board.director_role', elements: ['BOARD_GOVERNANCE'], coerce: 'text' },
  { field: 'director_is_independent', calculatorKey: 'board.director_is_independent', elements: ['BOARD_GOVERNANCE'], coerce: 'boolean' },
  { field: 'director_gender', calculatorKey: 'board.director_gender', elements: ['BOARD_GOVERNANCE'], coerce: 'text' },
  { field: 'director_race', calculatorKey: 'board.director_race', elements: ['BOARD_GOVERNANCE'], coerce: 'text' },
  { field: 'director_appointment_date', calculatorKey: 'board.director_appointment_date', elements: ['BOARD_GOVERNANCE'], coerce: 'iso_date' },
  { field: 'audit_committee_meetings_held', calculatorKey: 'board.audit_committee_meetings', elements: ['BOARD_GOVERNANCE'], coerce: 'number' },
  { field: 'risk_committee_active', calculatorKey: 'board.risk_committee_active', elements: ['BOARD_GOVERNANCE'], coerce: 'tri_state' },
  { field: 'social_and_ethics_committee_active', calculatorKey: 'board.social_ethics_committee_active', elements: ['BOARD_GOVERNANCE'], coerce: 'tri_state' },
  { field: 'remuneration_committee_active', calculatorKey: 'board.remuneration_committee_active', elements: ['BOARD_GOVERNANCE'], coerce: 'tri_state' },
  { field: 'esg_linked_to_executive_remuneration', calculatorKey: 'board.esg_linked_to_exec_remuneration', elements: ['BOARD_GOVERNANCE'], coerce: 'tri_state' },
  { field: 'integrated_report_published', calculatorKey: 'board.integrated_report_published', elements: ['BOARD_GOVERNANCE'], coerce: 'tri_state' },
  { field: 'esg_report_published', calculatorKey: 'board.esg_report_published', elements: ['BOARD_GOVERNANCE'], coerce: 'tri_state' },
  { field: 'report_publication_date', calculatorKey: 'board.report_publication_date', elements: ['BOARD_GOVERNANCE'], coerce: 'iso_date' },
  { field: 'king_code_version', calculatorKey: 'board.king_code_version', elements: ['BOARD_GOVERNANCE'], coerce: 'text' },
  { field: 'king_principle_number', calculatorKey: 'board.king_principle_number', elements: ['BOARD_GOVERNANCE'], coerce: 'number' },
  { field: 'king_principle_name', calculatorKey: 'board.king_principle_name', elements: ['BOARD_GOVERNANCE'], coerce: 'text' },
  { field: 'king_principle_status', calculatorKey: 'board.king_principle_status', elements: ['BOARD_GOVERNANCE'], coerce: 'text' },
  { field: 'king_principle_evidence', calculatorKey: 'board.king_principle_evidence', elements: ['BOARD_GOVERNANCE'], coerce: 'text' },
  { field: 'king_principles_applied_count', calculatorKey: 'board.king_principles_applied_count', elements: ['BOARD_GOVERNANCE'], coerce: 'number' },
  { field: 'king_principles_total', calculatorKey: 'board.king_principles_total', elements: ['BOARD_GOVERNANCE'], coerce: 'number' },

  // ── Ethics and compliance ──────────────────────────────────────────────
  { field: 'code_of_ethics_in_place', calculatorKey: 'ethics.code_of_ethics_in_place', elements: ['ETHICS_COMPLIANCE'], coerce: 'tri_state' },
  { field: 'board_approval_date', calculatorKey: 'ethics.policy_approval_date', elements: ['ETHICS_COMPLIANCE'], coerce: 'iso_date' },
  { field: 'policy_version', calculatorKey: 'ethics.policy_version', elements: ['ETHICS_COMPLIANCE'], coerce: 'text' },
  { field: 'whistleblower_hotline_active', calculatorKey: 'ethics.whistleblower_hotline_active', elements: ['ETHICS_COMPLIANCE'], coerce: 'tri_state' },
  { field: 'whistleblower_hotline_provider', calculatorKey: 'ethics.hotline_provider', elements: ['ETHICS_COMPLIANCE'], coerce: 'text' },
  { field: 'whistleblower_hotline_number', calculatorKey: 'ethics.hotline_number', elements: ['ETHICS_COMPLIANCE'], coerce: 'text' },
  { field: 'hotline_is_anonymous', calculatorKey: 'ethics.hotline_is_anonymous', elements: ['ETHICS_COMPLIANCE'], coerce: 'boolean' },
  { field: 'ethics_incidents_reported_count', calculatorKey: 'ethics.incidents_reported_count', elements: ['ETHICS_COMPLIANCE'], coerce: 'number' },
  { field: 'ethics_incidents_resolved_count', calculatorKey: 'ethics.incidents_resolved_count', elements: ['ETHICS_COMPLIANCE'], coerce: 'number' },
  { field: 'conflict_of_interest_register_maintained', calculatorKey: 'ethics.conflict_of_interest_register_maintained', elements: ['ETHICS_COMPLIANCE'], coerce: 'boolean' },
  { field: 'gift_register_maintained', calculatorKey: 'ethics.gift_register_maintained', elements: ['ETHICS_COMPLIANCE'], coerce: 'boolean' },
  { field: 'anti_corruption_training_done', calculatorKey: 'ethics.anti_corruption_training_done', elements: ['ETHICS_COMPLIANCE'], coerce: 'tri_state' },
  { field: 'anti_corruption_training_percent', calculatorKey: 'ethics.anti_corruption_training_percent', elements: ['ETHICS_COMPLIANCE'], coerce: 'percentage' },
  { field: 'popia_information_officer_appointed', calculatorKey: 'ethics.popia_information_officer_appointed', elements: ['ETHICS_COMPLIANCE'], coerce: 'tri_state' },
  { field: 'information_officer_name', calculatorKey: 'ethics.information_officer_name', elements: ['ETHICS_COMPLIANCE'], coerce: 'text' },
  { field: 'information_officer_appointment_date', calculatorKey: 'ethics.information_officer_appointment_date', elements: ['ETHICS_COMPLIANCE'], coerce: 'iso_date' },
  { field: 'information_regulator_registration_reference', calculatorKey: 'ethics.information_regulator_reference', elements: ['ETHICS_COMPLIANCE'], coerce: 'text' },
  { field: 'popia_impact_assessment_done', calculatorKey: 'ethics.popia_impact_assessment_done', elements: ['ETHICS_COMPLIANCE'], coerce: 'tri_state' },
  { field: 'paia_manual_published', calculatorKey: 'ethics.paia_manual_published', elements: ['ETHICS_COMPLIANCE'], coerce: 'tri_state' },
  { field: 'data_breach_incidents_count', calculatorKey: 'ethics.data_breach_incidents_count', elements: ['ETHICS_COMPLIANCE'], coerce: 'number' },
  { field: 'penalties_incurred_count', calculatorKey: 'ethics.penalties_count', elements: ['ETHICS_COMPLIANCE'], coerce: 'number' },
  { field: 'penalty_date', calculatorKey: 'ethics.penalty_date', elements: ['ETHICS_COMPLIANCE'], coerce: 'iso_date' },
  { field: 'issuing_authority', calculatorKey: 'ethics.penalty_authority', elements: ['ETHICS_COMPLIANCE'], coerce: 'text' },
  { field: 'penalty_reference', calculatorKey: 'ethics.penalty_reference', elements: ['ETHICS_COMPLIANCE'], coerce: 'text' },
  { field: 'penalty_legislation', calculatorKey: 'ethics.penalty_legislation', elements: ['ETHICS_COMPLIANCE'], coerce: 'text' },
  { field: 'penalty_amount_rand', calculatorKey: 'ethics.penalty_amount', elements: ['ETHICS_COMPLIANCE'], coerce: 'money' },
  { field: 'penalty_status', calculatorKey: 'ethics.penalty_status', elements: ['ETHICS_COMPLIANCE'], coerce: 'text' },

  // ── Risk and assurance ─────────────────────────────────────────────────
  { field: 'risk_register_updated', calculatorKey: 'risk.register_updated', elements: ['RISK_ASSURANCE'], coerce: 'tri_state' },
  { field: 'register_version', calculatorKey: 'risk.register_version', elements: ['RISK_ASSURANCE'], coerce: 'text' },
  { field: 'register_last_review_date', calculatorKey: 'risk.register_review_date', elements: ['RISK_ASSURANCE'], coerce: 'iso_date' },
  { field: 'material_risks_count', calculatorKey: 'risk.material_risks_count', elements: ['RISK_ASSURANCE'], coerce: 'number' },
  { field: 'total_risks_count', calculatorKey: 'risk.total_risks_count', elements: ['RISK_ASSURANCE'], coerce: 'number' },
  { field: 'risk_id', calculatorKey: 'risk.risk_id', elements: ['RISK_ASSURANCE'], coerce: 'text' },
  { field: 'risk_description', calculatorKey: 'risk.risk_description', elements: ['RISK_ASSURANCE'], coerce: 'text' },
  { field: 'risk_category', calculatorKey: 'risk.risk_category', elements: ['RISK_ASSURANCE'], coerce: 'text' },
  { field: 'inherent_likelihood', calculatorKey: 'risk.likelihood', elements: ['RISK_ASSURANCE'], coerce: 'number' },
  { field: 'inherent_impact', calculatorKey: 'risk.impact', elements: ['RISK_ASSURANCE'], coerce: 'number' },
  { field: 'control_status', calculatorKey: 'risk.control_status', elements: ['RISK_ASSURANCE'], coerce: 'text' },
  { field: 'residual_risk_rating', calculatorKey: 'risk.residual_rating', elements: ['RISK_ASSURANCE'], coerce: 'number' },
  { field: 'risk_owner', calculatorKey: 'risk.risk_owner', elements: ['RISK_ASSURANCE'], coerce: 'text' },
  { field: 'mitigation_action', calculatorKey: 'risk.mitigation_action', elements: ['RISK_ASSURANCE'], coerce: 'text' },
  { field: 'ifrs_standard', calculatorKey: 'risk.ifrs_standard', elements: ['RISK_ASSURANCE'], coerce: 'text' },
  { field: 'ifrs_disclosure_requirement', calculatorKey: 'risk.ifrs_requirement', elements: ['RISK_ASSURANCE'], coerce: 'text' },
  { field: 'ifrs_pillar', calculatorKey: 'risk.ifrs_pillar', elements: ['RISK_ASSURANCE'], coerce: 'text' },
  { field: 'ifrs_disclosure_status', calculatorKey: 'risk.ifrs_status', elements: ['RISK_ASSURANCE'], coerce: 'text' },
  { field: 'ifrs_data_source', calculatorKey: 'risk.ifrs_data_source', elements: ['RISK_ASSURANCE'], coerce: 'text' },
  { field: 'ifrs_s1_requirements_disclosed_count', calculatorKey: 'risk.ifrs_s1_disclosed_count', elements: ['RISK_ASSURANCE'], coerce: 'number' },
  { field: 'ifrs_s2_requirements_disclosed_count', calculatorKey: 'risk.ifrs_s2_disclosed_count', elements: ['RISK_ASSURANCE'], coerce: 'number' },
  { field: 'ifrs_requirements_total', calculatorKey: 'risk.ifrs_requirements_total', elements: ['RISK_ASSURANCE'], coerce: 'number' },
  { field: 'external_assurance_of_esg_report', calculatorKey: 'risk.external_assurance_present', elements: ['RISK_ASSURANCE'], coerce: 'tri_state' },
  { field: 'assurance_provider_name', calculatorKey: 'risk.assurance_provider', elements: ['RISK_ASSURANCE'], coerce: 'text' },
  { field: 'assurance_standard', calculatorKey: 'risk.assurance_standard', elements: ['RISK_ASSURANCE'], coerce: 'text' },
  { field: 'assurance_level', calculatorKey: 'risk.assurance_level', elements: ['RISK_ASSURANCE'], coerce: 'text' },
  { field: 'assurance_scope', calculatorKey: 'risk.assurance_scope', elements: ['RISK_ASSURANCE'], coerce: 'text' },
  { field: 'assurance_report_date', calculatorKey: 'risk.assurance_report_date', elements: ['RISK_ASSURANCE'], coerce: 'iso_date' },
  { field: 'assurance_conclusion', calculatorKey: 'risk.assurance_conclusion', elements: ['RISK_ASSURANCE'], coerce: 'text' },

  // ── The measured entity and its denominators ───────────────────────────
  { field: 'entity_name', calculatorKey: 'entity.name', elements: ['FINANCIAL', 'EMPLOYMENT_EQUITY', 'TRAINING'], coerce: 'text' },
  { field: 'entity_registration_number', calculatorKey: 'entity.registration_number', elements: ['FINANCIAL'], coerce: 'text' },
  { field: 'financial_year_end', calculatorKey: 'entity.financial_year_end', elements: ['FINANCIAL'], coerce: 'iso_date' },
  { field: 'revenue_rand', calculatorKey: 'entity.revenue', elements: ['FINANCIAL'], coerce: 'money' },
  { field: 'profit_before_tax_rand', calculatorKey: 'entity.profit_before_tax', elements: ['FINANCIAL'], coerce: 'money' },
  { field: 'npat_rand', calculatorKey: 'entity.npat', elements: ['FINANCIAL'], coerce: 'money' },
  { field: 'total_payroll_rand', calculatorKey: 'entity.payroll', elements: ['FINANCIAL'], coerce: 'money' },
  { field: 'total_assets_rand', calculatorKey: 'entity.total_assets', elements: ['FINANCIAL'], coerce: 'money' },
  { field: 'audit_opinion', calculatorKey: 'entity.audit_opinion', elements: ['FINANCIAL'], coerce: 'text' },
  { field: 'auditor_name', calculatorKey: 'entity.auditor_name', elements: ['FINANCIAL'], coerce: 'text' },
  { field: 'afs_signature_date', calculatorKey: 'entity.afs_signature_date', elements: ['FINANCIAL'], coerce: 'iso_date' },
  { field: 'public_interest_score', calculatorKey: 'entity.public_interest_score', elements: ['FINANCIAL'], coerce: 'number' },
  { field: 'bbbee_level', calculatorKey: 'entity.bbbee_level', elements: ['FINANCIAL'], coerce: 'number' },
  { field: 'black_ownership_percent', calculatorKey: 'entity.black_ownership_percent', elements: ['FINANCIAL'], coerce: 'percentage' },
  { field: 'black_female_ownership_percent', calculatorKey: 'entity.black_female_ownership_percent', elements: ['FINANCIAL'], coerce: 'percentage' },
  { field: 'bbbee_enterprise_type', calculatorKey: 'entity.bbbee_enterprise_type', elements: ['FINANCIAL'], coerce: 'text' },
  { field: 'bbbee_sector_code', calculatorKey: 'entity.bbbee_sector_code', elements: ['FINANCIAL'], coerce: 'text' },
  { field: 'bbbee_certificate_number', calculatorKey: 'entity.bbbee_certificate_number', elements: ['FINANCIAL'], coerce: 'text' },
  { field: 'bbbee_expiry_date', calculatorKey: 'entity.bbbee_certificate_expiry', elements: ['FINANCIAL'], coerce: 'iso_date' },
];

/**
 * Which grid a rows-field belongs to, and which element its rows were extracted
 * under. The element is what disambiguates a row's `site_name` — the same reason
 * the scalar mappings carry one.
 */
const GRID_ELEMENTS: Record<string, EsgElement> = {
  energy_site_rows: 'GHG_ENERGY',
  fleet_fuel_transaction_rows: 'FLEET',
  fleet_vehicle_rows: 'FLEET',
  fleet_debrief_rows: 'FLEET',
  waste_stream_rows: 'WASTE',
  iso_aspect_rows: 'ISO_ENVIRONMENTAL',
  iso_legal_obligation_rows: 'ISO_ENVIRONMENTAL',
  ee_level_rows: 'EMPLOYMENT_EQUITY',
  training_intervention_rows: 'TRAINING',
  csi_initiative_rows: 'COMMUNITY_CSI',
  board_director_rows: 'BOARD_GOVERNANCE',
  board_committee_rows: 'BOARD_GOVERNANCE',
  board_king_principle_rows: 'BOARD_GOVERNANCE',
  ethics_penalty_rows: 'ETHICS_COMPLIANCE',
  risk_register_rows: 'RISK_ASSURANCE',
  risk_ifrs_requirement_rows: 'RISK_ASSURANCE',
};

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

/** "R 4 157 140", "35,332 kWh", "1,250.50", 51 → number. Null when not numeric. */
function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;

  // Negative values appear in brackets in financial statements: (4 157 140).
  const negative = /^\(.*\)$/.test(value.trim());
  // Units are stripped, never converted: the matrix prompts tell the model to
  // copy the printed figure, so "35,332 kWh" is 35332 kWh — not a conversion.
  const cleaned = value
    .replace(/[()]/g, '')
    .replace(/\b(kwh|kva|kwp|kl|kg|km|litres?|hours?|tco2e|tonnes?|%)\b/gi, '')
    .replace(/[R$€£\s,%]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -Math.abs(parsed) : parsed;
}

/** "15 March 2026", "2026-03-14", "14/03/2027" → ISO. Null if unparseable. */
function toIsoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return Number.isNaN(new Date(text).getTime()) ? null : text;
  }

  const longForm = text.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
  if (longForm) {
    const month = MONTHS[longForm[2].slice(0, 3).toLowerCase()];
    if (month) return `${longForm[3]}-${month}-${longForm[1].padStart(2, '0')}`;
  }

  // Day-first: South African documents are dd/mm/yyyy, never mm/dd/yyyy.
  const slashed = text.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
  if (slashed) {
    const day = Number(slashed[1]);
    const month = Number(slashed[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${slashed[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  return null;
}

/**
 * A REAL boolean, for the allowlist keys typed `boolean`.
 *
 * Strict on purpose. "Partial" is NOT accepted here — it returns null and the
 * field is reported uncoercible rather than being rounded to true or false. A
 * partially-implemented control reported as implemented is the single easiest
 * way for an ESG report to overstate itself.
 */
function toBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (['true', 'yes', 'y', 'present', 'in place'].includes(v)) return true;
  if (['false', 'no', 'n', 'absent', 'not present', 'none'].includes(v)) return false;
  return null;
}

/**
 * Yes / No / Partial — normalised to the workbook's own vocabulary and kept a
 * STRING. These allowlist keys are typed `string` deliberately; the third state
 * is a real answer and must survive the trip.
 */
function toTriState(value: unknown): string | null {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (['yes', 'y', 'true'].includes(v)) return 'Yes';
  if (['no', 'n', 'false'].includes(v)) return 'No';
  if (v.startsWith('partial')) return 'Partial';
  return null;
}

function coerce(coercion: Coercion, value: unknown): unknown {
  switch (coercion) {
    case 'text':
      if (Array.isArray(value)) {
        // A list-valued field (committee members, scenarios) becomes one cell.
        const joined = value.map((v) => String(v).trim()).filter(Boolean).join('; ');
        return joined || null;
      }
      if (typeof value === 'number') return String(value);
      return typeof value === 'string' && value.trim() ? value.trim() : null;
    case 'tri_state':
      return toTriState(value);
    case 'boolean':
      return toBoolean(value);
    case 'number':
    case 'money':
      return toNumber(value);
    case 'year': {
      const parsed = toNumber(value);
      if (parsed === null || !Number.isInteger(parsed)) return null;
      // A target year outside this window is a misread, not a target.
      return parsed >= 1900 && parsed <= 2200 ? parsed : null;
    }
    case 'percentage': {
      const parsed = toNumber(value);
      if (parsed === null) return null;
      // Unlike the B-BBEE mapper, a sub-1 value is NOT rescaled here. A 0.4%
      // waste diversion rate and a 0.6 tCO2e intensity are both real ESG
      // figures, so "0.4 means 40%" would corrupt them.
      return parsed >= 0 && parsed <= 100 ? Number(parsed.toFixed(4)) : null;
    }
    case 'iso_date':
      return toIsoDate(value);
    default:
      return null;
  }
}

export interface MappedEsgCalculatorEntry {
  key: string;
  value: unknown;
  sourceField: string;
  sourceFiles: string[];
  agreementCount: number;
}

/** One expanded register row: allowlisted key → typed value. */
export interface EsgCalculatorRow {
  /** The rows-field it came from, e.g. `fleet_vehicle_rows`. */
  grid: string;
  /** Zero-based position in the source array, so a row keeps its order. */
  index: number;
  cells: Record<string, unknown>;
  sourceFiles: string[];
  /** Row keys that had no mapping or would not coerce. */
  droppedFields: string[];
}

export interface EsgCalculatorMappingResult {
  /** Ready for the ESG calculator: allowlisted key → typed value. */
  payload: Record<string, unknown>;
  /** Register rows, expanded one object per source row. */
  rows: EsgCalculatorRow[];
  /** Provenance for every mapped scalar key. */
  entries: MappedEsgCalculatorEntry[];
  /** Extracted but not mapped, with why — the honest coverage report. */
  unmapped: Array<{ field: string; reason: 'no_mapping' | 'conflicted' | 'uncoercible' | 'rejected_by_allowlist' }>;
  /** Fields held back for human review because sources disagreed. */
  needsReview: Array<{ field: string; values: unknown[]; sources: string[] }>;
}

/** Find the mapping for a field, respecting element scope (rule 3). */
function mappingFor(field: string, elements: ReadonlySet<EsgElement>): EsgFieldMapping | undefined {
  return FIELD_MAPPINGS.find((candidate) =>
    candidate.field === field
    && (!candidate.elements || candidate.elements.some((element) => elements.has(element))));
}

/**
 * Expand one array-valued field into N mapped rows.
 *
 * Each row is mapped exactly as a scalar would be — same mapping table, same
 * coercions, same allowlist — so a row cell can no more reach an un-allowlisted
 * key than a document-level value can. A row key with no mapping is recorded in
 * `droppedFields` rather than passed through, and a row that maps to nothing is
 * dropped entirely rather than emitted as an empty workbook line.
 */
function expandRows(
  gridField: string,
  value: unknown,
  sourceFiles: string[],
): EsgCalculatorRow[] {
  if (!Array.isArray(value)) return [];
  const element = GRID_ELEMENTS[gridField];
  if (!element) return [];
  const elements = new Set<EsgElement>([element]);

  const rows: EsgCalculatorRow[] = [];
  value.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
    const cells: Record<string, unknown> = {};
    const droppedFields: string[] = [];

    for (const [field, cellValue] of Object.entries(raw as Record<string, unknown>)) {
      if (cellValue === null || cellValue === undefined || String(cellValue).trim() === '') continue;
      const mapping = mappingFor(field, elements);
      if (!mapping) {
        droppedFields.push(field);
        continue;
      }
      const coerced = coerce(mapping.coerce, cellValue);
      if (coerced === null) {
        droppedFields.push(field);
        continue;
      }
      const admission = admitEsgCalculatorEntry(mapping.calculatorKey, coerced);
      if (!admission.accepted) {
        droppedFields.push(field);
        continue;
      }
      cells[mapping.calculatorKey] = coerced;
    }

    if (Object.keys(cells).length === 0) return;
    rows.push({ grid: gridField, index, cells, sourceFiles, droppedFields });
  });

  return rows;
}

/**
 * Map a resolved ESG case onto a calculator payload.
 *
 * `fieldElements` maps an extracted field name → the ESG elements that produced
 * it, so a field can be scoped to the context it came from.
 */
export function mapEsgEntitiesToCalculator(
  entities: CaseEntities,
  fieldElements: Map<string, Set<EsgElement>>,
): EsgCalculatorMappingResult {
  const payload: Record<string, unknown> = {};
  const rows: EsgCalculatorRow[] = [];
  const entries: MappedEsgCalculatorEntry[] = [];
  const unmapped: EsgCalculatorMappingResult['unmapped'] = [];
  const needsReview: EsgCalculatorMappingResult['needsReview'] = [];

  for (const resolved of Object.values(entities.fields)) {
    // Rule 2: a contested value is not a fact yet.
    if (resolved.conflicted) {
      needsReview.push({
        field: resolved.field,
        values: [resolved.value, ...resolved.alternatives.map((alt) => alt.value)],
        sources: [...resolved.sources, ...resolved.alternatives.flatMap((alt) => alt.sources)],
      });
      unmapped.push({ field: resolved.field, reason: 'conflicted' });
      continue;
    }

    // A REGISTER: expand it rather than trying to coerce an array into a cell.
    if (GRID_ELEMENTS[resolved.field]) {
      const expanded = expandRows(resolved.field, resolved.value, resolved.sources);
      if (expanded.length === 0) {
        unmapped.push({ field: resolved.field, reason: 'uncoercible' });
        continue;
      }
      rows.push(...expanded);
      continue;
    }

    const elements = fieldElements.get(resolved.field) ?? new Set<EsgElement>();
    const mapping = mappingFor(resolved.field, elements);

    if (!mapping) {
      unmapped.push({ field: resolved.field, reason: 'no_mapping' });
      continue;
    }

    const value = coerce(mapping.coerce, resolved.value);
    if (value === null) {
      unmapped.push({ field: resolved.field, reason: 'uncoercible' });
      continue;
    }

    // Rule 4: the allowlist is the last word, whatever the table above says.
    const admission = admitEsgCalculatorEntry(mapping.calculatorKey, value);
    if (!admission.accepted) {
      logger.warn('Mapped value rejected by the ESG calculator allowlist', {
        key: mapping.calculatorKey,
        field: resolved.field,
        reason: admission.reason,
      });
      unmapped.push({ field: resolved.field, reason: 'rejected_by_allowlist' });
      continue;
    }

    // Best-corroborated mapping wins; a later field must not silently overwrite
    // a key that more documents agreed on.
    const existing = entries.find((entry) => entry.key === mapping.calculatorKey);
    if (existing && existing.agreementCount >= resolved.agreementCount) continue;
    if (existing) entries.splice(entries.indexOf(existing), 1);

    payload[mapping.calculatorKey] = value;
    entries.push({
      key: mapping.calculatorKey,
      value,
      sourceField: resolved.field,
      sourceFiles: resolved.sources,
      agreementCount: resolved.agreementCount,
    });
  }

  return { payload, rows, entries, unmapped, needsReview };
}

/**
 * Build the field → ESG elements index from the per-document extractions.
 *
 * This is what makes rule 3 work: `site_name` extracted under the electricity
 * spec and `site_name` extracted under the water spec are the SAME field name
 * with two destinations, and only the document that produced it can say which.
 */
export function esgFieldElementIndex(
  extractions: Array<{ documentId: string; values: Array<{ field: string }> }>,
): Map<string, Set<EsgElement>> {
  const index = new Map<string, Set<EsgElement>>();
  for (const extraction of extractions) {
    const doc = findEsgDocumentById(extraction.documentId);
    if (!doc) continue;
    for (const value of extraction.values) {
      const set = index.get(value.field) ?? new Set<EsgElement>();
      set.add(doc.element);
      index.set(value.field, set);
    }
  }
  return index;
}

/** Keys the ESG calculator understands but nothing in the case supplied. */
export function unfilledEsgCalculatorKeys(payload: Record<string, unknown>): string[] {
  return ESG_CALCULATOR_KEYS.filter((key) => !(key in payload));
}

const ESG_CALCULATOR_KEYS = Array.from(new Set(FIELD_MAPPINGS.map((mapping) => mapping.calculatorKey)))
  .filter((key) => esgCalculatorKeySpec(key) !== undefined);

/** Exposed for the coverage test: every declared mapping. */
export const ESG_FIELD_MAPPINGS: readonly EsgFieldMapping[] = FIELD_MAPPINGS;
