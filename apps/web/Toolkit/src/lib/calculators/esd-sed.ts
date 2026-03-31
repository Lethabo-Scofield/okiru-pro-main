import type { ESDData, SEDData, Contribution } from '../types';
import type { CalculatorConfig } from '../../../../shared/schema';
import { safeRatio, clampScore, round2 } from './shared';

// VERIFIED AGAINST: BBBEE Toolkit (RCOGP)_Template_v.1.4.xlsx
// Complete table of 14 contribution types and their benefit factors
const DEFAULT_BENEFIT_FACTORS: Record<string, number> = {
  // Category 1: Direct monetary contributions (1.0 factor)
  grant: 1.0,
  direct_cost: 1.0,
  cost_covering: 1.0,
  discounts: 1.0,
  overhead_costs: 1.0,
  // CRITICAL FIX: Interest-free loan factor is 1.0 (not 0.7)
  interest_free_loan: 1.0,
  // Category 2: Partial benefits
  standard_loan: 0.7,  // Interest-bearing loan
  guarantees: 0.03,    // 3% of guarantee value
  lower_interest_loan: 0.7,  // Differential benefit (simplified)
  // Category 3: Special investment types (1.0 factor)
  minority_investment: 1.0,  // In EME/QSE
  professional_services_free: 1.0,
  professional_services_discount: 0.8,  // Discount percentage
  employee_time: 1.0,  // Secondment
  // Category 4: Procurement-specific (SD only)
  shorter_payment_terms: 0.7,  // Differential benefit (simplified)
  equity_investment: 1.0,  // ED only, special formula
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

function buildBenefitFactors(config?: CalculatorConfig): Record<string, number> {
  const factors = { ...DEFAULT_BENEFIT_FACTORS };
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

export function calculateEsdScore(data: ESDData, npat: number, config?: CalculatorConfig): EsdResult {
  const contributions = data.contributions || [];
  const ec = config?.esd;

  const supplierDevMax = ec?.supplierDevMax ?? 10;
  const enterpriseDevMax = ec?.enterpriseDevMax ?? 5;
  const supplierDevTargetPct = ec?.supplierDevTarget ?? 0.02;
  const enterpriseDevTargetPct = ec?.enterpriseDevTarget ?? 0.01;

  const sdTarget = npat * supplierDevTargetPct;
  const edTarget = npat * enterpriseDevTargetPct;

  const benefitFactors = buildBenefitFactors(config);
  const { sdSpend, edSpend } = categorizeContributions(contributions, benefitFactors);

  const sdScore = safeRatio(sdSpend, sdTarget, supplierDevMax);
  const edScore = safeRatio(edSpend, edTarget, enterpriseDevMax);

  const graduationBonusScore = data.graduationBonus ? 1 : 0;
  const jobsCreatedBonusScore = data.jobsCreatedBonus ? 1 : 0;

  const sdTotal = clampScore(sdScore, supplierDevMax);
  const edTotal = clampScore(edScore + graduationBonusScore + jobsCreatedBonusScore, enterpriseDevMax + 2);

  const sdSubMinimumMet = sdTotal >= (supplierDevMax * 0.4);
  const edSubMinimumMet = edScore >= (enterpriseDevMax * 0.4);

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

export function calculateSedScore(data: SEDData, npat: number, config?: CalculatorConfig): SedResult {
  const contributions = data.contributions || [];
  const sc = config?.sed;

  const maxPoints = sc?.maxPoints ?? 5;
  const npatTargetPct = sc?.npatTarget ?? 0.01;
  const target = npat * npatTargetPct;

  const totalSpend = contributions.reduce((acc, c) => acc + c.amount, 0);
  const score = safeRatio(totalSpend, target, maxPoints);

  return {
    total: round2(score),
    subMinimumMet: true,
    actualSpend: round2(totalSpend),
    target: round2(target),
    rawStats: { spendSED: round2(totalSpend) },
  };
}
