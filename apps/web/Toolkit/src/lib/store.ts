import { create } from 'zustand';
import { 
  Client, OwnershipData, ManagementData, SkillsData, 
  ProcurementData, ESDData, SEDData, ScorecardResult,
  Shareholder, Employee, TrainingProgram, Supplier, Contribution, FinancialYear,
  TrainingCategoryCode
} from './types';
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
  AGRI_GENERIC_CALCULATOR_CONFIG,
  isAgriGenericSector,
} from './sectors/agri-generic';

import { calculateOwnershipScore } from './calculators/ownership';
import { calculateManagementScore } from './calculators/management';
import { calculateSkillsScore } from './calculators/skills';
import { calculateProcurementScore } from './calculators/procurement';
import { calculateEsdScore, calculateSedScore } from './calculators/esd-sed';
import { calculateYESScore } from './calculators/yes';
import {
  calculateTransportQseManagement,
  calculateTransportQseEmploymentEquity,
  isTransportQseSector,
} from './calculators/transport';
import { deepClone, round2, SectorConfigError, requireSectorConfig, allowsRcogpDefaults } from './calculators/shared';

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

/** Fetch sector-specific calculator config from API (authoritative pillar weightings). */
async function fetchSectorCalculatorConfig(
  sectorCode: string,
  scorecardType: string,
): Promise<CalculatorConfig | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/scorecard/sector-config/${encodeURIComponent(sectorCode)}/${encodeURIComponent(scorecardType)}`,
    );
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.config) return data.config as CalculatorConfig;
    }
  } catch (error) {
    console.error('[store] Failed to fetch sector calculator config:', error);
  }
  return null;
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

type PillarConfigKey =
  | 'skillsDevelopment'
  | 'preferentialProcurement'
  | 'enterpriseDevelopment'
  | 'socioEconomicDevelopment';

const ELECTIVE_CONFIG_TO_SCORECARD: Record<PillarConfigKey, keyof ScorecardResult> = {
  skillsDevelopment: 'skillsDevelopment',
  preferentialProcurement: 'procurement',
  enterpriseDevelopment: 'enterpriseDevelopment',
  socioEconomicDevelopment: 'socioEconomicDevelopment',
};

/** Auto-select highest-scoring pillar per chooseOneGroup (Transport QSE electives). */
function resolveChooseOneElectives(
  pConfig: CalculatorConfig['pillarConfigs'],
  rawScores: Record<PillarConfigKey, number>,
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
  for (const keys of groups.values()) {
    const best = keys.reduce((a, b) => (rawScores[b] > rawScores[a] ? b : a), keys[0]);
    activeKeys.add(best);
    chosenKey = best;
    console.log('[SCORING-TRACE] chooseOneGroup resolved:', keys.join(', '), '→ chosen:', best, `(${rawScores[best]} pts)`);
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

interface BbeeState extends PillarState {
  isLoaded: boolean;
  activeClientId: string | null;
  pipelineOverrides: PipelineOverrides | null;
  calculatorConfig: CalculatorConfig | null;

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

  // Issue 3: Removed updateProcurementBonuses - bonuses are ED only
  updateEsdBonuses: (graduationBonus: boolean, jobsCreatedBonus: boolean, jobsCreatedCount?: number, graduationEvidence?: string, jobsCreatedEvidence?: string) => void;
  
  updateFinancials: (revenue: number, npat: number, leviableAmount: number, industryNorm?: number) => void;
  updateTMPS: (tmps: number) => void;
  updateSettings: (eapProvince: string, industrySector: string, measurementPeriodStart?: string, measurementPeriodEnd?: string) => void;

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

function calculateScorecard(
  state: PillarState & { calculatorConfig?: CalculatorConfig | null; ignoreSubMinimum?: boolean },
  overrides?: PipelineOverrides | null,
): ScorecardResult {
  const cfg = state.calculatorConfig;
  if (!cfg) throw new Error('calculatorConfig must be loaded before calculating scorecard. Please select a sector first.');
  assertSectorConfigLoaded(cfg, state.client);
  const transportQse = isTransportQseSector(state.client.sectorCode, state.client.scorecardType);
  const eeMax = cfg.pillarConfigs?.employmentEquity?.maxPoints ?? 0;

  console.log('[SCORING-TRACE] Calculator input for ownership:', {
    shareholders: state.ownership.shareholders?.length ?? 0,
    sample: state.ownership.shareholders?.slice(0, 2),
  });
  const ownScore = calculateOwnershipScore(state.ownership, cfg);
  console.log('[SCORING-TRACE] Calculator output for ownership:', { score: ownScore.total, subMin: ownScore.subMinimumMet });

  let mgtScoreTotal: number;
  let eeScoreTotal = 0;
  if (transportQse) {
    console.log('[SCORING-TRACE] Calculator input for managementControl (Transport QSE):', {
      employees: state.management.employees?.length ?? 0,
    });
    const tqMc = calculateTransportQseManagement(state.management, cfg);
    mgtScoreTotal = tqMc.score;
    console.log('[SCORING-TRACE] Calculator output for managementControl:', { score: tqMc.score, subMin: true });

    console.log('[SCORING-TRACE] Calculator input for employmentEquity (Transport QSE):', {
      employees: state.management.employees?.length ?? 0,
      eapProvince: state.client.eapProvince,
    });
    const tqEe = calculateTransportQseEmploymentEquity(state.management, cfg, state.client.eapProvince);
    eeScoreTotal = tqEe.score;
    console.log('[SCORING-TRACE] Calculator output for employmentEquity:', { score: tqEe.score, subMin: true });
  } else {
    console.log('[SCORING-TRACE] Calculator input for managementControl:', {
      employees: state.management.employees?.length ?? 0,
    });
    const mgtScore = calculateManagementScore(state.management, cfg, state.client.eapProvince);
    mgtScoreTotal = mgtScore.total;
    console.log('[SCORING-TRACE] Calculator output for managementControl:', { score: mgtScore.total, subMin: mgtScore.subMinimumMet });
  }

  console.log('[SCORING-TRACE] Calculator input for skillsDevelopment:', {
    leviableAmount: state.skills.leviableAmount,
    programs: state.skills.trainingPrograms?.length ?? 0,
  });
  const skillScore = calculateSkillsScore(state.skills, cfg);
  console.log('[SCORING-TRACE] Calculator output for skillsDevelopment:', { score: skillScore.total, subMin: skillScore.subMinimumMet });

  console.log('[SCORING-TRACE] Calculator input for procurement:', {
    tmps: state.procurement.tmps,
    suppliers: state.procurement.suppliers?.length ?? 0,
  });
  const procScore = calculateProcurementScore(state.procurement, cfg);
  console.log('[SCORING-TRACE] Calculator output for procurement:', { score: procScore.total, subMin: procScore.subMinimumMet });

  console.log('[SCORING-TRACE] Calculator input for esd/sed:', {
    esdContributions: state.esd.contributions?.length ?? 0,
    sedContributions: state.sed.contributions?.length ?? 0,
    npat: state.client.npat,
  });
  const esdScore = calculateEsdScore(state.esd, state.client.npat, cfg);
  const sedScore = calculateSedScore(state.sed, state.client.npat, cfg);
  console.log('[SCORING-TRACE] Calculator output for esd:', { sd: esdScore.sdTotal, ed: esdScore.edTotal });
  console.log('[SCORING-TRACE] Calculator output for sed:', { score: sedScore.total });
  // CRITICAL: Wire YES calculator - construct YESData from skills and management state
  // Training programs with isYesEmployee=true are treated as YES candidates
  const yesCandidates = state.skills.trainingPrograms
    ?.filter(p => p.isYesEmployee)
    ?.map(p => ({
      id: p.id,
      name: p.learnerName || 'YES Candidate',
      race: p.race || 'African',
      gender: p.gender || 'Male',
      isDisabled: p.isDisabled || false,
      isBlack: p.race !== 'White', // Computed: African/Coloured/Indian = Black
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
    yesBlackYouthCount: yesCandidates.filter(c => c.race !== 'White').length,
    yesBlackYouthPercentage: yesCandidates.length > 0 ? (yesCandidates.filter(c => c.race !== 'White').length / yesCandidates.length) * 100 : 0,
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
    skillsDevelopment: skillScore.total,
    preferentialProcurement: procScore.total,
    enterpriseDevelopment: esdScore.edTotal,
    socioEconomicDevelopment: sedScore.total,
  };
  const hasChooseOne = Object.values(pConfig ?? {}).some(p => p?.chooseOneGroup);
  const { chosenKey: chosenElectiveKey, activeKeys: activeElectiveKeys } = hasChooseOne
    ? resolveChooseOneElectives(pConfig, electiveRawScores)
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

  const compulsoryTotal = ownScore.total + mgtScoreTotal + (eeTarget > 0 ? eeScoreTotal : 0);
  const electiveTotal = skillsForTotal + procForTotal + edForTotal + sedForTotal;
  const totalPoints = compulsoryTotal + electiveTotal + sdForTotal + yesScore.score + yesScore.yesBonusPoints;

  const totalTarget = cfg?.totalMaxPoints ?? (
    ownTarget + mcTarget + eeTarget +
    (hasChooseOne ? 25 : skillsTarget + procTarget + edTarget + sedTarget) +
    sdTarget + yesTarget
  );

  console.log('[SCORING-TRACE] Final recalculated:', `${round2(totalPoints)} / ${totalTarget} = Level ${pointsToLevel(totalPoints, cfg)}`, {
    chosenElective: chosenElectiveKey,
    compulsory: round2(compulsoryTotal),
    elective: round2(electiveTotal),
  });

  const level = pointsToLevel(totalPoints, cfg);

  const ownSubMinMet = ownScore.total >= (ownTarget * 0.4) || ownScore.subMinimumMet;
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
  const anySubMinFailed = !ownSubMinMet || !skSubMinMet || !prSubMinMet || !sdSubMinMet || !edSubMinMet;
  const isDiscounted = !state.ignoreSubMinimum && level < 9 && anySubMinFailed;
  let discountedLevel = isDiscounted ? Math.min(level + 1, 8) : level;

  if (yesScore.yesBeeLevelIncrease > 0 && discountedLevel > 1) {
    discountedLevel = Math.max(1, discountedLevel - yesScore.yesBeeLevelIncrease);
  }

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

  return {
    ownership: {
      score: round2(ownScore.total),
      target: ownTarget,
      weighting: ownTarget,
      subMinimumMet: showSubMin('ownership') ? ownSubMinMet : undefined,
    },
    managementControl: { score: round2(mgtScoreTotal), target: mcTarget, weighting: mcTarget },
    ...(eeTarget > 0 ? {
      employmentEquity: { score: round2(eeScoreTotal), target: eeTarget, weighting: eeTarget },
    } : {}),
    skillsDevelopment: {
      score: round2(skillScore.total),
      target: skillsWeight,
      weighting: skillsWeight,
      subMinimumMet: showSubMin('skillsDevelopment') ? skSubMinMet : undefined,
      ...mkElectiveMeta('skillsDevelopment'),
    },
    procurement: {
      score: round2(procScore.total),
      target: procWeight,
      weighting: procWeight,
      subMinimumMet: showSubMin('preferentialProcurement') ? prSubMinMet : undefined,
      ...mkElectiveMeta('preferentialProcurement'),
    },
    supplierDevelopment: {
      score: round2(esdScore.sdTotal),
      target: sdTarget,
      weighting: sdTarget,
      subMinimumMet: showSubMin('supplierDevelopment') ? sdSubMinMet : undefined,
    },
    enterpriseDevelopment: {
      score: round2(esdScore.edTotal),
      target: edWeight,
      weighting: edWeight,
      subMinimumMet: showSubMin('enterpriseDevelopment') ? edSubMinMet : undefined,
      ...mkElectiveMeta('enterpriseDevelopment'),
    },
    socioEconomicDevelopment: {
      score: round2(sedScore.total),
      target: sedWeight,
      weighting: sedWeight,
      ...mkElectiveMeta('socioEconomicDevelopment'),
    },
    yesInitiative: { score: round2(yesScore.score + yesScore.yesBonusPoints), target: yesTarget, weighting: yesTarget },
    total: { score: round2(totalPoints), target: totalTarget, weighting: totalTarget },
    achievedLevel: level,
    discountedLevel,
    isDiscounted,
    recognitionLevel: levelToRecognition(discountedLevel),
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
  scorecard: emptyScorecard,
  pipelineOverrides: null,
  calculatorConfig: null,

  isScenarioMode: false,
  activeScenarioId: null,
  scenarios: [],
  baseSnapshot: null,
  ignoreSubMinimum: false,

  loadClientData: async (clientId: string) => {
    try {
      console.log(`[SCORING-TRACE] loadClientData(${clientId}) — fetching`);
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
        eapProvince: (data.client.eapProvince || finExtras.eapProvince || 'National') as Client['eapProvince'],
        industryNorm: data.client.industryNorm ?? (finExtras.industryNormPercent as number | undefined),
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
      console.log('[SCORING-TRACE] Client data received:', {
        sector: clientData.sectorCode,
        scorecardType: clientData.scorecardType,
        revenue: clientData.revenue,
        shareholders: data.ownership?.shareholders?.length ?? 0,
        employees: data.management?.employees?.length ?? 0,
        suppliers: data.procurement?.suppliers?.length ?? 0,
      });

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
          isDesignatedGroup: Boolean(sh.isDesignatedGroup),
          designatedGroupType: sh.designatedGroupType,
          blackNewEntrant: Boolean(sh.blackNewEntrant),
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
        combineExcoSenior: Boolean(finExtras.combineExcoSenior ?? data.client.combineExcoSenior),
        employees: (data.management?.employees || []).map((e: any) => ({
          id: e.id,
          name: e.name,
          gender: e.gender,
          race: e.race,
          designation: e.designation || mapJobTitleToDesignation(e.occupationalLevel),
          isDisabled: e.isDisabled || false,
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
        trainingPrograms: (data.skills?.trainingPrograms || []).map((tp: any) => ({
          id: tp.id,
          name: tp.name,
          category: tp.category,
          categoryCode: tp.categoryCode || mapLegacyCategoryForStore(tp.category),
          cost: tp.cost || 0,
          courseCost: tp.courseCost || 0,
          travelCost: tp.travelCost || 0,
          accommodationCost: tp.accommodationCost || 0,
          cateringCost: tp.cateringCost || 0,
          employeeId: tp.employeeId,
          isEmployed: tp.isEmployed || false,
          isBlack: tp.isBlack || false,
          gender: tp.gender || null,
          race: tp.race || null,
          isDisabled: tp.isDisabled || false,
        })),
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
          beeLevel: Number.isFinite(Number(s.beeLevel)) ? Number(s.beeLevel) : 0,
          blackOwnership: s.blackOwnership || 0,
          blackWomenOwnership: s.blackWomenOwnership || 0,
          youthOwnership: s.youthOwnership || 0,
          disabledOwnership: s.disabledOwnership || 0,
          enterpriseType: s.enterpriseType || 'generic',
          spend: s.spend || 0,
          isEmpoweringSupplier:
            typeof s.isEmpoweringSupplier === 'boolean'
              ? s.isEmpoweringSupplier
              : Boolean(s.empoweringSupplier),
          isForeignSupplier: Boolean(s.isForeignSupplier),
          isBlackOwned51: Boolean(s.isBlackOwned51),
          isBlackWomanOwned30: Boolean(s.isBlackWomanOwned30),
          isDesignatedGroup: Boolean(s.isDesignatedGroup),
          isSupplierDevRecipient: Boolean(s.isSupplierDevRecipient),
          hasThreeYearContract: Boolean(s.hasThreeYearContract),
        })),
        // Issue 3: Removed graduationBonus and jobsCreatedBonus from Procurement (ED only bonuses)
      };

      const esdState: ESDData = {
        id: '',
        clientId,
        contributions: (data.esd?.contributions || []).map((c: any) => ({
          id: c.id,
          beneficiary: c.beneficiary,
          type: c.type,
          amount: c.amount || 0,
          category: c.category,
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
        ceSpend: finExtras.ceSpend as number | undefined,
        ceBonusSpend: finExtras.ceBonusSpend as number | undefined,
        fundisaSpend: finExtras.fundisaSpend as number | undefined,
        contributions: (data.sed?.contributions || []).map((c: any) => ({
          id: c.id,
          beneficiary: c.beneficiary,
          type: c.type,
          amount: c.amount || 0,
          category: c.category,
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
        scenarios: scenariosData,
        isScenarioMode: false,
        activeScenarioId: null,
        baseSnapshot: null,
      });

      await get().loadCalculatorConfig(clientId);
      const cfg = get().calculatorConfig;
      if (cfg?.pillarConfigs) {
        console.log('[SCORING-TRACE] Pillar configs:', Object.fromEntries(
          Object.entries(cfg.pillarConfigs).map(([k, v]) => [k, { maxPoints: v?.maxPoints, chooseOneGroup: v?.chooseOneGroup }]),
        ));
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
      scorecard: emptyScorecard,
      pipelineOverrides: null,
      calculatorConfig: null,
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
      scorecard: buildEmptyScorecard(),
      pipelineOverrides: null,
      calculatorConfig: null,
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

    if (isRcogpGenericSector(sectorCode, scorecardType)) {
      console.log('[SCORING-TRACE] Using bundled RCOGP Generic calculator config');
      set({ calculatorConfig: RCOGP_GENERIC_CALCULATOR_CONFIG });
      get()._recalculateAll();
      return;
    }

    if (isRcogpQseSector(sectorCode, scorecardType)) {
      console.log('[SCORING-TRACE] Using bundled RCOGP QSE calculator config');
      set({ calculatorConfig: RCOGP_QSE_CALCULATOR_CONFIG });
      get()._recalculateAll();
      return;
    }

    if (isIctGenericSector(sectorCode, scorecardType)) {
      console.log('[SCORING-TRACE] Using bundled ICT Generic calculator config');
      set({ calculatorConfig: ICT_GENERIC_CALCULATOR_CONFIG });
      get()._recalculateAll();
      return;
    }

    if (isIctQseSector(sectorCode, scorecardType)) {
      console.log('[SCORING-TRACE] Using bundled ICT QSE calculator config');
      set({ calculatorConfig: ICT_QSE_CALCULATOR_CONFIG });
      get()._recalculateAll();
      return;
    }

    if (isAgriGenericSector(sectorCode, scorecardType)) {
      console.log('[SCORING-TRACE] Using bundled AGRI Generic calculator config');
      set({ calculatorConfig: AGRI_GENERIC_CALCULATOR_CONFIG });
      get()._recalculateAll();
      return;
    }

    if (isFscGenericSector(sectorCode, scorecardType)) {
      console.log('[SCORING-TRACE] Using bundled FSC Generic (Others) calculator config');
      set({ calculatorConfig: FSC_GENERIC_CALCULATOR_CONFIG });
      get()._recalculateAll();
      return;
    }

    const sectorConfig = await fetchSectorCalculatorConfig(sectorCode, scorecardType);

    if (sectorConfig && hasValidPillarConfigs(sectorConfig)) {
      console.log('[SCORING-TRACE] Pillar configs loaded from sector:', sectorCode, scorecardType, {
        totalMaxPoints: sectorConfig.totalMaxPoints,
        ownership: sectorConfig.pillarConfigs?.ownership?.maxPoints,
        managementControl: sectorConfig.pillarConfigs?.managementControl?.maxPoints,
        employmentEquity: sectorConfig.pillarConfigs?.employmentEquity?.maxPoints,
      });
      set({
        calculatorConfig: {
          ...sectorConfig,
          sectorCode: sectorConfig.sectorCode ?? sectorCode,
          scorecardType: sectorConfig.scorecardType ?? scorecardType,
        },
      });
      get()._recalculateAll();
      return;
    }

    if (sectorConfig && !hasValidPillarConfigs(sectorConfig)) {
      console.warn('[store] Sector config rejected (invalid pillar maxPoints):', sectorCode, scorecardType);
    }

    console.error('[store] No valid calculator config for', sectorCode, scorecardType);
  },

  saveCalculatorConfig: async (_config: CalculatorConfig) => {
    console.warn('[store] saveCalculatorConfig is disabled; sector config is authoritative');
  },

  _recalculateAll: () => {
    const state = get();

    if (!state.calculatorConfig) {
      console.error('[store] Cannot calculate: calculatorConfig not loaded');
      return;
    }

    try {
      const result = calculateScorecard(state, state.pipelineOverrides);
      set({ scorecard: result });
      console.log('[SCORING-TRACE] Final recalculated:', `${result.total.score} / ${result.total.weighting} = Level ${result.achievedLevel}`);
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
      api.addFinancialYear(state.activeClientId, { year: year.year, revenue: year.revenue, npat: year.npat, indicativeNpat: year.indicativeNpat, notes: year.notes }).catch(console.error);
    }
  },
  updateFinancialYear: (id, data) => {
    set((state) => ({ client: { ...state.client, financialHistory: state.client.financialHistory.map(y => y.id === id ? { ...y, ...data } : y) } }));
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
      api.addShareholder(state.activeClientId, {
        name: shareholder.name,
        ownershipType: shareholder.ownershipType || 'shareholder',
        blackOwnership: shareholder.blackOwnership,
        blackWomenOwnership: shareholder.blackWomenOwnership,
        shares: shareholder.shares,
        shareValue: shareholder.shareValue,
      }).catch(console.error);
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
        name: employee.name, gender: employee.gender, race: employee.race,
        designation: employee.designation, isDisabled: employee.isDisabled,
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
      Promise.all(
        employees.map(emp =>
          api.addEmployee(state.activeClientId!, {
            name: emp.name, gender: emp.gender, race: emp.race,
            designation: emp.designation, isDisabled: emp.isDisabled,
          })
        )
      ).catch(console.error);
    }
  },

  addTrainingProgram: (program) => {
    set((state) => ({ skills: { ...state.skills, trainingPrograms: [...state.skills.trainingPrograms, program] } }));
    get()._recalculateAll();
    const state = get();
    if (state.activeClientId) {
      api.addTrainingProgram(state.activeClientId, {
        name: program.name, category: program.category, cost: program.cost,
        employeeId: program.employeeId, isEmployed: program.isEmployed, isBlack: program.isBlack,
        gender: program.gender, race: program.race, isDisabled: program.isDisabled,
      }).catch(console.error);
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
    set((state) => ({ procurement: { ...state.procurement, suppliers: [...state.procurement.suppliers, supplier] } }));
    get()._recalculateAll();
    const state = get();
    if (state.activeClientId) {
      api.addSupplier(state.activeClientId, {
        name: supplier.name, beeLevel: supplier.beeLevel,
        blackOwnership: supplier.blackOwnership, blackWomenOwnership: supplier.blackWomenOwnership,
        youthOwnership: supplier.youthOwnership, disabledOwnership: supplier.disabledOwnership,
        enterpriseType: supplier.enterpriseType, spend: supplier.spend,
      }).catch(console.error);
    }
  },
  updateSupplier: (id, data) => {
    set((state) => ({ procurement: { ...state.procurement, suppliers: state.procurement.suppliers.map(s => s.id === id ? { ...s, ...data } : s) } }));
    get()._recalculateAll();
    api.updateSupplier(id, data).catch(console.error);
  },
  removeSupplier: (id) => {
    set((state) => ({ procurement: { ...state.procurement, suppliers: state.procurement.suppliers.filter(s => s.id !== id) } }));
    get()._recalculateAll();
    api.deleteSupplier(id).catch(console.error);
  },

  addEsdContribution: (contribution) => {
    set((state) => ({ esd: { ...state.esd, contributions: [...state.esd.contributions, contribution] } }));
    get()._recalculateAll();
    const state = get();
    if (state.activeClientId) {
      api.addEsdContribution(state.activeClientId, {
        beneficiary: contribution.beneficiary, type: contribution.type,
        amount: contribution.amount, category: contribution.category,
      }).catch(console.error);
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
      api.addSedContribution(state.activeClientId, {
        beneficiary: contribution.beneficiary, type: contribution.type,
        amount: contribution.amount, category: contribution.category,
      }).catch(console.error);
    }
  },
  removeSedContribution: (id) => {
    set((state) => ({ sed: { ...state.sed, contributions: state.sed.contributions.filter(c => c.id !== id) } }));
    get()._recalculateAll();
    api.deleteSedContribution(id).catch(console.error);
  },

  // Issue 3: Removed updateProcurementBonuses - bonuses are ED only

  updateEsdBonuses: (graduationBonus, jobsCreatedBonus, jobsCreatedCount, graduationEvidence, jobsCreatedEvidence) => {
    set((state) => ({
      esd: { ...state.esd, graduationBonus, jobsCreatedBonus, jobsCreatedCount, graduationEvidence, jobsCreatedEvidence },
    }));
    get()._recalculateAll();
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
  
  updateTMPS: (tmps) => {
    set((state) => ({ procurement: { ...state.procurement, tmps } }));
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
