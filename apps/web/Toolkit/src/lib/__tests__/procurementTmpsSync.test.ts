import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

// Mock the API layer so store actions don't hit the network.
vi.mock('../api', () => ({
  api: {
    addSupplier: vi.fn().mockResolvedValue({}),
    updateSupplier: vi.fn().mockResolvedValue({}),
    deleteSupplier: vi.fn().mockResolvedValue({}),
    updateProcurement: vi.fn().mockResolvedValue({}),
  },
  invalidateClientData: vi.fn(),
}));

import { useBbeeStore } from '../store';

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network in test')));
});

afterAll(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  // No activeClientId → store skips the api.* persistence branch; reset procurement.
  useBbeeStore.setState({
    activeClientId: null as any,
    procurement: { id: '', clientId: '', tmps: 0, suppliers: [] },
  });
});

const supplier = (id: string, spend: number) => ({
  id,
  name: `S-${id}`,
  beeLevel: 1 as any,
  blackOwnership: 0.6,
  blackWomenOwnership: 0.3,
  youthOwnership: 0,
  disabledOwnership: 0,
  enterpriseType: 'generic' as const,
  spend,
});

/**
 * Polo feedback #10: suppliers were saved but never scored because TMPS stayed 0
 * (procurement targets are tmps × pct, so 0 TMPS => 0 score). TMPS now derives
 * from supplier spend unless the user manually overrides it.
 */
describe('procurement TMPS auto-sync (Polo #10)', () => {
  it('derives TMPS from supplier spend as suppliers are added', () => {
    const s = useBbeeStore.getState();
    s.addSupplier(supplier('a', 100_000) as any);
    expect(useBbeeStore.getState().procurement.tmps).toBe(100_000);

    s.addSupplier(supplier('b', 50_000) as any);
    expect(useBbeeStore.getState().procurement.tmps).toBe(150_000);
  });

  it('re-derives TMPS when a supplier is removed', () => {
    const s = useBbeeStore.getState();
    s.addSupplier(supplier('a', 100_000) as any);
    s.addSupplier(supplier('b', 50_000) as any);
    s.removeSupplier('a');
    expect(useBbeeStore.getState().procurement.tmps).toBe(50_000);
  });

  it('stops auto-syncing once TMPS is manually overridden', () => {
    const s = useBbeeStore.getState();
    s.addSupplier(supplier('a', 100_000) as any);
    s.updateTMPS(999_999, true); // manual override
    s.addSupplier(supplier('b', 50_000) as any);
    expect(useBbeeStore.getState().procurement.tmps).toBe(999_999);
  });

  it('resumes auto-sync when switched back to calculated mode', () => {
    const s = useBbeeStore.getState();
    s.addSupplier(supplier('a', 100_000) as any);
    s.updateTMPS(999_999, true);
    s.updateTMPS(0, false); // calculated mode clears the pin
    s.addSupplier(supplier('b', 50_000) as any);
    expect(useBbeeStore.getState().procurement.tmps).toBe(150_000);
  });
});
