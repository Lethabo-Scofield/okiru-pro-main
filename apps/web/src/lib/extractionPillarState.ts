/**
 * Extraction pillarData → Toolkit pillar state, and a read-only score of it.
 *
 * POST /api/calculate-from-extraction maps raw extraction output into flat
 * entity arrays (`pillarData`); it does not score them. The upload flow's
 * score preview and its final Submit both turn those arrays into the Toolkit's
 * pillar state HERE, and both score that state with the Toolkit calculator —
 * the only B-BBEE scorer — so the preview is the number Submit will show.
 */
import { calculateScorecard, type PillarState, type PipelineOverrides } from '@toolkit/lib/store';
import type { ScorecardResult } from '@toolkit/lib/types';
import type { CalculatorConfig } from '@shared/schema';

/** The `pillarData` block POST /api/calculate-from-extraction returns. */
export interface ExtractionPillarData {
  employees?: any[];
  shareholders?: any[];
  suppliers?: any[];
  contributions?: any[];
  trainingPrograms?: any[];
  financials?: Record<string, any>;
}

/** The slices of Toolkit state the extraction mapping writes. */
export type ExtractionPillarSlices = Pick<
  PillarState,
  'client' | 'ownership' | 'management' | 'skills' | 'procurement' | 'esd' | 'sed'
>;

/** Who the client is, as the upload flow knows it (first non-empty wins over the base state). */
export interface ExtractionClientIdentity {
  name?: string;
  sectorCode?: string;
  registrationNumber?: string;
}

/**
 * Map extraction pillarData onto a base Toolkit state. Pure: returns new
 * slices and never touches the store. Rows replace the base's rows; every other
 * field of each slice is kept from the base.
 */
export function mapExtractionPillarData(
  pd: ExtractionPillarData,
  base: ExtractionPillarSlices,
  identity: ExtractionClientIdentity = {},
): ExtractionPillarSlices {
  const fin = pd.financials || {};
  return {
    client: {
      ...base.client,
      name: identity.name || base.client.name,
      sectorCode: (identity.sectorCode || base.client.sectorCode) as any,
      registrationNumber: identity.registrationNumber || '',
      revenue: fin.revenue || 0,
      npat: fin.npat || 0,
      leviableAmount: fin.leviableAmount || 0,
    },
    ownership: {
      ...base.ownership,
      shareholders: (pd.shareholders || []).map((s: any, i: number) => ({
        id: s.id || `sh-${i}`,
        name: s.name || `Shareholder ${i + 1}`,
        ownershipType: 'shareholder' as const,
        blackOwnership: s.blackOwnership || 0,
        blackWomenOwnership: s.blackWomenOwnership || 0,
        votingRightsPercent: s.votingRightsPercent || s.blackOwnership || 0,
        economicInterestPercent: s.economicInterestPercent || s.blackOwnership || 0,
        isDesignatedGroup: s.isDesignatedGroup || false,
        designatedGroupType: undefined,
        blackNewEntrant: s.blackNewEntrant || false,
        yearsHeld: s.yearsHeld || 0,
        graduationFactor: undefined,
        shares: s.shares || 0,
        shareValue: s.shareValue || 0,
      })),
      companyValue: fin.companyValue || 0,
      outstandingDebt: fin.outstandingDebt || 0,
      yearsHeld: fin.yearsHeld || 0,
    },
    management: {
      ...base.management,
      employees: (pd.employees || []).map((e: any, i: number) => ({
        id: e.id || `emp-${i}`,
        name: e.name || `Employee ${i + 1}`,
        gender: e.gender || 'Male',
        race: e.race || 'African',
        designation: e.designation || 'Junior',
        isDisabled: e.isDisabled || false,
        isForeign: e.isForeign || false,
      })),
    },
    skills: {
      ...base.skills,
      leviableAmount: fin.leviableAmount || 0,
      trainingPrograms: (pd.trainingPrograms || []).map((tp: any, i: number) => ({
        id: tp.id || `tp-${i}`,
        programName: tp.name || tp.programName || `Program ${i + 1}`,
        name: tp.name || tp.programName || `Program ${i + 1}`,
        learnerName: tp.learnerName || tp.name || '',
        categoryCode: tp.categoryCode || 'A',
        category: tp.category || 'other',
        gender: tp.gender || 'Male',
        race: tp.race || 'African',
        isDisabled: tp.isDisabled || false,
        isForeign: false,
        employmentStatus: 'Permanent' as const,
        isYesEmployee: tp.isYesEmployee || false,
        isCompleted: false,
        isAbsorbed: tp.isAbsorbed || false,
        transactionDate: '',
        courseCost: tp.cost || tp.courseCost || 0,
        travelCost: 0, accommodationCost: 0, cateringCost: 0,
        stationeryCost: 0, facilityCost: 0, salaryCost: 0, otherCosts: 0,
        totalCost: tp.cost || tp.courseCost || 0,
        cost: tp.cost || tp.courseCost || 0,
        isAbet: false, isMandatory: false,
        isBursary: tp.isBursary || tp.category === 'bursary' || false,
      })),
    },
    procurement: {
      ...base.procurement,
      tmps: fin.tmps || 0,
      suppliers: (pd.suppliers || []).map((s: any, i: number) => ({
        id: s.id || `sup-${i}`,
        name: s.name || `Supplier ${i + 1}`,
        beeLevel: s.beeLevel || 0,
        blackOwnership: s.blackOwnership || 0,
        blackWomenOwnership: s.blackWomenOwnership || 0,
        youthOwnership: 0,
        disabledOwnership: 0,
        enterpriseType: s.enterpriseType || 'generic',
        isEmpoweringSupplier: true,
        isSupplierDevRecipient: false,
        hasThreeYearContract: false,
        spend: s.spend || 0,
        isForeignSupplier: s.isForeignSupplier || false,
      })),
    },
    esd: {
      ...base.esd,
      contributions: (pd.contributions || [])
        .filter((c: any) => c.category === 'sd' || c.category === 'ed')
        .map((c: any, i: number) => ({
          id: c.id || `esd-${i}`,
          beneficiary: c.beneficiary || `Beneficiary ${i + 1}`,
          type: c.type || 'direct_cost',
          amount: c.amount || 0,
          category: c.category === 'sd' ? 'supplier_development' as const : 'enterprise_development' as const,
        })),
    },
    sed: {
      ...base.sed,
      contributions: (pd.contributions || [])
        .filter((c: any) => c.category === 'sed')
        .map((c: any, i: number) => ({
          id: c.id || `sed-${i}`,
          beneficiary: c.beneficiary || `Beneficiary ${i + 1}`,
          type: c.type || 'grant',
          amount: c.amount || 0,
          category: 'socio_economic' as const,
        })),
    },
  };
}

/**
 * The sector's calculator config, from the same endpoint the Toolkit loads it
 * from. Null when the server has none for this sector/type.
 */
export async function fetchSectorCalculatorConfig(
  sectorCode: string,
  scorecardType: string,
): Promise<CalculatorConfig | null> {
  const res = await fetch(
    `/api/scorecard/sector-config/${encodeURIComponent(sectorCode)}/${encodeURIComponent(scorecardType)}`,
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data?.success && data.config ? (data.config as CalculatorConfig) : null;
}

/** The Toolkit state an extraction score is built on (normally the live store). */
export type ExtractionScoringBase = PillarState & {
  calculatorConfig?: CalculatorConfig | null;
  ignoreSubMinimum?: boolean;
  pipelineOverrides?: PipelineOverrides | null;
};

/**
 * Score extraction pillarData with the Toolkit calculator WITHOUT writing to
 * the store: the base state with the mapped slices laid over it, scored by the
 * same calculateScorecard the store's _recalculateAll runs.
 */
export function scoreExtractionPillarData(
  pd: ExtractionPillarData,
  base: ExtractionScoringBase,
  identity: ExtractionClientIdentity,
  calculatorConfig: CalculatorConfig,
): ScorecardResult {
  const mapped = mapExtractionPillarData(pd, base, identity);
  return calculateScorecard(
    { ...base, ...mapped, calculatorConfig },
    base.pipelineOverrides ?? null,
  );
}

/** The score-preview card's shape: a level, a total and the counted pillars. */
export interface ScorecardPreview {
  /** The level after sub-minimum discounting (9 = non-compliant). */
  beeLevel: number;
  totalPoints: number;
  maxPoints: number;
  pillars: Array<{ pillarCode: string; pillarName: string; points: number; maxPoints: number }>;
}

const PREVIEW_PILLARS: Array<[keyof ScorecardResult, string]> = [
  ['ownership', 'Ownership'],
  ['managementControl', 'Management Control'],
  ['employmentEquity', 'Employment Equity'],
  ['skillsDevelopment', 'Skills Development'],
  ['procurement', 'Preferential Procurement'],
  ['supplierDevelopment', 'Supplier Development'],
  ['enterpriseDevelopment', 'Enterprise Development'],
  ['socioEconomicDevelopment', 'Socio-Economic Development'],
  ['empowermentFinancing', 'Empowerment Financing'],
  ['accessToFinancialServices', 'Access to Financial Services'],
  ['yesInitiative', 'YES Initiative'],
];

/**
 * A Toolkit ScorecardResult as the preview card reads it. Pillars this sector
 * does not score (no maximum) and electives that were not chosen are left out,
 * so the rows add up to the total.
 */
export function toScorecardPreview(sc: ScorecardResult): ScorecardPreview {
  const pillars: ScorecardPreview['pillars'] = [];
  for (const [key, label] of PREVIEW_PILLARS) {
    const p = sc[key] as (ScorecardResult['ownership'] & { isElectiveNotChosen?: boolean }) | undefined;
    if (!p || typeof p !== 'object' || !(p.target > 0) || p.isElectiveNotChosen) continue;
    pillars.push({ pillarCode: String(key), pillarName: label, points: p.score ?? 0, maxPoints: p.target });
  }
  return {
    beeLevel: sc.discountedLevel,
    totalPoints: sc.total.score,
    maxPoints: sc.total.target,
    pillars,
  };
}
