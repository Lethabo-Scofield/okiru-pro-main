export interface StarterEntity {
  label: string;
  definition: string;
  synonyms: string[];
  positives: string[];
  negatives: string[];
  zones: string[];
  keywords: { must: string[]; nice: string[]; neg: string[] };
  pattern: string;
}

export interface StarterTemplate {
  name: string;
  key: string;
  category: string;
  description: string;
  sectorCode?: string;
  scorecardType?: string;
  entities: StarterEntity[];
}

// ---------------------------------------------------------------------------
// Shared entity definitions used across multiple sector presets
// ---------------------------------------------------------------------------

const FINANCIAL_ENTITIES: StarterEntity[] = [
  {
    label: "TotalRevenue",
    definition: "Total annual revenue / turnover of the measured entity for the measurement period.",
    synonyms: ["turnover", "total revenue", "annual revenue", "sales", "gross revenue", "income"],
    positives: ["R 150 000 000", "150000000", "R150,000,000.00"],
    negatives: ["Net Profit", "Other Income", "Gross Profit"],
    zones: ["income statement", "financial summary", "general info"],
    keywords: { must: ["revenue", "turnover"], nice: ["annual", "total", "gross"], neg: ["cost", "expense", "tax"] },
    pattern: "R\\s?[\\d,. ]+(\\.\\d{2})?(M|K)?"
  },
  {
    label: "NPAT",
    definition: "Net profit after tax for the measurement period. Used as denominator for ESD and SED targets.",
    synonyms: ["net profit after tax", "net profit", "PAT", "net income", "profit after tax"],
    positives: ["R 12 000 000", "-5000000", "R12,500,000"],
    negatives: ["Revenue", "Gross Profit", "EBITDA", "Operating Profit"],
    zones: ["income statement", "financial summary", "general info"],
    keywords: { must: ["net profit", "NPAT", "PAT"], nice: ["after tax"], neg: ["gross profit", "EBITDA"] },
    pattern: "R\\s?[\\d,. ]+(\\.\\d{2})?(M|K)?"
  },
  {
    label: "LeviableAmount",
    definition: "Total leviable payroll (salary bill) on which skills development levy is calculated.",
    synonyms: ["payroll", "total payroll", "leviable payroll", "total remuneration", "salary bill"],
    positives: ["R 45 000 000", "45000000", "R45,000,000"],
    negatives: ["Revenue", "Net Profit", "Training Cost"],
    zones: ["payroll", "skills", "financial summary", "general info"],
    keywords: { must: ["leviable", "payroll"], nice: ["remuneration", "salary"], neg: ["pension", "bonus"] },
    pattern: "R\\s?[\\d,. ]+(\\.\\d{2})?(M|K)?"
  },
  {
    label: "TMPS",
    definition: "Total measured procurement spend for the measurement period.",
    synonyms: ["total measured procurement spend", "total procurement spend", "measured procurement", "total procurement"],
    positives: ["R 80 000 000", "80000000", "R80,000,000"],
    negatives: ["Revenue", "Payroll", "Training Spend"],
    zones: ["procurement", "financial summary", "general info"],
    keywords: { must: ["procurement", "spend"], nice: ["total", "measured"], neg: ["import", "exempt"] },
    pattern: "R\\s?[\\d,. ]+(\\.\\d{2})?(M|K)?"
  },
  {
    label: "FinancialYearEnd",
    definition: "End date of the financial year being measured.",
    synonyms: ["FYE", "year end", "financial year", "measurement period end"],
    positives: ["2024-03-31", "31 March 2024", "2024/03/31"],
    negatives: ["Start Date", "Incorporation Date", "Certificate Date"],
    zones: ["general info", "client info", "cover page"],
    keywords: { must: ["year end", "financial year"], nice: ["measurement period", "FYE"], neg: ["start date"] },
    pattern: "\\d{4}[-/]\\d{2}[-/]\\d{2}"
  },
];

const OWNERSHIP_ENTITIES: StarterEntity[] = [
  {
    label: "ShareholderName",
    definition: "Name of each shareholder / equity holder in the measured entity.",
    synonyms: ["shareholder", "equity holder", "owner", "member"],
    positives: ["Thabo Investments (Pty) Ltd", "John Smith", "Sizwe Holdings"],
    negatives: ["Employee Name", "Supplier Name", "Director Name"],
    zones: ["ownership", "shareholder register", "equity schedule"],
    keywords: { must: ["shareholder", "owner"], nice: ["name", "entity"], neg: ["employee", "supplier"] },
    pattern: ""
  },
  {
    label: "BlackOwnershipPercentage",
    definition: "Percentage of equity held by black people as defined in the B-BBEE Act.",
    synonyms: ["BO%", "BO", "black %", "HDSA", "black ownership"],
    positives: ["51%", "0.51", "51.00%"],
    negatives: ["White ownership", "Foreign ownership", "Management shareholding"],
    zones: ["ownership", "equity schedule"],
    keywords: { must: ["black", "ownership"], nice: ["percentage", "equity", "HDSA"], neg: ["employee", "management"] },
    pattern: "\\d{1,3}(\\.\\d{1,2})?%"
  },
  {
    label: "BlackWomenOwnershipPercentage",
    definition: "Percentage of equity held by black women.",
    synonyms: ["BWO%", "BWO", "black women %", "black female ownership"],
    positives: ["30%", "0.30", "30.00%"],
    negatives: ["Total black ownership", "Male ownership", "White women ownership"],
    zones: ["ownership", "equity schedule"],
    keywords: { must: ["black women", "black female"], nice: ["ownership", "equity"], neg: ["employee", "management"] },
    pattern: "\\d{1,3}(\\.\\d{1,2})?%"
  },
  {
    label: "ShareholdingPercentage",
    definition: "Percentage of total shares / equity held by a specific shareholder.",
    synonyms: ["shares %", "equity %", "shareholding", "stake"],
    positives: ["25%", "100%", "0.50"],
    negatives: ["Profit sharing", "Voting rights only"],
    zones: ["ownership", "shareholder register"],
    keywords: { must: ["share", "equity"], nice: ["percentage", "stake", "holding"], neg: ["profit share"] },
    pattern: "\\d{1,3}(\\.\\d{1,2})?%"
  },
  {
    label: "ShareValue",
    definition: "Monetary value of shares held by a specific shareholder.",
    synonyms: ["equity value", "investment value", "value of shares"],
    positives: ["R 5 000 000", "5000000"],
    negatives: ["Market cap", "Enterprise value"],
    zones: ["ownership", "shareholder register"],
    keywords: { must: ["value", "share"], nice: ["equity", "investment"], neg: ["market cap"] },
    pattern: "R\\s?[\\d,. ]+(\\.\\d{2})?"
  },
];

const MANAGEMENT_CONTROL_ENTITIES: StarterEntity[] = [
  {
    label: "EmployeeName",
    definition: "Full name of the employee.",
    synonyms: ["name", "staff name", "personnel"],
    positives: ["Sipho Ndlovu", "Jane Doe", "Thabo Mokoena"],
    negatives: ["Supplier Name", "Shareholder Name", "Contractor Name"],
    zones: ["employee register", "management", "staff list"],
    keywords: { must: ["name", "employee"], nice: ["first name", "surname"], neg: ["supplier", "shareholder"] },
    pattern: ""
  },
  {
    label: "EmployeeGender",
    definition: "Gender classification of the employee (male / female / other).",
    synonyms: ["sex", "M/F", "gender"],
    positives: ["Male", "Female", "M", "F"],
    negatives: ["Unknown", "N/A"],
    zones: ["employee register", "management", "EE report"],
    keywords: { must: ["gender", "sex"], nice: ["M/F", "male", "female"], neg: ["age"] },
    pattern: "(Male|Female|M|F)"
  },
  {
    label: "EmployeeRace",
    definition: "Race / population group of the employee as per EE Act categories.",
    synonyms: ["race group", "population group", "demographic", "race"],
    positives: ["African", "Coloured", "Indian", "White"],
    negatives: ["Nationality", "Ethnicity"],
    zones: ["employee register", "management", "EE report"],
    keywords: { must: ["race", "population group"], nice: ["demographic", "african", "coloured", "indian", "white"], neg: ["nationality"] },
    pattern: "(African|Coloured|Indian|White)"
  },
  {
    label: "EmployeeDesignation",
    definition: "Occupational level / designation of the employee per the EE Act schedule.",
    synonyms: ["level", "occupational level", "position", "grade", "designation", "job title"],
    positives: ["Top Management", "Senior Management", "Professionally Qualified", "Skilled Technical", "Semi-skilled", "Unskilled"],
    negatives: ["Intern", "Contractor"],
    zones: ["employee register", "management", "EE report"],
    keywords: { must: ["level", "designation", "occupational"], nice: ["position", "grade", "job title"], neg: ["department"] },
    pattern: ""
  },
  {
    label: "EmployeeDisabilityStatus",
    definition: "Whether the employee is a person with a disability.",
    synonyms: ["disabled", "PWD", "disability", "person with disability"],
    positives: ["Yes", "No", "Y", "N", "PWD"],
    negatives: ["Injury", "Sick leave"],
    zones: ["employee register", "management", "EE report"],
    keywords: { must: ["disability", "disabled"], nice: ["PWD", "person with disability"], neg: ["injury", "sick leave"] },
    pattern: "(Yes|No|Y|N)"
  },
];

const SKILLS_DEVELOPMENT_ENTITIES: StarterEntity[] = [
  {
    label: "TrainingProgrammeName",
    definition: "Name or title of the training programme / course.",
    synonyms: ["programme", "course", "training name", "qualification"],
    positives: ["NQF Level 4 Business Administration", "Learnership Programme"],
    negatives: ["Supplier Name", "Company Name"],
    zones: ["skills", "training", "learning interventions"],
    keywords: { must: ["programme", "training", "course"], nice: ["qualification", "NQF"], neg: ["supplier"] },
    pattern: ""
  },
  {
    label: "TrainingCost",
    definition: "Cost / spend on the training programme.",
    synonyms: ["spend", "amount", "cost", "training spend", "investment"],
    positives: ["R 50 000", "50000", "R50,000.00"],
    negatives: ["Salary", "Payroll"],
    zones: ["skills", "training", "learning interventions"],
    keywords: { must: ["cost", "spend", "amount"], nice: ["training", "investment"], neg: ["salary", "payroll"] },
    pattern: "R\\s?[\\d,. ]+(\\.\\d{2})?"
  },
  {
    label: "LearnerName",
    definition: "Full name of the learner / employee enrolled in the training programme.",
    synonyms: ["learner", "student", "trainee", "participant"],
    positives: ["Thandi Mkhize", "Paul van der Merwe"],
    negatives: ["Trainer Name", "Provider Name"],
    zones: ["skills", "training", "learning interventions"],
    keywords: { must: ["learner", "name"], nice: ["student", "trainee", "participant"], neg: ["supplier", "provider"] },
    pattern: ""
  },
  {
    label: "LearnerEmploymentStatus",
    definition: "Employment status of the learner (employed / unemployed / learnership).",
    synonyms: ["employment status", "employed", "unemployed"],
    positives: ["Employed", "Unemployed", "Learnership"],
    negatives: ["Contractor", "Freelancer"],
    zones: ["skills", "training", "learning interventions"],
    keywords: { must: ["employment", "status"], nice: ["employed", "unemployed", "learnership"], neg: ["race", "gender"] },
    pattern: "(Employed|Unemployed|Learnership)"
  },
  {
    label: "LearnerRaceStatus",
    definition: "Race / population group of the learner.",
    synonyms: ["learner race", "learner demographic", "population group"],
    positives: ["African", "Coloured", "Indian", "White"],
    negatives: ["Nationality", "Citizenship"],
    zones: ["skills", "training", "learning interventions"],
    keywords: { must: ["race", "population group"], nice: ["demographic", "learner"], neg: ["nationality"] },
    pattern: "(African|Coloured|Indian|White)"
  },
];

const PROCUREMENT_ENTITIES: StarterEntity[] = [
  {
    label: "SupplierName",
    definition: "Registered name of the supplier.",
    synonyms: ["vendor", "service provider", "contractor"],
    positives: ["ABC Supplies (Pty) Ltd", "XYZ Services CC"],
    negatives: ["Employee Name", "Shareholder Name"],
    zones: ["procurement", "supplier register", "vendor list"],
    keywords: { must: ["supplier", "vendor"], nice: ["name", "provider"], neg: ["employee", "shareholder"] },
    pattern: ""
  },
  {
    label: "SupplierBEELevel",
    definition: "B-BBEE compliance level of the supplier (1–8 or non-compliant).",
    synonyms: ["B-BBEE level", "compliance level", "BEE status", "BBBEE level"],
    positives: ["1", "2", "4", "8", "Level 1", "Non-compliant"],
    negatives: ["ISO level", "Quality rating"],
    zones: ["procurement", "supplier register"],
    keywords: { must: ["level", "B-BBEE", "BEE"], nice: ["compliance", "status"], neg: ["ISO", "quality"] },
    pattern: "Level\\s*[1-8]|[1-8]|Non-[Cc]ompliant"
  },
  {
    label: "SupplierBlackOwnership",
    definition: "Percentage of the supplier that is black owned.",
    synonyms: ["BO%", "black owned", "black ownership %"],
    positives: ["51%", "100%", "30%"],
    negatives: ["White ownership", "Foreign ownership"],
    zones: ["procurement", "supplier register"],
    keywords: { must: ["black", "ownership"], nice: ["supplier", "vendor", "percentage"], neg: ["employee"] },
    pattern: "\\d{1,3}(\\.\\d{1,2})?%"
  },
  {
    label: "SupplierSpend",
    definition: "Amount spent with the supplier during the measurement period.",
    synonyms: ["procurement spend", "amount", "spend", "purchase value"],
    positives: ["R 1 200 000", "1200000", "R1,200,000.00"],
    negatives: ["Salary", "Training Cost"],
    zones: ["procurement", "supplier register"],
    keywords: { must: ["spend", "amount"], nice: ["procurement", "purchase"], neg: ["salary", "training"] },
    pattern: "R\\s?[\\d,. ]+(\\.\\d{2})?"
  },
];

const ESD_ENTITIES: StarterEntity[] = [
  {
    label: "ESDBeneficiary",
    definition: "Name of the enterprise or supplier beneficiary receiving ESD support.",
    synonyms: ["beneficiary", "recipient", "enterprise", "ESD recipient"],
    positives: ["Bright Future Trading (Pty) Ltd", "Nkosi Welding CC"],
    negatives: ["Employee Name", "Shareholder Name"],
    zones: ["ESD", "enterprise development", "supplier development"],
    keywords: { must: ["beneficiary", "enterprise", "supplier development"], nice: ["recipient", "ESD"], neg: ["employee", "shareholder"] },
    pattern: ""
  },
  {
    label: "ESDContributionType",
    definition: "Nature of the ESD contribution (grant, loan, guarantee, etc.).",
    synonyms: ["type", "nature", "contribution type", "instrument"],
    positives: ["Grant", "Loan", "Guarantee", "Direct cost", "Mentorship"],
    negatives: ["Dividend", "Salary"],
    zones: ["ESD", "enterprise development", "supplier development"],
    keywords: { must: ["type", "nature", "contribution"], nice: ["grant", "loan", "guarantee"], neg: ["dividend", "salary"] },
    pattern: ""
  },
  {
    label: "ESDAmount",
    definition: "Monetary value of the ESD contribution.",
    synonyms: ["contribution amount", "ESD spend", "amount", "value"],
    positives: ["R 500 000", "500000", "R500,000"],
    negatives: ["Salary", "Training spend"],
    zones: ["ESD", "enterprise development", "supplier development"],
    keywords: { must: ["amount", "value", "contribution"], nice: ["ESD", "enterprise", "supplier development"], neg: ["salary", "training"] },
    pattern: "R\\s?[\\d,. ]+(\\.\\d{2})?"
  },
  {
    label: "ESDCategory",
    definition: "Category: enterprise development or supplier development.",
    synonyms: ["supplier development", "enterprise development", "ED", "SD", "category"],
    positives: ["Enterprise Development", "Supplier Development", "ED", "SD"],
    negatives: ["SED", "Skills"],
    zones: ["ESD", "enterprise development", "supplier development"],
    keywords: { must: ["category", "enterprise", "supplier"], nice: ["development", "ED", "SD"], neg: ["SED", "socio-economic"] },
    pattern: "(Enterprise|Supplier)\\s*Development|ED|SD"
  },
];

const SED_ENTITIES: StarterEntity[] = [
  {
    label: "SEDBeneficiary",
    definition: "Name of the SED beneficiary organisation or project.",
    synonyms: ["beneficiary", "recipient", "organisation", "project", "NPO", "NGO"],
    positives: ["Thuthuka Foundation", "Community Education Trust"],
    negatives: ["Employee Name", "Supplier Name"],
    zones: ["SED", "socio-economic development", "CSI"],
    keywords: { must: ["beneficiary", "recipient"], nice: ["SED", "CSI", "NPO", "NGO"], neg: ["employee", "supplier"] },
    pattern: ""
  },
  {
    label: "SEDContributionType",
    definition: "Nature of the SED contribution (monetary, in-kind, time).",
    synonyms: ["type", "nature", "contribution type"],
    positives: ["Monetary", "In-kind", "Time of employees"],
    negatives: ["Loan", "Guarantee"],
    zones: ["SED", "socio-economic development", "CSI"],
    keywords: { must: ["type", "nature", "contribution"], nice: ["monetary", "in-kind"], neg: ["loan", "guarantee"] },
    pattern: ""
  },
  {
    label: "SEDAmount",
    definition: "Monetary value of the SED contribution.",
    synonyms: ["contribution amount", "SED spend", "amount", "donation"],
    positives: ["R 200 000", "200000"],
    negatives: ["ESD Amount", "Training Cost"],
    zones: ["SED", "socio-economic development", "CSI"],
    keywords: { must: ["amount", "value", "contribution"], nice: ["SED", "CSI", "donation"], neg: ["salary", "training"] },
    pattern: "R\\s?[\\d,. ]+(\\.\\d{2})?"
  },
];

// ---------------------------------------------------------------------------
// 6 Sector-Specific B-BBEE Presets
// ---------------------------------------------------------------------------

export const starterTemplates: StarterTemplate[] = [
  // =========================================================================
  // 1. RCOGP Generic — Revised Codes of Good Practice (Generic Enterprise)
  // =========================================================================
  {
    name: "RCOGP Generic Scorecard",
    key: "rcogp_generic",
    category: "B-BBEE",
    sectorCode: "RCOGP",
    scorecardType: "Generic",
    description: "Full B-BBEE scorecard entities for Generic enterprises under the Revised Codes of Good Practice. Covers all 7 pillars: Ownership (25pts), Management Control (19pts), Skills Development (25pts), Preferential Procurement (27pts), Enterprise & Supplier Development (15pts), and Socio-Economic Development (5pts).",
    entities: [
      ...FINANCIAL_ENTITIES,
      ...OWNERSHIP_ENTITIES,
      ...MANAGEMENT_CONTROL_ENTITIES,
      ...SKILLS_DEVELOPMENT_ENTITIES,
      ...PROCUREMENT_ENTITIES,
      ...ESD_ENTITIES,
      ...SED_ENTITIES,
    ],
  },

  // =========================================================================
  // 2. ICT Generic — ICT Sector Code (Generic Enterprise)
  // =========================================================================
  {
    name: "ICT Generic Scorecard",
    key: "ict_generic",
    category: "B-BBEE",
    sectorCode: "ICT",
    scorecardType: "Generic",
    description: "B-BBEE scorecard entities for ICT Sector Code Generic enterprises. Includes standard pillars plus ICT-specific procurement entities for 3rd-party ICT spend and ICT black-owned supplier thresholds.",
    entities: [
      ...FINANCIAL_ENTITIES,
      ...OWNERSHIP_ENTITIES,
      ...MANAGEMENT_CONTROL_ENTITIES,
      ...SKILLS_DEVELOPMENT_ENTITIES,
      ...PROCUREMENT_ENTITIES,
      // ICT-specific procurement entities
      {
        label: "ICTBlackOwnedSpend",
        definition: "ICT procurement spend with 51% or more black-owned ICT suppliers.",
        synonyms: ["ICT BO spend", "black-owned ICT procurement", "ICT BBBEE spend"],
        positives: ["R 5 000 000", "R5,000,000"],
        negatives: ["Non-ICT spend", "General procurement"],
        zones: ["procurement", "ICT procurement"],
        keywords: { must: ["ICT", "black", "owned"], nice: ["procurement", "spend"], neg: ["general", "non-ICT"] },
        pattern: "R\\s?[\\d,. ]+(\\.\\d{2})?"
      },
      {
        label: "ThirdPartyICTSpend",
        definition: "Total spend on 3rd-party ICT products and services as measured for ICT sector code compliance.",
        synonyms: ["3rd party ICT", "third party ICT spend", "ICT services spend"],
        positives: ["R 12 000 000", "R12,000,000"],
        negatives: ["Internal ICT costs", "Hardware only"],
        zones: ["procurement", "ICT procurement"],
        keywords: { must: ["ICT", "third party"], nice: ["spend", "services"], neg: ["internal", "hardware only"] },
        pattern: "R\\s?[\\d,. ]+(\\.\\d{2})?"
      },
      ...ESD_ENTITIES,
      ...SED_ENTITIES,
    ],
  },

  // =========================================================================
  // 3. ICT QSE — ICT Sector Code (Qualifying Small Enterprise)
  // =========================================================================
  {
    name: "ICT QSE Scorecard",
    key: "ict_qse",
    category: "B-BBEE",
    sectorCode: "ICT",
    scorecardType: "QSE",
    description: "B-BBEE scorecard entities for ICT Sector Code QSE (Qualifying Small Enterprise, R10M–R50M turnover). Uses simplified combined Management Control + Employment Equity and reduced entity requirements.",
    entities: [
      ...FINANCIAL_ENTITIES,
      ...OWNERSHIP_ENTITIES,
      // QSE uses combined MC+EE with simplified entities
      {
        label: "EmployeeName",
        definition: "Full name of the employee.",
        synonyms: ["name", "staff name", "personnel"],
        positives: ["Sipho Ndlovu", "Jane Doe"],
        negatives: ["Supplier Name", "Shareholder Name"],
        zones: ["employee register", "management"],
        keywords: { must: ["name", "employee"], nice: ["first name", "surname"], neg: ["supplier"] },
        pattern: ""
      },
      {
        label: "EmployeeGender",
        definition: "Gender classification of the employee.",
        synonyms: ["sex", "M/F", "gender"],
        positives: ["Male", "Female", "M", "F"],
        negatives: ["Unknown"],
        zones: ["employee register", "management", "EE report"],
        keywords: { must: ["gender", "sex"], nice: ["M/F"], neg: ["age"] },
        pattern: "(Male|Female|M|F)"
      },
      {
        label: "EmployeeRace",
        definition: "Race / population group of the employee.",
        synonyms: ["race group", "population group", "demographic"],
        positives: ["African", "Coloured", "Indian", "White"],
        negatives: ["Nationality"],
        zones: ["employee register", "management", "EE report"],
        keywords: { must: ["race", "population group"], nice: ["demographic"], neg: ["nationality"] },
        pattern: "(African|Coloured|Indian|White)"
      },
      {
        label: "EmployeeDesignation",
        definition: "Occupational level of the employee.",
        synonyms: ["level", "occupational level", "position", "designation"],
        positives: ["Top Management", "Senior Management", "Professionally Qualified", "Skilled Technical"],
        negatives: ["Intern", "Contractor"],
        zones: ["employee register", "management"],
        keywords: { must: ["level", "designation"], nice: ["position"], neg: ["department"] },
        pattern: ""
      },
      ...SKILLS_DEVELOPMENT_ENTITIES,
      ...PROCUREMENT_ENTITIES,
      // QSE simplified ESD/SED
      {
        label: "ESDSEDContribution",
        definition: "Total enterprise, supplier, and socio-economic development contributions combined for QSE measurement.",
        synonyms: ["ESD contribution", "SED contribution", "development spend", "CSI spend"],
        positives: ["R 200 000", "R500,000"],
        negatives: ["Training cost", "Salary"],
        zones: ["ESD", "SED", "enterprise development", "socio-economic development"],
        keywords: { must: ["contribution", "development"], nice: ["ESD", "SED", "CSI"], neg: ["salary", "procurement"] },
        pattern: "R\\s?[\\d,. ]+(\\.\\d{2})?"
      },
    ],
  },

  // =========================================================================
  // 4. RCOGP QSE — Revised Codes (Qualifying Small Enterprise)
  // =========================================================================
  {
    name: "RCOGP QSE Scorecard",
    key: "rcogp_qse",
    category: "B-BBEE",
    sectorCode: "RCOGP",
    scorecardType: "QSE",
    description: "B-BBEE scorecard entities for QSE (Qualifying Small Enterprise, R10M–R50M turnover) under the Revised Codes of Good Practice. Uses simplified combined Management Control + Employment Equity and reduced entity requirements.",
    entities: [
      ...FINANCIAL_ENTITIES,
      ...OWNERSHIP_ENTITIES,
      // QSE combined MC+EE
      {
        label: "EmployeeName",
        definition: "Full name of the employee.",
        synonyms: ["name", "staff name"],
        positives: ["Sipho Ndlovu", "Jane Doe"],
        negatives: ["Supplier Name"],
        zones: ["employee register", "management"],
        keywords: { must: ["name", "employee"], nice: ["surname"], neg: ["supplier"] },
        pattern: ""
      },
      {
        label: "EmployeeGender",
        definition: "Gender classification of the employee.",
        synonyms: ["sex", "M/F", "gender"],
        positives: ["Male", "Female"],
        negatives: ["Unknown"],
        zones: ["employee register", "management"],
        keywords: { must: ["gender"], nice: ["M/F"], neg: ["age"] },
        pattern: "(Male|Female|M|F)"
      },
      {
        label: "EmployeeRace",
        definition: "Race / population group of the employee.",
        synonyms: ["race group", "population group"],
        positives: ["African", "Coloured", "Indian", "White"],
        negatives: ["Nationality"],
        zones: ["employee register", "management"],
        keywords: { must: ["race"], nice: ["population group"], neg: ["nationality"] },
        pattern: "(African|Coloured|Indian|White)"
      },
      {
        label: "EmployeeDesignation",
        definition: "Occupational level of the employee.",
        synonyms: ["level", "occupational level", "position"],
        positives: ["Top Management", "Senior Management", "Professionally Qualified"],
        negatives: ["Intern"],
        zones: ["employee register", "management"],
        keywords: { must: ["level", "designation"], nice: ["position"], neg: ["department"] },
        pattern: ""
      },
      ...SKILLS_DEVELOPMENT_ENTITIES,
      ...PROCUREMENT_ENTITIES,
      {
        label: "ESDSEDContribution",
        definition: "Total enterprise, supplier, and socio-economic development contributions combined for QSE measurement.",
        synonyms: ["ESD contribution", "SED contribution", "development spend"],
        positives: ["R 200 000", "R500,000"],
        negatives: ["Training cost"],
        zones: ["ESD", "SED", "enterprise development", "socio-economic development"],
        keywords: { must: ["contribution", "development"], nice: ["ESD", "SED"], neg: ["salary"] },
        pattern: "R\\s?[\\d,. ]+(\\.\\d{2})?"
      },
    ],
  },

  // =========================================================================
  // 5. FSC Generic — Financial Sector Code (Generic Enterprise)
  // =========================================================================
  {
    name: "FSC Generic Scorecard",
    key: "fsc_generic",
    category: "B-BBEE",
    sectorCode: "FSC",
    scorecardType: "Generic",
    description: "B-BBEE scorecard entities for the Financial Sector Code (FSC) Generic enterprises. Includes standard pillars plus FSC-specific entities for access to financial services, empowerment financing, and BEE transaction financing.",
    entities: [
      ...FINANCIAL_ENTITIES,
      ...OWNERSHIP_ENTITIES,
      ...MANAGEMENT_CONTROL_ENTITIES,
      ...SKILLS_DEVELOPMENT_ENTITIES,
      ...PROCUREMENT_ENTITIES,
      ...ESD_ENTITIES,
      ...SED_ENTITIES,
      // FSC-specific entities
      {
        label: "AccessToFinancialServices",
        definition: "Initiatives and products aimed at extending financial services access to previously underserved communities.",
        synonyms: ["financial inclusion", "access products", "underserved communities", "financial access"],
        positives: ["Micro-insurance products", "Low-cost banking", "Rural branch expansion"],
        negatives: ["Premium products", "Corporate banking"],
        zones: ["FSC", "financial inclusion", "access to services"],
        keywords: { must: ["access", "financial services"], nice: ["inclusion", "underserved"], neg: ["premium", "corporate"] },
        pattern: ""
      },
      {
        label: "EmpowermentFinancingAmount",
        definition: "Total value of empowerment financing provided (BEE transaction financing, black-owned enterprise financing).",
        synonyms: ["empowerment finance", "BEE financing", "transformation financing"],
        positives: ["R 50 000 000", "R50,000,000"],
        negatives: ["General lending", "Non-BEE financing"],
        zones: ["FSC", "empowerment financing", "transformation"],
        keywords: { must: ["empowerment", "financing"], nice: ["BEE", "transformation"], neg: ["general", "non-BEE"] },
        pattern: "R\\s?[\\d,. ]+(\\.\\d{2})?(M|B)?"
      },
      {
        label: "BEETransactionFinancing",
        definition: "Financing specifically provided for B-BBEE ownership transactions to enable black equity participation.",
        synonyms: ["BEE deal financing", "ownership transaction finance", "equity transaction funding"],
        positives: ["R 100 000 000", "R100M BEE transaction"],
        negatives: ["Working capital", "Asset financing"],
        zones: ["FSC", "empowerment financing"],
        keywords: { must: ["BEE", "transaction", "financing"], nice: ["equity", "ownership"], neg: ["working capital"] },
        pattern: "R\\s?[\\d,. ]+(\\.\\d{2})?(M|B)?"
      },
    ],
  },

  // =========================================================================
  // 6. Agri Generic — Agriculture Sector Code (Generic Enterprise)
  // =========================================================================
  {
    name: "Agri Generic Scorecard",
    key: "agri_generic",
    category: "B-BBEE",
    sectorCode: "AGRI",
    scorecardType: "Generic",
    description: "B-BBEE scorecard entities for the Agriculture Sector (AgriBEE) Generic enterprises. Includes standard pillars plus Agri-specific entities for land ownership, agricultural development contributions, and farmworker housing.",
    entities: [
      ...FINANCIAL_ENTITIES,
      ...OWNERSHIP_ENTITIES,
      ...MANAGEMENT_CONTROL_ENTITIES,
      ...SKILLS_DEVELOPMENT_ENTITIES,
      ...PROCUREMENT_ENTITIES,
      ...ESD_ENTITIES,
      ...SED_ENTITIES,
      // Agri-specific entities
      {
        label: "LandOwnershipBlack",
        definition: "Hectares or percentage of agricultural land owned by black people.",
        synonyms: ["black land ownership", "agricultural land", "farm ownership", "land reform"],
        positives: ["500 hectares", "30%", "1200ha"],
        negatives: ["Urban property", "Commercial property"],
        zones: ["ownership", "land reform", "agriculture"],
        keywords: { must: ["land", "ownership"], nice: ["agricultural", "hectares", "farm"], neg: ["urban", "commercial"] },
        pattern: "\\d+\\s*(ha|hectares|%)"
      },
      {
        label: "AgriculturalDevelopmentContribution",
        definition: "Contributions towards agricultural development programmes for emerging black farmers.",
        synonyms: ["agri development", "farmer support", "agricultural contribution", "emerging farmer programme"],
        positives: ["R 2 000 000", "R2,000,000"],
        negatives: ["General ESD", "Non-agricultural development"],
        zones: ["agriculture", "enterprise development", "farmer support"],
        keywords: { must: ["agricultural", "development"], nice: ["farmer", "contribution"], neg: ["general", "non-agricultural"] },
        pattern: "R\\s?[\\d,. ]+(\\.\\d{2})?"
      },
      {
        label: "FarmworkerHousing",
        definition: "Investment in farmworker housing and living conditions improvements.",
        synonyms: ["worker housing", "farm housing", "accommodation", "staff quarters"],
        positives: ["R 1 500 000", "R1,500,000", "25 housing units"],
        negatives: ["Office renovation", "Warehouse"],
        zones: ["agriculture", "housing", "social development"],
        keywords: { must: ["farmworker", "housing"], nice: ["accommodation", "living conditions"], neg: ["office", "warehouse"] },
        pattern: "R\\s?[\\d,. ]+(\\.\\d{2})?"
      },
    ],
  },

  // =========================================================================
  // Non-B-BBEE Supporting Templates
  // =========================================================================

  {
    name: "Tax Clearance (TCS/PIN)",
    key: "tax_clearance",
    category: "Compliance",
    description: "Extract tax compliance status, PIN numbers, and validity from SARS tax clearance certificates.",
    entities: [
      {
        label: "TaxCompliancePin",
        definition: "The unique Tax Compliance Status PIN issued by SARS for verification purposes.",
        synonyms: ["TCS PIN", "Tax PIN", "SARS PIN", "Compliance PIN", "Tax Clearance Number"],
        positives: ["1234567890", "TCS-2024-00001234", "PIN: 9876543210"],
        negatives: ["VAT Number", "Company Reg No", "Income Tax Reference"],
        zones: ["PDF Header", "Tables"],
        keywords: { must: ["PIN", "tax"], nice: ["compliance", "clearance"], neg: ["VAT", "income"] },
        pattern: "\\d{10}|TCS-\\d{4}-\\d{8}"
      },
      {
        label: "TaxComplianceStatus",
        definition: "Whether the entity's tax affairs are in good standing (Compliant/Non-Compliant).",
        synonyms: ["Tax Status", "Compliance Status", "Good Standing", "SARS Status"],
        positives: ["Compliant", "Tax Compliant", "Good Standing", "Non-Compliant"],
        negatives: ["B-BBEE Status", "Payment Status", "Account Status"],
        zones: ["PDF Header", "Tables"],
        keywords: { must: ["status", "compliant"], nice: ["good standing", "SARS"], neg: ["BEE", "payment"] },
        pattern: "(Compliant|Non-Compliant|Good Standing)"
      },
      {
        label: "TCSExpiryDate",
        definition: "The date on which the Tax Clearance Certificate or PIN expires.",
        synonyms: ["Expiry Date", "Valid Until", "Expiration Date", "End Date"],
        positives: ["2025-01-14", "14 January 2025", "2025/01/14"],
        negatives: ["Issue Date", "Filing Date", "Assessment Date"],
        zones: ["PDF Header", "Tables"],
        keywords: { must: ["expiry", "date"], nice: ["valid until", "end"], neg: ["issue", "filing"] },
        pattern: "\\d{4}[-/]\\d{2}[-/]\\d{2}"
      },
      {
        label: "TaxpayerName",
        definition: "The registered name of the taxpayer on the tax clearance certificate.",
        synonyms: ["Entity Name", "Company Name", "Taxpayer", "Registered Name"],
        positives: ["Moyo Retail (Pty) Ltd", "Karoo Telecom Holdings", "Blue Crane Logistics CC"],
        negatives: ["SARS Office", "Tax Practitioner", "Auditor Name"],
        zones: ["PDF Header"],
        keywords: { must: ["taxpayer", "name"], nice: ["entity", "registered"], neg: ["SARS", "practitioner"] },
        pattern: ""
      },
    ]
  },
  {
    name: "Company Registration (CIPC)",
    key: "cipc_registration",
    category: "Corporate",
    description: "Extract company registration details, directors, and incorporation data from CIPC documents.",
    entities: [
      {
        label: "CompanyRegistrationNumber",
        definition: "The unique registration number assigned by CIPC upon company incorporation.",
        synonyms: ["Reg No", "CIPC Number", "Company Number", "CK Number"],
        positives: ["2015/123456/07", "K2018/654321", "2020/001234/23"],
        negatives: ["VAT Number", "Tax Reference", "B-BBEE Certificate No"],
        zones: ["PDF Header", "Tables"],
        keywords: { must: ["registration", "number"], nice: ["CIPC", "company"], neg: ["VAT", "tax"] },
        pattern: "(CK|K)?\\d{4}/\\d{5,6}/\\d{2}"
      },
      {
        label: "CompanyName",
        definition: "The registered legal name of the company as per CIPC records.",
        synonyms: ["Registered Name", "Legal Name", "Entity Name", "Trading Name"],
        positives: ["Moyo Retail (Pty) Ltd", "Blue Crane Logistics CC"],
        negatives: ["Director Name", "Shareholder Name", "Brand Name"],
        zones: ["PDF Header"],
        keywords: { must: ["company", "name"], nice: ["registered", "legal"], neg: ["director", "brand"] },
        pattern: ""
      },
      {
        label: "CompanyType",
        definition: "The legal type of company (Private Company, Close Corporation, NPC, etc.).",
        synonyms: ["Entity Type", "Legal Form", "Company Category"],
        positives: ["Private Company (Pty) Ltd", "Close Corporation (CC)", "Non-Profit Company (NPC)"],
        negatives: ["Industry Type", "B-BBEE Category"],
        zones: ["PDF Header", "Tables"],
        keywords: { must: ["type", "company"], nice: ["private", "close corporation"], neg: ["industry", "category"] },
        pattern: "(Pty|CC|NPC|Ltd|SOC)"
      },
      {
        label: "IncorporationDate",
        definition: "The date on which the company was officially incorporated/registered with CIPC.",
        synonyms: ["Date of Incorporation", "Registration Date", "Formation Date"],
        positives: ["2015-06-01", "1 June 2015", "2020/03/15"],
        negatives: ["Financial Year End", "Certificate Date"],
        zones: ["PDF Header", "Tables"],
        keywords: { must: ["incorporation", "date"], nice: ["registration", "established"], neg: ["amendment", "financial"] },
        pattern: "\\d{4}[-/]\\d{2}[-/]\\d{2}"
      },
      {
        label: "DirectorsList",
        definition: "The list of current directors or members registered with CIPC.",
        synonyms: ["Directors", "Members", "Board of Directors", "Company Directors"],
        positives: ["S. Nkosi (Director), F. Patel (Director)"],
        negatives: ["Shareholders", "Employees", "Auditors"],
        zones: ["Tables", "PDF Header"],
        keywords: { must: ["director"], nice: ["member", "board"], neg: ["shareholder", "employee"] },
        pattern: ""
      },
      {
        label: "CompanyStatus",
        definition: "The current status of the company with CIPC (Active, In Business, Deregistered).",
        synonyms: ["CIPC Status", "Registration Status", "Entity Status"],
        positives: ["In Business", "Active", "Final Deregistration"],
        negatives: ["B-BBEE Status", "Tax Status"],
        zones: ["PDF Header", "Tables"],
        keywords: { must: ["status"], nice: ["active", "in business"], neg: ["BEE", "tax"] },
        pattern: "(In Business|Active|Deregistered|Final Deregistration)"
      },
    ]
  },
];
