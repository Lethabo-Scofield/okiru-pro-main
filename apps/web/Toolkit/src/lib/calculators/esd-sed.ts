/**
 * @domain-rule pillar:esd, slides:73-82
 * @domain-rule pillar:sed, slides:48-53
 * @see docs/domain/pillars/05_enterprise_supplier_dev.md
 * @see docs/domain/pillars/06_socioeconomic_dev.md
 * @see docs/domain/diagrams/sed_calculation.md
 */
import type { ESDData, SEDData, Contribution } from '../types';
import type { CalculatorConfig } from '../../../../shared/schema';
import { safeRatio, clampScore, round2 } from './shared';

/**
 * ESD benefit factors per RCOGP slides 79-80
 * @domain-rule pillar:esd, slides:79,80
 * @see docs/domain/pillars/05_enterprise_supplier_dev.md#qualifying-contributions
 */
const ESD_BENEFIT_FACTORS: Record<string, number> = {
  grant: 1.0,
  direct_cost: 1.0,
  cost_covering: 1.0,
  discounts: 1.0,
  overhead_costs: 0.70,
  interest_free_loan: 0.70,
  standard_loan: 0.50,
  guarantees: 0.03,
  lower_interest_loan: 0.70,
  minority_investment: 0.70,
  professional_services_free: 0.60,
  professional_services_discount: 0.60,
  employee_time: 0.60,
  shorter_payment_terms: 0.15,
  equity_investment: 1.0,
};

/**
 * SED benefit factors per RCOGP slide 52 (higher recognition than ESD)
 * @domain-rule pillar:sed, slide:52
 * @see docs/domain/pillars/06_socioeconomic_dev.md#qualifying-contributions
 */
const SED_BENEFIT_FACTORS: Record<string, number> = {
  grant: 1.0,
  direct_cost: 1.0,
  cost_covering: 1.0,
  discounts: 1.0,
  overhead_costs: 0.80,
  interest_free_loan: 0.70,
  standard_loan: 0.50,
  guarantees: 0.03,
  lower_interest_loan: 0.70,
  minority_investment: 0.70,
  professional_services_free: 0.80,
  professional_services_discount: 0.80,
  employee_time: 0.80,
};

export interface EsdSubLine {
  name: string;
  target: string;
  weighting: number;
  score: number;
  isBonus?: boolean;
}

export interface EsdResult {
  supplierDev: number;
  enterpriseDev: number;
  graduationBonus: number;
  jobsCreatedBonus: number;
  sdTotal: number;
  edTotal: number;
  total: number;
  sdSubMinimumMet: boolean;
  edSubMinimumMet: boolean;
  subMinimumMet: boolean;
  sdSpend: number;
  edSpend: number;
  sdTarget: number;
  edTarget: number;
  sdSubLines: EsdSubLine[];
  edSubLines: EsdSubLine[];
  subLines: EsdSubLine[];
}

export interface SedResult {
  total: number;
  subMinimumMet: boolean;
  actualSpend: number;
  target: number;
  rawStats: {
    spendSED: number;
  };
}

function buildBenefitFactors(
  pillar: 'esd' | 'sed',
  config: CalculatorConfig
): Record<string, number> {
  const factors = { ...(pillar === 'sed' ? SED_BENEFIT_FACTORS : ESD_BENEFIT_FACTORS) };
  if (config?.benefitFactors && Array.isArray(config.benefitFactors)) {
    for (const bf of config.benefitFactors) {
      factors[bf.type] = bf.factor;
    }
  }
  return factors;
}

function categorizeContributions(
  contributions: Contribution[],
  benefitFactors: Record<string, number>,
): { sdSpend: number; edSpend: number } {
  let sdSpend = 0;
  let edSpend = 0;

  for (const c of contributions) {
    const factor = benefitFactors[c.type] ?? 1.0;
    const recognised = c.amount * factor;

    if (c.category === 'supplier_development') sdSpend += recognised;
    else if (c.category === 'enterprise_development') edSpend += recognised;
  }

  return { sdSpend, edSpend };
}

export function calculateEsdScore(data: ESDData, npat: number, config: CalculatorConfig): EsdResult {
  if (!config) throw new Error('CalculatorConfig is required for ESD score calculation');
  const contributions = data.contributions || [];
  const ec = config.esd;

  const supplierDevMax = ec.supplierDevMax;
  const enterpriseDevMax = ec.enterpriseDevMax;
  const supplierDevTargetPct = ec.supplierDevTarget;
  const enterpriseDevTargetPct = ec.enterpriseDevTarget;

  const sdTarget = npat * supplierDevTargetPct;
  const edTarget = npat * enterpriseDevTargetPct;

  const esdFactors = buildBenefitFactors('esd', config);
  const { sdSpend, edSpend } = categorizeContributions(contributions, esdFactors);

  const sdScore = safeRatio(sdSpend, sdTarget, supplierDevMax);
  const edScore = safeRatio(edSpend, edTarget, enterpriseDevMax);

  const graduationBonusScore = data.graduationBonus ? 1 : 0;
  const jobsCreatedBonusScore = data.jobsCreatedBonus ? 1 : 0;

  const sdTotal = clampScore(sdScore, supplierDevMax);
  const edTotal = clampScore(edScore + graduationBonusScore + jobsCreatedBonusScore, enterpriseDevMax + 2);

  const sdSubMinPct = config.pillarConfigs?.esd?.sdSubMinimumPercent ?? 40;
  const edSubMinPct = config.pillarConfigs?.esd?.edSubMinimumPercent ?? 40;
  const sdSubMinimumMet = sdTotal >= (supplierDevMax * sdSubMinPct / 100);
  const edSubMinimumMet = edTotal >= (enterpriseDevMax * edSubMinPct / 100);

  const sdSubLines: EsdSubLine[] = [
    { name: "Annual value of all Supplier Development contributions", target: "2% of NPAT", weighting: 10, score: sdScore },
  ];

  const edSubLines: EsdSubLine[] = [
    { name: "Annual value of Enterprise Development contributions", target: "1% of NPAT", weighting: 5, score: edScore },
    { name: "Graduation of ED beneficiaries to SD beneficiaries", target: "Tick-box", weighting: 1, score: graduationBonusScore, isBonus: true },
    { name: "Jobs created from ED & SD initiatives", target: "Tick-box", weighting: 1, score: jobsCreatedBonusScore, isBonus: true },
  ];

  const subLines: EsdSubLine[] = [...sdSubLines, ...edSubLines];

  return {
    supplierDev: round2(sdScore),
    enterpriseDev: round2(edScore),
    graduationBonus: round2(graduationBonusScore),
    jobsCreatedBonus: round2(jobsCreatedBonusScore),
    sdTotal: round2(sdTotal),
    edTotal: round2(edTotal),
    total: round2(sdTotal + edTotal),
    sdSubMinimumMet,
    edSubMinimumMet,
    subMinimumMet: sdSubMinimumMet && edSubMinimumMet,
    sdSpend: round2(sdSpend),
    edSpend: round2(edSpend),
    sdTarget: round2(sdTarget),
    edTarget: round2(edTarget),
    sdSubLines: sdSubLines.map(l => ({ ...l, score: round2(l.score) })),
    edSubLines: edSubLines.map(l => ({ ...l, score: round2(l.score) })),
    subLines: subLines.map(l => ({ ...l, score: round2(l.score) })),
  };
}

export function calculateSedScore(data: SEDData, npat: number, config: CalculatorConfig): SedResult {
  if (!config) throw new Error('CalculatorConfig is required for SED score calculation');
  const contributions = data.contributions || [];
  const sc = config.sed;

  const maxPoints = sc.maxPoints;
  const npatTargetPct = sc.npatTarget;
  const target = npat * npatTargetPct;

  const sedFactors = buildBenefitFactors('sed', config);
  const totalSpend = contributions.reduce((acc, c) => {
    const factor = sedFactors[c.type] ?? 1.0;
    return acc + c.amount * factor;
  }, 0);
  const score = safeRatio(totalSpend, target, maxPoints);

  return {
    total: round2(score),
    subMinimumMet: true,
    actualSpend: round2(totalSpend),
    target: round2(target),
    rawStats: { spendSED: round2(totalSpend) },
  };
}
