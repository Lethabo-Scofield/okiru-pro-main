import * as XLSX from 'xlsx';
import { matchSheetName, matchHeaders, type FieldMatch } from './textSimilarity.js';
import { extractEntity, extractCurrency, extractPercentage } from './entityExtractor.js';

export interface ParseLog {
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: string;
}

export interface ParsedClient {
  name?: string;
  tradeName?: string;
  address?: string;
  registrationNumber?: string;
  vatNumber?: string;
  financialYear?: string;
  revenue?: number;
  npat?: number;
  leviableAmount?: number;
  payroll?: number;
  industrySector?: string;
  applicableScorecard?: string;
  applicableCodes?: string;
  tmps?: number;
  tmpsInclusions?: number;
  tmpsExclusions?: number;
}

export interface ParsedShareholder {
  name: string;
  blackOwnership: number;
  blackWomenOwnership: number;
  shares?: number;
  shareValue?: number;
}

export interface ParsedEmployee {
  name: string;
  gender: string;
  race: string;
  designation: string;
  isDisabled: boolean;
}

export interface ParsedSupplier {
  name: string;
  beeLevel: number;
  blackOwnership: number;
  spend: number;
}

export interface ParsedTrainingProgram {
  name: string;
  category: string;
  cost: number;
  learnerName?: string;
  isEmployed: boolean;
  isBlack: boolean;
}

export interface ParsedContribution {
  beneficiary: string;
  type: string;
  amount: number;
  category: string;
}

export interface ParseResult {
  success: boolean;
  client: ParsedClient;
  shareholders: ParsedShareholder[];
  employees: ParsedEmployee[];
  trainingPrograms: ParsedTrainingProgram[];
  suppliers: ParsedSupplier[];
  esdContributions: ParsedContribution[];
  sedContributions: ParsedContribution[];
  sheetsFound: string[];
  sheetsMatched: { sheetName: string; matchedTo: string; confidence: number }[];
  errors: string[];
  warnings: string[];
  logs: ParseLog[];
  stats: {
    totalSheets: number;
    matchedSheets: number;
    entitiesExtracted: number;
    confidence: number;
  };
  scorecardValues?: Record<string, number>;
}

const EXPECTED_SHEETS = [
  { key: 'client', names: ['client information', 'client info', 'client data', 'client details', 'company info', 'company information', 'entity info', 'entity information', 'cover', 'summary', 'client', 'instructions', 'instruction', 'measured entity'] },
  { key: 'financials', names: ['financials', 'financial data', 'financial information', 'finance', 'income statement', 'p&l', 'profit and loss', 'revenue', 'financial summary', 'fin data', 'financial', 'imports', 'import'] },
  { key: 'ownership', names: ['ownership', 'ownership data', 'ownership information', 'shareholder', 'shareholders', 'share register', 'share holding', 'ownership chain', 'own data', 'own', 'voting rights', 'equity'] },
  { key: 'management', names: ['management control', 'management', 'mc data', 'mc', 'management data', 'employment equity', 'employees', 'employee data', 'staff', 'personnel', 'human resources', 'hr', 'ee data', 'ee'] },
  { key: 'skills', names: ['skills development', 'skills', 'skills data', 'training', 'training data', 'learnerships', 'bursaries', 'sdp', 'sd data', 'sd', 'skills dev'] },
  { key: 'procurement', names: ['procurement', 'procurement data', 'preferential procurement', 'pp', 'pp data', 'suppliers', 'supplier data', 'vendor', 'vendors', 'supply chain', 'pref procurement'] },
  { key: 'esd', names: ['esd', 'esd data', 'enterprise development', 'enterprise and supplier development', 'supplier development', 'economic development', 'ed data', 'sd ed', 'enterprise supplier development'] },
  { key: 'sed', names: ['sed', 'sed data', 'socio economic development', 'socio-economic', 'social development', 'social', 'csi', 'corporate social investment', 'socio economic'] },
  { key: 'yes', names: ['yes', 'yes employees', 'y.e.s employees', 'y.e.s', 'youth employment service', 'yes initiative', 'yes data'] },
  { key: 'scorecard', names: ['scorecard', 'summary scorecard', 'bbbee scorecard', 'b-bbee scorecard', 'score', 'results', 'dashboard', 'bee scorecard', 'bee summary'] },
  { key: 'industry', names: ['industry norms', 'industry', 'norms', 'sector codes', 'industry codes'] },
  { key: 'eap', names: ['eap', 'economically active population', 'demographics', 'population'] },
];

const CLIENT_FIELDS = [
  { name: 'Company Name', aliases: ['entity name', 'client name', 'name', 'company', 'entity', 'organisation', 'organization', 'business name'] },
  { name: 'Financial Year', aliases: ['year', 'fy', 'fin year', 'financial year end', 'year end', 'period'] },
  { name: 'Revenue', aliases: ['total revenue', 'turnover', 'income', 'gross revenue', 'annual revenue', 'sales'] },
  { name: 'NPAT', aliases: ['net profit', 'net profit after tax', 'profit after tax', 'pat', 'net income', 'bottom line'] },
  { name: 'Leviable Amount', aliases: ['payroll', 'total payroll', 'leviable payroll', 'salary bill', 'wage bill', 'total remuneration'] },
  { name: 'Industry Sector', aliases: ['sector', 'industry', 'sector code', 'industry code', 'sic code'] },
];

const OWNERSHIP_FIELDS = [
  { name: 'Shareholder Name', aliases: ['name', 'shareholder', 'entity name', 'holder', 'investor', 'member', 'owner'] },
  { name: 'Black Ownership', aliases: ['bo%', 'bo', 'black %', 'black ownership %', 'black owned', 'bo percent', 'black shareholding', '% black', 'hdsa'] },
  { name: 'Black Women Ownership', aliases: ['bwo%', 'bwo', 'black women %', 'black women ownership %', 'bw%', 'women %', 'female black', 'black female'] },
  { name: 'Shares', aliases: ['shares %', 'share %', 'shareholding', 'percentage', 'equity %', 'stake', 'voting rights', 'voting %'] },
  { name: 'Share Value', aliases: ['value', 'share value', 'investment value', 'rand value', 'amount'] },
];

const MC_FIELDS = [
  { name: 'Name', aliases: ['full name', 'employee name', 'staff name', 'person', 'surname', 'first name', 'name & surname', 'name and surname'] },
  { name: 'Gender', aliases: ['sex', 'male/female', 'm/f', 'gender identity'] },
  { name: 'Race', aliases: ['race group', 'population group', 'ethnicity', 'demographic', 'racial group', 'african/coloured/indian/white'] },
  { name: 'Designation', aliases: ['level', 'occupational level', 'position', 'role', 'job title', 'grade', 'category', 'management level', 'occ level', 'occupational category'] },
  { name: 'Disabled', aliases: ['disability', 'is disabled', 'pwd', 'person with disability', 'differently abled', 'disability status'] },
];

const PROCUREMENT_FIELDS = [
  { name: 'Supplier Name', aliases: ['name', 'supplier', 'vendor', 'vendor name', 'company', 'entity', 'service provider'] },
  { name: 'B-BBEE Level', aliases: ['bee level', 'level', 'bbbee level', 'b-bbee', 'compliance level', 'bee status', 'bbbee status', 'contributor level'] },
  { name: 'Black Ownership', aliases: ['bo%', 'bo', 'black owned', 'black ownership %', '% black', 'black ownership percentage'] },
  { name: 'Spend', aliases: ['amount', 'spend amount', 'total spend', 'procurement spend', 'value', 'rand value', 'cost', 'total', 'annual spend'] },
];

const SKILLS_FIELDS = [
  { name: 'Program Name', aliases: ['program', 'training', 'training name', 'course', 'course name', 'qualification', 'description', 'intervention', 'programme'] },
  { name: 'Category', aliases: ['type', 'training type', 'category', 'learning type', 'intervention type', 'program type', 'programme type'] },
  { name: 'Cost', aliases: ['amount', 'cost', 'spend', 'value', 'total cost', 'training cost', 'rand value', 'expenditure'] },
  { name: 'Learner Name', aliases: ['learner', 'name', 'employee', 'employee name', 'participant', 'student', 'trainee', 'learner name & surname'] },
  { name: 'Race', aliases: ['race', 'race group', 'population group', 'demographic'] },
  { name: 'Employed', aliases: ['employed', 'is employed', 'employment status', 'currently employed', 'status'] },
];

const ESD_FIELDS = [
  { name: 'Beneficiary', aliases: ['name', 'beneficiary name', 'recipient', 'entity', 'company', 'supplier name', 'enterprise'] },
  { name: 'Type', aliases: ['contribution type', 'nature', 'form', 'method', 'support type', 'description', 'type of contribution'] },
  { name: 'Amount', aliases: ['value', 'rand value', 'spend', 'contribution amount', 'cost', 'total', 'amount', 'monetary value'] },
  { name: 'Category', aliases: ['category', 'pillar', 'ed/sd', 'classification', 'sub-element'] },
];

function addLog(logs: ParseLog[], message: string, type: ParseLog['type'] = 'info'): void {
  logs.push({ message, type, timestamp: new Date().toISOString() });
}

function getSheetData(workbook: XLSX.WorkBook, sheetName: string): any[][] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];
}

function findHeaderRow(data: any[][], maxScan = 30): { rowIndex: number; headers: string[] } {
  for (let i = 0; i < Math.min(data.length, maxScan); i++) {
    const row = data[i];
    if (!row) continue;
    const nonEmpty = row.filter((c: any) => c !== null && c !== undefined && String(c).trim() !== '');
    const strings = nonEmpty.filter((c: any) => typeof c === 'string' && String(c).trim().length > 0);
    if (strings.length >= 2) {
      return {
        rowIndex: i,
        headers: row.map((c: any) => String(c || '').trim()),
      };
    }
  }
  return { rowIndex: 0, headers: data[0]?.map((c: any) => String(c || '').trim()) || [] };
}

function isJunkRow(name: string): boolean {
  const lower = name.toLowerCase().trim();
  if (!lower || lower.length < 2) return true;
  if (/^(detail|details|tier|total|totals|sub\s*total|grand\s*total|heading|header|column|row|note|notes|n\/a|na|tbd|test|example|sample|scenario|target|weighting|weight|compliance\s*target|indicator|element|sub-?element|description|criteria|formula)$/i.test(lower)) return true;
  if (/^year\s*end/i.test(lower)) return true;
  if (/^(b-?bbee|bee)\s*(level|status|certificate)/i.test(lower) && lower.length < 30) return true;
  if (/^\d+[\.\)]?\s*$/.test(lower)) return true;
  if (/^(supplier\s*name|learner\s*name|employee\s*name|beneficiary\s*name|name\s*(&|and)\s*surname|full\s*name|programme\s*name|program\s*name|company\s*name|entity\s*name)$/i.test(lower)) return true;
  if (/^(occupational\s*level|management\s*level|designation|gender|race|population|disabled|disability)$/i.test(lower)) return true;
  if (/^(category|type|amount|value|spend|cost|percentage|%|points|score|actual|measured|verified)$/i.test(lower)) return true;
  if (/^\s*[-–—]+\s*$/.test(lower)) return true;
  if (/^(insert|select|choose|enter|specify|please|refer|see)\b/i.test(lower)) return true;
  if (/^(gap\s*analysis|gap|optimum|prior\s*year|projected|absorption|results|headcount|disability\s*spend|effective\s*eap|lai\b)/i.test(lower)) return true;
  if (/^spend\s+[a-z]/i.test(lower) && lower.length < 30) return true;
  if (/\b(sub[\s-]*minimum|optimum|cap\]|manual\]|actual\]|scenario\])\b/i.test(lower) && lower.length < 50) return true;
  return false;
}

function parseClientSheet(data: any[][], logs: ParseLog[]): ParsedClient {
  const client: ParsedClient = {};

  for (const row of data) {
    if (!row || row.length < 2) continue;

    for (let col = 0; col < row.length - 1; col++) {
      const label = String(row[col] || '').toLowerCase().trim();
      const value = row[col + 1];

      if (!label || value === null || value === undefined || String(value).trim() === '') continue;

      if (!client.name && /company|client|entity|name|organisation|organization|registered\s*name|legal\s*name|measured\s*entity/i.test(label) && !/trade|trading/i.test(label) && typeof value === 'string' && value.length > 1 && !/^(detail|tier|year|heading)/i.test(value.trim())) {
        client.name = String(value).trim();
        addLog(logs, `Extracted Client Name: "${client.name}"`, 'success');
      }
      if (!client.tradeName && /trading\s*(as|name)|t\/a|trade\s*name/i.test(label) && typeof value === 'string' && value.length > 1) {
        client.tradeName = String(value).trim();
        addLog(logs, `Extracted Trade Name: "${client.tradeName}"`, 'success');
      }
      if (!client.revenue && /revenue|turnover|income|sales|total\s*revenue|gross\s*revenue/i.test(label) && !/net/i.test(label)) {
        const amt = extractCurrency(value);
        if (amt) { client.revenue = amt; addLog(logs, `Extracted Revenue: R${amt.toLocaleString()}`, 'success'); }
      }
      if (client.npat === undefined && /npat|net\s*profit|profit\s*after\s*tax|net\s*income|pat\b/i.test(label)) {
        const amt = extractCurrency(value);
        if (amt !== null) { client.npat = amt; addLog(logs, `Extracted NPAT: R${amt.toLocaleString()}`, 'success'); }
      }
      if (!client.leviableAmount && /leviable|payroll|salary|remuneration|total\s*payroll|leviable\s*amount|annual\s*payroll|total\s*remuneration/i.test(label)) {
        const amt = extractCurrency(value);
        if (amt) { client.leviableAmount = amt; addLog(logs, `Extracted Leviable Amount: R${amt.toLocaleString()}`, 'success'); }
      }
      if (!client.financialYear && /year|fy|financial\s*year|period|year\s*end|financial\s*year\s*end/i.test(label)) {
        const yr = String(value).trim();
        if (yr.length >= 4) {
          client.financialYear = yr;
          addLog(logs, `Extracted Financial Year: ${yr}`, 'success');
        }
      }
      if (!client.industrySector && /sector|industry|sic/i.test(label) && !/norm/i.test(label)) {
        client.industrySector = String(value).trim();
        addLog(logs, `Extracted Industry Sector: ${client.industrySector}`, 'success');
      }
      if (!client.tmps && /tmps|total\s*measured\s*procurement|measured\s*procurement\s*spend|total\s*procurement/i.test(label)) {
        const amt = extractCurrency(value);
        if (amt) { client.tmps = amt; addLog(logs, `Extracted TMPS: R${amt.toLocaleString()}`, 'success'); }
      }
      if (!client.address && /address|physical\s*address|postal\s*address|registered\s*address|street/i.test(label) && typeof value === 'string' && value.length > 3) {
        client.address = String(value).trim();
      }
      if (!client.registrationNumber && /registration|reg\s*no|reg\s*number|company\s*reg|cipc|ck\s*number|cc\s*number/i.test(label) && typeof value === 'string') {
        client.registrationNumber = String(value).trim();
      }
      if (!client.vatNumber && /vat|vat\s*no|vat\s*number|tax\s*number/i.test(label)) {
        client.vatNumber = String(value).trim();
      }
      if (!client.payroll && /payroll|total\s*wages|salaries\s*&?\s*wages|total\s*salary/i.test(label)) {
        const amt = extractCurrency(value);
        if (amt) { client.payroll = amt; }
      }
      if (!client.applicableScorecard && /scorecard|applicable\s*scorecard|qse|generic|eme/i.test(label) && typeof value === 'string') {
        client.applicableScorecard = String(value).trim();
      }
      if (!client.applicableCodes && /applicable\s*code|code|revised\s*code|sector\s*code/i.test(label) && typeof value === 'string' && /code|revised|generic|sector|transport/i.test(String(value))) {
        client.applicableCodes = String(value).trim();
      }
      if (!client.tmpsInclusions && /tmps\s*inclus|total\s*inclus|cost\s*of\s*sales|inclus/i.test(label)) {
        const amt = extractCurrency(value);
        if (amt) { client.tmpsInclusions = amt; }
      }
      if (!client.tmpsExclusions && /tmps\s*exclus|total\s*exclus|exclus|import|imports/i.test(label)) {
        const amt = extractCurrency(value);
        if (amt) { client.tmpsExclusions = amt; }
      }
    }
  }

  for (const row of data) {
    if (!row) continue;
    for (let col = 0; col < row.length; col++) {
      const cellStr = String(row[col] || '').trim();
      if (/measured\s*entity\s*name/i.test(cellStr) && !client.name) {
        for (let c = col + 1; c < row.length; c++) {
          const val = String(row[c] || '').trim();
          if (val && val.length > 2 && !/^(detail|tier|year|column|heading)/i.test(val)) {
            client.name = val;
            addLog(logs, `Extracted Measured Entity Name: "${client.name}"`, 'success');
            break;
          }
        }
        if (!client.name) {
          const nextRows = data.indexOf(row);
          if (nextRows >= 0 && nextRows + 1 < data.length) {
            const nextRow = data[nextRows + 1];
            if (nextRow) {
              const val = String(nextRow[col] || nextRow[col + 1] || '').trim();
              if (val && val.length > 2) {
                client.name = val;
                addLog(logs, `Extracted Measured Entity Name (next row): "${client.name}"`, 'success');
              }
            }
          }
        }
      }
    }
  }

  if (!client.payroll && client.leviableAmount) {
    client.payroll = client.leviableAmount;
  }

  return client;
}

function parseOwnershipSheet(data: any[][], logs: ParseLog[]): ParsedShareholder[] {
  for (let scanRow = 0; scanRow < Math.min(data.length, 30); scanRow++) {
    const row = data[scanRow];
    if (!row) continue;
    const headers = row.map((c: any) => String(c || '').trim());
    const matches = matchHeaders(headers, OWNERSHIP_FIELDS);

    if (matches.length >= 2) {
      addLog(logs, `Ownership: Matched ${matches.length} columns at row ${scanRow + 1}: ${matches.map(m => `${m.field} → "${m.matchedHeader}"`).join(', ')}`, 'info');

      const nameCol = matches.find(m => m.field === 'Shareholder Name');
      const boCol = matches.find(m => m.field === 'Black Ownership');
      const bwoCol = matches.find(m => m.field === 'Black Women Ownership');
      const sharesCol = matches.find(m => m.field === 'Shares');
      const valueCol = matches.find(m => m.field === 'Share Value');

      const shareholders: ParsedShareholder[] = [];

      for (let i = scanRow + 1; i < data.length; i++) {
        const dRow = data[i];
        if (!dRow) continue;

        const name = nameCol ? String(dRow[nameCol.columnIndex] || '').trim() : '';
        if (!name || name.length < 2 || isJunkRow(name)) continue;

        const bo = boCol ? extractPercentage(dRow[boCol.columnIndex]) : null;
        const bwo = bwoCol ? extractPercentage(dRow[bwoCol.columnIndex]) : null;
        const shares = sharesCol ? extractCurrency(dRow[sharesCol.columnIndex]) : null;
        const value = valueCol ? extractCurrency(dRow[valueCol.columnIndex]) : null;

        shareholders.push({
          name,
          blackOwnership: bo ?? 0,
          blackWomenOwnership: bwo ?? 0,
          shares: shares ?? 0,
          shareValue: value ?? 0,
        });
      }

      if (shareholders.length > 0) {
        addLog(logs, `Ownership: Extracted ${shareholders.length} shareholders`, 'success');
        return shareholders;
      }
    }
  }

  addLog(logs, `Ownership: Trying key-value pair extraction...`, 'info');
  const shareholders = parseOwnershipKV(data, logs);
  addLog(logs, `Ownership: Extracted ${shareholders.length} shareholders`, shareholders.length > 0 ? 'success' : 'warning');
  return shareholders;
}

function parseOwnershipKV(data: any[][], logs: ParseLog[]): ParsedShareholder[] {
  const shareholders: ParsedShareholder[] = [];
  let currentName = '';
  let currentBo = 0;
  let currentBwo = 0;
  let currentShares = 0;
  let currentValue = 0;

  for (const row of data) {
    if (!row || row.length < 2) continue;
    const label = String(row[0] || '').toLowerCase().trim();
    const value = row[1];
    if (!label) continue;

    if (/shareholder\s*(name|1|2|3|4|5|6|7|8|9|10)?$|^name\s*of\s*(shareholder|entity|owner)/i.test(label)) {
      if (currentName && !isJunkRow(currentName)) {
        shareholders.push({ name: currentName, blackOwnership: currentBo, blackWomenOwnership: currentBwo, shares: currentShares, shareValue: currentValue });
      }
      currentName = String(value || '').trim();
      currentBo = 0; currentBwo = 0; currentShares = 0; currentValue = 0;
    } else if (/black\s*own|bo\s*%|black\s*%|hdsa|historically\s*disadvantaged/i.test(label) && currentName) {
      const pct = extractPercentage(value);
      if (pct !== null) currentBo = pct;
    } else if (/black\s*wom|bwo|female\s*black|women\s*own/i.test(label) && currentName) {
      const pct = extractPercentage(value);
      if (pct !== null) currentBwo = pct;
    } else if (/share\s*%|shareholding|percentage|equity\s*%|voting\s*right/i.test(label) && currentName) {
      const pct = extractPercentage(value);
      if (pct !== null) currentShares = pct;
    } else if (/value|amount|investment/i.test(label) && currentName) {
      const amt = extractCurrency(value);
      if (amt !== null) currentValue = amt;
    }

    if (/\b(pty|ltd|holdings|group|trust|cc|inc|npc)\b/i.test(String(value || '')) && !currentName) {
      currentName = String(value).trim();
    }
  }

  if (currentName && !isJunkRow(currentName)) {
    shareholders.push({ name: currentName, blackOwnership: currentBo, blackWomenOwnership: currentBwo, shares: currentShares, shareValue: currentValue });
  }

  return shareholders;
}

function parseMCSheet(data: any[][], logs: ParseLog[]): ParsedEmployee[] {
  const employees = parseMCTabular(data, logs);
  if (employees.length > 0) return employees;

  addLog(logs, `Management Control: Trying cross-tab format...`, 'info');
  const crossTab = parseMCCrossTab(data, logs);
  if (crossTab.length > 0) return crossTab;

  addLog(logs, `Management Control: Trying broader header scan...`, 'info');
  const fallback = parseMCBroadScan(data, logs);
  addLog(logs, `Management Control: Extracted ${fallback.length} employees`, fallback.length > 0 ? 'success' : 'warning');
  return fallback;
}

function parseMCTabular(data: any[][], logs: ParseLog[]): ParsedEmployee[] {
  for (let scanRow = 0; scanRow < Math.min(data.length, 30); scanRow++) {
    const row = data[scanRow];
    if (!row) continue;
    const headers = row.map((c: any) => String(c || '').trim());
    const matches = matchHeaders(headers, MC_FIELDS);

    if (matches.length >= 2) {
      addLog(logs, `Management Control: Found headers at row ${scanRow + 1}, matched ${matches.length} columns`, 'info');

      const nameCol = matches.find(m => m.field === 'Name');
      const genderCol = matches.find(m => m.field === 'Gender');
      const raceCol = matches.find(m => m.field === 'Race');
      const desigCol = matches.find(m => m.field === 'Designation');
      const disCol = matches.find(m => m.field === 'Disabled');

      const employees: ParsedEmployee[] = [];

      for (let i = scanRow + 1; i < data.length; i++) {
        const dRow = data[i];
        if (!dRow) continue;

        const name = nameCol ? String(dRow[nameCol.columnIndex] || '').trim() : '';
        if (!name || name.length < 2 || isJunkRow(name)) continue;

        const genderEntity = genderCol ? extractEntity(dRow[genderCol.columnIndex]) : null;
        const raceEntity = raceCol ? extractEntity(dRow[raceCol.columnIndex]) : null;
        const desigEntity = desigCol ? extractEntity(dRow[desigCol.columnIndex]) : null;

        employees.push({
          name,
          gender: genderEntity?.value || 'Male',
          race: raceEntity?.value || 'White',
          designation: desigEntity?.value || 'Junior',
          isDisabled: disCol ? /yes|y|true|1|disabled/i.test(String(dRow[disCol.columnIndex] || '')) : false,
        });
      }

      if (employees.length > 0) {
        addLog(logs, `Management Control: Extracted ${employees.length} employees`, 'success');
        return employees;
      }
    }
  }
  return [];
}

function parseMCBroadScan(data: any[][], logs: ParseLog[]): ParsedEmployee[] {
  const employees: ParsedEmployee[] = [];

  for (let scanRow = 0; scanRow < Math.min(data.length, 40); scanRow++) {
    const row = data[scanRow];
    if (!row) continue;
    const headers = row.map((c: any) => String(c || '').toLowerCase().trim());

    let nameIdx = -1, genderIdx = -1, raceIdx = -1, desigIdx = -1;
    for (let c = 0; c < headers.length; c++) {
      const h = headers[c];
      if (!h) continue;
      if (nameIdx === -1 && /name|surname|employee|staff|person/i.test(h)) nameIdx = c;
      if (genderIdx === -1 && /gender|sex|m\/f|male/i.test(h)) genderIdx = c;
      if (raceIdx === -1 && /race|population|demographic|african|ethnicity/i.test(h)) raceIdx = c;
      if (desigIdx === -1 && /level|designation|position|role|title|grade|occupational|category|management/i.test(h)) desigIdx = c;
    }

    if (nameIdx >= 0 && (genderIdx >= 0 || raceIdx >= 0)) {
      addLog(logs, `Management Control: Found employee headers at row ${scanRow + 1}`, 'info');
      for (let i = scanRow + 1; i < data.length; i++) {
        const dRow = data[i];
        if (!dRow) continue;
        const name = String(dRow[nameIdx] || '').trim();
        if (!name || name.length < 2 || isJunkRow(name)) continue;

        const genderEntity = genderIdx >= 0 ? extractEntity(dRow[genderIdx]) : null;
        const raceEntity = raceIdx >= 0 ? extractEntity(dRow[raceIdx]) : null;
        const desigEntity = desigIdx >= 0 ? extractEntity(dRow[desigIdx]) : null;

        employees.push({
          name,
          gender: genderEntity?.value || 'Male',
          race: raceEntity?.value || 'White',
          designation: desigEntity?.value || 'Junior',
          isDisabled: false,
        });
      }
      if (employees.length > 0) return employees;
    }
  }

  return employees;
}

function parseMCCrossTab(data: any[][], logs: ParseLog[]): ParsedEmployee[] {
  const DESIG_DETECT: [RegExp, string][] = [
    [/^board\b|^directors?\b|^non[\s-]*exec/i, 'Board'],
    [/^top\s*manage|^executive|^c[\s-]*suite|^chief|^managing\s*dir|^exec\s*dir/i, 'Executive'],
    [/^senior\s*manage|^profession|^snr\s*manage|^senior$/i, 'Senior'],
    [/^middle\s*manage|^skilled\s*tech|^academically|^mid[\s-]*manage|^middle$/i, 'Middle'],
    [/^junior\s*manage|^semi[\s-]*skilled|^unskilled|^junior$|^discretion|^temporary|^other\s*manage|^entry|^labou?r/i, 'Junior'],
  ];

  const desigRows: { idx: number; designation: string; raw: string }[] = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[0]) continue;
    const cell0 = String(row[0]).trim();
    if (!cell0 || cell0.length < 3) continue;
    for (const [pattern, designation] of DESIG_DETECT) {
      if (pattern.test(cell0)) {
        const numericCells = row.slice(1).filter((c: any) => typeof c === 'number' && !isNaN(c) && c >= 0);
        if (numericCells.length >= 2) {
          desigRows.push({ idx: i, designation, raw: cell0 });
        }
        break;
      }
    }
  }

  if (desigRows.length < 2) return [];
  addLog(logs, `MC Cross-tab: Found ${desigRows.length} designation rows: ${desigRows.map(d => d.raw).join(', ')}`, 'info');

  const firstDesigIdx = desigRows[0].idx;
  type ColDef = { race: string; gender: string };
  const colDefs: Map<number, ColDef> = new Map();

  const RACE_ABBREVS: Record<string, string> = {
    'a': 'African', 'af': 'African', 'african': 'African', 'ba': 'African', 'black african': 'African',
    'c': 'Coloured', 'col': 'Coloured', 'coloured': 'Coloured', 'bc': 'Coloured',
    'i': 'Indian', 'ind': 'Indian', 'indian': 'Indian', 'bi': 'Indian',
    'w': 'White', 'wh': 'White', 'white': 'White',
  };

  const genderByCol: Record<number, string> = {};
  const raceByCol: Record<number, string> = {};

  for (let r = Math.max(0, firstDesigIdx - 5); r < firstDesigIdx; r++) {
    const row = data[r];
    if (!row) continue;
    for (let c = 1; c < row.length; c++) {
      const cell = String(row[c] || '').trim().toLowerCase();
      if (!cell) continue;

      const combo = cell.replace(/\s+/g, '');
      if (combo.length === 2) {
        const raceMap: Record<string, string> = { 'a': 'African', 'c': 'Coloured', 'i': 'Indian', 'w': 'White' };
        const genMap: Record<string, string> = { 'm': 'Male', 'f': 'Female' };
        if (raceMap[combo[0]] && genMap[combo[1]]) {
          colDefs.set(c, { race: raceMap[combo[0]], gender: genMap[combo[1]] });
          continue;
        }
      }

      if (/^male$/i.test(cell) || (cell === 'm' && c < 10)) genderByCol[c] = 'Male';
      if (/^female$/i.test(cell) || (cell === 'f' && c < 20)) genderByCol[c] = 'Female';
      if (RACE_ABBREVS[cell]) raceByCol[c] = RACE_ABBREVS[cell];

      const parts = cell.split(/[\s,]+/);
      if (parts.length === 2) {
        let gender = '', race = '';
        for (const p of parts) {
          if (/^male$|^m$/i.test(p)) gender = 'Male';
          else if (/^female$|^f$/i.test(p)) gender = 'Female';
          else if (RACE_ABBREVS[p]) race = RACE_ABBREVS[p];
        }
        if (gender && race) { colDefs.set(c, { gender, race }); continue; }
      }
    }
  }

  if (Object.keys(genderByCol).length > 0 && Object.keys(raceByCol).length > 0 && colDefs.size === 0) {
    const maxCol = Math.max(...Object.keys(raceByCol).map(Number));
    let currentGender = 'Male';
    for (let c = 1; c <= maxCol; c++) {
      if (genderByCol[c]) currentGender = genderByCol[c];
      if (raceByCol[c]) colDefs.set(c, { race: raceByCol[c], gender: currentGender });
    }
  }

  if (colDefs.size < 4) {
    const firstRow = data[firstDesigIdx];
    if (firstRow) {
      const numericCols: number[] = [];
      for (let c = 1; c < firstRow.length; c++) {
        if (typeof firstRow[c] === 'number') numericCols.push(c);
      }
      if (numericCols.length >= 8) {
        const races = ['African', 'Coloured', 'Indian', 'White'];
        for (let g = 0; g < 2; g++) {
          const gender = g === 0 ? 'Male' : 'Female';
          for (let ri = 0; ri < 4; ri++) {
            const colIdx = numericCols[g * 4 + ri];
            if (colIdx !== undefined) colDefs.set(colIdx, { race: races[ri], gender });
          }
        }
      }
    }
  }

  if (colDefs.size === 0) {
    addLog(logs, `MC Cross-tab: Could not determine column mapping`, 'warning');
    return [];
  }
  addLog(logs, `MC Cross-tab: Mapped ${colDefs.size} demographic columns`, 'info');

  const employees: ParsedEmployee[] = [];
  let id = 0;
  for (const { idx, designation } of desigRows) {
    const row = data[idx];
    if (!row) continue;
    for (const [colIdx, def] of colDefs) {
      const count = typeof row[colIdx] === 'number' ? Math.round(row[colIdx]) : parseInt(String(row[colIdx] || '0'));
      if (isNaN(count) || count <= 0) continue;
      for (let n = 0; n < Math.min(count, 1000); n++) {
        id++;
        employees.push({
          name: `${designation}_${def.race}_${def.gender}_${n + 1}`,
          gender: def.gender,
          race: def.race,
          designation,
          isDisabled: false,
        });
      }
    }
  }

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[0]) continue;
    if (/disabled|disability|pwd/i.test(String(row[0]).toLowerCase())) {
      let totalDisabled = 0;
      for (let c = 1; c < row.length; c++) {
        const n = typeof row[c] === 'number' ? row[c] : parseInt(String(row[c] || '0'));
        if (!isNaN(n) && n > 0) totalDisabled += n;
      }
      let remaining = Math.min(totalDisabled, employees.length);
      for (let e = 0; e < employees.length && remaining > 0; e++) {
        employees[e].isDisabled = true;
        remaining--;
      }
      if (totalDisabled > 0) addLog(logs, `MC Cross-tab: Marked ${totalDisabled} employees as disabled`, 'info');
      break;
    }
  }

  if (employees.length > 0) {
    addLog(logs, `MC Cross-tab: Generated ${employees.length} employees from ${desigRows.length} occupational levels`, 'success');
  }
  return employees;
}

function parseOwnershipSummary(data: any[][], logs: ParseLog[]): ParsedShareholder[] {
  let blackOwnership = 0;
  let blackWomenOwnership = 0;

  for (const row of data) {
    if (!row || row.length < 2) continue;
    for (let col = 0; col < row.length - 1; col++) {
      const label = String(row[col] || '').toLowerCase().trim();
      if (!label) continue;
      for (let vc = col + 1; vc < Math.min(row.length, col + 4); vc++) {
        const value = row[vc];
        if (value === null || value === undefined) continue;
        if (/black\s*own|bo\s*%|black\s*%|hdsa|voting\s*right.*black|black\s*voting|economic\s*interest.*black/i.test(label) && !/women|female|bwo/i.test(label)) {
          const pct = extractPercentage(value);
          if (pct !== null && pct > 0) blackOwnership = Math.max(blackOwnership, pct);
        }
        if (/black\s*wom|bwo|female\s*black|women\s*own|black\s*female/i.test(label)) {
          const pct = extractPercentage(value);
          if (pct !== null && pct > 0) blackWomenOwnership = Math.max(blackWomenOwnership, pct);
        }
      }
    }
  }

  if (blackOwnership > 0) {
    addLog(logs, `Ownership Summary: Black Ownership ${(blackOwnership * 100).toFixed(1)}%, BWO ${(blackWomenOwnership * 100).toFixed(1)}%`, 'success');
    return [{ name: 'Ownership (Summary)', blackOwnership, blackWomenOwnership, shares: 1, shareValue: 0 }];
  }
  return [];
}

function parseScorecardSheet(data: any[][], logs: ParseLog[]): Record<string, number> | null {
  const result: Record<string, number> = {};
  const PILLAR_PATTERNS: [RegExp, string][] = [
    [/ownership|equity\s*own/i, 'ownership'],
    [/management\s*control/i, 'managementControl'],
    [/employment\s*equity/i, 'employmentEquity'],
    [/skills?\s*develop/i, 'skillsDevelopment'],
    [/preferential\s*proc|^procurement$/i, 'preferentialProcurement'],
    [/enterprise.*develop|supplier.*develop|^esd$/i, 'enterpriseSupplierDevelopment'],
    [/socio[\s-]*economic|^sed$|social\s*develop/i, 'socioEconomicDevelopment'],
    [/yes\s*init|youth\s*employ/i, 'yesInitiative'],
    [/^total\s*(score|points|weighted)?$/i, 'totalPoints'],
  ];

  let scoreColIdx = -1;
  let headerRowIdx = -1;
  for (let r = 0; r < Math.min(data.length, 20); r++) {
    const row = data[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const h = String(row[c] || '').toLowerCase().trim();
      if (/^(score|achieved|actual|points\s*scored|verified|result|weighted\s*score|bonus\s*points)$/i.test(h)) {
        scoreColIdx = c;
        headerRowIdx = r;
        break;
      }
    }
    if (scoreColIdx >= 0) break;
  }

  const startRow = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;
  for (let r = startRow; r < data.length; r++) {
    const row = data[r];
    if (!row) continue;
    for (let c = 0; c < Math.min(row.length, 4); c++) {
      const cellStr = String(row[c] || '').trim();
      if (!cellStr || cellStr.length < 3) continue;
      for (const [pattern, key] of PILLAR_PATTERNS) {
        if (pattern.test(cellStr) && result[key] === undefined) {
          let score: number | null = null;
          if (scoreColIdx >= 0 && row[scoreColIdx] !== undefined) {
            const v = row[scoreColIdx];
            if (typeof v === 'number' && !isNaN(v) && v >= 0) score = v;
          }
          if (score === null) {
            for (let vc = row.length - 1; vc > c; vc--) {
              const v = row[vc];
              if (typeof v === 'number' && !isNaN(v) && v >= 0 && v <= 200) { score = v; break; }
            }
          }
          if (score !== null) result[key] = score;
          break;
        }
      }
    }
  }

  const count = Object.keys(result).length;
  if (count >= 3) {
    addLog(logs, `Scorecard: Extracted ${count} reference values: ${Object.entries(result).map(([k, v]) => `${k}=${v}`).join(', ')}`, 'success');
    return result;
  }
  return null;
}

function parseSkillsSheet(data: any[][], logs: ParseLog[]): ParsedTrainingProgram[] {
  const CATEGORY_MAP: Record<string, string> = {
    'bursary': 'bursary', 'bursaries': 'bursary', 'scholarship': 'bursary',
    'learnership': 'learnership', 'learnerships': 'learnership',
    'apprenticeship': 'apprenticeship', 'apprenticeships': 'apprenticeship',
    'short course': 'short course', 'workshop': 'short course', 'seminar': 'short course',
    'training': 'short course', 'course': 'short course', 'program': 'short course',
    'internship': 'learnership', 'internships': 'learnership',
    'informal': 'short course', 'informal training': 'short course',
    'work-integrated': 'learnership', 'work integrated': 'learnership',
    'mandatory': 'short course', 'mandatory sectoral': 'short course',
  };

  for (let scanRow = 0; scanRow < Math.min(data.length, 30); scanRow++) {
    const row = data[scanRow];
    if (!row) continue;
    const headers = row.map((c: any) => String(c || '').trim());
    const matches = matchHeaders(headers, SKILLS_FIELDS);

    if (matches.length >= 2) {
      addLog(logs, `Skills Development: Found headers at row ${scanRow + 1}, matched ${matches.length} columns`, 'info');

      const nameCol = matches.find(m => m.field === 'Program Name');
      const catCol = matches.find(m => m.field === 'Category');
      const costCol = matches.find(m => m.field === 'Cost');
      const learnerCol = matches.find(m => m.field === 'Learner Name');
      const raceCol = matches.find(m => m.field === 'Race');
      const employedCol = matches.find(m => m.field === 'Employed');

      const programs: ParsedTrainingProgram[] = [];

      for (let i = scanRow + 1; i < data.length; i++) {
        const dRow = data[i];
        if (!dRow) continue;

        const name = nameCol ? String(dRow[nameCol.columnIndex] || '').trim() : '';
        if (!name || name.length < 2 || isJunkRow(name)) continue;

        const catRaw = catCol ? String(dRow[catCol.columnIndex] || '').toLowerCase().trim() : '';
        const category = CATEGORY_MAP[catRaw] || 'short course';
        const cost = costCol ? extractCurrency(dRow[costCol.columnIndex]) : null;
        const learnerName = learnerCol ? String(dRow[learnerCol.columnIndex] || '').trim() : undefined;
        const raceEntity = raceCol ? extractEntity(dRow[raceCol.columnIndex]) : null;
        const isBlack = raceEntity ? ['African', 'Coloured', 'Indian'].includes(raceEntity.value) : false;
        const isEmployed = employedCol ? /yes|y|true|1|employed/i.test(String(dRow[employedCol.columnIndex] || '')) : true;

        programs.push({
          name,
          category,
          cost: cost ?? 0,
          learnerName: learnerName && !isJunkRow(learnerName) ? learnerName : undefined,
          isEmployed,
          isBlack,
        });
      }

      if (programs.length > 0) {
        addLog(logs, `Skills Development: Extracted ${programs.length} training programs`, 'success');
        return programs;
      }
    }
  }

  addLog(logs, `Skills Development: No structured training data found`, 'warning');
  return [];
}

function parseProcurementSheet(data: any[][], logs: ParseLog[]): ParsedSupplier[] {
  for (let scanRow = 0; scanRow < Math.min(data.length, 30); scanRow++) {
    const row = data[scanRow];
    if (!row) continue;
    const headers = row.map((c: any) => String(c || '').trim());
    const matches = matchHeaders(headers, PROCUREMENT_FIELDS);

    if (matches.length >= 2) {
      addLog(logs, `Procurement: Found headers at row ${scanRow + 1}, matched ${matches.length} columns`, 'info');

      const nameCol = matches.find(m => m.field === 'Supplier Name');
      const levelCol = matches.find(m => m.field === 'B-BBEE Level');
      const boCol = matches.find(m => m.field === 'Black Ownership');
      const spendCol = matches.find(m => m.field === 'Spend');

      const suppliers: ParsedSupplier[] = [];

      for (let i = scanRow + 1; i < data.length; i++) {
        const dRow = data[i];
        if (!dRow) continue;

        const name = nameCol ? String(dRow[nameCol.columnIndex] || '').trim() : '';
        if (!name || name.length < 2 || isJunkRow(name)) continue;

        const levelEntity = levelCol ? extractEntity(dRow[levelCol.columnIndex]) : null;
        const bo = boCol ? extractPercentage(dRow[boCol.columnIndex]) : null;
        const spend = spendCol ? extractCurrency(dRow[spendCol.columnIndex]) : null;

        suppliers.push({
          name,
          beeLevel: levelEntity?.type === 'bee_level' ? levelEntity.value : (typeof dRow[levelCol?.columnIndex ?? -1] === 'number' ? Math.min(8, Math.max(0, Math.round(dRow[levelCol?.columnIndex ?? -1]))) : 0),
          blackOwnership: bo ?? 0,
          spend: spend ?? 0,
        });
      }

      if (suppliers.length > 0) {
        addLog(logs, `Procurement: Extracted ${suppliers.length} suppliers`, 'success');
        return suppliers;
      }
    }
  }

  addLog(logs, `Procurement: Trying broad column scan...`, 'info');
  for (let scanRow = 0; scanRow < Math.min(data.length, 40); scanRow++) {
    const row = data[scanRow];
    if (!row) continue;
    const headers = row.map((c: any) => String(c || '').toLowerCase().trim());

    let nameIdx = -1, spendIdx = -1, levelIdx = -1;
    for (let c = 0; c < headers.length; c++) {
      const h = headers[c];
      if (!h) continue;
      if (nameIdx === -1 && /supplier|vendor|name|company|entity|service\s*provider/i.test(h)) nameIdx = c;
      if (spendIdx === -1 && /spend|amount|value|cost|total|rand|procurement/i.test(h)) spendIdx = c;
      if (levelIdx === -1 && /level|bee|b-bbee|bbbee|status|contributor/i.test(h)) levelIdx = c;
    }

    if (nameIdx >= 0 && (spendIdx >= 0 || levelIdx >= 0)) {
      const suppliers: ParsedSupplier[] = [];
      for (let i = scanRow + 1; i < data.length; i++) {
        const dRow = data[i];
        if (!dRow) continue;
        const name = String(dRow[nameIdx] || '').trim();
        if (!name || name.length < 2 || isJunkRow(name)) continue;

        const levelEntity = levelIdx >= 0 ? extractEntity(dRow[levelIdx]) : null;
        const spend = spendIdx >= 0 ? extractCurrency(dRow[spendIdx]) : null;

        suppliers.push({
          name,
          beeLevel: levelEntity?.type === 'bee_level' ? levelEntity.value : 0,
          blackOwnership: 0,
          spend: spend ?? 0,
        });
      }
      if (suppliers.length > 0) {
        addLog(logs, `Procurement: Extracted ${suppliers.length} suppliers (broad scan)`, 'success');
        return suppliers;
      }
    }
  }

  addLog(logs, `Procurement: No supplier data found`, 'warning');
  return [];
}

function parseEsdSedSheet(data: any[][], logs: ParseLog[], category: string): ParsedContribution[] {
  for (let scanRow = 0; scanRow < Math.min(data.length, 30); scanRow++) {
    const row = data[scanRow];
    if (!row) continue;
    const headers = row.map((c: any) => String(c || '').trim());
    const matches = matchHeaders(headers, ESD_FIELDS);

    if (matches.length >= 2) {
      addLog(logs, `${category}: Found headers at row ${scanRow + 1}, matched ${matches.length} columns`, 'info');

      const nameCol = matches.find(m => m.field === 'Beneficiary');
      const typeCol = matches.find(m => m.field === 'Type');
      const amtCol = matches.find(m => m.field === 'Amount');
      const catCol = matches.find(m => m.field === 'Category');

      const contributions: ParsedContribution[] = [];

      for (let i = scanRow + 1; i < data.length; i++) {
        const dRow = data[i];
        if (!dRow) continue;

        const name = nameCol ? String(dRow[nameCol.columnIndex] || '').trim() : '';
        if (!name || name.length < 2 || isJunkRow(name)) continue;

        const amount = amtCol ? extractCurrency(dRow[amtCol.columnIndex]) : null;

        contributions.push({
          beneficiary: name,
          type: typeCol ? String(dRow[typeCol.columnIndex] || 'grant').toLowerCase().replace(/\s+/g, '_') : 'grant',
          amount: amount ?? 0,
          category: catCol ? String(dRow[catCol.columnIndex] || category).toLowerCase().replace(/\s+/g, '_') : category,
        });
      }

      if (contributions.length > 0) {
        addLog(logs, `${category}: Extracted ${contributions.length} contributions`, 'success');
        return contributions;
      }
    }
  }

  addLog(logs, `${category}: Trying broad scan...`, 'info');
  for (let scanRow = 0; scanRow < Math.min(data.length, 40); scanRow++) {
    const row = data[scanRow];
    if (!row) continue;
    const headers = row.map((c: any) => String(c || '').toLowerCase().trim());

    let nameIdx = -1, amtIdx = -1, typeIdx = -1;
    for (let c = 0; c < headers.length; c++) {
      const h = headers[c];
      if (!h) continue;
      if (nameIdx === -1 && /beneficiary|recipient|name|entity|company|supplier|enterprise/i.test(h)) nameIdx = c;
      if (amtIdx === -1 && /amount|value|spend|cost|total|rand|contribution|monetary/i.test(h)) amtIdx = c;
      if (typeIdx === -1 && /type|nature|description|form|method|support/i.test(h)) typeIdx = c;
    }

    if (nameIdx >= 0 && amtIdx >= 0) {
      const contributions: ParsedContribution[] = [];
      for (let i = scanRow + 1; i < data.length; i++) {
        const dRow = data[i];
        if (!dRow) continue;
        const name = String(dRow[nameIdx] || '').trim();
        if (!name || name.length < 2 || isJunkRow(name)) continue;

        const amount = extractCurrency(dRow[amtIdx]);

        contributions.push({
          beneficiary: name,
          type: typeIdx >= 0 ? String(dRow[typeIdx] || 'grant').toLowerCase().replace(/\s+/g, '_') : 'grant',
          amount: amount ?? 0,
          category,
        });
      }
      if (contributions.length > 0) {
        addLog(logs, `${category}: Extracted ${contributions.length} contributions (broad scan)`, 'success');
        return contributions;
      }
    }
  }

  addLog(logs, `${category}: No contribution data found`, 'warning');
  return [];
}

function detectSheetContentType(data: any[][]): string | null {
  const allText = data.slice(0, 50).flat().map(c => String(c || '').toLowerCase()).join(' ');

  if (/shareholder|shareholding|voting\s*right|economic\s*interest|ownership\s*chain|flow.through/i.test(allText) && /black|bo\s*%|bwo|hdsa/i.test(allText)) return 'ownership';
  if (/employee|personnel|staff|occupational\s*level|management\s*control|race.*gender|gender.*race|african.*coloured|male.*female/i.test(allText) && /designation|level|board|executive|senior|middle|junior/i.test(allText)) return 'management';
  if (/supplier|vendor|procurement|preferential|b-?bbee\s*level|spend.*amount|total.*spend/i.test(allText) && /level\s*[1-8]|recognition/i.test(allText)) return 'procurement';
  if (/training|learnership|bursary|skills?\s*development|leviable|sdp|programme|intervention/i.test(allText) && /cost|spend|learner|employed/i.test(allText)) return 'skills';
  if (/enterprise\s*(and\s*)?supplier\s*development|esd|supplier\s*development|enterprise\s*development/i.test(allText) && /beneficiary|contribution|amount|grant|loan/i.test(allText)) return 'esd';
  if (/socio.economic|sed|social\s*development|csi|corporate\s*social/i.test(allText) && /beneficiary|contribution|amount|donation/i.test(allText)) return 'sed';
  if (/revenue|turnover|npat|net\s*profit|leviable|financial|income\s*statement|profit.*loss/i.test(allText) && /r\s*[\d,]+|rand|\d{4,}/i.test(allText)) return 'financials';
  if (/company\s*name|client\s*name|entity\s*name|registration|vat\s*number|financial\s*year/i.test(allText)) return 'client';
  if (/yes\s*initiative|youth\s*employment|y\.?e\.?s/i.test(allText)) return 'yes';
  if (/scorecard|total\s*points|bee\s*level|recognition\s*level|element\s*weight/i.test(allText)) return 'scorecard';

  return null;
}

export function parseExcelBuffer(buffer: Buffer, filename: string): ParseResult {
  const logs: ParseLog[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  addLog(logs, `Starting import of "${filename}"`, 'info');

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch (e: any) {
    addLog(logs, `Failed to read file: ${e.message}`, 'error');
    return {
      success: false, client: {}, shareholders: [], employees: [], trainingPrograms: [], suppliers: [],
      esdContributions: [], sedContributions: [], sheetsFound: [], sheetsMatched: [],
      errors: [`Could not parse "${filename}". Is this a valid Excel file?`], warnings: [], logs,
      stats: { totalSheets: 0, matchedSheets: 0, entitiesExtracted: 0, confidence: 0 },
    };
  }

  const sheetNames = workbook.SheetNames;
  addLog(logs, `Found ${sheetNames.length} sheet(s): ${sheetNames.join(', ')}`, 'info');

  const sheetsMatched: { sheetName: string; matchedTo: string; confidence: number }[] = [];
  const sheetMap: Record<string, string> = {};
  const sheetMapConfidence: Record<string, number> = {};

  for (const name of sheetNames) {
    const match = matchSheetName(name, EXPECTED_SHEETS);
    if (match) {
      sheetsMatched.push({ sheetName: name, matchedTo: match.key, confidence: match.confidence });
      if (!sheetMap[match.key] || match.confidence > (sheetMapConfidence[match.key] || 0)) {
        sheetMap[match.key] = name;
        sheetMapConfidence[match.key] = match.confidence;
      }
      addLog(logs, `Sheet "${name}" → matched to "${match.key}" (${(match.confidence * 100).toFixed(0)}% confidence)`, 'success');
    } else {
      addLog(logs, `Sheet "${name}" → no name match, will scan content`, 'info');
    }
  }

  const unmatchedSheets = sheetNames.filter(n => !sheetsMatched.some(m => m.sheetName === n));
  for (const name of unmatchedSheets) {
    const data = getSheetData(workbook, name);
    if (data.length < 2) continue;
    const detected = detectSheetContentType(data);
    if (detected) {
      const confidence = 0.6;
      sheetsMatched.push({ sheetName: name, matchedTo: detected, confidence });
      if (!sheetMap[detected] || confidence > (sheetMapConfidence[detected] || 0)) {
        sheetMap[detected] = name;
        sheetMapConfidence[detected] = confidence;
      }
      addLog(logs, `Sheet "${name}" → content detected as "${detected}" (${(confidence * 100).toFixed(0)}% confidence)`, 'success');
    } else {
      warnings.push(`Sheet "${name}" was not recognized as B-BBEE data`);
    }
  }

  addLog(logs, `Using best matches: ${Object.entries(sheetMap).map(([k, v]) => `${k} → "${v}"`).join(', ')}`, 'info');

  if (sheetsMatched.length === 0) {
    addLog(logs, 'No recognizable B-BBEE sheets found. Attempting to extract client data from all sheets...', 'warning');
  }

  let client: ParsedClient = {};
  let shareholders: ParsedShareholder[] = [];
  let employees: ParsedEmployee[] = [];
  let trainingPrograms: ParsedTrainingProgram[] = [];
  let suppliers: ParsedSupplier[] = [];
  let esdContributions: ParsedContribution[] = [];
  let sedContributions: ParsedContribution[] = [];

  addLog(logs, `Scanning all sheets for client/financial data...`, 'info');
  for (const name of sheetNames) {
    const data = getSheetData(workbook, name);
    const partial = parseClientSheet(data, logs);
    const nonEmpty = Object.fromEntries(Object.entries(partial).filter(([_, v]) => v !== undefined && v !== null && v !== ''));
    client = { ...client, ...nonEmpty };
  }

  for (const name of sheetNames) {
    const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalized === 'imports' || normalized === 'import') {
      addLog(logs, `Parsing Imports sheet "${name}" for TMPS exclusions...`, 'info');
      const data = getSheetData(workbook, name);
      let importsTotal = 0;
      for (const row of data) {
        if (!row) continue;
        for (const cell of row) {
          if (typeof cell === 'number' && cell > 1000 && !isNaN(cell)) {
            importsTotal += cell;
          }
        }
        for (let col = 0; col < row.length - 1; col++) {
          const label = String(row[col] || '').toLowerCase().trim();
          if (/total|sum|import|exclusion|tmps/i.test(label)) {
            const amt = extractCurrency(row[col + 1]);
            if (amt && amt > 0) {
              client.tmpsExclusions = amt;
              addLog(logs, `Extracted Imports/TMPS Exclusions total: R${amt.toLocaleString()}`, 'success');
            }
          }
        }
      }
      if (!client.tmpsExclusions && importsTotal > 0) {
        client.tmpsExclusions = importsTotal;
        addLog(logs, `Imports sum total: R${importsTotal.toLocaleString()}`, 'info');
      }
      if (client.revenue && client.tmpsExclusions && !client.tmps) {
        client.tmps = client.revenue - client.tmpsExclusions;
        addLog(logs, `TMPS calculated: Revenue (R${client.revenue.toLocaleString()}) - Imports (R${client.tmpsExclusions.toLocaleString()}) = R${client.tmps.toLocaleString()}`, 'success');
      }
    }
  }

  if (sheetMap['ownership']) {
    addLog(logs, `Parsing ownership data from "${sheetMap['ownership']}"...`, 'info');
    const data = getSheetData(workbook, sheetMap['ownership']);
    shareholders = parseOwnershipSheet(data, logs);
  }

  if (sheetMap['management']) {
    addLog(logs, `Parsing management control from "${sheetMap['management']}"...`, 'info');
    const data = getSheetData(workbook, sheetMap['management']);
    employees = parseMCSheet(data, logs);
  }

  if (sheetMap['skills']) {
    addLog(logs, `Parsing skills development from "${sheetMap['skills']}"...`, 'info');
    const data = getSheetData(workbook, sheetMap['skills']);
    trainingPrograms = parseSkillsSheet(data, logs);
  }

  if (sheetMap['procurement']) {
    addLog(logs, `Parsing procurement data from "${sheetMap['procurement']}"...`, 'info');
    const data = getSheetData(workbook, sheetMap['procurement']);
    suppliers = parseProcurementSheet(data, logs);
    if (!client.tmps && suppliers.length > 0) {
      const totalSpend = suppliers.reduce((sum, s) => sum + s.spend, 0);
      if (totalSpend > 0) {
        client.tmps = totalSpend;
        addLog(logs, `TMPS auto-calculated from supplier spend: R${totalSpend.toLocaleString()}`, 'info');
      }
    }
  }

  if (sheetMap['esd']) {
    addLog(logs, `Parsing ESD data from "${sheetMap['esd']}"...`, 'info');
    const data = getSheetData(workbook, sheetMap['esd']);
    esdContributions = parseEsdSedSheet(data, logs, 'enterprise_development');
  }

  if (sheetMap['sed']) {
    addLog(logs, `Parsing SED data from "${sheetMap['sed']}"...`, 'info');
    const data = getSheetData(workbook, sheetMap['sed']);
    sedContributions = parseEsdSedSheet(data, logs, 'socio_economic');
  }

  if (shareholders.length === 0) {
    addLog(logs, `Ownership: No tabular shareholders found, scanning all sheets for summary ownership data...`, 'info');
    for (const name of sheetNames) {
      const data = getSheetData(workbook, name);
      if (data.length < 2) continue;
      const summary = parseOwnershipSummary(data, logs);
      if (summary.length > 0) {
        shareholders = summary;
        addLog(logs, `Found ownership summary in sheet "${name}"`, 'success');
        if (!sheetsMatched.some(m => m.sheetName === name && m.matchedTo === 'ownership')) {
          sheetsMatched.push({ sheetName: name, matchedTo: 'ownership', confidence: 0.6 });
        }
        break;
      }
    }
  }

  let scorecardValues: Record<string, number> | null = null;
  if (sheetMap['scorecard']) {
    addLog(logs, `Parsing scorecard reference values from "${sheetMap['scorecard']}"...`, 'info');
    const data = getSheetData(workbook, sheetMap['scorecard']);
    scorecardValues = parseScorecardSheet(data, logs);
  }
  if (!scorecardValues) {
    for (const name of sheetNames) {
      const lower = name.toLowerCase();
      if (/scorecard|summary|score|result|dashboard/i.test(lower)) {
        const data = getSheetData(workbook, name);
        scorecardValues = parseScorecardSheet(data, logs);
        if (scorecardValues) break;
      }
    }
  }

  if (shareholders.length === 0 || employees.length === 0 || suppliers.length === 0) {
    addLog(logs, `Some pillars had no data — scanning remaining sheets for missing data...`, 'info');
    const alreadyUsed = new Set(Object.values(sheetMap));

    for (const name of sheetNames) {
      if (alreadyUsed.has(name)) continue;
      const data = getSheetData(workbook, name);
      if (data.length < 3) continue;

      if (shareholders.length === 0) {
        const sh = parseOwnershipSheet(data, logs);
        if (sh.length > 0) {
          shareholders = sh;
          addLog(logs, `Found ${sh.length} shareholders in fallback sheet "${name}"`, 'success');
          alreadyUsed.add(name);
          if (!sheetsMatched.some(m => m.sheetName === name)) {
            sheetsMatched.push({ sheetName: name, matchedTo: 'ownership', confidence: 0.5 });
          }
          continue;
        }
      }

      if (employees.length === 0) {
        const emp = parseMCSheet(data, logs);
        if (emp.length > 0) {
          employees = emp;
          addLog(logs, `Found ${emp.length} employees in fallback sheet "${name}"`, 'success');
          alreadyUsed.add(name);
          if (!sheetsMatched.some(m => m.sheetName === name)) {
            sheetsMatched.push({ sheetName: name, matchedTo: 'management', confidence: 0.5 });
          }
          continue;
        }
      }

      if (suppliers.length === 0) {
        const sup = parseProcurementSheet(data, logs);
        if (sup.length > 0) {
          suppliers = sup;
          addLog(logs, `Found ${sup.length} suppliers in fallback sheet "${name}"`, 'success');
          alreadyUsed.add(name);
          if (!sheetsMatched.some(m => m.sheetName === name)) {
            sheetsMatched.push({ sheetName: name, matchedTo: 'procurement', confidence: 0.5 });
          }
          continue;
        }
      }

      if (trainingPrograms.length === 0) {
        const tp = parseSkillsSheet(data, logs);
        if (tp.length > 0) {
          trainingPrograms = tp;
          addLog(logs, `Found ${tp.length} training programs in fallback sheet "${name}"`, 'success');
          alreadyUsed.add(name);
          if (!sheetsMatched.some(m => m.sheetName === name)) {
            sheetsMatched.push({ sheetName: name, matchedTo: 'skills', confidence: 0.5 });
          }
          continue;
        }
      }
    }
  }

  if (!client.name) { warnings.push('Client name could not be detected'); addLog(logs, 'Client name not found — using filename as fallback', 'warning'); client.name = filename.replace(/\.(xlsx?|csv)$/i, ''); }
  if (!client.revenue) { warnings.push('Revenue not detected'); addLog(logs, 'Revenue data missing', 'warning'); }
  if (client.npat === undefined) { warnings.push('NPAT not detected'); addLog(logs, 'NPAT data missing', 'warning'); }

  const entitiesExtracted = shareholders.length + employees.length + trainingPrograms.length + suppliers.length + esdContributions.length + sedContributions.length;
  const dataSections = [shareholders.length > 0, employees.length > 0, trainingPrograms.length > 0, suppliers.length > 0, (client.revenue || 0) > 0].filter(Boolean).length;
  const overallConfidence = Math.min(1, (sheetsMatched.reduce((s, m) => s + m.confidence, 0) / Math.max(1, sheetNames.length)) * (dataSections / 4 + 0.5));

  if (entitiesExtracted > 0) {
    addLog(logs, `Import complete! Extracted ${entitiesExtracted} entities across ${sheetsMatched.length} sheets.`, 'success');
  } else if (Object.values(client).some(v => v !== undefined && v !== null && v !== '')) {
    addLog(logs, `Extracted client information but no structured data rows. File may use a non-standard layout.`, 'warning');
  } else {
    addLog(logs, `No B-BBEE data could be extracted. Sheets were scanned but no recognizable data found.`, 'error');
    errors.push('No B-BBEE data could be extracted from this file. Please check the file format.');
  }

  return {
    success: entitiesExtracted > 0 || Object.values(client).some(v => v !== undefined && v !== null && v !== '' && v !== 0),
    client,
    shareholders,
    employees,
    trainingPrograms,
    suppliers,
    esdContributions,
    sedContributions,
    sheetsFound: sheetNames,
    sheetsMatched,
    errors,
    warnings,
    logs,
    stats: {
      totalSheets: sheetNames.length,
      matchedSheets: sheetsMatched.length,
      entitiesExtracted,
      confidence: overallConfidence,
    },
    scorecardValues: scorecardValues || undefined,
  };
}
