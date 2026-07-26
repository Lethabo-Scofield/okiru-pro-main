/**
 * @domain-rule pillar:esd, slides:73-82
 * @domain-rule pillar:sed, slides:48-53
 * @see docs/domain/pillars/05_enterprise_supplier_dev.md
 * @see docs/domain/pillars/06_socioeconomic_dev.md
 * @see docs/domain/diagrams/sed_calculation.md
 */
import type { ESDData, SEDData, Contribution } from '../types';
import type { CalculatorConfig } from '../../../../shared/schema';
import { safeRatio, clampScore, round2, requireSectorConfig, resolveSectorContext } from './shared';

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
  /** FSC stockbroker / fund-manager ED bonus (0 unless sector enables it). */
  stockbrokerBonus: number;
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
  config?: CalculatorConfig
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

/**
 * RCOGP Generic defaults used when no sector CalculatorConfig is supplied.
 * Mirrors the RCOGP Generic Codes (Statement 400 — ESD).
 */
const ESD_DEFAULTS = {
  supplierDevMax: 10,
  enterpriseDevMax: 5,
  supplierDevTarget: 0.02,
  enterpriseDevTarget: 0.01,
  edGraduationBonusMax: 1,
  edJobsBonusMax: 1,
  edStockbrokerBonusMax: 0,
  edStockbrokerTarget: 0,
} as const;

/** Jobs-bonus tier boundary: ≥ 11% of workforce earns the upper tier (2 pts). */
const ED_JOBS_UPPER_TIER_THRESHOLD = 0.11;

/** Format NPAT target fraction for sub-line labels (e.g. 0.018 → "1.8% of NPAT"). */
function formatNpatTargetLabel(pct: number): string {
  const display = pct * 100;
  const rounded =
    Math.abs(display - Math.round(display)) < 0.05
      ? String(Math.round(display))
      : display.toFixed(1).replace(/\.0$/, "");
  return `${rounded}% of NPAT`;
}

/**
 * RCOGP Generic defaults used when no sector CalculatorConfig is supplied.
 * Mirrors the RCOGP Generic Codes (Statement 500 — SED).
 */
const SED_DEFAULTS = {
  maxPoints: 5,
  npatTarget: 0.01,
} as const;

export function calculateEsdScore(data: ESDData, npat: number, config?: CalculatorConfig): EsdResult {
  console.log('[SCORING-TRACE] calculateEsdScore received:', {
    npat,
    contributionCount: data.contributions?.length ?? 0,
  });
  const contributions = data.contributions || [];
  const { sectorCode, scorecardType } = resolveSectorContext(config);
  const ec = requireSectorConfig(
    sectorCode,
    'esd',
    config?.esd as Record<string, unknown> | undefined,
    scorecardType,
  ) as Partial<NonNullable<CalculatorConfig['esd']>>;

  const supplierDevMax = ec.supplierDevMax ?? ESD_DEFAULTS.supplierDevMax;
  const enterpriseDevMax = ec.enterpriseDevMax ?? ESD_DEFAULTS.enterpriseDevMax;
  const supplierDevTargetPct = ec.supplierDevTarget ?? ESD_DEFAULTS.supplierDevTarget;
  const enterpriseDevTargetPct = ec.enterpriseDevTarget ?? ESD_DEFAULTS.enterpriseDevTarget;

  // Config-driven ED bonus maxima (previously hard-coded as +1 / +1, capped at +2).
  const edGraduationBonusMax = ec.edGraduationBonusMax ?? ESD_DEFAULTS.edGraduationBonusMax;
  const edJobsBonusMax = ec.edJobsBonusMax ?? ESD_DEFAULTS.edJobsBonusMax;
  const edStockbrokerBonusMax = ec.edStockbrokerBonusMax ?? ESD_DEFAULTS.edStockbrokerBonusMax;
  const edStockbrokerTargetPct = ec.edStockbrokerTarget ?? ESD_DEFAULTS.edStockbrokerTarget;

  const sdTarget = npat * supplierDevTargetPct;
  const edTarget = npat * enterpriseDevTargetPct;

  const esdFactors = buildBenefitFactors('esd', config);
  const { sdSpend, edSpend } = categorizeContributions(contributions, esdFactors);

  const sdScore = safeRatio(sdSpend, sdTarget, supplierDevMax);
  const edScore = safeRatio(edSpend, edTarget, enterpriseDevMax);

  const graduationBonusScore = data.graduationBonus ? edGraduationBonusMax : 0;

  // Two-tier "jobs created" bonus (mutually exclusive per TOOLKIT-RESOLVED.md S6):
  //   no jobs            → 0
  //   jobs ≤10% workforce → 1 pt
  //   jobs ≥11% workforce → 2 pts (only when the sector enables a 2-pt max)
  let jobsCreatedBonusScore = 0;
  if (data.jobsCreatedBonus) {
    const jobsPct = data.jobsCreatedPercent ?? 0;
    if (edJobsBonusMax >= 2 && jobsPct >= ED_JOBS_UPPER_TIER_THRESHOLD) {
      jobsCreatedBonusScore = 2;
    } else {
      jobsCreatedBonusScore = Math.min(1, edJobsBonusMax);
    }
  }

  // FSC-only separate ED bonus: support of black stockbrokers / fund managers /
  // intermediaries, scored at 0.5% NPAT for 2 pts (TOOLKIT-RESOLVED.md Q42).
  const stockbrokerSpend = data.stockbrokerSpend ?? 0;
  const stockbrokerBonusScore =
    edStockbrokerBonusMax > 0 && edStockbrokerTargetPct > 0
      ? clampScore(
          safeRatio(stockbrokerSpend, npat * edStockbrokerTargetPct, edStockbrokerBonusMax),
          edStockbrokerBonusMax,
        )
      : 0;

  const edBonusMax = edGraduationBonusMax + edJobsBonusMax + edStockbrokerBonusMax;
  const sdTotal = clampScore(sdScore, supplierDevMax);
  const edTotal = clampScore(
    edScore + graduationBonusScore + jobsCreatedBonusScore + stockbrokerBonusScore,
    enterpriseDevMax + edBonusMax,
  );

  // The sub-minimum comes from the sector's OWN pillar config
  // (supplierDevelopment / enterpriseDevelopment.subMinimumPercent — the keys
  // the bundled sector configs actually populate; `esd.sdSubMinimumPercent`
  // was a phantom key no sector sets, so EVERY sector silently fell to a 40%
  // default). No configured sub-minimum means none, and an element the sector
  // does not carry (0 max points) has nothing to fail — the old `max > 0 &&`
  // marked it FAILING, which discounted whole legacy scorecards.
  // (Audit 2026-07-26 item 15.)
  const sdSubMinPct = config?.pillarConfigs?.esd?.sdSubMinimumPercent
    ?? config?.pillarConfigs?.supplierDevelopment?.subMinimumPercent
    ?? 0;
  const edSubMinPct = config?.pillarConfigs?.esd?.edSubMinimumPercent
    ?? config?.pillarConfigs?.enterpriseDevelopment?.subMinimumPercent
    ?? 0;
  const sdSubMinimumMet =
    supplierDevMax <= 0 || sdSubMinPct <= 0 ||
    sdTotal >= (supplierDevMax * sdSubMinPct / 100);
  const edSubMinimumMet =
    enterpriseDevMax <= 0 || edSubMinPct <= 0 ||
    edTotal >= (enterpriseDevMax * edSubMinPct / 100);

  const sdSubLines: EsdSubLine[] = [
    {
      name: "Annual value of all Supplier Development contributions",
      target: formatNpatTargetLabel(supplierDevTargetPct),
      weighting: supplierDevMax,
      score: sdScore,
    },
  ];

  const edSubLines: EsdSubLine[] = [
    {
      name: "Annual value of Enterprise Development contributions",
      target: formatNpatTargetLabel(enterpriseDevTargetPct),
      weighting: enterpriseDevMax,
      score: edScore,
    },
    { name: "Graduation of ED beneficiaries to SD beneficiaries", target: "Tick-box", weighting: edGraduationBonusMax, score: graduationBonusScore, isBonus: true },
    { name: "Jobs created from ED & SD initiatives", target: edJobsBonusMax >= 2 ? "≤10% → 1pt / ≥11% → 2pts" : "Tick-box", weighting: edJobsBonusMax, score: jobsCreatedBonusScore, isBonus: true },
  ];
  if (edStockbrokerBonusMax > 0) {
    edSubLines.push({
      name: "ED support of black stockbrokers / fund managers / intermediaries",
      target: `${(edStockbrokerTargetPct * 100).toFixed(1)}% of NPAT`,
      weighting: edStockbrokerBonusMax,
      score: stockbrokerBonusScore,
      isBonus: true,
    });
  }

  const subLines: EsdSubLine[] = [...sdSubLines, ...edSubLines];

  const result = {
    supplierDev: round2(sdScore),
    enterpriseDev: round2(edScore),
    graduationBonus: round2(graduationBonusScore),
    jobsCreatedBonus: round2(jobsCreatedBonusScore),
    stockbrokerBonus: round2(stockbrokerBonusScore),
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
  console.log(`[SCORING-TRACE] calculateEsdScore result: sd ${result.sdTotal} + ed ${result.edTotal}`);
  return result;
}

export function calculateSedScore(
  data: SEDData,
  npat: number,
  config?: CalculatorConfig,
  opts?: { isReinsurer?: boolean },
): SedResult {
  console.log('[SCORING-TRACE] calculateSedScore received:', {
    npat,
    contributionCount: data.contributions?.length ?? 0,
    ceSpend: data.ceSpend,
    ceBonusSpend: data.ceBonusSpend,
    fundisaSpend: data.fundisaSpend,
  });
  const contributions = data.contributions || [];
  const { sectorCode, scorecardType } = resolveSectorContext(config);
  const sc = requireSectorConfig(
    sectorCode,
    'sed',
    config?.sed as Record<string, unknown> | undefined,
    scorecardType,
  ) as Partial<NonNullable<CalculatorConfig['sed']>>;

  const maxPoints = sc.maxPoints ?? SED_DEFAULTS.maxPoints;
  const npatTargetPct = sc.npatTarget ?? SED_DEFAULTS.npatTarget;

  const sedFactors = buildBenefitFactors('sed', config);
  const rowSpend = contributions.reduce((acc, c) => {
    const factor = sedFactors[c.type] ?? 1.0;
    return acc + c.amount * factor;
  }, 0);

  // FSC SED+CE split model: row spend → SED base; meta fields → CE + bonuses.
  const usesSplitModel = (sc.ceMaxPts ?? 0) > 0 || (sc.sedBaseMaxPts ?? 0) > 0;
  let score: number;
  let target: number;

  if (usesSplitModel) {
    const sedBaseMax = sc.sedBaseMaxPts ?? 3;
    const sedTargetPct = sc.sedNpatTarget ?? 0.006;
    const sedScore = safeRatio(rowSpend, npat * sedTargetPct, sedBaseMax);

    const ceMax = opts?.isReinsurer ? 1 : (sc.ceMaxPts ?? 2);
    const ceTargetPct = sc.ceNpatTarget ?? 0.004;
    const ceScore = safeRatio(data.ceSpend ?? 0, npat * ceTargetPct, ceMax);

    const ceBonusMax = opts?.isReinsurer ? 0 : (sc.ceBonusMaxPts ?? 1);
    const ceBonusTargetPct = sc.ceBonusNpatTarget ?? 0.001;
    // Additional CE Contribution (1 bonus pt @ 0.1% NPAT) is DERIVED in the FSC
    // template, not a separate input: SED & CE Scorecard I10 (non-Reinsurer) =
    // MAX(SUM(Pillar="Consumer Education") − F7, 0) where F7 = NPAT × E7 (the
    // 0.6% SED target amount). Mirror that when no explicit ceBonusSpend was
    // captured, so CE spend beyond the threshold earns the bonus point exactly
    // as the template awards it. An explicitly captured value still wins.
    const derivedCeBonus = Math.max((data.ceSpend ?? 0) - npat * sedTargetPct, 0);
    const ceBonusScore = safeRatio(data.ceBonusSpend ?? derivedCeBonus, npat * ceBonusTargetPct, ceBonusMax);

    const fundisaMax = sc.fundisaMaxPts ?? 2;
    const fundisaTargetPct = sc.fundisaNpatTarget ?? 0.002;
    const fundisaScore = safeRatio(data.fundisaSpend ?? 0, npat * fundisaTargetPct, fundisaMax);

    score = sedScore + ceScore + ceBonusScore + fundisaScore;
    target = npat * npatTargetPct;
  } else {
    target = npat * npatTargetPct;
    score = safeRatio(rowSpend, target, maxPoints);
  }

  const totalSpend = rowSpend + (data.ceSpend ?? 0) + (data.ceBonusSpend ?? 0) + (data.fundisaSpend ?? 0);
  const total = round2(clampScore(score, maxPoints));
  console.log(`[SCORING-TRACE] calculateSedScore result: ${total} / ${maxPoints}`);

  return {
    total,
    subMinimumMet: true,
    actualSpend: round2(totalSpend),
    target: round2(target),
    rawStats: { spendSED: round2(totalSpend) },
  };
}
