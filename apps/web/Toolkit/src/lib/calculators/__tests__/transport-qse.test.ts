import { describe, it, expect } from 'vitest';
import { calculateOwnershipScore } from '../ownership';
import { calculateTransportQseManagement, calculateTransportQseEmploymentEquity } from '../transport';
import { TRANSPORT_QSE_CALCULATOR_CONFIG } from '../../sectors/transport-qse';

// The Transport QSE CalculatorConfig comes from the single production derivation
// (sectorConfigToTransportQseCalculatorConfig) — the same object the store scores
// with. This test used to hand-roll its own copy; that (and two others) drifted
// from production, so they were collapsed onto this one source.
describe('Transport QSE scoring', () => {
  const cfg = TRANSPORT_QSE_CALCULATOR_CONFIG;

  it('loads a 100-point total: any four of seven elements, 25 each', () => {
    // Was 107 ("82 compulsory + one elective"), which forced Employment Equity
    // into the denominator and allowed only one elective. Certificate 13609
    // (Thandanani Transport) scores 102 → Level 1 with EE at 0.00, which that
    // model cannot produce. See apps/api/__tests__/transportQseScorecard.test.ts.
    expect(cfg.totalMaxPoints).toBe(100);
    expect(cfg.electiveGroupSizes?.transport_qse_elective).toBe(4);

    // Element maxima are unchanged — they carry each element's bonus points, and
    // bonuses are why a certified score can exceed the 100-point target.
    expect(cfg.pillarConfigs?.ownership?.maxPoints).toBe(28);
    expect(cfg.pillarConfigs?.managementControl?.maxPoints).toBe(27);
    expect(cfg.pillarConfigs?.employmentEquity?.maxPoints).toBe(27);

    // No element is compulsory: all seven compete for the four measured slots.
    for (const key of ['ownership', 'managementControl', 'employmentEquity', 'skillsDevelopment'] as const) {
      expect(cfg.pillarConfigs?.[key]?.chooseOneGroup).toBe('transport_qse_elective');
    }
  });

  it('scores 100% black ownership at 27/28 with companyValue=0 — indicators score on their own measure', () => {
    const own = calculateOwnershipScore({
      id: '1', clientId: 'c',
      shareholders: [{
        id: '1', name: 'Owner', ownershipType: 'shareholder',
        blackOwnership: 1, blackWomenOwnership: 0.5, shares: 100, shareValue: 1,
        yearsHeld: 5, isDesignatedGroup: false, blackNewEntrant: false,
        votingRightsPercent: 1, economicInterestPercent: 1,
      }],
      companyValue: 0,
      outstandingDebt: 0,
      yearsHeld: 5,
    }, cfg);
    // 27 not 28 since audit item 12a: the shortcut no longer gifts the one
    // point this fixture never evidences (no DG / new-entrant participation).
    expect(own.total).toBe(27);
  });

  it('MC breakdown reconciles to the score and Senior black women do NOT earn the Top-Management bonus', () => {
    // Thandanani: sole executive is a black MAN; a black WOMAN sits at Senior
    // (Admin Manager). The Top-Management black-women bonus must be 0 (EEA9
    // measures Senior separately), the breakdown must reconcile to the score,
    // and a coverage note must SAY why — rather than silently awarding +2.
    const employees = [
      { id: '1', name: 'Director', gender: 'Male' as const, race: 'African' as const, designation: 'Executive Director', isDisabled: false },
      { id: '2', name: 'Admin Manager', gender: 'Female' as const, race: 'Indian' as const, designation: 'Senior', isDisabled: false },
      { id: '3', name: 'Clerk', gender: 'Male' as const, race: 'African' as const, designation: 'Junior', isDisabled: false },
    ];
    const mc = calculateTransportQseManagement({ id: '1', clientId: 'c', employees }, cfg);
    const bonusLine = mc.subLines!.find(l => /bonus/i.test(l.name))!;
    expect(bonusLine.score).toBe(0);
    expect(mc.score).toBe(25); // black rep 25 (sole exec is black) + bonus 0
    // Breakdown reconciles to the total.
    expect(mc.subLines!.reduce((s, l) => s + l.score, 0)).toBeCloseTo(mc.score, 2);
    // Coverage note surfaced, and pinned to the bonus line.
    expect(mc.coverageNotes?.length).toBeGreaterThan(0);
    expect(bonusLine.note).toBeTruthy();
  });

  it('EE breakdown reconciles to the score', () => {
    const employees = Array.from({ length: 14 }, (_, i) => ({
      id: String(i), name: `E${i}`, gender: (i % 2 ? 'Female' : 'Male') as const,
      race: 'African' as const,
      designation: i < 2 ? 'Executive Director' : i < 5 ? 'Senior' : i < 8 ? 'Middle' : 'Junior',
      isDisabled: false,
    }));
    const ee = calculateTransportQseEmploymentEquity({ id: '1', clientId: 'c', employees }, cfg, 'Gauteng');
    expect(ee.subLines!.reduce((s, l) => s + l.score, 0)).toBeCloseTo(ee.score, 1);
  });

  it('scores transport MC and EE with non-zero max', () => {
    const employees = Array.from({ length: 14 }, (_, i) => ({
      id: String(i), name: `E${i}`, gender: (i % 2 ? 'Female' : 'Male') as const,
      race: 'African' as const,
      designation: i < 2 ? 'Executive Director' : i < 5 ? 'Senior' : i < 8 ? 'Middle' : 'Junior',
      isDisabled: false,
    }));
    const mc = calculateTransportQseManagement({ id: '1', clientId: 'c', employees }, cfg);
    const ee = calculateTransportQseEmploymentEquity({ id: '1', clientId: 'c', employees }, cfg, 'Gauteng');
    expect(mc.maxPoints).toBe(27);
    expect(ee.maxPoints).toBe(27);
    expect(mc.score).toBeGreaterThan(0);
    expect(ee.score).toBeGreaterThan(0);
  });
});
