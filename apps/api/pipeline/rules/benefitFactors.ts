/**
 * Benefit factors — ONE mechanism, and an honest record of where the numbers
 * still disagree.
 *
 * THE DEFECT CLASS THIS CLOSES
 *
 * Call it a SILENT RESOLUTION: an input the code does not recognise is turned
 * into a number instead of an exception, and nothing downstream can tell that
 * apart from evidence. It has two faces, and this repo had both — for the same
 * field, in three copies of the same calculation:
 *
 *   GENEROUS   `calculationEngine`   `c.benefitFactor ?? 1.0`
 *              An unrecognised contribution type was recognised at ONE HUNDRED
 *              PERCENT. A `guarantees` row carries 0.03; misread, it scored
 *              1.0 — a 33x overstatement, and on an elective best-four-of-seven
 *              scorecard the inflated pillar is the one that gets elected.
 *
 *   SILENT ZERO `pillarCalculators`  `factors.sd[c.type] ?? … ?? 0`
 *              The generous default was fixed to 0 — correct, and still silent.
 *              A real contribution whose type was mistyped now vanishes from
 *              the score with no warning, which is a wrong number in the other
 *              direction. "Scores nothing" is not the same as "is nothing".
 *
 * Zero is the right ARITHMETIC (never pay for evidence you cannot read), so it
 * stays. What changes is that the reader is told: `recognised: false` travels
 * with every factor, callers collect the unrecognised types, and a human
 * resolves them instead of a `??` doing it in the dark.
 *
 * WHAT IS **NOT** UNIFIED HERE, AND WHY
 *
 * Collapsing three copies of the mechanism is safe. Collapsing the TABLES is
 * not, because they hold materially different numbers for the same regulatory
 * concept — `overhead_costs` is 0.70 in one and 1.00 in the other, and
 * `shorter_payment_terms` is 0.15 against 0.70. Picking either set silently
 * moves published scores, and which is right is a question about the Codes,
 * not about this codebase.
 *
 * So both families live here, side by side, each still used by exactly the
 * callers that used it before — zero score movement — and `benefitFactorDivergence()`
 * enumerates every disagreement so a test can pin it and an expert can rule on
 * it. The drift is now a visible, enumerable list instead of two files nobody
 * diffed.
 */

/** A contribution type → benefit factor lookup. */
export type BenefitFactorTable = Record<string, number>;

export interface BenefitFactorReading {
  /** The factor to apply. Zero when the type is not recognised. */
  factor: number;
  /** False when the table has no entry for this type — report, do not score. */
  recognised: boolean;
}

/**
 * The factor for one contribution type, or nothing when the type is unknown.
 *
 * `hasOwnProperty`, not a truthiness check: a declared factor of `0.0`
 * (`equity_investment` under SD) is a real, deliberate ruling that the
 * contribution earns nothing, and must not be mistaken for an absent entry that
 * needs a human.
 */
export function benefitFactorFor(
  type: string | undefined,
  table: BenefitFactorTable,
): BenefitFactorReading {
  const key = (type ?? '').trim();
  if (key && Object.prototype.hasOwnProperty.call(table, key)) {
    return { factor: table[key], recognised: true };
  }
  return { factor: 0, recognised: false };
}

/** How an unrecognised type should read in a warning. */
export function unrecognisedLabel(type: string | undefined): string {
  return (type ?? '').trim() || '(blank)';
}

// ---------------------------------------------------------------------------
// Family A — the pipeline tables (apps/api/pipeline/rules/pillarCalculators.ts)
//
// PROVENANCE: none recorded. These arrived with the pipeline port and cite no
// source. That asymmetry is itself evidence — Family B cites the RCOGP decks —
// but it is not a ruling, and nothing here assumes one.
// ---------------------------------------------------------------------------

export const PIPELINE_BENEFIT_FACTORS_SD: BenefitFactorTable = {
  grant: 1.0, direct_cost: 1.0, cost_covering: 1.0, discounts: 1.0,
  overhead_costs: 1.0, interest_free_loan: 1.0,
  standard_loan: 0.7, guarantees: 0.03, lower_interest_rate: 0.7, lower_interest_loan: 0.7,
  minority_investment: 1.0, professional_services_free: 1.0,
  professional_services_discounted: 0.8, professional_services_discount: 0.8,
  employee_time: 1.0, shorter_payment_periods: 0.7, shorter_payment_terms: 0.7,
  equity_investment: 0.0,
};

export const PIPELINE_BENEFIT_FACTORS_ED: BenefitFactorTable = {
  grant: 1.0, direct_cost: 1.0, cost_covering: 1.0, discounts: 1.0,
  overhead_costs: 1.0, interest_free_loan: 1.0,
  standard_loan: 0.7, guarantees: 0.03, lower_interest_rate: 0.7, lower_interest_loan: 0.7,
  minority_investment: 1.0, professional_services_free: 1.0,
  professional_services_discounted: 0.8, professional_services_discount: 0.8,
  employee_time: 1.0, shorter_payment_periods: 0.0, shorter_payment_terms: 0.0,
  equity_investment: 1.0,
};

export const PIPELINE_BENEFIT_FACTORS_SED: BenefitFactorTable = {
  grant: 1.0, direct_cost: 1.0, cost_covering: 1.0, discounts: 1.0,
  overhead_costs: 0.8, interest_free_loan: 1.0,
  standard_loan: 0.7, guarantees: 0.03, lower_interest_rate: 0.7, lower_interest_loan: 0.7,
  minority_investment: 1.0, professional_services_free: 1.0,
  professional_services_discounted: 0.8, professional_services_discount: 0.8,
  employee_time: 0.8, shorter_payment_periods: 0.7, shorter_payment_terms: 0.7,
  equity_investment: 1.0,
};

// ---------------------------------------------------------------------------
// Family B — the toolkit tables (apps/web/Toolkit/src/lib/calculators/esd-sed.ts)
//
// PROVENANCE: RCOGP slides 79-80 (ESD) and slide 52 (SED), per the docblocks
// these tables carried before they moved here.
// @see docs/domain/pillars/05_enterprise_supplier_dev.md#qualifying-contributions
// @see docs/domain/pillars/06_socioeconomic_dev.md#qualifying-contributions
// ---------------------------------------------------------------------------

export const TOOLKIT_BENEFIT_FACTORS_ESD: BenefitFactorTable = {
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

export const TOOLKIT_BENEFIT_FACTORS_SED: BenefitFactorTable = {
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

// ---------------------------------------------------------------------------
// The disagreement, enumerated
// ---------------------------------------------------------------------------

export interface FactorDisagreement {
  contributionType: string;
  pipeline: number | null;
  toolkit: number | null;
  /** Ratio of the larger to the smaller, for ranking by how much money moves. */
  spread: number | null;
}

/**
 * Every contribution type the two families score differently.
 *
 * Computed rather than hand-listed so it can never fall out of date: if someone
 * edits one table, the disagreement list changes and the test that pins it
 * fails. That is the point — the drift becomes loud.
 */
export function benefitFactorDivergence(
  pipeline: BenefitFactorTable,
  toolkit: BenefitFactorTable,
): FactorDisagreement[] {
  const types = new Set<string>();
  Object.keys(pipeline).forEach((k) => types.add(k));
  Object.keys(toolkit).forEach((k) => types.add(k));

  const out: FactorDisagreement[] = [];
  Array.from(types).sort().forEach((contributionType) => {
    const a = Object.prototype.hasOwnProperty.call(pipeline, contributionType)
      ? pipeline[contributionType] : null;
    const b = Object.prototype.hasOwnProperty.call(toolkit, contributionType)
      ? toolkit[contributionType] : null;
    if (a === b) return;
    const spread = a !== null && b !== null && Math.min(a, b) > 0
      ? Math.max(a, b) / Math.min(a, b)
      : null;
    out.push({ contributionType, pipeline: a, toolkit: b, spread });
  });
  return out;
}

/**
 * Collects unrecognised contribution types so a caller can report them once,
 * rather than a `??` swallowing each one where it happens.
 */
export class UnrecognisedTypeLog {
  private readonly seen = new Set<string>();

  record(type: string | undefined): void {
    this.seen.add(unrecognisedLabel(type));
  }

  get types(): string[] {
    return Array.from(this.seen).sort();
  }

  get isEmpty(): boolean {
    return this.seen.size === 0;
  }

  /** A sentence for a warnings channel, or null when there is nothing to say. */
  message(pillar: string): string | null {
    if (this.seen.size === 0) return null;
    const list = this.types.join(', ');
    return (
      `${pillar}: ${this.seen.size} contribution type${this.seen.size === 1 ? '' : 's'} ` +
      `not recognised (${list}). Those contributions scored ZERO — they are not ` +
      `counted against the target. Correct the type, or confirm they are genuinely ` +
      `non-qualifying, before certifying this scorecard.`
    );
  }
}
