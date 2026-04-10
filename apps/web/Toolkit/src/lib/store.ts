import { create } from 'zustand';
import { 
  Client, OwnershipData, ManagementData, SkillsData, 
  ProcurementData, ESDData, SEDData, ScorecardResult,
  Shareholder, Employee, TrainingProgram, Supplier, Contribution, FinancialYear,
  TrainingCategoryCode
} from './types';
import { v4 as uuidv4 } from "uuid";
import { api, invalidateClientData } from './api';
import type { CalculatorConfig } from '../../../shared/schema';

import { calculateOwnershipScore } from './calculators/ownership';
import { calculateManagementScore } from './calculators/management';
import { calculateSkillsScore } from './calculators/skills';
import { calculateProcurementScore } from './calculators/procurement';
import { calculateEsdScore, calculateSedScore } from './calculators/esd-sed';
import { calculateYESScore } from './calculators/yes';
import { deepClone, round2 } from './calculators/shared';

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
function buildEmptyScorecard(config?: CalculatorConfig | null): ScorecardResult {
  const pc = config?.pillarConfigs;
  return {
    ownership: { score: 0, target: pc?.ownership?.maxPoints ?? 25, weighting: pc?.ownership?.maxPoints ?? 25, subMinimumMet: false },
    managementControl: { score: 0, target: pc?.managementControl?.maxPoints ?? 19, weighting: pc?.managementControl?.maxPoints ?? 19 },
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

function calculateScorecard(
  state: PillarState & { calculatorConfig?: CalculatorConfig | null; ignoreSubMinimum?: boolean },
  overrides?: PipelineOverrides | null,
): ScorecardResult {
  const cfg = state.calculatorConfig;
  if (!cfg) throw new Error('calculatorConfig must be loaded before calculating scorecard. Please select a sector first.');
  const ownScore = calculateOwnershipScore(state.ownership, cfg);
  const mgtScore = calculateManagementScore(state.management, cfg, state.client.eapProvince);
  const skillScore = calculateSkillsScore(state.skills, cfg);
  const procScore = calculateProcurementScore(state.procurement, cfg);
  const esdScore = calculateEsdScore(state.esd, state.client.npat, cfg);
  const sedScore = calculateSedScore(state.sed, state.client.npat, cfg);
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
  const yesScore = calculateYESScore(yesData, cfg);

  if (overrides && overrides.totalPoints !== undefined && overrides.totalPoints > 0) {
    const ov = overrides;
    const ownPts = ov.ownership ?? ownScore.total;
    const mcPts = ov.managementControl ?? mgtScore.total;
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
    const yesTarget = pConfig?.yesInitiative?.maxPoints ?? 3; // Dynamic YES from config
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

  // Get dynamic targets from config or use defaults
  const pConfig = cfg?.pillarConfigs;
  const ownTarget = pConfig?.ownership?.maxPoints ?? 25;
  const mcTarget = pConfig?.managementControl?.maxPoints ?? 19;
  const skillsTarget = pConfig?.skillsDevelopment?.maxPoints ?? 25;
  const procTarget = pConfig?.preferentialProcurement?.maxPoints ?? 29;
  const sdTarget = pConfig?.supplierDevelopment?.maxPoints ?? 10;
  const edTarget = pConfig?.enterpriseDevelopment?.maxPoints ?? 7;
  const sedTarget = pConfig?.socioEconomicDevelopment?.maxPoints ?? 5;
  const yesTarget = pConfig?.yesInitiative?.maxPoints ?? 3; // Dynamic YES from config
  // Use totalMaxPoints from config (verified Excel value) instead of calculating
  const totalTarget = cfg?.totalMaxPoints ?? (ownTarget + mcTarget + skillsTarget + procTarget + sdTarget + edTarget + sedTarget + yesTarget);

  // CRITICAL FIX: Include YES in total points calculation
  const totalPoints = ownScore.total + mgtScore.total + skillScore.total + procScore.total + esdScore.sdTotal + esdScore.edTotal + sedScore.total + yesScore.score;
  const level = pointsToLevel(totalPoints, cfg);

  const ownSubMinMet = ownScore.total >= (ownTarget * 0.4) || ownScore.subMinimumMet; // 40% sub-minimum
  const skSubMinMet = skillScore.subMinimumMet;
  const prSubMinMet = procScore.subMinimumMet;
  const sdSubMinMet = esdScore.sdSubMinimumMet;
  const edSubMinMet = esdScore.edSubMinimumMet;
  const anySubMinFailed = !ownSubMinMet || !skSubMinMet || !prSubMinMet || !sdSubMinMet || !edSubMinMet;
  // When ignoreSubMinimum is true, don't apply the discount even if sub-minimums failed
  const isDiscounted = !state.ignoreSubMinimum && level < 9 && anySubMinFailed;
  const discountedLevel = isDiscounted ? Math.min(level + 1, 8) : level;

  // CRITICAL FIX: Apply round2 to all scores for consistent 2 decimal display
  return {
    ownership: { score: round2(ownScore.total), target: ownTarget, weighting: ownTarget, subMinimumMet: ownSubMinMet },
    managementControl: { score: round2(mgtScore.total), target: mcTarget, weighting: mcTarget },
    skillsDevelopment: { score: round2(skillScore.total), target: skillsTarget, weighting: skillsTarget, subMinimumMet: skSubMinMet },
    procurement: { score: round2(procScore.total), target: procTarget, weighting: procTarget, subMinimumMet: prSubMinMet },
    supplierDevelopment: { score: round2(esdScore.sdTotal), target: sdTarget, weighting: sdTarget, subMinimumMet: sdSubMinMet },
    enterpriseDevelopment: { score: round2(esdScore.edTotal), target: edTarget, weighting: edTarget, subMinimumMet: edSubMinMet },
    socioEconomicDevelopment: { score: round2(sedScore.total), target: sedTarget, weighting: sedTarget },
    yesInitiative: { score: round2(yesScore.score), target: yesTarget, weighting: yesTarget },
    total: { score: round2(totalPoints), target: totalTarget, weighting: totalTarget },
    achievedLevel: level, discountedLevel, isDiscounted, recognitionLevel: levelToRecognition(discountedLevel),
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
      const data = await api.getClientData(clientId);
      
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
        financialYear: data.client.financialYear || '',
        revenue: data.client.revenue || 0,
        npat: data.client.npat || 0,
        leviableAmount: data.client.leviableAmount || 0,
        industry: data.client.industry || 'Generic',
        eapProvince: data.client.eapProvince || 'National',
        industryNorm: data.client.industryNorm,
        financialHistory: (data.financialYears || []).map((fy: any) => ({
          id: fy.id,
          year: fy.year,
          revenue: fy.revenue || 0,
          npat: fy.npat || 0,
          indicativeNpat: fy.indicativeNpat,
          notes: fy.notes,
        })),
      };

      const ownershipState: OwnershipData = {
        id: data.ownership?.id || '',
        clientId,
        shareholders: (data.ownership?.shareholders || []).map((sh: any) => ({
          id: sh.id,
          name: sh.name,
          ownershipType: sh.ownershipType || 'shareholder',
          blackOwnership: sh.blackOwnership || 0,
          blackWomenOwnership: sh.blackWomenOwnership || 0,
          shares: sh.shares || 0,
          shareValue: sh.shareValue || 0,
        })),
        companyValue: data.ownership?.companyValue || 0,
        outstandingDebt: data.ownership?.outstandingDebt || 0,
        yearsHeld: data.ownership?.yearsHeld || 0,
        ownershipScorePoints: data.ownership?.ownershipScorePoints || 0,
        ownershipScorePercent: data.ownership?.ownershipScorePercent || 0,
        netValuePoints: data.ownership?.netValuePoints || 0,
        netValuePercent: data.ownership?.netValuePercent || 0,
      };

      const managementState: ManagementData = {
        id: '',
        clientId,
        employees: (data.management?.employees || []).map((e: any) => ({
          id: e.id,
          name: e.name,
          gender: e.gender,
          race: e.race,
          designation: e.designation,
          isDisabled: e.isDisabled || false,
        })),
      };

      const yesCandidatesFromSkills = (data.skills?.trainingPrograms || []).filter((tp: any) => tp.isYesEmployee);
      const skillsState: SkillsData = {
        id: '',
        clientId,
        leviableAmount: data.skills?.leviableAmount || clientData.leviableAmount || 0,
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

      const procurementState: ProcurementData = {
        id: '',
        clientId,
        tmps: data.procurement?.tmps || 0,
        suppliers: (data.procurement?.suppliers || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          beeLevel: s.beeLevel || 4,
          blackOwnership: s.blackOwnership || 0,
          blackWomenOwnership: s.blackWomenOwnership || 0,
          youthOwnership: s.youthOwnership || 0,
          disabledOwnership: s.disabledOwnership || 0,
          enterpriseType: s.enterpriseType || 'generic',
          spend: s.spend || 0,
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
        isLoaded: true,
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

      get()._recalculateAll();
      get().loadCalculatorConfig(clientId);
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
    try {
      const config = await api.getCalculatorConfig(clientId);
      if (config) {
        set({ calculatorConfig: config });
        get()._recalculateAll();
      }
    } catch (error) {
      console.error('Failed to load calculator config:', error);
    }
  },

  saveCalculatorConfig: async (config: CalculatorConfig) => {
    set({ calculatorConfig: config });
    get()._recalculateAll();
    const clientId = get().activeClientId;
    if (clientId) {
      try {
        await api.saveCalculatorConfig(clientId, config);
      } catch (error) {
        console.error('Failed to save calculator config:', error);
      }
    }
  },

  _recalculateAll: () => set((state) => {
    if (!state.calculatorConfig) {
      return { scorecard: { ...buildEmptyScorecard(), configMissing: true } };
    }
    return { scorecard: calculateScorecard(state, state.pipelineOverrides) };
  }),

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
