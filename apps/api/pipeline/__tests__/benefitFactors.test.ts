/**
 * The benefit-factor contract: unrecognised means zero AND reported, and a
 * declared factor of 0.0 is a ruling rather than an absence.
 *
 * Pinned against the Toolkit tables — the only ones left. The server-side
 * engine's own table family was deleted with that engine.
 */
import { describe, it, expect } from 'vitest';
import {
  benefitFactorFor,
  UnrecognisedTypeLog,
  TOOLKIT_BENEFIT_FACTORS_ESD,
  TOOLKIT_BENEFIT_FACTORS_SED,
} from '../rules/benefitFactors.js';

describe('an unrecognised type scores nothing and says so', () => {
  it('returns zero, unrecognised, for a type no table knows', () => {
    const r = benefitFactorFor('not_a_real_type', TOOLKIT_BENEFIT_FACTORS_ESD);
    expect(r.factor).toBe(0);
    expect(r.recognised).toBe(false);
  });

  it('treats a blank or missing type as unrecognised', () => {
    for (const t of [undefined, '', '   ']) {
      expect(benefitFactorFor(t, TOOLKIT_BENEFIT_FACTORS_ESD).recognised).toBe(false);
    }
  });

  it('recognises a DECLARED factor of zero — a ruling, not an absence', () => {
    // If this were a truthiness check a declared 0.0 would read as "unknown"
    // and be reported to a human who has nothing to fix.
    const r = benefitFactorFor('equity_investment', { equity_investment: 0 });
    expect(r.factor).toBe(0);
    expect(r.recognised).toBe(true);
  });

  it('does not treat inherited object keys as contribution types', () => {
    expect(benefitFactorFor('constructor', TOOLKIT_BENEFIT_FACTORS_SED).recognised).toBe(false);
    expect(benefitFactorFor('toString', TOOLKIT_BENEFIT_FACTORS_SED).recognised).toBe(false);
  });

  it('is the 33x case that started this', () => {
    // guarantees carries 0.03. The old `?? 1.0` scored a misread row at 1.0.
    expect(benefitFactorFor('guarantees', TOOLKIT_BENEFIT_FACTORS_ESD).factor).toBe(0.03);
    expect(benefitFactorFor('guarantees', TOOLKIT_BENEFIT_FACTORS_SED).factor).toBe(0.03);
    expect(benefitFactorFor('guarantees_typo', TOOLKIT_BENEFIT_FACTORS_ESD).factor).toBe(0);
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
