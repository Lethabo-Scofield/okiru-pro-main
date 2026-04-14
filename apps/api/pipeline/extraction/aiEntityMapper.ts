/**
 * AI Entity Mapper — Maps Extraction Results to UCS Engine Format
 *
 * The UCS engine (calculationEngine.ts) expects specific entity arrays and
 * crossPillarValues. This module:
 *   1. Validates extracted tables against UCS requirements
 *   2. Uses AI to fix/normalize malformed data
 *   3. Derives missing financials from available data
 *   4. Returns a UCS-ready payload
 *
 * This is the bridge between "what the extraction found" and
 * "what the calculation engine needs."
 */

import { chatCompletion, fastChatCompletion, isAzureOpenAIConfigured as isLLMAvailable } from './azureOpenAIClient.js';
import type { EmployeeInput, ShareholderInput, SupplierInput, ContributionInput, FinancialsInput } from '../rules/calculationEngine.js';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface ExtractionOutput {
  entities: Array<{ name: string; value: any; pillar: string; fieldType: string; confidence: number; status: string }>;
  tables: {
    shareholders?: any[];
    employees?: any[];
    suppliers?: any[];
    contributions?: any[];
    trainingPrograms?: any[];
    ownershipFinancials?: any[];
    financials?: any[];
  };
}

export interface UCSReadyPayload {
  entityValues: Record<string, { entityId: string; value: any; source: string; confidence: number }>;
  employees: EmployeeInput[];
  shareholders: ShareholderInput[];
  suppliers: SupplierInput[];
  contributions: ContributionInput[];
  trainingPrograms: any[];
  financials: FinancialsInput;
  crossPillarValues: Map<string, number>;
  dataQuality: DataQualityReport;
}

export interface DataQualityReport {
  overall: 'good' | 'partial' | 'poor';
  pillarsWithData: string[];
  pillarsWithoutData: string[];
  missingCritical: string[];
  derivedValues: string[];
  warnings: string[];
  tableRowCounts: Record<string, number>;
}

// ────────────────────────────────────────────────────────────────────────────
// Valid designation values for the UCS engine
// ────────────────────────────────────────────────────────────────────────────

const VALID_DESIGNATIONS = [
  'Board', 'Executive', 'Executive Director', 'Other Executive Management',
  'Senior', 'Middle', 'Junior', 'Semi-skilled', 'Unskilled', 'Skilled Technical',
];

const DESIGNATION_ALIASES: Record<string, string> = {
  'board of directors': 'Board', 'director': 'Board', 'non-executive director': 'Board',
  'ned': 'Board', 'chairperson': 'Board', 'chairman': 'Board', 'chairwoman': 'Board',
  'ceo': 'Executive', 'cfo': 'Executive', 'coo': 'Executive', 'cio': 'Executive',
  'cto': 'Executive', 'managing director': 'Executive', 'md': 'Executive',
  'chief executive': 'Executive', 'chief financial': 'Executive',
  'executive director': 'Executive Director',
  'general manager': 'Other Executive Management', 'gm': 'Other Executive Management',
  'executive management': 'Other Executive Management', 'executive manager': 'Other Executive Management',
  'senior management': 'Senior', 'senior manager': 'Senior',
  'middle management': 'Middle', 'manager': 'Middle', 'professional': 'Middle',
  'professionally qualified': 'Middle', 'specialist': 'Middle',
  'junior management': 'Junior', 'supervisor': 'Junior', 'foreman': 'Junior',
  'semi-skilled': 'Semi-skilled', 'semi skilled': 'Semi-skilled',
  'operator': 'Semi-skilled', 'clerk': 'Semi-skilled', 'administrative': 'Semi-skilled',
  'unskilled': 'Unskilled', 'labourer': 'Unskilled', 'laborer': 'Unskilled',
  'cleaner': 'Unskilled', 'general worker': 'Unskilled',
  'skilled technical': 'Skilled Technical', 'technician': 'Skilled Technical',
  'engineer': 'Skilled Technical', 'it specialist': 'Skilled Technical',
  'artisan': 'Skilled Technical',
};

const VALID_RACES = ['African', 'Coloured', 'Indian', 'White'];
const RACE_ALIASES: Record<string, string> = {
  'black': 'African', 'african': 'African', 'black african': 'African',
  'coloured': 'Coloured', 'colored': 'Coloured', 'cape coloured': 'Coloured',
  'indian': 'Indian', 'asian': 'Indian', 'indian/asian': 'Indian',
  'white': 'White', 'caucasian': 'White',
};

// ────────────────────────────────────────────────────────────────────────────
// Normalizers
// ────────────────────────────────────────────────────────────────────────────

function normalizeDesignation(raw: string): string {
  if (!raw) return 'Junior';
  const trimmed = raw.trim();
  if (VALID_DESIGNATIONS.includes(trimmed)) return trimmed;
  const lower = trimmed.toLowerCase();
  if (DESIGNATION_ALIASES[lower]) return DESIGNATION_ALIASES[lower];
  for (const [alias, desig] of Object.entries(DESIGNATION_ALIASES)) {
    if (lower.includes(alias)) return desig;
  }
  return 'Junior';
}

function normalizeRace(raw: string): string {
  if (!raw) return 'African';
  const trimmed = raw.trim();
  if (VALID_RACES.includes(trimmed)) return trimmed;
  const lower = trimmed.toLowerCase();
  if (RACE_ALIASES[lower]) return RACE_ALIASES[lower];
  for (const [alias, race] of Object.entries(RACE_ALIASES)) {
    if (lower.includes(alias)) return race;
  }
  return 'African';
}

function normalizeGender(raw: string): string {
  if (!raw) return 'Male';
  const lower = raw.trim().toLowerCase();
  if (lower === 'f' || lower === 'female' || lower === 'woman' || lower === 'w') return 'Female';
  return 'Male';
}

function normalizeNumber(raw: any): number {
  if (typeof raw === 'number') return raw;
  if (!raw) return 0;
  const cleaned = String(raw).replace(/[^0-9.\-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function normalizePercent(raw: any): number {
  const num = normalizeNumber(raw);
  return num > 1 ? num : num * 100;
}

// ────────────────────────────────────────────────────────────────────────────
// Array Normalizers
// ────────────────────────────────────────────────────────────────────────────

function normalizeEmployees(raw: any[]): EmployeeInput[] {
  return raw.map(e => ({
    name: e.name || 'Employee',
    race: normalizeRace(e.race),
    gender: normalizeGender(e.gender),
    designation: normalizeDesignation(e.designation || e.jobLevel || e.level || e.position || e.title),
    isDisabled: !!e.isDisabled || !!e.disabled,
    isForeign: !!e.isForeign || !!e.foreign,
  }));
}

function normalizeShareholders(raw: any[]): ShareholderInput[] {
  return raw.map(s => {
    const bo = normalizePercent(s.blackOwnership || s.black_ownership || 0);
    const bwo = normalizePercent(s.blackWomenOwnership || s.black_women_ownership || s.blackFemaleOwnership || 0);
    const vr = normalizePercent(s.votingRightsPercent || s.voting_rights || s.votingRights || bo);
    const ei = normalizePercent(s.economicInterestPercent || s.economic_interest || s.economicInterest || bo);
    return {
      name: s.name || 'Shareholder',
      blackOwnership: bo,
      blackWomenOwnership: bwo,
      shares: normalizeNumber(s.shares || s.numberOfShares || 0),
      shareValue: normalizeNumber(s.shareValue || s.share_value || s.value || 0),
      yearsHeld: normalizeNumber(s.yearsHeld || s.years_held || 0),
      isDesignatedGroup: !!s.isDesignatedGroup,
      blackNewEntrant: !!s.blackNewEntrant || !!s.isNewEntrant || !!s.newEntrant,
      votingRightsPercent: vr,
      economicInterestPercent: ei,
    };
  });
}

function normalizeSuppliers(raw: any[]): SupplierInput[] {
  return raw.map(s => {
    const bo = normalizePercent(s.blackOwnership || s.black_ownership || 0);
    const bwo = normalizePercent(s.blackWomenOwnership || s.black_women_ownership || 0);
    const spend = normalizeNumber(s.spend || s.amount || s.totalSpend || 0);
    const beeLevel = normalizeNumber(s.beeLevel || s.bee_level || s.level || 0);
    const entType = String(s.enterpriseType || s.enterprise_type || s.type || 'generic').toLowerCase();

    return {
      name: s.name || 'Supplier',
      spend,
      beeLevel: Math.min(8, Math.max(0, Math.round(beeLevel))),
      blackOwnership: bo,
      blackWomenOwnership: bwo,
      enterpriseType: entType,
      isDesignatedGroup: !!s.isDesignatedGroup || bo > 0,
      isBlackOwned51: !!s.isBlackOwned51 || bo >= 51,
      isBlackWomanOwned30: !!s.isBlackWomanOwned30 || bwo >= 30,
      isEME: !!s.isEME || entType === 'eme',
      isQSE: !!s.isQSE || entType === 'qse',
      isForeignSupplier: !!s.isForeignSupplier || !!s.isForeign || !!s.foreign,
    };
  });
}

function normalizeContributions(raw: any[]): ContributionInput[] {
  return raw.map(c => {
    let category: 'sd' | 'ed' | 'sed' = 'ed';
    const rawCat = String(c.category || '').toLowerCase();
    if (rawCat === 'sd' || rawCat === 'supplier_development' || rawCat.includes('supplier dev')) category = 'sd';
    else if (rawCat === 'sed' || rawCat === 'socio_economic' || rawCat.includes('socio')) category = 'sed';
    else if (rawCat === 'ed' || rawCat === 'enterprise_development' || rawCat.includes('enterprise')) category = 'ed';
    else if (rawCat.includes('supplier')) category = 'sd';
    else if (rawCat.includes('sed')) category = 'sed';
    else if (rawCat.includes('sd')) category = 'sd';
    else if (rawCat.includes('ed')) category = 'ed';

    const contribType = String(c.type || c.contributionType || 'direct_cost').toLowerCase()
      .replace(/\s+/g, '_');

    return {
      beneficiary: c.beneficiary || c.name || 'Beneficiary',
      type: contribType,
      amount: normalizeNumber(c.amount || c.value || 0),
      category,
      benefitFactor: normalizeNumber(c.benefitFactor || c.benefit_factor || 1.0),
    };
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Financial Value Extraction from Entities
// ────────────────────────────────────────────────────────────────────────────

const FINANCIAL_ENTITY_MAP: Record<string, keyof FinancialsInput> = {
  'total_revenue': 'revenue', 'total revenue': 'revenue', 'totalrevenue': 'revenue',
  'revenue': 'revenue', 'turnover': 'revenue', 'annual_turnover': 'revenue',
  'annual turnover': 'revenue', 'annual revenue': 'revenue', 'gross revenue': 'revenue',
  'total turnover': 'revenue', 'sales revenue': 'revenue',
  'npat': 'npat', 'net profit after tax': 'npat', 'net_profit_after_tax': 'npat',
  'net profit after tax (npat)': 'npat', 'net profit': 'npat', 'pat': 'npat',
  'profit after tax': 'npat', 'deemed_npat': 'npat', 'deemed npat': 'npat',
  'deemed net profit': 'npat', 'indicative npat': 'npat', 'npat margin': 'npat',
  'leviable_amount': 'leviableAmount', 'leviable amount': 'leviableAmount',
  'leviableamount': 'leviableAmount', 'payroll': 'leviableAmount',
  'total_payroll': 'leviableAmount', 'total payroll': 'leviableAmount',
  'leviable payroll': 'leviableAmount', 'total remuneration': 'leviableAmount',
  'annual payroll': 'leviableAmount', 'staff costs': 'leviableAmount',
  'tmps': 'tmps', 'total_measured_procurement_spend': 'tmps',
  'total measured procurement spend': 'tmps',
  'tmps inclusions': 'tmps', 'tmps_inclusions': 'tmps',
  'measured procurement spend': 'tmps', 'procurement spend': 'tmps',
  'total procurement': 'tmps', 'total spend': 'tmps',
  'headcount': 'headcount', 'number_of_employees': 'headcount',
  'number of employees': 'headcount', 'total employees': 'headcount',
  'total employees (headcount)': 'headcount', 'employee count': 'headcount',
  'applicable employee headcount': 'headcount',
  'total headcount': 'headcount', 'staff count': 'headcount',
};

const OWNERSHIP_FINANCIAL_MAP: Record<string, string> = {
  'company value': 'companyValue', 'company_value': 'companyValue',
  'enterprise value': 'companyValue', 'business value': 'companyValue',
  'total company value': 'companyValue', 'equity value': 'companyValue',
  'outstanding debt': 'outstandingDebt', 'outstanding_debt': 'outstandingDebt',
  'bee debt': 'outstandingDebt', 'loan balance': 'outstandingDebt',
  'outstanding bee debt': 'outstandingDebt', 'debt attributable': 'outstandingDebt',
  'years held': 'yearsHeld', 'years_held': 'yearsHeld',
  'ownership years': 'yearsHeld', 'transaction age': 'yearsHeld',
  'years since transaction': 'yearsHeld',
};

function extractFinancialsFromEntities(
  entities: ExtractionOutput['entities'],
  tables: ExtractionOutput['tables']
): FinancialsInput {
  const financials: FinancialsInput = {
    revenue: 0,
    npat: 0,
    leviableAmount: 0,
    tmps: 0,
    headcount: 0,
  };

  for (const entity of entities) {
    if (entity.status === 'rejected' || entity.value == null) continue;
    const lower = entity.name.toLowerCase();
    let key = FINANCIAL_ENTITY_MAP[lower];
    if (!key) {
      const stripped = lower.replace(/\s*\(.*?\)\s*/g, '').trim();
      key = FINANCIAL_ENTITY_MAP[stripped];
    }
    if (key) {
      const val = normalizeNumber(entity.value);
      if (val > 0 && financials[key] === 0) {
        (financials as any)[key] = val;
      }
    }
    let ownershipKey = OWNERSHIP_FINANCIAL_MAP[lower];
    if (!ownershipKey) {
      const stripped = lower.replace(/\s*\(.*?\)\s*/g, '').trim();
      ownershipKey = OWNERSHIP_FINANCIAL_MAP[stripped];
    }
    if (ownershipKey) {
      const val = normalizeNumber(entity.value);
      if (val > 0 && !(financials as any)[ownershipKey]) {
        (financials as any)[ownershipKey] = val;
      }
    }
  }

  // Derive headcount from employees table if not found in entities
  if (financials.headcount === 0 && tables.employees?.length) {
    financials.headcount = tables.employees.length;
  }

  // Derive TMPS from supplier spend if not found in entities
  if (financials.tmps === 0 && tables.suppliers?.length) {
    const totalSupplierSpend = tables.suppliers.reduce(
      (sum: number, s: any) => sum + normalizeNumber(s.spend || s.amount || 0), 0
    );
    if (totalSupplierSpend > 0) {
      financials.tmps = totalSupplierSpend;
    }
  }

  // Derive leviableAmount from revenue if not found (estimate: 30-40% of revenue)
  if (financials.leviableAmount === 0 && financials.revenue > 0) {
    financials.leviableAmount = financials.revenue * 0.35;
  }

  // Extract from structured financials table (from AI table extraction)
  if ((tables as any).financials?.length) {
    const ft = (tables as any).financials[0];
    if (financials.revenue === 0 && normalizeNumber(ft.revenue) > 0) financials.revenue = normalizeNumber(ft.revenue);
    if (financials.npat === 0 && normalizeNumber(ft.npat) > 0) financials.npat = normalizeNumber(ft.npat);
    if (financials.leviableAmount === 0 && normalizeNumber(ft.leviableAmount || ft.leviable_amount || ft.payroll) > 0) {
      financials.leviableAmount = normalizeNumber(ft.leviableAmount || ft.leviable_amount || ft.payroll);
    }
    if (financials.tmps === 0 && normalizeNumber(ft.tmps) > 0) financials.tmps = normalizeNumber(ft.tmps);
    if (financials.headcount === 0 && normalizeNumber(ft.headcount) > 0) financials.headcount = normalizeNumber(ft.headcount);
    if (normalizeNumber(ft.companyValue) > 0 && !(financials as any).companyValue) {
      (financials as any).companyValue = normalizeNumber(ft.companyValue);
    }
    if (normalizeNumber(ft.outstandingDebt) > 0 && !(financials as any).outstandingDebt) {
      (financials as any).outstandingDebt = normalizeNumber(ft.outstandingDebt);
    }
    if (normalizeNumber(ft.yearsHeld) > 0 && !(financials as any).yearsHeld) {
      (financials as any).yearsHeld = normalizeNumber(ft.yearsHeld);
    }
    if (normalizeNumber(ft.deemedNpat) > 0 && !(financials as any).deemedNpat) {
      (financials as any).deemedNpat = normalizeNumber(ft.deemedNpat);
    }
  }

  // Extract ownership financials
  if (tables.ownershipFinancials?.length) {
    const of = tables.ownershipFinancials[0];
    if (normalizeNumber(of.companyValue) > 0 && !(financials as any).companyValue) {
      (financials as any).companyValue = normalizeNumber(of.companyValue);
    }
    if (normalizeNumber(of.outstandingDebt) > 0 && !(financials as any).outstandingDebt) {
      (financials as any).outstandingDebt = normalizeNumber(of.outstandingDebt);
    }
    if (normalizeNumber(of.yearsHeld) > 0 && !(financials as any).yearsHeld) {
      (financials as any).yearsHeld = normalizeNumber(of.yearsHeld);
    }
  }

  return financials;
}

// ────────────────────────────────────────────────────────────────────────────
// Entity-to-Table Inference — Bridge flat entities to structured tables
// ────────────────────────────────────────────────────────────────────────────

const OWNERSHIP_KEYWORDS = [
  'ownership', 'shareholder', 'equity', 'voting', 'black ownership',
  'black women ownership', 'economic interest', 'share', 'designated group',
  'new entrant', 'black owned', 'black female', 'ownership percentage',
  'ownership percent', 'net value', 'company value',
];

const EMPLOYEE_KEYWORDS = [
  'employee', 'designation', 'ee ', 'management control', 'board',
  'executive', 'senior', 'middle', 'junior', 'race', 'gender',
  'disabled', 'foreign', 'headcount', 'staff', 'workforce',
  'director', 'ceo', 'cfo', 'number of employees',
];

const SUPPLIER_KEYWORDS = [
  'supplier', 'procurement', 'bee level', 'b-bbee level', 'spend',
  'vendor', 'eme', 'qse', 'black owned', 'tmps', 'procurement spend',
  'supplier name', 'supplier spend',
];

const CONTRIBUTION_KEYWORDS = [
  'contribution', 'enterprise development', 'supplier development',
  'socio', 'sed', 'esd', 'beneficiary', 'donation', 'grant',
  'csi', 'corporate social',
];

const TRAINING_KEYWORDS = [
  'training', 'skills', 'learner', 'bursary', 'scholarship',
  'programme', 'program', 'learnship', 'internship', 'course',
  'education', 'qualification', 'stipend', 'absorption',
];

interface EntityGroup {
  ownership: Array<{ name: string; value: any; confidence: number }>;
  employees: Array<{ name: string; value: any; confidence: number }>;
  suppliers: Array<{ name: string; value: any; confidence: number }>;
  contributions: Array<{ name: string; value: any; confidence: number }>;
  training: Array<{ name: string; value: any; confidence: number }>;
}

function groupEntitiesByPillar(entities: ExtractionOutput['entities']): EntityGroup {
  const groups: EntityGroup = {
    ownership: [], employees: [], suppliers: [],
    contributions: [], training: [],
  };

  for (const e of entities) {
    if (e.status === 'rejected' || e.value == null) continue;
    const lower = (e.name + ' ' + (e.pillar || '')).toLowerCase();

    if (OWNERSHIP_KEYWORDS.some(k => lower.includes(k))) groups.ownership.push(e);
    if (EMPLOYEE_KEYWORDS.some(k => lower.includes(k))) groups.employees.push(e);
    if (SUPPLIER_KEYWORDS.some(k => lower.includes(k))) groups.suppliers.push(e);
    if (CONTRIBUTION_KEYWORDS.some(k => lower.includes(k))) groups.contributions.push(e);
    if (TRAINING_KEYWORDS.some(k => lower.includes(k))) groups.training.push(e);
  }

  return groups;
}

const INFER_TABLES_PROMPT = `You are a B-BBEE (Broad-Based Black Economic Empowerment) data specialist.
You are given a list of extracted entity key-value pairs from a document. Your job is to construct
structured arrays of shareholders, employees, suppliers, contributions, and trainingPrograms
from these flat entities.

CRITICAL RULES:
1. Each shareholder MUST be a SEPARATE object. Group by individual — if "Shareholder 1 Name" is
   "ABC Trust" and "Shareholder 1 Black Ownership" is 51%, those belong to the SAME record.
   If only aggregate percentages exist (e.g. "Black Ownership: 25%") without individual names,
   create ONE shareholder record with that data.
2. Each employee MUST be a SEPARATE object. If "Director 1: John" and "Director 2: Jane" appear,
   create TWO records. If aggregate data like "Number of Black Senior Managers: 5" appears,
   create 5 employee records with race="African", designation="Senior".
3. Each supplier MUST be a SEPARATE object. "Supplier 1 Spend: R500,000" and "Supplier 2 Spend:
   R200,000" are TWO separate supplier records.
4. When entity names contain numbers or indices (e.g. "Shareholder 1", "Shareholder 2"), group
   all fields with the same index into ONE record.
5. NEVER invent data that is not present in the entities. Use ONLY values from the provided data.
6. Convert percentages to 0-100 scale. Convert currency to numeric (strip R, commas, spaces).
7. Race must be one of: "African", "Coloured", "Indian", "White".
8. Gender must be one of: "Male", "Female".
9. Designation must be one of: "Board", "Executive", "Executive Director",
   "Other Executive Management", "Senior", "Middle", "Junior", "Semi-skilled",
   "Unskilled", "Skilled Technical".
10. enterpriseType must be one of: "eme", "qse", "generic".
11. category for contributions must be one of: "sd", "ed", "sed".

REQUIRED FIELDS per record (must be present; set to reasonable defaults ONLY if clearly inferable):
- shareholders: name, blackOwnership, blackWomenOwnership, shares, shareValue
- employees: name, race, gender, designation, isDisabled, isForeign
- suppliers: name, spend, beeLevel, blackOwnership, blackWomenOwnership, enterpriseType
- contributions: beneficiary, type, amount, category
- trainingPrograms: name, category, cost, race, gender, isDisabled

Return ONLY valid JSON:
{
  "shareholders": [{ "name": string, "blackOwnership": number, "blackWomenOwnership": number, "votingRightsPercent": number, "economicInterestPercent": number, "shares": number, "shareValue": number, "yearsHeld": number, "isDesignatedGroup": boolean, "blackNewEntrant": boolean }],
  "employees": [{ "name": string, "race": string, "gender": string, "designation": string, "isDisabled": boolean, "isForeign": boolean }],
  "suppliers": [{ "name": string, "spend": number, "beeLevel": number, "blackOwnership": number, "blackWomenOwnership": number, "enterpriseType": string, "isDesignatedGroup": boolean, "isBlackOwned51": boolean, "isBlackWomanOwned30": boolean, "isEME": boolean, "isQSE": boolean, "isForeignSupplier": boolean }],
  "contributions": [{ "beneficiary": string, "type": string, "amount": number, "category": "sd"|"ed"|"sed" }],
  "trainingPrograms": [{ "name": string, "category": string, "cost": number, "race": string, "gender": string, "isDisabled": boolean, "isBursary": boolean }]
}

If a category has no data, return an empty array for it.`;

export async function inferTablesFromEntities(
  entities: ExtractionOutput['entities']
): Promise<ExtractionOutput['tables']> {
  const groups = groupEntitiesByPillar(entities);

  const hasEntityData = groups.ownership.length > 0 || groups.employees.length > 0 ||
    groups.suppliers.length > 0 || groups.contributions.length > 0 || groups.training.length > 0;

  if (!hasEntityData) {
    throw new Error(
      '[aiEntityMapper] No pillar-relevant entities found in extraction output. ' +
      'Cannot infer structured tables — the extraction produced no ownership, employee, supplier, ' +
      'contribution, or training entities.'
    );
  }

  if (!isLLMAvailable()) {
    throw new Error(
      '[aiEntityMapper] LLM is required for structured entity grouping but is not configured. ' +
      'Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY environment variables.'
    );
  }

  console.log('[aiEntityMapper] Inferring tables from entities via LLM:', {
    ownership: groups.ownership.length,
    employees: groups.employees.length,
    suppliers: groups.suppliers.length,
    contributions: groups.contributions.length,
    training: groups.training.length,
  });

  const entitySummary = [
    groups.ownership.length > 0 ? `## Ownership-related entities:\n${groups.ownership.map(e => `- ${e.name}: ${e.value}`).join('\n')}` : '',
    groups.employees.length > 0 ? `## Employee/Management-related entities:\n${groups.employees.map(e => `- ${e.name}: ${e.value}`).join('\n')}` : '',
    groups.suppliers.length > 0 ? `## Supplier/Procurement-related entities:\n${groups.suppliers.map(e => `- ${e.name}: ${e.value}`).join('\n')}` : '',
    groups.contributions.length > 0 ? `## Contribution/ESD/SED-related entities:\n${groups.contributions.map(e => `- ${e.name}: ${e.value}`).join('\n')}` : '',
    groups.training.length > 0 ? `## Training/Skills-related entities:\n${groups.training.map(e => `- ${e.name}: ${e.value}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');

  const response = await chatCompletion(
    [
      { role: 'system', content: INFER_TABLES_PROMPT },
      { role: 'user', content: `Construct structured B-BBEE data arrays from these extracted entities:\n\n${entitySummary}` },
    ],
    { temperature: 0, maxTokens: 8000, responseFormat: { type: 'json_object' } }
  );

  let parsed: any;
  try {
    parsed = JSON.parse(response);
  } catch (parseErr) {
    throw new Error(
      `[aiEntityMapper] LLM returned invalid JSON for entity grouping. ` +
      `Raw response (first 500 chars): ${response.slice(0, 500)}`
    );
  }

  // Strict validation: check that required fields are present on each record
  const tables: ExtractionOutput['tables'] = {};
  const errors: string[] = [];

  if (Array.isArray(parsed.shareholders)) {
    for (let i = 0; i < parsed.shareholders.length; i++) {
      const s = parsed.shareholders[i];
      if (s.blackOwnership == null) errors.push(`shareholders[${i}] missing "blackOwnership"`);
    }
    if (parsed.shareholders.length > 0) tables.shareholders = parsed.shareholders;
  }

  if (Array.isArray(parsed.employees)) {
    for (let i = 0; i < parsed.employees.length; i++) {
      const e = parsed.employees[i];
      if (!e.race) errors.push(`employees[${i}] missing "race"`);
      if (!e.gender) errors.push(`employees[${i}] missing "gender"`);
      if (!e.designation) errors.push(`employees[${i}] missing "designation"`);
    }
    if (parsed.employees.length > 0) tables.employees = parsed.employees;
  }

  if (Array.isArray(parsed.suppliers)) {
    for (let i = 0; i < parsed.suppliers.length; i++) {
      const s = parsed.suppliers[i];
      if (s.spend == null) errors.push(`suppliers[${i}] missing "spend"`);
      if (s.beeLevel == null) errors.push(`suppliers[${i}] missing "beeLevel"`);
    }
    if (parsed.suppliers.length > 0) tables.suppliers = parsed.suppliers;
  }

  if (Array.isArray(parsed.contributions)) {
    for (let i = 0; i < parsed.contributions.length; i++) {
      const c = parsed.contributions[i];
      if (c.amount == null) errors.push(`contributions[${i}] missing "amount"`);
      if (!c.category) errors.push(`contributions[${i}] missing "category"`);
    }
    if (parsed.contributions.length > 0) tables.contributions = parsed.contributions;
  }

  if (Array.isArray(parsed.trainingPrograms)) {
    for (let i = 0; i < parsed.trainingPrograms.length; i++) {
      const t = parsed.trainingPrograms[i];
      if (t.cost == null) errors.push(`trainingPrograms[${i}] missing "cost"`);
    }
    if (parsed.trainingPrograms.length > 0) tables.trainingPrograms = parsed.trainingPrograms;
  }

  if (errors.length > 0) {
    throw new Error(
      `[aiEntityMapper] LLM returned structured data with missing required fields:\n` +
      errors.join('\n')
    );
  }

  console.log('[aiEntityMapper] LLM inferred tables:', {
    shareholders: tables.shareholders?.length || 0,
    employees: tables.employees?.length || 0,
    suppliers: tables.suppliers?.length || 0,
    contributions: tables.contributions?.length || 0,
    trainingPrograms: tables.trainingPrograms?.length || 0,
  });

  return tables;
}

// ────────────────────────────────────────────────────────────────────────────
// AI Data Repair — Fix obviously wrong data using LLM
// ────────────────────────────────────────────────────────────────────────────

async function aiRepairEmployeeDesignations(employees: EmployeeInput[]): Promise<EmployeeInput[]> {
  if (!isLLMAvailable() || employees.length === 0) return employees;

  const unknownDesigs = employees.filter(e =>
    e.designation === 'Junior' &&
    !['Junior', 'junior', 'junior management'].includes(String((e as any)._rawDesig || '').toLowerCase())
  );
  if (unknownDesigs.length === 0) return employees;

  // Batch designation repair is expensive — only do it if > 30% are unknown
  const unknownPct = unknownDesigs.length / employees.length;
  if (unknownPct < 0.3) return employees;

  console.log(`[aiEntityMapper] ${unknownDesigs.length}/${employees.length} employees have unclear designations, attempting AI repair`);

  try {
    const sample = employees.slice(0, 50).map(e => ({
      name: e.name,
      currentDesignation: e.designation,
    }));

    const response = await fastChatCompletion(
      [
        {
          role: 'system',
          content: `You fix B-BBEE employee designations. Valid values: ${VALID_DESIGNATIONS.join(', ')}. Based on employee names and context, correct any "Junior" designations that seem wrong. Return JSON: {"fixes": [{"name": "...", "designation": "..."}]}`,
        },
        {
          role: 'user',
          content: `Fix these employee designations:\n${JSON.stringify(sample)}`,
        },
      ],
      { temperature: 0, maxTokens: 2000, responseFormat: { type: 'json_object' } }
    );

    const parsed = JSON.parse(response);
    const fixes = new Map<string, string>();
    for (const fix of parsed.fixes || []) {
      if (VALID_DESIGNATIONS.includes(fix.designation)) {
        fixes.set(fix.name, fix.designation);
      }
    }

    return employees.map(e => {
      const fix = e.name ? fixes.get(e.name) : undefined;
      return fix ? { ...e, designation: fix } : e;
    });
  } catch (err) {
    console.warn('[aiEntityMapper] AI designation repair failed:', err);
    return employees;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Main Mapper Function
// ────────────────────────────────────────────────────────────────────────────

/**
 * Transform raw extraction output into a UCS-ready payload.
 *
 * This is the critical bridge between extraction and scoring:
 * - Normalizes all arrays to exact UCS formats
 * - Derives missing financials from available data
 * - Uses AI to repair unclear designations
 * - Generates a data quality report
 */
export async function mapToUCSPayload(
  extraction: ExtractionOutput
): Promise<UCSReadyPayload> {
  const { entities, tables } = extraction;

  // Normalize arrays from pre-extracted tables
  let employees = normalizeEmployees(tables.employees || []);
  let shareholders = normalizeShareholders(tables.shareholders || []);
  let suppliers = normalizeSuppliers(tables.suppliers || []);
  let contributions = normalizeContributions(tables.contributions || []);
  let trainingPrograms = tables.trainingPrograms || [];

  // Per-pillar inference: if specific table arrays are empty but we have
  // relevant entities, infer structured records for those pillars.
  // This handles the common case where AI table extraction succeeds for
  // some pillars (e.g. suppliers) but fails for others (e.g. employees)
  // because the sheet data is in summary/aggregate format.
  const groups = groupEntitiesByPillar(entities);
  const needsInference =
    (employees.length === 0 && groups.employees.length > 0) ||
    (shareholders.length === 0 && groups.ownership.length > 0) ||
    (trainingPrograms.length === 0 && groups.training.length > 0) ||
    (suppliers.length === 0 && groups.suppliers.length > 0) ||
    (contributions.length === 0 && groups.contributions.length > 0);

  if (needsInference && entities.length > 0) {
    const emptyPillars = [
      employees.length === 0 && 'employees',
      shareholders.length === 0 && 'shareholders',
      trainingPrograms.length === 0 && 'training',
      suppliers.length === 0 && 'suppliers',
      contributions.length === 0 && 'contributions',
    ].filter(Boolean);
    console.log('[aiEntityMapper] Inferring empty pillars from entities:', emptyPillars.join(', '));

    try {
      const inferred = await inferTablesFromEntities(entities);
      if (employees.length === 0) employees = normalizeEmployees(inferred.employees || []);
      if (shareholders.length === 0) shareholders = normalizeShareholders(inferred.shareholders || []);
      if (suppliers.length === 0) suppliers = normalizeSuppliers(inferred.suppliers || []);
      if (contributions.length === 0) contributions = normalizeContributions(inferred.contributions || []);
      if (trainingPrograms.length === 0) trainingPrograms = inferred.trainingPrograms || [];
    } catch (err) {
      console.warn('[aiEntityMapper] Per-pillar inference failed:', err);
    }
  }

  // AI repair for employee designations
  employees = await aiRepairEmployeeDesignations(employees);

  // Extract and derive financials
  const financials = extractFinancialsFromEntities(entities, tables);

  // Build entity values map from individual entities
  const entityValues: Record<string, { entityId: string; value: any; source: string; confidence: number }> = {};
  for (const entity of entities) {
    if (entity.status === 'rejected' || entity.value == null) continue;
    let val = entity.value;
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed.endsWith('%')) {
        const numPart = trimmed.slice(0, -1).replace(/\s/g, '').replace(/,/g, '');
        const parsed = Number(numPart);
        if (!isNaN(parsed)) val = parsed;
      } else if (/^Level\s+\d$/i.test(trimmed)) {
        val = parseInt(trimmed.replace(/^Level\s+/i, ''), 10);
      } else {
        const cleaned = trimmed.replace(/^R\s*/, '').replace(/\s/g, '').replace(/,/g, '');
        const parsed = Number(cleaned);
        if (!isNaN(parsed) && cleaned !== '') val = parsed;
      }
    }
    entityValues[entity.name] = {
      entityId: entity.name,
      value: val,
      source: 'extraction',
      confidence: entity.confidence,
    };
  }

  // Add ownership financials to entity values
  if ((financials as any).companyValue > 0) {
    entityValues['companyValue'] = { entityId: 'companyValue', value: (financials as any).companyValue, source: 'extraction', confidence: 0.9 };
  }
  if ((financials as any).outstandingDebt > 0) {
    entityValues['outstandingDebt'] = { entityId: 'outstandingDebt', value: (financials as any).outstandingDebt, source: 'extraction', confidence: 0.9 };
  }
  if ((financials as any).yearsHeld > 0) {
    entityValues['yearsHeld'] = { entityId: 'yearsHeld', value: (financials as any).yearsHeld, source: 'extraction', confidence: 0.9 };
  }

  // Build cross-pillar values
  const crossPillarValues = new Map<string, number>();
  if (financials.npat) crossPillarValues.set('npat', financials.npat);
  if (financials.tmps) crossPillarValues.set('tmps', financials.tmps);
  if (financials.leviableAmount) crossPillarValues.set('leviableAmount', financials.leviableAmount);
  if (financials.headcount) crossPillarValues.set('totalEmployees', financials.headcount);
  if (financials.revenue) crossPillarValues.set('revenue', financials.revenue);
  if ((financials as any).companyValue) crossPillarValues.set('companyValue', (financials as any).companyValue);
  if ((financials as any).outstandingDebt) crossPillarValues.set('outstandingDebt', (financials as any).outstandingDebt);
  if ((financials as any).yearsHeld) crossPillarValues.set('yearsHeld', (financials as any).yearsHeld);

  // Build data quality report
  const dataQuality = buildQualityReport(employees, shareholders, suppliers, contributions, trainingPrograms, financials);

  return {
    entityValues,
    employees,
    shareholders,
    suppliers,
    contributions,
    trainingPrograms,
    financials,
    crossPillarValues,
    dataQuality,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Data Quality Report
// ────────────────────────────────────────────────────────────────────────────

function buildQualityReport(
  employees: EmployeeInput[],
  shareholders: ShareholderInput[],
  suppliers: SupplierInput[],
  contributions: ContributionInput[],
  trainingPrograms: any[],
  financials: FinancialsInput,
): DataQualityReport {
  const pillarsWithData: string[] = [];
  const pillarsWithoutData: string[] = [];
  const missingCritical: string[] = [];
  const derivedValues: string[] = [];
  const warnings: string[] = [];

  if (employees.length > 0) pillarsWithData.push('Management Control');
  else pillarsWithoutData.push('Management Control');

  if (shareholders.length > 0) pillarsWithData.push('Ownership');
  else pillarsWithoutData.push('Ownership');

  if (suppliers.length > 0) pillarsWithData.push('Preferential Procurement');
  else pillarsWithoutData.push('Preferential Procurement');

  if (contributions.length > 0) {
    const hasSd = contributions.some(c => c.category === 'sd');
    const hasEd = contributions.some(c => c.category === 'ed');
    const hasSed = contributions.some(c => c.category === 'sed');
    if (hasSd || hasEd) pillarsWithData.push('Enterprise & Supplier Development');
    else pillarsWithoutData.push('Enterprise & Supplier Development');
    if (hasSed) pillarsWithData.push('Socio-Economic Development');
    else pillarsWithoutData.push('Socio-Economic Development');
  } else {
    pillarsWithoutData.push('Enterprise & Supplier Development', 'Socio-Economic Development');
  }

  if (trainingPrograms.length > 0) pillarsWithData.push('Skills Development');
  else pillarsWithoutData.push('Skills Development');

  if (!financials.revenue) missingCritical.push('Total Revenue');
  if (!financials.npat) missingCritical.push('NPAT');
  if (!financials.leviableAmount) {
    if (financials.revenue > 0) {
      derivedValues.push('Leviable Amount (estimated at 35% of revenue)');
    } else {
      missingCritical.push('Leviable Amount');
    }
  }
  if (!financials.tmps) {
    if (suppliers.length > 0) {
      derivedValues.push('TMPS (derived from total supplier spend)');
    } else {
      missingCritical.push('TMPS (Total Measured Procurement Spend)');
    }
  }

  if (employees.length > 0 && employees.length < 5) {
    warnings.push(`Only ${employees.length} employees found — seems too few for a company`);
  }

  const overall: DataQualityReport['overall'] =
    missingCritical.length === 0 && pillarsWithoutData.length <= 1 ? 'good' :
    missingCritical.length <= 1 && pillarsWithoutData.length <= 3 ? 'partial' : 'poor';

  return {
    overall,
    pillarsWithData,
    pillarsWithoutData,
    missingCritical,
    derivedValues,
    warnings,
    tableRowCounts: {
      employees: employees.length,
      shareholders: shareholders.length,
      suppliers: suppliers.length,
      contributions: contributions.length,
      trainingPrograms: trainingPrograms.length,
    },
  };
}
