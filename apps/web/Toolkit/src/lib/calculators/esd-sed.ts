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
import {
  benefitFactorFor,
  canonicalContributionType,
  TOOLKIT_BENEFIT_FACTORS_ESD as ESD_BENEFIT_FACTORS,
  TOOLKIT_BENEFIT_FACTORS_SED as SED_BENEFIT_FACTORS,
} from '../../../../../api/pipeline/rules/benefitFactors';
import { daysBetween, parseCalcDate, yearFrac30360US } from './toolkitDates';
import { formatRand, ratioLineNote } from './calcNotes';

// ESD (RCOGP slides 79-80) and SED (RCOGP slide 52) benefit factors now live in
// pipeline/rules/benefitFactors.ts, imported above under their original names.
// They moved because a SECOND, different set of the same factors exists in the
// pipeline, and the two need to be readable side by side.
// @domain-rule pillar:esd, slides:79,80
// @domain-rule pillar:sed, slide:52
// @see docs/domain/pillars/05_enterprise_supplier_dev.md#qualifying-contributions
// @see docs/domain/pillars/06_socioeconomic_dev.md#qualifying-contributions

export interface EsdSubLine {
  name: string;
  target: string;
  weighting: number;
  score: number;
  isBonus?: boolean;
  /** The line's arithmetic in plain English. */
  note?: string;
}

export interface EsdResult {
  /**
   * Contribution types we could not recognise, and the rand value excluded
   * because of them. Nothing is scored from these — a reviewer has to say what
   * the rows actually are. Empty on a clean case.
   */
  unrecognisedTypes: string[];
  excludedSpend: number;
  /**
   * ESD rows whose beneficiary does not qualify (not an EME/QSE ≥51% black
   * owned, nor a graduated one ≥51% black and flow-through black owned): a
   * determined zero under the toolkit's rule, not an unknown. Rand value and
   * count, so the gap is visible.
   */
  nonQualifyingSpend: number;
  nonQualifyingCount: number;
  supplierDev: number;
  enterpriseDev: number;
  graduationBonus: number;
  jobsCreatedBonus: number;
  /** FSC stockbroker / fund-manager ED bonus (0 unless sector enables it). */
  stockbrokerBonus: number;
  sdTotal: number;
  edTotal: number;
  /** SD and ED before rounding: the scorecard adds these, as the toolkit adds full precision. */
  sdExactTotal?: number;
  edExactTotal?: number;
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
  /**
   * Contribution types we could not recognise, and the rand value excluded
   * because of them. Nothing is scored from these — a reviewer has to say what
   * the rows actually are. Empty on a clean case.
   */
  unrecognisedTypes: string[];
  excludedSpend: number;
  /**
   * Where the sector counts sector-specific initiatives only
   * (sed.sectorSpecificInitiatives): the contributions that did not count for
   * it — answered No ('exclude_no'), or not answered Yes ('require_yes') — and
   * their rand value, none of which is scored. Absent elsewhere.
   */
  notSectorSpecific?: { spend: number; count: number; rule: 'exclude_no' | 'require_yes' };
  total: number;
  /** The total before rounding: the scorecard adds these, as the toolkit adds full precision. */
  exactTotal?: number;
  subMinimumMet: boolean;
  actualSpend: number;
  target: number;
  /** The single SED line with its arithmetic note (the scorecard can render it verbatim). */
  subLines: EsdSubLine[];
  rawStats: {
    spendSED: number;
  };
}

/**
 * The benefit factor for one contribution — or nothing, when we do not know.
 *
 * This file wrote the rule; `pipeline/rules/benefitFactors.ts` now OWNS it, and
 * the pipeline's two copies of the same calculation call the same function
 * rather than each carrying their own `??` default. Re-exported here so the
 * toolkit's existing importers are unaffected.
 *
 * The rule, for the record: an unrecognised type used to be recognised at ONE
 * HUNDRED PERCENT, and upstream made that routine rather than rare —
 * `mapContributionType` fell through to "direct_cost" for any unmatched
 * string — so a misread type got full marks instead of a flag. A `guarantees`
 * row carries 0.03; misread it scored 1.0, a 33x overstatement, and on an
 * elective best-four-of-seven scorecard the inflated pillar is exactly the one
 * that gets elected.
 */
export { benefitFactorFor };

/**
 * The ESD factor table for a sector: the toolkit table, then the sector's own
 * CalculatorConfig.benefitFactors (e.g. RCOGP Generic's 50% guarantees).
 *
 * Only a CANONICAL key may override. The bundled sector lists still carry
 * legacy aliases with placeholder values — `equity_investment: 0.0`,
 * `lower_interest_rate: 0.0` — and resolving those through the alias table
 * would zero minority investment and the computed lower-interest factor.
 *
 * SED never reads the sector list: it was built as ESD factors (sdFactor) and,
 * applied to SED, turned the SED table's 80% rows into ESD's 60/70%.
 */
function buildEsdBenefitFactors(config?: CalculatorConfig): Record<string, number> {
  const factors = { ...ESD_BENEFIT_FACTORS };
  if (config?.benefitFactors && Array.isArray(config.benefitFactors)) {
    for (const bf of config.benefitFactors) {
      const key = String(bf.type ?? '').trim();
      if (canonicalContributionType(key) !== key) continue;
      if (!Object.prototype.hasOwnProperty.call(ESD_BENEFIT_FACTORS, key)) continue;
      if (!Number.isFinite(bf.factor)) continue;
      factors[key] = bf.factor;
    }
  }
  // Opt-in (FSC): types the sector's own toolkit recognises beyond the table.
  for (const [key, factor] of Object.entries(config?.esd?.additionalContributionFactors ?? {})) {
    if (Number.isFinite(factor) && !Object.prototype.hasOwnProperty.call(factors, key)) factors[key] = factor;
  }
  return factors;
}

const OWNED_51 = 0.51;
/** 'ESD Data'[Qualify?]: a graduated beneficiary qualifies within 5 years of first assistance. */
const FIRST_ASSISTANCE_WINDOW_YEARS = 5;
/** 'ESD Data'[Benefit Factor [Shorter payments]]: 15%, less 1 point per day to pay. */
const SHORTER_PAYMENT_BASE = 0.15;
const SHORTER_PAYMENT_MAX_DAYS = 14;

const isSmall = (size: unknown) => size === 'eme' || size === 'qse';

/** True when the row carries the beneficiary facts the toolkit qualifies on. */
function hasBeneficiaryFacts(c: Contribution): boolean {
  return c.beneficiaryCurrentSize != null || c.beneficiaryBlackOwnership != null;
}

/**
 * 'ESD Data'[Recognised Amount]: a contribution counts only when the
 * beneficiary is an EME/QSE at least 51% black owned, or was an EME/QSE when
 * first assisted and — now Generic — is still ≥51% black owned and ≥51%
 * flow-through black owned. (The toolkit's two employee-time branches after
 * these can never be reached and are not ported.)
 */
export function esdBeneficiaryCounts(c: Contribution): boolean {
  const bo = Number(c.beneficiaryBlackOwnership) || 0;
  if (isSmall(c.beneficiaryCurrentSize) && bo >= OWNED_51) return true;
  return isSmall(c.beneficiarySizeWhenFirstAssisted)
    && c.beneficiaryCurrentSize === 'generic'
    && bo >= OWNED_51
    && (Number(c.beneficiaryFlowThroughOwnership) || 0) >= OWNED_51;
}

/**
 * 'ESD Data'[Qualify?] — stricter than recognition for a graduated
 * beneficiary: it must also have been ≥51% black owned when first assisted,
 * and first assisted no more than five years before the data date. Decides
 * whether the computed lower-interest / shorter-payment factors apply.
 */
function esdBeneficiaryQualifies(c: Contribution, asOf: Date | null): boolean {
  const bo = Number(c.beneficiaryBlackOwnership) || 0;
  if (isSmall(c.beneficiaryCurrentSize) && bo >= OWNED_51) return true;
  const first = parseCalcDate(c.firstAssistanceDate);
  const asOfRow = asOf ?? parseCalcDate(c.transactionDate);
  if (!first || !asOfRow || first.getTime() > asOfRow.getTime()) return false;
  const years = yearFrac30360US(first, asOfRow);
  return isSmall(c.beneficiarySizeWhenFirstAssisted)
    && years > 0 && years <= FIRST_ASSISTANCE_WINDOW_YEARS
    && c.beneficiaryCurrentSize === 'generic'
    && (Number(c.beneficiaryBlackOwnershipWhenFirstAssisted) || 0) >= OWNED_51
    && bo >= OWNED_51
    && (Number(c.beneficiaryFlowThroughOwnership) || 0) >= OWNED_51;
}

/** 15% − days/100 for an invoice paid within 14 days; 0 later, or without both dates. */
function shorterPaymentFactor(c: Contribution): number {
  const invoice = parseCalcDate(c.invoiceDate);
  const payment = parseCalcDate(c.paymentDate);
  if (!invoice || !payment) return 0;
  const days = daysBetween(invoice, payment);
  if (days < 0 || days > SHORTER_PAYMENT_MAX_DAYS) return 0;
  return Math.max(0, SHORTER_PAYMENT_BASE - days / 100);
}

/**
 * (prime − actual) from the row's rates; 0 without both, never negative.
 *
 * Both Empower templates compute 'ESD Data'!AF = [Prime Rate] − [Actual
 * Interest Rate] with no floor, so a loan above prime is recognised at a
 * NEGATIVE amount that cancels other contributions, and a blank actual rate
 * reads as 0% (the loan counts at the full prime rate). Neither is a benefit
 * the beneficiary received; not ported (docs/toolkits/parity/findings/ict_generic.md).
 */
function lowerInterestFactor(c: Contribution): number {
  const prime = Number(c.primeRate);
  const actual = Number(c.actualInterestRate);
  if (c.primeRate == null || c.actualInterestRate == null || !Number.isFinite(prime) || !Number.isFinite(actual)) return 0;
  return Math.max(0, prime - actual);
}

interface EsdRowReading {
  recognised: boolean;
  /** False when the beneficiary does not qualify under the toolkit's rule. */
  beneficiaryCounts: boolean;
  factor: number;
}

/** How a sector's toolkit reads ESD rows (from CalculatorConfig.esd). */
interface EsdRowRules {
  applyQualification: boolean;
  computedFactorsForEveryRow: boolean;
}

function esdRowRules(ec: Partial<NonNullable<CalculatorConfig['esd']>> | undefined): EsdRowRules {
  return {
    applyQualification: ec?.applyBeneficiaryQualification === true,
    computedFactorsForEveryRow: ec?.computedFactorsForEveryRow === true,
  };
}

const hasPaymentDates = (c: Contribution) =>
  c.invoiceDate != null && c.invoiceDate !== '' && c.paymentDate != null && c.paymentDate !== '';

/**
 * One ESD row's benefit factor and whether it counts at all.
 *
 * The beneficiary rule applies only where the sector's toolkit gates on it
 * (RCOGP Generic: esd.applyBeneficiaryQualification) and the row carries the
 * beneficiary's size or black ownership; older rows without them keep scoring
 * on the factor alone, as they always have. Where the template computes the
 * shorter-payment and lower-rate factors for every row (ICT Generic:
 * esd.computedFactorsForEveryRow), they are computed whatever the beneficiary.
 */
function readEsdRow(
  c: Contribution,
  table: Record<string, number>,
  asOf: Date | null,
  rules: EsdRowRules,
): EsdRowReading {
  const key = canonicalContributionType(c.type);
  const declared = benefitFactorFor(key, table);
  if (!declared.recognised) return { recognised: false, beneficiaryCounts: true, factor: 0 };

  const factsPresent = rules.applyQualification && hasBeneficiaryFacts(c);
  const beneficiaryCounts = factsPresent ? esdBeneficiaryCounts(c) : true;
  // Without beneficiary facts, the computed factors still apply where the row
  // carries what they are computed from.
  const qualifies = factsPresent ? esdBeneficiaryQualifies(c, asOf) : true;

  let factor = declared.factor;
  if (key === 'lower_interest_loan' || key === 'lower_dividend_investment') {
    factor = qualifies || rules.computedFactorsForEveryRow ? lowerInterestFactor(c) : declared.factor;
  } else if (key === 'shorter_payment_terms') {
    // Where the template computes the factor for every such row (ICT
    // Generic), a row without both dates is recognised at 0, not at the
    // table's 15%.
    if (rules.computedFactorsForEveryRow || (factsPresent ? qualifies : hasPaymentDates(c))) {
      factor = shorterPaymentFactor(c);
    }
  }
  return { recognised: true, beneficiaryCounts, factor };
}

/**
 * What one ESD row adds to its element's recognised spend: its amount times
 * its benefit factor, or 0 when the row is not counted (type not recognised,
 * Supplier/Enterprise Development not stated, beneficiary not qualifying).
 * The same reading calculateEsdScore sums; the parity checks compare it with
 * the toolkit's 'ESD Data'[Recognised Amount] row by row.
 */
export function esdRecognisedValue(c: Contribution, config?: CalculatorConfig, measurementPeriodEnd?: string): number {
  const ec = config?.esd as Partial<NonNullable<CalculatorConfig['esd']>> | undefined;
  const row = readEsdRow(c, buildEsdBenefitFactors(config), parseCalcDate(measurementPeriodEnd), esdRowRules(ec));
  if (!row.recognised || !row.beneficiaryCounts) return 0;
  if (c.category !== 'supplier_development' && c.category !== 'enterprise_development') return 0;
  return (Number(c.amount) || 0) * row.factor;
}

interface CategorizedEsd {
  sdSpend: number;
  edSpend: number;
  unrecognisedTypes: string[];
  excludedSpend: number;
  nonQualifying: { sd: number; ed: number; count: number; sdCount: number; edCount: number };
  /** Shorter-payment rows recognised at 0 because they carry no invoice and payment dates. */
  undatedShorterPayment: { sd: number; ed: number; sdCount: number; edCount: number };
}

function categorizeContributions(
  contributions: Contribution[],
  benefitFactors: Record<string, number>,
  asOf: Date | null,
  rules: EsdRowRules,
): CategorizedEsd {
  let sdSpend = 0;
  let edSpend = 0;
  const unrecognisedTypes = new Set<string>();
  let excludedSpend = 0;
  const nonQualifying = { sd: 0, ed: 0, count: 0, sdCount: 0, edCount: 0 };
  const undatedShorterPayment = { sd: 0, ed: 0, sdCount: 0, edCount: 0 };

  for (const c of contributions) {
    const amount = Number(c.amount) || 0;
    const row = readEsdRow(c, benefitFactors, asOf, rules);
    if (!row.recognised) {
      unrecognisedTypes.add((c.type ?? '').trim() || '(blank)');
      excludedSpend += amount;
      continue;
    }
    if (c.category !== 'supplier_development' && c.category !== 'enterprise_development') {
      // The row is an ESD contribution, but nobody has said whether it is
      // Supplier or Enterprise Development — and the split decides a
      // sub-minimum, so it may not be guessed. Excluded and reported.
      const rawCategory = String(c.category ?? '').trim();
      unrecognisedTypes.add(rawCategory ? 'category "' + rawCategory + '"' : 'category (blank)');
      excludedSpend += amount;
      continue;
    }
    const isSd = c.category === 'supplier_development';
    if (!row.beneficiaryCounts) {
      nonQualifying.count += 1;
      if (isSd) { nonQualifying.sd += amount; nonQualifying.sdCount += 1; }
      else { nonQualifying.ed += amount; nonQualifying.edCount += 1; }
      continue;
    }
    const value = amount * row.factor;
    if (isSd) sdSpend += value;
    else edSpend += value;
    if (rules.computedFactorsForEveryRow && amount > 0 && !hasPaymentDates(c)
      && canonicalContributionType(c.type) === 'shorter_payment_terms') {
      if (isSd) { undatedShorterPayment.sd += amount; undatedShorterPayment.sdCount += 1; }
      else { undatedShorterPayment.ed += amount; undatedShorterPayment.edCount += 1; }
    }
  }

  return { sdSpend, edSpend, unrecognisedTypes: Array.from(unrecognisedTypes), excludedSpend, nonQualifying, undatedShorterPayment };
}

function undatedShorterPaymentClause(amount: number, count: number): string {
  if (count <= 0) return '';
  return `; ${formatRand(amount)} across ${count} shorter-payment contribution${count === 1 ? '' : 's'} recognised at 0: no invoice and payment dates to measure the payment period`;
}

function nonQualifyingClause(amount: number, count: number): string {
  if (count <= 0) return '';
  return `; not counted: ${formatRand(amount)} across ${count} contribution${count === 1 ? '' : 's'} whose beneficiary is not an EME/QSE ≥51% black owned (or a graduate of one still ≥51% black and flow-through black owned)`;
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

  const esdFactors = buildEsdBenefitFactors(config);
  const { sdSpend, edSpend, unrecognisedTypes, excludedSpend, nonQualifying, undatedShorterPayment } = categorizeContributions(
    contributions,
    esdFactors,
    parseCalcDate(data.measurementPeriodEnd),
    esdRowRules(ec),
  );

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
  const legacyEsd = (config?.pillarConfigs as { esd?: { sdSubMinimumPercent?: number; edSubMinimumPercent?: number } } | undefined)?.esd;
  const sdSubMinPct = legacyEsd?.sdSubMinimumPercent
    ?? config?.pillarConfigs?.supplierDevelopment?.subMinimumPercent
    ?? 0;
  const edSubMinPct = legacyEsd?.edSubMinimumPercent
    ?? config?.pillarConfigs?.enterpriseDevelopment?.subMinimumPercent
    ?? 0;
  // Both sub-minimums are measured on the BASE line, bonuses excluded — the
  // toolkit's Summary Scorecard tests F59 ≥ 40% × C59 and F62 ≥ 40% × C62, the
  // same way the PP and Skills sub-minimums leave their bonus rows out.
  const sdSubMinimumMet =
    supplierDevMax <= 0 || sdSubMinPct <= 0 ||
    sdScore >= (supplierDevMax * sdSubMinPct / 100);
  const edSubMinimumMet =
    enterpriseDevMax <= 0 || edSubMinPct <= 0 ||
    edScore >= (enterpriseDevMax * edSubMinPct / 100);

  const sdSubLines: EsdSubLine[] = [
    {
      name: "Annual value of all Supplier Development contributions",
      target: formatNpatTargetLabel(supplierDevTargetPct),
      weighting: supplierDevMax,
      score: sdScore,
      note: ratioLineNote({ spend: sdSpend, denominator: npat, denominatorLabel: 'NPAT', target: supplierDevTargetPct, maxPoints: supplierDevMax })
        + nonQualifyingClause(nonQualifying.sd, nonQualifying.sdCount)
        + undatedShorterPaymentClause(undatedShorterPayment.sd, undatedShorterPayment.sdCount),
    },
  ];

  const edSubLines: EsdSubLine[] = [
    {
      name: "Annual value of Enterprise Development contributions",
      target: formatNpatTargetLabel(enterpriseDevTargetPct),
      weighting: enterpriseDevMax,
      score: edScore,
      note: ratioLineNote({ spend: edSpend, denominator: npat, denominatorLabel: 'NPAT', target: enterpriseDevTargetPct, maxPoints: enterpriseDevMax })
        + nonQualifyingClause(nonQualifying.ed, nonQualifying.edCount)
        + undatedShorterPaymentClause(undatedShorterPayment.ed, undatedShorterPayment.edCount),
    },
    {
      name: "Graduation of ED beneficiaries to SD beneficiaries", target: "Tick-box", weighting: edGraduationBonusMax, score: graduationBonusScore, isBonus: true,
      note: data.graduationBonus
        ? `At least one ESD beneficiary graduated from Enterprise to Supplier Development: ${graduationBonusScore} of ${edGraduationBonusMax}.`
        : 'No ESD beneficiary is marked as graduated to Supplier Development.',
    },
    {
      name: "Jobs created from ED & SD initiatives", target: edJobsBonusMax >= 2 ? "≤10% → 1pt / ≥11% → 2pts" : "Tick-box", weighting: edJobsBonusMax, score: jobsCreatedBonusScore, isBonus: true,
      note: data.jobsCreatedBonus
        ? `At least one job was created through ESD initiatives: ${jobsCreatedBonusScore} of ${edJobsBonusMax}.`
        : 'No ESD initiative is marked as having created a job.',
    },
  ];
  if (edStockbrokerBonusMax > 0) {
    edSubLines.push({
      name: "ED support of black stockbrokers / fund managers / intermediaries",
      target: `${(edStockbrokerTargetPct * 100).toFixed(1)}% of NPAT`,
      weighting: edStockbrokerBonusMax,
      score: stockbrokerBonusScore,
      isBonus: true,
      note: ratioLineNote({ spend: stockbrokerSpend, denominator: npat, denominatorLabel: 'NPAT', target: edStockbrokerTargetPct, maxPoints: edStockbrokerBonusMax }),
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
    sdExactTotal: sdTotal,
    unrecognisedTypes,
    excludedSpend: round2(excludedSpend),
    nonQualifyingSpend: round2(nonQualifying.sd + nonQualifying.ed),
    nonQualifyingCount: nonQualifying.count,
    edTotal: round2(edTotal),
    edExactTotal: edTotal,
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
  return result;
}

export function calculateSedScore(
  data: SEDData,
  npat: number,
  config?: CalculatorConfig,
  opts?: { isReinsurer?: boolean },
): SedResult {
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

  // SED's own table ('ESD and SED Calcs' A37:D43), never the sector's ESD list.
  // The toolkit ignores "% of spend benefiting black individuals" when it
  // scores SED (SED Data[Recognised Amount] = Amount × Benefit Factor), and so
  // does this.
  const sedFactors = SED_BENEFIT_FACTORS;
  const unrecognisedTypes = new Set<string>();
  let excludedSpend = 0;
  // Sector-specific initiatives only ('SED Data'[Recognised Amount] is 0
  // unless the row is one), by the sector's reading of an unanswered row:
  // 'exclude_no' (AgriBEE Generic, ICT Generic) drops a row answered No and
  // still counts one nobody answered; 'require_yes' (ICT QSE) counts only a
  // Yes, as IF([ICT Specific Initiative?]="Yes", …, 0) does.
  const initiativeRule = sc.sectorSpecificInitiatives;
  const countsAsInitiative = (c: Contribution): boolean =>
    initiativeRule === 'require_yes' ? c.isSectorSpecificInitiative === true
      : initiativeRule === 'exclude_no' ? c.isSectorSpecificInitiative !== false
        : true;
  let notInitiativeSpend = 0;
  let notInitiativeCount = 0;
  const rowSpend = contributions.reduce((acc, c) => {
    const amount = Number(c.amount) || 0;
    if (!countsAsInitiative(c)) {
      notInitiativeSpend += amount;
      notInitiativeCount += 1;
      return acc;
    }
    const { factor, recognised } = benefitFactorFor(canonicalContributionType(c.type), sedFactors);
    if (!recognised) {
      unrecognisedTypes.add((c.type ?? '').trim() || '(blank)');
      excludedSpend += amount;
      return acc;
    }
    return acc + amount * factor;
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
  const excludedClause = (excludedSpend > 0
    ? `; ${formatRand(excludedSpend)} not counted: contribution type not recognised`
    : '') + (initiativeRule === 'exclude_no' && notInitiativeSpend > 0
    ? `; ${formatRand(notInitiativeSpend)} not counted: not a sector-specific initiative`
    : '') + (initiativeRule === 'require_yes' && notInitiativeCount > 0
    ? `; ${formatRand(notInitiativeSpend)} across ${notInitiativeCount} contribution${notInitiativeCount === 1 ? '' : 's'} not counted: ` +
      `not marked as ${String(sectorCode ?? '').toUpperCase() === 'ICT' ? 'an ICT-specific' : 'a sector-specific'} initiative`
    : '');

  return {
    unrecognisedTypes: Array.from(unrecognisedTypes),
    excludedSpend: round2(excludedSpend),
    ...(initiativeRule ? { notSectorSpecific: { spend: round2(notInitiativeSpend), count: notInitiativeCount, rule: initiativeRule } } : {}),
    total,
    exactTotal: clampScore(score, maxPoints),
    subMinimumMet: true,
    actualSpend: round2(totalSpend),
    target: round2(target),
    subLines: [{
      name: 'Annual value of all SED contributions',
      target: formatNpatTargetLabel(npatTargetPct),
      weighting: maxPoints,
      score: total,
      note: (usesSplitModel
        ? `SED and consumer-education lines together: ${total.toFixed(2)} of ${maxPoints}.`
        : ratioLineNote({ spend: rowSpend, denominator: npat, denominatorLabel: 'NPAT', target: npatTargetPct, maxPoints })) + excludedClause,
    }],
    rawStats: { spendSED: round2(totalSpend) },
  };
}
