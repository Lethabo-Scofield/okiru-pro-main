/**
 * Strict allowlist of calculator keys the parser is permitted to emit.
 *
 * The safety contract requires that ontology data — especially fields the
 * Excel matrix loader derives for non-canonical document types — can never
 * inject an arbitrary calculator path. Only keys defined here may appear in a
 * `calculator_payload`, and each emitted value must match the expected runtime
 * type. Anything else is dropped and recorded as a rejected key.
 */

export type CalculatorValueType = 'string' | 'number' | 'iso_date';

export interface CalculatorKeySpec {
  key: string;
  type: CalculatorValueType;
  description: string;
}

export const CALCULATOR_KEY_ALLOWLIST: readonly CalculatorKeySpec[] = [
  // ── ESD / Procurement (supplier evidence) ──
  { key: 'supplier.name', type: 'string', description: 'Supplier legal/trading name' },
  { key: 'supplier.bee_level', type: 'number', description: 'Supplier B-BBEE status level (1-8)' },
  { key: 'supplier.black_ownership', type: 'number', description: 'Supplier black ownership percentage (0-100)' },
  { key: 'supplier.black_women_ownership', type: 'number', description: 'Supplier black women ownership percentage (0-100)' },
  { key: 'supplier.enterprise_type', type: 'string', description: 'Supplier enterprise type: eme | qse | generic' },
  { key: 'supplier.certificate_expiry', type: 'iso_date', description: 'Certificate expiry date (ISO yyyy-mm-dd)' },
  { key: 'supplier.affidavit_signed_date', type: 'iso_date', description: 'Affidavit signed date (ISO yyyy-mm-dd)' },
  { key: 'supplier.spend', type: 'number', description: 'Supplier spend amount excluding VAT' },

  // ── Ownership pillar ──
  { key: 'ownership.entity_name', type: 'string', description: 'Measured entity name' },
  { key: 'ownership.black_ownership', type: 'number', description: 'Black ownership / voting rights percentage (0-100)' },
  { key: 'ownership.black_women_ownership', type: 'number', description: 'Black women ownership percentage (0-100)' },

  // ── Management Control pillar ──
  { key: 'management.black_representation', type: 'number', description: 'Black representation percentage at the measured level (0-100)' },
  { key: 'management.black_women_representation', type: 'number', description: 'Black women representation percentage (0-100)' },

  // ── Skills Development pillar ──
  { key: 'skills.total_spend', type: 'number', description: 'Total skills development spend' },
  { key: 'skills.black_spend', type: 'number', description: 'Skills development spend on black employees' },

  // ── Socio-Economic Development pillar ──
  { key: 'sed.beneficiary_name', type: 'string', description: 'SED beneficiary name' },
  { key: 'sed.contribution', type: 'number', description: 'SED contribution amount' },

  // ────────────────────────────────────────────────────────────────────────
  // DERIVED FROM WHAT THE CALCULATORS ACTUALLY READ (Phase 1b).
  //
  // The list above was written to gate what the PARSER may emit. It was never a
  // description of what the SCORECARD consumes, so most of a scorecard was
  // unreachable however well extraction worked: the scanned Thandanani share
  // register yielded total_shares_in_issue, share_classes and holdings_table,
  // and all three reported `no_mapping` because there was nowhere to put them.
  //
  // Every key below corresponds to a field a calculator genuinely reads. The
  // drift guard in __tests__/parser/calculator_allowlist_coverage.test.ts fails
  // if a calculator input has no key here.
  // ────────────────────────────────────────────────────────────────────────

  // ── Ownership: the share register is a TABLE, and these are its columns ──
  { key: 'ownership.shareholder_name', type: 'string', description: 'Shareholder name (one per share-register row)' },
  { key: 'ownership.voting_rights', type: 'number', description: 'Voting rights percentage held (0-100)' },
  { key: 'ownership.economic_interest', type: 'number', description: 'Economic interest percentage held (0-100)' },
  { key: 'ownership.shareholding', type: 'number', description: 'Shareholding percentage (0-100)' },
  { key: 'ownership.total_shares_in_issue', type: 'number', description: 'Total shares in issue' },
  { key: 'ownership.shares_held', type: 'number', description: 'Shares held by this holder' },
  { key: 'ownership.company_value', type: 'number', description: 'Value of the enterprise (NAV / formal valuation)' },
  { key: 'ownership.race', type: 'string', description: 'Shareholder race: African | Coloured | Indian | White' },
  { key: 'ownership.gender', type: 'string', description: 'Shareholder gender' },
  { key: 'ownership.id_number', type: 'string', description: 'Shareholder SA ID number' },
  { key: 'ownership.is_black', type: 'string', description: 'Whether the holder qualifies as Black (Yes/No)' },

  // ── Management Control / Employment Equity: the employee register ──
  { key: 'management.employee_name', type: 'string', description: 'Employee or director name' },
  { key: 'management.designation', type: 'string', description: 'Occupational level / designation band' },
  { key: 'management.occupational_level', type: 'string', description: 'EEA occupational level' },
  { key: 'management.race', type: 'string', description: 'Employee race' },
  { key: 'management.gender', type: 'string', description: 'Employee gender' },
  { key: 'management.is_disabled', type: 'string', description: 'Whether the employee is disabled (Yes/No)' },
  { key: 'management.is_foreign', type: 'string', description: 'Whether the employee is a foreign national (Yes/No)' },
  { key: 'management.id_number', type: 'string', description: 'Employee SA ID number' },
  { key: 'management.salary', type: 'number', description: 'Employee remuneration' },
  { key: 'management.headcount', type: 'number', description: 'Total employee headcount' },

  // ── Skills Development ──
  { key: 'skills.leviable_amount', type: 'number', description: 'Leviable amount (SDL payroll base) — the skills denominator' },
  { key: 'skills.group_leviable_amount', type: 'number', description: 'Group leviable amount where measured at group level' },
  { key: 'skills.learner_name', type: 'string', description: 'Learner name on a training record' },
  { key: 'skills.programme_name', type: 'string', description: 'Learning programme name' },
  { key: 'skills.category_code', type: 'string', description: 'Learning programme category (A-G)' },
  { key: 'skills.total_cost', type: 'number', description: 'Total cost of a training record' },
  { key: 'skills.employment_status', type: 'string', description: 'Learner employment status (employed / unemployed)' },
  { key: 'skills.absorbed', type: 'string', description: 'Whether the learner was absorbed (Yes/No)' },
  { key: 'skills.training_manager_salary', type: 'number', description: 'Training manager salary (claimable overhead)' },
  { key: 'skills.training_overhead_cost', type: 'number', description: 'Training overhead cost' },

  // ── Preferential Procurement ──
  { key: 'procurement.tmps', type: 'number', description: 'Total Measured Procurement Spend — the PP denominator' },
  { key: 'procurement.supplier_name', type: 'string', description: 'Supplier name on a spend line' },
  { key: 'procurement.supplier_spend', type: 'number', description: 'Spend with this supplier, excluding VAT' },
  { key: 'procurement.supplier_bee_level', type: 'number', description: 'Supplier B-BBEE level (1-8)' },
  { key: 'procurement.supplier_black_ownership', type: 'number', description: 'Supplier black ownership percentage' },
  { key: 'procurement.supplier_black_women_ownership', type: 'number', description: 'Supplier black women ownership percentage' },
  { key: 'procurement.supplier_enterprise_type', type: 'string', description: 'Supplier size: eme | qse | generic' },
  { key: 'procurement.supplier_is_foreign', type: 'string', description: 'Whether the supplier is a foreign entity (Yes/No)' },

  // ── Enterprise & Supplier Development ──
  { key: 'esd.beneficiary_name', type: 'string', description: 'ESD beneficiary name' },
  { key: 'esd.contribution', type: 'number', description: 'ESD contribution amount' },
  { key: 'esd.contribution_type', type: 'string', description: 'Contribution type (grant, loan, discount, …)' },
  { key: 'esd.category', type: 'string', description: 'supplier_development | enterprise_development' },
  { key: 'esd.beneficiary_black_ownership', type: 'number', description: 'Beneficiary black ownership percentage' },

  // ── Socio-Economic Development ──
  { key: 'sed.contribution_type', type: 'string', description: 'SED contribution type' },
  { key: 'sed.black_participation', type: 'number', description: 'Percentage black participation among beneficiaries' },

  // ── Entity-level financials (denominators and eligibility) ──
  { key: 'entity.revenue', type: 'number', description: 'Annual revenue / turnover' },
  { key: 'entity.npat', type: 'number', description: 'Net profit after tax' },
  { key: 'entity.payroll', type: 'number', description: 'Total payroll' },
  { key: 'entity.registration_number', type: 'string', description: 'Company registration number' },
  { key: 'entity.vat_number', type: 'string', description: 'SARS VAT registration number of the measured entity' },
  { key: 'entity.financial_year_end', type: 'iso_date', description: 'Financial year end' },
  { key: 'entity.eap_province', type: 'string', description: 'Province used for EAP targets' },
] as const;

const ALLOWLIST_BY_KEY = new Map<string, CalculatorKeySpec>(
  CALCULATOR_KEY_ALLOWLIST.map((spec) => [spec.key, spec]),
);

export function isAllowedCalculatorKey(key: string): boolean {
  return ALLOWLIST_BY_KEY.has(key);
}

export function calculatorKeySpec(key: string): CalculatorKeySpec | undefined {
  return ALLOWLIST_BY_KEY.get(key);
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Returns true only when `value` is a concrete, non-empty value of the exact
 * runtime type the calculator key expects. Rejects null/undefined/NaN, wrong
 * types, and malformed ISO dates.
 */
export function calculatorValueMatchesType(type: CalculatorValueType, value: unknown): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string' && value.trim().length > 0;
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'iso_date':
      return typeof value === 'string' && ISO_DATE_RE.test(value) && !Number.isNaN(new Date(value).getTime());
    default:
      return false;
  }
}

export interface CalculatorAllowlistResult {
  accepted: boolean;
  reason?: 'unknown_key' | 'type_mismatch' | 'empty_value';
}

/** Decides whether a single (key, value) pair may enter the calculator payload. */
export function admitCalculatorEntry(key: string, value: unknown): CalculatorAllowlistResult {
  const spec = ALLOWLIST_BY_KEY.get(key);
  if (!spec) return { accepted: false, reason: 'unknown_key' };
  if (value == null) return { accepted: false, reason: 'empty_value' };
  if (!calculatorValueMatchesType(spec.type, value)) return { accepted: false, reason: 'type_mismatch' };
  return { accepted: true };
}
