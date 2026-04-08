import type { LLMExtractionResult } from './extraction/llmExtractor.js';
import type {
  ParseResult,
  ParsedShareholder,
  ParsedEmployee,
  ParsedTrainingProgram,
  ParsedSupplier,
  ParsedContribution,
} from './excelParser.js';
import { entityResultsToParseResult } from './extraction/entityToParseResult.js';
import { buildPipelineResult } from './buildResult.js';
import type { PipelineResult } from './types.js';

export interface ToolkitFoundationData {
  clientInfo: {
    companyName: string;
    tradingName?: string;
    registrationNumber: string;
    vatNumber?: string;
    taxNumber?: string;
    physicalAddress: string;
    postalAddress?: string;
    contactPerson: string;
    contactEmail: string;
    contactPhone: string;
    sectorCode: string;
    industry: string;
    eapProvince?: string;
    annualTurnover: number;
    numberOfEmployees: number;
    financialYearEnd: string;
    measurementPeriodStart?: string;
    measurementPeriodEnd?: string;
    beeCertificateNumber?: string;
    beeCertificateExpiry?: string;
    beeCertificateLevel?: number;
    verificationAgency?: string;
  };
  financials: {
    totalRevenue: number;
    npat: number;
    leviableAmount: number;
    totalPayroll?: number;
    tmpsInclusions: number;
    tmpsExclusions: number;
    industry: string;
    tmps: number;
    currentMargin: number;
    quarterThreshold: number;
    isBelowQuarter: boolean;
    deemedNpat: number;
    deemedNpatUsed: boolean;
  };
}

export interface ToolkitPillarData {
  ownership: {
    id: string;
    clientId: string;
    shareholders: Array<{
      id: string;
      name: string;
      shareholderId?: string;
      ownershipType: 'shareholder';
      shares: number;
      shareValue: number;
      blackOwnership: number;
      blackWomenOwnership: number;
      votingRightsPercent: number;
      economicInterestPercent: number;
      isDesignatedGroup: boolean;
      blackNewEntrant: boolean;
    }>;
    companyValue: number;
    outstandingDebt: number;
    yearsHeld: number;
    ownershipScorePoints: number;
    ownershipScorePercent: number;
    netValuePoints: number;
    netValuePercent: number;
  };
  management: {
    id: string;
    clientId: string;
    employees: Array<{
      id: string;
      name: string;
      gender: string;
      race: string;
      designation: string;
      isDisabled: boolean;
      isForeign: boolean;
    }>;
  };
  skills: {
    id: string;
    clientId: string;
    leviableAmount: number;
    trainingPrograms: any[];
    yesCandidatesCount: number;
    yesAbsorbedCount: number;
  };
  procurement: {
    id: string;
    clientId: string;
    tmps: number;
    suppliers: Array<{
      id: string;
      name: string;
      beeLevel: number;
      enterpriseType: 'generic' | 'qse' | 'eme';
      blackOwnership: number;
      blackWomenOwnership: number;
      youthOwnership: number;
      disabledOwnership: number;
      spend: number;
      isEmpoweringSupplier: boolean;
      isSupplierDevRecipient: boolean;
      hasThreeYearContract: boolean;
    }>;
  };
  esd: {
    id: string;
    clientId: string;
    contributions: Array<{
      id: string;
      beneficiary: string;
      description: string;
      type: string;
      amount: number;
      category: string;
      blackBenefitPercent: number;
      transactionDate: string;
    }>;
    graduationBonus: boolean;
    jobsCreatedBonus: boolean;
  };
  sed: {
    id: string;
    clientId: string;
    contributions: Array<{
      id: string;
      beneficiary: string;
      description: string;
      type: string;
      amount: number;
      category: string;
      blackBenefitPercent: number;
      transactionDate: string;
    }>;
  };
  yes: {
    id: string;
    clientId: string;
    totalEmployees: number;
    yesHeadcountTarget: number;
    candidates: any[];
    yesYouthEnrolled: number;
    yesBlackYouthCount: number;
    yesBlackYouthPercentage: number;
    yesAbsorbedCount: number;
    yesAbsorptionRate: number;
    totalYesCost: number;
    yesCostPerCandidate: number;
    yesTierAchieved: string;
    yesBeeLevelIncrease: number;
    qualifiesForLevelUplift: boolean;
  };
}

export interface MappedExtractionData {
  foundation: ToolkitFoundationData;
  pillars: ToolkitPillarData;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ExtractionPipelineResult {
  success: boolean;
  scorecard?: PipelineResult;
  mapped?: MappedExtractionData;
  validation?: ValidationResult;
  errors: string[];
}

const REQUIRED_FINANCIAL_FIELDS = ['revenue', 'npat', 'leviableAmount'] as const;

function getIndustryNorm(industry: string): number {
  const norms: Record<string, number> = {
    'Retail': 4, 'Manufacturing': 6, 'IT Services': 10,
    'Financial Services': 15, 'Construction': 4, 'Agriculture': 6,
    'Mining': 12, 'Transport': 5, 'Hospitality': 8,
    'Healthcare': 10, 'Education': 5, 'Professional Services': 12,
    'Real Estate': 15, 'Telecommunications': 12, 'Energy': 15,
    'Generic': 6, 'Other': 6,
  };
  return norms[industry] || 6;
}

function inferEapProvinceFromAddress(address: string): string {
  const a = (address || '').toLowerCase();
  if (/gauteng|johannesburg|pretoria|midrand|sandton/i.test(a)) return 'Gauteng';
  if (/kwazulu|kzn|durban|pietermaritzburg/i.test(a)) return 'KZN';
  if (/western cape|cape town|stellenbosch/i.test(a)) return 'Western Cape';
  if (/eastern cape|gqeberha|port elizabeth|east london/i.test(a)) return 'Eastern Cape';
  return 'National';
}

const STABLE_DATE = '1970-01-01';

export function mapExtractedEntitiesToToolkitInput(
  parseResult: ParseResult,
): MappedExtractionData {
  const client = parseResult.client;
  const revenue = client.revenue || 0;
  const npat = client.npat || 0;
  const leviableAmount = client.leviableAmount || 0;
  const tmps = client.tmps || 0;
  const industry = client.industrySector || 'Other';
  const industryNorm = getIndustryNorm(industry);

  const currentMargin = revenue > 0 ? (npat / revenue) * 100 : 0;
  const quarterThreshold = industryNorm / 4;
  const isBelowQuarter = currentMargin < quarterThreshold;
  const deemedNpat = isBelowQuarter ? revenue * (industryNorm / 100) : npat;

  const foundation: ToolkitFoundationData = {
    clientInfo: {
      companyName: client.name || '',
      registrationNumber: client.registrationNumber || '',
      physicalAddress: client.address || '',
      contactPerson: '',
      contactEmail: '',
      contactPhone: '',
      sectorCode: client.applicableScorecard || 'RCOGP',
      industry,
      eapProvince: inferEapProvinceFromAddress(client.address || ''),
      annualTurnover: revenue,
      numberOfEmployees: parseResult.employees.length,
      financialYearEnd: client.financialYear || '',
      vatNumber: client.vatNumber,
      tradingName: client.tradeName,
    },
    financials: {
      totalRevenue: revenue,
      npat,
      leviableAmount,
      tmpsInclusions: client.tmpsInclusions || tmps,
      tmpsExclusions: client.tmpsExclusions || 0,
      industry,
      tmps,
      currentMargin,
      quarterThreshold,
      isBelowQuarter,
      deemedNpat,
      deemedNpatUsed: isBelowQuarter,
    },
  };

  const shareholders = parseResult.shareholders.map((s, i) => ({
    id: `ext-sh-${i}`,
    name: s.name,
    ownershipType: 'shareholder' as const,
    shares: s.shares ?? 0,
    shareValue: s.shareValue ?? 0,
    blackOwnership: s.blackOwnership,
    blackWomenOwnership: s.blackWomenOwnership,
    votingRightsPercent: s.shares ?? 0,
    economicInterestPercent: s.shares ?? 0,
    isDesignatedGroup: false,
    blackNewEntrant: false,
  }));

  const employees = parseResult.employees.map((e, i) => ({
    id: `ext-emp-${i}`,
    name: e.name,
    gender: e.gender,
    race: e.race,
    designation: e.designation,
    isDisabled: e.isDisabled,
    isForeign: false,
  }));

  const suppliers = parseResult.suppliers.map((s, i) => ({
    id: `ext-sup-${i}`,
    name: s.name,
    beeLevel: s.beeLevel as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8,
    enterpriseType: (s.enterpriseType || 'generic') as 'generic' | 'qse' | 'eme',
    blackOwnership: s.blackOwnership,
    blackWomenOwnership: s.blackWomenOwnership ?? 0,
    youthOwnership: 0,
    disabledOwnership: 0,
    spend: s.spend,
    isEmpoweringSupplier: s.beeLevel >= 1 && s.beeLevel <= 4,
    isSupplierDevRecipient: false,
    hasThreeYearContract: false,
  }));

  const esdContributions = parseResult.esdContributions.map((c, i) => ({
    id: `ext-esd-${i}`,
    beneficiary: c.beneficiary,
    description: c.type,
    type: 'direct_cost' as const,
    amount: c.amount,
    category: c.category.toLowerCase().includes('enterprise')
      ? 'enterprise_development'
      : 'supplier_development',
    blackBenefitPercent: 100,
    transactionDate: STABLE_DATE,
  }));

  const sedContributions = parseResult.sedContributions.map((c, i) => ({
    id: `ext-sed-${i}`,
    beneficiary: c.beneficiary,
    description: c.type,
    type: 'grant' as const,
    amount: c.amount,
    category: 'socio_economic' as const,
    blackBenefitPercent: 100,
    transactionDate: STABLE_DATE,
  }));

  const pillars: ToolkitPillarData = {
    ownership: {
      id: '',
      clientId: '',
      shareholders,
      companyValue: 0,
      outstandingDebt: 0,
      yearsHeld: 0,
      ownershipScorePoints: 0,
      ownershipScorePercent: 0,
      netValuePoints: 0,
      netValuePercent: 0,
    },
    management: {
      id: '',
      clientId: '',
      employees,
    },
    skills: {
      id: '',
      clientId: '',
      leviableAmount,
      trainingPrograms: parseResult.trainingPrograms.map((tp, i) => ({
        id: `ext-tp-${i}`,
        programName: tp.name,
        categoryCode: 'A',
        learnerName: tp.learnerName || tp.name,
        gender: 'Male',
        race: tp.isBlack ? 'African' : 'White',
        isBlack: tp.isBlack,
        isDisabled: tp.isDisabled ?? false,
        isForeign: false,
        employmentStatus: tp.isEmployed ? 'Permanent' : 'Unemployed',
        isYesEmployee: false,
        isCompleted: true,
        isAbsorbed: tp.isAbsorbed ?? false,
        transactionDate: STABLE_DATE,
        courseCost: tp.cost,
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
        cost: tp.cost,
        get totalCost() { return tp.cost; },
      })),
      yesCandidatesCount: 0,
      yesAbsorbedCount: 0,
    },
    procurement: {
      id: '',
      clientId: '',
      tmps,
      suppliers,
    },
    esd: {
      id: '',
      clientId: '',
      contributions: esdContributions,
      graduationBonus: false,
      jobsCreatedBonus: false,
    },
    sed: {
      id: '',
      clientId: '',
      contributions: sedContributions,
    },
    yes: {
      id: '',
      clientId: '',
      totalEmployees: parseResult.employees.length,
      yesHeadcountTarget: 0,
      candidates: [],
      yesYouthEnrolled: 0,
      yesBlackYouthCount: 0,
      yesBlackYouthPercentage: 0,
      yesAbsorbedCount: 0,
      yesAbsorptionRate: 0,
      totalYesCost: 0,
      yesCostPerCandidate: 0,
      yesTierAchieved: 'None',
      yesBeeLevelIncrease: 0,
      qualifiesForLevelUplift: false,
    },
  };

  return { foundation, pillars };
}

export function validateMinimumFields(mapped: MappedExtractionData): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const fin = mapped.foundation.financials;

  if (!fin.totalRevenue || fin.totalRevenue <= 0) {
    errors.push('Missing or invalid revenue (totalRevenue must be > 0)');
  }
  if (fin.npat === undefined || fin.npat === null || fin.npat === 0) {
    errors.push('Missing or invalid NPAT (must be non-zero)');
  }
  if (!fin.leviableAmount || fin.leviableAmount <= 0) {
    errors.push('Missing or invalid leviable amount (must be > 0)');
  }

  const ci = mapped.foundation.clientInfo;
  if (!ci.companyName || ci.companyName.trim() === '') {
    errors.push('Missing company name');
  }

  if (mapped.pillars.ownership.shareholders.length === 0) {
    warnings.push('No shareholders extracted — ownership score will be 0');
  }
  if (mapped.pillars.management.employees.length === 0) {
    warnings.push('No employees extracted — management control score will be 0');
  }
  if (mapped.pillars.procurement.suppliers.length === 0) {
    warnings.push('No suppliers extracted — procurement score will be 0');
  }

  if (fin.tmps <= 0 && mapped.pillars.procurement.suppliers.length > 0) {
    warnings.push('TMPS is 0 but suppliers were found — procurement ratios will be invalid');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function runExtractionPipeline(
  entities: LLMExtractionResult[],
  opts?: { clientName?: string; industrySector?: string; applicableScorecard?: string },
): ExtractionPipelineResult {
  const parseResult = entityResultsToParseResult(entities, opts);

  const mapped = mapExtractedEntitiesToToolkitInput(parseResult);

  const validation = validateMinimumFields(mapped);
  if (!validation.valid) {
    return {
      success: false,
      mapped,
      validation,
      errors: validation.errors,
    };
  }

  const scorecard = buildPipelineResult(parseResult, 'extraction-pipeline');

  return {
    success: true,
    scorecard,
    mapped,
    validation,
    errors: [],
  };
}

export function runExtractionPipelineFromParseResult(
  parseResult: ParseResult,
): ExtractionPipelineResult {
  const mapped = mapExtractedEntitiesToToolkitInput(parseResult);

  const validation = validateMinimumFields(mapped);
  if (!validation.valid) {
    return {
      success: false,
      mapped,
      validation,
      errors: validation.errors,
    };
  }

  const scorecard = buildPipelineResult(parseResult, 'extraction-pipeline');

  return {
    success: true,
    scorecard,
    mapped,
    validation,
    errors: [],
  };
}
