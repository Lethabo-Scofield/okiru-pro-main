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
import { deepClone } from './calculators/shared';

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
  leviableAmount: 0, industrySector: 'Generic', eapProvince: 'National',
  financialHistory: [],
};

const emptyOwnership: OwnershipData = {
  id: '', clientId: '', shareholders: [], companyValue: 0, outstandingDebt: 0, yearsHeld: 0,
};

const emptyManagement: ManagementData = { id: '', clientId: '', employees: [] };
const emptySkills: SkillsData = { id: '', clientId: '', leviableAmount: 0, trainingPrograms: [] };
const emptyProcurement: ProcurementData = { id: '', clientId: '', tmps: 0, suppliers: [], graduationBonus: false, jobsCreatedBonus: false };
const emptyESD: ESDData = { id: '', clientId: '', contributions: [], graduationBonus: false, jobsCreatedBonus: false };
const emptySED: SEDData = { id: '', clientId: '', contributions: [] };

const emptyScorecard: ScorecardResult = {
  ownership: { score: 0, target: 25, weighting: 25, subMinimumMet: false },
  managementControl: { score: 0, target: 19, weighting: 19 },
  skillsDevelopment: { score: 0, target: 25, weighting: 25, subMinimumMet: false },
  procurement: { score: 0, target: 29, weighting: 29, subMinimumMet: false },
  supplierDevelopment: { score: 0, target: 10, weighting: 10, subMinimumMet: false },
  enterpriseDevelopment: { score: 0, target: 7, weighting: 7, subMinimumMet: false },
  socioEconomicDevelopment: { score: 0, target: 5, weighting: 5 },
  yesInitiative: { score: 0, target: 5, weighting: 5 },
  total: { score: 0, target: 120, weighting: 120 },
  achievedLevel: 9, discountedLevel: 9, isDiscounted: false, recognitionLevel: '0%',
};

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

  loadClientData: (clientId: string) => Promise<void>;
  clearData: () => void;

  setPipelineOverrides: (overrides: PipelineOverrides) => void;

  addShareholder: (shareholder: Shareholder) => void;
  updateShareholder: (id: string, data: Partial<Shareholder>) => void;
  removeShareholder: (id: string) => void;
  updateCompanyValue: (value: number, debt: number) => void;

  addEmployee: (employee: Employee) => void;
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

  updateProcurementBonuses: (graduationBonus: boolean, jobsCreatedBonus: boolean, graduationEvidence?: string, jobsCreatedEvidence?: string) => void;
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
  
  _recalculateAll: () => void;
}

const RECOGNITION_LEVELS = [135, 125, 110, 100, 80, 60, 50, 10] as const;

function pointsToLevel(totalPoints: number): number {
  if (totalPoints >= 100) return 1;
  if (totalPoints >= 95) return 2;
  if (totalPoints >= 90) return 3;
  if (totalPoints >= 80) return 4;
  if (totalPoints >= 75) return 5;
  if (totalPoints >= 70) return 6;
  if (totalPoints >= 55) return 7;
  if (totalPoints >= 40) return 8;
  return 9;
}

function levelToRecognition(level: number): string {
  return level >= 9 ? '0%' : `${RECOGNITION_LEVELS[level - 1]}%`;
}

function calculateScorecard(
  state: PillarState & { calculatorConfig?: CalculatorConfig | null },
  overrides?: PipelineOverrides | null,
): ScorecardResult {
  const cfg = state.calculatorConfig ?? undefined;
  const ownScore = calculateOwnershipScore(state.ownership, cfg);
  const mgtScore = calculateManagementScore(state.management, cfg);
  const skillScore = calculateSkillsScore(state.skills, cfg);
  const procScore = calculateProcurementScore(state.procurement, cfg);
  const esdScore = calculateEsdScore(state.esd, state.client.npat, cfg);
  const sedScore = calculateSedScore(state.sed, state.client.npat, cfg);

  if (overrides && overrides.totalPoints !== undefined && overrides.totalPoints > 0) {
    const ov = overrides;
    const ownPts = ov.ownership ?? ownScore.total;
    const mcPts = ov.managementControl ?? mgtScore.total;
    const skPts = ov.skillsDevelopment ?? skillScore.total;
    const prPts = ov.procurement ?? procScore.total;
    const sdPts = ov.supplierDevelopment ?? esdScore.sdTotal;
    const edPts = ov.enterpriseDevelopment ?? esdScore.edTotal;
    const sedPts = ov.socioEconomicDevelopment ?? sedScore.total;
    const yesPts = ov.yesInitiative ?? 0;
    const total = ov.totalPoints ?? (ownPts + mcPts + skPts + prPts + sdPts + edPts + sedPts + yesPts);

    const level = ov.achievedLevel ?? pointsToLevel(total);
    const disc = ov.discountedLevel ?? level;
    const isDisc = ov.isDiscounted ?? false;
    const recog = ov.recognitionLevel ?? levelToRecognition(disc);

    const allSubMinMet = ov.subMinimumsMet;
    const ownSubMin = allSubMinMet !== undefined ? allSubMinMet : (ownPts >= 10 || ownScore.subMinimumMet);
    const skSubMin = allSubMinMet !== undefined ? allSubMinMet : skillScore.subMinimumMet;
    const procBase = typeof procScore.base === 'number' ? procScore.base : prPts;
    const prSubMin = allSubMinMet !== undefined ? allSubMinMet : (procBase >= 11.6);
    const sdSubMin = allSubMinMet !== undefined ? allSubMinMet : esdScore.sdSubMinimumMet;
    const edSubMin = allSubMinMet !== undefined ? allSubMinMet : esdScore.edSubMinimumMet;

    return {
      ownership: { score: ownPts, target: 25, weighting: 25, subMinimumMet: ownSubMin },
      managementControl: { score: mcPts, target: 19, weighting: 19 },
      skillsDevelopment: { score: skPts, target: 25, weighting: 25, subMinimumMet: skSubMin },
      procurement: { score: prPts, target: 29, weighting: 29, subMinimumMet: prSubMin },
      supplierDevelopment: { score: sdPts, target: 10, weighting: 10, subMinimumMet: sdSubMin },
      enterpriseDevelopment: { score: edPts, target: 7, weighting: 7, subMinimumMet: edSubMin },
      socioEconomicDevelopment: { score: sedPts, target: 5, weighting: 5 },
      yesInitiative: { score: yesPts, target: 5, weighting: 5 },
      total: { score: total, target: 120, weighting: 120 },
      achievedLevel: level, discountedLevel: disc, isDiscounted: isDisc, recognitionLevel: recog,
    };
  }

  const totalPoints = ownScore.total + mgtScore.total + skillScore.total + procScore.total + esdScore.sdTotal + esdScore.edTotal + sedScore.total;
  const level = pointsToLevel(totalPoints);

  const ownSubMinMet = ownScore.total >= 10 || ownScore.subMinimumMet;
  const skSubMinMet = skillScore.subMinimumMet;
  const prSubMinMet = procScore.subMinimumMet;
  const sdSubMinMet = esdScore.sdSubMinimumMet;
  const edSubMinMet = esdScore.edSubMinimumMet;
  const anySubMinFailed = !ownSubMinMet || !skSubMinMet || !prSubMinMet || !sdSubMinMet || !edSubMinMet;
  const isDiscounted = level < 9 && anySubMinFailed;
  const discountedLevel = isDiscounted ? Math.min(level + 1, 8) : level;

  return {
    ownership: { score: ownScore.total, target: 25, weighting: 25, subMinimumMet: ownSubMinMet },
    managementControl: { score: mgtScore.total, target: 19, weighting: 19 },
    skillsDevelopment: { score: skillScore.total, target: 25, weighting: 25, subMinimumMet: skSubMinMet },
    procurement: { score: procScore.total, target: 29, weighting: 29, subMinimumMet: prSubMinMet },
    supplierDevelopment: { score: esdScore.sdTotal, target: 10, weighting: 10, subMinimumMet: sdSubMinMet },
    enterpriseDevelopment: { score: esdScore.edTotal, target: 7, weighting: 7, subMinimumMet: edSubMinMet },
    socioEconomicDevelopment: { score: sedScore.total, target: 5, weighting: 5 },
    yesInitiative: { score: 0, target: 5, weighting: 5 },
    total: { score: totalPoints, target: 120, weighting: 120 },
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

  loadClientData: async (clientId: string) => {
    try {
      const data = await api.getClientData(clientId);
      
      const clientData: Client = {
        id: data.client.id,
        name: data.client.name,
        financialYear: data.client.financialYear || '',
        revenue: data.client.revenue || 0,
        npat: data.client.npat || 0,
        leviableAmount: data.client.leviableAmount || 0,
        industrySector: data.client.industrySector || 'Generic',
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
        graduationBonus: data.procurement?.graduationBonus || false,
        graduationEvidence: data.procurement?.graduationEvidence || '',
        jobsCreatedBonus: data.procurement?.jobsCreatedBonus || false,
        jobsCreatedEvidence: data.procurement?.jobsCreatedEvidence || '',
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
      console.error('Failed to load client data:', error);
      set({ isLoaded: false, activeClientId: null });
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
      isScenarioMode: false,
      activeScenarioId: null,
      scenarios: [],
      baseSnapshot: null,
    });
  },

  setPipelineOverrides: (overrides: PipelineOverrides) => {
    set({ pipelineOverrides: overrides });
    get()._recalculateAll();
    const clientId = get().activeClientId;
    if (clientId) {
      api.updateClient(clientId, { pipelineOverrides: overrides }).catch(console.error);
    }
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

  _recalculateAll: () => set((state) => ({
    scorecard: calculateScorecard(state, state.pipelineOverrides),
  })),

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

  updateProcurementBonuses: (graduationBonus, jobsCreatedBonus, graduationEvidence, jobsCreatedEvidence) => {
    set((state) => ({
      procurement: { ...state.procurement, graduationBonus, jobsCreatedBonus, graduationEvidence, jobsCreatedEvidence },
    }));
    get()._recalculateAll();
  },

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
  }
}));
