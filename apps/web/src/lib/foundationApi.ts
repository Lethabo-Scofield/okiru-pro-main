/**
 * Foundation API - Connects DocumentProcessor to Toolkit Store
 * 
 * This module provides:
 * 1. Sync between DocumentProcessor foundation data and Toolkit store
 * 2. API endpoints for saving/loading foundation data
 * 3. Integration with ArangoDB for persistent storage
 */

import type { ClientInformationData } from '@/components/build/ClientInformationForm';
import type { FinancialsData } from '@/components/build/FinancialsForm';
import type { FoundationData } from '@/components/build/FoundationStep';
import type { BuildPillarsData } from '@/components/build/BuildPillarsStep';
import type { 
  Client, 
  OwnershipData, 
  ManagementData, 
  SkillsData, 
  ProcurementData,
  ESDData,
  SEDData,
  YESData,
  TrainingProgram,
  YESCandidate,
  ScorecardResult,
} from '@toolkit/lib/types';
import { useBbeeStore, type APIScorecardResult } from '@toolkit/lib/store';
import type { CalculatorConfig } from '@shared/schema';

// ============================================================================
// Types
// ============================================================================

export interface FoundationSaveRequest {
  sessionId: string;
  clientInfo: ClientInformationData;
  financials: FinancialsData;
  assessmentId?: string;
}

export interface FoundationSaveResponse {
  success: boolean;
  assessmentId: string;
  clientId: string;
  message?: string;
}

export interface PillarsSaveRequest {
  sessionId: string;
  assessmentId: string;
  pillars: BuildPillarsData;
}

export interface PillarsSaveResponse {
  success: boolean;
  message?: string;
}

export interface AssessmentLoadResponse {
  success: boolean;
  foundation: FoundationData;
  pillars: BuildPillarsData;
  scorecard?: any;
}

// ============================================================================
// Data Transformation
// ============================================================================

/** Map address text to Client.eapProvince when explicit field is missing. */
export function inferEapProvinceFromAddress(address: string): Client['eapProvince'] {
  const a = (address || '').toLowerCase();
  if (/gauteng|johannesburg|pretoria|midrand|sandton/i.test(a)) return 'Gauteng';
  if (/kwazulu|kzn|durban|pietermaritzburg/i.test(a)) return 'KZN';
  if (/western cape|cape town|stellenbosch/i.test(a)) return 'Western Cape';
  if (/eastern cape|gqeberha|port elizabeth|east london/i.test(a)) return 'Eastern Cape';
  return 'National';
}

/**
 * YES pillar candidates are not stored as a separate slice in the Toolkit store; the
 * scorecard derives YES from skills.trainingPrograms with isYesEmployee=true.
 */
export function mergeYesIntoSkills(skills: SkillsData, yes: YESData | undefined): SkillsData {
  const base = skills.trainingPrograms || [];
  if (!yes?.candidates?.length) {
    return { ...skills, trainingPrograms: [...base] };
  }
  const extra: TrainingProgram[] = yes.candidates.map((c: YESCandidate, i: number) => {
    const courseCost = c.cost ?? 0;
    return {
      id: c.id || `yes-sync-${i}`,
      programName: 'YES Youth Placement',
      categoryCode: 'E',
      learnerName: c.name,
      gender: c.gender,
      race: c.race,
      isBlack: c.isBlack ?? c.race !== 'White',
      isDisabled: c.isDisabled,
      isForeign: false,
      employmentStatus: 'Fixed-Term',
      isYesEmployee: true,
      isCompleted: true,
      isAbsorbed: c.isAbsorbed,
      transactionDate: c.startDate || new Date().toISOString().slice(0, 10),
      startDate: c.startDate,
      endDate: c.endDate,
      courseCost,
      travelCost: 0,
      accommodationCost: 0,
      cateringCost: 0,
      stationeryCost: 0,
      facilityCost: 0,
      salaryCost: 0,
      otherCosts: 0,
      isAbet: false,
      isMandatory: false,
      isBursary: false,
      cost: courseCost,
      get totalCost() {
        return courseCost;
      },
    } as TrainingProgram;
  });
  return { ...skills, trainingPrograms: [...base, ...extra] };
}

/**
 * Transform ClientInformationData to Toolkit Client format
 */
export function clientInfoToToolkitClient(
  clientInfo: ClientInformationData,
  financials: FinancialsData
): Partial<Client> {
  const companySize = clientInfo.annualTurnover < 10000000 
    ? 'EME' 
    : clientInfo.annualTurnover <= 50000000 
      ? 'QSE' 
      : 'Generic';

  return {
    id: '', // Will be assigned by backend
    name: clientInfo.companyName,
    financialYear: clientInfo.financialYearEnd,
    revenue: financials.totalRevenue,
    npat: financials.deemedNpatUsed ? financials.deemedNpat : financials.npat,
    leviableAmount: financials.leviableAmount,
    industryNorm: financials.industry ? getIndustryNorm(financials.industry) : undefined,
    eapProvince:
      clientInfo.eapProvince
      || inferEapProvinceFromAddress(clientInfo.physicalAddress || ''),
    financialHistory: [], // Empty for new clients
    
    // Extended fields from TOOLKIT_TAB_MAP.md Sheet 1
    registrationNumber: clientInfo.registrationNumber,
    tradingName: clientInfo.tradingName,
    vatNumber: clientInfo.vatNumber,
    taxNumber: clientInfo.taxNumber,
    physicalAddress: clientInfo.physicalAddress,
    postalAddress: clientInfo.postalAddress,
    contactPerson: clientInfo.contactPerson,
    contactEmail: clientInfo.contactEmail,
    contactPhone: clientInfo.contactPhone,
    sectorCode: clientInfo.sectorCode as Client['sectorCode'],
    industry: clientInfo.industry,
    companySize,
    annualTurnover: clientInfo.annualTurnover,
    numberOfEmployees: clientInfo.numberOfEmployees,
    measurementPeriodStart: clientInfo.measurementPeriodStart,
    measurementPeriodEnd: clientInfo.measurementPeriodEnd,
    beeCertificateNumber: clientInfo.beeCertificateNumber,
    beeCertificateExpiry: clientInfo.beeCertificateExpiry,
    beeCertificateLevel: clientInfo.beeCertificateLevel,
    verificationAgency: clientInfo.verificationAgency,
  };
}

/**
 * Transform Toolkit Client to ClientInformationData
 */
export function toolkitClientToClientInfo(client: Client): ClientInformationData {
  return {
    companyName: client.name || '',
    tradingName: client.tradingName || '',
    registrationNumber: client.registrationNumber || '',
    vatNumber: client.vatNumber || '',
    taxNumber: client.taxNumber || '',
    physicalAddress: client.physicalAddress || '',
    postalAddress: client.postalAddress || '',
    contactPerson: client.contactPerson || '',
    contactEmail: client.contactEmail || '',
    contactPhone: client.contactPhone || '',
    sectorCode: (client.sectorCode as any) || 'RCOGP',
    industry: client.industry || 'Other',
    eapProvince: client.eapProvince,
    annualTurnover: client.annualTurnover || client.revenue || 0,
    numberOfEmployees: client.numberOfEmployees || 0,
    financialYearEnd: client.financialYear || '',
    measurementPeriodStart: client.measurementPeriodStart || '',
    measurementPeriodEnd: client.measurementPeriodEnd || '',
    beeCertificateNumber: client.beeCertificateNumber || '',
    beeCertificateExpiry: client.beeCertificateExpiry || '',
    beeCertificateLevel: client.beeCertificateLevel,
    verificationAgency: client.verificationAgency || '',
  };
}

/**
 * Transform Toolkit data to FinancialsData
 */
export function toolkitClientToFinancials(client: Client): FinancialsData {
  const industry = client.industry || 'Other';
  const industryNorm = getIndustryNorm(industry);
  
  // Reconstruct financials from client data
  const totalRevenue = client.revenue || 0;
  const npat = client.npat || 0;
  const leviableAmount = client.leviableAmount || 0;
  
  // TMPS would need to come from procurement data
  // For now, estimate from revenue
  const tmpsInclusions = totalRevenue * 0.8; // Estimate
  const tmpsExclusions = 0; // Would need to be stored separately
  
  const currentMargin = totalRevenue > 0 ? (npat / totalRevenue) * 100 : 0;
  const quarterThreshold = industryNorm / 4;
  const isBelowQuarter = currentMargin < quarterThreshold;
  const deemedNpat = isBelowQuarter 
    ? totalRevenue * (industryNorm / 100) 
    : npat;
  
  return {
    totalRevenue,
    npat,
    leviableAmount,
    totalPayroll: leviableAmount / 0.8, // Reverse estimate
    tmpsInclusions,
    tmpsExclusions,
    industry,
    tmps: tmpsInclusions - tmpsExclusions,
    currentMargin,
    quarterThreshold,
    isBelowQuarter,
    deemedNpat,
    deemedNpatUsed: isBelowQuarter,
  };
}

/**
 * Get industry norm percentage
 */
function getIndustryNorm(industry: string): number {
  const norms: Record<string, number> = {
    'Retail': 4,
    'Manufacturing': 6,
    'IT Services': 10,
    'Financial Services': 15,
    'Construction': 4,
    'Agriculture': 6,
    'Mining': 12,
    'Transport': 5,
    'Hospitality': 8,
    'Healthcare': 10,
    'Education': 5,
    'Professional Services': 12,
    'Real Estate': 15,
    'Telecommunications': 12,
    'Energy': 15,
    'Generic': 6,
    'Other': 6,
  };
  return norms[industry] || 6;
}

// ============================================================================
// Store Sync
// ============================================================================

/**
 * Sync foundation data TO the Toolkit store
 * Call this when user updates foundation data in DocumentProcessor
 */
export function syncFoundationToStore(foundationData: FoundationData): void {
  const store = useBbeeStore.getState();
  
  // Transform to Toolkit format
  const clientData = clientInfoToToolkitClient(
    foundationData.clientInfo,
    foundationData.financials
  );
  
  // Update store with new client data (without saving to backend yet)
  // We use the store's internal state update methods
  const currentState = useBbeeStore.getState();
  
  // Merge with existing client data
  const mergedClient = {
    ...currentState.client,
    ...clientData,
  };
  
  // Update store state
  useBbeeStore.setState({
    client: mergedClient,
  });
  
  // Update financials via store method
  if (clientData.revenue !== undefined || clientData.npat !== undefined || clientData.leviableAmount !== undefined) {
    currentState.updateFinancials(
      clientData.revenue || 0,
      clientData.npat || 0,
      clientData.leviableAmount || 0,
      clientData.industryNorm
    );
  }
  
  // Update TMPS if available
  if (foundationData.financials.tmps > 0) {
    currentState.updateTMPS(foundationData.financials.tmps);
  }
  
  // Update settings (EAP province, industry)
  if (clientData.eapProvince || clientData.industry) {
    currentState.updateSettings(
      clientData.eapProvince || 'National',
      clientData.industry || 'Generic',
      clientData.measurementPeriodStart,
      clientData.measurementPeriodEnd
    );
  }
}

/**
 * Sync foundation data FROM the Toolkit store
 * Call this when loading an existing assessment
 */
export function syncFoundationFromStore(): FoundationData {
  const store = useBbeeStore.getState();
  const { client } = store;
  
  return {
    clientInfo: toolkitClientToClientInfo(client),
    financials: toolkitClientToFinancials(client),
  };
}

// ============================================================================
// API Calls
// ============================================================================

const API_BASE = '/api';

/**
 * Save foundation data to backend
 */
export async function saveFoundationData(
  request: FoundationSaveRequest
): Promise<FoundationSaveResponse> {
  try {
    const response = await fetch(`${API_BASE}/assessments/foundation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Failed to save foundation data:', error);
    return {
      success: false,
      assessmentId: '',
      clientId: '',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Save pillar data to backend
 */
export async function savePillarData(
  request: PillarsSaveRequest
): Promise<PillarsSaveResponse> {
  try {
    const response = await fetch(`${API_BASE}/assessments/pillars`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Failed to save pillar data:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Load assessment data from backend
 */
export async function loadAssessmentData(
  assessmentId: string
): Promise<AssessmentLoadResponse | null> {
  try {
    const response = await fetch(`${API_BASE}/assessments/${assessmentId}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Failed to load assessment data:', error);
    return null;
  }
}

/**
 * Auto-save foundation data (debounced)
 */
export function createAutoSaveFoundation(
  sessionId: string,
  delay: number = 2000
) {
  let timeoutId: NodeJS.Timeout | null = null;
  
  return (foundationData: FoundationData) => {
    // Sync to store immediately
    syncFoundationToStore(foundationData);
    
    // Debounce API call
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(async () => {
      await saveFoundationData({
        sessionId,
        clientInfo: foundationData.clientInfo,
        financials: foundationData.financials,
      });
    }, delay);
  };
}

// ============================================================================
// React Hook
// ============================================================================

import { useCallback, useEffect, useRef } from 'react';

/**
 * React hook for foundation data management
 */
export function useFoundationSync(sessionId: string) {
  const autoSaveRef = useRef(createAutoSaveFoundation(sessionId));
  
  /**
   * Save foundation data (debounced auto-save)
   */
  const saveFoundation = useCallback((data: FoundationData) => {
    autoSaveRef.current(data);
  }, []);
  
  /**
   * Load foundation data from store (for existing clients)
   */
  const loadFoundationFromStore = useCallback((): FoundationData => {
    return syncFoundationFromStore();
  }, []);
  
  /**
   * Sync to store immediately (for real-time updates)
   */
  const syncToStore = useCallback((data: FoundationData) => {
    syncFoundationToStore(data);
  }, []);
  
  /**
   * Create new client in backend
   */
  const createClient = useCallback(async (
    data: FoundationData
  ): Promise<FoundationSaveResponse> => {
    // First sync to store
    syncFoundationToStore(data);
    
    // Then save to backend
    return saveFoundationData({
      sessionId,
      clientInfo: data.clientInfo,
      financials: data.financials,
    });
  }, [sessionId]);
  
  return {
    saveFoundation,
    loadFoundationFromStore,
    syncToStore,
    createClient,
  };
}

// ============================================================================
// Unified Scorecard Population and Calculation
// ============================================================================

/**
 * Unified function to populate pillars and calculate scorecard.
 * 
 * This is the SINGLE entry point for all scorecard calculation paths:
 * - Upload flow: extracted entities -> pillar data -> populateAndScore
 * - Build flow: user input forms -> pillar data -> populateAndScore
 * - Toolkit flow: direct store edits -> _recalculateAll
 * 
 * @param input - Either BuildPillarsData from forms or extracted entities
 * @param foundation - Foundation data (client info + financials)
 * @param sectorCode - B-BBEE sector code (e.g., 'RCOGP', 'ICT')
 * @param scorecardType - 'Generic' | 'QSE' | 'EME'
 * @returns ScorecardResult or error with validation messages
 */
export interface PopulateAndScoreInput {
  /** Pillar data from forms or entity extraction */
  pillars: BuildPillarsData;
  /** Foundation data (client info + financials) */
  foundation: FoundationData;
  /** B-BBEE sector code */
  sectorCode: string;
  /** Scorecard type: Generic, QSE, or EME */
  scorecardType?: 'Generic' | 'QSE' | 'EME';
}

export interface PopulateAndScoreResult {
  success: boolean;
  scorecard?: ScorecardResult;
  client?: Client;
  error?: string;
  validationErrors?: string[];
  apiResult?: APIScorecardResult;
}

/**
 * Critical entities required for a valid scorecard.
 * If these are missing/empty, we reject scorecard generation.
 */
const CRITICAL_ENTITIES = [
  'total_revenue',
  'npat', // or deemed_npat
];

/**
 * Validate that minimum required data is present for scorecard generation.
 */
function validateCriticalEntities(
  foundation: FoundationData,
  pillars: BuildPillarsData
): string[] {
  const errors: string[] = [];
  
  // Check financials
  const financials = foundation.financials;
  const hasRevenue = (financials.totalRevenue || 0) > 0;
  const hasNpat = (financials.npat || 0) > 0 || (financials.deemedNpat || 0) > 0;
  
  if (!hasRevenue) {
    errors.push('Total Revenue is required for scorecard calculation');
  }
  if (!hasNpat) {
    errors.push('NPAT (or Deemed NPAT) is required for scorecard calculation');
  }
  
  // Check at least one ownership entity
  const ownership = pillars.ownership;
  const hasOwnershipData = 
    (ownership.shareholders?.length ?? 0) > 0 ||
    (ownership.ownershipScorePoints || 0) > 0 ||
    (ownership.ownershipScorePercent || 0) > 0;
  
  if (!hasOwnershipData) {
    errors.push('Ownership data is required (at least one ownership entity)');
  }
  
  return errors;
}

/**
 * Unified entry point for scorecard population and calculation.
 * 
 * This function:
 * 1. Validates critical entities are present
 * 2. Hydrates the Zustand store with pillar data (for real-time preview)
 * 3. POSTs to /api/calculate (UCS) for the authoritative scorecard
 * 4. Sets the store's scorecard from the UCS result
 * 5. Returns the ScorecardResult
 */
export async function populateAndScore(
  input: PopulateAndScoreInput
): Promise<PopulateAndScoreResult> {
  const { pillars, foundation, sectorCode, scorecardType = 'Generic' } = input;
  
  const validationErrors = validateCriticalEntities(foundation, pillars);
  if (validationErrors.length > 0) {
    return {
      success: false,
      error: 'Missing required data for scorecard calculation',
      validationErrors,
    };
  }
  
  try {
    const clientData = clientInfoToToolkitClient(
      foundation.clientInfo,
      foundation.financials
    );
    
    useBbeeStore.getState().startNewSession();
    
    const skillsWithYes = mergeYesIntoSkills(pillars.skills, pillars.yes);
    
    useBbeeStore.setState({
      isLoaded: true,
      client: clientData as any,
      ownership: pillars.ownership || useBbeeStore.getState().ownership,
      management: pillars.management || useBbeeStore.getState().management,
      skills: skillsWithYes || useBbeeStore.getState().skills,
      procurement: pillars.procurement || useBbeeStore.getState().procurement,
      esd: pillars.esd || useBbeeStore.getState().esd,
      sed: pillars.sed || useBbeeStore.getState().sed,
    });
    
    if (clientData.revenue !== undefined || clientData.npat !== undefined) {
      useBbeeStore.getState().updateFinancials(
        clientData.revenue || 0,
        clientData.npat || 0,
        clientData.leviableAmount || 0,
        clientData.industryNorm
      );
    }
    
    // Build entity arrays for the UCS API
    const fin = foundation.financials;
    const storeState = useBbeeStore.getState();
    
    const employees = (storeState.management?.employees || []).map(e => ({
      name: e.name,
      race: e.race,
      gender: e.gender,
      designation: e.designation,
      isDisabled: e.isDisabled,
      isForeign: e.isForeign,
    }));
    
    const shareholders = (storeState.ownership?.shareholders || []).map(s => ({
      name: s.name,
      blackOwnership: s.blackOwnership,
      blackWomenOwnership: s.blackWomenOwnership,
      shares: s.shares,
      shareValue: s.shareValue,
      yearsHeld: s.yearsHeld,
      isDesignatedGroup: s.isDesignatedGroup,
      blackNewEntrant: s.blackNewEntrant,
    }));
    
    const suppliers = (storeState.procurement?.suppliers || []).map(s => ({
      name: s.name,
      spend: s.spend,
      beeLevel: s.beeLevel,
      blackOwnership: s.blackOwnership,
      blackWomenOwnership: s.blackWomenOwnership,
      enterpriseType: s.enterpriseType,
      isDesignatedGroup: (s.designatedGroupOwnership ?? 0) > 0,
      isBlackOwned51: s.blackOwnership > 1 ? s.blackOwnership >= 51 : s.blackOwnership >= 0.51,
      isBlackWomanOwned30: s.blackWomenOwnership > 1 ? s.blackWomenOwnership >= 30 : s.blackWomenOwnership >= 0.30,
      isEME: s.enterpriseType === 'eme',
      isQSE: s.enterpriseType === 'qse',
      isForeignSupplier: s.isForeignSupplier,
    }));
    
    const categoryMap: Record<string, 'sd' | 'ed' | 'sed'> = {
      supplier_development: 'sd',
      enterprise_development: 'ed',
      socio_economic: 'sed',
    };
    const esdContributions = (storeState.esd?.contributions || []).map(c => ({
      beneficiary: c.beneficiary,
      type: c.type,
      amount: c.amount,
      category: categoryMap[c.category] || 'ed' as const,
    }));
    const sedContributions = (storeState.sed?.contributions || []).map(c => ({
      beneficiary: c.beneficiary,
      type: c.type,
      amount: c.amount,
      category: 'sed' as const,
    }));
    const contributions = [...esdContributions, ...sedContributions];
    
    const trainingPrograms = (storeState.skills?.trainingPrograms || []).map(tp => ({
      id: tp.id,
      name: tp.name,
      category: tp.category,
      cost: tp.cost || 0,
      isYesEmployee: tp.isYesEmployee || false,
      isAbsorbed: tp.isAbsorbed || false,
      race: tp.race,
      gender: tp.gender,
      isDisabled: tp.isDisabled || false,
    }));

    const financials = {
      revenue: fin.totalRevenue || clientData.revenue || 0,
      npat: fin.npat || clientData.npat || 0,
      leviableAmount: fin.leviableAmount || clientData.leviableAmount || 0,
      tmps: fin.tmps || storeState.procurement?.tmps || 0,
      headcount: employees.length,
    };
    
    // POST to UCS for the authoritative scorecard
    const response = await fetch(`${API_BASE}/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assessmentId: `populate-${Date.now()}`,
        sectorCode,
        scorecardType,
        entityValues: {},
        employees,
        shareholders,
        suppliers,
        contributions,
        trainingPrograms,
        financials,
      }),
    });
    
    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody.error || `UCS returned ${response.status}`);
    }
    
    const raw = await response.json();
    const apiResult: APIScorecardResult = raw.scorecard ?? raw;
    
    // Set the store's scorecard from the UCS result
    useBbeeStore.getState().setScorecardFromAPI(apiResult);
    
    return {
      success: true,
      scorecard: useBbeeStore.getState().scorecard,
      client: useBbeeStore.getState().client,
      apiResult,
    };
    
  } catch (error) {
    console.error('populateAndScore error:', error);
    return {
      success: false,
      error: `UCS calculation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Convenience function for upload flow:
 * Maps extracted entities to BuildPillarsData, then calls populateAndScore.
 */
export async function populateAndScoreFromEntities(
  entities: Record<string, any>,
  foundation: FoundationData,
  sectorCode: string,
  scorecardType?: 'Generic' | 'QSE' | 'EME'
): Promise<PopulateAndScoreResult> {
  // Map entities to BuildPillarsData format
  // This is a simplified mapping - the full mapping logic should be in entityManifest.ts
  const pillars: BuildPillarsData = {
    ownership: entities.ownership || {},
    management: entities.management || {},
    skills: entities.skills || {},
    procurement: entities.procurement || {},
    esd: entities.esd || {},
    sed: entities.sed || {},
    yes: entities.yes || {},
  };
  
  return populateAndScore({
    pillars,
    foundation,
    sectorCode,
    scorecardType,
  });
}

export default {
  syncFoundationToStore,
  syncFoundationFromStore,
  saveFoundationData,
  savePillarData,
  loadAssessmentData,
  createAutoSaveFoundation,
  useFoundationSync,
  clientInfoToToolkitClient,
  toolkitClientToClientInfo,
  toolkitClientToFinancials,
  inferEapProvinceFromAddress,
  mergeYesIntoSkills,
  populateAndScore,
  populateAndScoreFromEntities,
};
