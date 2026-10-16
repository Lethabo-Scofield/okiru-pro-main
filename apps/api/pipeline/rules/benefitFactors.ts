/**
 * Benefit factors — the one mechanism, and the one table the live scorer uses.
 *
 * THE DEFECT CLASS THIS CLOSES
 *
 * Call it a SILENT RESOLUTION: an input the code does not recognise is turned
 * into a number instead of an exception, and nothing downstream can tell that
 * apart from evidence. It has two faces, and this repo had both:
 *
 *   GENEROUS     `c.benefitFactor ?? 1.0` — an unrecognised contribution type
 *                recognised at ONE HUNDRED PERCENT. A `guarantees` row carries
 *                0.03; misread, it scored 1.0 — a 33x overstatement.
 *
 *   SILENT ZERO  `factors[c.type] ?? 0` — correct arithmetic, and still silent.
 *                A real contribution whose type was mistyped vanishes from the
 *                score with no warning. "Scores nothing" is not "is nothing".
 *
 * Zero is the right ARITHMETIC (never pay for evidence you cannot read), so it
 * stays. What changes is that the reader is told: `recognised: false` travels
 * with every factor, callers collect the unrecognised types, and a human
 * resolves them instead of a `??` doing it in the dark.
 *
 * The tables below are the Toolkit's (apps/web/Toolkit/src/lib/calculators/
 * esd-sed.ts), the copy that scores every scorecard. A second family, carried
 * by a server-side copy of the engine that no screen used, held different
 * numbers for the same types; it was deleted with that engine.
 */

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
 * `hasOwnProperty`, not a truthiness check: a declared factor of `0.0` is a
 * real, deliberate ruling that the contribution earns nothing, and must not be
 * mistaken for an absent entry that needs a human.
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
// The toolkit tables (apps/web/Toolkit/src/lib/calculators/esd-sed.ts)
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
