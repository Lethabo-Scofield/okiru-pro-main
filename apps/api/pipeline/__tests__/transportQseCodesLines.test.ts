/**
 * Transport QSE in the api scoring copy, line by line as the Transport Codes
 * name them, and the same answers the Toolkit calculators give (the web-side
 * parity test runs both copies on one company). Each case was a drift:
 *   - ownership fulfilment scored as new-entrant participation,
 *   - the ESOP/BBOS bonus scored from black-women economic interest,
 *   - Senior Management pooled into top management beside an executive,
 *   - procurement on raw spend with Codes-excluded lines counted,
 *   - a fixed quartet of elements instead of the best four.
 * (Invented company.)
 */
import { describe, expect, it } from 'vitest';
import { TRANSPORT_QSE, withTransportQseCodesOwnershipLines } from '../sectorConfig';
import { calculateAllPillars, electTransportQseBestFour } from '../rules/pillarCalculators';
import { extractFromPillarData } from '../../src/routes/scorecardBuilder';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const any = (v: unknown) => v as any;

const owner = (over: Record<string, unknown> = {}) => ({
  name: 'Sipho Ndlovu', blackOwnership: 1, blackWomenOwnership: 0, shares: 100, shareValue: 0, yearsHeld: 0, ...over,
});
const base = {
  employees: [] as unknown[],
  suppliers: [] as unknown[],
  contributions: [] as unknown[],
  trainingPrograms: [] as unknown[],
  financials: { revenue: 20_000_000, npat: 1_000_000, leviableAmount: 0, tmps: 0, headcount: 0, companyValue: 0, outstandingDebt: 0, yearsHeld: 0 },
  province: 'Gauteng',
  transportQseMeasuredElements: ['ownership', 'managementControl', 'preferentialProcurement', 'socioEconomicDevelopment'],
};
const score = (over: Record<string, unknown>) => calculateAllPillars(TRANSPORT_QSE, any({ ...base, ...over }));
// HELD BACK until the sector expert accepts the movement: the Codes lines.
const HELD = withTransportQseCodesOwnershipLines(TRANSPORT_QSE);
const scoreHeld = (over: Record<string, unknown>) => calculateAllPillars(HELD, any({ ...base, ...over }));

describe('Transport QSE live ownership is unchanged while the Codes lines are held back (api copy)', () => {
  it('a flagged black new entrant with no stated debt keeps the fulfilment point: 25', () => {
    expect(score({ shareholders: [owner({ blackNewEntrant: true })] }).ownership.score).toBe(25);
  });

  it('a black woman owner keeps the black-women economic interest point: 27', () => {
    expect(score({ shareholders: [owner({ blackWomenOwnership: 1 })] }).ownership.score).toBe(27);
  });

  it('a scheme bonus with no stated target is full points once a scheme row appears', () => {
    const cfg = { ...TRANSPORT_QSE, targets: { ...TRANSPORT_QSE.targets, ownership: { ...TRANSPORT_QSE.targets.ownership, esopBonusMaxPts: 1 } } };
    const r = calculateAllPillars(cfg, any({ ...base, shareholders: [
      owner({ shares: 95 }),
      owner({ name: 'Staff Trust', ownershipType: 'ESOP / Employee Share Scheme', shares: 5 }),
    ] }));
    // 24 base without the new-entrant flag, + the full scheme point
    expect(r.ownership.score).toBe(25);
  });
});

describe('Transport QSE ownership lines, held back (api copy)', () => {
  it('a 100% black owner whose acquisition debt is stated nil earns ownership fulfilment: 25', () => {
    expect(scoreHeld({ shareholders: [owner({ outstandingDebt: 0 })] }).ownership.score).toBe(25);
  });

  it('unstated debt is not nil, and a new-entrant flag is not fulfilment: 24', () => {
    expect(scoreHeld({ shareholders: [owner()] }).ownership.score).toBe(24);
    expect(scoreHeld({ shareholders: [owner({ blackNewEntrant: true })] }).ownership.score).toBe(24);
  });

  it('a black woman owner with no scheme earns the black-women bonus but not the ESOP bonus: 27', () => {
    expect(scoreHeld({ shareholders: [owner({ blackWomenOwnership: 1, outstandingDebt: 0 })] }).ownership.score).toBe(27);
  });

  it('the ESOP bonus is scheme economic interest against 10%', () => {
    const r = scoreHeld({ shareholders: [
      owner({ shares: 95, outstandingDebt: 0 }),
      owner({ name: 'Staff Trust', ownershipType: 'ESOP / Employee Share Scheme', shares: 5, outstandingDebt: 0 }),
    ] });
    expect(r.ownership.score).toBe(25.5);
  });
});

describe('Transport QSE management control (api copy)', () => {
  it('a black woman at Senior is not top management beside an executive', () => {
    const r = score({
      shareholders: [owner()],
      employees: [
        { name: 'A', race: 'African', gender: 'Male', designation: 'Executive Director', isDisabled: false, isForeign: false },
        { name: 'B', race: 'African', gender: 'Female', designation: 'Senior', isDisabled: false, isForeign: false },
      ],
    });
    expect(r.managementControl.score).toBe(25);
  });
});

describe('Transport QSE procurement (api copy)', () => {
  it('scores recognised spend, skips excluded lines and a stated non-empowering supplier', () => {
    const r = score({
      shareholders: [owner()],
      financials: { ...base.financials, tmps: 3_000_000 },
      suppliers: [
        { name: 'Quarry Tools', spend: 400_000, beeLevel: 1, blackOwnership: 0.6, blackWomenOwnership: 0.1, enterpriseType: 'generic' },
        { name: 'Kestrel Insure', spend: 300_000, beeLevel: 5, blackOwnership: 0.2, blackWomenOwnership: 0, enterpriseType: 'generic', isEmpoweringSupplier: false },
        { name: 'Vehicle Finance Loan', spend: 900_000, beeLevel: 1, blackOwnership: 0.3, blackWomenOwnership: 0, enterpriseType: 'generic' },
      ],
    });
    // 400k x 1.35 = 540k recognised against 40% of 3m = 1.2m -> 11.25
    expect(r.procurement.score).toBeCloseTo(11.25, 2);
  });
});

describe('Transport QSE measured elements (api copy)', () => {
  it('with no election the best four are measured, not a fixed quartet', () => {
    const inputs = any({ ...base, transportQseMeasuredElements: undefined, shareholders: [owner({ outstandingDebt: 0 })],
      contributions: [{ beneficiary: 'Hilltop Creche', type: 'grant', amount: 20_000, category: 'sed' }] });
    const four = electTransportQseBestFour(TRANSPORT_QSE, inputs);
    expect(four).toHaveLength(4);
    expect(four).not.toContain('skillsDevelopment');
    expect(calculateAllPillars(TRANSPORT_QSE, inputs).skillsDevelopment.maxPoints).toBe(0);
  });
});

describe('/calculate pillarData', () => {
  it('carries the register type, a stated acquisition debt and a stated non-empowering supplier', () => {
    const out = extractFromPillarData(any({
      sectorCode: 'TRANSPORT', scorecardType: 'QSE',
      pillarData: {
        ownership: { shareholders: [
          { name: 'Staff Trust', ownershipType: 'ESOP', blackOwnership: 1, outstandingDebt: 0 },
          { name: 'Sipho Ndlovu', blackOwnership: 1 },
        ] },
        procurement: { tmps: 1, suppliers: [{ name: 'Kestrel Insure', spend: 1, beeLevel: 5, isEmpoweringSupplier: false }] },
      },
    }));
    expect(out.shareholders[0]).toMatchObject({ ownershipType: 'ESOP', outstandingDebt: 0 });
    expect('outstandingDebt' in out.shareholders[1]).toBe(false);
    expect(out.suppliers[0].isEmpoweringSupplier).toBe(false);
  });
});
