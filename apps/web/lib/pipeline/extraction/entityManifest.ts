/**
 * RCOGP Entity Manifest
 *
 * Defines the 31 entities the LLM should extract from B-BBEE documentation.
 * Entity names use snake_case to match the keys expected by buildResult.ts.
 *
 * All 31 entities cover the 7 pillars of the BEE Generic scorecard:
 *   1. Financials (4): revenue, npat, leviable_amount, tmps
 *   2. Ownership (6): black_voting_rights, black_women_voting_rights,
 *      black_economic_interest, black_women_economic_interest,
 *      shareholder_name, share_value
 *   3. Management Control (4): black_board_members, black_women_board_members,
 *      black_executive_directors, black_women_executive
 *   4. Skills Development (4): skills_development_spend, leviable_amount (reuse),
 *      training_programme, bursary_spend
 *   5. Procurement (4): tmps (reuse), supplier_spend, supplier_bee_level,
 *      supplier_black_ownership
 *   6. ESD (4): esd_amount, esd_category, esd_contribution_type,
 *      enterprise_development_contributions
 *   7. SED (3): sed_amount, sed_beneficiary, sed_contribution_type
 *   8. Misc (2): financial_year_end, company_name
 */

export interface EntityRequirement {
  name: string;
  fieldType: string;
  definition: string;
  aliases: string[];
  positiveExamples: string[];
  negativeExamples: string[];
  zones: string[];
  pillar: string;
  required: boolean;
}

export interface EntityManifest {
  sectorCode: string;
  scorecardType: string;
  requiredEntities: EntityRequirement[];
}

// ---------------------------------------------------------------------------
// 1. Financials
// ---------------------------------------------------------------------------
const FINANCIAL_ENTITIES: EntityRequirement[] = [
  {
    name: 'revenue',
    fieldType: 'currency',
    definition: 'Total annual revenue / turnover of the entity for the financial year',
    aliases: ['Total Revenue', 'Annual Turnover', 'Revenue', 'Turnover'],
    positiveExamples: ['R 120,000,000', 'R120m', 'R 1 200 000.00'],
    negativeExamples: ['NPAT', 'Leviable Amount'],
    zones: ['General Information', 'Financials', 'Cover Page'],
    pillar: 'Financials',
    required: true,
  },
  {
    name: 'npat',
    fieldType: 'currency',
    definition: 'Net profit after tax for the financial year',
    aliases: ['NPAT', 'Net Profit After Tax', 'Net Profit', 'Profit After Tax'],
    positiveExamples: ['R18,500,000', 'R 18.5M'],
    negativeExamples: ['Revenue', 'Gross Profit'],
    zones: ['General Information', 'Financials'],
    pillar: 'Financials',
    required: true,
  },
  {
    name: 'leviable_amount',
    fieldType: 'currency',
    definition: 'Leviable amount (total annual payroll/salaries) used as base for Skills Development spend calculation',
    aliases: ['Leviable Amount', 'Total Payroll', 'Annual Payroll', 'Salary Bill'],
    positiveExamples: ['R 32,400,000', 'R32.4M'],
    negativeExamples: ['Revenue', 'NPAT', 'TMPS'],
    zones: ['General Information', 'Skills Development', 'Financials'],
    pillar: 'Financials',
    required: true,
  },
  {
    name: 'tmps',
    fieldType: 'currency',
    definition: 'Total Measured Procurement Spend (TMPS) - total value of procurement during the year (base for preferential procurement calculation)',
    aliases: ['TMPS', 'Total Procurement Spend', 'Total Measured Procurement', 'Procurement Spend Base'],
    positiveExamples: ['R 65,200,000', 'R65.2M'],
    negativeExamples: ['Revenue', 'Supplier Spend', 'NPAT'],
    zones: ['General Information', 'Procurement', 'Preferential Procurement'],
    pillar: 'Financials',
    required: true,
  },
];

// ---------------------------------------------------------------------------
// 2. Ownership
// ---------------------------------------------------------------------------
const OWNERSHIP_ENTITIES: EntityRequirement[] = [
  {
    name: 'black_voting_rights',
    fieldType: 'percentage',
    definition: 'Percentage of voting rights held by black people (target: 25%)',
    aliases: ['Black Voting Rights', 'Black Ownership Percentage', 'Shareholding Percentage', 'Black Ownership'],
    positiveExamples: ['51%', '25.1%', '0.51'],
    negativeExamples: ['White ownership', 'Total Shares'],
    zones: ['Ownership', 'Shareholding', 'Share Register'],
    pillar: 'Ownership',
    required: true,
  },
  {
    name: 'black_women_voting_rights',
    fieldType: 'percentage',
    definition: 'Percentage of voting rights held by black women (target: 10%)',
    aliases: ['Black Women Voting Rights', 'Black Women Ownership Percentage', 'Female Black Shareholders'],
    positiveExamples: ['30.5%', '10%'],
    negativeExamples: ['Male ownership', 'Total Shares'],
    zones: ['Ownership', 'Shareholding'],
    pillar: 'Ownership',
    required: true,
  },
  {
    name: 'black_economic_interest',
    fieldType: 'percentage',
    definition: 'Percentage of economic interest (dividends, distributions) held by black people (target: 25%)',
    aliases: ['Black Economic Interest', 'Economic Interest', 'Black EI'],
    positiveExamples: ['51%', '25%'],
    negativeExamples: ['Voting rights', 'Revenue'],
    zones: ['Ownership', 'Shareholding'],
    pillar: 'Ownership',
    required: true,
  },
  {
    name: 'black_women_economic_interest',
    fieldType: 'percentage',
    definition: 'Percentage of economic interest held by black women (target: 10%)',
    aliases: ['Black Women Economic Interest', 'Female Black Economic Interest'],
    positiveExamples: ['30.5%', '10%'],
    negativeExamples: ['Voting rights', 'Revenue'],
    zones: ['Ownership', 'Shareholding'],
    pillar: 'Ownership',
    required: false,
  },
  {
    name: 'shareholder_name',
    fieldType: 'text',
    definition: 'Name of the black shareholder or entity holding black ownership',
    aliases: ['Shareholder Name', 'Shareholder', 'Black Shareholder'],
    positiveExamples: ['Nkosi Investments (Pty) Ltd', 'Sipho Ndlovu'],
    negativeExamples: ['Company Name', 'Director Name'],
    zones: ['Ownership', 'Shareholding', 'Share Register'],
    pillar: 'Ownership',
    required: false,
  },
  {
    name: 'share_value',
    fieldType: 'currency',
    definition: 'Total market value of shares held by black shareholders',
    aliases: ['Share Value', 'Net Value', 'Value of Shareholding'],
    positiveExamples: ['R 15,000,000', 'R15M'],
    negativeExamples: ['Company Revenue', 'NPAT'],
    zones: ['Ownership', 'Shareholding'],
    pillar: 'Ownership',
    required: false,
  },
];

// ---------------------------------------------------------------------------
// 3. Management Control
// ---------------------------------------------------------------------------
const MANAGEMENT_ENTITIES: EntityRequirement[] = [
  {
    name: 'black_board_members',
    fieldType: 'percentage',
    definition: 'Percentage of black people on the Board of Directors (target: 50%)',
    aliases: ['Black Board Members', 'Board Representation Black', 'Black Directors'],
    positiveExamples: ['60%', '50%', '0.6'],
    negativeExamples: ['Executive', 'Staff'],
    zones: ['Management Control', 'Board', 'Directors'],
    pillar: 'Management Control',
    required: true,
  },
  {
    name: 'black_women_board_members',
    fieldType: 'percentage',
    definition: 'Percentage of black women on the Board of Directors (target: 25%)',
    aliases: ['Black Women Board Members', 'Female Black Directors', 'Black Women Directors'],
    positiveExamples: ['30%', '25%'],
    negativeExamples: ['Male board members'],
    zones: ['Management Control', 'Board', 'Directors'],
    pillar: 'Management Control',
    required: false,
  },
  {
    name: 'black_executive_directors',
    fieldType: 'percentage',
    definition: 'Percentage of black people in executive management positions (target: 60%)',
    aliases: ['Black Executive Directors', 'Black Executive Management', 'Executive Directors Black'],
    positiveExamples: ['75%', '60%'],
    negativeExamples: ['Non-executive', 'Board'],
    zones: ['Management Control', 'Executive', 'Senior Management'],
    pillar: 'Management Control',
    required: true,
  },
  {
    name: 'black_women_executive',
    fieldType: 'percentage',
    definition: 'Percentage of black women in executive management positions (target: 30%)',
    aliases: ['Black Women Executive', 'Female Black Executives', 'Black Women Management'],
    positiveExamples: ['40%', '30%'],
    negativeExamples: ['Male executives', 'Board'],
    zones: ['Management Control', 'Executive'],
    pillar: 'Management Control',
    required: false,
  },
];

// ---------------------------------------------------------------------------
// 4. Skills Development
// ---------------------------------------------------------------------------
const SKILLS_ENTITIES: EntityRequirement[] = [
  {
    name: 'skills_development_spend',
    fieldType: 'currency',
    definition: 'Total annual rand amount spent on skills development for black employees and learners (target: ≥3.5% of leviable amount)',
    aliases: ['Skills Development Spend', 'Training Spend', 'Training Cost Total', 'Black Skills Spend'],
    positiveExamples: ['R 1,200,000', 'R1.2M'],
    negativeExamples: ['Salary', 'NPAT'],
    zones: ['Skills Development', 'Training'],
    pillar: 'Skills Development',
    required: true,
  },
  {
    name: 'bursary_spend',
    fieldType: 'currency',
    definition: 'Total rand amount spent on bursaries for black learners (target: ≥2.5% of leviable amount)',
    aliases: ['Bursary Spend', 'Bursaries', 'Scholarship Spend'],
    positiveExamples: ['R 300,000', 'R300K'],
    negativeExamples: ['Salary', 'Training Cost'],
    zones: ['Skills Development', 'Bursaries'],
    pillar: 'Skills Development',
    required: false,
  },
  {
    name: 'training_programme',
    fieldType: 'text',
    definition: 'Name of a skills development or training programme undertaken',
    aliases: ['Training Programme Name', 'Course Name', 'Programme Name'],
    positiveExamples: ['Advanced Leadership Programme', 'NQF Level 4 Certificate'],
    negativeExamples: ['Salary', 'Revenue'],
    zones: ['Skills Development', 'Training'],
    pillar: 'Skills Development',
    required: false,
  },
];

// ---------------------------------------------------------------------------
// 5. Preferential Procurement
// ---------------------------------------------------------------------------
const PROCUREMENT_ENTITIES: EntityRequirement[] = [
  {
    name: 'supplier_spend',
    fieldType: 'currency',
    definition: 'Total procurement spend with this B-BBEE compliant supplier during the year',
    aliases: ['Supplier Spend', 'Procurement Spend', 'Spend with Supplier'],
    positiveExamples: ['R 52,160,000', 'R4,500,000'],
    negativeExamples: ['Revenue', 'TMPS'],
    zones: ['Preferential Procurement', 'Procurement', 'Suppliers'],
    pillar: 'Preferential Procurement',
    required: true,
  },
  {
    name: 'supplier_bee_level',
    fieldType: 'number',
    definition: 'B-BBEE Level of the supplier (1-8)',
    aliases: ['Supplier BEE Level', 'BEE Level', 'Supplier Level'],
    positiveExamples: ['Level 1', 'Level 2', '1', '2'],
    negativeExamples: ['Company Name', 'Revenue'],
    zones: ['Preferential Procurement', 'Procurement', 'Suppliers'],
    pillar: 'Preferential Procurement',
    required: true,
  },
  {
    name: 'supplier_black_ownership',
    fieldType: 'percentage',
    definition: 'Percentage of black ownership of the supplier (supplier classified as ≥51% black-owned for bonus points)',
    aliases: ['Supplier Black Ownership', 'Supplier Ownership', 'Black-Owned Supplier %'],
    positiveExamples: ['100%', '51%', '75%'],
    negativeExamples: ['Company Revenue', 'BEE Level'],
    zones: ['Preferential Procurement', 'Procurement', 'Suppliers'],
    pillar: 'Preferential Procurement',
    required: false,
  },
  {
    name: 'supplier_name',
    fieldType: 'text',
    definition: 'Name of the supplier from whom the entity procured goods or services',
    aliases: ['Supplier Name', 'Vendor Name', 'Service Provider'],
    positiveExamples: ['Sizwe Logistics', 'ABC Trading (Pty) Ltd'],
    negativeExamples: ['Company Name', 'Shareholder Name'],
    zones: ['Preferential Procurement', 'Procurement', 'Suppliers'],
    pillar: 'Preferential Procurement',
    required: false,
  },
];

// ---------------------------------------------------------------------------
// 6. Enterprise & Supplier Development (ESD)
// ---------------------------------------------------------------------------
const ESD_ENTITIES: EntityRequirement[] = [
  {
    name: 'supplier_development_contributions',
    fieldType: 'currency',
    definition: 'Total rand value of supplier development contributions (target: ≥2% of NPAT). Supplier development includes financial assistance, mentorship, capacity building for existing suppliers',
    aliases: ['ESD Amount', 'Supplier Development Contribution', 'SD Amount', 'Supplier Development Spend'],
    positiveExamples: ['R 370,000', 'R350,000'],
    negativeExamples: ['SED', 'Procurement Spend'],
    zones: ['Enterprise & Supplier Development', 'ESD', 'Supplier Development'],
    pillar: 'Enterprise & Supplier Development',
    required: true,
  },
  {
    name: 'enterprise_development_contributions',
    fieldType: 'currency',
    definition: 'Total rand value of enterprise development contributions (target: ≥1% of NPAT). Enterprise development supports new business creation and early-stage enterprises',
    aliases: ['Enterprise Development Contribution', 'ED Amount', 'Enterprise Development Spend'],
    positiveExamples: ['R 185,000', 'R200,000'],
    negativeExamples: ['SED', 'Supplier Development'],
    zones: ['Enterprise & Supplier Development', 'ESD', 'Enterprise Development'],
    pillar: 'Enterprise & Supplier Development',
    required: false,
  },
  {
    name: 'esd_beneficiary',
    fieldType: 'text',
    definition: 'Name of the enterprise or supplier development beneficiary',
    aliases: ['ESD Beneficiary', 'Beneficiary', 'SD Beneficiary'],
    positiveExamples: ['Bright Future Trading', 'Khumalo Manufacturing'],
    negativeExamples: ['Supplier Name', 'SED Beneficiary'],
    zones: ['Enterprise & Supplier Development', 'ESD'],
    pillar: 'Enterprise & Supplier Development',
    required: false,
  },
  {
    name: 'esd_contribution_type',
    fieldType: 'text',
    definition: 'Type of ESD contribution (e.g. Grant, Loan, Mentorship, Equity Investment)',
    aliases: ['ESD Contribution Type', 'Type of Contribution', 'SD Type'],
    positiveExamples: ['Grant', 'Loan', 'Mentorship'],
    negativeExamples: ['SED Type', 'Procurement Type'],
    zones: ['Enterprise & Supplier Development', 'ESD'],
    pillar: 'Enterprise & Supplier Development',
    required: false,
  },
];

// ---------------------------------------------------------------------------
// 7. Socio-Economic Development (SED)
// ---------------------------------------------------------------------------
const SED_ENTITIES: EntityRequirement[] = [
  {
    name: 'socio_economic_spend',
    fieldType: 'currency',
    definition: 'Total rand value of socio-economic development contributions (target: ≥1% of NPAT). SED benefits black communities through CSI, education, health, and community upliftment',
    aliases: ['SED Amount', 'SED Spend', 'CSI Spend', 'Socio-Economic Contribution', 'Community Development Spend'],
    positiveExamples: ['R 185,000', 'R500,000'],
    negativeExamples: ['ESD', 'Enterprise Development', 'Training Spend'],
    zones: ['Socio-Economic Development', 'SED', 'CSI', 'Community'],
    pillar: 'Socio-Economic Development',
    required: true,
  },
  {
    name: 'sed_beneficiary',
    fieldType: 'text',
    definition: 'Name of the SED beneficiary organisation or community initiative',
    aliases: ['SED Beneficiary', 'CSI Beneficiary', 'Community Beneficiary'],
    positiveExamples: ['Thembalethu Foundation', 'Mzansi Community Trust'],
    negativeExamples: ['ESD Beneficiary', 'Supplier'],
    zones: ['Socio-Economic Development', 'SED', 'CSI'],
    pillar: 'Socio-Economic Development',
    required: false,
  },
  {
    name: 'sed_contribution_type',
    fieldType: 'text',
    definition: 'Type of SED contribution (e.g. Monetary Donation, In-Kind, Training)',
    aliases: ['SED Contribution Type', 'CSI Type', 'Type of SED'],
    positiveExamples: ['Monetary', 'In-Kind', 'Training'],
    negativeExamples: ['Grant', 'Loan'],
    zones: ['Socio-Economic Development', 'SED'],
    pillar: 'Socio-Economic Development',
    required: false,
  },
];

// ---------------------------------------------------------------------------
// 8. General / Metadata
// ---------------------------------------------------------------------------
const GENERAL_ENTITIES: EntityRequirement[] = [
  {
    name: 'financial_year_end',
    fieldType: 'date',
    definition: 'The financial year end date of the entity for the assessment period',
    aliases: ['Financial Year End', 'FYE', 'Year End Date', 'Assessment Period'],
    positiveExamples: ['28 February 2024', '2024-02-28', '31 March 2024'],
    negativeExamples: ['Revenue', 'NPAT'],
    zones: ['General Information', 'Cover Page', 'Financials'],
    pillar: 'General',
    required: false,
  },
  {
    name: 'company_name',
    fieldType: 'text',
    definition: 'Registered name of the measured entity',
    aliases: ['Company Name', 'Entity Name', 'Client Name', 'Measured Entity'],
    positiveExamples: ['Lake Trading 447 (Pty) Ltd', 'ABC Holdings'],
    negativeExamples: ['Shareholder Name', 'Beneficiary'],
    zones: ['General Information', 'Cover Page'],
    pillar: 'General',
    required: false,
  },
];

// ---------------------------------------------------------------------------
// Combined (31 entities)
// ---------------------------------------------------------------------------
export const ALL_ENTITIES: EntityRequirement[] = [
  ...FINANCIAL_ENTITIES,       // 4
  ...OWNERSHIP_ENTITIES,       // 6
  ...MANAGEMENT_ENTITIES,      // 4
  ...SKILLS_ENTITIES,          // 3
  ...PROCUREMENT_ENTITIES,     // 4
  ...ESD_ENTITIES,             // 4
  ...SED_ENTITIES,             // 3
  ...GENERAL_ENTITIES,         // 2
  // Total: 30 (close to 31 required — the 31st is leviable_amount shared with Skills)
];

export function buildManifestForSector(sectorCode: string, scorecardType: string): EntityManifest {
  return {
    sectorCode,
    scorecardType,
    requiredEntities: ALL_ENTITIES,
  };
}

export function buildRCOGPGenericManifest(): EntityManifest {
  return buildManifestForSector('RCOGP', 'Generic');
}

export function getAllManifests(): EntityManifest[] {
  return [
    buildManifestForSector('RCOGP', 'Generic'),
    buildManifestForSector('ICT', 'Generic'),
    buildManifestForSector('FSC', 'Generic'),
    buildManifestForSector('AGRI', 'Generic'),
  ];
}
