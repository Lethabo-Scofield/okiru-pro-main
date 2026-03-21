/**
 * entityToParseResult.ts
 *
 * Maps LLMExtractionResult[] (with formulaRole tags from starterTemplates / entityManifest)
 * into the ParseResult shape expected by buildPipelineResult().
 *
 * formulaRole values (from starterTemplates.ts entities):
 *   financials:  revenue | npat | leviableAmount | tmps | financialYearEnd
 *   ownership:   shareholderName | blackOwnershipPct | blackWomenOwnershipPct | shareholdingPct
 *   mc/ee:       employeeName | employeeRace | employeeGender | employeeDesignation | employeeDisability
 *   skills:      trainingProgramme | trainingCost | learnerRace | learnerEmploymentStatus
 *   procurement: supplierName | supplierBeeLevel | supplierSpend | supplierBlackOwnership
 *   esd:         esdBeneficiary | esdAmount | esdCategory
 *   sed:         sedBeneficiary | sedAmount
 */

import type { LLMExtractionResult } from './llmExtractor.js';
import type {
  ParseResult,
  ParsedShareholder,
  ParsedEmployee,
  ParsedTrainingProgram,
  ParsedSupplier,
  ParsedContribution,
} from '../excelParser.js';

// ---------------------------------------------------------------------------
// Helper parsers
// ---------------------------------------------------------------------------

function parseCurrency(raw: string | number | null): number {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === 'number') return raw;
  const cleaned = String(raw)
    .replace(/[R\s,_]/g, '')
    .replace(/([0-9])M$/i, (_, d) => String(Number(d) * 1_000_000))
    .replace(/([0-9])K$/i, (_, d) => String(Number(d) * 1_000))
    .replace(/([0-9])B$/i, (_, d) => String(Number(d) * 1_000_000_000));
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parsePercentage(raw: string | number | null): number {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === 'number') return raw > 1 ? raw / 100 : raw;
  const cleaned = String(raw).replace(/%/g, '').trim();
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  return num > 1 ? num / 100 : num; // normalise 51 → 0.51
}

function parseBeeLevel(raw: string | number | null): number {
  if (raw === null || raw === undefined) return 8;
  if (typeof raw === 'number') return Math.min(Math.max(Math.round(raw), 0), 8);
  const m = String(raw).match(/\d+/);
  return m ? Math.min(Math.max(parseInt(m[0], 10), 0), 8) : 8;
}

function parseString(raw: string | number | null): string {
  if (raw === null || raw === undefined) return '';
  return String(raw).trim();
}

function parseRace(raw: string | number | null): string {
  const s = parseString(raw);
  if (/african/i.test(s)) return 'African';
  if (/coloured/i.test(s)) return 'Coloured';
  if (/indian/i.test(s)) return 'Indian';
  if (/white/i.test(s)) return 'White';
  return s;
}

function parseGender(raw: string | number | null): string {
  const s = parseString(raw);
  if (/^(m|male)$/i.test(s)) return 'Male';
  if (/^(f|female)$/i.test(s)) return 'Female';
  return s;
}

function parseDesignation(raw: string | number | null): string {
  const s = parseString(raw);
  if (/board|director/i.test(s)) return 'Board';
  if (/exec|top management|c-suite/i.test(s)) return 'Executive';
  if (/senior|snr|sr\b/i.test(s)) return 'Senior Management';
  if (/middle|mid\b/i.test(s)) return 'Middle Management';
  if (/junior|jnr|jr\b/i.test(s)) return 'Junior Management';
  if (/semi|skilled/i.test(s)) return 'Semi-skilled';
  if (/unsk/i.test(s)) return 'Unskilled';
  return s || 'Junior Management';
}

function isBlackRace(race: string): boolean {
  return ['African', 'Coloured', 'Indian'].includes(race);
}

// ---------------------------------------------------------------------------
// Grouping: collect multi-row entity results by entity type
// ---------------------------------------------------------------------------

/**
 * Build a keyed lookup: formulaRole → values in order
 */
function buildRoleMap(
  results: LLMExtractionResult[],
): Record<string, Array<string | number | null>> {
  const map: Record<string, Array<string | number | null>> = {};
  for (const r of results) {
    if (!r.entityName) continue;
    // Strip "Entity:" prefix if present, then look for "formulaRole" tag via entity naming convention
    // The formulaRole is encoded in LLMExtractionResult.entityName as "formulaRole|<role>"
    // or simply the entityName itself maps to its formulaRole (set during manifest build).
    // Here we treat entityName as the formulaRole key.
    const key = r.entityName;
    if (!map[key]) map[key] = [];
    map[key].push(r.extractedValue);
  }
  return map;
}

/** Get first non-null value for a role */
function first(
  map: Record<string, Array<string | number | null>>,
  role: string,
): string | number | null {
  return map[role]?.find((v) => v !== null && v !== '') ?? null;
}

/** Get all non-null values for a role */
function all(
  map: Record<string, Array<string | number | null>>,
  role: string,
): Array<string | number> {
  return (map[role] ?? []).filter(
    (v): v is string | number => v !== null && v !== '',
  );
}

// ---------------------------------------------------------------------------
// Main mapper
// ---------------------------------------------------------------------------

export interface MapperOptions {
  clientName?: string;
  industrySector?: string;
  applicableScorecard?: string;
}

export function entityResultsToParseResult(
  results: LLMExtractionResult[],
  opts: MapperOptions = {},
): ParseResult {
  const map = buildRoleMap(results);
  const now = new Date().toISOString();

  // ── Client financials ──────────────────────────────────────────────────
  const client = {
    name: opts.clientName ?? parseString(first(map, 'clientName')),
    industrySector:
      opts.industrySector ?? parseString(first(map, 'industrySector')),
    applicableScorecard:
      opts.applicableScorecard ?? parseString(first(map, 'applicableScorecard')),
    financialYear: parseString(first(map, 'financialYearEnd')),
    revenue: parseCurrency(first(map, 'revenue')),
    npat: parseCurrency(first(map, 'npat')),
    leviableAmount: parseCurrency(first(map, 'leviableAmount')),
    payroll: parseCurrency(first(map, 'leviableAmount')),
    tmps: parseCurrency(first(map, 'tmps')),
    tmpsInclusions: 0,
    tmpsExclusions: 0,
  };

  // ── Shareholders ───────────────────────────────────────────────────────
  const shareholderNames = all(map, 'shareholderName').map(String);
  const shareholdingPcts = all(map, 'shareholdingPct').map(parsePercentage);
  const blackOwnershipPcts = all(map, 'blackOwnershipPct').map(parsePercentage);
  const bwoPcts = all(map, 'blackWomenOwnershipPct').map(parsePercentage);

  let shareholders: ParsedShareholder[];

  if (shareholderNames.length > 0) {
    shareholders = shareholderNames.map((name, i) => ({
      name,
      blackOwnership: blackOwnershipPcts[i] ?? blackOwnershipPcts[0] ?? 0,
      blackWomenOwnership: bwoPcts[i] ?? bwoPcts[0] ?? 0,
      shares: shareholdingPcts[i] ?? shareholdingPcts[0] ?? 0,
      shareValue: 0,
    }));
  } else {
    // Aggregate ownership from scalar percentages
    const boAgg = parsePercentage(first(map, 'blackOwnershipPct'));
    const bwoAgg = parsePercentage(first(map, 'blackWomenOwnershipPct'));
    shareholders =
      boAgg > 0
        ? [
            {
              name: opts.clientName ?? 'Entity',
              blackOwnership: boAgg,
              blackWomenOwnership: bwoAgg,
              shares: 1,
              shareValue: 0,
            },
          ]
        : [];
  }

  // ── Employees ──────────────────────────────────────────────────────────
  const empNames = all(map, 'employeeName').map(String);
  const empRaces = all(map, 'employeeRace').map((v) => parseRace(String(v)));
  const empGenders = all(map, 'employeeGender').map((v) => parseGender(String(v)));
  const empDesigs = all(map, 'employeeDesignation').map((v) =>
    parseDesignation(String(v)),
  );
  const empDisabs = all(map, 'employeeDisability').map((v) => {
    const s = String(v).toLowerCase();
    return s === 'yes' || s === 'y' || s === 'pwd' || s === 'true';
  });

  const employees: ParsedEmployee[] = empNames.map((name, i) => ({
    name,
    gender: empGenders[i] ?? 'Male',
    race: empRaces[i] ?? 'White',
    designation: empDesigs[i] ?? 'Junior Management',
    isDisabled: empDisabs[i] ?? false,
  }));

  // If no employee-row data, synthesise from aggregate counts if available
  // (aggregate approach: not available from entity templates — skip)

  // ── Training programs ─────────────────────────────────────────────────
  const trainingNames = all(map, 'trainingProgramme').map(String);
  const trainingCosts = all(map, 'trainingCost').map(parseCurrency);
  const learnerRaces = all(map, 'learnerRace').map((v) =>
    parseRace(String(v)),
  );
  const learnerStatus = all(map, 'learnerEmploymentStatus').map((v) =>
    String(v).toLowerCase(),
  );

  const trainingPrograms: ParsedTrainingProgram[] = trainingNames.map(
    (name, i) => {
      const race = learnerRaces[i] ?? 'White';
      const status = learnerStatus[i] ?? 'employed';
      return {
        name,
        category: 'Training',
        cost: trainingCosts[i] ?? 0,
        isEmployed: !status.includes('unemployed'),
        isBlack: isBlackRace(race),
      };
    },
  );

  // ── Suppliers ──────────────────────────────────────────────────────────
  const supplierNames = all(map, 'supplierName').map(String);
  const supplierBees = all(map, 'supplierBeeLevel').map(parseBeeLevel);
  const supplierSpends = all(map, 'supplierSpend').map(parseCurrency);
  const supplierBOs = all(map, 'supplierBlackOwnership').map(parsePercentage);

  const suppliers: ParsedSupplier[] = supplierNames.map((name, i) => ({
    name,
    beeLevel: supplierBees[i] ?? 8,
    blackOwnership: supplierBOs[i] ?? 0,
    spend: supplierSpends[i] ?? 0,
  }));

  // ── ESD contributions ──────────────────────────────────────────────────
  const esdBenefs = all(map, 'esdBeneficiary').map(String);
  const esdAmounts = all(map, 'esdAmount').map(parseCurrency);
  const esdCategories = all(map, 'esdCategory').map(String);

  const maxEsd = Math.max(esdBenefs.length, esdAmounts.length);
  const esdContributions: ParsedContribution[] = Array.from(
    { length: maxEsd },
    (_, i) => ({
      beneficiary: esdBenefs[i] ?? 'ESD Beneficiary',
      type: esdCategories[i] ?? 'Supplier Development',
      amount: esdAmounts[i] ?? 0,
      category: esdCategories[i] ?? 'Supplier Development',
    }),
  );

  // If only an aggregate ESD amount is available, create one combined entry
  if (esdContributions.length === 0) {
    const aggESD = parseCurrency(first(map, 'esdAmount'));
    if (aggESD > 0) {
      esdContributions.push({
        beneficiary: 'ESD Beneficiary',
        type: 'Supplier Development',
        amount: aggESD,
        category: 'Supplier Development',
      });
    }
  }

  // ── SED contributions ──────────────────────────────────────────────────
  const sedBenefs = all(map, 'sedBeneficiary').map(String);
  const sedAmounts = all(map, 'sedAmount').map(parseCurrency);

  const maxSed = Math.max(sedBenefs.length, sedAmounts.length);
  const sedContributions: ParsedContribution[] = Array.from(
    { length: maxSed },
    (_, i) => ({
      beneficiary: sedBenefs[i] ?? 'SED Beneficiary',
      type: 'SED',
      amount: sedAmounts[i] ?? 0,
      category: 'SED',
    }),
  );

  if (sedContributions.length === 0) {
    const aggSED = parseCurrency(first(map, 'sedAmount'));
    if (aggSED > 0) {
      sedContributions.push({
        beneficiary: 'SED Beneficiary',
        type: 'SED',
        amount: aggSED,
        category: 'SED',
      });
    }
  }

  return {
    success: true,
    client,
    shareholders,
    employees,
    trainingPrograms,
    suppliers,
    esdContributions,
    sedContributions,
    sheetsFound: ['llm_extraction'],
    sheetsMatched: [
      {
        sheetName: 'llm_extraction',
        matchedTo: 'groq_entity_extraction',
        confidence: 0.9,
      },
    ],
    errors: [],
    logs: [
      {
        message: `entityToParseResult: mapped ${results.length} extraction results at ${now}`,
        type: 'info',
        timestamp: now,
      },
    ],
  };
}

/**
 * Confidence report for each pillar — useful for the UI confidence bars.
 */
export interface PillarConfidence {
  pillar: string;
  entityCount: number;
  highConfidenceCount: number;
  avgConfidence: number;
  missing: string[];
}

export function buildConfidenceReport(
  results: LLMExtractionResult[],
  requiredRoles: string[],
): PillarConfidence[] {
  const pillarGroups: Record<string, LLMExtractionResult[]> = {};
  for (const r of results) {
    const pillar = r.entityName.split('|')[1] ?? 'general';
    if (!pillarGroups[pillar]) pillarGroups[pillar] = [];
    pillarGroups[pillar].push(r);
  }

  const foundRoles = new Set(results.map((r) => r.entityName));
  const missingRoles = requiredRoles.filter((r) => !foundRoles.has(r));

  const report: PillarConfidence[] = Object.entries(pillarGroups).map(
    ([pillar, items]) => ({
      pillar,
      entityCount: items.length,
      highConfidenceCount: items.filter((i) => i.confidence >= 0.75).length,
      avgConfidence:
        items.reduce((s, i) => s + i.confidence, 0) / items.length,
      missing: missingRoles.filter((r) => r.startsWith(pillar + '|')),
    }),
  );

  return report;
}
