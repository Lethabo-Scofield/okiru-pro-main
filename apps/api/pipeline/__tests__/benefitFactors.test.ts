/**
 * The benefit-factor contract, and a tripwire on the numbers.
 *
 * Two jobs:
 *
 *   1. Pin the MECHANISM — unrecognised means zero AND reported, and a declared
 *      factor of 0.0 is a ruling rather than an absence.
 *   2. Pin the DISAGREEMENT — the pipeline and toolkit tables hold different
 *      numbers for the same contribution types. That is not resolved here
 *      (it is a question about the Codes, not the code), but it is enumerated,
 *      so editing either table without settling the other fails loudly instead
 *      of widening the gap in silence.
 */
import { describe, it, expect } from 'vitest';
import {
  benefitFactorFor,
  benefitFactorDivergence,
  UnrecognisedTypeLog,
  PIPELINE_BENEFIT_FACTORS_SD,
  PIPELINE_BENEFIT_FACTORS_SED,
  TOOLKIT_BENEFIT_FACTORS_ESD,
  TOOLKIT_BENEFIT_FACTORS_SED,
} from '../rules/benefitFactors.js';

describe('an unrecognised type scores nothing and says so', () => {
  it('returns zero, unrecognised, for a type no table knows', () => {
    const r = benefitFactorFor('not_a_real_type', PIPELINE_BENEFIT_FACTORS_SD);
    expect(r.factor).toBe(0);
    expect(r.recognised).toBe(false);
  });

  it('treats a blank or missing type as unrecognised', () => {
    for (const t of [undefined, '', '   ']) {
      expect(benefitFactorFor(t, PIPELINE_BENEFIT_FACTORS_SD).recognised).toBe(false);
    }
  });

  it('recognises a DECLARED factor of zero — a ruling, not an absence', () => {
    // equity_investment scores 0.0 under SD on purpose. If this were a
    // truthiness check it would read as "unknown" and be reported to a human
    // who has nothing to fix.
    const r = benefitFactorFor('equity_investment', PIPELINE_BENEFIT_FACTORS_SD);
    expect(r.factor).toBe(0);
    expect(r.recognised).toBe(true);
  });

  it('is the 33x case that started this', () => {
    // guarantees carries 0.03. The old `?? 1.0` scored a misread row at 1.0.
    expect(benefitFactorFor('guarantees', PIPELINE_BENEFIT_FACTORS_SD).factor).toBe(0.03);
    expect(benefitFactorFor('guarantees_typo', PIPELINE_BENEFIT_FACTORS_SD).factor).toBe(0);
  });
});

describe('the silent zero is no longer silent', () => {
  it('says nothing when everything was recognised', () => {
    const log = new UnrecognisedTypeLog();
    expect(log.isEmpty).toBe(true);
    expect(log.message('Supplier Development')).toBeNull();
  });

  it('names the pillar, the count and the types', () => {
    const log = new UnrecognisedTypeLog();
    log.record('guarnatees');
    log.record('   ');
    const message = log.message('Supplier Development')!;
    expect(message).toContain('Supplier Development');
    expect(message).toContain('guarnatees');
    expect(message).toContain('(blank)');
    expect(message).toContain('ZERO');
  });

  it('reports each distinct type once, however many rows carried it', () => {
    const log = new UnrecognisedTypeLog();
    log.record('mystery');
    log.record('mystery');
    log.record('mystery');
    expect(log.types).toEqual(['mystery']);
  });
});

describe('the two factor families disagree, and the disagreement is pinned', () => {
  const esd = benefitFactorDivergence(PIPELINE_BENEFIT_FACTORS_SD, TOOLKIT_BENEFIT_FACTORS_ESD);
  const sed = benefitFactorDivergence(PIPELINE_BENEFIT_FACTORS_SED, TOOLKIT_BENEFIT_FACTORS_SED);

  it('ESD/SD disagrees on exactly these contribution types', () => {
    // If this list changes, someone edited a table. Either the disagreement was
    // settled (update this test AND say which source ruled) or it just got
    // wider (do not).
    expect(esd.map((d) => d.contributionType)).toEqual([
      'employee_time',
      'equity_investment',
      'interest_free_loan',
      'lower_interest_rate',
      'minority_investment',
      'overhead_costs',
      'professional_services_discount',
      'professional_services_discounted',
      'professional_services_free',
      'shorter_payment_periods',
      'shorter_payment_terms',
      'standard_loan',
    ]);
  });

  it('SED disagrees on exactly these contribution types', () => {
    expect(sed.map((d) => d.contributionType)).toEqual([
      'equity_investment',
      'interest_free_loan',
      'lower_interest_rate',
      'minority_investment',
      'professional_services_discounted',
      'professional_services_free',
      'shorter_payment_periods',
      'shorter_payment_terms',
      'standard_loan',
    ]);
  });

  it('records how far apart the worst offender is', () => {
    const shorterPayment = esd.find((d) => d.contributionType === 'shorter_payment_terms')!;
    // 0.70 against 0.15 — the same contribution recognised nearly 5x differently
    // depending on which engine scored it.
    expect(shorterPayment.pipeline).toBe(0.7);
    expect(shorterPayment.toolkit).toBe(0.15);
    expect(shorterPayment.spread).toBeCloseTo(4.667, 2);
  });

  it('agrees on the types nobody disputes', () => {
    for (const type of ['grant', 'direct_cost', 'cost_covering', 'discounts', 'guarantees']) {
      expect(PIPELINE_BENEFIT_FACTORS_SD[type]).toBe(TOOLKIT_BENEFIT_FACTORS_ESD[type]);
    }
  });

  it('reports a type present in one family and absent from the other', () => {
    // lower_interest_rate exists only in the pipeline tables.
    const orphan = esd.find((d) => d.contributionType === 'lower_interest_rate')!;
    expect(orphan.pipeline).toBe(0.7);
    expect(orphan.toolkit).toBeNull();
    expect(orphan.spread).toBeNull();
  });
});
