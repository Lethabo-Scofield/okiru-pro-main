/**
 * "No live score changes on deploy" for TMPS (decided 11 Oct 2026: the
 * supplier sum by default).
 *
 * The review before this release found live clients whose workbook sync had
 * persisted a TMPS labelled "stated" that nobody chose. Two shapes, invented
 * here with made-up figures:
 *   - A: a Transport QSE client whose stated TMPS is a small fraction of a
 *     41-supplier schedule (one supplier alone is several times the stated
 *     figure) — scored, it tripped the misplacement guard and Preferential
 *     Procurement fell to 0.
 *   - B: a Generic (RCOGP) QSE client whose stated TMPS is larger than its
 *     supplier schedule — scored, every procurement line shrank.
 * Live, the store scored both against the supplier sum. After this release it
 * still does, through the real load path (GET /data payload -> loadClientData
 * -> calculator), and the stated figure is kept beside it for the note. Only
 * the user's explicit, persisted switch (`tmpsChoice: 'stated'`) moves B.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    api: {
      ...(actual.api as object),
      getClientData: vi.fn(),
      updateClient: vi.fn().mockResolvedValue({}),
      updateProcurement: vi.fn().mockResolvedValue({}),
    },
    invalidateClientData: vi.fn(),
  };
});

import { api } from '../api';
import { useBbeeStore } from '../store';
import { supplierSumTmps } from '../calculators/shared';

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network in test')));
});
afterAll(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.mocked(api.updateClient).mockClear();
});

const supplier = (i: number, spend: number, level: number) => ({
  id: `sup_${i}`,
  name: `Invented Supplier ${i}`,
  spend,
  beeLevel: level,
  blackOwnership: level <= 2 ? 0.6 : 0.1,
  blackWomenOwnership: level === 1 ? 0.35 : 0,
  youthOwnership: 0,
  disabledOwnership: 0,
  enterpriseType: i % 3 === 0 ? 'eme' : i % 3 === 1 ? 'qse' : 'generic',
});

// A: 40 small suppliers and one large one; the "stated" figure is far below the sum.
const scheduleA = [
  ...Array.from({ length: 40 }, (_, i) => supplier(i, 70_000 + i * 1_000, (i % 4) + 1)),
  supplier(40, 1_650_000, 2),
];
const statedA = 290_000;
// B: a stated figure larger than the schedule.
const scheduleB = Array.from({ length: 12 }, (_, i) => supplier(i, 270_000 + i * 2_500, (i % 4) + 5));
const statedB = 4_650_000;

function payload(opts: { sector: string; size: string; schedule: ReturnType<typeof supplier>[]; persistedTmps: number; financials: Record<string, unknown>; tmpsChoice?: unknown }) {
  return {
    client: {
      id: 'client-tmps', name: 'Invented Client', sectorCode: opts.sector, scorecardType: opts.size, companySize: opts.size,
      revenue: 30_000_000, npat: 2_500_000, leviableAmount: 6_000_000, financials: opts.financials,
      ...(opts.tmpsChoice !== undefined ? { tmpsChoice: opts.tmpsChoice } : {}),
    },
    ownership: { shareholders: [], companyValue: 0, outstandingDebt: 0 },
    management: { employees: [] },
    skills: { leviableAmount: 6_000_000, trainingPrograms: [] },
    // As live: the client's tmps is the figure the sync persisted (the stated one).
    procurement: { tmps: opts.persistedTmps, suppliers: opts.schedule },
    esd: { contributions: [] },
    sed: { contributions: [] },
    financialYears: [],
    scenarios: [],
  };
}

async function load(p: ReturnType<typeof payload>) {
  vi.mocked(api.getClientData).mockResolvedValue(p as never);
  useBbeeStore.setState({ pendingWrites: 0, saveError: null, activeClientId: null } as never);
  await useBbeeStore.getState().loadClientData('client-tmps');
  const s = useBbeeStore.getState();
  return { procurement: s.procurement, procurementScore: s.scorecard.procurement.score, total: s.scorecard.total.score };
}

describe.each([
  { name: 'A (Transport QSE, stated far below the schedule)', sector: 'TRANSPORT', size: 'QSE', schedule: scheduleA, stated: statedA },
  { name: 'B (Generic QSE, stated above the schedule)', sector: 'RCOGP', size: 'QSE', schedule: scheduleB, stated: statedB },
])('live client $name', ({ sector, size, schedule, stated }) => {
  const sum = supplierSumTmps(schedule);

  it('with no explicit switch, scores the supplier sum — the same score as with no stated figure at all', async () => {
    const labelled = await load(payload({ sector, size, schedule, persistedTmps: stated, financials: { tmpsSource: 'stated', tmpsHeld: null } }));
    // The record the store had before any stated label existed: TMPS = the sum.
    const unlabelled = await load(payload({ sector, size, schedule, persistedTmps: sum, financials: {} }));

    expect(labelled.procurement.tmps).toBe(sum);
    expect(labelled.procurement.tmpsSource).toBe('supplier_spend_sum');
    expect(labelled.procurementScore).toBeGreaterThan(0);
    expect(labelled.procurementScore).toBe(unlabelled.procurementScore);
    expect(labelled.total).toBe(unlabelled.total);
    // The stated figure is kept beside it, for the flagged note.
    expect(labelled.procurement.statedTmps).toBe(stated);
    expect(labelled.procurement.tmpsChoice).toBe('supplier_sum');
  });

  it('a stated figure kept apart by the sync (financials.statedTmps) is shown, and still not scored', async () => {
    // A Toolkit TMPS edit overwrote the procurement record's TMPS; the stated
    // figure survives in the financials blob.
    const r = await load(payload({ sector, size, schedule, persistedTmps: sum, financials: { tmpsSource: 'stated', statedTmps: stated } }));
    expect(r.procurement.tmps).toBe(sum);
    expect(r.procurement.statedTmps).toBe(stated);
  });

  it('a held TMPS (contested) scores the supplier sum, as live', async () => {
    const r = await load(payload({ sector, size, schedule, persistedTmps: 0, financials: { tmpsSource: null, tmpsHeld: 'contested' } }));
    expect(r.procurement.tmps).toBe(sum);
    expect(r.procurement.statedTmpsHeld).toBe('contested');
  });
});

describe('the explicit, persisted switch', () => {
  const sum = supplierSumTmps(scheduleB);

  it('a client switched to the stated figure scores it after a reload', async () => {
    const chosen = await load(payload({ sector: 'RCOGP', size: 'QSE', schedule: scheduleB, persistedTmps: statedB, financials: { tmpsSource: 'stated' }, tmpsChoice: 'stated' }));
    const byDefault = await load(payload({ sector: 'RCOGP', size: 'QSE', schedule: scheduleB, persistedTmps: statedB, financials: { tmpsSource: 'stated' } }));
    expect(chosen.procurement.tmps).toBe(statedB);
    expect(chosen.procurement.tmpsSource).toBe('stated');
    expect(chosen.procurementScore).toBeLessThan(byDefault.procurementScore);
  });

  it('a stated figure below the schedule is never scored, even when chosen (client A shape)', async () => {
    const r = await load(payload({ sector: 'TRANSPORT', size: 'QSE', schedule: scheduleA, persistedTmps: statedA, financials: { tmpsSource: 'stated' }, tmpsChoice: 'stated' }));
    expect(r.procurement.tmps).toBe(supplierSumTmps(scheduleA));
    expect(r.procurementScore).toBeGreaterThan(0);
  });

  it('switching saves the choice on the client, and switching back restores the sum', async () => {
    await load(payload({ sector: 'RCOGP', size: 'QSE', schedule: scheduleB, persistedTmps: statedB, financials: { tmpsSource: 'stated' } }));
    useBbeeStore.setState({ activeClientId: 'client-tmps' } as never);
    useBbeeStore.getState().setTmpsChoice('stated');
    expect(useBbeeStore.getState().procurement.tmps).toBe(statedB);
    expect(api.updateClient).toHaveBeenLastCalledWith('client-tmps', { tmpsChoice: 'stated' });
    useBbeeStore.getState().setTmpsChoice('supplier_sum');
    expect(useBbeeStore.getState().procurement.tmps).toBe(sum);
    expect(api.updateClient).toHaveBeenLastCalledWith('client-tmps', { tmpsChoice: 'supplier_sum' });
  });
});
