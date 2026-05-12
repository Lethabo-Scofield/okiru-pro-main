/**
 * Info Request Sheet Template Parser
 *
 * Parses the Info Request Sheet Excel template which has a specific structure
 * with multiple sheets for different B-BBEE pillars.
 *
 * Sheets:
 *   - Information Request (General company info)
 *   - Finance (Financial data)
 *   - Ownership (Shareholder details)
 *   - Management (Board and executive composition)
 *   - YES (Youth Employment Service)
 *   - Skills (Training and skills development)
 *   - Procurement (Supplier and procurement data)
 *   - ESD (Enterprise and Supplier Development)
 *   - SED (Socio-Economic Development)
 *
 * The template uses a row-based structure where:
 *   - Row 1: Headers
 *   - Row 2+: Data entries (can be multiple rows for lists)
 */

import * as XLSX from 'xlsx';

export interface InfoRequestEntity {
  name: string;
  value: string | number | boolean | null;
  fieldType: 'currency' | 'percentage' | 'count' | 'date' | 'string' | 'boolean';
  category: string;
  rowIndex?: number;
  columnIndex?: number;
}

export interface InfoRequestListItem {
  [key: string]: string | number | boolean | null;
}

export interface InfoRequestSheetData {
  sheetName: string;
  category: string;
  entities: InfoRequestEntity[];
  listData?: InfoRequestListItem[]; // For multi-row sections (employees, suppliers, etc.)
}

export interface ParsedInfoRequestSheet {
  companyInfo: {
    name?: string;
    registrationNumber?: string;
    sector?: string;
    financialYearEnd?: string;
    [key: string]: string | undefined;
  };
  financialData: {
    totalRevenue?: number;
    npat?: number;
    leviableAmount?: number;
    tmps?: number;
    [key: string]: number | undefined;
  };
  ownership: {
    blackOwnershipPercentage?: number;
    blackWomenOwnershipPercentage?: number;
    blackEconomicInterest?: number;
    blackWomenEconomicInterest?: number;
    shareholders?: Array<{
      name: string;
      percentage: number;
      value?: number;
    }>;
  };
  management: {
    blackBoardPercentage?: number;
    blackWomenBoardPercentage?: number;
    blackExecutivePercentage?: number;
    blackWomenExecutivePercentage?: number;
  };
  skillsDevelopment: {
    totalSpend?: number;
    programmes?: Array<{
      name: string;
      cost: number;
      learnerName?: string;
      employmentStatus?: string;
      race?: string;
    }>;
  };
  procurement: {
    totalSpend?: number;
    preferentialSpend?: number;
    suppliers?: Array<{
      name: string;
      beeLevel?: string;
      blackOwnershipPercentage?: number;
      spend?: number;
    }>;
  };
  esd: {
    beneficiaries?: Array<{
      name: string;
      type: string;
      amount: number;
      category: string;
    }>;
  };
  sed: {
    beneficiaries?: Array<{
      name: string;
      type: string;
      amount: number;
    }>;
  };
  yes: {
    participants?: Array<{
      name: string;
      idNumber?: string;
      position?: string;
    }>;
  };
  rawSheets: InfoRequestSheetData[];
}

// Sheet name patterns to category mapping
const SHEET_CATEGORIES: Record<string, string> = {
  'information request': 'general',
  'general': 'general',
  'finance': 'financial',
  'financial': 'financial',
  'ownership': 'ownership',
  'management': 'management',
  'management control': 'management',
  'yes': 'yes',
  'yes initiative': 'yes',
  'skills': 'skills',
  'skills development': 'skills',
  'procurement': 'procurement',
  'preferential procurement': 'procurement',
  'esd': 'esd',
  'enterprise development': 'esd',
  'supplier development': 'esd',
  'sed': 'sed',
  'socio-economic': 'sed',
  'socio economic': 'sed',
  'csi': 'sed',
};

/**
 * Detect field type from value and context
 */
function detectFieldType(value: unknown, header: string): InfoRequestEntity['fieldType'] {
  const headerLower = header.toLowerCase();
  const valueStr = String(value).toLowerCase();

  // Percentage detection
  if (headerLower.includes('percentage') || headerLower.includes('%') ||
      valueStr.includes('%')) {
    return 'percentage';
  }

  // Currency detection
  if (headerLower.includes('amount') || headerLower.includes('cost') ||
      headerLower.includes('spend') || headerLower.includes('value') ||
      headerLower.includes('revenue') || headerLower.includes('profit') ||
      valueStr.startsWith('r ') || valueStr.includes('rand')) {
    return 'currency';
  }

  // Count detection
  if (headerLower.includes('number') || headerLower.includes('count') ||
      headerLower.includes('total') || headerLower.includes('employees')) {
    const num = parseFloat(String(value));
    if (!isNaN(num) && Number.isInteger(num)) {
      return 'count';
    }
  }

  // Date detection
  if (headerLower.includes('date') || headerLower.includes('year')) {
    return 'date';
  }

  // Boolean detection
  if (valueStr === 'yes' || valueStr === 'no' || valueStr === 'true' || valueStr === 'false') {
    return 'boolean';
  }

  return 'string';
}

/**
 * Parse currency value
 */
function parseCurrency(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (!value) return null;

  const str = String(value).replace(/[R\s,]/g, '');
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

/**
 * Parse percentage value
 */
function parsePercentage(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (!value) return null;

  const str = String(value).replace(/[%\s]/g, '');
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

/**
 * Normalize value based on field type
 */
function normalizeValue(value: unknown, fieldType: InfoRequestEntity['fieldType']): string | number | boolean | null {
  if (value === null || value === undefined) return null;

  switch (fieldType) {
    case 'currency':
      return parseCurrency(value);
    case 'percentage':
      return parsePercentage(value);
    case 'count':
      const count = parseInt(String(value), 10);
      return isNaN(count) ? null : count;
    case 'boolean':
      const str = String(value).toLowerCase();
      return str === 'yes' || str === 'true';
    case 'date':
      // Keep as string, let downstream handle date parsing
      return String(value);
    default:
      return String(value);
  }
}

/**
 * Get category from sheet name
 */
function getSheetCategory(sheetName: string): string {
  const lower = sheetName.toLowerCase();
  for (const [pattern, category] of Object.entries(SHEET_CATEGORIES)) {
    if (lower.includes(pattern)) {
      return category;
    }
  }
  return 'other';
}

/**
 * Parse a single sheet from the Info Request template
 */
function parseSheet(ws: XLSX.WorkSheet, sheetName: string): InfoRequestSheetData {
  const category = getSheetCategory(sheetName);
  const entities: InfoRequestEntity[] = [];
  const listData: InfoRequestListItem[] = [];

  // Get range
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');

  // Try to find header row (usually row 0 or 1)
  let headerRow = -1;
  let dataStartRow = -1;

  for (let r = range.s.r; r <= Math.min(range.e.r, 10); r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: 0 })];
    if (cell && cell.v) {
      const val = String(cell.v).toLowerCase();
      // Look for common header indicators
      if (val.includes('label') || val.includes('description') || val.includes('field') ||
          val.includes('entity') || val.includes('item')) {
        headerRow = r;
        dataStartRow = r + 1;
        break;
      }
    }
  }

  // If no header found, assume row 0 is header
  if (headerRow === -1) {
    headerRow = 0;
    dataStartRow = 1;
  }

  // Read headers
  const headers: string[] = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: headerRow, c })];
    headers[c] = cell && cell.v ? String(cell.v).trim() : `Column${c}`;
  }

  // Parse data rows
  for (let r = dataStartRow; r <= range.e.r; r++) {
    const rowData: InfoRequestListItem = {};
    let hasValue = false;

    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      const value = cell ? cell.v : null;
      const header = headers[c];

      if (value !== null && value !== undefined && String(value).trim() !== '') {
        hasValue = true;

        const fieldType = detectFieldType(value, header);
        const normalizedValue = normalizeValue(value, fieldType);

        rowData[header] = normalizedValue;

        // Also create a flat entity
        entities.push({
          name: header,
          value: normalizedValue,
          fieldType,
          category,
          rowIndex: r,
          columnIndex: c,
        });
      }
    }

    if (hasValue) {
      listData.push(rowData);
    }
  }

  return {
    sheetName,
    category,
    entities,
    listData: listData.length > 0 ? listData : undefined,
  };
}

/**
 * Parse the Info Request Sheet Excel file
 */
export function parseInfoRequestSheet(buffer: Buffer): ParsedInfoRequestSheet {
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  const rawSheets: InfoRequestSheetData[] = [];
  const result: ParsedInfoRequestSheet = {
    companyInfo: {},
    financialData: {},
    ownership: {},
    management: {},
    skillsDevelopment: {},
    procurement: {},
    esd: {},
    sed: {},
    yes: {},
    rawSheets: [],
  };

  // Parse each sheet
  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    const sheetData = parseSheet(ws, sheetName);
    rawSheets.push(sheetData);

    // Categorize data based on sheet type
    switch (sheetData.category) {
      case 'general':
        extractGeneralInfo(sheetData, result.companyInfo);
        break;
      case 'financial':
        extractFinancialData(sheetData, result.financialData);
        break;
      case 'ownership':
        extractOwnershipData(sheetData, result.ownership);
        break;
      case 'management':
        extractManagementData(sheetData, result.management);
        break;
      case 'skills':
        extractSkillsData(sheetData, result.skillsDevelopment);
        break;
      case 'procurement':
        extractProcurementData(sheetData, result.procurement);
        break;
      case 'esd':
        extractESDData(sheetData, result.esd);
        break;
      case 'sed':
        extractSEDData(sheetData, result.sed);
        break;
      case 'yes':
        extractYESData(sheetData, result.yes);
        break;
    }
  }

  result.rawSheets = rawSheets;
  return result;
}

/**
 * Extract general company information
 */
function extractGeneralInfo(sheetData: InfoRequestSheetData, target: ParsedInfoRequestSheet['companyInfo']) {
  for (const entity of sheetData.entities) {
    const name = entity.name.toLowerCase();

    if (name.includes('company') || name.includes('entity') || name.includes('organisation')) {
      target.name = String(entity.value);
    } else if (name.includes('registration') || name.includes('reg number')) {
      target.registrationNumber = String(entity.value);
    } else if (name.includes('sector') || name.includes('industry')) {
      target.sector = String(entity.value);
    } else if (name.includes('year end') || name.includes('financial year')) {
      target.financialYearEnd = String(entity.value);
    }
  }
}

/**
 * Extract financial data
 */
function extractFinancialData(sheetData: InfoRequestSheetData, target: ParsedInfoRequestSheet['financialData']) {
  for (const entity of sheetData.entities) {
    const name = entity.name.toLowerCase();

    if (name.includes('revenue') || name.includes('turnover') || name.includes('sales')) {
      target.totalRevenue = entity.value as number;
    } else if (name.includes('npat') || name.includes('profit after tax')) {
      target.npat = entity.value as number;
    } else if (name.includes('leviable') || name.includes('payroll')) {
      target.leviableAmount = entity.value as number;
    } else if (name.includes('tmps') || name.includes('measured procurement')) {
      target.tmps = entity.value as number;
    }
  }
}

/**
 * Extract ownership data
 */
function extractOwnershipData(sheetData: InfoRequestSheetData, target: ParsedInfoRequestSheet['ownership']) {
  const shareholders: ParsedInfoRequestSheet['ownership']['shareholders'] = [];

  for (const entity of sheetData.entities) {
    const name = entity.name.toLowerCase();

    if (name.includes('black ownership') && name.includes('women')) {
      target.blackWomenOwnershipPercentage = entity.value as number;
    } else if (name.includes('black ownership')) {
      target.blackOwnershipPercentage = entity.value as number;
    } else if (name.includes('economic interest') && name.includes('women')) {
      target.blackWomenEconomicInterest = entity.value as number;
    } else if (name.includes('economic interest')) {
      target.blackEconomicInterest = entity.value as number;
    }
  }

  // Extract shareholder list if present
  if (sheetData.listData) {
    for (const row of sheetData.listData) {
      const shareholderName = findField(row, ['shareholder', 'name', 'holder']);
      const percentage = findField(row, ['percentage', 'shareholding', 'ownership']);
      const value = findField(row, ['value', 'worth', 'amount']);

      if (shareholderName && percentage) {
        shareholders.push({
          name: String(shareholderName),
          percentage: parsePercentage(percentage) || 0,
          value: parseCurrency(value) || undefined,
        });
      }
    }
  }

  if (shareholders.length > 0) {
    target.shareholders = shareholders;
  }
}

/**
 * Extract management control data
 */
function extractManagementData(sheetData: InfoRequestSheetData, target: ParsedInfoRequestSheet['management']) {
  for (const entity of sheetData.entities) {
    const name = entity.name.toLowerCase();

    if (name.includes('board') && name.includes('women')) {
      target.blackWomenBoardPercentage = entity.value as number;
    } else if (name.includes('board')) {
      target.blackBoardPercentage = entity.value as number;
    } else if (name.includes('executive') && name.includes('women')) {
      target.blackWomenExecutivePercentage = entity.value as number;
    } else if (name.includes('executive')) {
      target.blackExecutivePercentage = entity.value as number;
    }
  }
}

/**
 * Extract skills development data
 */
function extractSkillsData(sheetData: InfoRequestSheetData, target: ParsedInfoRequestSheet['skillsDevelopment']) {
  const programmes: ParsedInfoRequestSheet['skillsDevelopment']['programmes'] = [];

  for (const entity of sheetData.entities) {
    const name = entity.name.toLowerCase();

    if (name.includes('total') && name.includes('spend')) {
      target.totalSpend = entity.value as number;
    }
  }

  if (sheetData.listData) {
    for (const row of sheetData.listData) {
      const programmeName = findField(row, ['programme', 'program', 'training']);
      const cost = findField(row, ['cost', 'amount', 'spend', 'value']);

      if (programmeName) {
        programmes.push({
          name: String(programmeName),
          cost: parseCurrency(cost) || 0,
          learnerName: String(findField(row, ['learner', 'employee', 'participant']) || ''),
          employmentStatus: String(findField(row, ['status', 'employment']) || ''),
          race: String(findField(row, ['race', 'demographic']) || ''),
        });
      }
    }
  }

  if (programmes.length > 0) {
    target.programmes = programmes;
  }
}

/**
 * Extract procurement data
 */
function extractProcurementData(sheetData: InfoRequestSheetData, target: ParsedInfoRequestSheet['procurement']) {
  const suppliers: ParsedInfoRequestSheet['procurement']['suppliers'] = [];

  for (const entity of sheetData.entities) {
    const name = entity.name.toLowerCase();

    if (name.includes('total') && name.includes('spend')) {
      target.totalSpend = entity.value as number;
    } else if (name.includes('preferential') && name.includes('spend')) {
      target.preferentialSpend = entity.value as number;
    }
  }

  if (sheetData.listData) {
    for (const row of sheetData.listData) {
      const supplierName = findField(row, ['supplier', 'vendor', 'name']);
      const spend = findField(row, ['spend', 'amount', 'value']);

      if (supplierName) {
        suppliers.push({
          name: String(supplierName),
          beeLevel: String(findField(row, ['bee', 'level', 'recognition']) || ''),
          blackOwnershipPercentage: parsePercentage(findField(row, ['ownership', 'black'])) || undefined,
          spend: parseCurrency(spend) || undefined,
        });
      }
    }
  }

  if (suppliers.length > 0) {
    target.suppliers = suppliers;
  }
}

/**
 * Extract ESD data
 */
function extractESDData(sheetData: InfoRequestSheetData, target: ParsedInfoRequestSheet['esd']) {
  const beneficiaries: ParsedInfoRequestSheet['esd']['beneficiaries'] = [];

  if (sheetData.listData) {
    for (const row of sheetData.listData) {
      const name = findField(row, ['beneficiary', 'name', 'enterprise']);
      const amount = findField(row, ['amount', 'contribution', 'value', 'grant']);

      if (name) {
        beneficiaries.push({
          name: String(name),
          type: String(findField(row, ['type', 'contribution type']) || 'Grant'),
          amount: parseCurrency(amount) || 0,
          category: String(findField(row, ['category', 'type']) || 'Supplier Development'),
        });
      }
    }
  }

  if (beneficiaries.length > 0) {
    target.beneficiaries = beneficiaries;
  }
}

/**
 * Extract SED data
 */
function extractSEDData(sheetData: InfoRequestSheetData, target: ParsedInfoRequestSheet['sed']) {
  const beneficiaries: ParsedInfoRequestSheet['sed']['beneficiaries'] = [];

  if (sheetData.listData) {
    for (const row of sheetData.listData) {
      const name = findField(row, ['beneficiary', 'name', 'project']);
      const amount = findField(row, ['amount', 'contribution', 'value']);

      if (name) {
        beneficiaries.push({
          name: String(name),
          type: String(findField(row, ['type', 'contribution type']) || 'Monetary'),
          amount: parseCurrency(amount) || 0,
        });
      }
    }
  }

  if (beneficiaries.length > 0) {
    target.beneficiaries = beneficiaries;
  }
}

/**
 * Extract YES data
 */
function extractYESData(sheetData: InfoRequestSheetData, target: ParsedInfoRequestSheet['yes']) {
  const participants: ParsedInfoRequestSheet['yes']['participants'] = [];

  if (sheetData.listData) {
    for (const row of sheetData.listData) {
      const name = findField(row, ['name', 'participant', 'youth']);

      if (name) {
        participants.push({
          name: String(name),
          idNumber: String(findField(row, ['id', 'id number', 'identity']) || ''),
          position: String(findField(row, ['position', 'role', 'job']) || ''),
        });
      }
    }
  }

  if (participants.length > 0) {
    target.participants = participants;
  }
}

/**
 * Helper to find a field in a row by multiple possible names
 */
function findField(row: InfoRequestListItem, possibleNames: string[]): string | number | null {
  for (const key of Object.keys(row)) {
    const keyLower = key.toLowerCase();
    for (const name of possibleNames) {
      if (keyLower.includes(name.toLowerCase())) {
        const v = row[key];
        if (typeof v === 'boolean') return v ? 1 : 0;
        return v as string | number | null;
      }
    }
  }
  return null;
}

/**
 * Convert parsed Info Request Sheet to entity map format
 */
export function convertToEntityMap(parsed: ParsedInfoRequestSheet): Record<string, unknown> {
  const entityMap: Record<string, unknown> = {};

  // General info
  if (parsed.companyInfo.name) entityMap['Company Name'] = parsed.companyInfo.name;
  if (parsed.companyInfo.registrationNumber) entityMap['Registration Number'] = parsed.companyInfo.registrationNumber;
  if (parsed.companyInfo.sector) entityMap['Sector'] = parsed.companyInfo.sector;
  if (parsed.companyInfo.financialYearEnd) entityMap['Financial Year End'] = parsed.companyInfo.financialYearEnd;

  // Financial
  if (parsed.financialData.totalRevenue) entityMap['Total Revenue'] = parsed.financialData.totalRevenue;
  if (parsed.financialData.npat) entityMap['Net Profit After Tax'] = parsed.financialData.npat;
  if (parsed.financialData.leviableAmount) entityMap['Leviable Amount'] = parsed.financialData.leviableAmount;
  if (parsed.financialData.tmps) entityMap['Total Measured Procurement Spend'] = parsed.financialData.tmps;

  // Ownership
  if (parsed.ownership.blackOwnershipPercentage) entityMap['Black Ownership Percentage'] = parsed.ownership.blackOwnershipPercentage;
  if (parsed.ownership.blackWomenOwnershipPercentage) entityMap['Black Women Ownership Percentage'] = parsed.ownership.blackWomenOwnershipPercentage;
  if (parsed.ownership.shareholders) entityMap['Shareholders'] = parsed.ownership.shareholders;

  // Management
  if (parsed.management.blackBoardPercentage) entityMap['Black Board Members Percentage'] = parsed.management.blackBoardPercentage;
  if (parsed.management.blackWomenBoardPercentage) entityMap['Black Women Board Members Percentage'] = parsed.management.blackWomenBoardPercentage;
  if (parsed.management.blackExecutivePercentage) entityMap['Black Executive Directors Percentage'] = parsed.management.blackExecutivePercentage;
  if (parsed.management.blackWomenExecutivePercentage) entityMap['Black Women Executive Percentage'] = parsed.management.blackWomenExecutivePercentage;

  // Skills
  if (parsed.skillsDevelopment.totalSpend) entityMap['Skills Development Expenditure'] = parsed.skillsDevelopment.totalSpend;
  if (parsed.skillsDevelopment.programmes) entityMap['Training Programmes'] = parsed.skillsDevelopment.programmes;

  // Procurement
  if (parsed.procurement.totalSpend) entityMap['Total Procurement Spend'] = parsed.procurement.totalSpend;
  if (parsed.procurement.preferentialSpend) entityMap['Preferential Procurement Spend'] = parsed.procurement.preferentialSpend;
  if (parsed.procurement.suppliers) entityMap['Suppliers'] = parsed.procurement.suppliers;

  // ESD
  if (parsed.esd.beneficiaries) entityMap['ESD Beneficiaries'] = parsed.esd.beneficiaries;

  // SED
  if (parsed.sed.beneficiaries) entityMap['SED Beneficiaries'] = parsed.sed.beneficiaries;

  // YES
  if (parsed.yes.participants) entityMap['YES Participants'] = parsed.yes.participants;

  return entityMap;
}

export default {
  parseInfoRequestSheet,
  convertToEntityMap,
};
