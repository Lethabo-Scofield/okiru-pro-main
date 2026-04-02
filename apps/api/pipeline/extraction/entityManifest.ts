/**
 * Entity Extraction Manifest — Hierarchical B-BBEE Scoring Schema
 *
 * 5-layer hierarchy:
 *   RootContext → PillarPack → CriterionEntity → EntityField → EvidenceRef
 *
 * Every field the system needs — for extraction, calculation, UI forms,
 * and evidence tracking — is defined here as an EntityField within a
 * PillarPack that contains the CriterionEntity scorecard lines it feeds.
 */

import { getSectorConfig, type SectorConfig } from '../sectorConfig.js';

// ---------------------------------------------------------------------------
// Layer 5: Evidence — source of an extracted or entered value
// ---------------------------------------------------------------------------

export interface EvidenceRef {
  documentType: 'toolkit_excel' | 'pdf_certificate' | 'manual_input' | 'info_request' | 'csv_import';
  documentName?: string;
  sheetName?: string;
  cellAddress?: string;
  pageNumber?: number;
  rowRange?: string;
  uploadedAt?: string;
  confidence?: number;
}

// ---------------------------------------------------------------------------
// Layer 4: EntityField — atomic unit of data in the system
// ---------------------------------------------------------------------------

export interface EntityField {
  id: string;
  name: string;
  pillarCode: string;
  criterionCodes: string[];
  fieldType: 'currency' | 'percentage' | 'count' | 'string' | 'date' | 'bee_level' | 'boolean';
  required: boolean;
  defaultValue?: string | number | boolean;
  validation: {
    min?: number;
    max?: number;
    enum?: string[];
    sumsWith?: string[];
  };
  extraction: {
    definition: string;
    aliases: string[];
    zones: string[];
    positiveExamples: string[];
    negativeExamples: string[];
    mustHaveKeywords: string[];
    niceToHaveKeywords: string[];
    excludeKeywords: string[];
  };
  evidence?: EvidenceRef;
  ui?: {
    inputType: 'text' | 'number' | 'select' | 'date' | 'toggle' | 'percentage';
    placeholder?: string;
    helpText?: string;
    group?: string;
  };
}

// ---------------------------------------------------------------------------
// Layer 3: CriterionEntity — a scoreable line item within a pillar
// ---------------------------------------------------------------------------

export interface CriterionEntity {
  code: string;
  name: string;
  pillarCode: string;
  target: number | string;
  maxPoints: number;
  formulaId: string;
  inputEntities: string[];
  bonusCondition?: string;
  minimumThreshold?: number;
  evidenceRequired: string[];
  sectorOverrides?: Record<string, { target?: number | string; maxPoints?: number }>;
}

// ---------------------------------------------------------------------------
// Layer 2: PillarPack — groups criteria + entities for one pillar
// ---------------------------------------------------------------------------

export interface PillarPack {
  pillarCode: string;
  pillarName: string;
  maxPoints: number;
  hasSubMinimum: boolean;
  subMinimumThreshold: number;
  criteria: CriterionEntity[];
  entities: EntityField[];
}

// ---------------------------------------------------------------------------
// Layer 1: RootContext — determines which rules apply
// ---------------------------------------------------------------------------

export interface RootContext {
  sector: string;
  sectorCodeVersion: string;
  scorecardType: 'Generic' | 'QSE' | 'EME';
  companySize: 'EME' | 'QSE' | 'Generic';
  financialYearEnd?: string;
  verificationDate?: string;
  applicableIndustryNorm?: string;
  province?: string;
  eapTargetSet?: string;
}

// ---------------------------------------------------------------------------
// SheetHint (unchanged — for sheet matching during extraction)
// ---------------------------------------------------------------------------

export interface SheetHint {
  pattern: string;
  mapsTo: string;
  expectedFields: string[];
}

// ---------------------------------------------------------------------------
// EntityManifest — top-level type
// ---------------------------------------------------------------------------

export interface EntityManifest {
  sectorCode: string;
  scorecardType: string;
  rootContext: RootContext;
  pillarPacks: PillarPack[];
  sheetHints: SheetHint[];
  createdAt?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get all entities flat (for extraction pipeline). */
export function getAllEntities(manifest: EntityManifest): EntityField[] {
  return manifest.pillarPacks.flatMap(p => p.entities);
}

/** Get entities for a specific pillar. */
export function getPillarEntities(manifest: EntityManifest, pillarCode: string): EntityField[] {
  return manifest.pillarPacks.find(p => p.pillarCode === pillarCode)?.entities ?? [];
}

/** Get criteria for a specific pillar. */
export function getPillarCriteria(manifest: EntityManifest, pillarCode: string): CriterionEntity[] {
  return manifest.pillarPacks.find(p => p.pillarCode === pillarCode)?.criteria ?? [];
}

/** Adapter: convert EntityField to LLMExtractionRequest shape. */
export function toExtractionRequest(
  field: EntityField,
  sourceText: string,
  sourcePageId: string,
): { entityName: string; entityType: string; definition: string; aliases: string[]; positiveExamples: string[]; negativeExamples: string[]; zones: string[]; sourceText: string; sourcePageId: string } {
  return {
    entityName: field.name,
    entityType: field.fieldType,
    definition: field.extraction.definition,
    aliases: field.extraction.aliases,
    positiveExamples: field.extraction.positiveExamples,
    negativeExamples: field.extraction.negativeExamples,
    zones: field.extraction.zones,
    sourceText,
    sourcePageId,
  };
}

// ---------------------------------------------------------------------------
// EntityField builder helper
// ---------------------------------------------------------------------------

function ef(
  id: string,
  name: string,
  pillarCode: string,
  fieldType: EntityField['fieldType'],
  criterionCodes: string[],
  definition: string,
  opts: {
    required?: boolean;
    aliases?: string[];
    zones?: string[];
    positiveExamples?: string[];
    negativeExamples?: string[];
    mustHave?: string[];
    niceToHave?: string[];
    exclude?: string[];
    min?: number;
    max?: number;
    enumValues?: string[];
    sumsWith?: string[];
    defaultValue?: string | number | boolean;
    inputType?: EntityField['ui'] extends undefined ? never : NonNullable<EntityField['ui']>['inputType'];
    placeholder?: string;
    helpText?: string;
    group?: string;
  } = {},
): EntityField {
  return {
    id,
    name,
    pillarCode,
    criterionCodes,
    fieldType,
    required: opts.required ?? true,
    defaultValue: opts.defaultValue,
    validation: {
      min: opts.min,
      max: opts.max,
      enum: opts.enumValues,
      sumsWith: opts.sumsWith,
    },
    extraction: {
      definition,
      aliases: opts.aliases ?? [],
      zones: opts.zones ?? [],
      positiveExamples: opts.positiveExamples ?? [],
      negativeExamples: opts.negativeExamples ?? [],
      mustHaveKeywords: opts.mustHave ?? [],
      niceToHaveKeywords: opts.niceToHave ?? [],
      excludeKeywords: opts.exclude ?? [],
    },
    ui: (opts.inputType || opts.placeholder || opts.helpText || opts.group) ? {
      inputType: opts.inputType ?? 'text',
      placeholder: opts.placeholder,
      helpText: opts.helpText,
      group: opts.group,
    } : undefined,
  };
}

// ===================================================================
// ENTITY DEFINITIONS — grouped by pillar
// ===================================================================

// ---------------------------------------------------------------------------
// Financial entities  (pillarCode: 'financials')
// ---------------------------------------------------------------------------

const FINANCIAL_ENTITIES: EntityField[] = [
  ef('total_revenue', 'Total Revenue', 'financials', 'currency',
    ['SED-SPEND', 'ESD-SD', 'ESD-ED'],
    'Total annual revenue / turnover of the measured entity for the measurement period.', {
      aliases: ['turnover', 'total revenue', 'annual revenue', 'sales', 'gross revenue', 'income'],
      zones: ['income statement', 'financial summary', 'general info', 'financials'],
      positiveExamples: ['R 150 000 000', '150000000', 'R150,000,000.00'],
      negativeExamples: ['R 0', '-50000000'],
      min: 0, mustHave: ['revenue', 'turnover'], niceToHave: ['annual', 'total', 'gross'], exclude: ['cost', 'expense', 'tax'],
      inputType: 'number', group: 'core_financials',
    }),
  ef('npat', 'NPAT', 'financials', 'currency',
    ['SED-SPEND', 'ESD-SD', 'ESD-ED'],
    'Net profit after tax for the measurement period.', {
      aliases: ['net profit after tax', 'net profit', 'PAT', 'net income', 'profit after tax'],
      zones: ['income statement', 'financial summary', 'general info', 'financials'],
      positiveExamples: ['R 12 000 000', '-5000000'],
      mustHave: ['net profit', 'NPAT', 'PAT'], niceToHave: ['after tax'], exclude: ['gross profit', 'EBITDA'],
      inputType: 'number', group: 'core_financials',
    }),
  ef('leviable_amount', 'Leviable Amount', 'financials', 'currency',
    ['SKILLS-GEN', 'SKILLS-BURS'],
    'Total leviable payroll (salary bill) on which skills development levy is calculated.', {
      aliases: ['payroll', 'total payroll', 'leviable payroll', 'total remuneration', 'salary bill'],
      zones: ['payroll', 'skills', 'financial summary', 'general info', 'financials'],
      positiveExamples: ['R 45 000 000', '45000000'],
      negativeExamples: ['R 0'],
      min: 0, mustHave: ['leviable', 'payroll'], niceToHave: ['remuneration', 'salary'], exclude: ['pension', 'bonus'],
      inputType: 'number', group: 'core_financials',
    }),
  ef('tmps', 'TMPS', 'financials', 'currency',
    ['PROC-EMP', 'PROC-QSE', 'PROC-EME', 'PROC-BO51', 'PROC-BWO30', 'PROC-DG'],
    'Total measured procurement spend for the measurement period.', {
      aliases: ['total measured procurement spend', 'total procurement spend', 'measured procurement'],
      zones: ['procurement', 'financial summary', 'general info', 'TMPS'],
      positiveExamples: ['R 80 000 000', '80000000'],
      negativeExamples: ['R 0'],
      min: 0, mustHave: ['procurement', 'spend'], niceToHave: ['total', 'measured'], exclude: ['import', 'exempt'],
      inputType: 'number', group: 'procurement_financials',
    }),
  ef('financial_year_end', 'Financial Year End', 'financials', 'date', [],
    'End date of the financial year being measured.', {
      aliases: ['FYE', 'year end', 'financial year', 'measurement period end'],
      zones: ['general info', 'client info', 'cover page'],
      positiveExamples: ['2024-03-31', '31 March 2024', '2024/03/31'],
      negativeExamples: ['N/A'],
      mustHave: ['year end', 'financial year'], niceToHave: ['measurement period', 'FYE'], exclude: ['start date'],
      inputType: 'date', group: 'client_info',
    }),
];

// ---------------------------------------------------------------------------
// Ownership entities  (pillarCode: 'ownership')
// ---------------------------------------------------------------------------

const OWNERSHIP_ENTITIES: EntityField[] = [
  ef('shareholder_name', 'Shareholder Name', 'ownership', 'string',
    ['OWN-VR-BLACK', 'OWN-VR-BWO', 'OWN-EI-BLACK', 'OWN-EI-BWO', 'OWN-DG', 'OWN-NE', 'OWN-NV'],
    'Name of each shareholder / equity holder in the measured entity.', {
      aliases: ['shareholder', 'equity holder', 'owner', 'member'],
      zones: ['ownership', 'shareholder register', 'equity schedule'],
      positiveExamples: ['Thabo Investments (Pty) Ltd', 'John Smith'],
      negativeExamples: ['N/A', 'TBC'],
      mustHave: ['shareholder', 'owner'], niceToHave: ['name', 'entity'], exclude: ['employee', 'supplier'],
      inputType: 'text', group: 'shareholder_register',
    }),
  ef('black_ownership_percent', 'Black Ownership Percentage', 'ownership', 'percentage',
    ['OWN-VR-BLACK', 'OWN-EI-BLACK', 'OWN-DG', 'OWN-NV'],
    'Percentage of equity held by black people as defined in the B-BBEE Act.', {
      aliases: ['BO%', 'BO', 'black %', 'HDSA', 'black ownership'],
      zones: ['ownership', 'equity schedule'],
      positiveExamples: ['51%', '0.51', '51.00%'],
      negativeExamples: ['120%', '-5%'],
      min: 0, max: 100, mustHave: ['black', 'ownership'], niceToHave: ['percentage', 'equity', 'HDSA'], exclude: ['employee', 'management'],
      inputType: 'percentage', group: 'shareholder_register',
    }),
  ef('black_women_ownership_percent', 'Black Women Ownership Percentage', 'ownership', 'percentage',
    ['OWN-VR-BWO', 'OWN-EI-BWO'],
    'Percentage of equity held by black women.', {
      aliases: ['BWO%', 'BWO', 'black women %', 'black female ownership'],
      zones: ['ownership', 'equity schedule'],
      positiveExamples: ['30%', '0.30', '30.00%'],
      negativeExamples: ['120%', '-5%'],
      min: 0, max: 100, mustHave: ['black women', 'black female'], niceToHave: ['ownership', 'equity'], exclude: ['employee', 'management'],
      inputType: 'percentage', group: 'shareholder_register',
    }),
  ef('shareholding_percent', 'Shareholding Percentage', 'ownership', 'percentage',
    ['OWN-VR-BLACK', 'OWN-VR-BWO', 'OWN-EI-BLACK', 'OWN-EI-BWO', 'OWN-NV'],
    'Percentage of total shares / equity held by a specific shareholder.', {
      aliases: ['shares %', 'equity %', 'shareholding', 'stake'],
      zones: ['ownership', 'shareholder register'],
      positiveExamples: ['25%', '100%', '0.50'],
      negativeExamples: ['150%', '-10%'],
      min: 0, max: 100, sumsWith: ['shareholding_percent'],
      mustHave: ['share', 'equity'], niceToHave: ['percentage', 'stake', 'holding'], exclude: ['profit share'],
      inputType: 'percentage', group: 'shareholder_register',
    }),
  ef('share_value', 'Share Value', 'ownership', 'currency',
    ['OWN-NV'],
    'Monetary value of shares held by a specific shareholder.', {
      required: false,
      aliases: ['equity value', 'investment value', 'value of shares'],
      zones: ['ownership', 'shareholder register'],
      positiveExamples: ['R 5 000 000', '5000000'],
      negativeExamples: ['R -100'],
      min: 0, mustHave: ['value', 'share'], niceToHave: ['equity', 'investment'], exclude: ['market cap'],
      inputType: 'number', group: 'shareholder_register',
    }),
];

// ---------------------------------------------------------------------------
// Management Control entities  (pillarCode: 'managementControl')
// ---------------------------------------------------------------------------

const MC_ENTITIES: EntityField[] = [
  ef('employee_name', 'Employee Name', 'managementControl', 'string',
    ['MC-BOARD-BLACK', 'MC-BOARD-BWO', 'MC-EXEC-BLACK', 'MC-EXEC-BWO', 'EE-SENIOR', 'EE-MIDDLE', 'EE-JUNIOR', 'EE-DISABLED'],
    'Full name of the employee.', {
      aliases: ['name', 'staff name', 'personnel'],
      zones: ['employee register', 'management', 'staff list', 'MC Data'],
      positiveExamples: ['Sipho Ndlovu', 'Jane Doe'],
      negativeExamples: ['TBC', 'N/A'],
      mustHave: ['name', 'employee'], niceToHave: ['first name', 'surname'], exclude: ['supplier', 'shareholder'],
      inputType: 'text', group: 'employee_register',
    }),
  ef('employee_gender', 'Employee Gender', 'managementControl', 'string',
    ['MC-BOARD-BWO', 'MC-EXEC-BWO', 'EE-SENIOR', 'EE-MIDDLE', 'EE-JUNIOR'],
    'Gender classification of the employee (male / female).', {
      aliases: ['sex', 'M/F', 'gender'],
      zones: ['employee register', 'management', 'EE report', 'MC Data'],
      positiveExamples: ['Male', 'Female', 'M', 'F'],
      negativeExamples: ['Unknown'],
      enumValues: ['Male', 'Female'],
      mustHave: ['gender', 'sex'], niceToHave: ['M/F', 'male', 'female'], exclude: ['age'],
      inputType: 'select', group: 'employee_register',
    }),
  ef('employee_race', 'Employee Race', 'managementControl', 'string',
    ['MC-BOARD-BLACK', 'MC-BOARD-BWO', 'MC-EXEC-BLACK', 'MC-EXEC-BWO', 'EE-SENIOR', 'EE-MIDDLE', 'EE-JUNIOR'],
    'Race / population group of the employee as per EE Act categories.', {
      aliases: ['race group', 'population group', 'demographic', 'race'],
      zones: ['employee register', 'management', 'EE report', 'MC Data'],
      positiveExamples: ['African', 'Coloured', 'Indian', 'White'],
      negativeExamples: ['Other', 'Unknown'],
      enumValues: ['African', 'Coloured', 'Indian', 'White'],
      mustHave: ['race', 'population group'], niceToHave: ['demographic'], exclude: ['nationality'],
      inputType: 'select', group: 'employee_register',
    }),
  ef('employee_designation', 'Employee Designation', 'managementControl', 'string',
    ['MC-BOARD-BLACK', 'MC-BOARD-BWO', 'MC-EXEC-BLACK', 'MC-EXEC-BWO', 'EE-SENIOR', 'EE-MIDDLE', 'EE-JUNIOR'],
    'Occupational level / designation of the employee per the EE Act schedule.', {
      aliases: ['level', 'occupational level', 'position', 'grade', 'designation', 'job title'],
      zones: ['employee register', 'management', 'EE report', 'MC Data'],
      positiveExamples: ['Executive Director', 'Non-executive Director', 'Other Executive Manager', 'Senior Manager', 'Middle Manager', 'Junior Manager', 'Semi-skilled', 'Unskilled'],
      negativeExamples: ['Intern', 'Contractor'],
      enumValues: ['Executive Director', 'Non-executive Director', 'Other Executive Manager', 'Senior Manager', 'Middle Manager', 'Junior Manager', 'Semi-skilled', 'Unskilled'],
      mustHave: ['level', 'designation', 'occupational'], niceToHave: ['position', 'grade'], exclude: ['department'],
      inputType: 'select', group: 'employee_register',
    }),
  ef('employee_disabled', 'Employee Disability Status', 'managementControl', 'boolean',
    ['EE-DISABLED'],
    'Whether the employee is a person with a disability.', {
      required: false,
      aliases: ['disabled', 'PWD', 'disability', 'person with disability'],
      zones: ['employee register', 'management', 'EE report', 'MC Data'],
      positiveExamples: ['Yes', 'No', 'Y', 'N', 'PWD'],
      mustHave: ['disability', 'disabled'], niceToHave: ['PWD'], exclude: ['injury', 'sick leave'],
      inputType: 'toggle', group: 'employee_register',
    }),
];

// ---------------------------------------------------------------------------
// Skills Development entities  (pillarCode: 'skillsDevelopment')
// ---------------------------------------------------------------------------

const SKILLS_ENTITIES: EntityField[] = [
  ef('training_programme_name', 'Training Programme Name', 'skillsDevelopment', 'string',
    ['SKILLS-GEN', 'SKILLS-BURS'],
    'Name or title of the training programme / course.', {
      aliases: ['programme', 'course', 'training name', 'qualification'],
      zones: ['skills', 'training', 'learning interventions', 'Skills Data'],
      positiveExamples: ['NQF Level 4 Business Administration', 'Learnership Programme'],
      negativeExamples: ['N/A'],
      mustHave: ['programme', 'training', 'course'], niceToHave: ['qualification', 'NQF'], exclude: ['supplier'],
      inputType: 'text', group: 'training_register',
    }),
  ef('training_cost', 'Training Cost', 'skillsDevelopment', 'currency',
    ['SKILLS-GEN', 'SKILLS-BURS'],
    'Cost / spend on the training programme.', {
      aliases: ['spend', 'amount', 'cost', 'training spend', 'investment'],
      zones: ['skills', 'training', 'learning interventions', 'Skills Data'],
      positiveExamples: ['R 50 000', '50000', 'R50,000.00'],
      negativeExamples: ['R 0', '-1000'],
      min: 0, mustHave: ['cost', 'spend', 'amount'], niceToHave: ['training', 'investment'], exclude: ['salary', 'payroll'],
      inputType: 'number', group: 'training_register',
    }),
  ef('learner_name', 'Learner Name', 'skillsDevelopment', 'string',
    ['SKILLS-GEN', 'SKILLS-BURS'],
    'Full name of the learner / employee enrolled in the training programme.', {
      aliases: ['learner', 'student', 'trainee', 'participant'],
      zones: ['skills', 'training', 'learning interventions', 'Skills Data'],
      positiveExamples: ['Thandi Mkhize', 'Paul van der Merwe'],
      negativeExamples: ['N/A', 'TBC'],
      mustHave: ['learner', 'name'], niceToHave: ['student', 'trainee'], exclude: ['supplier', 'provider'],
      inputType: 'text', group: 'training_register',
    }),
  ef('learner_employment_status', 'Learner Employment Status', 'skillsDevelopment', 'string',
    ['SKILLS-GEN'],
    'Employment status of the learner (employed / unemployed / learnership).', {
      aliases: ['employment status', 'employed', 'unemployed'],
      zones: ['skills', 'training', 'learning interventions', 'Skills Data'],
      positiveExamples: ['Employed', 'Unemployed', 'Learnership', 'Permanent', 'Fixed-Term'],
      negativeExamples: ['Unknown'],
      enumValues: ['Permanent', 'Fixed-Term', 'Unemployed'],
      mustHave: ['employment', 'status'], niceToHave: ['employed', 'unemployed'], exclude: ['race', 'gender'],
      inputType: 'select', group: 'training_register',
    }),
  ef('learner_race', 'Learner Race Status', 'skillsDevelopment', 'string',
    ['SKILLS-GEN'],
    'Race / population group of the learner.', {
      aliases: ['learner race', 'learner demographic', 'population group'],
      zones: ['skills', 'training', 'learning interventions', 'Skills Data'],
      positiveExamples: ['African', 'Coloured', 'Indian', 'White'],
      negativeExamples: ['Other', 'Unknown'],
      enumValues: ['African', 'Coloured', 'Indian', 'White'],
      mustHave: ['race', 'population group'], niceToHave: ['demographic', 'learner'], exclude: ['nationality'],
      inputType: 'select', group: 'training_register',
    }),
];

// ---------------------------------------------------------------------------
// Preferential Procurement entities  (pillarCode: 'preferentialProcurement')
// ---------------------------------------------------------------------------

const PROCUREMENT_ENTITIES: EntityField[] = [
  ef('supplier_name', 'Supplier Name', 'preferentialProcurement', 'string',
    ['PROC-EMP', 'PROC-QSE', 'PROC-EME', 'PROC-BO51', 'PROC-BWO30', 'PROC-DG'],
    'Registered name of the supplier.', {
      aliases: ['vendor', 'service provider', 'contractor'],
      zones: ['procurement', 'supplier register', 'vendor list', 'Procurement Data'],
      positiveExamples: ['ABC Supplies (Pty) Ltd', 'XYZ Services CC'],
      negativeExamples: ['N/A'],
      mustHave: ['supplier', 'vendor'], niceToHave: ['name', 'provider'], exclude: ['employee', 'shareholder'],
      inputType: 'text', group: 'supplier_register',
    }),
  ef('supplier_bee_level', 'Supplier BEE Level', 'preferentialProcurement', 'bee_level',
    ['PROC-EMP', 'PROC-QSE', 'PROC-EME', 'PROC-BO51', 'PROC-BWO30', 'PROC-DG'],
    'B-BBEE compliance level of the supplier (1–8 or non-compliant).', {
      aliases: ['B-BBEE level', 'compliance level', 'BEE status', 'BBBEE level'],
      zones: ['procurement', 'supplier register', 'Procurement Data'],
      positiveExamples: ['1', '2', '4', '8', 'Level 1', 'Non-compliant'],
      negativeExamples: ['9', '-1', 'Gold'],
      min: 0, max: 8,
      mustHave: ['level', 'B-BBEE', 'BEE'], niceToHave: ['compliance', 'status'], exclude: ['ISO', 'quality'],
      inputType: 'select', group: 'supplier_register',
    }),
  ef('supplier_black_ownership', 'Supplier Black Ownership', 'preferentialProcurement', 'percentage',
    ['PROC-BO51', 'PROC-DG'],
    'Percentage of the supplier that is black owned.', {
      required: false,
      aliases: ['BO%', 'black owned', 'black ownership %'],
      zones: ['procurement', 'supplier register', 'Procurement Data'],
      positiveExamples: ['51%', '100%', '30%'],
      negativeExamples: ['120%', '-5%'],
      min: 0, max: 100, mustHave: ['black', 'ownership'], niceToHave: ['supplier', 'vendor'], exclude: ['employee'],
      inputType: 'percentage', group: 'supplier_register',
    }),
  ef('supplier_spend', 'Supplier Spend', 'preferentialProcurement', 'currency',
    ['PROC-EMP', 'PROC-QSE', 'PROC-EME', 'PROC-BO51', 'PROC-BWO30', 'PROC-DG'],
    'Amount spent with the supplier during the measurement period.', {
      aliases: ['procurement spend', 'amount', 'spend', 'purchase value'],
      zones: ['procurement', 'supplier register', 'Procurement Data'],
      positiveExamples: ['R 1 200 000', '1200000', 'R1,200,000.00'],
      negativeExamples: ['R 0', '-50000'],
      min: 0, mustHave: ['spend', 'amount'], niceToHave: ['procurement', 'purchase'], exclude: ['salary', 'training'],
      inputType: 'number', group: 'supplier_register',
    }),
];

// ---------------------------------------------------------------------------
// Enterprise & Supplier Development entities  (pillarCode: 'enterpriseSupplierDevelopment')
// ---------------------------------------------------------------------------

const ESD_ENTITIES: EntityField[] = [
  ef('esd_beneficiary', 'ESD Beneficiary', 'enterpriseSupplierDevelopment', 'string',
    ['ESD-SD', 'ESD-ED'],
    'Name of the enterprise or supplier beneficiary receiving ESD support.', {
      aliases: ['beneficiary', 'recipient', 'enterprise', 'ESD recipient'],
      zones: ['ESD', 'enterprise development', 'supplier development', 'ESD Data'],
      positiveExamples: ['Bright Future Trading (Pty) Ltd', 'Nkosi Welding CC'],
      negativeExamples: ['N/A'],
      mustHave: ['beneficiary', 'enterprise', 'supplier development'], niceToHave: ['recipient', 'ESD'], exclude: ['employee', 'shareholder'],
      inputType: 'text', group: 'esd_register',
    }),
  ef('esd_contribution_type', 'ESD Contribution Type', 'enterpriseSupplierDevelopment', 'string',
    ['ESD-SD', 'ESD-ED'],
    'Nature of the ESD contribution (grant, loan, guarantee, etc.).', {
      aliases: ['type', 'nature', 'contribution type', 'instrument'],
      zones: ['ESD', 'enterprise development', 'supplier development', 'ESD Data'],
      positiveExamples: ['Grant', 'Loan', 'Guarantee', 'Direct cost', 'Mentorship'],
      negativeExamples: ['Dividend'],
      mustHave: ['type', 'nature', 'contribution'], niceToHave: ['grant', 'loan', 'guarantee'], exclude: ['dividend', 'salary'],
      inputType: 'select', group: 'esd_register',
    }),
  ef('esd_amount', 'ESD Amount', 'enterpriseSupplierDevelopment', 'currency',
    ['ESD-SD', 'ESD-ED'],
    'Monetary value of the ESD contribution.', {
      aliases: ['contribution amount', 'ESD spend', 'amount', 'value'],
      zones: ['ESD', 'enterprise development', 'supplier development', 'ESD Data'],
      positiveExamples: ['R 500 000', '500000'],
      negativeExamples: ['R 0', '-100000'],
      min: 0, mustHave: ['amount', 'value', 'contribution'], niceToHave: ['ESD', 'enterprise'], exclude: ['salary', 'training'],
      inputType: 'number', group: 'esd_register',
    }),
  ef('esd_category', 'ESD Category', 'enterpriseSupplierDevelopment', 'string',
    ['ESD-SD', 'ESD-ED'],
    'Category indicating whether the contribution is enterprise development or supplier development.', {
      aliases: ['supplier development', 'enterprise development', 'ED', 'SD', 'category'],
      zones: ['ESD', 'enterprise development', 'supplier development', 'ESD Data'],
      positiveExamples: ['Enterprise Development', 'Supplier Development', 'ED', 'SD'],
      negativeExamples: ['SED', 'Skills'],
      enumValues: ['Supplier Development', 'Enterprise Development'],
      mustHave: ['category', 'enterprise', 'supplier'], niceToHave: ['development', 'ED', 'SD'], exclude: ['SED', 'socio-economic'],
      inputType: 'select', group: 'esd_register',
    }),
];

// ---------------------------------------------------------------------------
// Socio-Economic Development entities  (pillarCode: 'socioEconomicDevelopment')
// ---------------------------------------------------------------------------

const SED_ENTITIES: EntityField[] = [
  ef('sed_beneficiary', 'SED Beneficiary', 'socioEconomicDevelopment', 'string',
    ['SED-SPEND'],
    'Name of the SED beneficiary organisation or project.', {
      aliases: ['beneficiary', 'recipient', 'organisation', 'project', 'NPO', 'NGO'],
      zones: ['SED', 'socio-economic development', 'CSI', 'SED Data'],
      positiveExamples: ['Thuthuka Foundation', 'Community Education Trust'],
      negativeExamples: ['N/A'],
      mustHave: ['beneficiary', 'recipient'], niceToHave: ['SED', 'CSI', 'NPO', 'NGO'], exclude: ['employee', 'supplier'],
      inputType: 'text', group: 'sed_register',
    }),
  ef('sed_contribution_type', 'SED Contribution Type', 'socioEconomicDevelopment', 'string',
    ['SED-SPEND'],
    'Nature of the SED contribution (monetary, in-kind, time).', {
      aliases: ['type', 'nature', 'contribution type'],
      zones: ['SED', 'socio-economic development', 'CSI', 'SED Data'],
      positiveExamples: ['Monetary', 'In-kind', 'Time of employees'],
      negativeExamples: ['Loan'],
      mustHave: ['type', 'nature', 'contribution'], niceToHave: ['monetary', 'in-kind'], exclude: ['loan', 'guarantee'],
      inputType: 'select', group: 'sed_register',
    }),
  ef('sed_amount', 'SED Amount', 'socioEconomicDevelopment', 'currency',
    ['SED-SPEND'],
    'Monetary value of the SED contribution.', {
      aliases: ['contribution amount', 'SED spend', 'amount', 'donation'],
      zones: ['SED', 'socio-economic development', 'CSI', 'SED Data'],
      positiveExamples: ['R 200 000', '200000'],
      negativeExamples: ['R 0', '-50000'],
      min: 0, mustHave: ['amount', 'value', 'contribution'], niceToHave: ['SED', 'CSI', 'donation'], exclude: ['salary', 'training'],
      inputType: 'number', group: 'sed_register',
    }),
];

// ---------------------------------------------------------------------------
// Sector-specific entities
// ---------------------------------------------------------------------------

const ICT_ENTITIES: EntityField[] = [
  ef('ict_black_owned_spend', 'ICT Black-Owned Spend', 'preferentialProcurement', 'currency',
    ['PROC-BO51'],
    'ICT procurement spend with 51%+ black-owned ICT suppliers.', {
      required: false,
      aliases: ['ICT BO spend', 'black-owned ICT procurement'],
      zones: ['procurement', 'ICT procurement'],
      positiveExamples: ['R 5 000 000'],
      min: 0, mustHave: ['ICT', 'black', 'owned'], niceToHave: ['procurement', 'spend'], exclude: ['general'],
      inputType: 'number', group: 'ict_procurement',
    }),
  ef('third_party_ict_spend', '3rd Party ICT Spend', 'preferentialProcurement', 'currency',
    ['PROC-EMP'],
    'Total spend on 3rd-party ICT products and services.', {
      required: false,
      aliases: ['third party ICT', 'ICT services spend'],
      zones: ['procurement', 'ICT procurement'],
      positiveExamples: ['R 12 000 000'],
      min: 0, mustHave: ['ICT', 'third party'], niceToHave: ['spend', 'services'], exclude: ['internal'],
      inputType: 'number', group: 'ict_procurement',
    }),
];

const FSC_ENTITIES: EntityField[] = [
  ef('access_financial_services', 'Access to Financial Services', 'financialInclusion', 'string',
    [],
    'Initiatives extending financial services access to underserved communities.', {
      required: false,
      aliases: ['financial inclusion', 'access products'],
      zones: ['FSC', 'financial inclusion'],
      positiveExamples: ['Micro-insurance products', 'Low-cost banking'],
      mustHave: ['access', 'financial services'], niceToHave: ['inclusion'], exclude: ['premium'],
    }),
  ef('empowerment_financing_amount', 'Empowerment Financing Amount', 'empowermentFinancing', 'currency',
    [],
    'Total value of empowerment financing provided.', {
      required: false,
      aliases: ['empowerment finance', 'BEE financing'],
      zones: ['FSC', 'empowerment financing'],
      positiveExamples: ['R 50 000 000'],
      min: 0, mustHave: ['empowerment', 'financing'], niceToHave: ['BEE'], exclude: ['general'],
      inputType: 'number',
    }),
  ef('bee_transaction_financing', 'BEE Transaction Financing', 'empowermentFinancing', 'currency',
    [],
    'Financing specifically for B-BBEE ownership transactions.', {
      required: false,
      aliases: ['BEE deal financing', 'ownership transaction finance'],
      zones: ['FSC', 'empowerment financing'],
      positiveExamples: ['R 100 000 000'],
      min: 0, mustHave: ['BEE', 'transaction', 'financing'], niceToHave: ['equity', 'ownership'], exclude: ['working capital'],
      inputType: 'number',
    }),
];

const AGRI_ENTITIES: EntityField[] = [
  ef('land_ownership_black', 'Land Ownership Black', 'ownership', 'percentage',
    ['OWN-VR-BLACK'],
    'Hectares or percentage of agricultural land owned by black people.', {
      required: false,
      aliases: ['black land ownership', 'agricultural land', 'farm ownership'],
      zones: ['ownership', 'land reform', 'agriculture'],
      positiveExamples: ['500 hectares', '30%'],
      min: 0, mustHave: ['land', 'ownership'], niceToHave: ['agricultural', 'hectares'], exclude: ['urban'],
      inputType: 'percentage',
    }),
  ef('agricultural_development_contribution', 'Agricultural Development Contribution', 'enterpriseSupplierDevelopment', 'currency',
    ['ESD-ED'],
    'Contributions towards agricultural development for emerging black farmers.', {
      required: false,
      aliases: ['agri development', 'farmer support'],
      zones: ['agriculture', 'enterprise development'],
      positiveExamples: ['R 2 000 000'],
      min: 0, mustHave: ['agricultural', 'development'], niceToHave: ['farmer'], exclude: ['general'],
      inputType: 'number',
    }),
  ef('farmworker_housing', 'Farmworker Housing', 'socioEconomicDevelopment', 'currency',
    ['SED-SPEND'],
    'Investment in farmworker housing and living conditions improvements.', {
      required: false,
      aliases: ['worker housing', 'farm housing', 'accommodation'],
      zones: ['agriculture', 'housing', 'social development'],
      positiveExamples: ['R 1 500 000'],
      min: 0, mustHave: ['farmworker', 'housing'], niceToHave: ['accommodation'], exclude: ['office'],
      inputType: 'number',
    }),
];

// ===================================================================
// CRITERIA DEFINITIONS — per pillar
// ===================================================================

function ownershipCriteria(cfg: SectorConfig): CriterionEntity[] {
  const t = cfg.targets.ownership;
  return [
    { code: 'OWN-VR-BLACK', name: 'Exercisable voting rights of black people', pillarCode: 'ownership', target: t.votingRightsTarget, maxPoints: t.votingRightsMaxPts, formulaId: 'proportional', inputEntities: ['black_ownership_percent', 'shareholding_percent'], evidenceRequired: ['shareholder register'] },
    { code: 'OWN-VR-BWO', name: 'Exercisable voting rights of black women', pillarCode: 'ownership', target: t.womenVotingTarget, maxPoints: t.womenVotingMaxPts, formulaId: 'proportional', inputEntities: ['black_women_ownership_percent', 'shareholding_percent'], evidenceRequired: ['shareholder register'] },
    { code: 'OWN-EI-BLACK', name: 'Economic interest of black people', pillarCode: 'ownership', target: t.economicInterestTarget, maxPoints: t.economicInterestMaxPts, formulaId: 'graduated', inputEntities: ['black_ownership_percent', 'shareholding_percent'], evidenceRequired: ['shareholder register'] },
    { code: 'OWN-EI-BWO', name: 'Economic interest of black women', pillarCode: 'ownership', target: t.womenEITarget, maxPoints: t.womenEIMaxPts, formulaId: 'proportional', inputEntities: ['black_women_ownership_percent', 'shareholding_percent'], evidenceRequired: ['shareholder register'] },
    { code: 'OWN-DG', name: 'Economic interest of black designated groups', pillarCode: 'ownership', target: 0.10, maxPoints: 3, formulaId: 'proportional', inputEntities: ['black_ownership_percent'], evidenceRequired: ['shareholder register'] },
    { code: 'OWN-NE', name: 'Economic interest of black new entrants', pillarCode: 'ownership', target: 'new_entrant', maxPoints: t.newEntrantsMaxPts, formulaId: 'bonus_flag', inputEntities: ['shareholder_name'], evidenceRequired: ['shareholder register'] },
    { code: 'OWN-NV', name: 'Net value', pillarCode: 'ownership', target: 'complex', maxPoints: t.netValueMaxPts, formulaId: 'net_value', inputEntities: ['share_value', 'black_ownership_percent', 'shareholding_percent'], minimumThreshold: 3.2, evidenceRequired: ['shareholder register', 'company valuation'] },
  ];
}

function mcCriteria(cfg: SectorConfig): CriterionEntity[] {
  const t = cfg.targets.managementControl;
  return [
    { code: 'MC-BOARD-BLACK', name: 'Board participation — black', pillarCode: 'managementControl', target: t.boardBlackTarget, maxPoints: t.boardBlackMaxPts, formulaId: 'proportional', inputEntities: ['employee_name', 'employee_race', 'employee_designation'], evidenceRequired: ['employee register'] },
    { code: 'MC-BOARD-BWO', name: 'Board participation — black women', pillarCode: 'managementControl', target: t.boardBWTarget, maxPoints: t.boardBWMaxPts, formulaId: 'proportional', inputEntities: ['employee_name', 'employee_race', 'employee_gender', 'employee_designation'], evidenceRequired: ['employee register'] },
    { code: 'MC-EXEC-BLACK', name: 'Executive management — black', pillarCode: 'managementControl', target: t.execBlackTarget, maxPoints: t.execBlackMaxPts, formulaId: 'proportional', inputEntities: ['employee_name', 'employee_race', 'employee_designation'], evidenceRequired: ['employee register'] },
    { code: 'MC-EXEC-BWO', name: 'Executive management — black women', pillarCode: 'managementControl', target: t.execBWTarget, maxPoints: t.execBWMaxPts, formulaId: 'proportional', inputEntities: ['employee_name', 'employee_race', 'employee_gender', 'employee_designation'], evidenceRequired: ['employee register'] },
  ];
}

function eeCriteria(cfg: SectorConfig): CriterionEntity[] {
  const t = cfg.targets.employmentEquity;
  return [
    { code: 'EE-SENIOR', name: 'Senior management — black', pillarCode: 'employmentEquity', target: 'EAP', maxPoints: t.seniorMaxPts, formulaId: 'eap_proportional', inputEntities: ['employee_name', 'employee_race', 'employee_designation'], evidenceRequired: ['employee register', 'EAP targets'] },
    { code: 'EE-MIDDLE', name: 'Middle management — black', pillarCode: 'employmentEquity', target: 'EAP', maxPoints: t.middleMaxPts, formulaId: 'eap_proportional', inputEntities: ['employee_name', 'employee_race', 'employee_designation'], evidenceRequired: ['employee register', 'EAP targets'] },
    { code: 'EE-JUNIOR', name: 'Junior management — black', pillarCode: 'employmentEquity', target: 'EAP', maxPoints: t.juniorMaxPts, formulaId: 'eap_proportional', inputEntities: ['employee_name', 'employee_race', 'employee_designation'], evidenceRequired: ['employee register', 'EAP targets'] },
    { code: 'EE-DISABLED', name: 'Employees with disabilities', pillarCode: 'employmentEquity', target: t.disabledTarget, maxPoints: t.disabledMaxPts, formulaId: 'proportional', inputEntities: ['employee_disabled'], evidenceRequired: ['employee register'] },
  ];
}

function skillsCriteria(cfg: SectorConfig): CriterionEntity[] {
  const t = cfg.targets.skills;
  return [
    { code: 'SKILLS-GEN', name: 'Skills development spend — general', pillarCode: 'skillsDevelopment', target: t.overallSpendPercent, maxPoints: t.overallMaxPts, formulaId: 'percent_of_base', inputEntities: ['training_cost', 'leviable_amount', 'learner_race', 'learner_employment_status'], evidenceRequired: ['training records', 'payroll'] },
    { code: 'SKILLS-BURS', name: 'Bursary spend', pillarCode: 'skillsDevelopment', target: t.bursarySpendPercent, maxPoints: t.bursaryMaxPts, formulaId: 'percent_of_base', inputEntities: ['training_cost', 'leviable_amount'], evidenceRequired: ['training records', 'payroll'] },
  ];
}

function procurementCriteria(cfg: SectorConfig): CriterionEntity[] {
  const t = cfg.targets.procurement;
  return [
    { code: 'PROC-EMP', name: 'B-BBEE procurement from empowering suppliers', pillarCode: 'preferentialProcurement', target: t.allSuppliersTarget, maxPoints: t.allSuppliersMaxPts, formulaId: 'percent_of_base', inputEntities: ['supplier_spend', 'supplier_bee_level', 'tmps'], evidenceRequired: ['supplier register'] },
    { code: 'PROC-QSE', name: 'Spend on QSE empowering suppliers', pillarCode: 'preferentialProcurement', target: t.qseTarget, maxPoints: t.qseMaxPts, formulaId: 'percent_of_base', inputEntities: ['supplier_spend', 'tmps'], evidenceRequired: ['supplier register'] },
    { code: 'PROC-EME', name: 'Spend on EME suppliers', pillarCode: 'preferentialProcurement', target: t.emeTarget, maxPoints: t.emeMaxPts, formulaId: 'percent_of_base', inputEntities: ['supplier_spend', 'tmps'], evidenceRequired: ['supplier register'] },
    { code: 'PROC-BO51', name: 'Spend on 51%+ black-owned suppliers', pillarCode: 'preferentialProcurement', target: t.bo51Target, maxPoints: t.bo51MaxPts, formulaId: 'percent_of_base', inputEntities: ['supplier_spend', 'supplier_black_ownership', 'tmps'], evidenceRequired: ['supplier register'] },
    { code: 'PROC-BWO30', name: 'Spend on 30%+ black women-owned suppliers', pillarCode: 'preferentialProcurement', target: t.bwo30Target, maxPoints: t.bwo30MaxPts, formulaId: 'percent_of_base', inputEntities: ['supplier_spend', 'supplier_black_ownership', 'tmps'], evidenceRequired: ['supplier register'] },
    { code: 'PROC-DG', name: 'Spend on designated group suppliers', pillarCode: 'preferentialProcurement', target: 0.12, maxPoints: 2, formulaId: 'percent_of_base', inputEntities: ['supplier_spend', 'supplier_black_ownership', 'tmps'], evidenceRequired: ['supplier register'] },
    { code: 'PROC-GRAD', name: 'Bonus: Graduation of ED beneficiaries', pillarCode: 'preferentialProcurement', target: 'bonus', maxPoints: 1, formulaId: 'bonus_flag', inputEntities: [], bonusCondition: 'ED beneficiaries graduated to supplier development', evidenceRequired: ['graduation evidence'] },
    { code: 'PROC-JOBS', name: 'Bonus: Jobs created', pillarCode: 'preferentialProcurement', target: 'bonus', maxPoints: 1, formulaId: 'bonus_flag', inputEntities: [], bonusCondition: 'Jobs created from ED & SD initiatives', evidenceRequired: ['jobs evidence'] },
  ];
}

function esdCriteria(cfg: SectorConfig): CriterionEntity[] {
  const t = cfg.targets.esd;
  return [
    { code: 'ESD-SD', name: 'Supplier development contributions', pillarCode: 'enterpriseSupplierDevelopment', target: t.sdPercent, maxPoints: t.sdMaxPts, formulaId: 'percent_of_npat', inputEntities: ['esd_amount', 'esd_category', 'npat'], evidenceRequired: ['ESD register'] },
    { code: 'ESD-ED', name: 'Enterprise development contributions', pillarCode: 'enterpriseSupplierDevelopment', target: t.edPercent, maxPoints: t.edMaxPts, formulaId: 'percent_of_npat', inputEntities: ['esd_amount', 'esd_category', 'npat'], evidenceRequired: ['ESD register'] },
    { code: 'ESD-GRAD', name: 'Bonus: Graduation to supplier development', pillarCode: 'enterpriseSupplierDevelopment', target: 'bonus', maxPoints: 1, formulaId: 'bonus_flag', inputEntities: [], bonusCondition: 'Beneficiary graduated', evidenceRequired: ['graduation evidence'] },
    { code: 'ESD-JOBS', name: 'Bonus: Jobs created', pillarCode: 'enterpriseSupplierDevelopment', target: 'bonus', maxPoints: 1, formulaId: 'bonus_flag', inputEntities: [], bonusCondition: 'Jobs created', evidenceRequired: ['jobs evidence'] },
  ];
}

function sedCriteria(cfg: SectorConfig): CriterionEntity[] {
  const t = cfg.targets.sed;
  return [
    { code: 'SED-SPEND', name: 'SED contributions', pillarCode: 'socioEconomicDevelopment', target: t.spendPercent, maxPoints: t.maxPts, formulaId: 'percent_of_npat', inputEntities: ['sed_amount', 'npat'], evidenceRequired: ['SED register'] },
  ];
}

function yesCriteria(): CriterionEntity[] {
  return [
    { code: 'YES-HEADCOUNT', name: 'YES youth headcount target', pillarCode: 'yesInitiative', target: 'size_based', maxPoints: 0, formulaId: 'yes_headcount', inputEntities: [], evidenceRequired: ['YES records'] },
    { code: 'YES-ABSORPTION', name: 'YES absorption rate', pillarCode: 'yesInitiative', target: 0.25, maxPoints: 0, formulaId: 'yes_absorption', inputEntities: [], evidenceRequired: ['YES records'] },
    { code: 'YES-LEVEL', name: 'YES level increase', pillarCode: 'yesInitiative', target: 'tier_based', maxPoints: 0, formulaId: 'yes_tier', inputEntities: [], evidenceRequired: ['YES records'] },
  ];
}

// ===================================================================
// PILLAR PACK BUILDERS
// ===================================================================

function buildOwnershipPack(cfg: SectorConfig): PillarPack {
  const pc = cfg.pillarConfigs.ownership;
  return {
    pillarCode: 'ownership', pillarName: 'Ownership', maxPoints: pc.maxPoints,
    hasSubMinimum: pc.hasSubMinimum, subMinimumThreshold: pc.maxPoints * (pc.subMinimumPercent / 100),
    criteria: ownershipCriteria(cfg), entities: [...OWNERSHIP_ENTITIES],
  };
}

function buildMCPack(cfg: SectorConfig): PillarPack {
  const pc = cfg.pillarConfigs.managementControl;
  return {
    pillarCode: 'managementControl', pillarName: 'Management Control', maxPoints: pc.maxPoints,
    hasSubMinimum: pc.hasSubMinimum, subMinimumThreshold: pc.maxPoints * (pc.subMinimumPercent / 100),
    criteria: mcCriteria(cfg), entities: [...MC_ENTITIES],
  };
}

function buildEEPack(cfg: SectorConfig): PillarPack {
  const pc = cfg.pillarConfigs.employmentEquity ?? { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 };
  return {
    pillarCode: 'employmentEquity', pillarName: 'Employment Equity', maxPoints: pc.maxPoints,
    hasSubMinimum: pc.hasSubMinimum, subMinimumThreshold: pc.maxPoints * (pc.subMinimumPercent / 100),
    criteria: eeCriteria(cfg), entities: [],
  };
}

function buildSkillsPack(cfg: SectorConfig): PillarPack {
  const pc = cfg.pillarConfigs.skillsDevelopment;
  return {
    pillarCode: 'skillsDevelopment', pillarName: 'Skills Development', maxPoints: pc.maxPoints,
    hasSubMinimum: pc.hasSubMinimum, subMinimumThreshold: pc.maxPoints * (pc.subMinimumPercent / 100),
    criteria: skillsCriteria(cfg), entities: [...SKILLS_ENTITIES],
  };
}

function buildProcurementPack(cfg: SectorConfig): PillarPack {
  const pc = cfg.pillarConfigs.preferentialProcurement;
  return {
    pillarCode: 'preferentialProcurement', pillarName: 'Preferential Procurement', maxPoints: pc.maxPoints,
    hasSubMinimum: pc.hasSubMinimum, subMinimumThreshold: pc.maxPoints * (pc.subMinimumPercent / 100),
    criteria: procurementCriteria(cfg), entities: [...PROCUREMENT_ENTITIES],
  };
}

function buildESDPack(cfg: SectorConfig): PillarPack {
  const sd = cfg.pillarConfigs.supplierDevelopment ?? { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 };
  const ed = cfg.pillarConfigs.enterpriseDevelopment ?? { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 };
  const combinedMax = sd.maxPoints + ed.maxPoints;
  return {
    pillarCode: 'enterpriseSupplierDevelopment', pillarName: 'Enterprise & Supplier Development', maxPoints: combinedMax,
    hasSubMinimum: sd.hasSubMinimum || ed.hasSubMinimum, subMinimumThreshold: sd.hasSubMinimum ? sd.maxPoints * (sd.subMinimumPercent / 100) : 0,
    criteria: esdCriteria(cfg), entities: [...ESD_ENTITIES],
  };
}

function buildSEDPack(cfg: SectorConfig): PillarPack {
  const pc = cfg.pillarConfigs.socioEconomicDevelopment;
  return {
    pillarCode: 'socioEconomicDevelopment', pillarName: 'Socio-Economic Development', maxPoints: pc.maxPoints,
    hasSubMinimum: pc.hasSubMinimum, subMinimumThreshold: pc.maxPoints * (pc.subMinimumPercent / 100),
    criteria: sedCriteria(cfg), entities: [...SED_ENTITIES],
  };
}

function buildYESPack(): PillarPack {
  return {
    pillarCode: 'yesInitiative', pillarName: 'YES Initiative', maxPoints: 0,
    hasSubMinimum: false, subMinimumThreshold: 0,
    criteria: yesCriteria(), entities: [],
  };
}

// ===================================================================
// SHEET HINTS
// ===================================================================

const SHEET_HINTS: SheetHint[] = [
  { pattern: '(?i)(client|general|company|info|cover)', mapsTo: 'financials', expectedFields: ['Total Revenue', 'NPAT', 'Leviable Amount', 'TMPS', 'Financial Year End'] },
  { pattern: '(?i)(owner|equity|share\\s?hold)', mapsTo: 'ownership', expectedFields: ['Shareholder Name', 'Black Ownership Percentage', 'Black Women Ownership Percentage', 'Shareholding Percentage', 'Share Value'] },
  { pattern: '(?i)(manage|employee|staff|EE|workforce|personnel)', mapsTo: 'managementControl', expectedFields: ['Employee Name', 'Employee Gender', 'Employee Race', 'Employee Designation', 'Employee Disability Status'] },
  { pattern: '(?i)(skill|train|learn|development)', mapsTo: 'skillsDevelopment', expectedFields: ['Training Programme Name', 'Training Cost', 'Learner Name', 'Learner Employment Status', 'Learner Race Status'] },
  { pattern: '(?i)(procure|supplier|vendor|spend)', mapsTo: 'preferentialProcurement', expectedFields: ['Supplier Name', 'Supplier BEE Level', 'Supplier Black Ownership', 'Supplier Spend'] },
  { pattern: '(?i)(esd|enterprise.*dev|supplier.*dev)', mapsTo: 'enterpriseSupplierDevelopment', expectedFields: ['ESD Beneficiary', 'ESD Contribution Type', 'ESD Amount', 'ESD Category'] },
  { pattern: '(?i)(sed|socio|csi|community)', mapsTo: 'socioEconomicDevelopment', expectedFields: ['SED Beneficiary', 'SED Contribution Type', 'SED Amount'] },
  { pattern: '(?i)(score\\s?card|summary|result|dashboard)', mapsTo: 'scorecard', expectedFields: [] },
];

// ===================================================================
// MAIN BUILDER
// ===================================================================

const SCORECARD_TYPES = [
  { sectorCode: 'RCOGP', scorecardType: 'Generic' },
  { sectorCode: 'ICT', scorecardType: 'Generic' },
  { sectorCode: 'ICT', scorecardType: 'QSE' },
  { sectorCode: 'RCOGP', scorecardType: 'QSE' },
  { sectorCode: 'FSC', scorecardType: 'Generic' },
  { sectorCode: 'AGRI', scorecardType: 'Generic' },
] as const;

/**
 * Build a hierarchical entity manifest for any sector/type combination.
 * This is the single entry point — no legacy alternatives.
 */
export function buildManifest(sectorCode: string, scorecardType: string): EntityManifest {
  const upper = sectorCode.toUpperCase();
  const cfg = getSectorConfig(upper, scorecardType);

  const rootContext: RootContext = {
    sector: upper,
    sectorCodeVersion: 'v1',
    scorecardType: cfg.scorecardType,
    companySize: cfg.scorecardType,
  };

  const isQSE = cfg.scorecardType === 'QSE';
  const pillarPacks: PillarPack[] = [
    // Foundation financial entities go into a virtual "financials" pack
    {
      pillarCode: 'financials', pillarName: 'Financials', maxPoints: 0,
      hasSubMinimum: false, subMinimumThreshold: 0,
      criteria: [], entities: [...FINANCIAL_ENTITIES],
    },
    buildOwnershipPack(cfg),
    buildMCPack(cfg),
    ...(isQSE ? [] : [buildEEPack(cfg)]),
    buildSkillsPack(cfg),
    buildProcurementPack(cfg),
    buildESDPack(cfg),
    buildSEDPack(cfg),
    buildYESPack(),
  ];

  // Add sector-specific entities to the relevant packs
  if (upper === 'ICT') {
    const procPack = pillarPacks.find(p => p.pillarCode === 'preferentialProcurement');
    if (procPack) procPack.entities.push(...ICT_ENTITIES);
  } else if (upper === 'FSC') {
    // FSC entities go into their own pillar packs (or financialInclusion)
    pillarPacks.push({
      pillarCode: 'financialInclusion', pillarName: 'Financial Inclusion (FSC)', maxPoints: 0,
      hasSubMinimum: false, subMinimumThreshold: 0,
      criteria: [], entities: [...FSC_ENTITIES],
    });
  } else if (upper === 'AGRI') {
    const ownPack = pillarPacks.find(p => p.pillarCode === 'ownership');
    const esdPack = pillarPacks.find(p => p.pillarCode === 'enterpriseSupplierDevelopment');
    const sedPack = pillarPacks.find(p => p.pillarCode === 'socioEconomicDevelopment');
    if (ownPack) ownPack.entities.push(AGRI_ENTITIES[0]); // land_ownership_black
    if (esdPack) esdPack.entities.push(AGRI_ENTITIES[1]); // agricultural_development_contribution
    if (sedPack) sedPack.entities.push(AGRI_ENTITIES[2]); // farmworker_housing
  }

  return {
    sectorCode: upper,
    scorecardType,
    rootContext,
    pillarPacks,
    sheetHints: SHEET_HINTS,
    createdAt: new Date().toISOString(),
  };
}

/** Alias for backward compat during consumer migration. */
export const buildManifestForSector = buildManifest;

/** Build RCOGP Generic manifest. */
export function buildRCOGPGenericManifest(): EntityManifest {
  return buildManifest('RCOGP', 'Generic');
}

/** Minimal financial manifest (non-B-BBEE). */
export function buildGenericManifest(): EntityManifest {
  return {
    sectorCode: 'GENERIC',
    scorecardType: 'Financial',
    rootContext: { sector: 'GENERIC', sectorCodeVersion: 'v1', scorecardType: 'Generic', companySize: 'Generic' },
    pillarPacks: [{
      pillarCode: 'financials', pillarName: 'Financials', maxPoints: 0,
      hasSubMinimum: false, subMinimumThreshold: 0, criteria: [],
      entities: [
        ef('revenue', 'Revenue', 'financials', 'currency', [], 'Total revenue / turnover.', {
          aliases: ['turnover', 'total revenue', 'annual revenue', 'sales'],
          zones: ['income statement', 'financial summary'],
          positiveExamples: ['R 150 000 000'], min: 0,
          mustHave: ['revenue', 'turnover'], niceToHave: ['annual', 'total'], exclude: ['cost', 'expense'],
        }),
        ef('profit', 'Profit', 'financials', 'currency', [], 'Net profit for the reporting period.', {
          aliases: ['net profit', 'net income', 'PAT', 'earnings'],
          zones: ['income statement', 'financial summary'],
          positiveExamples: ['R 12 000 000'],
          mustHave: ['profit', 'income'], niceToHave: ['net', 'after tax'], exclude: ['gross profit', 'EBITDA'],
        }),
        ef('expenses', 'Expenses', 'financials', 'currency', [], 'Total expenses.', {
          required: false,
          aliases: ['total expenses', 'costs', 'expenditure'],
          zones: ['income statement', 'financial summary'],
          positiveExamples: ['R 100 000 000'], min: 0,
          mustHave: ['expense', 'cost'], niceToHave: ['operating', 'total'], exclude: ['revenue', 'income'],
        }),
      ],
    }],
    sheetHints: [{ pattern: '(?i)(financial|income|summary|profit)', mapsTo: 'financials', expectedFields: ['Revenue', 'Profit', 'Expenses'] }],
    createdAt: new Date().toISOString(),
  };
}

/** Build a custom manifest from explicit fields and hints. */
export function buildCustomManifest(entities: EntityField[], sheetHints?: SheetHint[]): EntityManifest {
  return {
    sectorCode: 'CUSTOM',
    scorecardType: 'Custom',
    rootContext: { sector: 'CUSTOM', sectorCodeVersion: 'v1', scorecardType: 'Generic', companySize: 'Generic' },
    pillarPacks: [{
      pillarCode: 'custom', pillarName: 'Custom', maxPoints: 0,
      hasSubMinimum: false, subMinimumThreshold: 0, criteria: [], entities,
    }],
    sheetHints: sheetHints ?? [],
    createdAt: new Date().toISOString(),
  };
}

/** Get manifests for all 6 sector types. */
export function getAllManifests(): EntityManifest[] {
  return SCORECARD_TYPES.map(({ sectorCode, scorecardType }) => buildManifest(sectorCode, scorecardType));
}
