import { create } from 'zustand';
import {
  Client, OwnershipData, ManagementData, SkillsData,
  ProcurementData, ESDData, SEDData, ScorecardResult,
  Shareholder, Employee, TrainingProgram, Supplier, Contribution, FinancialYear,
  TrainingCategoryCode, AfsData, EmpowermentFinancingData, BreakdownLine,
} from './types';
import { toBreakdownLines, eapDetailRows, skillsCategoryRows, type EapDetailCell } from './calculators/breakdown';
import { v4 as uuidv4 } from "uuid";
import { api, invalidateClientData } from './api';
import { API_BASE } from './config';
import type { CalculatorConfig } from '../../../shared/schema';
import {
  RCOGP_GENERIC_CALCULATOR_CONFIG,
  isRcogpGenericSector,
} from './sectors/rcogp-generic';
import {
  RCOGP_QSE_CALCULATOR_CONFIG,
  isRcogpQseSector,
} from './sectors/rcogp-qse';
import {
  ICT_GENERIC_CALCULATOR_CONFIG,
  isIctGenericSector,
} from './sectors/ict-generic';
import {
  ICT_QSE_CALCULATOR_CONFIG,
  isIctQseSector,
} from './sectors/ict-qse';
import {
  FSC_GENERIC_CALCULATOR_CONFIG,
  isFscGenericSector,
} from './sectors/fsc-generic';
import {
  FSC_BANKS_CALCULATOR_CONFIG,
  isFscBanksSector,
} from './sectors/fsc-banks';
import {
  FSC_QSE_CALCULATOR_CONFIG,
  isFscQseSector,
} from './sectors/fsc-qse';
import { applyDeemedLevel, resolveDeemedLevel } from './calculators/deemedLevel';
import {
  FSC_LTI_CALCULATOR_CONFIG,
  isFscLtiSector,
} from './sectors/fsc-lti';
import {
  FSC_STI_CALCULATOR_CONFIG,
  isFscStiSector,
} from './sectors/fsc-sti';
import { normalizeFscSubSector } from './sectors/fsc-utils';
import {
  AGRI_GENERIC_CALCULATOR_CONFIG,
  isAgriGenericSector,
} from './sectors/agri-generic';
import {
  isConstructionSector,
  resolveConstructionScorecardKey,
  buildConstructionCalculatorConfig,
} from './sectors/construction';
import { buildConstructionScoringInput } from './calculators/construction-map';
import { calculateConstructionScorecard } from '../../../../api/pipeline/constructionScoring';

import { coerceYesNo } from '@/lib/yesNoValue';
import { calculateOwnershipScore } from './calculators/ownership';
import { calculateManagementScore } from './calculators/management';
import { calculateSkillsScore } from './calculators/skills';
import { calculateProcurementScore } from './calculators/procurement';
import { calculateEsdScore, calculateSedScore } from './calculators/esd-sed';
import { calculateYESScore } from './calculators/yes';
import { calculateAfsScore } from './calculators/afs';
import { calculateEmpowermentFinancingScore } from './calculators/empowermentFinancing';
import {
  calculateTransportQseManagement,
  calculateTransportQseEmploymentEquity,
  isTransportQseSector,
  calculateTransportLargeManagementControl,
  calculateTransportLargeEmploymentEquity,
  calculateTransportLargeSkills,
  isTransportLargeSector,
} from './calculators/transport';
import { TRANSPORT_GENERIC_CALCULATOR_CONFIG } from './sectors/transport-generic';
import { TRANSPORT_QSE_CALCULATOR_CONFIG } from './sectors/transport-qse';
import {
  deepClone,
  round2,
  SectorConfigError,
  requireSectorConfig,
  allowsRcogpDefaults,
  normalizeRace,
  normalizeDesignationForScoring,
} from './calculators/shared';

export interface ScenarioSnapshot {
  id: string;
  name: string;
  createdAt: string;
  client: Client;
  ownership: OwnershipData;
  management: ManagementData;
  skills: SkillsData;
  procurement: ProcurementData;
  esd: ESDData;
  sed: SEDData;
  scorecard: ScorecardResult;
}

interface PillarState {
  client: Client;
  ownership: OwnershipData;
  management: ManagementData;
  skills: SkillsData;
  procurement: ProcurementData;
  esd: ESDData;
  sed: SEDData;
  afs: AfsData;
  empowermentFinancing: EmpowermentFinancingData;
  scorecard: ScorecardResult;
}

function snapshotPillarState(state: PillarState): PillarState {
  return {
    client: deepClone(state.client),
    ownership: deepClone(state.ownership),
    management: deepClone(state.management),
    skills: deepClone(state.skills),
    procurement: deepClone(state.procurement),
    esd: deepClone(state.esd),
    sed: deepClone(state.sed),
    afs: deepClone(state.afs),
    empowermentFinancing: deepClone(state.empowermentFinancing),
    scorecard: deepClone(state.scorecard),
  };
}

const emptyClient: Client = {
  id: '', name: '', financialYear: '', revenue: 0, npat: 0,
  leviableAmount: 0, industry: 'Generic', eapProvince: 'National',
  financialHistory: [],
  // New fields with defaults
  registrationNumber: '',
  physicalAddress: '',
  contactPerson: '',
  contactEmail: '',
  contactPhone: '',
  sectorCode: 'RCOGP',
  companySize: 'Generic',
  annualTurnover: 0,
  numberOfEmployees: 0,
};

const emptyOwnership: OwnershipData = {
  id: '', clientId: '', shareholders: [], companyValue: 0, outstandingDebt: 0, yearsHeld: 0,
  ownershipScorePoints: 0,
  ownershipScorePercent: 0,
  netValuePoints: 0,
  netValuePercent: 0,
};

const emptyManagement: ManagementData = { id: '', clientId: '', employees: [] };
const emptySkills: SkillsData = { 
  id: '', clientId: '', leviableAmount: 0, trainingPrograms: [],
  yesCandidatesCount: 0,
  yesAbsorbedCount: 0,
};
// Issue 3: Removed graduationBonus and jobsCreatedBonus (ED only bonuses)
const emptyProcurement: ProcurementData = { id: '', clientId: '', tmps: 0, suppliers: [] };
const emptyESD: ESDData = { id: '', clientId: '', contributions: [], graduationBonus: false, jobsCreatedBonus: false };
const emptySED: SEDData = { id: '', clientId: '', contributions: [] };
const emptyAfs: AfsData = { id: '', clientId: '' };
const emptyEmpowermentFinancing: EmpowermentFinancingData = { id: '', clientId: '' };

/**
 * Factory function to build an empty scorecard from calculatorConfig.
 * Falls back to RCOGP Generic defaults if no config provided.
 */
function normalizeFraction(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  if (n > 1) return n / 100;
  return Math.max(0, n);
}

/** Fetch sector-specific calculator config from API (authoritative pillar weightings).
 * Returns a tagged result so callers can distinguish network failures from
 * server-side 404/5xx (Q4 verification: previously a bare null swallowed both
 * cases, leaving the user with no UI signal).
 */
async function fetchSectorCalculatorConfig(
  sectorCode: string,
  scorecardType: string,
): Promise<{ config: CalculatorConfig | null; failure: 'network' | 'server' | null }> {
  try {
    const res = await fetch(
      `${API_BASE}/api/scorecard/sector-config/${encodeURIComponent(sectorCode)}/${encodeURIComponent(scorecardType)}`,
    );
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.config) return { config: data.config as CalculatorConfig, failure: null };
      return { config: null, failure: 'server' };
    }
    return { config: null, failure: 'server' };
  } catch (error) {
    console.error('[store] Failed to fetch sector calculator config:', error);
    return { config: null, failure: 'network' };
  }
}

function hasValidPillarConfigs(config: CalculatorConfig | null | undefined): boolean {
  if (!config?.pillarConfigs) return false;
  const pc = config.pillarConfigs;
  const ownMax = pc.ownership?.maxPoints ?? 0;
  const mcMax = pc.managementControl?.maxPoints ?? 0;
  return (ownMax + mcMax) > 0 && (config.totalMaxPoints ?? 0) > 0;
}

/** Map workbook / EE job titles to calculator designation enums. */
function mapJobTitleToDesignation(raw: string | undefined): string {
  const t = (raw ?? '').trim().toLowerCase();
  if (!t) return 'Junior';
  if (t.includes('non-executive') || t.includes('non executive') || t === 'director') return 'Board';
  if (t.includes('executive director')) return 'Executive Director';
  if (t.includes('other executive')) return 'Other Executive Management';
  if (t.includes('senior')) return 'Senior';
  if (t.includes('middle')) return 'Middle';
  if (t.includes('junior')) return 'Junior';
  if (t.includes('semi-skilled') || t.includes('semi skilled')) return 'Semi-skilled';
  if (t.includes('unskilled')) return 'Unskilled';
  if (t.includes('executive') || t.includes('ceo') || t.includes('managing director')) return 'Executive Director';
  if (t.includes('manager') || t.includes('supervisor')) return 'Middle';
  return 'Junior';
}

// Ownership / MC / EE are here because Transport QSE elects any FOUR of its
// seven elements — none of the seven is compulsory. Sectors that only make the
// tail four elective simply never mark the first three with a group.
type PillarConfigKey =
  | 'ownership'
  | 'managementControl'
  | 'employmentEquity'
  | 'skillsDevelopment'
  | 'preferentialProcurement'
  | 'enterpriseDevelopment'
  | 'socioEconomicDevelopment';

const ELECTIVE_CONFIG_TO_SCORECARD: Record<PillarConfigKey, keyof ScorecardResult> = {
  ownership: 'ownership',
  managementControl: 'managementControl',
  employmentEquity: 'employmentEquity',
  skillsDevelopment: 'skillsDevelopment',
  preferentialProcurement: 'procurement',
  enterpriseDevelopment: 'enterpriseDevelopment',
  socioEconomicDevelopment: 'socioEconomicDevelopment',
};

/**
 * Elect the highest-scoring members of each elective group.
 *
 * How many are elected comes from `electiveGroupSizes[group]`, defaulting to 1.
 * Transport QSE elects FOUR of seven: where the entity has not chosen its four
 * elements, the verification agency measures the four it scores best on.
 */
function resolveChooseOneElectives(
  pConfig: CalculatorConfig['pillarConfigs'],
  rawScores: Record<PillarConfigKey, number>,
  electiveGroupSizes?: Record<string, number>,
): { chosenKey: PillarConfigKey | null; activeKeys: Set<PillarConfigKey> } {
  const groups = new Map<string, PillarConfigKey[]>();
  for (const key of Object.keys(ELECTIVE_CONFIG_TO_SCORECARD) as PillarConfigKey[]) {
    const group = pConfig?.[key]?.chooseOneGroup;
    if (group) {
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group)!.push(key);
    }
  }
  const activeKeys = new Set<PillarConfigKey>();
  let chosenKey: PillarConfigKey | null = null;
  for (const [group, keys] of Array.from(groups.entries())) {
    const size = electiveGroupSizes?.[group] ?? 1;
    const elected = [...keys].sort((a, b) => (rawScores[b] ?? 0) - (rawScores[a] ?? 0)).slice(0, size);
    for (const key of elected) activeKeys.add(key);
    chosenKey = elected[0] ?? null;
  }
  return { chosenKey, activeKeys };
}

function buildEmptyScorecard(config?: CalculatorConfig | null): ScorecardResult {
  const pc = config?.pillarConfigs;
  const eeMax = pc?.employmentEquity?.maxPoints ?? 0;
  return {
    ownership: { score: 0, target: pc?.ownership?.maxPoints ?? 25, weighting: pc?.ownership?.maxPoints ?? 25, subMinimumMet: false },
    managementControl: { score: 0, target: pc?.managementControl?.maxPoints ?? 19, weighting: pc?.managementControl?.maxPoints ?? 19 },
    ...(eeMax > 0 ? { employmentEquity: { score: 0, target: eeMax, weighting: eeMax } } : {}),
    skillsDevelopment: { score: 0, target: pc?.skillsDevelopment?.maxPoints ?? 25, weighting: pc?.skillsDevelopment?.maxPoints ?? 25, subMinimumMet: false },
    procurement: { score: 0, target: pc?.preferentialProcurement?.maxPoints ?? 29, weighting: pc?.preferentialProcurement?.maxPoints ?? 29, subMinimumMet: false },
    supplierDevelopment: { score: 0, target: pc?.supplierDevelopment?.maxPoints ?? 10, weighting: pc?.supplierDevelopment?.maxPoints ?? 10, subMinimumMet: false },
    enterpriseDevelopment: { score: 0, target: pc?.enterpriseDevelopment?.maxPoints ?? 7, weighting: pc?.enterpriseDevelopment?.maxPoints ?? 7, subMinimumMet: false },
    socioEconomicDevelopment: { score: 0, target: pc?.socioEconomicDevelopment?.maxPoints ?? 5, weighting: pc?.socioEconomicDevelopment?.maxPoints ?? 5 },
    yesInitiative: { score: 0, target: pc?.yesInitiative?.maxPoints ?? 3, weighting: pc?.yesInitiative?.maxPoints ?? 3 },
    total: {
      score: 0,
      target: config?.totalMaxPoints ?? 120,
      weighting: config?.totalMaxPoints ?? 120,
    },
    achievedLevel: 9, discountedLevel: 9, isDiscounted: false, recognitionLevel: '0%',
    chosenElectivePillar: null,
  };
}

/** Legacy export for backward compatibility */
const emptyScorecard = buildEmptyScorecard();

export interface PipelineOverrides {
  ownership?: number;
  managementControl?: number;
  skillsDevelopment?: number;
  procurement?: number;
  supplierDevelopment?: number;
  enterpriseDevelopment?: number;
  socioEconomicDevelopment?: number;
  yesInitiative?: number;
  totalPoints?: number;
  achievedLevel?: number;
  discountedLevel?: number;
  isDiscounted?: boolean;
  recognitionLevel?: string;
  subMinimumsMet?: boolean;
}

export type CalculatorConfigStatus = 'idle' | 'loading' | 'ready' | 'error';
export interface CalculatorConfigErrorInfo {
  reason: 'network' | 'server' | 'invalid-config' | 'unknown-sector' | 'fsc-no-subsector' | 'recalc-before-load';
  message: string;
  sectorCode: string;
  scorecardType: string;
  fscSubSector?: string;
}

interface BbeeState extends PillarState {
  isLoaded: boolean;
  activeClientId: string | null;
  pipelineOverrides: PipelineOverrides | null;
  calculatorConfig: CalculatorConfig | null;
  calculatorConfigStatus: CalculatorConfigStatus;
  calculatorConfigError: CalculatorConfigErrorInfo | null;

  isScenarioMode: boolean;
  activeScenarioId: string | null;
  scenarios: ScenarioSnapshot[];
  baseSnapshot: ScenarioSnapshot | null;

  /** When true, calculate scorecard without applying sub-minimum discounts */
  ignoreSubMinimum: boolean;

  loadClientData: (clientId: string) => Promise<void>;
  clearData: () => void;
  startNewSession: () => void;

  setPipelineOverrides: (overrides: PipelineOverrides) => void;
  setIgnoreSubMinimum: (value: boolean) => void;

  addShareholder: (shareholder: Shareholder) => void;
  updateShareholder: (id: string, data: Partial<Shareholder>) => void;
  removeShareholder: (id: string) => void;
  updateCompanyValue: (value: number, debt: number) => void;

  addEmployee: (employee: Employee) => void;
  updateEmployee: (id: string, data: Partial<Employee>) => void;
  removeEmployee: (id: string) => void;

  addTrainingProgram: (program: TrainingProgram) => void;
  updateTrainingProgram: (id: string, data: Partial<TrainingProgram>) => void;
  removeTrainingProgram: (id: string) => void;

  addSupplier: (supplier: Supplier) => void;
  updateSupplier: (id: string, data: Partial<Supplier>) => void;
  removeSupplier: (id: string) => void;

  addEmployeesBulk: (employees: Employee[]) => void;

  addEsdContribution: (contribution: Contribution) => void;
  removeEsdContribution: (id: string) => void;

  addSedContribution: (contribution: Contribution) => void;
  removeSedContribution: (id: string) => void;

  /** FSC sub-sector AFS data updates (Banks/LTI/STI). */
  updateAfs: (data: Partial<AfsData>) => void;
  /** FSC sub-sector picker: update fscSubSector and reload calculator config. */
  setFscSubSector: (subSector: 'Others' | 'Banks' | 'LTI' | 'STI') => void;

  // Issue 3: Removed updateProcurementBonuses - bonuses are ED only
  updateEsdBonuses: (graduationBonus: boolean, jobsCreatedBonus: boolean, jobsCreatedCount?: number, graduationEvidence?: string, jobsCreatedEvidence?: string) => void;
  /** FSC-only SED spend fields (Consumer Education, CE bonus, Fundisa). */
  updateSedSpend: (data: { ceSpend?: number; ceBonusSpend?: number; fundisaSpend?: number }) => void;
  
  updateFinancials: (revenue: number, npat: number, leviableAmount: number, industryNorm?: number) => void;
  updateTMPS: (tmps: number, manualOverride?: boolean) => void;
  updateSettings: (eapProvince: string, industrySector: string, measurementPeriodStart?: string, measurementPeriodEnd?: string) => void;
  /** Update the industry VERTICAL (Manufacturing, Retail, etc.) used for industry-norm lookup. Distinct from sectorCode/industrySector which drive the scorecard. */
  updateIndustry: (industry: string) => void;
  /** Update the CEE report vintage used for MC/Skills EAP targets (undefined = latest). */
  updateEapYear: (eapYear: number | undefined) => void;

  loadCalculatorConfig: (clientId: string) => Promise<void>;
  saveCalculatorConfig: (config: CalculatorConfig) => Promise<void>;

  addFinancialYear: (year: FinancialYear) => void;
  updateFinancialYear: (id: string, data: Partial<FinancialYear>) => void;
  removeFinancialYear: (id: string) => void;
  
  createScenario: (name: string) => void;
  switchScenario: (id: string | null) => void;
  deleteScenario: (id: string) => void;

  // Dynamic scorecard API actions
  loadTemplateStructure: (graphKey: string) => Promise<{
    graphKey: string;
    scorecardKey: string;
    templateName: string;
    sectorCode: string;
    scorecardType: string;
    pillars: Array<{
      key: string;
      name: string;
      weighting: number;
      target?: number;
      indicators: Array<{
        key: string;
        name: string;
        target: number;
        weighting: number;
      }>;
    }>;
  } | null>;

  calculateFromTemplate: (graphKey: string, entityMap?: Record<string, unknown>) => Promise<{
    total: { score: number; maxPossible: number; percentage: number };
    pillars: Record<string, {
      key: string;
      score: number;
      achieved: number;
      percentage: number;
      subMinimumMet?: boolean;
      indicators: Array<{
        key: string;
        score: number;
        achieved: number;
      }>;
    }>;
    beeLevel?: string;
    recognition?: string;
  } | null>;

  validateEntityCoverage: (sectorCode: string, scorecardType: string) => Promise<{
    hasCoverage: boolean;
    percentage: number;
    mappedEntities: number;
    totalEntities: number;
    unmappedEntities: string[];
  } | null>;

  _recalculateAll: () => void;

  setScorecardFromAPI: (apiResult: APIScorecardResult) => void;
}

/**
 * Shape returned by the UCS engine (POST /api/calculate).
 * Mapped to the frontend ScorecardResult by setScorecardFromAPI.
 */
export interface APIScorecardResult {
  assessmentId: string;
  sectorCode: string;
  scorecardType: string;
  totalPoints: number;
  maxPoints: number;
  overallPercentage: number;
  beeLevel: number;
  recognitionLevel: number;
  pillars: Array<{
    pillarCode: string;
    pillarName: string;
    points: number;
    maxPoints: number;
    percentage: number;
    subMinimumMet: boolean;
    criteria: unknown[];
  }>;
  subMinimums: Record<string, boolean>;
  calculationErrors: string[];
  calculatedAt: string;
  validation?: { errors: string[]; warnings: string[]; isValid: boolean };
  ontologySnapshot?: unknown;
}

function mapAPIScorecardToFrontend(api: APIScorecardResult, ignoreSubMinimum = false): ScorecardResult {
  const findPillar = (code: string) =>
    api.pillars.find(p => p.pillarCode === code);

  const makePillarScore = (code: string, fallbackTarget: number) => {
    const p = findPillar(code);
    return {
      score: round2(p?.points ?? 0),
      target: p?.maxPoints ?? fallbackTarget,
      weighting: p?.maxPoints ?? fallbackTarget,
      subMinimumMet: p?.subMinimumMet ?? true,
    };
  };

  const own = makePillarScore('ownership', 25);
  const mc = makePillarScore('managementControl', 19);
  const sk = makePillarScore('skillsDevelopment', 25);
  const proc = makePillarScore('preferentialProcurement', 29);
  const sd = makePillarScore('supplierDevelopment', 10);
  const ed = makePillarScore('enterpriseDevelopment', 7);
  const sed = makePillarScore('socioEconomicDevelopment', 5);
  const yes = makePillarScore('yesInitiative', 3);

  const anySubMinFailed = Object.values(api.subMinimums).some(v => !v);
  const achievedLevel = api.beeLevel;
  // When ignoreSubMinimum is true, don't apply the discount even if sub-minimums failed
  const isDiscounted = !ignoreSubMinimum && achievedLevel < 9 && anySubMinFailed;
  const discountedLevel = isDiscounted ? Math.min(achievedLevel + 1, 8) : achievedLevel;

  const recMap: Record<number, string> = {
    1: '135%', 2: '125%', 3: '110%', 4: '100%',
    5: '80%', 6: '60%', 7: '50%', 8: '10%',
  };

  return {
    ownership: own,
    managementControl: mc,
    skillsDevelopment: sk,
    procurement: proc,
    supplierDevelopment: sd,
    enterpriseDevelopment: ed,
    socioEconomicDevelopment: sed,
    yesInitiative: yes,
    total: {
      score: round2(api.totalPoints),
      target: api.maxPoints,
      weighting: api.maxPoints,
    },
    achievedLevel,
    discountedLevel,
    isDiscounted,
    recognitionLevel: recMap[discountedLevel] || `${api.recognitionLevel}%`,
  };
}

/** Standard B-BBEE level thresholds — used when config.levelThresholds unavailable */
const STANDARD_LEVEL_THRESHOLDS = [
  { level: 1, minPoints: 100, recognition: 135 },
  { level: 2, minPoints: 95, recognition: 125 },
  { level: 3, minPoints: 90, recognition: 110 },
  { level: 4, minPoints: 80, recognition: 100 },
  { level: 5, minPoints: 75, recognition: 80 },
  { level: 6, minPoints: 70, recognition: 60 },
  { level: 7, minPoints: 55, recognition: 50 },
  { level: 8, minPoints: 40, recognition: 10 },
];

/**
 * Convert total points to BEE level.
 * Uses calculatorConfig.levelThresholds if available, otherwise standard RCOGP thresholds.
 */
function pointsToLevel(totalPoints: number, config?: CalculatorConfig | null): number {
  const thresholds = config?.levelThresholds || STANDARD_LEVEL_THRESHOLDS;
  
  // Sort by minPoints descending to find highest qualifying level
  const sorted = [...thresholds].sort((a, b) => b.minPoints - a.minPoints);
  
  for (const t of sorted) {
    if (totalPoints >= t.minPoints) {
      return t.level;
    }
  }
  
  // Default to level 9 (Non-Compliant) if below all thresholds
  return 9;
}

function levelToRecognition(level: number, config?: CalculatorConfig | null): string {
  if (level >= 9) return '0%';
  
  const thresholds = config?.levelThresholds || STANDARD_LEVEL_THRESHOLDS;
  const threshold = thresholds.find((t: any) => t.level === level);
  if (threshold?.recognition) {
    return `${threshold.recognition}%`;
  }
  
  return '0%';
}

function assertSectorConfigLoaded(cfg: CalculatorConfig, client: Client): void {
  const sectorCode = cfg.sectorCode ?? client.sectorCode;
  const scorecardType = cfg.scorecardType ?? client.scorecardType ?? client.companySize ?? 'Generic';

  if (allowsRcogpDefaults(sectorCode, scorecardType)) return;

  if (!hasValidPillarConfigs(cfg)) {
    throw new SectorConfigError(
      `Sector configuration not loaded for ${sectorCode} ${scorecardType}. Select a sector and wait for config to load before scoring.`,
    );
  }

  requireSectorConfig(sectorCode, 'skills', cfg.skills as Record<string, unknown>, scorecardType);
  requireSectorConfig(sectorCode, 'procurement', cfg.procurement as Record<string, unknown>, scorecardType);
  requireSectorConfig(sectorCode, 'management', cfg.management as Record<string, unknown>, scorecardType);
  requireSectorConfig(sectorCode, 'managementControl', cfg.managementControl as Record<string, unknown>, scorecardType);
  requireSectorConfig(sectorCode, 'esd', cfg.esd as Record<string, unknown>, scorecardType);
  requireSectorConfig(sectorCode, 'sed', cfg.sed as Record<string, unknown>, scorecardType);
}

/**
 * Flow-through black ownership from the entered shareholders — the measure the
 * Amended Codes deem EME/QSE levels on (share-weighted, voting and economic
 * interest from the same beneficial-ownership data the ownership calculator
 * uses).
 */
function flowThroughBlackOwnership(state: PillarState): { voting: number; ei: number } {
  const shareholders = state.ownership?.shareholders ?? [];
  const totalShares = shareholders.reduce((acc, sh) => acc + (sh.shares || 0), 0);
  let voting = 0;
  for (const sh of shareholders) {
    const pct = totalShares > 0
      ? (sh.shares || 0) / totalShares
      : shareholders.length > 0 ? 1 / shareholders.length : 0;
    voting += pct * (sh.blackOwnership || 0);
  }
  return { voting, ei: voting };
}

function deemedFor(state: PillarState): ReturnType<typeof resolveDeemedLevel> {
  const { voting, ei } = flowThroughBlackOwnership(state);
  return resolveDeemedLevel({
    sectorCode: String(state.client.sectorCode ?? ''),
    scorecardType: String(state.client.scorecardType ?? ''),
    blackVotingPct: voting,
    blackEconomicInterestPct: ei,
  });
}

function calculateScorecard(
  state: PillarState & { calculatorConfig?: CalculatorConfig | null; ignoreSubMinimum?: boolean },
  overrides?: PipelineOverrides | null,
): ScorecardResult {
  const cfg = state.calculatorConfig;

  // An EME is not scorecard-measured at all: the Codes deem its level (L4,
  // enhanced to L2/L1 by black ownership) on an annual sworn affidavit. No
  // sector config is needed — and demanding one turned every EME into an
  // error instead of its lawful level. (Transport EMEs are excluded by
  // resolveDeemedLevel — legacy code, different regime.)
  if (String(state.client.scorecardType ?? '').trim().toUpperCase() === 'EME') {
    const deemed = deemedFor(state);
    if (deemed) {
      const zero = { score: 0, target: 0, weighting: 0 };
      return {
        ownership: { ...zero, subMinimumMet: true },
        managementControl: zero,
        skillsDevelopment: { ...zero, subMinimumMet: true },
        procurement: { ...zero, subMinimumMet: true },
        supplierDevelopment: { ...zero, subMinimumMet: true },
        enterpriseDevelopment: { ...zero, subMinimumMet: true },
        socioEconomicDevelopment: zero,
        yesInitiative: zero,
        total: zero,
        achievedLevel: deemed.level,
        discountedLevel: deemed.level,
        isDiscounted: false,
        recognitionLevel: levelToRecognition(deemed.level, cfg),
        deemedLevel: deemed.level,
        deemedLevelReason: deemed.reason,
      };
    }
  }

  if (!cfg) throw new Error('calculatorConfig must be loaded before calculating scorecard. Please select a sector first.');

  // Construction scores via the expert-verified indicator-matrix evaluator, not the
  // pillar calculators. Map the Toolkit data → ConstructionScoringInput, evaluate, and
  // adapt the 5-element output into ScorecardResult (construction folds PP+SD into the
  // ESD element → mapped to the procurement slot; SD/ED/EE/YES slots are zeroed).
  if (isConstructionSector(state.client.sectorCode)) {
    const { entityType, input } = buildConstructionScoringInput(state, cfg);
    const out = calculateConstructionScorecard(entityType, input);
    const el = out.elementScores;
    const lvl = pointsToLevel(out.totalScore, cfg);
    // Attach the construction evaluator's own per-indicator rows as the pillar
    // breakdown, so the page renders the lines the CONSTRUCTION matrix scored —
    // never the generic calculator's lines.
    const mkPillar = (e: {
      achievedPoints: number;
      availablePoints: number;
      indicators?: Array<{ name: string; achievedPoints: number; availablePoints: number }>;
    }) => ({
      score: round2(e.achievedPoints), target: e.availablePoints, weighting: e.availablePoints,
      subLines: (e.indicators ?? []).map((ind): BreakdownLine => ({
        name: ind.name,
        target: `${ind.availablePoints} pts`,
        weighting: ind.availablePoints,
        score: round2(ind.achievedPoints),
      })),
    });

    // CSC000 §5 priority-element sub-minimums, previously not applied at all
    // (audit 2026-07-26 item 5): 40% of the ownership NET VALUE indicator, 40%
    // of Skills, 40% of the combined PP&SD element; Generic-class entities
    // (Contractor / BEP) need all three, QSEs need Ownership plus either.
    // Failing discounts one level.
    const fortyPct = (achieved: number, available: number) =>
      available <= 0 || achieved >= available * 0.4;
    const netValueIndicator = el.ownership.indicators.find((ind) => /net\s*value/i.test(ind.name));
    const ownPriorityMet = netValueIndicator
      ? fortyPct(netValueIndicator.achievedPoints, netValueIndicator.availablePoints)
      : fortyPct(el.ownership.achievedPoints, el.ownership.availablePoints);
    const skillsPriorityMet = fortyPct(el.skillsDevelopment.achievedPoints, el.skillsDevelopment.availablePoints);
    const esdPriorityMet = fortyPct(el.enterpriseSupplierDevelopment.achievedPoints, el.enterpriseSupplierDevelopment.availablePoints);
    const constructionQse = /qse/i.test(String(out.scorecardType ?? entityType));
    const priorityFailed = constructionQse
      ? (!ownPriorityMet || !(skillsPriorityMet || esdPriorityMet))
      : (!ownPriorityMet || !skillsPriorityMet || !esdPriorityMet);
    const discounted = !state.ignoreSubMinimum && lvl < 9 && priorityFailed;

    // Construction is an ALIGNED sector code: the deemed-level floor applies
    // to its QSEs the same as the generic codes.
    const constructionDeemed = deemedFor(state);
    const cAchieved = applyDeemedLevel(lvl, constructionDeemed);
    const cDiscounted = applyDeemedLevel(discounted ? Math.min(lvl + 1, 8) : lvl, constructionDeemed);
    const cDeemedApplied = cAchieved.deemedApplied || cDiscounted.deemedApplied;

    const result: ScorecardResult = {
      ownership: { ...mkPillar(el.ownership), subMinimumMet: ownPriorityMet },
      managementControl: mkPillar(el.managementControl),
      skillsDevelopment: { ...mkPillar(el.skillsDevelopment), subMinimumMet: skillsPriorityMet },
      procurement: { ...mkPillar(el.enterpriseSupplierDevelopment), subMinimumMet: esdPriorityMet },
      supplierDevelopment: { score: 0, target: 0, weighting: 0, subMinimumMet: true },
      enterpriseDevelopment: { score: 0, target: 0, weighting: 0, subMinimumMet: true },
      socioEconomicDevelopment: mkPillar(el.socioEconomicDevelopment),
      yesInitiative: { score: 0, target: 0, weighting: 0 },
      total: { score: round2(out.totalScore), target: out.totalAvailable, weighting: out.totalAvailable },
      achievedLevel: cAchieved.level,
      discountedLevel: cDiscounted.level,
      isDiscounted: discounted && !cDeemedApplied,
      recognitionLevel: levelToRecognition(cDiscounted.level, cfg),
      ...(cDeemedApplied && constructionDeemed ? {
        deemedLevel: constructionDeemed.level,
        deemedLevelReason: constructionDeemed.reason,
      } : {}),
    };
    // Attach the raw construction output (per-indicator detail) for the results view.
    (result as unknown as { construction?: unknown }).construction = out;
    return result;
  }

  assertSectorConfigLoaded(cfg, state.client);
  const transportQse = isTransportQseSector(state.client.sectorCode, state.client.scorecardType);
  const transportLarge = !transportQse && isTransportLargeSector(state.client.sectorCode, state.client.scorecardType);
  const eeMax = cfg.pillarConfigs?.employmentEquity?.maxPoints ?? 0;

  const ownScore = calculateOwnershipScore(state.ownership, cfg);

  let mgtScoreTotal: number;
  let eeScoreTotal = 0;
  // Breakdown emitted by the calculator that actually SCORED the pillar, so the
  // UI can render lines that reconcile to the total (Transport uses a different
  // calculator than the generic breakdown — showing generic lines against a
  // Transport score is why "breakdowns don't link"). Undefined ⇒ UI falls back
  // to re-deriving from the generic calculator (correct for RCOGP/ICT/FSC/AGRI).
  let mcSubLines: BreakdownLine[] | undefined;
  let mcCoverageNotes: string[] | undefined;
  let eeSubLines: BreakdownLine[] | undefined;
  if (transportQse) {
    const tqMc = calculateTransportQseManagement(state.management, cfg);
    mgtScoreTotal = tqMc.score;
    mcSubLines = tqMc.subLines;
    mcCoverageNotes = tqMc.coverageNotes;

    const tqEe = calculateTransportQseEmploymentEquity(state.management, cfg, state.client.eapProvince);
    eeScoreTotal = tqEe.score;
    eeSubLines = tqEe.subLines;
  } else if (transportLarge) {
    // Transport Large: MC 11 + EE 18 are SEPARATE pillars (Transport Codes
    // "Road Freight Large" rows 23-31 / 33-43). Previously this branch fell
    // through to the generic MC calculator and EE stayed 0 — the 18 EE points
    // were counted in the target but never scored.
    const tlMc = calculateTransportLargeManagementControl(state.management, cfg);
    mgtScoreTotal = tlMc.score;
    mcSubLines = tlMc.subLines;

    const tlEe = calculateTransportLargeEmploymentEquity(state.management, cfg);
    eeScoreTotal = tlEe.score;
    eeSubLines = tlEe.subLines;
  } else {
    const mgtScore = calculateManagementScore(state.management, cfg, state.client.eapProvince, state.client.eapYear);
    mgtScoreTotal = mgtScore.total;
    // Generic sectors: the breakdown is this SAME calculator's own lines, plus
    // its per-demographic effective-EAP detail rows — carried on the scorecard
    // so the page renders the scored lines, never a re-run.
    mcSubLines = [
      ...toBreakdownLines(mgtScore.subLines),
      ...eapDetailRows(mgtScore.eapBreakdowns as Record<string, EapDetailCell[]>, mgtScore.eapProvince),
    ];
  }

  // Transport Large Skills is structurally different (5th indicator = black
  // women in B/C/D programmes, not absorption) — use the mirrored calculator.
  const skillScore = transportLarge
    ? calculateTransportLargeSkills(state.skills, cfg)
    : calculateSkillsScore(state.skills, cfg, state.client.eapProvince, state.client.eapYear);

  const procScore = calculateProcurementScore(state.procurement, cfg);

  const esdScore = calculateEsdScore(state.esd, state.client.npat, cfg);
  const sedScore = calculateSedScore(state.sed, state.client.npat, cfg, {
    isReinsurer: Boolean(state.client.fscReinsurer),
  });

  // FSC sub-sector AFS scoring (Banks/LTI/STI only)
  const afsScore = cfg.accessToFinancialServices
    ? calculateAfsScore(state.afs, cfg)
    : null;
  if (afsScore) {
  }

  // FSC Banks/LTI Empowerment Financing — EF-proper only (Targeted Investments
  // 12 + Transaction Financing 3); SD/ED stay in the ESD pillar. Returns null
  // for STI / Others / non-FSC (targetedInvestmentMaxPts+transactionFinancingMaxPts = 0).
  const efScore = cfg.empowermentFinancing
    ? calculateEmpowermentFinancingScore(state.empowermentFinancing, cfg)
    : null;
  if (efScore) {
  }
  // CRITICAL: Wire YES calculator - construct YESData from skills and management state
  // Training programs with isYesEmployee=true are treated as YES candidates
  const yesCandidates = state.skills.trainingPrograms
    ?.filter(p => p.isYesEmployee)
    ?.map(p => ({
      id: p.id,
      name: p.learnerName || 'YES Candidate',
      // No demographic defaults: a blank race must never score as a black
      // youth. isBlack requires a STATED black race — `race !== 'White'`
      // counted undefined as black and produced YES/absorption points with
      // no demographic evidence.
      race: p.race || '',
      gender: p.gender || '',
      isDisabled: p.isDisabled || false,
      isBlack: ['African', 'Coloured', 'Indian', 'Chinese'].includes(String(p.race ?? '').trim()),
      startDate: p.startDate || new Date().toISOString(),
      isAbsorbed: p.isAbsorbed || false,
      cost: (p as any).totalCost || ((p as any).cost || 0),
    })) || [];

  const yesData = {
    id: state.yes?.id || '',
    clientId: state.client?.id || '',
    totalEmployees: state.management.employees?.length || 0,
    yesHeadcountTarget: Math.max(Math.ceil((state.management.employees?.length || 0) * 0.025), 1),
    candidates: yesCandidates,
    yesYouthEnrolled: yesCandidates.length,
    yesBlackYouthCount: yesCandidates.filter(c => c.isBlack).length,
    yesBlackYouthPercentage: yesCandidates.length > 0 ? (yesCandidates.filter(c => c.isBlack).length / yesCandidates.length) * 100 : 0,
    yesAbsorbedCount: yesCandidates.filter(c => c.isAbsorbed).length,
    yesAbsorptionRate: yesCandidates.length > 0 ? (yesCandidates.filter(c => c.isAbsorbed).length / yesCandidates.length) * 100 : 0,
    totalYesCost: yesCandidates.reduce((sum, c) => sum + c.cost, 0),
    yesCostPerCandidate: yesCandidates.length > 0 ? yesCandidates.reduce((sum, c) => sum + c.cost, 0) / yesCandidates.length : 0,
  };
  const avgNpat3yr = (() => {
    const history = state.client.financialHistory || [];
    const npatValues = history.map(fy => fy.npat ?? 0).filter(n => n > 0);
    if (npatValues.length === 0) return state.client.npat || 0;
    const recent = npatValues.slice(-3);
    return recent.reduce((a, b) => a + b, 0) / recent.length;
  })();
  const yesScore = calculateYESScore(yesData, cfg, state.client.revenue || 0, avgNpat3yr);

  if (overrides && overrides.totalPoints !== undefined && overrides.totalPoints > 0) {
    const ov = overrides;
    const ownPts = ov.ownership ?? ownScore.total;
    const mcPts = ov.managementControl ?? mgtScoreTotal;
    const skPts = ov.skillsDevelopment ?? skillScore.total;
    const prPts = ov.procurement ?? procScore.total;
    const sdPts = ov.supplierDevelopment ?? esdScore.sdTotal;
    const edPts = ov.enterpriseDevelopment ?? esdScore.edTotal;
    const sedPts = ov.socioEconomicDevelopment ?? sedScore.total;
    const yesPts = ov.yesInitiative ?? yesScore.score;
    const total = ov.totalPoints ?? (ownPts + mcPts + skPts + prPts + sdPts + edPts + sedPts + yesPts);

    const level = ov.achievedLevel ?? pointsToLevel(total, cfg);
    const disc = ov.discountedLevel ?? level;
    const isDisc = ov.isDiscounted ?? false;
    const recog = ov.recognitionLevel ?? levelToRecognition(disc, cfg);

    const allSubMinMet = ov.subMinimumsMet;
    const ownSubMin = allSubMinMet !== undefined ? allSubMinMet : (ownPts >= 10 || ownScore.subMinimumMet);
    const skSubMin = allSubMinMet !== undefined ? allSubMinMet : skillScore.subMinimumMet;
    const procBase = typeof procScore.base === 'number' ? procScore.base : prPts;
    const prSubMin = allSubMinMet !== undefined ? allSubMinMet : (procBase >= 11.6);
    const sdSubMin = allSubMinMet !== undefined ? allSubMinMet : esdScore.sdSubMinimumMet;
    const edSubMin = allSubMinMet !== undefined ? allSubMinMet : esdScore.edSubMinimumMet;

    // Get dynamic targets from config or use defaults
    const pConfig = cfg?.pillarConfigs;
    const ownTarget = pConfig?.ownership?.maxPoints ?? 25;
    const mcTarget = pConfig?.managementControl?.maxPoints ?? 19;
    const skillsTarget = pConfig?.skillsDevelopment?.maxPoints ?? 25;
    const procTarget = pConfig?.preferentialProcurement?.maxPoints ?? 29;
    const sdTarget = pConfig?.supplierDevelopment?.maxPoints ?? 10;
    const edTarget = pConfig?.enterpriseDevelopment?.maxPoints ?? 7;
    const sedTarget = pConfig?.socioEconomicDevelopment?.maxPoints ?? 5;
    const yesTarget = pConfig?.yesInitiative?.maxPoints ?? 0; // YES is level boost, not scored points
    // Use totalMaxPoints from config (verified Excel value) instead of calculating
    const totalTarget = cfg?.totalMaxPoints ?? (ownTarget + mcTarget + skillsTarget + procTarget + sdTarget + edTarget + sedTarget + yesTarget);

    // CRITICAL FIX: Apply round2 to all scores for consistent 2 decimal display
    return {
      ownership: { score: round2(ownPts), target: ownTarget, weighting: ownTarget, subMinimumMet: ownSubMin },
      managementControl: { score: round2(mcPts), target: mcTarget, weighting: mcTarget },
      skillsDevelopment: { score: round2(skPts), target: skillsTarget, weighting: skillsTarget, subMinimumMet: skSubMin },
      procurement: { score: round2(prPts), target: procTarget, weighting: procTarget, subMinimumMet: prSubMin },
      supplierDevelopment: { score: round2(sdPts), target: sdTarget, weighting: sdTarget, subMinimumMet: sdSubMin },
      enterpriseDevelopment: { score: round2(edPts), target: edTarget, weighting: edTarget, subMinimumMet: edSubMin },
      socioEconomicDevelopment: { score: round2(sedPts), target: sedTarget, weighting: sedTarget },
      yesInitiative: { score: round2(yesPts), target: yesTarget, weighting: yesTarget },
      total: { score: round2(total), target: totalTarget, weighting: totalTarget },
      achievedLevel: level, discountedLevel: disc, isDiscounted: isDisc, recognitionLevel: recog,
    };
  }

  const pConfig = cfg?.pillarConfigs;
  const ownTarget = pConfig?.ownership?.maxPoints ?? 25;
  const mcTarget = pConfig?.managementControl?.maxPoints ?? 19;
  const eeTarget = pConfig?.employmentEquity?.maxPoints ?? 0;
  const skillsTarget = pConfig?.skillsDevelopment?.maxPoints ?? 25;
  const procTarget = pConfig?.preferentialProcurement?.maxPoints ?? 29;
  const sdTarget = pConfig?.supplierDevelopment?.maxPoints ?? 10;
  const edTarget = pConfig?.enterpriseDevelopment?.maxPoints ?? 7;
  const sedTarget = pConfig?.socioEconomicDevelopment?.maxPoints ?? 5;
  const yesTarget = pConfig?.yesInitiative?.maxPoints ?? 0;

  const electiveRawScores: Record<PillarConfigKey, number> = {
    ownership: ownScore.total,
    managementControl: mgtScoreTotal,
    employmentEquity: eeScoreTotal,
    skillsDevelopment: skillScore.total,
    preferentialProcurement: procScore.total,
    enterpriseDevelopment: esdScore.edTotal,
    socioEconomicDevelopment: sedScore.total,
  };
  const hasChooseOne = Object.values(pConfig ?? {}).some(p => p?.chooseOneGroup);
  const { chosenKey: chosenElectiveKey, activeKeys: activeElectiveKeys } = hasChooseOne
    ? resolveChooseOneElectives(pConfig, electiveRawScores, cfg?.electiveGroupSizes)
    : { chosenKey: null, activeKeys: new Set<PillarConfigKey>() };

  const electiveScoreForTotal = (key: PillarConfigKey, score: number): number => {
    if (!hasChooseOne) return score;
    return activeElectiveKeys.has(key) ? score : 0;
  };

  const skillsForTotal = electiveScoreForTotal('skillsDevelopment', skillScore.total);
  const procForTotal = electiveScoreForTotal('preferentialProcurement', procScore.total);
  const edForTotal = electiveScoreForTotal('enterpriseDevelopment', esdScore.edTotal);
  const sedForTotal = electiveScoreForTotal('socioEconomicDevelopment', sedScore.total);

  const sdForTotal = sdTarget > 0 ? esdScore.sdTotal : 0;
  const afsForTotal = afsScore?.total ?? 0;
  const efForTotal = efScore?.total ?? 0;

  // Ownership / MC / EE are only unconditional where the sector does not make
  // them electives. Transport QSE does, so an unelected element contributes 0 —
  // which is how a real certificate shows Employment Equity 0.00 without that
  // zero dragging the entity's level down.
  const compulsoryTotal = electiveScoreForTotal('ownership', ownScore.total)
    + electiveScoreForTotal('managementControl', mgtScoreTotal)
    + (eeTarget > 0 ? electiveScoreForTotal('employmentEquity', eeScoreTotal) : 0);
  const electiveTotal = skillsForTotal + procForTotal + edForTotal + sedForTotal;
  const totalPoints = compulsoryTotal + electiveTotal + sdForTotal + afsForTotal + efForTotal + yesScore.score + yesScore.yesBonusPoints;

  const totalTarget = cfg?.totalMaxPoints ?? (
    ownTarget + mcTarget + eeTarget +
    (hasChooseOne ? 25 : skillsTarget + procTarget + edTarget + sedTarget) +
    sdTarget + yesTarget
  );


  const level = pointsToLevel(totalPoints, cfg);

  // The ownership sub-minimum is 40% of NET VALUE points specifically
  // (Statement 000 §3.3.3) — the calculator's own subMinimumMet measures that.
  // The old `total >= ownTarget*0.4` OR-branch let 40% of TOTAL ownership
  // points stand in for it, waving through entities whose net-value line
  // failed. (Audit 2026-07-26 item 12c.)
  const ownSubMinMet = ownScore.subMinimumMet;
  const skSubMinMet = skillScore.subMinimumMet;
  const prSubMinMet = procScore.subMinimumMet;
  const sdSubMinMet = esdScore.sdSubMinimumMet;
  const edSubMinMet = esdScore.edSubMinimumMet;

  /** Hide sub-min badges when the sector sets subMinimumPercent to 0 or maxPoints to 0. */
  const showSubMin = (pillarKey: keyof NonNullable<CalculatorConfig['pillarConfigs']>): boolean => {
    const p = pConfig?.[pillarKey];
    if (!p) return true;
    const pct = 'subMinimumPercent' in p ? (p as { subMinimumPercent?: number }).subMinimumPercent : undefined;
    if (pct === 0) return false;
    if ('maxPoints' in p && (p as { maxPoints?: number }).maxPoints === 0) return false;
    return pct == null || pct > 0;
  };
  // Discounting follows the PRIORITY ELEMENTS, per entity size (Statement 000
  // §3.3, FSC §3.3.2, AgriBEE §5.2.2 — audit 2026-07-26 item 6):
  //  - Generic: Ownership (net value) AND Skills AND ESD (whose sub-minimum is
  //    40% on each of PP / SD / ED).
  //  - QSE: Ownership AND (Skills OR ESD) — one of the two suffices.
  // The old rule demanded all five for everyone, discounting QSEs the codes
  // say are compliant.
  const esdElementSubMinMet = prSubMinMet && sdSubMinMet && edSubMinMet;
  const isQseScorecard = /qse/i.test(String(state.client.scorecardType ?? ""));
  const anySubMinFailed = isQseScorecard
    ? (!ownSubMinMet || !(skSubMinMet || esdElementSubMinMet))
    : (!ownSubMinMet || !skSubMinMet || !esdElementSubMinMet);
  const isDiscounted = !state.ignoreSubMinimum && level < 9 && anySubMinFailed;
  let discountedLevel = isDiscounted ? Math.min(level + 1, 8) : level;

  if (yesScore.yesBeeLevelIncrease > 0 && discountedLevel > 1) {
    discountedLevel = Math.max(1, discountedLevel - yesScore.yesBeeLevelIncrease);
  }

  // Deemed-level FLOOR (Amended Codes Statement 000 §4): a ≥51%/100%
  // black-owned QSE holds Level 2/1 via annual sworn affidavit regardless of
  // scorecard points, and discounting cannot drag below it — the affidavit
  // route does not pass through the scorecard at all. The better level wins,
  // so an entity that out-scores its deemed floor keeps the scored level.
  const deemedEntitlement = deemedFor(state);
  const achievedWithDeemed = applyDeemedLevel(level, deemedEntitlement);
  const discountedWithDeemed = applyDeemedLevel(discountedLevel, deemedEntitlement);
  const deemedApplied = achievedWithDeemed.deemedApplied || discountedWithDeemed.deemedApplied;
  const finalAchievedLevel = achievedWithDeemed.level;
  const finalDiscountedLevel = discountedWithDeemed.level;

  const mkElectiveMeta = (key: PillarConfigKey) => ({
    isChosenElective: hasChooseOne && activeElectiveKeys.has(key),
    isElectiveNotChosen: hasChooseOne && !activeElectiveKeys.has(key),
  });

  const skillsWeight = hasChooseOne
    ? (activeElectiveKeys.has('skillsDevelopment') ? skillsTarget : 0)
    : skillsTarget;
  const procWeight = hasChooseOne
    ? (activeElectiveKeys.has('preferentialProcurement') ? procTarget : 0)
    : procTarget;
  const edWeight = hasChooseOne
    ? (activeElectiveKeys.has('enterpriseDevelopment') ? edTarget : 0)
    : edTarget;
  const sedWeight = hasChooseOne
    ? (activeElectiveKeys.has('socioEconomicDevelopment') ? sedTarget : 0)
    : sedTarget;

  // Every pillar carries the breakdown from the calculator that SCORED it — the
  // page renders these, never a re-run. SED is a single-line pillar.
  const sedBreakdown: BreakdownLine[] = [{
    name: 'Annual value of all SED contributions',
    target: `${((cfg.sed?.npatTarget ?? 0.01) * 100).toFixed(0)}% of NPAT`,
    weighting: sedTarget,
    score: round2(sedScore.total),
    note: `SED spend R${round2(sedScore.actualSpend).toLocaleString()} / target R${round2(sedScore.target).toLocaleString()}`,
  }];

  return {
    ownership: {
      score: round2(ownScore.total),
      target: ownTarget,
      weighting: ownTarget,
      subMinimumMet: showSubMin('ownership') ? ownSubMinMet : undefined,
      subLines: toBreakdownLines(ownScore.subLines),
    },
    managementControl: { score: round2(mgtScoreTotal), target: mcTarget, weighting: mcTarget, subLines: mcSubLines, coverageNotes: mcCoverageNotes },
    ...(eeTarget > 0 ? {
      employmentEquity: { score: round2(eeScoreTotal), target: eeTarget, weighting: eeTarget, subLines: eeSubLines },
    } : {}),
    skillsDevelopment: {
      score: round2(skillScore.total),
      target: skillsWeight,
      weighting: skillsWeight,
      subMinimumMet: showSubMin('skillsDevelopment') ? skSubMinMet : undefined,
      ...mkElectiveMeta('skillsDevelopment'),
      subLines: [...toBreakdownLines(skillScore.subLines), ...skillsCategoryRows(skillScore.categoryBreakdown)],
    },
    procurement: {
      score: round2(procScore.total),
      target: procWeight,
      weighting: procWeight,
      subMinimumMet: showSubMin('preferentialProcurement') ? prSubMinMet : undefined,
      ...mkElectiveMeta('preferentialProcurement'),
      subLines: toBreakdownLines(procScore.subLines),
      coverageNotes: procScore.coverageNotes,
    },
    supplierDevelopment: {
      score: round2(esdScore.sdTotal),
      target: sdTarget,
      weighting: sdTarget,
      subMinimumMet: showSubMin('supplierDevelopment') ? sdSubMinMet : undefined,
      subLines: toBreakdownLines(esdScore.sdSubLines),
    },
    enterpriseDevelopment: {
      score: round2(esdScore.edTotal),
      target: edWeight,
      weighting: edWeight,
      subMinimumMet: showSubMin('enterpriseDevelopment') ? edSubMinMet : undefined,
      ...mkElectiveMeta('enterpriseDevelopment'),
      subLines: toBreakdownLines(esdScore.edSubLines),
    },
    socioEconomicDevelopment: {
      score: round2(sedScore.total),
      target: sedWeight,
      weighting: sedWeight,
      ...mkElectiveMeta('socioEconomicDevelopment'),
      subLines: sedBreakdown,
    },
    yesInitiative: { score: round2(yesScore.score + yesScore.yesBonusPoints), target: yesTarget, weighting: yesTarget },
    ...(afsScore ? {
      accessToFinancialServices: {
        score: round2(afsScore.total),
        target: afsScore.maxPoints,
        weighting: afsScore.maxPoints,
      },
    } : {}),
    ...(efScore ? {
      empowermentFinancing: {
        score: round2(efScore.total),
        target: efScore.maxPoints,
        weighting: efScore.maxPoints,
      },
    } : {}),
    total: { score: round2(totalPoints), target: totalTarget, weighting: totalTarget },
    achievedLevel: finalAchievedLevel,
    discountedLevel: finalDiscountedLevel,
    // A deemed level is not "discounted" even when the points level was.
    isDiscounted: isDiscounted && !deemedApplied,
    recognitionLevel: levelToRecognition(finalDiscountedLevel),
    ...(deemedApplied && deemedEntitlement ? {
      deemedLevel: deemedEntitlement.level,
      deemedLevelReason: deemedEntitlement.reason,
    } : {}),
    chosenElectivePillar: chosenElectiveKey ? ELECTIVE_CONFIG_TO_SCORECARD[chosenElectiveKey] : null,
  };
}

function mapLegacyCategoryForStore(cat: string): TrainingCategoryCode {
  switch (cat) {
    case 'bursary': return 'A';
    case 'learnership':
    case 'internship': return 'B';
    case 'short_course': return 'C';
    default: return 'D';
  }
}

function isBlackRaceForStore(race: string | null | undefined): boolean {
  return race === 'African' || race === 'Coloured' || race === 'Indian';
}

/**
 * Hydrate one training program from an API/workbook payload, preserving EVERY
 * field the Skills calculator and UI read (BBEE-008/009). Previously isAbsorbed,
 * isForeign, isBursary, employmentStatus, isYesEmployee, totalCost, dates and
 * several cost components were dropped here, silently zeroing Skills scores and
 * losing YES/absorption data on reload / _recalculateAll. Exported for testing.
 */
export function hydrateTrainingProgramFromApi(tp: any) {
  const courseCost = tp.courseCost || 0;
  const travelCost = tp.travelCost || 0;
  const accommodationCost = tp.accommodationCost || 0;
  const cateringCost = tp.cateringCost || 0;
  const stationeryCost = tp.stationeryCost || 0;
  const facilityCost = tp.facilityCost ?? tp.trainingFacilityCost ?? 0;
  const salaryCost = tp.salaryCost || 0;
  const otherCosts = tp.otherCosts || 0;
  const componentSum = courseCost + travelCost + accommodationCost + cateringCost +
    stationeryCost + facilityCost + salaryCost + otherCosts;
  // cost the calculator reads must never be 0 when the user entered costs.
  const totalCost = tp.totalCost ?? tp.cost ?? (componentSum || 0);
  const race = tp.race || null;
  return {
    id: tp.id,
    programName: tp.programName ?? tp.name ?? '',
    name: tp.name ?? tp.programName ?? '',
    trainingProvider: tp.trainingProvider ?? tp.provider ?? '',
    category: tp.category,
    categoryCode: tp.categoryCode || mapLegacyCategoryForStore(tp.category),
    learnerName: tp.learnerName || '',
    learnerIdNumber: tp.learnerIdNumber ?? tp.idNumber ?? '',
    employeeId: tp.employeeId,
    // Demographics
    gender: tp.gender || null,
    race,
    isDisabled: coerceYesNo(tp.isDisabled),
    isForeign: coerceYesNo(tp.isForeign),
    isBlack: typeof tp.isBlack === 'boolean' ? tp.isBlack : isBlackRaceForStore(race),
    // Employment / YES / completion — required for unemployed, learnership & absorption scoring
    employmentStatus: tp.employmentStatus ?? (tp.isEmployed === false ? 'Unemployed' : tp.isEmployed ? 'Permanent' : undefined),
    isEmployed: typeof tp.isEmployed === 'boolean' ? tp.isEmployed : tp.employmentStatus ? tp.employmentStatus !== 'Unemployed' : false,
    isYesEmployee: coerceYesNo(tp.isYesEmployee),
    isCompleted: coerceYesNo(tp.isCompleted),
    isAbsorbed: coerceYesNo(tp.isAbsorbed),
    isBursary: coerceYesNo(tp.isBursary) || tp.category === 'bursary' || tp.categoryCode === 'A',
    isAbet: coerceYesNo(tp.isAbet),
    isMandatory: coerceYesNo(tp.isMandatory),
    // Location & dates
    municipality: tp.municipality || '',
    transactionDate: tp.transactionDate ?? tp.dateOfTransaction ?? '',
    startDate: tp.startDate ?? '',
    endDate: tp.endDate ?? '',
    // Costs
    courseCost, travelCost, accommodationCost, cateringCost,
    stationeryCost, facilityCost, salaryCost, otherCosts,
    totalCost,
    cost: totalCost,
  };
}

export const useBbeeStore = create<BbeeState>((set, get) => ({
  isLoaded: false,
  activeClientId: null,
  client: emptyClient,
  ownership: emptyOwnership,
  management: emptyManagement,
  skills: emptySkills,
  procurement: emptyProcurement,
  esd: emptyESD,
  sed: emptySED,
  afs: emptyAfs,
  empowermentFinancing: emptyEmpowermentFinancing,
  scorecard: emptyScorecard,
  pipelineOverrides: null,
  calculatorConfig: null,
  calculatorConfigStatus: 'idle',
  calculatorConfigError: null,

  isScenarioMode: false,
  activeScenarioId: null,
  scenarios: [],
  baseSnapshot: null,
  ignoreSubMinimum: false,

  loadClientData: async (clientId: string) => {
    try {
      const data = await api.getClientData(clientId);
      
      const finExtras = (data.client.financials ?? {}) as Record<string, unknown>;
      const effectiveNpat =
        finExtras.effectiveNpat != null
          ? Number(finExtras.effectiveNpat)
          : finExtras.deemedNpatUsed
            ? Number(finExtras.deemedNpat ?? data.client.npat)
            : data.client.npat || 0;

      const clientData: Client = {
        id: data.client.id,
        name: data.client.name,
        tradingName: data.client.tradingName || '',
        registrationNumber: data.client.registrationNumber || '',
        vatNumber: data.client.vatNumber || '',
        taxNumber: data.client.taxNumber || '',
        physicalAddress: data.client.physicalAddress || '',
        postalAddress: data.client.postalAddress || '',
        contactPerson: data.client.contactPerson || '',
        contactEmail: data.client.contactEmail || '',
        contactPhone: data.client.contactPhone || '',
        sectorCode: data.client.sectorCode || 'RCOGP',
        companySize: data.client.companySize || 'Generic',
        scorecardType: data.client.scorecardType || data.client.companySize || 'Generic',
        financialYear: data.client.financialYear || '',
        revenue: data.client.revenue || 0,
        npat: effectiveNpat,
        leviableAmount: data.client.leviableAmount || 0,
        industry: data.client.industry || 'Generic',
        fscSubSector: normalizeFscSubSector(data.client.fscSubSector ?? finExtras.fscSubSector) as Client['fscSubSector'],
        fscReinsurer: coerceYesNo(data.client.fscReinsurer ?? finExtras.fscReinsurer),
        eapProvince: (data.client.eapProvince || finExtras.eapProvince || 'National') as Client['eapProvince'],
        // CEE vintage for MC/Skills EAP targets — persisted per client so legacy
        // clients keep the dataset their workbook was scored under; undefined
        // (new clients) = latest ingested CEE year (26th CEE = 2026).
        eapYear: (data.client.eapYear ?? finExtras.eapYear) as number | undefined,
        industryNorm: data.client.industryNorm ?? (finExtras.industryNormPercent as number | undefined),
        // Foundation / company-detail fields that PATCH /api/clients/:id persists
        // and GET /:id/data returns, but which were previously DROPPED here — so
        // measurement period, turnover/headcount, and certificate details showed
        // blank again on reload ("company details aren't reflected well"). These
        // also close the pre-existing TS2739 (annualTurnover, numberOfEmployees
        // missing from the Client literal).
        measurementPeriodStart: data.client.measurementPeriodStart || undefined,
        measurementPeriodEnd: data.client.measurementPeriodEnd || undefined,
        annualTurnover: data.client.annualTurnover || 0,
        numberOfEmployees: data.client.numberOfEmployees || 0,
        beeCertificateNumber: data.client.beeCertificateNumber || undefined,
        beeCertificateExpiry: data.client.beeCertificateExpiry || undefined,
        beeCertificateLevel: (data.client.beeCertificateLevel ?? undefined) as Client['beeCertificateLevel'],
        verificationAgency: data.client.verificationAgency || undefined,
        financialHistory: (data.financialYears || []).map((fy: any) => ({
          id: fy.id,
          year: fy.year,
          revenue: fy.revenue || 0,
          npat: fy.npat || 0,
          indicativeNpat: fy.indicativeNpat,
          notes: fy.notes,
        })),
      };

      // Lake Trading Fix Plan §1 Bug 6: pass through every scoring field the
      // ownership calculator reads — yearsHeld, isDesignatedGroup, blackNewEntrant,
      // votingRightsPercent, economicInterestPercent. Without these the
      // calculator can't award Designated Groups / New Entrants / graduation.

      const ownershipState: OwnershipData = {
        id: data.ownership?.id || '',
        clientId,
        shareholders: (data.ownership?.shareholders || []).map((sh: any) => {
          const blackOwnership = normalizeFraction(sh.blackOwnership);
          const sharePct = normalizeFraction(
            sh.shareholding ?? sh.votingRightsPercent ?? sh.votingRights ?? sh.blackOwnership,
          );
          const derivedShares = sh.shares > 0 ? sh.shares : Math.max(1, Math.round(sharePct * 10_000));
          return {
          id: sh.id,
          name: sh.name,
          ownershipType: sh.ownershipType || 'shareholder',
          blackOwnership,
          blackWomenOwnership: normalizeFraction(sh.blackWomenOwnership),
          shares: derivedShares,
          shareValue: sh.shareValue || 1,
          yearsHeld: sh.yearsHeld || 0,
          isDesignatedGroup: coerceYesNo(sh.isDesignatedGroup),
          designatedGroupType: sh.designatedGroupType,
          blackNewEntrant: coerceYesNo(sh.blackNewEntrant),
          votingRightsPercent:
            normalizeFraction(sh.votingRightsPercent ?? sh.blackOwnership ?? 0),
          economicInterestPercent:
            normalizeFraction(sh.economicInterestPercent ?? sh.blackOwnership ?? 0),
        };
        }),
        companyValue:
          data.ownership?.companyValue ||
          data.client.companyValue ||
          (finExtras.companyValue as number | undefined) ||
          clientData.revenue ||
          0,
        outstandingDebt:
          data.ownership?.outstandingDebt ||
          data.client.outstandingDebt ||
          (finExtras.outstandingDebt as number | undefined) ||
          0,
        yearsHeld: data.ownership?.yearsHeld || 0,
        ownershipScorePoints: data.ownership?.ownershipScorePoints || 0,
        ownershipScorePercent: data.ownership?.ownershipScorePercent || 0,
        netValuePoints: data.ownership?.netValuePoints || 0,
        netValuePercent: data.ownership?.netValuePercent || 0,
      };

      const managementState: ManagementData = {
        id: '',
        clientId,
        combineExcoSenior: coerceYesNo(finExtras.combineExcoSenior ?? data.client.combineExcoSenior),
        employees: (data.management?.employees || []).map((e: any) => ({
          id: e.id,
          name: e.name,
          gender: e.gender,
          race: normalizeRace(e.race) || e.race,
          designation: normalizeDesignationForScoring(
            e.designation || e.occupationalLevel || mapJobTitleToDesignation(e.occupationalLevel),
          ),
          isDisabled: coerceYesNo(e.isDisabled),
          isForeign: coerceYesNo(e.isForeign),
          annualSalary: e.annualSalary ?? 0,
          // Board "exercisable voting rights" (% units). Workbook import persists
          // this on the employee entity as `votingRights` (workbookRoutes.ts),
          // while the manual UI writes `votingRightsPercent` — accept either so a
          // workbook-imported board's voting weights reach calculateManagementScore
          // instead of silently falling back to headcount. Both are already in
          // percent (the grid column is a percentage), so no normalisation.
          votingRightsPercent: e.votingRightsPercent ?? e.votingRights ?? 0,
          idNumber: e.idNumber || undefined,
          province: e.province || undefined,
          hireDate: e.hireDate || undefined,
          terminationDate: e.terminationDate || undefined,
        })),
      };

      const yesCandidatesFromSkills = (data.skills?.trainingPrograms || []).filter((tp: any) => tp.isYesEmployee);
      const skillsState: SkillsData = {
        id: '',
        clientId,
        leviableAmount: data.skills?.leviableAmount || clientData.leviableAmount || 0,
        groupLeviableAmount: finExtras.groupLeviableAmount as number | undefined,
        headcount:
          (finExtras.headcount as number | undefined) ??
          data.client.numberOfEmployees ??
          undefined,
        trainingManagerSalary: finExtras.trainingManagerSalary as number | undefined,
        trainingOverheadCost: finExtras.trainingOverheadCost as number | undefined,
        // BBEE-008/009: preserve EVERY field the Skills calculator and UI read, so
        // scores don't silently drop to 0 (or YES/absorption data vanish) on
        // reload / _recalculateAll. Previously isAbsorbed, isForeign, isBursary,
        // employmentStatus, isYesEmployee, totalCost, dates and several cost
        // components were dropped here.
        // BBEE-008/009: preserve every field the Skills calculator/UI read (see
        // hydrateTrainingProgramFromApi) so scores don't silently zero / YES &
        // absorption data don't vanish on reload / _recalculateAll.
        trainingPrograms: (data.skills?.trainingPrograms || []).map(hydrateTrainingProgramFromApi),
        yesCandidatesCount: yesCandidatesFromSkills.length,
        yesAbsorbedCount: yesCandidatesFromSkills.filter((tp: any) => tp.isAbsorbed).length,
      };

      // Lake Trading Fix Plan §1 Bug 6 + 8: preserve every flag the procurement
      // calculator reads (isEmpoweringSupplier, isForeignSupplier, BO51/BWO30,
      // designated-group flag) and default beeLevel to 0 (non-compliant) — never
      // to 4, which silently inflates procurement for missing certificates.
      const procurementState: ProcurementData = {
        id: '',
        clientId,
        tmps: data.procurement?.tmps || 0,
        suppliers: (data.procurement?.suppliers || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          registrationNumber: s.registrationNumber || '',
          beeLevel: Number.isFinite(Number(s.beeLevel)) ? Number(s.beeLevel) : 0,
          blackOwnership: s.blackOwnership || 0,
          blackWomenOwnership: s.blackWomenOwnership || 0,
          youthOwnership: s.youthOwnership || 0,
          disabledOwnership: s.disabledOwnership || 0,
          enterpriseType: s.enterpriseType || 'generic',
          spend: s.spend || 0,
          isEmpoweringSupplier: coerceYesNo(s.isEmpoweringSupplier ?? s.empoweringSupplier),
          isForeignSupplier: coerceYesNo(s.isForeignSupplier),
          isBlackOwned51: coerceYesNo(s.isBlackOwned51),
          isBlackWomanOwned30: coerceYesNo(s.isBlackWomanOwned30),
          isDesignatedGroup: coerceYesNo(s.isDesignatedGroup),
          isSupplierDevRecipient: coerceYesNo(s.isSupplierDevRecipient),
          hasThreeYearContract: coerceYesNo(s.hasThreeYearContract),
        })),
        // Issue 3: Removed graduationBonus and jobsCreatedBonus from Procurement (ED only bonuses)
      };

      const esdState: ESDData = {
        id: '',
        clientId,
        // Carry the FULL projected contribution shape. Cherry-picking five
        // fields here dropped isBlackWomenOwnedBeneficiary / isStructuredProject /
        // isLimitedServicesCommunity (read by the construction calculator) and
        // primeRate/actualRate/currentSize — construction ESD scores were right
        // until a page reload, then silently lost their flag-based points.
        contributions: (data.esd?.contributions || []).map((c: any) => ({
          ...c,
          amount: c.amount || 0,
        })),
        graduationBonus: data.esd?.graduationBonus || false,
        graduationEvidence: data.esd?.graduationEvidence || '',
        jobsCreatedBonus: data.esd?.jobsCreatedBonus || false,
        jobsCreatedCount: data.esd?.jobsCreatedCount || 0,
        jobsCreatedEvidence: data.esd?.jobsCreatedEvidence || '',
      };

      const sedState: SEDData = {
        id: '',
        clientId,
        // Prefer the top-level sed.* fields (persisted via updateClient), fall
        // back to the legacy financials blob so existing data still loads.
        ceSpend: (data.sed?.ceSpend as number | undefined) ?? (finExtras.ceSpend as number | undefined),
        ceBonusSpend: (data.sed?.ceBonusSpend as number | undefined) ?? (finExtras.ceBonusSpend as number | undefined),
        fundisaSpend: (data.sed?.fundisaSpend as number | undefined) ?? (finExtras.fundisaSpend as number | undefined),
        // Full projected shape for the same reason as ESD above (construction
        // reads per-contribution flags; percentBenefitingBlack is preserved for
        // the day SED scoring recognises it).
        contributions: (data.sed?.contributions || []).map((c: any) => ({
          ...c,
          amount: c.amount || 0,
        })),
      };

      const scenariosData = (data.scenarios || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        createdAt: s.createdAt,
        ...s.snapshot,
      }));

      set({
        isLoaded: false,
        activeClientId: clientId,
        client: clientData,
        ownership: ownershipState,
        management: managementState,
        skills: skillsState,
        procurement: procurementState,
        esd: esdState,
        sed: sedState,
        afs: {
          id: data.afs?.id ?? '',
          clientId,
          ...(data.afs ?? finExtras.afs ?? {}),
        } as AfsData,
        // FSC Banks/LTI Empowerment Financing — persisted in the client
        // financials blob by workbook submit (like afs); hydrate so
        // calculateEmpowermentFinancingScore sees the facilities/scalars.
        empowermentFinancing: {
          id: '',
          clientId,
          ...((data as any).empowermentFinancing ?? (finExtras.empowermentFinancing as object | undefined) ?? {}),
        } as EmpowermentFinancingData,
        scenarios: scenariosData,
        isScenarioMode: false,
        activeScenarioId: null,
        baseSnapshot: null,
      });

      await get().loadCalculatorConfig(clientId);
      const cfg = get().calculatorConfig;
      if (cfg?.pillarConfigs) {
      }
      set({ isLoaded: true });
      get()._recalculateAll();
    } catch (error) {
      console.error('Failed to load client data:', clientId, error);
      throw error;
    }
  },

  clearData: () => {
    set({
      isLoaded: false,
      activeClientId: null,
      client: emptyClient,
      ownership: emptyOwnership,
      management: emptyManagement,
      skills: emptySkills,
      procurement: emptyProcurement,
      esd: emptyESD,
      sed: emptySED,
      afs: emptyAfs,
      empowermentFinancing: emptyEmpowermentFinancing,
      scorecard: emptyScorecard,
      pipelineOverrides: null,
      calculatorConfig: null,
  calculatorConfigStatus: 'idle',
  calculatorConfigError: null,
      isScenarioMode: false,
      activeScenarioId: null,
      scenarios: [],
      baseSnapshot: null,
    });
  },

  startNewSession: () => {
    set({
      isLoaded: false,
      activeClientId: null,
      client: emptyClient,
      ownership: emptyOwnership,
      management: emptyManagement,
      skills: emptySkills,
      procurement: emptyProcurement,
      esd: emptyESD,
      sed: emptySED,
      afs: emptyAfs,
      empowermentFinancing: emptyEmpowermentFinancing,
      scorecard: buildEmptyScorecard(),
      pipelineOverrides: null,
      calculatorConfig: null,
  calculatorConfigStatus: 'idle',
  calculatorConfigError: null,
      isScenarioMode: false,
      activeScenarioId: null,
      scenarios: [],
      baseSnapshot: null,
    });
    try {
      const keys = Object.keys(sessionStorage);
      for (const key of keys) {
        if (key.startsWith('okiru-processor-build-flow')) {
          sessionStorage.removeItem(key);
        }
      }
    } catch { /* ignore */ }
  },

  setPipelineOverrides: (overrides: PipelineOverrides) => {
    set({ pipelineOverrides: overrides });
    get()._recalculateAll();
    const clientId = get().activeClientId;
    if (clientId) {
      api.updateClient(clientId, { pipelineOverrides: overrides }).catch(console.error);
    }
  },

  setIgnoreSubMinimum: (value: boolean) => {
    set({ ignoreSubMinimum: value });
    get()._recalculateAll();
  },

  createScenario: (name: string) => {
    const state = get();
    const baseToSave = state.isScenarioMode
      ? state.baseSnapshot!
      : { id: 'base', name: 'Base Scenario', createdAt: new Date().toISOString(), ...snapshotPillarState(state) };

    const newScenario: ScenarioSnapshot = {
      id: uuidv4(), name, createdAt: new Date().toISOString(),
      ...snapshotPillarState(state),
    };

    if (state.activeClientId) {
      api.addScenario(state.activeClientId, { name, snapshot: newScenario }).catch(console.error);
    }

    set({ scenarios: [...state.scenarios, newScenario], baseSnapshot: baseToSave });
    get().switchScenario(newScenario.id);
  },

  switchScenario: (id: string | null) => {
    const state = get();

    if (state.isScenarioMode && state.activeScenarioId) {
      const snapshot = snapshotPillarState(state);
      const updatedScenarios = state.scenarios.map(s =>
        s.id === state.activeScenarioId ? { ...s, ...snapshot } : s
      );
      set({ scenarios: updatedScenarios });
    } else if (!state.isScenarioMode) {
      set({
        baseSnapshot: {
          id: 'base', name: 'Base Scenario', createdAt: new Date().toISOString(),
          ...snapshotPillarState(state),
        },
      });
    }

    if (id === null) {
      if (state.baseSnapshot) {
        const restored = snapshotPillarState(state.baseSnapshot);
        set({ isScenarioMode: false, activeScenarioId: null, ...restored });
      }
    } else {
      const targetScenario = state.scenarios.find(s => s.id === id);
      if (targetScenario) {
        const restored = snapshotPillarState(targetScenario);
        set({ isScenarioMode: true, activeScenarioId: id, ...restored });
      }
    }
  },

  deleteScenario: (id: string) => {
    const state = get();
    if (state.activeScenarioId === id) get().switchScenario(null);
    set((state) => ({ scenarios: state.scenarios.filter(s => s.id !== id) }));
    api.deleteScenario(id).catch(console.error);
  },

  loadCalculatorConfig: async (clientId: string) => {
    const { client } = get();
    const sectorCode = client.sectorCode || 'RCOGP';
    const scorecardType = client.scorecardType || client.companySize || 'Generic';

    // Mark loading BEFORE any branching — any concurrent _recalculateAll or
    // page mount sees 'loading' instead of stale 'ready'/'idle' (race fix).
    set({ calculatorConfigStatus: 'loading', calculatorConfigError: null });

    const ready = (cfg: CalculatorConfig) => {
      set({ calculatorConfig: cfg, calculatorConfigStatus: 'ready', calculatorConfigError: null });
      get()._recalculateAll();
    };

    if (isRcogpGenericSector(sectorCode, scorecardType)) {
      ready(RCOGP_GENERIC_CALCULATOR_CONFIG);
      return;
    }
    if (isRcogpQseSector(sectorCode, scorecardType)) {
      ready(RCOGP_QSE_CALCULATOR_CONFIG);
      return;
    }
    if (isIctGenericSector(sectorCode, scorecardType)) {
      ready(ICT_GENERIC_CALCULATOR_CONFIG);
      return;
    }
    if (isIctQseSector(sectorCode, scorecardType)) {
      ready(ICT_QSE_CALCULATOR_CONFIG);
      return;
    }
    if (isAgriGenericSector(sectorCode, scorecardType)) {
      ready(AGRI_GENERIC_CALCULATOR_CONFIG);
      return;
    }
    // Transport Sector Code — bundled configs derived from the pipeline
    // TRANSPORT_GENERIC / TRANSPORT_QSE (docs/Transport Codes.xlsx). Previously
    // TRANSPORT fell through to the remote fetch, so the toolkit could not
    // score Transport clients when the API config wasn't reachable, and the
    // Large EE pillar (18 pts) was never computed at all.
    if (isTransportQseSector(sectorCode, scorecardType)) {
      ready(TRANSPORT_QSE_CALCULATOR_CONFIG);
      return;
    }
    if (isTransportLargeSector(sectorCode, scorecardType)) {
      ready(TRANSPORT_GENERIC_CALCULATOR_CONFIG);
      return;
    }

    if (sectorCode.toUpperCase() === 'FSC') {
      // A QSFI (FSC QSE, R10-50m) is measured on the 100-pt QSFI scorecard —
      // it is not sub-sector split. Before this check it fell through to the
      // 105-pt Others scorecard: a wrong answer rather than a refusal.
      if (isFscQseSector(sectorCode, scorecardType)) { ready(FSC_QSE_CALCULATOR_CONFIG); return; }
      const fscSub = get().client.fscSubSector || 'Others';
      if (isFscBanksSector(sectorCode, fscSub)) { ready(FSC_BANKS_CALCULATOR_CONFIG); return; }
      if (isFscLtiSector(sectorCode, fscSub))   { ready(FSC_LTI_CALCULATOR_CONFIG);   return; }
      if (isFscStiSector(sectorCode, fscSub))   { ready(FSC_STI_CALCULATOR_CONFIG);   return; }
      if (isFscGenericSector(sectorCode, scorecardType)) { ready(FSC_GENERIC_CALCULATOR_CONFIG); return; }
      // Sub-sector did not match any known variant — short-circuit with a
      // structured error rather than falling through to a remote fetch that
      // will never resolve FSC sub-sectors.
      const msg = `FSC sub-sector "${fscSub}" is not recognised. Pick a sub-sector on Company Info.`;
      console.error('[store]', msg);
      set({ calculatorConfigStatus: 'error', calculatorConfigError: { reason: 'fsc-no-subsector', message: msg, sectorCode, scorecardType, fscSubSector: fscSub } });
      return;
    }

    if (isConstructionSector(sectorCode)) {
      const entityType = resolveConstructionScorecardKey(scorecardType, (client as { constructionSubSector?: string }).constructionSubSector);
      ready(buildConstructionCalculatorConfig(entityType));
      return;
    }

    const { config: sectorConfig, failure: fetchFailure } = await fetchSectorCalculatorConfig(sectorCode, scorecardType);

    if (sectorConfig && hasValidPillarConfigs(sectorConfig)) {
      ready({
        ...sectorConfig,
        sectorCode: sectorConfig.sectorCode ?? sectorCode,
        scorecardType: sectorConfig.scorecardType ?? scorecardType,
      });
      return;
    }

    // Determine the right error reason
    let reason: CalculatorConfigErrorInfo['reason'];
    let message: string;
    if (sectorConfig && !hasValidPillarConfigs(sectorConfig)) {
      reason = 'invalid-config';
      message = `Calculator config for ${sectorCode}/${scorecardType} is missing pillar weightings.`;
      console.warn('[store] Sector config rejected (invalid pillar maxPoints):', sectorCode, scorecardType);
    } else if (fetchFailure === 'network') {
      reason = 'network';
      message = `Could not reach the sector config server. Check your connection and click Retry.`;
    } else if (fetchFailure === 'server') {
      reason = 'unknown-sector';
      message = `No calculator config available for sector "${sectorCode}" (${scorecardType}). Pick a different sector on Company Info or contact support.`;
    } else {
      reason = 'unknown-sector';
      message = `No calculator config available for "${sectorCode}/${scorecardType}".`;
    }
    console.error('[store] No valid calculator config for', sectorCode, scorecardType, '→', reason);
    set({ calculatorConfigStatus: 'error', calculatorConfigError: { reason, message, sectorCode, scorecardType } });
  },

  saveCalculatorConfig: async (_config: CalculatorConfig) => {
    console.warn('[store] saveCalculatorConfig is disabled; sector config is authoritative');
  },

  _recalculateAll: () => {
    const state = get();

    if (!state.calculatorConfig) {
      // If a load is in flight, this is a benign race — the success branch
      // will fire _recalculateAll itself. Otherwise surface an error state so
      // the user sees something instead of a silently-stale score.
      if (state.calculatorConfigStatus !== 'loading') {
        const sectorCode = state.client.sectorCode || 'RCOGP';
        const scorecardType = state.client.scorecardType || state.client.companySize || 'Generic';
        set({
          calculatorConfigStatus: 'error',
          calculatorConfigError: {
            reason: 'recalc-before-load',
            message: 'Scoring was triggered before the calculator config loaded. Click Retry.',
            sectorCode,
            scorecardType,
          },
        });
      }
      console.error('[store] Cannot calculate: calculatorConfig not loaded');
      return;
    }

    try {
      const result = calculateScorecard(state, state.pipelineOverrides);
      set({ scorecard: result });
    } catch (error) {
      if (import.meta.env?.DEV && error instanceof SectorConfigError) {
        throw error;
      }
      const message = error instanceof SectorConfigError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Scorecard calculation failed';
      console.error('[store] Calculation failed:', message, error);
    }
  },

  setScorecardFromAPI: (apiResult: APIScorecardResult) => {
    const mapped = mapAPIScorecardToFrontend(apiResult, get().ignoreSubMinimum);
    set({ scorecard: mapped });
  },

  addFinancialYear: (year) => {
    set((state) => ({ client: { ...state.client, financialHistory: [...state.client.financialHistory, year] } }));
    const state = get();
    if (state.activeClientId) {
      api.addFinancialYear(state.activeClientId, { id: year.id, year: year.year, revenue: year.revenue, npat: year.npat, indicativeNpat: year.indicativeNpat, notes: year.notes }).catch(console.error);
    }
  },
  updateFinancialYear: (id, data) => {
    set((state) => ({ client: { ...state.client, financialHistory: state.client.financialHistory.map(y => y.id === id ? { ...y, ...data } : y) } }));
    api.updateFinancialYear(id, data).catch(console.error);
  },
  removeFinancialYear: (id) => {
    set((state) => ({ client: { ...state.client, financialHistory: state.client.financialHistory.filter(y => y.id !== id) } }));
    api.deleteFinancialYear(id).catch(console.error);
  },

  addShareholder: (shareholder) => {
    set((state) => ({ ownership: { ...state.ownership, shareholders: [...state.ownership.shareholders, shareholder] } }));
    get()._recalculateAll();
    const state = get();
    if (state.activeClientId) {
      // Send the full Shareholder shape INCLUDING the local id. The server
      // preserves a provided id (create does { id: uuid(), ...data }), so the
      // row persists under the SAME id the store holds — otherwise a later
      // updateShareholder(localId) hits PATCH /api/shareholders/<localId> which
      // 404s because the server minted its own id ("edit doesn't save at all").
      api.addShareholder(state.activeClientId, shareholder).catch(console.error);
    }
  },
  updateShareholder: (id, data) => {
    set((state) => ({ ownership: { ...state.ownership, shareholders: state.ownership.shareholders.map(sh => sh.id === id ? { ...sh, ...data } : sh) } }));
    get()._recalculateAll();
    api.updateShareholder(id, data).catch(console.error);
  },
  removeShareholder: (id) => {
    set((state) => ({ ownership: { ...state.ownership, shareholders: state.ownership.shareholders.filter(sh => sh.id !== id) } }));
    get()._recalculateAll();
    api.deleteShareholder(id).catch(console.error);
  },
  updateCompanyValue: (companyValue, outstandingDebt) => {
    set((state) => ({ ownership: { ...state.ownership, companyValue, outstandingDebt } }));
    get()._recalculateAll();
    const state = get();
    if (state.activeClientId) {
      api.updateOwnership(state.activeClientId, { companyValue, outstandingDebt }).catch(console.error);
    }
  },

  addEmployee: (employee) => {
    set((state) => ({ management: { ...state.management, employees: [...state.management.employees, employee] } }));
    get()._recalculateAll();
    const state = get();
    if (state.activeClientId) {
      api.addEmployee(state.activeClientId, {
        // Persist under the store's local id so a later updateEmployee(localId)
        // resolves server-side (the create respects a provided id). Without this
        // the edit PATCHes an id the server never had → 404 → silently dropped.
        id: employee.id,
        name: employee.name, gender: employee.gender, race: employee.race,
        designation: employee.designation, isDisabled: employee.isDisabled,
        annualSalary: employee.annualSalary, votingRightsPercent: employee.votingRightsPercent,
        idNumber: employee.idNumber, isForeign: employee.isForeign, province: employee.province,
        hireDate: employee.hireDate, terminationDate: employee.terminationDate,
      }).catch(console.error);
    }
  },
  updateEmployee: (id, data) => {
    set((state) => ({
      management: {
        ...state.management,
        employees: state.management.employees.map(e => e.id === id ? { ...e, ...data } : e)
      }
    }));
    get()._recalculateAll();
    api.updateEmployee(id, data).catch(console.error);
  },
  removeEmployee: (id) => {
    set((state) => ({ management: { ...state.management, employees: state.management.employees.filter(e => e.id !== id) } }));
    get()._recalculateAll();
    api.deleteEmployee(id).catch(console.error);
  },
  addEmployeesBulk: (employees) => {
    set((state) => ({ management: { ...state.management, employees: [...state.management.employees, ...employees] } }));
    get()._recalculateAll();
    const state = get();
    if (state.activeClientId) {
      // Single round-trip via the bulk endpoint (insertMany). Keep the local
      // ids so bulk-added rows are editable immediately (create preserves a
      // provided id; without it updateEmployee(localId) 404s).
      api.bulkAddEmployees(state.activeClientId, employees).catch(console.error);
    }
  },

  addTrainingProgram: (program) => {
    set((state) => ({ skills: { ...state.skills, trainingPrograms: [...state.skills.trainingPrograms, program] } }));
    get()._recalculateAll();
    const state = get();
    if (state.activeClientId) {
      // Send the full TrainingProgram shape INCLUDING the local id so the row
      // persists under the store's id and updateTrainingProgram(localId) resolves
      // (else PATCH /api/training-programs/<localId> 404s). Also carries
      // programName/categoryCode/learnerName/employmentStatus/dates/*Cost/
      // isYesEmployee/isCompleted/isAbsorbed (audit B6).
      api.addTrainingProgram(state.activeClientId, program).catch(console.error);
    }
  },
  updateTrainingProgram: (id, data) => {
    set((state) => ({ skills: { ...state.skills, trainingPrograms: state.skills.trainingPrograms.map(p => p.id === id ? { ...p, ...data } : p) } }));
    get()._recalculateAll();
    api.updateTrainingProgram(id, data).catch(console.error);
  },
  removeTrainingProgram: (id) => {
    set((state) => ({ skills: { ...state.skills, trainingPrograms: state.skills.trainingPrograms.filter(p => p.id !== id) } }));
    get()._recalculateAll();
    api.deleteTrainingProgram(id).catch(console.error);
  },

  addSupplier: (supplier) => {
    set((state) => {
      const suppliers = [...state.procurement.suppliers, supplier];
      // Keep TMPS in sync with supplier spend unless the user manually overrode
      // it — otherwise tmps stays 0 and every procurement target (tmps × pct)
      // is 0, so suppliers never score (Polo feedback #10).
      const tmps = state.procurement.tmpsManualOverride
        ? state.procurement.tmps
        : suppliers.reduce((acc, s) => acc + (s.spend || 0), 0);
      return { procurement: { ...state.procurement, suppliers, tmps } };
    });
    get()._recalculateAll();
    const state = get();
    if (state.activeClientId) {
      // Send the full Supplier shape INCLUDING the local id so the row persists
      // under the store's id and updateSupplier(localId) resolves (else PATCH
      // /api/suppliers/<localId> 404s → "edit doesn't save"). Also carries
      // isEmpoweringSupplier, isSupplierDevRecipient, hasThreeYearContract,
      // isForeignSupplier, certificateExpiryDate, vatNumber, etc. (audit P2 #6).
      api.addSupplier(state.activeClientId, supplier).catch(console.error);
    }
  },
  updateSupplier: (id, data) => {
    set((state) => {
      const suppliers = state.procurement.suppliers.map(s => s.id === id ? { ...s, ...data } : s);
      const tmps = state.procurement.tmpsManualOverride
        ? state.procurement.tmps
        : suppliers.reduce((acc, s) => acc + (s.spend || 0), 0);
      return { procurement: { ...state.procurement, suppliers, tmps } };
    });
    get()._recalculateAll();
    api.updateSupplier(id, data).catch(console.error);
  },
  removeSupplier: (id) => {
    set((state) => {
      const suppliers = state.procurement.suppliers.filter(s => s.id !== id);
      const tmps = state.procurement.tmpsManualOverride
        ? state.procurement.tmps
        : suppliers.reduce((acc, s) => acc + (s.spend || 0), 0);
      return { procurement: { ...state.procurement, suppliers, tmps } };
    });
    get()._recalculateAll();
    api.deleteSupplier(id).catch(console.error);
  },

  addEsdContribution: (contribution) => {
    set((state) => ({ esd: { ...state.esd, contributions: [...state.esd.contributions, contribution] } }));
    get()._recalculateAll();
    const state = get();
    if (state.activeClientId) {
      // Send the full Contribution shape INCLUDING the local id so the row
      // persists under the store's id (else a later delete/edit by localId
      // misses the server row). Also carries construction flags
      // (isBlackWomenOwnedBeneficiary, supplierDevProgramme), blackBenefitPercent,
      // contributionType, descriptions, and dates (audit P2 #7).
      api.addEsdContribution(state.activeClientId, contribution).catch(console.error);
    }
  },
  removeEsdContribution: (id) => {
    set((state) => ({ esd: { ...state.esd, contributions: state.esd.contributions.filter(c => c.id !== id) } }));
    get()._recalculateAll();
    api.deleteEsdContribution(id).catch(console.error);
  },

  addSedContribution: (contribution) => {
    set((state) => ({ sed: { ...state.sed, contributions: [...state.sed.contributions, contribution] } }));
    get()._recalculateAll();
    const state = get();
    if (state.activeClientId) {
      // Send the full Contribution shape INCLUDING the local id (same fix as
      // addEsdContribution). Also carries isStructuredProject +
      // isLimitedServicesCommunity (construction SED indicators),
      // blackBenefitPercent, descriptionOfSpend, and dates (audit P2 #8).
      api.addSedContribution(state.activeClientId, contribution).catch(console.error);
    }
  },
  removeSedContribution: (id) => {
    set((state) => ({ sed: { ...state.sed, contributions: state.sed.contributions.filter(c => c.id !== id) } }));
    get()._recalculateAll();
    api.deleteSedContribution(id).catch(console.error);
  },

  updateAfs: (data) => {
    set((state) => ({ afs: { ...state.afs, ...data } }));
    get()._recalculateAll();
    const clientId = get().activeClientId;
    if (clientId) {
      api.updateClient(clientId, { afs: get().afs }).catch(console.error);
    }
  },

  setFscSubSector: (subSector) => {
    const normalized = normalizeFscSubSector(subSector) as Client['fscSubSector'];
    set((state) => ({ client: { ...state.client, fscSubSector: normalized } }));
    const clientId = get().activeClientId;
    if (clientId) {
      api.updateClient(clientId, { fscSubSector: normalized }).catch(console.error);
    }
    get().loadCalculatorConfig(clientId || '');
  },

  // Issue 3: Removed updateProcurementBonuses - bonuses are ED only

  updateEsdBonuses: (graduationBonus, jobsCreatedBonus, jobsCreatedCount, graduationEvidence, jobsCreatedEvidence) => {
    set((state) => ({
      esd: { ...state.esd, graduationBonus, jobsCreatedBonus, jobsCreatedCount, graduationEvidence, jobsCreatedEvidence },
    }));
    get()._recalculateAll();
    const clientId = get().activeClientId;
    if (clientId) {
      api.updateClient(clientId, { graduationBonus, jobsCreatedBonus, jobsCreatedCount, graduationEvidence, jobsCreatedEvidence }).catch(console.error);
    }
  },

  updateFinancials: (revenue, npat, leviableAmount, industryNorm) => {
    set((state) => ({
      client: { ...state.client, revenue, npat, leviableAmount, industryNorm },
      skills: { ...state.skills, leviableAmount }
    }));
    get()._recalculateAll();
    const state = get();
    if (state.activeClientId) {
      api.updateClient(state.activeClientId, { revenue, npat, leviableAmount, industryNorm }).catch(console.error);
    }
  },

  updateSedSpend: (data) => {
    set((state) => ({ sed: { ...state.sed, ...data } }));
    get()._recalculateAll();
    const state = get();
    if (state.activeClientId) {
      const { ceSpend, ceBonusSpend, fundisaSpend } = state.sed;
      api.updateClient(state.activeClientId, { ceSpend, ceBonusSpend, fundisaSpend }).catch(console.error);
    }
  },
  
  updateTMPS: (tmps, manualOverride = true) => {
    // manualOverride=true pins TMPS to the entered value; false (calculated mode)
    // clears the pin so supplier mutations keep TMPS in sync (see addSupplier).
    set((state) => ({ procurement: { ...state.procurement, tmps, tmpsManualOverride: manualOverride } }));
    get()._recalculateAll();
    const state = get();
    if (state.activeClientId) {
      api.updateProcurement(state.activeClientId, tmps).catch(console.error);
    }
  },
  
  updateSettings: (eapProvince, industrySector, measurementPeriodStart, measurementPeriodEnd) => {
    set((state) => ({
      client: {
        ...state.client,
        eapProvince: eapProvince as Client['eapProvince'],
        industrySector,
        measurementPeriodStart,
        measurementPeriodEnd,
      },
    }));
    get()._recalculateAll();
    const state = get();
    if (state.activeClientId) {
      api.updateClient(state.activeClientId, { eapProvince, industrySector, measurementPeriodStart, measurementPeriodEnd }).catch(console.error);
    }
  },

  updateIndustry: (industry) => {
    set((state) => ({ client: { ...state.client, industry } }));
    get()._recalculateAll(); // industryNorm lookup uses client.industry → Skills/PP can shift
    const state = get();
    if (state.activeClientId) {
      api.updateClient(state.activeClientId, { industry }).catch(console.error);
    }
  },

  updateEapYear: (eapYear) => {
    set((state) => ({ client: { ...state.client, eapYear } }));
    get()._recalculateAll(); // MC + Skills EAP bands score against the selected CEE vintage
    const state = get();
    if (state.activeClientId) {
      api.updateClient(state.activeClientId, { eapYear: eapYear ?? null }).catch(console.error);
    }
  },

  // Dynamic scorecard API actions
  loadTemplateStructure: async (graphKey: string) => {
    try {
      const response = await fetch(`/api/templates/${graphKey}/structure`);
      if (!response.ok) {
        throw new Error(`Failed to load template structure: ${response.statusText}`);
      }
      const data = await response.json();
      // CRITICAL FIX: API returns full object directly, not wrapped in 'structure'
      return data;
    } catch (error) {
      console.error('[store] Failed to load template structure:', error);
      return null;
    }
  },

  calculateFromTemplate: async (graphKey: string, entityMap?: Record<string, unknown>) => {
    try {
      const response = await fetch(`/api/templates/${graphKey}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          overrides: entityMap,
          includeFormulaDetails: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to calculate scorecard: ${response.statusText}`);
      }

      const data = await response.json();

      // Update store with calculated results
      if (data.scores) {
        set((state) => ({
          scorecard: {
            ...state.scorecard,
            // CRITICAL FIX: Apply round2 to all API-returned scores for consistent display
            ownership: { ...state.scorecard.ownership, score: round2(data.scores.pillars?.ownership?.score || 0) },
            managementControl: { ...state.scorecard.managementControl, score: round2(data.scores.pillars?.managementControl?.score || 0) },
            skillsDevelopment: { ...state.scorecard.skillsDevelopment, score: round2(data.scores.pillars?.skillsDevelopment?.score || 0) },
            procurement: { ...state.scorecard.procurement, score: round2(data.scores.pillars?.preferentialProcurement?.score || 0) },
            supplierDevelopment: { ...state.scorecard.supplierDevelopment, score: round2(data.scores.pillars?.supplierDevelopment?.score || data.scores.pillars?.enterpriseSupplierDevelopment?.score || 0) },
            enterpriseDevelopment: { ...state.scorecard.enterpriseDevelopment, score: round2(data.scores.pillars?.enterpriseDevelopment?.score || 0) },
            socioEconomicDevelopment: { ...state.scorecard.socioEconomicDevelopment, score: round2(data.scores.pillars?.socioEconomicDevelopment?.score || 0) },
            yesInitiative: { ...state.scorecard.yesInitiative, score: round2(data.scores.pillars?.yesInitiative?.score || 0) },
            total: { ...state.scorecard.total, score: round2(data.scores.total?.score || 0) },
            achievedLevel: parseInt(data.scores.beeLevel) || state.scorecard.achievedLevel,
            recognitionLevel: data.scores.recognition || state.scorecard.recognitionLevel,
          },
        }));
      }

      return data.scores;
    } catch (error) {
      console.error('[store] Failed to calculate from template:', error);
      return null;
    }
  },

  validateEntityCoverage: async (sectorCode: string, scorecardType: string) => {
    try {
      const response = await fetch(`/api/entity-mappings/${sectorCode}/${scorecardType}`);

      if (!response.ok) {
        // Try to build the mapping if it doesn't exist
        const buildResponse = await fetch(`/api/entity-mappings/build/${sectorCode}/${scorecardType}`, {
          method: 'POST',
        });

        if (!buildResponse.ok) {
          throw new Error(`Failed to validate coverage: ${buildResponse.statusText}`);
        }

        const buildData = await buildResponse.json();
        return {
          hasCoverage: buildData.mapping.coverage.coveragePercent > 0,
          percentage: buildData.mapping.coverage.coveragePercent,
          mappedEntities: buildData.mapping.coverage.mappedEntities,
          totalEntities: buildData.mapping.coverage.totalEntities,
          unmappedEntities: buildData.mapping.coverage.unmappedEntities,
        };
      }

      const data = await response.json();
      return {
        hasCoverage: data.mapping.coverage.coveragePercent > 0,
        percentage: data.mapping.coverage.coveragePercent,
        mappedEntities: data.mapping.coverage.mappedEntities,
        totalEntities: data.mapping.coverage.totalEntities,
        unmappedEntities: data.mapping.coverage.unmappedEntities,
      };
    } catch (error) {
      console.error('[store] Failed to validate entity coverage:', error);
      return null;
    }
  },
}));
