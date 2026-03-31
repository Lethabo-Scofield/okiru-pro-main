/**
 * Silver Lake Trading 447 — demo dataset aligned to
 * `Lake Trading  Toolkit (RCOGP).xlsx` / SCORECARD_GROUND_TRUTH.md (§7).
 *
 * Expected (Excel): total ~63.56, Level 7, discounted Level 8.
 * Toolkit MC rounds to 11.75 (Excel 11.765) → combined total ~63.54; all other pillars match.
 */

import type { ClientInformationData } from '@/components/build/ClientInformationForm';
import type { FinancialsData } from '@/components/build/FinancialsForm';
import type { BuildPillarsData } from '@/components/build/BuildPillarsStep';
import type { FoundationData } from '@/components/build/FoundationStep';
import type { Employee } from '@toolkit/lib/types';

/** Verified financials (openpyxl extract, 2026-03-31) */
export const LAKE_NPAT = 33_862_998;
export const LAKE_REVENUE = 274_953_097;
export const LAKE_LEVIABLE = 2_069_572;
export const LAKE_TMPS = 133_730_345.99;
export const LAKE_HEADCOUNT = 12;

export const lakeTradingClientInfo: ClientInformationData = {
  companyName: 'Silver Lake Trading 447 (Pty) Ltd',
  tradingName: 'Silver Lake Trading',
  registrationNumber: '2015/123456/07',
  vatNumber: '4320123456',
  taxNumber: '9000123456',
  physicalAddress: 'Unit 5, Lakeview Office Park, Midrand, Gauteng, 1686',
  postalAddress: 'PO Box 1234, Midrand, 1686',
  contactPerson: 'Thandi Mokoena',
  contactEmail: 'finance@silverlaketrading.co.za',
  contactPhone: '+27 11 123 4567',
  sectorCode: 'RCOGP',
  industry: 'Retail',
  eapProvince: 'Gauteng',
  annualTurnover: LAKE_REVENUE,
  numberOfEmployees: LAKE_HEADCOUNT,
  financialYearEnd: '2026-02-28',
  measurementPeriodStart: '2025-03-01',
  measurementPeriodEnd: '2026-02-28',
  beeCertificateNumber: 'BEE-LAKE-2026',
  beeCertificateExpiry: '2027-02-28',
  beeCertificateLevel: 7,
  verificationAgency: 'Independent Verification Agency',
};

export const lakeTradingFinancials: FinancialsData = {
  totalRevenue: LAKE_REVENUE,
  npat: LAKE_NPAT,
  leviableAmount: LAKE_LEVIABLE,
  totalPayroll: LAKE_LEVIABLE / 0.8,
  tmpsInclusions: LAKE_TMPS,
  tmpsExclusions: 0,
  industry: 'Retail',
  tmps: LAKE_TMPS,
  currentMargin: (LAKE_NPAT / LAKE_REVENUE) * 100,
  quarterThreshold: 1,
  isBelowQuarter: false,
  deemedNpat: LAKE_NPAT,
  deemedNpatUsed: false,
};

export const lakeTradingFoundation: FoundationData = {
  clientInfo: lakeTradingClientInfo,
  financials: lakeTradingFinancials,
};

/** 100% black voting + new entrant → 25/25 (matches Excel ownership scorecard). */
export const lakeTradingOwnership = {
  id: '',
  clientId: '',
  shareholders: [
    {
      id: 'sh-lake-1',
      name: 'Lake Family Trust',
      shareholderId: 'IT2015/001',
      ownershipType: 'shareholder' as const,
      shares: 100,
      shareValue: 1,
      blackOwnership: 1,
      blackWomenOwnership: 0.5,
      votingRightsPercent: 1,
      economicInterestPercent: 1,
      isDesignatedGroup: false,
      blackNewEntrant: true,
    },
  ],
  companyValue: 50_000_000,
  outstandingDebt: 0,
  yearsHeld: 3,
  ownershipScorePoints: 0,
  ownershipScorePercent: 0,
  netValuePoints: 0,
  netValuePercent: 0,
};

/** Twelve employees; MC total ~11.75 under Gauteng EAP (Excel ~11.77). */
export const lakeTradingEmployees: Employee[] = [
  { id: 'lt-1', name: 'Director A', gender: 'Female', race: 'African', designation: 'Board', isDisabled: false, isForeign: false },
  { id: 'lt-2', name: 'Director B', gender: 'Male', race: 'White', designation: 'Board', isDisabled: false, isForeign: false },
  { id: 'lt-3', name: 'Exec A', gender: 'Male', race: 'African', designation: 'Executive Director', isDisabled: false, isForeign: false },
  { id: 'lt-4', name: 'Exec B', gender: 'Female', race: 'African', designation: 'Executive Director', isDisabled: false, isForeign: false },
  { id: 'lt-5', name: 'OEM A', gender: 'Male', race: 'White', designation: 'Other Executive Management', isDisabled: false, isForeign: false },
  { id: 'lt-6', name: 'Sen A', gender: 'Male', race: 'African', designation: 'Senior', isDisabled: false, isForeign: false },
  { id: 'lt-7', name: 'Sen B', gender: 'Female', race: 'White', designation: 'Senior', isDisabled: false, isForeign: false },
  { id: 'lt-8', name: 'Mid A', gender: 'Female', race: 'African', designation: 'Middle', isDisabled: false, isForeign: false },
  { id: 'lt-9', name: 'Mid B', gender: 'Male', race: 'Indian', designation: 'Middle', isDisabled: false, isForeign: false },
  { id: 'lt-10', name: 'Jun A', gender: 'Male', race: 'African', designation: 'Junior', isDisabled: false, isForeign: false },
  { id: 'lt-11', name: 'Jun B', gender: 'Female', race: 'African', designation: 'Junior', isDisabled: false, isForeign: false },
  { id: 'lt-12', name: 'Jun C', gender: 'Male', race: 'White', designation: 'Junior', isDisabled: false, isForeign: false },
];

export const lakeTradingManagement = {
  id: '',
  clientId: '',
  employees: lakeTradingEmployees,
};

const lakeTradingSuppliers = [
  {
    id: 'lake-eme-bulk',
    name: 'EME supplier (bulk TMPS)',
    beeLevel: 1 as const,
    enterpriseType: 'eme' as const,
    blackOwnership: 1,
    blackWomenOwnership: 0,
    youthOwnership: 0,
    disabledOwnership: 0,
    spend: 133_696_348.453,
    isEmpoweringSupplier: true,
    isSupplierDevRecipient: false,
    hasThreeYearContract: false,
  },
  {
    id: 'lake-qse-small',
    name: 'QSE supplier',
    beeLevel: 4 as const,
    enterpriseType: 'qse' as const,
    blackOwnership: 1,
    blackWomenOwnership: 0,
    youthOwnership: 0,
    disabledOwnership: 0,
    spend: 2_233_217.8945,
    isEmpoweringSupplier: true,
    isSupplierDevRecipient: false,
    hasThreeYearContract: false,
  },
];

const lakeTradingEsdContributions = [
  {
    id: 'lake-sd-1',
    beneficiary: 'SD beneficiary (EME)',
    description: 'Direct cost — supplier development',
    type: 'direct_cost' as const,
    amount: 250_000,
    category: 'supplier_development' as const,
    blackBenefitPercent: 100,
    transactionDate: '2025-09-01',
  },
  {
    id: 'lake-ed-1',
    beneficiary: 'ED beneficiary (EME)',
    description: 'Direct cost — enterprise development',
    type: 'direct_cost' as const,
    amount: 160_000,
    category: 'enterprise_development' as const,
    blackBenefitPercent: 100,
    transactionDate: '2025-09-01',
  },
];

const lakeTradingSedContributions = [
  {
    id: 'lake-sed-1',
    beneficiary: 'Operation Smile South Africa',
    description: 'Grant',
    type: 'grant' as const,
    amount: 27_500,
    category: 'socio_economic' as const,
    blackBenefitPercent: 100,
    transactionDate: '2025-06-01',
  },
];

export const lakeTradingPillars: BuildPillarsData = {
  ownership: lakeTradingOwnership,
  management: lakeTradingManagement,
  employmentEquity: lakeTradingManagement,
  skills: {
    id: '',
    clientId: '',
    leviableAmount: LAKE_LEVIABLE,
    trainingPrograms: [],
    yesCandidatesCount: 0,
    yesAbsorbedCount: 0,
  },
  procurement: {
    id: '',
    clientId: '',
    tmps: LAKE_TMPS,
    suppliers: lakeTradingSuppliers as any,
    graduationBonus: false,
    jobsCreatedBonus: false,
  },
  esd: {
    id: '',
    clientId: '',
    contributions: lakeTradingEsdContributions as any,
    graduationBonus: false,
    jobsCreatedBonus: false,
  },
  sed: {
    id: '',
    clientId: '',
    contributions: lakeTradingSedContributions as any,
  },
  yes: {
    id: '',
    clientId: '',
    totalEmployees: LAKE_HEADCOUNT,
    yesHeadcountTarget: 1,
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

/** SCORECARD_GROUND_TRUTH.md §7 (MC shows Excel value; live Toolkit MC may differ by ~0.02). */
export const lakeTradingExpectedScores = {
  ownership: 25,
  managementControl: 11.77,
  skillsDevelopment: 0,
  procurement: 20.33,
  supplierDevelopment: 3.69,
  enterpriseDevelopment: 2.36,
  socioEconomicDevelopment: 0.41,
  total: 63.56,
  level: 7,
  discountedLevel: 8,
};

export function getLakeTradingFoundationData(): FoundationData {
  return {
    clientInfo: { ...lakeTradingClientInfo },
    financials: { ...lakeTradingFinancials },
  };
}

export function getLakeTradingPillarData(): BuildPillarsData {
  return {
    ownership: {
      ...lakeTradingOwnership,
      shareholders: lakeTradingOwnership.shareholders.map(s => ({ ...s })),
    },
    management: {
      ...lakeTradingManagement,
      employees: lakeTradingManagement.employees.map(e => ({ ...e })),
    },
    employmentEquity: {
      ...lakeTradingManagement,
      employees: lakeTradingManagement.employees.map(e => ({ ...e })),
    },
    skills: { ...lakeTradingPillars.skills, trainingPrograms: [] },
    procurement: {
      ...lakeTradingPillars.procurement,
      suppliers: lakeTradingPillars.procurement.suppliers.map(s => ({ ...s })),
    },
    esd: {
      ...lakeTradingPillars.esd,
      contributions: lakeTradingPillars.esd.contributions.map(c => ({ ...c })),
    },
    sed: {
      ...lakeTradingPillars.sed,
      contributions: lakeTradingPillars.sed.contributions.map(c => ({ ...c })),
    },
    yes: { ...lakeTradingPillars.yes, candidates: [] },
  };
}

export default {
  lakeTradingClientInfo,
  lakeTradingFinancials,
  lakeTradingFoundation,
  lakeTradingOwnership,
  lakeTradingManagement,
  lakeTradingEmployees,
  lakeTradingPillars,
  lakeTradingExpectedScores,
  getLakeTradingFoundationData,
  getLakeTradingPillarData,
};
