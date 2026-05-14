/**
 * Transport QSE - demo dataset for Transport sector (4-pillar scorecard).
 *
 * Transport QSE has exactly 4 pillars at 25 points each:
 * - Skills Development (25 pts)
 * - Preferential Procurement (25 pts)
 * - Enterprise & Supplier Development (25 pts)
 * - Socio-Economic Development (25 pts)
 *
 * Ownership, Management Control, and YES Initiative are NOT included (0 points).
 */

import type { ClientInformationData } from '@/components/build/ClientInformationForm';
import type { FinancialsData } from '@/components/build/FinancialsForm';
import type { BuildPillarsData } from '@/components/build/BuildPillarsStep';
import type { FoundationData } from '@/components/build/FoundationStep';
import type { Employee } from '@toolkit/lib/types';

/** Transport QSE financials (realistic test data) */
export const TRANSPORT_NPAT = 5_000_000;
export const TRANSPORT_REVENUE = 25_000_000;
export const TRANSPORT_LEVIABLE = 250_000;
export const TRANSPORT_TMPS = 10_000_000;
export const TRANSPORT_HEADCOUNT = 15;

export const transportClientInfo: ClientInformationData = {
  companyName: 'Metro Logistics Transport (Pty) Ltd',
  tradingName: 'Metro Logistics',
  registrationNumber: '2018/987654/07',
  vatNumber: '4320987654',
  taxNumber: '9000987654',
  physicalAddress: '45 Transport Hub, Isando, Gauteng, 1600',
  postalAddress: 'PO Box 9876, Kempton Park, 1620',
  contactPerson: 'Sipho Nkosi',
  contactEmail: 'operations@metrologistics.co.za',
  contactPhone: '+27 11 987 6543',
  sectorCode: 'Transport QSE',
  industry: 'Transport',
  eapProvince: 'Gauteng',
  annualTurnover: TRANSPORT_REVENUE,
  numberOfEmployees: TRANSPORT_HEADCOUNT,
  financialYearEnd: '2026-02-28',
  measurementPeriodStart: '2025-03-01',
  measurementPeriodEnd: '2026-02-28',
  beeCertificateNumber: 'BEE-TRANSPORT-2026',
  beeCertificateExpiry: '2027-02-28',
  beeCertificateLevel: 6,
  verificationAgency: 'BEE Verification Services',
};

export const transportFinancials: FinancialsData = {
  totalRevenue: TRANSPORT_REVENUE,
  npat: TRANSPORT_NPAT,
  leviableAmount: TRANSPORT_LEVIABLE,
  totalPayroll: TRANSPORT_LEVIABLE / 0.01,
  tmpsInclusions: TRANSPORT_TMPS,
  tmpsExclusions: 0,
  industry: 'Transport',
  tmps: TRANSPORT_TMPS,
  currentMargin: (TRANSPORT_NPAT / TRANSPORT_REVENUE) * 100,
  quarterThreshold: 1,
  isBelowQuarter: false,
  deemedNpat: TRANSPORT_NPAT,
  deemedNpatUsed: false,
};

export const transportFoundation: FoundationData = {
  clientInfo: transportClientInfo,
  financials: transportFinancials,
};

/** Transport sector employees (15 for skills development calculations) */
export const transportEmployees: Employee[] = [
  { id: 'tr-1', name: 'Fleet Manager', gender: 'Male', race: 'African', designation: 'Executive Director', isDisabled: false, isForeign: false },
  { id: 'tr-2', name: 'Operations Director', gender: 'Female', race: 'African', designation: 'Executive Director', isDisabled: false, isForeign: false },
  { id: 'tr-3', name: 'Logistics Supervisor', gender: 'Male', race: 'Coloured', designation: 'Senior', isDisabled: false, isForeign: false },
  { id: 'tr-4', name: 'HR Manager', gender: 'Female', race: 'Indian', designation: 'Senior', isDisabled: false, isForeign: false },
  { id: 'tr-5', name: 'Senior Driver A', gender: 'Male', race: 'African', designation: 'Senior', isDisabled: false, isForeign: false },
  { id: 'tr-6', name: 'Senior Driver B', gender: 'Female', race: 'African', designation: 'Senior', isDisabled: false, isForeign: false },
  { id: 'tr-7', name: 'Dispatcher', gender: 'Male', race: 'White', designation: 'Middle', isDisabled: false, isForeign: false },
  { id: 'tr-8', name: 'Maintenance Lead', gender: 'Male', race: 'African', designation: 'Middle', isDisabled: false, isForeign: false },
  { id: 'tr-9', name: 'Driver C', gender: 'Female', race: 'African', designation: 'Middle', isDisabled: false, isForeign: false },
  { id: 'tr-10', name: 'Driver D', gender: 'Male', race: 'Coloured', designation: 'Junior', isDisabled: false, isForeign: false },
  { id: 'tr-11', name: 'Driver E', gender: 'Female', race: 'African', designation: 'Junior', isDisabled: false, isForeign: false },
  { id: 'tr-12', name: 'Admin Clerk', gender: 'Male', race: 'Indian', designation: 'Junior', isDisabled: false, isForeign: false },
  { id: 'tr-13', name: 'Warehouse Assistant', gender: 'Female', race: 'African', designation: 'Junior', isDisabled: false, isForeign: false },
  { id: 'tr-14', name: 'Loader A', gender: 'Male', race: 'White', designation: 'Junior', isDisabled: false, isForeign: false },
  { id: 'tr-15', name: 'Loader B', gender: 'Female', race: 'African', designation: 'Junior', isDisabled: false, isForeign: false },
];

export const transportManagement = {
  id: '',
  clientId: '',
  employees: transportEmployees,
};

/** Procurement suppliers for Transport sector */
const transportSuppliers = [
  {
    id: 'trans-eme-fuel',
    name: 'Fuel Supplier EME',
    beeLevel: 1 as const,
    enterpriseType: 'eme' as const,
    blackOwnership: 1,
    blackWomenOwnership: 0.5,
    youthOwnership: 0.2,
    disabledOwnership: 0,
    spend: 5_000_000,
    isEmpoweringSupplier: true,
    isSupplierDevRecipient: false,
    hasThreeYearContract: true,
  },
  {
    id: 'trans-qse-tyres',
    name: 'Tyre & Parts QSE',
    beeLevel: 2 as const,
    enterpriseType: 'qse' as const,
    blackOwnership: 0.75,
    blackWomenOwnership: 0.3,
    youthOwnership: 0.1,
    disabledOwnership: 0,
    spend: 3_500_000,
    isEmpoweringSupplier: true,
    isSupplierDevRecipient: false,
    hasThreeYearContract: true,
  },
  {
    id: 'trans-eme-maintenance',
    name: 'Maintenance Services EME',
    beeLevel: 1 as const,
    enterpriseType: 'eme' as const,
    blackOwnership: 1,
    blackWomenOwnership: 0.6,
    youthOwnership: 0.3,
    disabledOwnership: 0.1,
    spend: 1_500_000,
    isEmpoweringSupplier: true,
    isSupplierDevRecipient: true,
    hasThreeYearContract: false,
  },
];

/** ESD contributions for Transport sector (25 pts total) */
const transportEsdContributions = [
  {
    id: 'trans-sd-1',
    beneficiary: 'Transport Training Academy (EME)',
    description: 'Direct cost - supplier development',
    type: 'direct_cost' as const,
    amount: 400_000,
    category: 'supplier_development' as const,
    blackBenefitPercent: 100,
    transactionDate: '2025-06-15',
  },
  {
    id: 'trans-ed-1',
    beneficiary: 'Fleet Maintenance EME',
    description: 'Direct cost - enterprise development',
    type: 'direct_cost' as const,
    amount: 200_000,
    category: 'enterprise_development' as const,
    blackBenefitPercent: 100,
    transactionDate: '2025-08-20',
  },
  {
    id: 'trans-ed-2',
    beneficiary: 'Logistics Software EME',
    description: 'Second priority - enterprise development',
    type: 'second_priority' as const,
    amount: 100_000,
    category: 'enterprise_development' as const,
    blackBenefitPercent: 100,
    transactionDate: '2025-10-05',
  },
];

/** SED contributions for Transport sector (25 pts total) */
const transportSedContributions = [
  {
    id: 'trans-sed-1',
    beneficiary: 'Road Safety Awareness Campaign',
    description: 'Grant - community safety initiative',
    type: 'grant' as const,
    amount: 150_000,
    category: 'socio_economic' as const,
    blackBenefitPercent: 100,
    transactionDate: '2025-05-10',
  },
  {
    id: 'trans-sed-2',
    beneficiary: 'Driver Training for Youth',
    description: 'Grant - skills development for unemployed',
    type: 'grant' as const,
    amount: 100_000,
    category: 'socio_economic' as const,
    blackBenefitPercent: 100,
    transactionDate: '2025-07-15',
  },
];

/** Training programs for Skills Development (25 pts) */
const transportTrainingPrograms = [
  {
    id: 'trans-training-1',
    programName: 'Professional Driver Training',
    trainingType: 'internal' as const,
    category: 'category_a' as const,
    targetGroup: 'black_employees' as const,
    attendanceType: 'absorbed' as const,
    totalCost: 180_000,
    blackParticipants: 6,
    startDate: '2025-04-01',
    endDate: '2025-06-30',
    isForeign: false,
  },
  {
    id: 'trans-training-2',
    programName: 'Fleet Management Certification',
    trainingType: 'external' as const,
    category: 'category_b' as const,
    targetGroup: 'black_employees' as const,
    attendanceType: 'absorbed' as const,
    totalCost: 120_000,
    blackParticipants: 3,
    startDate: '2025-05-01',
    endDate: '2025-08-31',
    isForeign: false,
  },
  {
    id: 'trans-training-3',
    programName: 'Youth Driver Apprenticeship',
    trainingType: 'learnership' as const,
    category: 'category_a' as const,
    targetGroup: 'unemployed_black' as const,
    attendanceType: 'absorbed' as const,
    totalCost: 200_000,
    blackParticipants: 5,
    startDate: '2025-03-01',
    endDate: '2026-02-28',
    isForeign: false,
  },
];

/** Transport QSE pillars - only 4 applicable pillars */
export const transportPillars: Omit<BuildPillarsData, 'ownership' | 'management' | 'yes'> = {
  skills: {
    id: '',
    clientId: '',
    leviableAmount: TRANSPORT_LEVIABLE,
    trainingPrograms: transportTrainingPrograms as any,
    yesCandidatesCount: 5,
    yesAbsorbedCount: 3,
  },
  procurement: {
    id: '',
    clientId: '',
    tmps: TRANSPORT_TMPS,
    suppliers: transportSuppliers as any,
  },
  esd: {
    id: '',
    clientId: '',
    contributions: transportEsdContributions as any,
    graduationBonus: false,
    jobsCreatedBonus: false,
  },
  sed: {
    id: '',
    clientId: '',
    contributions: transportSedContributions as any,
  },
};

/** Transport QSE expected scores (4 pillars × 25 pts each = 100 pts max) */
export const transportExpectedScores = {
  skillsDevelopment: 18.5,
  procurement: 22.0,
  supplierDevelopment: 15.0,
  enterpriseDevelopment: 8.0,
  socioEconomicDevelopment: 20.0,
  total: 83.5,
  level: 4,
};

export function getTransportFoundationData(): FoundationData {
  return {
    clientInfo: { ...transportClientInfo },
    financials: { ...transportFinancials },
  };
}

/** Get Transport QSE pillar data - only 4 applicable pillars */
export function getTransportPillarData(): Partial<BuildPillarsData> {
  return {
    skills: {
      ...transportPillars.skills,
      trainingPrograms: transportPillars.skills.trainingPrograms.map(t => ({ ...t })),
    },
    procurement: {
      ...transportPillars.procurement,
      suppliers: transportPillars.procurement.suppliers.map(s => ({ ...s })),
    },
    esd: {
      ...transportPillars.esd,
      contributions: transportPillars.esd.contributions.map(c => ({ ...c })),
    },
    sed: {
      ...transportPillars.sed,
      contributions: transportPillars.sed.contributions.map(c => ({ ...c })),
    },
  };
}

export default {
  transportClientInfo,
  transportFinancials,
  transportFoundation,
  transportManagement,
  transportEmployees,
  transportPillars,
  transportExpectedScores,
  getTransportFoundationData,
  getTransportPillarData,
};
