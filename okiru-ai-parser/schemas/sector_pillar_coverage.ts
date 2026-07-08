/**
 * Sector / pillar coverage matrix for the okiru-ai-parser.
 *
 * PURPOSE
 * -------
 * The parser is sector-agnostic: it classifies B-BBEE evidence documents and
 * emits allowlisted calculator keys. Whether that evidence is *sufficient* for
 * a given scorecard depends on the sector configuration that lives in
 * `apps/api/pipeline/sectorConfig.ts` (the scoring source of truth). This
 * module is the machine-readable bridge between the two: for every sector
 * scorecard the platform can score, it records which pillars exist, how the
 * parser's document types and calculator keys map onto them, and how far the
 * parser output can be trusted for that sector.
 *
 * SYNC CONTRACT
 * -------------
 * `SECTOR_PILLAR_COVERAGE` mirrors `ALL_CONFIGS` in
 * `apps/api/pipeline/sectorConfig.ts` (same order, same codes/types/names/
 * totals/pillar points). A sync test on the apps/api side
 * (`apps/api/__tests__/sectorParserCoverage.test.ts`) fails whenever the two
 * drift apart, so a new or changed sector config forces a deliberate update
 * of this matrix (and a fresh readiness decision).
 *
 * TRUST RULES
 * -----------
 * - "GENERIC" is a scorecard TYPE ('Generic' | 'QSE' | 'EME' | 'Contractor' |
 *   'BEP'), NOT a sector code. It must never be counted as a trusted sector.
 * - Parser calculator output is currently ADVISORY ONLY: apps/api's
 *   extract-and-score route surfaces it as `supplierEvidence` next to the
 *   scorecard, and nothing feeds `calculator_payload` into
 *   `buildPipelineResult`. Therefore no sector may be marked `live_scoring`
 *   until that wiring exists and is itself tested.
 */

// ---------------------------------------------------------------------------
// Sector codes
// ---------------------------------------------------------------------------

/** Sector codes with at least one real scoring config in apps/api. */
export const TRUSTED_SECTOR_CODES = [
  'RCOGP',
  'ICT',
  'FSC',
  'AGRI',
  'TRANSPORT',
  'CONSTRUCTION',
] as const;

export type TrustedSectorCode = (typeof TRUSTED_SECTOR_CODES)[number];

/**
 * Tokens that appear in UI copy, uploads, or legacy data but have NO scoring
 * config. They must never be treated as trusted sectors. "GENERIC" in
 * particular is a scorecard type, not a sector.
 */
export const UNTRUSTED_SECTOR_TOKENS = [
  'GENERIC',
  'MINING',
  'TOURISM',
  'PROPERTY',
  'CAS',
  'FORESTRY',
  'MAC',
] as const;

/** Strict check — unknown or untrusted tokens (incl. GENERIC) return false. */
export function isTrustedSectorCode(code: string): code is TrustedSectorCode {
  const upper = (code || '').trim().toUpperCase();
  return (TRUSTED_SECTOR_CODES as readonly string[]).includes(upper);
}

// ---------------------------------------------------------------------------
// Parser-side facts (must stay in sync with graph/ontology_queries.ts and
// schemas/calculator_allowlist.ts — enforced by tests)
// ---------------------------------------------------------------------------

/** Pillar codes the parser ontology uses on its document types. */
export const PARSER_PILLAR_CODES = ['OWN', 'MAC', 'SKL', 'ESD', 'SED'] as const;

export type ParserPillarCode = (typeof PARSER_PILLAR_CODES)[number];

export interface ParserPillarCoverage {
  parserPillar: ParserPillarCode;
  documentTypes: readonly string[];
  calculatorKeys: readonly string[];
}

/**
 * What the parser can actually produce, grouped by its own pillar codes.
 * Document type names must match `graph/ontology_queries.ts`; calculator keys
 * must all be present in `schemas/calculator_allowlist.ts`.
 */
export const PARSER_PILLAR_COVERAGE: readonly ParserPillarCoverage[] = [
  {
    parserPillar: 'ESD',
    documentTypes: ['B-BBEE Certificate', 'B-BBEE Sworn Affidavit', 'Supplier Spend Schedule'],
    calculatorKeys: [
      'supplier.name',
      'supplier.bee_level',
      'supplier.black_ownership',
      'supplier.certificate_expiry',
      'supplier.affidavit_signed_date',
      'supplier.spend',
    ],
  },
  {
    parserPillar: 'OWN',
    documentTypes: ['Ownership Confirmation'],
    calculatorKeys: ['ownership.entity_name', 'ownership.black_ownership', 'ownership.black_women_ownership'],
  },
  {
    parserPillar: 'MAC',
    documentTypes: ['Employment Equity Report'],
    calculatorKeys: ['management.black_representation', 'management.black_women_representation'],
  },
  {
    parserPillar: 'SKL',
    documentTypes: ['Workplace Skills Plan'],
    calculatorKeys: ['skills.total_spend', 'skills.black_spend'],
  },
  {
    parserPillar: 'SED',
    documentTypes: ['SED Contribution Confirmation'],
    calculatorKeys: ['sed.beneficiary_name', 'sed.contribution'],
  },
] as const;

// ---------------------------------------------------------------------------
// Scorecard pillar keys (mirror SectorConfig.pillarConfigs keys)
// ---------------------------------------------------------------------------

export type ScorecardPillarKey =
  | 'ownership'
  | 'managementControl'
  | 'employmentEquity'
  | 'skillsDevelopment'
  | 'preferentialProcurement'
  | 'supplierDevelopment'
  | 'enterpriseDevelopment'
  | 'socioEconomicDevelopment'
  | 'yesInitiative'
  | 'empowermentFinancing'
  | 'accessToFinancialServices'
  | 'consumerEducation';

export type PillarCoverageLevel = 'covered' | 'partially_covered' | 'not_covered' | 'unknown';

/**
 * How each scorecard pillar maps onto parser output, independent of sector.
 * "partially_covered" means the parser produces *some* trustworthy inputs but
 * not the full set a calculator needs; "not_covered" means the parser produces
 * nothing for that pillar.
 */
export const PILLAR_PARSER_MAPPING: Record<
  ScorecardPillarKey,
  { level: PillarCoverageLevel; parserPillars: readonly ParserPillarCode[]; notes: string }
> = {
  ownership: {
    level: 'partially_covered',
    parserPillars: ['OWN'],
    notes:
      'Ownership Confirmation yields entity name + black % + black women %. Missing: voting rights vs economic interest split, net value / deemed value, new entrants.',
  },
  managementControl: {
    level: 'partially_covered',
    parserPillars: ['MAC'],
    notes:
      'Employment Equity Report yields black + black women representation at a single measured level. Missing: board/exec/senior/middle/junior splits and EAP-weighted breakdowns.',
  },
  employmentEquity: {
    level: 'not_covered',
    parserPillars: [],
    notes:
      'Sectors that score EE separately (TRANSPORT) need per-occupational-level data; parser management.* keys are ambiguous between MC and EE and must not be reused.',
  },
  skillsDevelopment: {
    level: 'partially_covered',
    parserPillars: ['SKL'],
    notes:
      'WSP yields total + black spend only. Missing: leviable amount denominator, category B/C/D learnerships, disabled-learner spend, absorption.',
  },
  preferentialProcurement: {
    level: 'partially_covered',
    parserPillars: ['ESD'],
    notes:
      'Supplier certificates/affidavits + spend schedule yield per-supplier level, black ownership and spend rows. Missing: total measured procurement spend denominator, empowering supplier status, designated group supplier flags.',
  },
  supplierDevelopment: {
    level: 'not_covered',
    parserPillars: [],
    notes: 'No SD contribution evidence document type; supplier.* keys cover procurement recognition, not SD contributions (2% NPAT).',
  },
  enterpriseDevelopment: {
    level: 'not_covered',
    parserPillars: [],
    notes: 'No ED contribution evidence document type (1% NPAT contributions).',
  },
  socioEconomicDevelopment: {
    level: 'partially_covered',
    parserPillars: ['SED'],
    notes: 'SED confirmation yields contribution amount + beneficiary. Missing: NPAT denominator and % black beneficiaries.',
  },
  yesInitiative: { level: 'not_covered', parserPillars: [], notes: 'No YES initiative evidence document type.' },
  empowermentFinancing: { level: 'not_covered', parserPillars: [], notes: 'FSC-only pillar; no parser coverage.' },
  accessToFinancialServices: { level: 'not_covered', parserPillars: [], notes: 'FSC-only pillar; no parser coverage.' },
  consumerEducation: { level: 'not_covered', parserPillars: [], notes: 'FSC-only pillar; no parser coverage.' },
};

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

/**
 * - `live_scoring`     — parser output feeds the scorecard calculation directly.
 *                        NOT permitTED for any sector today (advisory-only wiring).
 * - `review_assisted`  — parser supplier evidence is surfaced with a review
 *                        breakdown and is useful *advisory* input for how the
 *                        sector scores procurement; it is NOT sufficient to
 *                        compute the PP score (denominator and supplier flags
 *                        are still missing).
 * - `shadow_mode`      — parser output is informative but the sector's pillar
 *                        structure has scored elements the parser cannot see
 *                        (split EE pillar, FSC AFS/EF, indicator-based PP=0).
 * - `not_ready`        — no scoring config exists for the sector token.
 */
export type SectorReadiness = 'live_scoring' | 'review_assisted' | 'shadow_mode' | 'not_ready';

export interface SectorCoverageEntry {
  /** Unique id matching the exported const name in sectorConfig.ts. */
  configId: string;
  sectorCode: TrustedSectorCode;
  scorecardType: 'Generic' | 'QSE' | 'EME' | 'Contractor' | 'BEP';
  sectorName: string;
  totalMaxPoints: number;
  /** Snapshot of pillarConfigs maxPoints — sync-tested against apps/api. */
  pillarPoints: Readonly<Partial<Record<ScorecardPillarKey, number>>>;
  readiness: SectorReadiness;
  readinessReasons: readonly string[];
}

const ADVISORY_ONLY_REASON =
  'Parser calculator payload is advisory (supplierEvidence) — it never enters buildPipelineResult, so live scoring is not permitted.';

export const SECTOR_PILLAR_COVERAGE: readonly SectorCoverageEntry[] = [
  {
    configId: 'RCOGP_GENERIC',
    sectorCode: 'RCOGP',
    scorecardType: 'Generic',
    sectorName: 'Revised Codes of Good Practice (Generic)',
    totalMaxPoints: 120,
    pillarPoints: {
      ownership: 25, managementControl: 19, skillsDevelopment: 25, preferentialProcurement: 29,
      supplierDevelopment: 10, enterpriseDevelopment: 7, socioEconomicDevelopment: 5, yesInitiative: 0,
    },
    readiness: 'review_assisted',
    readinessReasons: [
      ADVISORY_ONLY_REASON,
      'Standard pillar set; supplier evidence gives advisory review support for Preferential Procurement (29 pts) — the PP calculator still needs the total measured spend denominator.',
    ],
  },
  {
    configId: 'ICT_GENERIC',
    sectorCode: 'ICT',
    scorecardType: 'Generic',
    sectorName: 'ICT Sector Code (Generic)',
    totalMaxPoints: 140,
    pillarPoints: {
      ownership: 25, managementControl: 23, employmentEquity: 0, skillsDevelopment: 25,
      preferentialProcurement: 27, supplierDevelopment: 10, enterpriseDevelopment: 18,
      socioEconomicDevelopment: 12, yesInitiative: 0,
    },
    readiness: 'review_assisted',
    readinessReasons: [
      ADVISORY_ONLY_REASON,
      'EE carries 0 points (merged into MC); supplier evidence gives advisory review support for Preferential Procurement (27 pts) — the PP calculator still needs the total measured spend denominator.',
    ],
  },
  {
    configId: 'FSC_GENERIC',
    sectorCode: 'FSC',
    scorecardType: 'Generic',
    sectorName: 'Financial Sector Code (Generic)',
    totalMaxPoints: 120,
    pillarPoints: {
      ownership: 25, managementControl: 21, employmentEquity: 0, skillsDevelopment: 23,
      preferentialProcurement: 24, supplierDevelopment: 10, enterpriseDevelopment: 9,
      socioEconomicDevelopment: 8, yesInitiative: 0,
    },
    readiness: 'review_assisted',
    readinessReasons: [
      ADVISORY_ONLY_REASON,
      'FSC "Others" sub-sector has no Empowerment Financing / Access to Financial Services; standard pillars apply.',
    ],
  },
  {
    configId: 'FSC_BANKS',
    sectorCode: 'FSC',
    scorecardType: 'Generic',
    sectorName: 'Financial Sector Code (Banks — FS701)',
    totalMaxPoints: 130,
    pillarPoints: {
      ownership: 25, managementControl: 21, employmentEquity: 0, skillsDevelopment: 23,
      preferentialProcurement: 24, supplierDevelopment: 10, enterpriseDevelopment: 7,
      socioEconomicDevelopment: 8, yesInitiative: 0, empowermentFinancing: 0, accessToFinancialServices: 12,
    },
    readiness: 'shadow_mode',
    readinessReasons: [
      ADVISORY_ONLY_REASON,
      'Access to Financial Services (12 pts) is scored but invisible to the parser.',
    ],
  },
  {
    configId: 'FSC_LTI',
    sectorCode: 'FSC',
    scorecardType: 'Generic',
    sectorName: 'Financial Sector Code (Long-Term Insurers — FS702)',
    totalMaxPoints: 132,
    pillarPoints: {
      ownership: 25, managementControl: 21, employmentEquity: 0, skillsDevelopment: 23,
      preferentialProcurement: 24, supplierDevelopment: 10, enterpriseDevelopment: 9,
      socioEconomicDevelopment: 8, yesInitiative: 0, empowermentFinancing: 0, accessToFinancialServices: 12,
    },
    readiness: 'shadow_mode',
    readinessReasons: [
      ADVISORY_ONLY_REASON,
      'Access to Financial Services (12 pts) is scored but invisible to the parser.',
    ],
  },
  {
    configId: 'FSC_STI',
    sectorCode: 'FSC',
    scorecardType: 'Generic',
    sectorName: 'Financial Sector Code (Short-Term Insurers — FS703)',
    totalMaxPoints: 132,
    pillarPoints: {
      ownership: 25, managementControl: 21, employmentEquity: 0, skillsDevelopment: 23,
      preferentialProcurement: 24, supplierDevelopment: 10, enterpriseDevelopment: 9,
      socioEconomicDevelopment: 8, yesInitiative: 0, accessToFinancialServices: 12,
    },
    readiness: 'shadow_mode',
    readinessReasons: [
      ADVISORY_ONLY_REASON,
      'Access to Financial Services (12 pts) is scored but invisible to the parser.',
    ],
  },
  {
    configId: 'AGRI_GENERIC',
    sectorCode: 'AGRI',
    scorecardType: 'Generic',
    sectorName: 'AgriBEE Sector Code (Generic)',
    totalMaxPoints: 132,
    pillarPoints: {
      ownership: 25, managementControl: 23, employmentEquity: 0, skillsDevelopment: 25,
      preferentialProcurement: 27, supplierDevelopment: 10, enterpriseDevelopment: 7,
      socioEconomicDevelopment: 15, yesInitiative: 0,
    },
    readiness: 'review_assisted',
    readinessReasons: [
      ADVISORY_ONLY_REASON,
      'EE carries 0 points; supplier evidence gives advisory review support for Preferential Procurement (27 pts) — the PP calculator still needs the total measured spend denominator.',
    ],
  },
  {
    configId: 'TRANSPORT_GENERIC',
    sectorCode: 'TRANSPORT',
    scorecardType: 'Generic',
    sectorName: 'Transport Sector Code (Large Enterprise)',
    totalMaxPoints: 108,
    pillarPoints: {
      ownership: 24, managementControl: 11, employmentEquity: 18, skillsDevelopment: 15,
      preferentialProcurement: 20, supplierDevelopment: 15, enterpriseDevelopment: 0,
      socioEconomicDevelopment: 5, yesInitiative: 0,
    },
    readiness: 'shadow_mode',
    readinessReasons: [
      ADVISORY_ONLY_REASON,
      'Employment Equity is a separately scored pillar (18 pts); parser management.* keys are ambiguous between MC and EE.',
    ],
  },
  {
    configId: 'RCOGP_QSE',
    sectorCode: 'RCOGP',
    scorecardType: 'QSE',
    sectorName: 'Revised Codes (QSE)',
    totalMaxPoints: 108,
    pillarPoints: {
      ownership: 25, managementControl: 15, skillsDevelopment: 30, preferentialProcurement: 21,
      supplierDevelopment: 5, enterpriseDevelopment: 7, socioEconomicDevelopment: 5, yesInitiative: 0,
    },
    readiness: 'review_assisted',
    readinessReasons: [
      ADVISORY_ONLY_REASON,
      'Standard QSE pillar set; supplier evidence gives advisory review support for Preferential Procurement (21 pts) — the PP calculator still needs the total measured spend denominator.',
    ],
  },
  {
    configId: 'ICT_QSE',
    sectorCode: 'ICT',
    scorecardType: 'QSE',
    sectorName: 'ICT Sector Code (QSE)',
    totalMaxPoints: 116,
    pillarPoints: {
      ownership: 25, managementControl: 15, skillsDevelopment: 30, preferentialProcurement: 21,
      supplierDevelopment: 5, enterpriseDevelopment: 8, socioEconomicDevelopment: 12, yesInitiative: 0,
    },
    readiness: 'review_assisted',
    readinessReasons: [
      ADVISORY_ONLY_REASON,
      'Standard QSE pillar set; supplier evidence gives advisory review support for Preferential Procurement (21 pts) — the PP calculator still needs the total measured spend denominator.',
    ],
  },
  {
    configId: 'TRANSPORT_QSE',
    sectorCode: 'TRANSPORT',
    scorecardType: 'QSE',
    sectorName: 'Transport Sector Code (QSE)',
    totalMaxPoints: 107,
    pillarPoints: {
      ownership: 28, managementControl: 27, employmentEquity: 27, skillsDevelopment: 25,
      preferentialProcurement: 25, supplierDevelopment: 0, enterpriseDevelopment: 25,
      socioEconomicDevelopment: 25, yesInitiative: 0,
    },
    readiness: 'shadow_mode',
    readinessReasons: [
      ADVISORY_ONLY_REASON,
      'Separately scored EE pillar (27 pts) plus a compulsory + elective structure the parser cannot see.',
    ],
  },
  {
    configId: 'CONSTRUCTION_QSE',
    sectorCode: 'CONSTRUCTION',
    scorecardType: 'QSE',
    sectorName: 'Construction Sector Code (QSE)',
    totalMaxPoints: 110,
    pillarPoints: {
      ownership: 30, managementControl: 20, skillsDevelopment: 26, preferentialProcurement: 0,
      supplierDevelopment: 29, enterpriseDevelopment: 0, socioEconomicDevelopment: 5, yesInitiative: 0,
    },
    readiness: 'shadow_mode',
    readinessReasons: [
      ADVISORY_ONLY_REASON,
      'Indicator-based scorecard with Preferential Procurement carrying 0 points; supplier evidence does not map onto the scored SD indicators.',
    ],
  },
  {
    configId: 'CONSTRUCTION_CONTRACTOR',
    sectorCode: 'CONSTRUCTION',
    scorecardType: 'Contractor',
    sectorName: 'Construction Sector Code (Contractor)',
    totalMaxPoints: 123,
    pillarPoints: {
      ownership: 31, managementControl: 22, skillsDevelopment: 26, preferentialProcurement: 0,
      supplierDevelopment: 38, enterpriseDevelopment: 0, socioEconomicDevelopment: 6, yesInitiative: 0,
    },
    readiness: 'shadow_mode',
    readinessReasons: [
      ADVISORY_ONLY_REASON,
      'Indicator-based scorecard with Preferential Procurement carrying 0 points; supplier evidence does not map onto the scored SD indicators.',
    ],
  },
  {
    configId: 'CONSTRUCTION_BEP',
    sectorCode: 'CONSTRUCTION',
    scorecardType: 'BEP',
    sectorName: 'Construction Sector Code (Built Environment Professional)',
    totalMaxPoints: 123,
    pillarPoints: {
      ownership: 31, managementControl: 22, skillsDevelopment: 34, preferentialProcurement: 0,
      supplierDevelopment: 30, enterpriseDevelopment: 0, socioEconomicDevelopment: 6, yesInitiative: 0,
    },
    readiness: 'shadow_mode',
    readinessReasons: [
      ADVISORY_ONLY_REASON,
      'Indicator-based scorecard with Preferential Procurement carrying 0 points; supplier evidence does not map onto the scored SD indicators.',
    ],
  },
] as const;

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

/** All coverage entries for a sector code (a code may have several configs). */
export function getSectorCoverage(sectorCode: string): SectorCoverageEntry[] {
  const upper = (sectorCode || '').trim().toUpperCase();
  return SECTOR_PILLAR_COVERAGE.filter((entry) => entry.sectorCode === upper);
}

/** Readiness for an arbitrary sector token; untrusted/unknown → not_ready. */
export function sectorReadiness(sectorCode: string): SectorReadiness {
  if (!isTrustedSectorCode(sectorCode)) return 'not_ready';
  const entries = getSectorCoverage(sectorCode);
  if (entries.length === 0) return 'not_ready';
  const order: SectorReadiness[] = ['not_ready', 'shadow_mode', 'review_assisted', 'live_scoring'];
  // The sector's overall readiness is its weakest config's readiness.
  return entries.reduce<SectorReadiness>(
    (weakest, entry) => (order.indexOf(entry.readiness) < order.indexOf(weakest) ? entry.readiness : weakest),
    'live_scoring',
  );
}
