/**
 * Entity Extraction Manifest
 *
 * Defines every field the pipeline must extract from B-BBEE workbooks,
 * together with aliases, validation boundaries, and retrieval hints that
 * guide the AI extraction layer.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RetrievalHints {
  mustHave: string[];
  niceToHave: string[];
  dontHave: string[];
}

export interface ValidationRules {
  min?: number;
  max?: number;
  required: boolean;
  /** Other entity names whose extracted values should sum with this one. */
  sumsWith?: string[];
}

export interface EntityRequirement {
  name: string;
  pillarCode: string;
  fieldType: 'currency' | 'percentage' | 'count' | 'string' | 'date' | 'bee_level';
  definition: string;
  aliases: string[];
  zones: string[];
  positiveExamples: string[];
  negativeExamples: string[];
  validationRules: ValidationRules;
  retrievalHints: RetrievalHints;
}

export interface SheetHint {
  /** Regex pattern (as a string) matched against sheet / tab names. */
  pattern: string;
  /** Pillar code the sheet maps to. */
  mapsTo: string;
  expectedFields: string[];
}

export interface EntityManifest {
  scorecardId?: string;
  sectorCode: string;
  scorecardType: string;
  requiredEntities: EntityRequirement[];
  sheetHints: SheetHint[];
  createdAt?: string;
}

// ---------------------------------------------------------------------------
// Scorecard type catalogue
// ---------------------------------------------------------------------------

const SCORECARD_TYPES = [
  { sectorCode: 'RCOGP', scorecardType: 'Generic' },
  { sectorCode: 'QSE', scorecardType: 'QSE' },
  { sectorCode: 'EME', scorecardType: 'EME' },
  { sectorCode: 'RCOGP', scorecardType: 'Specialised_Financial' },
  { sectorCode: 'RCOGP', scorecardType: 'Specialised_Transport' },
  { sectorCode: 'RCOGP', scorecardType: 'Specialised_Tourism' },
] as const;

// ---------------------------------------------------------------------------
// Helper – entity builder
// ---------------------------------------------------------------------------

function entity(
  name: string,
  pillarCode: string,
  fieldType: EntityRequirement['fieldType'],
  definition: string,
  opts: {
    aliases?: string[];
    zones?: string[];
    positiveExamples?: string[];
    negativeExamples?: string[];
    validation?: Partial<ValidationRules>;
    hints?: Partial<RetrievalHints>;
  } = {},
): EntityRequirement {
  return {
    name,
    pillarCode,
    fieldType,
    definition,
    aliases: opts.aliases ?? [],
    zones: opts.zones ?? [],
    positiveExamples: opts.positiveExamples ?? [],
    negativeExamples: opts.negativeExamples ?? [],
    validationRules: {
      required: true,
      ...opts.validation,
    },
    retrievalHints: {
      mustHave: [],
      niceToHave: [],
      dontHave: [],
      ...opts.hints,
    },
  };
}

// ---------------------------------------------------------------------------
// Financial entities
// ---------------------------------------------------------------------------

const financialEntities: EntityRequirement[] = [
  entity('Total Revenue', 'financials', 'currency',
    'Total annual revenue / turnover of the measured entity for the measurement period.', {
      aliases: ['turnover', 'total revenue', 'annual revenue', 'sales', 'gross revenue', 'income'],
      zones: ['income statement', 'financial summary', 'general info'],
      positiveExamples: ['R 150 000 000', '150000000', 'R150,000,000.00'],
      negativeExamples: ['R 0', '-50000000'],
      validation: { required: true, min: 0 },
      hints: {
        mustHave: ['revenue', 'turnover'],
        niceToHave: ['annual', 'total', 'gross'],
        dontHave: ['cost', 'expense', 'tax'],
      },
    }),

  entity('NPAT', 'financials', 'currency',
    'Net profit after tax for the measurement period.', {
      aliases: ['net profit after tax', 'net profit', 'PAT', 'net income', 'profit after tax'],
      zones: ['income statement', 'financial summary', 'general info'],
      positiveExamples: ['R 12 000 000', '-5000000'],
      negativeExamples: [],
      validation: { required: true },
      hints: {
        mustHave: ['net profit', 'NPAT', 'PAT'],
        niceToHave: ['after tax'],
        dontHave: ['gross profit', 'EBITDA'],
      },
    }),

  entity('Leviable Amount', 'financials', 'currency',
    'Total leviable payroll (salary bill) on which skills development levy is calculated.', {
      aliases: ['payroll', 'total payroll', 'leviable payroll', 'total remuneration', 'salary bill'],
      zones: ['payroll', 'skills', 'financial summary', 'general info'],
      positiveExamples: ['R 45 000 000', '45000000'],
      negativeExamples: ['R 0'],
      validation: { required: true, min: 0 },
      hints: {
        mustHave: ['leviable', 'payroll'],
        niceToHave: ['remuneration', 'salary'],
        dontHave: ['pension', 'bonus'],
      },
    }),

  entity('TMPS', 'financials', 'currency',
    'Total measured procurement spend for the measurement period.', {
      aliases: ['total measured procurement spend', 'total procurement spend', 'measured procurement', 'total procurement'],
      zones: ['procurement', 'financial summary', 'general info'],
      positiveExamples: ['R 80 000 000', '80000000'],
      negativeExamples: ['R 0'],
      validation: { required: true, min: 0 },
      hints: {
        mustHave: ['procurement', 'spend'],
        niceToHave: ['total', 'measured'],
        dontHave: ['import', 'exempt'],
      },
    }),

  entity('Financial Year End', 'financials', 'date',
    'End date of the financial year being measured.', {
      aliases: ['FYE', 'year end', 'financial year', 'measurement period end'],
      zones: ['general info', 'client info', 'cover page'],
      positiveExamples: ['2024-03-31', '31 March 2024', '2024/03/31'],
      negativeExamples: ['N/A'],
      validation: { required: true },
      hints: {
        mustHave: ['year end', 'financial year'],
        niceToHave: ['measurement period', 'FYE'],
        dontHave: ['start date'],
      },
    }),
];

// ---------------------------------------------------------------------------
// Ownership entities
// ---------------------------------------------------------------------------

const ownershipEntities: EntityRequirement[] = [
  entity('Shareholder Name', 'ownership', 'string',
    'Name of each shareholder / equity holder in the measured entity.', {
      aliases: ['shareholder', 'equity holder', 'owner', 'member'],
      zones: ['ownership', 'shareholder register', 'equity schedule'],
      positiveExamples: ['Thabo Investments (Pty) Ltd', 'John Smith'],
      negativeExamples: ['N/A', 'TBC'],
      validation: { required: true },
      hints: {
        mustHave: ['shareholder', 'owner'],
        niceToHave: ['name', 'entity'],
        dontHave: ['employee', 'supplier'],
      },
    }),

  entity('Black Ownership Percentage', 'ownership', 'percentage',
    'Percentage of equity held by black people as defined in the B-BBEE Act.', {
      aliases: ['BO%', 'BO', 'black %', 'HDSA', 'black ownership'],
      zones: ['ownership', 'equity schedule'],
      positiveExamples: ['51%', '0.51', '51.00%'],
      negativeExamples: ['120%', '-5%'],
      validation: { required: true, min: 0, max: 100 },
      hints: {
        mustHave: ['black', 'ownership'],
        niceToHave: ['percentage', 'equity', 'HDSA'],
        dontHave: ['employee', 'management'],
      },
    }),

  entity('Black Women Ownership Percentage', 'ownership', 'percentage',
    'Percentage of equity held by black women.', {
      aliases: ['BWO%', 'BWO', 'black women %', 'black female ownership'],
      zones: ['ownership', 'equity schedule'],
      positiveExamples: ['30%', '0.30', '30.00%'],
      negativeExamples: ['120%', '-5%'],
      validation: { required: true, min: 0, max: 100 },
      hints: {
        mustHave: ['black women', 'black female'],
        niceToHave: ['ownership', 'equity'],
        dontHave: ['employee', 'management'],
      },
    }),

  entity('Shareholding Percentage', 'ownership', 'percentage',
    'Percentage of total shares / equity held by a specific shareholder.', {
      aliases: ['shares %', 'equity %', 'shareholding', 'stake'],
      zones: ['ownership', 'shareholder register'],
      positiveExamples: ['25%', '100%', '0.50'],
      negativeExamples: ['150%', '-10%'],
      validation: { required: true, min: 0, max: 100, sumsWith: ['Shareholding Percentage'] },
      hints: {
        mustHave: ['share', 'equity'],
        niceToHave: ['percentage', 'stake', 'holding'],
        dontHave: ['profit share'],
      },
    }),

  entity('Share Value', 'ownership', 'currency',
    'Monetary value of shares held by a specific shareholder.', {
      aliases: ['equity value', 'investment value', 'value of shares'],
      zones: ['ownership', 'shareholder register'],
      positiveExamples: ['R 5 000 000', '5000000'],
      negativeExamples: ['R -100'],
      validation: { required: false, min: 0 },
      hints: {
        mustHave: ['value', 'share'],
        niceToHave: ['equity', 'investment'],
        dontHave: ['market cap'],
      },
    }),
];

// ---------------------------------------------------------------------------
// Management Control entities
// ---------------------------------------------------------------------------

const managementControlEntities: EntityRequirement[] = [
  entity('Employee Name', 'managementControl', 'string',
    'Full name of the employee.', {
      aliases: ['name', 'staff name', 'personnel'],
      zones: ['employee register', 'management', 'staff list'],
      positiveExamples: ['Sipho Ndlovu', 'Jane Doe'],
      negativeExamples: ['TBC', 'N/A'],
      validation: { required: true },
      hints: {
        mustHave: ['name', 'employee'],
        niceToHave: ['first name', 'surname'],
        dontHave: ['supplier', 'shareholder'],
      },
    }),

  entity('Employee Gender', 'managementControl', 'string',
    'Gender classification of the employee (male / female / other).', {
      aliases: ['sex', 'M/F', 'gender'],
      zones: ['employee register', 'management', 'EE report'],
      positiveExamples: ['Male', 'Female', 'M', 'F'],
      negativeExamples: ['Unknown'],
      validation: { required: true },
      hints: {
        mustHave: ['gender', 'sex'],
        niceToHave: ['M/F', 'male', 'female'],
        dontHave: ['age'],
      },
    }),

  entity('Employee Race', 'managementControl', 'string',
    'Race / population group of the employee as per EE Act categories.', {
      aliases: ['race group', 'population group', 'demographic', 'race'],
      zones: ['employee register', 'management', 'EE report'],
      positiveExamples: ['African', 'Coloured', 'Indian', 'White'],
      negativeExamples: ['Other', 'Unknown'],
      validation: { required: true },
      hints: {
        mustHave: ['race', 'population group'],
        niceToHave: ['demographic', 'african', 'coloured', 'indian', 'white'],
        dontHave: ['nationality'],
      },
    }),

  entity('Employee Designation', 'managementControl', 'string',
    'Occupational level / designation of the employee per the EE Act schedule.', {
      aliases: ['level', 'occupational level', 'position', 'grade', 'designation', 'job title'],
      zones: ['employee register', 'management', 'EE report'],
      positiveExamples: ['Top Management', 'Senior Management', 'Professionally Qualified', 'Skilled Technical', 'Semi-skilled', 'Unskilled'],
      negativeExamples: ['Intern', 'Contractor'],
      validation: { required: true },
      hints: {
        mustHave: ['level', 'designation', 'occupational'],
        niceToHave: ['position', 'grade', 'job title'],
        dontHave: ['department'],
      },
    }),

  entity('Employee Disability Status', 'managementControl', 'string',
    'Whether the employee is a person with a disability.', {
      aliases: ['disabled', 'PWD', 'disability', 'person with disability'],
      zones: ['employee register', 'management', 'EE report'],
      positiveExamples: ['Yes', 'No', 'Y', 'N', 'PWD'],
      negativeExamples: [],
      validation: { required: false },
      hints: {
        mustHave: ['disability', 'disabled'],
        niceToHave: ['PWD', 'person with disability'],
        dontHave: ['injury', 'sick leave'],
      },
    }),
];

// ---------------------------------------------------------------------------
// Skills Development entities
// ---------------------------------------------------------------------------

const skillsDevelopmentEntities: EntityRequirement[] = [
  entity('Training Programme Name', 'skillsDevelopment', 'string',
    'Name or title of the training programme / course.', {
      aliases: ['programme', 'course', 'training name', 'qualification'],
      zones: ['skills', 'training', 'learning interventions'],
      positiveExamples: ['NQF Level 4 Business Administration', 'Learnership Programme'],
      negativeExamples: ['N/A'],
      validation: { required: true },
      hints: {
        mustHave: ['programme', 'training', 'course'],
        niceToHave: ['qualification', 'NQF'],
        dontHave: ['supplier'],
      },
    }),

  entity('Training Cost', 'skillsDevelopment', 'currency',
    'Cost / spend on the training programme.', {
      aliases: ['spend', 'amount', 'cost', 'training spend', 'investment'],
      zones: ['skills', 'training', 'learning interventions'],
      positiveExamples: ['R 50 000', '50000', 'R50,000.00'],
      negativeExamples: ['R 0', '-1000'],
      validation: { required: true, min: 0 },
      hints: {
        mustHave: ['cost', 'spend', 'amount'],
        niceToHave: ['training', 'investment'],
        dontHave: ['salary', 'payroll'],
      },
    }),

  entity('Learner Name', 'skillsDevelopment', 'string',
    'Full name of the learner / employee enrolled in the training programme.', {
      aliases: ['learner', 'student', 'trainee', 'participant'],
      zones: ['skills', 'training', 'learning interventions'],
      positiveExamples: ['Thandi Mkhize', 'Paul van der Merwe'],
      negativeExamples: ['N/A', 'TBC'],
      validation: { required: true },
      hints: {
        mustHave: ['learner', 'name'],
        niceToHave: ['student', 'trainee', 'participant'],
        dontHave: ['supplier', 'provider'],
      },
    }),

  entity('Learner Employment Status', 'skillsDevelopment', 'string',
    'Employment status of the learner (employed / unemployed / learnership).', {
      aliases: ['employment status', 'employed', 'unemployed'],
      zones: ['skills', 'training', 'learning interventions'],
      positiveExamples: ['Employed', 'Unemployed', 'Learnership'],
      negativeExamples: ['Unknown'],
      validation: { required: true },
      hints: {
        mustHave: ['employment', 'status'],
        niceToHave: ['employed', 'unemployed', 'learnership'],
        dontHave: ['race', 'gender'],
      },
    }),

  entity('Learner Race Status', 'skillsDevelopment', 'string',
    'Race / population group of the learner.', {
      aliases: ['learner race', 'learner demographic', 'population group'],
      zones: ['skills', 'training', 'learning interventions'],
      positiveExamples: ['African', 'Coloured', 'Indian', 'White'],
      negativeExamples: ['Other', 'Unknown'],
      validation: { required: true },
      hints: {
        mustHave: ['race', 'population group'],
        niceToHave: ['demographic', 'learner'],
        dontHave: ['nationality'],
      },
    }),
];

// ---------------------------------------------------------------------------
// Preferential Procurement entities
// ---------------------------------------------------------------------------

const procurementEntities: EntityRequirement[] = [
  entity('Supplier Name', 'preferentialProcurement', 'string',
    'Registered name of the supplier.', {
      aliases: ['vendor', 'service provider', 'contractor'],
      zones: ['procurement', 'supplier register', 'vendor list'],
      positiveExamples: ['ABC Supplies (Pty) Ltd', 'XYZ Services CC'],
      negativeExamples: ['N/A'],
      validation: { required: true },
      hints: {
        mustHave: ['supplier', 'vendor'],
        niceToHave: ['name', 'provider'],
        dontHave: ['employee', 'shareholder'],
      },
    }),

  entity('Supplier BEE Level', 'preferentialProcurement', 'bee_level',
    'B-BBEE compliance level of the supplier (1–8 or non-compliant).', {
      aliases: ['B-BBEE level', 'compliance level', 'BEE status', 'BBBEE level'],
      zones: ['procurement', 'supplier register'],
      positiveExamples: ['1', '2', '4', '8', 'Level 1', 'Non-compliant'],
      negativeExamples: ['9', '-1', 'Gold'],
      validation: { required: true, min: 0, max: 8 },
      hints: {
        mustHave: ['level', 'B-BBEE', 'BEE'],
        niceToHave: ['compliance', 'status'],
        dontHave: ['ISO', 'quality'],
      },
    }),

  entity('Supplier Black Ownership', 'preferentialProcurement', 'percentage',
    'Percentage of the supplier that is black owned.', {
      aliases: ['BO%', 'black owned', 'black ownership %'],
      zones: ['procurement', 'supplier register'],
      positiveExamples: ['51%', '100%', '30%'],
      negativeExamples: ['120%', '-5%'],
      validation: { required: false, min: 0, max: 100 },
      hints: {
        mustHave: ['black', 'ownership'],
        niceToHave: ['supplier', 'vendor', 'percentage'],
        dontHave: ['employee'],
      },
    }),

  entity('Supplier Spend', 'preferentialProcurement', 'currency',
    'Amount spent with the supplier during the measurement period.', {
      aliases: ['procurement spend', 'amount', 'spend', 'purchase value'],
      zones: ['procurement', 'supplier register'],
      positiveExamples: ['R 1 200 000', '1200000', 'R1,200,000.00'],
      negativeExamples: ['R 0', '-50000'],
      validation: { required: true, min: 0 },
      hints: {
        mustHave: ['spend', 'amount'],
        niceToHave: ['procurement', 'purchase'],
        dontHave: ['salary', 'training'],
      },
    }),
];

// ---------------------------------------------------------------------------
// Enterprise & Supplier Development entities
// ---------------------------------------------------------------------------

const esdEntities: EntityRequirement[] = [
  entity('ESD Beneficiary', 'enterpriseSupplierDevelopment', 'string',
    'Name of the enterprise or supplier beneficiary receiving ESD support.', {
      aliases: ['beneficiary', 'recipient', 'enterprise', 'ESD recipient'],
      zones: ['ESD', 'enterprise development', 'supplier development'],
      positiveExamples: ['Bright Future Trading (Pty) Ltd', 'Nkosi Welding CC'],
      negativeExamples: ['N/A'],
      validation: { required: true },
      hints: {
        mustHave: ['beneficiary', 'enterprise', 'supplier development'],
        niceToHave: ['recipient', 'ESD'],
        dontHave: ['employee', 'shareholder'],
      },
    }),

  entity('ESD Contribution Type', 'enterpriseSupplierDevelopment', 'string',
    'Nature of the ESD contribution (grant, loan, guarantee, etc.).', {
      aliases: ['type', 'nature', 'contribution type', 'instrument'],
      zones: ['ESD', 'enterprise development', 'supplier development'],
      positiveExamples: ['Grant', 'Loan', 'Guarantee', 'Direct cost', 'Mentorship'],
      negativeExamples: ['Dividend'],
      validation: { required: true },
      hints: {
        mustHave: ['type', 'nature', 'contribution'],
        niceToHave: ['grant', 'loan', 'guarantee'],
        dontHave: ['dividend', 'salary'],
      },
    }),

  entity('ESD Amount', 'enterpriseSupplierDevelopment', 'currency',
    'Monetary value of the ESD contribution.', {
      aliases: ['contribution amount', 'ESD spend', 'amount', 'value'],
      zones: ['ESD', 'enterprise development', 'supplier development'],
      positiveExamples: ['R 500 000', '500000'],
      negativeExamples: ['R 0', '-100000'],
      validation: { required: true, min: 0 },
      hints: {
        mustHave: ['amount', 'value', 'contribution'],
        niceToHave: ['ESD', 'enterprise', 'supplier development'],
        dontHave: ['salary', 'training'],
      },
    }),

  entity('ESD Category', 'enterpriseSupplierDevelopment', 'string',
    'Category indicating whether the contribution is enterprise development or supplier development.', {
      aliases: ['supplier development', 'enterprise development', 'ED', 'SD', 'category'],
      zones: ['ESD', 'enterprise development', 'supplier development'],
      positiveExamples: ['Enterprise Development', 'Supplier Development', 'ED', 'SD'],
      negativeExamples: ['SED', 'Skills'],
      validation: { required: true },
      hints: {
        mustHave: ['category', 'enterprise', 'supplier'],
        niceToHave: ['development', 'ED', 'SD'],
        dontHave: ['SED', 'socio-economic'],
      },
    }),
];

// ---------------------------------------------------------------------------
// Socio-Economic Development entities
// ---------------------------------------------------------------------------

const sedEntities: EntityRequirement[] = [
  entity('SED Beneficiary', 'socioEconomicDevelopment', 'string',
    'Name of the SED beneficiary organisation or project.', {
      aliases: ['beneficiary', 'recipient', 'organisation', 'project', 'NPO', 'NGO'],
      zones: ['SED', 'socio-economic development', 'CSI'],
      positiveExamples: ['Thuthuka Foundation', 'Community Education Trust'],
      negativeExamples: ['N/A'],
      validation: { required: true },
      hints: {
        mustHave: ['beneficiary', 'recipient'],
        niceToHave: ['SED', 'CSI', 'NPO', 'NGO'],
        dontHave: ['employee', 'supplier'],
      },
    }),

  entity('SED Contribution Type', 'socioEconomicDevelopment', 'string',
    'Nature of the SED contribution (monetary, in-kind, time).', {
      aliases: ['type', 'nature', 'contribution type'],
      zones: ['SED', 'socio-economic development', 'CSI'],
      positiveExamples: ['Monetary', 'In-kind', 'Time of employees'],
      negativeExamples: ['Loan'],
      validation: { required: true },
      hints: {
        mustHave: ['type', 'nature', 'contribution'],
        niceToHave: ['monetary', 'in-kind'],
        dontHave: ['loan', 'guarantee'],
      },
    }),

  entity('SED Amount', 'socioEconomicDevelopment', 'currency',
    'Monetary value of the SED contribution.', {
      aliases: ['contribution amount', 'SED spend', 'amount', 'donation'],
      zones: ['SED', 'socio-economic development', 'CSI'],
      positiveExamples: ['R 200 000', '200000'],
      negativeExamples: ['R 0', '-50000'],
      validation: { required: true, min: 0 },
      hints: {
        mustHave: ['amount', 'value', 'contribution'],
        niceToHave: ['SED', 'CSI', 'donation'],
        dontHave: ['salary', 'training'],
      },
    }),
];

// ---------------------------------------------------------------------------
// Sheet hints
// ---------------------------------------------------------------------------

const SHEET_HINTS: SheetHint[] = [
  {
    pattern: '(?i)(client|general|company|info|cover)',
    mapsTo: 'financials',
    expectedFields: ['Total Revenue', 'NPAT', 'Leviable Amount', 'TMPS', 'Financial Year End'],
  },
  {
    pattern: '(?i)(owner|equity|share\\s?hold)',
    mapsTo: 'ownership',
    expectedFields: ['Shareholder Name', 'Black Ownership Percentage', 'Black Women Ownership Percentage', 'Shareholding Percentage', 'Share Value'],
  },
  {
    pattern: '(?i)(manage|employee|staff|EE|workforce|personnel)',
    mapsTo: 'managementControl',
    expectedFields: ['Employee Name', 'Employee Gender', 'Employee Race', 'Employee Designation', 'Employee Disability Status'],
  },
  {
    pattern: '(?i)(skill|train|learn|development)',
    mapsTo: 'skillsDevelopment',
    expectedFields: ['Training Programme Name', 'Training Cost', 'Learner Name', 'Learner Employment Status', 'Learner Race Status'],
  },
  {
    pattern: '(?i)(procure|supplier|vendor|spend)',
    mapsTo: 'preferentialProcurement',
    expectedFields: ['Supplier Name', 'Supplier BEE Level', 'Supplier Black Ownership', 'Supplier Spend'],
  },
  {
    pattern: '(?i)(esd|enterprise.*dev|supplier.*dev)',
    mapsTo: 'enterpriseSupplierDevelopment',
    expectedFields: ['ESD Beneficiary', 'ESD Contribution Type', 'ESD Amount', 'ESD Category'],
  },
  {
    pattern: '(?i)(sed|socio|csi|community)',
    mapsTo: 'socioEconomicDevelopment',
    expectedFields: ['SED Beneficiary', 'SED Contribution Type', 'SED Amount'],
  },
  {
    pattern: '(?i)(score\\s?card|summary|result|dashboard)',
    mapsTo: 'scorecard',
    expectedFields: [],
  },
];

// ---------------------------------------------------------------------------
// Manifest builders
// ---------------------------------------------------------------------------

/** Minimal financial manifest with revenue, profit, expenses only (no B-BBEE-specific entities) */
export function buildGenericManifest(): EntityManifest {
  const genericEntities: EntityRequirement[] = [
    entity('Revenue', 'financials', 'currency',
      'Total revenue / turnover for the reporting period.', {
        aliases: ['turnover', 'total revenue', 'annual revenue', 'sales', 'gross revenue'],
        zones: ['income statement', 'financial summary'],
        positiveExamples: ['R 150 000 000', '150000000'],
        negativeExamples: ['R 0', '-50000000'],
        validation: { required: true, min: 0 },
        hints: {
          mustHave: ['revenue', 'turnover'],
          niceToHave: ['annual', 'total', 'gross'],
          dontHave: ['cost', 'expense'],
        },
      }),
    entity('Profit', 'financials', 'currency',
      'Net profit for the reporting period.', {
        aliases: ['net profit', 'net income', 'profit after tax', 'PAT', 'earnings'],
        zones: ['income statement', 'financial summary'],
        positiveExamples: ['R 12 000 000', '-5000000'],
        negativeExamples: [],
        validation: { required: true },
        hints: {
          mustHave: ['profit', 'income'],
          niceToHave: ['net', 'after tax'],
          dontHave: ['gross profit', 'EBITDA'],
        },
      }),
    entity('Expenses', 'financials', 'currency',
      'Total expenses for the reporting period.', {
        aliases: ['total expenses', 'costs', 'expenditure', 'operating expenses'],
        zones: ['income statement', 'financial summary'],
        positiveExamples: ['R 100 000 000', '100000000'],
        negativeExamples: ['R 0'],
        validation: { required: false, min: 0 },
        hints: {
          mustHave: ['expense', 'cost'],
          niceToHave: ['operating', 'total'],
          dontHave: ['revenue', 'income'],
        },
      }),
  ];
  return {
    sectorCode: 'GENERIC',
    scorecardType: 'Financial',
    requiredEntities: genericEntities,
    sheetHints: [
      { pattern: '(?i)(financial|income|summary|profit)', mapsTo: 'financials', expectedFields: ['Revenue', 'Profit', 'Expenses'] },
    ],
    createdAt: new Date().toISOString(),
  };
}

/** Build a custom manifest from explicit requirements and optional sheet hints */
export function buildCustomManifest(
  requirements: EntityRequirement[],
  sheetHints?: SheetHint[],
): EntityManifest {
  return {
    sectorCode: 'CUSTOM',
    scorecardType: 'Custom',
    requiredEntities: requirements,
    sheetHints: sheetHints ?? [],
    createdAt: new Date().toISOString(),
  };
}

export function buildRCOGPGenericManifest(): EntityManifest {
  return {
    sectorCode: 'RCOGP',
    scorecardType: 'Generic',
    requiredEntities: [
      ...financialEntities,
      ...ownershipEntities,
      ...managementControlEntities,
      ...skillsDevelopmentEntities,
      ...procurementEntities,
      ...esdEntities,
      ...sedEntities,
    ],
    sheetHints: SHEET_HINTS,
    createdAt: new Date().toISOString(),
  };
}

export function buildManifestForSector(
  sectorCode: string,
  scorecardType: string,
): EntityManifest {
  const base = buildRCOGPGenericManifest();
  return {
    ...base,
    sectorCode,
    scorecardType,
  };
}

export function getAllManifests(): EntityManifest[] {
  return SCORECARD_TYPES.map(({ sectorCode, scorecardType }) =>
    buildManifestForSector(sectorCode, scorecardType),
  );
}
