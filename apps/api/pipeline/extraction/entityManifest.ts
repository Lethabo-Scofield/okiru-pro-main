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
import { SectorRuleRepository } from '../../arango/repositories/sectorRuleRepository.js';

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
): {
  entityName: string; entityType: string; definition: string;
  aliases: string[]; positiveExamples: string[]; negativeExamples: string[];
  zones: string[]; sourceText: string; sourcePageId: string;
  mustHave: string[]; niceToHave: string[]; exclude: string[];
  pillarCode: string;
} {
  return {
    entityName: field.name,
    entityType: field.fieldType,
    definition: field.extraction.definition,
    aliases: field.extraction.aliases,
    positiveExamples: field.extraction.positiveExamples,
    negativeExamples: field.extraction.negativeExamples,
    zones: field.extraction.zones,
    mustHave: field.extraction.mustHaveKeywords ?? [],
    niceToHave: field.extraction.niceToHaveKeywords ?? [],
    exclude: field.extraction.excludeKeywords ?? [],
    pillarCode: field.pillarCode,
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
// Client Information entities  (pillarCode: 'clientInfo')
// Reference: TOOLKIT_TAB_MAP Section 2.1
// ---------------------------------------------------------------------------

const CLIENT_INFO_ENTITIES: EntityField[] = [
  ef('company_name', 'Company Name', 'clientInfo', 'string', [],
    'Legal entity name of the measured enterprise.', {
      aliases: ['entity name', 'registered name', 'business name'],
      zones: ['client info', 'cover page', 'general info'],
      positiveExamples: ['Acme Holdings (Pty) Ltd', 'FNB Life Insurance Ltd'],
      mustHave: ['company', 'name'], niceToHave: ['entity', 'registered'], exclude: ['trading name'],
      inputType: 'text', group: 'client_info',
    }),
  ef('trading_name', 'Trading Name', 'clientInfo', 'string', [],
    'Trading / DBA name of the measured enterprise.', {
      required: false,
      aliases: ['DBA', 'trading as', 'trade name'],
      zones: ['client info', 'cover page'],
      positiveExamples: ['Acme', 'FNB Life'],
      mustHave: ['trading'], niceToHave: ['name', 'DBA'], exclude: ['registered'],
      inputType: 'text', group: 'client_info',
    }),
  ef('registration_number', 'Registration Number', 'clientInfo', 'string', [],
    'CIPC company registration number.', {
      aliases: ['reg number', 'CK number', 'CIPC number', 'company reg'],
      zones: ['client info', 'cover page'],
      positiveExamples: ['2012/123456/07', '1998/012345/23'],
      mustHave: ['registration', 'number'], niceToHave: ['CIPC', 'CK'], exclude: ['VAT'],
      inputType: 'text', group: 'client_info',
    }),
  ef('vat_number', 'VAT Number', 'clientInfo', 'string', [],
    'SARS VAT registration number.', {
      required: false,
      aliases: ['VAT', 'tax number', 'VAT reg'],
      zones: ['client info', 'cover page'],
      positiveExamples: ['4012345678'],
      mustHave: ['VAT'], niceToHave: ['tax', 'number'], exclude: ['income tax'],
      inputType: 'text', group: 'client_info',
    }),
  ef('sector_code', 'Sector Code', 'clientInfo', 'string', [],
    'B-BBEE sector code applicable to the measured entity.', {
      aliases: ['sector', 'industry code', 'BBEE sector'],
      zones: ['client info', 'cover page'],
      positiveExamples: ['RCOGP', 'ICT', 'FSC', 'AGRI'],
      enumValues: ['RCOGP', 'ICT', 'FSC', 'AGRI'],
      mustHave: ['sector'], niceToHave: ['code'], exclude: ['SIC'],
      inputType: 'select', group: 'client_info',
    }),
  ef('company_size', 'Company Size', 'clientInfo', 'string', [],
    'Company size classification based on annual turnover.', {
      aliases: ['enterprise size', 'EME', 'QSE', 'Generic'],
      zones: ['client info', 'cover page'],
      positiveExamples: ['EME', 'QSE', 'Generic'],
      enumValues: ['EME', 'QSE', 'Generic'],
      mustHave: ['size'], niceToHave: ['company', 'enterprise'], exclude: ['headcount'],
      inputType: 'select', group: 'client_info',
    }),
  ef('annual_turnover', 'Annual Turnover', 'clientInfo', 'currency', [],
    'Total annual turnover (determines company size).', {
      aliases: ['turnover', 'revenue', 'annual revenue'],
      zones: ['client info', 'financials'],
      positiveExamples: ['R 150 000 000', '150000000'],
      min: 0, mustHave: ['turnover'], niceToHave: ['annual', 'revenue'], exclude: ['cost'],
      inputType: 'number', group: 'client_info',
    }),
  ef('headcount', 'Number of Employees', 'clientInfo', 'count', [],
    'Total number of employees of the measured entity.', {
      aliases: ['employee count', 'staff count', 'headcount', 'total employees'],
      zones: ['client info', 'general info', 'HR'],
      positiveExamples: ['250', '1500'],
      min: 0, mustHave: ['employees', 'headcount'], niceToHave: ['total', 'count'], exclude: ['contractors'],
      inputType: 'number', group: 'client_info',
    }),
  ef('contact_person', 'Contact Person', 'clientInfo', 'string', [],
    'Primary contact person for the measured entity.', {
      required: false,
      aliases: ['contact', 'representative', 'point of contact'],
      zones: ['client info', 'cover page'],
      positiveExamples: ['Jane Smith', 'Sipho Ndlovu'],
      mustHave: ['contact'], niceToHave: ['person', 'representative'], exclude: ['shareholder'],
      inputType: 'text', group: 'client_info',
    }),
  ef('contact_email', 'Contact Email', 'clientInfo', 'string', [],
    'Email address of the primary contact.', {
      required: false,
      aliases: ['email', 'e-mail'],
      zones: ['client info', 'cover page'],
      positiveExamples: ['jane@company.co.za'],
      mustHave: ['email'], niceToHave: ['contact'], exclude: ['postal'],
      inputType: 'text', group: 'client_info',
    }),
  ef('contact_phone', 'Contact Phone', 'clientInfo', 'string', [],
    'Phone number of the primary contact.', {
      required: false,
      aliases: ['phone', 'telephone', 'mobile'],
      zones: ['client info', 'cover page'],
      positiveExamples: ['011 123 4567', '+27 82 123 4567'],
      mustHave: ['phone', 'telephone'], niceToHave: ['contact'], exclude: ['fax'],
      inputType: 'text', group: 'client_info',
    }),
  ef('industry', 'Industry', 'clientInfo', 'string', [],
    'Industry classification affecting industry norm lookup.', {
      aliases: ['industry type', 'business type', 'SIC code'],
      zones: ['client info', 'cover page'],
      positiveExamples: ['Retail', 'Manufacturing', 'IT Services'],
      mustHave: ['industry'], niceToHave: ['type', 'classification'], exclude: ['sector code'],
      inputType: 'select', group: 'client_info',
    }),
];

// ---------------------------------------------------------------------------
// Financial entities  (pillarCode: 'financials')
// Reference: TOOLKIT_TAB_MAP Section 2.2 & 2.3
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
    ['SKILLS-LEARNING', 'SKILLS-BURS', 'SKILLS-DISABLED'],
    'Total leviable payroll (salary bill) on which skills development levy is calculated.', {
      aliases: ['payroll', 'total payroll', 'leviable payroll', 'total remuneration', 'salary bill'],
      zones: ['payroll', 'skills', 'financial summary', 'general info', 'financials'],
      positiveExamples: ['R 45 000 000', '45000000'],
      negativeExamples: ['R 0'],
      min: 0, mustHave: ['leviable', 'payroll'], niceToHave: ['remuneration', 'salary'], exclude: ['pension', 'bonus'],
      inputType: 'number', group: 'core_financials',
    }),
  ef('total_payroll', 'Total Payroll', 'financials', 'currency', [],
    'Total payroll / salary bill (cross-check against leviable amount).', {
      required: false,
      aliases: ['salary bill', 'wage bill', 'total salaries'],
      zones: ['payroll', 'financial summary', 'financials'],
      positiveExamples: ['R 50 000 000'],
      min: 0, mustHave: ['payroll', 'salary'], niceToHave: ['total'], exclude: ['leviable'],
      inputType: 'number', group: 'core_financials',
    }),
  ef('tmps_inclusions', 'TMPS Inclusions', 'financials', 'currency',
    ['PROC-EMP', 'PROC-QSE', 'PROC-EME', 'PROC-BO51', 'PROC-BWO30', 'PROC-DG'],
    'Total procurement spend inclusions (cost of sales + operating expenses + capital expenditure + other).', {
      aliases: ['procurement inclusions', 'total inclusions', 'included spend'],
      zones: ['TMPS', 'procurement', 'financials'],
      positiveExamples: ['R 100 000 000'],
      min: 0, mustHave: ['inclusion'], niceToHave: ['TMPS', 'procurement'], exclude: ['exclusion'],
      inputType: 'number', group: 'procurement_financials',
    }),
  ef('tmps_exclusions', 'TMPS Exclusions', 'financials', 'currency',
    ['PROC-EMP', 'PROC-QSE', 'PROC-EME', 'PROC-BO51', 'PROC-BWO30', 'PROC-DG'],
    'Total procurement spend exclusions (imports + salaries + statutory + depreciation + other).', {
      aliases: ['procurement exclusions', 'total exclusions', 'excluded spend'],
      zones: ['TMPS', 'procurement', 'financials'],
      positiveExamples: ['R 20 000 000'],
      min: 0, mustHave: ['exclusion'], niceToHave: ['TMPS', 'procurement'], exclude: ['inclusion'],
      inputType: 'number', group: 'procurement_financials',
    }),
  ef('tmps', 'TMPS', 'financials', 'currency',
    ['PROC-EMP', 'PROC-QSE', 'PROC-EME', 'PROC-BO51', 'PROC-BWO30', 'PROC-DG'],
    'Total measured procurement spend (inclusions minus exclusions).', {
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
  ef('industry_norm', 'Industry Norm', 'financials', 'percentage', [],
    'Industry-specific NPAT norm percentage for deemed NPAT calculation.', {
      required: false,
      aliases: ['norm', 'industry norm', 'NPAT norm', 'deemed norm'],
      zones: ['industry norms', 'financials', 'general info'],
      positiveExamples: ['4%', '6%', '10%'],
      min: 0, max: 100, mustHave: ['norm'], niceToHave: ['industry'], exclude: ['target'],
      inputType: 'percentage', group: 'core_financials',
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
// Employment Equity entities (pillarCode: 'employmentEquity')
// Note: These fields are combined with Management Control in some sectors
// but defined separately for extraction purposes. They map to EE criteria.
// ---------------------------------------------------------------------------

const EE_ENTITIES: EntityField[] = [
  ef('ee_employee_name', 'EE Employee Name', 'employmentEquity', 'string',
    ['EE-SENIOR', 'EE-MIDDLE', 'EE-JUNIOR'],
    'Full name of the employee for Employment Equity reporting.', {
      aliases: ['name', 'employee name', 'staff name'],
      zones: ['EE report', 'employment equity', 'employee register', 'HR'],
      positiveExamples: ['Thandi Mkhize'],
      negativeExamples: ['TBC'],
      mustHave: ['name', 'employee'], niceToHave: ['first name', 'surname'], exclude: ['supplier'],
      inputType: 'text', group: 'ee_register',
    }),
  ef('ee_employee_gender', 'EE Employee Gender', 'employmentEquity', 'string',
    ['EE-SENIOR', 'EE-MIDDLE', 'EE-JUNIOR'],
    'Gender of the employee for EE reporting.', {
      aliases: ['gender', 'sex', 'M/F'],
      zones: ['EE report', 'employment equity', 'HR'],
      positiveExamples: ['Female', 'Male'],
      enumValues: ['Male', 'Female'],
      mustHave: ['gender'], niceToHave: ['sex'], exclude: ['race'],
      inputType: 'select', group: 'ee_register',
    }),
  ef('ee_employee_race', 'EE Employee Race', 'employmentEquity', 'string',
    ['EE-SENIOR', 'EE-MIDDLE', 'EE-JUNIOR', 'EE-DISABLED'],
    'Race classification per EE Act (African, Coloured, Indian).', {
      aliases: ['race group', 'population group', 'demographic'],
      zones: ['EE report', 'employment equity', 'HR'],
      positiveExamples: ['African', 'Coloured', 'Indian'],
      enumValues: ['African', 'Coloured', 'Indian', 'White'],
      mustHave: ['race'], niceToHave: ['population group'], exclude: ['nationality'],
      inputType: 'select', group: 'ee_register',
    }),
  ef('ee_employee_designation', 'EE Employee Designation', 'employmentEquity', 'string',
    ['EE-SENIOR', 'EE-MIDDLE', 'EE-JUNIOR'],
    'Occupational level per EE Act schedule.', {
      aliases: ['level', 'occupational level', 'job grade', 'position'],
      zones: ['EE report', 'employment equity', 'HR'],
      positiveExamples: ['Senior Manager', 'Middle Manager', 'Junior Manager', 'Semi-skilled', 'Unskilled'],
      enumValues: ['Senior Manager', 'Middle Manager', 'Junior Manager', 'Semi-skilled', 'Unskilled', 'Skilled Technical'],
      mustHave: ['designation', 'level'], niceToHave: ['occupational'], exclude: ['department'],
      inputType: 'select', group: 'ee_register',
    }),
  ef('ee_employee_disabled', 'EE Employee Disability Status', 'employmentEquity', 'boolean',
    ['EE-DISABLED'],
    'Whether the employee has a disability per the EE Act definition.', {
      aliases: ['disabled', 'PWD', 'disability status'],
      zones: ['EE report', 'employment equity', 'HR'],
      positiveExamples: ['Yes', 'No'],
      mustHave: ['disability', 'disabled'], niceToHave: ['PWD'], exclude: ['sick leave'],
      inputType: 'toggle', group: 'ee_register',
    }),
];

// ---------------------------------------------------------------------------
// Skills Development entities  (pillarCode: 'skillsDevelopment')
// ---------------------------------------------------------------------------

const SKILLS_ENTITIES: EntityField[] = [
  ef('training_programme_name', 'Training Programme Name', 'skillsDevelopment', 'string',
    ['SKILLS-LEARNING', 'SKILLS-BURS', 'SKILLS-DISABLED', 'SKILLS-LEARNERSHIP', 'SKILLS-ABSORPTION'],
    'Name or title of the training programme / course.', {
      aliases: ['programme', 'course', 'training name', 'qualification'],
      zones: ['skills', 'training', 'learning interventions', 'Skills Data'],
      positiveExamples: ['NQF Level 4 Business Administration', 'Learnership Programme'],
      negativeExamples: ['N/A'],
      mustHave: ['programme', 'training', 'course'], niceToHave: ['qualification', 'NQF'], exclude: ['supplier'],
      inputType: 'text', group: 'training_register',
    }),
  ef('training_category', 'Training Category', 'skillsDevelopment', 'string',
    ['SKILLS-LEARNING', 'SKILLS-BURS', 'SKILLS-LEARNERSHIP'],
    'Training intervention category (A through G) determining weighting.', {
      aliases: ['category', 'category code', 'intervention type'],
      zones: ['skills', 'training', 'Skills Data'],
      positiveExamples: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
      enumValues: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
      mustHave: ['category'], niceToHave: ['training', 'type'], exclude: ['race'],
      inputType: 'select', group: 'training_register',
    }),
  ef('training_is_abet', 'ABET Training', 'skillsDevelopment', 'boolean',
    ['SKILLS-LEARNING'],
    'Whether the training is Adult Basic Education and Training.', {
      required: false,
      aliases: ['ABET', 'adult basic education'],
      zones: ['skills', 'training', 'Skills Data'],
      positiveExamples: ['Yes', 'No'],
      mustHave: ['ABET'], niceToHave: ['adult', 'basic'], exclude: ['mandatory'],
      inputType: 'toggle', group: 'training_register',
    }),
  ef('training_is_mandatory', 'Mandatory Training', 'skillsDevelopment', 'boolean',
    ['SKILLS-LEARNING'],
    'Whether the training is mandatory/statutory.', {
      required: false,
      aliases: ['mandatory', 'statutory training', 'compulsory'],
      zones: ['skills', 'training', 'Skills Data'],
      positiveExamples: ['Yes', 'No'],
      mustHave: ['mandatory'], niceToHave: ['statutory', 'compulsory'], exclude: ['ABET'],
      inputType: 'toggle', group: 'training_register',
    }),
  ef('training_is_bursary', 'Bursary - Higher Education', 'skillsDevelopment', 'boolean',
    ['SKILLS-BURS'],
    'Whether the training is a bursary for higher education.', {
      required: false,
      aliases: ['bursary', 'higher education', 'scholarship'],
      zones: ['skills', 'training', 'Skills Data'],
      positiveExamples: ['Yes', 'No'],
      mustHave: ['bursary'], niceToHave: ['higher education', 'scholarship'], exclude: ['learnership'],
      inputType: 'toggle', group: 'training_register',
    }),
  ef('training_provider', 'Training Provider', 'skillsDevelopment', 'string',
    ['SKILLS-LEARNING', 'SKILLS-BURS'],
    'Name of the accredited training provider.', {
      required: false,
      aliases: ['provider', 'institution', 'training body'],
      zones: ['skills', 'training', 'Skills Data'],
      positiveExamples: ['University of Cape Town', 'SETA Accredited Provider'],
      mustHave: ['provider'], niceToHave: ['institution', 'training'], exclude: ['learner'],
      inputType: 'text', group: 'training_register',
    }),
  ef('training_cost', 'Training Cost', 'skillsDevelopment', 'currency',
    ['SKILLS-LEARNING', 'SKILLS-BURS', 'SKILLS-DISABLED'],
    'Total cost of the training intervention. This is the SUM of all cost components: course_cost + travel_cost + accommodation_cost + meals_cost + stationery_cost + other_cost + salary_cost.', {
      aliases: ['spend', 'amount', 'cost', 'training spend', 'investment'],
      zones: ['skills', 'training', 'learning interventions', 'Skills Data'],
      positiveExamples: ['R 50 000', '50000', 'R50,000.00'],
      negativeExamples: ['R 0', '-1000'],
      min: 0, mustHave: ['cost', 'spend', 'amount'], niceToHave: ['training', 'investment'], exclude: ['salary', 'payroll'],
      inputType: 'number', group: 'training_register',
    }),
  ef('training_course_cost', 'Course Cost', 'skillsDevelopment', 'currency',
    ['SKILLS-LEARNING', 'SKILLS-BURS'],
    'Direct course/tuition cost component.', {
      required: false,
      aliases: ['tuition', 'course fee', 'training fee'],
      zones: ['skills', 'training', 'Skills Data'],
      positiveExamples: ['R 25 000'],
      min: 0, mustHave: ['course', 'cost'], niceToHave: ['tuition', 'fee'], exclude: ['travel'],
      inputType: 'number', group: 'training_costs',
    }),
  ef('training_travel_cost', 'Travel Cost', 'skillsDevelopment', 'currency',
    ['SKILLS-LEARNING'],
    'Travel cost component of training.', {
      required: false,
      aliases: ['travel', 'transport'],
      zones: ['skills', 'training', 'Skills Data'],
      positiveExamples: ['R 5 000'],
      min: 0, mustHave: ['travel'], niceToHave: ['transport'], exclude: ['accommodation'],
      inputType: 'number', group: 'training_costs',
    }),
  ef('training_accommodation_cost', 'Accommodation Cost', 'skillsDevelopment', 'currency',
    ['SKILLS-LEARNING', 'SKILLS-BURS'],
    'Accommodation cost component of training.', {
      required: false,
      aliases: ['accommodation', 'lodging'],
      zones: ['skills', 'training', 'Skills Data'],
      positiveExamples: ['R 3 000'],
      min: 0, mustHave: ['accommodation'], niceToHave: ['lodging'], exclude: ['travel'],
      inputType: 'number', group: 'training_costs',
    }),
  ef('training_meals_cost', 'Meals/Catering Cost', 'skillsDevelopment', 'currency',
    ['SKILLS-LEARNING', 'SKILLS-BURS'],
    'Meals and catering cost component of training.', {
      required: false,
      aliases: ['meals', 'catering', 'food', 'refreshments'],
      zones: ['skills', 'training', 'Skills Data'],
      positiveExamples: ['R 1 500'],
      min: 0, mustHave: ['meals', 'catering'], niceToHave: ['food'], exclude: ['travel'],
      inputType: 'number', group: 'training_costs',
    }),
  ef('training_stationery_cost', 'Stationery/Materials Cost', 'skillsDevelopment', 'currency',
    ['SKILLS-LEARNING', 'SKILLS-BURS'],
    'Stationery, books, and materials cost component of training.', {
      required: false,
      aliases: ['stationery', 'books', 'materials', 'supplies'],
      zones: ['skills', 'training', 'Skills Data'],
      positiveExamples: ['R 800'],
      min: 0, mustHave: ['stationery', 'materials'], niceToHave: ['books', 'supplies'], exclude: ['course'],
      inputType: 'number', group: 'training_costs',
    }),
  ef('training_other_cost', 'Other Training Costs', 'skillsDevelopment', 'currency',
    ['SKILLS-LEARNING', 'SKILLS-BURS'],
    'Other miscellaneous costs associated with training (facility hire, equipment, etc.).', {
      required: false,
      aliases: ['other', 'miscellaneous', 'facility', 'equipment'],
      zones: ['skills', 'training', 'Skills Data'],
      positiveExamples: ['R 2 000'],
      min: 0, mustHave: ['other'], niceToHave: ['miscellaneous', 'facility'], exclude: ['course'],
      inputType: 'number', group: 'training_costs',
    }),
  ef('training_salary_cost', 'Salary Cost', 'skillsDevelopment', 'currency',
    ['SKILLS-LEARNING', 'SKILLS-LEARNERSHIP'],
    'Salary/stipend cost for learnership/apprenticeship/internship participants.', {
      required: false,
      aliases: ['stipend', 'salary', 'wages'],
      zones: ['skills', 'training', 'Skills Data'],
      positiveExamples: ['R 8 000'],
      min: 0, mustHave: ['salary', 'stipend'], niceToHave: ['learner'], exclude: ['payroll'],
      inputType: 'number', group: 'training_costs',
    }),
  ef('learner_name', 'Learner Name', 'skillsDevelopment', 'string',
    ['SKILLS-LEARNING', 'SKILLS-BURS', 'SKILLS-DISABLED', 'SKILLS-LEARNERSHIP', 'SKILLS-ABSORPTION'],
    'Full name of the learner / employee enrolled in the training programme.', {
      aliases: ['learner', 'student', 'trainee', 'participant'],
      zones: ['skills', 'training', 'learning interventions', 'Skills Data'],
      positiveExamples: ['Thandi Mkhize', 'Paul van der Merwe'],
      negativeExamples: ['N/A', 'TBC'],
      mustHave: ['learner', 'name'], niceToHave: ['student', 'trainee'], exclude: ['supplier', 'provider'],
      inputType: 'text', group: 'training_register',
    }),
  ef('learner_id_number', 'Learner ID Number', 'skillsDevelopment', 'string',
    ['SKILLS-LEARNING'],
    'South African ID number of the learner.', {
      required: false,
      aliases: ['ID number', 'identity number', 'SA ID'],
      zones: ['skills', 'training', 'Skills Data'],
      positiveExamples: ['9001015009087'],
      mustHave: ['ID'], niceToHave: ['number', 'identity'], exclude: ['employee number'],
      inputType: 'text', group: 'training_register',
    }),
  ef('learner_gender', 'Learner Gender', 'skillsDevelopment', 'string',
    ['SKILLS-LEARNING', 'SKILLS-DISABLED'],
    'Gender of the learner.', {
      aliases: ['sex', 'M/F', 'gender'],
      zones: ['skills', 'training', 'Skills Data'],
      positiveExamples: ['Male', 'Female'],
      enumValues: ['Male', 'Female'],
      mustHave: ['gender'], niceToHave: ['sex', 'M/F'], exclude: ['race'],
      inputType: 'select', group: 'training_register',
    }),
  ef('learner_race', 'Learner Race', 'skillsDevelopment', 'string',
    ['SKILLS-LEARNING', 'SKILLS-DISABLED', 'SKILLS-LEARNERSHIP', 'SKILLS-ABSORPTION'],
    'Race / population group of the learner.', {
      aliases: ['learner race', 'learner demographic', 'population group'],
      zones: ['skills', 'training', 'learning interventions', 'Skills Data'],
      positiveExamples: ['African', 'Coloured', 'Indian', 'White'],
      negativeExamples: ['Other', 'Unknown'],
      enumValues: ['African', 'Coloured', 'Indian', 'White'],
      mustHave: ['race', 'population group'], niceToHave: ['demographic', 'learner'], exclude: ['nationality'],
      inputType: 'select', group: 'training_register',
    }),
  ef('learner_disabled', 'Learner Disability Status', 'skillsDevelopment', 'boolean',
    ['SKILLS-DISABLED'],
    'Whether the learner has a disability.', {
      aliases: ['disabled', 'PWD', 'disability'],
      zones: ['skills', 'training', 'Skills Data'],
      positiveExamples: ['Yes', 'No'],
      mustHave: ['disabled', 'disability'], niceToHave: ['PWD'], exclude: ['foreign'],
      inputType: 'toggle', group: 'training_register',
    }),
  ef('learner_foreign', 'Learner Foreign Status', 'skillsDevelopment', 'boolean',
    ['SKILLS-LEARNING'],
    'Whether the learner is a foreign national (excluded from B-BBEE calculations).', {
      required: false,
      aliases: ['foreign', 'non-SA', 'foreign national'],
      zones: ['skills', 'training', 'Skills Data'],
      positiveExamples: ['Yes', 'No'],
      mustHave: ['foreign'], niceToHave: ['national'], exclude: ['disabled'],
      inputType: 'toggle', group: 'training_register',
    }),
  ef('learner_employment_status', 'Learner Employment Status', 'skillsDevelopment', 'string',
    ['SKILLS-LEARNING', 'SKILLS-LEARNERSHIP'],
    'Employment status of the learner.', {
      aliases: ['employment status', 'employed', 'unemployed'],
      zones: ['skills', 'training', 'learning interventions', 'Skills Data'],
      positiveExamples: ['Permanent', 'Fixed-Term', 'Unemployed'],
      enumValues: ['Permanent', 'Fixed-Term', 'Unemployed'],
      mustHave: ['employment', 'status'], niceToHave: ['employed', 'unemployed'], exclude: ['race', 'gender'],
      inputType: 'select', group: 'training_register',
    }),
  ef('training_is_yes_employee', 'YES Employee', 'skillsDevelopment', 'boolean',
    ['SKILLS-LEARNERSHIP'],
    'Whether the learner is a YES Initiative participant.', {
      required: false,
      aliases: ['YES', 'YES employee', 'youth employment'],
      zones: ['skills', 'training', 'Skills Data', 'YES'],
      positiveExamples: ['Yes', 'No'],
      mustHave: ['YES'], niceToHave: ['youth', 'employment'], exclude: ['permanent'],
      inputType: 'toggle', group: 'training_register',
    }),
  ef('training_is_completed', 'Training Completed', 'skillsDevelopment', 'boolean',
    ['SKILLS-LEARNING', 'SKILLS-ABSORPTION'],
    'Whether the training programme has been completed.', {
      required: false,
      aliases: ['completed', 'finished', 'passed'],
      zones: ['skills', 'training', 'Skills Data'],
      positiveExamples: ['Yes', 'No'],
      mustHave: ['completed'], niceToHave: ['finished', 'passed'], exclude: ['enrolled'],
      inputType: 'toggle', group: 'training_register',
    }),
  ef('training_is_absorbed', 'Learner Absorbed', 'skillsDevelopment', 'boolean',
    ['SKILLS-ABSORPTION'],
    'Whether the learner was absorbed into permanent employment after learnership/internship.', {
      required: false,
      aliases: ['absorbed', 'permanent hire', 'retention'],
      zones: ['skills', 'training', 'Skills Data'],
      positiveExamples: ['Yes', 'No'],
      mustHave: ['absorbed'], niceToHave: ['permanent', 'hire'], exclude: ['completed'],
      inputType: 'toggle', group: 'training_register',
    }),
  ef('training_start_date', 'Training Start Date', 'skillsDevelopment', 'date',
    ['SKILLS-LEARNING'],
    'Start date of the training programme.', {
      required: false,
      aliases: ['start date', 'commencement', 'began'],
      zones: ['skills', 'training', 'Skills Data'],
      positiveExamples: ['2024-01-15', '15 January 2024'],
      mustHave: ['start'], niceToHave: ['date', 'commencement'], exclude: ['end'],
      inputType: 'date', group: 'training_register',
    }),
  ef('training_end_date', 'Training End Date', 'skillsDevelopment', 'date',
    ['SKILLS-LEARNING'],
    'End date of the training programme.', {
      required: false,
      aliases: ['end date', 'completion date', 'concluded'],
      zones: ['skills', 'training', 'Skills Data'],
      positiveExamples: ['2024-12-31', '31 December 2024'],
      mustHave: ['end'], niceToHave: ['date', 'completion'], exclude: ['start'],
      inputType: 'date', group: 'training_register',
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
  ef('supplier_size', 'Supplier Company Size', 'preferentialProcurement', 'string',
    ['PROC-QSE', 'PROC-EME'],
    'Current company size classification of the supplier.', {
      aliases: ['enterprise type', 'company size', 'supplier size'],
      zones: ['procurement', 'supplier register', 'Procurement Data'],
      positiveExamples: ['Generic', 'QSE', 'EME'],
      enumValues: ['Generic', 'QSE', 'EME'],
      mustHave: ['size'], niceToHave: ['company', 'enterprise'], exclude: ['employee'],
      inputType: 'select', group: 'supplier_register',
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
  ef('supplier_vat', 'Supplier VAT Number', 'preferentialProcurement', 'string',
    [],
    'VAT registration number of the supplier.', {
      required: false,
      aliases: ['VAT', 'tax number', 'VAT reg'],
      zones: ['procurement', 'supplier register', 'Procurement Data'],
      positiveExamples: ['4012345678'],
      mustHave: ['VAT'], niceToHave: ['number'], exclude: ['income tax'],
      inputType: 'text', group: 'supplier_register',
    }),
  ef('supplier_is_empowering', 'Empowering Supplier', 'preferentialProcurement', 'boolean',
    ['PROC-EMP'],
    'Whether the supplier meets the definition of an empowering supplier.', {
      required: false,
      aliases: ['empowering', 'empowering supplier', 'compliant supplier'],
      zones: ['procurement', 'supplier register', 'Procurement Data'],
      positiveExamples: ['Yes', 'No'],
      mustHave: ['empowering'], niceToHave: ['supplier'], exclude: ['enterprise development'],
      inputType: 'toggle', group: 'supplier_register',
    }),
  ef('supplier_is_foreign', 'Foreign Supplier', 'preferentialProcurement', 'boolean',
    ['PROC-ALL', 'PROC-QSE', 'PROC-EME', 'PROC-BO51', 'PROC-BWO30', 'PROC-DG'],
    'Whether the supplier is a foreign (non-South African) entity.', {
      required: false,
      aliases: ['foreign', 'international', 'non-SA', 'import'],
      zones: ['procurement', 'supplier register', 'Procurement Data'],
      positiveExamples: ['Yes', 'No'],
      mustHave: ['foreign'], niceToHave: ['international'], exclude: ['local', 'empowering'],
      inputType: 'toggle', group: 'supplier_register',
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
  ef('supplier_black_women_ownership', 'Supplier Black Women Ownership', 'preferentialProcurement', 'percentage',
    ['PROC-BWO30'],
    'Percentage of the supplier that is black women owned.', {
      required: false,
      aliases: ['BWO%', 'black women owned', 'black female ownership %'],
      zones: ['procurement', 'supplier register', 'Procurement Data'],
      positiveExamples: ['30%', '51%'],
      min: 0, max: 100, mustHave: ['black', 'women', 'ownership'], niceToHave: ['female'], exclude: ['employee'],
      inputType: 'percentage', group: 'supplier_register',
    }),
  ef('supplier_flow_through_ownership', 'Flow-through Black Ownership', 'preferentialProcurement', 'percentage',
    ['PROC-BO51'],
    'Flow-through black ownership percentage for trust or holding structures.', {
      required: false,
      aliases: ['flow-through', 'indirect ownership'],
      zones: ['procurement', 'supplier register', 'Procurement Data'],
      positiveExamples: ['25%', '40%'],
      min: 0, max: 100, mustHave: ['flow-through'], niceToHave: ['ownership'], exclude: ['direct'],
      inputType: 'percentage', group: 'supplier_register',
    }),
  ef('supplier_designated_group_ownership', 'Designated Group Ownership', 'preferentialProcurement', 'percentage',
    ['PROC-DG'],
    'Ownership by designated groups (youth, disabled, military veterans, rural).', {
      required: false,
      aliases: ['designated group', 'DG ownership', 'youth ownership', 'disabled ownership'],
      zones: ['procurement', 'supplier register', 'Procurement Data'],
      positiveExamples: ['10%', '25%'],
      min: 0, max: 100, mustHave: ['designated'], niceToHave: ['group', 'ownership'], exclude: ['standard'],
      inputType: 'percentage', group: 'supplier_register',
    }),
  ef('supplier_is_sd_recipient', 'Supplier Development Recipient', 'preferentialProcurement', 'boolean',
    ['ESD-SD'],
    'Whether the supplier is a supplier development beneficiary.', {
      required: false,
      aliases: ['SD recipient', 'supplier dev recipient'],
      zones: ['procurement', 'supplier register', 'Procurement Data'],
      positiveExamples: ['Yes', 'No'],
      mustHave: ['supplier development', 'recipient'], niceToHave: ['SD'], exclude: ['enterprise'],
      inputType: 'toggle', group: 'supplier_register',
    }),
  ef('supplier_has_3yr_contract', 'Three Year Contract', 'preferentialProcurement', 'boolean',
    ['PROC-EMP'],
    'Whether a 3-year contract is in place with the supplier.', {
      required: false,
      aliases: ['3 year contract', 'long-term contract'],
      zones: ['procurement', 'supplier register', 'Procurement Data'],
      positiveExamples: ['Yes', 'No'],
      mustHave: ['contract'], niceToHave: ['3 year', 'long-term'], exclude: ['monthly'],
      inputType: 'toggle', group: 'supplier_register',
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
  ef('supplier_first_procurement_date', 'Date of First Procurement', 'preferentialProcurement', 'date',
    [],
    'Date of first procurement with this supplier (for growth tracking).', {
      required: false,
      aliases: ['first procurement', 'first order', 'start date'],
      zones: ['procurement', 'supplier register', 'Procurement Data'],
      positiveExamples: ['2020-06-15', '15 June 2020'],
      mustHave: ['first', 'procurement'], niceToHave: ['date'], exclude: ['last'],
      inputType: 'date', group: 'supplier_register',
    }),
  ef('supplier_size_at_first_procurement', 'Size at First Procurement', 'preferentialProcurement', 'string',
    [],
    'Company size when first procured from (for graduation tracking).', {
      required: false,
      aliases: ['original size', 'initial size'],
      zones: ['procurement', 'supplier register', 'Procurement Data'],
      positiveExamples: ['EME', 'QSE'],
      enumValues: ['Generic', 'QSE', 'EME'],
      mustHave: ['size', 'first'], niceToHave: ['procurement'], exclude: ['current'],
      inputType: 'select', group: 'supplier_register',
    }),
  ef('supplier_certificate_expiry', 'Certificate Expiry Date', 'preferentialProcurement', 'date',
    [],
    'Expiry date of the supplier B-BBEE certificate.', {
      required: false,
      aliases: ['certificate expiry', 'BEE certificate expiry', 'expiry date'],
      zones: ['procurement', 'supplier register', 'Procurement Data'],
      positiveExamples: ['2025-03-31', '31 March 2025'],
      mustHave: ['expiry'], niceToHave: ['certificate', 'BEE'], exclude: ['contract'],
      inputType: 'date', group: 'supplier_register',
    }),
  ef('supplier_location', 'Supplier Location', 'preferentialProcurement', 'string',
    [],
    'Geographic location of the supplier.', {
      required: false,
      aliases: ['location', 'province', 'region'],
      zones: ['procurement', 'supplier register', 'Procurement Data'],
      positiveExamples: ['Gauteng', 'Western Cape', 'KwaZulu-Natal'],
      mustHave: ['location'], niceToHave: ['province', 'region'], exclude: ['address'],
      inputType: 'text', group: 'supplier_register',
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
  ef('esd_first_assistance_date', 'Date of First Assistance', 'enterpriseSupplierDevelopment', 'date',
    ['ESD-SD', 'ESD-ED'],
    'Date when the beneficiary was first assisted.', {
      aliases: ['first assistance', 'start date', 'commencement'],
      zones: ['ESD', 'enterprise development', 'supplier development', 'ESD Data'],
      positiveExamples: ['2022-01-15', '15 January 2022'],
      mustHave: ['first', 'assistance'], niceToHave: ['date'], exclude: ['last'],
      inputType: 'date', group: 'esd_register',
    }),
  ef('esd_initial_black_ownership', 'Initial Black Ownership', 'enterpriseSupplierDevelopment', 'percentage',
    ['ESD-SD', 'ESD-ED'],
    'Black ownership percentage of the beneficiary when first assisted.', {
      aliases: ['initial BO%', 'original black ownership'],
      zones: ['ESD', 'enterprise development', 'supplier development', 'ESD Data'],
      positiveExamples: ['51%', '100%'],
      min: 0, max: 100, mustHave: ['initial', 'black', 'ownership'], niceToHave: ['original'], exclude: ['current'],
      inputType: 'percentage', group: 'esd_register',
    }),
  ef('esd_initial_size', 'Initial Company Size', 'enterpriseSupplierDevelopment', 'string',
    ['ESD-SD', 'ESD-ED'],
    'Company size of the beneficiary when first assisted.', {
      aliases: ['initial size', 'original size'],
      zones: ['ESD', 'enterprise development', 'supplier development', 'ESD Data'],
      positiveExamples: ['EME', 'QSE', 'Generic'],
      enumValues: ['Generic', 'QSE', 'EME'],
      mustHave: ['initial', 'size'], niceToHave: ['original'], exclude: ['current'],
      inputType: 'select', group: 'esd_register',
    }),
  ef('esd_current_black_ownership', 'Current Black Ownership', 'enterpriseSupplierDevelopment', 'percentage',
    ['ESD-SD', 'ESD-ED'],
    'Current black ownership percentage of the beneficiary.', {
      aliases: ['current BO%', 'black ownership now'],
      zones: ['ESD', 'enterprise development', 'supplier development', 'ESD Data'],
      positiveExamples: ['60%', '100%'],
      min: 0, max: 100, mustHave: ['current', 'black', 'ownership'], niceToHave: ['now'], exclude: ['initial'],
      inputType: 'percentage', group: 'esd_register',
    }),
  ef('esd_current_size', 'Current Company Size', 'enterpriseSupplierDevelopment', 'string',
    ['ESD-SD', 'ESD-ED'],
    'Current company size of the beneficiary (for graduation tracking).', {
      aliases: ['current size', 'present size'],
      zones: ['ESD', 'enterprise development', 'supplier development', 'ESD Data'],
      positiveExamples: ['QSE', 'Generic'],
      enumValues: ['Generic', 'QSE', 'EME'],
      mustHave: ['current', 'size'], niceToHave: ['present'], exclude: ['initial'],
      inputType: 'select', group: 'esd_register',
    }),
  ef('esd_contribution_description', 'Contribution Description', 'enterpriseSupplierDevelopment', 'string',
    ['ESD-SD', 'ESD-ED'],
    'Description of the ESD contribution.', {
      required: false,
      aliases: ['description', 'details', 'nature of contribution'],
      zones: ['ESD', 'enterprise development', 'supplier development', 'ESD Data'],
      positiveExamples: ['Mentorship programme for emerging farmer'],
      mustHave: ['description'], niceToHave: ['contribution'], exclude: ['beneficiary'],
      inputType: 'text', group: 'esd_register',
    }),
  ef('esd_transaction_date', 'Transaction Date', 'enterpriseSupplierDevelopment', 'date',
    ['ESD-SD', 'ESD-ED'],
    'Date of the ESD transaction.', {
      aliases: ['date', 'transaction date', 'contribution date'],
      zones: ['ESD', 'enterprise development', 'supplier development', 'ESD Data'],
      positiveExamples: ['2024-06-15', '15 June 2024'],
      mustHave: ['date'], niceToHave: ['transaction'], exclude: ['first assistance'],
      inputType: 'date', group: 'esd_register',
    }),
  ef('esd_contribution_type', 'ESD Contribution Type', 'enterpriseSupplierDevelopment', 'string',
    ['ESD-SD', 'ESD-ED'],
    'Nature of the ESD contribution (grant, loan, guarantee, etc.) — determines benefit factor.', {
      aliases: ['type', 'nature', 'contribution type', 'instrument'],
      zones: ['ESD', 'enterprise development', 'supplier development', 'ESD Data'],
      positiveExamples: ['Grant', 'Interest-free loan', 'Standard loan', 'Guarantee', 'Direct cost', 'Discounts', 'Overhead costs', 'Professional services (free)', 'Professional services (discounted)', 'Employee time', 'Minority investment', 'Shorter payment periods', 'Lower interest rate'],
      negativeExamples: ['Dividend'],
      enumValues: ['grant', 'direct_cost', 'discounts', 'overhead_costs', 'interest_free_loan', 'standard_loan', 'guarantees', 'lower_interest_rate', 'minority_investment', 'professional_services_free', 'professional_services_discounted', 'employee_time', 'shorter_payment_periods', 'equity_investment'],
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
  ef('esd_invoice_date', 'Invoice Date', 'enterpriseSupplierDevelopment', 'date',
    ['ESD-SD'],
    'Invoice date (for shorter payment period benefit calculation).', {
      required: false,
      aliases: ['invoice date'],
      zones: ['ESD', 'supplier development', 'ESD Data'],
      positiveExamples: ['2024-05-01'],
      mustHave: ['invoice', 'date'], niceToHave: [], exclude: ['payment'],
      inputType: 'date', group: 'esd_register',
    }),
  ef('esd_payment_date', 'Payment Date', 'enterpriseSupplierDevelopment', 'date',
    ['ESD-SD'],
    'Payment date (for shorter payment period benefit calculation).', {
      required: false,
      aliases: ['payment date', 'settlement date'],
      zones: ['ESD', 'supplier development', 'ESD Data'],
      positiveExamples: ['2024-05-15'],
      mustHave: ['payment', 'date'], niceToHave: ['settlement'], exclude: ['invoice'],
      inputType: 'date', group: 'esd_register',
    }),
  ef('esd_prime_rate', 'Prime Rate', 'enterpriseSupplierDevelopment', 'percentage',
    ['ESD-SD', 'ESD-ED'],
    'Prime lending rate (for lower interest rate benefit calculation).', {
      required: false,
      aliases: ['prime rate', 'prime lending rate'],
      zones: ['ESD', 'enterprise development', 'supplier development', 'ESD Data'],
      positiveExamples: ['11.75%', '10.5%'],
      min: 0, max: 50, mustHave: ['prime', 'rate'], niceToHave: ['lending'], exclude: ['actual'],
      inputType: 'percentage', group: 'esd_register',
    }),
  ef('esd_actual_rate', 'Actual Rate', 'enterpriseSupplierDevelopment', 'percentage',
    ['ESD-SD', 'ESD-ED'],
    'Actual interest rate charged (for lower interest rate benefit calculation).', {
      required: false,
      aliases: ['actual rate', 'charged rate', 'interest rate'],
      zones: ['ESD', 'enterprise development', 'supplier development', 'ESD Data'],
      positiveExamples: ['8%', '0%'],
      min: 0, max: 50, mustHave: ['actual', 'rate'], niceToHave: ['interest', 'charged'], exclude: ['prime'],
      inputType: 'percentage', group: 'esd_register',
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
  ef('sed_description', 'Description of Spend', 'socioEconomicDevelopment', 'string',
    ['SED-SPEND'],
    'Description of the SED contribution/spend.', {
      required: false,
      aliases: ['description', 'spend description', 'details'],
      zones: ['SED', 'socio-economic development', 'CSI', 'SED Data'],
      positiveExamples: ['Scholarship programme for underprivileged youth'],
      mustHave: ['description'], niceToHave: ['spend'], exclude: ['beneficiary'],
      inputType: 'text', group: 'sed_register',
    }),
  ef('sed_transaction_date', 'Transaction Date', 'socioEconomicDevelopment', 'date',
    ['SED-SPEND'],
    'Date of the SED contribution.', {
      aliases: ['date', 'transaction date', 'contribution date'],
      zones: ['SED', 'socio-economic development', 'CSI', 'SED Data'],
      positiveExamples: ['2024-06-15', '15 June 2024'],
      mustHave: ['date'], niceToHave: ['transaction'], exclude: [],
      inputType: 'date', group: 'sed_register',
    }),
  ef('sed_contribution_type', 'SED Contribution Type', 'socioEconomicDevelopment', 'string',
    ['SED-SPEND'],
    'Nature of the SED contribution.', {
      aliases: ['type', 'nature', 'contribution type'],
      zones: ['SED', 'socio-economic development', 'CSI', 'SED Data'],
      positiveExamples: ['Grant contribution', 'Direct cost', 'Discounts', 'Overhead costs', 'Professional services (free)', 'Professional services (discounted)', 'Time of employees'],
      negativeExamples: ['Loan'],
      enumValues: ['grant', 'direct_cost', 'discounts', 'overhead_costs', 'professional_services_free', 'professional_services_discounted', 'employee_time'],
      mustHave: ['type', 'nature', 'contribution'], niceToHave: ['monetary', 'in-kind'], exclude: ['loan', 'guarantee'],
      inputType: 'select', group: 'sed_register',
    }),
  ef('sed_black_benefit_percent', 'Black Benefit Percentage', 'socioEconomicDevelopment', 'percentage',
    ['SED-SPEND'],
    'Percentage of the SED spend that benefits black individuals.', {
      aliases: ['black benefit %', 'benefit percentage'],
      zones: ['SED', 'socio-economic development', 'CSI', 'SED Data'],
      positiveExamples: ['75%', '100%'],
      min: 0, max: 100, mustHave: ['black', 'benefit'], niceToHave: ['percentage'], exclude: ['ownership'],
      inputType: 'percentage', group: 'sed_register',
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
  ef('sed_province', 'Province', 'socioEconomicDevelopment', 'string',
    ['SED-SPEND'],
    'Province where the SED contribution applies.', {
      required: false,
      aliases: ['province', 'region'],
      zones: ['SED', 'socio-economic development', 'CSI', 'SED Data'],
      positiveExamples: ['Gauteng', 'Western Cape', 'Eastern Cape'],
      mustHave: ['province'], niceToHave: ['region'], exclude: ['country'],
      inputType: 'select', group: 'sed_register',
    }),
  ef('sed_african_male_beneficiaries', 'African Male Beneficiaries', 'socioEconomicDevelopment', 'count',
    ['SED-SPEND'],
    'Number of African male beneficiaries.', {
      required: false,
      aliases: ['African male', 'AM beneficiaries'],
      zones: ['SED', 'SED Data'],
      positiveExamples: ['50', '200'],
      min: 0, mustHave: ['African', 'male'], niceToHave: ['beneficiaries'], exclude: ['female'],
      inputType: 'number', group: 'sed_demographics',
    }),
  ef('sed_african_female_beneficiaries', 'African Female Beneficiaries', 'socioEconomicDevelopment', 'count',
    ['SED-SPEND'],
    'Number of African female beneficiaries.', {
      required: false,
      aliases: ['African female', 'AF beneficiaries'],
      zones: ['SED', 'SED Data'],
      positiveExamples: ['60', '250'],
      min: 0, mustHave: ['African', 'female'], niceToHave: ['beneficiaries'], exclude: ['male'],
      inputType: 'number', group: 'sed_demographics',
    }),
  ef('sed_coloured_male_beneficiaries', 'Coloured Male Beneficiaries', 'socioEconomicDevelopment', 'count',
    ['SED-SPEND'],
    'Number of Coloured male beneficiaries.', {
      required: false,
      aliases: ['Coloured male', 'CM beneficiaries'],
      zones: ['SED', 'SED Data'],
      positiveExamples: ['20'],
      min: 0, mustHave: ['Coloured', 'male'], niceToHave: ['beneficiaries'], exclude: ['female'],
      inputType: 'number', group: 'sed_demographics',
    }),
  ef('sed_coloured_female_beneficiaries', 'Coloured Female Beneficiaries', 'socioEconomicDevelopment', 'count',
    ['SED-SPEND'],
    'Number of Coloured female beneficiaries.', {
      required: false,
      aliases: ['Coloured female', 'CF beneficiaries'],
      zones: ['SED', 'SED Data'],
      positiveExamples: ['25'],
      min: 0, mustHave: ['Coloured', 'female'], niceToHave: ['beneficiaries'], exclude: ['male'],
      inputType: 'number', group: 'sed_demographics',
    }),
  ef('sed_indian_male_beneficiaries', 'Indian Male Beneficiaries', 'socioEconomicDevelopment', 'count',
    ['SED-SPEND'],
    'Number of Indian male beneficiaries.', {
      required: false,
      aliases: ['Indian male', 'IM beneficiaries'],
      zones: ['SED', 'SED Data'],
      positiveExamples: ['15'],
      min: 0, mustHave: ['Indian', 'male'], niceToHave: ['beneficiaries'], exclude: ['female'],
      inputType: 'number', group: 'sed_demographics',
    }),
  ef('sed_indian_female_beneficiaries', 'Indian Female Beneficiaries', 'socioEconomicDevelopment', 'count',
    ['SED-SPEND'],
    'Number of Indian female beneficiaries.', {
      required: false,
      aliases: ['Indian female', 'IF beneficiaries'],
      zones: ['SED', 'SED Data'],
      positiveExamples: ['18'],
      min: 0, mustHave: ['Indian', 'female'], niceToHave: ['beneficiaries'], exclude: ['male'],
      inputType: 'number', group: 'sed_demographics',
    }),
];

// ---------------------------------------------------------------------------
// YES Initiative entities (pillarCode: 'yesInitiative')
// ---------------------------------------------------------------------------

const YES_ENTITIES: EntityField[] = [
  ef('yes_participant_name', 'YES Participant Name', 'yesInitiative', 'string',
    ['YES-HEADCOUNT', 'YES-ABSORPTION'],
    'Full name of the YES initiative participant.', {
      aliases: ['YES name', 'participant name', 'youth name'],
      zones: ['YES', 'YES Data', 'youth employment'],
      positiveExamples: ['Thabo Mokoena'],
      negativeExamples: ['TBC'],
      mustHave: ['name', 'participant'], niceToHave: ['YES', 'youth'], exclude: ['employee'],
      inputType: 'text', group: 'yes_register',
    }),
  ef('yes_participant_id', 'YES Participant ID', 'yesInitiative', 'string',
    ['YES-HEADCOUNT'],
    'South African ID number of the YES participant.', {
      aliases: ['YES ID', 'RSA ID', 'ID number'],
      zones: ['YES', 'YES Data'],
      positiveExamples: ['9801015009087'],
      mustHave: ['ID'], niceToHave: ['RSA', 'identity'], exclude: ['passport'],
      inputType: 'text', group: 'yes_register',
    }),
  ef('yes_participant_age', 'YES Participant Age', 'yesInitiative', 'count',
    ['YES-HEADCOUNT'],
    'Age of the YES participant (must be 18-35 for YES eligibility).', {
      aliases: ['age', 'youth age'],
      zones: ['YES', 'YES Data'],
      positiveExamples: ['25', '30'],
      min: 18, max: 35,
      mustHave: ['age'], niceToHave: ['youth'], exclude: ['experience'],
      inputType: 'number', group: 'yes_register',
    }),
  ef('yes_start_date', 'YES Start Date', 'yesInitiative', 'date',
    ['YES-HEADCOUNT'],
    'Start date of the YES placement.', {
      aliases: ['start date', 'commencement date', 'placement start'],
      zones: ['YES', 'YES Data'],
      positiveExamples: ['2024-01-15'],
      mustHave: ['start', 'date'], niceToHave: ['YES', 'placement'], exclude: ['end'],
      inputType: 'date', group: 'yes_register',
    }),
  ef('yes_end_date', 'YES End Date', 'yesInitiative', 'date',
    ['YES-HEADCOUNT'],
    'End/termination date of the YES placement.', {
      aliases: ['end date', 'completion date', 'termination date'],
      zones: ['YES', 'YES Data'],
      positiveExamples: ['2024-12-31'],
      mustHave: ['end', 'date'], niceToHave: ['completion'], exclude: ['start'],
      inputType: 'date', group: 'yes_register',
    }),
  ef('yes_is_absorbed', 'YES Participant Absorbed', 'yesInitiative', 'boolean',
    ['YES-ABSORPTION'],
    'Whether the YES participant was absorbed into permanent employment.', {
      aliases: ['absorbed', 'permanent employment', 'retained'],
      zones: ['YES', 'YES Data'],
      positiveExamples: ['Yes', 'No'],
      mustHave: ['absorbed', 'employment'], niceToHave: ['permanent', 'retained'], exclude: ['terminated'],
      inputType: 'toggle', group: 'yes_register',
    }),
  ef('yes_months_retained', 'YES Months Retained', 'yesInitiative', 'count',
    ['YES-ABSORPTION'],
    'Number of months the participant was retained in the programme.', {
      aliases: ['months retained', 'retention period', 'duration'],
      zones: ['YES', 'YES Data'],
      positiveExamples: ['12', '6'],
      min: 0, max: 24,
      mustHave: ['months', 'retained'], niceToHave: ['duration'], exclude: ['salary'],
      inputType: 'number', group: 'yes_register',
    }),
  ef('yes_company_size', 'YES Host Company Size', 'yesInitiative', 'string',
    ['YES-HEADCOUNT'],
    'Company size classification of the YES host employer.', {
      aliases: ['company size', 'host size'],
      zones: ['YES', 'YES Data'],
      positiveExamples: ['EME', 'QSE', 'Generic'],
      enumValues: ['EME', 'QSE', 'Generic'],
      mustHave: ['size', 'company'], niceToHave: ['host'], exclude: ['type'],
      inputType: 'select', group: 'yes_register',
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
  const t = cfg.targets?.ownership ?? {
    votingRightsTarget: 0.25, votingRightsMaxPts: 4,
    womenVotingTarget: 0.10, womenVotingMaxPts: 4,
    economicInterestTarget: 0.25, economicInterestMaxPts: 5,
    womenEITarget: 0.10, womenEIMaxPts: 3,
    newEntrantsMaxPts: 2, netValueMaxPts: 7,
  };
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
  const t = cfg.targets?.managementControl ?? {
    boardBlackTarget: 0.50, boardBlackMaxPts: 3,
    boardBWTarget: 0.20, boardBWMaxPts: 3,
    execBlackTarget: 0.50, execBlackMaxPts: 4,
    execBWTarget: 0.20, execBWMaxPts: 3,
  };
  const criteria: CriterionEntity[] = [
    { code: 'MC-BOARD-BLACK', name: 'Board participation — black', pillarCode: 'managementControl', target: t.boardBlackTarget, maxPoints: t.boardBlackMaxPts, formulaId: 'proportional', inputEntities: ['employee_name', 'employee_race', 'employee_designation'], evidenceRequired: ['employee register'] },
    { code: 'MC-BOARD-BWO', name: 'Board participation — black women', pillarCode: 'managementControl', target: t.boardBWTarget, maxPoints: t.boardBWMaxPts, formulaId: 'proportional', inputEntities: ['employee_name', 'employee_race', 'employee_gender', 'employee_designation'], evidenceRequired: ['employee register'] },
    { code: 'MC-EXEC-BLACK', name: 'Executive management — black', pillarCode: 'managementControl', target: t.execBlackTarget, maxPoints: t.execBlackMaxPts, formulaId: 'proportional', inputEntities: ['employee_name', 'employee_race', 'employee_designation'], evidenceRequired: ['employee register'] },
    { code: 'MC-EXEC-BWO', name: 'Executive management — black women', pillarCode: 'managementControl', target: t.execBWTarget, maxPoints: t.execBWMaxPts, formulaId: 'proportional', inputEntities: ['employee_name', 'employee_race', 'employee_gender', 'employee_designation'], evidenceRequired: ['employee register'] },
  ];
  if (t.otherExecBlackMaxPts) {
    criteria.push(
      { code: 'MC-OEXEC-BLACK', name: 'Other executive management — black', pillarCode: 'managementControl', target: t.otherExecBlackTarget, maxPoints: t.otherExecBlackMaxPts, formulaId: 'proportional', inputEntities: ['employee_name', 'employee_race', 'employee_designation'], evidenceRequired: ['employee register'] },
      { code: 'MC-OEXEC-BWO', name: 'Other executive management — black women', pillarCode: 'managementControl', target: t.otherExecBWTarget, maxPoints: t.otherExecBWMaxPts, formulaId: 'proportional', inputEntities: ['employee_name', 'employee_race', 'employee_gender', 'employee_designation'], evidenceRequired: ['employee register'] },
    );
  }
  return criteria;
}

function eeCriteria(cfg: SectorConfig): CriterionEntity[] {
  const t = cfg.targets?.employmentEquity ?? {
    seniorMaxPts: 3, middleMaxPts: 3, juniorMaxPts: 3,
    disabledTarget: 0.02, disabledMaxPts: 3,
  };
  const mc = cfg.targets?.managementControl;
  const seniorBWMaxPts = mc?.seniorBWMaxPts ?? 0;
  const middleBWMaxPts = mc?.middleBWMaxPts ?? 0;
  const juniorBWMaxPts = mc?.juniorBWMaxPts ?? 0;
  const criteria: CriterionEntity[] = [
    { code: 'EE-SENIOR', name: 'Senior management — black', pillarCode: 'employmentEquity', target: 'EAP', maxPoints: t.seniorMaxPts, formulaId: 'eap_proportional', inputEntities: ['employee_name', 'employee_race', 'employee_designation'], evidenceRequired: ['employee register', 'EAP targets'] },
    { code: 'EE-MIDDLE', name: 'Middle management — black', pillarCode: 'employmentEquity', target: 'EAP', maxPoints: t.middleMaxPts, formulaId: 'eap_proportional', inputEntities: ['employee_name', 'employee_race', 'employee_designation'], evidenceRequired: ['employee register', 'EAP targets'] },
    { code: 'EE-JUNIOR', name: 'Junior management — black', pillarCode: 'employmentEquity', target: 'EAP', maxPoints: t.juniorMaxPts, formulaId: 'eap_proportional', inputEntities: ['employee_name', 'employee_race', 'employee_designation'], evidenceRequired: ['employee register', 'EAP targets'] },
    { code: 'EE-DISABLED', name: 'Employees with disabilities', pillarCode: 'employmentEquity', target: t.disabledTarget, maxPoints: t.disabledMaxPts, formulaId: 'proportional', inputEntities: ['employee_disabled'], evidenceRequired: ['employee register'] },
  ];
  if (seniorBWMaxPts > 0) {
    criteria.push({ code: 'EE-SENIOR-BWO', name: 'Senior management — black women', pillarCode: 'employmentEquity', target: 'EAP', maxPoints: seniorBWMaxPts, formulaId: 'eap_proportional', inputEntities: ['employee_name', 'employee_race', 'employee_gender', 'employee_designation'], evidenceRequired: ['employee register', 'EAP targets'] });
  }
  if (middleBWMaxPts > 0) {
    criteria.push({ code: 'EE-MIDDLE-BWO', name: 'Middle management — black women', pillarCode: 'employmentEquity', target: 'EAP', maxPoints: middleBWMaxPts, formulaId: 'eap_proportional', inputEntities: ['employee_name', 'employee_race', 'employee_gender', 'employee_designation'], evidenceRequired: ['employee register', 'EAP targets'] });
  }
  if (juniorBWMaxPts > 0) {
    criteria.push({ code: 'EE-JUNIOR-BWO', name: 'Junior management — black women', pillarCode: 'employmentEquity', target: 'EAP', maxPoints: juniorBWMaxPts, formulaId: 'eap_proportional', inputEntities: ['employee_name', 'employee_race', 'employee_gender', 'employee_designation'], evidenceRequired: ['employee register', 'EAP targets'] });
  }
  return criteria;
}

function skillsCriteria(cfg: SectorConfig): CriterionEntity[] {
  const t = cfg.targets?.skills ?? {
    overallSpendPercent: 0.025, learningProgrammesMaxPts: 6,
    bursarySpendPercent: 0.0025, bursaryMaxPts: 5,
    disabledSpendPercent: 0.0003, disabledLearningMaxPts: 2,
    learnershipTargetPercent: 0.025, learnershipsMaxPts: 1,
    absorptionTargetPercent: 0.50, absorptionMaxPts: 1,
  };
  return [
    { code: 'SKILLS-LEARNING', name: 'Expenditure on learning programmes for black people', pillarCode: 'skillsDevelopment', target: t.overallSpendPercent, maxPoints: t.learningProgrammesMaxPts, formulaId: 'percent_of_base', inputEntities: ['training_cost', 'leviable_amount', 'learner_race', 'learner_employment_status', 'training_category'], evidenceRequired: ['training records', 'payroll'] },
    { code: 'SKILLS-BURS', name: 'Expenditure on bursaries for black students', pillarCode: 'skillsDevelopment', target: t.bursarySpendPercent, maxPoints: t.bursaryMaxPts, formulaId: 'percent_of_base', inputEntities: ['training_cost', 'leviable_amount', 'training_is_bursary'], evidenceRequired: ['training records', 'payroll'] },
    { code: 'SKILLS-DISABLED', name: 'Expenditure on learning programmes for disabled black employees', pillarCode: 'skillsDevelopment', target: t.disabledSpendPercent, maxPoints: t.disabledLearningMaxPts, formulaId: 'percent_of_base', inputEntities: ['training_cost', 'leviable_amount', 'learner_disabled'], evidenceRequired: ['training records', 'payroll'] },
    { code: 'SKILLS-LEARNERSHIP', name: 'Number of black people in learnerships, apprenticeships or internships', pillarCode: 'skillsDevelopment', target: t.learnershipTargetPercent, maxPoints: t.learnershipsMaxPts, formulaId: 'headcount_target', inputEntities: ['learner_name', 'learner_race', 'training_category'], evidenceRequired: ['training records', 'learnership agreements'] },
    { code: 'SKILLS-ABSORPTION', name: 'Absorption of black people after learnerships/apprenticeships/internships', pillarCode: 'skillsDevelopment', target: t.absorptionTargetPercent, maxPoints: t.absorptionMaxPts, formulaId: 'absorption_rate', inputEntities: ['learner_name', 'learner_race', 'training_is_absorbed'], evidenceRequired: ['training records', 'employment contracts'] },
  ];
}

function procurementCriteria(cfg: SectorConfig): CriterionEntity[] {
  const t = cfg.targets?.procurement ?? {
    allSuppliersTarget: 0.80, allSuppliersMaxPts: 12,
    qseTarget: 0.15, qseMaxPts: 5,
    emeTarget: 0.15, emeMaxPts: 4,
    bo51Target: 0.40, bo51MaxPts: 3,
    bwo30Target: 0.12, bwo30MaxPts: 1,
    dgTarget: 0.12, dgMaxPts: 1,
  };
  return [
    { code: 'PROC-EMP', name: 'B-BBEE procurement from empowering suppliers', pillarCode: 'preferentialProcurement', target: t.allSuppliersTarget, maxPoints: t.allSuppliersMaxPts, formulaId: 'percent_of_base', inputEntities: ['supplier_spend', 'supplier_bee_level', 'tmps'], evidenceRequired: ['supplier register'] },
    { code: 'PROC-QSE', name: 'Spend on QSE empowering suppliers', pillarCode: 'preferentialProcurement', target: t.qseTarget, maxPoints: t.qseMaxPts, formulaId: 'percent_of_base', inputEntities: ['supplier_spend', 'tmps'], evidenceRequired: ['supplier register'] },
    { code: 'PROC-EME', name: 'Spend on EME suppliers', pillarCode: 'preferentialProcurement', target: t.emeTarget, maxPoints: t.emeMaxPts, formulaId: 'percent_of_base', inputEntities: ['supplier_spend', 'tmps'], evidenceRequired: ['supplier register'] },
    { code: 'PROC-BO51', name: 'Spend on 51%+ black-owned suppliers', pillarCode: 'preferentialProcurement', target: t.bo51Target, maxPoints: t.bo51MaxPts, formulaId: 'percent_of_base', inputEntities: ['supplier_spend', 'supplier_black_ownership', 'tmps'], evidenceRequired: ['supplier register'] },
    { code: 'PROC-BWO30', name: 'Spend on 30%+ black women-owned suppliers', pillarCode: 'preferentialProcurement', target: t.bwo30Target, maxPoints: t.bwo30MaxPts, formulaId: 'percent_of_base', inputEntities: ['supplier_spend', 'supplier_black_ownership', 'tmps'], evidenceRequired: ['supplier register'] },
    { code: 'PROC-DG', name: 'Spend on designated group suppliers', pillarCode: 'preferentialProcurement', target: t.dgTarget, maxPoints: t.dgMaxPts, formulaId: 'percent_of_base', inputEntities: ['supplier_spend', 'supplier_black_ownership', 'tmps'], evidenceRequired: ['supplier register'] },
  ];
}

function esdCriteria(cfg: SectorConfig): CriterionEntity[] {
  const t = cfg.targets?.esd ?? { sdPercent: 0.01, sdMaxPts: 5, edPercent: 0.01, edMaxPts: 5 };
  return [
    { code: 'ESD-SD', name: 'Supplier development contributions', pillarCode: 'enterpriseSupplierDevelopment', target: t.sdPercent, maxPoints: t.sdMaxPts, formulaId: 'percent_of_npat', inputEntities: ['esd_amount', 'esd_category', 'npat'], evidenceRequired: ['ESD register'] },
    { code: 'ESD-ED', name: 'Enterprise development contributions', pillarCode: 'enterpriseSupplierDevelopment', target: t.edPercent, maxPoints: t.edMaxPts, formulaId: 'percent_of_npat', inputEntities: ['esd_amount', 'esd_category', 'npat'], evidenceRequired: ['ESD register'] },
    { code: 'ESD-GRAD', name: 'Bonus: Graduation to supplier development', pillarCode: 'enterpriseSupplierDevelopment', target: 'bonus', maxPoints: 1, formulaId: 'bonus_flag', inputEntities: [], bonusCondition: 'Beneficiary graduated', evidenceRequired: ['graduation evidence'] },
    { code: 'ESD-JOBS', name: 'Bonus: Jobs created', pillarCode: 'enterpriseSupplierDevelopment', target: 'bonus', maxPoints: 1, formulaId: 'bonus_flag', inputEntities: [], bonusCondition: 'Jobs created', evidenceRequired: ['jobs evidence'] },
  ];
}

function sedCriteria(cfg: SectorConfig): CriterionEntity[] {
  const t = cfg.targets?.sed ?? { spendPercent: 0.01, maxPts: 5 };
  return [
    { code: 'SED-SPEND', name: 'SED contributions', pillarCode: 'socioEconomicDevelopment', target: t.spendPercent, maxPoints: t.maxPts, formulaId: 'percent_of_npat', inputEntities: ['sed_amount', 'npat'], evidenceRequired: ['SED register'] },
  ];
}

// ===================================================================
// PILLAR PACK BUILDERS
// ===================================================================

function buildOwnershipPack(cfg: SectorConfig): PillarPack {
  const pc = cfg.pillarConfigs?.ownership ?? { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 };
  return {
    pillarCode: 'ownership', pillarName: 'Ownership', maxPoints: pc.maxPoints,
    hasSubMinimum: pc.hasSubMinimum ?? true, subMinimumThreshold: pc.maxPoints * ((pc.subMinimumPercent ?? 40) / 100),
    criteria: ownershipCriteria(cfg), entities: [...OWNERSHIP_ENTITIES],
  };
}

function buildMCPack(cfg: SectorConfig): PillarPack {
  const pc = cfg.pillarConfigs?.managementControl ?? { maxPoints: 19, hasSubMinimum: false, subMinimumPercent: 0 };
  // For sectors that combine MC+EE, include EE entities in the MC pack
  const eePc = cfg.pillarConfigs?.employmentEquity;
  const isMCPlusEECombined = !eePc || eePc.maxPoints === 0 || eePc.maxPoints === undefined;
  const combinedEntities = isMCPlusEECombined
    ? [...MC_ENTITIES, ...EE_ENTITIES]
    : [...MC_ENTITIES];
  const combinedCriteria = isMCPlusEECombined
    ? [...mcCriteria(cfg), ...eeCriteria(cfg).map(c => ({ ...c, pillarCode: 'managementControl' as const }))]
    : mcCriteria(cfg);
  return {
    pillarCode: 'managementControl', pillarName: 'Management Control', maxPoints: pc.maxPoints,
    hasSubMinimum: pc.hasSubMinimum ?? true, subMinimumThreshold: pc.maxPoints * ((pc.subMinimumPercent ?? 40) / 100),
    criteria: combinedCriteria, entities: combinedEntities,
  };
}

function buildEEPack(cfg: SectorConfig): PillarPack {
  const pc = cfg.pillarConfigs?.employmentEquity ?? { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 };
  const eePc = cfg.pillarConfigs?.employmentEquity;
  const isMergedIntoMC = !eePc || eePc.maxPoints === 0 || eePc.maxPoints === undefined;
  return {
    pillarCode: 'employmentEquity', pillarName: 'Employment Equity', maxPoints: pc.maxPoints,
    hasSubMinimum: pc.hasSubMinimum ?? false, subMinimumThreshold: (pc.maxPoints ?? 0) * ((pc.subMinimumPercent ?? 0) / 100),
    criteria: isMergedIntoMC ? [] : eeCriteria(cfg),
    entities: isMergedIntoMC ? [] : [...EE_ENTITIES],
  };
}

function buildSkillsPack(cfg: SectorConfig): PillarPack {
  const pc = cfg.pillarConfigs?.skillsDevelopment ?? { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 };
  return {
    pillarCode: 'skillsDevelopment', pillarName: 'Skills Development', maxPoints: pc.maxPoints,
    hasSubMinimum: pc.hasSubMinimum ?? true, subMinimumThreshold: pc.maxPoints * ((pc.subMinimumPercent ?? 40) / 100),
    criteria: skillsCriteria(cfg), entities: [...SKILLS_ENTITIES],
  };
}

function buildProcurementPack(cfg: SectorConfig): PillarPack {
  const pc = cfg.pillarConfigs?.preferentialProcurement ?? { maxPoints: 29, hasSubMinimum: true, subMinimumPercent: 40 };
  return {
    pillarCode: 'preferentialProcurement', pillarName: 'Preferential Procurement', maxPoints: pc.maxPoints,
    hasSubMinimum: pc.hasSubMinimum ?? true, subMinimumThreshold: pc.maxPoints * ((pc.subMinimumPercent ?? 40) / 100),
    criteria: procurementCriteria(cfg), entities: [...PROCUREMENT_ENTITIES],
  };
}

function buildESDPack(cfg: SectorConfig): PillarPack {
  const sd = cfg.pillarConfigs?.supplierDevelopment ?? { maxPoints: 10, hasSubMinimum: true, subMinimumPercent: 40 };
  const ed = cfg.pillarConfigs?.enterpriseDevelopment ?? { maxPoints: 7, hasSubMinimum: false, subMinimumPercent: 0 };
  const combinedMax = (sd.maxPoints ?? 0) + (ed.maxPoints ?? 0);
  return {
    pillarCode: 'enterpriseSupplierDevelopment', pillarName: 'Enterprise & Supplier Development', maxPoints: combinedMax,
    hasSubMinimum: (sd.hasSubMinimum ?? false) || (ed.hasSubMinimum ?? false), subMinimumThreshold: (sd.hasSubMinimum ?? false) ? (sd.maxPoints ?? 0) * ((sd.subMinimumPercent ?? 0) / 100) : 0,
    criteria: esdCriteria(cfg), entities: [...ESD_ENTITIES],
  };
}

function buildSEDPack(cfg: SectorConfig): PillarPack {
  const pc = cfg.pillarConfigs?.socioEconomicDevelopment ?? { maxPoints: 5, hasSubMinimum: false, subMinimumPercent: 0 };
  return {
    pillarCode: 'socioEconomicDevelopment', pillarName: 'Socio-Economic Development', maxPoints: pc.maxPoints,
    hasSubMinimum: pc.hasSubMinimum ?? false, subMinimumThreshold: (pc.maxPoints ?? 0) * ((pc.subMinimumPercent ?? 0) / 100),
    criteria: sedCriteria(cfg), entities: [...SED_ENTITIES],
  };
}

function yesCriteria(cfg: SectorConfig): CriterionEntity[] {
  const pc = cfg.pillarConfigs?.yesInitiative;
  const maxPoints = pc?.maxPoints ?? 3; // Default to 3 if not configured
  return [
    { code: 'YES-HEADCOUNT', name: 'YES youth headcount target', pillarCode: 'yesInitiative', target: 'size_based', maxPoints: 0, formulaId: 'yes_headcount', inputEntities: ['yes_participant_name', 'yes_participant_id', 'yes_start_date'], evidenceRequired: ['YES records'] },
    { code: 'YES-ABSORPTION', name: 'YES absorption rate', pillarCode: 'yesInitiative', target: 0.25, maxPoints: 0, formulaId: 'yes_absorption', inputEntities: ['yes_is_absorbed', 'yes_months_retained'], evidenceRequired: ['YES records'] },
    { code: 'YES-LEVEL', name: 'YES level increase', pillarCode: 'yesInitiative', target: 'tier_based', maxPoints, formulaId: 'yes_tier', inputEntities: ['yes_company_size', 'yes_participants_count'], evidenceRequired: ['YES records'] },
  ];
}

function buildYESPack(cfg: SectorConfig): PillarPack {
  const pc = cfg.pillarConfigs?.yesInitiative;
  const maxPoints = pc?.maxPoints ?? 3;
  return {
    pillarCode: 'yesInitiative', pillarName: 'YES Initiative', maxPoints,
    hasSubMinimum: false, subMinimumThreshold: 0,
    criteria: yesCriteria(cfg), entities: [...YES_ENTITIES],
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
 * Normalise the ArangoDB StoredSectorRule (which stores pillarConfigs as an array)
 * into the keyed SectorConfig shape that all pack builders expect.
 * This mirrors storedRuleToSectorConfig in calculationEngine.ts.
 */
function normaliseStoredRule(stored: Awaited<ReturnType<SectorRuleRepository['getSectorRule']>>): SectorConfig {
  if (!stored) throw new Error('normaliseStoredRule called with null');

  // Start with safe defaults; Arango values will override everything they supply
  const pillarConfigs: SectorConfig['pillarConfigs'] = {
    ownership: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    managementControl: { maxPoints: 19, hasSubMinimum: false, subMinimumPercent: 0 },
    employmentEquity: { maxPoints: 0, hasSubMinimum: false, subMinimumPercent: 0 },
    skillsDevelopment: { maxPoints: 25, hasSubMinimum: true, subMinimumPercent: 40 },
    preferentialProcurement: { maxPoints: 29, hasSubMinimum: true, subMinimumPercent: 40 },
    supplierDevelopment: { maxPoints: 10, hasSubMinimum: true, subMinimumPercent: 40 },
    enterpriseDevelopment: { maxPoints: 5, hasSubMinimum: false, subMinimumPercent: 0 },
    socioEconomicDevelopment: { maxPoints: 5, hasSubMinimum: false, subMinimumPercent: 0 },
  };

  const storedArray = Array.isArray(stored.pillarConfigs) ? stored.pillarConfigs : [];
  for (const spc of storedArray) {
    // spc.code matches pillarConfig keys directly
    const key = spc.code as keyof SectorConfig['pillarConfigs'];
    if (key && key in pillarConfigs) {
      pillarConfigs[key] = {
        maxPoints: spc.maxPoints,
        hasSubMinimum: spc.hasSubMinimum,
        subMinimumPercent: spc.subMinimumThreshold ?? spc.subMinimumPercent ?? 0,
      };
    }
  }

  // Use stored totalMaxPoints if available and > 0, otherwise derive from pillar sum
  const derivedTotal = Object.values(pillarConfigs).reduce((s, p) => s + p.maxPoints, 0);
  const totalMaxPoints = (stored.totalMaxPoints && stored.totalMaxPoints > 0)
    ? stored.totalMaxPoints
    : derivedTotal;

  return {
    sectorCode: stored.sectorCode,
    sectorName: stored.sectorName,
    scorecardType: stored.scorecardType as 'Generic' | 'QSE' | 'EME',
    totalMaxPoints,
    pillarConfigs,
    targets: (stored.targets as SectorConfig['targets']) || {},
    levelThresholds: (stored.levelThresholds || []).map((lt: any) => ({
      level: lt.level, minPoints: lt.minPoints, recognition: lt.recognition,
    })),
    benefitFactors: (stored.benefitFactors || []).map((bf: any) => ({
      contributionType: bf.contributionType, sdFactor: bf.sdFactor, edFactor: bf.edFactor,
    })),
    categoryWeightings: (stored.categoryWeightings || []).map((cw: any) => ({
      code: cw.code, name: cw.name, weighting: cw.weighting, cap: cw.cap,
    })),
    industryNorms: (stored.industryNorms || []).map((ind: any) => ({
      industry: ind.industry, normPercent: ind.normPercent, quarterThresholdPercent: ind.quarterThresholdPercent,
    })),
  };
}

/**
 * Resolve sector configuration from ArangoDB (single source of truth).
 * Falls back to hardcoded config only if ArangoDB is unavailable.
 */
async function resolveSectorConfig(sectorCode: string, scorecardType: string): Promise<SectorConfig> {
  const repo = new SectorRuleRepository();

  try {
    const storedRule = await repo.getSectorRule(sectorCode, scorecardType);

    if (storedRule) {
      return normaliseStoredRule(storedRule);
    }
  } catch (error) {
    console.warn(`[EntityManifest] ArangoDB unavailable, using hardcoded config for ${sectorCode} ${scorecardType}:`, error);
  }

  // Fallback to hardcoded config
  return getSectorConfig(sectorCode, scorecardType);
}

/**
 * Build a hierarchical entity manifest for any sector/type combination.
 * This is the single entry point — queries ArangoDB first, no hardcoded fallbacks for production.
 */
export async function buildManifest(sectorCode: string, scorecardType: string): Promise<EntityManifest> {
  const upper = sectorCode.toUpperCase();
  const cfg = await resolveSectorConfig(upper, scorecardType);

  const rootContext: RootContext = {
    sector: upper,
    sectorCodeVersion: 'v1',
    scorecardType: cfg.scorecardType,
    companySize: cfg.scorecardType,
  };

  const isQSE = cfg.scorecardType === 'QSE';
  const pillarPacks: PillarPack[] = [
    {
      pillarCode: 'clientInfo', pillarName: 'Client Information', maxPoints: 0,
      hasSubMinimum: false, subMinimumThreshold: 0,
      criteria: [], entities: [...CLIENT_INFO_ENTITIES],
    },
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
    buildYESPack(cfg),
  ];

  // Add sector-specific entities and pillar packs
  if (upper === 'ICT') {
    const procPack = pillarPacks.find(p => p.pillarCode === 'preferentialProcurement');
    if (procPack) procPack.entities.push(...ICT_ENTITIES);
  } else if (upper === 'FSC') {
    const efConfig = cfg.pillarConfigs.empowermentFinancing ?? { maxPoints: 15, hasSubMinimum: false, subMinimumPercent: 0 };
    const afsConfig = cfg.pillarConfigs.accessToFinancialServices ?? { maxPoints: 12, hasSubMinimum: false, subMinimumPercent: 0 };
    const ceConfig = cfg.pillarConfigs.consumerEducation ?? { maxPoints: 5, hasSubMinimum: false, subMinimumPercent: 0 };

    pillarPacks.push({
      pillarCode: 'empowermentFinancing', pillarName: 'Empowerment Financing (FSC)', maxPoints: efConfig.maxPoints,
      hasSubMinimum: efConfig.hasSubMinimum, subMinimumThreshold: efConfig.maxPoints * (efConfig.subMinimumPercent / 100),
      criteria: [
        { code: 'EF-BANKS', name: 'Empowerment Financing — Banks', pillarCode: 'empowermentFinancing', target: 'sector_specific', maxPoints: efConfig.maxPoints, formulaId: 'fsc_empowerment_financing', inputEntities: ['empowerment_financing_amount'], evidenceRequired: ['EF records'] },
      ],
      entities: [...FSC_ENTITIES],
    });
    pillarPacks.push({
      pillarCode: 'accessToFinancialServices', pillarName: 'Access to Financial Services (FSC)', maxPoints: afsConfig.maxPoints,
      hasSubMinimum: afsConfig.hasSubMinimum, subMinimumThreshold: afsConfig.maxPoints * (afsConfig.subMinimumPercent / 100),
      criteria: [
        { code: 'AFS-SCORE', name: 'Access to Financial Services', pillarCode: 'accessToFinancialServices', target: 'sector_specific', maxPoints: afsConfig.maxPoints, formulaId: 'fsc_afs', inputEntities: ['access_financial_services'], evidenceRequired: ['AFS records'] },
      ],
      entities: [],
    });
    pillarPacks.push({
      pillarCode: 'consumerEducation', pillarName: 'Consumer Education (FSC)', maxPoints: ceConfig.maxPoints,
      hasSubMinimum: ceConfig.hasSubMinimum, subMinimumThreshold: ceConfig.maxPoints * (ceConfig.subMinimumPercent / 100),
      criteria: [
        { code: 'CE-SCORE', name: 'Consumer Education contributions', pillarCode: 'consumerEducation', target: 'sector_specific', maxPoints: ceConfig.maxPoints, formulaId: 'fsc_consumer_education', inputEntities: [], evidenceRequired: ['CE records'] },
      ],
      entities: [],
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
export async function buildRCOGPGenericManifest(): Promise<EntityManifest> {
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
export async function getAllManifests(): Promise<EntityManifest[]> {
  const manifests = await Promise.all(
    SCORECARD_TYPES.map(({ sectorCode, scorecardType }) => buildManifest(sectorCode, scorecardType))
  );
  return manifests;
}
