/**
 * THE DOMAIN SEAM — one extraction pipeline, two evidence vocabularies.
 *
 * B-BBEE and ESG are the same problem twice: a client uploads a folder of real
 * documents, and something has to decide which expert-authored prompt to run
 * against each one, then decide which of the resulting fields are allowed to
 * reach a calculator. Everything BETWEEN those two decisions — reading a PDF,
 * OCR'ing a scan, splitting a workbook into sheets, chunking a long document,
 * caching, grounding, checksums, the sweep pass, conflict resolution — is
 * domain-blind and must stay that way. Forking it would mean every future fix
 * to extraction had to be made twice, and the second copy would rot.
 *
 * So the ONLY things that vary by domain are declared here:
 *
 *   1. WHICH MATRIX supplies the specs (109 B-BBEE documents vs 40 ESG ones).
 *   2. WHO THE ANALYST IS in the extraction system prompt — a B-BBEE
 *      verification analyst reads a certificate differently from an ESG
 *      assurance analyst reading a municipal bill.
 *   3. WHICH DOCUMENTS ARE GRID-SHAPED. A B-BBEE matrix spec describes ONE
 *      evidence record; several ESG specs describe a REGISTER — a fleet list, a
 *      King application register, an EEA2 occupational-level matrix — whose
 *      prompt asks for an array of rows PLUS register totals in a single reply.
 *      Nothing in the B-BBEE matrix is grid-shaped, so `gridForDocument` returns
 *      null for every B-BBEE spec and that pipeline is untouched.
 *
 * The element-routing vocabulary is the fourth domain-specific thing, and it
 * lives in `specRetrieval.ts` next to the routing it drives (putting it here
 * would make this module and that one import each other).
 *
 * Every entry point that takes a domain DEFAULTS TO 'bbbee', so every existing
 * call site keeps its exact current behaviour without being edited.
 */
import {
  VERIFICATION_DOCUMENT_MATRIX,
  aliasIndex,
  findDocumentById,
  type VerificationElement,
} from '../../schemas/verification_document_matrix.js';
import {
  ESG_DOCUMENT_MATRIX,
  esgAliasIndex,
  findEsgDocumentById,
  type EsgElement,
} from '../../schemas/esg_document_matrix.js';

export type ExtractionDomain = 'bbbee' | 'esg';

/** Any element either matrix can route to. Kept a union, not `string`, so a
 *  typo in an element name is still a compile error on both sides. */
export type RoutableElement = VerificationElement | EsgElement;

/**
 * The shape both matrices already have. `VerificationDocument` and `EsgDocument`
 * are structurally identical apart from their element union, so this is the
 * common supertype rather than a new contract either matrix has to adopt.
 */
export interface DomainDocument {
  id: string;
  element: string;
  name: string;
  aliases: string[];
  auditorTests: string;
  exampleData: string;
  extractionPrompt: string;
  expectedFields: string[];
}

/**
 * A document whose prompt returns an ARRAY OF ROWS as well as scalars.
 *
 * The B-BBEE matrix has none of these: each spec is one sampled record, and the
 * row-shaped evidence (share register, supplier schedule) is handled separately
 * by `sheetTableExtraction`, which emits `shareholder_rows` / `supplier_rows` as
 * a single array-valued field. ESG registers arrive as ordinary documents rather
 * than workbook sheets, so the same array-valued-field convention is applied
 * here, at the point the model's reply is read.
 *
 * `rowFields` are the expectedFields that live INSIDE a row. Without this the
 * pipeline would report all 18 fleet-register columns "missing" (they are not at
 * the top level of the reply) and then throw the rows away as an unexpected key.
 */
export interface DocumentGrid {
  /** The field name the rows are emitted under, e.g. `fleet_vehicle_rows`. */
  rowsField: string;
  /** Keys the prompt names for the array itself, most likely first. */
  containerKeys: string[];
  /** expectedFields that belong to a row rather than to the document. */
  rowFields: string[];
  /**
   * Whether a found row array satisfies its `rowFields`.
   *
   * False where the SAME field name is legitimately both a row column and a
   * document-level total — a waste report states `waste_total_kg` per stream AND
   * for the site, and a single-site electricity bill states its figures at the
   * top level with no `sites` array at all. In those cases the scalars are still
   * read, and the rows are additional evidence rather than a replacement.
   */
  suppressRowScalars: boolean;
}

/**
 * Grid-shaped ESG documents, taken from the container key each expert prompt
 * actually names ("a vehicles array", "a principles array"). Hoisting is not
 * limited to these names at runtime — a model that renames the array is still
 * understood — but naming them makes the intended shape explicit and testable.
 */
const ESG_GRIDS: Record<string, DocumentGrid> = {
  // A statement covering several meters/sites returns one object per site. A
  // single-site bill returns its figures at the top level, so scalars stand.
  ghg_energy__municipal_electricity_bill: {
    rowsField: 'energy_site_rows',
    containerKeys: ['sites'],
    rowFields: [
      'site_name', 'utility_account_number', 'municipality_or_supplier_name',
      'billing_period_start', 'billing_period_end', 'electricity_kwh',
      'electricity_rand_excl_vat', 'electricity_tariff_rand_per_kwh', 'meter_number',
      'meter_reading_previous', 'meter_reading_current', 'reading_type',
      'max_demand_kva', 'is_landlord_recovery',
    ],
    suppressRowScalars: false,
  },
  fleet__fuel_card_statement: {
    rowsField: 'fleet_fuel_transaction_rows',
    containerKeys: ['transactions'],
    rowFields: [
      'transaction_date', 'vehicle_registration', 'fuel_type', 'fuel_litres',
      'fuel_rand_excl_vat', 'odometer_reading', 'transaction_site',
    ],
    suppressRowScalars: true,
  },
  fleet__vehicle_register: {
    rowsField: 'fleet_vehicle_rows',
    containerKeys: ['vehicles'],
    rowFields: [
      'vehicle_registration', 'depot_name', 'vehicle_make_model', 'vehicle_category',
      'fuel_type', 'is_electric_vehicle', 'gvm_kg', 'tare_kg', 'payload_kg',
      'fuel_tank_capacity_litres', 'telematics_provider', 'monthly_km', 'monthly_litres',
      'l_per_100km_actual', 'l_per_100km_norm', 'monthly_tco2e', 'service_status',
      'licence_expiry_date',
    ],
    suppressRowScalars: true,
  },
  fleet__telematics_driver_debrief_report: {
    rowsField: 'fleet_debrief_rows',
    containerKeys: ['debriefs'],
    rowFields: [
      'report_date', 'depot_name', 'driver_name', 'vehicle_registration', 'route_name',
      'planned_stops', 'actual_stops', 'customer_hit_percent', 'distance_km',
      'driving_hours', 'idling_hours', 'harsh_events_count', 'speeding_events_count',
      'fatigue_events_count',
    ],
    suppressRowScalars: true,
  },
  // The four stream columns are ALSO the site totals on the same report, so the
  // top-level figures must still be read.
  waste__contractor_report_safe_disposal_certificate: {
    rowsField: 'waste_stream_rows',
    containerKeys: ['streams'],
    rowFields: ['waste_stream_type', 'waste_total_kg', 'waste_recycled_kg', 'waste_landfill_kg'],
    suppressRowScalars: false,
  },
  iso_environmental__aspects_and_impacts_register: {
    rowsField: 'iso_aspect_rows',
    containerKeys: ['aspects'],
    rowFields: [
      'activity_or_process', 'aspect_description', 'associated_impact',
      'significance_rating', 'is_significant_aspect', 'control_measure', 'responsible_owner',
    ],
    suppressRowScalars: true,
  },
  iso_environmental__environmental_legal_register: {
    rowsField: 'iso_legal_obligation_rows',
    containerKeys: ['obligations'],
    rowFields: [
      'legislation_name', 'legislation_section', 'applicable_requirement', 'compliance_status',
      'permit_or_licence_number', 'permit_issue_date', 'permit_expiry_date',
      'issuing_authority', 'responsible_owner',
    ],
    suppressRowScalars: true,
  },
  // The one genuinely two-dimensional table in the ESG set: race x gender per
  // occupational level, one row per level.
  employment_equity__eea2_eea4_report: {
    rowsField: 'ee_level_rows',
    containerKeys: ['levels'],
    rowFields: [
      'occupational_level', 'headcount_african_male', 'headcount_coloured_male',
      'headcount_indian_male', 'headcount_white_male', 'headcount_african_female',
      'headcount_coloured_female', 'headcount_indian_female', 'headcount_white_female',
      'headcount_foreign_male', 'headcount_foreign_female', 'headcount_disabled',
      'headcount_level_total',
    ],
    suppressRowScalars: true,
  },
  training__ofo_intervention_register: {
    rowsField: 'training_intervention_rows',
    containerKeys: ['interventions'],
    rowFields: [
      'ofo_code', 'occupation_title', 'programme_name', 'programme_category',
      'learners_count', 'learner_name', 'training_provider_name', 'is_accredited_provider',
      'seta_name', 'nqf_level', 'training_start_date', 'training_end_date',
      'training_duration', 'training_status', 'training_cost_rand',
    ],
    suppressRowScalars: true,
  },
  community_csi__csi_sed_spend_records: {
    rowsField: 'csi_initiative_rows',
    containerKeys: ['initiatives'],
    rowFields: [
      'initiative_name', 'initiative_month', 'beneficiary_name', 'beneficiary_type',
      'csi_spend_rand', 'csi_contribution_type', 'csi_category',
      'beneficiaries_reached_count', 'black_beneficiary_percent',
    ],
    suppressRowScalars: true,
  },
  board_governance__board_charter_and_composition: {
    rowsField: 'board_director_rows',
    containerKeys: ['directors'],
    rowFields: [
      'director_name', 'director_role', 'director_is_independent', 'director_gender',
      'director_race', 'director_appointment_date', 'committee_memberships',
    ],
    suppressRowScalars: true,
  },
  board_governance__committee_terms_of_reference_and_minutes: {
    rowsField: 'board_committee_rows',
    containerKeys: ['committees'],
    rowFields: [
      'committee_name', 'committee_terms_of_reference_present', 'committee_approval_date',
      'committee_chair_name', 'committee_members', 'committee_meetings_held',
      'committee_meeting_dates',
    ],
    suppressRowScalars: true,
  },
  board_governance__king_application_register: {
    rowsField: 'board_king_principle_rows',
    containerKeys: ['principles'],
    rowFields: [
      'king_principle_number', 'king_principle_name', 'king_principle_status',
      'king_principle_evidence', 'king_principle_action',
    ],
    suppressRowScalars: true,
  },
  ethics_compliance__regulatory_penalties_and_sanctions: {
    rowsField: 'ethics_penalty_rows',
    containerKeys: ['penalties'],
    rowFields: [
      'penalty_date', 'issuing_authority', 'penalty_reference', 'penalty_legislation',
      'penalty_description', 'penalty_amount_rand', 'penalty_status', 'remediation_action',
    ],
    suppressRowScalars: true,
  },
  risk_assurance__risk_register_including_climate: {
    rowsField: 'risk_register_rows',
    containerKeys: ['risks'],
    rowFields: [
      'risk_id', 'risk_description', 'risk_category', 'inherent_likelihood',
      'inherent_impact', 'control_status', 'residual_risk_rating', 'risk_owner',
      'mitigation_action',
    ],
    suppressRowScalars: true,
  },
  risk_assurance__ifrs_s1_s2_readiness_assessment: {
    rowsField: 'risk_ifrs_requirement_rows',
    containerKeys: ['requirements'],
    rowFields: [
      'ifrs_standard', 'ifrs_disclosure_requirement', 'ifrs_pillar',
      'ifrs_disclosure_status', 'ifrs_data_source', 'ifrs_action_required',
    ],
    suppressRowScalars: true,
  },
};

/** Every field that is a grid ROW column somewhere in the ESG matrix. */
const ESG_ROW_FIELDS: ReadonlySet<string> = new Set(
  Object.values(ESG_GRIDS).flatMap((grid) => grid.rowFields),
);

/** Every rows-field name the ESG grids emit. */
export const ESG_GRID_ROW_FIELDS: readonly string[] = Object.values(ESG_GRIDS).map((g) => g.rowsField);

/**
 * Every ESG spec whose evidence is a TABLE, with its grid.
 *
 * `gridForDocument` answers "is THIS spec grid-shaped"; this answers "which
 * specs are", which is the question a workbook sheet asks — a sheet arrives
 * with columns and no spec, and the shape has to be chosen from the catalogue
 * rather than looked up.
 */
export function esgGridDocuments(): Array<{ documentId: string; grid: DocumentGrid }> {
  return Object.entries(ESG_GRIDS).map(([documentId, grid]) => ({ documentId, grid }));
}

export interface DomainDefinition {
  domain: ExtractionDomain;
  matrix: readonly DomainDocument[];
  findDocumentById(id: string): DomainDocument | null;
  aliasIndex(): Array<{ alias: string; lower: string; doc: DomainDocument }>;
  /**
   * The first line of the extraction system prompt. Every other rule in that
   * prompt is about not inventing values and applies to both domains verbatim.
   */
  analystRole: string;
  /** Grid shape for a spec, or null when the spec returns a single record. */
  gridForDocument(documentId: string): DocumentGrid | null;
}

const BBBEE_DOMAIN: DomainDefinition = {
  domain: 'bbbee',
  matrix: VERIFICATION_DOCUMENT_MATRIX,
  findDocumentById,
  aliasIndex,
  analystRole: 'You are a B-BBEE verification analyst extracting evidence from a client document.',
  // Nothing in the B-BBEE matrix is grid-shaped; row evidence there comes from
  // sheetTableExtraction, which is unchanged.
  gridForDocument: () => null,
};

const ESG_DOMAIN: DomainDefinition = {
  domain: 'esg',
  matrix: ESG_DOCUMENT_MATRIX,
  findDocumentById: findEsgDocumentById,
  aliasIndex: esgAliasIndex,
  analystRole: 'You are an ESG assurance analyst extracting evidence from a client document.',
  gridForDocument: (documentId: string) => ESG_GRIDS[documentId] ?? null,
};

export function extractionDomain(domain: ExtractionDomain = 'bbbee'): DomainDefinition {
  return domain === 'esg' ? ESG_DOMAIN : BBBEE_DOMAIN;
}

/** Is this extracted field a grid row column (rather than a document-level value)? */
export function isEsgRowField(field: string): boolean {
  return ESG_ROW_FIELDS.has(field);
}

/**
 * Pull the row array out of a model reply.
 *
 * Prefers the container key the expert's prompt named, then falls back to ANY
 * array-of-objects whose rows carry at least one of the grid's row fields — a
 * model that returns `{"rows": [...]}` instead of `{"vehicles": [...]}` has
 * still answered the question, and losing a 134-vehicle register to a key name
 * would be the same silent-zero failure the pipeline exists to prevent.
 */
export function hoistGridRows(
  parsed: Record<string, unknown>,
  grid: DocumentGrid,
): Array<Record<string, unknown>> {
  const rowFields = new Set(grid.rowFields);

  const usable = (candidate: unknown): Array<Record<string, unknown>> | null => {
    if (!Array.isArray(candidate) || candidate.length === 0) return null;
    const rows = candidate.filter(
      (row): row is Record<string, unknown> => row !== null && typeof row === 'object' && !Array.isArray(row),
    );
    if (rows.length === 0) return null;
    if (!rows.some((row) => Object.keys(row).some((key) => rowFields.has(key)))) return null;
    // Drop rows that carry nothing — a trailing blank row in a register is
    // formatting, not a vehicle.
    const populated = rows.filter((row) =>
      Object.values(row).some((v) => v !== null && v !== undefined && String(v).trim() !== ''));
    return populated.length > 0 ? populated : null;
  };

  for (const key of grid.containerKeys) {
    const found = usable(parsed[key]);
    if (found) return found;
  }
  for (const [key, value] of Object.entries(parsed)) {
    if (key === 'exceptions') continue;
    const found = usable(value);
    if (found) return found;
  }
  return [];
}
