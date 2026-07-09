/**
 * Sector-aware adapter: parser output → real scorecard calculator input.
 *
 * The okiru-ai-parser emits advisory, flat calculator keys (e.g.
 * `ownership.black_ownership`, `supplier.spend`). The actual scoring engine
 * (apps/api/pipeline/rules/pillarCalculators.ts) consumes STRUCTURED LISTS:
 * ShareholderInput[], EmployeeInput[], TrainingProgramInput[], SupplierInput[],
 * ContributionInput[]. This module maps only what can be mapped SAFELY and
 * honestly, and reports everything else as an explicit gap. It never invents
 * calculator paths and never passes review_required/failed data into scoring.
 *
 * Scope: RCOGP Generic and ICT Generic (the two sectors being made correct
 * first). Other sectors are intentionally rejected here until audited.
 */
import { getSectorConfigSafe, type SectorConfig } from '../../pipeline/sectorConfig.js';
import type { ParserCaseResult, ParserSupplierRow } from './parserClient.js';

// ── Trusted sector/scorecard registry ──────────────────────────────────────

export const PARSER_TARGET_SECTORS = [
  { sectorCode: 'RCOGP', scorecardType: 'Generic' },
  { sectorCode: 'ICT', scorecardType: 'Generic' },
] as const;

export type TargetSector = (typeof PARSER_TARGET_SECTORS)[number];

/**
 * A sector is trusted for parser mapping only when it resolves to a real
 * SectorConfig AND is in the audited target set. `GENERIC` is a scorecard type,
 * never a sector, so it is rejected here.
 */
export function isTrustedParserSector(sectorCode: string, scorecardType = 'Generic'): boolean {
  if (!sectorCode || sectorCode.toUpperCase() === 'GENERIC') return false;
  const inTargets = PARSER_TARGET_SECTORS.some(
    (t) => t.sectorCode.toLowerCase() === sectorCode.toLowerCase()
      && t.scorecardType.toLowerCase() === scorecardType.toLowerCase(),
  );
  if (!inTargets) return false;
  return getSectorConfigSafe(sectorCode, scorecardType) != null;
}

export class UntrustedSectorError extends Error {
  constructor(sectorCode: string, scorecardType: string) {
    super(
      sectorCode?.toUpperCase() === 'GENERIC'
        ? `"GENERIC" is a scorecard type, not a sector code`
        : `Sector ${sectorCode}/${scorecardType} is not an audited parser target (only RCOGP/Generic and ICT/Generic)`,
    );
    this.name = 'UntrustedSectorError';
  }
}

// ── Coverage matrix (machine-readable) ──────────────────────────────────────

export type CoverageStatus = 'covered' | 'partially_covered' | 'not_covered' | 'unknown';
export type ReadinessStatus = 'shadow_ready' | 'review_assisted_ready' | 'live_scoring_ready' | 'not_ready';

export interface CoverageRow {
  sectorCode: string;
  scorecardType: string;
  pillar: string;
  pillarPoints: number;
  requiredDocuments: string[];
  supportedDocuments: string[];
  requiredFields: string[];
  supportedFields: string[];
  parserCalculatorKeys: string[];
  /** How supported parser output maps into the real calculator input, or null. */
  actualScorecardInputMapping: string | null;
  coverageStatus: CoverageStatus;
  readinessStatus: ReadinessStatus;
  gaps: string[];
}

/** Pillars as named in SectorConfig.pillarConfigs, in scorecard order. */
const PILLAR_KEYS = [
  'ownership',
  'managementControl',
  'skillsDevelopment',
  'preferentialProcurement',
  'supplierDevelopment',
  'enterpriseDevelopment',
  'socioEconomicDevelopment',
] as const;
type PillarKey = (typeof PILLAR_KEYS)[number];

/**
 * Per-pillar coverage facts. Kept deliberately conservative — only
 * preferentialProcurement and SED have any real mapping into calculator input;
 * ownership/management/skills need structured lists the parser does not yet
 * produce, so they are shadow-only.
 */
const PILLAR_COVERAGE: Record<PillarKey, Omit<CoverageRow, 'sectorCode' | 'scorecardType' | 'pillar' | 'pillarPoints'>> = {
  ownership: {
    requiredDocuments: ['Ownership Confirmation', 'Share Certificate', 'Share Register', 'CIPC registration evidence'],
    supportedDocuments: ['Ownership Confirmation', 'Share Certificate', 'Share Register'],
    requiredFields: ['entity_name', 'black_ownership_percentage', 'black_women_ownership_percentage', 'voting_rights', 'economic_interest', 'net_value', 'new_entrants'],
    supportedFields: ['entity_name', 'black_ownership', 'black_women_ownership'],
    parserCalculatorKeys: ['ownership.entity_name', 'ownership.black_ownership', 'ownership.black_women_ownership'],
    actualScorecardInputMapping: null,
    coverageStatus: 'not_covered',
    readinessStatus: 'shadow_ready',
    gaps: [
      'calcOwnership consumes ShareholderInput[] (per-shareholder voting rights, economic interest, net value, new-entrant, designated-group), not a single black-ownership %',
      'parser produces flat percentages, not a shareholder list — cannot drive live ownership scoring',
    ],
  },
  managementControl: {
    requiredDocuments: ['Employment Equity Report', 'Management control schedule', 'Organogram / board composition', 'Director/member list'],
    supportedDocuments: ['Employment Equity Report'],
    requiredFields: ['black_management_representation', 'black_women_management_representation', 'board_or_executive_representation', 'occupational_level', 'measurement_period'],
    supportedFields: ['black_representation', 'black_women_representation'],
    parserCalculatorKeys: ['management.black_representation', 'management.black_women_representation'],
    actualScorecardInputMapping: null,
    coverageStatus: 'not_covered',
    readinessStatus: 'shadow_ready',
    gaps: [
      'calcManagement consumes EmployeeInput[] (race/gender/designation per employee) and computes representation per occupational band itself',
      'parser produces pre-computed percentages, not an employee list — cannot drive live management scoring',
    ],
  },
  skillsDevelopment: {
    requiredDocuments: ['WSP', 'ATR', 'Training invoices', 'Attendance registers', 'Payroll / leviable amount evidence', 'EMP201'],
    supportedDocuments: ['Workplace Skills Plan / ATR'],
    requiredFields: ['total_skills_spend', 'black_people_skills_spend', 'leviable_amount', 'headcount', 'training_category', 'learnerships', 'absorption'],
    supportedFields: ['skills_total_spend', 'skills_black_spend'],
    parserCalculatorKeys: ['skills.total_spend', 'skills.black_spend'],
    actualScorecardInputMapping: null,
    coverageStatus: 'not_covered',
    readinessStatus: 'shadow_ready',
    gaps: [
      'calcSkills consumes TrainingProgramInput[] + leviableAmount + headcount and recomputes spend by category',
      'parser produces spend totals, not per-programme records, and no leviable/headcount denominator — cannot drive live skills scoring',
    ],
  },
  preferentialProcurement: {
    requiredDocuments: ['Supplier spend schedule', 'Supplier B-BBEE certificates', 'Supplier affidavits', 'Procurement schedule'],
    supportedDocuments: ['Supplier Spend Schedule', 'B-BBEE Certificate', 'B-BBEE Sworn Affidavit'],
    requiredFields: ['supplier_name', 'supplier_bee_level', 'supplier_black_ownership', 'supplier_black_women_ownership', 'spend_amount', 'enterprise_type', 'tmps_denominator'],
    supportedFields: ['supplier_name', 'supplier_bee_level', 'supplier_black_ownership', 'spend_amount'],
    parserCalculatorKeys: ['supplier.name', 'supplier.bee_level', 'supplier.black_ownership', 'supplier.spend'],
    actualScorecardInputMapping: 'supplier_rows -> SupplierInput[] (name, spend, beeLevel, blackOwnership)',
    coverageStatus: 'partially_covered',
    readinessStatus: 'review_assisted_ready',
    gaps: [
      'per-supplier blackWomenOwnership not extracted (bwo30 target unscored)',
      'enterpriseType (EME/QSE/generic) not classified — QSE/EME procurement sub-targets cannot score',
      'total measured procurement spend (tmps) denominator comes from financials, not the parser',
    ],
  },
  supplierDevelopment: {
    requiredDocuments: ['SD contribution evidence', 'Proof of payment', 'Beneficiary agreements'],
    supportedDocuments: [],
    requiredFields: ['beneficiary', 'contribution_amount', 'contribution_type', 'benefit_factor', 'payment_date'],
    supportedFields: [],
    parserCalculatorKeys: [],
    actualScorecardInputMapping: null,
    coverageStatus: 'not_covered',
    readinessStatus: 'not_ready',
    gaps: ['parser has no SD contribution document type; calcEsd needs ContributionInput[] (category sd) with benefit factors'],
  },
  enterpriseDevelopment: {
    requiredDocuments: ['ED contribution evidence', 'Proof of payment', 'Beneficiary agreements'],
    supportedDocuments: [],
    requiredFields: ['beneficiary', 'contribution_amount', 'contribution_type', 'benefit_factor', 'payment_date'],
    supportedFields: [],
    parserCalculatorKeys: [],
    actualScorecardInputMapping: null,
    coverageStatus: 'not_covered',
    readinessStatus: 'not_ready',
    gaps: ['parser has no ED contribution document type; calcEsd needs ContributionInput[] (category ed) with benefit factors'],
  },
  socioEconomicDevelopment: {
    requiredDocuments: ['SED agreement', 'Beneficiary confirmation', 'Proof of payment', 'Beneficiary demographic evidence'],
    supportedDocuments: ['SED Contribution Confirmation'],
    requiredFields: ['beneficiary_name', 'contribution_amount', 'payment_date', 'black_beneficiary_percentage', 'npat_denominator'],
    supportedFields: ['beneficiary_name', 'contribution_amount'],
    parserCalculatorKeys: ['sed.contribution', 'sed.beneficiary_name'],
    actualScorecardInputMapping: 'sed.contribution -> ContributionInput{category:"sed", amount}',
    coverageStatus: 'partially_covered',
    readinessStatus: 'review_assisted_ready',
    gaps: [
      'NPAT denominator (calcSed divides spend by NPAT) comes from financials, not the parser',
      'black-beneficiary % and payment date not extracted',
    ],
  },
};

/** Builds the coverage matrix, reading pillar points live from the sector config. */
export function buildSectorCoverageMatrix(): CoverageRow[] {
  const rows: CoverageRow[] = [];
  for (const { sectorCode, scorecardType } of PARSER_TARGET_SECTORS) {
    const config = getSectorConfigSafe(sectorCode, scorecardType);
    if (!config) continue;
    for (const pillar of PILLAR_KEYS) {
      const pillarConfig = config.pillarConfigs[pillar as keyof SectorConfig['pillarConfigs']];
      rows.push({
        sectorCode,
        scorecardType,
        pillar,
        pillarPoints: pillarConfig?.maxPoints ?? 0,
        ...PILLAR_COVERAGE[pillar],
      });
    }
  }
  return rows;
}

// ── Adapter: parser case output → sector calculator input draft ─────────────

/** Strict allowlist: parser supplier-row key → SupplierInput field + type. */
const SUPPLIER_FIELD_MAP: Record<string, { field: 'name' | 'spend' | 'beeLevel' | 'blackOwnership'; type: 'string' | 'number' }> = {
  'supplier.name': { field: 'name', type: 'string' },
  'supplier.spend': { field: 'spend', type: 'number' },
  'supplier.bee_level': { field: 'beeLevel', type: 'number' },
  'supplier.black_ownership': { field: 'blackOwnership', type: 'number' },
};

export interface MappedSupplier {
  name: string;
  spend: number;
  beeLevel: number;
  blackOwnership: number;
  /** Fields the calculator needs but the parser could not supply. */
  gaps: string[];
  source_file: string;
}

export interface MappedContribution {
  beneficiary: string;
  amount: number;
  category: 'sd' | 'ed' | 'sed';
  gaps: string[];
}

export interface SectorAdapterResult {
  sectorCode: string;
  scorecardType: string;
  scorecardInputDraft: {
    suppliers: MappedSupplier[];
    contributions: MappedContribution[];
  };
  mappedPillars: string[];
  unmappedPillars: string[];
  rejectedKeys: Array<{ key: string; reason: string }>;
  audit: {
    supplierRowsSeen: number;
    supplierRowsMapped: number;
    supplierRowsSkippedNotPassed: number;
    caseStatus: string;
    missingRequiredDocuments: string[];
  };
}

function admit(type: 'string' | 'number', value: unknown): boolean {
  if (type === 'string') return typeof value === 'string' && value.trim().length > 0;
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Maps a parser case result into a sector scorecard input DRAFT. Only 'passed'
 * supplier rows and passed-case calculator payload are used. Unknown/mismatched
 * keys are rejected. Pillars the parser cannot safely feed are left unmapped.
 */
export function mapParserCaseToSectorInput(
  sectorCode: string,
  scorecardType: string,
  caseResult: ParserCaseResult,
): SectorAdapterResult {
  if (!isTrustedParserSector(sectorCode, scorecardType)) {
    throw new UntrustedSectorError(sectorCode, scorecardType);
  }

  const rejectedKeys: Array<{ key: string; reason: string }> = [];
  const suppliers: MappedSupplier[] = [];
  let skippedNotPassed = 0;

  for (const row of caseResult.supplier_rows ?? []) {
    if (row.status !== 'passed') { skippedNotPassed++; continue; }
    const mapped = mapSupplierRow(row, rejectedKeys);
    if (mapped) suppliers.push(mapped);
  }

  // SED: the case calculator_payload only ever contains PASSED-document values
  // (the parser case merge withholds review_required/failed and conflicts).
  const contributions: MappedContribution[] = [];
  const sedAmount = caseResult.calculator_payload?.['sed.contribution'];
  if (typeof sedAmount === 'number' && Number.isFinite(sedAmount)) {
    const beneficiary = caseResult.calculator_payload?.['sed.beneficiary_name'];
    contributions.push({
      beneficiary: typeof beneficiary === 'string' ? beneficiary : 'Unknown beneficiary',
      amount: sedAmount,
      category: 'sed',
      gaps: ['NPAT denominator required by calcSed is not supplied by the parser', 'black-beneficiary % not extracted'],
    });
  }

  const mappedPillars: string[] = [];
  if (suppliers.length > 0) mappedPillars.push('preferentialProcurement');
  if (contributions.length > 0) mappedPillars.push('socioEconomicDevelopment');
  const unmappedPillars = PILLAR_KEYS.filter((p) => !mappedPillars.includes(p));

  return {
    sectorCode,
    scorecardType,
    scorecardInputDraft: { suppliers, contributions },
    mappedPillars,
    unmappedPillars,
    rejectedKeys,
    audit: {
      supplierRowsSeen: (caseResult.supplier_rows ?? []).length,
      supplierRowsMapped: suppliers.length,
      supplierRowsSkippedNotPassed: skippedNotPassed,
      caseStatus: caseResult.status,
      missingRequiredDocuments: caseResult.missing_required_documents ?? [],
    },
  };
}

function mapSupplierRow(
  row: ParserSupplierRow,
  rejectedKeys: Array<{ key: string; reason: string }>,
): MappedSupplier | null {
  const out: Partial<MappedSupplier> = { source_file: row.source_file };
  for (const [key, value] of Object.entries(row.calculator_fields ?? {})) {
    const spec = SUPPLIER_FIELD_MAP[key];
    if (!spec) { rejectedKeys.push({ key, reason: 'unknown_supplier_key' }); continue; }
    if (!admit(spec.type, value)) { rejectedKeys.push({ key, reason: 'type_mismatch' }); continue; }
    (out as Record<string, unknown>)[spec.field] = value;
  }
  // Name + spend are the minimum for a usable procurement row.
  if (typeof out.name !== 'string' || typeof out.spend !== 'number') return null;

  const gaps: string[] = [];
  if (typeof out.beeLevel !== 'number') gaps.push('beeLevel missing (recognition multiplier cannot apply)');
  if (typeof out.blackOwnership !== 'number') gaps.push('blackOwnership missing');
  gaps.push('blackWomenOwnership not extracted', 'enterpriseType (EME/QSE) not classified');

  return {
    name: out.name,
    spend: out.spend,
    beeLevel: typeof out.beeLevel === 'number' ? out.beeLevel : 0,
    blackOwnership: typeof out.blackOwnership === 'number' ? out.blackOwnership : 0,
    gaps,
    source_file: row.source_file,
  };
}
