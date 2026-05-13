/**
 * Toolkit upload helpers and step fragments for DocumentProcessor (integrated flow).
 *
 * The old nested stepper was removed — DocumentProcessor owns global navigation.
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  FileSpreadsheet,
  FileText,
  File,
  FileImage,
  Upload,
  Download,
  Loader2,
  AlertCircle,
  CheckCircle2,
  X,
  Building2,
  Users,
  GraduationCap,
  ShoppingCart,
  Handshake,
  Heart,
  Check,
  Wand2,
} from 'lucide-react';
import { cn } from '@toolkit/lib/utils';
import type { FoundationData } from '@/components/build/FoundationStep';
import type { BuildPillarsData } from '@/components/build/BuildPillarsStep';
import { EMPTY_CLIENT_INFO } from '@/components/build/ClientInformationForm';
import { EMPTY_FINANCIALS } from '@/components/build/FinancialsForm';

export type TemplateId = 'standard' | 'ownership' | 'employment_equity' | 'full_export' | 'ict_sector_pack';

export interface ToolkitTemplateCard {
  id: TemplateId;
  name: string;
  description: string;
  icon: React.ElementType;
  pillars: string[];
  expectedColumns: string[];
  color: string;
  /** When set, template applies only to these B-BBEE sector codes */
  sectorCodes?: string[];
}

export const TOOLKIT_TEMPLATES: ToolkitTemplateCard[] = [
  {
    id: 'standard',
    name: 'Standard B-BBEE Toolkit',
    description: 'Generic toolkit Excel layout used by most verification agencies.',
    icon: FileSpreadsheet,
    pillars: ['Client Info', 'Financials', 'Ownership', 'Management', 'Skills', 'Procurement', 'ESD', 'SED'],
    expectedColumns: [
      'Company Name',
      'Registration No',
      'Revenue',
      'NPAT',
      'TMPS',
      'Shareholder Name',
      'Race',
      'Gender',
      '% Shareholding',
    ],
    color: '#5e9bff',
  },
  {
    id: 'ownership',
    name: 'Ownership Schedule',
    description: 'Dedicated ownership register with shareholder demographics.',
    icon: Building2,
    pillars: ['Ownership'],
    expectedColumns: [
      'Shareholder Name',
      '% Shareholding',
      'Race',
      'Gender',
      'Voting Rights %',
      'Economic Interest %',
      'Type (Individual/Entity)',
    ],
    color: '#a78bfa',
  },
  {
    id: 'employment_equity',
    name: 'Employment Equity Report',
    description: 'EEA2 / EE workbook — race, gender, occupational levels.',
    icon: Users,
    pillars: ['Management Control', 'Employment Equity'],
    expectedColumns: ['Employee Name', 'Race', 'Gender', 'Occupational Level', 'Disabled (Y/N)', 'Province'],
    color: '#34d399',
  },
  {
    id: 'ict_sector_pack',
    name: 'ICT Sector Workbook',
    description: 'Layout aligned with the ICT Sector Code pillar grouping.',
    icon: FileSpreadsheet,
    sectorCodes: ['ICT'],
    pillars: ['Client Info', 'Financials', 'Ownership', 'Management', 'Skills', 'Procurement'],
    expectedColumns: ['Company Name', 'ICT Services Revenue', 'TMPS', 'NPAT', 'Supplier Name', 'B-BBEE Level', 'Spend'],
    color: '#38bdf8',
  },
  {
    id: 'full_export',
    name: 'Full Scorecard Export',
    description: 'Complete scorecard-style export including YES and extended pillars.',
    icon: File,
    pillars: ['Client Info', 'Financials', 'Ownership', 'Management', 'Skills', 'Procurement', 'ESD', 'SED', 'YES'],
    expectedColumns: ['All standard B-BBEE fields across all pillars and worksheets'],
    color: '#f59e0b',
  },
];

export function filterTemplatesForSector(sectorCode: string, list: ToolkitTemplateCard[] = TOOLKIT_TEMPLATES): ToolkitTemplateCard[] {
  const code = (sectorCode || '').trim().toUpperCase();
  return list.filter((t) => {
    if (!t.sectorCodes?.length) return true;
    return t.sectorCodes.map((s) => s.toUpperCase()).includes(code);
  });
}

/** @deprecated Prefer filterTemplatesForSector */
export function getToolkitTemplateDefinition(id: TemplateId | null): ToolkitTemplateCard | undefined {
  if (!id) return undefined;
  return TOOLKIT_TEMPLATES.find((t) => t.id === id);
}

const PILLAR_REQUIREMENTS: Record<string, { required: string[]; examples: string }[]> = {
  'Client Info': [
    {
      required: ['Company Name', 'Registration Number', 'VAT Number', 'Physical Address', 'Contact Person', 'Contact Email', 'Contact Phone', 'Financial Year End', 'Industry / Sector'],
      examples: 'ABC (Pty) Ltd, 2020/123456/07, 1234567890, 123 Main St...',
    },
  ],
  Financials: [
    {
      required: ['Total Revenue / Turnover', 'NPAT (Net Profit After Tax)', 'Leviable Amount', 'TMPS (Total Measurable Procurement Spend)'],
      examples: 'R 50 000 000, R 3 500 000, R 250 000, R 20 000 000',
    },
  ],
  Ownership: [
    {
      required: ['Shareholder Name', '% Shareholding', 'Voting Rights %', 'Economic Interest %', 'Race', 'Gender', 'Owner Type'],
      examples: 'John Smith, 30%, African, Male, Individual',
    },
  ],
  'Management Control': [
    {
      required: ['Employee Name', 'Race', 'Gender', 'Designation / Level', 'Disabled (Y/N)'],
      examples: 'Jane Dube, African, Female, Board Director, No',
    },
  ],
  Skills: [
    {
      required: ['Training Programme Name', 'Training Category', 'Race', 'Gender', 'Total Cost', 'Start Date', 'End Date'],
      examples: 'Python Training, Cat A, African, Female, R 50 000',
    },
  ],
  Procurement: [
    {
      required: ['Supplier Name', 'B-BBEE Level', 'Enterprise Type (EME/QSE/Generic)', 'Total Spend', 'Black Ownership %'],
      examples: 'Zulu Supplies, Level 1, EME, R 2 000 000, 100%',
    },
  ],
  ESD: [
    {
      required: ['Beneficiary Name', 'Category (SD/ED)', 'Type (Direct Cost/Loan/Grant)', 'Amount', 'Black Benefit %', 'Date'],
      examples: 'Township Enterprise, SD, Direct Cost, R 200 000, 100%',
    },
  ],
  SED: [
    {
      required: ['Beneficiary / Project Name', 'Contribution Type', 'Amount', 'Black Benefit %', 'Date'],
      examples: 'Community School, Grant, R 100 000, 100%, 2025-06-01',
    },
  ],
};

function pillarVisibleForScopes(templatePillarLabel: string, scopes: string[] | null | undefined): boolean {
  if (!scopes?.length) return true;
  const labelKey = templatePillarLabel.toLowerCase().replace(/\s+/g, '');
  return scopes.some((scope) => {
    const sn = scope.toLowerCase().replace(/\s+/g, '');
    if (sn === 'employmentequity' && (labelKey.includes('employment') || labelKey.includes('management'))) return true;
    return sn === labelKey || labelKey.includes(sn) || sn.includes(labelKey);
  });
}

/**
 * Shape of the JSON returned by POST /api/import/excel (maps 1-to-1 with
 * the API's PipelineResult type).  Field names here MUST match what
 * `buildPipelineResult` actually outputs — do NOT rely on legacy names.
 */
export interface ExtractionApiResult {
  status: 'success' | 'partial_success' | 'partial' | 'failed';
  client: {
    name?: string;
    tradeName?: string;
    address?: string;
    registrationNumber?: string;
    vatNumber?: string;
    financialYearEnd?: string;
    industrySector?: string;
    applicableScorecard?: string;
    applicableCodes?: string;
    certificateNumber?: string;
  };
  financials: {
    revenue?: number;
    npat?: number;
    payroll?: number;
    leviableAmount?: number;
    tmpsInclusions?: number;
    tmpsExclusions?: number;
    tmps?: number;
    deemedNpat?: number;
    deemedNpatUsed?: boolean;
    industryNormUsed?: number;
  };
  ownership: {
    blackOwnershipPercent?: number;
    blackFemaleOwnershipPercent?: number;
    calculatedPoints?: number;
    subMinimumMet?: boolean;
    shareholders?: Array<{
      name?: string;
      /** Black-ownership percent (0–100), already converted by the API. */
      boPercent?: number;
      /** Black-women-ownership percent (0–100), already converted by the API. */
      bwoPercent?: number;
      shares?: number;
      shareValue?: number;
    }>;
  };
  managementControl: {
    calculatedPoints?: number;
    employees?: Array<{
      name?: string;
      gender?: string;
      race?: string;
      designation?: string;
      /** API field name is `disabled` (not `isDisabled`). */
      disabled?: boolean;
    }>;
  };
  skillsDevelopment: {
    leviableAmount?: number;
    calculatedPoints?: number;
    trainings?: Array<{
      /** API field name is `name` (not `programName`). */
      name?: string;
      category?: string;
      /** API field name is `cost` (not `totalCost`). */
      cost?: number;
      /** API field name is `isBlack` (boolean, not `blackParticipants` number). */
      isBlack?: boolean;
      isEmployed?: boolean;
    }>;
  };
  preferentialProcurement: {
    tmps?: number;
    calculatedPoints?: number;
    suppliers?: Array<{
      /** API field name is `supplierName` (not `name`). */
      supplierName?: string;
      /** API field name is `level` (not `beeLevel`). */
      level?: number;
      spend?: number;
      /** Percent (0–100) as returned by the API. */
      blackOwnership?: number;
    }>;
  };
  enterpriseSupplierDevelopment: {
    calculatedPoints?: number;
    totalContributions?: number;
    esdList?: Array<{
      beneficiary?: string;
      description?: string;
      type?: string;
      amount?: number;
      category?: string;
      blackBenefitPercent?: number;
      transactionDate?: string;
    }>;
  };
  socioEconomicDevelopment: {
    calculatedPoints?: number;
    totalSpend?: number;
    sedList?: Array<{
      beneficiary?: string;
      description?: string;
      type?: string;
      amount?: number;
      blackBenefitPercent?: number;
      transactionDate?: string;
    }>;
  };
  extractionSummary?: {
    sheetsParsed?: number;
    sheetsTotal?: number;
    entitiesExtracted?: number;
    warnings?: string[];
    errors?: string[];
  };
  /** Present in the full PipelineResult but not used by the client mappers. */
  scorecard?: {
    beeLevel?: string;
    recognitionLevelPercent?: number;
    subMinimumsMet?: boolean;
  };
  logs?: Array<{ message: string; type: string; timestamp: string }>;
}

/**
 * Converts an Excel date serial number (days since 1900-01-00, with the
 * Lotus 1-2-3 leap-year bug) to a yyyy-MM-dd string.  Passes through strings
 * that are already in ISO date format.
 */
function excelSerialToDateString(serial: number | string | undefined | null): string {
  if (!serial && serial !== 0) return '';
  if (typeof serial === 'string' && /^\d{4}-\d{2}-\d{2}/.test(serial)) return serial;
  const num = Number(serial);
  if (isNaN(num) || num < 36526 || num > 54789) return String(serial ?? '');
  const date = new Date((num - 25569) * 86400 * 1000);
  return date.toISOString().split('T')[0];
}

export function mapExtractionToFoundation(result: ExtractionApiResult): Partial<FoundationData> {
  const c = result.client || {};
  const f = result.financials || {};

  const clientInfo = {
    ...EMPTY_CLIENT_INFO,
    companyName: c.name || '',
    tradingName: c.tradeName || '',
    registrationNumber: c.registrationNumber || '',
    vatNumber: c.vatNumber || '',
    physicalAddress: c.address || '',
    financialYearEnd: excelSerialToDateString(c.financialYearEnd as any) || '',
    industry: c.industrySector || '',
    sectorCode: c.applicableScorecard || '',
    annualTurnover: f.revenue ?? 0,
  };

  const financials = {
    ...EMPTY_FINANCIALS,
    totalRevenue: f.revenue ?? 0,
    npat: f.npat ?? 0,
    leviableAmount: f.leviableAmount ?? 0,
    totalPayroll: f.payroll ?? 0,
    tmpsInclusions: f.tmpsInclusions ?? 0,
    tmpsExclusions: f.tmpsExclusions ?? 0,
    tmps: f.tmps ?? 0,
    deemedNpat: f.deemedNpat ?? 0,
    deemedNpatUsed: f.deemedNpatUsed ?? false,
    industry: c.industrySector || '',
  };

  return { clientInfo, financials };
}

export function mapExtractionToPillars(result: ExtractionApiResult): Partial<BuildPillarsData> {
  const out: Partial<BuildPillarsData> = {};

  const rawShareholders = result.ownership?.shareholders || [];
  if (rawShareholders.length > 0) {
    out.ownership = {
      id: '',
      clientId: '',
      companyValue: 0,
      outstandingDebt: 0,
      yearsHeld: 0,
      ownershipScorePoints: 0,
      ownershipScorePercent: 0,
      netValuePoints: 0,
      netValuePercent: 0,
      shareholders: rawShareholders.map((sh, i) => ({
        id: `sh-${i}`,
        name: sh.name || '',
        ownershipType: 'shareholder' as const,
        shares: sh.shares ?? 0,
        shareValue: sh.shareValue ?? 0,
        // boPercent / bwoPercent are 0-100; internal state expects 0-1 fractions.
        blackOwnership: (sh.boPercent ?? 0) / 100,
        blackWomenOwnership: (sh.bwoPercent ?? 0) / 100,
        votingRightsPercent: sh.boPercent ?? 0,
        economicInterestPercent: sh.boPercent ?? 0,
        isDesignatedGroup: false,
      })) as any,
    };
  }

  const rawEmployees = result.managementControl?.employees || [];
  if (rawEmployees.length > 0) {
    out.management = {
      id: '',
      clientId: '',
      employees: rawEmployees.map((e, i) => ({
        id: `emp-${i}`,
        name: e.name || '',
        gender: (e.gender as any) || 'Male',
        race: (e.race as any) || 'African',
        designation: (e.designation as any) || 'Junior',
        // API field is `disabled` — not `isDisabled`.
        isDisabled: e.disabled ?? false,
        isForeign: false,
      })),
    };
  }

  const rawTrainings = result.skillsDevelopment?.trainings || [];
  if (rawTrainings.length > 0 || result.skillsDevelopment?.leviableAmount) {
    out.skills = {
      id: '',
      clientId: '',
      leviableAmount: result.skillsDevelopment?.leviableAmount ?? result.financials?.leviableAmount ?? 0,
      trainingPrograms: rawTrainings.map((t, i) => ({
        id: `tp-${i}`,
        // API field is `name` — not `programName`.
        programName: t.name || '',
        learnerName: t.name || 'Extracted learner',
        categoryCode: 'A' as const,
        gender: 'Male' as const,
        race: 'African' as const,
        isDisabled: false,
        isForeign: false,
        // API field `isEmployed` maps to employmentStatus.
        employmentStatus: (t.isEmployed ? 'Permanent' : 'Unemployed') as any,
        isYesEmployee: false,
        isCompleted: true,
        isAbsorbed: false,
        transactionDate: new Date().toISOString().slice(0, 10),
        startDate: '',
        endDate: '',
        // API field is `cost` — not `totalCost`.
        courseCost: t.cost ?? 0,
        travelCost: 0,
        accommodationCost: 0,
        cateringCost: 0,
        stationeryCost: 0,
        // API field is `isBlack` (boolean) — not `blackParticipants` (number).
        _isBlack: t.isBlack ?? false,
        _category: t.category,
      })) as any,
      yesCandidatesCount: 0,
      yesAbsorbedCount: 0,
    };
  }

  const rawSuppliers = result.preferentialProcurement?.suppliers || [];
  if (rawSuppliers.length > 0 || result.preferentialProcurement?.tmps) {
    out.procurement = {
      id: '',
      clientId: '',
      tmps: result.preferentialProcurement?.tmps ?? result.financials?.tmps ?? 0,
      suppliers: rawSuppliers.map((s, i) => ({
        id: `sup-${i}`,
        // API field is `supplierName` — not `name`.
        name: s.supplierName || '',
        // API field is `level` — not `beeLevel`.
        beeLevel: (s.level ?? 4) as any,
        enterpriseType: 'generic' as any,
        // blackOwnership from API is percent (0-100); convert to fraction.
        blackOwnership: (s.blackOwnership ?? 0) / 100,
        blackWomenOwnership: 0,
        youthOwnership: 0,
        disabledOwnership: 0,
        spend: s.spend ?? 0,
        isEmpoweringSupplier: false,
        isSupplierDevRecipient: false,
        hasThreeYearContract: false,
      })),
    };
  }

  const rawEsd = result.enterpriseSupplierDevelopment?.esdList || [];
  if (rawEsd.length > 0) {
    out.esd = {
      id: '',
      clientId: '',
      contributions: rawEsd.map((c, i) => ({
        id: `esd-${i}`,
        beneficiary: c.beneficiary || '',
        description: c.description || '',
        type: (c.type as any) || 'direct_cost',
        amount: c.amount ?? 0,
        category: (c.category as any) || 'supplier_development',
        blackBenefitPercent: c.blackBenefitPercent ?? 100,
        transactionDate: c.transactionDate || new Date().toISOString().slice(0, 10),
      })),
      graduationBonus: false,
      jobsCreatedBonus: false,
    };
  }

  const rawSed = result.socioEconomicDevelopment?.sedList || [];
  if (rawSed.length > 0) {
    out.sed = {
      id: '',
      clientId: '',
      contributions: rawSed.map((c, i) => ({
        id: `sed-${i}`,
        beneficiary: c.beneficiary || '',
        description: c.description || '',
        type: (c.type as any) || 'grant',
        amount: c.amount ?? 0,
        category: 'socio_economic' as const,
        blackBenefitPercent: c.blackBenefitPercent ?? 100,
        transactionDate: c.transactionDate || new Date().toISOString().slice(0, 10),
      })),
    };
  }

  return out;
}

export interface ToolkitSectorTemplateStepProps {
  sectorOptions: { code: string; label: string }[];
  selectedSectorCode: string;
  onSectorChange: (code: string) => void;
  selectedTemplateId: TemplateId | null;
  onSelectTemplateId: (id: TemplateId) => void;
  loadingSectors?: boolean;
  className?: string;
}

export function ToolkitSectorTemplateStep({
  sectorOptions,
  selectedSectorCode,
  onSectorChange,
  selectedTemplateId,
  onSelectTemplateId,
  loadingSectors,
  className,
}: ToolkitSectorTemplateStepProps) {
  const effectiveSector = selectedSectorCode || sectorOptions[0]?.code || 'RCOGP';
  const visibleTemplates = filterTemplatesForSector(effectiveSector);

  return (
    <div className={cn('space-y-6', className)}>
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">Sector &amp; toolkit template</h3>
        <p className="text-sm" style={{ color: '#8e8e93' }}>
          Pick your B-BBEE sector first — templates are filtered so layout expectations match how you compile.
        </p>
      </div>

      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-wide text-[#636366] mb-2">Sector code</label>
        <select
          value={selectedSectorCode || sectorOptions[0]?.code || ''}
          disabled={loadingSectors || sectorOptions.length === 0}
          onChange={(e) => {
            const next = e.target.value;
            onSectorChange(next);
          }}
          className="w-full bg-[#111] border border-[#2c2c2e] rounded-xl px-4 py-2.5 text-[13px] text-white disabled:opacity-50"
          data-testid="select-upload-toolkit-sector"
        >
          {sectorOptions.map((opt) => (
            <option key={opt.code} value={opt.code}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="mb-3">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-[#636366] mb-2">Template</label>
          <p className="text-xs" style={{ color: '#48484a' }}>
            Showing {visibleTemplates.length} layout{visibleTemplates.length === 1 ? '' : 's'} for{' '}
            <span className="text-[#8e8e93]">{effectiveSector}</span>.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {visibleTemplates.map((t: ToolkitTemplateCard) => {
            const Icon = t.icon;
            const isSelected = selectedTemplateId === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelectTemplateId(t.id)}
                className={cn(
                  'p-4 rounded-xl border text-left transition-all',
                  isSelected ? 'border-[#5e9bff]/60 bg-[#5e9bff]/8' : 'border-[#2c2c2e] bg-[#1c1c1e] hover:border-[#3c3c3e]',
                )}
                style={isSelected ? { background: 'rgba(94,155,255,0.06)' } : {}}
                data-testid={`upload-template-${t.id}`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `${t.color}18`, border: `1px solid ${t.color}30` }}
                  >
                    <Icon className="shrink-0" style={{ color: t.color, width: 18, height: 18 }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{t.name}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 shrink-0" style={{ color: '#5e9bff' }} />}
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: '#8e8e93' }}>
                      {t.description}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(t.pillars || []).slice(0, 6).map((p: string) => (
                        <span key={p} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#2c2c2e', color: '#636366' }}>
                          {p}
                        </span>
                      ))}
                      {(t.pillars || []).length > 6 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded text-[#48484a]">+{(t.pillars || []).length - 6}</span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export interface ToolkitRequirementsSummaryProps {
  template: ToolkitTemplateCard;
  pillarScopes?: string[] | null;
  className?: string;
}

export function ToolkitRequirementsSummary({ template, pillarScopes, className }: ToolkitRequirementsSummaryProps) {
  const pillarsToShow = (template.pillars || []).filter((p) => pillarVisibleForScopes(p, pillarScopes));

  const handleDownloadTemplate = () => {
    const headers = (template.expectedColumns || []).join(',');
    const blob = new Blob([`${headers}\n`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${template.name.replace(/\s+/g, '_')}_template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">What your file should include</h3>
        <p className="text-sm" style={{ color: '#8e8e93' }}>
          Your workbook should capture the pillars we will extract.
          {pillarScopes?.length ? ' Showing pillars available to your account.' : ''}
        </p>
      </div>

      <div className="space-y-2">
        {pillarsToShow.map((pillar) => {
          const reqs = PILLAR_REQUIREMENTS[pillar];
          if (!reqs) return null;
          return (
            <div key={pillar} className="rounded-xl p-4" style={{ background: '#161616', border: '1px solid #2c2c2e' }}>
              <p className="text-sm font-medium text-white mb-2">{pillar}</p>
              {reqs.map((r, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex flex-wrap gap-1.5">
                    {r.required.map((field) => (
                      <span
                        key={field}
                        className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
                        style={{ background: '#2c2c2e', color: '#d1d1d6' }}
                      >
                        <Check className="w-2.5 h-2.5 shrink-0" style={{ color: '#5e9bff' }} />
                        {field}
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] mt-1.5" style={{ color: '#636366' }}>
                    Example: {r.examples}
                  </p>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={handleDownloadTemplate}
        className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg transition-colors"
        style={{ background: '#1c1c1e', border: '1px solid #2c2c2e', color: '#5e9bff' }}
      >
        <Download className="w-4 h-4" />
        Download blank CSV header row
      </button>
    </div>
  );
}

/** Full scorecard workbook pillars (single integrated path — no layout template choice). */
const DEFAULT_INTEGRATED_TOOLKIT_PILLARS: string[] = [
  'Client Info',
  'Financials',
  'Ownership',
  'Management Control',
  'Skills',
  'Procurement',
  'ESD',
  'SED',
];

export interface ToolkitIntegratedRequirementsSummaryProps {
  sectorCode: string;
  sectorLabel?: string;
  pillarScopes?: string[] | null;
  className?: string;
}

export function ToolkitIntegratedRequirementsSummary({
  sectorCode,
  sectorLabel,
  pillarScopes,
  className,
}: ToolkitIntegratedRequirementsSummaryProps) {
  const pillarsToShow = DEFAULT_INTEGRATED_TOOLKIT_PILLARS.filter((p) => pillarVisibleForScopes(p, pillarScopes));
  const code = (sectorCode || '').trim();

  const handleDownloadTemplate = () => {
    const fields = new Set<string>();
    for (const pillar of pillarsToShow) {
      const reqs = PILLAR_REQUIREMENTS[pillar];
      if (!reqs) continue;
      for (const r of reqs) {
        for (const f of r.required) fields.add(f);
      }
    }
    const headers = Array.from(fields).join(',');
    const blob = new Blob([`${headers}\n`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `B-BBEE_toolkit_headers_${code || 'sector'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">What your workbook should include</h3>
        <p className="text-sm" style={{ color: '#8e8e93' }}>
          Use one integrated B-BBEE toolkit / scorecard workbook — we map standard columns across pillars.
          {sectorLabel || code ? (
            <>
              {' '}
              Sector: <span className="text-[#d1d1d6]">{sectorLabel || code}</span>.
            </>
          ) : null}
          {pillarScopes?.length ? ' Showing pillars available to your account.' : ''}
        </p>
      </div>

      <div className="space-y-2">
        {pillarsToShow.map((pillar) => {
          const reqs = PILLAR_REQUIREMENTS[pillar];
          if (!reqs) return null;
          return (
            <div key={pillar} className="rounded-xl p-4" style={{ background: '#161616', border: '1px solid #2c2c2e' }}>
              <p className="text-sm font-medium text-white mb-2">{pillar}</p>
              {reqs.map((r, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex flex-wrap gap-1.5">
                    {r.required.map((field) => (
                      <span
                        key={field}
                        className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
                        style={{ background: '#2c2c2e', color: '#d1d1d6' }}
                      >
                        <Check className="w-2.5 h-2.5 shrink-0" style={{ color: '#5e9bff' }} />
                        {field}
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] mt-1.5" style={{ color: '#636366' }}>
                    Example: {r.examples}
                  </p>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={handleDownloadTemplate}
        className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg transition-colors"
        style={{ background: '#1c1c1e', border: '1px solid #2c2c2e', color: '#5e9bff' }}
      >
        <Download className="w-4 h-4" />
        Download combined CSV header row
      </button>
    </div>
  );
}

export interface ToolkitExcelDropZoneProps {
  /** Invoked immediately after `/api/import/excel` returns structured JSON */
  onExtractionPayload: (data: ExtractionApiResult, fileMeta: File) => void;
  className?: string;
}

/** Upload + extraction (blocking) dropzone reused from the toolkit path */
export function ToolkitExcelDropZone({ onExtractionPayload, className }: ToolkitExcelDropZoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (f: File) => {
      setFile(f);
      setError(null);
      setUploading(true);

      try {
        const formData = new FormData();
        formData.append('files', f);

        const res = await fetch('/api/import/excel', {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });

        const rawText = await res.text();
        const trimmed = rawText.trimStart();
        if (trimmed.startsWith('<') || trimmed.includes('<!DOCTYPE')) {
          throw new Error(
            'Import service returned HTML instead of JSON — check that the API server is running and /api/import is reachable.',
          );
        }
        let data: unknown;
        try {
          data = JSON.parse(rawText);
        } catch {
          throw new Error('Import service returned invalid JSON.');
        }
        if (!res.ok) {
          const body = data as { message?: string; extractionSummary?: { errors?: string[] } };
          throw new Error(body?.message || body?.extractionSummary?.errors?.[0] || 'Extraction failed');
        }

        const payload = data as ExtractionApiResult;
        onExtractionPayload(payload, f);
      } catch (err: any) {
        setError(err.message || 'Failed to extract data from file');
      } finally {
        setUploading(false);
      }
    },
    [onExtractionPayload],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragActive(false);
      const f = e.dataTransfer.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const fileIcon = (name: string) => {
    if (/\.pdf$/i.test(name)) return <FileText className="w-5 h-5" style={{ color: '#f59e0b' }} />;
    if (/\.(xlsx?|csv)$/i.test(name)) return <FileSpreadsheet className="w-5 h-5" style={{ color: '#34d399' }} />;
    return <FileImage className="w-5 h-5" style={{ color: '#8e8e93' }} />;
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">Upload your B-BBEE toolkit workbook</h3>
        <p className="text-sm" style={{ color: '#8e8e93' }}>
          One workbook (.xlsx / .xls / .csv) with your scorecard pillars — extraction starts right after you choose the file.
          {' '}PDF is accepted but may yield less structured data.
        </p>
      </div>

      {!file ? (
        <div
          className="rounded-xl text-center cursor-pointer transition-all"
          style={{
            border: `1.5px dashed ${isDragActive ? '#5e9bff' : '#2c2c2e'}`,
            background: isDragActive ? 'rgba(94,155,255,0.04)' : '#111',
            padding: '48px 24px',
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragActive(true);
          }}
          onDragLeave={() => setIsDragActive(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          data-testid="upload-toolkit-dropzone"
        >
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept=".xlsx,.xls,.csv,.pdf"
            onChange={(e) => {
              const f0 = e.target.files?.[0];
              if (f0) handleFile(f0);
            }}
          />
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: '#1c1c1e', border: '1px solid #2c2c2e' }}>
            <Upload className="w-6 h-6" style={{ color: '#636366' }} />
          </div>
          <p className="text-sm font-medium text-white mb-1">Drop your file here</p>
          <p className="text-xs" style={{ color: '#636366' }}>
            or click to browse
          </p>
          <div className="flex items-center justify-center gap-1.5 mt-4 text-[11px]">
            {['XLSX', 'XLS', 'CSV', 'PDF'].map((ext) => (
              <span key={ext} className="px-2 py-0.5 rounded" style={{ background: '#1c1c1e', color: '#48484a' }}>
                {ext}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: '#1c1c1e', border: '1px solid #2c2c2e' }}>
          {fileIcon(file.name)}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{file.name}</p>
            <p className="text-xs" style={{ color: '#8e8e93' }}>
              {(file.size / 1024).toFixed(1)} KB
            </p>
          </div>
          {uploading ? (
            <Loader2 className="w-5 h-5 animate-spin shrink-0" style={{ color: '#5e9bff' }} />
          ) : !error ? (
            <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: '#34d399' }} />
          ) : (
            <button
              type="button"
              onClick={() => {
                setFile(null);
                setError(null);
              }}
              className="p-1 rounded-lg hover:bg-white/5"
              aria-label="Clear file"
            >
              <X className="w-4 h-4" style={{ color: '#8e8e93' }} />
            </button>
          )}
        </div>
      )}

      {uploading && (
        <div
          className="rounded-xl p-4 flex items-center gap-3"
          style={{ background: 'rgba(94,155,255,0.06)', border: '1px solid rgba(94,155,255,0.2)' }}
        >
          <Loader2 className="w-4 h-4 animate-spin shrink-0" style={{ color: '#5e9bff' }} />
          <div>
            <p className="text-sm font-medium" style={{ color: '#5e9bff' }}>
              Extracting data…
            </p>
            <p className="text-xs" style={{ color: 'rgba(94,155,255,0.7)' }}>
              Running structured column extraction and intelligent field mapping
            </p>
          </div>
        </div>
      )}

      {error && (
        <div
          className="rounded-xl p-4 flex items-start gap-3"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#ef4444' }} />
          <div>
            <p className="text-sm font-medium" style={{ color: '#fca5a5' }}>
              Extraction failed
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(252,165,165,0.7)' }}>
              {error}
            </p>
            <button
              type="button"
              onClick={() => {
                setFile(null);
                setError(null);
              }}
              className="text-xs mt-2 underline"
              style={{ color: '#f87171' }}
            >
              Try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function extractionSummaryLabel(result: ExtractionApiResult): string {
  const s = result.extractionSummary;
  if (!s) return 'Extraction complete';
  const parts: string[] = [];
  if (s.sheetsParsed) parts.push(`${s.sheetsParsed} sheet${s.sheetsParsed !== 1 ? 's' : ''} parsed`);
  if (s.entitiesExtracted) parts.push(`${s.entitiesExtracted} fields extracted`);
  return parts.join(' · ') || 'Extraction complete';
}

export interface ToolkitStructuredReviewProps {
  result: ExtractionApiResult;
  foundationPreview: Partial<FoundationData>;
  pillarPreview: Partial<BuildPillarsData>;
  toolbar?: React.ReactNode;
  className?: string;
}

export function ToolkitStructuredReview({ result, foundationPreview, pillarPreview, toolbar, className }: ToolkitStructuredReviewProps) {
  const sections: { label: string; icon: React.ElementType; items: [string, string][] }[] = [];

  const ci = foundationPreview.clientInfo;
  const fin = foundationPreview.financials;

  if (ci?.companyName) {
    sections.push({
      label: 'Client Information',
      icon: Building2,
      items: [
        ['Company', ci.companyName],
        ['Registration', ci.registrationNumber || '—'],
        ['Sector', ci.sectorCode || ci.industry || '—'],
        ['Financial Year End', ci.financialYearEnd || '—'],
      ],
    });
  }

  if (fin && fin.totalRevenue > 0) {
    sections.push({
      label: 'Financials',
      icon: FileSpreadsheet,
      items: [
        ['Revenue', `R ${fin.totalRevenue.toLocaleString()}`],
        ['NPAT', `R ${(fin.npat ?? 0).toLocaleString()}`],
        ['Leviable Amount', `R ${(fin.leviableAmount ?? 0).toLocaleString()}`],
        ['TMPS', `R ${(fin.tmps ?? 0).toLocaleString()}`],
      ],
    });
  }

  if (pillarPreview.ownership?.shareholders?.length) {
    sections.push({
      label: 'Ownership',
      icon: Building2,
      items: pillarPreview.ownership.shareholders.slice(0, 3).map((sh) => [
        sh.name || 'Shareholder',
        // blackOwnership is stored as 0-1 fraction after mapping; multiply for display.
        `${sh.blackOwnership > 0 ? `${(sh.blackOwnership * 100).toFixed(1)}% black` : 'shareholder'}`,
      ] as [string, string]),
    });
  }

  if (pillarPreview.management?.employees?.length) {
    const count = pillarPreview.management.employees.length;
    sections.push({
      label: 'Management / EE',
      icon: Users,
      items: [[`Employees extracted`, `${count}`]],
    });
  }

  if (pillarPreview.skills?.trainingPrograms?.length) {
    const count = pillarPreview.skills.trainingPrograms.length;
    sections.push({
      label: 'Skills Development',
      icon: GraduationCap,
      items: [
        ['Training programmes', `${count}`],
        ['Leviable amount', `R ${(pillarPreview.skills!.leviableAmount || 0).toLocaleString()}`],
      ],
    });
  }

  if (pillarPreview.procurement?.suppliers?.length) {
    const count = pillarPreview.procurement.suppliers.length;
    sections.push({
      label: 'Procurement',
      icon: ShoppingCart,
      items: [
        ['Suppliers extracted', `${count}`],
        ['TMPS', `R ${(pillarPreview.procurement!.tmps || 0).toLocaleString()}`],
      ],
    });
  }

  if (pillarPreview.esd?.contributions?.length) {
    sections.push({
      label: 'ESD',
      icon: Handshake,
      items: [['Contributions', `${pillarPreview.esd!.contributions!.length}`]],
    });
  }

  if (pillarPreview.sed?.contributions?.length) {
    sections.push({
      label: 'SED',
      icon: Heart,
      items: [['Contributions', `${pillarPreview.sed!.contributions!.length}`]],
    });
  }

  const warnings = result.extractionSummary?.warnings || [];
  const errors = result.extractionSummary?.errors || [];

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white mb-1">Review extracted rows</h3>
          <p className="text-sm" style={{ color: '#8e8e93' }}>
            {extractionSummaryLabel(result)}. Confirm totals before we calculate the provisional scorecard.
          </p>
        </div>
        {toolbar}
      </div>

      {errors.length > 0 && (
        <div className="rounded-xl p-3 space-y-1" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          {errors.map((e, i) => (
            <p key={i} className="text-xs" style={{ color: '#fca5a5' }}>
              ⚠ {e}
            </p>
          ))}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-xl p-3 space-y-1" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
          {warnings.map((w, i) => (
            <p key={i} className="text-xs" style={{ color: '#fbbf24' }}>
              ⚡ {w}
            </p>
          ))}
        </div>
      )}

      {sections.length === 0 ? (
        <div className="rounded-xl p-8 text-center" style={{ background: '#161616', border: '1px solid #2c2c2e' }}>
          <AlertCircle className="w-8 h-8 mx-auto mb-3" style={{ color: '#636366' }} />
          <p className="text-sm font-medium text-white">Nothing extracted</p>
          <p className="text-xs mt-1" style={{ color: '#8e8e93' }}>
            Try another layout or rerun manual entry if the workbook didn&apos;t match our column map.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sections.map(({ label, icon: Icon, items }) => (
            <div key={label} className="rounded-xl p-4" style={{ background: '#161616', border: '1px solid #2c2c2e' }}>
              <div className="flex items-center gap-2 mb-3">
                <Icon className="w-4 h-4" style={{ color: '#5e9bff' }} />
                <span className="text-sm font-medium text-white">{label}</span>
              </div>
              <div className="space-y-1">
                {items.map(([key, val]) => (
                  <div key={`${label}-${key}`} className="flex items-center justify-between text-xs">
                    <span style={{ color: '#8e8e93' }}>{key}</span>
                    <span className="font-medium text-white">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
