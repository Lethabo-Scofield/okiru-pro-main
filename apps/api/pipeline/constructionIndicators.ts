/**
 * Construction Sector — Indicator Matrices
 *
 * Source documents:
 *   - CONSTRUCTION_QUALIFYING_SMALL_ENTERPRISE_(QSE)_SCORECARD (.docx)
 *   - Construction_sector_codes (.docx)  — Contractor and BEP scorecards
 *
 * These matrices are the source of truth for indicator-level scoring.
 * The companion engine in `constructionScoring.ts` consumes them.
 *
 * Element totals (verified against source documents):
 *   QSE:        Ownership 30 + MC 20 + Skills 26 + ESD 29 + SED 5  = 110
 *   Contractor: Ownership 31 + MC 22 + Skills 26 + ESD 38 + SED 6  = 123
 *   BEP:        Ownership 31 + MC 22 + Skills 34 + ESD 30 + SED 6  = 123
 *
 * Bonus indicators sit inside their parent element and add to that element's
 * achievable total (subject to the element's max points cap).
 *
 * Where a target is descriptive (e.g. "Annex CSC 100", "Yes"), `target` is a
 * string and the `calculation` is `evidence` — scoring requires manual
 * verification input via `evidenceMet` boolean.
 */

export type ConstructionElement =
  | 'ownership'
  | 'managementControl'
  | 'skillsDevelopment'
  | 'enterpriseSupplierDevelopment'
  | 'socioEconomicDevelopment';

export type IndicatorCategory = 'main' | 'bonus';

/**
 * Calculation kinds used by the Construction scoring engine.
 *
 *  - percentage:           actual_percent / target_percent * weight (capped at weight)
 *  - percentage_of_npat:   amount / (npat * targetPct/100) * weight
 *  - percentage_of_leviable: amount / (leviable * targetPct/100) * weight
 *  - percentage_of_tmps:   amount / (tmps * targetPct/100) * weight
 *  - bonus_threshold:      actual_percent >= target_percent ? weight : 0
 *  - evidence:             evidenceMet ? weight : 0  (no numeric target)
 *  - net_value:            realisation points formula — handled specially
 *  - eap_percentage:       actual_percent / (province/national EAP percent) * weight
 *                          (Skills "African People as % of EAP")
 */
export type IndicatorCalculation =
  | 'percentage'
  | 'percentage_of_npat'
  | 'percentage_of_leviable'
  | 'percentage_of_tmps'
  | 'bonus_threshold'
  | 'evidence'
  | 'net_value'
  | 'eap_percentage';

export interface ConstructionIndicator {
  /** Unique, stable id used by API payloads, e.g. "qse.ownership.voting_rights_black". */
  code: string;
  element: ConstructionElement;
  category: IndicatorCategory;
  /** Short human label. */
  name: string;
  /** Long-form description from the source code. */
  description: string;
  /** Maximum points for this indicator (the "weight"). */
  weight: number;
  /** Numeric target (percent value, e.g. 30 for 30%) or descriptive string. */
  target: number | string;
  /** Unit hint for UI rendering. */
  targetUnit: 'percent' | 'percent_npat' | 'percent_leviable' | 'percent_tmps' | 'percent_above' | 'evidence' | 'calc';
  calculation: IndicatorCalculation;
  /** Key under which the actual value is read from the input payload. */
  inputKey: string;
  /** Free-text description of the verification evidence required. */
  evidenceRequired: string;
}

export interface ConstructionScorecardConfig {
  scorecardType: 'QSE' | 'Contractor' | 'BEP';
  totalMaxPoints: number;
  elementMaxPoints: Record<ConstructionElement, number>;
  indicators: ConstructionIndicator[];
}

// ---------------------------------------------------------------------------
// Construction QSE — Total 110 (30+20+26+29+5)
// ---------------------------------------------------------------------------

const QSE_INDICATORS: ConstructionIndicator[] = [
  // Ownership — 30 pts (5.5+2+5.5+2+7+5+1.5+1.5)
  {
    code: 'qse.ownership.voting_rights_black',
    element: 'ownership', category: 'main',
    name: 'Black Voting Rights',
    description: 'Exercisable Voting Rights in the Entity in the hands of Black People',
    weight: 5.5, target: 30, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'votingRightsBlackPercent',
    evidenceRequired: 'Shareholders register, share certificates, ownership flow diagram',
  },
  {
    code: 'qse.ownership.voting_rights_black_women',
    element: 'ownership', category: 'main',
    name: 'Black Women Voting Rights',
    description: 'Exercisable Voting Rights in the Entity in the hands of Black women',
    weight: 2, target: 10, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'votingRightsBlackWomenPercent',
    evidenceRequired: 'Shareholders register, identity documents',
  },
  {
    code: 'qse.ownership.economic_interest_black',
    element: 'ownership', category: 'main',
    name: 'Black Economic Interest',
    description: 'Economic Interest in the Entity to which Black People are entitled',
    weight: 5.5, target: 30, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'economicInterestBlackPercent',
    evidenceRequired: 'Dividend rights schedule, shareholders agreement',
  },
  {
    code: 'qse.ownership.economic_interest_black_women',
    element: 'ownership', category: 'main',
    name: 'Black Women Economic Interest',
    description: 'Economic Interest in the Entity to which Black women are entitled',
    weight: 2, target: 10, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'economicInterestBlackWomenPercent',
    evidenceRequired: 'Dividend rights schedule, identity documents',
  },
  {
    code: 'qse.ownership.designated_groups',
    element: 'ownership', category: 'main',
    name: 'Black New Entrants / Designated Groups',
    description: 'Economic Interest of Black New Entrants or Black Designated Groups (target: 10% for contractors, 5% for others — per source, target is ambiguous for QSE; engine uses 10% by default)',
    weight: 7, target: 10, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'economicInterestDesignatedPercent',
    evidenceRequired: 'Designation evidence, qualifying classification proof',
  },
  {
    code: 'qse.ownership.net_value',
    element: 'ownership', category: 'main',
    name: 'Realisation Points (Net Value)',
    description: 'Net Value calculated per Annex CSC 100',
    weight: 5, target: 'Annex CSC 100', targetUnit: 'calc', calculation: 'net_value',
    inputKey: 'netValueRealisation',
    evidenceRequired: 'Annex CSC 100 calculation, audited financial statements',
  },
  {
    code: 'qse.ownership.bonus_voting_economic',
    element: 'ownership', category: 'bonus',
    name: 'Bonus: Voting + Economic ≥ 40%',
    description: 'Exercisable Voting Rights and Economic Interest to which Black People are entitled ≥ 40%',
    weight: 1.5, target: 40, targetUnit: 'percent', calculation: 'bonus_threshold',
    inputKey: 'votingAndEconomicBlackPercent',
    evidenceRequired: 'Combined voting + economic interest schedule',
  },
  {
    code: 'qse.ownership.bonus_voting_economic_women',
    element: 'ownership', category: 'bonus',
    name: 'Bonus: Black Women Voting + Economic ≥ 12.5%',
    description: 'Exercisable Voting Rights and Economic Interest to which Black women are entitled ≥ 12.5%',
    weight: 1.5, target: 12.5, targetUnit: 'percent', calculation: 'bonus_threshold',
    inputKey: 'votingAndEconomicBlackWomenPercent',
    evidenceRequired: 'Combined voting + economic interest schedule',
  },

  // Management Control — 20 pts (5+2+6+2+4+1)
  {
    code: 'qse.mc.exec_black',
    element: 'managementControl', category: 'main',
    name: 'Black Executive Management',
    description: 'Black representation at Executive Management',
    weight: 5, target: 50, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'execBlackPercent',
    evidenceRequired: 'Organogram, employment contracts, EE report',
  },
  {
    code: 'qse.mc.exec_black_women',
    element: 'managementControl', category: 'main',
    name: 'Black Female Executive Management',
    description: 'Black female representation at Executive Management',
    weight: 2, target: 20, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'execBlackWomenPercent',
    evidenceRequired: 'Organogram, EE report',
  },
  {
    code: 'qse.mc.senior_middle_black',
    element: 'managementControl', category: 'main',
    name: 'Black Senior & Middle Management',
    description: 'Black representation at Senior and Middle Management',
    weight: 6, target: 20, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'seniorMiddleBlackPercent',
    evidenceRequired: 'Organogram, EE report',
  },
  {
    code: 'qse.mc.senior_middle_black_women',
    element: 'managementControl', category: 'main',
    name: 'Black Female Senior & Middle Management',
    description: 'Black female representation at Senior and Middle Management',
    weight: 2, target: 10, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'seniorMiddleBlackWomenPercent',
    evidenceRequired: 'Organogram, EE report',
  },
  {
    code: 'qse.mc.junior_black',
    element: 'managementControl', category: 'main',
    name: 'Black Junior Management',
    description: 'Black representation at Junior Management',
    weight: 4, target: 40, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'juniorBlackPercent',
    evidenceRequired: 'Organogram, EE report',
  },
  {
    code: 'qse.mc.junior_black_women',
    element: 'managementControl', category: 'main',
    name: 'Black Female Junior Management',
    description: 'Black female representation at Junior Management',
    weight: 1, target: 20, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'juniorBlackWomenPercent',
    evidenceRequired: 'Organogram, EE report',
  },

  // Skills Development — 26 pts (14+7+3+1+1)
  // NOTE: Source extraction for the two SD spend rows is ambiguous (the docx
  // shows weights 14 / 7 with targets 1.5% and 25%). We model both rows as
  // percentage-of-leviable-amount calculations using the targets as written;
  // the second row is annotated TODO so a verifier can confirm.
  {
    code: 'qse.skills.spend_black_overall',
    element: 'skillsDevelopment', category: 'main',
    name: 'SD Expenditure on Black People (Learning Programme Matrix)',
    description: 'Skills Development Expenditure on Learning Programmes specified in the Learning Programme Matrix for Black People as a percentage of Leviable Amount',
    weight: 14, target: 1.5, targetUnit: 'percent_leviable', calculation: 'percentage_of_leviable',
    inputKey: 'skillsSpendBlackOverall',
    evidenceRequired: 'WSP/ATR, training register, invoices',
  },
  {
    code: 'qse.skills.spend_black_secondary',
    element: 'skillsDevelopment', category: 'main',
    // TODO(verify): Source target appears as "25%" in the QSE docx; verify
    // whether this is a percentage of skills spend rather than leviable amount.
    name: 'SD Expenditure on Black People (Learning Programme Matrix) — secondary tier',
    description: 'Secondary SD Expenditure tier per the QSE scorecard. Source extraction shows target 25% — verify against the gazetted scorecard before relying in production.',
    weight: 7, target: 25, targetUnit: 'percent_leviable', calculation: 'percentage_of_leviable',
    inputKey: 'skillsSpendBlackSecondary',
    evidenceRequired: 'WSP/ATR, training register, invoices',
  },
  {
    code: 'qse.skills.spend_black_disabled',
    element: 'skillsDevelopment', category: 'main',
    name: 'SD Expenditure on Black People with Disabilities',
    description: 'Skills Development Expenditure on Learning Programmes specified in the Learning Programme Matrix for Black People with Disabilities as a percentage of total Skills Development Expenditure of the Measured Entity on Black People',
    weight: 3, target: 3, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'skillsSpendBlackDisabledPercent',
    evidenceRequired: 'Disability registration, training records',
  },
  {
    code: 'qse.skills.bonus_absorption',
    element: 'skillsDevelopment', category: 'bonus',
    name: 'Bonus: Absorption',
    description: 'Number of Black People Absorbed by the Measured Entity and industry at the end of the learning programme',
    weight: 1, target: 100, targetUnit: 'percent', calculation: 'bonus_threshold',
    inputKey: 'absorptionPercent',
    evidenceRequired: 'Employment contracts post-learnership',
  },
  {
    code: 'qse.skills.bonus_industry_registration',
    element: 'skillsDevelopment', category: 'bonus',
    name: 'Bonus: Industry Professional Registration',
    description: 'Number of Black Employees that are registered successfully as a candidate or professional with industry professional registration bodies as a percentage of all Employees registered',
    weight: 1, target: 50, targetUnit: 'percent', calculation: 'bonus_threshold',
    inputKey: 'industryRegistrationPercent',
    evidenceRequired: 'Industry body registration certificates',
  },

  // ESD — 29 pts (13+5+4+7)
  {
    code: 'qse.esd.pp_all_empowering',
    element: 'enterpriseSupplierDevelopment', category: 'main',
    name: 'PP from all Empowering Suppliers',
    description: 'B-BBEE Procurement Spend from all Empowering Suppliers based on the B-BBEE Procurement Recognition Levels as a percentage of Total Measured Procurement Spend',
    weight: 13, target: 60, targetUnit: 'percent_tmps', calculation: 'percentage_of_tmps',
    inputKey: 'ppAllEmpoweringSpend',
    evidenceRequired: 'Supplier B-BBEE certificates, procurement spend report',
  },
  {
    code: 'qse.esd.pp_51_black_owned',
    element: 'enterpriseSupplierDevelopment', category: 'main',
    name: 'PP from ≥51% Black Owned',
    description: 'B-BBEE Procurement Spend from Empowering Suppliers that are at least 51% Black Owned as a percentage of Total Measured Procurement Spend',
    weight: 5, target: 17.5, targetUnit: 'percent_tmps', calculation: 'percentage_of_tmps',
    inputKey: 'pp51BlackOwnedSpend',
    evidenceRequired: 'Supplier ownership certificates',
  },
  {
    code: 'qse.esd.pp_35_black_women_owned',
    element: 'enterpriseSupplierDevelopment', category: 'main',
    name: 'PP from ≥35% Black Women Owned',
    description: 'B-BBEE Procurement Spend from Empowering Suppliers that are at least 35% Black Women Owned as a percentage of Total Measured Procurement Spend',
    weight: 4, target: 7.5, targetUnit: 'percent_tmps', calculation: 'percentage_of_tmps',
    inputKey: 'pp35BlackWomenOwnedSpend',
    evidenceRequired: 'Supplier ownership certificates',
  },
  {
    code: 'qse.esd.supplier_development',
    element: 'enterpriseSupplierDevelopment', category: 'main',
    name: 'Supplier Development Contributions',
    description: 'Annual value of all Qualifying Supplier Development Contributions made by the Measured Entity as a percentage of the Target',
    weight: 7, target: 1, targetUnit: 'percent_npat', calculation: 'percentage_of_npat',
    inputKey: 'supplierDevelopmentSpend',
    evidenceRequired: 'SD beneficiary records, contribution proofs',
  },

  // SED — 5 pts (3+2)
  {
    code: 'qse.sed.contributions',
    element: 'socioEconomicDevelopment', category: 'main',
    name: 'SED Contributions',
    description: 'Annual value of all Qualifying Socio-Economic Contributions by the Measured Entity as a percentage of the Target',
    weight: 3, target: 1, targetUnit: 'percent_npat', calculation: 'percentage_of_npat',
    inputKey: 'sedSpend',
    evidenceRequired: 'Beneficiary records, contribution proofs',
  },
  {
    code: 'qse.sed.bonus_limited_services',
    element: 'socioEconomicDevelopment', category: 'bonus',
    name: 'Bonus: SED Spend on Communities with Limited Services',
    description: 'Portion of Qualifying Socio-Economic Contributions above spend on Communities with Limited Services',
    weight: 2, target: 50, targetUnit: 'percent_above', calculation: 'bonus_threshold',
    inputKey: 'sedLimitedServicesPercent',
    evidenceRequired: 'Beneficiary location/classification proofs',
  },
];

// ---------------------------------------------------------------------------
// Construction Contractor — Total 123 (31+22+26+38+6)
// ---------------------------------------------------------------------------

const CONTRACTOR_INDICATORS: ConstructionIndicator[] = [
  // Ownership — 31 pts (4.5+2+4.5+2+3+5+6+1+2+1)
  {
    code: 'contractor.ownership.voting_rights_black',
    element: 'ownership', category: 'main',
    name: 'Black Voting Rights',
    description: 'Exercisable Voting Rights in the Entity in the hands of Black People',
    weight: 4.5, target: 35, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'votingRightsBlackPercent',
    evidenceRequired: 'Shareholders register, share certificates',
  },
  {
    code: 'contractor.ownership.voting_rights_black_women',
    element: 'ownership', category: 'main',
    name: 'Black Women Voting Rights',
    description: 'Exercisable Voting Rights in the Entity in the hands of Black women',
    weight: 2, target: 14, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'votingRightsBlackWomenPercent',
    evidenceRequired: 'Shareholders register, identity documents',
  },
  {
    code: 'contractor.ownership.economic_interest_black',
    element: 'ownership', category: 'main',
    name: 'Black Economic Interest',
    description: 'Economic Interest in the Entity to which Black People are entitled',
    weight: 4.5, target: 35, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'economicInterestBlackPercent',
    evidenceRequired: 'Dividend rights schedule',
  },
  {
    code: 'contractor.ownership.economic_interest_black_women',
    element: 'ownership', category: 'main',
    name: 'Black Women Economic Interest',
    description: 'Economic Interest in the Entity to which Black women are entitled',
    weight: 2, target: 14, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'economicInterestBlackWomenPercent',
    evidenceRequired: 'Dividend rights schedule',
  },
  {
    code: 'contractor.ownership.designated_groups',
    element: 'ownership', category: 'main',
    name: 'Economic Interest of Black Designated Groups',
    description: 'Economic Interest of Black natural people in the Measured Entity (Designated Groups, ESOPs, Broad-Based Schemes, Cooperatives)',
    weight: 3, target: 12, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'economicInterestDesignatedPercent',
    evidenceRequired: 'Designation evidence',
  },
  {
    code: 'contractor.ownership.new_entrants',
    element: 'ownership', category: 'main',
    name: 'Black New Entrants',
    description: 'Economic Interest of Black New Entrants',
    weight: 5, target: 5, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'newEntrantsPercent',
    evidenceRequired: 'New Entrant qualifying classification proof',
  },
  {
    code: 'contractor.ownership.net_value',
    element: 'ownership', category: 'main',
    name: 'Realisation Points (Net Value)',
    description: 'Net Value calculated per Codes formula',
    weight: 6, target: 'Calc', targetUnit: 'calc', calculation: 'net_value',
    inputKey: 'netValueRealisation',
    evidenceRequired: 'Annex calculation, audited financial statements',
  },
  {
    code: 'contractor.ownership.bonus_voting_above_50',
    element: 'ownership', category: 'bonus',
    name: 'Bonus: Black Voting Rights > 50%',
    description: 'Exercisable Voting Rights in the Entity in the hands of Black People above 50%',
    weight: 1, target: 50, targetUnit: 'percent', calculation: 'bonus_threshold',
    inputKey: 'votingRightsBlackPercent',
    evidenceRequired: 'Shareholders register',
  },
  {
    code: 'contractor.ownership.bonus_voting_above_75',
    element: 'ownership', category: 'bonus',
    name: 'Bonus: Black Voting Rights > 75%',
    description: 'Exercisable Voting Rights in the Entity in the hands of Black People above 75%',
    weight: 2, target: 75, targetUnit: 'percent', calculation: 'bonus_threshold',
    inputKey: 'votingRightsBlackPercent',
    evidenceRequired: 'Shareholders register',
  },
  {
    code: 'contractor.ownership.bonus_voting_women_above_50',
    element: 'ownership', category: 'bonus',
    name: 'Bonus: Black Women Voting Rights > 50%',
    description: 'Exercisable Voting Rights in the Entity in the hands of Black Women above 50%',
    weight: 1, target: 50, targetUnit: 'percent', calculation: 'bonus_threshold',
    inputKey: 'votingRightsBlackWomenPercent',
    evidenceRequired: 'Shareholders register',
  },

  // Management Control — 22 pts (3+1+2+1+1+1+2+1+2+0.5+1+0.5+1+0.5+0.5+2+2)
  {
    code: 'contractor.mc.board_black',
    element: 'managementControl', category: 'main',
    name: 'Black Board Members',
    description: 'Exercisable Voting Rights of black board members as a percentage of all board members',
    weight: 3, target: 50, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'boardBlackPercent',
    evidenceRequired: 'Board register, attendance records',
  },
  {
    code: 'contractor.mc.board_black_women',
    element: 'managementControl', category: 'main',
    name: 'Black Female Board Members',
    description: 'Exercisable Voting Rights of black female board members as a percentage of all board members',
    weight: 1, target: 20, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'boardBlackWomenPercent',
    evidenceRequired: 'Board register',
  },
  {
    code: 'contractor.mc.exec_dir_black',
    element: 'managementControl', category: 'main',
    name: 'Black Executive Directors',
    description: 'Black Executive Directors as a percentage of all Executive Directors',
    weight: 2, target: 50, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'execDirBlackPercent',
    evidenceRequired: 'Director register',
  },
  {
    code: 'contractor.mc.exec_dir_black_women',
    element: 'managementControl', category: 'main',
    name: 'Black Female Executive Directors',
    description: 'Black female Executive Directors as a percentage of all Executive Directors',
    weight: 1, target: 20, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'execDirBlackWomenPercent',
    evidenceRequired: 'Director register',
  },
  {
    code: 'contractor.mc.bonus_exec_dir_above',
    element: 'managementControl', category: 'bonus',
    name: 'Bonus: Exceeding Black Exec Dir Target',
    description: 'Black Executive Directors above 50%',
    weight: 1, target: 50, targetUnit: 'percent', calculation: 'bonus_threshold',
    inputKey: 'execDirBlackPercent',
    evidenceRequired: 'Director register',
  },
  {
    code: 'contractor.mc.bonus_exec_dir_women_above',
    element: 'managementControl', category: 'bonus',
    name: 'Bonus: Exceeding Black Female Exec Dir Target',
    description: 'Black female Executive Directors above 20%',
    weight: 1, target: 20, targetUnit: 'percent', calculation: 'bonus_threshold',
    inputKey: 'execDirBlackWomenPercent',
    evidenceRequired: 'Director register',
  },
  {
    code: 'contractor.mc.other_exec_black',
    element: 'managementControl', category: 'main',
    name: 'Black Other Executive Management',
    description: 'Black Other Executive Management as a percentage of all Other Executive Management',
    weight: 2, target: 60, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'otherExecBlackPercent',
    evidenceRequired: 'Organogram, EE report',
  },
  {
    code: 'contractor.mc.other_exec_black_women',
    element: 'managementControl', category: 'main',
    name: 'Black Female Other Executive Management',
    description: 'Black female Other Executive Management as a percentage of all Other Executive Management',
    weight: 1, target: 30, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'otherExecBlackWomenPercent',
    evidenceRequired: 'Organogram, EE report',
  },
  {
    code: 'contractor.mc.senior_black',
    element: 'managementControl', category: 'main',
    name: 'Black Senior Management',
    description: 'Black Employees in Senior Management as a percentage of all Senior Management',
    weight: 2, target: 60, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'seniorBlackPercent',
    evidenceRequired: 'Organogram, EE report',
  },
  {
    code: 'contractor.mc.senior_black_women',
    element: 'managementControl', category: 'main',
    name: 'Black Female Senior Management',
    description: 'Black female Employees in Senior Management as a percentage of all Senior Management',
    weight: 0.5, target: 30, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'seniorBlackWomenPercent',
    evidenceRequired: 'Organogram, EE report',
  },
  {
    code: 'contractor.mc.middle_black',
    element: 'managementControl', category: 'main',
    name: 'Black Middle Management',
    description: 'Black Employees in Middle Management as a percentage of all Middle Management',
    weight: 1, target: 75, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'middleBlackPercent',
    evidenceRequired: 'Organogram, EE report',
  },
  {
    code: 'contractor.mc.middle_black_women',
    element: 'managementControl', category: 'main',
    name: 'Black Female Middle Management',
    description: 'Black female Employees in Middle Management as a percentage of all Middle Management',
    weight: 0.5, target: 30, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'middleBlackWomenPercent',
    evidenceRequired: 'Organogram, EE report',
  },
  {
    code: 'contractor.mc.junior_black',
    element: 'managementControl', category: 'main',
    name: 'Black Junior Management',
    description: 'Black Employees in Junior Management as a percentage of all Junior Management',
    weight: 1, target: 88, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'juniorBlackPercent',
    evidenceRequired: 'Organogram, EE report',
  },
  {
    code: 'contractor.mc.junior_black_women',
    element: 'managementControl', category: 'main',
    name: 'Black Female Junior Management',
    description: 'Black female Employees in Junior Management as a percentage of all Junior Management',
    weight: 0.5, target: 35, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'juniorBlackWomenPercent',
    evidenceRequired: 'Organogram, EE report',
  },
  {
    code: 'contractor.mc.disabled',
    element: 'managementControl', category: 'main',
    name: 'Black Employees with Disabilities',
    description: 'Black Employees with Disabilities as a percentage of all office based Employees',
    weight: 0.5, target: 2, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'disabledBlackPercent',
    evidenceRequired: 'Disability registration',
  },
  {
    code: 'contractor.mc.black_professionals',
    element: 'managementControl', category: 'main',
    name: 'Black Professionally Registered Employees',
    description: 'Black professionally registered Employees as a percentage of all professionally registered Employees',
    weight: 2, target: 50, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'blackProfessionalsPercent',
    evidenceRequired: 'Professional body registration certificates',
  },
  {
    code: 'contractor.mc.bonus_youth',
    element: 'managementControl', category: 'bonus',
    name: 'Bonus: Black Youth Employees',
    description: 'Black Employees that are "youth" as defined by the National Youth Commission Act of 1996, as a percentage of all Employees using the Adjusted Recognition for Gender',
    weight: 2, target: 30, targetUnit: 'percent', calculation: 'bonus_threshold',
    inputKey: 'blackYouthPercent',
    evidenceRequired: 'EE report with age breakdown',
  },

  // Skills Development — 26 pts (4+2+2+1+2+3+3+1+3+1+2+2)
  {
    code: 'contractor.skills.spend_black_overall',
    element: 'skillsDevelopment', category: 'main',
    name: 'SD Expenditure on Black People',
    description: 'Skills Development Expenditure on Black People as a percentage of the Leviable Amount',
    weight: 4, target: 3, targetUnit: 'percent_leviable', calculation: 'percentage_of_leviable',
    inputKey: 'skillsSpendBlackOverall',
    evidenceRequired: 'WSP/ATR, training register, invoices',
  },
  {
    code: 'contractor.skills.african_eap',
    element: 'skillsDevelopment', category: 'main',
    name: 'African People (per Stats SA EAP)',
    description: 'Proportion of SD Expenditure on Black People expended on African People (as defined in the Stats SA EAP)',
    weight: 2, target: 'Contribution of African People to EAP', targetUnit: 'percent', calculation: 'eap_percentage',
    inputKey: 'skillsAfricanEapPercent',
    evidenceRequired: 'Training register with race breakdown',
  },
  {
    code: 'contractor.skills.black_management_exec',
    element: 'skillsDevelopment', category: 'main',
    name: 'Black Management (Exec, Senior, Middle)',
    description: 'Proportion of SD Expenditure on Black Management (Executive, Senior and Middle management categories)',
    weight: 2, target: 15, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'skillsBlackMgmtExecSeniorMiddlePercent',
    evidenceRequired: 'Training register with role breakdown',
  },
  {
    code: 'contractor.skills.black_management_junior',
    element: 'skillsDevelopment', category: 'main',
    name: 'Black Management (Junior)',
    description: 'Proportion of SD Expenditure on Black Management (Junior management category)',
    weight: 1, target: 10, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'skillsBlackMgmtJuniorPercent',
    evidenceRequired: 'Training register',
  },
  {
    code: 'contractor.skills.bursaries',
    element: 'skillsDevelopment', category: 'main',
    name: 'Bursaries / Scholarships for Black People',
    description: 'Proportion of SD Expenditure on Bursaries or Scholarships for Black People',
    weight: 2, target: 15, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'skillsBursariesPercent',
    evidenceRequired: 'Bursary agreements, payment proofs',
  },
  {
    code: 'contractor.skills.cat_abcd_programmes',
    element: 'skillsDevelopment', category: 'main',
    name: 'Cat A/B/C/D Learning Programmes',
    description: 'Number of Black People participating in Category A, B, C or D learning programmes per the Learning Programme Matrix, as a percentage of the total number of Employees',
    weight: 3, target: 2.5, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'skillsCatABCDPercent',
    evidenceRequired: 'Learnership agreements, attendance records',
  },
  {
    code: 'contractor.skills.industry_candidates',
    element: 'skillsDevelopment', category: 'main',
    name: 'Black Candidates Registered with Industry Bodies',
    description: 'Number of Black Employees registered as candidates with industry professional registration bodies as a % of the total number of such registered Employees',
    weight: 3, target: 60, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'skillsIndustryCandidatesPercent',
    evidenceRequired: 'Candidacy registration certificates',
  },
  {
    code: 'contractor.skills.disabilities_programmes',
    element: 'skillsDevelopment', category: 'main',
    name: 'Black People with Disabilities on Programmes',
    description: 'Number of Black People with Disabilities on Category A, B, C, or D learning programmes as a percentage of black office based learners on those learning programmes',
    weight: 1, target: 5, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'skillsDisabilitiesProgrammesPercent',
    evidenceRequired: 'Disability registration, training records',
  },
  {
    code: 'contractor.skills.mentorship',
    element: 'skillsDevelopment', category: 'main',
    name: 'Mentorship Programme',
    description: 'Implementation of an Approved and Verified Mentorship Programme (per Annexe CSC300 C)',
    weight: 3, target: 'Yes', targetUnit: 'evidence', calculation: 'evidence',
    inputKey: 'mentorshipProgrammeImplemented',
    evidenceRequired: 'CSC300 C verification certificate',
  },
  {
    code: 'contractor.skills.bonus_absorption',
    element: 'skillsDevelopment', category: 'bonus',
    name: 'Bonus: Absorption',
    description: 'Percentage of Black People Absorbed by the Measured Entity at the end of a Category A, B, C or D learning programme',
    weight: 1, target: 100, targetUnit: 'percent', calculation: 'bonus_threshold',
    inputKey: 'absorptionPercent',
    evidenceRequired: 'Employment contracts post-learnership',
  },
  {
    code: 'contractor.skills.bonus_mentorship_promotion',
    element: 'skillsDevelopment', category: 'bonus',
    name: 'Bonus: Mentorship Programme Promotions',
    description: 'Black employees that completed a Mentorship Programme during the last 3 years (incl. measurement period) that were promoted during the Measurement Period as a percentage of all such employees during those 3 years',
    weight: 2, target: 15, targetUnit: 'percent', calculation: 'bonus_threshold',
    inputKey: 'mentorshipPromotionPercent',
    evidenceRequired: 'Promotion records, mentorship completion records',
  },
  {
    code: 'contractor.skills.bonus_professional_registration',
    element: 'skillsDevelopment', category: 'bonus',
    name: 'Bonus: Black Employees Registered as Professionals',
    description: 'Number of Black Employees who registered as a Professional with industry Professional Bodies as a percentage of all Employees who registered as such in the Measurement Period',
    weight: 2, target: 60, targetUnit: 'percent', calculation: 'bonus_threshold',
    inputKey: 'professionalRegistrationPercent',
    evidenceRequired: 'Professional registration certificates',
  },

  // ESD (Preferential Procurement + Supplier Development) — 38 pts (6+3+3+4+3+3+1+5+8+2)
  {
    code: 'contractor.esd.pp_all_empowering',
    element: 'enterpriseSupplierDevelopment', category: 'main',
    name: 'PP from all Empowering Suppliers',
    description: 'B-BBEE Procurement Spend from all Empowering Suppliers as a percentage of TMPS',
    weight: 6, target: 80, targetUnit: 'percent_tmps', calculation: 'percentage_of_tmps',
    inputKey: 'ppAllEmpoweringSpend',
    evidenceRequired: 'Supplier B-BBEE certificates',
  },
  {
    code: 'contractor.esd.pp_eme',
    element: 'enterpriseSupplierDevelopment', category: 'main',
    name: 'PP from EME Suppliers',
    description: 'B-BBEE Procurement Spend from all Empowering Suppliers that are Exempted Micro-Enterprises as a percentage of TMPS',
    weight: 3, target: 15, targetUnit: 'percent_tmps', calculation: 'percentage_of_tmps',
    inputKey: 'ppEmeSpend',
    evidenceRequired: 'EME affidavits/certificates',
  },
  {
    code: 'contractor.esd.pp_qse',
    element: 'enterpriseSupplierDevelopment', category: 'main',
    name: 'PP from QSE Suppliers',
    description: 'B-BBEE Procurement Spend from all Empowering Suppliers that are Qualifying Small Enterprises as a percentage of TMPS',
    weight: 3, target: 15, targetUnit: 'percent_tmps', calculation: 'percentage_of_tmps',
    inputKey: 'ppQseSpend',
    evidenceRequired: 'QSE affidavits/certificates',
  },
  {
    code: 'contractor.esd.pp_51_black_owned',
    element: 'enterpriseSupplierDevelopment', category: 'main',
    name: 'PP from ≥51% Black Owned',
    description: 'B-BBEE Procurement Spend from Empowering Suppliers that are at least 51% Black Owned as a percentage of TMPS',
    weight: 4, target: 20, targetUnit: 'percent_tmps', calculation: 'percentage_of_tmps',
    inputKey: 'pp51BlackOwnedSpend',
    evidenceRequired: 'Supplier ownership certificates',
  },
  {
    code: 'contractor.esd.pp_35_black_women_owned',
    element: 'enterpriseSupplierDevelopment', category: 'main',
    name: 'PP from ≥35% Black Women Owned',
    description: 'B-BBEE Procurement Spend from Empowering Suppliers that are at least 35% Black Women Owned as a percentage of TMPS',
    weight: 3, target: 12, targetUnit: 'percent_tmps', calculation: 'percentage_of_tmps',
    inputKey: 'pp35BlackWomenOwnedSpend',
    evidenceRequired: 'Supplier ownership certificates',
  },
  {
    code: 'contractor.esd.bonus_designated_groups_51',
    element: 'enterpriseSupplierDevelopment', category: 'bonus',
    name: 'Bonus: PP from ≥51% Black Designated Groups',
    description: 'B-BBEE Procurement Spend from Empowering Suppliers that are at least 51% owned by Black Designated Groups as a percentage of TMPS',
    weight: 3, target: 20, targetUnit: 'percent_tmps', calculation: 'percentage_of_tmps',
    inputKey: 'ppDesignated51Spend',
    evidenceRequired: 'Designation evidence',
  },
  {
    code: 'contractor.esd.bonus_black_women_51',
    element: 'enterpriseSupplierDevelopment', category: 'bonus',
    name: 'Bonus: PP from ≥51% Black Women Owned',
    description: 'B-BBEE Procurement Spend from Empowering Suppliers that are at least 51% Black Women Owned as a percentage of TMPS',
    weight: 1, target: 8, targetUnit: 'percent_tmps', calculation: 'percentage_of_tmps',
    inputKey: 'ppBlackWomen51Spend',
    evidenceRequired: 'Supplier ownership certificates',
  },
  {
    code: 'contractor.esd.supplier_contractor_dev_programmes',
    element: 'enterpriseSupplierDevelopment', category: 'main',
    name: 'Supplier & Contractor Development Programmes',
    description: 'Compliant Supplier and Contractor Development Programmes (per Annex CSC 400)',
    weight: 5, target: 'Annex CSC 400', targetUnit: 'evidence', calculation: 'evidence',
    inputKey: 'supplierContractorDevProgrammeImplemented',
    evidenceRequired: 'CSC 400 verification',
  },
  {
    code: 'contractor.esd.supplier_dev_contributions',
    element: 'enterpriseSupplierDevelopment', category: 'main',
    name: 'Supplier Development Contributions',
    description: 'Annual value of all Qualifying Supplier Development Contributions made by the Measured Entity as a percentage of the Target',
    weight: 8, target: 3, targetUnit: 'percent_npat', calculation: 'percentage_of_npat',
    inputKey: 'supplierDevelopmentSpend',
    evidenceRequired: 'SD beneficiary records, contribution proofs',
  },
  {
    code: 'contractor.esd.supplier_dev_contributions_bwo',
    element: 'enterpriseSupplierDevelopment', category: 'main',
    name: 'SD Contributions to ≥51% Black Women Owned',
    description: 'Annual value of all Qualifying Supplier Development Contributions towards 51% Black Women Owned entities as a percentage of the Target (20% of 3% NPAT)',
    weight: 2, target: 0.6, targetUnit: 'percent_npat', calculation: 'percentage_of_npat',
    inputKey: 'supplierDevelopmentSpendBWO',
    evidenceRequired: 'SD beneficiary ownership certificates',
  },

  // SED — 6 pts (4+1+1)
  {
    code: 'contractor.sed.contributions',
    element: 'socioEconomicDevelopment', category: 'main',
    name: 'SED Contributions',
    description: 'Annual value of all Qualifying Socio-Economic contributions by the Measured Entity as a percentage of the Target',
    weight: 4, target: 1.25, targetUnit: 'percent_npat', calculation: 'percentage_of_npat',
    inputKey: 'sedSpend',
    evidenceRequired: 'Beneficiary records, contribution proofs',
  },
  {
    code: 'contractor.sed.limited_services',
    element: 'socioEconomicDevelopment', category: 'main',
    name: 'SED Spend on Communities with Limited Services',
    description: 'Portion of Qualifying Socio-Economic Contributions above spend on Communities with Limited Services',
    weight: 1, target: 30, targetUnit: 'percent_above', calculation: 'bonus_threshold',
    inputKey: 'sedLimitedServicesPercent',
    evidenceRequired: 'Beneficiary location/classification proofs',
  },
  {
    code: 'contractor.sed.bonus_structured_projects',
    element: 'socioEconomicDevelopment', category: 'bonus',
    name: 'Bonus: Structured SED Projects',
    description: 'Annual value of contributions towards Structured SED Projects as a percentage of the Target',
    weight: 1, target: 1.25, targetUnit: 'percent_npat', calculation: 'percentage_of_npat',
    inputKey: 'sedStructuredProjectsSpend',
    evidenceRequired: 'Structured project documentation',
  },
];

// ---------------------------------------------------------------------------
// Construction BEP (Built Environment Professional) — Total 123 (31+22+34+30+6)
// ---------------------------------------------------------------------------

const BEP_INDICATORS: ConstructionIndicator[] = [
  // Ownership — 31 pts (5.5+2+5.5+2+3+5+4+1+2+1)
  // BEP ownership notes: targets marked "*" require >50% of total ownership to be
  // held by individuals who are both professionally registered AND members of
  // Executive Management. Where this is not met, only 50% of black ownership of
  // non-qualifying owners may be counted (per Construction Sector Codes notes).
  {
    code: 'bep.ownership.voting_rights_black',
    element: 'ownership', category: 'main',
    name: 'Black Voting Rights',
    description: 'Exercisable Voting Rights in the Entity in the hands of Black People (subject to BEP professional-registration condition)',
    weight: 5.5, target: 35, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'votingRightsBlackPercent',
    evidenceRequired: 'Shareholders register; professional registration certificates of qualifying owners',
  },
  {
    code: 'bep.ownership.voting_rights_black_women',
    element: 'ownership', category: 'main',
    name: 'Black Women Voting Rights',
    description: 'Exercisable Voting Rights in the Entity in the hands of Black women (subject to BEP professional-registration condition)',
    weight: 2, target: 14, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'votingRightsBlackWomenPercent',
    evidenceRequired: 'Shareholders register; professional registration certificates',
  },
  {
    code: 'bep.ownership.economic_interest_black',
    element: 'ownership', category: 'main',
    name: 'Black Economic Interest',
    description: 'Economic Interest in the Entity to which Black People are entitled (subject to BEP professional-registration condition)',
    weight: 5.5, target: 35, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'economicInterestBlackPercent',
    evidenceRequired: 'Dividend rights schedule; professional registration certificates',
  },
  {
    code: 'bep.ownership.economic_interest_black_women',
    element: 'ownership', category: 'main',
    name: 'Black Women Economic Interest',
    description: 'Economic Interest in the Entity to which Black women are entitled (subject to BEP professional-registration condition)',
    weight: 2, target: 14, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'economicInterestBlackWomenPercent',
    evidenceRequired: 'Dividend rights schedule; professional registration certificates',
  },
  {
    code: 'bep.ownership.designated_groups',
    element: 'ownership', category: 'main',
    name: 'Economic Interest of Black Designated Groups',
    description: 'Economic Interest of Black natural people in the Measured Entity (Designated Groups, ESOPs, Broad-Based Schemes, Cooperatives)',
    weight: 3, target: 6, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'economicInterestDesignatedPercent',
    evidenceRequired: 'Designation evidence',
  },
  {
    code: 'bep.ownership.new_entrants',
    element: 'ownership', category: 'main',
    name: 'Black New Entrants',
    description: 'Economic Interest of Black New Entrants',
    weight: 5, target: 6, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'newEntrantsPercent',
    evidenceRequired: 'New Entrant qualifying classification proof',
  },
  {
    code: 'bep.ownership.net_value',
    element: 'ownership', category: 'main',
    name: 'Realisation Points (Net Value)',
    description: 'Net Value calculated per Codes formula',
    weight: 4, target: 'Calc', targetUnit: 'calc', calculation: 'net_value',
    inputKey: 'netValueRealisation',
    evidenceRequired: 'Annex calculation, audited financial statements',
  },
  {
    code: 'bep.ownership.bonus_voting_above_50',
    element: 'ownership', category: 'bonus',
    name: 'Bonus: Black Voting Rights > 50%',
    description: 'Exercisable Voting Rights in the Entity in the hands of Black People above 50%',
    weight: 1, target: 50, targetUnit: 'percent', calculation: 'bonus_threshold',
    inputKey: 'votingRightsBlackPercent',
    evidenceRequired: 'Shareholders register',
  },
  {
    code: 'bep.ownership.bonus_voting_above_75',
    element: 'ownership', category: 'bonus',
    name: 'Bonus: Black Voting Rights > 75%',
    description: 'Exercisable Voting Rights in the Entity in the hands of Black People above 75%',
    weight: 2, target: 75, targetUnit: 'percent', calculation: 'bonus_threshold',
    inputKey: 'votingRightsBlackPercent',
    evidenceRequired: 'Shareholders register',
  },
  {
    code: 'bep.ownership.bonus_voting_women_above_50',
    element: 'ownership', category: 'bonus',
    name: 'Bonus: Black Women Voting Rights > 50%',
    description: 'Exercisable Voting Rights in the Entity in the hands of Black Women above 50%',
    weight: 1, target: 50, targetUnit: 'percent', calculation: 'bonus_threshold',
    inputKey: 'votingRightsBlackWomenPercent',
    evidenceRequired: 'Shareholders register',
  },

  // Management Control — 22 pts (2.5+1+2.5+1+1+1+2+1+2+1+1.5+1+0.5+2+2)
  // Note: BEP scorecard has NO Junior Management row.
  {
    code: 'bep.mc.board_black',
    element: 'managementControl', category: 'main',
    name: 'Black Board Members',
    description: 'Exercisable Voting Rights of black board members as a percentage of all board members',
    weight: 2.5, target: 50, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'boardBlackPercent',
    evidenceRequired: 'Board register, attendance records',
  },
  {
    code: 'bep.mc.board_black_women',
    element: 'managementControl', category: 'main',
    name: 'Black Female Board Members',
    description: 'Exercisable Voting Rights of black female board members as a percentage of all board members',
    weight: 1, target: 20, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'boardBlackWomenPercent',
    evidenceRequired: 'Board register',
  },
  {
    code: 'bep.mc.exec_dir_black',
    element: 'managementControl', category: 'main',
    name: 'Black Executive Directors',
    description: 'Black Executive Directors as a percentage of all Executive Directors',
    weight: 2.5, target: 50, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'execDirBlackPercent',
    evidenceRequired: 'Director register',
  },
  {
    code: 'bep.mc.exec_dir_black_women',
    element: 'managementControl', category: 'main',
    name: 'Black Female Executive Directors',
    description: 'Black female Executive Directors as a percentage of all Executive Directors',
    weight: 1, target: 20, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'execDirBlackWomenPercent',
    evidenceRequired: 'Director register',
  },
  {
    code: 'bep.mc.bonus_exec_dir_above',
    element: 'managementControl', category: 'bonus',
    name: 'Bonus: Exceeding Black Exec Dir Target',
    description: 'Black Executive Directors above 50%',
    weight: 1, target: 50, targetUnit: 'percent', calculation: 'bonus_threshold',
    inputKey: 'execDirBlackPercent',
    evidenceRequired: 'Director register',
  },
  {
    code: 'bep.mc.bonus_exec_dir_women_above',
    element: 'managementControl', category: 'bonus',
    name: 'Bonus: Exceeding Black Female Exec Dir Target',
    description: 'Black female Executive Directors above 20%',
    weight: 1, target: 20, targetUnit: 'percent', calculation: 'bonus_threshold',
    inputKey: 'execDirBlackWomenPercent',
    evidenceRequired: 'Director register',
  },
  {
    code: 'bep.mc.other_exec_black',
    element: 'managementControl', category: 'main',
    name: 'Black Other Executive Management',
    description: 'Black Other Executive Management as a percentage of all Other Executive Management',
    weight: 2, target: 60, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'otherExecBlackPercent',
    evidenceRequired: 'Organogram, EE report',
  },
  {
    code: 'bep.mc.other_exec_black_women',
    element: 'managementControl', category: 'main',
    name: 'Black Female Other Executive Management',
    description: 'Black female Other Executive Management as a percentage of all Other Executive Management',
    weight: 1, target: 30, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'otherExecBlackWomenPercent',
    evidenceRequired: 'Organogram, EE report',
  },
  {
    code: 'bep.mc.senior_black',
    element: 'managementControl', category: 'main',
    name: 'Black Senior Management',
    description: 'Black Employees in Senior Management as a percentage of all Senior Management',
    weight: 2, target: 60, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'seniorBlackPercent',
    evidenceRequired: 'Organogram, EE report',
  },
  {
    code: 'bep.mc.senior_black_women',
    element: 'managementControl', category: 'main',
    name: 'Black Female Senior Management',
    description: 'Black female Employees in Senior Management as a percentage of all Senior Management',
    weight: 1, target: 30, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'seniorBlackWomenPercent',
    evidenceRequired: 'Organogram, EE report',
  },
  {
    code: 'bep.mc.middle_black',
    element: 'managementControl', category: 'main',
    name: 'Black Middle Management',
    description: 'Black Employees in Middle Management as a percentage of all Middle Management',
    weight: 1.5, target: 75, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'middleBlackPercent',
    evidenceRequired: 'Organogram, EE report',
  },
  {
    code: 'bep.mc.middle_black_women',
    element: 'managementControl', category: 'main',
    name: 'Black Female Middle Management',
    description: 'Black female Employees in Middle Management as a percentage of all Middle Management',
    weight: 1, target: 30, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'middleBlackWomenPercent',
    evidenceRequired: 'Organogram, EE report',
  },
  {
    code: 'bep.mc.disabled',
    element: 'managementControl', category: 'main',
    name: 'Black Employees with Disabilities',
    description: 'Black Employees with Disabilities as a percentage of all office based Employees',
    weight: 0.5, target: 2, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'disabledBlackPercent',
    evidenceRequired: 'Disability registration',
  },
  {
    code: 'bep.mc.black_professionals',
    element: 'managementControl', category: 'main',
    name: 'Black Professionally Registered Employees',
    description: 'Black professionally registered Employees as a percentage of all professionally registered Employees',
    weight: 2, target: 50, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'blackProfessionalsPercent',
    evidenceRequired: 'Professional body registration certificates',
  },
  {
    code: 'bep.mc.bonus_youth',
    element: 'managementControl', category: 'bonus',
    name: 'Bonus: Black Youth Employees',
    description: 'Black Employees that are "youth" as defined by the National Youth Commission Act of 1996, as a percentage of all Employees using the Adjusted Recognition for Gender',
    weight: 2, target: 30, targetUnit: 'percent', calculation: 'bonus_threshold',
    inputKey: 'blackYouthPercent',
    evidenceRequired: 'EE report with age breakdown',
  },

  // Skills Development — 34 pts (7+2+3+1+4+4+4+1+3+1+4)
  {
    code: 'bep.skills.spend_black_overall',
    element: 'skillsDevelopment', category: 'main',
    name: 'SD Expenditure on Black People',
    description: 'Skills Development Expenditure on Black People as a percentage of the Leviable Amount',
    weight: 7, target: 3, targetUnit: 'percent_leviable', calculation: 'percentage_of_leviable',
    inputKey: 'skillsSpendBlackOverall',
    evidenceRequired: 'WSP/ATR, training register, invoices',
  },
  {
    code: 'bep.skills.african_eap',
    element: 'skillsDevelopment', category: 'main',
    name: 'African People (per Stats SA EAP)',
    description: 'Proportion of SD Expenditure on Black People expended on African People (as defined in the Stats SA EAP)',
    weight: 2, target: 'Contribution of African People to EAP', targetUnit: 'percent', calculation: 'eap_percentage',
    inputKey: 'skillsAfricanEapPercent',
    evidenceRequired: 'Training register with race breakdown',
  },
  {
    code: 'bep.skills.black_management_exec',
    element: 'skillsDevelopment', category: 'main',
    name: 'Black Management (Exec, Senior, Middle)',
    description: 'Proportion of SD Expenditure on Black Management (Executive, Senior and Middle management categories)',
    weight: 3, target: 15, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'skillsBlackMgmtExecSeniorMiddlePercent',
    evidenceRequired: 'Training register with role breakdown',
  },
  {
    code: 'bep.skills.black_management_junior',
    element: 'skillsDevelopment', category: 'main',
    name: 'Black Management (Junior)',
    description: 'Proportion of SD Expenditure on Black Management (Junior management category)',
    weight: 1, target: 10, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'skillsBlackMgmtJuniorPercent',
    evidenceRequired: 'Training register',
  },
  {
    code: 'bep.skills.bursaries',
    element: 'skillsDevelopment', category: 'main',
    name: 'Bursaries / Scholarships for Black People',
    description: 'Proportion of SD Expenditure on Bursaries or Scholarships for Black People',
    weight: 4, target: 15, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'skillsBursariesPercent',
    evidenceRequired: 'Bursary agreements, payment proofs',
  },
  {
    code: 'bep.skills.cat_abcd_programmes',
    element: 'skillsDevelopment', category: 'main',
    name: 'Cat A/B/C/D Learning Programmes',
    description: 'Number of Black People participating in Category A, B, C or D learning programmes per the Learning Programme Matrix, as a percentage of the total number of Employees',
    weight: 4, target: 2.5, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'skillsCatABCDPercent',
    evidenceRequired: 'Learnership agreements, attendance records',
  },
  {
    code: 'bep.skills.industry_candidates',
    element: 'skillsDevelopment', category: 'main',
    name: 'Black Candidates Registered with Industry Bodies',
    description: 'Number of Black Employees registered as candidates with industry professional registration bodies as a % of the total number of such registered Employees',
    weight: 4, target: 60, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'skillsIndustryCandidatesPercent',
    evidenceRequired: 'Candidacy registration certificates',
  },
  {
    code: 'bep.skills.disabilities_programmes',
    element: 'skillsDevelopment', category: 'main',
    name: 'Black People with Disabilities on Programmes',
    description: 'Number of Black People with Disabilities on Category A, B, C, or D learning programmes as a percentage of black office based learners on those learning programmes',
    weight: 1, target: 5, targetUnit: 'percent', calculation: 'percentage',
    inputKey: 'skillsDisabilitiesProgrammesPercent',
    evidenceRequired: 'Disability registration, training records',
  },
  {
    code: 'bep.skills.mentorship',
    element: 'skillsDevelopment', category: 'main',
    name: 'Mentorship Programme',
    description: 'Implementation of an Approved and Verified Mentorship Programme (per Annexe CSC300 C)',
    weight: 3, target: 'Yes', targetUnit: 'evidence', calculation: 'evidence',
    inputKey: 'mentorshipProgrammeImplemented',
    evidenceRequired: 'CSC300 C verification certificate',
  },
  {
    code: 'bep.skills.bonus_absorption',
    element: 'skillsDevelopment', category: 'bonus',
    name: 'Bonus: Absorption',
    description: 'Percentage of Black People Absorbed by the Measured Entity at the end of a Category A, B, C or D learning programme',
    weight: 1, target: 100, targetUnit: 'percent', calculation: 'bonus_threshold',
    inputKey: 'absorptionPercent',
    evidenceRequired: 'Employment contracts post-learnership',
  },
  {
    code: 'bep.skills.bonus_professional_registration',
    element: 'skillsDevelopment', category: 'bonus',
    name: 'Bonus: Black Employees Registered as Professionals',
    description: 'Number of Black Employees who registered as a Professional with industry Professional Bodies as a percentage of all Employees who registered as such in the Measurement Period',
    weight: 4, target: 60, targetUnit: 'percent', calculation: 'bonus_threshold',
    inputKey: 'professionalRegistrationPercent',
    evidenceRequired: 'Professional registration certificates',
  },

  // ESD — 30 pts (6+3+2+4+3+2+1+4+4+1)
  {
    code: 'bep.esd.pp_all_empowering',
    element: 'enterpriseSupplierDevelopment', category: 'main',
    name: 'PP from all Empowering Suppliers',
    description: 'B-BBEE Procurement Spend from all Empowering Suppliers as a percentage of TMPS',
    weight: 6, target: 80, targetUnit: 'percent_tmps', calculation: 'percentage_of_tmps',
    inputKey: 'ppAllEmpoweringSpend',
    evidenceRequired: 'Supplier B-BBEE certificates',
  },
  {
    code: 'bep.esd.pp_eme',
    element: 'enterpriseSupplierDevelopment', category: 'main',
    name: 'PP from EME Suppliers',
    description: 'B-BBEE Procurement Spend from EME Suppliers as a percentage of TMPS',
    weight: 3, target: 15, targetUnit: 'percent_tmps', calculation: 'percentage_of_tmps',
    inputKey: 'ppEmeSpend',
    evidenceRequired: 'EME affidavits/certificates',
  },
  {
    code: 'bep.esd.pp_qse',
    element: 'enterpriseSupplierDevelopment', category: 'main',
    name: 'PP from QSE Suppliers',
    description: 'B-BBEE Procurement Spend from QSE Suppliers as a percentage of TMPS',
    weight: 2, target: 15, targetUnit: 'percent_tmps', calculation: 'percentage_of_tmps',
    inputKey: 'ppQseSpend',
    evidenceRequired: 'QSE affidavits/certificates',
  },
  {
    code: 'bep.esd.pp_51_black_owned',
    element: 'enterpriseSupplierDevelopment', category: 'main',
    name: 'PP from ≥51% Black Owned',
    description: 'B-BBEE Procurement Spend from Empowering Suppliers that are at least 51% Black Owned as a percentage of TMPS',
    weight: 4, target: 20, targetUnit: 'percent_tmps', calculation: 'percentage_of_tmps',
    inputKey: 'pp51BlackOwnedSpend',
    evidenceRequired: 'Supplier ownership certificates',
  },
  {
    code: 'bep.esd.pp_35_black_women_owned',
    element: 'enterpriseSupplierDevelopment', category: 'main',
    name: 'PP from ≥35% Black Women Owned',
    description: 'B-BBEE Procurement Spend from Empowering Suppliers that are at least 35% Black Women Owned as a percentage of TMPS',
    weight: 3, target: 12, targetUnit: 'percent_tmps', calculation: 'percentage_of_tmps',
    inputKey: 'pp35BlackWomenOwnedSpend',
    evidenceRequired: 'Supplier ownership certificates',
  },
  {
    code: 'bep.esd.bonus_designated_groups_51',
    element: 'enterpriseSupplierDevelopment', category: 'bonus',
    name: 'Bonus: PP from ≥51% Black Designated Groups',
    description: 'B-BBEE Procurement Spend from Empowering Suppliers that are at least 51% owned by Black Designated Groups as a percentage of TMPS',
    weight: 2, target: 20, targetUnit: 'percent_tmps', calculation: 'percentage_of_tmps',
    inputKey: 'ppDesignated51Spend',
    evidenceRequired: 'Designation evidence',
  },
  {
    code: 'bep.esd.bonus_black_women_51',
    element: 'enterpriseSupplierDevelopment', category: 'bonus',
    name: 'Bonus: PP from ≥51% Black Women Owned',
    description: 'B-BBEE Procurement Spend from Empowering Suppliers that are at least 51% Black Women Owned as a percentage of TMPS',
    weight: 1, target: 8, targetUnit: 'percent_tmps', calculation: 'percentage_of_tmps',
    inputKey: 'ppBlackWomen51Spend',
    evidenceRequired: 'Supplier ownership certificates',
  },
  {
    code: 'bep.esd.supplier_contractor_dev_programmes',
    element: 'enterpriseSupplierDevelopment', category: 'main',
    name: 'Supplier & Contractor Development Programmes',
    description: 'Compliant Supplier and Contractor Development Programmes (per Annex CSC 400)',
    weight: 4, target: 'Annex CSC 400', targetUnit: 'evidence', calculation: 'evidence',
    inputKey: 'supplierContractorDevProgrammeImplemented',
    evidenceRequired: 'CSC 400 verification',
  },
  {
    code: 'bep.esd.supplier_dev_contributions',
    element: 'enterpriseSupplierDevelopment', category: 'main',
    name: 'Supplier Development Contributions',
    description: 'Annual value of all Qualifying Supplier Development Contributions made by the Measured Entity as a percentage of the Target',
    weight: 4, target: 3, targetUnit: 'percent_npat', calculation: 'percentage_of_npat',
    inputKey: 'supplierDevelopmentSpend',
    evidenceRequired: 'SD beneficiary records, contribution proofs',
  },
  {
    code: 'bep.esd.supplier_dev_contributions_bwo',
    element: 'enterpriseSupplierDevelopment', category: 'main',
    name: 'SD Contributions to ≥51% Black Women Owned',
    description: 'Annual value of all Qualifying Supplier Development Contributions towards 51% Black Women Owned entities as a percentage of the Target (20% of 3% NPAT)',
    weight: 1, target: 0.6, targetUnit: 'percent_npat', calculation: 'percentage_of_npat',
    inputKey: 'supplierDevelopmentSpendBWO',
    evidenceRequired: 'SD beneficiary ownership certificates',
  },

  // SED — 6 pts (4+1+1) — same structure as Contractor
  {
    code: 'bep.sed.contributions',
    element: 'socioEconomicDevelopment', category: 'main',
    name: 'SED Contributions',
    description: 'Annual value of all Qualifying Socio-Economic contributions by the Measured Entity as a percentage of the Target',
    weight: 4, target: 1.25, targetUnit: 'percent_npat', calculation: 'percentage_of_npat',
    inputKey: 'sedSpend',
    evidenceRequired: 'Beneficiary records, contribution proofs',
  },
  {
    code: 'bep.sed.limited_services',
    element: 'socioEconomicDevelopment', category: 'main',
    name: 'SED Spend on Communities with Limited Services',
    description: 'Portion of Qualifying Socio-Economic Contributions above spend on Communities with Limited Services',
    weight: 1, target: 30, targetUnit: 'percent_above', calculation: 'bonus_threshold',
    inputKey: 'sedLimitedServicesPercent',
    evidenceRequired: 'Beneficiary location/classification proofs',
  },
  {
    code: 'bep.sed.bonus_structured_projects',
    element: 'socioEconomicDevelopment', category: 'bonus',
    name: 'Bonus: Structured SED Projects',
    description: 'Annual value of contributions towards Structured SED Projects as a percentage of the Target',
    weight: 1, target: 1.25, targetUnit: 'percent_npat', calculation: 'percentage_of_npat',
    inputKey: 'sedStructuredProjectsSpend',
    evidenceRequired: 'Structured project documentation',
  },
];

// ---------------------------------------------------------------------------
// Scorecard configs
// ---------------------------------------------------------------------------

export const CONSTRUCTION_QSE_SCORECARD: ConstructionScorecardConfig = {
  scorecardType: 'QSE',
  totalMaxPoints: 110,
  elementMaxPoints: {
    ownership: 30,
    managementControl: 20,
    skillsDevelopment: 26,
    enterpriseSupplierDevelopment: 29,
    socioEconomicDevelopment: 5,
  },
  indicators: QSE_INDICATORS,
};

export const CONSTRUCTION_CONTRACTOR_SCORECARD: ConstructionScorecardConfig = {
  scorecardType: 'Contractor',
  totalMaxPoints: 123,
  elementMaxPoints: {
    ownership: 31,
    managementControl: 22,
    skillsDevelopment: 26,
    enterpriseSupplierDevelopment: 38,
    socioEconomicDevelopment: 6,
  },
  indicators: CONTRACTOR_INDICATORS,
};

export const CONSTRUCTION_BEP_SCORECARD: ConstructionScorecardConfig = {
  scorecardType: 'BEP',
  totalMaxPoints: 123,
  elementMaxPoints: {
    ownership: 31,
    managementControl: 22,
    skillsDevelopment: 34,
    enterpriseSupplierDevelopment: 30,
    socioEconomicDevelopment: 6,
  },
  indicators: BEP_INDICATORS,
};

export const CONSTRUCTION_SCORECARDS: Record<string, ConstructionScorecardConfig> = {
  construction_qse: CONSTRUCTION_QSE_SCORECARD,
  construction_contractor: CONSTRUCTION_CONTRACTOR_SCORECARD,
  construction_bep: CONSTRUCTION_BEP_SCORECARD,
};

export type ConstructionEntityType = keyof typeof CONSTRUCTION_SCORECARDS;

export function getConstructionScorecard(entityType: string): ConstructionScorecardConfig {
  const key = entityType.toLowerCase() as ConstructionEntityType;
  const scorecard = CONSTRUCTION_SCORECARDS[key];
  if (!scorecard) {
    throw new Error(
      `Unknown Construction entity type "${entityType}". Supported: ${Object.keys(CONSTRUCTION_SCORECARDS).join(', ')}`
    );
  }
  return scorecard;
}

export function listConstructionEntityTypes(): Array<{ value: ConstructionEntityType; label: string; totalPoints: number }> {
  return [
    { value: 'construction_qse', label: 'Construction QSE', totalPoints: CONSTRUCTION_QSE_SCORECARD.totalMaxPoints },
    { value: 'construction_contractor', label: 'Construction (Contractor)', totalPoints: CONSTRUCTION_CONTRACTOR_SCORECARD.totalMaxPoints },
    { value: 'construction_bep', label: 'Construction (Built Environment Professional)', totalPoints: CONSTRUCTION_BEP_SCORECARD.totalMaxPoints },
  ];
}
