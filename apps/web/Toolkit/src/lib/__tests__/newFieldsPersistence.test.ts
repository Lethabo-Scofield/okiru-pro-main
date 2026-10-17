import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';

// Mock the API layer so add* calls are captured and loadClientData is fed a
// fixture instead of hitting the network.
vi.mock('../api', () => ({
  api: {
    getClientData: vi.fn(),
    addEmployee: vi.fn().mockResolvedValue({}),
    addTrainingProgram: vi.fn().mockResolvedValue({}),
    addSupplier: vi.fn().mockResolvedValue({}),
  },
  invalidateClientData: vi.fn(),
}));

import { api } from '../api';
import { useBbeeStore } from '../store';

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  // fetchSectorCalculatorConfig() swallows fetch errors and returns null, so a
  // rejecting fetch keeps loadClientData hermetic (recalc no-ops without config).
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network in test')));
});

afterAll(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.clearAllMocks();
  useBbeeStore.setState({ activeClientId: 'client-1' });
});

describe('new fields are sent to the API on create (feedback #5)', () => {
  it('addEmployee includes annualSalary and votingRightsPercent', () => {
    useBbeeStore.getState().addEmployee({
      id: 'e1',
      name: 'Thandi',
      gender: 'Female',
      race: 'African',
      designation: 'Senior',
      isDisabled: false,
      annualSalary: 450_000,
      votingRightsPercent: 12,
    } as any);

    expect(api.addEmployee).toHaveBeenCalledWith(
      'client-1',
      expect.objectContaining({ annualSalary: 450_000, votingRightsPercent: 12 }),
    );
  });

  it('addSupplier includes registrationNumber', () => {
    useBbeeStore.getState().addSupplier({
      id: 's1',
      name: 'Acme',
      beeLevel: 1,
      blackOwnership: 0.6,
      blackWomenOwnership: 0.3,
      youthOwnership: 0,
      disabledOwnership: 0,
      enterpriseType: 'generic',
      spend: 100_000,
      registrationNumber: '2019/123456/07',
    } as any);

    expect(api.addSupplier).toHaveBeenCalledWith(
      'client-1',
      expect.objectContaining({ registrationNumber: '2019/123456/07' }),
    );
  });

  it('addTrainingProgram includes municipality (incl. a custom "Other" value)', () => {
    useBbeeStore.getState().addTrainingProgram({
      id: 't1',
      name: 'Welding',
      category: 'learnership',
      cost: 50_000,
      employeeId: null,
      isEmployed: true,
      isBlack: true,
      municipality: 'Greater Tzaneen (custom)',
    } as any);

    expect(api.addTrainingProgram).toHaveBeenCalledWith(
      'client-1',
      expect.objectContaining({ municipality: 'Greater Tzaneen (custom)' }),
    );
  });
});

describe('new fields hydrate back from the API (feedback #5)', () => {
  it('loadClientData maps annualSalary, votingRightsPercent, municipality, registrationNumber back into the store', async () => {
    (api.getClientData as any).mockResolvedValue({
      client: { id: 'client-1', name: 'Test Co', sectorCode: 'RCOGP', companySize: 'Generic' },
      financialYears: [],
      ownership: { shareholders: [] },
      management: {
        employees: [
          {
            id: 'e1',
            name: 'Thandi',
            gender: 'Female',
            race: 'African',
            designation: 'Senior',
            isDisabled: false,
            annualSalary: 450_000,
            votingRightsPercent: 12,
          },
        ],
      },
      skills: {
        leviableAmount: 1_000_000,
        trainingPrograms: [
          {
            id: 't1',
            name: 'Welding',
            category: 'learnership',
            cost: 50_000,
            isBlack: true,
            municipality: 'Greater Tzaneen (custom)',
          },
        ],
      },
      procurement: {
        suppliers: [
          {
            id: 's1',
            name: 'Acme',
            beeLevel: 1,
            blackOwnership: 0.6,
            registrationNumber: '2019/123456/07',
          },
        ],
      },
      esd: { contributions: [] },
      sed: { contributions: [] },
      scenarios: [],
    });

    await useBbeeStore.getState().loadClientData('client-1');
    const st = useBbeeStore.getState();

    expect(st.management.employees[0].annualSalary).toBe(450_000);
    expect(st.management.employees[0].votingRightsPercent).toBe(12);
    expect(st.skills.trainingPrograms[0].municipality).toBe('Greater Tzaneen (custom)');
    expect(st.procurement.suppliers[0].registrationNumber).toBe('2019/123456/07');
  });

  it('loadClientData keeps stated BDG% / BNE% shares and leaves a missing share value at 0', async () => {
    (api.getClientData as any).mockResolvedValue({
      client: { id: 'client-1', name: 'Test Co', sectorCode: 'RCOGP', companySize: 'Generic' },
      financialYears: [],
      ownership: {
        shareholders: [
          // Fractions (as the workbook submit stores them) and a percent (as an
          // older record might): both read as fractions of the holder's stake.
          { id: 'sh1', name: 'Holder A', blackOwnership: 1, shares: 60, shareValue: 6_000_000, isDesignatedGroup: true, designatedGroupOwnership: 0.1, blackNewEntrantOwnership: 25 },
          // An older record: flags only, no share value on file.
          { id: 'sh2', name: 'Holder B', blackOwnership: 1, shares: 40, isDesignatedGroup: true, blackNewEntrant: false },
          // A share the Ownership page cleared (null) is the same as none.
          { id: 'sh3', name: 'Holder C', blackOwnership: 0, shares: 10, shareValue: 0, designatedGroupOwnership: null },
        ],
      },
      management: { employees: [] },
      skills: { leviableAmount: 0, trainingPrograms: [] },
      procurement: { suppliers: [] },
      esd: { contributions: [] },
      sed: { contributions: [] },
      scenarios: [],
    });

    await useBbeeStore.getState().loadClientData('client-1');
    const [a, b, c] = useBbeeStore.getState().ownership.shareholders;

    expect(a.designatedGroupOwnership).toBeCloseTo(0.1, 6);
    expect(a.blackNewEntrantOwnership).toBeCloseTo(0.25, 6);
    expect(a.isDesignatedGroup).toBe(true);
    expect(a.shareValue).toBe(6_000_000);
    expect('designatedGroupOwnership' in b).toBe(false);
    expect('blackNewEntrantOwnership' in b).toBe(false);
    expect(b.isDesignatedGroup).toBe(true);
    expect(b.shareValue).toBe(0);
    expect('designatedGroupOwnership' in c).toBe(false);
  });

  it('loadClientData reads an old register with the placeholder value 1 on every holder as no values on file', async () => {
    (api.getClientData as any).mockResolvedValue({
      client: { id: 'client-1', name: 'Test Co', sectorCode: 'RCOGP', companySize: 'Generic' },
      financialYears: [],
      ownership: {
        shareholders: [
          { id: 'sh1', name: 'Holder A', blackOwnership: 1, shares: 63, shareValue: 1 },
          { id: 'sh2', name: 'Holder B', blackOwnership: 0, shares: 37, shareValue: 1 },
        ],
      },
      management: { employees: [] },
      skills: { leviableAmount: 0, trainingPrograms: [] },
      procurement: { suppliers: [] },
      esd: { contributions: [] },
      sed: { contributions: [] },
      scenarios: [],
    });

    await useBbeeStore.getState().loadClientData('client-1');
    expect(useBbeeStore.getState().ownership.shareholders.map((s) => s.shareValue)).toEqual([0, 0]);
  });
});
