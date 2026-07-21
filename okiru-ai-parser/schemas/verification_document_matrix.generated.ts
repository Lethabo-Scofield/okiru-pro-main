/**
 * GENERATED FILE — DO NOT EDIT BY HAND.
 * Run `pnpm gen:matrix` after changing the source workbook.
 *
 * Source: docs/testdocs/BBBEE_Verification_Document_Matrix_v3 (1) (1).xlsx
 * Generated: 109 documents across 5 elements,
 * 109 of them carrying a parsed extraction schema.
 *
 * The matrix is organised by the AMENDED five-element codes. Sectors on the
 * legacy seven-element framework (e.g. Transport) split Management Control and
 * Employment Equity, so consumers must map ELEMENT → pillar per sector rather
 * than assuming a 1:1 correspondence.
 */
import type { VerificationDocument } from './verification_document_matrix.js';

export const VERIFICATION_DOCUMENT_MATRIX: readonly VerificationDocument[] = [
  {
    "id": "ownership__sa_id_document_certified_copy_black_shareholders",
    "element": "OWNERSHIP",
    "name": "SA ID document / certified copy — black shareholders",
    "aliases": [
      "SA ID document / certified copy — black shareholders",
      "SA ID document / certified copy",
      "SA ID document",
      "certified copy"
    ],
    "auditorTests": "Confirms the natural person qualifies as 'Black' per the Amended Codes definition. Auditor checks ID number for SA citizenship, inspects the photo to match the person, and confirms the document is original or a certified copy dated within 3 months.",
    "exampleData": "SA ID 8506121234084 — Mr T. Mokoena. Photo legible, document scanned in colour, certified copy stamp dated 14 Feb 2026 by SAPS Sandton. Race per accompanying declaration: African.",
    "extractionPrompt": "You are a B-BBEE Ownership auditor. Inspect the attached SA ID document for shareholder [NAME]. Verify: (1) ID number is a valid 13-digit SA ID and the citizenship digit (position 11) = 0; (2) certified copy stamp is present and dated within the last 3 months; (3) photo is legible. Return a JSON object with fields: id_number, citizenship_status, certified_date, certification_within_3_months (bool), photo_legible (bool), race_declared, exceptions (list). Flag any field that fails as an exception.",
    "expectedFields": [
      "id_number",
      "citizenship_status",
      "certified_date",
      "certification_within_3_months",
      "photo_legible",
      "race_declared",
      "exceptions"
    ]
  },
  {
    "id": "ownership__birth_certificate_where_id_unavailable",
    "element": "OWNERSHIP",
    "name": "Birth certificate (where ID unavailable)",
    "aliases": [
      "Birth certificate (where ID unavailable)",
      "Birth certificate"
    ],
    "auditorTests": "Alternative to ID to confirm citizenship and race classification where an original ID has not been issued or has been lost.",
    "exampleData": "Unabridged birth certificate issued by DHA on 03 Jun 2024 for Ms N. Dlamini, born 12 May 1998, ID not yet issued. Parents' names and SA citizenship recorded.",
    "extractionPrompt": "Inspect the attached birth certificate for [NAME] used in place of an SA ID. Verify: (1) document is an unabridged certificate issued by the Department of Home Affairs; (2) it records SA citizenship of the individual or parents; (3) race classification can be confirmed via supporting declaration. Return a JSON object with: full_name, date_of_birth, citizenship_basis, issuing_authority, exceptions (list).",
    "expectedFields": [
      "full_name",
      "date_of_birth",
      "citizenship_basis",
      "issuing_authority",
      "exceptions"
    ]
  },
  {
    "id": "ownership__cipc_registration_documents_cor14_1_cor14_3",
    "element": "OWNERSHIP",
    "name": "CIPC registration documents (COR14.1 / COR14.3)",
    "aliases": [
      "CIPC registration documents (COR14.1 / COR14.3)",
      "CIPC registration documents",
      "COR14.1",
      "COR14.3"
    ],
    "auditorTests": "Confirms the legal identity, registration number, and entity type of the Measured Entity and any juristic BEE participant. Auditor traces the registration number to the ownership organogram.",
    "exampleData": "COR14.3 — Acme Holdings (Pty) Ltd, registration number 2018/123456/07, incorporation date 14 Mar 2018, registered office: 12 Rivonia Road, Sandton. CIPC stamp visible.",
    "extractionPrompt": "Inspect the attached CIPC COR14.1 / COR14.3 for the Measured Entity. Extract and return JSON: entity_name, registration_number, incorporation_date, entity_type, registered_address, cipc_stamp_present (bool), exceptions. Confirm the registration number matches the number used in the ownership organogram (provided separately as [ORGANOGRAM_REF]).",
    "expectedFields": [
      "entity_name",
      "registration_number",
      "incorporation_date",
      "entity_type",
      "registered_address",
      "cipc_stamp_present",
      "exceptions"
    ]
  },
  {
    "id": "ownership__cipc_cor39_certificate_of_director_amendments",
    "element": "OWNERSHIP",
    "name": "CIPC COR39 — certificate of director amendments",
    "aliases": [
      "CIPC COR39 — certificate of director amendments",
      "CIPC COR39",
      "COR39"
    ],
    "auditorTests": "Confirms the current directors on record. Auditor agrees directors claimed under board participation on the scorecard against the COR39 to detect phantom or removed directors being claimed.",
    "exampleData": "COR39 dated 18 Feb 2026 — current directors: T. Mokoena (appointed 01/04/2022), R. Smith (appointed 15/06/2020), N. Dlamini (appointed 10/01/2025). One resignation: P. Khoza, resigned 30/11/2025.",
    "extractionPrompt": "Inspect the attached CIPC COR39. Extract a list of all current directors with: full_name, ID_number_last_4, appointment_date, status (active / resigned), resignation_date_if_any. Then compare against the scorecard claim list (provided as [SCORECARD_DIRECTORS]) and return a reconciliation table: directors_on_COR39_only, directors_on_scorecard_only, matched_directors. Flag phantom directors.",
    "expectedFields": [
      "full_name",
      "ID_number_last_4",
      "appointment_date",
      "status",
      "resignation_date_if_any",
      "directors_on_scorecard_only",
      "matched_directors"
    ]
  },
  {
    "id": "ownership__securities_share_register",
    "element": "OWNERSHIP",
    "name": "Securities / share register",
    "aliases": [
      "Securities / share register",
      "Securities",
      "share register"
    ],
    "auditorTests": "Primary source for all shares in issue by class, holder name, and number held. Auditor: (1) agrees total shares to AFS note on share capital; (2) agrees each BEE participant's holding to their share certificate; (3) confirms no shares are pledged in a way that strips beneficial ownership.",
    "exampleData": "Securities register: 1,000,000 ordinary shares in issue. T. Mokoena — 350,000 (35%); BEE Trust — 150,000 (15%); J. Patel — 500,000 (50%). All ordinary. No pledges recorded.",
    "extractionPrompt": "Inspect the attached securities / share register as at Measurement Date [DATE]. Extract: total_shares_in_issue, share_classes (list), and a holdings_table with columns: shareholder_name, share_class, number_of_shares, percentage, pledge_or_encumbrance_noted (bool). Reconcile total_shares against the AFS share capital note ([AFS_SHARES]). Identify any pledge or cession that may strip beneficial ownership from a BEE participant.",
    "expectedFields": [
      "total_shares_in_issue",
      "share_classes",
      "holdings_table",
      "share_class",
      "number_of_shares",
      "percentage",
      "pledge_or_encumbrance_noted"
    ]
  },
  {
    "id": "ownership__share_certificates_security_certificates_held_by_each_bee_pa",
    "element": "OWNERSHIP",
    "name": "Share certificates / security certificates held by each BEE participant",
    "aliases": [
      "Share certificates / security certificates held by each BEE participant",
      "Share certificates",
      "security certificates held by each BEE participant"
    ],
    "auditorTests": "Physical proof of ownership. Auditor traces certificate number, shareholder name, class of share, and number of shares to the securities register. Any mismatch is flagged as a misstatement.",
    "exampleData": "Share certificate #017 — 150,000 ordinary shares issued to The Mokoena Family Trust, IT 4567/2020, dated 01 April 2022, signed by company secretary.",
    "extractionPrompt": "Inspect each attached share certificate held by a BEE participant. For each certificate return JSON with: certificate_number, holder_name, share_class, number_of_shares, issue_date, signed_by, matches_share_register (bool, against [REGISTER_REF]). Flag any mismatch as a misstatement.",
    "expectedFields": [
      "certificate_number",
      "holder_name",
      "share_class",
      "number_of_shares",
      "issue_date",
      "signed_by",
      "matches_share_register"
    ]
  },
  {
    "id": "ownership__memorandum_of_incorporation_moi",
    "element": "OWNERSHIP",
    "name": "Memorandum of Incorporation (MOI)",
    "aliases": [
      "Memorandum of Incorporation (MOI)",
      "Memorandum of Incorporation",
      "MOI"
    ],
    "auditorTests": "Defines economic interest and voting rights attaching to each share class. Auditor checks for preference shares, deferred voting rights, restricted dividend rights, or any clause that dilutes black participants' effective ownership beyond the face percentage.",
    "exampleData": "MOI dated 14 Mar 2018. Clause 4.2 — one ordinary share = one vote. No preference shares. Clause 8 — dividends declared pro-rata to ordinary shareholding. No restricted-rights provisions identified.",
    "extractionPrompt": "Read the attached MOI. Identify clauses affecting economic interest and voting rights of black participants. Return JSON: share_classes_defined, voting_rights_per_class, dividend_rights_per_class, preference_shares_present (bool), restrictive_clauses (list with clause reference and substance), dilution_risk_flags (list with reasoning).",
    "expectedFields": [
      "share_classes_defined",
      "voting_rights_per_class",
      "dividend_rights_per_class",
      "preference_shares_present",
      "restrictive_clauses",
      "dilution_risk_flags"
    ]
  },
  {
    "id": "ownership__shareholders_agreement_where_it_exists",
    "element": "OWNERSHIP",
    "name": "Shareholders' agreement (where it exists)",
    "aliases": [
      "Shareholders' agreement (where it exists)",
      "Shareholders' agreement"
    ],
    "auditorTests": "Identifies put/call options, drag-along / tag-along rights, veto rights, and exit clauses. Auditor assesses whether any clause effectively transfers control or economic benefit away from the black participant before the shares are formally disposed of.",
    "exampleData": "Shareholders' agreement dated 01/04/2022. Clause 6 — put option to majority shareholder exercisable from year 5 at NAV. Clause 9 — drag-along rights triggered at 75% majority. No call option over BEE shares.",
    "extractionPrompt": "Read the attached shareholders' agreement. Identify and return JSON for each clause affecting BEE participants' rights: clause_number, clause_summary, type (put / call / drag-along / tag-along / veto / exit / other), affected_parties, fronting_risk_assessment (low / medium / high) with one-line reasoning. List clauses that may transfer control or economic benefit away from the black participant before formal disposal.",
    "expectedFields": [
      "clause_number",
      "clause_summary",
      "type",
      "affected_parties",
      "fronting_risk_assessment"
    ]
  },
  {
    "id": "ownership__audited_reviewed_annual_financial_statements_afs",
    "element": "OWNERSHIP",
    "name": "Audited / reviewed annual financial statements (AFS)",
    "aliases": [
      "Audited / reviewed annual financial statements (AFS)",
      "Audited",
      "reviewed annual financial statements",
      "AFS"
    ],
    "auditorTests": "Auditor: (1) agrees total shares in issue per share capital note to securities register; (2) identifies preference shares, convertible instruments, or derivatives that affect diluted ownership; (3) confirms acquisition debt disclosed as a liability is included in the Net Value calculation.",
    "exampleData": "AFS FYE 31 March 2026, signed 30 June 2026 by [auditor]. Share capital note 12: 1,000,000 ordinary shares issued. Note 18: acquisition debt of R12,500,000 held by BEE participant. Audit opinion: unqualified.",
    "extractionPrompt": "Inspect the attached AFS for FYE [DATE]. Extract JSON: audit_opinion, signing_auditor, signing_date, total_shares_in_issue (share capital note), preference_or_convertible_instruments (list), acquisition_debt_disclosed (amount), net_value_inputs (assets, liabilities, equity). Reconcile shares to securities register ([REGISTER_REF]). Flag dilutive instruments affecting ownership.",
    "expectedFields": [
      "audit_opinion",
      "signing_auditor",
      "signing_date",
      "total_shares_in_issue",
      "preference_or_convertible_instruments",
      "acquisition_debt_disclosed",
      "net_value_inputs"
    ]
  },
  {
    "id": "ownership__all_transaction_deal_documents_sale_of_equity_agreement_fund",
    "element": "OWNERSHIP",
    "name": "All transaction / deal documents (sale of equity agreement, funding agreement, preference share agreement, cession, pledge, option agreement)",
    "aliases": [
      "All transaction / deal documents (sale of equity agreement, funding agreement, preference share agreement, cession, pledge, option agreement)",
      "All transaction",
      "deal documents"
    ],
    "auditorTests": "Auditor confirms: transaction value, date, funding structure, conditions precedent met, and that any rights of ownership vest unconditionally in the black participant. Looks for back-to-back arrangements or nominee structures indicating fronting.",
    "exampleData": "Sale of Equity Agreement dated 01 April 2022, between Acme Holdings and Mokoena Family Trust. Consideration: R20m. Funding: R7.5m equity, R12.5m vendor finance. CPs all met by 30 June 2022. Rights of ownership vest unconditionally.",
    "extractionPrompt": "Read the attached transaction document(s). Extract JSON: transaction_date, parties, transaction_value, funding_structure (equity, third-party debt, vendor finance breakdown), conditions_precedent (list with met/not_met status), rights_vesting (unconditional / conditional with detail), nominee_or_back_to_back_indicators (list). Identify any fronting indicators with reasoning.",
    "expectedFields": [
      "transaction_date",
      "parties",
      "transaction_value",
      "funding_structure",
      "conditions_precedent",
      "rights_vesting",
      "nominee_or_back_to_back_indicators"
    ]
  },
  {
    "id": "ownership__financing_loan_agreement_for_third_party_funded_bee_acquisit",
    "element": "OWNERSHIP",
    "name": "Financing / loan agreement for third-party-funded BEE acquisition",
    "aliases": [
      "Financing / loan agreement for third-party-funded BEE acquisition",
      "Financing",
      "loan agreement for third-party-funded BEE acquisition"
    ],
    "auditorTests": "Establishes the quantum of acquisition debt. Auditor confirms outstanding balance as at Measurement Date, interest rate, repayment schedule, and whether debt is on market-related terms (inflated debt = fronting risk).",
    "exampleData": "Loan Agreement, ABSA Bank to Mokoena Family Trust, dated 01/04/2022. Principal R12,500,000. Interest prime + 1.5%. 7-year repayment, capital and interest from year 4. Security: cession of dividends.",
    "extractionPrompt": "Read the attached financing/loan agreement. Extract JSON: lender, borrower, principal_amount, interest_rate, repayment_term, repayment_schedule, security_provided, market_related_assessment (yes / no with reasoning). Flag inflated interest rate or non-market terms as a fronting risk.",
    "expectedFields": [
      "lender",
      "borrower",
      "principal_amount",
      "interest_rate",
      "repayment_term",
      "repayment_schedule",
      "security_provided",
      "market_related_assessment"
    ]
  },
  {
    "id": "ownership__financier_s_written_confirmation_of_outstanding_acquisition_",
    "element": "OWNERSHIP",
    "name": "Financier's written confirmation of outstanding acquisition debt",
    "aliases": [
      "Financier's written confirmation of outstanding acquisition debt"
    ],
    "auditorTests": "Auditor obtains this directly from the financier (bank, development finance institution) and agrees the confirmed balance to the entity's own financial statements. Discrepancies indicate the debt amount has been misstated.",
    "exampleData": "Letter from ABSA Business Bank, dated 28 Feb 2026, confirming outstanding balance on facility #BBE-2245 as R9,847,213.16 as at 31 December 2025. Signed by Relationship Manager [Name].",
    "extractionPrompt": "Inspect the financier confirmation letter. Extract JSON: financier_name, facility_reference, confirmed_balance, balance_as_at_date, signatory_name, signatory_role. Compare confirmed_balance to entity's AFS loan disclosure ([AFS_LOAN_BALANCE]) and return reconciliation_difference. Flag any discrepancy > 1% as a misstatement.",
    "expectedFields": [
      "financier_name",
      "facility_reference",
      "confirmed_balance",
      "balance_as_at_date",
      "signatory_name",
      "signatory_role"
    ]
  },
  {
    "id": "ownership__independent_competent_person_s_valuation_report",
    "element": "OWNERSHIP",
    "name": "Independent competent person's valuation report",
    "aliases": [
      "Independent competent person's valuation report"
    ],
    "auditorTests": "For unlisted equity: auditor reviews the report to confirm (1) valuator's qualifications and independence; (2) methodology (DCF, NAV, market comparable) is appropriate and has been tested for reasonability against at least one alternative approach; (3) concluded value is used in the Net Value formula.",
    "exampleData": "Independent Valuation Report by [Firm], FCA, dated 15 Feb 2026. Methodology: DCF cross-checked against EV/EBITDA market comparable. Concluded equity value R85m. Valuator confirms independence and no prior engagement.",
    "extractionPrompt": "Read the attached independent valuation report for the unlisted equity. Extract JSON: valuator_name, qualifications, independence_confirmed (bool), valuation_date, methodology_primary, methodology_cross_check, concluded_value, reasonability_assessment. Flag if only a single methodology is used or if valuator independence is not stated.",
    "expectedFields": [
      "valuator_name",
      "qualifications",
      "independence_confirmed",
      "valuation_date",
      "methodology_primary",
      "methodology_cross_check",
      "concluded_value",
      "reasonability_assessment"
    ]
  },
  {
    "id": "ownership__listed_share_price_data_for_listed_entities",
    "element": "OWNERSHIP",
    "name": "Listed share price data (for listed entities)",
    "aliases": [
      "Listed share price data (for listed entities)",
      "Listed share price data"
    ],
    "auditorTests": "Auditor obtains the closing price on Measurement Date from a published market data source and uses it as a reasonableness check against any independent valuation provided.",
    "exampleData": "JSE closing price on 28 February 2026 for [TICKER]: R142.50. Source: JSE official end-of-day data, downloaded 01 March 2026.",
    "extractionPrompt": "Confirm the closing share price for [TICKER] on Measurement Date [DATE]. Return JSON: ticker, measurement_date, closing_price, source, source_url, retrieval_date. If an independent valuation is also provided ([VALUATION_REF]), state the variance and reasonability conclusion.",
    "expectedFields": [
      "ticker",
      "measurement_date",
      "closing_price",
      "source",
      "source_url",
      "retrieval_date",
      "state"
    ]
  },
  {
    "id": "ownership__management_representation_letter_confirming_no_undisclosed_a",
    "element": "OWNERSHIP",
    "name": "Management representation letter confirming no undisclosed acquisition debt or options",
    "aliases": [
      "Management representation letter confirming no undisclosed acquisition debt or options"
    ],
    "auditorTests": "Auditor requests a written declaration from the Measured Entity and from each black participant separately, confirming no additional debt, notional debt, side agreements, or options exist that are not reflected in the deal documents.",
    "exampleData": "Management Representation Letter dated 30 Mar 2026, signed by CEO and CFO of Acme Holdings, confirming no undisclosed acquisition debt, no side agreements, no options, no notional debt. Separate letter from each black participant on identical terms.",
    "extractionPrompt": "Inspect each management representation letter. Return JSON per letter: signatory_name, signatory_role, signing_date, scope_of_declaration (list of items declared), entity_or_participant. Confirm one letter exists from the Measured Entity and one from each black participant. List any missing parties.",
    "expectedFields": [
      "signatory_name",
      "signatory_role",
      "signing_date",
      "scope_of_declaration",
      "entity_or_participant"
    ]
  },
  {
    "id": "ownership__ownership_organogram",
    "element": "OWNERSHIP",
    "name": "Ownership organogram",
    "aliases": [
      "Ownership organogram"
    ],
    "auditorTests": "Auditor maps each layer of the structure to apply the Flow-Through Principle first, then applies the Modified Flow-Through Principle only once. Checks that the organogram agrees to CIPC records and share registers at each level. Flags multiple applications of the Modified Flow-Through Principle as a fronting risk.",
    "exampleData": "Ownership organogram: Acme Holdings → 35% T. Mokoena (natural person, African male); 15% Mokoena Family Trust (BBOS, 100% black beneficiaries); 50% J. Patel (Indian male). Flow-Through applied at Trust layer; Modified Flow-Through not applied.",
    "extractionPrompt": "Inspect the attached ownership organogram. For each layer return JSON: layer_level, holder_name, holder_type (natural person / company / trust / fund), percentage_held, race_gender_if_natural_person, flow_through_applied (bool), modified_flow_through_applied (bool). Apply the Flow-Through Principle at every layer. The Modified Flow-Through Principle may be applied only once in the structure — flag any second application as a fronting risk. Reconcile each layer against the CIPC and share register references provided.",
    "expectedFields": [
      "layer_level",
      "holder_name",
      "holder_type",
      "percentage_held",
      "race_gender_if_natural_person",
      "flow_through_applied",
      "modified_flow_through_applied"
    ]
  },
  {
    "id": "ownership__segmental_analysis_in_afs_for_foreign_operations_exclusion",
    "element": "OWNERSHIP",
    "name": "Segmental analysis in AFS (for foreign operations exclusion)",
    "aliases": [
      "Segmental analysis in AFS (for foreign operations exclusion)",
      "Segmental analysis in AFS",
      "AFS"
    ],
    "auditorTests": "Auditor calculates the proportion of foreign operations to total entity value using the segmental note. This percentage is applied to issued Rights of Ownership to determine the quantum of exclusion before expressing black ownership as a percentage.",
    "exampleData": "AFS segmental note: Total entity value R450m. SA operations R315m (70%). Foreign operations R135m (30%). Foreign exclusion applied at 30% of issued rights before computing BEE %.",
    "extractionPrompt": "Read the AFS segmental analysis note. Extract JSON: total_entity_value, sa_operations_value, foreign_operations_value, foreign_proportion (calculated %), exclusion_applied_correctly (bool with reasoning). Recalculate the foreign-ops exclusion against issued rights of ownership.",
    "expectedFields": [
      "total_entity_value",
      "sa_operations_value",
      "foreign_operations_value",
      "foreign_proportion",
      "exclusion_applied_correctly"
    ]
  },
  {
    "id": "ownership__securities_register_confirmation_of_mandated_investments_pen",
    "element": "OWNERSHIP",
    "name": "Securities register / confirmation of Mandated Investments (pension funds, unit trusts)",
    "aliases": [
      "Securities register / confirmation of Mandated Investments (pension funds, unit trusts)",
      "Securities register",
      "confirmation of Mandated Investments"
    ],
    "auditorTests": "Auditor confirms: (1) each Mandated Investment is a genuine South African mandated investment; (2) excluded Rights of Ownership do not exceed 40% of total issued rights; (3) Modified Flow-Through Principle has not been applied on the same rights being excluded.",
    "exampleData": "Old Mutual confirmation letter: pension fund 'XYZ Retirement Fund' is a mandated SA investment holding 8% of Acme Holdings. Excluded under Mandated Investments. No MFTP applied on these shares.",
    "extractionPrompt": "Inspect the attached confirmation(s) of Mandated Investments. Return JSON per investment: investor_name, investment_type (pension / unit trust / other), sa_mandated_status (bool with basis), percentage_of_rights_excluded. Confirm cumulative mandated investments + similar exclusions do not exceed 40% of total issued rights. Flag any overlap with rights subject to MFTP.",
    "expectedFields": [
      "investor_name",
      "investment_type",
      "sa_mandated_status",
      "percentage_of_rights_excluded"
    ]
  },
  {
    "id": "ownership__trust_deed_bbos_constitution_esop_rules",
    "element": "OWNERSHIP",
    "name": "Trust deed / BBOS constitution / ESOP rules",
    "aliases": [
      "Trust deed / BBOS constitution / ESOP rules",
      "Trust deed",
      "BBOS constitution",
      "ESOP rules",
      "BBOS",
      "ESOP"
    ],
    "auditorTests": "Auditor confirms: (1) beneficiaries or classes are clearly named with fixed proportions — no trustee discretion to change allocations; (2) scheme meets all additional criteria in the Codes; (3) scheme accounts for ≤ 40% of total ownership points unless additional criteria are fully met; (4) total expenses ≤ 15% of total value received by BBOS.",
    "exampleData": "BBOS Trust Deed dated 12 May 2021. Beneficiaries: 50 named black employees, fixed proportions specified in Schedule A. Trustees have no discretion to vary. Scheme expenses capped at 14% in clause 11. Total scheme = 12% of ownership.",
    "extractionPrompt": "Read the attached Trust Deed / BBOS Constitution / ESOP Rules. Return JSON: scheme_type, beneficiary_specification (named / class with fixed proportions / discretionary), trustee_discretion_to_change_allocations (bool), expense_cap_in_deed (%), percentage_of_total_ownership_represented, additional_criteria_met (list with status for each criterion in the Codes). Flag any deviation as a points-disqualifying defect.",
    "expectedFields": [
      "scheme_type",
      "beneficiary_specification",
      "trustee_discretion_to_change_allocations",
      "expense_cap_in_deed",
      "percentage_of_total_ownership_represented",
      "additional_criteria_met"
    ]
  },
  {
    "id": "ownership__annual_master_of_the_high_court_confirmation_bbos",
    "element": "OWNERSHIP",
    "name": "Annual Master of the High Court confirmation (BBOS)",
    "aliases": [
      "Annual Master of the High Court confirmation (BBOS)",
      "Annual Master of the High Court confirmation",
      "BBOS"
    ],
    "auditorTests": "Confirms that at least 50% of trustees are black, 25% are black women, and the chairperson is independent. Auditor obtains this annually for the Measurement Period.",
    "exampleData": "Master of the High Court annual confirmation, dated 30 Jan 2026: 6 trustees in office; 4 are black (66.7%); 2 are black women (33.3%); chairperson Ms K. Mthembu is independent. All criteria met.",
    "extractionPrompt": "Inspect the Master of the High Court annual confirmation. Return JSON: confirmation_date, total_trustees, black_trustees, black_trustees_percentage, black_women_trustees, black_women_percentage, chairperson_name, chairperson_independent (bool). Confirm against thresholds: ≥50% black, ≥25% black women, independent chair.",
    "expectedFields": [
      "confirmation_date",
      "total_trustees",
      "black_trustees",
      "black_trustees_percentage",
      "black_women_trustees",
      "black_women_percentage",
      "chairperson_name",
      "chairperson_independent"
    ]
  },
  {
    "id": "ownership__annual_financial_statements_of_the_management_company_scheme",
    "element": "OWNERSHIP",
    "name": "Annual financial statements of the Management Company / scheme",
    "aliases": [
      "Annual financial statements of the Management Company / scheme",
      "Annual financial statements of the Management Company",
      "scheme"
    ],
    "auditorTests": "Auditor confirms: (1) expenses ≤ 15% of total economic interest received; (2) ≥ 85% of economic interest is allocated to black beneficiaries; (3) distributions made; (4) no undisclosed accumulated economic interest retained by management.",
    "exampleData": "Management Company AFS FYE 31 Dec 2025. Total economic interest received: R5,200,000. Expenses: R624,000 (12.0%). Distributed to beneficiaries: R4,576,000 (88.0%). No retained earnings.",
    "extractionPrompt": "Inspect the Management Company AFS for the scheme. Extract JSON: total_economic_interest_received, total_expenses, expenses_percentage, distributed_to_beneficiaries, distributed_percentage, retained_earnings. Confirm: expenses ≤ 15%, distributions ≥ 85%. Flag any undisclosed accumulated economic interest.",
    "expectedFields": [
      "total_economic_interest_received",
      "total_expenses",
      "expenses_percentage",
      "distributed_to_beneficiaries",
      "distributed_percentage",
      "retained_earnings",
      "distributions"
    ]
  },
  {
    "id": "ownership__independent_trustee_representation_letter_one_per_trustee_bb",
    "element": "OWNERSHIP",
    "name": "Independent trustee representation letter (one per trustee, BBOS)",
    "aliases": [
      "Independent trustee representation letter (one per trustee, BBOS)",
      "Independent trustee representation letter",
      "BBOS"
    ],
    "auditorTests": "Each trustee must personally sign a letter confirming they understand their fiduciary duties, the BBOS rules, and the consequences of fronting. Auditor holds a formal interview with each trustee before countersigning. Failure to interview any trustee means additional criteria points cannot be awarded.",
    "exampleData": "Trustee representation letter from each of 6 trustees, dated 15-22 Feb 2026, individually signed. Each confirms understanding of fiduciary duties, BBOS rules, and fronting consequences. Auditor interview log attached for all 6 trustees.",
    "extractionPrompt": "Inspect each trustee representation letter. Return JSON per trustee: trustee_name, letter_date, fiduciary_acknowledged (bool), bbos_rules_acknowledged (bool), fronting_consequences_acknowledged (bool), auditor_interview_completed (bool, with date). All trustees must be interviewed — list any trustee not yet interviewed.",
    "expectedFields": [
      "trustee_name",
      "letter_date",
      "fiduciary_acknowledged",
      "bbos_rules_acknowledged",
      "fronting_consequences_acknowledged",
      "auditor_interview_completed"
    ]
  },
  {
    "id": "ownership__sworn_affidavit_black_new_entrant",
    "element": "OWNERSHIP",
    "name": "Sworn affidavit — Black New Entrant",
    "aliases": [
      "Sworn affidavit — Black New Entrant",
      "Sworn affidavit"
    ],
    "auditorTests": "Confirms the individual has not participated in B-BBEE deals exceeding R50 million. Auditor applies professional judgement — checks the affidavit date, confirms it was sworn before a Commissioner of Oaths, and considers whether the individual's profile (listed directorship history, prior CIPC director filings) is consistent with the declaration. Status assessed at transaction date, not Measurement Date.",
    "exampleData": "Sworn affidavit by Mr T. Mokoena, dated 10 Feb 2026, before Commissioner of Oaths SAPS Sandton. Declares he has not participated in B-BBEE deals exceeding R50m cumulative. CIPC director history check attached showing two prior directorships, both SMEs.",
    "extractionPrompt": "Inspect the Black New Entrant affidavit and supporting director history. Return JSON: deponent_name, affidavit_date, transaction_date, sworn_before_commissioner (bool), prior_bee_deal_value_declared, cipc_director_history_consistent (bool with reasoning). Assess status at transaction_date, not Measurement Date. Flag any inconsistency between affidavit and CIPC history as professional-judgement risk.",
    "expectedFields": [
      "deponent_name",
      "affidavit_date",
      "transaction_date",
      "sworn_before_commissioner",
      "prior_bee_deal_value_declared",
      "cipc_director_history_consistent",
      "not"
    ]
  },
  {
    "id": "ownership__uif_records_bank_statements_employment_history_unemployed_de",
    "element": "OWNERSHIP",
    "name": "UIF records / bank statements / employment history (unemployed designated group member)",
    "aliases": [
      "UIF records / bank statements / employment history (unemployed designated group member)",
      "UIF records",
      "bank statements",
      "employment history",
      "UIF"
    ],
    "auditorTests": "Confirms the individual was unemployed at the relevant date. Auditor cross-references UIF records or bank statements showing absence of salary credits.",
    "exampleData": "UIF confirmation showing no employer contributions for ID 9805121234086 between Jan 2023 and the transaction date. Bank statement Jan-Mar 2023 shows no salary credits.",
    "extractionPrompt": "Inspect the UIF records and/or bank statements provided for [NAME]. Return JSON: id_number, period_covered, employer_contributions_found (list with dates / employers, or empty), salary_credits_found (list, or empty), unemployment_confirmed_at_relevant_date (bool). State the relevant date used.",
    "expectedFields": [
      "id_number",
      "period_covered",
      "employer_contributions_found",
      "salary_credits_found",
      "unemployment_confirmed_at_relevant_date"
    ]
  },
  {
    "id": "ownership__medical_records_disability_grant_confirmation_person_with_di",
    "element": "OWNERSHIP",
    "name": "Medical records / disability grant confirmation (person with disability)",
    "aliases": [
      "Medical records / disability grant confirmation (person with disability)",
      "Medical records",
      "disability grant confirmation"
    ],
    "auditorTests": "Confirms disability status per the Employment Equity Act definition. Auditor requires either a medical certificate from a registered medical practitioner or proof of a disability grant from the Department of Social Development.",
    "exampleData": "Medical certificate by Dr S. Naidoo, MBChB (Wits), HPCSA MP123456, dated 04 Feb 2026. Confirms permanent visual impairment per EE Act definition. SASSA disability grant award letter attached.",
    "extractionPrompt": "Inspect the medical evidence for disability claim of [NAME]. Return JSON: practitioner_name, hpcsa_number, certificate_date, condition_described, ee_act_disability_definition_met (bool with reasoning), supporting_grant_evidence_present (bool). Flag missing or expired certificates.",
    "expectedFields": [
      "practitioner_name",
      "hpcsa_number",
      "certificate_date",
      "condition_described",
      "ee_act_disability_definition_met",
      "supporting_grant_evidence_present"
    ]
  },
  {
    "id": "ownership__letter_from_tribal_chief_proof_of_postal_address_in_rural_ar",
    "element": "OWNERSHIP",
    "name": "Letter from tribal chief / proof of postal address in rural area",
    "aliases": [
      "Letter from tribal chief / proof of postal address in rural area",
      "Letter from tribal chief",
      "proof of postal address in rural area"
    ],
    "auditorTests": "Confirms the individual's rural or underdeveloped-area residence. Auditor assesses the authenticity and date of the letter.",
    "exampleData": "Letter from Inkosi N. Zulu, Nongoma Traditional Council, dated 18 Jan 2026, confirming residence of Mr S. Khumalo at KwaNongoma. Stamp of council affixed. Postal address proof: Post Office box receipt.",
    "extractionPrompt": "Inspect the letter confirming rural residence. Return JSON: deponent_name, deponent_role, council_or_authority, letter_date, individual_name, area_confirmed, supporting_postal_proof (bool), authenticity_assessment (low / medium / high concern with reasoning).",
    "expectedFields": [
      "deponent_name",
      "deponent_role",
      "council_or_authority",
      "letter_date",
      "individual_name",
      "area_confirmed",
      "supporting_postal_proof",
      "authenticity_assessment"
    ]
  },
  {
    "id": "ownership__id_document_age_confirmation_black_youth",
    "element": "OWNERSHIP",
    "name": "ID document + age confirmation — black youth",
    "aliases": [
      "ID document + age confirmation — black youth",
      "ID document + age confirmation"
    ],
    "auditorTests": "Confirms the individual is between 18 and 35 (National Youth Commission Act 1996). Auditor extracts date of birth from the ID number (digits 1–6: YYMMDD) and calculates age as at transaction date.",
    "exampleData": "ID 9805121234086. Date of birth derived: 12 May 1998. Age at transaction date (01 April 2022): 23 years and 10 months. Qualifies as black youth (18-35).",
    "extractionPrompt": "Confirm youth status of [NAME] at transaction date [DATE]. Extract YYMMDD from positions 1-6 of the ID. Return JSON: id_number, derived_dob, transaction_date, age_at_transaction_years, age_at_transaction_months, qualifies_as_youth (bool, 18 ≤ age ≤ 35). Show the calculation.",
    "expectedFields": [
      "id_number",
      "derived_dob",
      "transaction_date",
      "age_at_transaction_years",
      "age_at_transaction_months",
      "qualifies_as_youth"
    ]
  },
  {
    "id": "ownership__dti_exemption_certificate_equity_equivalent_programme",
    "element": "OWNERSHIP",
    "name": "DTI exemption certificate (equity equivalent programme)",
    "aliases": [
      "DTI exemption certificate (equity equivalent programme)",
      "DTI exemption certificate"
    ],
    "auditorTests": "Auditor confirms authenticity directly with the DTI (phone or written confirmation), reviews the business plan milestones, confirms cumulative contributions since exemption was granted, and obtains or performs a standard valuation.",
    "exampleData": "DTI Exemption Certificate ref EE/2024/0078 dated 12 Mar 2024, valid for the Equity Equivalent Programme of [Multinational]. Business plan with 7-year milestones. Cumulative contributions to date: R45m of R150m commitment.",
    "extractionPrompt": "Inspect the DTI Exemption Certificate and EEIP business plan. Return JSON: certificate_reference, issue_date, validity_period, exempt_entity, programme_commitment_value, cumulative_contributions_to_date, milestones_to_date (list with status), valuation_basis. Confirm authenticity directly with DTI ([CONFIRMATION_REF]).",
    "expectedFields": [
      "certificate_reference",
      "issue_date",
      "validity_period",
      "exempt_entity",
      "programme_commitment_value",
      "cumulative_contributions_to_date",
      "milestones_to_date",
      "valuation_basis"
    ]
  },
  {
    "id": "ownership__fsb_fsca_licence_private_equity_fund",
    "element": "OWNERSHIP",
    "name": "FSB / FSCA licence — private equity fund",
    "aliases": [
      "FSB / FSCA licence — private equity fund",
      "FSB / FSCA licence",
      "FSCA licence"
    ],
    "auditorTests": "Confirms the private equity fund holds all required licences. Auditor verifies against the FSCA public register.",
    "exampleData": "FSCA Category II FSP licence #45123, issued 03 Jul 2018, current as at Measurement Date. Verified against FSCA public register on 02 Mar 2026.",
    "extractionPrompt": "Verify the FSCA licence for the private equity fund [FUND_NAME]. Return JSON: licence_number, category, issue_date, current_status, verified_against_fsca_register (bool, with date of check). Flag any expired or suspended licence.",
    "expectedFields": [
      "licence_number",
      "category",
      "issue_date",
      "current_status",
      "verified_against_fsca_register"
    ]
  },
  {
    "id": "ownership__board_meeting_minutes",
    "element": "OWNERSHIP",
    "name": "Board meeting minutes",
    "aliases": [
      "Board meeting minutes"
    ],
    "auditorTests": "Auditor reads a sample of minutes covering the Measurement Period to confirm: (1) black board members are present and participating; (2) strategic decisions are not made exclusively by non-black members; (3) black directors are not merely ratifying decisions made elsewhere.",
    "exampleData": "Board minutes 14 May 2025 — quorum noted, 7 of 9 directors present including 4 black directors. Resolution on Strategy 2026 carried unanimously with black directors actively contributing per Mr T. Mokoena's recorded contribution on slide 14.",
    "extractionPrompt": "Read the sampled board minutes for the Measurement Period. Return JSON per meeting: meeting_date, directors_present, black_directors_present, decisions_made (list with substance and proposer), black_director_participation_indicators (verbatim attributions or none). Assess whether strategic decisions reflect black director participation rather than ratification only.",
    "expectedFields": [
      "meeting_date",
      "directors_present",
      "black_directors_present",
      "decisions_made",
      "black_director_participation_indicators"
    ]
  },
  {
    "id": "ownership__payroll_remuneration_schedules_for_directors_and_senior_mana",
    "element": "OWNERSHIP",
    "name": "Payroll / remuneration schedules for directors and senior managers",
    "aliases": [
      "Payroll / remuneration schedules for directors and senior managers",
      "Payroll",
      "remuneration schedules for directors and senior managers"
    ],
    "auditorTests": "Auditor compares remuneration packages of black directors and managers against equivalent non-black counterparts at the same level. A material unexplained differential is a fronting indicator.",
    "exampleData": "Remuneration schedule FYE 2026: Black executive (Level 4): TCC R2,400,000. White executive (Level 4): TCC R2,460,000. Differential 2.5% (immaterial). Differential rationale: tenure 3y vs 7y.",
    "extractionPrompt": "Inspect payroll / remuneration schedules. Return a JSON comparison table by management level: level, headcount_by_race, mean_tcc_by_race, median_tcc_by_race, percentage_differential_black_vs_white, materiality_assessment (immaterial / material), explanatory_factors (tenure / qualification / role complexity / unexplained). Flag any unexplained material differential as a fronting indicator.",
    "expectedFields": [
      "level",
      "headcount_by_race",
      "mean_tcc_by_race",
      "median_tcc_by_race",
      "percentage_differential_black_vs_white",
      "materiality_assessment",
      "explanatory_factors"
    ]
  },
  {
    "id": "ownership__personnel_records_appointment_history_and_resignation_record",
    "element": "OWNERSHIP",
    "name": "Personnel records — appointment history and resignation records",
    "aliases": [
      "Personnel records — appointment history and resignation records",
      "Personnel records"
    ],
    "auditorTests": "Auditor inspects for patterns such as: black directors appointed shortly before Measurement Date and resigning shortly after; rapid turnover of black management; or simultaneous appointments of multiple black individuals at the same level without corresponding organisational need.",
    "exampleData": "Personnel record analysis: 3 black directors appointed within 30 days before prior Measurement Date; 2 resigned within 60 days after. Pattern flagged for further enquiry.",
    "extractionPrompt": "Read the appointment and resignation records for directors and senior managers over the past 36 months. Return JSON: events (list of appointment_date, resignation_date, individual_name, race, level), patterns_detected (list, e.g., 'multiple black appointments within X days of Measurement Date', 'rapid turnover'), fronting_indicators (list with reasoning).",
    "expectedFields": [
      "events",
      "patterns_detected",
      "fronting_indicators"
    ]
  },
  {
    "id": "management_control__sa_id_document_certified_copy_each_director_and_manager_clai",
    "element": "MANAGEMENT_CONTROL",
    "name": "SA ID document / certified copy — each director and manager claimed",
    "aliases": [
      "SA ID document / certified copy — each director and manager claimed",
      "SA ID document / certified copy",
      "SA ID document",
      "certified copy"
    ],
    "auditorTests": "Confirms race and gender of each individual. Auditor extracts gender from digit 7 of the ID number (0–4 = female, 5–9 = male) and verifies race through the document and, where ambiguous, a direct interview. This is the primary evidence for every sub-indicator.",
    "exampleData": "SA ID 8506121234084 — Mr T. Mokoena. ID digit 7 = '1' (female if 0-4, male if 5-9 → female). Race confirmed by self-declaration form attached. Certified copy dated within 3 months.",
    "extractionPrompt": "Inspect the SA ID document for [NAME]. Return JSON: id_number, derived_gender (digit 7), declared_race, level_claimed_on_scorecard (input as [LEVEL]), certified_copy_within_3_months (bool). Flag any ambiguity requiring direct interview.",
    "expectedFields": [
      "id_number",
      "derived_gender",
      "declared_race",
      "level_claimed_on_scorecard",
      "certified_copy_within_3_months"
    ]
  },
  {
    "id": "management_control__cipc_cor39_certificate_of_director_amendments_current",
    "element": "MANAGEMENT_CONTROL",
    "name": "CIPC COR39 — certificate of director amendments (current)",
    "aliases": [
      "CIPC COR39 — certificate of director amendments (current)",
      "CIPC COR39",
      "COR39"
    ],
    "auditorTests": "Auditor agrees every director claimed under board participation (items 2.1.1–2.1.4) to the COR39 to confirm they are validly appointed. Directors not on COR39 as at Measurement Date cannot be claimed.",
    "exampleData": "COR39 dated 18 Feb 2026 lists 9 directors. Scorecard claims 9 directors under board participation. All 9 cross-referenced and matched. No directors claimed who are not on COR39.",
    "extractionPrompt": "Inspect the COR39 as at Measurement Date. Extract the full director list. Reconcile against the board participation claim list [SCORECARD_DIRECTORS]. Return JSON: directors_on_cor39, directors_claimed, matched, on_cor39_not_claimed, claimed_not_on_cor39 (these cannot be counted). Flag every unmatched claim.",
    "expectedFields": [
      "directors_on_cor39",
      "directors_claimed",
      "matched",
      "on_cor39_not_claimed",
      "claimed_not_on_cor39"
    ]
  },
  {
    "id": "management_control__employment_contract_letter_of_appointment",
    "element": "MANAGEMENT_CONTROL",
    "name": "Employment contract / letter of appointment",
    "aliases": [
      "Employment contract / letter of appointment",
      "Employment contract",
      "letter of appointment"
    ],
    "auditorTests": "Confirms: (1) the individual was employed by the Measured Entity during the Measurement Period; (2) the level at which they were appointed (executive, senior, middle, junior management); (3) start date precedes Measurement Date.",
    "exampleData": "Employment contract dated 01 Mar 2020, Ms N. Dlamini, position 'Chief Financial Officer', reporting to CEO, executive committee member. Start date precedes Measurement Date by 5 years.",
    "extractionPrompt": "Inspect the employment contract for [NAME]. Return JSON: employee_name, role_title, level_per_contract (executive / senior / middle / junior), start_date, reporting_line, contract_signed_by_both_parties (bool), employed_during_measurement_period (bool). Compare role_title to claimed level on scorecard.",
    "expectedFields": [
      "employee_name",
      "role_title",
      "level_per_contract",
      "start_date",
      "reporting_line",
      "contract_signed_by_both_parties",
      "employed_during_measurement_period"
    ]
  },
  {
    "id": "management_control__letter_of_promotion_where_applicable",
    "element": "MANAGEMENT_CONTROL",
    "name": "Letter of promotion (where applicable)",
    "aliases": [
      "Letter of promotion (where applicable)",
      "Letter of promotion"
    ],
    "auditorTests": "Where an individual was promoted into a management level during the period, the auditor uses this to confirm the effective date of the promotion and that the individual held the higher level as at Measurement Date.",
    "exampleData": "Promotion letter dated 01 Jul 2025, Mr K. Mthembu promoted from Senior Manager to Executive (COO), effective 01 Jul 2025. Signed by CEO.",
    "extractionPrompt": "Inspect the promotion letter for [NAME]. Return JSON: employee_name, from_level, to_level, effective_date, signed_by, held_higher_level_at_measurement_date (bool given measurement_date = [DATE]).",
    "expectedFields": [
      "employee_name",
      "from_level",
      "to_level",
      "effective_date",
      "signed_by",
      "held_higher_level_at_measurement_date"
    ]
  },
  {
    "id": "management_control__job_description_for_each_management_position",
    "element": "MANAGEMENT_CONTROL",
    "name": "Job description for each management position",
    "aliases": [
      "Job description for each management position"
    ],
    "auditorTests": "Auditor assesses whether the role genuinely corresponds to the management level claimed. A job description showing purely administrative duties at 'executive' level is a fronting indicator. Also used to confirm executive vs non-executive status.",
    "exampleData": "Job description for 'Chief Financial Officer': strategic financial leadership, executive committee participation, signing authority up to R10m. Reports to CEO. Direct reports: 4 senior managers. Genuine executive role.",
    "extractionPrompt": "Read the job description for [ROLE / NAME]. Return JSON: role_title, level_claimed, key_responsibilities, decision_authority_described, executive_or_non_executive (with reasoning), genuine_role_assessment (genuine / inflated / administrative-only). Flag inflated titles as fronting indicators.",
    "expectedFields": [
      "role_title",
      "level_claimed",
      "key_responsibilities",
      "decision_authority_described",
      "executive_or_non_executive",
      "genuine_role_assessment"
    ]
  },
  {
    "id": "management_control__job_grading_document_grading_matrix",
    "element": "MANAGEMENT_CONTROL",
    "name": "Job grading document / grading matrix",
    "aliases": [
      "Job grading document / grading matrix",
      "Job grading document",
      "grading matrix"
    ],
    "auditorTests": "Mandatory — if the entity has no grading mechanism, it must be developed before the audit. Auditor confirms the grading tool is consistently applied across all employees and that the grades used to classify management levels are reasonable.",
    "exampleData": "Patterson grading matrix in use across entity. Executive = E-band; Senior = D-band; Middle = C-band; Junior = B-band. Applied consistently across all 320 employees per HR records.",
    "extractionPrompt": "Inspect the job grading document or matrix. Return JSON: grading_system_used (Patterson / Paterson / Hay / other), level_mapping (level → grade band), consistency_of_application (assessment with sample size), entity_developed_grading_pre_audit (bool). Flag if no grading exists — this must be developed before audit.",
    "expectedFields": [
      "grading_system_used",
      "level_mapping",
      "consistency_of_application",
      "entity_developed_grading_pre_audit"
    ]
  },
  {
    "id": "management_control__payroll_as_at_measurement_date",
    "element": "MANAGEMENT_CONTROL",
    "name": "Payroll as at Measurement Date",
    "aliases": [
      "Payroll as at Measurement Date"
    ],
    "auditorTests": "Primary source list for all employees. Auditor agrees the full population of management-level employees to the payroll. Any individual claimed on the scorecard who does not appear on payroll as at Measurement Date cannot be counted.",
    "exampleData": "Payroll snapshot 28 Feb 2026: 320 employees. Management headcount: 12 exec, 28 senior, 65 middle, 95 junior. All scorecard-claimed managers reconciled to payroll line items.",
    "extractionPrompt": "Reconcile the scorecard management claim list against payroll as at Measurement Date. Return JSON: payroll_management_population (by level and race / gender), scorecard_claim_population, individuals_claimed_not_on_payroll (cannot be counted), reconciliation_status (clean / exceptions).",
    "expectedFields": [
      "payroll_management_population",
      "scorecard_claim_population",
      "individuals_claimed_not_on_payroll",
      "reconciliation_status"
    ]
  },
  {
    "id": "management_control__eea2_forms_submitted_to_the_department_of_labour",
    "element": "MANAGEMENT_CONTROL",
    "name": "EEA2 forms submitted to the Department of Labour",
    "aliases": [
      "EEA2 forms submitted to the Department of Labour",
      "EEA2"
    ],
    "auditorTests": "Used as a reasonability test. Auditor compares the racial and gender breakdown of management levels on the EEA2 to the scorecard claim. Material unexplained differences require investigation. Also confirms the entity has met Employment Equity Act reporting obligations (prerequisite for Empowering Supplier status).",
    "exampleData": "EEA2 submitted to DoL on 14 Jan 2026 for reporting period FYE 31 Dec 2025. Top management: 4 African, 2 White, 2 Indian, 1 Coloured. Submission receipt #EEA2/2025/8841 attached.",
    "extractionPrompt": "Inspect the EEA2 submission. Return JSON: reporting_period, submission_date, submission_reference, management_breakdown_by_level_race_gender (table), submitted_on_time (bool, deadline = 15 Jan). Compare EEA2 breakdown against scorecard claim and return material_differences. Note: EEA2 submission is a prerequisite for Empowering Supplier status.",
    "expectedFields": [
      "reporting_period",
      "submission_date",
      "submission_reference",
      "management_breakdown_by_level_race_gender",
      "submitted_on_time"
    ]
  },
  {
    "id": "management_control__eea4_forms_submitted_to_the_department_of_labour",
    "element": "MANAGEMENT_CONTROL",
    "name": "EEA4 forms submitted to the Department of Labour",
    "aliases": [
      "EEA4 forms submitted to the Department of Labour",
      "EEA4"
    ],
    "auditorTests": "Supplementary EE reporting form. Used alongside EEA2 to cross-check management-level classifications.",
    "exampleData": "EEA4 submission dated 14 Jan 2026. Income differentials reported by occupational level. Used for cross-check against EEA2 management-level classifications.",
    "extractionPrompt": "Inspect the EEA4 submission. Return JSON: reporting_period, submission_date, occupational_levels_reported, cross_check_against_eea2 (consistent / inconsistent), inconsistencies_detail (list).",
    "expectedFields": [
      "reporting_period",
      "submission_date",
      "occupational_levels_reported",
      "cross_check_against_eea2",
      "inconsistencies_detail"
    ]
  },
  {
    "id": "management_control__eea1_declaration_by_employee_disabled_employees",
    "element": "MANAGEMENT_CONTROL",
    "name": "EEA1 — Declaration by Employee (disabled employees)",
    "aliases": [
      "EEA1 — Declaration by Employee (disabled employees)",
      "EEA1"
    ],
    "auditorTests": "Each employee claimed as disabled must have a signed EEA1 on file. Auditor inspects the declaration and the accompanying supporting documentation (medical certificate or disability grant) from a registered doctor or occupational health practitioner.",
    "exampleData": "EEA1 signed 03 Feb 2026 by Mr P. Naidoo declaring disability (visual impairment) per EE Act. Medical certificate from Dr S. Mthembu, MBChB, HPCSA MP445566, attached.",
    "extractionPrompt": "Inspect the EEA1 declaration and supporting medical evidence for each claimed disabled employee. Return JSON per employee: employee_name, eea1_signed (bool), eea1_date, medical_supporting_doc_present (bool), practitioner_hpcsa_number, ee_act_disability_definition_met (bool). Flag any claim without complete documentation.",
    "expectedFields": [
      "employee_name",
      "eea1_signed",
      "eea1_date",
      "medical_supporting_doc_present",
      "practitioner_hpcsa_number",
      "ee_act_disability_definition_met"
    ]
  },
  {
    "id": "management_control__medical_certificate_occupational_health_practitioner_s_repor",
    "element": "MANAGEMENT_CONTROL",
    "name": "Medical certificate / occupational health practitioner's report (disabled employee)",
    "aliases": [
      "Medical certificate / occupational health practitioner's report (disabled employee)",
      "Medical certificate",
      "occupational health practitioner's report"
    ],
    "auditorTests": "Confirms the medical condition that gives rise to the Employment Equity Act 'disability' classification. Auditor checks it was issued by a registered practitioner, covers the Measurement Date, and specifies the nature of the disability.",
    "exampleData": "Occupational health practitioner's report dated 12 Jan 2026 by Dr L. Reddy, HPCSA OP789012, covering Mr P. Naidoo. Confirms visual impairment, EE Act category, ongoing as at Measurement Date.",
    "extractionPrompt": "Inspect the medical / OH practitioner's report. Return JSON: practitioner_name, hpcsa_number, report_date, employee_name, condition_stated, ee_act_disability_classification (bool), measurement_date_coverage_confirmed (bool).",
    "expectedFields": [
      "practitioner_name",
      "hpcsa_number",
      "report_date",
      "employee_name",
      "condition_stated",
      "ee_act_disability_classification",
      "measurement_date_coverage_confirmed"
    ]
  },
  {
    "id": "management_control__sample_of_employee_files_pulled_by_auditor",
    "element": "MANAGEMENT_CONTROL",
    "name": "Sample of employee files (pulled by auditor)",
    "aliases": [
      "Sample of employee files (pulled by auditor)",
      "Sample of employee files"
    ],
    "auditorTests": "Auditor selects a sample across all management levels and races to verify: (1) ID document present; (2) employment contract present; (3) job description matches claimed level; (4) payroll entry matches claimed level. Any discrepancy is a misstatement.",
    "exampleData": "Sample of 25 employee files pulled by auditor across all levels and races. All 25 files contain: ID, contract, job description, payroll entry. No misstatements.",
    "extractionPrompt": "For the sampled employee files (list of [N] names provided as [SAMPLE]), inspect each file. Return a JSON table with columns: employee_name, level_claimed, id_present (bool), contract_present (bool), job_description_matches_level (bool), payroll_entry_matches_level (bool), exceptions. Summarise total exceptions and treat each as a misstatement.",
    "expectedFields": [
      "employee_name",
      "level_claimed",
      "id_present",
      "contract_present",
      "job_description_matches_level",
      "payroll_entry_matches_level",
      "exceptions"
    ]
  },
  {
    "id": "management_control__board_meeting_minutes_sample_covering_measurement_period",
    "element": "MANAGEMENT_CONTROL",
    "name": "Board meeting minutes (sample covering Measurement Period)",
    "aliases": [
      "Board meeting minutes (sample covering Measurement Period)",
      "Board meeting minutes"
    ],
    "auditorTests": "Auditor inspects to confirm: (1) black board members are present and voting; (2) executive directors are clearly distinguished from non-executive directors in the minutes; (3) no indication that black board members' votes are subject to informal override.",
    "exampleData": "Sample of 4 board minutes from Apr 2025, Jul 2025, Oct 2025, Feb 2026. All 4 record black director attendance and active voting. Executive vs non-executive directors clearly distinguished. No override patterns.",
    "extractionPrompt": "Read the sampled board minutes. Return JSON per meeting: meeting_date, attendance_by_director (with race, executive/non-executive), votes_cast, black_directors_voting (bool), informal_override_indicators (list, or none). Assess whether voting rights are exercised substantively.",
    "expectedFields": [
      "meeting_date",
      "attendance_by_director",
      "votes_cast",
      "black_directors_voting",
      "informal_override_indicators"
    ]
  },
  {
    "id": "management_control__remuneration_total_cost_to_company_schedules",
    "element": "MANAGEMENT_CONTROL",
    "name": "Remuneration / total cost-to-company schedules",
    "aliases": [
      "Remuneration / total cost-to-company schedules",
      "Remuneration",
      "total cost-to-company schedules"
    ],
    "auditorTests": "Auditor compares overall packages of black directors and managers against non-black counterparts at the same level. Significant unexplained differentials indicate that black appointments are nominal (fronting indicator).",
    "exampleData": "Total cost-to-company schedule by level: at Senior Mgr level, black mean TCC R1.92m, non-black mean TCC R1.96m, differential 2.1%. Immaterial.",
    "extractionPrompt": "Inspect the remuneration / TCC schedules. Return a JSON table by management level: level, mean_tcc_black, mean_tcc_non_black, percentage_differential, materiality_assessment, explanatory_factors (list). Flag material unexplained differentials as fronting indicators per Code 200.",
    "expectedFields": [
      "level",
      "mean_tcc_black",
      "mean_tcc_non_black",
      "percentage_differential",
      "materiality_assessment",
      "explanatory_factors"
    ]
  },
  {
    "id": "management_control__performance_evaluation_records_sample",
    "element": "MANAGEMENT_CONTROL",
    "name": "Performance evaluation records (sample)",
    "aliases": [
      "Performance evaluation records (sample)",
      "Performance evaluation records"
    ],
    "auditorTests": "Confirms that black managers are being substantively managed and assessed in their roles — not merely on paper. Absence of any performance record for a claimed black manager is a fronting indicator.",
    "exampleData": "Performance evaluation 2025 for Ms N. Dlamini (CFO): KPI scorecard signed by CEO, 360 feedback completed, development plan updated. Substantive evaluation evidenced.",
    "extractionPrompt": "Inspect sampled performance records for claimed black managers. Return JSON per record: manager_name, evaluation_period, evaluation_present (bool), substantive_engagement_indicators (list — KPIs, ratings, feedback, development plan), fronting_indicators (list, e.g., 'no evaluation on file').",
    "expectedFields": [
      "manager_name",
      "evaluation_period",
      "evaluation_present",
      "substantive_engagement_indicators",
      "fronting_indicators"
    ]
  },
  {
    "id": "management_control__eap_statistics_table_national_or_provincial_as_applicable",
    "element": "MANAGEMENT_CONTROL",
    "name": "EAP statistics table (National or Provincial — as applicable)",
    "aliases": [
      "EAP statistics table (National or Provincial — as applicable)",
      "EAP statistics table (National or Provincial"
    ],
    "auditorTests": "Auditor confirms which table the entity has elected to use (National vs Provincial) and verifies the election is valid — provincial EAP may only be used if the majority of employees are in that province. The correct EAP percentages are used in the formula denominator for items 2.3–2.6.",
    "exampleData": "EAP National table (Stats SA Q4 2025): African 79.4%, Coloured 8.8%, Indian 2.5%, White 9.3%. Female 45.5%. National table used — entity employees spread across 6 provinces.",
    "extractionPrompt": "Inspect the EAP election and confirm reasonableness. Return JSON: eap_table_used (National / Provincial-[name]), election_basis, majority_of_employees_in_elected_province (bool, if Provincial), eap_percentages_applied (race/gender breakdown), version_or_period_of_eap_data. Recalculate the denominator for items 2.3-2.6 against the elected EAP.",
    "expectedFields": [
      "eap_table_used",
      "election_basis",
      "majority_of_employees_in_elected_province",
      "eap_percentages_applied",
      "version_or_period_of_eap_data"
    ]
  },
  {
    "id": "management_control__moi_for_voting_rights_held_by_black_board_members",
    "element": "MANAGEMENT_CONTROL",
    "name": "MOI (for voting rights held by black board members)",
    "aliases": [
      "MOI (for voting rights held by black board members)",
      "MOI"
    ],
    "auditorTests": "Auditor checks the MOI for any class of shares or director-appointment provisions that restrict the voting rights of black directors. Restricted voting rights reduce the EVR percentage that can be claimed.",
    "exampleData": "MOI clause 14.3: black directors carry one vote per director, identical to all other directors. No restricted voting class. Full EVR claimable.",
    "extractionPrompt": "Read the MOI for clauses affecting black directors' voting rights. Return JSON: relevant_clauses (list with clause number and substance), restricted_voting_indicators (list, or none), evr_reduction_required (bool with calculation), maximum_evr_claimable.",
    "expectedFields": [
      "relevant_clauses",
      "restricted_voting_indicators",
      "evr_reduction_required",
      "maximum_evr_claimable"
    ]
  },
  {
    "id": "skills_development__seta_registration_certificate",
    "element": "SKILLS_DEVELOPMENT",
    "name": "SETA registration certificate",
    "aliases": [
      "SETA registration certificate",
      "SETA"
    ],
    "auditorTests": "Confirms the entity is registered with its applicable Sector Education and Training Authority. Auditor verifies the certificate is current (not expired) and matches the entity's SARS / CIPC registration. Registration is a prerequisite — absence means zero points.",
    "exampleData": "SETA registration certificate — Acme Holdings, SARS SDL number L470012345, registered with BANKSETA on 12 Apr 2018. Current as at Measurement Date — verified on SETA portal 02 Mar 2026.",
    "extractionPrompt": "Inspect the SETA registration certificate. Return JSON: entity_name, sars_sdl_number, seta_name, registration_date, current_status (current / expired), verified_on_portal (bool with date). If absent or expired, flag — zero points awarded.",
    "expectedFields": [
      "entity_name",
      "sars_sdl_number",
      "seta_name",
      "registration_date",
      "current_status",
      "verified_on_portal",
      "flag"
    ]
  },
  {
    "id": "skills_development__sars_emp201_submissions_monthly_employer_declarations",
    "element": "SKILLS_DEVELOPMENT",
    "name": "SARS EMP201 submissions (monthly employer declarations)",
    "aliases": [
      "SARS EMP201 submissions (monthly employer declarations)",
      "SARS EMP201 submissions",
      "EMP201"
    ],
    "auditorTests": "Primary source for the Leviable Amount. Auditor: (1) agrees the sum of monthly EMP201 SDL columns to the Skills Development Spend denominator; (2) confirms the Leviable Amount excludes the SDL levy itself; (3) cross-checks to the AFS payroll / staff costs note.",
    "exampleData": "EMP201 submissions for 12 months Mar 2025 - Feb 2026. Sum of SDL columns: R8,420,000 leviable amount. SDL levy R84,200 excluded from spend denominator. Cross-checked to AFS staff costs of R8,395,000 (variance 0.3%).",
    "extractionPrompt": "Inspect the 12 monthly EMP201 submissions for the Measurement Period. Return JSON: months_submitted (list), sum_of_leviable_amount, sdl_levy_excluded_from_denominator (bool), reconciliation_to_afs_staff_costs (afs_value, variance %, explanation). Flag missing months or material reconciliation differences.",
    "expectedFields": [
      "months_submitted",
      "sum_of_leviable_amount",
      "sdl_levy_excluded_from_denominator",
      "reconciliation_to_afs_staff_costs"
    ]
  },
  {
    "id": "skills_development__approved_workplace_skills_plan_wsp_most_recently_submitted",
    "element": "SKILLS_DEVELOPMENT",
    "name": "Approved Workplace Skills Plan (WSP — most recently submitted)",
    "aliases": [
      "Approved Workplace Skills Plan (WSP — most recently submitted)",
      "Approved Workplace Skills Plan (WSP",
      "WSP"
    ],
    "auditorTests": "Confirms the entity has a structured training plan submitted to the SETA. Auditor verifies the WSP was approved (not merely submitted) and that training claimed on the scorecard is consistent with the plan's objectives.",
    "exampleData": "WSP submitted to BANKSETA on 28 Apr 2025 for FYE Feb 2026. Approval letter dated 12 Jun 2025. Plan includes 8 learnerships, 15 bursaries, 22 short courses aligned to scarce skills.",
    "extractionPrompt": "Inspect the WSP and approval. Return JSON: submission_date, submission_acknowledgement_reference, approval_date, planned_interventions (list by category), scorecard_training_consistent_with_wsp (bool with deviations list).",
    "expectedFields": [
      "submission_date",
      "submission_acknowledgement_reference",
      "approval_date",
      "planned_interventions",
      "scorecard_training_consistent_with_wsp"
    ]
  },
  {
    "id": "skills_development__annual_training_report_atr_submitted_to_seta",
    "element": "SKILLS_DEVELOPMENT",
    "name": "Annual Training Report (ATR — submitted to SETA)",
    "aliases": [
      "Annual Training Report (ATR — submitted to SETA)",
      "Annual Training Report (ATR",
      "ATR",
      "SETA"
    ],
    "auditorTests": "Confirms actual training delivered during the period. Auditor agrees the ATR to the scorecard claim — training not reported to the SETA cannot be claimed. Discrepancies between ATR and scorecard are investigated.",
    "exampleData": "ATR submitted to BANKSETA on 28 Apr 2026 for prior period. Lists 8 learnerships started, 7 bursaries awarded, 19 short courses delivered. ATR-to-scorecard reconciliation: complete.",
    "extractionPrompt": "Inspect the ATR and reconcile to scorecard claim. Return JSON: submission_date, reference, interventions_reported (list), scorecard_interventions (list), reconciliation_table (matched / scorecard_only / atr_only). Items claimed but not reported to SETA cannot be counted.",
    "expectedFields": [
      "submission_date",
      "reference",
      "interventions_reported",
      "scorecard_interventions",
      "reconciliation_table"
    ]
  },
  {
    "id": "skills_development__proof_of_wsp_and_atr_submission_to_seta_acknowledgement_subm",
    "element": "SKILLS_DEVELOPMENT",
    "name": "Proof of WSP and ATR submission to SETA (acknowledgement / submission receipt)",
    "aliases": [
      "Proof of WSP and ATR submission to SETA (acknowledgement / submission receipt)",
      "Proof of WSP and ATR submission to SETA",
      "WSP",
      "ATR",
      "SETA"
    ],
    "auditorTests": "Auditor requires written confirmation from the SETA or the SETA's online portal acknowledgement that both the WSP and ATR were submitted on time for the Measurement Period.",
    "exampleData": "SETA portal acknowledgement screenshots dated 28 Apr 2025 (WSP) and 28 Apr 2026 (ATR). Both submitted before the 30 April deadline.",
    "extractionPrompt": "Inspect the submission acknowledgements. Return JSON: wsp_submission_date, wsp_submitted_on_time (bool, deadline 30 Apr), atr_submission_date, atr_submitted_on_time (bool), portal_acknowledgement_present (bool).",
    "expectedFields": [
      "wsp_submission_date",
      "wsp_submitted_on_time",
      "atr_submission_date",
      "atr_submitted_on_time",
      "portal_acknowledgement_present"
    ]
  },
  {
    "id": "skills_development__skills_development_facilitator_appointment_letter_sdf_regist",
    "element": "SKILLS_DEVELOPMENT",
    "name": "Skills Development Facilitator appointment letter / SDF registration",
    "aliases": [
      "Skills Development Facilitator appointment letter / SDF registration",
      "Skills Development Facilitator appointment letter",
      "SDF registration"
    ],
    "auditorTests": "Confirms an SDF (internal or external) has been formally appointed. The SDF's name must match the SETA's records. Auditor inspects the appointment letter or consulting agreement.",
    "exampleData": "SDF appointment letter dated 01 Apr 2025 appointing Ms L. Khoza (internal HR Manager) as Skills Development Facilitator. Registered on BANKSETA system; SDF ID matches SETA records.",
    "extractionPrompt": "Inspect the SDF appointment. Return JSON: sdf_name, internal_or_external, appointment_date, appointment_letter_present (bool), seta_record_matches (bool). Flag any mismatch between appointment letter and SETA records.",
    "expectedFields": [
      "sdf_name",
      "internal_or_external",
      "appointment_date",
      "appointment_letter_present",
      "seta_record_matches"
    ]
  },
  {
    "id": "skills_development__seta_accreditation_certificate_if_entity_is_an_accredited_wo",
    "element": "SKILLS_DEVELOPMENT",
    "name": "SETA accreditation certificate (if entity is an accredited workplace skills provider)",
    "aliases": [
      "SETA accreditation certificate (if entity is an accredited workplace skills provider)",
      "SETA accreditation certificate",
      "SETA"
    ],
    "auditorTests": "Where the entity delivers learnerships in-house, the SETA accreditation certificate confirms it is authorised to do so. Training delivered by an unaccredited provider cannot be claimed under the Learning Programme Matrix.",
    "exampleData": "BANKSETA accreditation certificate, accreditation #ETQA/BS/0123, valid 01 Jan 2024 - 31 Dec 2026, for delivery of National Certificate in Banking NQF 5.",
    "extractionPrompt": "Inspect the SETA accreditation certificate. Return JSON: accreditation_reference, seta, scope_of_accreditation (programmes covered), validity_start, validity_end, valid_at_measurement_date (bool). Training outside scope or after expiry cannot be claimed.",
    "expectedFields": [
      "accreditation_reference",
      "seta",
      "scope_of_accreditation",
      "validity_start",
      "validity_end",
      "valid_at_measurement_date"
    ]
  },
  {
    "id": "skills_development__learnership_apprenticeship_internship_agreements_one_per_lea",
    "element": "SKILLS_DEVELOPMENT",
    "name": "Learnership / Apprenticeship / Internship agreements — one per learner",
    "aliases": [
      "Learnership / Apprenticeship / Internship agreements — one per learner",
      "Learnership / Apprenticeship / Internship agreements",
      "Learnership",
      "Apprenticeship",
      "Internship agreements"
    ],
    "auditorTests": "Auditor checks: (1) signed by both learner and entity; (2) SETA-registered programme referenced; (3) start and end dates fall within the Measurement Period or span it correctly; (4) for unemployed learners — the agreement pre-dates or coincides with their first day of work (confirming they were unemployed when signed).",
    "exampleData": "Learnership agreement #LN/2025/004, Ms T. Mahlangu (ID 0103141234080), NQF 5 Banking, start 01 May 2025, end 30 Apr 2026. Pre-employment letter dated 25 Apr 2025 confirms unemployed status before learnership.",
    "extractionPrompt": "Inspect each learnership / apprenticeship / internship agreement. Return JSON per agreement: learner_name, learner_id, programme_nqf, seta_code, signed_by_both_parties (bool), start_date, end_date, falls_within_measurement_period (bool), unemployed_at_signing (for unemployed learners — bool, with supporting evidence).",
    "expectedFields": [
      "learner_name",
      "learner_id",
      "programme_nqf",
      "seta_code",
      "signed_by_both_parties",
      "start_date",
      "end_date",
      "falls_within_measurement_period",
      "unemployed_at_signing"
    ]
  },
  {
    "id": "skills_development__seta_approval_registration_letter_for_each_learnership_progr",
    "element": "SKILLS_DEVELOPMENT",
    "name": "SETA approval / registration letter for each learnership programme",
    "aliases": [
      "SETA approval / registration letter for each learnership programme",
      "SETA approval",
      "registration letter for each learnership programme",
      "SETA"
    ],
    "auditorTests": "Confirms the specific learnership is registered with the SETA. Auditor traces the SETA code on the learnership agreement to the approval letter.",
    "exampleData": "BANKSETA approval letter for National Certificate in Banking NQF 5, SAQA ID 23653, dated 14 Mar 2023, valid for 5 years.",
    "extractionPrompt": "Inspect the SETA approval letter for the learnership programme. Return JSON: programme_name, saqa_id, seta_code, approval_date, validity_period, registered_with_seta (bool). Trace the SETA code on each learnership agreement to this approval letter.",
    "expectedFields": [
      "programme_name",
      "saqa_id",
      "seta_code",
      "approval_date",
      "validity_period",
      "registered_with_seta"
    ]
  },
  {
    "id": "skills_development__sa_id_document_each_learner",
    "element": "SKILLS_DEVELOPMENT",
    "name": "SA ID document — each learner",
    "aliases": [
      "SA ID document — each learner",
      "SA ID document"
    ],
    "auditorTests": "Auditor extracts: race (confirmed by interview or declaration), gender (digit 7 of ID number), and nationality (digit 11: 0 = SA citizen). Non-SA citizens cannot be claimed. This document is mandatory for every learner claimed.",
    "exampleData": "Learner SA ID 0103141234080. Digits 1-6 = 010314 → DOB 14 Mar 2001 (age 25). Digit 7 = '1' → female (0-4 range). Digit 11 = '0' → SA citizen. Race declared African.",
    "extractionPrompt": "Inspect the SA ID for each claimed learner. Return JSON per learner: id_number, derived_dob, derived_gender, citizenship (SA / non-SA based on digit 11), race_declared, eligible (bool — non-SA citizens excluded). Mandatory document — flag any missing ID as disqualifying for that learner.",
    "expectedFields": [
      "id_number",
      "derived_dob",
      "derived_gender",
      "citizenship",
      "race_declared",
      "eligible"
    ]
  },
  {
    "id": "skills_development__invoices_internal_accounting_records_each_training_event",
    "element": "SKILLS_DEVELOPMENT",
    "name": "Invoices / internal accounting records — each training event",
    "aliases": [
      "Invoices / internal accounting records — each training event",
      "Invoices / internal accounting records",
      "Invoices",
      "internal accounting records"
    ],
    "auditorTests": "Auditor agrees each claimed expense to a third-party invoice (external training) or an internal accounting record (internal training). The invoice must: (1) be addressed to the Measured Entity; (2) exclude VAT from the claimed amount; (3) fall within the Measurement Period.",
    "exampleData": "Invoice #INV-7821 from [Training Provider] to Acme Holdings, dated 14 Jul 2025, R85,500 ex-VAT for NQF 5 module 3. Invoice falls within Mar 2025 - Feb 2026 Measurement Period.",
    "extractionPrompt": "Inspect each training expense and supporting invoice. Return JSON per expense: invoice_number, supplier, invoice_date, amount_ex_vat, amount_includes_vat (bool — should be excluded), addressed_to_measured_entity (bool), falls_within_measurement_period (bool), training_event_referenced. Flag any VAT-inclusive claim or mis-dated invoice.",
    "expectedFields": [
      "invoice_number",
      "supplier",
      "invoice_date",
      "amount_ex_vat",
      "amount_includes_vat",
      "addressed_to_measured_entity",
      "falls_within_measurement_period",
      "training_event_referenced"
    ]
  },
  {
    "id": "skills_development__attendance_registers_internal_training",
    "element": "SKILLS_DEVELOPMENT",
    "name": "Attendance registers — internal training",
    "aliases": [
      "Attendance registers — internal training",
      "Attendance registers"
    ],
    "auditorTests": "Confirms learners physically attended the training. Auditor cross-checks learner names on the register against the learner ID documents and the scorecard claim. Unsigned or incomplete registers cannot support a claim.",
    "exampleData": "Internal training attendance register for 'Credit Risk Foundations', 14-16 May 2025. 22 attendees, all signatures present, learner IDs match employee list. Trainer signature and date present.",
    "extractionPrompt": "Inspect the attendance register for each internal training event. Return JSON: event_name, dates, total_attendees, names_with_signature, names_without_signature (cannot be claimed), id_matches_learner_record (bool), trainer_signed (bool). Unsigned or incomplete registers cannot support a claim.",
    "expectedFields": [
      "event_name",
      "dates",
      "total_attendees",
      "names_with_signature",
      "names_without_signature",
      "id_matches_learner_record",
      "trainer_signed"
    ]
  },
  {
    "id": "skills_development__payslips_of_internal_trainers_where_accommodation_catering_t",
    "element": "SKILLS_DEVELOPMENT",
    "name": "Payslips of internal trainers (where accommodation/catering/travel costs are claimed)",
    "aliases": [
      "Payslips of internal trainers (where accommodation/catering/travel costs are claimed)",
      "Payslips of internal trainers"
    ],
    "auditorTests": "Used to confirm that accommodation, catering, and travel do not exceed 15% of total Skills Development Spend. Auditor recalculates this cap across all claimed training events.",
    "exampleData": "Total claimed accommodation, catering, travel: R420,000. Total Skills Development Spend: R3,200,000. Ratio 13.1% — within 15% cap.",
    "extractionPrompt": "Recalculate the accommodation, catering and travel proportion of total Skills Development Spend. Return JSON: accom_catering_travel_total, total_skills_dev_spend, ratio, within_15_percent_cap (bool). Flag if ratio exceeds 15% — excess is non-qualifying.",
    "expectedFields": [
      "accom_catering_travel_total",
      "total_skills_dev_spend",
      "ratio",
      "within_15_percent_cap"
    ]
  },
  {
    "id": "skills_development__letter_from_hr_confirming_learner_was_not_employed_by_entity",
    "element": "SKILLS_DEVELOPMENT",
    "name": "Letter from HR confirming learner was not employed by entity before learnership start (unemployed learner claims)",
    "aliases": [
      "Letter from HR confirming learner was not employed by entity before learnership start (unemployed learner claims)",
      "Letter from HR confirming learner was not employed by entity before learnership start"
    ],
    "auditorTests": "Mandatory for items 2.1.2.2 and the absorption bonus. Auditor confirms the letter is on company letterhead, signed by an authorised HR representative, and specifies the learner's name and ID number.",
    "exampleData": "HR letter on Acme letterhead, signed by HR Director Ms P. Naidoo, dated 25 Apr 2025, confirming Ms T. Mahlangu (ID 0103141234080) was not employed by Acme prior to learnership start of 01 May 2025.",
    "extractionPrompt": "Inspect HR confirmation letter for each unemployed-learner claim. Return JSON per learner: learner_name, learner_id, hr_signatory, signatory_role, letter_date, on_company_letterhead (bool), confirms_no_prior_employment (bool). Mandatory for items 2.1.2.2 and absorption bonus.",
    "expectedFields": [
      "learner_name",
      "learner_id",
      "hr_signatory",
      "signatory_role",
      "letter_date",
      "on_company_letterhead",
      "confirms_no_prior_employment"
    ]
  },
  {
    "id": "skills_development__letter_of_employment_appointment_letter_confirming_absorptio",
    "element": "SKILLS_DEVELOPMENT",
    "name": "Letter of employment / appointment letter confirming absorption after learnership (bonus points — item 2.1.3)",
    "aliases": [
      "Letter of employment / appointment letter confirming absorption after learnership (bonus points — item 2.1.3)",
      "Letter of employment / appointment letter confirming absorption after learnership (bonus points",
      "Letter of employment",
      "appointment letter confirming absorption after learnership (bonus points"
    ],
    "auditorTests": "Confirms the black learner was given a permanent or fixed-term job on completion of the learnership, either within the Measured Entity or elsewhere in the industry. The employing entity must issue the confirmation letter.",
    "exampleData": "Letter of appointment dated 05 May 2026 from Acme Holdings to Ms T. Mahlangu, permanent role 'Junior Credit Analyst', effective 06 May 2026 (one week after learnership completion).",
    "extractionPrompt": "Inspect absorption confirmation letter for each absorbed learner. Return JSON per learner: learner_name, employing_entity, role_type (permanent / fixed-term), effective_date, learnership_completion_date, absorbed_within_industry (bool if not within Measured Entity). Bonus points (item 2.1.3) recognition.",
    "expectedFields": [
      "learner_name",
      "employing_entity",
      "role_type",
      "effective_date",
      "learnership_completion_date",
      "absorbed_within_industry"
    ]
  },
  {
    "id": "skills_development__scholarship_bursary_agreements",
    "element": "SKILLS_DEVELOPMENT",
    "name": "Scholarship / bursary agreements",
    "aliases": [
      "Scholarship / bursary agreements",
      "Scholarship",
      "bursary agreements"
    ],
    "auditorTests": "Auditor checks for clawback clauses. Clawbacks for: (a) failing to complete studies, or (b) not remaining employed for up to the period of study — are permissible and do not disqualify the expense. Any other clawback (e.g., repayment on resignation regardless of circumstances) means the expense is not a qualifying Skills Development expense.",
    "exampleData": "Bursary agreement with Ms N. Khumalo, R85,000 for BCom Accounting at UJ. Clawback clauses: (a) failure to complete = full repayment; (b) leaving employment within 3 years post-graduation = pro-rata repayment. Both permissible.",
    "extractionPrompt": "Read each bursary / scholarship agreement. Return JSON: beneficiary_name, amount, qualification, institution, clawback_clauses (list with text), each clawback classified as permissible (failure to complete OR mandatory employment up to study period) OR impermissible (e.g., repayment on resignation regardless of circumstances). Any impermissible clawback disqualifies the expense.",
    "expectedFields": [
      "beneficiary_name",
      "amount",
      "qualification",
      "institution",
      "clawback_clauses",
      "each"
    ]
  },
  {
    "id": "skills_development__eap_statistics_table_national_or_provincial",
    "element": "SKILLS_DEVELOPMENT",
    "name": "EAP statistics table (National or Provincial)",
    "aliases": [
      "EAP statistics table (National or Provincial)",
      "EAP statistics table"
    ],
    "auditorTests": "Auditor confirms which EAP table applies (same election rules as Management Control) and recalculates the EAP-adjusted formula (A = B/C × D) for indicators 2.1.1, 2.1.2.1, and 2.1.2.2. The QSE scorecard does not use the EAP-adjusted formula.",
    "exampleData": "EAP National table per Stats SA QLFS Q4 2025: African 79.4%, Coloured 8.8%, Indian 2.5%, White 9.3%. EAP-adjusted formula A = (B/C) × D applied to items 2.1.1, 2.1.2.1, 2.1.2.2.",
    "extractionPrompt": "Recalculate the EAP-adjusted formula A = (B/C) × D for items 2.1.1, 2.1.2.1 and 2.1.2.2 (Generic scorecard only; not QSE). Return JSON per item: item, B_value (black spend), C_value (target spend), D_value (EAP %), A_result (recognised %), eap_table_used. State if QSE scorecard applies — in which case no EAP adjustment.",
    "expectedFields": [
      "item",
      "B_value",
      "C_value",
      "D_value",
      "A_result",
      "eap_table_used"
    ]
  },
  {
    "id": "skills_development__afs_staff_costs_training_expense_note",
    "element": "SKILLS_DEVELOPMENT",
    "name": "AFS — staff costs / training expense note",
    "aliases": [
      "AFS — staff costs / training expense note",
      "AFS"
    ],
    "auditorTests": "Auditor cross-checks the claimed Skills Development Spend against the AFS training line item for reasonability. Where the claimed amount significantly exceeds the AFS training disclosure, the auditor investigates whether non-qualifying costs have been included.",
    "exampleData": "AFS staff cost note: Training & development R3,150,000. Scorecard claimed Skills Development Spend R3,200,000. Variance 1.6% — explained by R50k of in-house trainer time costed to AFS payroll rather than training line.",
    "extractionPrompt": "Reconcile claimed Skills Development Spend to AFS training expense disclosure. Return JSON: afs_training_disclosure, scorecard_claimed_spend, variance, variance_percentage, explanation_required (bool), explanation. Material unexplained excess of claim over disclosure flagged for investigation of non-qualifying inclusion.",
    "expectedFields": [
      "afs_training_disclosure",
      "scorecard_claimed_spend",
      "variance",
      "variance_percentage",
      "explanation_required",
      "explanation"
    ]
  },
  {
    "id": "skills_development__documentation_confirming_mandatory_sector_training_is_exclud",
    "element": "SKILLS_DEVELOPMENT",
    "name": "Documentation confirming mandatory sector training is excluded",
    "aliases": [
      "Documentation confirming mandatory sector training is excluded"
    ],
    "auditorTests": "Auditor obtains the entity's SETA's list of mandatory sector programmes and confirms none appear in the claimed spend.",
    "exampleData": "BANKSETA mandatory sector training list confirmed (FAIS RE5 etc.). Scorecard reviewed — no mandatory sector programmes included in claimed spend.",
    "extractionPrompt": "Obtain the SETA's list of mandatory sector training programmes. Cross-reference against claimed Skills Development line items. Return JSON: mandatory_programmes_per_seta (list), scorecard_items_matching_mandatory (list — must be excluded), exclusion_applied (bool).",
    "expectedFields": [
      "mandatory_programmes_per_seta",
      "scorecard_items_matching_mandatory",
      "exclusion_applied"
    ]
  },
  {
    "id": "skills_development__accreditation_saqa_recognition_for_overseas_training",
    "element": "SKILLS_DEVELOPMENT",
    "name": "Accreditation / SAQA recognition for overseas training",
    "aliases": [
      "Accreditation / SAQA recognition for overseas training",
      "Accreditation",
      "SAQA recognition for overseas training",
      "SAQA"
    ],
    "auditorTests": "Where training occurred outside SA, auditor confirms SAQA recognition of the qualification, or accreditation by a body equivalent to SAQA in the foreign jurisdiction.",
    "exampleData": "Overseas training: Wharton Exec Education, 'Strategic Leadership', SAQA recognition confirmed via NLRD lookup 14 Feb 2026. Cost R145,000 ex-VAT claimable.",
    "extractionPrompt": "Inspect SAQA recognition or equivalent foreign accreditation for overseas training. Return JSON per programme: programme_name, provider, country, saqa_recognition_status (recognised / not recognised), recognition_reference, equivalent_foreign_accreditation_body (if applicable). Non-recognised foreign training cannot be claimed.",
    "expectedFields": [
      "programme_name",
      "provider",
      "country",
      "saqa_recognition_status",
      "recognition_reference",
      "equivalent_foreign_accreditation_body"
    ]
  },
  {
    "id": "esd__audited_financial_statements_or_signed_management_accounts_w",
    "element": "ESD",
    "name": "Audited financial statements or signed management accounts with detailed income statement",
    "aliases": [
      "Audited financial statements or signed management accounts with detailed income statement"
    ],
    "auditorTests": "Primary source for Total Measured Procurement Spend (TMPS). Auditor agrees Cost of Sales, Operating Expenditure, Capital Expenditure, and finance costs to the AFS. Any item in the AFS that represents procurement of goods or services is included unless it is a listed exclusion.",
    "exampleData": "AFS FYE 31 Mar 2026. Cost of sales R145m, OpEx R62m, CapEx R18m, finance costs R8m. TMPS pre-exclusions R233m. Exclusions per Code 400 applied separately.",
    "extractionPrompt": "Inspect the AFS / management accounts. Return JSON: cost_of_sales, operating_expenditure, capital_expenditure, finance_costs, total_pre_exclusions_tmps, line_items_classified_as_procurement (list with values). Identify any AFS items that should be in TMPS but appear excluded, and vice versa.",
    "expectedFields": [
      "cost_of_sales",
      "operating_expenditure",
      "capital_expenditure",
      "finance_costs",
      "total_pre_exclusions_tmps",
      "line_items_classified_as_procurement",
      "vice"
    ]
  },
  {
    "id": "esd__management_confirmation_letter_on_additional_tmps_informatio",
    "element": "ESD",
    "name": "Management confirmation letter on additional TMPS information",
    "aliases": [
      "Management confirmation letter on additional TMPS information",
      "TMPS"
    ],
    "auditorTests": "Where certain spend categories are not clearly identifiable from the AFS (e.g., intra-group transactions, off-balance-sheet arrangements), auditor obtains written management confirmation and tests it for reasonability.",
    "exampleData": "Management letter dated 28 Feb 2026 confirming intra-group transactions of R12m (excluded from TMPS per Code 400 exclusions list) and clarifying treatment of operating lease payments.",
    "extractionPrompt": "Inspect the management confirmation letter on TMPS adjustments. Return JSON: items_confirmed (list with amounts and treatment), reasonableness_assessment per item, supporting_evidence_referenced (list). Flag any unsupported adjustments.",
    "expectedFields": [
      "items_confirmed",
      "reasonableness_assessment",
      "supporting_evidence_referenced"
    ]
  },
  {
    "id": "esd__sample_of_invoices_cut_off_test",
    "element": "ESD",
    "name": "Sample of invoices (cut-off test)",
    "aliases": [
      "Sample of invoices (cut-off test)",
      "Sample of invoices"
    ],
    "auditorTests": "Auditor selects a sample of invoices around the period-end to confirm: (1) goods/services were delivered within the Measurement Period; (2) deposits for future delivery are excluded; (3) invoices raised before period-end for post-period delivery are excluded.",
    "exampleData": "Cut-off test: 15 invoices sampled either side of period-end. 2 deposits for future delivery (R420k) correctly excluded; 1 pre-period-end invoice for post-period delivery (R85k) correctly excluded.",
    "extractionPrompt": "Inspect the cut-off sample of invoices around Measurement Date. Return JSON per invoice: invoice_number, supplier, invoice_date, goods_or_services_delivery_date, included_in_tmps (bool), correctly_included (bool), exception_if_misstated. Summarise cut-off misstatements.",
    "expectedFields": [
      "invoice_number",
      "supplier",
      "invoice_date",
      "goods_or_services_delivery_date",
      "included_in_tmps",
      "correctly_included",
      "exception_if_misstated"
    ]
  },
  {
    "id": "esd__sars_vat_declaration_for_imported_goods",
    "element": "ESD",
    "name": "SARS VAT declaration for imported goods",
    "aliases": [
      "SARS VAT declaration for imported goods",
      "VAT"
    ],
    "auditorTests": "Confirms the quantum and nature of imports. Auditor uses this to verify that imported goods are correctly included in TMPS inclusions, and that only legitimately excludable imports (no local production OR technical specification difference) are excluded.",
    "exampleData": "SARS VAT 215 declaration for FY 2026 imports: R42m, including R28m specialised equipment with no local production (excludable) and R14m generic components (not excludable).",
    "extractionPrompt": "Inspect the SARS VAT import declaration. Return JSON: total_imports_declared, importable_categories (list with values), legitimately_excludable_imports (list with basis: 'no local production' / 'technical specification difference'), non_excludable_imports, exclusion_total. Flag exclusions without ESD plan support.",
    "expectedFields": [
      "total_imports_declared",
      "importable_categories",
      "legitimately_excludable_imports",
      "non_excludable_imports",
      "exclusion_total"
    ]
  },
  {
    "id": "esd__sars_importer_registration_certificate",
    "element": "ESD",
    "name": "SARS Importer Registration Certificate",
    "aliases": [
      "SARS Importer Registration Certificate"
    ],
    "auditorTests": "Confirms the entity's authorised import number. Auditor traces this to the SARS VAT declaration to confirm the entity is the actual importer of record.",
    "exampleData": "SARS Importer Registration Certificate #IM/12345 issued 01 Apr 2018, Acme Holdings as importer of record. Matches VAT declaration importer field.",
    "extractionPrompt": "Inspect the SARS Importer Registration Certificate. Return JSON: importer_name, importer_number, issue_date, current_status, matches_vat_declaration_importer (bool). Flag any mismatch between certificate holder and import VAT declaration.",
    "expectedFields": [
      "importer_name",
      "importer_number",
      "issue_date",
      "current_status",
      "matches_vat_declaration_importer"
    ]
  },
  {
    "id": "esd__enterprise_and_supplier_development_plan_for_import_exclusio",
    "element": "ESD",
    "name": "Enterprise and Supplier Development plan (for import exclusion based on technical specification)",
    "aliases": [
      "Enterprise and Supplier Development plan (for import exclusion based on technical specification)",
      "Enterprise and Supplier Development plan"
    ],
    "auditorTests": "Where an import is excluded on the basis that the local substitute differs in brand or technical specification, at least one formal ESD plan with stated objectives, KPIs, and milestones must exist. Auditor confirms the plan is documented, current, and has been implemented.",
    "exampleData": "ESD plan dated 01 Apr 2025 — Local Supplier Development Programme targeting 2 specialised component suppliers, KPIs include 80% spec parity within 24 months, R3m budget over 3 years.",
    "extractionPrompt": "Read the ESD plan supporting an import exclusion on technical-specification grounds. Return JSON: plan_date, objectives (list), kpis_with_targets, milestones, budget, implementation_progress, plan_supports_specific_excluded_import (bool with reasoning). Flag plans that are aspirational rather than implemented.",
    "expectedFields": [
      "plan_date",
      "objectives",
      "kpis_with_targets",
      "milestones",
      "budget",
      "implementation_progress",
      "plan_supports_specific_excluded_import"
    ]
  },
  {
    "id": "esd__full_supplier_schedule_all_b_bbee_suppliers_with_total_spend",
    "element": "ESD",
    "name": "Full supplier schedule — all B-BBEE suppliers with total spend and B-BBEE status",
    "aliases": [
      "Full supplier schedule — all B-BBEE suppliers with total spend and B-BBEE status",
      "Full supplier schedule"
    ],
    "auditorTests": "Auditor uses this as the population from which to sample. Traces total spend per supplier to the general ledger / accounts payable subledger.",
    "exampleData": "Supplier schedule extract: 142 active B-BBEE suppliers. Total claimed spend R145m. Sample of 30 selected for testing. AP subledger reconciles to supplier schedule (variance R0).",
    "extractionPrompt": "Inspect the supplier schedule. Return JSON: total_bbbee_suppliers, total_claimed_spend, sample_selected, sample_size, reconciliation_to_gl_ap (variance amount, variance %). Note any supplier appearing on schedule but not in AP subledger.",
    "expectedFields": [
      "total_bbbee_suppliers",
      "total_claimed_spend",
      "sample_selected",
      "sample_size",
      "reconciliation_to_gl_ap"
    ]
  },
  {
    "id": "esd__detailed_ledger_accounts_payable_entries_per_sampled_supplie",
    "element": "ESD",
    "name": "Detailed ledger / accounts payable entries per sampled supplier",
    "aliases": [
      "Detailed ledger / accounts payable entries per sampled supplier",
      "Detailed ledger",
      "accounts payable entries per sampled supplier"
    ],
    "auditorTests": "Auditor agrees the amount claimed for each sampled supplier to the AP subledger and underlying invoices. Amount must be exclusive of VAT.",
    "exampleData": "Sampled supplier #87 (Tlakula Trading): claimed spend R2,840,000 ex-VAT. AP subledger entries Mar 25 - Feb 26 sum to R2,840,000. Supporting invoices match.",
    "extractionPrompt": "For each sampled supplier, reconcile claimed spend to AP subledger and underlying invoices. Return JSON per supplier: supplier_name, claimed_spend_ex_vat, ap_subledger_total, supporting_invoices_reviewed (count), reconciliation_status, exceptions.",
    "expectedFields": [
      "supplier_name",
      "claimed_spend_ex_vat",
      "ap_subledger_total",
      "supporting_invoices_reviewed",
      "reconciliation_status",
      "exceptions"
    ]
  },
  {
    "id": "esd__valid_b_bbee_verification_certificate_per_sampled_supplier",
    "element": "ESD",
    "name": "Valid B-BBEE verification certificate per sampled supplier",
    "aliases": [
      "Valid B-BBEE verification certificate per sampled supplier"
    ],
    "auditorTests": "Auditor checks: (1) certificate is not expired as at the relevant invoice date (12-month validity from certificate date); (2) correct recognition level (Level 1–8 or Non-Compliant) has been applied in the calculation; (3) certificate is issued by a SANAS-accredited or IRBA-registered body; (4) for certificates on Amended Codes — financial year-end is after 1 May 2015.",
    "exampleData": "Sampled supplier B-BBEE certificate: Senoga Data Solutions, Level 2, valid 14 Jun 2025 - 13 Jun 2026, issued by [SANAS-accredited body]. Empowering Supplier status confirmed.",
    "extractionPrompt": "Inspect each sampled supplier's B-BBEE verification certificate. Return JSON per certificate: supplier_name, certificate_recognition_level, certificate_issue_date, certificate_expiry_date, valid_at_each_invoice_date (bool, with list of invoice dates checked), issuing_body, sanas_or_irba_accredited (bool), amended_codes_basis (bool, FYE after 1 May 2015), empowering_supplier (bool). Flag any expired-at-invoice-date certificate.",
    "expectedFields": [
      "supplier_name",
      "certificate_recognition_level",
      "certificate_issue_date",
      "certificate_expiry_date",
      "valid_at_each_invoice_date",
      "issuing_body",
      "sanas_or_irba_accredited",
      "amended_codes_basis",
      "empowering_supplier"
    ]
  },
  {
    "id": "esd__sworn_affidavit_eme_or_51_100_black_owned_qse_suppliers",
    "element": "ESD",
    "name": "Sworn affidavit — EME or 51%/100% black-owned QSE suppliers",
    "aliases": [
      "Sworn affidavit — EME or 51%/100% black-owned QSE suppliers",
      "Sworn affidavit",
      "EME",
      "QSE"
    ],
    "auditorTests": "Auditor checks: (1) affidavit wording matches the prescribed Annexure template; (2) sworn before a Commissioner of Oaths; (3) Commissioner's signature, stamp, and date are present; (4) entity confirms Empowering Supplier status on the face of the affidavit; (5) affidavit is dated within 12 months of the relevant transaction.",
    "exampleData": "EME affidavit by Mr S. Khoza, dated 14 Aug 2025, sworn before Commissioner of Oaths SAPS Rosebank. 100% black-owned, turnover < R10m, Empowering Supplier confirmed. Annexure template wording used.",
    "extractionPrompt": "Inspect each EME / 51% / 100% black-owned QSE affidavit. Return JSON: deponent_name, supplier_entity, affidavit_date, sworn_before (commissioner / notary), commissioner_stamp_and_signature_present (bool), template_wording_matches_annexure (bool), empowering_supplier_confirmed (bool), within_12_months_of_transaction (bool). Flag any defective affidavit.",
    "expectedFields": [
      "deponent_name",
      "supplier_entity",
      "affidavit_date",
      "sworn_before",
      "commissioner_stamp_and_signature_present",
      "template_wording_matches_annexure",
      "empowering_supplier_confirmed",
      "within_12_months_of_transaction"
    ]
  },
  {
    "id": "esd__signed_sd_supplier_development_contract_minimum_3_year_term",
    "element": "ESD",
    "name": "Signed SD supplier development contract (minimum 3-year term)",
    "aliases": [
      "Signed SD supplier development contract (minimum 3-year term)",
      "Signed SD supplier development contract"
    ],
    "auditorTests": "Prerequisite for applying the 1.2× multiplier to procurement spend with that supplier. Auditor confirms: (1) contract is signed by both parties; (2) minimum 3-year term; (3) supplier holds Empowering Supplier status; (4) contract covers the Measurement Period.",
    "exampleData": "SD contract with Makhanani Tlakula, signed 01 Apr 2024, 3-year term to 31 Mar 2027. Supplier Empowering Supplier status confirmed via certificate. 1.2× multiplier applied to procurement spend of R1.85m.",
    "extractionPrompt": "Inspect each SD contract supporting a 1.2× multiplier claim. Return JSON: supplier_name, contract_date, term_start, term_end, term_length_years, both_parties_signed (bool), empowering_supplier_status_confirmed (bool), measurement_period_covered (bool), multiplier_correctly_applied (bool, with calculation).",
    "expectedFields": [
      "supplier_name",
      "contract_date",
      "term_start",
      "term_end",
      "term_length_years",
      "both_parties_signed",
      "empowering_supplier_status_confirmed",
      "measurement_period_covered",
      "multiplier_correctly_applied"
    ]
  },
  {
    "id": "esd__evidence_that_supplier_is_a_first_time_supplier_for_1_3_new_",
    "element": "ESD",
    "name": "Evidence that supplier is a first-time supplier (for 1.3× new supplier multiplier)",
    "aliases": [
      "Evidence that supplier is a first-time supplier (for 1.3× new supplier multiplier)",
      "Evidence that supplier is a first-time supplier"
    ],
    "auditorTests": "Auditor confirms through AP records that the supplier does not appear in any prior-year accounts payable or purchasing records before the Measurement Period.",
    "exampleData": "First-time supplier check for [Supplier]: AP and procurement records 2020-2024 confirm no prior purchases. First invoice in Measurement Period dated 14 May 2025. 1.3× multiplier valid.",
    "extractionPrompt": "For each claimed new-supplier (1.3× multiplier), interrogate prior-period AP and PO records (at least 24 months prior). Return JSON: supplier_name, prior_records_inspected (period), prior_entries_found (none / count), genuinely_new_supplier (bool), multiplier_claim_valid (bool).",
    "expectedFields": [
      "supplier_name",
      "prior_records_inspected",
      "prior_entries_found",
      "genuinely_new_supplier",
      "multiplier_claim_valid"
    ]
  },
  {
    "id": "esd__confirmation_of_ee_act_skills_development_act_and_sdl_act_co",
    "element": "ESD",
    "name": "Confirmation of EE Act, Skills Development Act, and SDL Act compliance",
    "aliases": [
      "Confirmation of EE Act, Skills Development Act, and SDL Act compliance",
      "SDL"
    ],
    "auditorTests": "Established during the Management Control and Skills Development pillars. Auditor confirms EEA2 was submitted and SETA obligations were met — these are prerequisites for Empowering Supplier status.",
    "exampleData": "EE compliance verified in Management Control sheet. SDL compliance verified in Skills Development sheet. SDL Act submissions current. Empowering Supplier prerequisites met.",
    "extractionPrompt": "Confirm Empowering Supplier prerequisites for the Measured Entity (where relevant). Return JSON: eea2_submitted (bool, ref [MC_SHEET]), seta_obligations_met (bool, ref [SD_SHEET]), sdl_act_compliance (bool), all_prerequisites_met (bool). Flag any prerequisite not yet established.",
    "expectedFields": [
      "eea2_submitted",
      "seta_obligations_met",
      "sdl_act_compliance",
      "all_prerequisites_met"
    ]
  },
  {
    "id": "esd__procurement_records_showing_25_local_cost_of_sales_sourcing",
    "element": "ESD",
    "name": "Procurement records showing ≥ 25% local cost of sales sourcing",
    "aliases": [
      "Procurement records showing ≥ 25% local cost of sales sourcing"
    ],
    "auditorTests": "Auditor calculates local procurement as a % of total cost of sales and agrees to purchase orders, invoices, and import records.",
    "exampleData": "Local procurement = R175m / Total cost of sales R210m = 83.3%. Comfortably above 25% threshold. PO and invoice sample tied to local supplier confirmations.",
    "extractionPrompt": "Calculate local cost-of-sales sourcing percentage. Return JSON: local_procurement_value, total_cost_of_sales, local_percentage, threshold_25_percent_met (bool), sampling_methodology, supporting_pos_invoices_count. Flag any reliance on importer-of-record arrangements that may inflate the local figure.",
    "expectedFields": [
      "local_procurement_value",
      "total_cost_of_sales",
      "local_percentage",
      "threshold_25_percent_met",
      "sampling_methodology",
      "supporting_pos_invoices_count"
    ]
  },
  {
    "id": "esd__hr_records_payroll_showing_jobs_created_and_black_sa_employe",
    "element": "ESD",
    "name": "HR records / payroll showing jobs created and black SA employee count maintained",
    "aliases": [
      "HR records / payroll showing jobs created and black SA employee count maintained",
      "HR records",
      "payroll showing jobs created and black SA employee count maintained"
    ],
    "auditorTests": "Auditor agrees current headcount of black SA employees to payroll and compares to prior verification period to confirm no net reduction. For new jobs, confirms 50% are for black South Africans.",
    "exampleData": "Headcount: Black SA employees at Measurement Date 245 vs prior period 240. Net +5 jobs. Of 5 new jobs, 4 are for black SAs (80% — above 50% threshold).",
    "extractionPrompt": "Inspect HR records / payroll for headcount continuity and new-job composition. Return JSON: black_sa_headcount_at_measurement_date, black_sa_headcount_at_prior_period, net_change, net_reduction (bool — disqualifying), new_jobs_created, new_jobs_for_black_sa, percentage_for_black_sa, 50_percent_threshold_met (bool).",
    "expectedFields": [
      "black_sa_headcount_at_measurement_date",
      "black_sa_headcount_at_prior_period",
      "net_change",
      "net_reduction",
      "new_jobs_created",
      "new_jobs_for_black_sa",
      "percentage_for_black_sa"
    ]
  },
  {
    "id": "esd__evidence_of_12_days_productivity_assistance_to_51_black_owne",
    "element": "ESD",
    "name": "Evidence of ≥ 12 days productivity assistance to 51% black-owned EMEs/QSEs",
    "aliases": [
      "Evidence of ≥ 12 days productivity assistance to 51% black-owned EMEs/QSEs",
      "Evidence of ≥ 12 days productivity assistance to 51% black-owned EMEs",
      "QSEs"
    ],
    "auditorTests": "Auditor requires: timesheets or project records showing the days spent; identity of the EME/QSE assisted (with its B-BBEE affidavit or certificate); and confirmation that the assistance relates to operational or financial capacity building.",
    "exampleData": "Productivity assistance log: 14 days provided to Tlakula Trading (51% black-owned QSE) on financial reporting setup and supplier-onboarding capacity. Timesheets and project notes attached. QSE affidavit on file.",
    "extractionPrompt": "Inspect productivity assistance evidence. Return JSON per beneficiary: beneficiary_name, beneficiary_status (EME / QSE 51% black-owned), days_provided, timesheet_present (bool), nature_of_assistance, operational_or_financial_capacity_building (bool), ≥12_days_threshold_met (bool).",
    "expectedFields": [
      "beneficiary_name",
      "beneficiary_status",
      "days_provided",
      "timesheet_present",
      "nature_of_assistance",
      "operational_or_financial_capacity_building"
    ]
  },
  {
    "id": "esd__audited_afs_or_signed_management_accounts_for_npat_target_de",
    "element": "ESD",
    "name": "Audited AFS or signed management accounts — for NPAT target determination",
    "aliases": [
      "Audited AFS or signed management accounts — for NPAT target determination",
      "Audited AFS or signed management accounts",
      "AFS",
      "NPAT"
    ],
    "auditorTests": "Auditor determines which NPAT tier applies: (1) current year NPAT; (2) 5-year average NPAT; or (3) Indicative NPAT (Revenue × 25% of industry norm net profit margin per Stats SA). Documents the basis and obtains the relevant Stats SA quarterly statistics where Indicative NPAT applies.",
    "exampleData": "NPAT FYE Mar 2026: R8.2m. Revenue R215m. Margin 3.8%. Industry norm net profit margin (Stats SA QFS Q4 2025, wholesale/retail trade) = 5.6%. 25% of industry norm = 1.4%. Entity margin 3.8% > 1.4% — use current-year NPAT.",
    "extractionPrompt": "Determine the applicable NPAT base. Return JSON: current_year_npat, current_year_revenue, current_year_npat_margin, industry_norm_margin (with Stats SA reference and date), 25_percent_of_industry_norm, current_year_margin_passes_25_percent_test (bool), npat_basis_selected (current / 5_year_avg / indicative), reasoning, npat_used_for_target.",
    "expectedFields": [
      "current_year_npat",
      "current_year_revenue",
      "current_year_npat_margin",
      "industry_norm_margin"
    ]
  },
  {
    "id": "esd__stats_sa_quarterly_industry_statistics_indicative_npat_only",
    "element": "ESD",
    "name": "Stats SA quarterly industry statistics (Indicative NPAT only)",
    "aliases": [
      "Stats SA quarterly industry statistics (Indicative NPAT only)",
      "Stats SA quarterly industry statistics",
      "NPAT"
    ],
    "auditorTests": "Where the entity made no profit or its net profit margin was less than 25% of the industry norm, auditor sources the applicable Stats SA quarterly release (or other verifiable data) for the industry norm net profit margin and recalculates the Indicative NPAT.",
    "exampleData": "Stats SA QFS Q4 2025 release dated 14 Mar 2026, wholesale/retail trade net profit margin 5.6%. Indicative NPAT applied: R215m × (5.6% × 25%) = R3,010,000.",
    "extractionPrompt": "Where Indicative NPAT applies, inspect Stats SA quarterly statistics or other verifiable industry data. Return JSON: industry_sic_code, stats_sa_release_reference, release_date, industry_norm_margin, 25_percent_norm, entity_revenue, indicative_npat_calculated. Show the calculation.",
    "expectedFields": [
      "industry_sic_code",
      "stats_sa_release_reference",
      "release_date",
      "industry_norm_margin"
    ]
  },
  {
    "id": "esd__b_bbee_certificate_or_affidavit_for_each_esd_sd_beneficiary_",
    "element": "ESD",
    "name": "B-BBEE certificate or affidavit for each ESD/SD beneficiary entity",
    "aliases": [
      "B-BBEE certificate or affidavit for each ESD/SD beneficiary entity",
      "B-BBEE certificate or affidavit for each ESD",
      "SD beneficiary entity",
      "ESD"
    ],
    "auditorTests": "Confirms the beneficiary qualifies as a 51% black-owned EME or QSE. Auditor inspects the certificate (if verified) or affidavit (if EME / black-owned QSE). Where status cannot be confirmed, no points are awarded for that contribution.",
    "exampleData": "ESD beneficiary Tlakula Trading: Level 1 affidavit dated 14 Mar 2025, 100% black-owned EME, turnover R7.5m. Eligible for ED contribution recognition.",
    "extractionPrompt": "Inspect the B-BBEE certificate / affidavit for each ESD / SD beneficiary. Return JSON per beneficiary: beneficiary_name, status_claimed (51% black-owned EME / QSE), evidence_type (certificate / affidavit), status_confirmed (bool), evidence_date, valid_at_contribution_date (bool). Without confirmed status, no points awarded.",
    "expectedFields": [
      "beneficiary_name",
      "status_claimed",
      "evidence_type",
      "status_confirmed",
      "evidence_date",
      "valid_at_contribution_date"
    ]
  },
  {
    "id": "esd__esd_sd_agreement_with_each_beneficiary",
    "element": "ESD",
    "name": "ESD / SD agreement with each beneficiary",
    "aliases": [
      "ESD / SD agreement with each beneficiary",
      "SD agreement with each beneficiary",
      "ESD"
    ],
    "auditorTests": "Auditor confirms: (1) agreement complies with Statement 600, Annexure 600(A) criteria; (2) contribution amount, nature (grant, loan, reduced price, technical assistance, etc.), and term are specified; (3) obligation to pay vested within the Measurement Period.",
    "exampleData": "ESD agreement with Tlakula Trading dated 01 Apr 2025: R250,000 grant + 14 days mentorship over 12 months. Specifies financial reporting capability objective. Statement 600 Annexure 600(A) criteria met.",
    "extractionPrompt": "Inspect each ESD / SD agreement. Return JSON: beneficiary_name, agreement_date, contribution_value, contribution_type (grant / loan / reduced price / technical / other), term, statement_600_annexure_600a_criteria_met (bool, with checklist), obligation_vested_in_measurement_period (bool).",
    "expectedFields": [
      "beneficiary_name",
      "agreement_date",
      "contribution_value",
      "contribution_type",
      "term",
      "statement_600_annexure_600a_criteria_met",
      "obligation_vested_in_measurement_period"
    ]
  },
  {
    "id": "esd__proof_of_payment_grants_cash_contributions",
    "element": "ESD",
    "name": "Proof of payment — grants, cash contributions",
    "aliases": [
      "Proof of payment — grants, cash contributions",
      "Proof of payment"
    ],
    "auditorTests": "Bank statement or EFT confirmation showing: (1) payment was made to the beneficiary (not an intermediary unless the agreement names one); (2) amount matches the agreement; (3) payment date falls within the Measurement Period. For multi-year programmes, only the annual instalment is recognised.",
    "exampleData": "EFT proof of payment 14 Apr 2025, R250,000 from Acme to Tlakula Trading bank account ending 4421. Reference 'ESD Grant 2025'. Amount and beneficiary match agreement.",
    "extractionPrompt": "Inspect proof of payment for each cash contribution. Return JSON per payment: beneficiary_name, payment_date, amount, payment_to_named_beneficiary (bool), within_measurement_period (bool), matches_agreement_amount (bool), multi_year_treatment (annual instalment recognised, not full programme). Flag any intermediary payment without agreement basis.",
    "expectedFields": [
      "beneficiary_name",
      "payment_date",
      "amount",
      "payment_to_named_beneficiary",
      "within_measurement_period",
      "matches_agreement_amount",
      "multi_year_treatment"
    ]
  },
  {
    "id": "esd__signed_goods_delivery_note_or_completion_certificate_in_kind",
    "element": "ESD",
    "name": "Signed goods delivery note or completion certificate — in-kind contributions",
    "aliases": [
      "Signed goods delivery note or completion certificate — in-kind contributions",
      "Signed goods delivery note or completion certificate"
    ],
    "auditorTests": "Where the contribution is in the form of goods or services rendered, auditor requires: (1) a signed delivery note or completion certificate from the beneficiary; (2) an invoice from the supplier confirming the cost to the Measured Entity; (3) confirmation the delivery occurred within the Measurement Period.",
    "exampleData": "Delivery note signed by Tlakula Trading CFO on 28 Sep 2025 confirming receipt of 6× HP laptops (value R72,000 ex-VAT). Supplier invoice to Acme attached, dated 12 Sep 2025.",
    "extractionPrompt": "Inspect in-kind contribution evidence. Return JSON per contribution: beneficiary, goods_or_services_description, delivery_note_signed (bool, by whom, date), supplier_invoice_present (bool, value ex-VAT), within_measurement_period (bool), excludes_vat (bool).",
    "expectedFields": [
      "beneficiary",
      "goods_or_services_description",
      "delivery_note_signed",
      "supplier_invoice_present",
      "within_measurement_period",
      "excludes_vat"
    ]
  },
  {
    "id": "esd__loan_agreement_and_outstanding_balance_confirmation_loan_con",
    "element": "ESD",
    "name": "Loan agreement and outstanding balance confirmation — loan contributions",
    "aliases": [
      "Loan agreement and outstanding balance confirmation — loan contributions",
      "Loan agreement and outstanding balance confirmation"
    ],
    "auditorTests": "For loans recognised as ESD: auditor confirms the outstanding loan balance as at Measurement Date (not the original loan amount) and verifies this against the entity's loan receivable in the AFS. The recognised contribution equals the outstanding balance at Measurement Date.",
    "exampleData": "Loan to Tlakula Trading: original loan R500,000 (2023). Outstanding balance at Measurement Date 28 Feb 2026: R280,000. Recognised ESD contribution = R280,000 (outstanding balance).",
    "extractionPrompt": "Inspect loan agreement and outstanding balance confirmation for each loan-based ESD contribution. Return JSON: beneficiary, original_loan_amount, original_loan_date, outstanding_balance_at_measurement_date, balance_confirmation_source, matches_afs_loan_receivable (bool). Recognised contribution = outstanding balance, NOT original loan.",
    "expectedFields": [
      "beneficiary",
      "original_loan_amount",
      "original_loan_date",
      "outstanding_balance_at_measurement_date",
      "balance_confirmation_source",
      "matches_afs_loan_receivable"
    ]
  },
  {
    "id": "esd__invoice_and_proof_of_payment_showing_payment_within_15_days_",
    "element": "ESD",
    "name": "Invoice and proof of payment showing payment within 15 days (shorter payment period contributions)",
    "aliases": [
      "Invoice and proof of payment showing payment within 15 days (shorter payment period contributions)",
      "Invoice and proof of payment showing payment within 15 days"
    ],
    "auditorTests": "Auditor samples invoices and corresponding EFT / bank entries to confirm the time between invoice date and payment date is less than 15 days. Applies the Benefit Factor Matrix (Annexure 400B) to calculate the contribution value. Confirms this category does not exceed 15% of the 10 SD points (max 1.5 pts).",
    "exampleData": "Shorter-payment-terms claim: 28 invoices to EME suppliers paid within 12 days average. Benefit Factor applied per Annexure 400B. Claim R 1.45m (1.45 pts) — within 15% / 1.5 pts cap.",
    "extractionPrompt": "Inspect short-payment-term contributions. Return JSON: sampled_invoices (list with invoice_date, payment_date, days_to_payment), all_paid_within_15_days (bool), benefit_factor_applied (matrix reference), total_claim_value, total_claim_points, within_15_percent_of_10_SD_points_cap (bool, ≤1.5 pts).",
    "expectedFields": [
      "sampled_invoices",
      "all_paid_within_15_days",
      "benefit_factor_applied",
      "total_claim_value",
      "total_claim_points",
      "within_15_percent_of_10_SD_points_cap"
    ]
  },
  {
    "id": "esd__vat_invoices_confirmation_that_vat_is_excluded_from_claimed_",
    "element": "ESD",
    "name": "VAT invoices / confirmation that VAT is excluded from claimed amounts",
    "aliases": [
      "VAT invoices / confirmation that VAT is excluded from claimed amounts",
      "VAT invoices",
      "confirmation that VAT is excluded from claimed amounts",
      "VAT"
    ],
    "auditorTests": "Auditor rechecks all claimed contribution amounts against supporting invoices to confirm VAT has not been included. Over-claiming due to VAT inclusion is a common misstatement.",
    "exampleData": "Review of 12 ESD claims: all invoice values used exclude VAT. One initial claim flagged as VAT-inclusive (R171k), corrected to R148.7k ex-VAT.",
    "extractionPrompt": "Recheck all claimed ESD / SD contribution amounts against supporting invoices for VAT treatment. Return JSON: contributions_reviewed (count), vat_inclusive_misstatements (list with original claim, corrected ex-VAT amount, supplier), total_overstatement_corrected. Common error — assess as material misstatement if total > 5% of element.",
    "expectedFields": [
      "contributions_reviewed",
      "vat_inclusive_misstatements",
      "total_overstatement_corrected"
    ]
  },
  {
    "id": "esd__invoice_or_purchase_order_showing_beneficiary_now_supplies_t",
    "element": "ESD",
    "name": "Invoice or purchase order showing beneficiary now supplies the Measured Entity (bonus 2.4.1 — graduation)",
    "aliases": [
      "Invoice or purchase order showing beneficiary now supplies the Measured Entity (bonus 2.4.1 — graduation)",
      "Invoice or purchase order showing beneficiary now supplies the Measured Entity (bonus 2.4.1"
    ],
    "auditorTests": "Confirms the enterprise development beneficiary has graduated to Empowering Supplier status and is now supplying the entity. Auditor also requires the beneficiary's current B-BBEE certificate confirming Empowering Supplier status.",
    "exampleData": "ED beneficiary Tlakula Trading now supplies Acme: PO #PO-7842 dated 14 Jan 2026, R45,000 for IT support services. Tlakula current certificate confirms Empowering Supplier Level 2.",
    "extractionPrompt": "For each ED-to-supplier graduation bonus claim (item 2.4.1), inspect: Return JSON per beneficiary: beneficiary_name, supplying_evidence (PO/invoice references), current_bbbee_certificate_present (bool), empowering_supplier_status_confirmed (bool), graduation_basis_clear (bool).",
    "expectedFields": [
      "beneficiary_name",
      "supplying_evidence",
      "current_bbbee_certificate_present",
      "empowering_supplier_status_confirmed",
      "graduation_basis_clear"
    ]
  },
  {
    "id": "esd__signed_declaration_affidavit_confirming_job_creation_bonus_2",
    "element": "ESD",
    "name": "Signed declaration / affidavit confirming job creation (bonus 2.4.2)",
    "aliases": [
      "Signed declaration / affidavit confirming job creation (bonus 2.4.2)",
      "Signed declaration",
      "affidavit confirming job creation"
    ],
    "auditorTests": "Confirms at least one job was created directly as a result of SD/ED contributions. If the job is within the Measured Entity, the entity declares it. If within the beneficiary, the beneficiary declares it. Auditor assesses the plausibility of the causal link.",
    "exampleData": "Affidavit by Tlakula Trading CEO, dated 14 Feb 2026, declaring 3 jobs created at Tlakula directly attributable to Acme's ESD support (R250k grant + mentorship). Plausibility assessed — supported by mentorship records.",
    "extractionPrompt": "Inspect job-creation declarations for bonus 2.4.2. Return JSON per declaration: declarant, declarant_entity (measured entity / beneficiary), declaration_date, jobs_created (count), causal_link_to_sd_ed_described (text), plausibility_assessment (low / medium / high with reasoning).",
    "expectedFields": [
      "declarant",
      "declarant_entity",
      "declaration_date",
      "jobs_created",
      "causal_link_to_sd_ed_described",
      "plausibility_assessment"
    ]
  },
  {
    "id": "sed__audited_afs_or_signed_management_accounts",
    "element": "SED",
    "name": "Audited AFS or signed management accounts",
    "aliases": [
      "Audited AFS or signed management accounts",
      "AFS"
    ],
    "auditorTests": "Used to determine the applicable NPAT base for the 1% target. Auditor: (1) extracts NPAT from the AFS; (2) calculates the net profit margin (NPAT ÷ Revenue); (3) determines whether current-year NPAT, 5-year average NPAT, or Indicative NPAT applies by comparing the net profit margin to 25% of the industry norm. If the entity made a loss, moves to the 5-year average test.",
    "exampleData": "AFS FYE 31 Mar 2026: NPAT R8.2m, Revenue R215m, margin 3.8%. Industry norm 5.6%, 25% of norm = 1.4%. Margin passes test. Current-year NPAT used → 1% target = R82,000.",
    "extractionPrompt": "Determine the applicable NPAT base for the 1% SED target. Return JSON: current_year_npat, current_year_revenue, current_year_margin, industry_norm_margin (with source), 25_percent_norm, test_outcome (current_npat / 5_year_avg / indicative_npat), npat_basis_used, sed_target_at_1_percent. Show the calculation.",
    "expectedFields": [
      "current_year_npat",
      "current_year_revenue",
      "current_year_margin",
      "industry_norm_margin"
    ]
  },
  {
    "id": "sed__afs_for_each_of_the_prior_5_financial_years_where_5_year_ave",
    "element": "SED",
    "name": "AFS for each of the prior 5 financial years (where 5-year average NPAT applies)",
    "aliases": [
      "AFS for each of the prior 5 financial years (where 5-year average NPAT applies)",
      "AFS for each of the prior 5 financial years",
      "AFS",
      "NPAT"
    ],
    "auditorTests": "Auditor confirms the 5-year average NPAT is calculated using the most recent 5 completed financial years. Where a prior year's AFS is unaudited, management accounts signed by a director are accepted.",
    "exampleData": "Prior 5 AFS reviewed (FYE Mar 2022-2026): NPAT R4.2m, R6.8m, R7.1m, R8.5m, R8.2m. Five-year average R6.96m. 1% target = R69,600.",
    "extractionPrompt": "Where 5-year average NPAT applies, inspect 5 prior AFS. Return JSON: years_reviewed (5 most recent), npat_per_year, average_npat, unaudited_years_with_signed_management_accounts (list), one_percent_target.",
    "expectedFields": [
      "years_reviewed",
      "npat_per_year",
      "average_npat",
      "unaudited_years_with_signed_management_accounts",
      "one_percent_target"
    ]
  },
  {
    "id": "sed__stats_sa_quarterly_industry_statistics_verifiable_industry_n",
    "element": "SED",
    "name": "Stats SA quarterly industry statistics / verifiable industry norm data (Indicative NPAT only)",
    "aliases": [
      "Stats SA quarterly industry statistics / verifiable industry norm data (Indicative NPAT only)",
      "Stats SA quarterly industry statistics",
      "verifiable industry norm data",
      "NPAT"
    ],
    "auditorTests": "Where both current-year and 5-year average NPAT fail the 25%-of-industry-norm test, auditor sources the industry norm net profit margin from Stats SA or another verifiable source, applies 25%, and multiplies by the entity's current-year revenue to arrive at the Indicative NPAT.",
    "exampleData": "Indicative NPAT: Stats SA QFS Q4 2025, wholesale/retail trade net profit margin 5.6%. 25% × 5.6% = 1.4%. Entity revenue R215m. Indicative NPAT = R215m × 1.4% = R3,010,000. 1% target = R30,100.",
    "extractionPrompt": "Where Indicative NPAT applies, source industry norm net profit margin. Return JSON: industry_sic_code, source (Stats SA release reference and date OR alternative verifiable source), industry_norm_margin, 25_percent_norm, entity_revenue, indicative_npat, one_percent_target. Show the calculation.",
    "expectedFields": [
      "industry_sic_code",
      "source",
      "industry_norm_margin"
    ]
  },
  {
    "id": "sed__all_sed_agreements_with_beneficiaries_intermediary_organisat",
    "element": "SED",
    "name": "All SED agreements with beneficiaries / intermediary organisations",
    "aliases": [
      "All SED agreements with beneficiaries / intermediary organisations",
      "All SED agreements with beneficiaries",
      "intermediary organisations",
      "SED"
    ],
    "auditorTests": "Auditor confirms each agreement: (1) complies with Statement 500, Annexure 500(A) criteria; (2) specifies the nature and quantum of the contribution; (3) identifies the beneficiary or class of beneficiaries; (4) confirms the contribution facilitates sustainable access to the economy. Contributions that are purely commercial sponsorships without a development objective are disqualified.",
    "exampleData": "SED agreement with Reach for a Dream Foundation dated 01 Jul 2025: R45,000 grant for sustainable youth skills programme. Beneficiary class: black youth aged 15-18 from Tembisa. Statement 500 Annexure 500(A) criteria met.",
    "extractionPrompt": "Inspect each SED agreement. Return JSON: beneficiary_or_intermediary_name, agreement_date, contribution_value, contribution_type (cash / in-kind / professional services / other), beneficiary_class_specified (bool, with detail), development_objective_stated (bool), facilitates_access_to_economy (bool with reasoning), statement_500_annexure_500a_criteria_met (bool, checklist), purely_commercial_sponsorship (bool — disqualifying if true).",
    "expectedFields": [
      "beneficiary_or_intermediary_name",
      "agreement_date",
      "contribution_value",
      "contribution_type",
      "beneficiary_class_specified",
      "development_objective_stated",
      "facilitates_access_to_economy",
      "statement_500_annexure_500a_criteria_met",
      "purely_commercial_sponsorship"
    ]
  },
  {
    "id": "sed__sworn_affidavit_from_beneficiary_organisation_representative",
    "element": "SED",
    "name": "Sworn affidavit from beneficiary organisation representative — confirming % of Black beneficiaries",
    "aliases": [
      "Sworn affidavit from beneficiary organisation representative — confirming % of Black beneficiaries",
      "Sworn affidavit from beneficiary organisation representative"
    ],
    "auditorTests": "Auditor checks: (1) the deponent is an authorised representative of the intermediary or beneficiary organisation (e.g., CEO, chairperson of NPO); (2) the affidavit specifies the percentage of beneficiaries who are Black People; (3) it is sworn before a Commissioner of Oaths with the stamp and date present; (4) if < 75% of beneficiaries are Black, the contribution value is multiplied by the actual black % before application to the scorecard.",
    "exampleData": "Sworn affidavit by Reach for a Dream Foundation CEO Ms K. Khumalo dated 14 Aug 2025: '92% of beneficiaries are Black People per Codes definition.' Commissioner of Oaths stamp, SAPS Sandton, dated.",
    "extractionPrompt": "Inspect the beneficiary affidavit confirming black beneficiary %. Return JSON: deponent_name, deponent_role, organisation, affidavit_date, sworn_before_commissioner (bool), commissioner_stamp_and_date_present (bool), black_beneficiary_percentage_declared, multiplier_to_apply_to_contribution (1 if ≥75%, else the actual %).",
    "expectedFields": [
      "deponent_name",
      "deponent_role",
      "organisation",
      "affidavit_date",
      "sworn_before_commissioner",
      "commissioner_stamp_and_date_present",
      "black_beneficiary_percentage_declared",
      "multiplier_to_apply_to_contribution"
    ]
  },
  {
    "id": "sed__independent_competent_person_s_report_on_black_beneficiary_a",
    "element": "SED",
    "name": "Independent competent person's report on black beneficiary % (alternative to affidavit)",
    "aliases": [
      "Independent competent person's report on black beneficiary % (alternative to affidavit)",
      "Independent competent person's report on black beneficiary %"
    ],
    "auditorTests": "Auditor reviews the report for: (1) competence and independence of the author; (2) methodology used to determine the black beneficiary percentage; (3) consistency with publicly available information about the beneficiary organisation.",
    "exampleData": "Independent report by [Audit firm] dated 14 Feb 2026 assessing black beneficiary % of Reach for a Dream programmes — concludes 91%. Methodology: registration record sample, demographic verification. Author qualifications and independence statement included.",
    "extractionPrompt": "Inspect the independent competent person's report on beneficiary demographics. Return JSON: author_name, author_qualifications, independence_confirmed (bool), report_date, methodology_summary, black_beneficiary_percentage_concluded, consistency_with_public_information (bool). Used as alternative to affidavit.",
    "expectedFields": [
      "author_name",
      "author_qualifications",
      "independence_confirmed",
      "report_date",
      "methodology_summary",
      "black_beneficiary_percentage_concluded",
      "consistency_with_public_information"
    ]
  },
  {
    "id": "sed__proof_of_payment_cash_grants_donations_or_monetary_contribut",
    "element": "SED",
    "name": "Proof of payment — cash grants, donations, or monetary contributions",
    "aliases": [
      "Proof of payment — cash grants, donations, or monetary contributions",
      "Proof of payment"
    ],
    "auditorTests": "Bank statement or EFT confirmation showing: (1) payment was made to the named beneficiary or intermediary per the SED agreement; (2) payment amount matches the agreement (exclusive of VAT); (3) payment date is within the Measurement Period. Payments made after period-end (even if they relate to the period) cannot be recognised unless the obligation vested in the period.",
    "exampleData": "EFT proof of payment dated 14 Jul 2025, R45,000 from Acme to Reach for a Dream Foundation, bank account ending 9821, reference 'SED Grant 2025'. Matches agreement.",
    "extractionPrompt": "Inspect proof of payment for cash SED contributions. Return JSON per payment: beneficiary_name, payment_date, amount_paid, matches_agreement_value (bool), payment_within_measurement_period (bool), excludes_vat (bool), obligation_vested_in_period (bool — required for accruals after period-end).",
    "expectedFields": [
      "beneficiary_name",
      "payment_date",
      "amount_paid",
      "matches_agreement_value",
      "payment_within_measurement_period",
      "excludes_vat",
      "obligation_vested_in_period"
    ]
  },
  {
    "id": "sed__signed_delivery_note_or_completion_certificate_in_kind_contr",
    "element": "SED",
    "name": "Signed delivery note or completion certificate — in-kind contributions (goods, equipment, services)",
    "aliases": [
      "Signed delivery note or completion certificate — in-kind contributions (goods, equipment, services)",
      "Signed delivery note or completion certificate"
    ],
    "auditorTests": "Auditor requires: (1) a delivery note signed by the beneficiary confirming receipt of goods or services within the Measurement Period; (2) a supplier invoice confirming the cost to the Measured Entity (exclusive of VAT); (3) confirmation the contribution is consistent with the SED agreement's stated objective.",
    "exampleData": "Delivery note from St Marks Special School, signed by principal, dated 14 Aug 2025, confirming receipt of 12 wheelchairs (R85,000 ex-VAT). Aligned with SED agreement objective.",
    "extractionPrompt": "Inspect in-kind contribution delivery evidence. Return JSON: beneficiary_name, item_description, delivery_note_signed_by, delivery_date, supplier_invoice_present (bool, value ex-VAT), within_measurement_period (bool), consistent_with_sed_agreement_objective (bool).",
    "expectedFields": [
      "beneficiary_name",
      "item_description",
      "delivery_note_signed_by",
      "delivery_date",
      "supplier_invoice_present",
      "within_measurement_period",
      "consistent_with_sed_agreement_objective"
    ]
  },
  {
    "id": "sed__supplier_invoices_for_goods_services_contributed_in_kind",
    "element": "SED",
    "name": "Supplier invoices for goods / services contributed in kind",
    "aliases": [
      "Supplier invoices for goods / services contributed in kind",
      "Supplier invoices for goods",
      "services contributed in kind"
    ],
    "auditorTests": "Auditor confirms: (1) the invoice is addressed to the Measured Entity; (2) the amount is exclusive of VAT; (3) the goods or services have been delivered to the beneficiary, not consumed by the entity itself.",
    "exampleData": "Supplier invoice from [Medical Supplier] to Acme dated 04 Aug 2025, R85,000 ex-VAT, for 12 wheelchairs delivered to St Marks Special School (not retained by Acme).",
    "extractionPrompt": "Inspect supplier invoices for in-kind contributions. Return JSON: supplier_name, invoice_date, amount_ex_vat, addressed_to_measured_entity (bool), goods_delivered_to_beneficiary_not_retained (bool with evidence). Flag VAT inclusion or retention-by-entity.",
    "expectedFields": [
      "supplier_name",
      "invoice_date",
      "amount_ex_vat",
      "addressed_to_measured_entity",
      "goods_delivered_to_beneficiary_not_retained"
    ]
  },
  {
    "id": "sed__timesheet_secondment_records_employee_time_contributed_to_se",
    "element": "SED",
    "name": "Timesheet / secondment records — employee time contributed to SED initiatives",
    "aliases": [
      "Timesheet / secondment records — employee time contributed to SED initiatives",
      "Timesheet / secondment records",
      "Timesheet",
      "secondment records",
      "SED"
    ],
    "auditorTests": "Where the contribution is in the form of employee time (e.g., professional services, mentoring), auditor confirms: (1) the cost of the time is calculated at the employee's cost-to-company rate; (2) timesheets are signed by the employee and their line manager; (3) the time relates to work performed for the beneficiary, not internal entity activities.",
    "exampleData": "Timesheets of senior consultant K. Mthembu — 32 hours mentoring at NPO 'YouthLab' during Jul-Sep 2025. Signed by employee and line manager. Cost at CTC rate of R650/hr = R20,800. Work performed for beneficiary, not internal.",
    "extractionPrompt": "Inspect time-based SED contributions. Return JSON per contribution: employee_name, hours_contributed, ctc_rate_per_hour (with basis), calculated_value, timesheet_signed_by_employee_and_manager (bool), work_performed_for_beneficiary (bool — internal entity work disqualified), beneficiary_name.",
    "expectedFields": [
      "employee_name",
      "hours_contributed",
      "ctc_rate_per_hour",
      "calculated_value",
      "timesheet_signed_by_employee_and_manager",
      "work_performed_for_beneficiary",
      "beneficiary_name"
    ]
  },
  {
    "id": "sed__benefit_factor_matrix_calculation_workpaper",
    "element": "SED",
    "name": "Benefit Factor Matrix calculation workpaper",
    "aliases": [
      "Benefit Factor Matrix calculation workpaper"
    ],
    "auditorTests": "Auditor recalculates the recognised SED contribution value by applying the Benefit Factor Matrix under Statement 500. Different contribution types (cash, in-kind goods, professional services, bursaries, etc.) attract different benefit factors. The auditor confirms the entity has used the correct factor for each contribution type.",
    "exampleData": "Benefit Factor matrix workpaper: cash grants 100% recognition; in-kind goods 100%; professional services 80%; bursaries 100%. Total contributions R245k → recognised R235k after factor application.",
    "extractionPrompt": "Recalculate recognised SED contributions using the Benefit Factor Matrix (Statement 500). Return JSON per contribution: contribution_type, gross_value, benefit_factor_per_matrix, recognised_value, factor_correctly_applied (bool). Sum gross_value and recognised_value totals; flag any mis-applied factor.",
    "expectedFields": [
      "contribution_type",
      "gross_value",
      "benefit_factor_per_matrix",
      "recognised_value",
      "factor_correctly_applied"
    ]
  },
  {
    "id": "sed__skills_development_expenditure_schedule_to_prevent_double_co",
    "element": "SED",
    "name": "Skills Development expenditure schedule (to prevent double-counting with SED)",
    "aliases": [
      "Skills Development expenditure schedule (to prevent double-counting with SED)",
      "Skills Development expenditure schedule",
      "SED"
    ],
    "auditorTests": "Auditor cross-references the SED claim against the Skills Development claim to confirm that no single expense has been recognised under both elements. Any skills-related spend already counted under Code 300 must be excluded from the SED scorecard.",
    "exampleData": "Cross-check: SED claim of R245k includes no bursary expenses already claimed under Skills Development Code 300. SD bursary expenses R85k are separately listed and excluded from SED.",
    "extractionPrompt": "Cross-reference SED contributions against Skills Development claims. Return JSON: sed_contributions (list with values), sd_contributions (list with values), double_counted_items (list — must be excluded from SED), corrected_sed_claim, double_counting_risk_assessment.",
    "expectedFields": [
      "sed_contributions",
      "sd_contributions",
      "double_counted_items",
      "corrected_sed_claim",
      "double_counting_risk_assessment"
    ]
  },
  {
    "id": "sed__vat_confirmation_exclusion_of_vat_from_all_claimed_amounts",
    "element": "SED",
    "name": "VAT confirmation — exclusion of VAT from all claimed amounts",
    "aliases": [
      "VAT confirmation — exclusion of VAT from all claimed amounts",
      "VAT confirmation",
      "VAT"
    ],
    "auditorTests": "Auditor inspects each invoice supporting an SED contribution to confirm the amount claimed is the VAT-exclusive amount. Over-claiming due to VAT inclusion is a frequent error, particularly for in-kind goods contributions.",
    "exampleData": "All 8 SED invoices inspected — all ex-VAT amounts used in claim. One invoice initially recorded as VAT-inclusive (R5,750 → corrected to R5,000 ex-VAT). Total claim reduced by R750.",
    "extractionPrompt": "Recheck each SED contribution invoice for VAT treatment. Return JSON: invoices_reviewed_count, vat_inclusive_misstatements (list with original_claim and corrected_ex_vat amount), total_overstatement_corrected, common_error_areas (typically in-kind goods).",
    "expectedFields": [
      "invoices_reviewed_count",
      "vat_inclusive_misstatements",
      "total_overstatement_corrected",
      "common_error_areas"
    ]
  }
] as const;
