/**
 * FSC QSFI — the 100-pt Qualifying Small Financial Institution scorecard.
 *
 * Element weights are gazette-verified (GG 41287 §8.2): 25 + 15 + 25 + 30 + 5
 * = 100. Before this config shipped, an FSC QSE fell through to the 105-pt
 * Others scorecard — a wrong answer rather than a refusal.
 */
import { describe, expect, it } from 'vitest';
import { FSC_QSE_CALCULATOR_CONFIG as CONFIG, isFscQseSector } from '../../sectors/fsc-qse';

describe('FSC QSFI — CalculatorConfig completeness', () => {
  it('loads the gazette element weights: 25+15+25+30+5 = 100', () => {
    const pc = CONFIG.pillarConfigs;
    expect(CONFIG.totalMaxPoints).toBe(100);
    expect(pc?.ownership?.maxPoints).toBe(25);
    expect(pc?.managementControl?.maxPoints).toBe(15);
    expect(pc?.skillsDevelopment?.maxPoints).toBe(25);
    // P&ESD 30 = PP 20 + SD 5 + ED 5 (derived split; total is gazette-fixed).
    expect((pc?.preferentialProcurement?.maxPoints ?? 0)
      + (pc?.supplierDevelopment?.maxPoints ?? 0)
      + (pc?.enterpriseDevelopment?.maxPoints ?? 0)).toBe(30);
    expect(pc?.socioEconomicDevelopment?.maxPoints).toBe(5);
  });

  it('ownership is a priority element with the 40% net-value sub-minimum', () => {
    expect(CONFIG.pillarConfigs?.ownership?.subMinimumPercent).toBe(40);
  });

  it('carries the FS500 SED & Consumer Education split (3 @ 0.6% + 2 @ 0.4%)', () => {
    const sed = CONFIG.sed as Record<string, number>;
    expect(sed.sedBaseMaxPts).toBe(3);
    expect(sed.sedNpatTarget).toBeCloseTo(0.006, 4);
    expect(sed.ceMaxPts).toBe(2);
    expect(sed.ceNpatTarget).toBeCloseTo(0.004, 4);
  });

  it('routes FSC + any QSE spelling to this scorecard', () => {
    expect(isFscQseSector('FSC', 'QSE')).toBe(true);
    expect(isFscQseSector('fsc', 'qse')).toBe(true);
    expect(isFscQseSector('FSC', 'Generic')).toBe(false);
    expect(isFscQseSector('RCOGP', 'QSE')).toBe(false);
  });
});
