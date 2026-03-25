import type { LLMExtractionResult } from './llmExtractor';

export interface ParseResult {
  client: {
    name: string;
    industrySector: string;
    applicableScorecard: string;
  };
  extractedData: Record<string, any>;
  confidenceScores: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Name normalisation: map human-readable manifest names → snake_case keys
// expected by buildResult.ts
// ---------------------------------------------------------------------------

const ENTITY_NAME_TO_KEY: Record<string, string> = {
  // Financials
  'Total Revenue':                    'revenue',
  'NPAT':                             'npat',
  'Leviable Amount':                  'leviable_amount',
  'TMPS':                             'tmps',
  'Financial Year End':               'financial_year_end',
  // Ownership
  'Shareholder Name':                 'shareholder_name',
  'Black Ownership Percentage':       'black_voting_rights',
  'Black Women Ownership Percentage': 'black_women_voting_rights',
  'Shareholding Percentage':          'shareholding_pct',
  'Share Value':                      'share_value',
  // Management Control
  'Employee Name':                    'employee_name',
  'Employee Gender':                  'employee_gender',
  'Employee Race':                    'employee_race',
  'Employee Designation':             'employee_designation',
  'Employee Disability Status':       'employee_disability',
  // Additional ownership / MC keys the buildResult expects
  'Black Economic Interest':          'black_economic_interest',
  'Black Board Members':              'black_board_members',
  'Black Executive Directors':        'black_executive_directors',
  // Skills Development
  'Training Programme Name':          'training_programme',
  'Training Cost':                    'training_cost',
  'Learner Name':                     'learner_name',
  'Learner Employment Status':        'learner_employment_status',
  'Learner Race Status':              'learner_race',
  'Skills Development Spend':         'skills_development_spend',
  // Procurement
  'Supplier Name':                    'supplier_name',
  'Supplier BEE Level':               'supplier_bee_level',
  'Supplier Black Ownership':         'supplier_black_ownership',
  'Supplier Spend':                   'supplier_spend',
  'Preferential Procurement Spend':   'preferential_procurement_spend',
  // ESD
  'ESD Beneficiary':                  'esd_beneficiary',
  'ESD Contribution Type':            'esd_contribution_type',
  'ESD Amount':                       'supplier_development_contributions',
  'ESD Category':                     'esd_category',
  // SED
  'SED Beneficiary':                  'sed_beneficiary',
  'SED Contribution Type':            'sed_contribution_type',
  'SED Amount':                       'socio_economic_spend',
  // Sector-specific (ICT)
  'ICT Black-Owned Spend':            'ict_black_owned_spend',
  '3rd Party ICT Spend':              'ict_third_party_spend',
  // Sector-specific (FSC)
  'Access to Financial Services':     'access_financial_services',
  'Empowerment Financing Amount':     'empowerment_financing_amount',
  'BEE Transaction Financing':        'bee_transaction_financing',
  // Sector-specific (Agri)
  'Land Ownership Black':             'land_ownership_black',
  'Agricultural Development Contribution': 'agri_development_contribution',
  'Farmworker Housing':               'farmworker_housing',
};

function normaliseEntityName(raw: string): string {
  // 1. Direct lookup
  if (ENTITY_NAME_TO_KEY[raw]) return ENTITY_NAME_TO_KEY[raw];
  // 2. Case-insensitive lookup
  const lower = raw.toLowerCase();
  for (const [manifestName, key] of Object.entries(ENTITY_NAME_TO_KEY)) {
    if (manifestName.toLowerCase() === lower) return key;
  }
  // 3. Fallback: convert to snake_case
  return raw
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
}

export function entityResultsToParseResult(
  results: LLMExtractionResult[],
  meta: { clientName: string; industrySector: string; applicableScorecard: string }
): ParseResult {
  const extractedData: Record<string, any> = {};
  const confidenceScores: Record<string, number> = {};

  for (const result of results) {
    const key = normaliseEntityName(result.entityName);
    // Store under normalised key (snake_case) so buildResult.ts can find it
    extractedData[key] = result.extractedValue;
    confidenceScores[key] = result.confidence;
    // Also keep the original name for backwards compatibility / confidence reports
    extractedData[result.entityName] = result.extractedValue;
    confidenceScores[result.entityName] = result.confidence;
  }

  return {
    client: {
      name: meta.clientName,
      industrySector: meta.industrySector,
      applicableScorecard: meta.applicableScorecard,
    },
    extractedData,
    confidenceScores,
  };
}

export interface ConfidenceReportEntry {
  entity: string;
  confidence: number;
  status: 'high' | 'medium' | 'low' | 'missing';
}

export function buildConfidenceReport(
  results: LLMExtractionResult[],
  requiredRoles: string[]
): ConfidenceReportEntry[] {
  const report: ConfidenceReportEntry[] = [];

  for (const role of requiredRoles) {
    const result = results.find(r => r.entityName === role);
    if (!result || result.extractedValue === null) {
      report.push({ entity: role, confidence: 0, status: 'missing' });
    } else if (result.confidence >= 0.8) {
      report.push({ entity: role, confidence: result.confidence, status: 'high' });
    } else if (result.confidence >= 0.5) {
      report.push({ entity: role, confidence: result.confidence, status: 'medium' });
    } else {
      report.push({ entity: role, confidence: result.confidence, status: 'low' });
    }
  }

  return report;
}
