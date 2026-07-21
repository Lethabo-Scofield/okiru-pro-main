/**
 * Transport QSE scorecard — pinned to a real verification certificate.
 *
 * GROUND TRUTH: Thandanani Packers & Haulers cc t/a Thandanani Transport,
 * certificate 13609, final BEE verification report dated 30 January 2026
 * (docs/testdocs/Final Report - Thandanani Transport BE13609-300126.pdf),
 * scorecard "Transport Road & Freight - QSE", Integrated Transport Sector Code:
 *
 *   Equity Ownership            25.00
 *   Management Control          27.00
 *   Employment Equity            0.00
 *   Skills Development           0.00
 *   Preferential Procurement    25.00
 *   Enterprise Development       0.00
 *   Socio-Economic Development  25.00
 *   TOTAL                      102.00  → 135% recognition → LEVEL 1
 *
 * The scorecard is measured on ANY FOUR of the seven elements at 25 each, so the
 * denominator is 100 and bonus points can carry a score above it. Three elements
 * reporting 0.00 is not underperformance — they were not among the four measured.
 *
 * This test exists because the config previously modelled "82 compulsory
 * (Ownership + MC + EE) + one elective = 107", which forced EE into the
 * denominator and allowed only one elective. That scored this entity
 * 25 + 27 + 0 + 25 = 77/107 → Level 4, three levels below its certificate.
 */
import { describe, expect, it } from 'vitest';
import {
  TRANSPORT_QSE,
  sumPillarMaxPoints,
  findSectorConfigIntegrityIssues,
} from '../pipeline/sectorConfig.js';

/** Element scores exactly as printed in the certificate. */
const CERTIFICATE = {
  ownership: 25,
  managementControl: 27,
  employmentEquity: 0,
  skillsDevelopment: 0,
  preferentialProcurement: 25,
  enterpriseDevelopment: 0,
  socioEconomicDevelopment: 25,
};
const CERTIFICATE_TOTAL = 102;

/** Mirror of the store's election rule: keep the best `size` of the group. */
function electBestFour(scores: Record<string, number>): number {
  const group = Object.entries(TRANSPORT_QSE.pillarConfigs)
    .filter(([, p]) => p && (p as { chooseOneGroup?: string }).chooseOneGroup)
    .map(([key]) => key);
  const size = TRANSPORT_QSE.electiveGroupSizes?.transport_qse_elective ?? 1;

  return group
    .map((key) => scores[key] ?? 0)
    .sort((a, b) => b - a)
    .slice(0, size)
    .reduce((sum, n) => sum + n, 0);
}

function levelFor(points: number): number {
  const band = TRANSPORT_QSE.levelThresholds.find((t) => points >= t.minPoints);
  return band?.level ?? 9;
}

describe('Transport QSE scorecard (certificate 13609)', () => {
  it('is measured on any four of the seven elements, 25 each → denominator 100', () => {
    expect(TRANSPORT_QSE.electiveGroupSizes?.transport_qse_elective).toBe(4);
    expect(TRANSPORT_QSE.totalMaxPoints).toBe(100);
    // The declared total must equal what the pillars can actually award.
    expect(sumPillarMaxPoints(TRANSPORT_QSE)).toBe(100);
    expect(findSectorConfigIntegrityIssues()).toEqual([]);
  });

  it('treats no element as compulsory — all seven are electable', () => {
    // The old model forced Ownership/MC/EE, which is what pulled EE's 27-point
    // target into the denominator for an entity not measured on it.
    for (const key of ['ownership', 'managementControl', 'employmentEquity'] as const) {
      expect(TRANSPORT_QSE.pillarConfigs[key]?.chooseOneGroup).toBe('transport_qse_elective');
    }
  });

  it('reproduces the certificate: 102 points → Level 1', () => {
    const total = electBestFour(CERTIFICATE);

    expect(total).toBe(CERTIFICATE_TOTAL);
    expect(levelFor(total)).toBe(1);
    // Level 1 carries 135% procurement recognition, as printed on the report.
    expect(TRANSPORT_QSE.levelThresholds.find((t) => t.level === 1)?.recognition).toBe(135);
  });

  it('elects MC + Ownership + PP + SED, and ignores the three zero elements', () => {
    // Bonus points are why the total exceeds the 100 denominator: MC scores 27
    // against a weighting of 25.
    expect(electBestFour(CERTIFICATE)).toBeGreaterThan(TRANSPORT_QSE.totalMaxPoints);
    // Dropping any elected element must lower the total — proving the four that
    // count are the four the certificate shows.
    expect(electBestFour({ ...CERTIFICATE, managementControl: 0 })).toBeLessThan(CERTIFICATE_TOTAL);
    expect(electBestFour({ ...CERTIFICATE, socioEconomicDevelopment: 0 })).toBeLessThan(CERTIFICATE_TOTAL);
    // Raising an unelected element to beat the weakest elected one must promote it.
    expect(electBestFour({ ...CERTIFICATE, skillsDevelopment: 26 })).toBe(CERTIFICATE_TOTAL + 1);
  });

  it('does not regress to the old 107 model', () => {
    // 82 compulsory + one elective would score this entity 77 → Level 4.
    const oldModel = CERTIFICATE.ownership + CERTIFICATE.managementControl
      + CERTIFICATE.employmentEquity + CERTIFICATE.preferentialProcurement;
    expect(oldModel).toBe(77);
    expect(TRANSPORT_QSE.totalMaxPoints).not.toBe(107);
    expect(levelFor(oldModel)).not.toBe(1);
  });

  it('uses the legacy level bands, not amended-codes thresholds scaled to fit', () => {
    const bands = Object.fromEntries(TRANSPORT_QSE.levelThresholds.map((t) => [t.level, t.minPoints]));
    expect(bands[1]).toBe(100);
    expect(bands[2]).toBe(85);
    expect(bands[3]).toBe(75);
    // 89.17 was the old scaled Level 1 (100 × 107/120) — a different scorecard's ladder.
    expect(bands[1]).not.toBeCloseTo(89.17, 1);
  });
});
