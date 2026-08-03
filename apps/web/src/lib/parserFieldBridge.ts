/**
 * The last link: parser field names → workbook columns.
 *
 * The parser speaks the B-BBEE expert's vocabulary (`holder_name`,
 * `total_pre_exclusions_tmps`, `declared_race`) because that is what the
 * 109-document matrix asks for. The workbook speaks its own column keys
 * (`shareholderName`, `tmps`, `race`). Neither should change to suit the other:
 * the matrix belongs to the expert and the columns belong to the workbook.
 *
 * So this is the translation, and it is deliberately EXPLICIT — one line per
 * field. An unmapped parser field is reported as unmapped rather than guessed
 * at, for the same reason a dropdown never guesses: a wrong cell scores
 * silently.
 *
 * REQUIRED-FIELD HUNTING is the other half. Knowing a row is missing
 * `supplierName` is worth more than knowing it has `spend`, because a
 * procurement row without a supplier name is not evidence of anything. So this
 * module reports, per section, exactly which REQUIRED columns are still unfilled
 * and what to ask the client for.
 */
import { getSection } from "@/components/workbook/sections";

export type WorkbookSectionKey =
  | "ownership"
  | "management-control"
  | "skills-development"
  | "procurement"
  | "esd"
  | "sed"
  | "financial-information"
  | "company-information";

export interface FieldTarget {
  section: WorkbookSectionKey;
  column: string;
  /** True when the value belongs in the section's meta, not a grid row. */
  meta?: boolean;
}

/**
 * Parser field name → where it goes in the workbook.
 *
 * Only unambiguous mappings appear here. A parser field whose meaning depends
 * on the document it came from (e.g. `entity_name`, which is the measured
 * entity on one document and a supplier on another) is resolved by the caller
 * passing the element, not guessed at here.
 */
const FIELD_TARGETS: Record<string, FieldTarget> = {
  // ── Ownership (share register is a grid, one row per holder) ──
  holder_name: { section: "ownership", column: "shareholderName" },
  shareholder_name: { section: "ownership", column: "shareholderName" },
  number_of_shares: { section: "ownership", column: "numberOfShares" },
  shareholding: { section: "ownership", column: "shareholding" },
  voting_rights: { section: "ownership", column: "votingRights" },
  voting_rights_percentage: { section: "ownership", column: "votingRights" },
  economic_interest: { section: "ownership", column: "economicInterest" },
  total_economic_interest_received: { section: "ownership", column: "economicInterest" },
  black_ownership_percentage: { section: "ownership", column: "blackOwnership" },
  black_women_ownership_percentage: { section: "ownership", column: "blackWomenOwnership" },

  // ── Management control / employment equity (one row per person) ──
  // race / gender / id_number are NOT here: they exist under the same column key
  // in ownership, management-control AND skills, so they are routed by element
  // (see ROW_FIELD_BY_ELEMENT) — a share register's race must land on the
  // shareholder, not on a phantom employee.
  employee_name: { section: "management-control", column: "name" },
  full_name: { section: "management-control", column: "name" },
  surname: { section: "management-control", column: "surname" },
  occupational_level: { section: "management-control", column: "occupationalLevel" },
  // The Foreign-national flag: EE targets measure the SA workforce, so the
  // calculators exclude foreigners — losing this flag counts them.
  foreign: { section: "management-control", column: "isForeign" },
  is_foreign: { section: "management-control", column: "isForeign" },
  designation: { section: "management-control", column: "designation" },
  job_title: { section: "management-control", column: "designation" },
  salary: { section: "management-control", column: "salary" },

  // ── Skills development (one row per learner/programme) ──
  learner_name: { section: "skills-development", column: "learnerName" },
  programme_name: { section: "skills-development", column: "programName" },
  program_name: { section: "skills-development", column: "programName" },
  category_code: { section: "skills-development", column: "categoryCode" },
  training_provider: { section: "skills-development", column: "trainingProvider" },
  // The learner-schedule table carries the spend per learner; without this it
  // was extracted and then dropped as unmapped, and Skills scored on nothing.
  total_cost: { section: "skills-development", column: "totalCost" },
  training_cost: { section: "skills-development", column: "totalCost" },
  course_cost: { section: "skills-development", column: "courseCost" },

  // ── Preferential procurement (one row per supplier) ──
  supplier_name: { section: "procurement", column: "supplierName" },
  // A sworn EME/QSE affidavit names the supplier `supplier_entity`, and a
  // verification certificate states the level as `certificate_recognition_level`
  // — the expert's field names on the two most common supplier evidence PDFs.
  // Without these a certificate produced a level with no name attached to it.
  supplier_entity: { section: "procurement", column: "supplierName" },
  registration_number: { section: "procurement", column: "registrationNumber" },
  vat_number: { section: "procurement", column: "vatNumber" },
  bee_status_level: { section: "procurement", column: "bbbeeLevel" },
  bee_level: { section: "procurement", column: "bbbeeLevel" },
  certificate_recognition_level: { section: "procurement", column: "bbbeeLevel" },
  // Supplier size (EME / QSE / Generic) — the schedule's own "Supplier
  // Classification" column, needed for the EME/QSE procurement lines.
  supplier_classification: { section: "procurement", column: "currentSize" },
  supplier_size: { section: "procurement", column: "currentSize" },
  current_size: { section: "procurement", column: "currentSize" },
  empowering_supplier: { section: "procurement", column: "empoweringSupplier" },
  empowering_supplier_confirmed: { section: "procurement", column: "empoweringSupplier" },
  claimed_spend_ex_vat: { section: "procurement", column: "spend" },
  amount_ex_vat: { section: "procurement", column: "spend" },
  certificate_expiry_date: { section: "procurement", column: "certificateExpiryDate" },
  expiry_date: { section: "procurement", column: "certificateExpiryDate" },

  // ── Enterprise & supplier development ──
  // contribution_value / beneficiary_name are element-scoped (ESD vs SED share
  // them) — see ELEMENT_SCOPED.
  contribution_description: { section: "esd", column: "contributionDescription" },

  // ── Socio-economic development ──
  beneficiary_or_intermediary_name: { section: "sed", column: "beneficiaryName" },
  black_beneficiary_percentage_declared: { section: "sed", column: "percentBenefitingBlack" },
  black_beneficiary_percentage_concluded: { section: "sed", column: "percentBenefitingBlack" },

  // ── Entity-level META fields (not grid rows) ──
  total_pre_exclusions_tmps: { section: "financial-information", column: "tmps", meta: true },
  // The Finance sheet's own labelled post-exclusion TMPS (deterministic read).
  total_measured_procurement_spend: { section: "financial-information", column: "tmps", meta: true },
  sum_of_leviable_amount: { section: "financial-information", column: "payroll", meta: true },
  current_year_revenue: { section: "financial-information", column: "revenue", meta: true },
  current_year_npat: { section: "financial-information", column: "npat", meta: true },
  total_entity_value: { section: "ownership", column: "companyValue", meta: true },
};

/**
 * Contribution type and amount are shared between ESD and SED, so they are
 * resolved by the element the value came from rather than by name alone.
 */
const ELEMENT_SCOPED: Record<string, Partial<Record<"ESD" | "SED", FieldTarget>>> = {
  contribution_type: {
    ESD: { section: "esd", column: "contributionType" },
    SED: { section: "sed", column: "contributionType" },
  },
  amount: {
    ESD: { section: "esd", column: "amount" },
    SED: { section: "sed", column: "amount" },
  },
  contribution_amount: {
    ESD: { section: "esd", column: "amount" },
    SED: { section: "sed", column: "amount" },
  },
  contribution_value: {
    ESD: { section: "esd", column: "amount" },
    SED: { section: "sed", column: "amount" },
  },
  // Proof-of-payment documents name their figure `amount_paid` in both pillars.
  amount_paid: {
    ESD: { section: "esd", column: "amount" },
    SED: { section: "sed", column: "amount" },
  },
  // A beneficiary is an ED/SD beneficiary or an SED beneficiary depending on
  // which element's document named them. The ESD grid's beneficiary column is
  // `supplierName` ("Beneficiary / Supplier"). Previously this was hard-mapped
  // to SED, which dropped enterprise-development beneficiaries into the wrong
  // pillar's grid.
  beneficiary_name: {
    ESD: { section: "esd", column: "supplierName" },
    SED: { section: "sed", column: "beneficiaryName" },
  },
  // The SED beneficiary affidavit names the organisation `organisation`; too
  // generic to map outside a SED document.
  organisation: {
    SED: { section: "sed", column: "beneficiaryName" },
  },
  // Transaction dates were unmapped, which dropped the one cell that tells two
  // repeated donations to the same beneficiary apart (and that the exact-
  // duplicate collapse relies on).
  transaction_date: {
    ESD: { section: "esd", column: "dateOfTransaction" },
    SED: { section: "sed", column: "dateOfTransaction" },
  },
  date_of_transaction: {
    ESD: { section: "esd", column: "dateOfTransaction" },
    SED: { section: "sed", column: "dateOfTransaction" },
  },
  contribution_date: {
    ESD: { section: "esd", column: "dateOfTransaction" },
    SED: { section: "sed", column: "dateOfTransaction" },
  },
  date_of_contribution: {
    ESD: { section: "esd", column: "dateOfTransaction" },
    SED: { section: "sed", column: "dateOfTransaction" },
  },
  // The per-line description (bursaries, HIV, poverty alleviation …) — this is
  // what distinguishes one monthly contribution to a beneficiary from the next.
  description_of_contribution: {
    ESD: { section: "esd", column: "contributionDescription" },
    SED: { section: "sed", column: "descriptionOfSpend" },
  },
};

/** Element name (matrix vocabulary) → the workbook section that element's grid rows belong in. */
const ELEMENT_SECTION: Partial<Record<string, WorkbookSectionKey>> = {
  OWNERSHIP: "ownership",
  MANAGEMENT_CONTROL: "management-control",
  SKILLS_DEVELOPMENT: "skills-development",
  ESD: "esd",
  SED: "sed",
};

/**
 * Row-level demographic fields that exist under the SAME column key in more than
 * one pillar's grid: a share register, an employee register and a training
 * schedule all carry race / gender / ID. The column key is fixed; only the
 * SECTION depends on which document the row came from. Routing these by element
 * keeps a scalar `race` on an ownership document out of Management Control
 * (where a single hard-coded mapping used to send it, scoring a phantom
 * employee and leaving the shareholder raceless).
 */
const ROW_FIELD_BY_ELEMENT: Record<string, { column: string; defaultSection: WorkbookSectionKey }> = {
  race: { column: "race", defaultSection: "management-control" },
  declared_race: { column: "race", defaultSection: "management-control" },
  gender: { column: "gender", defaultSection: "management-control" },
  derived_gender: { column: "gender", defaultSection: "management-control" },
  id_number: { column: "idNumber", defaultSection: "management-control" },
};

/** Where does this parser field belong? Null when we were never taught. */
export function targetForField(field: string, element?: string): FieldTarget | null {
  const scoped = ELEMENT_SCOPED[field];
  if (scoped) {
    const byElement = element === "ESD" || element === "SED" ? scoped[element] : undefined;
    // Ambiguous without an element — better unmapped than in the wrong pillar.
    return byElement ?? null;
  }

  // Element-routed demographic fields: same column, section chosen by the
  // document's element (defaulting to Management Control when none is given).
  const rowField = ROW_FIELD_BY_ELEMENT[field];
  if (rowField) {
    const section = (element && ELEMENT_SECTION[element]) || rowField.defaultSection;
    return { section, column: rowField.column };
  }

  return FIELD_TARGETS[field] ?? null;
}

export interface RequiredGap {
  section: WorkbookSectionKey;
  /** Column key, for code. */
  column: string;
  /** Column label, for humans. */
  label: string;
}

/**
 * Which REQUIRED columns of a section are still unfilled?
 *
 * This is the question worth asking loudly. A procurement row without
 * `supplierName` is not evidence of anything, however many other cells it has,
 * and a row that quietly fails a required check is how a pillar scores zero
 * with a full-looking grid behind it.
 */
export function requiredGapsForRow(
  section: WorkbookSectionKey,
  cells: Record<string, unknown>,
  options: { sectorCode?: string; scorecardType?: string } = {},
): RequiredGap[] {
  const def = getSection(section, options.sectorCode, options.scorecardType);
  return (def?.columns ?? [])
    .filter((column) => column.required)
    .filter((column) => {
      const value = cells[column.key];
      return value === undefined || value === null || String(value).trim() === "";
    })
    .map((column) => ({ section, column: column.key, label: column.label }));
}

export interface CoverageReport {
  /** Required columns still unfilled, across every section with a row. */
  gaps: RequiredGap[];
  /** Parser fields we have no mapping for — reported, never guessed. */
  unmapped: string[];
  /** True when every section that has data has all its required columns. */
  complete: boolean;
}

/**
 * Hunt required fields across a whole set of injected rows.
 *
 * Reports the gaps that will actually cost points, so the UI can ask the client
 * for the specific missing thing rather than telling them "some data is
 * missing".
 */
export function huntRequiredFields(
  rowsBySection: Partial<Record<WorkbookSectionKey, Array<Record<string, unknown>>>>,
  unmappedFields: string[] = [],
  options: { sectorCode?: string; scorecardType?: string } = {},
): CoverageReport {
  const gaps: RequiredGap[] = [];

  for (const [section, rows] of Object.entries(rowsBySection)) {
    for (const row of rows ?? []) {
      // An entirely empty row is not a gap, it is an absence — do not report
      // every required column of a row nobody tried to fill.
      const hasAnything = Object.entries(row).some(([k, v]) =>
        k !== "_id" && v !== undefined && v !== null && String(v).trim() !== "");
      if (!hasAnything) continue;

      gaps.push(...requiredGapsForRow(section as WorkbookSectionKey, row, options));
    }
  }

  // Collapse duplicates: ten supplier rows all missing a name is ONE thing to
  // tell the user, not ten.
  const seen = new Set<string>();
  const unique = gaps.filter((gap) => {
    const key = `${gap.section}.${gap.column}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { gaps: unique, unmapped: unmappedFields, complete: unique.length === 0 };
}
